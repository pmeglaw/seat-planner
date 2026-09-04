// Focused search scope (DECISIONS D1-d, PHASE2UX §1M.4, Phase 4 PR 3a): the
// field's trailing segment is "This floor" or "Whole building". Results are
// always computed building-wide; the scope decides which rows the palette
// lists, and the header ALWAYS carries both counts — zero included — so the
// building count is the widen affordance. Typing never changes the floor;
// opening a row on the other floor does (the surface handles that).

import type { FloorId } from "@/lib/floorIds";

export type SearchScope = "floor" | "building";

export const SEARCH_SCOPE_LABELS: Record<SearchScope, string> = {
  floor: "This floor",
  building: "Whole building"
};

type ScopedRow = { floor: FloorId | null };

export type ScopedResults<T extends ScopedRow> = {
  shown: T[];
  onFloor: number;
  inBuilding: number;
};

// A row with a null floor spans floors (a department across both, or a row
// with no live floor) — it belongs to every scope, so it counts on this floor.
export function scopeResults<T extends ScopedRow>(results: readonly T[], currentFloor: FloorId, scope: SearchScope): ScopedResults<T> {
  const onFloorRows = results.filter(row => row.floor === null || row.floor === currentFloor);
  return {
    shown: scope === "floor" ? onFloorRows : [...results],
    onFloor: onFloorRows.length,
    inBuilding: results.length
  };
}

export function resultsHeader(counts: { onFloor: number; inBuilding: number }): string {
  return `Results · ${counts.onFloor} on this floor · ${counts.inBuilding} in building`;
}

export type ZeroState = {
  title: string;
  counts: string;
  // Widen is offered only when the other scope has hits; otherwise Clear search.
  action: "widen" | "clear";
};

export function zeroState(query: string, counts: { onFloor: number; inBuilding: number }, scope: SearchScope): ZeroState {
  const widen = scope === "floor" && counts.inBuilding > 0;
  return {
    title: `No results for “${query}”${scope === "floor" ? " on this floor" : ""}`,
    counts: `${counts.onFloor} on this floor · ${counts.inBuilding} in building`,
    action: widen ? "widen" : "clear"
  };
}
