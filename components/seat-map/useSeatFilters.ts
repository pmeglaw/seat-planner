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
import type { ActiveFilterChip, ResultStatusBreakdown } from "@/components/seat-map/FilterPanel";
import type { AdminResultCard } from "@/components/seat-map/ResultsPanel";
import { floorOf, type FloorId } from "@/lib/floorIds";
import { FLOORS, rosterFloorForUnseated } from "@/lib/floors";
import { formatDisplayName, formatSeatCode } from "@/lib/formatName";
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
  // Merged result cards: one card per entity (F1) — an assigned seat and its occupant
  // are one card, never two rows. Unassigned people matching a text search appear as
  // disabled cards so the person is findable without fabricating a seat.
  const panelResults = useMemo<AdminResultCard[]>(() => {
    const statusRank: Record<SeatStatus, number> = { assigned: 0, available: 1, reserved: 2, unavailable: 3 };
    const floorTagFor = (seatFloor: FloorId) => (seatFloor === floor ? null : FLOORS[seatFloor].tag);
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
            status: seat.status,
            floorTag: floorTagFor(floorOf(seat))
          };
        }
        return {
          key: `seat-${seat.id}`,
          seatId: seat.id,
          title: formatSeatCode(seat.label),
          subtitle: [seat.status === "available" ? "Open seat" : STATUS_LABELS[seat.status], zoneLabel].join(" · "),
          status: seat.status,
          floorTag: floorTagFor(floorOf(seat))
        };
      });
    if (!searchQuery) return seatCards.slice(0, 60);
    const needle = searchQuery.toLowerCase();
    const assignedEmployeeIds = new Set(localSeats.map(seat => seat.employee_id).filter(Boolean));
    // Where an unseated person works (lib/floors interim rule, from the DRAFT
    // rows this editor holds). While one floor is not live the card is
    // openable — it leads to that floor's roster row; once the rule retires
    // (every floor live) there is nowhere to go and the card stays inert.
    const unseatedFloor = rosterFloorForUnseated(localSeats);
    const unassignedPeople = localEmployees
      .filter(employee => !assignedEmployeeIds.has(employee.id))
      .filter(employee => [employee.full_name, employee.position, employee.department, employee.phone_extension].filter(Boolean).join(" ").toLowerCase().includes(needle))
      .map(employee => ({
        key: `person-${employee.id}`,
        seatId: null,
        employeeId: employee.id,
        title: formatDisplayName(employee.full_name),
        subtitle: [employee.position, employee.department, "Unassigned"].filter(Boolean).join(" · "),
        status: null,
        floorTag: unseatedFloor ? floorTagFor(unseatedFloor) : null,
        disabled: unseatedFloor === null
      }));
    return [...seatCards, ...unassignedPeople].slice(0, 60);
  }, [floor, localEmployees, localSeats, matchingSeats, searchQuery]);

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
    panelResults,
    matchesFilters,
    clearStructuredFilters,
    clearAllConstraints,
    clearSearch,
    handleSearchInputChange,
    removeActiveFilterChip
  };
}
