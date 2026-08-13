import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Why this is a SOURCE test: SeatMap cannot be mounted in jsdom (see the
// test-tiers skill), so its internal contracts are pinned by reading the
// component's source text instead of rendering and pressing keys.
//
// The contract this protects: SeatMap's Esc key ladder peels one layer of UI
// state per press, and its last rung clears the "structured filters" layer —
// department, position, zone, AND status. The admin map open-coded that rung
// as three setters (department/zone/status) and forgot position, so an admin
// who filtered by Position alone got a dead-looking Esc key, and one who also
// had Department set got a filter that silently stayed pinned after Esc
// reported the layer cleared. The viewer twin (ViewerSeatFinder.tsx) hit and
// fixed the identical bug first by calling the shared
// `clearStructuredFilters()` instead of hand-listing facets — this test pins
// that the admin map now does the same, so a future fifth facet can't
// reintroduce the gap.

const readSeatMap = () => readFile(new URL("../components/seat-map/SeatMap.tsx", import.meta.url), "utf8");

function readEscapeHandler(source) {
  const start = source.indexOf("function handleEscape");
  assert.ok(start !== -1, "handleEscape should remain source-visible as a named function.");
  const end = source.indexOf('window.addEventListener("keydown", handleEscape)', start);
  assert.ok(end !== -1, "handleEscape should still be wired up via window.addEventListener.");
  return source.slice(start, end);
}

test("the Esc handler's filter rung uses structuredFiltersActive + clearStructuredFilters", async () => {
  const handler = readEscapeHandler(await readSeatMap());

  assert.match(handler, /structuredFiltersActive/, "the filter rung should gate on the shared structuredFiltersActive flag (it counts position too).");
  assert.match(handler, /clearStructuredFilters\(\)/, "the filter rung should call the shared clearStructuredFilters(), not hand-written setters.");
});

test("the open-coded department/zone/status trio is gone from the Esc handler", async () => {
  const handler = readEscapeHandler(await readSeatMap());

  // These setters legitimately exist elsewhere in the file (e.g. chip
  // removal), so the assertion is scoped to the handler's own text only.
  assert.doesNotMatch(handler, /setDepartment\("all"\)/, 'the handler must not open-code setDepartment("all") — that left position unaffected.');
  assert.doesNotMatch(handler, /setZone\("all"\)/, 'the handler must not open-code setZone("all") — that left position unaffected.');
  assert.doesNotMatch(handler, /setStatus\("all"\)/, 'the handler must not open-code setStatus("all") — that left position unaffected.');
});
