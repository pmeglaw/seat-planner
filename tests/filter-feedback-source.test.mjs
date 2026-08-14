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

  const viewer = await readSource("../components/seat-map/ViewerSeatFinder.tsx");
  assert.match(viewer, /matchSummary=\{`\$\{statusCountSeats\.length\} of \$\{publishedSeats\.length\} seats match`\}/);

  const seatMap = await readSource("../components/seat-map/SeatMap.tsx");
  assert.match(seatMap, /matchSummary=\{`\$\{legendSourceSeats\.length\} of \$\{localSeats\.length\} seats match`\}/);
});

test("legend counts follow the active constraints instead of contradicting the map", async () => {
  const viewer = await readSource("../components/seat-map/ViewerSeatFinder.tsx");
  assert.match(viewer, /structuredFiltersActive \? publishedSeats\.filter\(seatPassesStructuredFilters\) : publishedSeats/);

  const seatMap = await readSource("../components/seat-map/SeatMap.tsx");
  assert.match(seatMap, /filtersActive \? localSeats\.filter\(matchesFilters\) : localSeats/);
});

test("active filter chips sit with the trigger's corner, not across the map", async () => {
  const viewer = await readSource("../components/seat-map/ViewerSeatFinder.tsx");
  assert.doesNotMatch(viewer, /<ActiveFilterChips[^/]*className="ml-auto"/);

  // Admin chips move out of the right-aligned action cluster into the left
  // canvas group beside the floor pill (the crumb label itself was removed,
  // owner call 2026-08-14 — the anchor is the floor selector wrapper now).
  const seatMap = await readSource("../components/seat-map/SeatMap.tsx");
  // The crumb must stay gone entirely (owner call 2026-08-14) — the floor
  // selector is the map's whole document identity.
  assert.doesNotMatch(seatMap, /\bmapCrumbLabel\b/);
  assert.match(seatMap, /<FloorSelector floor=\{floor\} onChange=\{setFloor\} \/>\s*\r?\n\s*<\/div>\s*\r?\n\s*<ActiveFilterChips/);
});
