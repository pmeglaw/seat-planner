"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import type { DepartmentOption, Employee, SeatStatus, SeatWithEmployee, ZoneOption } from "@/lib/types";
import {
  MAP_IMAGE_HEIGHT,
  MAP_IMAGE_SRC,
  MAP_IMAGE_WIDTH,
  seatsToVisualSeats
} from "@/lib/mapLayoutTransform";
import { buildViewerSeatSearch, type ViewerSearchResult } from "@/lib/viewerSeatSearch";
import { SeatMarker } from "@/components/seat-map/SeatMarker";

type ViewerSeatFinderProps = {
  seats: SeatWithEmployee[];
  employees: Employee[];
  departmentOptions?: DepartmentOption[];
  zoneOptions?: ZoneOption[];
};

const STATUS_LABELS: Record<SeatStatus, string> = {
  assigned: "Assigned",
  available: "Available",
  reserved: "Reserved",
  unavailable: "Unavailable"
};

const KIND_LABELS: Record<ViewerSearchResult["kind"], string> = {
  person: "Person",
  seat: "Seat",
  department: "Department",
  zone: "Zone"
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function normalizeSeat(seat: SeatWithEmployee): SeatWithEmployee {
  return {
    ...seat,
    x: Number(seat.x),
    y: Number(seat.y),
    zone: seat.zone ?? seat.department ?? null,
    is_custom: Boolean(seat.is_custom)
  };
}

function getSeatZone(seat: SeatWithEmployee) {
  return seat.zone ?? seat.department ?? "No zone";
}

function getSeatDepartment(seat: SeatWithEmployee) {
  return seat.employee?.department ?? seat.department ?? "No department";
}

function getSeatPerson(seat: SeatWithEmployee) {
  return seat.employee?.full_name ?? "Open seat";
}

function resultKindClass(kind: ViewerSearchResult["kind"]) {
  if (kind === "person") return "bg-blue-50 text-blue-700 ring-blue-200";
  if (kind === "seat") return "bg-slate-950 text-white ring-slate-950";
  if (kind === "department") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  return "bg-amber-50 text-amber-800 ring-amber-200";
}

function statusClass(status: SeatStatus) {
  if (status === "assigned") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (status === "reserved") return "bg-amber-50 text-amber-800 ring-amber-200";
  if (status === "unavailable") return "bg-slate-100 text-slate-700 ring-slate-200";
  return "bg-white text-slate-700 ring-slate-200";
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
  const mapViewportRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapSectionRef = useRef<HTMLElement | null>(null);

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
  const resultSeatIdSet = useMemo(() => new Set(searchResults.resultSeatIds), [searchResults.resultSeatIds]);
  const activeResultSeatIdSet = useMemo(() => new Set(activeResult?.seatIds ?? []), [activeResult]);
  const highlightedSeatIdSet = activeResultSeatIdSet.size > 0 ? activeResultSeatIdSet : resultSeatIdSet;
  const selectedResultTitle = activeResult?.title ?? selectedSeat?.label ?? null;
  const assignedCount = publishedSeats.filter(seat => seat.status === "assigned").length;
  const openCount = publishedSeats.filter(seat => seat.status === "available").length;
  const reservedCount = publishedSeats.filter(seat => seat.status === "reserved").length;
  const quickDepartments = uniqueVisibleOptions([
    ...departmentOptions.filter(option => option.active).map(option => option.name),
    ...employees.filter(employee => employee.active).map(employee => employee.department)
  ]).slice(0, 4);
  const quickZones = uniqueVisibleOptions([
    ...zoneOptions.filter(option => option.active).map(option => option.name),
    ...publishedSeats.map(seat => getSeatZone(seat))
  ]).slice(0, 4);

  useEffect(() => {
    if (!activeResultId) return;
    if (!searchResults.results.some(result => result.id === activeResultId)) setActiveResultId(null);
  }, [activeResultId, searchResults.results]);

  useEffect(() => {
    if (!selectedSeatId) return;
    if (!seatById.has(selectedSeatId)) setSelectedSeatId(null);
  }, [seatById, selectedSeatId]);

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

  function clearSearch() {
    setSearch("");
    setSelectedSeatId(null);
    setActiveResultId(null);
  }

  function updateSearch(value: string) {
    setSearch(value);
    setActiveResultId(null);
    setSelectedSeatId(null);
  }

  function selectSeat(seatId: string) {
    setSelectedSeatId(seatId);
    setActiveResultId(null);
    centerSeatInMap(seatId);
  }

  function openResult(result: ViewerSearchResult) {
    setActiveResultId(result.id);
    if (result.seatId) {
      setSelectedSeatId(result.seatId);
      centerSeatInMap(result.seatId);
      return;
    }

    setSelectedSeatId(null);
    fitSeatIdsInMap(result.seatIds);
  }

  function openResultAndMap(result: ViewerSearchResult) {
    openResult(result);
    window.requestAnimationFrame(() => {
      mapSectionRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  }

  function backToMap() {
    mapSectionRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    if (selectedSeatId) centerSeatInMap(selectedSeatId);
    else if (activeResult?.seatIds.length) fitSeatIdsInMap(activeResult.seatIds);
  }

  const resultCountLabel = searchResults.results.length === 1 ? "1 result" : `${searchResults.results.length} results`;
  const mapAnnouncement = selectedResultTitle
    ? `${selectedResultTitle} selected on the published map.`
    : searchActive
      ? `${resultCountLabel} for ${search}.`
      : `${publishedSeats.length} published seats loaded.`;

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f5f4f1] text-slate-950">
      <main className="mx-auto flex min-h-screen w-full max-w-[1760px] flex-col gap-3 px-3 py-3 sm:px-5 lg:px-6">
        <header className="rounded-[22px] border border-slate-200/80 bg-white/90 px-4 py-4 shadow-[0_18px_50px_rgba(15,23,42,0.08),inset_0_1px_0_rgba(255,255,255,0.9)] sm:px-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-black leading-tight tracking-normal text-slate-950 sm:text-3xl">Office Seat Finder</h1>
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-200">Published</span>
                <span className="rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-slate-600 ring-1 ring-slate-200">Read-only</span>
              </div>
              <p className="mt-1 max-w-2xl text-sm font-semibold leading-6 text-slate-500">
                Published seating across people, seats, departments, and zones.
              </p>
            </div>
            <dl className="grid grid-cols-3 gap-2 text-center sm:w-[24rem]">
              {[
                ["Assigned", assignedCount],
                ["Open", openCount],
                ["Reserved", reservedCount]
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-2">
                  <dt className="text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</dt>
                  <dd className="mt-0.5 text-xl font-black text-slate-950">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="mt-4">
            <label htmlFor="viewer-seat-search" className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
              Search published seating
            </label>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <div className="relative min-w-0 flex-1">
                <input
                  id="viewer-seat-search"
                  value={search}
                  onChange={event => updateSearch(event.target.value)}
                  placeholder="Search people, seats, departments, or zones"
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 pr-12 text-base font-semibold text-slate-950 shadow-[0_1px_2px_rgba(15,23,42,0.05)] outline-none transition placeholder:text-slate-400 focus:border-orange-300 focus:ring-4 focus:ring-orange-100"
                />
                {search && (
                  <button
                    type="button"
                    onClick={clearSearch}
                    aria-label="Clear viewer search"
                    title="Clear search"
                    className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-sm font-black text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-100"
                  >
                    x
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => searchResults.resultSeatIds.length > 0 && fitSeatIdsInMap(searchResults.resultSeatIds)}
                disabled={!searchResults.resultSeatIds.length}
                className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-slate-200 bg-slate-950 px-4 text-sm font-black text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-100"
              >
                Show on map
              </button>
            </div>
            <p className="sr-only" aria-live="polite">{mapAnnouncement}</p>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_390px]">
          <section
            ref={mapSectionRef}
            aria-labelledby="published-map-title"
            className="order-2 min-w-0 overflow-hidden rounded-[22px] border border-slate-200/80 bg-white/90 p-2 shadow-[0_18px_50px_rgba(15,23,42,0.08)] lg:order-1 lg:min-h-0"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 px-2 py-2">
              <div className="min-w-0">
                <h2 id="published-map-title" className="text-sm font-black text-slate-950">Published map</h2>
                <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">
                  {searchActive ? `${resultCountLabel} · ${searchResults.resultSeatIds.length} mapped` : `${publishedSeats.length} seats`}
                </p>
              </div>
              {(searchActive || selectedSeat || activeResult) && (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-100"
                >
                  Reset
                </button>
              )}
            </div>

            <div
              ref={mapViewportRef}
              tabIndex={0}
              aria-label="Published office seat map. Seat markers are read-only buttons."
              className="relative mx-auto h-[56svh] min-h-[390px] w-full max-w-full overflow-auto overscroll-contain rounded-[18px] bg-[#f6f4f1] shadow-[inset_0_0_0_1px_rgba(71,85,105,0.22),inset_0_1px_0_rgba(255,255,255,0.92)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-100 lg:h-[calc(100vh-244px)] lg:min-h-[520px]"
            >
              <div ref={mapRef} className="relative mx-auto w-[1040px] max-w-none sm:w-[1340px] lg:w-full lg:max-w-[1911px]">
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
                    const inSearchResults = highlightedSeatIdSet.has(seat.id);
                    const dimmed = searchActive && highlightedSeatIdSet.size > 0 && !inSearchResults && selectedSeatId !== seat.id;

                    return (
                      <SeatMarker
                        key={seat.id}
                        seat={seat}
                        selected={seat.id === selectedSeatId}
                        dimmed={dimmed}
                        canEdit={false}
                        showNames={false}
                        searchResult={searchActive && inSearchResults}
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
            </div>
          </section>

          <aside className="order-1 flex min-w-0 flex-col gap-3 lg:order-2 lg:min-h-0">
            <section aria-labelledby="viewer-results-title" className="rounded-[22px] border border-slate-200/80 bg-white/90 p-3 shadow-[0_18px_50px_rgba(15,23,42,0.08)] lg:min-h-0">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 id="viewer-results-title" className="text-sm font-black text-slate-950">Results</h2>
                  <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">
                    {searchActive ? resultCountLabel : "Ready"}
                  </p>
                </div>
                {searchActive && (
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-slate-500">
                    {searchResults.resultSeatIds.length} mapped
                  </span>
                )}
              </div>

              {!searchActive ? (
                <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-3">
                  <div className="text-sm font-black text-slate-900">Published directory</div>
                  <div className="mt-3 space-y-3">
                    {quickDepartments.length > 0 && (
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-wide text-slate-500">Departments</div>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {quickDepartments.map(value => (
                            <button key={value} type="button" onClick={() => updateSearch(value)} className="rounded-full bg-white px-2.5 py-1.5 text-[11px] font-black text-slate-700 ring-1 ring-slate-200 transition hover:bg-orange-50 hover:text-brand-dark focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-100">
                              {value}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {quickZones.length > 0 && (
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-wide text-slate-500">Zones</div>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {quickZones.map(value => (
                            <button key={value} type="button" onClick={() => updateSearch(value)} className="rounded-full bg-white px-2.5 py-1.5 text-[11px] font-black text-slate-700 ring-1 ring-slate-200 transition hover:bg-orange-50 hover:text-brand-dark focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-100">
                              {value}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : searchResults.results.length > 0 ? (
                <div role="list" aria-label="Viewer search results" className="mt-3 max-h-[36svh] space-y-2 overflow-auto pr-1 lg:max-h-[32vh]">
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
                        onClick={() => openResultAndMap(result)}
                        className={cx(
                          "grid w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-3 rounded-2xl border p-3 text-left transition hover:border-orange-200 hover:bg-orange-50/45 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-100 disabled:cursor-not-allowed disabled:opacity-60",
                          selected ? "border-orange-300 bg-orange-50/80 ring-2 ring-orange-100" : "border-slate-200 bg-white"
                        )}
                      >
                        <span className="min-w-0">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="truncate text-sm font-black text-slate-950">{result.title}</span>
                            <span className={cx("shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ring-1", resultKindClass(result.kind))}>
                              {KIND_LABELS[result.kind]}
                            </span>
                          </span>
                          <span className="mt-1 block truncate text-xs font-bold text-slate-700">{result.subtitle}</span>
                          <span className="mt-0.5 block truncate text-[11px] font-semibold text-slate-500">{result.meta}</span>
                        </span>
                        <span className="shrink-0 rounded-full bg-slate-50 px-2 py-1 text-[10px] font-black text-slate-500 ring-1 ring-slate-200">
                          {result.seatIds.length || "-"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div role="status" aria-live="polite" className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-4">
                  <div className="text-sm font-black text-slate-900">No results for {search.trim()}</div>
                  <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
                    No matching published people, seats, departments, or zones.
                  </p>
                  <button type="button" onClick={clearSearch} className="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-100">
                    Clear search
                  </button>
                </div>
              )}
            </section>

            <section aria-labelledby="viewer-detail-title" className="rounded-[22px] border border-slate-200/80 bg-white/90 p-3 shadow-[0_18px_50px_rgba(15,23,42,0.08)] lg:min-h-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Selected detail</div>
                  <h2 id="viewer-detail-title" className="mt-1 truncate text-xl font-black text-slate-950">
                    {selectedSeat ? selectedSeat.label : activeResult ? activeResult.title : "Nothing selected"}
                  </h2>
                </div>
                {(selectedSeat || activeResult) && (
                  <button type="button" onClick={backToMap} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-100">
                    Back to map
                  </button>
                )}
              </div>

              {selectedSeat ? (
                <div className="mt-3 space-y-2">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-lg font-black text-slate-950">{getSeatPerson(selectedSeat)}</div>
                        <div className="mt-1 truncate text-sm font-semibold text-slate-500">{getSeatDepartment(selectedSeat)}</div>
                      </div>
                      <span className={cx("shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ring-1", statusClass(selectedSeat.status))}>
                        {STATUS_LABELS[selectedSeat.status]}
                      </span>
                    </div>
                  </div>
                  <dl className="grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-2xl border border-slate-200 bg-white p-3">
                      <dt className="text-[10px] font-black uppercase tracking-wide text-slate-500">Seat</dt>
                      <dd className="mt-1 truncate font-black text-slate-950">{selectedSeat.label}</dd>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-3">
                      <dt className="text-[10px] font-black uppercase tracking-wide text-slate-500">Zone</dt>
                      <dd className="mt-1 truncate font-black text-slate-950">{getSeatZone(selectedSeat)}</dd>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-3">
                      <dt className="text-[10px] font-black uppercase tracking-wide text-slate-500">Department</dt>
                      <dd className="mt-1 truncate font-black text-slate-950">{getSeatDepartment(selectedSeat)}</dd>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-3">
                      <dt className="text-[10px] font-black uppercase tracking-wide text-slate-500">Availability</dt>
                      <dd className="mt-1 truncate font-black text-slate-950">{STATUS_LABELS[selectedSeat.status]}</dd>
                    </div>
                  </dl>
                </div>
              ) : activeResult ? (
                <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                  <div className={cx("inline-flex rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-wide ring-1", resultKindClass(activeResult.kind))}>
                    {KIND_LABELS[activeResult.kind]}
                  </div>
                  <div className="mt-3 text-sm font-black text-slate-950">{activeResult.subtitle}</div>
                  <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">{activeResult.meta}</p>
                  {activeResult.seatIds.length > 0 && (
                    <button type="button" onClick={() => fitSeatIdsInMap(activeResult.seatIds)} className="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-100">
                      Fit mapped seats
                    </button>
                  )}
                </div>
              ) : (
                <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-4 text-sm font-semibold leading-6 text-slate-500">
                  No published seat is selected.
                </div>
              )}
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}
