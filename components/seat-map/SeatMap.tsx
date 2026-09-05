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
import { clientActionErrorMessage } from "@/lib/clientActionError";
import type { DepartmentOption, Employee, SeatWithEmployee, ZoneOption } from "@/lib/types";
import { STATUS_LABELS } from "@/lib/types";
import { createSeatAction, deleteSeatAction, swapSeatAssignmentsAction, updateSeatAction } from "@/app/actions";
import { findSeatIdByParam, readFilterParams, readFloorParam, readNamesParam, readQueryParam, readSeatParam } from "@/lib/deepLink";
import { nextMapHref } from "@/lib/mapUrlState";
import { scopeResults, type SearchScope } from "@/lib/mapSearchScope";
import { historyShortcutFor, redoShortcutHint, shortcutHint, shortcutTargetIsEditable, undoShortcutHint } from "@/lib/platformShortcut";
import { findEmployeeByEmail } from "@/lib/mySeat";
import { buildPositionOptions } from "@/lib/positions";
import { buildViewerFilterGroups } from "@/lib/viewerFilterGroups";
import { buildViewerPaletteBrowse } from "@/lib/viewerFindPalette";
import { DEFAULT_FLOOR, floorOf } from "@/lib/floorIds";
import { FLOORS, floorIsMapped, floorOrdinal, peopleOnFloor, rosterFloorForUnseated, urlFloorFor } from "@/lib/floors";
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
import { clientPointToNormalized } from "@/lib/seatMath";
import { normalizeSeat, normalizeSeats } from "@/lib/seatNormalize";
import { arrowKeyToDirection, edgeKeyToPosition, findNearestSeatInDirection, resolveRovingSeatId, seatAtReadingEdge } from "@/lib/seatKeyboardNav";
import { canDeleteSeat, getSeatDeleteBlockReason } from "@/lib/seatProtection";
import { canVacateSeat } from "@/lib/seatDraftActions";
import { detectSeatZoneForPointResult, getSeatZoneDetectionFailureMessage } from "@/lib/seatZones";
import { formatDisplayName } from "@/lib/formatName";
import {
  MAP_IMAGE_HEIGHT,
  MAP_IMAGE_WIDTH,
  savedPointToVisualPoint,
  seatsToVisualSeats,
  visualPointToSavedPoint
} from "@/lib/mapLayoutTransform";
import { PILL_CLEARANCE_PX, PILL_HEIGHT_PX, clearanceFromScale, computeNameLabelNudges, estimatePillWidthPx } from "@/lib/seatCrowding";
import { AskPlannerDrawer, type AskPlannerQueuedRequest } from "@/components/seat-map/AskPlannerDrawer";
import { DraftTrailOverlay } from "@/components/seat-map/DraftTrailOverlay";
import { FloorRoster, focusFloorRoster } from "@/components/seat-map/FloorRoster";
import type { FloorId } from "@/lib/floorIds";
import { MapControlRow } from "@/components/seat-map/MapControlRow";
import { CanvasStatus, type CanvasNotice } from "@/components/seat-map/CanvasStatus";
import { ViewerFindPalette } from "@/components/seat-map/ViewerFindPalette";
import { MapStatusBand } from "@/components/seat-map/MapStatusBand";
import type { SeatMarkKind } from "@/components/seat-map/SeatMark";
import { MapZoomControl } from "@/components/seat-map/MapZoomControl";
import { SeatInspector } from "@/components/seat-map/SeatInspector";
import { useSeatDraftActions } from "@/components/seat-map/useSeatDraftActions";
import { useDraftHistory } from "@/components/seat-map/useDraftHistory";
import { usePublishReview } from "@/components/seat-map/usePublishReview";
import { getSeatZone, useSeatFilters } from "@/components/seat-map/useSeatFilters";
import { RightSlot, type RightSlotOwner } from "@/components/seat-map/RightSlot";
import { ModeCard } from "@/components/seat-map/ModeCard";
import { draftChangedSeatLabels } from "@/lib/draftChanges";
import { SeatMarker, seatPillLabel } from "@/components/seat-map/SeatMarker";
import { invalidTargetReason, targetValidity, type TargetMode } from "@/lib/seatTargets";
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
import { useAppShellFilters, useAppShellLeftPanel, useAppShellNavigation, useAppShellState, type ShellFilterSpec } from "@/components/ui/AppShell";
import { focusRingClass } from "@/components/ui/design-system";
import { returnFocusAfterClose } from "@/components/ui/returnFocus";
import { SEAT_SEARCH_PLACEHOLDER, buildViewerSeatSearch, type ViewerSearchResult } from "@/lib/viewerSeatSearch";
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
  const hrefs = GUARDED_NAVIGATION_HREFS as readonly string[];
  // The shell's History switch keeps the view (?floor= / ?seat=) on the
  // other mode's map (redesign-v2 PR 2), so a guarded destination may carry
  // a query the closed set does not spell out — match the pathname too.
  return hrefs.includes(href) || hrefs.includes(href.split("?")[0]);
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

type SeatStatusLegendItem = {
  key: string;
  label: string;
  mark: SeatMarkKind;
  draftOnly?: boolean;
  badge?: boolean;
};

const SEAT_STATUS_LEGEND: SeatStatusLegendItem[] = [
  { key: "assigned", label: STATUS_LABELS.assigned, mark: "assigned" },
  { key: "available", label: STATUS_LABELS.available, mark: "open" },
  { key: "reserved", label: STATUS_LABELS.reserved, mark: "reserved" },
  { key: "unavailable", label: STATUS_LABELS.unavailable, mark: "unavailable" },
  // The ◇ — PHASE3DS §1.16: "changed in draft", the Draft family's shape.
  { key: "draft-changed", label: "Changed in draft", mark: "draft-badge", draftOnly: true, badge: true }
];

// Option names for the left panel's groups: trimmed, de-duplicated
// case-insensitively (first spelling wins), sorted — the viewer's rule.
function uniqueOptionNames(values: Array<string | null | undefined>) {
  const seen = new Map<string, string>();
  values.forEach(value => {
    const trimmed = value?.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) seen.set(key, trimmed);
  });
  return Array.from(seen.values()).sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

// Multi-floor PR-3: the admin roster region's id — the focus target when a
// find lands on an unseated person (the roster floor has no map to pan).
const ADMIN_ROSTER_REGION_ID = "admin-floor-roster";
// The floating top-left/right cluster (search card, Add seat, floor pill below
// lg) rides over the stage's top 12px + 32px; the roster's sticky header
// clears it with 8px of breathing room. Constant here — the admin cluster is
// one fixed row, unlike the viewer's wrapping chip cluster.
const ADMIN_ROSTER_HEADER_INSET_PX = 52;

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
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [searchShortcutHint, setSearchShortcutHint] = useState<string | null>(null);
  // navigator.platform after hydration (P3-4): the Undo / Redo tooltips name
  // the modifier from it; the server render says Ctrl.
  const [platform, setPlatform] = useState<string | undefined>(undefined);
  // The ONE Find surface, shared with the viewer (D1-d, PR 3a): the control
  // row's field opens the 560px palette; results and browse share the slot.
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [searchScope, setSearchScope] = useState<SearchScope>("floor");
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const searchFieldRef = useRef<HTMLDivElement | null>(null);
  const paletteRef = useRef<HTMLDivElement | null>(null);
  const suppressPaletteReopenRef = useRef(false);
  // Editing is lg-and-up (D2, deviation 4): below the hinge the draft map is
  // read-only — the row's editor cluster is Hidden and the band says why.
  const [editTier, setEditTier] = useState(true);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const update = () => setEditTier(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
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
  // Multi-floor PR-3: the canvas floor. Landing: a ?seat= deep link's floor
  // → ?floor= → Floor 3 (applied by the mount effect below; the admin keeps no
  // remembered floor — editing starts from the plan everyone publishes).
  const [floor, setFloor] = useState<FloorId>(DEFAULT_FLOOR);
  // The floor most recently switched to by a user action, for the live
  // region ("Showing Floor 2 · Litigation"); cleared by the next selection.
  const [announcedFloor, setAnnouncedFloor] = useState<FloorId | null>(null);
  // The roster row a find landed on (an unseated person opened from the
  // results panel) — marked with aria-current while that person is listed.
  const [rosterHighlightedPersonId, setRosterHighlightedPersonId] = useState<string | null>(null);
  // Status-band tiers (Option A parity with the viewer, owner call
  // 2026-08-17): the band renders from sm (640) up, and below the panel tier
  // it yields to the bottom sheets. Desktop-first defaults keep SSR and the
  // first client render in agreement; the mount effect corrects both before
  // interaction. JS state rather than hidden/sm: classes because the band and
  // the phone-only floating zoom stack carry the SAME control roles — both
  // mounted at once would be two "Zoom in" buttons in the accessibility tree.
  const [bandTier, setBandTier] = useState(true);
  const [panelTier, setPanelTier] = useState(true);
  useEffect(() => {
    function updateBandTiers() {
      setBandTier(window.matchMedia("(min-width: 640px)").matches);
      setPanelTier(window.matchMedia(`(min-width: ${SEAT_CENTER_PANEL_BREAKPOINT_PX}px)`).matches);
    }

    updateBandTiers();
    window.addEventListener("resize", updateBandTiers);
    return () => window.removeEventListener("resize", updateBandTiers);
  }, []);
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
  // The reason the last refused destination gave (lib/seatTargets, O4) — shown
  // in the canvas status region only while the mode that refused it runs.
  const [invalidTargetNotice, setInvalidTargetNotice] = useState<string | null>(null);
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
    historyOpInFlight,
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
  const maxDraftUpdatedAt = useMemo(
    () => localSeats.reduce<string | null>((max, seat) => (seat.updated_at && (!max || seat.updated_at > max) ? seat.updated_at : max), null),
    [localSeats]
  );
  const liveDraftStatus = useMemo(
    () => ({ changeCount: publishSummary.totalChangeCount, lastEditAt: maxDraftUpdatedAt }),
    [publishSummary.totalChangeCount, maxDraftUpdatedAt]
  );

  // Filter/search values, everything derived from them, and their handlers
  // live in their own hook (M4 step 4). The structured facets (department /
  // position / zone / status) are DORMANT on this surface since the canvas
  // filter UI was removed (2026-08-20, owner) — no admin control sets them,
  // so only the search facet can narrow the map. The hook keeps its full
  // shape because the results panel and the Esc ladder still consume the
  // shared flags/handlers.
  const {
    search,
    setSearch,
    department,
    setDepartment,
    position,
    setPosition,
    zone,
    setZone,
    status,
    setStatus,
    structuredFilterCount,
    filtersActive,
    searchQuery,
    searchActive,
    structuredFiltersActive,
    matchingSeats,
    resultStatusBreakdown,
    matchesFilters,
    clearStructuredFilters,
    clearAllConstraints,
    clearSearch,
    handleSearchInputChange
  } = useSeatFilters({
    localSeats,
    localEmployees,
    floor,
    selectedSeatId,
    inspectorDirty,
    setInspectorCollapsed
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

  const openAskPlannerDrawer = useCallback(() => {
    // B2: the right edge only ever holds one panel. Opening Ask Planner
    // collapses the seat inspector so they don't stack / overlap. Keep the
    // seat selected (selectedSeatId untouched) — collapsing only pins the
    // inspector to its pill; expanding restores it.
    inspectorExpandedBeforePlannerRef.current = Boolean(selectedSeatId) && !inspectorCollapsed;
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
    openAskPlanner: openAskPlannerDrawer,
    // Live drawer state → the shell's Ask Planner channel (PR 3 consumer;
    // flows through AppShell's own channel, not the register-once handlers).
    askPlannerOpen,
    // Live draft status → the shell's mode indicator ("Draft — N changes")
    // and the History panel's status line (PHASE2UX §1.5): the count is the
    // publish review's own total, the last edit the newest draft updated_at.
    draftStatus: liveDraftStatus
  });
  // The persistent shell (null in standalone harnesses): the left panel the
  // control row's "Filters · N" opens, and the person's published seat for
  // "Find me" (D1-f — the published layer on every surface).
  const shellLeftPanel = useAppShellLeftPanel();
  const shellState = useAppShellState();

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

  // Ctrl/⌘ K focuses the search AND opens the palette (D1-d) — the same
  // muscle memory as the viewer. The hint renders after mount so the server
  // markup never guesses the platform (P3-4, lib/platformShortcut).
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setPlatform(window.navigator.platform);
      setSearchShortcutHint(shortcutHint(window.navigator.platform, "K"));
    });
    const handleSearchShortcut = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener("keydown", handleSearchShortcut);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", handleSearchShortcut);
    };
  }, []);

  // Outside click closes the palette; the field counts as inside (a press
  // there is how you open it).
  useEffect(() => {
    if (!paletteOpen) return;
    function handleOutsidePointer(event: globalThis.PointerEvent) {
      const target = event.target as Node;
      if (paletteRef.current?.contains(target)) return;
      if (searchFieldRef.current?.contains(target)) return;
      setPaletteOpen(false);
    }
    document.addEventListener("pointerdown", handleOutsidePointer);
    return () => document.removeEventListener("pointerdown", handleOutsidePointer);
  }, [paletteOpen]);

  // Undo / Redo keyboard shortcuts (P2-1 — the tooltips promise them):
  // Ctrl/⌘ Z, Ctrl/⌘ Shift Z (Ctrl Y on Windows). Never while typing, inside a
  // dialog, while a mutation is in flight or the inspector holds unsaved edits
  // — the same gate the row's buttons use.
  useEffect(() => {
    if (!canEdit) return;
    const handleHistoryShortcut = (event: globalThis.KeyboardEvent) => {
      const action = historyShortcutFor(event, window.navigator.platform);
      if (!action) return;
      if (shortcutTargetIsEditable(event.target)) return;
      if (mutationInFlight || inspectorDirty || historyOpInFlight) return;
      if (action === "undo" && !undoAvailable) return;
      if (action === "redo" && !redoAvailable) return;
      event.preventDefault();
      if (action === "undo") undoDraftEdit();
      else redoDraftEdit();
    };
    window.addEventListener("keydown", handleHistoryShortcut);
    return () => window.removeEventListener("keydown", handleHistoryShortcut);
  }, [canEdit, historyOpInFlight, inspectorDirty, mutationInFlight, redoAvailable, redoDraftEdit, undoAvailable, undoDraftEdit]);

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
        // While the discard RPC is in flight the dialog is the only "still
        // running" indicator — its buttons disable on `pending`, and Escape
        // must not sidestep that (the dialog's own guarded handler can't stop
        // this window listener from firing).
        if (!pending) setDiscardDraftConfirmOpen(false);
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
        // Same pending guard as the discard branch above: keep the review
        // dialog visible while publish is resolving.
        if (!pending) setPublishReviewOpen(false);
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

      if (addSeatMode || swapSourceSeatId || moveEmployeeSourceSeatId) {
        const canceledMode = swapSourceSeatId ? "Swap" : moveEmployeeSourceSeatId ? "Move" : "Add seat";
        setAddSeatMode(false);
        setSwapSourceSeatId(null);
        setMoveEmployeeSourceSeatId(null);
        setActionNotice(`${canceledMode} canceled — no changes made.`, "neutral");
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

      if (paletteOpen) {
        // Focus is about to unmount with the palette if it was on a row —
        // hand it back to the field rather than letting it fall to <body>.
        if (event.target instanceof Node && paletteRef.current?.contains(event.target)) {
          suppressPaletteReopenRef.current = true;
          window.requestAnimationFrame(() => {
            searchInputRef.current?.focus();
            suppressPaletteReopenRef.current = false;
          });
        }
        setPaletteOpen(false);
        return;
      }

      if (!isEditableTarget(event.target) && search.trim()) {
        setSearch("");
        return;
      }

      if (!isEditableTarget(event.target) && structuredFiltersActive) {
        // clearStructuredFilters(), not three hand-written setters: the flag
        // counts POSITION too — the open-coded trio left a position-only
        // filter pinned while Escape reported itself as having cleared the
        // layer (the viewer twin fixed and pinned this first; see
        // ViewerSeatFinder's Esc handler).
        clearStructuredFilters();
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [addSeatMode, askPlannerOpen, paletteOpen, clearStructuredFilters, closeAskPlannerDrawer, deleteSeatConfirm, discardDraftConfirmOpen, inspectorDirty, inspectorGuardAction, moveEmployeeConfirm, moveEmployeeSourceSeatId, pending, publishReviewOpen, search, selectedSeatId, setActionNotice, setDiscardDraftConfirmOpen, setPublishReviewOpen, setSearch, structuredFiltersActive, swapConfirm, swapSourceSeatId, vacateConfirm]);

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
  const landingQueryRef = useRef<string | null>(null);
  useEffect(() => {
    // ?q= (D1-d landing, both routes): field pre-filled, palette open; a
    // unique match opens itself once the results exist. ?names=off overrides
    // the stored preference for this load; the four filters are URL state
    // on this route too (PHASE1IA B3).
    const query = readQueryParam(window.location.search);
    if (query) {
      landingQueryRef.current = query;
      setSearch(query);
      setPaletteOpen(true);
    }
    const names = readNamesParam(window.location.search);
    if (names !== null) setShowNames(names);
    const filtersFromUrl = readFilterParams(window.location.search);
    setDepartment(filtersFromUrl.department);
    setPosition(filtersFromUrl.position);
    setZone(filtersFromUrl.zone);
    setStatus(filtersFromUrl.status);
    const seatParam = readSeatParam(window.location.search);
    // Multi-floor PR-3: land on the floor the URL asks for — a matching
    // ?seat= wins (its floor), else a valid ?floor= (lib/floors urlFloorFor).
    const urlFloor = urlFloorFor(localSeats, { seat: seatParam, floor: readFloorParam(window.location.search) });
    if (urlFloor) setFloor(urlFloor);
    const seatId = findSeatIdByParam(localSeats, seatParam);
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
        queueCenterSeatInMap(seatId);
      }
    });
    return () => window.cancelAnimationFrame(frame);
    // Mount-only by design: replaceState fires no events, and re-running on
    // seat updates would fight the user's live selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ONE writer for the B3 set (lib/mapUrlState): ?floor= ?seat= ?q= ?names=
  // and the four filters compose into a single replaceState once the reads
  // above have happened; the query is debounced so typing never churns
  // history state per keystroke.
  useEffect(() => {
    if (!seatParamAppliedRef.current || !namesPreferenceHydrated) return;
    const write = () => {
      const label = selectedSeatId ? (localSeats.find(seat => seat.id === selectedSeatId)?.label ?? null) : null;
      const next = nextMapHref(window.location, { floor, seatLabel: label, query: search, namesVisible: showNames, filters: { department, position, zone, status } });
      if (next) window.history.replaceState(window.history.state, "", next);
    };
    if (!search) {
      write();
      return;
    }
    const timer = window.setTimeout(write, 150);
    return () => window.clearTimeout(timer);
    // localSeats omitted: a seat's label is stable for the life of its id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [department, floor, namesPreferenceHydrated, position, search, selectedSeatId, showNames, status, zone]);

  const zones = useMemo(() => {
    const values = new Set<string>();
    localZoneOptions.filter(item => item.active).forEach(item => values.add(item.name));
    localSeats.forEach(seat => {
      const seatZone = getSeatZone(seat);
      if (seatZone) values.add(seatZone);
    });
    return Array.from(values).sort();
  }, [localSeats, localZoneOptions]);

  // One canvas per floor (DECISIONS.md D2′, multi-floor PR-3): the plan and
  // every render-layer derivation below (markers, nudges, washes, roving
  // order, legend counts) see ONLY this floor's draft seats. `localSeats`
  // stays building-wide for everything that is not a render layer — search,
  // history, the publish review, the concurrency fence — so a find or a
  // Move/Swap target can live on the other floor and switch the canvas.
  //
  // The EDITOR draws the plan for any MAPPED floor, live or not: it is the
  // surface where a floor becomes live (the first seat is placed here), so a
  // mapped floor with no draft seats is the bare-plan first-run state, not a
  // roster. Liveness (mapped AND a seat carries it) is the viewer's rule —
  // readers never get an empty plan — and lib/floors keeps it there.
  const floorMeta = FLOORS[floor];
  const plan = floorMeta.plan;
  const surface: "plan" | "roster" = floorIsMapped(floor) ? "plan" : "roster";
  const floorSeats = useMemo(() => localSeats.filter(seat => floorOf(seat) === floor), [floor, localSeats]);
  // The people an unmapped floor lists, from the LIVE working set this editor
  // holds (never the published snapshot): seated there, plus — while the
  // interim rule holds — everyone active with no draft seat.
  const rosterPeople = useMemo(
    () => (surface === "roster" ? peopleOnFloor(floor, localSeats, localEmployees) : []),
    [floor, localEmployees, localSeats, surface]
  );
  const stats = useMemo(() => ({
    total: floorSeats.length,
    assigned: floorSeats.filter(seat => seat.status === "assigned").length,
    available: floorSeats.filter(seat => seat.status === "available").length,
    reserved: floorSeats.filter(seat => seat.status === "reserved").length,
    unavailable: floorSeats.filter(seat => seat.status === "unavailable").length
  }), [floorSeats]);
  // ONE source for "changed in draft" (P3-14): the ◇ badge, the inspector
  // note and the legend count all read this set, derived from the publish diff.
  const draftChangedSeatLabelSet = useMemo(() => draftChangedSeatLabels(publishSummary), [publishSummary]);
  // Legend counts follow the active constraints — the number row must not
  // contradict a filtered map (2026-07-16 regrade, review 4). matchesFilters
  // covers search + structured filters, exactly what the map dims by, and
  // filtersActive is the hook's single "is anything narrowing the map?" flag.
  const legendSourceSeats = filtersActive ? floorSeats.filter(matchesFilters) : floorSeats;
  const legendCounts: Record<string, number> = {
    assigned: legendSourceSeats.filter(seat => seat.status === "assigned").length,
    available: legendSourceSeats.filter(seat => seat.status === "available").length,
    reserved: legendSourceSeats.filter(seat => seat.status === "reserved").length,
    unavailable: legendSourceSeats.filter(seat => seat.status === "unavailable").length,
    "draft-changed": draftChangedSeatLabelSet.size
  };

  const selectedSeat = localSeats.find(seat => seat.id === selectedSeatId) ?? null;
  // Only while that person is actually listed on the roster on screen.
  const rosterHighlightedPerson =
    surface === "roster" && rosterHighlightedPersonId
      ? rosterPeople.find(person => person.id === rosterHighlightedPersonId) ?? null
      : null;
  const swapSourceSeat = swapSourceSeatId ? localSeats.find(seat => seat.id === swapSourceSeatId) ?? null : null;
  const swapTargetSeat = swapConfirm ? localSeats.find(seat => seat.id === swapConfirm.targetSeatId) ?? null : null;
  const moveEmployeeSourceSeat = moveEmployeeSourceSeatId ? localSeats.find(seat => seat.id === moveEmployeeSourceSeatId) ?? null : null;
  const moveEmployeeTargetSeat = moveEmployeeConfirm ? localSeats.find(seat => seat.id === moveEmployeeConfirm.targetSeatId) ?? null : null;
  const visualLocalSeats = useMemo(() => seatsToVisualSeats(floorSeats), [floorSeats]);
  const visualSeatById = useMemo(() => new Map(visualLocalSeats.map(seat => [seat.id, seat])), [visualLocalSeats]);
  // Draft-trail overlay pair (design_handoff_swap_trail): a pure derivation of
  // the pending swap/move state above — the trail exists exactly while a
  // confirm holds BOTH endpoints and unmounts with it on confirm/cancel. No
  // new state. Visual (calibration-transformed) seats, so the route lands on
  // the same anchors the markers render at; identities come from the memoized
  // visualSeatById, which is what lets the overlay's geometry memo hold
  // through zoom/pan re-renders.
  const draftTrailCandidate = swapConfirm && swapSourceSeat && swapTargetSeat
    ? { kind: "swap" as const, sourceSeat: visualSeatById.get(swapSourceSeat.id), targetSeat: visualSeatById.get(swapTargetSeat.id) }
    : moveEmployeeConfirm && moveEmployeeSourceSeat && moveEmployeeTargetSeat
      ? { kind: "move" as const, sourceSeat: visualSeatById.get(moveEmployeeSourceSeat.id), targetSeat: visualSeatById.get(moveEmployeeTargetSeat.id) }
      : null;
  const draftTrail = draftTrailCandidate?.sourceSeat && draftTrailCandidate.targetSeat
    ? { kind: draftTrailCandidate.kind, sourceSeat: draftTrailCandidate.sourceSeat, targetSeat: draftTrailCandidate.targetSeat }
    : null;
  // Roving tabindex: the map is ONE tab stop (the selected seat, else the last
  // visited seat, else top-left) and arrow keys walk between seats. Points are
  // scaled to the floor plan's pixel aspect so "right" matches the screen.
  const seatNavPoints = useMemo(
    () => visualLocalSeats.map(seat => ({ id: seat.id, x: seat.x * MAP_IMAGE_WIDTH, y: seat.y * MAP_IMAGE_HEIGHT })),
    [visualLocalSeats]
  );
  const mapRovingSeatId = resolveRovingSeatId(seatNavPoints, selectedSeatId ?? rovingSeatId);
  const plannerHighlightedSeatIdSet = useMemo(() => new Set(plannerHighlightedSeatIds), [plannerHighlightedSeatIds]);
  // A highlight on the other floor is tagged in the drawer; selecting it
  // switches the canvas (commitSeatSelection).
  const plannerFloorTagForSeat = useCallback((seatId: string) => {
    const seat = localSeats.find(item => item.id === seatId);
    return seat && floorOf(seat) !== floor ? FLOORS[floorOf(seat)].tag : null;
  }, [floor, localSeats]);
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

    // Home / End: the reading-order edges (PHASE2UX §1M.11, parity with the viewer).
    const edge = edgeKeyToPosition(event.key);
    if (edge) {
      event.preventDefault();
      event.stopPropagation();
      const edgeSeatId = seatAtReadingEdge(seatNavPoints, edge);
      if (edgeSeatId) {
        setRovingSeatId(edgeSeatId);
        focusSeatMarker(edgeSeatId);
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
        // Finding 1: same race as openSeatFromResults — this is its
        // dirty-guard-deferred continuation, so it arms the skip too (only
        // when the selection is actually changing — see the deep-link
        // effect above for why an unconditional arm would go stale).
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
    if (!seatToVacate || !canVacateSeat(seatToVacate)) {
      // F-ERR-2: the admin confirmed a destructive action — a silent return
      // here is indistinguishable from a broken button. Name what happened.
      setVacateConfirm(null);
      setActionNotice(null);
      setActionError(`${vacateConfirm.label} can no longer be vacated — the draft changed after this dialog opened.`);
      return;
    }

    setActionError(null);
    setActionNotice(null);
    setStaleDraftNotice(null);
    setMutationInFlight(true);

    // PR-5 (§8.1): the dialog holds open through the round-trip — pending
    // state lives on its confirm button. Close on success/stale; a failure
    // keeps it open with the error rendered inline (canvas banner suppressed).
    void barSeatActions.vacateSeat(seatToVacate).then(outcome => {
      setMutationInFlight(false);
      if (outcome.kind === "stale") return; // handleStaleDraft closes the dialog
      if (outcome.kind === "saved") {
        setVacateConfirm(null);
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
    // PR-5: vacate/delete confirms now hold open through the round-trip, so
    // the stale path has to close them too — the banner owns the story here.
    setVacateConfirm(null);
    setDeleteSeatConfirm(null);
    router.refresh();
  }

  const scrollMapToPoint = useCallback((x: number, y: number, options?: { verticalViewportAnchor?: number }) => {
    const viewport = mapViewportRef.current;
    const map = mapRef.current;
    if (!viewport || !map) return;

    const target = scrollTargetForPoint({ x, y }, map, viewport, options?.verticalViewportAnchor ?? 0.5);
    viewport.scrollTo({ ...target, behavior: "smooth" });
  }, []);

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
    setZoomFactor(1);
    if (mapViewMode !== "overview") changeMapViewMode("overview");
  }

  // Multi-floor PR-3: ONE switch path for the selector, finds, deep links,
  // Move/Swap targets and Ask Planner highlights. Zoom and the roving anchor
  // belong to the canvas being left; the SELECTION, the query and a running
  // Move/Swap mode survive — the source seat stays selected while the admin
  // reaches a target on the other floor (that is what lets the canvas
  // auto-switch for a cross-floor move). Add-seat mode cannot survive a
  // switch to a floor with no plan to click on.
  function switchFloor(next: FloorId, options: { announce?: boolean } = {}) {
    if (next === floor) return;
    setFloor(next);
    setRovingSeatId(null);
    setZoomFactor(1);
    if (mapViewMode !== "overview") changeMapViewMode("overview");
    if (addSeatMode && !floorIsMapped(next)) setAddSeatMode(false);
    if (options.announce === false) {
      setAnnouncedFloor(null);
    } else {
      // A MANUAL switch (selector) leaves a find behind: the roster mark
      // belongs to the canvas being left, and the live region must say
      // where the admin is now.
      setRosterHighlightedPersonId(null);
      setAnnouncedFloor(next);
    }
    window.requestAnimationFrame(() => {
      mapViewportRef.current?.scrollTo({ left: 0, top: 0, behavior: "auto" });
    });
  }

  // An unseated person opened from the results panel: the row on the floor
  // they work on (lib/floors interim rule, from the draft rows) is the
  // destination — switch there, mark it, hand it focus. Nothing to open when
  // the rule has retired (the card is inert then, see useSeatFilters).
  function openPersonFromResults(employeeId: string) {
    const targetFloor = rosterFloorForUnseated(localSeats);
    if (!targetFloor) return;
    switchFloor(targetFloor, { announce: false });
    setAnnouncedFloor(null);
    setRosterHighlightedPersonId(employeeId);
    focusFloorRoster(ADMIN_ROSTER_REGION_ID);
  }

  // Click-and-drag pan on the map viewport (view transform only). Interactive
  // targets (seat markers, buttons, links, form fields) never start a pan so
  // their clicks keep working; a press that stays within the drag threshold
  // falls through to the canvas click-to-deselect behavior on release.
  function isPanBlockedTarget(target: EventTarget | null) {
    return target instanceof Element && Boolean(target.closest("button, a, input, select, textarea, [data-seat-id]"));
  }

  function handleViewportPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (mapViewMode !== "detail" || surface !== "plan") return;
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

  // Move / swap destination validity (lib/seatTargets, owner ruling O4): the
  // running mode and its source seat, or null. The marker layer marks every
  // invalid destination from the same predicate the click consults below.
  const targetMode: { mode: TargetMode; source: SeatWithEmployee } | null = (() => {
    if (!canEdit) return null;
    if (moveEmployeeSourceSeatId) {
      const source = localSeats.find(seat => seat.id === moveEmployeeSourceSeatId);
      return source ? { mode: "move", source } : null;
    }
    if (swapSourceSeatId) {
      const source = localSeats.find(seat => seat.id === swapSourceSeatId);
      return source ? { mode: "swap", source } : null;
    }
    return null;
  })();
  function isInvalidTarget(seat: SeatWithEmployee): boolean {
    return targetMode !== null && targetValidity(targetMode.mode, targetMode.source, seat) === "invalid";
  }

  function commitSeatSelection(seatId: string) {
    // The find spans the building (D2′): a result row, a deep link, an Ask
    // Planner highlight or a Move/Swap target can name a seat on the other
    // floor — switch the canvas first, then select or target as usual.
    const targetSeat = localSeats.find(seat => seat.id === seatId);
    if (targetSeat && floorOf(targetSeat) !== floor) switchFloor(floorOf(targetSeat), { announce: false });
    setAnnouncedFloor(null);
    setRosterHighlightedPersonId(null);
    setInvalidTargetNotice(null);

    // An invalid destination refuses the click: no dialog, the reason in the
    // canvas status region (names WHICH rule — never colour only, O4).
    if (targetMode && targetSeat && targetValidity(targetMode.mode, targetMode.source, targetSeat) === "invalid") {
      setInvalidTargetNotice(invalidTargetReason(targetMode.mode, targetMode.source, targetSeat));
      return true;
    }

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

    // Finding 1 (v12 slice 4 final review): arm the skip in the same commit
    // as this selection so the nudge trigger effect never races this queued
    // center's native smooth scrollTo (see the retired inspector nudge).
    // Only when the selection is actually changing — reselecting the already-
    // selected seat (e.g. re-opening its own results row) leaves selectedSeatId
    // unchanged, so the trigger effect's deps never move to consume the flag;
    // arming it anyway would leave it stuck and silently skip a later,
    // unrelated selection's legitimate nudge.
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
        setActionError(clientActionErrorMessage(error, "Could not swap seats."));
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
    // PR-5 (§8.1): the dialog holds open through executeSwap — its success
    // path clears both confirm and source-mode state; a failure keeps the
    // dialog open with the error rendered inline.
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
    // PR-5 (§8.1): dialog holds open through the round-trip — closed on
    // success below; stale closes via handleStaleDraft; errors keep it open.
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
        setMoveEmployeeConfirm(null);
        setLocalSeats(afterSeats);
        setLocalEmployees(afterEmployees);
        setSelectedSeatId(targetSeat.id);
        setInspectorDirty(false);
        setMoveEmployeeSourceSeatId(null);
        setInspectorCollapsed(false);
        setActionNotice(`Moved ${formatDisplayName(mover.full_name)} to ${targetSeat.label}.`);
      } catch (error) {
        setActionNotice(null);
        setActionError(clientActionErrorMessage(error, "Could not move the employee."));
      } finally {
        setMutationInFlight(false);
      }
    });
  }

  function handleMapPointerDown(event: PointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    const seatTarget = target.closest<HTMLElement>("[data-seat-id]");

    if (canEdit && addSeatMode) {
      // Single-flight: a second canvas click while the create round-trip is
      // pending must not mint a second seat. The flag is set below in the
      // event handler (a discrete update React flushes before the next
      // pointer event), not inside the transition.
      if (mutationInFlight) return;
      const visualPoint = eventToPoint(event);
      if (!visualPoint) return;

      if (seatTarget?.dataset.seatId) return;

      const targetZoneResult = detectSeatZoneForPointResult(visualPoint, visualLocalSeats, floor);
      if (targetZoneResult.status !== "detected") {
        setActionNotice(null);
        setActionError(getSeatZoneDetectionFailureMessage(targetZoneResult) ?? "Could not detect a zone for this location.");
        return;
      }
      const targetZone = targetZoneResult.zone;

      const beforeSnapshot = captureDraftSnapshot();

      setMutationInFlight(true);
      startTransition(async () => {
        try {
          const savedPoint = visualPointToSavedPoint(visualPoint, { zone: targetZone, floor });
          setActionError(null);
          setActionNotice(null);
          const created = await createSeatAction({
            x: savedPoint.x,
            y: savedPoint.y,
            visualX: visualPoint.x,
            visualY: visualPoint.y,
            // The canvas floor: the seat lands on the plan the admin clicked.
            floor
          });
          if (!created.ok) {
            setActionNotice(null);
            setActionError(created.message);
            return;
          }
          const createdSeat = created.seat;
          const afterSeats = replaceSeat(beforeSnapshot.seats, createdSeat);
          recordDraftHistory(addedSeatHistoryLabel(createdSeat.label), beforeSnapshot, afterSeats, beforeSnapshot.employees);
          setLocalSeats(afterSeats);
          setSelectedSeatId(createdSeat.id);
          setInspectorDirty(false);
          setAddSeatMode(false);
          setInspectorCollapsed(false);
          setActionNotice(`Added ${createdSeat.label} to ${createdSeat.zone ?? createdSeat.department ?? targetZone}.`);
        } catch (error) {
          setActionNotice(null);
          setActionError(clientActionErrorMessage(error, "Could not create seat."));
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
    if (mutationInFlight) return;
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

    // PR-5 (§8.1): the dialog holds open through the round-trip; success
    // closes it, failure keeps it open with the error rendered inline.
    setMutationInFlight(true);
    startTransition(async () => {
      try {
        setActionError(null);
        setActionNotice(null);
        const result = await deleteSeatAction(seatToDelete.id);
        if (!result.ok) {
          setActionNotice(null);
          setActionError(result.message);
          return;
        }
        const afterSeats = beforeSnapshot.seats.filter(seat => seat.id !== result.seatId);
        recordDraftHistory(`Delete ${deletedSeatLabel}`, beforeSnapshot, afterSeats, beforeSnapshot.employees);
        setDeleteSeatConfirm(null);
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
        setActionError(clientActionErrorMessage(error, "Could not delete custom seat."));
      } finally {
        setMutationInFlight(false);
      }
    });
  }

  const searchStatusTitle = searchActive ? `Searching “${searchQuery}”` : "Filtered results";
  const searchStatusSummary = `${matchingSeats.length} ${matchingSeats.length === 1 ? "match" : "matches"} · ${resultStatusBreakdown.assigned} assigned · ${resultStatusBreakdown.available} open`;
  // The band's Fit action pans THIS canvas: matches on the other floor are
  // reached through their result rows (which switch the floor), not by a fit
  // that would centre on nothing.
  const floorMatchingSeats = matchingSeats.filter(seat => floorOf(seat) === floor);
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
  // The mode card's copy (PHASE3DS §1.18): eyebrow · title · one sentence ·
  // the O4 note on the modes that target seats.
  const activeMode = addSeatMode
    ? {
      label: "Add seat",
      title: "Click the plan to place a seat",
      body: "New seats are custom draft seats, numbered automatically; they reach viewers at the next publish.",
      note: undefined,
      exitLabel: "Exit add seat",
      onExit: cancelAddSeatMode
    }
    : moveEmployeeSourceSeat
      ? {
        label: "Move employee",
        title: `Moving ${seatPersonLabel(moveEmployeeSourceSeat)} from ${moveEmployeeSourceSeat.label}`,
        body: "Select the destination seat — on this floor, or switch floors with the selector.",
        note: "Reserved and unavailable seats can't be destinations.",
        exitLabel: "Exit move employee",
        onExit: cancelMoveEmployeeMode
      }
      : swapSourceSeat
        ? {
          label: "Swap seats",
          title: `Swapping ${swapSourceSeat.label}`,
          body: "Select the seat to swap with; you review the swap before it applies.",
          note: "Reserved and unavailable seats can't be destinations.",
          exitLabel: "Exit swap seats",
          onExit: cancelSwapSeatMode
        }
        : null;
  // 3b OVERLAY + INV-6: floating panels ride over the full-bleed canvas at
  // lg — the canvas never reflows when one opens.
  const desktopMapGridClass = "lg:grid-cols-[minmax(0,1fr)]";
  // Panel slot (right): floating panels over a full-bleed map (owner preference — no
  // reserved gutter, no idle Map key rail; the legend lives in the bottom status bar).
  // One occupant expanded at a time: DETAIL (inspector) when a seat is selected and
  // expanded, RESULTS when search/filters are active while the inspector is closed or
  // auto-collapsed to its pill. Tiers: bottom sheet ≤899, floating panel ≥900.
  // 3b MODE CARD: while a mode runs without an expanded inspector, the mode
  // owns the panel slot (its microcopy lives in the occupant, INV-4).
  const modeCardOpen = canEdit && Boolean(activeMode) && (!selectedSeat || inspectorCollapsed);
  // The 400 right slot (C9, INV-4): a running mode owns it until it ends,
  // otherwise the inspector while a seat is selected and expanded. The canvas
  // column is PUSHED while it is open (D2); the band below never reflows.
  const slotOwner: RightSlotOwner = modeCardOpen ? "mode" : askPlannerOpen && canEdit ? "ask" : selectedSeat && !inspectorCollapsed ? "inspector" : null;
  const canvasColumnClassName = ["relative flex min-w-0 flex-col lg:min-h-0 lg:flex-1", slotOwner ? "lg:pr-[var(--sp-slot-w)]" : ""].filter(Boolean).join(" ");

  // The collapse rail is retired (v12 slice 4): `inspectorCollapsed` is now
  // purely the auto-yield flag. Whenever nothing owns the right region anymore
  // and a seat is still selected, the inspector returns on its own — there is
  // no rail left for the user to click.
  useEffect(() => {
    if (!inspectorCollapsed || !selectedSeatId) return;
    if (searchActive || modeCardOpen || askPlannerOpen || swapSourceSeatId || moveEmployeeSourceSeatId) return;
    setInspectorCollapsed(false);
  }, [inspectorCollapsed, selectedSeatId, searchActive, modeCardOpen, askPlannerOpen, swapSourceSeatId, moveEmployeeSourceSeatId]);
  // No mode/zoom change on select or deselect: in the fit view the reserved
  // column resizes the viewport and the overview ResizeObserver re-fits the
  // frame width automatically; a zoomed (detail) view keeps its zoom.

  const mobileMapInteractionSurfaceOpen = canEdit && (
    Boolean(selectedSeat && !inspectorCollapsed) ||
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
  // Band visibility (Option A): floor-gated like the legend it replaced, sm+
  // only. Phase 4 PR 3b: nothing owns the bottom any more — the inspector and
  // the mode card are the right slot over the canvas column (PHASE3DS §1.17),
  // so the band never yields to a sheet.
  const statusBandVisible = surface === "plan" && bandTier;
  const mapViewportClassName = [
    // v12 slice 3: the mounted-sheet treatment (hairline border + elevation +
    // matting padding) is gone. The plan is layer-00 now — it runs edge to
    // edge and the workspace band shows through around it, so there is no
    // card edge left to draw. Everything that reads over the map floats as a
    // layer-01 white card instead.
    // lg:h-auto, not the old lg:h-full: the stage is a flex column with the
    // in-flow status band below this viewport, so flex-1 does the height
    // subtraction — h-full would fight the band for its 40px.
    "relative mx-auto w-full max-w-full overscroll-contain bg-[var(--sp-map-mat)] lg:h-auto lg:min-h-0 lg:flex-1 lg:max-h-none",
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
      // shell chrome (--sp-shell-header-h ×2, see below) plus the 44px in-flow canvas search row
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
      // The band variant budgets 40px more below lg (84 = 44px search row +
      // 40px band) so the viewport + band still sum to the screen and the
      // viewport stays the one vertical scroll owner (#197).
      // The chrome above this surface is the shell header plus the control
      // row (PR 3a; the PR 2 tenant row is gone). Both are token heights; the
      // row wraps below ~800px (globals.css O6 rule) and the page then scrolls
      // by the extra line — accepted below the laptop widths.
      ? [
        statusBandVisible
          ? "min-h-[300px] h-[calc(100svh-var(--sp-shell-header-h)-var(--sp-control-row-h)-40px)]"
          : "min-h-[300px] h-[calc(100svh-var(--sp-shell-header-h)-var(--sp-control-row-h))]",
        "overflow-auto sm:flex sm:items-center sm:justify-center sm:overflow-hidden"
      ].join(" ")
      // The sm cap budgets the stacked chrome above the map: the shell header
      // plus the control row (token-derived so a chrome resize can't strand a
      // hardcoded sum again; the 36→40px bump caught exactly that). The row once read as ~52 (an estimate), which
      // left an 8px sliver of page below the map — the small version of the
      // band the overview branch above exists to close. Below lg the pan
      // viewport is the one vertical scroll owner (#197), so the page itself
      // doesn't grow a second scrollbar next to it. On short windows the
      // min-h floor wins and the page scrolls a little; that beats a stub of
      // a map.
      : [
        "min-h-[360px] max-h-[82svh] overflow-auto sm:min-h-[420px]",
        statusBandVisible
          ? "sm:max-h-[calc(100svh-var(--sp-shell-header-h)-var(--sp-control-row-h)-40px)]"
          : "sm:max-h-[calc(100svh-var(--sp-shell-header-h)-var(--sp-control-row-h))]",
        "lg:min-h-0 lg:max-h-none lg:[-ms-overflow-style:none] lg:[scrollbar-width:none] lg:[&::-webkit-scrollbar]:hidden"
      ].join(" "),
    mapViewMode === "detail" && surface === "plan" && !addSeatMode ? (panning ? "cursor-grabbing" : "cursor-grab") : "",
    canEdit ? "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--sp-background)]" : ""
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
  // Flex COLUMN at every width now: the viewport and the in-flow status band
  // stack vertically, and at lg flex-1 + min-h-0 keep the pair filling the
  // screen column exactly as the lone viewport used to (same move as the
  // viewer's Option A restructure).
  const mapStageClassName = "relative flex min-w-0 flex-col lg:min-h-0 lg:flex-1";
  // No crumb at all (owner call 2026-08-14, round 2): the floor selector IS
  // the document identity — layer state was tried as "Draft map · N seats",
  // then "Draft", then removed; the legend carries the count and the publish
  // cluster carries the pending-changes signal.
  const mapMarkerLayerClassName = [
    "absolute inset-0",
    mobileMapControlsHidden ? "hidden sm:block" : ""
  ].filter(Boolean).join(" ");
  const resultActionButtonClassName = "relative inline-flex min-h-8 items-center justify-center rounded-lg border border-[var(--sp-border-strong)] bg-[var(--sp-layer-01)] px-3 py-1.5 text-xs font-semibold text-[var(--sp-text-secondary)] transition after:absolute after:-inset-y-1.5 after:inset-x-0 hover:border-[var(--sp-border-interactive)] hover:bg-[var(--sp-layer-hover)] hover:text-[var(--sp-link-hover)] active:scale-[0.97] active:duration-75 active:shadow-inner focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus)] disabled:cursor-not-allowed disabled:opacity-50";
  const resultClearButtonClassName = "relative inline-flex min-h-8 items-center justify-center rounded-lg border border-[var(--sp-border-interactive)] bg-[var(--sp-layer-hover)] px-3 py-1.5 text-xs font-semibold text-[var(--sp-link-hover)] transition after:absolute after:-inset-y-1.5 after:inset-x-0 hover:border-[var(--sp-interactive)] hover:bg-[rgba(242,110,34,0.16)] active:scale-[0.97] active:duration-75 active:shadow-inner focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus)]";
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
  // Phase 4 PR 3b: ONE pill layer (PHASE3DS §1.16). The text tier and the
  // pitch-gated 44px hit floor retired with the code pills — every marker is
  // a 28px fit-width pill or footprint carrying the asset's touch target, and
  // the collision graph models each pill at its own estimated width.
  const seatDensityClearance = useMemo(
    () => clearanceFromScale(
      mapPixelsPerNormalizedUnit,
      mapPixelsPerNormalizedUnit * (MAP_IMAGE_HEIGHT / MAP_IMAGE_WIDTH),
      PILL_CLEARANCE_PX
    ),
    [mapPixelsPerNormalizedUnit]
  );
  // Shared with the marker render loop below (dimmed={dimmedSeatIdSet.has(...)}).
  const dimmedSeatIdSet = new Set(floorSeats.filter(isSeatDimmed).map(seat => seat.id));
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
  // Fit-width pills: the scorer sees each pill at its own estimated width
  // (an empty seat is the 28px footprint) at the live x scale.
  const nameLabelNudges = useMemo(
    () => computeNameLabelNudges(visualLocalSeats, namedSeatIdSet, seatDensityClearance, {
      widthPx: seat => seat.employee ? estimatePillWidthPx(seatPillLabel(seat)) : PILL_HEIGHT_PX,
      pixelsPerXUnit: mapPixelsPerNormalizedUnit
    }),
    [mapPixelsPerNormalizedUnit, namedSeatIdSet, seatDensityClearance, visualLocalSeats]
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

  // --- Control row (PHASE2UX §1M.3, D2-b; PR 3a) ---------------------------
  // The row replaces the PR 2 tenant-row portals (undo/redo/kebab · floor ·
  // Ask Planner + publish) and the canvas's floating search card. Publish is
  // the row's ONE primary — present and disabled at zero with its reason
  // beside it; ⋯ holds Discard only; Names moved up from the band.
  const departments = uniqueOptionNames([
    ...localDepartmentOptions.filter(option => option.active).map(option => option.name),
    ...localEmployees.filter(employee => employee.active).map(employee => employee.department)
  ]);
  const positions = buildPositionOptions(localEmployees);
  // The four filter groups register with the shell's left panel (C5): the
  // hamburger appears on /admin too now (D0-h), counting the draft layer.
  const filterGroups = useMemo(
    () =>
      buildViewerFilterGroups({
        surface,
        floorSeats,
        floorPeople: rosterPeople,
        departments,
        positions,
        zones,
        seatZone: getSeatZone,
        seatDepartment: seat => seat.employee?.department ?? seat.department ?? "",
        selected: { department, position, zone, status }
      }),
    // departments / positions are derived arrays rebuilt per render; their
    // contents follow localEmployees and the option list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [department, floorSeats, localDepartmentOptions, localEmployees, position, rosterPeople, status, surface, zone, zones]
  );
  const shellFilterSpec = useMemo<ShellFilterSpec>(() => {
    const setters: Record<string, (value: string) => void> = { department: setDepartment, position: setPosition, zone: setZone, status: setStatus };
    const values: Record<string, string> = { department, position, zone, status };
    return {
      groups: filterGroups,
      appliedCount: structuredFilterCount,
      note: surface === "roster" ? `Zone and status are seat facts — ${floorMeta.tag} has no seats yet.` : undefined,
      onToggle: (groupId, itemId) => setters[groupId]?.(values[groupId] === itemId ? "all" : itemId),
      onClearGroup: groupId => setters[groupId]?.("all"),
      onClearAll: clearStructuredFilters
    };
  }, [clearStructuredFilters, department, filterGroups, floorMeta.tag, position, setDepartment, setPosition, setStatus, setZone, status, structuredFilterCount, surface, zone]);
  useAppShellFilters(shellFilterSpec);

  // Search results + browse feed for the palette, from the DRAFT working set
  // this editor holds (never the published snapshot).
  const searchResults = useMemo(
    () => buildViewerSeatSearch({ query: search, seats: localSeats, employees: localEmployees, departmentOptions: localDepartmentOptions, zoneOptions: localZoneOptions }),
    [localDepartmentOptions, localEmployees, localSeats, localZoneOptions, search]
  );
  const paletteBrowse = useMemo(
    () => buildViewerPaletteBrowse({ seats: localSeats, employees: localEmployees, zoneOptions: localZoneOptions }),
    [localEmployees, localSeats, localZoneOptions]
  );
  const scopedResults = useMemo(() => scopeResults(searchResults.results, floor, searchScope), [floor, searchResults.results, searchScope]);
  const resultCountLabel = searchResults.results.length === 1 ? "1 result" : `${searchResults.results.length} results`;
  function openResult(result: ViewerSearchResult) {
    setPaletteOpen(false);
    if (result.seatId) {
      selectSeatResult(result.seatId);
      return;
    }
    if (result.kind === "person" && result.employeeId) {
      openPersonFromResults(result.employeeId);
      return;
    }
    const targets = result.seatIds
      .map(seatId => localSeats.find(seat => seat.id === seatId))
      .filter((seat): seat is SeatWithEmployee => Boolean(seat) && floorOf(seat as SeatWithEmployee) === floor);
    if (targets.length > 0) fitSeatsInMap(targets);
    suppressPaletteReopenRef.current = true;
    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      suppressPaletteReopenRef.current = false;
    });
  }
  function updateSearch(value: string) {
    handleSearchInputChange(value);
    setPaletteOpen(true);
  }
  // ?q= landing, second half: a unique match opens itself once the results exist.
  useEffect(() => {
    const query = landingQueryRef.current;
    if (!query || search !== query) return;
    landingQueryRef.current = null;
    if (searchResults.results.length === 1) openResult(searchResults.results[0]);
    // openResult is a render-scope function; the landing runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, searchResults.results]);
  // Find me (D1-f): the shell's PUBLISHED seat (labels are stable across the
  // layers, so the draft seat with that label is the one to open); unseated →
  // the roster row; not in the directory → an inline notice.
  function findMe() {
    const email = shellState?.email ?? null;
    const me = email ? findEmployeeByEmail(localEmployees, email) : null;
    const publishedLabel = shellState?.mySeat?.label ?? null;
    const draftSeat = publishedLabel ? localSeats.find(seat => seat.label.toLowerCase() === publishedLabel.toLowerCase()) ?? null : null;
    if (draftSeat) {
      selectSeatResult(draftSeat.id);
      return;
    }
    if (me && rosterFloorForUnseated(localSeats)) {
      openPersonFromResults(me.id);
      return;
    }
    setActionNotice("Your account isn't in the published directory. Ask an admin.", "neutral");
  }
  const controlCountText = surface === "roster"
    ? `${rosterPeople.length} ${rosterPeople.length === 1 ? "person" : "people"}`
    : filtersActive
      ? `${floorMatchingSeats.length} of ${floorSeats.length} seats match`
      : `${floorSeats.length} ${floorSeats.length === 1 ? "seat" : "seats"}`;
  const canvasNotices: CanvasNotice[] = [];
  if (staleDraftNotice) canvasNotices.push({ id: "stale-draft", kind: "info", text: staleDraftNotice });
  if (sessionExpired && actionError) {
    canvasNotices.push({
      id: "session-expired",
      kind: "error",
      alert: true,
      text: "Your session expired — sign in again to keep editing. Unsaved changes stay in this tab until you leave.",
      action: { label: "Sign in", href: "/login?next=/admin" }
    });
  }
  if (actionError && !sessionExpired && !swapConfirm && !vacateConfirm && !deleteSeatConfirm && !moveEmployeeConfirm) {
    canvasNotices.push({ id: "action-error", kind: "error", alert: true, text: actionError });
  }
  if (invalidTargetNotice && targetMode) {
    canvasNotices.push({ id: "invalid-target", kind: "info", text: invalidTargetNotice, onDismiss: () => setInvalidTargetNotice(null) });
  }
  if (actionNotice && !swapSourceSeatId && !moveEmployeeSourceSeatId) {
    canvasNotices.push({
      id: "action-notice",
      kind: actionNoticeTone === "neutral" ? "info" : "success",
      text: actionNotice,
      action: canEdit && undoAvailable && lastUndoLabel && !mutationInFlight && !inspectorDirty ? { label: `Undo ${lastUndoLabel}`, onClick: undoDraftEdit } : undefined
    });
  }
  const draftControls = canEdit && editTier
    ? {
        undo: { label: undoAvailable ? `${lastUndoLabel ? `Undo ${lastUndoLabel}` : "Undo last map change"} · ${undoShortcutHint(platform)}` : "No map changes to undo", disabled: !undoAvailable || mutationInFlight || inspectorDirty || Boolean(historyOpInFlight), busy: historyOpInFlight === "Undo", onClick: undoDraftEdit },
        redo: { label: redoAvailable ? `Redo · ${redoShortcutHint(platform)}` : "No undone map changes to redo", disabled: !redoAvailable || mutationInFlight || inspectorDirty || Boolean(historyOpInFlight), busy: historyOpInFlight === "Redo", onClick: redoDraftEdit },
        addSeat: { active: addSeatMode, hidden: surface !== "plan", onToggle: addSeatMode ? cancelAddSeatMode : startAddSeatMode },
        askPlanner: { count: plannerHighlightedSeatIds.length, open: askPlannerOpen, onOpen: openAskPlannerDrawer, controlsId: "ask-planner-drawer" },
        publish: { count: publishSummary.totalChangeCount, onOpen: openPublishReview },
        discard: { disabled: !publishSummary.hasChanges || pending, onOpen: () => setDiscardDraftConfirmOpen(true) }
      }
    : undefined;

  return (
    /* overflow-x-CLIP, not -hidden: hidden makes this div a scroll container,
       which would capture any sticky descendant so it never pins.
       The persistent shell sizes its content pane as a flex column
       (viewport-height at lg), so this root fills it with flex-1 and never
       subtracts chrome itself (redesign-v2 PR 2). */
    <div className="flex min-h-0 flex-1 flex-col overflow-x-clip bg-[var(--sp-background)] text-[var(--sp-text-primary)] lg:overflow-hidden">
      {/* The chrome is the (shell) layout's persistent AppShell — this
          surface plugs its unsaved-edits veto and Ask Planner opener into it
          via useAppShellNavigation (see the registration near the drawer
          logic above); the veto contract is unchanged. Its own controls are
          the row below (PR 3a), in the page, 48px under the header. */}
      <h1 className="sr-only">Seat Planner — admin map</h1>
      <MapControlRow
        floor={floor}
        onFloorChange={switchFloor}
        search={{
          value: search,
          onChange: updateSearch,
          onClear: clearSearch,
          scope: searchScope,
          onScopeChange: setSearchScope,
          hint: searchShortcutHint,
          placeholder: SEAT_SEARCH_PLACEHOLDER,
          inputId: "admin-seat-search",
          inputRef: searchInputRef,
          rootRef: searchFieldRef,
          paletteOpen,
          paletteId: paletteOpen ? "viewer-find-palette" : undefined,
          onOpenPalette: () => {
            if (suppressPaletteReopenRef.current) return;
            setPaletteOpen(true);
          },
          onClosePalette: () => setPaletteOpen(false),
          onArrowDown: () => {
            window.requestAnimationFrame(() => {
              document.querySelector<HTMLButtonElement>('[aria-label="Viewer search results"] button:not([disabled]), [aria-label="People directory"] button:not([disabled])')?.focus();
            });
          },
          onEnter: () => {
            if (scopedResults.shown.length > 0) openResult(scopedResults.shown[0]);
          },
          ariaLabel: "Admin search"
        }}
        filters={{ appliedCount: structuredFilterCount, onOpen: () => shellLeftPanel?.open(), onClear: clearStructuredFilters, panelOpen: shellLeftPanel?.isOpen ?? false }}
        count={{ text: controlCountText, live: true }}
        onFindMe={findMe}
        draft={draftControls}
        askPlannerAnchor={askPlannerButtonRef}
        names={canEdit ? { pressed: showNames, hidden: surface !== "plan", onToggle: () => setShowNames(current => !current) } : null}
      />

      {/* v12 slice 3: no width cap and no padding — the floor plan is layer-00
          and runs edge to edge below the bar. */}
      <div className="flex w-full flex-1 flex-col lg:min-h-0 lg:overflow-hidden">
        

        {/* lg:flex-1 keeps the height chain rigid: without it the fit-view
            width/height calculation feeds back on itself after the reserved
            inspector column opens and closes, sticking the map small. Now that
            the stage is lg:flex-1 in overview too (the 1911/867 aspect pin is
            gone), this unbroken lg:flex-1 / lg:min-h-0 chain from the root's
            lg viewport-calc height is the only thing keeping the stage height
            SCREEN-derived rather than content-derived — break a link and the
            feedback loop the aspect pin used to fence off comes back. */}
        <div className="flex min-w-0 flex-col overflow-hidden lg:min-h-0 lg:flex-1">
      <main className={["grid grid-cols-1 lg:min-h-0 lg:flex-1 lg:items-stretch lg:overflow-hidden", desktopMapGridClass].join(" ")}>
        <section id="planning-canvas" tabIndex={-1} aria-labelledby="admin-planning-canvas-title" className="order-1 min-w-0 overflow-hidden relative lg:order-2 lg:flex lg:min-h-0 lg:flex-col lg:gap-2">
          {/* The status strip that used to carry this heading is gone (v12
              slice 3). The heading stays as the canvas section's accessible
              name — aria-labelledby above points at this id — and is now
              ungated, so the read-only admin view keeps a named region too. */}
          <h2 id="admin-planning-canvas-title" className="sr-only">
            {filtersActive ? searchStatusTitle : "Planning canvas"}
          </h2>

          <div className={mapStageClassName}>
          <div className={canvasColumnClassName}>
            {/* Top-left cluster (v12 slice 3): floor pill and the AI
                highlight chip float over the full-bleed plan as layer-01
                white cards. Nothing above the map is in flow, so a chip
                arriving mid-session can no longer resize the map column and
                re-run the overview fit. pointer-events-none on the rail with
                each card opting itself back in keeps the gaps between cards
                draggable map. Ungated by floor on purpose — the floor pill IS
                how you leave an unmapped floor's roster. */}
            {/* One row, two halves: the left half wraps, the right half is
                shrink-0 — when a docking panel narrows the stage the chips
                wrap under the floor pill instead of sliding beneath the
                absolutely-positioned search card (measured overlap,
                2026-08-13 QA). */}
            <div className="pointer-events-none absolute inset-x-3 top-3 z-40 flex flex-col gap-2">
              {/* PR-5 (§8.1): the surface's shared in-flight region — an
                  always-mounted sr-only sibling of the visible outcome toast
                  below (a region that mounts WITH its content is not reliably
                  announced). "Working…" while any draft mutation round-trips;
                  outcomes stay with the visible toast/error banners. */}
              <div role="status" aria-live="polite" className="sr-only">
                {/* publishReviewOpen excluded: the publish dialog keeps its own
                    in-flight region (row 1) — one announcement, not two. */}
                {(mutationInFlight || barSeatActions.pending || pending) && !publishReviewOpen ? "Working…" : ""}
              </div>
              {/* Multi-floor PR-3: the canvas switches floors with an
                  announcement, never silently — a find can resolve on the
                  other floor and change the plan under the admin. Priority:
                  the roster row a find landed on → the floor just shown. */}
              <div role="status" aria-live="polite" className="sr-only">
                {rosterHighlightedPerson
                  ? `${formatDisplayName(rosterHighlightedPerson.full_name)} highlighted on the ${floorMeta.label} roster.`
                  : announcedFloor
                    ? `Showing ${FLOORS[announcedFloor].label}.`
                    : ""}
              </div>
              {/* Inline notices in the region being worked in (PHASE3DS §1.21
                  .sp-canvas-status; SKILL: inline is the default, never a
                  toast): the MLS02 stale-draft refresh (self-clearing), the
                  expired session, action errors — one channel: while a dialog
                  that renders actionError inline is open, the canvas stands
                  down — and the outcome notice with its inline Undo. */}
              <CanvasStatus notices={canvasNotices} />
            </div>
            <div
              ref={mapViewportRef}
              className={mapViewportClassName}
              // The roster floor has no map to pan: the roster region inside
              // is the tab stop instead (Hidden, not disabled).
              tabIndex={canEdit && surface === "plan" ? 0 : undefined}
              aria-label={canEdit && surface === "plan" ? "Admin seat map viewport. Drag to pan; use wheel, trackpad, touch, or arrow keys to pan the map." : undefined}
              onPointerDown={handleViewportPointerDown}
              onPointerMove={handleViewportPointerMove}
              onPointerUp={handleViewportPointerEnd}
              onPointerCancel={handleViewportPointerEnd}
            >
              {/* Multi-floor PR-3: an unmapped floor renders the same roster
                  the viewer shows, fed from the LIVE working set — who works
                  there, grouped by department — with the search query
                  filtering rows in place. Rows are static (deviation 9);
                  nothing here edits, and Add seat is absent above. */}
              {surface === "roster" && (
                <FloorRoster
                  floor={floor}
                  people={rosterPeople}
                  query={search}
                  highlightedPersonId={rosterHighlightedPersonId}
                  helper={`The ${floorOrdinal(floor)}-floor plan is not mapped yet. Until a draft seat exists there, everyone without a draft seat is listed here.`}
                  regionId={ADMIN_ROSTER_REGION_ID}
                  onClearSearch={clearSearch}
                  headerInsetPx={ADMIN_ROSTER_HEADER_INSET_PX}
                />
              )}
              {surface === "plan" && plan && (
              <div
                ref={mapRef}
                className={mapFrameClassName}
                style={mapFrameStyle}
                onPointerDown={handleMapPointerDown}
              >
                {/* While Ask Planner has seats highlighted the plan itself
                    steps back a little, so the aura'd seats carry the eye.
                    Slight and reversible — it rides the same live highlight
                    set as the dimming, so nothing can latch it on. The raster
                    comes from the floor registry (lib/floors) — every plan is
                    built to the same 1911×867 framing, so the tier constants
                    below stay shared. */}
                <Image
                  src={plan.src}
                  alt="Office floor plan"
                  width={plan.width}
                  height={plan.height}
                  priority
                  fetchPriority="high"
                  unoptimized
                  placeholder="blur"
                  blurDataURL={plan.blurDataUrl}
                  className={[
                    "map-raster block h-auto w-full select-none transition-[filter] duration-200",
                    plannerHighlightedSeatIds.length > 0 ? "map-raster-dim" : ""
                  ].join(" ")}
                  draggable={false}
                />


                {/* AUDIT-2 §8.2 first-run: a zero-seat draft is a bare floor
                    plan — name the state and point at the affordance that
                    fills it. Admins see the add path; a read-only session
                    can only wait for one who has it. */}
                {visualLocalSeats.length === 0 && (
                  <div role="status" className="sp-canvas-empty z-[6]">
                    <div className="cds-empty">
                      <h3>No seats in the draft yet</h3>
                      <p>
                        {canEdit
                          ? "Use Add seat, or import assignments from Settings."
                          : "Seats appear once an admin adds them to the draft."}
                      </p>
                    </div>
                  </div>
                )}

                {/* Animated draft trail between a pending swap/move pair
                    (design_handoff_swap_trail). Above the washes, below the
                    markers — washes are z-[5], markers z-10, the overlay
                    takes z-[6] — and it shares this frame's box, so zoom and
                    resize tracking is the same width transform the markers
                    ride. Decorative and pointer-inert, same contract as the
                    washes above. The wrapper reuses mapMarkerLayerClassName
                    for its mobile gate on purpose: the trail's lifetime (a
                    swap/move confirm open) is one of the very conditions that
                    hides the markers below sm, so an ungated trail would
                    paint arrows between seats that aren't rendered. One
                    shared class keeps the two layers' visibility in
                    lockstep. */}
                {draftTrail && (
                  <div className={mapMarkerLayerClassName}>
                    <DraftTrailOverlay kind={draftTrail.kind} sourceSeat={draftTrail.sourceSeat} targetSeat={draftTrail.targetSeat} />
                  </div>
                )}

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
                  {floorSeats.map(seat => {
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
                        nameNudge={nameLabelNudges.get(seat.id) ?? 0}
                        swapMode={Boolean(swapSourceSeatId)}
                        moveEmployeeMode={Boolean(moveEmployeeSourceSeatId)}
                        swapSource={seat.id === swapSourceSeatId}
                        swapTarget={seat.id === swapConfirm?.targetSeatId}
                        moveEmployeeSource={seat.id === moveEmployeeSourceSeatId}
                        invalidTarget={isInvalidTarget(seat)}
                        highlighted={plannerHighlightedSeatIdSet.has(seat.id)}
                        addSeatMode={addSeatMode}
                        viewportEdge={viewportPlacement.edge}
                        viewportEdgeOffsetPx={viewportPlacement.offsetPx}
                        tabIndex={seat.id === mapRovingSeatId ? 0 : -1}
                        onSelect={stableSelectSeat}
                      />
                    );
                  })}
                </div>
              </div>
              )}
            </div>
            {/* Phones only (the band >=640 owns zoom there — owner call
                2026-08-17): the shipped floating stack, still hidden while a
                mobile edit surface owns the screen. */}
            {surface === "plan" && !bandTier && (
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
            {/* The right slot (PHASE3DS §1.17, D2-a): one owner at a time —
                mode card · Ask Planner · inspector (INV-4). It
                sits over the canvas column only, so the band below stays
                uncovered; the column's padding is what pushes the plan. */}
            <RightSlot open={slotOwner !== null}>
              {slotOwner === "mode" && activeMode && (
                <ModeCard
                  label={activeMode.label}
                  title={activeMode.title}
                  body={activeMode.body}
                  note={activeMode.note}
                  exitLabel={activeMode.exitLabel}
                  onExit={activeMode.onExit}
                  // Create-seat has no confirm button to relabel — the card
                  // carries the visible busy line while the create round-trips.
                  busyLabel={addSeatMode && mutationInFlight ? "Adding seat…" : null}
                />
              )}
              {/* Ask Planner in the slot (P2-9 408 → 400): a side panel, not a
                  modal — the map stays usable beside it. */}
              {canEdit && (
                <AskPlannerDrawer
                  open={slotOwner === "ask"}
                  draftDirty={inspectorDirty}
                  zones={zones}
                  queuedRequest={askPlannerQueuedRequest}
                  highlightedSeatIds={plannerHighlightedSeatIds}
                  floorTagForSeat={plannerFloorTagForSeat}
                  onClose={closeAskPlannerDrawer}
                  onHighlightSeats={setPlannerHighlightedSeatIds}
                  onClearHighlights={() => setPlannerHighlightedSeatIds([])}
                  onSelectSeat={selectPlannerHighlightedSeat}
                />
              )}
              {slotOwner === "inspector" && (
              <SeatInspector
                seat={selectedSeat}
                seats={localSeats}
                employees={localEmployees}
                departmentOptions={localDepartmentOptions}
                canEdit={canEdit}
                draftChanged={selectedSeat ? draftChangedSeatLabelSet.has(selectedSeat.label) : false}
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
              )}
            </RightSlot>
            {/* The status band (Option A parity with the viewer, owner call
                2026-08-17): the in-flow bottom row that replaced the floating
                legend card + zoom stack from sm up. It narrows with the stage
                when a docking panel reserves its column (the canvas column padding
                wraps this whole column), so the dock never overlaps it. Counts
                come from legendCounts, which follows the active filters — the
                number row must never contradict a filtered map. Gated to
                the plan surface (an unmapped floor renders the roster, where
                seat counts would read as a bug — Hidden tier, no band) and
                to statusBandVisible (band tier + sheet yield above). */}
            {statusBandVisible && (
              <MapStatusBand
                ariaLabel="Seat status legend"
                totalLabel={`${floorMeta.tag} · ${stats.total} ${stats.total === 1 ? "seat" : "seats"}`}
                entries={SEAT_STATUS_LEGEND
                  .filter(item => !item.draftOnly || legendCounts[item.key] > 0)
                  .map(item => ({ key: item.key, label: item.label, mark: item.mark, count: legendCounts[item.key] }))}
                namesVisible={showNames}
                // Below lg the band also carries the read-only note (D2) and the
                // plain total already reads in the title, so that count yields its
                // width; the filtered "N of M match" count is never dropped.
                count={filtersActive ? `${floorMatchingSeats.length} of ${floorSeats.length} seats match` : editTier ? `${stats.total} ${stats.total === 1 ? "seat" : "seats"}` : undefined}
                actions={filtersActive ? (
                  <>
                    <button
                      type="button"
                      className="cds-btn cds-btn--ghost cds-btn--sm"
                      onClick={() => fitSeatsInMap(floorMatchingSeats)}
                      disabled={!floorMatchingSeats.length}
                      aria-label={floorMatchingSeats.length === 0 ? `Fit matches unavailable because there are no matching seats on ${floorMeta.tag}` : `Fit ${floorMatchingSeats.length} matches on the map`}
                    >
                      Fit matches
                    </button>
                    <button
                      type="button"
                      className="cds-btn cds-btn--ghost cds-btn--sm"
                      onClick={searchActive && structuredFiltersActive ? clearAllConstraints : searchActive ? clearSearch : clearStructuredFilters}
                      aria-label={searchActive && structuredFiltersActive ? "Clear all active search and filters" : searchActive ? "Clear search results" : "Clear filters"}
                    >
                      {searchActive && structuredFiltersActive ? "Clear all" : searchActive ? "Clear search" : "Clear filters"}
                    </button>
                  </>
                ) : null}
                note={canEdit && !editTier ? "Editing needs a wider window." : undefined}
                controls={
                  <MapZoomControl
                    orientation="horizontal"
                    label={mapZoomLabel}
                    onZoomIn={() => applyMapZoom(mapViewMode === "detail" ? zoomFactor + MAP_ZOOM_STEP : 1)}
                    onZoomOut={() => applyMapZoom(mapViewMode === "detail" ? zoomFactor - MAP_ZOOM_STEP : 1 - MAP_ZOOM_STEP)}
                    onFit={fitMapToView}
                    zoomInDisabled={mapViewMode === "detail" && zoomFactor >= MAP_ZOOM_MAX}
                    zoomOutDisabled={mapViewMode === "detail" && zoomFactor <= MAP_ZOOM_MIN}
                  />
                }
              />
            )}
          </div>
        </section>
      </main>
      </div>
      </div>


      {vacateConfirm && (
        <VacateConfirmDialog
          label={vacateConfirm.label}
          occupantName={vacateConfirm.occupantName}
          actionError={actionError}
          // barSeatActions owns the vacate transition, so SeatMap's own
          // `pending` never covers this flight — mutationInFlight does.
          pending={pending || mutationInFlight}
          onCancel={() => {
            setActionError(null);
            setVacateConfirm(null);
          }}
          onConfirm={confirmVacateFromBar}
        />
      )}

      {deleteSeatConfirm && (
        <DeleteSeatConfirmDialog
          label={deleteSeatConfirm.label}
          actionError={actionError}
          pending={pending || mutationInFlight}
          onCancel={() => {
            setActionError(null);
            setDeleteSeatConfirm(null);
          }}
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


      {/* The ONE Find surface (D1-d): the same palette as the viewer, over
          the DRAFT working set, floating from the row's field. */}
      {paletteOpen && (
        <ViewerFindPalette
          anchorRef={searchFieldRef}
          containerRef={paletteRef}
          searchInputRef={searchInputRef}
          query={search.trim()}
          browse={paletteBrowse}
          results={scopedResults.shown}
          resultCountLabel={resultCountLabel}
          mappedSeatCount={searchResults.resultSeatIds.length}
          activeResultId={null}
          selectedSeatId={selectedSeatId}
          pinnedZone={zone}
          onZonePin={nextZone => {
            setZone(nextZone);
            setPaletteOpen(false);
          }}
          onRowHoverChange={() => {}}
          onOpenRow={openResult}
          onClearSearch={clearSearch}
          currentFloor={floor}
          scope={searchScope}
          scopeCounts={{ onFloor: scopedResults.onFloor, inBuilding: scopedResults.inBuilding }}
          onWiden={() => setSearchScope("building")}
        />
      )}


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
          actionError={actionError}
          pending={pending || mutationInFlight}
          onCancel={() => {
            setActionError(null);
            setSwapConfirm(null);
          }}
          onConfirm={confirmSwapSeats}
        />
      )}

      {moveEmployeeConfirm && moveEmployeeSourceSeat?.employee && moveEmployeeTargetSeat && (
        <MoveEmployeeConfirmDialog
          offerSwap={moveEmployeeConfirm.offerSwap}
          moveEmployeeSourceSeat={moveEmployeeSourceSeat}
          moveEmployeeTargetSeat={moveEmployeeTargetSeat}
          sourceEmployeeName={moveEmployeeSourceSeat.employee.full_name}
          actionError={actionError}
          pending={pending || mutationInFlight}
          onCancel={() => {
            setActionError(null);
            setMoveEmployeeConfirm(null);
          }}
          onConfirmSwap={confirmMoveEmployeeAsSwap}
          onConfirmMove={confirmMoveEmployeeToOpenSeat}
        />
      )}
    </div>
  );
}
