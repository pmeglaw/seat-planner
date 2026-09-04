import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

// Filter feedback consolidation (2026-07-16 regrade, review 4): the filter's
// feedback used to scatter into three corners while the legend kept showing
// unfiltered counts that contradicted the filtered map. Since Phase 4 PR 3a
// the ONE home for the live match count is the control row (PHASE2UX §1M.3:
// "22 of 68 seats match" while search or filters narrow the map, "68 seats"
// otherwise), announced politely; the legend follows the same constraints.

async function readSource(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

test("the control row states the live match count, zero included, and announces it", async () => {
  const row = await readSource("../components/seat-map/MapControlRow.tsx");
  assert.match(row, /className="sp-control-count" aria-live=\{count\.live \? "polite" : undefined\} aria-atomic="true">\{count\.text\}/);

  const viewer = await readSource("../components/seat-map/ViewerSeatFinder.tsx");
  assert.match(viewer, /\$\{floorHighlightedCount\} of \$\{floorSeats\.length\} seats match/);
  assert.match(viewer, /count=\{\{ text: controlCountText, live: true \}\}/);
  // Multi-floor PR-2 (Q5): the cross-floor line is composed by lib/floors
  // floorDepartmentSummary and rides the band's note with its "Show Floor N"
  // action, and the left panel's note (PR 2).
  assert.match(viewer, /departmentSummary\.text/);
  assert.match(viewer, /noteAction=\{structuredFiltersActive && departmentSummaryAction/);

  const seatMap = await readSource("../components/seat-map/SeatMap.tsx");
  assert.match(seatMap, /\$\{floorMatchingSeats\.length\} of \$\{floorSeats\.length\} seats match/);
  assert.match(seatMap, /count=\{\{ text: controlCountText, live: true \}\}/);
  assert.doesNotMatch(seatMap, /<FilterPanel/);
  assert.doesNotMatch(seatMap, /<DeptChipRow/);
});

test("legend counts follow the active constraints instead of contradicting the map", async () => {
  const viewer = await readSource("../components/seat-map/ViewerSeatFinder.tsx");
  // Per floor since multi-floor PR-2: the legend describes the floor on the
  // canvas, filtered or not.
  assert.match(viewer, /structuredFiltersActive \? floorSeats\.filter\(seatPassesStructuredFilters\) : floorSeats/);

  const seatMap = await readSource("../components/seat-map/SeatMap.tsx");
  // Per floor since multi-floor PR-3, same as the viewer above.
  assert.match(seatMap, /filtersActive \? floorSeats\.filter\(matchesFilters\) : floorSeats/);
});

test("the applied-filter count and its Clear live in the row's split control, never as chips across the map", async () => {
  const row = await readSource("../components/seat-map/MapControlRow.tsx");
  assert.match(row, /Filters · \{filters\.appliedCount\}/);
  assert.match(row, /aria-label="Clear filters" onClick=\{filters\.onClear\}/);
  for (const file of ["../components/seat-map/ViewerSeatFinder.tsx", "../components/seat-map/SeatMap.tsx"]) {
    const source = await readSource(file);
    assert.doesNotMatch(source, /<ActiveFilterChips/);
    assert.doesNotMatch(source, /\bmapCrumbLabel\b/);
    assert.match(source, /appliedCount: structuredFilterCount/);
  }
});
