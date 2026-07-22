"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { SEAT_SEARCH_PLACEHOLDER } from "@/lib/viewerSeatSearch";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import type { DepartmentOption, Employee, SeatStatus, SeatWithEmployee, ZoneOption } from "@/lib/types";
import { STATUS_LABELS } from "@/lib/types";
import { normalizeSeat } from "@/lib/seatNormalize";
import { cx } from "@/components/ui/design-system";
import {
  MAP_IMAGE_BLUR_DATA_URL,
  MAP_IMAGE_HEIGHT,
  MAP_IMAGE_SRC,
  MAP_IMAGE_WIDTH,
  seatsToVisualSeats
} from "@/lib/mapLayoutTransform";
import { arrowKeyToDirection, findNearestSeatInDirection, resolveRovingSeatId } from "@/lib/seatKeyboardNav";
import { buildViewerDirectory, buildViewerSeatSearch, searchHandsPanelToResults, type ViewerSearchResult } from "@/lib/viewerSeatSearch";
import { buildInitials } from "@/lib/validators";
import { buildPositionOptions, seatMatchesPosition } from "@/lib/positions";
import { AccountMenu } from "@/components/ui/AccountMenu";
import { ActiveFilterChips, FilterPanel, type ActiveFilterChip } from "@/components/seat-map/FilterPanel";
import { FloorPlaceholder, FloorSelector, type FloorId } from "@/components/seat-map/FloorSelector";
import { MapZoomControl } from "@/components/seat-map/MapZoomControl";
import { SeatInspector } from "@/components/seat-map/SeatInspector";
import { SeatMarker } from "@/components/seat-map/SeatMarker";
import { clearanceFromScale, computeCodePillNudges, computeNameLabelNudges } from "@/lib/seatCrowding";

type ViewerSeatFinderProps = {
  seats: SeatWithEmployee[];
  employees: Employee[];
  departmentOptions?: DepartmentOption[];
  zoneOptions?: ZoneOption[];
  // Only admins get the Admin chrome shortcut; for viewers it is a guaranteed
  // dead end, so the server page passes their role down as a render gate.
  showAdminShortcut?: boolean;
  // Pre-formatted "last publish" date from the server page (viewer-safe copy
  // for the old PUBLISHED/READ-ONLY badge pair).
  lastPublishedLabel?: string | null;
  // Signed-in identity for the account menu (email + role + sign out).
  accountEmail?: string | null;
  accountRoleLabel?: string;
};

type ViewerPanState = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startScrollLeft: number;
  startScrollTop: number;
  moved: boolean;
} | null;

const KIND_LABELS: Record<ViewerSearchResult["kind"], string> = {
  person: "Person",
  seat: "Seat",
  department: "Department",
  zone: "Zone"
};

// Result title/subtitle identity segments (person names, seat codes) are
// already formatted for display by lib/viewerSeatSearch.ts at composition
// time — that is the single formatting point; do not re-format here (both
// formatters are idempotent, but one documented formatting point avoids
// double-formatting drift). Search matching there still operates on raw
// stored values, so this is display-only.

// View-transform zoom (same rule as the admin map): scales the rendered frame
// width only — never the stored coordinates or the calibration transform.
const MAP_ZOOM_MIN = 0.6;
const MAP_ZOOM_MAX = 2;
const MAP_ZOOM_STEP = 0.2;

function getSeatZone(seat: SeatWithEmployee) {
  return seat.zone ?? seat.department ?? "No zone";
}

function getSeatDepartment(seat: SeatWithEmployee) {
  return seat.employee?.department ?? seat.department ?? "No department";
}

function resultKindClass(kind: ViewerSearchResult["kind"]) {
  if (kind === "person") return "bg-[var(--admin-info-soft)] text-[var(--admin-info)] ring-[var(--admin-info)]/30";
  if (kind === "seat") return "bg-[var(--admin-chrome-bg)] text-white ring-[var(--admin-chrome-bg)]";
  if (kind === "department") return "bg-[var(--admin-success-soft)] text-[var(--admin-success)] ring-[var(--admin-success)]/30";
  return "bg-[var(--admin-warning-soft)] text-[var(--admin-warning-text)] ring-[var(--admin-warning-text)]/30";
}

function uniqueVisibleOptions(values: Array<string | null | undefined>) {
  const seen = new Map<string, string>();
  values.forEach(value => {
    const trimmed = value?.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) seen.set(key, trimmed);
  });
  return Array.from(seen.values()).sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

// The People directory's collapse preference persists per browser, like the
// admin names toggle.
const VIEWER_DIRECTORY_COLLAPSED_STORAGE_KEY = "seat-planner:viewer-directory-collapsed";
const VIEWER_DIRECTORY_PREF_EVENT = "seat-planner:viewer-directory-pref";

// The collapse preference is read through useSyncExternalStore: the server
// snapshot is the expanded default (so SSR markup reserves the directory
// slot — see directoryOpen), and React swaps in the client snapshot
// synchronously at hydration, BEFORE paint. A collapsed user therefore never
// sees the populated panel flash open; an effect-based localStorage read
// paints the default first and then snaps the canvas.
function readDirectoryCollapsedPref(): boolean {
  try {
    return window.localStorage.getItem(VIEWER_DIRECTORY_COLLAPSED_STORAGE_KEY) === "true";
  } catch {
    // Storage unavailable (private mode) — default to expanded.
    return false;
  }
}

function subscribeToDirectoryCollapsedPref(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(VIEWER_DIRECTORY_PREF_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(VIEWER_DIRECTORY_PREF_EVENT, onChange);
  };
}

function writeDirectoryCollapsedPref(collapsed: boolean) {
  try {
    window.localStorage.setItem(VIEWER_DIRECTORY_COLLAPSED_STORAGE_KEY, String(collapsed));
  } catch {
    // Preference just won't persist.
  }
  // Same-tab notification — the storage event only fires in OTHER tabs.
  window.dispatchEvent(new Event(VIEWER_DIRECTORY_PREF_EVENT));
}

// Marker focus restore for deselect paths — the details panel (which may
// hold focus) unmounts with the selection (critique action 5).
function focusViewerSeatMarker(seatId: string | null) {
  if (!seatId) return;
  window.requestAnimationFrame(() => {
    document.querySelector<HTMLButtonElement>(`[data-seat-id="${seatId}"]`)?.focus();
  });
}

export function ViewerSeatFinder({
  seats,
  employees,
  departmentOptions = [],
  zoneOptions = [],
  showAdminShortcut = false,
  lastPublishedLabel = null,
  accountEmail = null,
  accountRoleLabel = "Viewer"
}: ViewerSeatFinderProps) {
  const [search, setSearch] = useState("");
  const [searchShortcutHint, setSearchShortcutHint] = useState("");
  // People directory (2026-07-16 regrade, review 5): occupies the right slot
  // at rest. Server snapshot = expanded default, so SSR markup and the first
  // paint reserve the slot; the persisted collapse preference lands
  // synchronously at hydration (see the store helpers above the component).
  const directoryCollapsed = useSyncExternalStore(
    subscribeToDirectoryCollapsedPref,
    readDirectoryCollapsedPref,
    () => false
  );
  const [directoryHoverSeatId, setDirectoryHoverSeatId] = useState<string | null>(null);
  const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null);
  // Roving tabindex anchor: the last keyboard-visited seat (see SeatMap for
  // the same pattern — the map is one tab stop, arrows walk between seats).
  const [rovingSeatId, setRovingSeatId] = useState<string | null>(null);
  const focusInspectorAfterSelectRef = useRef(false);
  const [activeResultId, setActiveResultId] = useState<string | null>(null);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [floor, setFloor] = useState<FloorId>("3");
  // null = fit-to-view; a number = zoom factor applied to the base frame width.
  const [zoomFactor, setZoomFactor] = useState<number | null>(null);
  const [fitMapWidth, setFitMapWidth] = useState<number | null>(null);
  // Rendered map-frame width in CSS px (= pixels per normalized x unit),
  // observed off the frame element so fit and detail zoom share one source.
  const [mapRenderedWidth, setMapRenderedWidth] = useState<number | null>(null);
  const [panning, setPanning] = useState(false);
  const [department, setDepartment] = useState("all");
  const [position, setPosition] = useState("all");
  const [zone, setZone] = useState("all");
  const [status, setStatus] = useState("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const mapViewportRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const panStateRef = useRef<ViewerPanState>(null);
  const filterRootRef = useRef<HTMLDivElement | null>(null);
  const filterTriggerRef = useRef<HTMLButtonElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const publishedSeats = useMemo(() => seats.map(normalizeSeat), [seats]);
  const visualSeats = useMemo(() => seatsToVisualSeats(publishedSeats), [publishedSeats]);
  const visualSeatById = useMemo(() => new Map(visualSeats.map(seat => [seat.id, seat])), [visualSeats]);
  // Pill crowding at the live rendered scale (render-layer only, parity with
  // the admin map): code pills render at one uniform size, and the crowded
  // set feeds alternating vertical token nudges that keep tight pods from
  // overlapping (hover still discloses the full code + name). The clearance
  // must track the actual frame width — the People directory keeps the
  // at-rest stage narrower than the old full-bleed fit, and a static
  // fit-zoom clearance under-flags exactly those pods (they rendered
  // overlapping pills at rest). Before first measure (SSR/first paint) the
  // helper falls back to the default fit-zoom clearance.
  const seatDensityClearance = useMemo(
    () => clearanceFromScale(mapRenderedWidth ?? 0, (mapRenderedWidth ?? 0) * (MAP_IMAGE_HEIGHT / MAP_IMAGE_WIDTH)),
    [mapRenderedWidth]
  );
  // Pixel-aspect points for arrow-key traversal (see lib/seatKeyboardNav).
  const seatNavPoints = useMemo(
    () => visualSeats.map(seat => ({ id: seat.id, x: seat.x * MAP_IMAGE_WIDTH, y: seat.y * MAP_IMAGE_HEIGHT })),
    [visualSeats]
  );
  const mapRovingSeatId = resolveRovingSeatId(seatNavPoints, selectedSeatId ?? rovingSeatId);
  const seatById = useMemo(() => new Map(publishedSeats.map(seat => [seat.id, seat])), [publishedSeats]);
  const searchResults = useMemo(
    () => buildViewerSeatSearch({ query: search, seats: publishedSeats, employees, departmentOptions, zoneOptions }),
    [departmentOptions, employees, publishedSeats, search, zoneOptions]
  );
  const activeResult = searchResults.results.find(result => result.id === activeResultId) ?? null;
  const directory = useMemo(() => buildViewerDirectory({ seats: publishedSeats, employees }), [employees, publishedSeats]);

  // Keyboard activation of a seat hands focus into the details panel once the
  // selection commits; pointer interactions cancel the handoff.
  useEffect(() => {
    if (!focusInspectorAfterSelectRef.current) return;
    focusInspectorAfterSelectRef.current = false;
    if (!selectedSeatId) return;
    window.requestAnimationFrame(() => {
      document.getElementById("seat-inspector-panel")?.focus();
    });
  }, [selectedSeatId]);
  const selectedSeat = selectedSeatId ? seatById.get(selectedSeatId) ?? null : null;

  // Arrow-key roving over result cards — parity with the admin ResultsPanel
  // (critique action 6). ArrowUp from the first card returns focus to the
  // search input the cards came from.
  function handleResultsKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button[role="listitem"]:not([disabled])'));
    if (items.length === 0) return;
    event.preventDefault();
    const activeIndex = items.findIndex(item => item === document.activeElement);
    if (event.key === "ArrowDown") {
      items[activeIndex === -1 ? 0 : Math.min(items.length - 1, activeIndex + 1)]?.focus();
      return;
    }
    if (activeIndex <= 0) {
      searchInputRef.current?.focus();
      return;
    }
    items[activeIndex - 1]?.focus();
  }
  const searchActive = Boolean(searchResults.query);
  const structuredFiltersActive = department !== "all" || position !== "all" || zone !== "all" || status !== "all";
  const structuredFilterCount = [department !== "all", position !== "all", zone !== "all", status !== "all"].filter(Boolean).length;
  const filtersActive = searchActive || structuredFiltersActive;

  const seatPassesStructuredFilters = useCallback((seat: SeatWithEmployee) => {
    const departmentOk = department === "all" || getSeatDepartment(seat).toLowerCase() === department.toLowerCase();
    const positionOk = seatMatchesPosition(seat.employee?.position, position);
    const zoneOk = zone === "all" || getSeatZone(seat) === zone;
    const statusOk = status === "all" || seat.status === (status as SeatStatus);
    return departmentOk && positionOk && zoneOk && statusOk;
  }, [department, position, status, zone]);

  const resultSeatIdSet = useMemo(() => new Set(searchResults.resultSeatIds), [searchResults.resultSeatIds]);
  const activeResultSeatIdSet = useMemo(() => new Set(activeResult?.seatIds ?? []), [activeResult]);
  // Matches = search hits (narrowed by any structured filters), or filter hits alone.
  const highlightedSeatIdSet = useMemo(() => {
    const base = activeResultSeatIdSet.size > 0 ? activeResultSeatIdSet : resultSeatIdSet;
    const matched = new Set<string>();
    publishedSeats.forEach(seat => {
      const searchOk = !searchActive || base.has(seat.id);
      if (searchOk && seatPassesStructuredFilters(seat)) matched.add(seat.id);
    });
    return matched;
  }, [activeResultSeatIdSet, publishedSeats, resultSeatIdSet, searchActive, seatPassesStructuredFilters]);

  // Named set for the nudge graphs = exactly the seats that render a
  // name/prominent TOKEN, mirroring the marker loop's props through
  // SeatMarker's logic: searchProminent = searchResult && !dimmed, and both
  // reduce to `filtersActive && highlightedSeatIdSet.has(id)` here (raw
  // search hits that an active result card or structured filter dims render
  // plain CODE pills — they must stay in the code graph and keep their
  // codeNudge, not be modelled as phantom name obstacles). The selected seat
  // is excluded: active markers never nudge, so leaving it in would occupy a
  // palette slot/clique edge it never uses (the admin map's phantom-member
  // fix). The transient directory-hover highlight is also excluded — it is
  // momentary and z-raised, and including it would re-solve both nudge
  // graphs on every list hover.
  const namedSeatIdSet = useMemo(() => {
    if (!filtersActive) return new Set<string>();
    const set = new Set(highlightedSeatIdSet);
    if (selectedSeatId) set.delete(selectedSeatId);
    return set;
  }, [filtersActive, highlightedSeatIdSet, selectedSeatId]);
  // Name-label collision nudges (render-layer only): viewers have no
  // Show-names toggle, so the only tokens that leave the anchor row are the
  // prominent ones — nudged at the same live zoom-aware clearance as the
  // code graph (parity with the admin map).
  const nameLabelNudges = useMemo(
    () => computeNameLabelNudges(visualSeats, namedSeatIdSet, seatDensityClearance),
    [namedSeatIdSet, seatDensityClearance, visualSeats]
  );
  // Code-pill nudges are computed AFTER the name nudges so the code graph
  // can dodge the rows the name pills actually occupy (named seats render
  // name/prominent tokens, not code pills).
  const codePillNudges = useMemo(
    () => computeCodePillNudges(visualSeats, seatDensityClearance, { nameNudges: nameLabelNudges, namedSeatIds: namedSeatIdSet }),
    [nameLabelNudges, namedSeatIdSet, seatDensityClearance, visualSeats]
  );

  const selectedResultTitle = activeResult?.title ?? selectedSeat?.label ?? null;
  // Legend counts follow the active filters — the one number row everyone
  // reads must not contradict a filtered map (2026-07-16 regrade, review 4).
  const statusCountSeats = structuredFiltersActive ? publishedSeats.filter(seatPassesStructuredFilters) : publishedSeats;
  const assignedCount = statusCountSeats.filter(seat => seat.status === "assigned").length;
  const openCount = statusCountSeats.filter(seat => seat.status === "available").length;
  const reservedCount = statusCountSeats.filter(seat => seat.status === "reserved").length;
  const departments = uniqueVisibleOptions([
    ...departmentOptions.filter(option => option.active).map(option => option.name),
    ...employees.filter(employee => employee.active).map(employee => employee.department)
  ]);
  // Positions come off the published_employees snapshot the viewer already
  // holds — same publish cadence as every other person detail here.
  const positions = buildPositionOptions(employees);
  const zones = uniqueVisibleOptions([
    ...zoneOptions.filter(option => option.active).map(option => option.name),
    ...publishedSeats.map(seat => getSeatZone(seat))
  ]);

  useEffect(() => {
    if (!activeResultId) return;
    if (!searchResults.results.some(result => result.id === activeResultId)) setActiveResultId(null);
  }, [activeResultId, searchResults.results]);

  useEffect(() => {
    if (!selectedSeatId) return;
    if (!seatById.has(selectedSeatId)) setSelectedSeatId(null);
  }, [seatById, selectedSeatId]);

  useEffect(() => {
    if (!filterOpen) return;

    function handleOutsidePointer(event: globalThis.PointerEvent) {
      if (filterRootRef.current?.contains(event.target as Node)) return;
      setFilterOpen(false);
    }

    document.addEventListener("pointerdown", handleOutsidePointer);
    return () => document.removeEventListener("pointerdown", handleOutsidePointer);
  }, [filterOpen]);

  // Ctrl/⌘+K focuses the search — the same muscle memory as the admin map
  // (critique action 6). The hint renders a frame after mount so the server
  // markup never guesses the platform.
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setSearchShortcutHint(/mac/i.test(window.navigator.platform) ? "⌘K" : "Ctrl K");
    });
    const handleSearchShortcut = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
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

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (filterOpen) {
        setFilterOpen(false);
        return;
      }
      if (selectedSeatId) {
        focusViewerSeatMarker(selectedSeatId);
        setSelectedSeatId(null);
        setInspectorCollapsed(false);
        return;
      }
      const target = event.target;
      const editable = target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement;
      if (!editable && search.trim()) {
        const fromResultsPanel = target instanceof Element && Boolean(target.closest('[aria-label="Viewer search results"]'));
        setSearch("");
        if (fromResultsPanel) {
          window.requestAnimationFrame(() => searchInputRef.current?.focus());
        }
        return;
      }
      if (!editable && structuredFiltersActive) {
        setDepartment("all");
        setZone("all");
        setStatus("all");
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [filterOpen, search, selectedSeatId, structuredFiltersActive]);

  // Contain-fit for the fit view, three tiers by viewport width:
  //  - >=1024 (lg): both-dimension contain-fit (same pattern as SeatMap's
  //    overview) — the frame width follows BOTH viewport dimensions, so a
  //    squat viewport no longer leaves a dead band under the plan.
  //  - 640-1023 (sm..lg, tablet widths): width-only fit — the frame is sized
  //    to the viewport's own width, so there is no default horizontal
  //    scrollbar/dead band at tablet widths; frame height just follows the
  //    image aspect ratio.
  //  - <640: width stays null — the fixed mobile frame width (horizontal
  //    scroll by design) stays in charge.
  useEffect(() => {
    const viewport = mapViewportRef.current;
    if (!viewport) return;
    const viewportElement = viewport;

    function updateFitMapWidth() {
      if (!window.matchMedia("(min-width: 640px)").matches) {
        setFitMapWidth(null);
        return;
      }
      if (!window.matchMedia("(min-width: 1024px)").matches) {
        setFitMapWidth(Math.floor(Math.max(1, viewportElement.clientWidth - 2)));
        return;
      }
      const availableWidth = Math.max(1, viewportElement.clientWidth - 2);
      const availableHeight = Math.max(1, viewportElement.clientHeight - 2);
      const nextWidth = Math.min(MAP_IMAGE_WIDTH, availableWidth, availableHeight * (MAP_IMAGE_WIDTH / MAP_IMAGE_HEIGHT));
      setFitMapWidth(Math.floor(nextWidth));
    }

    updateFitMapWidth();

    const observer = new ResizeObserver(updateFitMapWidth);
    observer.observe(viewportElement);
    window.addEventListener("resize", updateFitMapWidth);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateFitMapWidth);
    };
  }, []);

  // Live scale for pill-crowding tiers: the frame's offsetWidth is exactly the
  // span of one normalized x unit, across fit, detail zoom, and the mobile
  // fixed-width frame. Re-binds on floor change — the frame div only mounts
  // for the mapped floor.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const mapElement = map;

    function updateRenderedWidth() {
      setMapRenderedWidth(mapElement.offsetWidth || null);
    }

    updateRenderedWidth();
    const observer = new ResizeObserver(updateRenderedWidth);
    observer.observe(mapElement);
    return () => observer.disconnect();
  }, [floor]);

  const scrollMapToPoint = useCallback((x: number, y: number, behavior: ScrollBehavior = "smooth") => {
    const viewport = mapViewportRef.current;
    const map = mapRef.current;
    if (!viewport || !map) return;

    const clampScrollPosition = (value: number, max: number) => Math.min(Math.max(value, 0), Math.max(max, 0));
    const left = clampScrollPosition((x * map.offsetWidth) - (viewport.clientWidth / 2), viewport.scrollWidth - viewport.clientWidth);
    const top = clampScrollPosition((y * map.offsetHeight) - (viewport.clientHeight / 2), viewport.scrollHeight - viewport.clientHeight);
    viewport.scrollTo({ left, top, behavior });
  }, []);

  const centerSeatInMap = useCallback((seatId: string, behavior: ScrollBehavior = "smooth") => {
    const visualSeat = visualSeatById.get(seatId);
    if (!visualSeat) return;
    window.requestAnimationFrame(() => scrollMapToPoint(visualSeat.x, visualSeat.y, behavior));
  }, [scrollMapToPoint, visualSeatById]);

  const fitSeatIdsInMap = useCallback((seatIds: string[]) => {
    const visualTargets = seatIds.map(seatId => visualSeatById.get(seatId)).filter((seat): seat is SeatWithEmployee => Boolean(seat));
    if (visualTargets.length === 0) return;
    if (visualTargets.length === 1) {
      centerSeatInMap(visualTargets[0].id);
      return;
    }

    const bounds = visualTargets.reduce(
      (current, seat) => ({
        minX: Math.min(current.minX, seat.x),
        maxX: Math.max(current.maxX, seat.x),
        minY: Math.min(current.minY, seat.y),
        maxY: Math.max(current.maxY, seat.y)
      }),
      { minX: 1, maxX: 0, minY: 1, maxY: 0 }
    );
    scrollMapToPoint((bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2);
  }, [centerSeatInMap, scrollMapToPoint, visualSeatById]);

  function applyMapZoom(nextZoom: number) {
    const clamped = Math.min(MAP_ZOOM_MAX, Math.max(MAP_ZOOM_MIN, Math.round(nextZoom * 100) / 100));
    setZoomFactor(clamped);
  }

  function fitMapToView() {
    setZoomFactor(null);
    window.requestAnimationFrame(() => {
      mapViewportRef.current?.scrollTo({ left: 0, top: 0, behavior: "auto" });
    });
  }

  function isPanBlockedTarget(target: EventTarget | null) {
    return target instanceof Element && Boolean(target.closest("button, a, input, select, textarea, [data-seat-id]"));
  }

  function handleViewportPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (floor !== "3" || event.button !== 0) return;
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
    if (isPanBlockedTarget(event.target)) return;
    // A stationary press on empty canvas clears the selection.
    setSelectedSeatId(null);
    setInspectorCollapsed(false);
  }

  function clearSearch() {
    setSearch("");
    setSelectedSeatId(null);
    setActiveResultId(null);
    setInspectorCollapsed(false);
  }

  function clearStructuredFilters() {
    setDepartment("all");
    setPosition("all");
    setZone("all");
    setStatus("all");
  }

  function clearAllConstraints() {
    clearSearch();
    clearStructuredFilters();
  }

  function updateSearch(value: string) {
    setSearch(value);
    setActiveResultId(null);
    // INV-1 (same rule as the admin map): an active search hands the panel
    // slot to results, so matches are never invisible behind the inspector.
    // The viewer inspector is read-only, so it is never dirty.
    if (searchHandsPanelToResults(value, Boolean(selectedSeatId), false)) {
      setInspectorCollapsed(true);
    }
  }

  function selectSeat(seatId: string) {
    setSelectedSeatId(seatId);
    setActiveResultId(null);
    setInspectorCollapsed(false);
    centerSeatInMap(seatId);
  }

  // Delegated marker-layer keyboarding — same pattern as the admin map:
  // arrows rove between seats (preventDefault keeps the scroll viewport from
  // panning underneath), keyboard activation hands focus into the inspector.
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
        window.requestAnimationFrame(() => {
          document.querySelector<HTMLButtonElement>(`[data-seat-id="${nextSeatId}"]`)?.focus();
        });
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

  function openResult(result: ViewerSearchResult) {
    setActiveResultId(result.id);
    if (result.seatId) {
      setSelectedSeatId(result.seatId);
      setInspectorCollapsed(false);
      centerSeatInMap(result.seatId);
      return;
    }

    setSelectedSeatId(null);
    fitSeatIdsInMap(result.seatIds);
  }

  const activeFilterChips: ActiveFilterChip[] = [
    searchActive ? { id: "search", label: "Search", value: searchResults.query, removeLabel: `Remove search filter ${searchResults.query}` } : null,
    department !== "all" ? { id: "department", label: "Department", value: department, removeLabel: `Remove department filter ${department}` } : null,
    position !== "all" ? { id: "position", label: "Position", value: position, removeLabel: `Remove position filter ${position}` } : null,
    zone !== "all" ? { id: "zone", label: "Zone", value: zone, removeLabel: `Remove zone filter ${zone}` } : null,
    status !== "all" ? { id: "status", label: "Status", value: STATUS_LABELS[status as SeatStatus] ?? status, removeLabel: `Remove status filter ${STATUS_LABELS[status as SeatStatus] ?? status}` } : null
  ].filter(Boolean) as ActiveFilterChip[];

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
    if (chipId === "status") setStatus("all");
  }

  const resultCountLabel = searchResults.results.length === 1 ? "1 result" : `${searchResults.results.length} results`;
  const mapAnnouncement = selectedResultTitle
    ? `${selectedResultTitle} selected on the map.`
    : searchActive
      ? `${resultCountLabel} for ${search}.`
      : `${publishedSeats.length} seats loaded.`;
  const mapCrumbLabel = floor === "2"
    ? "Not yet mapped"
    : `Office map · ${publishedSeats.length} ${publishedSeats.length === 1 ? "seat" : "seats"}`;
  const mapZoomLabel = zoomFactor === null ? "Fit" : `${Math.round(zoomFactor * 100)}%`;
  const resultsPanelOpen = searchActive && (!selectedSeat || inspectorCollapsed);
  // The directory holds the slot only at rest; results and the inspector
  // always win it (the INV-1 handoff is untouched). Desktop-only — below the
  // panel tier the map stays map-first and the directory renders nothing.
  // Deliberately NOT hydration-gated: expanded is the default preference, so
  // the server markup and first client paint reserve the right slot from the
  // start — gating on hydration rendered every load full-bleed first and then
  // snapped the canvas ~330px narrower when the persisted preference arrived
  // (the map re-fit twice and everything derived from its width churned).
  // Users who persisted a collapse still transition once, open → rail, when
  // the preference effect lands — the same single transition they always had.
  const directoryOpen = !searchActive && !selectedSeat && !directoryCollapsed;
  const directoryRail = !searchActive && !selectedSeat && directoryCollapsed;
  // Prototype "stage": at the panel tier the inspector reserves layout width
  // (320px expanded, 44px rail) instead of overlaying the map.
  const inspectorDockTier: "expanded" | "rail" | "none" = selectedSeat
    ? !inspectorCollapsed
      ? "expanded"
      : resultsPanelOpen
        ? "none"
        : "rail"
    : "none";
  // Whatever occupies the right slot reserves the column — expanded inspector
  // or results panel — so nothing renders hidden behind a panel.
  const rightSlotTier: "expanded" | "rail" | "none" =
    inspectorDockTier === "expanded" || resultsPanelOpen || directoryOpen ? "expanded" : directoryRail ? "rail" : inspectorDockTier;
  const stageReservedClassName = rightSlotTier === "expanded"
    ? "panel:pr-[332px]"
    : rightSlotTier === "rail"
      ? "panel:pr-[56px]"
      : "";

  // No zoom change on select/deselect: the fit view (zoomFactor null) sizes the
  // frame to the container at lg, so the reserved column re-fits it automatically;
  // a zoomed view keeps its zoom.

  const mapViewportClassName = cx(
    // Mounted-sheet treatment (2026-07-16 regrade, review 3) — see SeatMap.
    "relative mx-auto w-full max-w-full overflow-auto overscroll-contain border border-[var(--admin-border)] bg-[var(--sp-color-canvas)] shadow-elevation-2",
    "min-h-[360px] max-h-[82svh] sm:min-h-[520px] sm:max-h-[calc(100svh-62px)] lg:h-full lg:min-h-0 lg:max-h-none lg:flex-1 lg:[-ms-overflow-style:none] lg:[scrollbar-width:none] lg:[&::-webkit-scrollbar]:hidden",
    zoomFactor === null ? "sm:flex sm:items-center sm:justify-center" : "",
    floor === "3" ? (panning ? "cursor-grabbing" : "cursor-grab") : "",
    "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus-ring-color)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--sp-color-canvas)]"
  );
  const mapFrameClassName = cx(
    "relative mx-auto max-w-none",
    zoomFactor === null
      ? "w-[1040px] sm:w-full sm:max-w-[1911px] sm:shrink-0"
      : "[--map-detail-base:1040px] sm:[--map-detail-base:1340px] lg:[--map-detail-base:1911px]"
  );
  const mapFrameStyle = zoomFactor === null
    ? (fitMapWidth ? { width: `${fitMapWidth}px` } : undefined)
    : { width: `calc(var(--map-detail-base) * ${zoomFactor})` };
  // Fit view hugs the floor plan's aspect ratio at lg instead of stretching to
  // fill the leftover column height — the old flex-1 stage letterboxed the
  // plan between dead beige bands (54% of the map viewport at ~1084px with the
  // panel open; 2026-07-16 critique, fix 4). 1911/867 mirrors
  // MAP_IMAGE_WIDTH/MAP_IMAGE_HEIGHT (Tailwind arbitrary values must be
  // static). flex-shrink + lg:min-h-0 still cap the stage when height is the
  // binding dimension — exactly the old contain-fit outcome. Detail zoom keeps
  // flex-1: panning wants the full column.
  const mapStageClassName = cx(
    "relative min-w-0 lg:flex lg:min-h-0",
    zoomFactor === null ? "lg:aspect-[1911/867]" : "lg:flex-1"
  );

  const chromeSurfaceShortcut = "flex h-12 w-12 shrink-0 flex-col items-center justify-center gap-0.5 border-b-2 text-[10px] font-medium tracking-[0.02em] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-primary)]";

  return (
    /* overflow-x-CLIP, not -hidden: hidden makes this div a scroll container,
       which captures the sticky header so it never pins to the viewport. */
    <div className="shell-theme flex min-h-screen flex-col overflow-x-clip bg-[var(--admin-bg)] text-[var(--admin-text-primary)] lg:h-screen lg:min-h-0 lg:overflow-hidden">
      <a
        href="#viewer-seat-map"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[60] focus:border focus:border-[var(--admin-primary)] focus:bg-[var(--admin-chrome-bg)] focus:px-3 focus:py-2 focus:text-[12.5px] focus:font-semibold focus:text-[var(--admin-chrome-text)] focus:outline-none"
      >
        Skip to seat map
      </a>
      <h1 className="sr-only">Seat Planner — office map</h1>
      {/* z-50 matches the admin bar: sticky activates the z-index, which must
          outrank z-40 workspace overlays that follow in DOM order. */}
      <header className="sticky top-0 z-50 flex h-12 shrink-0 items-center border-b border-[var(--admin-chrome-border)] bg-[var(--admin-chrome-bg)] pl-3 text-[var(--admin-chrome-text)]">
        <div className="flex min-w-0 shrink-0 items-center gap-2">
          <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden bg-white">
            <Image src="/images/megeredchian-mark.png?v=tight" alt="" width={20} height={20} unoptimized className="h-5 w-5 object-contain" />
          </span>
          {/* leading-[18px], not leading-none: truncate's overflow-hidden clips descenders (the g) at line-height 1. */}
          <div aria-hidden="true" className="hidden min-w-0 truncate text-[12.5px] font-semibold leading-[18px] sm:block">
            Megeredchian Law <span className="font-normal text-[var(--admin-chrome-muted)]">· Seat Planner</span>
          </div>
        </div>

        {/* Divider tracks the bar (was 22px in a 40px bar — same 0.55 ratio). */}
        <span aria-hidden="true" className="mx-2.5 hidden h-[26px] w-px shrink-0 bg-[var(--admin-chrome-border)] lg:block" />

        {/* Filter and Search are two DISTINCT controls (was one shared 26px box
            capped at 340px for BOTH). Finding your own seat or looking up a
            person is the paramount job on this surface, so search gets its own
            field and the width; Filter keeps the pairing by sitting immediately
            to its LEFT with the dropdown anchored to itself. Both Carbon `sm` =
            Carbon `md` = 40px inside the 48px bar (owner, 2026-07-22). */}
        <div ref={filterRootRef} className="relative mr-1.5 flex h-10 shrink-0 items-stretch border border-[var(--admin-chrome-border)] bg-[var(--admin-chrome-field)] lg:mr-2">
          <button
            ref={filterTriggerRef}
            type="button"
            onClick={() => setFilterOpen(current => !current)}
            aria-expanded={filterOpen}
            aria-controls="viewer-filter-panel"
            aria-haspopup="true"
            aria-label={structuredFilterCount ? `Filter seating, ${structuredFilterCount} active` : "Filter seating"}
            className={[
              "flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 text-[12px] font-medium leading-none transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-primary)]",
              structuredFilterCount > 0 || filterOpen
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
          {/* DOM order mirrors the visual order: the menu drops directly under
              the trigger, so it must precede the search field in tab order. */}
          {filterOpen && (
            <div className="absolute -left-px top-full z-50 w-[288px] max-w-[calc(100vw-16px)]">
              <FilterPanel
                department={department}
                position={position}
                status={status}
                departments={departments}
                positions={positions}
                zone={zone}
                zones={zones}
                activeChips={activeFilterChips}
                panelId="viewer-filter-panel"
                returnFocusRef={filterTriggerRef}
                onClose={() => setFilterOpen(false)}
                onDepartmentChange={setDepartment}
                onPositionChange={setPosition}
                onZoneChange={setZone}
                onStatusChange={setStatus}
                matchSummary={`${statusCountSeats.length} of ${publishedSeats.length} seats match`}
                onRemoveActiveChip={removeActiveFilterChip}
                onClearFilters={clearStructuredFilters}
              />
            </div>
          )}
        </div>

        {/* Medium cap, 340 -> 420px on lg — matching the admin bar so the two
            surfaces read as one shell. Finding your seat is still the paramount
            job here, but 480 made the field the loudest thing in the row. */}
        <div role="search" aria-label="Viewer search" className="h-10 min-w-0 flex-1 border border-[var(--admin-chrome-border)] bg-[var(--admin-chrome-field)] lg:max-w-[420px]">
          <label htmlFor="viewer-seat-search" className="relative flex h-full w-full min-w-0 items-center">
            <span className="sr-only">Search office seating</span>
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--admin-chrome-muted)]">
              <circle cx="9" cy="9" r="5.25" stroke="currentColor" strokeWidth="1.7" />
              <path d="m13.4 13.4 3.1 3.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
            <input
              id="viewer-seat-search"
              value={search}
              onChange={event => updateSearch(event.target.value)}
              onKeyDown={event => {
                if (event.key === "Escape" && search.trim()) {
                  event.stopPropagation();
                  // Layered dismissal (2026-07-16 critique, minor 10): the
                  // first Esc only clears the query and returns the panel
                  // slot to the pre-search state; a second Esc reaches the
                  // global handler, which deselects the seat. The × button
                  // keeps the full clearSearch reset.
                  setSearch("");
                  setActiveResultId(null);
                  setInspectorCollapsed(false);
                  return;
                }
                // Results are visually adjacent but far away in DOM order —
                // ArrowDown hops focus straight into the results panel.
                if (event.key === "ArrowDown" && resultsPanelOpen) {
                  event.preventDefault();
                  document.querySelector<HTMLButtonElement>('[aria-label="Viewer search results"] button')?.focus();
                }
              }}
              ref={searchInputRef}
              placeholder={SEAT_SEARCH_PLACEHOLDER}
              className="h-full w-full border-0 bg-transparent pl-8 pr-8 text-[12px] font-medium text-ellipsis text-[var(--admin-chrome-text)] outline-none placeholder:text-ellipsis transition placeholder:text-[var(--admin-chrome-muted)] hover:bg-white/[0.06] focus:bg-white/[0.04] focus:ring-2 focus:ring-inset focus:ring-[var(--admin-primary)]"
            />
            {search.trim() ? (
              <button
                type="button"
                aria-label="Clear viewer search"
                title="Clear search"
                className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center text-[var(--admin-chrome-muted)] transition hover:bg-[var(--admin-chrome-hover)] hover:text-[var(--admin-chrome-text)] active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-primary)]"
                onClick={clearSearch}
              >
                <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3 w-3"><path d="m6 6 8 8m0-8-8 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            ) : searchShortcutHint ? (
              <kbd aria-hidden="true" className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 border border-[var(--admin-chrome-border)] px-1 py-0.5 text-[10px] font-semibold text-[var(--admin-chrome-muted)]">{searchShortcutHint}</kbd>
            ) : null}
          </label>
        </div>

        <div className="ml-auto flex h-full shrink-0 items-center">
          {/* Surface tabs are admin equipment (2026-07-16 regrade, review 2):
              non-admin staff would otherwise see one dead "tab" implying a
              missing sibling. Their chrome ends at the account chip; surface
              identity lives in the crumb and the menu's role line. */}
          {showAdminShortcut && (
            <div className="flex h-full items-center">
              <span
                aria-current="page"
                title="Viewer — published map"
                className={cx(chromeSurfaceShortcut, "border-[var(--admin-primary)] text-white")}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="8.2" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                Viewer
              </span>
              <Link
                href="/admin"
                aria-label="Open admin surface"
                title="Admin — draft editing surface"
                className={cx(chromeSurfaceShortcut, "border-transparent text-[var(--admin-chrome-muted)] hover:bg-[var(--admin-chrome-hover)] hover:text-[var(--admin-chrome-text)]")}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="9" cy="7" r="3.1" />
                  <path d="M3.5 20v-1.4a4.6 4.6 0 0 1 4.6-4.6h1.6a4.6 4.6 0 0 1 2.3.6" />
                  <path d="M14.5 18.4l2 2 4.2-4.6" />
                </svg>
                Admin
              </Link>
            </div>
          )}
          {/* Account menu (identity + sign out); decorative fallback keeps
              unauthenticated prototype embeds rendering. */}
          {accountEmail ? (
            <AccountMenu email={accountEmail} roleLabel={accountRoleLabel} />
          ) : (
            <span aria-hidden="true" className="mx-2.5 flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-[var(--admin-primary)] text-[11px] font-semibold text-[var(--admin-primary-ink)]">V</span>
          )}
        </div>
      </header>

      <div className={["mx-auto flex w-full max-w-[1920px] flex-1 flex-col px-2 py-2 sm:px-3 sm:py-3 lg:min-h-0 lg:overflow-hidden", stageReservedClassName].filter(Boolean).join(" ")}>
        <main className="flex min-w-0 flex-1 flex-col lg:min-h-0 lg:overflow-hidden">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-0.5 pb-2">
            <FloorSelector floor={floor} onChange={setFloor} />
            <span className="text-[12px] text-[var(--admin-text-secondary)]">{mapCrumbLabel}</span>
            {/* Viewers don't need the layer model ("Published" / "Read-only"
                badges) — a last-publish date answers the question they have. */}
            {lastPublishedLabel && floor === "3" && (
              <span
                title={`The map everyone sees — last updated ${lastPublishedLabel}`}
                className="rounded-full bg-[var(--admin-surface)] px-2.5 py-1 text-[11px] font-semibold text-[var(--admin-text-secondary)] ring-1 ring-[var(--admin-border)]"
              >
                Updated {lastPublishedLabel}
              </span>
            )}
            <ActiveFilterChips chips={activeFilterChips} onRemove={removeActiveFilterChip} onClearAll={clearAllConstraints} />
          </div>

          <div className={mapStageClassName}>
            <div
              ref={mapViewportRef}
              id="viewer-seat-map"
              tabIndex={0}
              aria-label="Office seat map. Drag to pan. Seat markers are read-only buttons."
              className={mapViewportClassName}
              onPointerDown={handleViewportPointerDown}
              onPointerMove={handleViewportPointerMove}
              onPointerUp={handleViewportPointerEnd}
              onPointerCancel={handleViewportPointerEnd}
            >
              {floor === "2" && <FloorPlaceholder />}
              {floor === "3" && (
                <div ref={mapRef} className={mapFrameClassName} style={mapFrameStyle}>
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
                    className="absolute inset-0"
                    onKeyDown={handleMarkerLayerKeyDown}
                    onFocusCapture={handleMarkerLayerFocusCapture}
                    onPointerDownCapture={() => {
                      focusInspectorAfterSelectRef.current = false;
                    }}
                  >
                    {visualSeats.map(seat => {
                      const inMatches = highlightedSeatIdSet.has(seat.id);
                      const dimmed = filtersActive && !inMatches && selectedSeatId !== seat.id;

                      return (
                        <SeatMarker
                          key={seat.id}
                          seat={seat}
                          selected={seat.id === selectedSeatId}
                          dimmed={dimmed}
                          canEdit={false}
                          showNames={false}
                          searchResult={filtersActive && inMatches}
                          compactNameLabel
                          codeNudge={codePillNudges.get(seat.id) ?? 0}
                          nameNudge={nameLabelNudges.get(seat.id) ?? 0}
                          moveSeatMode={false}
                          swapMode={false}
                          swapSource={false}
                          swapTarget={false}
                          highlighted={activeResultSeatIdSet.has(seat.id) || (directoryOpen && seat.id === directoryHoverSeatId)}
                          highlightedDescription="Highlighted search result"
                          dragging={false}
                          addSeatMode={false}
                          viewportEdge="none"
                          viewportEdgeOffsetPx={0}
                          tabIndex={seat.id === mapRovingSeatId ? 0 : -1}
                          onSelect={selectSeat}
                          onMovePointerDown={() => undefined}
                        />
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            {floor === "3" && (
              <div className="absolute bottom-3 right-3 z-30">
                <MapZoomControl
                  label={mapZoomLabel}
                  onZoomIn={() => applyMapZoom(zoomFactor === null ? 1 : zoomFactor + MAP_ZOOM_STEP)}
                  onZoomOut={() => applyMapZoom(zoomFactor === null ? 1 - MAP_ZOOM_STEP : zoomFactor - MAP_ZOOM_STEP)}
                  onFit={fitMapToView}
                  zoomInDisabled={zoomFactor !== null && zoomFactor >= MAP_ZOOM_MAX}
                  zoomOutDisabled={zoomFactor !== null && zoomFactor <= MAP_ZOOM_MIN}
                />
              </div>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 py-2">
            <p className="min-w-0 truncate text-xs font-medium text-[var(--admin-text-muted)]">
              {searchActive
                ? `${resultCountLabel} · ${searchResults.resultSeatIds.length} mapped`
                : structuredFiltersActive
                  // Filters got no match count while search did (2026-07-16
                  // critique, minor 8) — same status-line home for both.
                  ? `${highlightedSeatIdSet.size} of ${publishedSeats.length} seats ${highlightedSeatIdSet.size === 1 ? "matches" : "match"} filters`
                  : "Seating across people, seats, departments, and zones."}
            </p>
            <ul aria-label="Seat status summary" className="flex flex-wrap items-center gap-2 text-xs font-medium text-[var(--admin-text-secondary)]">
              {[
                { label: "Assigned", value: assignedCount, dotClass: "bg-[var(--admin-status-ok)]" },
                { label: "Open", value: openCount, dotClass: "bg-[var(--admin-status-neutral)]" },
                { label: "Reserved", value: reservedCount, dotClass: "bg-[var(--admin-status-warn)]" }
              ].map(item => (
                <li key={item.label} className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[var(--admin-border)] bg-[var(--admin-surface-muted)] px-2.5 py-1">
                  <span className={cx("h-2 w-2 shrink-0 rounded-full", item.dotClass)} aria-hidden="true" />
                  {item.label}
                  <span className="font-semibold text-[var(--admin-text-primary)]">{item.value}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="sr-only" aria-live="polite">{mapAnnouncement}</p>
        </main>
      </div>

      {resultsPanelOpen && (
        <aside
          aria-labelledby="viewer-results-title"
          className="fixed inset-x-3 bottom-3 z-[80] flex max-h-[50vh] flex-col overflow-hidden border border-[var(--admin-border)] bg-[var(--admin-surface)] shadow-elevation-3 panel:inset-x-auto panel:bottom-3 panel:right-3 panel:top-[48px] panel:z-40 panel:max-h-none panel:w-[320px] panel:max-w-[calc(100vw-1.5rem)]"
        >
          <div className="flex items-center justify-between gap-2 border-b border-[var(--admin-border)] px-4 py-3">
            <h2 id="viewer-results-title" className="text-sm font-semibold text-[var(--admin-text-primary)]">Results</h2>
            <span aria-live="polite" className="text-xs font-medium text-[var(--admin-text-muted)]">
              {resultCountLabel} · {searchResults.resultSeatIds.length} mapped
            </span>
          </div>

          {searchResults.results.length > 0 ? (
            <div role="list" aria-label="Viewer search results" onKeyDown={handleResultsKeyDown} className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain p-2">
              {searchResults.results.map(result => {
                const selected = result.id === activeResultId || Boolean(result.seatId && result.seatId === selectedSeatId);
                return (
                  <button
                    key={result.id}
                    type="button"
                    role="listitem"
                    disabled={result.disabled}
                    aria-current={selected ? "true" : undefined}
                    aria-label={`${KIND_LABELS[result.kind]} result. ${result.title}. ${result.subtitle}. ${result.meta}.${selected ? " Selected." : ""}`}
                    onClick={() => openResult(result)}
                    className={cx(
                      "grid w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border p-2.5 text-left transition hover:border-[var(--admin-primary-border)] hover:bg-[var(--admin-paper)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)] disabled:cursor-not-allowed disabled:opacity-60",
                      selected ? "border-[var(--admin-primary-border)] bg-[var(--admin-paper)]" : "border-transparent"
                    )}
                  >
                    <span className="min-w-0">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-sm font-semibold text-[var(--admin-text-primary)]">{result.title}</span>
                        <span className={cx("shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ring-1", resultKindClass(result.kind))}>
                          {KIND_LABELS[result.kind]}
                        </span>
                      </span>
                      <span className="mt-1 block truncate text-xs font-medium text-[var(--admin-text-secondary)]">{result.subtitle}</span>
                      <span className="mt-0.5 block truncate text-[11px] text-[var(--admin-text-muted)]">{result.meta}</span>
                    </span>
                    <span className="shrink-0 rounded-full bg-[var(--admin-surface-muted)] px-2 py-1 font-mono text-[10px] font-semibold text-[var(--admin-text-muted)] ring-1 ring-[var(--admin-border)]">
                      {result.seatIds.length || "-"}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div role="status" aria-live="polite" className="p-4">
              <div className="text-sm font-semibold text-[var(--admin-text-primary)]">No results for “{search.trim()}”</div>
              <p className="mt-1 text-xs font-medium leading-5 text-[var(--admin-text-muted)]">
                No matching people, seats, departments, or zones.
              </p>
              <button type="button" onClick={clearSearch} className="mt-3 border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 py-1.5 text-[11px] font-semibold text-[var(--admin-text-secondary)] transition hover:border-[var(--admin-primary-border)] hover:text-[var(--admin-primary-cta)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)]">
                Clear search
              </button>
            </div>
          )}

          <div className="border-t border-[var(--admin-border)] px-4 py-2 text-[11px] font-medium text-[var(--admin-text-subtle)]">
            ↑↓ to move · Enter opens · Esc clears
          </div>
        </aside>
      )}

      {directoryOpen && (
        <aside
          aria-labelledby="viewer-people-title"
          className="hidden flex-col overflow-hidden border border-[var(--admin-border)] bg-[var(--admin-surface)] shadow-elevation-3 panel:fixed panel:bottom-3 panel:right-3 panel:top-[48px] panel:z-40 panel:flex panel:w-[320px] panel:max-w-[calc(100vw-1.5rem)]"
        >
          <div className="flex items-center justify-between gap-2 border-b border-[var(--admin-border)] px-4 py-3">
            <h2 id="viewer-people-title" className="text-sm font-semibold text-[var(--admin-text-primary)]">People</h2>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-[var(--admin-text-muted)]">{directory.totalCount}</span>
              <button
                type="button"
                onClick={() => writeDirectoryCollapsedPref(true)}
                aria-label="Collapse the people list"
                title="Collapse"
                className="flex h-6 w-6 items-center justify-center text-[var(--admin-text-muted)] transition hover:bg-[var(--admin-surface-alt)] hover:text-[var(--admin-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)]"
              >
                <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4"><path d="M5 10h10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
              </button>
            </div>
          </div>
          <div role="list" aria-label="People directory" onKeyDown={handleResultsKeyDown} className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain p-2">
            {directory.rows.map(row => (
              <button
                key={row.id}
                type="button"
                role="listitem"
                disabled={row.disabled}
                aria-label={`${row.title}. ${row.subtitle}.`}
                onClick={() => openResult(row)}
                onPointerEnter={() => setDirectoryHoverSeatId(row.seatId)}
                onPointerLeave={() => setDirectoryHoverSeatId(null)}
                className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border border-transparent p-2.5 text-left transition hover:border-[var(--admin-primary-border)] hover:bg-[var(--admin-paper)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--admin-surface-alt)] text-[11px] font-bold text-[var(--admin-text-secondary)]">
                  {buildInitials(row.title) || "?"}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-[var(--admin-text-primary)]">{row.title}</span>
                  <span className="mt-0.5 block truncate text-xs font-medium text-[var(--admin-text-secondary)]">{row.subtitle}</span>
                </span>
                {row.seatId ? (
                  <span className="shrink-0 rounded-full bg-[var(--admin-surface-muted)] px-2 py-1 font-mono text-[10px] font-semibold text-[var(--admin-text-muted)] ring-1 ring-[var(--admin-border)]">
                    {row.subtitle.split(" · ")[0]}
                  </span>
                ) : (
                  <span className="shrink-0 text-[10px] font-medium text-[var(--admin-text-subtle)]">—</span>
                )}
              </button>
            ))}
          </div>
          <div className="border-t border-[var(--admin-border)] px-4 py-2 text-[11px] font-medium text-[var(--admin-text-subtle)]">
            {directory.totalCount} {directory.totalCount === 1 ? "person" : "people"} · {directory.seatedCount} seated
          </div>
        </aside>
      )}

      {directoryRail && (
        <aside className="hidden panel:block panel:fixed panel:bottom-0 panel:right-0 panel:top-10 panel:z-40">
          <button
            type="button"
            onClick={() => writeDirectoryCollapsedPref(false)}
            aria-label={`Show the people list (${directory.totalCount} people)`}
            title="Show people"
            className="flex h-full w-11 flex-col items-center justify-center gap-2 border-l border-[var(--admin-border)] bg-[var(--admin-surface)] px-2 py-4 text-[var(--admin-text-secondary)] transition hover:bg-[var(--admin-surface-alt)] hover:text-[var(--admin-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-focus)]"
          >
            <span className="rotate-180 text-[10px] font-medium tracking-[0.14em] [writing-mode:vertical-rl]">PEOPLE · {directory.totalCount}</span>
          </button>
        </aside>
      )}

      <SeatInspector
        seat={selectedSeat}
        seats={publishedSeats}
        employees={employees}
        departmentOptions={departmentOptions}
        canEdit={false}
        collapsed={inspectorCollapsed}
        pillSuppressed={resultsPanelOpen}
        swapMode={false}
        onClose={() => {
          focusViewerSeatMarker(selectedSeatId);
          setSelectedSeatId(null);
          setInspectorCollapsed(false);
        }}
        onToggleCollapse={() => setInspectorCollapsed(current => !current)}
      />
    </div>
  );
}
