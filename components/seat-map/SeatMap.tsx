"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  addedSeatHistoryLabel,
  describeSeatUpdate,
  type DraftSnapshot
} from "@/lib/draftHistory";
import type { DepartmentOption, Employee, SeatStatus, SeatWithEmployee, ZoneOption } from "@/lib/types";
import { STATUS_LABELS } from "@/lib/types";
import { createSeatAction, deleteSeatAction, swapSeatAssignmentsAction, updateSeatAction } from "@/app/actions";
import { findSeatIdByParam, readSeatParam, withSeatParam } from "@/lib/deepLink";
import {
  hasActiveConstraints,
  seatMatchesFilters,
  structuredFilterCount as countStructuredFilters,
  type SeatFilterCriteria
} from "@/lib/seatFilters";
import {
  MAP_ZOOM_MAX,
  MAP_ZOOM_MIN,
  MAP_ZOOM_STEP,
  boundingBoxCenter,
  centerScrollTarget,
  clampZoom,
  hasPassedPanThreshold,
  panScrollTarget,
  scrollTargetForPoint,
  scrollTargetForZoomAnchor,
  zoomAnchorFromViewport
} from "@/lib/mapViewport";
import { buildPositionOptions } from "@/lib/positions";
import { clientPointToNormalized } from "@/lib/seatMath";
import { normalizeSeat, normalizeSeats } from "@/lib/seatNormalize";
import { arrowKeyToDirection, findNearestSeatInDirection, resolveRovingSeatId } from "@/lib/seatKeyboardNav";
import { canDeleteSeat, getSeatDeleteBlockReason } from "@/lib/seatProtection";
import { canVacateSeat } from "@/lib/seatDraftActions";
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
import { clearanceFromScale, computeCodePillNudges, computeNameLabelNudges } from "@/lib/seatCrowding";
import { AiHighlightChip } from "@/components/seat-map/AiHighlightChip";
import { AskPlannerDrawer, type AskPlannerQueuedRequest } from "@/components/seat-map/AskPlannerDrawer";
import {
  ActiveFilterChips,
  FilterPanel,
  type ActiveFilterChip,
  type ResultStatusBreakdown
} from "@/components/seat-map/FilterPanel";
import { FloorPlaceholder, FloorSelector, type FloorId } from "@/components/seat-map/FloorSelector";
import { MapStatusLegend } from "@/components/seat-map/MapStatusLegend";
import { MapWashLayer } from "@/components/seat-map/MapWashLayer";
import { MapZoomControl } from "@/components/seat-map/MapZoomControl";
import { ResultsPanel, type AdminResultCard } from "@/components/seat-map/ResultsPanel";
import { SeatInspector } from "@/components/seat-map/SeatInspector";
import { useSeatDraftActions } from "@/components/seat-map/useSeatDraftActions";
import { useDraftHistory } from "@/components/seat-map/useDraftHistory";
import { usePublishReview } from "@/components/seat-map/usePublishReview";
import { useInspectorNudge } from "@/components/seat-map/useInspectorNudge";
import { SeatMarker } from "@/components/seat-map/SeatMarker";
import {
  DeleteSeatConfirmDialog,
  DiscardDraftDialog,
  InspectorGuardDialog,
  MoveEmployeeConfirmDialog,
  PublishReviewDialog,
  SwapConfirmDialog,
  VacateConfirmDialog,
  buildSwapSummary,
  seatPersonLabel
} from "@/components/seat-map/SeatMapDialogs";
import { buildOfficeRoomWashes, getOfficePlateLayout } from "@/lib/officeRoomWash";
import { buildZoneWash } from "@/lib/zoneWash";
import { useAppShellNavigation } from "@/components/ui/AppShell";
import { adminChromeDividerRule } from "@/components/ui/adminChrome";
import { focusRingClass } from "@/components/ui/design-system";
import { returnFocusAfterClose } from "@/components/ui/returnFocus";
import { SEAT_SEARCH_PLACEHOLDER, searchHandsPanelToResults } from "@/lib/viewerSeatSearch";
import { createClient as createBrowserSupabaseClient } from "@/lib/supabase/client";
import { deploySkewMonitor } from "@/lib/deploySkew";
import { assignLocation } from "@/lib/fullNavigation";

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
};

type SwapConfirmState = {
  sourceSeatId: string;
  targetSeatId: string;
} | null;

type MoveEmployeeConfirmState = { targetSeatId: string; offerSwap: boolean } | null;

type DeleteSeatConfirmState = {
  seatId: string;
  label: string;
} | null;

/**
 * Vacate here ALWAYS confirms, dirty or not — the rule inherited from the
 * now-retired canvas action bar (v12 slice 4): a transient surface that
 * appears and disappears with the selection earns less trust than a control
 * inside a panel the user deliberately opened. The rule itself lives in
 * lib/seatDraftActions (vacateNeedsConfirmation).
 */
type VacateConfirmState = {
  seatId: string;
  label: string;
  occupantName: string;
} | null;

type InspectorGuardAction =
  | { kind: "select-seat"; seatId: string; center?: boolean; sourceLabel?: string }
  | { kind: "close-inspector" }
  | { kind: "clear-selection" }
  | { kind: "start-add-seat" }
  | { kind: "start-swap-seat" }
  | { kind: "start-move-employee" }
  | { kind: "navigate-admin-page"; href: GuardedNavigationHref; destination: string };

// Whitelisted in-app destinations for the unsaved-edits guard — the closed
// set of every href the rail can emit (query-string variants listed
// explicitly). "/admin" itself joined in v12: AppRail's "Seat map" item
// targets the current page and routes through this same guard (a no-op when
// clean). The Ask Planner fallback href is a member too: the rail renders
// that <Link> only when no opener (and therefore no guard) is registered, so
// the guard never actually receives it today — but the type must not depend
// on that non-local coincidence, which is also why registration narrows via
// isGuardedNavigationHref instead of asserting.
const GUARDED_NAVIGATION_HREFS = [
  "/",
  "/admin",
  "/admin?ask-planner=open",
  "/admin/management",
  "/admin/management?tab=publishHistory",
  "/admin/settings",
  "/reception"
] as const;

type GuardedNavigationHref = (typeof GUARDED_NAVIGATION_HREFS)[number];

function isGuardedNavigationHref(href: string): href is GuardedNavigationHref {
  return (GUARDED_NAVIGATION_HREFS as readonly string[]).includes(href);
}

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
// Module constants, never inline `= []` defaults: an inline default builds a
// NEW array on every render, and the option props feed effects keyed on their
// identity (see the setLocal*Options effects), so an omitted prop would put the
// component in a permanent render→setState→render loop. Same reason the
// published defaults are hoisted.
const DEFAULT_PUBLISHED_SEATS: SeatWithEmployee[] = [];
const DEFAULT_PUBLISHED_EMPLOYEES: Employee[] = [];
const DEFAULT_DEPARTMENT_OPTIONS: DepartmentOption[] = [];
const DEFAULT_ZONE_OPTIONS: ZoneOption[] = [];
const INSPECTOR_FORM_ID = "seat-inspector-form";

// Stable identity for the Show-names-off branch of namedSeatIdSet — a fresh
// empty Set per render would defeat the nudge-pipeline memos below.
const EMPTY_SEAT_ID_SET: ReadonlySet<string> = new Set<string>();
// Map zoom is a view transform on the scroll container only (spec §9): it
// scales the rendered frame width and never touches stored seat coordinates.
// MAP_ZOOM_STEP itself is imported from lib/mapViewport, single-sourced with
// the admin/viewer clamp bounds.
// Below this width the inspector overlays as a fixed bottom sheet (max-h 60vh,
// SeatInspector.tsx) instead of docking as a width-reserving side panel — the
// `panel` breakpoint referenced throughout the seat-centering logic below.
const SEAT_CENTER_PANEL_BREAKPOINT_PX = 900;
// Default vertical anchor (fraction of viewport height from the top) used to
// center a selected seat below the panel breakpoint, so the seat lands in the
// visible strip above the 60vh bottom sheet instead of underneath it.
const SEAT_CENTER_SHEET_ANCHOR = 0.28;
// Keys the browser translates into native scrolling of the focused viewport
// (per its own aria-label: "wheel, trackpad, touch, or arrow keys to pan").
// Native scroll fights an in-flight inspector nudge the same way wheel scroll
// does, so the viewport's onKeyDown cancels the tween for these — it never
// preventDefaults, so the native scroll/navigation itself is untouched.
const VIEWPORT_NATIVE_SCROLL_KEYS: ReadonlySet<string> = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "PageUp",
  "PageDown",
  "Home",
  "End",
  " "
]);

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
  departmentOptions = DEFAULT_DEPARTMENT_OPTIONS,
  zoneOptions = DEFAULT_ZONE_OPTIONS,
  canEdit
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
  const [addSeatMode, setAddSeatMode] = useState(false);
  const [askPlannerOpen, setAskPlannerOpen] = useState(false);
  const [askPlannerQueuedRequest, setAskPlannerQueuedRequest] = useState<AskPlannerQueuedRequest | null>(null);
  const [plannerHighlightedSeatIds, setPlannerHighlightedSeatIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("all");
  const [position, setPosition] = useState("all");
  const [zone, setZone] = useState("all");
  // Transient preview of a zone chip under the pointer/focus (v12 contract
  // #8). Never a filter — it only decides which zone the map washes.
  const [hoverZone, setHoverZone] = useState<string | null>(null);
  const [status, setStatus] = useState("all");
  const [filterCollapsed, setFilterCollapsed] = useState(true);
  const [chromeMenuOpen, setChromeMenuOpen] = useState(false);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [searchShortcutHint, setSearchShortcutHint] = useState("");
  const chromeSearchInputRef = useRef<HTMLInputElement | null>(null);
  const canvasSearchInputRef = useRef<HTMLInputElement | null>(null);
  const filterTriggerRef = useRef<HTMLButtonElement | null>(null);
  const chromeMenuButtonRef = useRef<HTMLButtonElement | null>(null);
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
  // The visible range is three NUMBERS, not one object, and that is the whole
  // point — see updateMapVisibleRange for the failure it fixes. Consumers still
  // read `mapVisibleRange.left/right/viewportWidth`, so the object is rebuilt
  // here and only changes identity when a component number actually moves.
  const [mapVisibleLeft, setMapVisibleLeft] = useState(0);
  const [mapVisibleRight, setMapVisibleRight] = useState(1);
  const [mapVisibleViewportWidth, setMapVisibleViewportWidth] = useState(0);
  const mapVisibleRange = useMemo(
    () => ({ left: mapVisibleLeft, right: mapVisibleRight, viewportWidth: mapVisibleViewportWidth }),
    [mapVisibleLeft, mapVisibleRight, mapVisibleViewportWidth]
  );
  const [swapSourceSeatId, setSwapSourceSeatId] = useState<string | null>(null);
  const [swapConfirm, setSwapConfirm] = useState<SwapConfirmState>(null);
  const [moveEmployeeSourceSeatId, setMoveEmployeeSourceSeatId] = useState<string | null>(null);
  const [moveEmployeeConfirm, setMoveEmployeeConfirm] = useState<MoveEmployeeConfirmState>(null);
  const [deleteSeatConfirm, setDeleteSeatConfirm] = useState<DeleteSeatConfirmState>(null);
  const [vacateConfirm, setVacateConfirm] = useState<VacateConfirmState>(null);
  // Last keyboard-visited seat (roving tabindex anchor). The derived tab stop
  // also prefers the selected seat — see mapRovingSeatId.
  const [rovingSeatId, setRovingSeatId] = useState<string | null>(null);
  const focusInspectorAfterSelectRef = useRef(false);
  const [pending, startTransition] = useTransition();
  // Draft undo/redo lives in its own hook: the stacks, their per-tab
  // sessionStorage persistence, the client-side adjacency guard and the
  // fenced restore path all move together, while this component keeps the
  // live draft (localSeats/localEmployees) and the mode/selection state the
  // restore has to clean up. `mutationInFlight` rides along because the
  // restore path owns it: `pending` outlives the server action
  // (revalidatePath("/admin") keeps the transition busy through the RSC
  // refresh for seconds after a mutation committed), so Undo/Redo gate on
  // this narrower flag instead and enable together with the success banner
  // (the refresh only refreshes props that local state already reflects).
  const {
    undoAvailable,
    redoAvailable,
    lastUndoLabel,
    nextRedoLabel,
    mutationInFlight,
    setMutationInFlight,
    captureDraftSnapshot,
    recordDraftHistory,
    undoDraftEdit,
    redoDraftEdit,
    clearHistory,
    activityForSeat
  } = useDraftHistory({
    canEdit,
    localSeats,
    localEmployees,
    inspectorDirty,
    onRestored: applyHistoryRestore,
    onStaleDraft: handleStaleDraft,
    onNotice: setActionNotice,
    onError: setHistoryError
  });

  // Publish review + discard-all live in their own hook: the review-open
  // state, the fence captured at open, the diff memos, and both confirm
  // handlers move together, while this component keeps the draft mirrors and
  // the shared pending/mutation gates the hook commits through.
  const {
    publishReviewOpen,
    setPublishReviewOpen,
    discardDraftConfirmOpen,
    setDiscardDraftConfirmOpen,
    publishSummary,
    publishDiffRows,
    publishDiffCounts,
    openPublishReview,
    confirmPublishDraftMap,
    confirmDiscardDraftChanges
  } = usePublishReview({
    localSeats,
    localEmployees,
    localPublishedSeats,
    localPublishedEmployees,
    inspectorDirty,
    startTransition,
    setMutationInFlight,
    setActionError,
    setActionNotice,
    setStaleDraftNotice,
    setLocalPublishedSeats,
    setLocalPublishedEmployees,
    clearHistory,
    applyRestoredDraftPayload,
    handleStaleDraft
  });

  // Keyboard activation of a seat hands focus into the inspector panel once
  // the selection commits (mouse users keep their pointer focus — the flag is
  // only set from the marker layer's keydown and cleared on pointerdown).
  useEffect(() => {
    if (!focusInspectorAfterSelectRef.current) return;
    focusInspectorAfterSelectRef.current = false;
    if (!selectedSeatId) return;
    // Keyboard selection lands on something ACTIONABLE — the floating
    // inspector panel itself now that it owns the reseat verbs directly
    // (v12 slice 4 retired the canvas action bar that used to be the target).
    window.requestAnimationFrame(() => {
      document.getElementById("seat-inspector-panel")?.focus();
    });
  }, [selectedSeatId]);

  const mapViewportRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<HTMLDivElement | null>(null);

  // v12 slice 4 nudge (interaction contract #1): keeps the selected seat clear
  // of the floating inspector at the panel tier. Pan/zoom/wheel/programmatic
  // scroll paths below call cancelNudge() so a user- or code-initiated
  // scroll-position change always wins over an in-flight nudge tween.
  const { cancelNudge, skipNextNudge } = useInspectorNudge({
    viewportRef: mapViewportRef,
    frameRef: mapRef,
    selectedSeatId,
    inspectorHidden: inspectorCollapsed,
    panelBreakpointPx: SEAT_CENTER_PANEL_BREAKPOINT_PX,
    resolveSeatVisualX: seatId => {
      const seat = localSeats.find(item => item.id === seatId);
      if (!seat) return null;
      return savedPointToVisualPoint({ x: seat.x, y: seat.y }, seat).x;
    }
  });

  const askPlannerButtonRef = useRef<HTMLButtonElement | null>(null);
  // barSeatActions and the inspector's save run ONE commit path — same
  // payload, same undo snapshot, same stale-draft fence. Both commit through
  // applySeatUpdated below, so a seat vacated via the icon row (this hook
  // keeps its pre-slice-4 "bar" name from the now-retired canvas action bar
  // it originally served) records history identically to a save made in the
  // panel, and Undo cannot tell them apart.
  const barSeatActions = useSeatDraftActions({
    onBeforeSeatUpdate: captureDraftSnapshot,
    onSeatUpdated: applySeatUpdated,
    onStaleDraft: handleStaleDraft,
    onDirtyChange: setInspectorDirty
  });

  const updateMapVisibleRange = useCallback(() => {
    const viewport = mapViewportRef.current;
    const map = mapRef.current;
    if (!viewport || !map || map.offsetWidth <= 0) return;

    const mapLeftInScrollContent = map.offsetLeft;
    const left = Math.max(0, (viewport.scrollLeft - mapLeftInScrollContent) / map.offsetWidth);
    const right = Math.min(1, (viewport.scrollLeft - mapLeftInScrollContent + viewport.clientWidth) / map.offsetWidth);

    const viewportWidth = viewport.clientWidth;

    // Three primitive updaters, NOT one `setState({ left, right, viewportWidth })`.
    // React may re-run an updater against the BASE state several times while it
    // processes the queue, and it bails out only when the result is Object.is-equal
    // to what it already has. An object updater fails that test forever: replayed
    // from the base ({left:0,right:1,viewportWidth:0}) it allocates a fresh object
    // every pass, each one "new", so every pass scheduled another render. Measured
    // on /admin with no seat selected: 200 updater runs across 45 renders from a
    // single mount, with the map geometry completely static — then React gave up
    // with "Maximum update depth exceeded". Numbers compare by value, so a replay
    // returns an identical result and the bailout works on the second pass.
    setMapVisibleLeft(current => (Math.abs(current - left) < 0.002 ? current : left));
    setMapVisibleRight(current => (Math.abs(current - right) < 0.002 ? current : right));
    setMapVisibleViewportWidth(current => (Math.abs(current - viewportWidth) < 1 ? current : viewportWidth));
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

  // Plug this surface into the persistent rail (AppShell, mounted by the
  // (shell) layout): the unsaved-edits veto covers EVERY rail destination
  // through one generic callback — there is no per-link call site to forget
  // the guard on — and Ask Planner opens in place instead of navigating.
  // Both closures are read fresh via the hook's ref, and the registration
  // clears itself when this page unmounts.
  useAppShellNavigation({
    // The rail's contract is `string`; narrow instead of asserting. An href
    // outside the closed set is not a guarded admin destination and navigates
    // without the veto — today the set mirrors everything the rail can emit,
    // so this branch only exists for hrefs a future rail adds before this
    // list learns about them.
    guard: (href, label) => (isGuardedNavigationHref(href) ? beforeGuardedNavigation(href, label) : true),
    openAskPlanner: openAskPlannerDrawer
  });

  // ?ask-planner=open contract (v12): a sub-page's AI rail item falls back to
  // <Link href="/admin?ask-planner=open"> when onOpenAskPlanner is absent
  // (AppRail's own interface — see Task 1). Landing here opens the drawer in
  // place and strips ONLY the ask-planner key — not a `replaceState(null, "",
  // "/admin")` rewrite, which would both null out Next App Router's history
  // state (the seat deep-link write effect below passes `window.history.state`
  // verbatim for exactly this reason) and drop every other query param, e.g.
  // the ?seat= deep link (#196), out of a combined
  // /admin?seat=<label>&ask-planner=open URL.
  useEffect(() => {
    if (!canEdit) return;
    if (!window.location.search.includes("ask-planner=open")) return;
    openAskPlannerDrawer();
    const params = new URLSearchParams(window.location.search);
    params.delete("ask-planner");
    const query = params.toString();
    const next = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
    window.history.replaceState(window.history.state, "", next);
  }, [canEdit, openAskPlannerDrawer]);

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

  // Same dismissal rule for the chrome-bar "More" menu (the v12 kebab).
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
      // The inset used to cancel the viewport's matting padding; with the
      // matting gone it is the prototype's breathing margin instead, so the
      // fitted plan never butts flush against the rail or the window edge.
      const availableWidth = Math.max(1, viewportElement.clientWidth - 16);
      const availableHeight = Math.max(1, viewportElement.clientHeight - 16);
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

      if (discardDraftConfirmOpen) {
        setDiscardDraftConfirmOpen(false);
        return;
      }

      if (inspectorGuardAction) {
        keepEditingInspector();
        return;
      }

      if (deleteSeatConfirm) {
        setDeleteSeatConfirm(null);
        return;
      }

      if (vacateConfirm) {
        setVacateConfirm(null);
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

      if (moveEmployeeConfirm) {
        setMoveEmployeeConfirm(null);
        return;
      }

      if (askPlannerOpen) {
        closeAskPlannerDrawer();
        return;
      }

      if (chromeMenuOpen) {
        setChromeMenuOpen(false);
        return;
      }

      if (addSeatMode || swapSourceSeatId || moveEmployeeSourceSeatId) {
        const canceledMode = swapSourceSeatId ? "Swap" : moveEmployeeSourceSeatId ? "Move" : "Add seat";
        setAddSeatMode(false);
        setSwapSourceSeatId(null);
        setMoveEmployeeSourceSeatId(null);
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
  }, [addSeatMode, askPlannerOpen, chromeMenuOpen, closeAskPlannerDrawer, deleteSeatConfirm, department, discardDraftConfirmOpen, filterCollapsed, inspectorDirty, inspectorGuardAction, moveEmployeeConfirm, moveEmployeeSourceSeatId, position, publishReviewOpen, search, selectedSeatId, setActionNotice, setDiscardDraftConfirmOpen, setPublishReviewOpen, status, swapConfirm, swapSourceSeatId, vacateConfirm, zone]);

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
    // Deferred a frame, same as the viewer's twin effect: a sync setState in
    // this hydration-time mount effect can bail the Suspense boundary into a
    // client re-render that discards this mount — and by then the write
    // effect below has already stripped the param, so the remount finds
    // nothing to select. Observed live on /admin?seat=… (v1.25.0 QA); the
    // rAF lands the selection after hydration settles.
    const frame = window.requestAnimationFrame(() => {
      if (commitSeatSelection(seatId)) {
        // Finding 1 (v12 slice 4 final review): this selection also queues a
        // programmatic center below — arm the skip in the same commit so the
        // nudge trigger effect (scheduled by the selectedSeatId change just
        // made) never races the center's native smooth scrollTo. Only arm it
        // when the selection is actually changing: if seatId was already
        // selected, commitSeatSelection made no state change, so the trigger
        // effect's deps never move to consume the flag — arming it
        // unconditionally would leave it stuck, silently skipping some later,
        // unrelated selection's legitimate nudge.
        if (selectedSeatId !== seatId) skipNextNudge();
        queueCenterSeatInMap(seatId);
      }
    });
    return () => window.cancelAnimationFrame(frame);
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
  const draftChangedSeatLabelSet = useMemo(() => new Set([
    ...publishSummary.addedSeats,
    ...publishSummary.assignmentChanges,
    ...publishSummary.vacatedSeats,
    ...publishSummary.statusChanges,
    ...publishSummary.otherChanges
  ].map(item => item.label)), [publishSummary]);
  // Legend counts follow the active constraints — the number row must not
  // contradict a filtered map (2026-07-16 regrade, review 4). matchesFilters
  // covers search + structured filters, exactly what the map dims by.
  const filterCriteria: SeatFilterCriteria = { search, department, position, zone, status };
  // One source for "is anything narrowing the map?". The legend and the result
  // list used to derive this separately and agreed only by coincidence.
  const legendFiltersActive = hasActiveConstraints(filterCriteria);
  const legendSourceSeats = legendFiltersActive ? localSeats.filter(matchesFilters) : localSeats;
  const legendCounts: Record<string, number> = {
    assigned: legendSourceSeats.filter(seat => seat.status === "assigned").length,
    available: legendSourceSeats.filter(seat => seat.status === "available").length,
    reserved: legendSourceSeats.filter(seat => seat.status === "reserved").length,
    unavailable: legendSourceSeats.filter(seat => seat.status === "unavailable").length,
    "draft-changed": draftChangedSeatLabelSet.size
  };

  const selectedSeat = localSeats.find(seat => seat.id === selectedSeatId) ?? null;
  const swapSourceSeat = swapSourceSeatId ? localSeats.find(seat => seat.id === swapSourceSeatId) ?? null : null;
  const swapTargetSeat = swapConfirm ? localSeats.find(seat => seat.id === swapConfirm.targetSeatId) ?? null : null;
  const moveEmployeeSourceSeat = moveEmployeeSourceSeatId ? localSeats.find(seat => seat.id === moveEmployeeSourceSeatId) ?? null : null;
  const moveEmployeeTargetSeat = moveEmployeeConfirm ? localSeats.find(seat => seat.id === moveEmployeeConfirm.targetSeatId) ?? null : null;
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
  const structuredFiltersActive = countStructuredFilters(filterCriteria) > 0;
  const activeFilterChips: ActiveFilterChip[] = [
    searchActive ? { id: "search", label: "Search", value: searchQuery, removeLabel: `Remove search filter ${searchQuery}` } : null,
    department !== "all" ? { id: "department", label: "Department", value: department, removeLabel: `Remove department filter ${department}` } : null,
    position !== "all" ? { id: "position", label: "Position", value: position, removeLabel: `Remove position filter ${position}` } : null,
    zone !== "all" ? { id: "zone", label: "Zone", value: zone, removeLabel: `Remove zone filter ${zone}` } : null,
    status !== "all" ? { id: "status", label: "Status", value: STATUS_LABELS[status as SeatStatus] ?? status, removeLabel: `Remove status filter ${STATUS_LABELS[status as SeatStatus] ?? status}` } : null
  ].filter(Boolean) as ActiveFilterChip[];
  const structuredFilterCount = countStructuredFilters(filterCriteria);
  const activeFilterCount = activeFilterChips.length;
  const filtersActive = legendFiltersActive;
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
  // Session-local activity for the inspector's Activity section: undo-history
  // labels that name the selected seat (newest first). Client-side only.
  const selectedSeatActivity = useMemo(
    () => activityForSeat(selectedSeat?.label),
    [activityForSeat, selectedSeat]
  );

  function eventToPoint(event: Pick<PointerEvent<HTMLElement>, "clientX" | "clientY">) {
    const rect = mapRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return clientPointToNormalized(event.clientX, event.clientY, rect);
  }

  // Kept as a local binding so every call site here reads the same, and so the
  // predicate itself stays one tested definition in lib/seatFilters.ts.
  function matchesFilters(seat: SeatWithEmployee) {
    return seatMatchesFilters(seat, filterCriteria);
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
    setSwapSourceSeatId(null);
    setSwapConfirm(null);
    setMoveEmployeeSourceSeatId(null);
    setMoveEmployeeConfirm(null);
    setDeleteSeatConfirm(null);
    setInspectorCollapsed(false);
    focusSeatMarker(seatIdToFocus);
  }

  function applyClearSelectionAction() {
    const seatIdToFocus = selectedSeatId;
    setSelectedSeatId(null);
    setInspectorDirty(false);
    setAddSeatMode(false);
    setSwapSourceSeatId(null);
    setSwapConfirm(null);
    setMoveEmployeeSourceSeatId(null);
    setMoveEmployeeConfirm(null);
    setDeleteSeatConfirm(null);
    setInspectorCollapsed(false);
    focusSeatMarker(seatIdToFocus);
  }

  function applyStartAddSeatAction() {
    setSelectedSeatId(null);
    setInspectorDirty(false);
    setSwapSourceSeatId(null);
    setSwapConfirm(null);
    setMoveEmployeeSourceSeatId(null);
    setMoveEmployeeConfirm(null);
    setAddSeatMode(true);
    setInspectorCollapsed(false);
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
    setAddSeatMode(false);
    setSwapConfirm(null);
    setMoveEmployeeSourceSeatId(null);
    setMoveEmployeeConfirm(null);
    setSwapSourceSeatId(selectedSeat.id);
    setInspectorCollapsed(true);
  }

  function applyStartMoveEmployeeAction() {
    if (!selectedSeat || !canVacateSeat(selectedSeat)) {
      setActionError("Select an occupied seat first, then choose Move.");
      setActionNotice(null);
      return;
    }
    setActionError(null);
    setActionNotice(null);
    setInspectorDirty(false);
    setAddSeatMode(false);
    setSwapConfirm(null);
    setSwapSourceSeatId(null);
    setMoveEmployeeConfirm(null);
    setMoveEmployeeSourceSeatId(selectedSeat.id);
    setInspectorCollapsed(true);
  }

  function applyInspectorGuardAction(action: InspectorGuardAction) {
    if (action.kind === "select-seat") {
      const isNewSelection = selectedSeatId !== action.seatId;
      commitSeatSelection(action.seatId);
      if (action.center) {
        setFilterCollapsed(true);
        // Finding 1: same race as openSeatFromResults — this is its
        // dirty-guard-deferred continuation, so it arms the skip too (only
        // when the selection is actually changing — see the deep-link
        // effect above for why an unconditional arm would go stale).
        if (isNewSelection) skipNextNudge();
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

    if (action.kind === "start-swap-seat") {
      applyStartSwapSeatAction();
      return;
    }

    if (action.kind === "start-move-employee") {
      applyStartMoveEmployeeAction();
      return;
    }

    // Guarded navigation, resumed after save/discard. Soft on purpose — the
    // persistent rail stays mounted and the destination streams its skeleton
    // — with the same deliberate full-document downgrade AppRail applies when
    // this tab's bundle no longer matches the live deployment.
    if (deploySkewMonitor.isSkewed()) {
      assignLocation(action.href);
      return;
    }
    router.push(action.href);
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
    if (action.kind === "start-swap-seat") return "starting swap-seats mode.";
    if (action.kind === "start-move-employee") return "starting move-employee mode.";
    return `opening ${action.destination}.`;
  }

  /**
   * The single commit path for a saved seat, shared by the inspector's form
   * and its icon-row Vacate (v12 slice 4 retired the canvas action bar those
   * verbs used to live on). Extracted from the inspector's inline prop so
   * both paths record undo history the same way — a vacate must be
   * indistinguishable from a save made in the panel, or Undo starts behaving
   * differently depending on which control the user clicked.
   *
   * `freshDraftPayload` is only ever passed for a force_move commit (inspector
   * "Move them?" retry). force_move also vacates the mover's OTHER draft seat
   * server-side, which bumps THAT row's updated_at via the DB trigger — the
   * caller here only has `seat` (the target row) plus its own now-stale
   * pre-mutation copy of the vacated seat, and reconstructing that seat by
   * spreading the stale copy bakes a stale updated_at into localSeats that
   * fails the next Undo's per-row concurrency fence (MLS02, fix round 1,
   * 2026-07-30 — reproduced live). Ingest the fresh payload wholesale instead,
   * same as swap. Ordinary saves and Vacate never touch a second row, so they
   * keep the plain spread-and-replace path.
   */
  function applySeatUpdated(
    seat: SeatWithEmployee,
    beforeSnapshot: DraftSnapshot,
    freshDraftPayload?: { seats: SeatWithEmployee[]; employees: Employee[] }
  ) {
    setActionError(null);
    setActionNotice(null);
    setInspectorDirty(false);
    const afterSeats = freshDraftPayload ? normalizeSeats(freshDraftPayload.seats) : replaceSeat(beforeSnapshot.seats, seat);
    const afterEmployees = freshDraftPayload ? freshDraftPayload.employees : replaceEmployee(beforeSnapshot.employees, seat);
    recordDraftHistory(describeSeatUpdate(beforeSnapshot, seat), beforeSnapshot, afterSeats, afterEmployees);
    setLocalSeats(afterSeats);
    setLocalEmployees(afterEmployees);
    setActionNotice(`Saved changes to ${seat.label}.`);
    if (pendingInspectorSaveAction) {
      const action = pendingInspectorSaveAction;
      setPendingInspectorSaveAction(null);
      window.requestAnimationFrame(() => applyInspectorGuardAction(action));
    }
  }

  // Named for the now-retired canvas action bar this used to sit on (v12
  // slice 4 moved it to the inspector's icon row). Never vacates directly —
  // it always raises the confirm first, because it is a transient surface
  // (lib/seatDraftActions: vacateNeedsConfirmation).
  function requestVacateFromBar() {
    if (!selectedSeat || !canVacateSeat(selectedSeat)) return;
    setActionError(null);
    setActionNotice(null);
    setVacateConfirm({
      seatId: selectedSeat.id,
      label: selectedSeat.label,
      occupantName: selectedSeat.employee?.full_name ?? "this employee"
    });
  }

  function confirmVacateFromBar() {
    if (!vacateConfirm) return;
    // Re-resolve from live state: the dialog holds an id, not a seat, so a
    // refresh between opening and confirming cannot commit a stale row.
    const seatToVacate = localSeats.find(seat => seat.id === vacateConfirm.seatId) ?? null;
    setVacateConfirm(null);
    if (!seatToVacate || !canVacateSeat(seatToVacate)) return;

    setActionError(null);
    setActionNotice(null);
    setStaleDraftNotice(null);
    setMutationInFlight(true);

    void barSeatActions.vacateSeat(seatToVacate).then(outcome => {
      setMutationInFlight(false);
      if (outcome.kind === "stale") return;
      if (outcome.kind === "saved") {
        // applySeatUpdated already set the generic save notice; name the actual
        // verb, since "Saved changes to C01" reads oddly for a vacate.
        setActionNotice(`Vacated ${outcome.seat.label}.`);
        return;
      }
      setActionNotice(null);
      setActionError(outcome.message);
    });
  }

  function applyRestoredDraftPayload(payload: { seats: SeatWithEmployee[]; employees: Employee[] }) {
    const restoredSeats = normalizeSeats(payload.seats);
    setLocalSeats(restoredSeats);
    setLocalEmployees(payload.employees);
    setSelectedSeatId(current => (current && restoredSeats.some(seat => seat.id === current) ? current : null));
    setInspectorDirty(false);
    setAddSeatMode(false);
    setSwapSourceSeatId(null);
    setSwapConfirm(null);
    setMoveEmployeeSourceSeatId(null);
    setMoveEmployeeConfirm(null);
  }

  // Undo/Redo restore half: useDraftHistory owns the fenced server call and
  // hands back the fresh draft, this component owns what the restored state
  // does to the surface. `selectSeatLabel` only arrives when redoing an "Add
  // …" entry, so the re-created seat lands selected in an open inspector.
  function applyHistoryRestore(
    payload: { seats: SeatWithEmployee[]; employees: Employee[] },
    options?: { selectSeatLabel?: string }
  ) {
    applyRestoredDraftPayload(payload);
    const selectLabel = options?.selectSeatLabel;
    if (!selectLabel) return;
    const restoredSeat = payload.seats.find(seat => seat.label === selectLabel);
    if (!restoredSeat) return;
    setSelectedSeatId(restoredSeat.id);
    setInspectorCollapsed(false);
  }

  // Error sink for useDraftHistory. Clearing the error also clears the
  // stale-draft banner, because the hook clears the transient banners in one
  // breath before it commits a restore and staleDraftNotice is banner state
  // too (it is deliberately NOT part of actionError — see its declaration).
  function setHistoryError(message: string | null) {
    setActionError(message);
    if (message === null) setStaleDraftNotice(null);
  }

  // The draft-concurrency fence fired: another admin session changed the draft
  // after this page loaded it. The local undo/redo baselines (and any pending
  // mode) predate those edits, so keeping them would re-arm the same stale
  // write — drop them and re-seed from the server.
  function handleStaleDraft(message: string) {
    setActionNotice(null);
    setActionError(null);
    setStaleDraftNotice(`${message} This page has been refreshed with the latest draft.`);
    clearHistory();
    setInspectorDirty(false);
    setInspectorResetSignal(current => current + 1);
    setAddSeatMode(false);
    setSwapSourceSeatId(null);
    setSwapConfirm(null);
    setMoveEmployeeSourceSeatId(null);
    setMoveEmployeeConfirm(null);
    router.refresh();
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
    // A programmatic center supersedes any in-flight inspector nudge.
    cancelNudge();
    const viewport = mapViewportRef.current;
    const map = mapRef.current;
    if (!viewport || !map) return;

    const target = scrollTargetForPoint({ x, y }, map, viewport, options?.verticalViewportAnchor ?? 0.5);
    viewport.scrollTo({ ...target, behavior: "smooth" });
  }, [cancelNudge]);

  const centerMapViewport = useCallback((behavior: ScrollBehavior = "smooth") => {
    const viewport = mapViewportRef.current;
    if (!viewport) return;

    viewport.scrollTo({ ...centerScrollTarget(viewport), behavior });
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
    cancelNudge();
    const clamped = clampZoom(nextZoom);

    // A no-op zoom must not arm pendingZoomCenterRef: setZoomFactor bails on
    // an unchanged value, the [zoomFactor] effect never consumes the anchor,
    // and the stale anchor hijacks the next zoom change from any other path.
    if (mapViewMode === "detail" && clamped === zoomFactor) return;

    if (mapViewMode !== "detail") {
      setMapViewMode("detail");
      setZoomFactor(clamped);
      window.requestAnimationFrame(() => centerMapViewport("auto"));
      return;
    }

    const viewport = mapViewportRef.current;
    const map = mapRef.current;
    if (viewport && map) {
      pendingZoomCenterRef.current = zoomAnchorFromViewport(viewport, map);
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
      viewport.scrollTo({ ...scrollTargetForZoomAnchor(center, map, viewport), behavior: "auto" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [zoomFactor]);

  function fitMapToView() {
    cancelNudge();
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
    cancelNudge();
    if (mapViewMode !== "detail" || floor !== "3") return;
    if (event.button !== 0) return;
    if (canEdit && addSeatMode) return;
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
    if (!pan.moved && hasPassedPanThreshold(deltaX, deltaY)) pan.moved = true;
    const panned = panScrollTarget({ scrollLeft: pan.startScrollLeft, scrollTop: pan.startScrollTop }, deltaX, deltaY);
    viewport.scrollLeft = panned.left;
    viewport.scrollTop = panned.top;
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
    if (swapSourceSeatId || moveEmployeeSourceSeatId) {
      setActionNotice(null);
      return;
    }
    if (selectedSeatId && inspectorDirty) {
      requestInspectorGuard({ kind: "clear-selection" });
      return;
    }
    setSelectedSeatId(null);
    setInspectorDirty(false);
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

    const center = boundingBoxCenter(seatsToFit.map(seat => savedPointToVisualPoint({ x: seat.x, y: seat.y }, seat)));
    if (center) scrollMapToPoint(center.x, center.y);
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

  function requestMoveEmployeeTarget(targetSeatId: string) {
    if (!moveEmployeeSourceSeatId) return false;
    if (targetSeatId === moveEmployeeSourceSeatId) {
      // Spec: clicking the person's own seat backs out of the move.
      cancelMoveEmployeeMode();
      return true;
    }
    const sourceSeat = localSeats.find(seat => seat.id === moveEmployeeSourceSeatId) ?? null;
    const targetSeat = localSeats.find(seat => seat.id === targetSeatId) ?? null;
    if (!sourceSeat?.employee || !targetSeat) {
      setActionError("Could not find both seats for the move.");
      return false;
    }
    setActionError(null);
    setActionNotice(null);
    setMoveEmployeeConfirm({ targetSeatId: targetSeat.id, offerSwap: Boolean(targetSeat.employee_id) });
    return true;
  }

  function commitSeatSelection(seatId: string) {
    if (canEdit && moveEmployeeSourceSeatId) {
      return requestMoveEmployeeTarget(seatId);
    }

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
      setAddSeatMode(false);
      setSwapSourceSeatId(null);
      setSwapConfirm(null);
      setMoveEmployeeSourceSeatId(null);
      setMoveEmployeeConfirm(null);
      setInspectorCollapsed(false);
      return true;
    }

    setSelectedSeatId(seatId);
    setInspectorDirty(false);
    setAddSeatMode(false);
    setSwapSourceSeatId(null);
    setSwapConfirm(null);
    setMoveEmployeeSourceSeatId(null);
    setMoveEmployeeConfirm(null);
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

    const isNewSelection = selectedSeatId !== seatId;
    if (!selectSeat(seatId)) return;

    setFilterCollapsed(true);
    // Finding 1 (v12 slice 4 final review): arm the skip in the same commit
    // as this selection so the nudge trigger effect never races this queued
    // center's native smooth scrollTo (see useInspectorNudge's skipNextNudge).
    // Only when the selection is actually changing — reselecting the already-
    // selected seat (e.g. re-opening its own results row) leaves selectedSeatId
    // unchanged, so the trigger effect's deps never move to consume the flag;
    // arming it anyway would leave it stuck and silently skip a later,
    // unrelated selection's legitimate nudge.
    if (isNewSelection) skipNextNudge();
    queueCenterSeatInMap(seatId);
  }

  function selectSeatResult(seatId: string) {
    openSeatFromResults(seatId, "seat results");
  }

  function startAddSeatMode() {
    if (selectedSeatId && inspectorDirty) {
      requestInspectorGuard({ kind: "start-add-seat" });
      return;
    }
    applyStartAddSeatAction();
  }

  function cancelAddSeatMode() {
    setAddSeatMode(false);
  }

  function beforeGuardedNavigation(href: GuardedNavigationHref, destination: string) {
    // selectedSeatId is part of the condition, not just inspectorDirty, and
    // that is load-bearing: the guard dialog below only renders when a seat
    // is selected (`inspectorGuardAction && selectedSeat`), so vetoing on a
    // dirty-with-no-selection state would silently eat the click — no
    // navigation, no dialog, nothing. Every other guard call site already
    // pairs the two checks; this one swallowed rail clicks when dirty went
    // transiently true without a selection.
    if (!selectedSeatId || !inspectorDirty) return true;
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

  function startMoveEmployeeMode(skipDirtyCheck = false) {
    if (!canEdit) return;
    if (!selectedSeat || !canVacateSeat(selectedSeat)) {
      setActionError("Select an occupied seat first, then choose Move.");
      setActionNotice(null);
      return;
    }
    if (!skipDirtyCheck && inspectorDirty) {
      requestInspectorGuard({ kind: "start-move-employee" });
      return;
    }
    applyStartMoveEmployeeAction();
  }

  function cancelMoveEmployeeMode() {
    setMoveEmployeeSourceSeatId(null);
    setMoveEmployeeConfirm(null);
    setInspectorCollapsed(false);
    setActionNotice("Move canceled — no changes made.", "neutral");
  }

  function executeSwap(sourceSeatId: string, targetSeatId: string) {
    const sourceSeat = localSeats.find(seat => seat.id === sourceSeatId) ?? null;
    const targetSeat = localSeats.find(seat => seat.id === targetSeatId) ?? null;

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
        setAddSeatMode(false);
        setSwapSourceSeatId(null);
        setSwapConfirm(null);
        setMoveEmployeeSourceSeatId(null);
        setMoveEmployeeConfirm(null);
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

  function confirmSwapSeats() {
    if (!swapConfirm) return;
    executeSwap(swapConfirm.sourceSeatId, swapConfirm.targetSeatId);
  }

  function confirmMoveEmployeeAsSwap() {
    if (!moveEmployeeConfirm?.offerSwap || !moveEmployeeSourceSeatId) return;
    const targetSeatId = moveEmployeeConfirm.targetSeatId;
    const sourceSeatId = moveEmployeeSourceSeatId;
    setMoveEmployeeConfirm(null);
    setMoveEmployeeSourceSeatId(null);
    executeSwap(sourceSeatId, targetSeatId);
  }

  function confirmMoveEmployeeToOpenSeat() {
    if (!moveEmployeeConfirm || moveEmployeeConfirm.offerSwap) return;
    const sourceSeat = moveEmployeeSourceSeat;
    const targetSeat = localSeats.find(seat => seat.id === moveEmployeeConfirm.targetSeatId) ?? null;
    const mover = sourceSeat?.employee ?? null;
    if (!sourceSeat || !targetSeat || !mover) {
      setActionError("Could not find both seats for the move.");
      setMoveEmployeeConfirm(null);
      return;
    }
    const beforeSnapshot = captureDraftSnapshot();
    const moveLabel = `Move ${mover.full_name} to ${targetSeat.label}`;
    setMoveEmployeeConfirm(null);
    startTransition(async () => {
      setMutationInFlight(true);
      try {
        setActionError(null);
        setActionNotice(null);
        setStaleDraftNotice(null);
        const result = await updateSeatAction({
          seatId: targetSeat.id,
          label: targetSeat.label,
          status: "assigned",
          employeeId: mover.id,
          employeeName: mover.full_name,
          // Position/extension omitted on purpose: absent fields are
          // "not provided" to the RPC, which preserves stored values.
          department: mover.department ?? null,
          zone: targetSeat.zone ?? null,
          notes: targetSeat.notes ?? null,
          forceMove: true,
          // Fence on the DESTINATION row; the RPC vacates the source atomically.
          expectedUpdatedAt: targetSeat.updated_at
        });
        if (!result.ok) {
          if (result.code === "STALE_DRAFT") {
            handleStaleDraft(result.message);
            return;
          }
          setActionNotice(null);
          setActionError(result.message);
          return;
        }
        // The RPC vacated the source server-side, bumping ITS updated_at too —
        // ingest the fresh draft payload wholesale (same as swap) instead of
        // reconstructing the source seat from the client's now-stale copy,
        // which would bake a stale timestamp into localSeats and fail the
        // next Undo's per-row concurrency fence (MLS02, fix round 1, 2026-07-30).
        const afterSeats = normalizeSeats(result.seats);
        const afterEmployees = result.employees;
        recordDraftHistory(moveLabel, beforeSnapshot, afterSeats, afterEmployees);
        setLocalSeats(afterSeats);
        setLocalEmployees(afterEmployees);
        setSelectedSeatId(targetSeat.id);
        setInspectorDirty(false);
        setMoveEmployeeSourceSeatId(null);
        setInspectorCollapsed(false);
        setActionNotice(`Moved ${formatDisplayName(mover.full_name)} to ${targetSeat.label}.`);
      } catch (error) {
        setActionNotice(null);
        setActionError(error instanceof Error ? error.message : "Could not move the employee.");
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
          recordDraftHistory(addedSeatHistoryLabel(created.label), beforeSnapshot, afterSeats, beforeSnapshot.employees);
          setLocalSeats(afterSeats);
          setSelectedSeatId(created.id);
          setInspectorDirty(false);
          setAddSeatMode(false);
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

    if (swapSourceSeatId || moveEmployeeSourceSeatId) {
      setActionNotice(null);
      return;
    }

    if (selectedSeatId && inspectorDirty) {
      requestInspectorGuard({ kind: "clear-selection" });
      return;
    }
    setSelectedSeatId(null);
    setInspectorDirty(false);
  }

  // Identity-stable handle for the memoized SeatMarker.
  //
  // selectSeat is re-created on every render — passing it directly hands
  // ~2000 markers a new prop every render and defeats the memo entirely.
  // useCallback cannot help: its dependency is exactly the value that keeps
  // changing.
  //
  // Instead the latest function lives in a ref that is refreshed each render,
  // and the markers receive a wrapper whose identity never changes. The
  // wrapper reads the ref at call time, so it always runs the current closure
  // — this is stable identity WITHOUT the stale-closure bug that a useCallback
  // with trimmed dependencies would introduce.
  // Refreshed in an effect, not during render: writing a ref mid-render trips
  // react-hooks' "Cannot access refs during render". Effects flush before the
  // browser dispatches the next pointer event, so a marker always calls the
  // current handler.
  const latestSeatHandlers = useRef({ selectSeat });
  useEffect(() => {
    latestSeatHandlers.current = { selectSeat };
  });

  const stableSelectSeat = useCallback((seatId: string) => {
    latestSeatHandlers.current.selectSeat(seatId);
  }, []);

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
        setSwapSourceSeatId(null);
        setSwapConfirm(null);
        setMoveEmployeeSourceSeatId(null);
        setMoveEmployeeConfirm(null);
        setActionNotice(`Deleted custom seat ${deletedSeatLabel}. Undo is available until publish.`);
      } catch (error) {
        setActionNotice(null);
        setActionError(error instanceof Error ? error.message : "Could not delete custom seat.");
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
  // display and the publish-review entry point). Both strings are computed
  // unconditionally but only ever READ inside the `publishSummary.hasChanges
  // &&` cluster below (contract #4: no idle status chip renders when the
  // draft matches published), so the has-changes branch is the only reachable
  // one — no dead "matches published" arm to keep in sync.
  const draftStatusLabel = `${publishSummary.totalChangeCount} unpublished ${publishSummary.totalChangeCount === 1 ? "change" : "changes"}`;
  const draftStatusTitle = `Review draft changes: ${draftChangeBreakdown || `${publishSummary.totalChangeCount} total`}`;
  const activeMode = addSeatMode
    ? {
      label: "Add seat",
      message: "Click inside a seating zone to place an automatically numbered custom marker.",
      exitLabel: "Exit add seat",
      onExit: cancelAddSeatMode
    }
    : moveEmployeeSourceSeat
      ? {
        label: "Move employee",
        message: `Moving ${seatPersonLabel(moveEmployeeSourceSeat)} from ${moveEmployeeSourceSeat.label}. Select the destination seat.`,
        exitLabel: "Exit move employee",
        onExit: cancelMoveEmployeeMode
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
  // owns the panel slot (its microcopy lives in the occupant, INV-4).
  const modeCardOpen = canEdit && Boolean(activeMode) && (!selectedSeat || inspectorCollapsed);
  // v12 slice 4: the inspector FLOATS (contract #1) — only the docking
  // occupants reserve stage width now (results panel / mode card, contract #2).
  const rightSlotTier: "expanded" | "none" = resultsPanelOpen || modeCardOpen ? "expanded" : "none";
  const stageReservedClassName = rightSlotTier === "expanded" ? "panel:pr-[332px]" : "";

  // The collapse rail is retired (v12 slice 4): `inspectorCollapsed` is now
  // purely the auto-yield flag. Whenever nothing owns the right region anymore
  // and a seat is still selected, the inspector returns on its own — there is
  // no rail left for the user to click.
  useEffect(() => {
    if (!inspectorCollapsed || !selectedSeatId) return;
    if (resultsPanelOpen || modeCardOpen || askPlannerOpen || swapSourceSeatId || moveEmployeeSourceSeatId) return;
    setInspectorCollapsed(false);
  }, [inspectorCollapsed, selectedSeatId, resultsPanelOpen, modeCardOpen, askPlannerOpen, swapSourceSeatId, moveEmployeeSourceSeatId]);
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
    Boolean(swapConfirm) ||
    Boolean(moveEmployeeConfirm)
  );
  const mobileMapControlsHidden = mobileMapInteractionSurfaceOpen;
  // Which surfaces own the bottom of the screen below the panel tier, where
  // they are full-width sheets rather than side docks. Wider than
  // mobileMapInteractionSurfaceOpen on purpose: that one is canEdit-gated
  // (it guards edit affordances), while a sheet covers the legend whether or
  // not this session can edit, and the results panel is a sheet down there too.
  const bottomSheetOwnsBottom = mobileMapInteractionSurfaceOpen || resultsPanelOpen || Boolean(selectedSeat);
  const mapViewportClassName = [
    // v12 slice 3: the mounted-sheet treatment (hairline border + elevation +
    // matting padding) is gone. The plan is layer-00 now — it runs edge to
    // edge and the workspace band shows through around it, so there is no
    // card edge left to draw. Everything that reads over the map floats as a
    // layer-01 white card instead.
    "relative mx-auto w-full max-w-full overscroll-contain bg-[var(--admin-map-workspace)] lg:h-full lg:min-h-0 lg:flex-1 lg:max-h-none",
    mapViewMode === "overview"
      // Below lg the viewport fills the screen under the chrome instead of
      // sizing itself to the plan. The old `sm:min-h-[480px] sm:max-h-none`
      // pair was content-driven, which was fine while a toolbar row and a
      // status footer sat in flow around the map and a hairline border drew
      // the sheet's edge — slice 3 floated both and dropped the border, so the
      // leftover column showed as bare page below a hard seam (measured 249px
      // at 860x809: 809 window − 36px bar − 44px search row − 480px viewport).
      // The two greiges differ — workspace #ECE8E0 against page #F7F6F2 — so
      // it read as the page running out rather than as workspace. 80px is the
      // exact sub-lg chrome above the map, derived from the classes: the 36px
      // bar (--admin-chrome-h) plus the 44px in-flow canvas search row
      // (`lg:hidden`, h-9 input = 36px + pb-2 = 8px; its `block` label
      // collapses to the input, so there is no extra baseline strut — measured
      // in Chromium at 360/390/430/640/860/1023). An exact height also keeps
      // this the one vertical scroll owner (#197), the job the 82svh ceiling
      // used to do. The min-h-[300px] floor still wins on very short windows
      // and the page scrolls a little; that beats a stub of a map.
      // Centring moves up to sm from lg: with the aspect lock gone the
      // letterbox band lands INSIDE the viewport on the workspace tone at
      // every width, and the viewer centres its fit view from sm up — leaving
      // this lg-only would top-align the plan and pile the whole band under it
      // at 640-1023, splitting the two surfaces at the same widths.
      ? "min-h-[300px] h-[calc(100svh-80px)] overflow-auto sm:flex sm:items-center sm:justify-center sm:overflow-hidden"
      // The sm cap budgets the stacked chrome above the map, and it is the
      // same 80px: 36px bar + 44px canvas search row. It read 88 while the
      // search row was an estimate (36 + ~52); the row measures 44, so 88 left
      // an 8px sliver of page below the map — the small version of the band
      // the overview branch above exists to close. Below lg the pan viewport
      // is the one vertical scroll owner (#197), so the page itself doesn't
      // grow a second scrollbar next to it. On short windows the min-h floor
      // wins and the page scrolls a little; that beats a stub of a map.
      : "min-h-[360px] max-h-[82svh] overflow-auto sm:min-h-[420px] sm:max-h-[calc(100svh-80px)] lg:min-h-0 lg:max-h-none lg:[-ms-overflow-style:none] lg:[scrollbar-width:none] lg:[&::-webkit-scrollbar]:hidden",
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
  // One stage class in both states. Overview used to pin the stage to the
  // plan's 1911/867 aspect so leftover column height could not letterbox the
  // plan between dead beige bands — but that fix (PR #144) was for a MATTED
  // sheet, where those bands read as broken card. Full-bleed, the band around
  // the plan IS the workspace surface, so the stage takes the whole column and
  // the contain-fit inside it centres the plan on that surface. The aspect pin
  // had also become the defect: it ended the viewport at the aspect height and
  // left the rest of a tall window as bare page (measured ~190px at 1440x849).
  // Dropping it cannot start a fit-calc feedback loop either — that loop needs
  // a CONTENT-derived stage height, and at lg the height comes from the screen
  // (root lg:h-screen down the lg:flex-1 / lg:min-h-0 chain), never from the
  // frame width the overview ResizeObserver computes.
  const mapStageClassName = "relative min-w-0 lg:flex lg:min-h-0 lg:flex-1";
  const mapCrumbLabel = floor === "2" ? "Not yet mapped" : `Draft map · ${stats.total} ${stats.total === 1 ? "seat" : "seats"}`;
  const mapMarkerLayerClassName = [
    "absolute inset-0",
    mobileMapControlsHidden ? "hidden sm:block" : ""
  ].filter(Boolean).join(" ");
  const actionErrorBannerClassName = [
    // pointer-events-auto: the alerts now sit in a pointer-events-none overlay
    // layer above the canvas, so each banner has to opt its own box back in.
    "pointer-events-auto min-w-0 whitespace-pre-wrap break-words rounded-xl border border-[var(--admin-state-error-border)] bg-[var(--admin-state-error-bg)] px-3 py-2 text-sm font-semibold text-[var(--admin-state-error-text)]",
    canvasBannerSafeAreaClassName
  ].filter(Boolean).join(" ");
  const actionNoticeBannerClassName = [
    // Overlay, not layout: the toast's 6s lifetime must never shift the map
    // column height mid-session. top-14 for the same reason the error overlay
    // uses it — the floating top clusters own the first 44px of the stage, and
    // at top-0.5 this toast rendered UNDER them in paint order (they are z-40
    // and later in the DOM). That put the Add seat button on top of the
    // toast's right-aligned Undo, hit-blocking the recovery path for the whole
    // 6s after every draft mutation.
    "absolute left-0.5 right-0.5 top-14 z-50 shadow-elevation-3",
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
  // additionally never nudges a selected/swap-source/swap-target
  // seat — those render tokenMode "selected" or active "prominent" and stay
  // pinned to their anchor. Any seat in that set must also be excluded here
  // (not just "their nudge goes unused"): inside a 4-way mutual clique the
  // least-used fallback can otherwise hand two genuinely visible labels the
  // same nudge to dodge a label that is never actually nudged.
  const swapTargetSeatId = swapConfirm?.targetSeatId;
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
          seat.id !== moveEmployeeSourceSeatId &&
          seat.id !== moveEmployeeConfirm?.targetSeatId
        )
        .map(seat => seat.id)
    );
  }, [dimmedSeatIdSet, moveEmployeeConfirm, moveEmployeeSourceSeatId, selectedSeatId, showNames, swapSourceSeatId, swapTargetSeatId, visualLocalSeats]);
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
  // Office room wash (PR B, 2026-07-24): a private office glows faintly green
  // while an assigned seat sits in it. buildOfficeRoomWashes owns the
  // composition rules — the wash yields to dim, search highlight, and
  // targeting modes (swap/move). draggingSeatId is a lib parameter this
  // caller no longer exercises (geometry drag retired 2026-07-30), so this
  // call site stays a straight data feed.
  const officeRoomWashes = buildOfficeRoomWashes({
    seats: visualLocalSeats.map(seat => ({ id: seat.id, x: seat.x, y: seat.y, status: seat.status })),
    dimmedSeatIds: dimmedSeatIdSet,
    searchActiveSeatIds: search.trim() ? new Set(localSeats.filter(matchesFilters).map(seat => seat.id)) : undefined,
    swapMode: Boolean(swapSourceSeatId || moveEmployeeSourceSeatId),
    draggingSeatId: null
  });
  // Zone hover-wash (v12 contract #8): the hovered chip wins over the pinned
  // zone filter, so moving along the chip row previews each zone in turn
  // without disturbing what is actually filtered. Seats come from the visual
  // set — the wash box must land in the same space as the markers it frames.
  const zoneWash = useMemo(
    () => buildZoneWash(hoverZone ?? (zone !== "all" ? zone : null), visualLocalSeats),
    [hoverZone, visualLocalSeats, zone]
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

  // Icon-only tools (undo/redo) sit as small squares beside the Filter/search
  // field pair (2026-07-23), not as full-height flat tools — they carry no
  // active-underline state, so nothing ties them to the bar's bottom edge.
  // after:-inset-1.5 keeps the ~40px hit target the full-height buttons had
  // (#198's touch-target line) while the visual stays 28px. (This comment used
  // to claim 32px; the class has been h-7 = 28px throughout, so the number was
  // wrong, not the class.)
  const chromeIconBtn = "relative flex h-7 w-7 shrink-0 items-center justify-center text-[var(--admin-chrome-muted)] transition-colors duration-150 after:absolute after:-inset-1.5 hover:bg-[var(--admin-chrome-hover)] hover:text-[var(--admin-chrome-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-primary)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[var(--admin-chrome-muted)]";
  // v12: the kebab is now the bar's ONLY overflow surface, visible at every
  // width. The old below-lg/below-xl chromeToolbarBtnCollapsible* derivations
  // (and the adminChromeTool/Active/Disabled imports that fed them) are
  // retired along with the row controls they served — Show names, Management,
  // and the flat-tool Ask Planner all moved to the rail or the kebab. See
  // components/ui/adminChrome.ts's updated header comment. The kebab trigger
  // gets its own fixed 32px-wide grid cell instead, since it is icon-only.
  const chromeKebabBtn = "relative flex h-full w-8 shrink-0 items-center justify-center text-[var(--admin-chrome-muted)] transition-colors duration-150 hover:bg-[var(--admin-chrome-hover)] hover:text-[var(--admin-chrome-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-primary)]";
  const chromeKebabBtnActive = "relative flex h-full w-8 shrink-0 items-center justify-center bg-[var(--admin-chrome-hover)] text-[var(--admin-chrome-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-primary)]";
  const chromeMenuItem = "flex w-full items-center gap-1.5 px-3 py-2 text-left text-[12px] font-medium text-[var(--admin-chrome-text)] transition hover:bg-[var(--admin-chrome-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-primary)]";

  return (
    /* overflow-x-CLIP, not -hidden: hidden makes this div a scroll container,
       which captures the sticky header so it never pins to the viewport.
       pl-12 clears the v12 left rail, which is position:fixed and does not
       participate in this flex column.
       min-h in svh, not min-h-screen (100lvh): below lg the map viewport is
       sized in svh, and on a mobile browser with a collapsing URL bar lvh runs
       past svh — the root would stretch below the map's bottom edge and reopen
       the dead band that height exists to close. */
    <div className="flex min-h-[100svh] flex-col overflow-x-clip bg-[var(--admin-bg)] text-[var(--admin-text-primary)] pl-12 lg:h-screen lg:min-h-0 lg:overflow-hidden">
      {/* The left rail is the (shell) layout's persistent AppShell — this
          surface plugs its unsaved-edits veto and Ask Planner opener into it
          via useAppShellNavigation (see the registration near the drawer
          logic above); the veto contract is unchanged (true lets the rail
          navigate, false means the guard dialog is driving). */}
      {/* z-50, not z-40: once sticky, the header's z-index is live and must
          outrank the z-40 canvas overlays (toasts, map menu) that follow it
          in DOM order, or they paint over the pinned bar and its menus. */}
      <header className="sticky top-0 z-50 flex h-[var(--admin-chrome-h)] shrink-0 items-center border-b border-[var(--admin-chrome-border)] bg-[var(--admin-chrome-bg)] pl-3 text-[var(--admin-chrome-text)]">
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

        {/* 26px here vs 22px on the sub-page bar — a real disagreement between
            the two bars that is left alone, because unifying it would resize
            one bar's chrome. Only the 1px rule and its color are shared. */}
        <span aria-hidden="true" className={`mx-2.5 hidden h-[26px] lg:block ${adminChromeDividerRule}`} />

        {/* Filter and Search are two DISTINCT controls, no longer one shared
            box. Sharing a 26px border made search — a paramount job — read as a
            cramped sibling of the filter and forced both to share a 340px cap.
            The filter keeps its dropdown anchored to itself (immediately LEFT
            of search, per the locked pairing); search gets its own field below.
            v12 (2026-07-31): both fields are 24px (h-6) in the 36px bar,
            keeping 6px of clearance top and bottom — down from the prior
            28px (h-7) resize, to read lighter next to the new rail. */}
        <div data-filter-ui className="relative mr-1.5 flex h-6 shrink-0 items-stretch border border-[var(--admin-chrome-border)] bg-[var(--admin-chrome-field)] lg:mr-2">
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
                onZoneHoverChange={setHoverZone}
                onStatusChange={setStatus}
                matchSummary={`${legendSourceSeats.length} of ${localSeats.length} seats match`}
                onRemoveActiveChip={removeActiveFilterChip}
                onClearFilters={clearStructuredFilters}
              />
            </div>
          )}
        </div>

        {/* Search owns its own field, sized MEDIUM: the cap rises 340 -> 460px
            on lg, per the v12 target-bar spec — up from the pre-v12 420 (the
            bottom of the original refinement brief's 420-560 range), so it
            still clears the old cramped shared box without dominating the bar
            the way 480 did. */}
        <div role="search" aria-label="Command search" className="hidden h-6 min-w-0 flex-1 border border-[var(--admin-chrome-border)] bg-[var(--admin-chrome-field)] lg:block lg:max-w-[460px]">
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

        {/* Rendered only when search/filter narrows the map — same source
            counts FilterPanel's own matchSummary uses, so the two can never
            disagree. lg-only: matches the desktop search field's own
            breakpoint (mobile has no room and uses its own canvas search). */}
        {legendFiltersActive && (
          <span className="ml-2 hidden shrink-0 whitespace-nowrap text-[11.5px] font-semibold text-[var(--admin-primary)] lg:inline">
            {legendSourceSeats.length} of {localSeats.length} match
          </span>
        )}

        {canEdit && (
          <>
            <span aria-hidden="true" className={`mx-2.5 hidden h-[26px] lg:block ${adminChromeDividerRule}`} />

            {/* div, not <nav>: role="group" is not an allowed role on nav (axe
                aria-allowed-role), and this is a grouped tool cluster, not a
                navigation landmark. v12: Undo/Redo/kebab are the only
                surviving row controls — Show names, Management, and the old
                flat-tool Ask Planner moved to the rail or the kebab. */}
            <div role="group" aria-label="Admin command row" className="flex h-full shrink-0 items-center">
              <button
                type="button"
                onClick={undoDraftEdit}
                disabled={mutationInFlight || inspectorDirty || !undoAvailable}
                aria-label="Undo last map change"
                title={undoTitle}
                className={chromeIconBtn}
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
                className={chromeIconBtn}
              >
                {/* Literal ↻ glyph (U+21BB) — matches the mockup; see Undo above. */}
                <span aria-hidden="true" className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-[15px] leading-none">↻</span>
              </button>
              {/* Kebab — v12 Menu subsystem. Items: names toggle (checkmark),
                  reset view, divider, danger discard. Visible at EVERY width
                  now (no more xl:hidden) — it is the bar's only surviving
                  overflow surface. */}
              <div data-chrome-menu className="relative flex h-full shrink-0 items-center">
                <button
                  ref={chromeMenuButtonRef}
                  type="button"
                  aria-haspopup="true"
                  aria-expanded={chromeMenuOpen}
                  aria-controls={chromeMenuOpen ? "chrome-kebab-menu" : undefined}
                  aria-label="More tools"
                  title="More tools"
                  onClick={() => setChromeMenuOpen(current => !current)}
                  className={chromeMenuOpen ? chromeKebabBtnActive : chromeKebabBtn}
                >
                  <span aria-hidden="true" className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-[15px] leading-none">⋮</span>
                </button>
                {chromeMenuOpen && (
                  <div
                    id="chrome-kebab-menu"
                    role="group"
                    aria-label="More tools"
                    onKeyDown={event => {
                      if (event.key === "Escape") {
                        event.stopPropagation();
                        setChromeMenuOpen(false);
                        returnFocusAfterClose(chromeMenuButtonRef);
                      }
                    }}
                    className="absolute left-0 top-full z-50 w-[230px] border border-white/15 bg-[var(--admin-chrome-elevated)] py-1 shadow-elevation-3"
                  >
                    {/* The label must NOT flip to the inverse verb when active: a
                        flipping label with no pressed state is what left the
                        current view invisible to assistive tech before, and
                        accessibility-source pins that it never comes back. */}
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
                      className={chromeMenuItem}
                    >
                      Show occupant names
                      {showNames && (
                        // #24A148 (bright fill, --admin-status-ok-rgb's hex):
                        // 4.92:1 on this menu's #1f1f1f, 4.52:1 on #262626 —
                        // clears the 3:1 graphics floor (WCAG 1.4.11).
                        // --admin-status-ok itself (#1D6E41) measures only
                        // 2.64:1 / 2.42:1 here — too dim on dark chrome, fine
                        // only on the light-surface status dot/pill it was
                        // tuned for. The prototype's #42be65
                        // (--admin-chrome-success-text) is a retired hex —
                        // not reintroduced here.
                        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="ml-auto h-3.5 w-3.5 text-[rgb(var(--admin-status-ok-rgb))]">
                          <path d="m4.5 10.5 3.5 3.5 7.5-8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setChromeMenuOpen(false);
                        // Reuses the same reset the MapZoomControl fit button
                        // calls — no new pan/zoom state this slice.
                        fitMapToView();
                        returnFocusAfterClose(chromeMenuButtonRef);
                      }}
                      className={chromeMenuItem}
                    >
                      Reset zoom &amp; position
                    </button>
                    {/* Zoom to 100% moved here verbatim when the floating map ⋯
                        kebab retired (v12 slice 3). It is NOT the same action as
                        the reset above: fit/overview scales the plan to the
                        viewport, this one lands on exact 1:1 detail zoom. The
                        kebab's other item (fit) already lives on the zoom
                        stack's fit button, so nothing was dropped. */}
                    <button
                      type="button"
                      onClick={() => {
                        setChromeMenuOpen(false);
                        applyMapZoom(1);
                        returnFocusAfterClose(chromeMenuButtonRef);
                      }}
                      className={chromeMenuItem}
                    >
                      Zoom to 100%
                    </button>
                    <div className="mx-0 my-1 h-px bg-white/10" />
                    {/* Danger text #ff8389 (Carbon red-30, --admin-chrome-danger-text):
                        6.95:1 measured on this menu's own #1f1f1f
                        (--admin-chrome-elevated) background, 6.38:1 on
                        #262626 (--admin-chrome-hover, in case this class ever
                        rides a hover surface) — both well past the 4.5:1
                        floor (Step 3 contrast gate). Disabled when there is
                        nothing to discard: a no-op destructive control reads
                        as broken, not as safe. Relocated here from the
                        publish review dialog (v12) — resetDraftToPublishedAction
                        keeps its one call site inside confirmDiscardDraftChanges;
                        only this trigger moved. No focus restore here: the
                        confirm dialog takes focus itself (useDialogFocus's
                        ref-callback focuses it synchronously on mount) — a
                        deferred returnFocusAfterClose would land AFTER that
                        and yank focus back outside the open aria-modal
                        dialog, breaking its own Tab trap. useDialogFocus
                        restores focus to this button on close instead. */}
                    <button
                      type="button"
                      disabled={!publishSummary.hasChanges}
                      title={publishSummary.hasChanges ? "Discard every draft change back to the published map" : "No draft changes to discard"}
                      onClick={() => {
                        setChromeMenuOpen(false);
                        setDiscardDraftConfirmOpen(true);
                      }}
                      className={[chromeMenuItem, "text-[var(--admin-chrome-danger-text)] disabled:cursor-not-allowed disabled:text-[var(--admin-chrome-disabled)] disabled:hover:bg-transparent"].join(" ")}
                    >
                      Discard draft changes
                    </button>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        <div className="ml-auto flex h-full shrink-0 items-center">
          {canEdit && (
            <>
              {/* Ask Planner — the ONLY AI-blue control on this bar (AI tokens
                  never appear on a non-AI control). Active state is the bar's
                  usual bg-hover PLUS a 2px AI-blue bottom border, distinct from
                  the brand-orange underline every other active tool uses.
                  #78a9ff: 7.68:1 on #161616, 6.43:1 on #262626 (measured
                  2026-07-31, app/globals.css AI-family comment; re-confirmed
                  Step 3 gate). */}
              <button
                ref={askPlannerButtonRef}
                type="button"
                aria-label={plannerHighlightedSeatIds.length > 0 ? `Open Ask Planner, ${plannerHighlightedSeatIds.length} seats highlighted` : "Open Ask Planner"}
                aria-controls="ask-planner-drawer"
                aria-expanded={askPlannerOpen}
                aria-haspopup="dialog"
                onClick={openAskPlannerDrawer}
                className={[
                  "inline-flex h-full shrink-0 items-center gap-1.5 border-b-2 px-3 text-[12.5px] font-medium leading-none text-[var(--admin-ai-chrome-text)] transition-colors duration-150 hover:bg-[var(--admin-chrome-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-primary)]",
                  askPlannerOpen || plannerHighlightedSeatIds.length > 0 ? "border-[var(--admin-ai-chrome-border)] bg-[var(--admin-chrome-hover)]" : "border-transparent"
                ].join(" ")}
              >
                <span aria-hidden="true" className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-[13px] leading-none">✦</span>
                Ask Planner
                <span aria-hidden="true" className="border border-[var(--admin-ai-chrome-border)] px-[3px] text-[9px] font-bold leading-none text-[var(--admin-ai-chrome-text)]">AI</span>
                {plannerHighlightedSeatIds.length > 0 && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--admin-primary-cta)] px-1 text-[11px] font-semibold text-white">{plannerHighlightedSeatIds.length}</span>
                )}
              </button>

              {/* Conditional publish cluster (contract #4): nothing renders here
                  without draft changes — no idle status chip, no
                  publish-status-popover. The has-changes styling is unchanged
                  from slice 1. */}
              {publishSummary.hasChanges && (
                <div className="flex h-full shrink-0 items-center gap-2.5 pl-3">
                  <span className="text-[12px] text-[var(--admin-chrome-muted)]">
                    Draft · {publishSummary.totalChangeCount} {publishSummary.totalChangeCount === 1 ? "change" : "changes"}
                  </span>
                  <button
                    type="button"
                    onClick={openPublishReview}
                    aria-label={`Review ${draftStatusLabel.toLowerCase()}`}
                    title={draftStatusTitle}
                    className="inline-flex h-full shrink-0 items-center gap-1.5 bg-[var(--admin-primary-cta)] px-[15px] text-[12.5px] font-semibold leading-none text-white transition hover:bg-[var(--admin-primary-cta-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white motion-safe:animate-[sp-chip-pop_240ms_ease-out]"
                  >
                    <span>Publish</span>
                    <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-white px-1 text-[11px] font-bold tabular-nums text-[var(--admin-primary-ink)]">{publishSummary.totalChangeCount}</span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </header>

      {/* v12 slice 3: no width cap and no padding — the floor plan is layer-00
          and runs edge to edge below the bar. stageReservedClassName stays:
          it is the reserved right padding the inspector/results panels ride. */}
      <div className={["flex w-full flex-1 flex-col lg:min-h-0 lg:overflow-hidden", stageReservedClassName].filter(Boolean).join(" ")}>
        

        {/* lg:flex-1 keeps the height chain rigid: without it the fit-view
            width/height calculation feeds back on itself after the reserved
            inspector column opens and closes, sticking the map small. Now that
            the stage is lg:flex-1 in overview too (the 1911/867 aspect pin is
            gone), this unbroken lg:flex-1 / lg:min-h-0 chain from the root's
            lg:h-screen is the only thing keeping the stage height
            SCREEN-derived rather than content-derived — break a link and the
            feedback loop the aspect pin used to fence off comes back. */}
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

      <main className={["grid grid-cols-1 lg:min-h-0 lg:flex-1 lg:items-stretch lg:overflow-hidden", desktopMapGridClass].join(" ")}>
        <section id="planning-canvas" tabIndex={-1} aria-labelledby="admin-planning-canvas-title" className={[filterCollapsed ? "order-1" : "order-2", "min-w-0 overflow-hidden relative lg:order-2 lg:flex lg:min-h-0 lg:flex-col lg:gap-2"].filter(Boolean).join(" ")}>
          {/* The status strip that used to carry this heading is gone (v12
              slice 3). The heading stays as the canvas section's accessible
              name — aria-labelledby above points at this id — and is now
              ungated, so the read-only admin view keeps a named region too. */}
          <h2 id="admin-planning-canvas-title" className="sr-only">
            {filtersActive ? searchStatusTitle : "Planning canvas"}
          </h2>

          {/* Alerts overlay the canvas instead of pushing the map down: a
              banner arriving mid-session must not resize the map and re-run
              the overview fit. pointer-events-auto per alert so the layer
              itself never eats map drags. top-14 (not top-3) clears the
              floating top clusters below — they occupy 12px + a 32px card
              row, so 56px lands the first banner just under them instead of
              on top of the floor pill. */}
          <div className="pointer-events-none absolute inset-x-3 top-14 z-50 flex flex-col gap-2">
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
          </div>

          {actionNotice && !swapSourceSeatId && !moveEmployeeSourceSeatId && (
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

          <div className={mapStageClassName}>
            {/* Top-left cluster (v12 slice 3): floor, crumb, and active filter
                chips float over the full-bleed plan as layer-01 white cards.
                Nothing above the map is in flow any more, so a chip arriving
                mid-session can no longer resize the map column and re-run the
                overview fit. pointer-events-none on the rail with each card
                opting itself back in keeps the gaps between cards draggable
                map. Ungated by floor on purpose — the floor pill IS how you
                leave the Floor 2 placeholder. */}
            <div className="pointer-events-none absolute left-3 top-3 z-40 flex flex-wrap items-center gap-2">
              <div className="pointer-events-auto">
                <FloorSelector floor={floor} onChange={setFloor} />
              </div>
              <span className="pointer-events-auto border border-[var(--admin-border)] bg-white px-2.5 py-1.5 text-[12px] text-[var(--sp-color-text-secondary)] shadow-elevation-3">{mapCrumbLabel}</span>
              <ActiveFilterChips chips={activeFilterChips} onRemove={removeActiveFilterChip} onClearAll={clearAllConstraints} className="pointer-events-auto" />
              {canEdit && (
                <AiHighlightChip
                  seatCount={plannerHighlightedSeatIds.length}
                  onClear={() => setPlannerHighlightedSeatIds([])}
                />
              )}
            </div>
            {/* Top-right cluster: Add seat. It rides the stage, so the reserved
                inspector column slides it inboard automatically. */}
            {canEdit && floor === "3" && (
              <div className="pointer-events-none absolute right-3 top-3 z-40">
                <button
                  type="button"
                  aria-pressed={addSeatMode}
                  onClick={addSeatMode ? cancelAddSeatMode : startAddSeatMode}
                  className={[
                    "pointer-events-auto flex h-8 items-center gap-1.5 border px-3 text-[12.5px] font-semibold shadow-elevation-3 transition active:scale-[0.97] active:duration-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)]",
                    addSeatMode
                      ? "border-[var(--admin-primary)] bg-[var(--admin-primary-soft)] text-[var(--admin-primary-on-soft)]"
                      : "border-[var(--admin-border)] bg-white text-[var(--sp-color-text-secondary)] hover:bg-[var(--sp-color-canvas)] hover:text-[var(--admin-text-primary)]"
                  ].join(" ")}
                >
                  <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none">
                    <path d="M10 4.5v11M4.5 10h11" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                  </svg>
                  {addSeatMode ? "Exit add seat" : "Add seat"}
                </button>
              </div>
            )}
            <div
              ref={mapViewportRef}
              className={mapViewportClassName}
              tabIndex={canEdit ? 0 : undefined}
              aria-label={canEdit ? "Admin seat map viewport. Drag to pan; use wheel, trackpad, touch, or arrow keys to pan the map." : undefined}
              onPointerDown={handleViewportPointerDown}
              onPointerMove={handleViewportPointerMove}
              onPointerUp={handleViewportPointerEnd}
              onPointerCancel={handleViewportPointerEnd}
              onWheel={cancelNudge}
              onKeyDown={event => {
                if (VIEWPORT_NATIVE_SCROLL_KEYS.has(event.key)) cancelNudge();
              }}
            >
              {floor === "2" && <FloorPlaceholder />}
              {floor === "3" && (
              <div
                ref={mapRef}
                className={mapFrameClassName}
                style={mapFrameStyle}
                onPointerDown={handleMapPointerDown}
              >
                {/* While Ask Planner has seats highlighted the plan itself
                    steps back a little, so the aura'd seats carry the eye.
                    Slight and reversible — it rides the same live highlight
                    set as the dimming, so nothing can latch it on. */}
                <Image
                  src={MAP_IMAGE_SRC}
                  alt="Office floor plan"
                  width={MAP_IMAGE_WIDTH}
                  height={MAP_IMAGE_HEIGHT}
                  priority
                  unoptimized
                  placeholder="blur"
                  blurDataURL={MAP_IMAGE_BLUR_DATA_URL}
                  className={[
                    "block h-auto w-full select-none transition-[filter] duration-200",
                    plannerHighlightedSeatIds.length > 0 ? "[filter:saturate(0.8)]" : ""
                  ].join(" ")}
                  draggable={false}
                />

                {/* Zone + room washes, between the floor-plan image and the
                    marker layer. One implementation shared with the viewer
                    surface (MapWashLayer) — it documents the decorative /
                    pointer-inert contract both surfaces rely on. */}
                <MapWashLayer zoneWash={zoneWash} officeRoomWashes={officeRoomWashes} />

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
                    // Office plates center in their ROOM and size to it (the
                    // click point is wherever the admin happened to add the
                    // seat; the room is the identity). Display-only offset —
                    // the marker snaps back to the anchor in add/swap.
                    // One shared implementation with the viewer surface.
                    const officePlateLayout = getOfficePlateLayout(visualSeat, mapPixelsPerNormalizedUnit);

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
                        swapMode={Boolean(swapSourceSeatId)}
                        moveEmployeeMode={Boolean(moveEmployeeSourceSeatId)}
                        officePlateOffsetXPx={officePlateLayout?.offsetXPx ?? 0}
                        officePlateOffsetYPx={officePlateLayout?.offsetYPx ?? 0}
                        officePlateWidthPx={officePlateLayout?.widthPx}
                        swapSource={seat.id === swapSourceSeatId}
                        swapTarget={seat.id === swapConfirm?.targetSeatId}
                        moveEmployeeSource={seat.id === moveEmployeeSourceSeatId}
                        highlighted={plannerHighlightedSeatIdSet.has(seat.id)}
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
                        onSelect={stableSelectSeat}
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
            {/* Legend card, bottom-left against the map stage (it re-centres
                with the narrowed map for the same reason the header does: a
                docking panel — results panel or mode card, v12 slice 4 —
                reserves its column via stageReservedClassName; the canvas
                action bar this comment used to point to is retired). Counts
                come from legendCounts, which follows the active filters — the
                number row must never contradict a filtered map. Hidden below
                md, where the card would cover more plan than it explains,
                and gated to Floor 3:
                Floor 2 shows the placeholder, where whole-map counts would
                read as a bug. In the 768–899 band the md floor lets this card
                render while the inspector/results/filter surfaces are still
                full-width `fixed inset-x-3 bottom-3 z-[80]` sheets, which
                paint straight over it (measured on the viewer's identical
                stack, 2026-08-03). It yields the bottom to them and returns on
                dismiss; at >=900 those dock to the side and never overlap. */}
            {floor === "3" && (
            <div className={["absolute bottom-3 left-3 z-30 hidden", bottomSheetOwnsBottom ? "panel:block" : "md:block"].join(" ")}>
              <MapStatusLegend
                ariaLabel="Seat status legend"
                totalLabel={`${stats.total} ${stats.total === 1 ? "seat" : "seats"}`}
                entries={SEAT_STATUS_LEGEND
                  .filter(item => !item.draftOnly || legendCounts[item.key] > 0)
                  .map(item => ({ key: item.key, label: item.label, dotClassName: item.accentClass, count: legendCounts[item.key] }))}
                summary={filtersActive ? searchStatusSummary : null}
                actions={filtersActive ? (
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
                ) : null}
              />
            </div>
            )}
          </div>
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

      {vacateConfirm && (
        <VacateConfirmDialog
          label={vacateConfirm.label}
          occupantName={vacateConfirm.occupantName}
          pending={pending}
          onCancel={() => setVacateConfirm(null)}
          onConfirm={confirmVacateFromBar}
        />
      )}

      {deleteSeatConfirm && (
        <DeleteSeatConfirmDialog
          label={deleteSeatConfirm.label}
          pending={pending}
          onCancel={() => setDeleteSeatConfirm(null)}
          onConfirm={confirmDeleteSelectedSeat}
        />
      )}

      {publishReviewOpen && (
        <PublishReviewDialog
          publishSummary={publishSummary}
          publishDiffRows={publishDiffRows}
          publishDiffCounts={publishDiffCounts}
          actionError={actionError}
          pending={pending}
          onClose={() => {
            setActionError(null);
            setPublishReviewOpen(false);
          }}
          onConfirm={confirmPublishDraftMap}
        />
      )}

      {discardDraftConfirmOpen && (
        <DiscardDraftDialog
          totalChangeCount={publishSummary.totalChangeCount}
          actionError={actionError}
          pending={pending}
          onCancel={() => setDiscardDraftConfirmOpen(false)}
          onConfirm={confirmDiscardDraftChanges}
        />
      )}

      {modeCardOpen && activeMode && (
        <aside
          role="status"
          aria-live="polite"
          aria-label={`${activeMode.label} mode`}
          className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-[80] border border-[var(--admin-primary-border)] bg-[var(--admin-surface)] p-4 shadow-elevation-4 motion-safe:animate-[sp-panel-in_200ms_ease-out] panel:inset-x-auto panel:bottom-auto panel:right-3 panel:top-[var(--admin-chrome-h)] panel:z-40 panel:w-[320px] panel:max-w-[calc(100vw-1.5rem)]"
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
        onMove={() => startMoveEmployeeMode()}
        onSwap={() => startSwapSeatMode()}
        onVacate={requestVacateFromBar}
        // Finding 2 (v12 slice 4 final review): parity with the retired
        // canvas action bar's busy gate — a mutation in flight from ANY
        // source (undo/redo, the vacate confirm dialog's own transition, not
        // just this inspector instance's local `pending`) must still block
        // Move/Swap/Vacate here.
        busy={mutationInFlight || barSeatActions.pending}
        onDeleteSeat={deleteSelectedSeat}
        onExplainSeat={explainSeatWithPlanner}
        onBeforeSeatUpdate={captureDraftSnapshot}
        onSeatUpdated={applySeatUpdated}
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
        <InspectorGuardDialog
          seatLabel={selectedSeat.label}
          actionDescription={describeInspectorGuardAction(inspectorGuardAction)}
          pending={pending}
          onKeepEditing={keepEditingInspector}
          onDiscard={discardInspectorGuardEdits}
          onSave={requestInspectorGuardSave}
        />
      )}

      {swapConfirm && swapSourceSeat && swapTargetSeat && (
        <SwapConfirmDialog
          swapSourceSeat={swapSourceSeat}
          swapTargetSeat={swapTargetSeat}
          pending={pending}
          onCancel={() => setSwapConfirm(null)}
          onConfirm={confirmSwapSeats}
        />
      )}

      {moveEmployeeConfirm && moveEmployeeSourceSeat?.employee && moveEmployeeTargetSeat && (
        <MoveEmployeeConfirmDialog
          offerSwap={moveEmployeeConfirm.offerSwap}
          moveEmployeeSourceSeat={moveEmployeeSourceSeat}
          moveEmployeeTargetSeat={moveEmployeeTargetSeat}
          sourceEmployeeName={moveEmployeeSourceSeat.employee.full_name}
          pending={pending}
          onCancel={() => setMoveEmployeeConfirm(null)}
          onConfirmSwap={confirmMoveEmployeeAsSwap}
          onConfirmMove={confirmMoveEmployeeToOpenSeat}
        />
      )}
    </div>
  );
}
