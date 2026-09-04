"use client";

// Filter/search state extracted from SeatMap.tsx (R-02a / M4 step 4 —
// extraction only, no behavior change). The hook owns the filter VALUES
// (search text + the structured department/position/zone/status selects),
// everything derived from them (active-chip list, matching seats, result
// cards, status breakdown), and their clear/change handlers. Deliberately
// NOT here: `filterCollapsed` (panel visibility chrome, whose outside-click
// effect is tied to DOM refs in SeatMap) and the viewer's `hoverZone` (a wash
// preview that is never a filter — it lives in ViewerSeatFinder; the admin
// map's copy was removed as dead code once #432 took the zone chips away).

import { useCallback, useMemo, useState } from "react";
import type { FloorId } from "@/lib/floorIds";
import {
  hasActiveConstraints,
  seatMatchesFilters,
  structuredFilterCount as countStructuredFilters,
  type SeatFilterCriteria
} from "@/lib/seatFilters";
import { STATUS_LABELS } from "@/lib/types";
import type { Employee, SeatStatus, SeatWithEmployee } from "@/lib/types";
import { searchHandsPanelToResults } from "@/lib/viewerSeatSearch";

export function getSeatZone(seat: SeatWithEmployee) {
  return seat.zone ?? seat.department ?? "";
}

// The applied constraints as chips — kept for the standalone jsdom harness's
// assertions; the shipped surfaces show the count in the control row and the
// groups in the shell's left panel (PR 3a).
export type ActiveFilterChip = { id: string; label: string; value: string; removeLabel: string };
export type ResultStatusBreakdown = Record<SeatStatus, number>;

export function useSeatFilters({
  localSeats,
  localEmployees,
  floor,
  selectedSeatId,
  inspectorDirty,
  setInspectorCollapsed
}: {
  localSeats: SeatWithEmployee[];
  localEmployees: Employee[];
  /** The canvas floor (multi-floor PR-3). Search and matching span the whole
   *  building — `localSeats` stays building-wide — and a card on another
   *  floor carries that floor's tag so the row says where it leads. */
  floor: FloorId;
  selectedSeatId: string | null;
  inspectorDirty: boolean;
  setInspectorCollapsed: (collapsed: boolean) => void;
}) {
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("all");
  const [position, setPosition] = useState("all");
  const [zone, setZone] = useState("all");
  const [status, setStatus] = useState("all");

  const filterCriteria: SeatFilterCriteria = { search, department, position, zone, status };
  // One source for "is anything narrowing the map?". The legend and the result
  // list used to derive this separately and agreed only by coincidence.
  const filtersActive = hasActiveConstraints(filterCriteria);
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

  // Kept as a local binding so every call site here reads the same, and so the
  // predicate itself stays one tested definition in lib/seatFilters.ts.
  function matchesFilters(seat: SeatWithEmployee) {
    return seatMatchesFilters(seat, filterCriteria);
  }

  const matchingSeats = filtersActive ? localSeats.filter(seat => matchesFilters(seat)) : localSeats;
  const resultStatusBreakdown = useMemo<ResultStatusBreakdown>(() => ({
    available: matchingSeats.filter(seat => seat.status === "available").length,
    assigned: matchingSeats.filter(seat => seat.status === "assigned").length,
    reserved: matchingSeats.filter(seat => seat.status === "reserved").length,
    unavailable: matchingSeats.filter(seat => seat.status === "unavailable").length
  }), [matchingSeats]);
  // Memoized: this sits in SeatMap's Esc-effect dependency array, and an
  // unstable identity there would tear down and re-add the window keydown
  // listener on every render. The empty dep array is safe because useState
  // setters are identity-stable across renders.
  const clearStructuredFilters = useCallback(() => {
    setDepartment("all");
    setPosition("all");
    setZone("all");
    setStatus("all");
  }, []);

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

  return {
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
    filtersActive,
    searchQuery,
    searchActive,
    structuredFiltersActive,
    activeFilterChips,
    structuredFilterCount,
    activeFilterCount,
    matchingSeats,
    resultStatusBreakdown,
    matchesFilters,
    clearStructuredFilters,
    clearAllConstraints,
    clearSearch,
    handleSearchInputChange,
    removeActiveFilterChip
  };
}
