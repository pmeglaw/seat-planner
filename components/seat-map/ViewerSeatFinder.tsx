"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import type { DepartmentOption, Employee, SeatStatus, SeatWithEmployee, ZoneOption } from "@/lib/types";
import { STATUS_LABELS } from "@/lib/types";
import { normalizeSeat } from "@/lib/seatNormalize";
import { cx } from "@/components/ui/design-system";
import {
  MAP_IMAGE_HEIGHT,
  MAP_IMAGE_SRC,
  MAP_IMAGE_WIDTH,
  seatsToVisualSeats
} from "@/lib/mapLayoutTransform";
import { buildViewerSeatSearch, type ViewerSearchResult } from "@/lib/viewerSeatSearch";
import { ActiveFilterChips, FilterPanel, type ActiveFilterChip } from "@/components/seat-map/FilterPanel";
import { FloorPlaceholder, FloorSelector, type FloorId } from "@/components/seat-map/FloorSelector";
import { MapZoomControl } from "@/components/seat-map/MapZoomControl";
import { SeatInspector } from "@/components/seat-map/SeatInspector";
import { SeatMarker } from "@/components/seat-map/SeatMarker";

type ViewerSeatFinderProps = {
  seats: SeatWithEmployee[];
  employees: Employee[];
  departmentOptions?: DepartmentOption[];
  zoneOptions?: ZoneOption[];
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
  if (kind === "seat") return "bg-[#161616] text-white ring-[#161616]";
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

export function ViewerSeatFinder({
  seats,
  employees,
  departmentOptions = [],
  zoneOptions = []
}: ViewerSeatFinderProps) {
  const [search, setSearch] = useState("");
  const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null);
  const [activeResultId, setActiveResultId] = useState<string | null>(null);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [floor, setFloor] = useState<FloorId>("3");
  // null = fit-to-view; a number = zoom factor applied to the base frame width.
  const [zoomFactor, setZoomFactor] = useState<number | null>(null);
  const [panning, setPanning] = useState(false);
  const [department, setDepartment] = useState("all");
  const [zone, setZone] = useState("all");
  const [status, setStatus] = useState("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const mapViewportRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const panStateRef = useRef<ViewerPanState>(null);
  const filterRootRef = useRef<HTMLDivElement | null>(null);

  const publishedSeats = useMemo(() => seats.map(normalizeSeat), [seats]);
  const visualSeats = useMemo(() => seatsToVisualSeats(publishedSeats), [publishedSeats]);
  const visualSeatById = useMemo(() => new Map(visualSeats.map(seat => [seat.id, seat])), [visualSeats]);
  const seatById = useMemo(() => new Map(publishedSeats.map(seat => [seat.id, seat])), [publishedSeats]);
  const searchResults = useMemo(
    () => buildViewerSeatSearch({ query: search, seats: publishedSeats, employees, departmentOptions, zoneOptions }),
    [departmentOptions, employees, publishedSeats, search, zoneOptions]
  );
  const activeResult = searchResults.results.find(result => result.id === activeResultId) ?? null;
  const selectedSeat = selectedSeatId ? seatById.get(selectedSeatId) ?? null : null;
  const searchActive = Boolean(searchResults.query);
  const structuredFiltersActive = department !== "all" || zone !== "all" || status !== "all";
  const structuredFilterCount = [department !== "all", zone !== "all", status !== "all"].filter(Boolean).length;
  const filtersActive = searchActive || structuredFiltersActive;

  const seatPassesStructuredFilters = useCallback((seat: SeatWithEmployee) => {
    const departmentOk = department === "all" || getSeatDepartment(seat).toLowerCase() === department.toLowerCase();
    const zoneOk = zone === "all" || getSeatZone(seat) === zone;
    const statusOk = status === "all" || seat.status === (status as SeatStatus);
    return departmentOk && zoneOk && statusOk;
  }, [department, status, zone]);

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

  const selectedResultTitle = activeResult?.title ?? selectedSeat?.label ?? null;
  const assignedCount = publishedSeats.filter(seat => seat.status === "assigned").length;
  const openCount = publishedSeats.filter(seat => seat.status === "available").length;
  const reservedCount = publishedSeats.filter(seat => seat.status === "reserved").length;
  const departments = uniqueVisibleOptions([
    ...departmentOptions.filter(option => option.active).map(option => option.name),
    ...employees.filter(employee => employee.active).map(employee => employee.department)
  ]);
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

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (filterOpen) {
        setFilterOpen(false);
        return;
      }
      if (selectedSeatId) {
        setSelectedSeatId(null);
        setInspectorCollapsed(false);
        return;
      }
      const target = event.target;
      const editable = target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement;
      if (!editable && search.trim()) {
        setSearch("");
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
  }

  function selectSeat(seatId: string) {
    setSelectedSeatId(seatId);
    setActiveResultId(null);
    setInspectorCollapsed(false);
    centerSeatInMap(seatId);
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
    if (chipId === "zone") {
      setZone("all");
      return;
    }
    if (chipId === "status") setStatus("all");
  }

  const resultCountLabel = searchResults.results.length === 1 ? "1 result" : `${searchResults.results.length} results`;
  const mapAnnouncement = selectedResultTitle
    ? `${selectedResultTitle} selected on the published map.`
    : searchActive
      ? `${resultCountLabel} for ${search}.`
      : `${publishedSeats.length} published seats loaded.`;
  const mapCrumbLabel = floor === "2"
    ? "Not yet mapped"
    : `Published map · ${publishedSeats.length} ${publishedSeats.length === 1 ? "seat" : "seats"}`;
  const mapZoomLabel = zoomFactor === null ? "Fit" : `${Math.round(zoomFactor * 100)}%`;
  const resultsPanelOpen = searchActive && (!selectedSeat || inspectorCollapsed);
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
    inspectorDockTier === "expanded" || resultsPanelOpen ? "expanded" : inspectorDockTier;
  const stageReservedClassName = rightSlotTier === "expanded"
    ? "panel:pr-[332px]"
    : rightSlotTier === "rail"
      ? "panel:pr-[56px]"
      : "";

  // No zoom change on select/deselect: the fit view (zoomFactor null) sizes the
  // frame to the container at lg, so the reserved column re-fits it automatically;
  // a zoomed view keeps its zoom.

  const mapViewportClassName = cx(
    "relative mx-auto w-full max-w-full overflow-auto overscroll-contain border border-[var(--admin-border)] bg-[var(--admin-map-floor)]",
    "min-h-[360px] max-h-[82svh] sm:min-h-[520px] sm:max-h-[calc(100svh-62px)] lg:h-full lg:min-h-0 lg:max-h-none lg:flex-1 lg:[-ms-overflow-style:none] lg:[scrollbar-width:none] lg:[&::-webkit-scrollbar]:hidden",
    floor === "3" ? (panning ? "cursor-grabbing" : "cursor-grab") : "",
    "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus-ring-color)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--admin-map-floor)]"
  );
  const mapFrameClassName = cx(
    "relative mx-auto max-w-none",
    zoomFactor === null
      ? "w-[1040px] sm:w-[1340px] lg:w-full lg:max-w-[1911px]"
      : "[--map-detail-base:1040px] sm:[--map-detail-base:1340px] lg:[--map-detail-base:1911px]"
  );
  const mapFrameStyle = zoomFactor === null ? undefined : { width: `calc(var(--map-detail-base) * ${zoomFactor})` };

  const chromeSurfaceShortcut = "flex h-10 w-12 shrink-0 flex-col items-center justify-center gap-0.5 border-b-2 text-[8.5px] font-medium tracking-[0.02em] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-primary)]";

  return (
    <div className="shell-theme flex min-h-screen flex-col overflow-x-hidden bg-[var(--admin-bg)] text-[var(--admin-text-primary)] lg:h-screen lg:min-h-0 lg:overflow-hidden">
      <h1 className="sr-only">Office Seat Finder</h1>
      <header className="z-40 flex h-10 shrink-0 items-center border-b border-[var(--admin-chrome-border)] bg-[var(--admin-chrome-bg)] pl-3 text-[var(--admin-chrome-text)]">
        <div className="flex min-w-0 shrink-0 items-center gap-2">
          <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden bg-white">
            <Image src="/images/megeredchian-mark.png?v=tight" alt="" width={20} height={20} unoptimized className="h-5 w-5 object-contain" />
          </span>
          <div aria-hidden="true" className="hidden min-w-0 truncate text-[12.5px] font-semibold leading-none sm:block">
            Megeredchian Law <span className="font-normal text-[var(--admin-chrome-muted)]">· Seat Planner</span>
          </div>
        </div>

        <span aria-hidden="true" className="mx-2.5 hidden h-[22px] w-px shrink-0 bg-[var(--admin-chrome-border)] lg:block" />

        {/* Filter + Search: ONE connected control — Filter segment immediately
            LEFT of the search input, sharing one border; the dropdown anchors
            inside the group so the open menu butts directly against the button. */}
        <div ref={filterRootRef} className="relative mr-2 flex h-[26px] min-w-0 flex-1 items-stretch border border-[var(--admin-chrome-border)] bg-[var(--admin-chrome-field)] lg:max-w-[340px]">
          <button
            type="button"
            onClick={() => setFilterOpen(current => !current)}
            aria-expanded={filterOpen}
            aria-controls="viewer-filter-panel"
            aria-haspopup="true"
            aria-label={structuredFilterCount ? `Filter published seating, ${structuredFilterCount} active` : "Filter published seating"}
            className={[
              "flex shrink-0 items-center gap-1.5 border-b-2 border-r border-r-[var(--admin-chrome-border)] px-2.5 text-[12px] font-medium leading-none transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-primary)]",
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
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--admin-primary-cta)] px-1 text-[10px] font-semibold text-white">{structuredFilterCount}</span>
            )}
            <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3 w-3 text-[var(--admin-chrome-muted)]">
              <path d="m5.5 8 4.5 4.5L14.5 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div role="search" aria-label="Viewer search" className="h-full min-w-0 flex-1">
            <label htmlFor="viewer-seat-search" className="relative flex h-full w-full min-w-0 items-center">
              <span className="sr-only">Search published seating</span>
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
                    clearSearch();
                  }
                }}
                placeholder="Search people or seats"
                className="h-full w-full border-0 bg-transparent pl-8 pr-8 text-[12px] font-medium text-[var(--admin-chrome-text)] outline-none transition placeholder:text-[var(--admin-chrome-muted)] hover:bg-white/[0.06] focus:bg-white/[0.04] focus:ring-2 focus:ring-inset focus:ring-[var(--admin-primary)]"
              />
              {search.trim() && (
                <button
                  type="button"
                  aria-label="Clear viewer search"
                  title="Clear search"
                  className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center text-[var(--admin-chrome-muted)] transition hover:bg-[var(--admin-chrome-hover)] hover:text-[var(--admin-chrome-text)] active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-primary)]"
                  onClick={clearSearch}
                >
                  <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3 w-3"><path d="m6 6 8 8m0-8-8 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              )}
            </label>
          </div>
          {filterOpen && (
            <div className="absolute -left-px top-full z-50 w-[288px] max-w-[calc(100vw-16px)]">
              <FilterPanel
                department={department}
                status={status}
                departments={departments}
                zone={zone}
                zones={zones}
                activeChips={activeFilterChips}
                panelId="viewer-filter-panel"
                onClose={() => setFilterOpen(false)}
                onDepartmentChange={setDepartment}
                onZoneChange={setZone}
                onStatusChange={setStatus}
                onRemoveActiveChip={removeActiveFilterChip}
                onClearFilters={clearStructuredFilters}
              />
            </div>
          )}
        </div>

        <div className="ml-auto flex h-full shrink-0 items-center">
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
              title="Admin — requires admin access"
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
          <span aria-hidden="true" className="mx-2.5 flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-[var(--admin-primary)] text-[11px] font-semibold text-[var(--admin-primary-ink)]">V</span>
        </div>
      </header>

      <div className={["mx-auto flex w-full max-w-[1920px] flex-1 flex-col px-2 py-2 sm:px-3 sm:py-3 lg:min-h-0 lg:overflow-hidden", stageReservedClassName].filter(Boolean).join(" ")}>
        <main className="flex min-w-0 flex-1 flex-col lg:min-h-0 lg:overflow-hidden">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-0.5 pb-2">
            <FloorSelector floor={floor} onChange={setFloor} />
            <span className="text-[12px] text-[var(--admin-text-secondary)]">{mapCrumbLabel}</span>
            <span className="rounded-full bg-[var(--admin-success-soft)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--admin-success)] ring-1 ring-[var(--admin-success)]/30">Published</span>
            <span className="rounded-full bg-[var(--admin-surface)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--admin-text-muted)] ring-1 ring-[var(--admin-border)]">Read-only</span>
            <ActiveFilterChips chips={activeFilterChips} onRemove={removeActiveFilterChip} onClearAll={clearAllConstraints} className="ml-auto" />
          </div>

          <div className="relative min-w-0 lg:flex lg:min-h-0 lg:flex-1">
            <div
              ref={mapViewportRef}
              tabIndex={0}
              aria-label="Published office seat map. Drag to pan. Seat markers are read-only buttons."
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
                    className="block h-auto w-full select-none"
                    draggable={false}
                  />

                  <div className="absolute inset-0">
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
                          moveSeatMode={false}
                          swapMode={false}
                          swapSource={false}
                          swapTarget={false}
                          highlighted={activeResultSeatIdSet.has(seat.id)}
                          highlightedDescription="Highlighted search result"
                          dragging={false}
                          addSeatMode={false}
                          viewportEdge="none"
                          viewportEdgeOffsetPx={0}
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
              {searchActive ? `${resultCountLabel} · ${searchResults.resultSeatIds.length} mapped` : "Published seating across people, seats, departments, and zones."}
            </p>
            <ul aria-label="Seat status summary" className="flex flex-wrap items-center gap-2 text-xs font-medium text-[var(--admin-text-secondary)]">
              {[
                { label: "Assigned", value: assignedCount, dotClass: "bg-[var(--admin-status-ok)]" },
                { label: "Open", value: openCount, dotClass: "bg-[#8d8d8d]" },
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
          className="fixed inset-x-3 bottom-3 z-[80] flex max-h-[50vh] flex-col overflow-hidden border border-[var(--admin-border)] bg-[var(--admin-surface)] shadow-[var(--admin-elevation-3-shadow)] panel:inset-x-auto panel:bottom-3 panel:right-3 panel:top-[48px] panel:z-40 panel:max-h-none panel:w-[320px] panel:max-w-[calc(100vw-1.5rem)]"
        >
          <div className="flex items-center justify-between gap-2 border-b border-[var(--admin-border)] px-4 py-3">
            <h2 id="viewer-results-title" className="text-sm font-semibold text-[var(--admin-text-primary)]">Results</h2>
            <span aria-live="polite" className="text-xs font-medium text-[var(--admin-text-muted)]">
              {resultCountLabel} · {searchResults.resultSeatIds.length} mapped
            </span>
          </div>

          {searchResults.results.length > 0 ? (
            <div role="list" aria-label="Viewer search results" className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain p-2">
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
              <div className="text-sm font-semibold text-[var(--admin-text-primary)]">No results for {search.trim()}</div>
              <p className="mt-1 text-xs font-medium leading-5 text-[var(--admin-text-muted)]">
                No matching published people, seats, departments, or zones.
              </p>
              <button type="button" onClick={clearSearch} className="mt-3 border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 py-1.5 text-[11px] font-semibold text-[var(--admin-text-secondary)] transition hover:border-[var(--admin-primary-border)] hover:text-[var(--admin-primary-cta)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)]">
                Clear search
              </button>
            </div>
          )}
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
          setSelectedSeatId(null);
          setInspectorCollapsed(false);
        }}
        onToggleCollapse={() => setInspectorCollapsed(current => !current)}
      />
    </div>
  );
}
