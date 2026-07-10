"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { PointerEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  canRedoDraftHistory,
  canUndoDraftHistory,
  clearDraftHistory,
  createDraftHistory,
  createDraftSnapshot,
  draftStatesEquivalent,
  pushDraftHistory,
  redoDraftHistory,
  undoDraftHistory,
  type DraftSnapshot
} from "@/lib/draftHistory";
import type { DepartmentOption, Employee, SeatStatus, SeatWithEmployee, ZoneOption } from "@/lib/types";
import { createSeatAction, deleteSeatAction, moveSeatAction, publishSeatMapAction, restoreDraftSnapshotAction, swapSeatAssignmentsAction } from "@/app/actions";
import { listDraftSeatExpectations } from "@/lib/draftConcurrency";
import { departmentKey } from "@/lib/departments";
import { normalizePoint } from "@/lib/seatMath";
import { canDeleteSeat, getSeatDeleteBlockReason } from "@/lib/seatProtection";
import { detectSeatZoneForPointResult, getSeatZoneDetectionFailureMessage } from "@/lib/seatZones";
import {
  MAP_IMAGE_HEIGHT,
  MAP_IMAGE_SRC,
  MAP_IMAGE_WIDTH,
  savedPointToVisualPoint,
  seatsToVisualSeats,
  visualPointToSavedPoint
} from "@/lib/mapLayoutTransform";
import { buildPublishChangeSummary, type PublishChangeItem } from "@/lib/publishSummary";
import { AskPlannerDrawer, type AskPlannerQueuedRequest } from "@/components/seat-map/AskPlannerDrawer";
import {
  ActiveFilterChips,
  FilterPanel,
  type ActiveFilterChip,
  type ResultStatusBreakdown
} from "@/components/seat-map/FilterPanel";
import { FLOOR_LABELS, FloorSelector, type FloorId } from "@/components/seat-map/FloorSelector";
import { MapZoomControl } from "@/components/seat-map/MapZoomControl";
import { ResultsPanel, type AdminResultCard } from "@/components/seat-map/ResultsPanel";
import { SeatInspector } from "@/components/seat-map/SeatInspector";
import { SeatMarker } from "@/components/seat-map/SeatMarker";
import { Button } from "@/components/ui/Button";
import { StatusBadge, focusRingClass } from "@/components/ui/design-system";

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
  | { kind: "navigate-management" };

type MapViewMode = "overview" | "detail";

type MapPanState = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startScrollLeft: number;
  startScrollTop: number;
  moved: boolean;
} | null;

const NAME_LABEL_COLLISION_X_THRESHOLD = 0.07;
const NAME_LABEL_COLLISION_Y_THRESHOLD = 0.07;
const ADMIN_NAMES_VISIBLE_STORAGE_KEY = "seat-planner:names-visible";
const DEFAULT_PUBLISHED_SEATS: SeatWithEmployee[] = [];
const DEFAULT_PUBLISHED_EMPLOYEES: Employee[] = [];
const INSPECTOR_FORM_ID = "seat-inspector-form";
// Map zoom is a view transform on the scroll container only (spec §9): it
// scales the rendered frame width and never touches stored seat coordinates.
const MAP_ZOOM_MIN = 0.6;
const MAP_ZOOM_MAX = 2;
const MAP_ZOOM_STEP = 0.2;
const STATUS_LABELS: Record<SeatStatus, string> = {
  available: "Available",
  assigned: "Assigned",
  reserved: "Reserved",
  unavailable: "Unavailable"
};

function normalizeSeat(seat: SeatWithEmployee): SeatWithEmployee {
  return {
    ...seat,
    x: Number(seat.x),
    y: Number(seat.y),
    zone: seat.zone ?? seat.department ?? null,
    is_custom: Boolean(seat.is_custom)
  };
}

function normalizeSeats(seats: SeatWithEmployee[]) {
  return seats.map(normalizeSeat);
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
    label: "Assigned",
    chipClass: "border-[var(--admin-marker-assigned-border)] bg-[var(--admin-marker-assigned-surface)]",
    accentClass: "bg-[var(--admin-marker-assigned-accent)]"
  },
  {
    key: "available",
    label: "Open",
    chipClass: "border-[var(--admin-marker-available-border)] bg-[var(--admin-marker-available-surface)]",
    accentClass: "bg-[var(--admin-marker-available-accent)]"
  },
  {
    key: "reserved",
    label: "Reserved",
    chipClass: "border-[var(--admin-marker-reserved-border)] bg-[var(--admin-marker-reserved-surface)]",
    accentClass: "bg-[var(--admin-marker-reserved-accent)]"
  },
  {
    key: "unavailable",
    label: "Unavailable",
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
  const [actionNotice, setActionNotice] = useState<string | null>(null);
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
  const [zone, setZone] = useState("all");
  const [status, setStatus] = useState("all");
  const [filterCollapsed, setFilterCollapsed] = useState(true);
  const [mapMenuOpen, setMapMenuOpen] = useState(false);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [searchShortcutHint, setSearchShortcutHint] = useState("");
  const chromeSearchInputRef = useRef<HTMLInputElement | null>(null);
  const canvasSearchInputRef = useRef<HTMLInputElement | null>(null);
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
  const [pending, startTransition] = useTransition();
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
    window.setTimeout(() => askPlannerButtonRef.current?.focus(), 0);
  }, []);

  const closeAskPlannerDrawer = useCallback(() => {
    setAskPlannerOpen(false);
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
    setFilterCollapsed(true);
    setInspectorCollapsed(true);
    setAskPlannerOpen(true);
  }, []);

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
  }, [actionNotice]);

  // The stale-draft fence warning self-resolves (the page has already been
  // refreshed with the latest draft), so it auto-dismisses on a longer timer
  // rather than persisting like actionable errors.
  useEffect(() => {
    if (!staleDraftNotice) return;
    const timer = window.setTimeout(() => setStaleDraftNotice(null), 15000);
    return () => window.clearTimeout(timer);
  }, [staleDraftNotice]);

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

      if (mapMenuOpen) {
        setMapMenuOpen(false);
        return;
      }

      if (addSeatMode || moveSeatMode || swapSourceSeatId) {
        setAddSeatMode(false);
        setMoveSeatMode(false);
        setSwapSourceSeatId(null);
        setDragState(null);
        setActionNotice("Draft map mode canceled.");
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
        setSelectedSeatId(null);
        setInspectorCollapsed(false);
        return;
      }

      if (!isEditableTarget(event.target) && search.trim()) {
        setSearch("");
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
  }, [addSeatMode, askPlannerOpen, closeAskPlannerDrawer, deleteSeatConfirm, department, filterCollapsed, inspectorDirty, inspectorGuardAction, mapMenuOpen, moveSeatMode, publishReviewOpen, search, selectedSeatId, status, swapConfirm, swapSourceSeatId, zone]);

  const departments = useMemo(() => {
    const values = new Set<string>();
    localDepartmentOptions.filter(item => item.active).forEach(item => values.add(item.name));
    localEmployees.forEach(emp => {
      if (emp.department) values.add(emp.department);
    });
    return Array.from(values).sort();
  }, [localDepartmentOptions, localEmployees]);

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
  const legendCounts: Record<string, number> = {
    assigned: stats.assigned,
    available: stats.available,
    reserved: stats.reserved,
    unavailable: stats.unavailable,
    "draft-changed": draftChangedSeatLabelSet.size
  };

  const selectedSeat = localSeats.find(seat => seat.id === selectedSeatId) ?? null;
  const swapSourceSeat = swapSourceSeatId ? localSeats.find(seat => seat.id === swapSourceSeatId) ?? null : null;
  const swapTargetSeat = swapConfirm ? localSeats.find(seat => seat.id === swapConfirm.targetSeatId) ?? null : null;
  const visualLocalSeats = useMemo(() => seatsToVisualSeats(localSeats), [localSeats]);
  const visualSeatById = useMemo(() => new Map(visualLocalSeats.map(seat => [seat.id, seat])), [visualLocalSeats]);
  const plannerHighlightedSeatIdSet = useMemo(() => new Set(plannerHighlightedSeatIds), [plannerHighlightedSeatIds]);
  const searchQuery = search.trim();
  const searchActive = Boolean(searchQuery);
  const structuredFiltersActive = department !== "all" || zone !== "all" || status !== "all";
  const activeFilterChips: ActiveFilterChip[] = [
    searchActive ? { id: "search", label: "Search", value: searchQuery, removeLabel: `Remove search filter ${searchQuery}` } : null,
    department !== "all" ? { id: "department", label: "Department", value: department, removeLabel: `Remove department filter ${department}` } : null,
    zone !== "all" ? { id: "zone", label: "Zone", value: zone, removeLabel: `Remove zone filter ${zone}` } : null,
    status !== "all" ? { id: "status", label: "Status", value: STATUS_LABELS[status as SeatStatus] ?? status, removeLabel: `Remove status filter ${STATUS_LABELS[status as SeatStatus] ?? status}` } : null
  ].filter(Boolean) as ActiveFilterChip[];
  const structuredFilterCount = [
    department !== "all",
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
            title: `${seat.employee.full_name} — ${seat.label}`,
            subtitle: [seat.employee.department, zoneLabel, STATUS_LABELS[seat.status]].filter(Boolean).join(" · "),
            status: seat.status
          };
        }
        return {
          key: `seat-${seat.id}`,
          seatId: seat.id,
          title: seat.label,
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
        title: employee.full_name,
        subtitle: [employee.position, employee.department, "Unassigned"].filter(Boolean).join(" · "),
        status: null,
        disabled: true
      }));
    return [...seatCards, ...unassignedPeople].slice(0, 60);
  }, [localEmployees, localSeats, matchingSeats, searchQuery]);
  const selectedSeatMatchesFilters = selectedSeat ? matchesFilters(selectedSeat) : true;
  const crowdedNameSeatIdSet = useMemo(() => {
    const crowded = new Set<string>();
    const assignedSeats = visualLocalSeats.filter(seat => seat.employee);

    assignedSeats.forEach(seat => {
      const hasNearbySeat = visualLocalSeats.some(otherSeat => {
        if (otherSeat.id === seat.id) return false;
        return (
          Math.abs(otherSeat.x - seat.x) <= NAME_LABEL_COLLISION_X_THRESHOLD &&
          Math.abs(otherSeat.y - seat.y) <= NAME_LABEL_COLLISION_Y_THRESHOLD
        );
      });

      if (hasNearbySeat) crowded.add(seat.id);
    });

    return crowded;
  }, [visualLocalSeats]);
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
    return normalizePoint({
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height
    });
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
    const zoneOk = zone === "all" || seatZone === zone;
    const statusOk = status === "all" || seat.status === (status as SeatStatus);

    return searchOk && departmentOk && zoneOk && statusOk;
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

    window.location.assign("/admin/management");
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
    if (action.kind === "start-add-seat") return "starting Add Seat mode.";
    if (action.kind === "start-move-seat") return "starting Move Seat mode.";
    if (action.kind === "start-swap-seat") return "starting Swap Seats mode.";
    return "opening Management.";
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
    if (value.trim() && selectedSeatId && !inspectorDirty) {
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

    if (chipId === "zone") {
      setZone("all");
      return;
    }

    if (chipId === "status") {
      setStatus("all");
    }
  }

  const scrollMapToPoint = useCallback((x: number, y: number) => {
    const viewport = mapViewportRef.current;
    const map = mapRef.current;
    if (!viewport || !map) return;

    const clampScrollPosition = (value: number, max: number) => Math.min(Math.max(value, 0), Math.max(max, 0));
    const left = clampScrollPosition((x * map.offsetWidth) - (viewport.clientWidth / 2), viewport.scrollWidth - viewport.clientWidth);
    const top = clampScrollPosition((y * map.offsetHeight) - (viewport.clientHeight / 2), viewport.scrollHeight - viewport.clientHeight);
    viewport.scrollTo({ left, top, behavior: "smooth" });
  }, []);

  const centerMapViewport = useCallback((behavior: ScrollBehavior = "smooth") => {
    const viewport = mapViewportRef.current;
    if (!viewport) return;

    const clampScrollPosition = (value: number, max: number) => Math.min(Math.max(value, 0), Math.max(max, 0));
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
      const clampScrollPosition = (value: number, max: number) => Math.min(Math.max(value, 0), Math.max(max, 0));
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

  const centerSeatInMap = useCallback((seatId: string) => {
    const seat = localSeats.find(item => item.id === seatId);
    if (!seat) return;
    const point = savedPointToVisualPoint({ x: seat.x, y: seat.y }, seat);
    scrollMapToPoint(point.x, point.y);
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

  // The inspector reserves layout width (no overlay), so a selected seat can
  // never sit hidden under the panel — no nudge scrolling on select. Explicit
  // navigation (results "Show on map") still centers via queueCenterSeatInMap.
  function seatPersonLabel(seat: SeatWithEmployee | null) {
    return seat?.employee?.full_name ?? "Open";
  }

  function buildSwapSummary(sourceSeat: SeatWithEmployee, targetSeat: SeatWithEmployee) {
    return `${sourceSeat.label} (${seatPersonLabel(sourceSeat)}) <-> ${targetSeat.label} (${seatPersonLabel(targetSeat)})`;
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
      setActionNotice("Choose a different target seat to complete the swap.");
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

  function beforeManagementNavigation() {
    if (!inspectorDirty) return true;
    requestInspectorGuard({ kind: "navigate-management" });
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
    setActionNotice("Swap mode canceled.");
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
      }
    });
  }

  const namesToggleLabel = showNames ? "Hide names" : "Show names";
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
  const undoTitle = pending
    ? "Wait for the current map change to finish"
    : inspectorDirty
      ? "Save or cancel inspector edits before undoing"
      : undoAvailable
        ? lastUndoLabel
          ? `Undo ${lastUndoLabel}`
          : "Undo last map change"
        : "No map changes to undo";
  const redoTitle = pending
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
      label: "Add Seat",
      message: "Click inside a seating zone to place an automatically numbered custom marker.",
      exitLabel: "Exit Add Seat",
      onExit: cancelAddSeatMode
    }
    : moveSeatMode
      ? {
        label: "Move Seat",
        message: selectedSeat ? `Drag ${selectedSeat.label} to reposition it on the draft map.` : "Select a seat before moving it.",
        exitLabel: "Exit Move Seat",
        onExit: () => {
          setMoveSeatMode(false);
          setDragState(null);
        }
      }
      : swapSourceSeat
        ? {
          label: "Swap Seats",
          message: `${swapSourceSeat.label} is the source. Select a target seat to review the swap.`,
          exitLabel: "Exit Swap Seats",
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
    "relative mx-auto w-full max-w-full overscroll-contain border border-[var(--admin-border)] bg-[var(--admin-map-floor)] lg:h-full lg:min-h-0 lg:flex-1 lg:max-h-none",
    mapViewMode === "overview"
      ? "min-h-[300px] overflow-hidden p-1.5 sm:min-h-[480px] sm:p-2 lg:flex lg:min-h-0 lg:items-center lg:justify-center"
      : "min-h-[360px] max-h-[82svh] overflow-auto sm:min-h-[520px] sm:max-h-[calc(100svh-62px)] lg:min-h-0 lg:max-h-none lg:[-ms-overflow-style:none] lg:[scrollbar-width:none] lg:[&::-webkit-scrollbar]:hidden",
    mapViewMode === "detail" && floor === "3" && !addSeatMode ? (panning ? "cursor-grabbing" : "cursor-grab") : "",
    canEdit ? "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus-ring-color)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--admin-map-floor)]" : ""
  ].join(" ");
  const mapFrameClassName = [
    "relative mx-auto max-w-none",
    mapViewMode === "overview"
      ? "w-full max-w-[1911px]"
      : "[--map-detail-base:1120px] sm:[--map-detail-base:1460px] lg:[--map-detail-base:1911px]",
    addSeatMode ? "cursor-crosshair" : ""
  ].join(" ");
  // Zoom scales the rendered width only — a pure view transform (§9).
  const mapFrameStyle = mapViewMode === "overview"
    ? (overviewMapWidth ? { width: `${overviewMapWidth}px` } : undefined)
    : { width: `calc(var(--map-detail-base) * ${zoomFactor})` };
  const mapZoomLabel = mapViewMode === "overview" ? "Fit" : `${Math.round(zoomFactor * 100)}%`;
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
    "flex min-w-0 flex-col gap-2 rounded-xl border border-[var(--admin-state-saved-border)] bg-[var(--admin-state-saved-bg)] px-3 py-2 text-sm font-semibold text-[var(--admin-state-saved-text)] sm:flex-row sm:items-center sm:justify-between",
    canvasBannerSafeAreaClassName
  ].filter(Boolean).join(" ");
  const resultActionButtonClassName = "inline-flex min-h-8 items-center justify-center rounded-lg border border-[var(--admin-border-strong)] bg-[var(--admin-surface)] px-3 py-1.5 text-[11px] font-semibold text-[var(--admin-text-secondary)] transition hover:border-[var(--admin-primary-border)] hover:bg-[var(--admin-primary-soft)] hover:text-[var(--admin-primary-cta)] active:scale-[0.97] active:duration-75 active:shadow-inner focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus-ring-color)] disabled:cursor-not-allowed disabled:opacity-50";
  const resultClearButtonClassName = "inline-flex min-h-8 items-center justify-center rounded-lg border border-[var(--admin-primary-border)] bg-[var(--admin-primary-soft)] px-3 py-1.5 text-[11px] font-semibold text-[var(--admin-primary-cta)] transition hover:border-[var(--admin-primary)] hover:bg-[rgba(242,110,34,0.16)] active:scale-[0.97] active:duration-75 active:shadow-inner focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus-ring-color)]";
  const visibleMapSpan = Math.max(0, mapVisibleRange.right - mapVisibleRange.left);
  const mapPixelsPerNormalizedUnit = visibleMapSpan > 0 && mapVisibleRange.viewportWidth > 0
    ? mapVisibleRange.viewportWidth / visibleMapSpan
    : 0;
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

  // Shell top bar: full-height quiet tools on the 40px dark bar. Active state
  // is the Carbon-style 2px brand-orange underline (5.37:1 on #161616).
  const chromeToolbarBtn = "inline-flex h-10 shrink-0 items-center gap-1.5 border-b-2 border-transparent px-2.5 text-[12.5px] font-medium leading-none text-[var(--admin-chrome-muted)] transition-colors duration-150 hover:bg-[var(--admin-chrome-hover)] hover:text-[var(--admin-chrome-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-primary)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[var(--admin-chrome-muted)]";
  const chromeToolbarBtnActive = "inline-flex h-10 shrink-0 items-center gap-1.5 border-b-2 border-[var(--admin-primary)] bg-[var(--admin-chrome-hover)] px-2.5 text-[12.5px] font-medium leading-none text-[var(--admin-chrome-text)] transition-colors duration-150 hover:bg-[var(--admin-chrome-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-primary)]";
  const chromeSurfaceShortcut = "flex h-10 w-12 shrink-0 flex-col items-center justify-center gap-0.5 border-b-2 text-[8.5px] font-medium tracking-[0.02em] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-primary)]";

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-[var(--admin-bg)] text-[var(--admin-text-primary)] lg:h-screen lg:min-h-0 lg:overflow-hidden">
      <header className="z-40 flex h-10 shrink-0 items-center border-b border-[var(--admin-chrome-border)] bg-[var(--admin-chrome-bg)] pl-3 text-[var(--admin-chrome-text)]">
        <h1 className="sr-only">Megeredchian Law Seats</h1>
        <div className="flex min-w-0 shrink-0 items-center gap-2">
          <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden bg-white">
            {/* Megeredchian Law brand mark on a white chip so its orange + charcoal read on the dark chrome bar. */}
            <Image src="/images/megeredchian-mark.png?v=tight" alt="" width={20} height={20} unoptimized className="h-5 w-5 object-contain" />
          </span>
          <div aria-hidden="true" className="hidden min-w-0 truncate text-[12.5px] font-semibold leading-none sm:block">
            Megeredchian Law <span className="font-normal text-[var(--admin-chrome-muted)]">· Seat Planner</span>
          </div>
        </div>

        <span aria-hidden="true" className="mx-2.5 hidden h-[22px] w-px shrink-0 bg-[var(--admin-chrome-border)] lg:block" />

        {/* Filter + Search: ONE connected control — the Filter segment sits
            immediately LEFT of the search input, sharing one border (prototype
            pairing). The dropdown anchors inside this group so the open menu
            butts directly against the button, no gap. */}
        <div data-filter-ui className="relative mr-1 flex h-[26px] min-w-0 shrink-0 items-stretch border border-[var(--admin-chrome-border)] bg-[var(--admin-chrome-field)] lg:mr-2 lg:min-w-0 lg:max-w-[340px] lg:flex-1">
          {canEdit && (
            <button
              type="button"
              data-filter-ui
              onClick={toggleFilterPanel}
              aria-controls="seat-map-filter-panel"
              aria-expanded={!filterCollapsed}
              aria-haspopup="true"
              aria-label={filterCollapsed ? "Open filters" : "Collapse filters"}
              className={[
                "flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 text-[12px] font-medium leading-none transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-primary)] lg:border-r lg:border-r-[var(--admin-chrome-border)]",
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
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--admin-primary-cta)] px-1 text-[10px] font-semibold text-white">{structuredFilterCount}</span>
              )}
              <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3 w-3 text-[var(--admin-chrome-muted)]">
                <path d="m5.5 8 4.5 4.5L14.5 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          <div role="search" aria-label="Command search" className="hidden h-full min-w-0 flex-1 lg:block">
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
                  }
                }}
                placeholder="Search people or seats"
                className="h-full w-full border-0 bg-transparent pl-8 pr-14 text-[12px] font-medium text-[var(--admin-chrome-text)] outline-none transition placeholder:text-[var(--admin-chrome-muted)] hover:bg-white/[0.06] focus:bg-white/[0.04] focus:ring-2 focus:ring-inset focus:ring-[var(--admin-primary)]"
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
                <kbd aria-hidden="true" className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 border border-[var(--admin-chrome-border)] px-1 py-0.5 text-[9px] font-semibold text-[var(--admin-chrome-muted)]">{searchShortcutHint}</kbd>
              ) : null}
            </label>
          </div>
          {showFilterPanel && (
            <div data-filter-ui className="absolute -left-px top-full z-50 w-[288px] max-w-[calc(100vw-16px)]">
              <FilterPanel
                department={department}
                status={status}
                departments={departments}
                zone={zone}
                zones={zones}
                activeChips={activeFilterChips}
                onClose={toggleFilterPanel}
                onDepartmentChange={setDepartment}
                onZoneChange={setZone}
                onStatusChange={setStatus}
                onRemoveActiveChip={removeActiveFilterChip}
                onClearFilters={clearStructuredFilters}
              />
            </div>
          )}
        </div>

        {canEdit && (
          <nav role="group" aria-label="Admin command row" className="ml-1 flex min-w-0 flex-1 items-center overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:ml-0 lg:flex-none lg:overflow-visible">
            <button
              type="button"
              onClick={undoDraftEdit}
              disabled={pending || inspectorDirty || !undoAvailable}
              aria-label="Undo last map change"
              title={undoTitle}
              className={chromeToolbarBtn}
            >
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5">
                <path d="M6.5 8.5H12a3.5 3.5 0 0 1 0 7H8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M8.5 5.5 5 8.5l3.5 3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Undo
            </button>
            <button
              type="button"
              onClick={redoDraftEdit}
              disabled={pending || inspectorDirty || !redoAvailable}
              aria-label="Redo last undone change"
              title={redoTitle}
              className={chromeToolbarBtn}
            >
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5">
                <path d="M13.5 8.5H8a3.5 3.5 0 0 0 0 7h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M11.5 5.5 15 8.5l-3.5 3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Redo
            </button>
            <button
              type="button"
              onClick={() => setShowNames(current => !current)}
              aria-label={namesToggleLabel}
              title={namesToggleLabel}
              className={showNames ? chromeToolbarBtnActive : chromeToolbarBtn}
            >
              {namesToggleLabel}
            </button>
            <Link
              href="/admin/management"
              onClick={event => {
                if (!beforeManagementNavigation()) event.preventDefault();
              }}
              className={chromeToolbarBtn}
            >
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5">
                <rect x="3" y="4" width="14" height="12" stroke="currentColor" strokeWidth="1.5" />
                <path d="M3 8h14M8.5 8v8" stroke="currentColor" strokeWidth="1.5" />
              </svg>
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
              className={askPlannerOpen || plannerHighlightedSeatIds.length > 0 ? chromeToolbarBtnActive : chromeToolbarBtn}
            >
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5">
                <path d="M10 3.2 11.7 8 16.5 9.7 11.7 11.4 10 16.2 8.3 11.4 3.5 9.7 8.3 8 10 3.2Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                <path d="M15.6 3.4v3M14.1 4.9h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
              Ask Planner
              {plannerHighlightedSeatIds.length > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--admin-primary-cta)] px-1 text-[10px] font-semibold text-white">{plannerHighlightedSeatIds.length}</span>
              )}
            </button>
          </nav>
        )}

        <div className="ml-auto flex h-full shrink-0 items-center">
          {/* Surface shortcuts: the active surface carries the orange underline. */}
          <div className="hidden h-full items-center sm:flex">
            <Link
              href="/"
              aria-label="Open viewer surface"
              title="Viewer — published map"
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
            <button
              type="button"
              onClick={openPublishReview}
              aria-label={`Review ${draftStatusLabel.toLowerCase()}`}
              title={draftStatusTitle}
              className={[
                "inline-flex h-10 shrink-0 items-center gap-1.5 px-3.5 text-[12.5px] font-semibold leading-none transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white",
                publishSummary.hasChanges
                  ? "bg-[var(--admin-primary)] text-[var(--admin-primary-ink)] hover:brightness-105 motion-safe:animate-[sp-chip-pop_240ms_ease-out]"
                  : "text-[var(--admin-chrome-muted)] hover:bg-[var(--admin-chrome-hover)] hover:text-[var(--admin-chrome-text)]"
              ].join(" ")}
            >
              {publishSummary.hasChanges ? (
                <>
                  <span>Publish</span>
                  <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#161616]/15 px-1 text-[11px] font-bold tabular-nums">{publishSummary.totalChangeCount}</span>
                </>
              ) : (
                <>
                  <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[var(--admin-status-ok)]" />
                  <span className="hidden sm:inline">Published</span>
                </>
              )}
            </button>
          )}
          {canEdit ? (
            <Link
              href="/admin/settings"
              aria-label="Open settings"
              title="Settings — data utilities and recovery"
              onClick={event => {
                if (!beforeManagementNavigation()) event.preventDefault();
              }}
              className="mx-2.5 flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-[var(--admin-primary)] text-[11px] font-semibold text-[var(--admin-primary-ink)] transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--admin-chrome-bg)]"
            >
              A
            </Link>
          ) : (
            <span aria-hidden="true" className="mx-2.5 flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-[var(--admin-primary)] text-[11px] font-semibold text-[var(--admin-primary-ink)]">A</span>
          )}
        </div>
      </header>

      <div className={["mx-auto flex w-full max-w-[1920px] flex-1 flex-col px-2 py-2 sm:px-3 sm:py-3 lg:min-h-0 lg:overflow-hidden", stageReservedClassName].filter(Boolean).join(" ")}>
        

        <div className="flex min-w-0 flex-col overflow-hidden lg:min-h-0">
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
                  }
                }}
                placeholder="Search people, seats, departments, or zones"
                className="h-11 w-full border border-[var(--admin-border)] bg-[var(--admin-surface)] pl-11 pr-10 text-sm font-medium text-[var(--admin-text-primary)] shadow-sm outline-none transition placeholder:text-[var(--admin-text-subtle)] hover:border-[var(--admin-border-strong)] focus:border-[var(--admin-primary)] focus:ring-2 focus:ring-[color:var(--admin-primary-border)]"
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

      <main className={["grid grid-cols-1 gap-2 bg-[var(--admin-surface-muted)] p-2 lg:min-h-0 lg:flex-1 lg:items-stretch lg:overflow-hidden", desktopMapGridClass].join(" ")}>
        <section aria-labelledby="admin-planning-canvas-title" className={[filterCollapsed ? "order-1" : "order-2", "min-w-0 overflow-hidden p-0.5 lg:order-2 lg:flex lg:min-h-0 lg:flex-col lg:gap-2"].filter(Boolean).join(" ")}>
          {staleDraftNotice && (
            <div role="alert" className={actionErrorBannerClassName}>
              {staleDraftNotice}
            </div>
          )}

          {actionError && (
            <div role="alert" className={actionErrorBannerClassName}>
              {actionError}
            </div>
          )}

          {actionNotice && !swapSourceSeatId && (
            <div role="status" aria-live="polite" className={actionNoticeBannerClassName}>
              <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{actionNotice}</span>
              {canEdit && undoAvailable && lastUndoLabel && !pending && !inspectorDirty && (
                <button
                  type="button"
                  onClick={undoDraftEdit}
                  className="shrink-0 self-start rounded-full border border-[var(--admin-state-saved-border)] bg-white/80 px-3 py-1 text-[11px] font-semibold text-[var(--admin-state-saved-text)] transition hover:bg-white active:scale-[0.97] active:duration-75 active:shadow-inner focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--admin-state-saved-border)] sm:self-auto"
                >
                  Undo {lastUndoLabel}
                </button>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-0.5 pb-2 lg:pb-0">
            <FloorSelector floor={floor} onChange={setFloor} />
            <span className="text-[12px] text-[var(--admin-text-secondary)]">{mapCrumbLabel}</span>
            <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
              <ActiveFilterChips chips={activeFilterChips} onRemove={removeActiveFilterChip} onClearAll={clearAllConstraints} />
              {canEdit && floor === "3" && (
                <div data-map-menu className="relative">
                  <button
                    type="button"
                    aria-haspopup="true"
                    aria-expanded={mapMenuOpen}
                    aria-controls={mapMenuOpen ? "seat-map-overflow-menu" : undefined}
                    aria-label="More map actions"
                    title="More map actions"
                    onClick={() => setMapMenuOpen(current => !current)}
                    className={[
                      "inline-flex h-[30px] w-8 items-center justify-center border transition active:scale-[0.97] active:duration-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)]",
                      mapMenuOpen || addSeatMode
                        ? "border-[var(--admin-primary)] bg-[var(--admin-primary-soft)] text-[var(--admin-primary-cta)]"
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
                      role="group"
                      aria-label="Map actions"
                      onKeyDown={event => {
                        if (event.key === "Escape") {
                          event.stopPropagation();
                          setMapMenuOpen(false);
                        }
                      }}
                      className="absolute right-0 top-full z-40 min-w-[176px] border border-[var(--admin-border)] bg-[var(--admin-surface)] py-1 shadow-[var(--admin-elevation-3-shadow)]"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setMapMenuOpen(false);
                          fitMapToView();
                        }}
                        className="flex w-full items-center px-3 py-2 text-left text-[12px] font-medium text-[var(--admin-text-primary)] transition hover:bg-[var(--admin-surface-alt)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-focus)]"
                      >
                        Fit map to view
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMapMenuOpen(false);
                          applyMapZoom(1);
                        }}
                        className="flex w-full items-center px-3 py-2 text-left text-[12px] font-medium text-[var(--admin-text-primary)] transition hover:bg-[var(--admin-surface-alt)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-focus)]"
                      >
                        Zoom to 100%
                      </button>
                      <button
                        type="button"
                        aria-pressed={addSeatMode}
                        onClick={addSeatMode ? cancelAddSeatMode : startAddSeatMode}
                        className={[
                          "flex w-full items-center px-3 py-2 text-left text-[12px] font-medium transition hover:bg-[var(--admin-surface-alt)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-focus)]",
                          addSeatMode ? "text-[var(--admin-primary-cta)]" : "text-[var(--admin-text-primary)]"
                        ].join(" ")}
                      >
                        {addSeatMode ? "Exit Add Seat" : "Add seat"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="relative min-w-0 lg:flex lg:min-h-0 lg:flex-1">
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
              {floor === "2" && (
                <div role="status" className="grid min-h-[360px] w-full place-items-center p-6 text-center sm:min-h-[520px] lg:h-full lg:min-h-0">
                  <div>
                    <div className="text-sm font-semibold text-[var(--admin-text-primary)]">{FLOOR_LABELS["2"]}</div>
                    <p className="mt-1 text-xs text-[var(--admin-text-muted)]">Not yet mapped — reserved for a future rollout.</p>
                  </div>
                </div>
              )}
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
                  className="block h-auto w-full select-none"
                  draggable={false}
                />

                <div className={mapMarkerLayerClassName}>
                  {/* Every state renders individual seat markers — the fit view
                      never collapses to zone/cluster pills (owner QA, round 2). */}
                  {localSeats.map(seat => {
                    const seatMatchesFilters = matchesFilters(seat);
                    const visualSeat = visualSeatById.get(seat.id) ?? seat;
                    const viewportPlacement = getMarkerViewportPlacement(visualSeat.x);

                    const dimmedByPlannerFocus =
                      plannerHighlightedSeatIds.length > 0 &&
                      !plannerHighlightedSeatIdSet.has(seat.id) &&
                      seat.id !== selectedSeatId;

                    return (
                      <SeatMarker
                        key={seat.id}
                        seat={visualSeat}
                        selected={seat.id === selectedSeatId}
                        dimmed={!seatMatchesFilters || dimmedByPlannerFocus}
                        canEdit={canEdit}
                        showNames={showNames}
                        searchResult={Boolean(search.trim()) && seatMatchesFilters}
                        draftChanged={draftChangedSeatLabelSet.has(seat.label)}
                        compactNameLabel={crowdedNameSeatIdSet.has(seat.id)}
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
                <p aria-label="Seat inventory summary" className="truncate text-xs font-medium text-[var(--admin-text-muted)]">
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
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-seat-confirm-title"
            aria-describedby="delete-seat-confirm-description"
            className="w-full max-w-md rounded-2xl border border-[var(--sp-color-border-subtle)] bg-[var(--sp-color-surface)]/95 p-4 text-[var(--sp-color-text-primary)] shadow-[0_26px_80px_rgba(23,26,29,0.32)] backdrop-blur-2xl"
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
                x
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-[var(--admin-state-danger-border)] bg-[var(--admin-state-danger-bg)] p-3 text-sm font-semibold leading-5 text-[var(--admin-state-danger-text)]">
              This removes custom draft seats only. Published maps are unchanged until you publish.
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button type="button" onClick={() => setDeleteSeatConfirm(null)} disabled={pending} className="w-full">
                Cancel
              </Button>
              <Button type="button" variant="danger" onClick={confirmDeleteSelectedSeat} disabled={pending} className="w-full !border-[var(--admin-danger)] !bg-[var(--admin-danger)] !text-white hover:!border-[var(--admin-danger)] hover:!bg-[var(--admin-danger)]">
                Delete seat
              </Button>
            </div>
          </section>
        </div>
      )}

      {publishReviewOpen && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[var(--admin-rail-bg)]/48 p-3 backdrop-blur-[2px] sm:z-50 sm:items-center">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="publish-review-title"
            aria-describedby="publish-review-description"
            className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden border border-[var(--admin-border)] bg-[var(--admin-surface)] p-4 text-[var(--admin-text-primary)] shadow-[0_30px_90px_rgba(23,26,29,0.34)] backdrop-blur-2xl"
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
                x
              </button>
            </div>

            <div className="min-h-0 overflow-y-auto py-4">
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
                className={["w-full !border-[var(--admin-primary-cta)] !bg-[var(--admin-primary-cta)] !text-white hover:!border-[var(--admin-primary-hover)] hover:!bg-[var(--admin-primary-hover)] disabled:!border-[var(--admin-state-neutral-border)] disabled:!bg-[var(--admin-state-neutral-bg)] disabled:!text-[var(--admin-text-subtle)]", focusRingClass].join(" ")}
              >
                {pending ? "Publishing..." : actionError && publishSummary.hasChanges ? "Retry publish" : publishSummary.hasChanges ? (
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
          className="fixed inset-x-3 bottom-3 z-[80] border border-[var(--admin-primary-border)] bg-[var(--admin-surface)] p-4 shadow-[var(--admin-elevation-4-shadow)] motion-safe:animate-[sp-panel-in_200ms_ease-out] panel:inset-x-auto panel:bottom-auto panel:right-3 panel:top-[48px] panel:z-40 panel:w-[320px] panel:max-w-[calc(100vw-1.5rem)]"
        >
          <div className="text-[10px] font-semibold text-[var(--admin-primary-cta)]">{activeMode.label} mode</div>
          <p className="mt-1 text-sm font-bold leading-5 text-[var(--admin-text-primary)]">{activeMode.message}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={activeMode.onExit} className="shrink-0 whitespace-nowrap rounded-full bg-[var(--admin-primary-soft)] px-3 py-1.5 text-[11px] font-semibold text-[var(--admin-primary-cta)] ring-1 ring-[var(--admin-primary-border)] transition hover:bg-white active:scale-[0.97] active:duration-75 active:shadow-inner focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus-ring-color)]">
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
            role="dialog"
            aria-modal="true"
            aria-labelledby="inspector-unsaved-title"
            aria-describedby="inspector-unsaved-description"
            className="w-full max-w-md rounded-2xl border border-[var(--sp-color-border-subtle)] bg-[var(--sp-color-surface)]/95 p-4 text-[var(--sp-color-text-primary)] shadow-[0_26px_80px_rgba(23,26,29,0.32)] backdrop-blur-2xl"
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
            role="dialog"
            aria-modal="true"
            aria-labelledby="swap-confirm-title"
            className="w-full max-w-md rounded-2xl border border-[var(--sp-color-border-subtle)] bg-[var(--sp-color-surface)]/95 p-4 text-[var(--sp-color-text-primary)] shadow-[0_26px_80px_rgba(23,26,29,0.32)] backdrop-blur-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="swap-confirm-title" className="text-base font-semibold">Confirm seat swap</h2>
                <p className="mt-1 text-sm leading-5 text-[var(--sp-color-text-muted)]">This updates draft seats only. Viewers will not see it until publish.</p>
              </div>
              <button
                type="button"
                onClick={() => setSwapConfirm(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold text-[var(--sp-color-text-muted)] transition hover:bg-[var(--sp-color-graphite-soft)] hover:text-[var(--sp-color-text-secondary)]"
                aria-label="Cancel swap confirmation"
              >
                x
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
