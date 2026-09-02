import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

// Filter feedback consolidation (2026-07-16 regrade, review 4): the filter's
// feedback used to scatter into three corners while the legend kept showing
// unfiltered counts that contradicted the filtered map.

async function readSource(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

test("the filter popover states its live match count before you commit", async () => {
  const panel = await readSource("../components/seat-map/FilterPanel.tsx");
  assert.match(panel, /matchSummary/);
  assert.match(panel, /aria-live="polite"[^>]*>\s*\r?\n\s*\{matchSummary\}/);

  // Viewer only: the admin canvas filter UI was removed 2026-08-20 (owner) —
  // SeatMap no longer mounts FilterPanel, so search is its only constraint.
  const viewer = await readSource("../components/seat-map/ViewerSeatFinder.tsx");
  // Multi-floor PR-2 (Q5): the line is composed by lib/floors
  // floorDepartmentSummary — "N of M seats on Floor 3 match", the cross-floor
  // "… · N people in X are on Floor 2" variant, or the roster floor's people
  // count — so it stays a lib-tested string.
  assert.match(viewer, /matchSummary=\{departmentSummary\.text\}/);
  assert.match(viewer, /matchSummaryAction=\{/);

  const seatMap = await readSource("../components/seat-map/SeatMap.tsx");
  assert.doesNotMatch(seatMap, /<FilterPanel/);
  assert.doesNotMatch(seatMap, /<DeptChipRow/);
});

test("legend counts follow the active constraints instead of contradicting the map", async () => {
  const viewer = await readSource("../components/seat-map/ViewerSeatFinder.tsx");
  // Per floor since multi-floor PR-2: the legend describes the floor on the
  // canvas, filtered or not.
  assert.match(viewer, /structuredFiltersActive \? floorSeats\.filter\(seatPassesStructuredFilters\) : floorSeats/);

  const seatMap = await readSource("../components/seat-map/SeatMap.tsx");
  assert.match(seatMap, /filtersActive \? localSeats\.filter\(matchesFilters\) : localSeats/);
});

test("active filter chips sit with the trigger's corner, not across the map", async () => {
  const viewer = await readSource("../components/seat-map/ViewerSeatFinder.tsx");
  assert.doesNotMatch(viewer, /<ActiveFilterChips[^/]*className="ml-auto"/);

  const seatMap = await readSource("../components/seat-map/SeatMap.tsx");
  // The crumb must stay gone entirely (owner call 2026-08-14) — the floor
  // selector is the map's whole document identity. Admin active-filter chips
  // are gone with the rest of the canvas filter UI (owner call 2026-08-20).
  assert.doesNotMatch(seatMap, /\bmapCrumbLabel\b/);
  assert.doesNotMatch(seatMap, /<ActiveFilterChips/);
});
