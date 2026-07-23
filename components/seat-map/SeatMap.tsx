"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DRAFT_HISTORY_STORAGE_KEY,
  canAdoptPersistedHistory,
  canRedoDraftHistory,
  canUndoDraftHistory,
  clearDraftHistory,
  createDraftHistory,
  createDraftSnapshot,
  deserializeDraftHistory,
  draftStatesEquivalent,
  pushDraftHistory,
  redoDraftHistory,
  serializeDraftHistory,
  undoDraftHistory,
  type DraftSnapshot
} from "@/lib/draftHistory";
import type { DepartmentOption, Employee, SeatStatus, SeatWithEmployee, ZoneOption } from "@/lib/types";
import { STATUS_LABELS } from "@/lib/types";
import { createSeatAction, deleteSeatAction, moveSeatAction, publishSeatMapAction, restoreDraftSnapshotAction, swapSeatAssignmentsAction } from "@/app/actions";
import { PUBLISH_IMPACT_NOTE } from "@/lib/copy";
import { findSeatIdByParam, readSeatParam, withSeatParam } from "@/lib/deepLink";
import { listDraftSeatExpectations } from "@/lib/draftConcurrency";
import { departmentKey } from "@/lib/departments";
import { buildPositionOptions, seatMatchesPosition } from "@/lib/positions";
import { clientPointToNormalized } from "@/lib/seatMath";
import { normalizeSeat, normalizeSeats } from "@/lib/seatNormalize";
import { arrowKeyToDirection, findNearestSeatInDirection, resolveRovingSeatId } from "@/lib/seatKeyboardNav";
import { canDeleteSeat, getSeatDeleteBlockReason } from "@/lib/seatProtection";
import { detectSeatZoneForPointResult, getSeatZoneDetectionFailureMessage } from "@/lib/seatZones";
import { formatDisplayName, formatSeatCode } from "@/lib/formatName";
import {
  MAP_IMAGE_BLUR_DATA_URL,
  MAP_IMAGE_HEIGHT,
  MAP_IMAGE_SRC,
  MAP_IMAGE_WIDTH,
  savedPointToVisualPoint,
  seatsToVisualSeats,
  visualPointToSavedPoint
} from "@/lib/mapLayoutTransform";
import { buildPublishChangeSummary, type PublishChangeItem } from "@/lib/publishSummary";
import { clearanceFromScale, computeCodePillNudges, computeNameLabelNudges } from "@/lib/seatCrowding";
import { AskPlannerDrawer, type AskPlannerQueuedRequest } from "@/components/seat-map/AskPlannerDrawer";
import {
  ActiveFilterChips,
  FilterPanel,
  type ActiveFilterChip,
  type ResultStatusBreakdown
} from "@/components/seat-map/FilterPanel";
import { FloorPlaceholder, FloorSelector, type FloorId } from "@/components/seat-map/FloorSelector";
import { MapZoomControl } from "@/components/seat-map/MapZoomControl";
import { ResultsPanel, type AdminResultCard } from "@/components/seat-map/ResultsPanel";
import { SeatInspector } from "@/components/seat-map/SeatInspector";
import { SeatMarker } from "@/components/seat-map/SeatMarker";
import { AccountMenu } from "@/components/ui/AccountMenu";
import { adminDangerButtonClassName, Button } from "@/components/ui/Button";
import { CloseIcon } from "@/components/ui/CloseIcon";
import { StatusBadge, focusRingClass } from "@/components/ui/design-system";
import { returnFocusAfterClose } from "@/components/ui/returnFocus";
import { SEAT_SEARCH_PLACEHOLDER, searchHandsPanelToResults } from "@/lib/viewerSeatSearch";
import { createClient as createBrowserSupabaseClient } from "@/lib/supabase/client";
import { useDialogFocus } from "@/components/ui/useDialogFocus";

type SeatMapProps = {
  seats: SeatWithEmployee[];
  publishedSeats?: SeatWithEmployee[];
  employees: Employee[];
  // Viewer-facing published_employees snapshot, diffed against live employees
  // so pending people-detail changes surface in the publish review.
  publishedEmployees?: Employee[];
  departmentOptions?: DepartmentOption[];
  zoneOptions?: ZoneOption[];
  canEdit: boolean;
  // Signed-in identity for the account menu; absent on unauthenticated
  // prototype routes, which keep the decorative chip instead.
  accountEmail?: string | null;
  accountRoleLabel?: string;
};

type DragState = {
  seatId: string;
  pointerId: number;
  beforeSnapshot: DraftSnapshot;
} | null;

type SwapConfirmState = {
  sourceSeatId: string;
  targetSeatId: string;
} | null;

type DeleteSeatConfirmState = {
  seatId: string;
  label: string;
} | null;

type InspectorGuardAction =
  | { kind: "select-seat"; seatId: string; center?: boolean; sourceLabel?: string }
  | { kind: "close-inspector" }
  | { kind: "clear-selection" }
  | { kind: "start-add-seat" }
  | { kind: "start-move-seat" }
  | { kind: "start-swap-seat" }
  | { kind: "navigate-admin-page"; href: GuardedNavigationHref; destination: string };

// Whitelisted in-app destinations for the unsaved-edits guard. Query-string
// variants must be listed explicitly so the guard stays a closed set.
type GuardedNavigationHref = "/" | "/admin/management" | "/admin/management?tab=publishHistory" | "/admin/settings";

type MapViewMode = "overview" | "detail";

type MapPanState = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startScrollLeft: number;
  startScrollTop: number;
  moved: boolean;
} | null;

const ADMIN_NAMES_VISIBLE_STORAGE_KEY = "seat-planner:names-visible";
const DEFAULT_PUBLISHED_SEATS: SeatWithEmployee[] = [];
const DEFAULT_PUBLISHED_EMPLOYEES: Employee[] = [];
const INSPECTOR_FORM_ID = "seat-inspector-form";

// Stable identity for the Show-names-off branch of namedSeatIdSet — a fresh
// empty Set per render would defeat the nudge-pipeline memos below.
const EMPTY_SEAT_ID_SET: ReadonlySet<string> = new Set<string>();
// Map zoom is a view transform on the scroll container only (spec §9): it
// scales the rendered frame width and never touches stored seat coordinates.
const MAP_ZOOM_MIN = 0.6;
const MAP_ZOOM_MAX = 2;
const MAP_ZOOM_STEP = 0.2;
// Below this width the inspector overlays as a fixed bottom sheet (max-h 60vh,
// SeatInspector.tsx) instead of docking as a width-reserving side panel — the
// `panel` breakpoint referenced throughout the seat-centering logic below.
const SEAT_CENTER_PANEL_BREAKPOINT_PX = 900;
// Default vertical anchor (fraction of viewport height from the top) used to
// center a selected seat below the panel breakpoint, so the seat lands in the
// visible strip above the 60vh bottom sheet instead of underneath it.
const SEAT_CENTER_SHEET_ANCHOR = 0.28;

function clampScrollPosition(value: number, max: number) {
  return Math.min(Math.max(value, 0), Math.max(max, 0));
}

function replaceSeat(seats: SeatWithEmployee[], nextSeat: SeatWithEmployee) {
  const normalizedSeat = normalizeSeat(nextSeat);
  const exists = seats.some(seat => seat.id === nextSeat.id);
  if (!exists) return [...seats, normalizedSeat].sort((a, b) => a.label.localeCompare(b.label));
  return seats.map(seat => (seat.id === nextSeat.id ? normalizedSeat : seat));
}

function replaceEmployee(employees: Employee[], seat: SeatWithEmployee) {
  const nextEmployee = seat.employee;
  if (!nextEmployee) return employees;
  const exists = employees.some(employee => employee.id === nextEmployee.id);
  if (!exists) return [...employees, nextEmployee].sort((a, b) => a.full_name.localeCompare(b.full_name));
  return employees.map(employee => (employee.id === nextEmployee.id ? nextEmployee : employee));
}

function getSeatZone(seat: SeatWithEmployee) {
  return seat.zone ?? seat.department ?? "";
}

function PublishCountCard({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "warn" }) {
  return (
    <div className={["rounded-xl border p-3", tone === "warn" ? "border-[var(--admin-state-dirty-border)] bg-[var(--admin-state-dirty-bg)]" : "border-[var(--admin-state-neutral-border)] bg-[var(--admin-state-neutral-bg)]"].join(" ")}>
      <div className={["text-[11px] font-semibold", tone === "warn" ? "text-[var(--admin-state-dirty-text)]" : "text-[var(--admin-text-muted)]"].join(" ")}>{label}</div>
      <div className="mt-1 text-2xl font-semibold text-[var(--admin-text-primary)]">{value}</div>
    </div>
  );
}

function formatPublishChangeUnit(value: number) {
  return value === 1 ? "change" : "changes";
}

function PublishImpactCard({ label, value, description, tone = "default" }: { label: string; value: number; description: string; tone?: "default" | "warn" }) {
  return (
    <div className={["rounded-xl border p-3", tone === "warn" ? "border-[var(--admin-state-dirty-border)] bg-[var(--admin-state-dirty-bg)]" : "border-[var(--admin-state-neutral-border)] bg-[var(--admin-surface)]/80"].join(" ")}>
      <div className={["text-[11px] font-semibold", tone === "warn" ? "text-[var(--admin-state-dirty-text)]" : "text-[var(--admin-text-muted)]"].join(" ")}>{label}</div>
      <div className="mt-1 flex items-end gap-2">
        <span className="text-2xl font-semibold text-[var(--admin-text-primary)]">{value}</span>
        <span className="pb-1 text-xs font-bold text-[var(--admin-text-muted)]">{formatPublishChangeUnit(value)}</span>
      </div>
      <p className="mt-1 text-xs font-semibold leading-4 text-[var(--admin-text-muted)]">{description}</p>
    </div>
  );
}

function PublishChangeList({ title, items, emptyLabel }: { title: string; items: PublishChangeItem[]; emptyLabel: string }) {
  const visibleItems = items.slice(0, 5);
  const remainingCount = Math.max(items.length - visibleItems.length, 0);

  return (
    <div className="rounded-xl border border-[var(--admin-state-neutral-border)] bg-[var(--admin-surface)]/80 p-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-[var(--admin-text-primary)]">{title}</h3>
        <span className="rounded-full bg-[var(--admin-state-neutral-bg)] px-2 py-0.5 text-[11px] font-semibold text-[var(--admin-text-muted)] ring-1 ring-[var(--admin-state-neutral-border)]">{items.length}</span>
      </div>
      {items.length > 0 ? (
        <ul className="mt-2 space-y-1.5 text-xs leading-5 text-[var(--admin-text-muted)]">
          {visibleItems.map(item => (
            <li key={`${title}-${item.label}-${item.detail}`}>
              <span className="font-semibold text-[var(--admin-text-primary)]">{item.label}</span>
              {item.detail && <span> · {item.detail}</span>}
            </li>
          ))}
          {remainingCount > 0 && (
            <li className="font-bold text-[var(--admin-text-muted)]">+ {remainingCount} more</li>
          )}
        </ul>
      ) : (
        <p className="mt-2 text-xs font-semibold text-[var(--admin-text-muted)]">{emptyLabel}</p>
      )}
    </div>
  );
}

type SeatStatusLegendItem = {
  key: string;
  label: string;
  chipClass: string;
  accentClass: string;
  draftOnly?: boolean;
  badge?: boolean;
};

const SEAT_STATUS_LEGEND: SeatStatusLegendItem[] = [
  {
    key: "assigned",
    label: STATUS_LABELS.assigned,
    chipClass: "border-[var(--admin-marker-assigned-border)] bg-[var(--admin-marker-assigned-surface)]",
    accentClass: "bg-[var(--admin-marker-assigned-accent)]"
  },
  {
    key: "available",
    label: STATUS_LABELS.available,
    chipClass: "border-[var(--admin-marker-available-border)] bg-[var(--admin-marker-available-surface)]",
    accentClass: "bg-[var(--admin-marker-available-accent)]"
  },
  {
    key: "reserved",
    label: STATUS_LABELS.reserved,
    chipClass: "border-[var(--admin-marker-reserved-border)] bg-[var(--admin-marker-reserved-surface)]",
    accentClass: "bg-[var(--admin-marker-reserved-accent)]"
  },
  {
    key: "unavailable",
    label: STATUS_LABELS.unavailable,
    chipClass: "border-[var(--admin-marker-unavailable-border)] bg-[var(--admin-marker-unavailable-surface)]",
    accentClass: "bg-[var(--admin-marker-unavailable-accent)]"
  },
  {
    key: "draft-changed",
    label: "Draft change",
    chipClass: "border-[var(--admin-marker-draft-border)] bg-[var(--admin-marker-draft-surface)]",
    accentClass: "bg-[var(--admin-marker-draft-accent)]",
    draftOnly: true,
    badge: true
  }
];

export function SeatMap({
  seats,
  publishedSeats = DEFAULT_PUBLISHED_SEATS,
  employees,
  publishedEmployees = DEFAULT_PUBLISHED_EMPLOYEES,
  departmentOptions = [],
  zoneOptions = [],
  canEdit,
  accountEmail = null,
  accountRoleLabel
}: SeatMapProps) {
  const router = useRouter();
  const [localSeats, setLocalSeats] = useState(() => normalizeSeats(seats));
  const [localPublishedSeats, setLocalPublishedSeats] = useState(() => normalizeSeats(publishedSeats));
  const [localEmployees, setLocalEmployees] = useState(employees);
  const [localPublishedEmployees, setLocalPublishedEmployees] = useState(publishedEmployees);
  const [localDepartmentOptions, setLocalDepartmentOptions] = useState(departmentOptions);
  const [localZoneOptions, setLocalZoneOptions] = useState(zoneOptions);
  const [actionError, setActionError] = useState<string | null>(null);
  // Auth loss detected by the client (prod digest-masks the server message);
  // true swaps the generic action error for a sign-in banner.
  const [sessionExpired, setSessionExpired] = useState(false);
  // Notices carry a tone: successes stay green, but cancellations and
  // guidance render neutral so "nothing happened" never reads as a completed
  // change. The wrapper keeps every existing setActionNotice(text) call
  // defaulting to success.
  const [actionNoticeState, setActionNoticeState] = useState<{ text: string; tone: "success" | "neutral" } | null>(null);
  const setActionNotice = useCallback((text: string | null, tone: "success" | "neutral" = "success") => {
    setActionNoticeState(text === null ? null : { text, tone });
  }, []);
  const actionNotice = actionNoticeState?.text ?? null;
  const actionNoticeTone = actionNoticeState?.tone ?? "success";
  // Dedicated state for the draft-concurrency fence: the inspector's reset and
  // seat-sync paths call onError(null), which would wipe this message out of
  // actionError in the same render cycle it was set (verified live on the
  // PR #99 preview). It must survive those resets.
  const [staleDraftNotice, setStaleDraftNotice] = useState<string | null>(null);
  const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null);
  const [moveSeatMode, setMoveSeatMode] = useState(false);
  const [addSeatMode, setAddSeatMode] = useState(false);
  const [publishReviewOpen, setPublishReviewOpen] = useState(false);
  const [askPlannerOpen, setAskPlannerOpen] = useState(false);
  const [askPlannerQueuedRequest, setAskPlannerQueuedRequest] = useState<AskPlannerQueuedRequest | null>(null);
  const [plannerHighlightedSeatIds, setPlannerHighlightedSeatIds] = useState<string[]>([]);
  const [dragState, setDragState] = useState<DragState>(null);
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("all");
  const [position, setPosition] = useState("all");
  const [zone, setZone] = useState("all");
  const [status, setStatus] = useState("all");
  const [filterCollapsed, setFilterCollapsed] = useState(true);
  const [mapMenuOpen, setMapMenuOpen] = useState(false);
  const [chromeMenuOpen, setChromeMenuOpen] = useState(false);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [searchShortcutHint, setSearchShortcutHint] = useState("");
  const chromeSearchInputRef = useRef<HTMLInputElement | null>(null);
  const canvasSearchInputRef = useRef<HTMLInputElement | null>(null);
  const filterTriggerRef = useRef<HTMLButtonElement | null>(null);
  const chromeMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const mapMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const mapMenuRef = useRef<HTMLDivElement | null>(null);
  // Idle publish chip discloses a status popover (2026-07-16 critique, fix 3);
  // the review modal is reserved for the has-changes state.
  const [publishStatusOpen, setPublishStatusOpen] = useState(false);
  const publishStatusButtonRef = useRef<HTMLButtonElement | null>(null);
  // Whether the docked inspector was expanded when Ask Planner took the right
  // edge — closed drawers hand the slot back (2026-07-16 critique, minor 6).
  const inspectorExpandedBeforePlannerRef = useRef(false);
  const [inspectorDirty, setInspectorDirty] = useState(false);
  const [inspectorGuardAction, setInspectorGuardAction] = useState<InspectorGuardAction | null>(null);
  const [pendingInspectorSaveAction, setPendingInspectorSaveAction] = useState<InspectorGuardAction | null>(null);
  const [inspectorResetSignal, setInspectorResetSignal] = useState(0);
  const [showNames, setShowNames] = useState(false);
  const [namesPreferenceHydrated, setNamesPreferenceHydrated] = useState(false);
  // Fit (overview) is the resting state: every individual seat visible in view.
  const [mapViewMode, setMapViewMode] = useState<MapViewMode>("overview");
  const [floor, setFloor] = useState<FloorId>("3");
  const [zoomFactor, setZoomFactor] = useState(1);
  const [panning, setPanning] = useState(false);
  const panStateRef = useRef<MapPanState>(null);
  const pendingZoomCenterRef = useRef<{ x: number; y: number } | null>(null);
  const [overviewMapWidth, setOverviewMapWidth] = useState<number | null>(null);
  const [mapVisibleRange, setMapVisibleRange] = useState({ left: 0, right: 1, viewportWidth: 0 });
  const [swapSourceSeatId, setSwapSourceSeatId] = useState<string | null>(null);
  const [swapConfirm, setSwapConfirm] = useState<SwapConfirmState>(null);
  const [deleteSeatConfirm, setDeleteSeatConfirm] = useState<DeleteSeatConfirmState>(null);
  const [draftHistory, setDraftHistory] = useState(() => createDraftHistory());
  // Last keyboard-visited seat (roving tabindex anchor). The derived tab stop
  // also prefers the selected seat — see mapRovingSeatId.
  const [rovingSeatId, setRovingSeatId] = useState<string | null>(null);
  const focusInspectorAfterSelectRef = useRef(false);
  const [pending, startTransition] = useTransition();
  // `pending` outlives the server action: revalidatePath("/admin") keeps the
  // transition busy through the RSC refresh for seconds after a mutation
  // committed. Undo/Redo gate on this narrower flag instead, so they enable
  // together with the success banner (the refresh only refreshes props that
  // local state already reflects).
  const [mutationInFlight, setMutationInFlight] = useState(false);
  const deleteSeatDialogFocusRef = useDialogFocus<HTMLElement>();
  const publishReviewDialogFocusRef = useDialogFocus<HTMLElement>();
  const inspectorGuardDialogFocusRef = useDialogFocus<HTMLElement>();
  const swapConfirmDialogFocusRef = useDialogFocus<HTMLElement>();

  // Reload persistence, adopt half. On mount, take over the per-tab stacks the
  // effect below saved — but only while the live draft still matches the state
  // the stacks left it in (the same adjacency rule that guards every undo
  // click). Anything else (another session's edit, a publish, an import while
  // this tab was gone) makes the stored stacks unsafe, so they're dropped.
  // Declared BEFORE the save effect: on first commit this reads storage before
  // the save effect sees the still-empty stacks and clears the key.
  useEffect(() => {
    if (!canEdit) return;
    let stored: string | null = null;
    try {
      stored = window.sessionStorage.getItem(DRAFT_HISTORY_STORAGE_KEY);
    } catch {
      return;
    }
    const persisted = deserializeDraftHistory(stored);
    if (!persisted) return;
    setDraftHistory(current => {
      if (canUndoDraftHistory(current) || canRedoDraftHistory(current)) return current;
      return canAdoptPersistedHistory(persisted, createDraftSnapshot(localSeats, localEmployees)) ? persisted : current;
    });
    // Mount-only (localSeats/localEmployees still hold the server-loaded
    // draft); re-running later could clobber in-session stacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit]);

  // Reload persistence, save half. Every history change mirrors to
  // sessionStorage (per-tab, so parallel admin tabs never share stacks);
  // cleared stacks (publish, stale-draft reset) also clear the key.
  useEffect(() => {
    if (!canEdit) return;
    try {
      if (canUndoDraftHistory(draftHistory) || canRedoDraftHistory(draftHistory)) {
        window.sessionStorage.setItem(DRAFT_HISTORY_STORAGE_KEY, serializeDraftHistory(draftHistory));
      } else {
        window.sessionStorage.removeItem(DRAFT_HISTORY_STORAGE_KEY);
      }
    } catch {
      // Storage unavailable or over quota: reload persistence degrades to the
      // old in-memory behavior instead of breaking edits.
    }
  }, [canEdit, draftHistory]);

  // Keyboard activation of a seat hands focus into the inspector panel once
  // the selection commits (mouse users keep their pointer focus — the flag is
  // only set from the marker layer's keydown and cleared on pointerdown).
  useEffect(() => {
    if (!focusInspectorAfterSelectRef.current) return;
    focusInspectorAfterSelectRef.current = false;
    if (!selectedSeatId) return;
    window.requestAnimationFrame(() => {
      document.getElementById("seat-inspector-panel")?.focus();
    });
  }, [selectedSeatId]);

  const mapViewportRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const askPlannerButtonRef = useRef<HTMLButtonElement | null>(null);

  const updateMapVisibleRange = useCallback(() => {
    const viewport = mapViewportRef.current;
    const map = mapRef.current;
    if (!viewport || !map || map.offsetWidth <= 0) return;

    const mapLeftInScrollContent = map.offsetLeft;
    const left = Math.max(0, (viewport.scrollLeft - mapLeftInScrollContent) / map.offsetWidth);
    const right = Math.min(1, (viewport.scrollLeft - mapLeftInScrollContent + viewport.clientWidth) / map.offsetWidth);

    const viewportWidth = viewport.clientWidth;

    setMapVisibleRange(current => (
      Math.abs(current.left - left) < 0.002 && Math.abs(current.right - right) < 0.002 && Math.abs(current.viewportWidth - viewportWidth) < 1
        ? current
        : { left, right, viewportWidth }
    ));
  }, []);

  const focusAskPlannerButton = useCallback(() => {
    returnFocusAfterClose(askPlannerButtonRef);
  }, []);

  const closeAskPlannerDrawer = useCallback(() => {
    setAskPlannerOpen(false);
    // The drawer borrowed the right edge from an expanded inspector — hand it
    // back on close instead of stranding the still-selected seat at the rail
    // (2026-07-16 critique, minor 6). The rail is unreachable while the drawer
    // is open (pill suppressed), so this cannot fight a user toggle.
    if (inspectorExpandedBeforePlannerRef.current) setInspectorCollapsed(false);
    inspectorExpandedBeforePlannerRef.current = false;
    focusAskPlannerButton();
  }, [focusAskPlannerButton]);

  const toggleFilterPanel = useCallback(() => {
    setAskPlannerOpen(false);
    setFilterCollapsed(current => !current);
  }, []);

  const openAskPlannerDrawer = useCallback(() => {
    // B2: the right edge only ever holds one panel. Opening Ask Planner
    // collapses the filter panel and the seat inspector so they don't stack /
    // overlap. Keep the seat selected (selectedSeatId untouched) — collapsing
    // only pins the inspector to its pill; expanding restores it.
    inspectorExpandedBeforePlannerRef.current = Boolean(selectedSeatId) && !inspectorCollapsed;
    setFilterCollapsed(true);
    setInspectorCollapsed(true);
    setAskPlannerOpen(true);
  }, [inspectorCollapsed, selectedSeatId]);

  useEffect(() => setLocalSeats(normalizeSeats(seats)), [seats]);
  useEffect(() => setLocalPublishedSeats(normalizeSeats(publishedSeats)), [publishedSeats]);
  useEffect(() => setLocalPublishedEmployees(publishedEmployees), [publishedEmployees]);
  useEffect(() => setLocalEmployees(employees), [employees]);
  useEffect(() => setLocalDepartmentOptions(departmentOptions), [departmentOptions]);
  useEffect(() => setLocalZoneOptions(zoneOptions), [zoneOptions]);
  useEffect(() => {
    if (!canEdit) {
      setNamesPreferenceHydrated(true);
      return;
    }

    try {
      setShowNames(window.localStorage.getItem(ADMIN_NAMES_VISIBLE_STORAGE_KEY) === "true");
    } catch {
      // Ignore unavailable storage; the toggle still works for the current page.
    }

    setNamesPreferenceHydrated(true);
  }, [canEdit]);
  useEffect(() => {
    if (!canEdit || !namesPreferenceHydrated) return;

    try {
      window.localStorage.setItem(ADMIN_NAMES_VISIBLE_STORAGE_KEY, showNames ? "true" : "false");
    } catch {
      // Ignore unavailable storage; this is a local UI preference only.
    }
  }, [canEdit, namesPreferenceHydrated, showNames]);
  useEffect(() => {
    if (!selectedSeatId) setInspectorCollapsed(false);
  }, [selectedSeatId]);

  // C3: success/action notices (role="status") auto-dismiss after ~6s so they
  // don't go stale during a busy editing session. Error notices (role="alert",
  // driven by actionError) are intentionally excluded — they persist until
  // dismissed/replaced. The timer resets whenever the message changes and is
  // cleared on unmount to avoid leaks/races. The inline Undo button stays
  // available for the whole time the notice is visible.
  useEffect(() => {
    if (!actionNotice) return;
    const timer = window.setTimeout(() => setActionNotice(null), 6000);
    return () => window.clearTimeout(timer);
  }, [actionNotice, setActionNotice]);

  // The stale-draft fence warning self-resolves (the page has already been
  // refreshed with the latest draft), so it auto-dismisses on a longer timer
  // rather than persisting like actionable errors.
  useEffect(() => {
    if (!staleDraftNotice) return;
    const timer = window.setTimeout(() => setStaleDraftNotice(null), 15000);
    return () => window.clearTimeout(timer);
  }, [staleDraftNotice]);

  // Session-expiry probe: production replaces thrown server-action messages
  // with an opaque digest, so an admin whose session lapsed mid-edit would
  // otherwise see a generic error with no way forward. Whenever a new action
  // error lands, ask the browser client whether the session still exists and,
  // if not, swap the banner for an explicit sign-in path.
  useEffect(() => {
    if (!canEdit || !actionError) return;
    let cancelled = false;
    createBrowserSupabaseClient()
      .auth.getUser()
      .then(({ data }) => {
        if (!cancelled) setSessionExpired(!data.user);
      })
      .catch(() => {
        // Network hiccups keep the original error — never claim expiry blindly.
      });
    return () => {
      cancelled = true;
    };
  }, [actionError, canEdit]);

  // The filter dropdown behaves like a menu (prototype .fmenu): a pointer press
  // outside the panel or its trigger buttons dismisses it.
  useEffect(() => {
    if (filterCollapsed) return;

    function handleOutsidePointer(event: globalThis.PointerEvent) {
      if (event.target instanceof Element && event.target.closest("[data-filter-ui]")) return;
      setFilterCollapsed(true);
    }

    document.addEventListener("pointerdown", handleOutsidePointer);
    return () => document.removeEventListener("pointerdown", handleOutsidePointer);
  }, [filterCollapsed]);

  // Same dismissal rule for the map-corner overflow (kebab) menu.
  useEffect(() => {
    if (!mapMenuOpen) return;

    function handleOutsidePointer(event: globalThis.PointerEvent) {
      if (event.target instanceof Element && event.target.closest("[data-map-menu]")) return;
      setMapMenuOpen(false);
    }

    document.addEventListener("pointerdown", handleOutsidePointer);
    return () => document.removeEventListener("pointerdown", handleOutsidePointer);
  }, [mapMenuOpen]);

  // Menus open with focus on the first item (WAI-ARIA menu button pattern),
  // not left behind on the trigger.
  useEffect(() => {
    if (!mapMenuOpen) return;
    const firstItem = mapMenuRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
    firstItem?.focus();
  }, [mapMenuOpen]);

  // Same dismissal rule for the publish status popover.
  useEffect(() => {
    if (!publishStatusOpen) return;

    function handleOutsidePointer(event: globalThis.PointerEvent) {
      if (event.target instanceof Element && event.target.closest("[data-publish-status]")) return;
      setPublishStatusOpen(false);
    }

    document.addEventListener("pointerdown", handleOutsidePointer);
    return () => document.removeEventListener("pointerdown", handleOutsidePointer);
  }, [publishStatusOpen]);

  // Same dismissal rule for the chrome-bar "More" menu (collapsed admin tools below lg).
  useEffect(() => {
    if (!chromeMenuOpen) return;

    function handleOutsidePointer(event: globalThis.PointerEvent) {
      if (event.target instanceof Element && event.target.closest("[data-chrome-menu]")) return;
      setChromeMenuOpen(false);
    }

    document.addEventListener("pointerdown", handleOutsidePointer);
    return () => document.removeEventListener("pointerdown", handleOutsidePointer);
  }, [chromeMenuOpen]);

  // Global command (3b): ⌘K / Ctrl+K focuses the command search — the chrome
  // input at lg+, the slim canvas row below that tier.
  useEffect(() => {
    setSearchShortcutHint(/mac/i.test(window.navigator.platform) ? "⌘K" : "Ctrl K");
    const handleSearchShortcut = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        const chromeInput = chromeSearchInputRef.current;
        const target = chromeInput && chromeInput.offsetParent !== null ? chromeInput : canvasSearchInputRef.current;
        target?.focus();
        target?.select();
      }
    };
    window.addEventListener("keydown", handleSearchShortcut);
    return () => window.removeEventListener("keydown", handleSearchShortcut);
  }, []);

  useEffect(() => {
    const viewport = mapViewportRef.current;
    if (!viewport) return;
    const viewportElement = viewport;

    function updateOverviewMapWidth() {
      // <640: keep the width null — the fixed mobile frame width (w-[1120px],
      // horizontal scroll by design, parity with the viewer's fit tier) takes
      // over, so overview never crushes 60 fixed-size pills into a phone width.
      if (!window.matchMedia("(min-width: 640px)").matches) {
        setOverviewMapWidth(null);
        return;
      }
      const availableWidth = Math.max(1, viewportElement.clientWidth - 12);
      const availableHeight = Math.max(1, viewportElement.clientHeight - 12);
      const desktopOverview = window.matchMedia("(min-width: 1024px)").matches;
      const nextWidth = desktopOverview
        ? Math.min(MAP_IMAGE_WIDTH, availableWidth, availableHeight * (MAP_IMAGE_WIDTH / MAP_IMAGE_HEIGHT))
        : Math.min(MAP_IMAGE_WIDTH, availableWidth);
      setOverviewMapWidth(Math.floor(nextWidth));
    }

    updateOverviewMapWidth();

    const observer = new ResizeObserver(updateOverviewMapWidth);
    observer.observe(viewportElement);
    window.addEventListener("resize", updateOverviewMapWidth);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateOverviewMapWidth);
    };
  }, []);

  useEffect(() => {
    const viewport = mapViewportRef.current;
    if (!viewport) return;

    updateMapVisibleRange();

    const observer = new ResizeObserver(updateMapVisibleRange);
    observer.observe(viewport);
    if (mapRef.current) observer.observe(mapRef.current);
    viewport.addEventListener("scroll", updateMapVisibleRange, { passive: true });
    window.addEventListener("resize", updateMapVisibleRange);

    return () => {
      observer.disconnect();
      viewport.removeEventListener("scroll", updateMapVisibleRange);
      window.removeEventListener("resize", updateMapVisibleRange);
    };
  }, [mapViewMode, overviewMapWidth, updateMapVisibleRange]);

  useEffect(() => {
    if (mapViewMode !== "detail") return;

    const frame = window.requestAnimationFrame(() => {
      const viewport = mapViewportRef.current;
      if (!viewport) return;

      const maxLeft = Math.max(viewport.scrollWidth - viewport.clientWidth, 0);
      const maxTop = Math.max(viewport.scrollHeight - viewport.clientHeight, 0);
      viewport.scrollTo({
        left: Math.min(Math.max(maxLeft / 2, 0), maxLeft),
        top: Math.min(Math.max(maxTop / 2, 0), maxTop),
        behavior: "auto"
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [mapViewMode]);

  useEffect(() => {
    if (mapViewMode !== "overview") return;

    const frame = window.requestAnimationFrame(() => {
      mapViewportRef.current?.scrollTo({ left: 0, top: 0, behavior: "auto" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [mapViewMode, overviewMapWidth]);

  useEffect(() => {
    setPlannerHighlightedSeatIds(current => {
      const seatIds = new Set(localSeats.map(seat => seat.id));
      const next = current.filter(seatId => seatIds.has(seatId));
      return next.length === current.length ? current : next;
    });
  }, [localSeats]);

  useEffect(() => {
    function isEditableTarget(target: EventTarget | null) {
      return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;

      if (inspectorGuardAction) {
        keepEditingInspector();
        return;
      }

      if (deleteSeatConfirm) {
        setDeleteSeatConfirm(null);
        return;
      }

      if (publishReviewOpen) {
        setPublishReviewOpen(false);
        return;
      }

      if (swapConfirm) {
        setSwapConfirm(null);
        return;
      }

      if (askPlannerOpen) {
        closeAskPlannerDrawer();
        return;
      }

      if (publishStatusOpen) {
        setPublishStatusOpen(false);
        return;
      }

      if (mapMenuOpen) {
        setMapMenuOpen(false);
        return;
      }

      if (chromeMenuOpen) {
        setChromeMenuOpen(false);
        return;
      }

      if (addSeatMode || moveSeatMode || swapSourceSeatId) {
        const canceledMode = swapSourceSeatId ? "Swap" : moveSeatMode ? "Move" : "Add seat";
        setAddSeatMode(false);
        setMoveSeatMode(false);
        setSwapSourceSeatId(null);
        setDragState(null);
        setActionNotice(`${canceledMode} canceled — no changes made.`, "neutral");
        return;
      }

      if (!filterCollapsed && !isEditableTarget(event.target)) {
        setFilterCollapsed(true);
        return;
      }

      if (!isEditableTarget(event.target) && selectedSeatId) {
        if (inspectorDirty) {
          setInspectorGuardAction({ kind: "close-inspector" });
          setPendingInspectorSaveAction(null);
          setInspectorCollapsed(false);
          setActionNotice(null);
          setActionError(null);
          return;
        }
        // Esc ladder: selected with a retained query returns to RESULTS (the panel
        // slot re-renders results); selected without a query returns to idle.
        // Focus returns to the seat's marker — the inspector (which may hold
        // focus) unmounts with the selection (critique action 5).
        const escDeselectSeatId = selectedSeatId;
        setSelectedSeatId(null);
        setInspectorCollapsed(false);
        focusSeatMarker(escDeselectSeatId);
        return;
      }

      if (!isEditableTarget(event.target) && search.trim()) {
        // The results panel teaches "Esc clears" — when the press came from a
        // result card, the card unmounts with the panel, so focus returns to
        // the search input the cleared query belongs to.
        const fromResultsPanel = event.target instanceof Element && Boolean(event.target.closest('[aria-label="Admin search results"]'));
        setSearch("");
        if (fromResultsPanel) {
          window.requestAnimationFrame(() => {
            const chromeInput = chromeSearchInputRef.current;
            (chromeInput && chromeInput.offsetParent !== null ? chromeInput : canvasSearchInputRef.current)?.focus();
          });
        }
        return;
      }

      if (!isEditableTarget(event.target) && (department !== "all" || zone !== "all" || status !== "all")) {
        setDepartment("all");
        setZone("all");
        setStatus("all");
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [addSeatMode, askPlannerOpen, chromeMenuOpen, closeAskPlannerDrawer, deleteSeatConfirm, department, filterCollapsed, inspectorDirty, inspectorGuardAction, mapMenuOpen, moveSeatMode, position, publishReviewOpen, publishStatusOpen, search, selectedSeatId, setActionNotice, status, swapConfirm, swapSourceSeatId, zone]);

  // Warn on tab close / hard navigation while the inspector holds unsaved
  // edits — in-app links route through the guard dialog, but only the browser
  // can intercept unload (#194).
  useEffect(() => {
    if (!inspectorDirty) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [inspectorDirty]);

  // Deep-link (#196): `?seat=<label>` is the shareable face of the selection.
  // Read once on mount; the write effect below then mirrors every selection
  // change back with a shallow replaceState — no router navigation (so no
  // server refetch) and no history entry per click.
  const seatParamAppliedRef = useRef(false);
  useEffect(() => {
    const seatId = findSeatIdByParam(localSeats, readSeatParam(window.location.search));
    seatParamAppliedRef.current = true;
    if (!seatId) return;
    if (commitSeatSelection(seatId)) queueCenterSeatInMap(seatId);
    // Mount-only by design: replaceState fires no events, and re-running on
    // seat updates would fight the user's live selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!seatParamAppliedRef.current) return;
    const label = selectedSeatId ? (localSeats.find(seat => seat.id === selectedSeatId)?.label ?? null) : null;
    const next = `${window.location.pathname}${withSeatParam(window.location.search, label)}${window.location.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (next !== current) window.history.replaceState(window.history.state, "", next);
    // localSeats omitted: a seat's label is stable for the life of its id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSeatId]);

  const departments = useMemo(() => {
    const values = new Set<string>();
    localDepartmentOptions.filter(item => item.active).forEach(item => values.add(item.name));
    localEmployees.forEach(emp => {
      if (emp.department) values.add(emp.department);
    });
    return Array.from(values).sort();
  }, [localDepartmentOptions, localEmployees]);

  // No position_options side table exists — job titles are free text on
  // employees, so the facet's options come straight off the roster.
  const positions = useMemo(() => buildPositionOptions(localEmployees), [localEmployees]);

  const zones = useMemo(() => {
    const values = new Set<string>();
    localZoneOptions.filter(item => item.active).forEach(item => values.add(item.name));
    localSeats.forEach(seat => {
      const seatZone = getSeatZone(seat);
      if (seatZone) values.add(seatZone);
    });
    return Array.from(values).sort();
  }, [localSeats, localZoneOptions]);

  const stats = useMemo(() => ({
    total: localSeats.length,
    assigned: localSeats.filter(seat => seat.status === "assigned").length,
    available: localSeats.filter(seat => seat.status === "available").length,
    reserved: localSeats.filter(seat => seat.status === "reserved").length,
    unavailable: localSeats.filter(seat => seat.status === "unavailable").length
  }), [localSeats]);
  const publishSummary = useMemo(
    () => buildPublishChangeSummary(localSeats, localPublishedSeats, {
      employees: localEmployees,
      publishedEmployees: localPublishedEmployees
    }),
    [localSeats, localPublishedSeats, localEmployees, localPublishedEmployees]
  );
  const draftChangedSeatLabelSet = useMemo(() => new Set([
    ...publishSummary.addedSeats,
    ...publishSummary.assignmentChanges,
    ...publishSummary.vacatedSeats,
    ...publishSummary.seatMoves,
    ...publishSummary.statusChanges,
    ...publishSummary.otherChanges
  ].map(item => item.label)), [publishSummary]);
  // Changes appearing (a local edit or another session's refresh) retire the
  // idle status popover — the chip morphs into the review entry point.
  useEffect(() => {
    if (publishSummary.hasChanges) setPublishStatusOpen(false);
  }, [publishSummary.hasChanges]);
  // Same derivation as app/page.tsx: publish_seat_map() re-inserts every
  // published row, so the max updated_at over published seats IS the last
  // publish time. Client-side formatting is hydration-safe here — the popover
  // only ever renders after an interaction.
  const lastPublishedLabel = useMemo(() => {
    const lastPublishedAt = localPublishedSeats.reduce<string | null>(
      (latest, seat) => (seat.updated_at && (!latest || seat.updated_at > latest) ? seat.updated_at : latest),
      null
    );
    return lastPublishedAt
      ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" }).format(new Date(lastPublishedAt))
      : null;
  }, [localPublishedSeats]);
  // Legend counts follow the active constraints — the number row must not
  // contradict a filtered map (2026-07-16 regrade, review 4). matchesFilters
  // covers search + structured filters, exactly what the map dims by.
  const legendFiltersActive = search.trim() !== "" || department !== "all" || position !== "all" || zone !== "all" || status !== "all";
  const legendSourceSeats = legendFiltersActive ? localSeats.filter(matchesFilters) : localSeats;
  const legendCounts: Record<string, number> = {
    assigned: legendSourceSeats.filter(seat => seat.status === "assigned").length,
    available: legendSourceSeats.filter(seat => seat.status === "available").length,
    reserved: legendSourceSeats.filter(seat => seat.status === "reserved").length,
    unavailable: legendSourceSeats.filter(seat => seat.status === "unavailable").length,
    "draft-changed": draftChangedSeatLabelSet.size
  };

  const selectedSeat = localSeats.find(seat => seat.id === selectedSeatId) ?? null;
  // Published counterpart position (matched by seat_key — ids differ between
  // layers) for the inspector's "Reset position" escape hatch. Null when the
  // seat never published (custom) or hasn't moved off its published spot.
  const selectedSeatPublishedPosition = useMemo(() => {
    if (!canEdit || !selectedSeat) return null;
    const published = localPublishedSeats.find(seat => seat.seat_key === selectedSeat.seat_key);
    if (!published) return null;
    const moved = Math.abs(published.x - selectedSeat.x) > 1e-6 || Math.abs(published.y - selectedSeat.y) > 1e-6;
    return moved ? { x: published.x, y: published.y } : null;
  }, [canEdit, selectedSeat, localPublishedSeats]);
  const swapSourceSeat = swapSourceSeatId ? localSeats.find(seat => seat.id === swapSourceSeatId) ?? null : null;
  const swapTargetSeat = swapConfirm ? localSeats.find(seat => seat.id === swapConfirm.targetSeatId) ?? null : null;
  const visualLocalSeats = useMemo(() => seatsToVisualSeats(localSeats), [localSeats]);
  const visualSeatById = useMemo(() => new Map(visualLocalSeats.map(seat => [seat.id, seat])), [visualLocalSeats]);
  // Roving tabindex: the map is ONE tab stop (the selected seat, else the last
  // visited seat, else top-left) and arrow keys walk between seats. Points are
  // scaled to the floor plan's pixel aspect so "right" matches the screen.
  const seatNavPoints = useMemo(
    () => visualLocalSeats.map(seat => ({ id: seat.id, x: seat.x * MAP_IMAGE_WIDTH, y: seat.y * MAP_IMAGE_HEIGHT })),
    [visualLocalSeats]
  );
  const mapRovingSeatId = resolveRovingSeatId(seatNavPoints, selectedSeatId ?? rovingSeatId);
  const plannerHighlightedSeatIdSet = useMemo(() => new Set(plannerHighlightedSeatIds), [plannerHighlightedSeatIds]);
  const searchQuery = search.trim();
  const searchActive = Boolean(searchQuery);
  const structuredFiltersActive = department !== "all" || position !== "all" || zone !== "all" || status !== "all";
  const activeFilterChips: ActiveFilterChip[] = [
    searchActive ? { id: "search", label: "Search", value: searchQuery, removeLabel: `Remove search filter ${searchQuery}` } : null,
    department !== "all" ? { id: "department", label: "Department", value: department, removeLabel: `Remove department filter ${department}` } : null,
    position !== "all" ? { id: "position", label: "Position", value: position, removeLabel: `Remove position filter ${position}` } : null,
    zone !== "all" ? { id: "zone", label: "Zone", value: zone, removeLabel: `Remove zone filter ${zone}` } : null,
    status !== "all" ? { id: "status", label: "Status", value: STATUS_LABELS[status as SeatStatus] ?? status, removeLabel: `Remove status filter ${STATUS_LABELS[status as SeatStatus] ?? status}` } : null
  ].filter(Boolean) as ActiveFilterChip[];
  const structuredFilterCount = [
    department !== "all",
    position !== "all",
    zone !== "all",
    status !== "all"
  ].filter(Boolean).length;
  const activeFilterCount = activeFilterChips.length;
  const filtersActive = activeFilterCount > 0;
  const matchingSeats = filtersActive ? localSeats.filter(seat => matchesFilters(seat)) : localSeats;
  const resultStatusBreakdown = useMemo<ResultStatusBreakdown>(() => ({
    available: matchingSeats.filter(seat => seat.status === "available").length,
    assigned: matchingSeats.filter(seat => seat.status === "assigned").length,
    reserved: matchingSeats.filter(seat => seat.status === "reserved").length,
    unavailable: matchingSeats.filter(seat => seat.status === "unavailable").length
  }), [matchingSeats]);
  // Merged result cards: one card per entity (F1) — an assigned seat and its occupant
  // are one card, never two rows. Unassigned people matching a text search appear as
  // disabled cards so the person is findable without fabricating a seat.
  const panelResults = useMemo<AdminResultCard[]>(() => {
    const statusRank: Record<SeatStatus, number> = { assigned: 0, available: 1, reserved: 2, unavailable: 3 };
    const seatCards = [...matchingSeats]
      .sort((a, b) => statusRank[a.status] - statusRank[b.status] || a.label.localeCompare(b.label))
      .map(seat => {
        const zoneLabel = getSeatZone(seat) || "No zone";
        if (seat.employee) {
          return {
            key: `seat-${seat.id}`,
            seatId: seat.id,
            title: `${formatDisplayName(seat.employee.full_name)} — ${formatSeatCode(seat.label)}`,
            // Person rows already imply "assigned" (they're built from an
            // employee-bearing seat) — the trailing status token is redundant
            // here and was truncating to "Assi…" in the narrow panel.
            subtitle: [seat.employee.department, zoneLabel].filter(Boolean).join(" · "),
            status: seat.status
          };
        }
        return {
          key: `seat-${seat.id}`,
          seatId: seat.id,
          title: formatSeatCode(seat.label),
          subtitle: [seat.status === "available" ? "Open seat" : STATUS_LABELS[seat.status], zoneLabel].join(" · "),
          status: seat.status
        };
      });
    if (!searchQuery) return seatCards.slice(0, 60);
    const needle = searchQuery.toLowerCase();
    const assignedEmployeeIds = new Set(localSeats.map(seat => seat.employee_id).filter(Boolean));
    const unassignedPeople = localEmployees
      .filter(employee => !assignedEmployeeIds.has(employee.id))
      .filter(employee => [employee.full_name, employee.position, employee.department, employee.phone_extension].filter(Boolean).join(" ").toLowerCase().includes(needle))
      .map(employee => ({
        key: `person-${employee.id}`,
        seatId: null,
        title: formatDisplayName(employee.full_name),
        subtitle: [employee.position, employee.department, "Unassigned"].filter(Boolean).join(" · "),
        status: null,
        disabled: true
      }));
    return [...seatCards, ...unassignedPeople].slice(0, 60);
  }, [localEmployees, localSeats, matchingSeats, searchQuery]);
  const selectedSeatMatchesFilters = selectedSeat ? matchesFilters(selectedSeat) : true;
  const undoAvailable = canUndoDraftHistory(draftHistory);
  const redoAvailable = canRedoDraftHistory(draftHistory);
  // Session-local activity for the inspector's Activity section: undo-history
  // labels that name the selected seat (newest first). Client-side only.
  const selectedSeatActivity = useMemo(() => {
    if (!selectedSeat) return [];
    return draftHistory.undoStack
      .filter(entry => entry.label.split(/\s+/).includes(selectedSeat.label))
      .slice(-5)
      .reverse()
      .map(entry => entry.label);
  }, [draftHistory, selectedSeat]);
  const lastUndoLabel = draftHistory.undoStack.at(-1)?.label ?? null;
  const nextRedoLabel = draftHistory.redoStack.at(-1)?.label ?? null;

  function eventToPoint(event: Pick<PointerEvent<HTMLElement>, "clientX" | "clientY">) {
    const rect = mapRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return clientPointToNormalized(event.clientX, event.clientY, rect);
  }

  function matchesFilters(seat: SeatWithEmployee) {
    const needle = search.trim().toLowerCase();
    const haystack = [
      seat.label,
      seat.status,
      getSeatZone(seat),
      seat.employee?.full_name,
      seat.employee?.position,
      seat.employee?.department,
      seat.employee?.phone_extension
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    const seatDepartment = seat.employee?.department ?? "";
    const seatZone = getSeatZone(seat);
    const searchOk = !needle || haystack.includes(needle);
    const departmentOk = department === "all" || departmentKey(seatDepartment) === departmentKey(department);
    const positionOk = seatMatchesPosition(seat.employee?.position, position);
    const zoneOk = zone === "all" || seatZone === zone;
    const statusOk = status === "all" || seat.status === (status as SeatStatus);

    return searchOk && departmentOk && positionOk && zoneOk && statusOk;
  }

  // Single source of truth for SeatMarker's `dimmed` prop: a seat dims when
  // it fails the active filters OR falls outside an Ask Planner highlight
  // focus (the selected seat stays lit). The name-nudge collision graph
  // (dimmedSeatIdSet → namedSeatIdSet below) reuses this exact predicate —
  // keep both call sites on it rather than re-deriving either term.
  function isSeatDimmed(seat: SeatWithEmployee) {
    const dimmedByPlannerFocus =
      plannerHighlightedSeatIds.length > 0 &&
      !plannerHighlightedSeatIdSet.has(seat.id) &&
      seat.id !== selectedSeatId;
    return !matchesFilters(seat) || dimmedByPlannerFocus;
  }

  // Delegated keyboarding for the marker layer: arrows rove between seats
  // (preventDefault stops the scroll-viewport from panning underneath), and a
  // keyboard activation queues a focus handoff into the inspector once it
  // opens. Pointer interactions cancel the handoff.
  function handleMarkerLayerKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const seatId = (event.target as HTMLElement).closest<HTMLElement>("[data-seat-id]")?.dataset.seatId;
    if (!seatId) return;

    const direction = arrowKeyToDirection(event.key);
    if (direction) {
      event.preventDefault();
      event.stopPropagation();
      const nextSeatId = findNearestSeatInDirection(seatNavPoints, seatId, direction);
      if (nextSeatId) {
        setRovingSeatId(nextSeatId);
        focusSeatMarker(nextSeatId);
      }
      return;
    }

    if ((event.key === "Enter" || event.key === " ") && seatId !== selectedSeatId) {
      focusInspectorAfterSelectRef.current = true;
    }
  }

  function handleMarkerLayerFocusCapture(event: { target: EventTarget | null }) {
    const seatId = (event.target as HTMLElement | null)?.closest?.<HTMLElement>("[data-seat-id]")?.dataset.seatId;
    if (seatId) setRovingSeatId(seatId);
  }

  function focusSeatMarker(seatId: string | null) {
    if (!seatId) return;
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>(`[data-seat-id="${seatId}"]`)?.focus();
    });
  }

  function applyCloseInspectorAction() {
    const seatIdToFocus = selectedSeatId;
    setSelectedSeatId(null);
    setInspectorDirty(false);
    setMoveSeatMode(false);
    setSwapSourceSeatId(null);
    setSwapConfirm(null);
    setDeleteSeatConfirm(null);
    setInspectorCollapsed(false);
    focusSeatMarker(seatIdToFocus);
  }

  function applyClearSelectionAction() {
    const seatIdToFocus = selectedSeatId;
    setSelectedSeatId(null);
    setInspectorDirty(false);
    setMoveSeatMode(false);
    setAddSeatMode(false);
    setSwapSourceSeatId(null);
    setSwapConfirm(null);
    setDeleteSeatConfirm(null);
    setInspectorCollapsed(false);
    focusSeatMarker(seatIdToFocus);
  }

  function applyStartAddSeatAction() {
    setSelectedSeatId(null);
    setInspectorDirty(false);
    setMoveSeatMode(false);
    setSwapSourceSeatId(null);
    setSwapConfirm(null);
    setAddSeatMode(true);
    setInspectorCollapsed(false);
  }

  function applyStartMoveSeatAction() {
    if (!selectedSeatId) return;
    setAddSeatMode(false);
    setSwapSourceSeatId(null);
    setSwapConfirm(null);
    setMoveSeatMode(current => !current);
  }

  function applyStartSwapSeatAction() {
    if (!selectedSeat) {
      setActionError("Select the source seat first, then choose Swap seat.");
      setActionNotice(null);
      return;
    }

    setActionError(null);
    setActionNotice(null);
    setInspectorDirty(false);
    setMoveSeatMode(false);
    setAddSeatMode(false);
    setDragState(null);
    setSwapConfirm(null);
    setSwapSourceSeatId(selectedSeat.id);
    setInspectorCollapsed(true);
  }

  function applyInspectorGuardAction(action: InspectorGuardAction) {
    if (action.kind === "select-seat") {
      commitSeatSelection(action.seatId);
      if (action.center) {
        setFilterCollapsed(true);
        queueCenterSeatInMap(action.seatId);
      }
      return;
    }

    if (action.kind === "close-inspector") {
      applyCloseInspectorAction();
      return;
    }

    if (action.kind === "clear-selection") {
      applyClearSelectionAction();
      return;
    }

    if (action.kind === "start-add-seat") {
      applyStartAddSeatAction();
      return;
    }

    if (action.kind === "start-move-seat") {
      applyStartMoveSeatAction();
      return;
    }

    if (action.kind === "start-swap-seat") {
      applyStartSwapSeatAction();
      return;
    }

    window.location.assign(action.href);
  }

  function requestInspectorGuard(action: InspectorGuardAction) {
    if (!inspectorDirty) {
      applyInspectorGuardAction(action);
      return true;
    }

    setInspectorGuardAction(action);
    setPendingInspectorSaveAction(null);
    setInspectorCollapsed(false);
    setActionNotice(null);
    setActionError(null);
    return false;
  }

  function requestInspectorGuardSave() {
    if (!inspectorGuardAction) return;
    setPendingInspectorSaveAction(inspectorGuardAction);
    setInspectorGuardAction(null);
    window.requestAnimationFrame(() => {
      const form = document.getElementById(INSPECTOR_FORM_ID);
      if (form instanceof HTMLFormElement) form.requestSubmit();
    });
  }

  function discardInspectorGuardEdits() {
    if (!inspectorGuardAction) return;
    const action = inspectorGuardAction;
    setInspectorGuardAction(null);
    setPendingInspectorSaveAction(null);
    setInspectorDirty(false);
    setInspectorResetSignal(current => current + 1);
    applyInspectorGuardAction(action);
  }

  function keepEditingInspector() {
    setInspectorGuardAction(null);
    setPendingInspectorSaveAction(null);
    setInspectorCollapsed(false);
  }

  function cancelPendingInspectorGuardAction() {
    setPendingInspectorSaveAction(null);
  }

  function describeInspectorGuardAction(action: InspectorGuardAction | null) {
    if (!action) return "continuing.";
    if (action.kind === "select-seat") return "opening another seat.";
    if (action.kind === "close-inspector") return "closing the inspector.";
    if (action.kind === "clear-selection") return "clearing the selection.";
    if (action.kind === "start-add-seat") return "starting add-seat mode.";
    if (action.kind === "start-move-seat") return "starting move-seat mode.";
    if (action.kind === "start-swap-seat") return "starting swap-seats mode.";
    return `opening ${action.destination}.`;
  }

  function captureDraftSnapshot() {
    return createDraftSnapshot(localSeats, localEmployees);
  }

  function applyRestoredDraftPayload(payload: { seats: SeatWithEmployee[]; employees: Employee[] }) {
    const restoredSeats = normalizeSeats(payload.seats);
    setLocalSeats(restoredSeats);
    setLocalEmployees(payload.employees);
    setSelectedSeatId(current => (current && restoredSeats.some(seat => seat.id === current) ? current : null));
    setInspectorDirty(false);
    setMoveSeatMode(false);
    setAddSeatMode(false);
    setSwapSourceSeatId(null);
    setSwapConfirm(null);
    setDragState(null);
  }

  function recordDraftHistory(label: string, before: DraftSnapshot, afterSeats: SeatWithEmployee[], afterEmployees: Employee[]) {
    const after = createDraftSnapshot(afterSeats, afterEmployees);
    setDraftHistory(current => pushDraftHistory(current, { label, before, after }));
  }

  function describeSeatUpdate(before: DraftSnapshot, updated: SeatWithEmployee) {
    const previous = before.seats.find(seat => seat.id === updated.id);
    if (!previous) return `Update ${updated.label}`;
    if (previous.employee_id && !updated.employee_id) return `Vacate ${updated.label}`;
    if (!previous.employee_id && updated.employee_id) return `Assign ${updated.label}`;
    if (previous.employee_id !== updated.employee_id) return `Change assignment ${updated.label}`;
    if (previous.status !== updated.status) return `Change status ${updated.label}`;
    return `Update ${updated.label}`;
  }

  // The draft-concurrency fence fired: another admin session changed the draft
  // after this page loaded it. The local undo/redo baselines (and any pending
  // mode) predate those edits, so keeping them would re-arm the same stale
  // write — drop them and re-seed from the server.
  function handleStaleDraft(message: string) {
    setActionNotice(null);
    setActionError(null);
    setStaleDraftNotice(`${message} This page has been refreshed with the latest draft.`);
    setDraftHistory(clearDraftHistory());
    setInspectorDirty(false);
    setInspectorResetSignal(current => current + 1);
    setMoveSeatMode(false);
    setAddSeatMode(false);
    setSwapSourceSeatId(null);
    setSwapConfirm(null);
    setDragState(null);
    router.refresh();
  }

  function restoreHistorySnapshot(snapshot: DraftSnapshot, nextHistory: typeof draftHistory, actionLabel: string, notice: string, selectRestoredSeatLabel?: string) {
    if (inspectorDirty) {
      setActionNotice(null);
      setActionError("Save or discard the selected seat edits before using Undo or Redo.");
      return;
    }

    startTransition(async () => {
      setMutationInFlight(true);
      try {
        setActionError(null);
        setActionNotice(null);
        setStaleDraftNotice(null);
        // Fence on the draft this page currently holds (NOT the snapshot being
        // restored): if another session advanced the draft, restoring would
        // silently revert their edits, so the server rejects and we reload.
        const result = await restoreDraftSnapshotAction(snapshot, listDraftSeatExpectations(localSeats));
        if (!result.ok) {
          handleStaleDraft(result.message);
          return;
        }
        applyRestoredDraftPayload(result);
        if (selectRestoredSeatLabel) {
          const restoredSeat = result.seats.find(seat => seat.label === selectRestoredSeatLabel);
          if (restoredSeat) {
            setSelectedSeatId(restoredSeat.id);
            setInspectorCollapsed(false);
          }
        }
        setDraftHistory(nextHistory);
        setActionNotice(notice);
      } catch (error) {
        setActionNotice(null);
        setActionError(error instanceof Error ? error.message : `Could not ${actionLabel.toLowerCase()} draft edit.`);
      } finally {
        setMutationInFlight(false);
      }
    });
  }

  // Undo/redo restore the WHOLE draft from a history snapshot, so they are
  // only safe while the live draft still equals the state the entry left it in
  // (`after` for undo, `before` for redo). A concurrent edit by another admin
  // can reach this client through a server-action refresh, making the VIEW
  // fresh (so the server-side fence passes) while the SNAPSHOT is stale —
  // restoring it would silently revert that admin's edit. Reject here instead.
  function historyAdjacencyBroken(expectedCurrent: DraftSnapshot) {
    return !draftStatesEquivalent(createDraftSnapshot(localSeats, localEmployees), expectedCurrent);
  }

  function undoDraftEdit() {
    const result = undoDraftHistory(draftHistory);
    if (!result) return;
    if (historyAdjacencyBroken(result.entry.after)) {
      handleStaleDraft("The draft changed in another session after this edit was made, so undoing it is no longer safe.");
      return;
    }
    restoreHistorySnapshot(result.snapshot, result.history, "Undo", `Undid ${result.entry.label}.`);
  }

  function redoDraftEdit() {
    const result = redoDraftHistory(draftHistory);
    if (!result) return;
    if (historyAdjacencyBroken(result.entry.before)) {
      handleStaleDraft("The draft changed in another session after this edit was undone, so redoing it is no longer safe.");
      return;
    }
    const addSeatLabel = result.entry.label.match(/^Add (.+)$/)?.[1];
    restoreHistorySnapshot(result.snapshot, result.history, "Redo", `Redid ${result.entry.label}.`, addSeatLabel);
  }

  function clearStructuredFilters() {
    setDepartment("all");
    setPosition("all");
    setZone("all");
    setStatus("all");
  }

  function clearAllConstraints() {
    setSearch("");
    clearStructuredFilters();
  }

  function clearSearch() {
    setSearch("");
  }

  // Shared by the chrome search input (lg+) and the canvas search row below it.
  function handleSearchInputChange(value: string) {
    setSearch(value);
    // INV-1 (owner-revised): search hands the panel slot to results — the
    // inspector auto-collapses to its pill (selection retained; expand to
    // return). Unsaved inspector edits stay put: no collapse until save/discard.
    if (searchHandsPanelToResults(value, Boolean(selectedSeatId), inspectorDirty)) {
      setInspectorCollapsed(true);
    }
  }

  function removeActiveFilterChip(chipId: string) {
    if (chipId === "search") {
      clearSearch();
      return;
    }

    if (chipId === "department") {
      setDepartment("all");
      return;
    }

    if (chipId === "position") {
      setPosition("all");
      return;
    }

    if (chipId === "zone") {
      setZone("all");
      return;
    }

    if (chipId === "status") {
      setStatus("all");
    }
  }

  const scrollMapToPoint = useCallback((x: number, y: number, options?: { verticalViewportAnchor?: number }) => {
    const viewport = mapViewportRef.current;
    const map = mapRef.current;
    if (!viewport || !map) return;

    const anchor = options?.verticalViewportAnchor ?? 0.5;
    const left = clampScrollPosition((x * map.offsetWidth) - (viewport.clientWidth / 2), viewport.scrollWidth - viewport.clientWidth);
    const top = clampScrollPosition((y * map.offsetHeight) - (viewport.clientHeight * anchor), viewport.scrollHeight - viewport.clientHeight);
    viewport.scrollTo({ left, top, behavior: "smooth" });
  }, []);

  const centerMapViewport = useCallback((behavior: ScrollBehavior = "smooth") => {
    const viewport = mapViewportRef.current;
    if (!viewport) return;

    const left = clampScrollPosition((viewport.scrollWidth - viewport.clientWidth) / 2, viewport.scrollWidth - viewport.clientWidth);
    const top = clampScrollPosition((viewport.scrollHeight - viewport.clientHeight) / 2, viewport.scrollHeight - viewport.clientHeight);
    viewport.scrollTo({ left, top, behavior });
  }, []);

  function changeMapViewMode(nextMode: MapViewMode) {
    setMapViewMode(nextMode);

    if (nextMode === "detail") {
      const detailFocusSeatId = selectedSeatId ?? (filtersActive && matchingSeats.length === 1 ? matchingSeats[0].id : null);
      if (detailFocusSeatId) {
        queueCenterSeatInMap(detailFocusSeatId);
        return;
      }

      window.requestAnimationFrame(() => centerMapViewport());
      return;
    }

    if (nextMode === "overview") {
      window.requestAnimationFrame(() => {
        mapViewportRef.current?.scrollTo({ left: 0, top: 0, behavior: "auto" });
      });
    }
  }

  // Presentation-only zoom: scales the rendered map frame and re-centers the
  // viewport on the point that was previously centered. Stored coordinates and
  // the calibration transform are untouched (spec §9).
  function applyMapZoom(nextZoom: number) {
    const clamped = Math.min(MAP_ZOOM_MAX, Math.max(MAP_ZOOM_MIN, Math.round(nextZoom * 100) / 100));

    if (mapViewMode !== "detail") {
      setMapViewMode("detail");
      setZoomFactor(clamped);
      window.requestAnimationFrame(() => centerMapViewport("auto"));
      return;
    }

    const viewport = mapViewportRef.current;
    const map = mapRef.current;
    if (viewport && map && map.offsetWidth > 0 && map.offsetHeight > 0) {
      pendingZoomCenterRef.current = {
        x: Math.min(1, Math.max(0, (viewport.scrollLeft + viewport.clientWidth / 2 - map.offsetLeft) / map.offsetWidth)),
        y: Math.min(1, Math.max(0, (viewport.scrollTop + viewport.clientHeight / 2 - map.offsetTop) / map.offsetHeight))
      };
    }

    setZoomFactor(clamped);
  }

  useEffect(() => {
    const center = pendingZoomCenterRef.current;
    if (!center) return;
    pendingZoomCenterRef.current = null;

    const frame = window.requestAnimationFrame(() => {
      const viewport = mapViewportRef.current;
      const map = mapRef.current;
      if (!viewport || !map) return;
      viewport.scrollTo({
        left: clampScrollPosition(map.offsetLeft + (center.x * map.offsetWidth) - (viewport.clientWidth / 2), viewport.scrollWidth - viewport.clientWidth),
        top: clampScrollPosition(map.offsetTop + (center.y * map.offsetHeight) - (viewport.clientHeight / 2), viewport.scrollHeight - viewport.clientHeight),
        behavior: "auto"
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [zoomFactor]);

  function fitMapToView() {
    setZoomFactor(1);
    if (mapViewMode !== "overview") changeMapViewMode("overview");
  }

  // Click-and-drag pan on the map viewport (view transform only). Interactive
  // targets (seat markers, buttons, links, form fields) never start a pan so
  // their clicks keep working; a press that stays within the drag threshold
  // falls through to the canvas click-to-deselect behavior on release.
  function isPanBlockedTarget(target: EventTarget | null) {
    return target instanceof Element && Boolean(target.closest("button, a, input, select, textarea, [data-seat-id]"));
  }

  function handleViewportPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (mapViewMode !== "detail" || floor !== "3") return;
    if (event.button !== 0) return;
    if ((canEdit && addSeatMode) || dragState) return;
    if (isPanBlockedTarget(event.target)) return;
    const viewport = mapViewportRef.current;
    if (!viewport) return;

    panStateRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startScrollLeft: viewport.scrollLeft,
      startScrollTop: viewport.scrollTop,
      moved: false
    };
    viewport.setPointerCapture(event.pointerId);
    setPanning(true);
  }

  function handleViewportPointerMove(event: PointerEvent<HTMLDivElement>) {
    const pan = panStateRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    const viewport = mapViewportRef.current;
    if (!viewport) return;

    const deltaX = event.clientX - pan.startClientX;
    const deltaY = event.clientY - pan.startClientY;
    if (!pan.moved && Math.abs(deltaX) + Math.abs(deltaY) > 4) pan.moved = true;
    viewport.scrollLeft = pan.startScrollLeft - deltaX;
    viewport.scrollTop = pan.startScrollTop - deltaY;
  }

  function handleViewportPointerEnd(event: PointerEvent<HTMLDivElement>) {
    const pan = panStateRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    panStateRef.current = null;
    setPanning(false);
    if (pan.moved || event.type === "pointercancel") return;

    // A stationary press on empty canvas keeps the pre-pan behavior: clear the
    // selection (guarded while the inspector holds unsaved edits).
    if (isPanBlockedTarget(event.target)) return;
    if (canEdit && addSeatMode) return;
    if (swapSourceSeatId) {
      setActionNotice(null);
      return;
    }
    if (selectedSeatId && inspectorDirty) {
      requestInspectorGuard({ kind: "clear-selection" });
      return;
    }
    setSelectedSeatId(null);
    setInspectorDirty(false);
    setMoveSeatMode(false);
  }

  // Every seat-centering path (results "Show on map", guard-action selection,
  // and the selection-change effect below) funnels through this one function,
  // so they all resolve the same anchor for the same selection — that's what
  // makes two callers racing to center the same seat harmless (they land on
  // the same target instead of fighting over it). Callers only need to pass
  // an explicit verticalViewportAnchor when they want to override the default.
  const centerSeatInMap = useCallback((seatId: string, options?: { verticalViewportAnchor?: number }) => {
    const seat = localSeats.find(item => item.id === seatId);
    if (!seat) return;
    const point = savedPointToVisualPoint({ x: seat.x, y: seat.y }, seat);
    const verticalViewportAnchor = options?.verticalViewportAnchor ?? (
      window.matchMedia(`(min-width: ${SEAT_CENTER_PANEL_BREAKPOINT_PX}px)`).matches
        ? 0.5
        : SEAT_CENTER_SHEET_ANCHOR
    );
    scrollMapToPoint(point.x, point.y, { verticalViewportAnchor });
  }, [localSeats, scrollMapToPoint]);

  function fitSeatsInMap(seatsToFit: SeatWithEmployee[]) {
    if (!seatsToFit.length) return;
    if (seatsToFit.length === 1) {
      const point = savedPointToVisualPoint({ x: seatsToFit[0].x, y: seatsToFit[0].y }, seatsToFit[0]);
      scrollMapToPoint(point.x, point.y);
      return;
    }

    const visualSeatsToFit = seatsToFit.map(seat => savedPointToVisualPoint({ x: seat.x, y: seat.y }, seat));
    const bounds = visualSeatsToFit.reduce(
      (current, point) => ({
        minX: Math.min(current.minX, point.x),
        maxX: Math.max(current.maxX, point.x),
        minY: Math.min(current.minY, point.y),
        maxY: Math.max(current.maxY, point.y)
      }),
      { minX: 1, maxX: 0, minY: 1, maxY: 0 }
    );

    scrollMapToPoint((bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2);
  }

  const queueCenterSeatInMap = useCallback((seatId: string) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => centerSeatInMap(seatId));
    });
  }, [centerSeatInMap]);

  // At >=900px (the `panel` breakpoint) the inspector docks and reserves layout
  // width, so a selected seat can never sit hidden under it — no pan needed
  // there, so this effect stays a no-op (guarded below). Below that width the
  // inspector overlays as a fixed bottom sheet (max-h 60vh, SeatInspector.tsx),
  // so pan the seat into the visible strip above it on selection change.
  //
  // No anchor is passed here: centerSeatInMap resolves the default itself
  // (matchMedia against the same panel breakpoint) so this effect and every
  // other seat-centering caller (queueCenterSeatInMap — used by results "Show
  // on map" and the guard-action "select-seat" branch) agree on the same
  // target for the same seat. That's what makes it safe for two of these
  // callers to race on the same selection: whichever `scrollTo` lands last
  // still lands on the identical anchor, so the race is harmless instead of
  // silently overriding one caller's intended anchor with another's.
  useEffect(() => {
    if (!selectedSeatId) return;
    if (window.matchMedia(`(min-width: ${SEAT_CENTER_PANEL_BREAKPOINT_PX}px)`).matches) return;
    const frame = requestAnimationFrame(() => {
      centerSeatInMap(selectedSeatId);
    });
    return () => cancelAnimationFrame(frame);
    // Pan on selection change only. centerSeatInMap is intentionally omitted:
    // it's a useCallback that closes over localSeats, so its identity churns
    // on unrelated seat edits — depending on it would re-run this effect (and
    // re-pan the viewport) mid-edit whenever localSeats changes, not just when
    // the selection changes. centerSeatInMap re-resolves the current seat by
    // id at fire time, so omitting it from deps doesn't risk staleness.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSeatId]);

  function seatPersonLabel(seat: SeatWithEmployee | null) {
    return seat?.employee?.full_name ?? "Open";
  }

  function buildSwapSummary(sourceSeat: SeatWithEmployee, targetSeat: SeatWithEmployee) {
    return `${sourceSeat.label} (${seatPersonLabel(sourceSeat)}) ↔ ${targetSeat.label} (${seatPersonLabel(targetSeat)})`;
  }

  function requestSwapTarget(targetSeatId: string) {
    if (!swapSourceSeatId) return false;
    const sourceSeat = localSeats.find(seat => seat.id === swapSourceSeatId) ?? null;
    const targetSeat = localSeats.find(seat => seat.id === targetSeatId) ?? null;

    if (!sourceSeat || !targetSeat) {
      setActionError("Could not find both seats for swapping.");
      return false;
    }

    if (sourceSeat.id === targetSeat.id) {
      setActionNotice("Choose a different target seat to complete the swap.", "neutral");
      return true;
    }

    if (!sourceSeat.employee_id && !targetSeat.employee_id) {
      setActionError("Swap requires at least one assigned seat.");
      return false;
    }

    setActionError(null);
    setActionNotice(null);
    setSwapConfirm({ sourceSeatId: sourceSeat.id, targetSeatId: targetSeat.id });
    return true;
  }

  function commitSeatSelection(seatId: string) {
    if (canEdit && swapSourceSeatId) {
      if (seatId !== swapSourceSeatId) {
        return requestSwapTarget(seatId);
      }
      setSelectedSeatId(seatId);
      setInspectorCollapsed(true);
      setActionNotice(null);
      return true;
    }

    if (selectedSeatId === seatId) {
      setMoveSeatMode(false);
      setAddSeatMode(false);
      setSwapSourceSeatId(null);
      setSwapConfirm(null);
      setInspectorCollapsed(false);
      return true;
    }

    setSelectedSeatId(seatId);
    setInspectorDirty(false);
    setMoveSeatMode(false);
    setAddSeatMode(false);
    setSwapSourceSeatId(null);
    setSwapConfirm(null);
    setInspectorCollapsed(false);
    return true;
  }

  function selectSeat(seatId: string) {
    if (selectedSeatId && selectedSeatId !== seatId && inspectorDirty) {
      return requestInspectorGuard({ kind: "select-seat", seatId });
    }

    return commitSeatSelection(seatId);
  }

  function openSeatFromResults(seatId: string, sourceLabel: string) {
    if (selectedSeatId && selectedSeatId !== seatId && inspectorDirty) {
      requestInspectorGuard({ kind: "select-seat", seatId, center: true, sourceLabel });
      return;
    }

    if (!selectSeat(seatId)) return;

    setFilterCollapsed(true);
    queueCenterSeatInMap(seatId);
  }

  function selectSeatResult(seatId: string) {
    openSeatFromResults(seatId, "seat results");
  }

  function startAddSeatMode() {
    setMapMenuOpen(false);
    if (selectedSeatId && inspectorDirty) {
      requestInspectorGuard({ kind: "start-add-seat" });
      return;
    }
    applyStartAddSeatAction();
  }

  function cancelAddSeatMode() {
    setMapMenuOpen(false);
    setAddSeatMode(false);
  }

  function beforeGuardedNavigation(href: GuardedNavigationHref, destination: string) {
    if (!inspectorDirty) return true;
    requestInspectorGuard({ kind: "navigate-admin-page", href, destination });
    return false;
  }

  function selectPlannerHighlightedSeat(seatId: string) {
    if (selectSeat(seatId)) {
      setAskPlannerOpen(false);
      setInspectorCollapsed(false);
    }
  }

  function explainSeatWithPlanner(seat: SeatWithEmployee) {
    if (!canEdit) return;

    setAskPlannerOpen(true);
    setAskPlannerQueuedRequest(current => ({
      id: (current?.id ?? 0) + 1,
      question: `Explain seat ${seat.label}`,
      seatId: seat.id
    }));
  }

  function startSwapSeatMode(skipDirtyCheck = false) {
    if (!canEdit) return;

    if (!selectedSeat) {
      setActionError("Select the source seat first, then choose Swap seat.");
      setActionNotice(null);
      return;
    }

    if (!skipDirtyCheck && inspectorDirty) {
      requestInspectorGuard({ kind: "start-swap-seat" });
      return;
    }

    applyStartSwapSeatAction();
  }

  function cancelSwapSeatMode() {
    setSwapSourceSeatId(null);
    setSwapConfirm(null);
    setInspectorCollapsed(false);
    setActionNotice("Swap canceled — no changes made.", "neutral");
  }

  function confirmSwapSeats() {
    if (!swapConfirm) return;
    const sourceSeat = localSeats.find(seat => seat.id === swapConfirm.sourceSeatId) ?? null;
    const targetSeat = localSeats.find(seat => seat.id === swapConfirm.targetSeatId) ?? null;

    if (!sourceSeat || !targetSeat) {
      setActionError("Could not find both seats for swapping.");
      setSwapConfirm(null);
      return;
    }

    const beforeSnapshot = captureDraftSnapshot();
    const swapLabel = `Swap ${sourceSeat.label} and ${targetSeat.label}`;

    startTransition(async () => {
      setMutationInFlight(true);
      try {
        setActionError(null);
        setActionNotice(null);
        setStaleDraftNotice(null);
        const result = await swapSeatAssignmentsAction({
          sourceSeatId: sourceSeat.id,
          targetSeatId: targetSeat.id,
          // Fence: reject the swap if either seat changed after this review
          // dialog rendered, so what commits is exactly what was confirmed.
          sourceExpectedUpdatedAt: sourceSeat.updated_at,
          targetExpectedUpdatedAt: targetSeat.updated_at
        });
        if (!result.ok) {
          handleStaleDraft(result.message);
          return;
        }
        const afterSeats = normalizeSeats(result.seats);
        recordDraftHistory(swapLabel, beforeSnapshot, afterSeats, result.employees);
        setLocalSeats(afterSeats);
        setLocalEmployees(result.employees);
        setSelectedSeatId(targetSeat.id);
        setInspectorDirty(false);
        setMoveSeatMode(false);
        setAddSeatMode(false);
        setSwapSourceSeatId(null);
        setSwapConfirm(null);
        setInspectorCollapsed(false);
        setActionNotice(`Swapped ${buildSwapSummary(sourceSeat, targetSeat)}.`);
      } catch (error) {
        setActionNotice(null);
        setActionError(error instanceof Error ? error.message : "Could not swap seats.");
      } finally {
        setMutationInFlight(false);
      }
    });
  }

  function handleMapPointerDown(event: PointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    const seatTarget = target.closest<HTMLElement>("[data-seat-id]");

    if (canEdit && addSeatMode) {
      const visualPoint = eventToPoint(event);
      if (!visualPoint) return;

      if (seatTarget?.dataset.seatId) return;

      const targetZoneResult = detectSeatZoneForPointResult(visualPoint, visualLocalSeats);
      if (targetZoneResult.status !== "detected") {
        setActionNotice(null);
        setActionError(getSeatZoneDetectionFailureMessage(targetZoneResult) ?? "Could not detect a zone for this location.");
        return;
      }
      const targetZone = targetZoneResult.zone;

      const beforeSnapshot = captureDraftSnapshot();

      startTransition(async () => {
        setMutationInFlight(true);
        try {
          const savedPoint = visualPointToSavedPoint(visualPoint, { zone: targetZone });
          setActionError(null);
          setActionNotice(null);
          const created = await createSeatAction({
            x: savedPoint.x,
            y: savedPoint.y,
            visualX: visualPoint.x,
            visualY: visualPoint.y
          });
          const afterSeats = replaceSeat(beforeSnapshot.seats, created);
          recordDraftHistory(`Add ${created.label}`, beforeSnapshot, afterSeats, beforeSnapshot.employees);
          setLocalSeats(afterSeats);
          setSelectedSeatId(created.id);
          setInspectorDirty(false);
          setAddSeatMode(false);
          setMoveSeatMode(false);
          setInspectorCollapsed(false);
          setActionNotice(`Added ${created.label} to ${created.zone ?? created.department ?? targetZone}.`);
        } catch (error) {
          setActionNotice(null);
          setActionError(error instanceof Error ? error.message : "Could not create seat.");
        } finally {
          setMutationInFlight(false);
        }
      });
      return;
    }

    if (seatTarget) return;

    // Detail mode presses may be the start of a drag-to-pan: the viewport's
    // pointer-end handler performs the canvas deselect only when the press
    // stayed within the drag threshold. Overview presses deselect immediately.
    if (mapViewMode === "detail") return;

    if (swapSourceSeatId) {
      setActionNotice(null);
      return;
    }

    if (!dragState) {
      if (selectedSeatId && inspectorDirty) {
        requestInspectorGuard({ kind: "clear-selection" });
        return;
      }
      setSelectedSeatId(null);
      setInspectorDirty(false);
      setMoveSeatMode(false);
    }
  }

  function handleMovePointerDown(event: PointerEvent<HTMLButtonElement>, seatId: string) {
    if (!canEdit || !moveSeatMode || selectedSeatId !== seatId) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragState({ seatId, pointerId: event.pointerId, beforeSnapshot: captureDraftSnapshot() });
  }

  function handleMapPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!dragState) return;
    const visualPoint = eventToPoint(event);
    if (!visualPoint) return;

    setLocalSeats(current => current.map(seat => {
      if (seat.id !== dragState.seatId) return seat;
      const savedPoint = visualPointToSavedPoint(visualPoint, { source: seat });
      return { ...seat, x: savedPoint.x, y: savedPoint.y };
    }));
  }

  function handleMapPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!dragState) return;
    const visualPoint = eventToPoint(event);
    const seatId = dragState.seatId;
    const beforeSnapshot = dragState.beforeSnapshot;
    setDragState(null);
    setMoveSeatMode(false);
    if (!visualPoint) {
      applyRestoredDraftPayload(beforeSnapshot);
      return;
    }

    const movedSeat = localSeats.find(seat => seat.id === seatId);
    const savedPoint = movedSeat
      ? visualPointToSavedPoint(visualPoint, { source: movedSeat })
      : visualPointToSavedPoint(visualPoint);

    startTransition(async () => {
      setMutationInFlight(true);
      try {
        setActionError(null);
        setActionNotice(null);
        const updated = await moveSeatAction({ seatId, x: savedPoint.x, y: savedPoint.y });
        const afterSeats = replaceSeat(beforeSnapshot.seats, updated);
        recordDraftHistory(`Move ${updated.label}`, beforeSnapshot, afterSeats, beforeSnapshot.employees);
        setLocalSeats(afterSeats);
        setActionNotice(`Moved ${updated.label}.`);
      } catch (error) {
        applyRestoredDraftPayload(beforeSnapshot);
        setActionNotice(null);
        setActionError(error instanceof Error ? error.message : "Could not move seat.");
      } finally {
        setMutationInFlight(false);
      }
    });
  }

  // Targeted escape hatch for a mis-dragged marker: put the seat back exactly
  // where it sits on the published map. Same commit path as a drag-move, so
  // it records a normal history entry and is itself undoable.
  function resetSeatPositionToPublished() {
    if (!selectedSeat || !selectedSeatPublishedPosition) return;
    if (inspectorDirty) {
      setActionNotice(null);
      setActionError("Save or discard the selected seat edits before resetting its position.");
      return;
    }

    const seatId = selectedSeat.id;
    const seatLabel = selectedSeat.label;
    const target = selectedSeatPublishedPosition;
    const beforeSnapshot = captureDraftSnapshot();

    startTransition(async () => {
      setMutationInFlight(true);
      try {
        setActionError(null);
        setActionNotice(null);
        const updated = await moveSeatAction({ seatId, x: target.x, y: target.y });
        const afterSeats = replaceSeat(beforeSnapshot.seats, updated);
        recordDraftHistory(`Move ${updated.label}`, beforeSnapshot, afterSeats, beforeSnapshot.employees);
        setLocalSeats(afterSeats);
        setActionNotice(`Reset ${seatLabel} to its published position.`);
      } catch (error) {
        setActionNotice(null);
        setActionError(error instanceof Error ? error.message : "Could not reset the seat position.");
      } finally {
        setMutationInFlight(false);
      }
    });
  }

  function deleteSelectedSeat() {
    if (!selectedSeat) {
      setActionError(getSeatDeleteBlockReason(selectedSeat));
      return;
    }

    if (inspectorDirty) {
      setActionNotice(null);
      setActionError("Save or discard the selected seat edits before deleting a custom seat.");
      return;
    }

    const deleteBlockReason = getSeatDeleteBlockReason(selectedSeat);
    if (!canDeleteSeat(selectedSeat)) {
      setActionError(deleteBlockReason ?? "Select a custom seat first.");
      return;
    }

    setActionNotice(null);
    setActionError(null);
    setDeleteSeatConfirm({ seatId: selectedSeat.id, label: selectedSeat.label });
  }

  function confirmDeleteSelectedSeat() {
    if (!deleteSeatConfirm) return;

    const seatToDelete = localSeats.find(seat => seat.id === deleteSeatConfirm.seatId) ?? null;
    const deleteBlockReason = getSeatDeleteBlockReason(seatToDelete);
    if (!seatToDelete || !canDeleteSeat(seatToDelete)) {
      setDeleteSeatConfirm(null);
      setActionError(deleteBlockReason ?? "Select a custom seat first.");
      return;
    }

    if (inspectorDirty) {
      setDeleteSeatConfirm(null);
      setActionNotice(null);
      setActionError("Save or discard the selected seat edits before deleting a custom seat.");
      return;
    }

    const beforeSnapshot = captureDraftSnapshot();
    const deletedSeatLabel = seatToDelete.label;
    setDeleteSeatConfirm(null);

    startTransition(async () => {
      setMutationInFlight(true);
      try {
        setActionError(null);
        setActionNotice(null);
        const result = await deleteSeatAction(seatToDelete.id);
        const afterSeats = beforeSnapshot.seats.filter(seat => seat.id !== result.seatId);
        recordDraftHistory(`Delete ${deletedSeatLabel}`, beforeSnapshot, afterSeats, beforeSnapshot.employees);
        setLocalSeats(afterSeats);
        setSelectedSeatId(null);
        setInspectorDirty(false);
        setMoveSeatMode(false);
        setSwapSourceSeatId(null);
        setSwapConfirm(null);
        setActionNotice(`Deleted custom seat ${deletedSeatLabel}. Undo is available until publish.`);
      } catch (error) {
        setActionNotice(null);
        setActionError(error instanceof Error ? error.message : "Could not delete custom seat.");
      } finally {
        setMutationInFlight(false);
      }
    });
  }

  function openPublishReview() {
    if (inspectorDirty) {
      setActionNotice(null);
      setActionError("Publish review blocked: Save or discard the selected seat edits before publishing. The publish review only includes saved draft changes.");
      return;
    }

    setActionError(null);
    setActionNotice(null);
    setPublishReviewOpen(true);
  }

  function confirmPublishDraftMap() {
    const nextPublishedSeats = normalizeSeats(localSeats);
    // Publish also replaces the viewer's employee snapshot with the active
    // live directory; mirror that locally so the summary reads "in sync".
    const nextPublishedEmployees = localEmployees.filter(employee => employee.active);
    setActionError(null);
    setActionNotice(null);
    startTransition(async () => {
      setMutationInFlight(true);
      try {
        await publishSeatMapAction();
        setLocalPublishedSeats(nextPublishedSeats);
        setLocalPublishedEmployees(nextPublishedEmployees);
        setDraftHistory(clearDraftHistory());
        setPublishReviewOpen(false);
        setActionNotice("Draft map published. Undo/Redo history was cleared.");
      } catch (error) {
        setActionNotice(null);
        setActionError(error instanceof Error ? error.message : "Could not publish seat map.");
      } finally {
        setMutationInFlight(false);
      }
    });
  }

  const searchStatusTitle = searchActive ? `Searching “${searchQuery}”` : "Filtered results";
  const searchStatusSummary = `${matchingSeats.length} ${matchingSeats.length === 1 ? "match" : "matches"} · ${resultStatusBreakdown.assigned} assigned · ${resultStatusBreakdown.available} open`;
  const resultEmptyTitle = searchActive && structuredFiltersActive
    ? "No combined results"
    : searchActive
      ? "No search results"
      : "No filter results";
  const resultEmptyDescription = searchActive && structuredFiltersActive
    ? "No seats match this search with the selected filters. Clear the search, clear filters, or clear all to broaden the result set."
    : searchActive
      ? "No seats match this search. Clear search or try a different employee, seat, department, status, or zone."
      : "No seats match these filters. Clear filters or choose a broader department, zone, or status.";
  const selectedSeatMismatchNotice = selectedSeat && filtersActive && !selectedSeatMatchesFilters
    ? searchActive
      ? "This selected seat does not match the current search."
      : "This selected seat does not match the current filters."
    : null;
  const clearSearchContextLabel = searchActive ? "Clear search" : "Clear filters";
  const undoTitle = mutationInFlight
    ? "Wait for the current map change to finish"
    : inspectorDirty
      ? "Save or cancel inspector edits before undoing"
      : undoAvailable
        ? lastUndoLabel
          ? `Undo ${lastUndoLabel}`
          : "Undo last map change"
        : "No map changes to undo";
  const redoTitle = mutationInFlight
    ? "Wait for the current map change to finish"
    : inspectorDirty
      ? "Save or cancel inspector edits before redoing"
      : redoAvailable
        ? nextRedoLabel
          ? `Redo ${nextRedoLabel}`
          : "Redo last undone change"
        : "No undone map changes to redo";
  const draftChangeBreakdown = [
    publishSummary.addedSeats.length ? `${publishSummary.addedSeats.length} added` : null,
    publishSummary.updatedSeatCount ? `${publishSummary.updatedSeatCount} updated` : null,
    publishSummary.removedSeats.length ? `${publishSummary.removedSeats.length} removed` : null
  ].filter(Boolean).join(", ");
  // 3b fact ownership: draft-sync has ONE owner — the chrome chip (sole draft
  // display and the publish-review entry point).
  const draftStatusLabel = publishSummary.hasChanges
    ? `${publishSummary.totalChangeCount} unpublished ${publishSummary.totalChangeCount === 1 ? "change" : "changes"}`
    : "Draft matches published";
  const draftStatusTitle = publishSummary.hasChanges
    ? `Review draft changes: ${draftChangeBreakdown || `${publishSummary.totalChangeCount} total`}`
    : "Draft and published maps currently match";
  const publishPeopleChangeCount = publishSummary.assignmentChanges.length + publishSummary.vacatedSeats.length + publishSummary.employeeDetailChanges.length;
  const publishSeatInventoryChangeCount = publishSummary.addedSeats.length + publishSummary.removedSeats.length;
  const publishLayoutChangeCount = publishSummary.seatMoves.length;
  const publishMetadataChangeCount = publishSummary.statusChanges.length + publishSummary.otherChanges.length;
  const publishReadinessTitle = publishSummary.hasChanges ? "Ready to publish reviewed changes" : "Draft and viewer map are in sync";
  const publishReadinessDescription = publishSummary.hasChanges
    ? "This review includes saved draft changes only. Unsaved inspector edits must be saved or discarded before this review opens."
    : "No saved draft changes are waiting. The viewer map already matches this draft.";
  const publishReadinessBadgeTone = publishSummary.hasChanges ? "draft" : "published";
  const publishReadinessBadgeLabel = publishSummary.hasChanges ? "Ready" : "No changes";
  const activeMode = addSeatMode
    ? {
      label: "Add seat",
      message: "Click inside a seating zone to place an automatically numbered custom marker.",
      exitLabel: "Exit add seat",
      onExit: cancelAddSeatMode
    }
    : moveSeatMode
      ? {
        label: "Move seat",
        message: selectedSeat ? `Drag ${selectedSeat.label} to reposition it on the draft map.` : "Select a seat before moving it.",
        exitLabel: "Exit move seat",
        onExit: () => {
          setMoveSeatMode(false);
          setDragState(null);
        }
      }
      : swapSourceSeat
        ? {
          label: "Swap seats",
          message: `${swapSourceSeat.label} is the source. Select a target seat to review the swap.`,
          exitLabel: "Exit swap seats",
          onExit: cancelSwapSeatMode
        }
        : null;
  // 3b OVERLAY + INV-6: Filters floats over the full-bleed canvas at lg — the
  // canvas never reflows when the drawer opens.
  const desktopMapGridClass = "lg:grid-cols-[minmax(0,1fr)]";
  const showFilterPanel = !filterCollapsed;
  // Panel slot (right): floating panels over a full-bleed map (owner preference — no
  // reserved gutter, no idle Map key rail; the legend lives in the bottom status bar).
  // One occupant expanded at a time: DETAIL (inspector) when a seat is selected and
  // expanded, RESULTS when search/filters are active while the inspector is closed or
  // auto-collapsed to its pill. Tiers: bottom sheet ≤899, floating panel ≥900.
  const resultsPanelOpen = canEdit && filtersActive && (!selectedSeat || inspectorCollapsed);
  // 3b MODE CARD: while a mode runs without an expanded inspector, the mode
  // owns the panel slot (its microcopy lives in the occupant, INV-4). Move mode
  // keeps the inspector as the occupant — the drag hint renders inside it.
  const modeCardOpen = canEdit && Boolean(activeMode) && (!selectedSeat || inspectorCollapsed);
  // Prototype "stage": at the panel tier the inspector RESERVES layout width
  // instead of overlaying the canvas — expanded takes the 320px column, the
  // collapsed rail takes 44px, and the content wrapper pads right to match.
  // Mirrors SeatInspector's own render rules (rail hidden while another panel
  // owns the slot) so the reservation never outlives the panel.
  const inspectorPillSuppressed = resultsPanelOpen || modeCardOpen || askPlannerOpen;
  const inspectorDockTier: "expanded" | "rail" | "none" = selectedSeat
    ? !inspectorCollapsed
      ? "expanded"
      : swapSourceSeatId || inspectorPillSuppressed
        ? "none"
        : "rail"
    : "none";
  // Whatever occupies the right slot reserves the column — expanded inspector,
  // results panel, or mode card — so nothing renders hidden behind a panel.
  const rightSlotTier: "expanded" | "rail" | "none" =
    inspectorDockTier === "expanded" || resultsPanelOpen || modeCardOpen ? "expanded" : inspectorDockTier;
  const stageReservedClassName = rightSlotTier === "expanded"
    ? "panel:pr-[332px]"
    : rightSlotTier === "rail"
      ? "panel:pr-[56px]"
      : "";
  // No mode/zoom change on select or deselect: in the fit view the reserved
  // column resizes the viewport and the overview ResizeObserver re-fits the
  // frame width automatically; a zoomed (detail) view keeps its zoom.

  // Floating panels intentionally overlay the canvas, so banners need no safe area.
  const canvasBannerSafeAreaClassName = "";
  const mobileMapInteractionSurfaceOpen = canEdit && (
    Boolean(selectedSeat && !inspectorCollapsed) ||
    showFilterPanel ||
    askPlannerOpen ||
    publishReviewOpen ||
    Boolean(deleteSeatConfirm) ||
    Boolean(inspectorGuardAction) ||
    Boolean(swapConfirm)
  );
  const mobileMapControlsHidden = mobileMapInteractionSurfaceOpen;
  const mapViewportClassName = [
    // Mounted-sheet treatment (2026-07-16 regrade, review 3): the hairline +
    // elevation make the beige stage read as a drawing mounted on the desk,
    // so the gray/beige/plan-edge seams become designed edges.
    "relative mx-auto w-full max-w-full overscroll-contain border border-[var(--admin-border)] bg-[var(--sp-color-canvas)] shadow-elevation-2 lg:h-full lg:min-h-0 lg:flex-1 lg:max-h-none",
    mapViewMode === "overview"
      ? "min-h-[300px] max-h-[82svh] overflow-auto p-1.5 sm:max-h-none sm:min-h-[480px] sm:overflow-hidden sm:p-2 lg:flex lg:min-h-0 lg:items-center lg:justify-center"
      // The sm cap budgets the FULL stacked chrome above/below the map (top
      // bar + search row + canvas header + status footer + gaps ≈ 300px,
      // measured live at 876px), so the page itself doesn't grow a second
      // scrollbar next to the pan viewport — below lg the map viewport is the
      // one vertical scroll owner (#197). On short windows the min-h floor
      // wins and the page scrolls a little; that beats an unusably short map.
      : "min-h-[360px] max-h-[82svh] overflow-auto sm:min-h-[420px] sm:max-h-[calc(100svh-300px)] lg:min-h-0 lg:max-h-none lg:[-ms-overflow-style:none] lg:[scrollbar-width:none] lg:[&::-webkit-scrollbar]:hidden",
    mapViewMode === "detail" && floor === "3" && !addSeatMode ? (panning ? "cursor-grabbing" : "cursor-grab") : "",
    canEdit ? "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus-ring-color)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--sp-color-canvas)]" : ""
  ].join(" ");
  const mapFrameClassName = [
    "relative mx-auto max-w-none",
    mapViewMode === "overview"
      ? "w-[1120px] max-w-none sm:w-full sm:max-w-[1911px]"
      : "[--map-detail-base:1120px] sm:[--map-detail-base:1460px] lg:[--map-detail-base:1911px]",
    addSeatMode ? "cursor-crosshair" : ""
  ].join(" ");
  // Zoom scales the rendered width only — a pure view transform (§9).
  const mapFrameStyle = mapViewMode === "overview"
    ? (overviewMapWidth ? { width: `${overviewMapWidth}px` } : undefined)
    : { width: `calc(var(--map-detail-base) * ${zoomFactor})` };
  const mapZoomLabel = mapViewMode === "overview" ? "Fit" : `${Math.round(zoomFactor * 100)}%`;
  // Overview (fit) hugs the floor plan's aspect ratio at lg instead of
  // stretching to fill leftover column height — same fix as the viewer's
  // 2026-07-16 letterbox change (PR #144); 1911/867 mirrors MAP_IMAGE_*
  // (Tailwind arbitrary values must be static). flex-shrink + lg:min-h-0 keep
  // the height-bound contain behavior, and the aspect height derives from the
  // stage WIDTH only, so the overview ResizeObserver's inputs stay rigid (no
  // fit-calc feedback — the trap the outer column's lg:flex-1 comment warns
  // about). Detail zoom keeps flex-1: panning wants the full column.
  const mapStageClassName = [
    "relative min-w-0 lg:flex lg:min-h-0",
    mapViewMode === "overview" ? "lg:aspect-[1911/867]" : "lg:flex-1"
  ].join(" ");
  const mapCrumbLabel = floor === "2" ? "Not yet mapped" : `Draft map · ${stats.total} ${stats.total === 1 ? "seat" : "seats"}`;
  const mapMarkerLayerClassName = [
    "absolute inset-0",
    mobileMapControlsHidden ? "hidden sm:block" : ""
  ].filter(Boolean).join(" ");
  const actionErrorBannerClassName = [
    "min-w-0 whitespace-pre-wrap break-words rounded-xl border border-[var(--admin-state-error-border)] bg-[var(--admin-state-error-bg)] px-3 py-2 text-sm font-semibold text-[var(--admin-state-error-text)]",
    canvasBannerSafeAreaClassName
  ].filter(Boolean).join(" ");
  const actionNoticeBannerClassName = [
    // Overlay, not layout: the toast floats above the floor-selector row so
    // its 6s lifetime never shifts the map column height mid-session.
    "absolute left-0.5 right-0.5 top-0.5 z-40 shadow-elevation-3",
    "flex min-w-0 flex-col gap-2 rounded-xl border px-3 py-2 text-sm font-semibold sm:flex-row sm:items-center sm:justify-between",
    actionNoticeTone === "neutral"
      ? "border-[var(--admin-border-strong)] bg-[var(--admin-surface)] text-[var(--admin-text-secondary)]"
      : "border-[var(--admin-state-saved-border)] bg-[var(--admin-state-saved-bg)] text-[var(--admin-state-saved-text)]",
    canvasBannerSafeAreaClassName
  ].filter(Boolean).join(" ");
  const resultActionButtonClassName = "inline-flex min-h-8 items-center justify-center rounded-lg border border-[var(--admin-border-strong)] bg-[var(--admin-surface)] px-3 py-1.5 text-[11px] font-semibold text-[var(--admin-text-secondary)] transition hover:border-[var(--admin-primary-border)] hover:bg-[var(--admin-primary-soft)] hover:text-[var(--admin-primary-on-soft)] active:scale-[0.97] active:duration-75 active:shadow-inner focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus-ring-color)] disabled:cursor-not-allowed disabled:opacity-50";
  const resultClearButtonClassName = "inline-flex min-h-8 items-center justify-center rounded-lg border border-[var(--admin-primary-border)] bg-[var(--admin-primary-soft)] px-3 py-1.5 text-[11px] font-semibold text-[var(--admin-primary-on-soft)] transition hover:border-[var(--admin-primary)] hover:bg-[rgba(242,110,34,0.16)] active:scale-[0.97] active:duration-75 active:shadow-inner focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus-ring-color)]";
  const visibleMapSpan = Math.max(0, mapVisibleRange.right - mapVisibleRange.left);
  const mapPixelsPerNormalizedUnit = visibleMapSpan > 0 && mapVisibleRange.viewportWidth > 0
    ? mapVisibleRange.viewportWidth / visibleMapSpan
    : 0;
  // Zoom-aware pill crowding (render-layer only): code pills keep ONE uniform
  // size at every zoom; pods whose pitch is tighter than that footprint
  // separate via alternating vertical token nudges and recover the anchor row
  // once zoom separates them. The nudge graph and the name-label nudges share
  // the same zoom-aware clearance. The O(n²) geometry passes are memoized so
  // pointer-move-driven re-renders (drag/pan/hover) don't rerun them: with
  // Show names off (the hot-path default) every dep below is
  // identity-stable, so the whole pipeline is cached.
  const seatDensityClearance = useMemo(
    () => clearanceFromScale(
      mapPixelsPerNormalizedUnit,
      mapPixelsPerNormalizedUnit * (MAP_IMAGE_HEIGHT / MAP_IMAGE_WIDTH)
    ),
    [mapPixelsPerNormalizedUnit]
  );
  // Shared with the marker render loop below (dimmed={dimmedSeatIdSet.has(...)}).
  const dimmedSeatIdSet = new Set(localSeats.filter(isSeatDimmed).map(seat => seat.id));
  // Named set for name-label collision nudging (lib/seatCrowding
  // computeNameLabelNudges): exactly the seats that can actually render a
  // nudged name label. SeatMarker's namesVisible gate is showNames &&
  // hasEmployee && !dimmed, and dimmedSeatIdSet above is the same predicate
  // the render loop feeds SeatMarker, so the dimmed exclusion mirrors it
  // precisely. But SeatMarker's nameNudgeApplicable
  // (tokenMode === "name" || (tokenMode === "prominent" && !activeMarker))
  // additionally never nudges a selected/dragging/swap-source/swap-target
  // seat — those render tokenMode "selected" or active "prominent" and stay
  // pinned to their anchor. Any seat in that set must also be excluded here
  // (not just "their nudge goes unused"): inside a 4-way mutual clique the
  // least-used fallback can otherwise hand two genuinely visible labels the
  // same nudge to dodge a label that is never actually nudged.
  const swapTargetSeatId = swapConfirm?.targetSeatId;
  const dragSeatId = dragState?.seatId;
  const namedSeatIdSet = useMemo(() => {
    // The Show-names-off branch returns a module-stable empty set, so the
    // nudge memos below stay cached through pointer-driven re-renders even
    // though dimmedSeatIdSet is rebuilt per render.
    if (!showNames) return EMPTY_SEAT_ID_SET;
    return new Set(
      visualLocalSeats
        .filter(seat =>
          seat.employee &&
          !dimmedSeatIdSet.has(seat.id) &&
          seat.id !== selectedSeatId &&
          seat.id !== swapSourceSeatId &&
          seat.id !== swapTargetSeatId &&
          dragSeatId !== seat.id
        )
        .map(seat => seat.id)
    );
  }, [dimmedSeatIdSet, dragSeatId, selectedSeatId, showNames, swapSourceSeatId, swapTargetSeatId, visualLocalSeats]);
  const nameLabelNudges = useMemo(
    () => computeNameLabelNudges(visualLocalSeats, namedSeatIdSet, seatDensityClearance),
    [namedSeatIdSet, seatDensityClearance, visualLocalSeats]
  );
  // Code-pill nudges are computed AFTER the name nudges so the code graph
  // can dodge the rows the name pills actually occupy (named seats render
  // name tokens, not code pills).
  const codePillNudges = useMemo(
    () => computeCodePillNudges(visualLocalSeats, seatDensityClearance, { nameNudges: nameLabelNudges, namedSeatIds: namedSeatIdSet }),
    [nameLabelNudges, namedSeatIdSet, seatDensityClearance, visualLocalSeats]
  );
  const markerEdgeBaseOffsetPx = 0;
  const markerEdgeMaxOffsetPx = 144;
  const markerEdgeThreshold = mapViewMode === "detail"
    ? Math.min(0.16, Math.max(0.06, visibleMapSpan * 0.24))
    : 0;
  const markerOutsideEdgeThreshold = mapViewMode === "detail"
    ? Math.min(0.08, Math.max(0.035, visibleMapSpan * 0.12))
    : 0;

  function getMarkerViewportPlacement(x: number): { edge: "left" | "right" | "none"; offsetPx: number } {
    if (mapViewMode !== "detail") return { edge: "none", offsetPx: 0 };

    const resolveOffset = (distancePastVisibleRange: number) => {
      if (distancePastVisibleRange <= 0 || mapPixelsPerNormalizedUnit <= 0) return markerEdgeBaseOffsetPx;
      return Math.min(markerEdgeMaxOffsetPx, Math.round(markerEdgeBaseOffsetPx + (distancePastVisibleRange * mapPixelsPerNormalizedUnit)));
    };

    if (x < mapVisibleRange.left) {
      const distancePastVisibleRange = mapVisibleRange.left - x;
      return distancePastVisibleRange <= markerOutsideEdgeThreshold
        ? { edge: "left", offsetPx: resolveOffset(distancePastVisibleRange) }
        : { edge: "none", offsetPx: 0 };
    }
    if (x - mapVisibleRange.left <= markerEdgeThreshold) return { edge: "left", offsetPx: markerEdgeBaseOffsetPx };
    if (x > mapVisibleRange.right) {
      const distancePastVisibleRange = x - mapVisibleRange.right;
      return distancePastVisibleRange <= markerOutsideEdgeThreshold
        ? { edge: "right", offsetPx: resolveOffset(distancePastVisibleRange) }
        : { edge: "none", offsetPx: 0 };
    }
    if (mapVisibleRange.right - x <= markerEdgeThreshold) return { edge: "right", offsetPx: markerEdgeBaseOffsetPx };
    return { edge: "none", offsetPx: 0 };
  }

  // Shell top bar: full-height quiet tools on the 48px dark bar. Active state
  // is the Carbon-style 2px brand-orange underline (5.37:1 on #161616).
  // The bar grew 40 -> 48px on 2026-07-22 so the fields could take Carbon `md`
  // (40px) and still keep 4px of clearance; every full-height item here tracks
  // the bar, or the underline stops landing on its bottom edge.
  const chromeToolbarBtn = "inline-flex h-10 shrink-0 items-center gap-1.5 border-b-2 border-transparent px-2.5 text-[12.5px] font-medium leading-none text-[var(--admin-chrome-muted)] transition-colors duration-150 hover:bg-[var(--admin-chrome-hover)] hover:text-[var(--admin-chrome-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-primary)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[var(--admin-chrome-muted)]";
  const chromeToolbarBtnActive = "inline-flex h-10 shrink-0 items-center gap-1.5 border-b-2 border-[var(--admin-primary)] bg-[var(--admin-chrome-hover)] px-2.5 text-[12.5px] font-medium leading-none text-[var(--admin-chrome-text)] transition-colors duration-150 hover:bg-[var(--admin-chrome-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-primary)]";
  const chromeSurfaceShortcut = "flex h-10 w-12 shrink-0 flex-col items-center justify-center gap-0.5 border-b-2 text-[10px] font-medium tracking-[0.02em] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-primary)]";
  // Two collapse tiers keep the flexible search group usable at every width
  // (the row is otherwise rigid, so search absorbs the whole deficit):
  // page links (Management, Settings) fold into the "More" menu below xl,
  // Ask Planner below lg. At xl and up nothing is collapsed, so the row reads
  // exactly like the prototype — no overflow button in sight. Show names is
  // not here at all: it is a map display option and lives in "More map
  // actions" (2026-07-22). No horizontal scroll: a scroll container would clip
  // the menu's absolute dropdown.
  const chromeToolbarBtnCollapsible = chromeToolbarBtn.replace("inline-flex", "hidden lg:inline-flex");
  const chromeToolbarBtnCollapsibleActive = chromeToolbarBtnActive.replace("inline-flex", "hidden lg:inline-flex");
  const chromeToolbarBtnCollapsibleXl = chromeToolbarBtn.replace("inline-flex", "hidden xl:inline-flex");
  const chromeMenuItem = "flex w-full items-center gap-1.5 px-3 py-2 text-left text-[12px] font-medium text-[var(--admin-chrome-text)] transition hover:bg-[var(--admin-chrome-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-primary)]";

  return (
    /* overflow-x-CLIP, not -hidden: hidden makes this div a scroll container,
       which captures the sticky header so it never pins to the viewport. */
    <div className="flex min-h-screen flex-col overflow-x-clip bg-[var(--admin-bg)] text-[var(--admin-text-primary)] lg:h-screen lg:min-h-0 lg:overflow-hidden">
      <a
        href="#planning-canvas"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[60] focus:border focus:border-[var(--admin-primary)] focus:bg-[var(--admin-chrome-bg)] focus:px-3 focus:py-2 focus:text-[12.5px] focus:font-semibold focus:text-[var(--admin-chrome-text)] focus:outline-none"
      >
        Skip to seat map
      </a>
      {/* z-50, not z-40: once sticky, the header's z-index is live and must
          outrank the z-40 canvas overlays (toasts, map menu) that follow it
          in DOM order, or they paint over the pinned bar and its menus. */}
      <header className="sticky top-0 z-50 flex h-10 shrink-0 items-center border-b border-[var(--admin-chrome-border)] bg-[var(--admin-chrome-bg)] pl-3 text-[var(--admin-chrome-text)]">
        <h1 className="sr-only">Seat Planner — admin map</h1>
        <div className="flex min-w-0 shrink-0 items-center gap-2">
          <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center">
            {/* Brand monogram straight on the dark bar — the 2026 mark carries its own contrast. */}
            <Image src="/images/megeredchian-mark.png?v=ma-2026" alt="" width={24} height={24} unoptimized className="h-6 w-6 object-contain" />
          </span>
          {/* leading-[18px], not leading-none: truncate's overflow-hidden clips descenders (the g) at line-height 1. */}
          <div aria-hidden="true" translate="no" className="hidden min-w-0 truncate text-[12.5px] font-semibold leading-[18px] sm:block">
            Megeredchian Law <span className="font-normal text-[var(--admin-chrome-muted)]">· Seat Planner</span>
          </div>
        </div>

        {/* Divider tracks the bar (was 22px in a 40px bar — same 0.55 ratio). */}
        <span aria-hidden="true" className="mx-2.5 hidden h-[26px] w-px shrink-0 bg-[var(--admin-chrome-border)] lg:block" />

        {/* Filter and Search are two DISTINCT controls, no longer one shared
            box. Sharing a 26px border made search — a paramount job — read as a
            cramped sibling of the filter and forced both to share a 340px cap.
            The filter keeps its dropdown anchored to itself (immediately LEFT
            of search, per the locked pairing); search gets its own field below.
            Both are Carbon `md` = 40px (owner, 2026-07-22), which is why the bar
            itself grew to 48px — a 40px field in a 40px bar would sit flush
            against both edges. 4px of clearance top and bottom, as before. */}
        <div data-filter-ui className="relative mr-1.5 flex h-10 shrink-0 items-stretch border border-[var(--admin-chrome-border)] bg-[var(--admin-chrome-field)] lg:mr-2">
          {canEdit && (
            <button
              ref={filterTriggerRef}
              type="button"
              data-filter-ui
              onClick={toggleFilterPanel}
              aria-controls="seat-map-filter-panel"
              aria-expanded={!filterCollapsed}
              aria-haspopup="true"
              aria-label={filterCollapsed ? "Open filters" : "Collapse filters"}
              className={[
                "flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 text-[12px] font-medium leading-none transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-primary)]",
                structuredFilterCount > 0 || !filterCollapsed
                  ? "border-b-[var(--admin-primary)] bg-[var(--admin-chrome-hover)] text-[var(--admin-chrome-text)]"
                  : "border-b-transparent text-[var(--admin-chrome-muted)] hover:bg-[var(--admin-chrome-hover)] hover:text-[var(--admin-chrome-text)]"
              ].join(" ")}
            >
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5">
                <path d="M3 4.5h14l-5.4 6.2v4.8l-3.2-1.7v-3.1L3 4.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              </svg>
              Filter
              {structuredFilterCount > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--admin-primary-cta)] px-1 text-[11px] font-semibold text-white">{structuredFilterCount}</span>
              )}
              <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3 w-3 text-[var(--admin-chrome-muted)]">
                <path d="m5.5 8 4.5 4.5L14.5 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          {/* DOM order mirrors the visual order: the menu drops directly under
              the trigger, so it must precede the search field in tab order. */}
          {showFilterPanel && (
            <div data-filter-ui className="absolute -left-px top-[calc(100%+4px)] z-50 w-[288px] max-w-[calc(100vw-16px)]">
              <FilterPanel
                department={department}
                position={position}
                status={status}
                departments={departments}
                positions={positions}
                zone={zone}
                zones={zones}
                activeChips={activeFilterChips}
                returnFocusRef={filterTriggerRef}
                onClose={() => setFilterCollapsed(true)}
                onDepartmentChange={setDepartment}
                onPositionChange={setPosition}
                onZoneChange={setZone}
                onStatusChange={setStatus}
                matchSummary={`${legendSourceSeats.length} of ${localSeats.length} seats match`}
                onRemoveActiveChip={removeActiveFilterChip}
                onClearFilters={clearStructuredFilters}
              />
            </div>
          )}
        </div>

        {/* Search owns its own field, sized MEDIUM: the cap rises 340 -> 420px
            on lg — the bottom of the refinement brief's 420-560 range, so it
            still clears the old cramped shared box without dominating the bar
            the way 480 did. */}
        <div role="search" aria-label="Command search" className="hidden h-8 min-w-0 flex-1 border border-[var(--admin-chrome-border)] bg-[var(--admin-chrome-field)] lg:block lg:max-w-[420px]">
          <label className="relative flex h-full w-full min-w-0 items-center">
            <span className="sr-only">Search employee, seat, job title, department, or zone</span>
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--admin-chrome-muted)]">
              <circle cx="9" cy="9" r="5.25" stroke="currentColor" strokeWidth="1.7" />
              <path d="m13.4 13.4 3.1 3.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
            <input
              ref={chromeSearchInputRef}
              value={search}
              onChange={event => handleSearchInputChange(event.target.value)}
              onKeyDown={event => {
                if (event.key === "Escape" && search.trim()) {
                  event.stopPropagation();
                  clearSearch();
                  return;
                }
                // Results are visually adjacent but far away in DOM order —
                // ArrowDown hops focus straight into the results panel.
                if (event.key === "ArrowDown" && resultsPanelOpen) {
                  event.preventDefault();
                  document.querySelector<HTMLButtonElement>('[aria-label="Admin search results"] button')?.focus();
                }
              }}
              type="search" name="seat-search" autoComplete="off" spellCheck={false} placeholder={SEAT_SEARCH_PLACEHOLDER}
              className="h-full w-full border-0 bg-transparent pl-8 pr-14 text-[12px] font-medium text-ellipsis text-[var(--admin-chrome-text)] outline-none placeholder:text-ellipsis transition placeholder:text-[var(--admin-chrome-muted)] hover:bg-white/[0.06] focus:bg-white/[0.04] focus:ring-2 focus:ring-inset focus:ring-[var(--admin-primary)]"
            />
            {search.trim() ? (
              <button
                type="button"
                aria-label="Clear search"
                title="Clear search"
                className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center text-[var(--admin-chrome-muted)] transition hover:bg-[var(--admin-chrome-hover)] hover:text-[var(--admin-chrome-text)] active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-primary)]"
                onClick={clearSearch}
              >
                <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3 w-3"><path d="m6 6 8 8m0-8-8 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            ) : searchShortcutHint ? (
              <kbd aria-hidden="true" className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 border border-[var(--admin-chrome-border)] px-1 py-0.5 text-[10px] font-semibold text-[var(--admin-chrome-muted)] sm:block">{searchShortcutHint}</kbd>
            ) : null}
          </label>
        </div>

        {canEdit && (
          /* No overflow-x scroll hack here: tools that don't fit below lg collapse
             into the "More" menu instead, and a scroll container would clip the
             menu's absolutely-positioned dropdown. */
          <nav role="group" aria-label="Admin command row" className="ml-1 flex min-w-0 flex-1 items-center lg:ml-0 lg:flex-none">
            {/* One flat tool row, per the prototype (docs/ui/seat-planner-shell.html
                lines 144-147): no bordered segment group, every tool at the same
                weight. Undo/redo are icon-only by owner direction — ↺/↻ are
                universally read, and the accessible name plus the keyboard-
                shortcut explanation still ride on aria-label + title, which is
                what assistive tech and hover actually consume. */}
            <button
              type="button"
              onClick={undoDraftEdit}
              disabled={mutationInFlight || inspectorDirty || !undoAvailable}
              aria-label="Undo last map change"
              title={undoTitle}
              className={chromeToolbarBtn}
            >
              {/* Literal ↺ glyph (U+21BA) to match the owner's shell mockup exactly;
                  sized to sit at the same weight as the SVG icons in the row. */}
              <span aria-hidden="true" className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-[15px] leading-none">↺</span>
            </button>
            <button
              type="button"
              onClick={redoDraftEdit}
              disabled={mutationInFlight || inspectorDirty || !redoAvailable}
              aria-label="Redo last undone change"
              title={redoTitle}
              className={chromeToolbarBtn}
            >
              {/* Literal ↻ glyph (U+21BB) — matches the mockup; see Undo above. */}
              <span aria-hidden="true" className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-[15px] leading-none">↻</span>
            </button>
            {/* Text-only by owner direction: the prototype has no Show-names
                tool, so there is no glyph to borrow, and inventing one would
                read as a fifth icon language in a four-glyph row. On-state is
                the orange underline (chromeToolbarBtnCollapsibleActive) plus
                aria-pressed. The label must NOT flip to the inverse verb when
                active: a flipping label with no pressed state is what left the
                current view invisible to assistive tech before, and
                accessibility-source pins that it never comes back. */}
            <button
              type="button"
              onClick={() => setShowNames(current => !current)}
              aria-pressed={showNames}
              title="Show or hide occupant names on seat pills"
              className={showNames ? chromeToolbarBtnCollapsibleActive : chromeToolbarBtnCollapsible}
            >
              Show names
            </button>
            <Link
              href="/admin/management"
              onClick={event => {
                if (!beforeGuardedNavigation("/admin/management", "Management")) event.preventDefault();
              }}
              className={chromeToolbarBtnCollapsibleXl}
            >
              {/* Literal ▤ glyph (U+25A4) — the prototype renders all four tools
                  as <i> characters, not SVGs; see Undo/Redo above. */}
              <span aria-hidden="true" className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-[13px] leading-none">▤</span>
              Management
            </Link>
            <button
              ref={askPlannerButtonRef}
              type="button"
              aria-label={plannerHighlightedSeatIds.length > 0 ? `Open Ask Planner, ${plannerHighlightedSeatIds.length} seats highlighted` : "Open Ask Planner"}
              aria-controls="ask-planner-drawer"
              aria-expanded={askPlannerOpen}
              aria-haspopup="dialog"
              onClick={openAskPlannerDrawer}
              className={askPlannerOpen || plannerHighlightedSeatIds.length > 0 ? chromeToolbarBtnCollapsibleActive : chromeToolbarBtnCollapsible}
            >
              {/* Literal ✦ glyph (U+2726) — see Management above. */}
              <span aria-hidden="true" className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-[13px] leading-none">✦</span>
              Ask Planner
              {plannerHighlightedSeatIds.length > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--admin-primary-cta)] px-1 text-[11px] font-semibold text-white">{plannerHighlightedSeatIds.length}</span>
              )}
            </button>
            {/* Below-xl fallback only. At xl the whole tool row fits, so this
                button is absent and the bar matches the prototype exactly. */}
            <div data-chrome-menu className="relative flex h-full shrink-0 items-center xl:hidden">
              <button
                ref={chromeMenuButtonRef}
                type="button"
                aria-haspopup="true"
                aria-expanded={chromeMenuOpen}
                aria-controls={chromeMenuOpen ? "chrome-overflow-menu" : undefined}
                aria-label="More tools"
                title="More tools"
                onClick={() => setChromeMenuOpen(current => !current)}
                className={chromeMenuOpen ? chromeToolbarBtnActive : chromeToolbarBtn}
              >
                <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
                  <circle cx="4.5" cy="10" r="1.5" />
                  <circle cx="10" cy="10" r="1.5" />
                  <circle cx="15.5" cy="10" r="1.5" />
                </svg>
                {/* Icon-only: the ⋯ glyph IS the overflow affordance, so the
                    "More" label was the row's clearest icon+label doubling.
                    aria-label + title still carry the name. */}
                {/* Badge mirrors the collapsed Ask Planner state, so it only
                    applies below lg where that tool lives in this menu. */}
                {plannerHighlightedSeatIds.length > 0 && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--admin-primary-cta)] px-1 text-[11px] font-semibold text-white lg:hidden">{plannerHighlightedSeatIds.length}</span>
                )}
              </button>
              {chromeMenuOpen && (
                <div
                  id="chrome-overflow-menu"
                  role="group"
                  aria-label="More tools"
                  onKeyDown={event => {
                    if (event.key === "Escape") {
                      event.stopPropagation();
                      setChromeMenuOpen(false);
                      returnFocusAfterClose(chromeMenuButtonRef);
                    }
                  }}
                  className="absolute left-0 top-full z-50 min-w-[188px] border border-[var(--admin-chrome-border)] bg-[var(--admin-chrome-bg)] py-1 shadow-elevation-3"
                >
                  {/* Below-lg twin of the row button. Text-only like its row
                      counterpart, but it KEEPS the trailing checkmark: that is a
                      state cue, not an icon, and without it sighted users lose
                      the current state in a menu that has no underline. */}
                  <button
                    type="button"
                    aria-pressed={showNames}
                    onClick={() => {
                      setChromeMenuOpen(false);
                      setShowNames(current => !current);
                      // Activation unmounts the focused item — same stranded-
                      // focus hazard as Escape.
                      returnFocusAfterClose(chromeMenuButtonRef);
                    }}
                    className={[chromeMenuItem, "lg:hidden"].join(" ")}
                  >
                    Show names
                    {showNames && (
                      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="ml-auto h-3.5 w-3.5 text-[var(--admin-primary)]">
                        <path d="m4.5 10.5 3.5 3.5 7.5-8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                  <Link
                    href="/admin/management"
                    onClick={event => {
                      if (!beforeGuardedNavigation("/admin/management", "Management")) event.preventDefault();
                      setChromeMenuOpen(false);
                      returnFocusAfterClose(chromeMenuButtonRef);
                    }}
                    className={chromeMenuItem}
                  >
                    <span aria-hidden="true" className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-[13px] leading-none">▤</span>
                    Management
                  </Link>
                  {/* Below sm the bar's Viewer/Admin shortcuts hide, so the menu
                      must keep the surface switch reachable (#197) — routed
                      through the same unsaved-edits guard as the row link. */}
                  <Link
                    href="/"
                    onClick={event => {
                      if (!beforeGuardedNavigation("/", "the viewer")) event.preventDefault();
                      setChromeMenuOpen(false);
                      returnFocusAfterClose(chromeMenuButtonRef);
                    }}
                    className={[chromeMenuItem, "sm:hidden"].join(" ")}
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                      <circle cx="12" cy="12" r="8.2" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                    Viewer
                  </Link>
                  <button
                    type="button"
                    aria-controls="ask-planner-drawer"
                    aria-haspopup="dialog"
                    onClick={() => {
                      setChromeMenuOpen(false);
                      // No focus restore here: the drawer takes focus itself,
                      // and a deferred restore would steal it back.
                      openAskPlannerDrawer();
                    }}
                    className={[chromeMenuItem, "lg:hidden"].join(" ")}
                  >
                    <span aria-hidden="true" className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-[13px] leading-none">✦</span>
                    Ask Planner
                    {plannerHighlightedSeatIds.length > 0 && (
                      <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--admin-primary-cta)] px-1 text-[11px] font-semibold text-white">{plannerHighlightedSeatIds.length}</span>
                    )}
                  </button>
                </div>
              )}
            </div>
          </nav>
        )}

        <div className="ml-auto flex h-full shrink-0 items-center">
          {/* Surface shortcuts: the active surface carries the orange underline. */}
          <div className="hidden h-full items-center sm:flex">
            <Link
              href="/"
              aria-label="Open viewer surface"
              title="Viewer — published map"
              onClick={event => {
                if (!beforeGuardedNavigation("/", "the viewer")) event.preventDefault();
              }}
              className={[chromeSurfaceShortcut, "border-transparent text-[var(--admin-chrome-muted)] hover:bg-[var(--admin-chrome-hover)] hover:text-[var(--admin-chrome-text)]"].join(" ")}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="8.2" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              Viewer
            </Link>
            <span
              aria-current="page"
              title="Admin — draft planning"
              className={[chromeSurfaceShortcut, "border-[var(--admin-primary)] text-white"].join(" ")}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="7" r="3.1" />
                <path d="M3.5 20v-1.4a4.6 4.6 0 0 1 4.6-4.6h1.6a4.6 4.6 0 0 1 2.3.6" />
                <path d="M14.5 18.4l2 2 4.2-4.6" />
              </svg>
              Admin
            </span>
          </div>
          {canEdit && (
            <div data-publish-status className="relative flex h-full shrink-0 items-center">
              {/* With changes: the review entry point. Idle: a DISCLOSURE for the
                  status popover — a status chip must not launch the publish
                  workflow modal (2026-07-16 critique, fix 3). */}
              <button
                type="button"
                ref={publishStatusButtonRef}
                onClick={() => {
                  if (publishSummary.hasChanges) {
                    openPublishReview();
                    return;
                  }
                  setPublishStatusOpen(current => !current);
                }}
                aria-label={publishSummary.hasChanges ? `Review ${draftStatusLabel.toLowerCase()}` : `Publish status: ${draftStatusLabel.toLowerCase()}`}
                aria-haspopup={publishSummary.hasChanges ? undefined : "true"}
                aria-expanded={publishSummary.hasChanges ? undefined : publishStatusOpen}
                aria-controls={!publishSummary.hasChanges && publishStatusOpen ? "publish-status-popover" : undefined}
                title={draftStatusTitle}
                className={[
                  "inline-flex h-10 shrink-0 items-center gap-1.5 px-3.5 text-[12.5px] font-semibold leading-none transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset",
                  publishSummary.hasChanges
                    ? "bg-[var(--admin-primary)] text-[var(--admin-primary-ink)] hover:brightness-105 focus-visible:ring-white motion-safe:animate-[sp-chip-pop_240ms_ease-out]"
                    : publishStatusOpen
                      ? "bg-[var(--admin-chrome-hover)] text-[var(--admin-chrome-text)] focus-visible:ring-[var(--admin-primary)]"
                      : "text-[var(--admin-chrome-muted)] hover:bg-[var(--admin-chrome-hover)] hover:text-[var(--admin-chrome-text)] focus-visible:ring-[var(--admin-primary)]"
                ].join(" ")}
              >
                {publishSummary.hasChanges ? (
                  <>
                    <span>Publish</span>
                    <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[rgb(var(--sp-color-text-primary-rgb)/0.15)] px-1 text-[11px] font-bold tabular-nums">{publishSummary.totalChangeCount}</span>
                  </>
                ) : (
                  <>
                    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[var(--admin-status-ok)]" />
                    {/* Label from 480px up — only true phone widths get the dot alone. */}
                    <span className="hidden min-[480px]:inline">Published</span>
                  </>
                )}
              </button>
              {publishStatusOpen && !publishSummary.hasChanges && (
                <div
                  id="publish-status-popover"
                  role="group"
                  aria-label="Publish status"
                  onKeyDown={event => {
                    if (event.key === "Escape") {
                      event.stopPropagation();
                      setPublishStatusOpen(false);
                      returnFocusAfterClose(publishStatusButtonRef);
                    }
                  }}
                  className="absolute right-0 top-full z-50 w-[264px] border border-[var(--admin-chrome-border)] bg-[var(--admin-chrome-bg)] p-3 text-left shadow-elevation-3"
                >
                  <p className="flex items-center gap-1.5 text-[12.5px] font-semibold leading-none text-[var(--admin-chrome-text)]">
                    <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--admin-status-ok)]" />
                    Draft matches the published map
                  </p>
                  <p className="mt-1.5 text-[11.5px] leading-4 text-[var(--admin-chrome-muted)]">
                    {lastPublishedLabel ? `Viewers see the map published ${lastPublishedLabel}.` : "Viewers see the currently published map."}
                  </p>
                  <Link
                    href="/admin/management?tab=publishHistory"
                    onClick={event => {
                      if (!beforeGuardedNavigation("/admin/management?tab=publishHistory", "Management")) {
                        event.preventDefault();
                        return;
                      }
                      setPublishStatusOpen(false);
                    }}
                    className="mt-2 inline-flex items-center gap-1 text-[11.5px] font-semibold text-[var(--admin-chrome-text)] underline decoration-[var(--admin-chrome-muted)] underline-offset-2 transition hover:decoration-[var(--admin-chrome-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-primary)]"
                  >
                    View publish history
                    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3 w-3" fill="none">
                      <path d="M7 5l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </Link>
                </div>
              )}
            </div>
          )}
          {/* The identity chip is the account menu (signed-in email + role +
              Sign out). Settings stays behind this chip on the map surface
              (owner preference) as a labeled menu item that still routes
              through the unsaved-edits guard. Prototype routes render without
              an authenticated user, so the chip falls back to decorative. */}
          {accountEmail ? (
            <AccountMenu
              email={accountEmail}
              roleLabel={accountRoleLabel ?? (canEdit ? "Admin" : "Viewer")}
              onSelectSettings={
                canEdit
                  ? () => {
                      if (beforeGuardedNavigation("/admin/settings", "Settings")) window.location.assign("/admin/settings");
                    }
                  : undefined
              }
            />
          ) : (
            <span aria-hidden="true" className="mx-2.5 flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-[var(--admin-primary)] text-[11px] font-semibold text-[var(--admin-primary-ink)]">A</span>
          )}
        </div>
      </header>

      <div className={["mx-auto flex w-full max-w-[1920px] flex-1 flex-col px-2 py-2 sm:px-3 sm:py-3 lg:min-h-0 lg:overflow-hidden", stageReservedClassName].filter(Boolean).join(" ")}>
        

        {/* lg:flex-1 keeps the height chain rigid: without it the fit-view
            width/height calculation feeds back on itself after the reserved
            inspector column opens and closes, sticking the map small. */}
        <div className="flex min-w-0 flex-col overflow-hidden lg:min-h-0 lg:flex-1">
          <div role="search" aria-label="Canvas search" className="z-30 px-0.5 pb-2 lg:hidden">
            <label className="relative block w-full min-w-0">
              <span className="sr-only">Search employee, seat, job title, department, or zone</span>
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[var(--admin-text-muted)]">
                <circle cx="9" cy="9" r="5.25" stroke="currentColor" strokeWidth="1.7" />
                <path d="m13.4 13.4 3.1 3.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
              <input
                ref={canvasSearchInputRef}
                value={search}
                onChange={event => handleSearchInputChange(event.target.value)}
                onKeyDown={event => {
                  if (event.key === "Escape" && search.trim()) {
                    event.stopPropagation();
                    clearSearch();
                    return;
                  }
                  // Results are visually adjacent but far away in DOM order —
                  // ArrowDown hops focus straight into the results panel.
                  if (event.key === "ArrowDown" && resultsPanelOpen) {
                    event.preventDefault();
                    document.querySelector<HTMLButtonElement>('[aria-label="Admin search results"] button')?.focus();
                  }
                }}
                type="search" name="seat-search" autoComplete="off" spellCheck={false} placeholder={SEAT_SEARCH_PLACEHOLDER}
                className="h-9 w-full border border-[var(--admin-border)] bg-[var(--admin-surface)] pl-11 pr-10 text-sm font-medium text-[var(--admin-text-primary)] shadow-sm outline-none transition placeholder:text-[var(--admin-text-subtle)] hover:border-[var(--admin-border-strong)] focus:border-[var(--admin-primary)] focus:ring-2 focus:ring-[color:var(--admin-primary-border)]"
              />
              {search.trim() && (
                <button
                  type="button"
                  aria-label="Clear top search"
                  title="Clear top search"
                  className={["absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-[var(--admin-text-muted)] transition hover:bg-[var(--admin-surface-muted)] hover:text-[var(--admin-text-secondary)] active:scale-90", focusRingClass].join(" ")}
                  onClick={clearSearch}
                >
                  <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5"><path d="m6 6 8 8m0-8-8 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              )}
            </label>
          </div>

      <main className={["grid grid-cols-1 gap-2 p-2 lg:min-h-0 lg:flex-1 lg:items-stretch lg:overflow-hidden", desktopMapGridClass].join(" ")}>
        <section id="planning-canvas" tabIndex={-1} aria-labelledby="admin-planning-canvas-title" className={[filterCollapsed ? "order-1" : "order-2", "min-w-0 overflow-hidden relative p-0.5 lg:order-2 lg:flex lg:min-h-0 lg:flex-col lg:gap-2"].filter(Boolean).join(" ")}>
          {staleDraftNotice && (
            <div role="alert" className={actionErrorBannerClassName}>
              {staleDraftNotice}
            </div>
          )}

          {sessionExpired && actionError && (
            <div role="alert" className={actionErrorBannerClassName}>
              Your session expired — sign in again to keep editing. Unsaved changes stay in this tab until you leave.{" "}
              <a href="/login?next=/admin" className="font-semibold underline underline-offset-2">
                Sign in
              </a>
            </div>
          )}

          {actionError && !sessionExpired && (
            <div role="alert" className={actionErrorBannerClassName}>
              {actionError}
            </div>
          )}

          {actionNotice && !swapSourceSeatId && (
            <div role="status" aria-live="polite" className={actionNoticeBannerClassName}>
              <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{actionNotice}</span>
              {canEdit && undoAvailable && lastUndoLabel && !mutationInFlight && !inspectorDirty && (
                <button
                  type="button"
                  onClick={undoDraftEdit}
                  className={[
                    "shrink-0 self-start rounded-full border bg-sp-surface/80 px-3 py-1 text-[11px] font-semibold transition hover:bg-sp-surface active:scale-[0.97] active:duration-75 active:shadow-inner focus-visible:outline-none focus-visible:ring-4 sm:self-auto",
                    actionNoticeTone === "neutral"
                      ? "border-[var(--admin-border-strong)] text-[var(--admin-text-secondary)] focus-visible:ring-[var(--admin-border-strong)]"
                      : "border-[var(--admin-state-saved-border)] text-[var(--admin-state-saved-text)] focus-visible:ring-[var(--admin-state-saved-border)]"
                  ].join(" ")}
                >
                  Undo {lastUndoLabel}
                </button>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-0.5 pb-2 lg:pb-0">
            <FloorSelector floor={floor} onChange={setFloor} />
            <span className="text-[12px] text-[var(--admin-text-secondary)]">{mapCrumbLabel}</span>
            <ActiveFilterChips chips={activeFilterChips} onRemove={removeActiveFilterChip} onClearAll={clearAllConstraints} />
            <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
              {canEdit && floor === "3" && (
                <button
                  type="button"
                  aria-pressed={addSeatMode}
                  onClick={addSeatMode ? cancelAddSeatMode : startAddSeatMode}
                  className={[
                    "inline-flex h-[30px] items-center gap-1.5 border px-2.5 text-[12px] font-medium transition active:scale-[0.97] active:duration-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)]",
                    addSeatMode
                      ? "border-[var(--admin-primary)] bg-[var(--admin-primary-soft)] text-[var(--admin-primary-on-soft)]"
                      : "border-[var(--admin-border)] bg-[var(--admin-surface)] text-[var(--admin-text-secondary)] hover:bg-[var(--admin-surface-alt)] hover:text-[var(--admin-text-primary)]"
                  ].join(" ")}
                >
                  <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none">
                    <path d="M10 4.5v11M4.5 10h11" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                  </svg>
                  {addSeatMode ? "Exit add seat" : "Add seat"}
                </button>
              )}
              {canEdit && floor === "3" && (
                <div data-map-menu className="relative">
                  <button
                    ref={mapMenuButtonRef}
                    type="button"
                    aria-haspopup="menu"
                    aria-expanded={mapMenuOpen}
                    aria-controls={mapMenuOpen ? "seat-map-overflow-menu" : undefined}
                    aria-label="More map actions"
                    title="More map actions"
                    onClick={() => setMapMenuOpen(current => !current)}
                    className={[
                      "inline-flex h-[30px] w-8 items-center justify-center border transition active:scale-[0.97] active:duration-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)]",
                      mapMenuOpen
                        ? "border-[var(--admin-primary)] bg-[var(--admin-primary-soft)] text-[var(--admin-primary-on-soft)]"
                        : "border-[var(--admin-border)] bg-[var(--admin-surface)] text-[var(--admin-text-secondary)] hover:bg-[var(--admin-surface-alt)] hover:text-[var(--admin-text-primary)]"
                    ].join(" ")}
                  >
                    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
                      <circle cx="10" cy="4.5" r="1.5" />
                      <circle cx="10" cy="10" r="1.5" />
                      <circle cx="10" cy="15.5" r="1.5" />
                    </svg>
                  </button>
                  {mapMenuOpen && (
                    <div
                      id="seat-map-overflow-menu"
                      ref={mapMenuRef}
                      role="menu"
                      aria-label="Map actions"
                      onKeyDown={event => {
                        if (event.key === "Escape") {
                          event.stopPropagation();
                          setMapMenuOpen(false);
                          returnFocusAfterClose(mapMenuButtonRef);
                          return;
                        }
                        if (event.key === "Tab") {
                          // Tab closes and refocuses the trigger synchronously: preventDefault()
                          // stops the native focus hop, and focusing the trigger immediately
                          // (not via the deferred returnFocusAfterClose) avoids a double focus
                          // move — the user's next Tab then proceeds from the trigger.
                          event.preventDefault();
                          event.stopPropagation();
                          setMapMenuOpen(false);
                          mapMenuButtonRef.current?.focus();
                          return;
                        }
                        if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End") {
                          event.preventDefault();
                          event.stopPropagation();
                          const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'));
                          if (items.length === 0) return;
                          const currentIndex = items.indexOf(document.activeElement as HTMLElement);
                          let nextIndex: number;
                          if (event.key === "Home") {
                            nextIndex = 0;
                          } else if (event.key === "End") {
                            nextIndex = items.length - 1;
                          } else if (event.key === "ArrowDown") {
                            nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % items.length;
                          } else {
                            nextIndex = currentIndex < 0 ? items.length - 1 : (currentIndex - 1 + items.length) % items.length;
                          }
                          items[nextIndex]?.focus();
                        }
                      }}
                      className="absolute right-0 top-full z-40 min-w-[176px] border border-[var(--admin-border)] bg-[var(--admin-surface)] py-1 shadow-elevation-3"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        tabIndex={-1}
                        onClick={() => {
                          setMapMenuOpen(false);
                          fitMapToView();
                          returnFocusAfterClose(mapMenuButtonRef);
                        }}
                        className="flex w-full items-center px-3 py-2 text-left text-[12px] font-medium text-[var(--admin-text-primary)] transition hover:bg-[var(--admin-surface-alt)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-focus)]"
                      >
                        Fit map to view
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        tabIndex={-1}
                        onClick={() => {
                          setMapMenuOpen(false);
                          applyMapZoom(1);
                          returnFocusAfterClose(mapMenuButtonRef);
                        }}
                        className="flex w-full items-center px-3 py-2 text-left text-[12px] font-medium text-[var(--admin-text-primary)] transition hover:bg-[var(--admin-surface-alt)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-focus)]"
                      >
                        Zoom to 100%
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className={mapStageClassName}>
            <div
              ref={mapViewportRef}
              className={mapViewportClassName}
              tabIndex={canEdit ? 0 : undefined}
              aria-label={canEdit ? "Admin seat map viewport. Drag to pan; use wheel, trackpad, touch, or arrow keys to pan the map." : undefined}
              onPointerDown={handleViewportPointerDown}
              onPointerMove={handleViewportPointerMove}
              onPointerUp={handleViewportPointerEnd}
              onPointerCancel={handleViewportPointerEnd}
            >
              {floor === "2" && <FloorPlaceholder />}
              {floor === "3" && (
              <div
                ref={mapRef}
                className={mapFrameClassName}
                style={mapFrameStyle}
                onPointerDown={handleMapPointerDown}
                onPointerMove={handleMapPointerMove}
                onPointerUp={handleMapPointerUp}
                onPointerCancel={() => {
                  setDragState(null);
                  setMoveSeatMode(false);
                }}
              >
                <Image
                  src={MAP_IMAGE_SRC}
                  alt="Office floor plan"
                  width={MAP_IMAGE_WIDTH}
                  height={MAP_IMAGE_HEIGHT}
                  priority
                  unoptimized
                  placeholder="blur"
                  blurDataURL={MAP_IMAGE_BLUR_DATA_URL}
                  className="block h-auto w-full select-none"
                  draggable={false}
                />

                <div
                  className={mapMarkerLayerClassName}
                  onKeyDown={handleMarkerLayerKeyDown}
                  onFocusCapture={handleMarkerLayerFocusCapture}
                  onPointerDownCapture={() => {
                    focusInspectorAfterSelectRef.current = false;
                  }}
                >
                  {/* Every state renders individual seat markers — the fit view
                      never collapses to zone/cluster pills (owner QA, round 2). */}
                  {localSeats.map(seat => {
                    const seatMatchesFilters = matchesFilters(seat);
                    const visualSeat = visualSeatById.get(seat.id) ?? seat;
                    const viewportPlacement = getMarkerViewportPlacement(visualSeat.x);

                    return (
                      <SeatMarker
                        key={seat.id}
                        seat={visualSeat}
                        selected={seat.id === selectedSeatId}
                        dimmed={dimmedSeatIdSet.has(seat.id)}
                        canEdit={canEdit}
                        showNames={showNames}
                        searchResult={Boolean(search.trim()) && seatMatchesFilters}
                        draftChanged={draftChangedSeatLabelSet.has(seat.label)}
                        compactNameLabel={(nameLabelNudges.get(seat.id) ?? 0) !== 0}
                        codeNudge={codePillNudges.get(seat.id) ?? 0}
                        nameNudge={nameLabelNudges.get(seat.id) ?? 0}
                        moveSeatMode={moveSeatMode}
                        swapMode={Boolean(swapSourceSeatId)}
                        swapSource={seat.id === swapSourceSeatId}
                        swapTarget={seat.id === swapConfirm?.targetSeatId}
                        highlighted={plannerHighlightedSeatIdSet.has(seat.id)}
                        dragging={dragState?.seatId === seat.id}
                        addSeatMode={addSeatMode}
                        viewportEdge={viewportPlacement.edge}
                        viewportEdgeOffsetPx={viewportPlacement.offsetPx}
                        // Owner preference: the admin map wears the published viewer's
                        // seat-marker pills exactly — soft resting pills with the status
                        // dot, the dark pill + orange ring when selected, orange hover.
                        // (SeatMarker keeps its admin-token branches; the admin map just
                        // no longer opts into them.)
                        variant="viewer"
                        tabIndex={seat.id === mapRovingSeatId ? 0 : -1}
                        onSelect={selectSeat}
                        onMovePointerDown={handleMovePointerDown}
                      />
                    );
                  })}
                </div>
              </div>
              )}
            </div>
            {floor === "3" && (
              <div className={["absolute bottom-3 right-3 z-30", mobileMapControlsHidden ? "hidden sm:block" : ""].filter(Boolean).join(" ")}>
                <MapZoomControl
                  label={mapZoomLabel}
                  onZoomIn={() => applyMapZoom(mapViewMode === "detail" ? zoomFactor + MAP_ZOOM_STEP : 1)}
                  onZoomOut={() => applyMapZoom(mapViewMode === "detail" ? zoomFactor - MAP_ZOOM_STEP : 1 - MAP_ZOOM_STEP)}
                  onFit={fitMapToView}
                  zoomInDisabled={mapViewMode === "detail" && zoomFactor >= MAP_ZOOM_MAX}
                  zoomOutDisabled={mapViewMode === "detail" && zoomFactor <= MAP_ZOOM_MIN}
                />
              </div>
            )}
          </div>

          {canEdit && (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 py-2 lg:mt-0">
              <div className="min-w-0">
                <h2 id="admin-planning-canvas-title" className="truncate text-sm font-semibold text-[var(--admin-text-primary)]">
                  {filtersActive ? searchStatusTitle : "Planning canvas"}
                </h2>
                <p aria-label="Seat inventory summary" className="text-xs font-medium text-[var(--admin-text-muted)] sm:truncate">
                  {filtersActive ? searchStatusSummary : (
                    <>
                      {stats.total} seats
                      <span className="mx-1 text-[var(--admin-text-subtle)]">·</span>
                      {stats.assigned} assigned
                      <span className="mx-1 text-[var(--admin-text-subtle)]">·</span>
                      {stats.available} open
                      <span className="mx-1 text-[var(--admin-text-subtle)]">·</span>
                      {stats.reserved} reserved
                      <span className="mx-1 text-[var(--admin-text-subtle)]">·</span>
                      {stats.unavailable} unavailable
                    </>
                  )}
                </p>
              </div>
              <div className="flex min-w-0 shrink-0 items-center gap-3">
                <ul aria-label="Seat status legend" className="hidden flex-wrap items-center gap-2 text-xs font-medium text-[var(--admin-text-secondary)] md:flex">
                  {SEAT_STATUS_LEGEND.filter(item => !item.draftOnly || legendCounts[item.key] > 0).map(item => (
                    <li key={item.key} className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[var(--admin-border)] bg-[var(--admin-surface-muted)] px-2.5 py-1">
                      <span className={["h-2 w-2 shrink-0 rounded-full", item.accentClass].join(" ")} aria-hidden="true" />
                      {item.label}
                      <span className="text-[var(--admin-text-subtle)]" aria-hidden="true">·</span>
                      <span className="font-semibold text-[var(--admin-text-primary)]">{legendCounts[item.key]}</span>
                    </li>
                  ))}
                </ul>
                {filtersActive && (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => fitSeatsInMap(matchingSeats)}
                      disabled={!matchingSeats.length}
                      aria-label={matchingSeats.length === 0 ? "Fit matches unavailable because there are no matching seats" : `Fit ${matchingSeats.length} matches on the map`}
                      title={matchingSeats.length === 0 ? "No matching seats to fit" : "Fit active search and filter results on the map"}
                      className={resultActionButtonClassName}
                    >
                      Fit matches
                    </button>
                    <button
                      type="button"
                      onClick={searchActive && structuredFiltersActive ? clearAllConstraints : searchActive ? clearSearch : clearStructuredFilters}
                      aria-label={searchActive && structuredFiltersActive ? "Clear all active search and filters" : searchActive ? "Clear search results" : "Clear filters"}
                      className={resultClearButtonClassName}
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </main>
      </div>
      </div>

      {canEdit && (
        <AskPlannerDrawer
          open={askPlannerOpen}
          draftDirty={inspectorDirty}
          zones={zones}
          queuedRequest={askPlannerQueuedRequest}
          highlightedSeatIds={plannerHighlightedSeatIds}
          onClose={closeAskPlannerDrawer}
          onHighlightSeats={setPlannerHighlightedSeatIds}
          onClearHighlights={() => setPlannerHighlightedSeatIds([])}
          onSelectSeat={selectPlannerHighlightedSeat}
        />
      )}

      {deleteSeatConfirm && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[var(--sp-color-workspace-deep)]/45 p-3 backdrop-blur-[2px] sm:z-[70] sm:items-center">
          <section
            ref={deleteSeatDialogFocusRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-seat-confirm-title"
            aria-describedby="delete-seat-confirm-description"
            className="w-full max-w-md rounded-2xl border border-[var(--sp-color-border-subtle)] bg-[var(--sp-color-surface)]/95 p-4 text-[var(--sp-color-text-primary)] shadow-[0_26px_80px_rgba(23,26,29,0.32)] backdrop-blur-2xl focus-visible:outline-none"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="delete-seat-confirm-title" className="text-base font-semibold">Delete custom seat {deleteSeatConfirm.label}?</h2>
                <p id="delete-seat-confirm-description" className="mt-1 text-sm leading-5 text-[var(--sp-color-text-muted)]">
                  Only available custom draft seats can be deleted. Original seats are protected.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDeleteSeatConfirm(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold text-[var(--sp-color-text-muted)] transition hover:bg-[var(--sp-color-graphite-soft)] hover:text-[var(--sp-color-text-secondary)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus-ring-color)]"
                aria-label="Cancel custom seat deletion"
              >
                <CloseIcon />
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-[var(--admin-state-danger-border)] bg-[var(--admin-state-danger-bg)] p-3 text-sm font-semibold leading-5 text-[var(--admin-state-danger-text)]">
              This removes custom draft seats only. Published maps are unchanged until you publish.
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button type="button" onClick={() => setDeleteSeatConfirm(null)} disabled={pending} className="w-full">
                Cancel
              </Button>
              <Button type="button" variant="danger" onClick={confirmDeleteSelectedSeat} disabled={pending} className={`w-full ${adminDangerButtonClassName}`}>
                Delete seat
              </Button>
            </div>
          </section>
        </div>
      )}

      {publishReviewOpen && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[var(--admin-rail-bg)]/48 p-3 backdrop-blur-[2px] sm:z-50 sm:items-center">
          <section
            ref={publishReviewDialogFocusRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="publish-review-title"
            aria-describedby="publish-review-description"
            className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden border border-[var(--admin-border)] bg-[var(--admin-surface)] p-4 text-[var(--admin-text-primary)] shadow-[0_30px_90px_rgba(23,26,29,0.34)] backdrop-blur-2xl focus-visible:outline-none"
          >
            <div className="flex items-start justify-between gap-3 border-b border-[var(--admin-border)] pb-3">
              <div>
                <h2 id="publish-review-title" className="text-base font-semibold">Review draft before publishing</h2>
                <p id="publish-review-description" className="mt-1 text-sm leading-5 text-[var(--admin-text-muted)]">
                  Confirm the saved draft changes before they become visible in the read-only viewer.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActionError(null);
                  setPublishReviewOpen(false);
                }}
                disabled={pending}
                className={["flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold text-[var(--admin-text-muted)] transition hover:bg-[var(--admin-state-neutral-bg)] hover:text-[var(--admin-text-secondary)] disabled:cursor-not-allowed disabled:opacity-40", focusRingClass].join(" ")}
                aria-label="Close publish review"
              >
                <CloseIcon />
              </button>
            </div>

            <div className="min-h-0 overflow-y-auto overscroll-contain py-4">
              {!publishSummary.hasChanges && (
                <p className="rounded-xl border border-[var(--admin-publish-no-change-border)] bg-[var(--admin-publish-no-change-bg)] p-3 text-sm font-semibold leading-5 text-[var(--admin-publish-no-change-text)]">
                  No draft changes to publish. The saved draft already matches the currently published viewer map.
                </p>
              )}

              {publishSummary.hasChanges && (
              <>
              <div className={["rounded-xl border p-3", publishSummary.hasChanges ? "border-[var(--admin-publish-ready-border)] bg-[var(--admin-publish-ready-bg)] text-[var(--admin-publish-ready-text)]" : "border-[var(--admin-publish-no-change-border)] bg-[var(--admin-publish-no-change-bg)] text-[var(--admin-publish-no-change-text)]"].join(" ")}>
                <StatusBadge tone={publishReadinessBadgeTone} className={["!min-h-0 !px-2 !py-0.5 !text-[11px] !font-semibold !tracking-wide", publishSummary.hasChanges ? "!bg-[var(--admin-surface)]/80 !text-[var(--admin-publish-ready-text)] !ring-[var(--admin-publish-ready-border)]" : "!bg-[var(--admin-surface)]/80 !text-[var(--admin-publish-no-change-text)] !ring-[var(--admin-publish-no-change-border)]"].join(" ")}>
                  {publishReadinessBadgeLabel}
                </StatusBadge>
                <h3 className="mt-2 text-sm font-semibold text-[var(--admin-text-primary)]">{publishReadinessTitle}</h3>
                <p className="mt-1 text-sm font-semibold leading-5">{publishReadinessDescription}</p>
              </div>

              <div className="mt-3 rounded-xl border border-[var(--admin-publish-viewer-impact-border)] bg-[var(--admin-publish-viewer-impact-bg)] p-3 text-[var(--admin-publish-viewer-impact-text)]">
                <div className="text-[11px] font-semibold">Viewer impact</div>
                <p className="mt-1 text-sm font-semibold leading-5 text-[var(--admin-text-secondary)]">
                  Publishing copies the saved draft map to the read-only viewer. Until you publish, viewers keep seeing the currently published map.
                </p>
              </div>

              {actionError && !pending && (
                <div role="alert" className="mt-3 rounded-xl border border-[var(--admin-state-error-border)] bg-[var(--admin-state-error-bg)] p-3 text-sm font-semibold leading-5 text-[var(--admin-state-error-text)]">
                  <StatusBadge tone="danger" className="!min-h-0 !bg-[var(--admin-surface)]/80 !px-2 !py-0.5 !text-[11px] !font-semibold !tracking-wide !text-[var(--admin-state-error-text)] !ring-[var(--admin-state-error-border)]">Error</StatusBadge>
                  <p className="mt-2">
                    <span className="font-semibold">Publish did not complete.</span> {actionError}
                  </p>
                </div>
              )}

              {pending && (
                <div role="status" aria-live="polite" className="mt-3 rounded-xl border border-[var(--admin-state-saving-border)] bg-[var(--admin-state-saving-bg)] p-3 text-sm font-semibold leading-5 text-[var(--admin-state-saving-text)]">
                  <StatusBadge tone="pending" className="!min-h-0 !bg-[var(--admin-surface)]/80 !px-2 !py-0.5 !text-[11px] !font-semibold !tracking-wide !text-[var(--admin-state-saving-text)] !ring-[var(--admin-state-saving-border)]">Publishing</StatusBadge>
                  <p className="mt-2">Publishing reviewed draft changes. Viewer map stays unchanged until publish finishes.</p>
                </div>
              )}

              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <PublishImpactCard label="People affected" value={publishPeopleChangeCount} description="Assignments, vacated seats, and people details." tone={publishPeopleChangeCount > 0 ? "warn" : "default"} />
                <PublishImpactCard label="Seat inventory" value={publishSeatInventoryChangeCount} description="Added and removed seats." tone={publishSeatInventoryChangeCount > 0 ? "warn" : "default"} />
                <PublishImpactCard label="Layout" value={publishLayoutChangeCount} description="Moved seat positions." tone={publishLayoutChangeCount > 0 ? "warn" : "default"} />
                <PublishImpactCard label="Metadata" value={publishMetadataChangeCount} description="Status, zone, label, notes, or custom flags." tone={publishMetadataChangeCount > 0 ? "warn" : "default"} />
              </div>

              <div className="mt-2 rounded-xl border border-[var(--admin-state-neutral-border)] bg-[var(--admin-surface)]/75 p-3 text-xs font-semibold leading-5 text-[var(--admin-text-muted)]">
                <span className="font-semibold text-[var(--admin-text-primary)]">Count note:</span> Impact groups can overlap. Use Total publish changes below as the unique publish-summary total.
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                <PublishCountCard label="Added" value={publishSummary.addedSeats.length} tone={publishSummary.addedSeats.length > 0 ? "warn" : "default"} />
                <PublishCountCard label="Updated" value={publishSummary.updatedSeatCount} tone={publishSummary.updatedSeatCount > 0 ? "warn" : "default"} />
                <PublishCountCard label="Removed" value={publishSummary.removedSeats.length} tone={publishSummary.removedSeats.length > 0 ? "warn" : "default"} />
              </div>

              <div className="mt-3 rounded-xl border border-[var(--admin-state-neutral-border)] bg-[var(--admin-state-neutral-bg)] p-3 text-xs font-semibold leading-5 text-[var(--admin-text-muted)]">
                <span className="font-semibold text-[var(--admin-text-primary)]">Draft:</span> {publishSummary.draftSeatCount} seats
                <span className="mx-2 text-[var(--admin-text-subtle)]">|</span>
                <span className="font-semibold text-[var(--admin-text-primary)]">Currently published:</span> {publishSummary.publishedSeatCount} seats
                <span className="mx-2 text-[var(--admin-text-subtle)]">|</span>
                <span className="font-semibold text-[var(--admin-text-primary)]">Total publish changes:</span> {publishSummary.totalChangeCount}
              </div>

              <div className="mt-3 grid gap-2 md:grid-cols-2">
                <PublishChangeList title="Added seats" items={publishSummary.addedSeats} emptyLabel="No added seats detected." />
                <PublishChangeList title="Removed seats" items={publishSummary.removedSeats} emptyLabel="No removed seats detected." />
                <PublishChangeList title="Assignment changes" items={publishSummary.assignmentChanges} emptyLabel="No assignment changes detected." />
                <PublishChangeList title="Vacated seats" items={publishSummary.vacatedSeats} emptyLabel="No vacated seats detected." />
                <PublishChangeList title="Seat moves/layout changes" items={publishSummary.seatMoves} emptyLabel="No seat moves detected." />
                <PublishChangeList title="Status changes" items={publishSummary.statusChanges} emptyLabel="No status-only changes detected." />
                <div className="md:col-span-2">
                  <PublishChangeList title="People details (names, titles, departments, extensions)" items={publishSummary.employeeDetailChanges} emptyLabel="No people-detail changes detected." />
                </div>
                <div className="md:col-span-2">
                  <PublishChangeList title="Other draft changes" items={publishSummary.otherChanges} emptyLabel="No other draft changes detected." />
                </div>
              </div>

              <div className="mt-3 rounded-xl border border-[var(--admin-state-dirty-border)] bg-[var(--admin-state-dirty-bg)] p-3 text-sm font-semibold leading-5 text-[var(--admin-state-dirty-text)]">
                Publishing updates the viewer map and clears Undo/Redo history after success. Use Cancel if you need to review, undo, or save more draft changes first.
              </div>
              </>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 border-t border-[var(--admin-border)] pt-3">
              <Button type="button" onClick={() => {
                setActionError(null);
                setPublishReviewOpen(false);
              }} disabled={pending} className={["w-full", focusRingClass].join(" ")}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={confirmPublishDraftMap}
                disabled={pending || !publishSummary.hasChanges}
                title={publishSummary.hasChanges ? "Publish reviewed draft changes" : "No draft changes to publish"}
                className={["w-full !border-[var(--admin-primary-cta)] !bg-[var(--admin-primary-cta)] !text-white hover:!border-[var(--admin-primary-cta-hover)] hover:!bg-[var(--admin-primary-cta-hover)] disabled:!border-[var(--admin-state-neutral-border)] disabled:!bg-[var(--admin-state-neutral-bg)] disabled:!text-[var(--admin-text-subtle)]", focusRingClass].join(" ")}
              >
                {pending ? "Publishing…" : actionError && publishSummary.hasChanges ? "Retry publish" : publishSummary.hasChanges ? (
                  <>
                    <span className="sm:hidden">Publish changes</span>
                    <span className="hidden sm:inline">Publish reviewed changes</span>
                  </>
                ) : "No changes to publish"}
              </Button>
            </div>
          </section>
        </div>
      )}

      {modeCardOpen && activeMode && (
        <aside
          role="status"
          aria-live="polite"
          aria-label={`${activeMode.label} mode`}
          className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-[80] border border-[var(--admin-primary-border)] bg-[var(--admin-surface)] p-4 shadow-elevation-4 motion-safe:animate-[sp-panel-in_200ms_ease-out] panel:inset-x-auto panel:bottom-auto panel:right-3 panel:top-[40px] panel:z-40 panel:w-[320px] panel:max-w-[calc(100vw-1.5rem)]"
        >
          <div className="text-[10px] font-semibold text-[var(--admin-primary-cta)]">{activeMode.label} mode</div>
          <p className="mt-1 text-sm font-bold leading-5 text-[var(--admin-text-primary)]">{activeMode.message}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={activeMode.onExit} className="shrink-0 whitespace-nowrap rounded-full bg-[var(--admin-primary-soft)] px-3 py-1.5 text-[11px] font-semibold text-[var(--admin-primary-on-soft)] ring-1 ring-[var(--admin-primary-border)] transition hover:bg-sp-surface active:scale-[0.97] active:duration-75 active:shadow-inner focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus-ring-color)]">
              {activeMode.exitLabel}
            </button>
            <span className="rounded-full bg-[var(--admin-surface-muted)] px-2 py-1 text-[10px] font-semibold text-[var(--admin-text-muted)] ring-1 ring-[var(--admin-border)]">Esc exits</span>
          </div>
        </aside>
      )}

      {resultsPanelOpen && !modeCardOpen && (
        <ResultsPanel
          results={panelResults}
          matchCount={matchingSeats.length}
          emptyTitle={resultEmptyTitle}
          emptyDescription={resultEmptyDescription}
          searchActive={searchActive}
          structuredFiltersActive={structuredFiltersActive}
          onOpen={selectSeatResult}
          onShowOnMap={queueCenterSeatInMap}
          onClearSearch={clearSearch}
          onClearFilters={clearStructuredFilters}
          onClearAll={clearAllConstraints}
          collapsedSeatLabel={selectedSeat && inspectorCollapsed ? selectedSeat.label : null}
          onExpandCollapsedSeat={() => setInspectorCollapsed(false)}
        />
      )}

      <SeatInspector
        seat={selectedSeat}
        seats={localSeats}
        employees={localEmployees}
        departmentOptions={localDepartmentOptions}
        canEdit={canEdit}
        collapsed={inspectorCollapsed}
        pillSuppressed={inspectorPillSuppressed}
        swapMode={Boolean(swapSourceSeatId)}
        searchMismatchNotice={selectedSeatMismatchNotice}
        searchMismatchClearLabel={clearSearchContextLabel}
        onClose={() => {
          if (selectedSeatId && inspectorDirty) {
            requestInspectorGuard({ kind: "close-inspector" });
            return;
          }
          applyCloseInspectorAction();
        }}
        onClearSearchContext={searchActive ? clearSearch : clearStructuredFilters}
        onToggleCollapse={() => setInspectorCollapsed(current => !current)}
        onStartSwapSeat={() => startSwapSeatMode()}
        onStartMoveSeat={() => {
          if (!selectedSeatId) return;
          if (inspectorDirty) {
            requestInspectorGuard({ kind: "start-move-seat" });
            return;
          }
          applyStartMoveSeatAction();
        }}
        moveMode={moveSeatMode}
        canResetPosition={Boolean(selectedSeatPublishedPosition)}
        onResetPosition={resetSeatPositionToPublished}
        onDeleteSeat={deleteSelectedSeat}
        onExplainSeat={explainSeatWithPlanner}
        onBeforeSeatUpdate={captureDraftSnapshot}
        onSeatUpdated={(seat, beforeSnapshot) => {
          setActionError(null);
          setActionNotice(null);
          setInspectorDirty(false);
          const afterSeats = replaceSeat(beforeSnapshot.seats, seat);
          const afterEmployees = replaceEmployee(beforeSnapshot.employees, seat);
          recordDraftHistory(describeSeatUpdate(beforeSnapshot, seat), beforeSnapshot, afterSeats, afterEmployees);
          setLocalSeats(afterSeats);
          setLocalEmployees(afterEmployees);
          setActionNotice(`Saved changes to ${seat.label}.`);
          if (pendingInspectorSaveAction) {
            const action = pendingInspectorSaveAction;
            setPendingInspectorSaveAction(null);
            window.requestAnimationFrame(() => applyInspectorGuardAction(action));
          }
        }}
        onError={message => {
          setActionError(message);
          if (message) setActionNotice(null);
        }}
        onStaleDraft={handleStaleDraft}
        onDirtyChange={setInspectorDirty}
        onSubmitBlocked={cancelPendingInspectorGuardAction}
        resetSignal={inspectorResetSignal}
        activityEntries={selectedSeatActivity}
      />

      {inspectorGuardAction && selectedSeat && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[var(--sp-color-workspace-deep)]/45 p-3 backdrop-blur-[2px] sm:z-[60] sm:items-center">
          <section
            ref={inspectorGuardDialogFocusRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="inspector-unsaved-title"
            aria-describedby="inspector-unsaved-description"
            className="w-full max-w-md rounded-2xl border border-[var(--sp-color-border-subtle)] bg-[var(--sp-color-surface)]/95 p-4 text-[var(--sp-color-text-primary)] shadow-[0_26px_80px_rgba(23,26,29,0.32)] backdrop-blur-2xl focus-visible:outline-none"
          >
            <div>
              <h2 id="inspector-unsaved-title" className="text-base font-semibold">Unsaved seat edits</h2>
              <p id="inspector-unsaved-description" className="mt-1 text-sm leading-5 text-[var(--sp-color-text-muted)]">
                Save or discard changes to {selectedSeat.label} before {describeInspectorGuardAction(inspectorGuardAction)}
              </p>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <Button type="button" onClick={keepEditingInspector} disabled={pending} className="w-full">
                Keep editing
              </Button>
              <Button type="button" variant="danger" onClick={discardInspectorGuardEdits} disabled={pending} className="w-full">
                Discard
              </Button>
              <Button type="button" variant="primary" onClick={requestInspectorGuardSave} disabled={pending} className="w-full">
                Save changes
              </Button>
            </div>
          </section>
        </div>
      )}

      {swapConfirm && swapSourceSeat && swapTargetSeat && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[var(--sp-color-workspace-deep)]/45 p-3 backdrop-blur-[2px] sm:z-50 sm:items-center">
          <section
            ref={swapConfirmDialogFocusRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="swap-confirm-title"
            className="w-full max-w-md rounded-2xl border border-[var(--sp-color-border-subtle)] bg-[var(--sp-color-surface)]/95 p-4 text-[var(--sp-color-text-primary)] shadow-[0_26px_80px_rgba(23,26,29,0.32)] backdrop-blur-2xl focus-visible:outline-none"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="swap-confirm-title" className="text-base font-semibold">Confirm seat swap</h2>
                <p className="mt-1 text-sm leading-5 text-[var(--sp-color-text-muted)]">This updates draft seats only. {PUBLISH_IMPACT_NOTE}</p>
              </div>
              <button
                type="button"
                onClick={() => setSwapConfirm(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold text-[var(--sp-color-text-muted)] transition hover:bg-[var(--sp-color-graphite-soft)] hover:text-[var(--sp-color-text-secondary)]"
                aria-label="Cancel swap confirmation"
              >
                <CloseIcon />
              </button>
            </div>

            <div className="mt-4 grid gap-2">
              <div className="rounded-xl border border-[var(--sp-color-border-subtle)] bg-[var(--sp-color-graphite-soft)] p-3">
                <div className="text-[11px] font-semibold text-[var(--sp-color-text-muted)]">Source</div>
                <div className="mt-1 text-sm font-semibold text-[var(--sp-color-text-primary)]">{swapSourceSeat.label}</div>
                <div className="text-sm text-[var(--sp-color-text-muted)]">{seatPersonLabel(swapSourceSeat)}</div>
              </div>
              <div className="rounded-xl border border-[var(--sp-color-border-subtle)] bg-[var(--sp-color-graphite-soft)] p-3">
                <div className="text-[11px] font-semibold text-[var(--sp-color-text-muted)]">Target</div>
                <div className="mt-1 text-sm font-semibold text-[var(--sp-color-text-primary)]">{swapTargetSeat.label}</div>
                <div className="text-sm text-[var(--sp-color-text-muted)]">{seatPersonLabel(swapTargetSeat)}</div>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-[var(--admin-publish-viewer-impact-border)] bg-[var(--admin-publish-viewer-impact-bg)] p-3 text-sm font-semibold text-[var(--admin-publish-viewer-impact-text)]">
              {buildSwapSummary(swapSourceSeat, swapTargetSeat)}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button type="button" onClick={() => setSwapConfirm(null)} disabled={pending} className="w-full">
                Cancel
              </Button>
              <Button type="button" variant="primary" onClick={confirmSwapSeats} disabled={pending} className="w-full">
                Confirm swap
              </Button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
