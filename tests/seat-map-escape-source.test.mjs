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
  const slice = source.slice(start, end);
  // Strip comments before asserting: a comment can contain any token we
  // check for (e.g. this file's own fix commentary quotes
  // "clearStructuredFilters()" and "structuredFiltersActive"), which would
  // let these assertions pass on prose alone even if the real code regressed.
  return slice.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

test("the Esc handler's filter rung gates structuredFiltersActive on the SAME if-block that calls clearStructuredFilters", async () => {
  const handlerNoComments = readEscapeHandler(await readSeatMap());

  // One regex spanning condition -> call, not two independent assert.match
  // calls: two separate matches would still pass if the flag and the call
  // lived in unrelated branches, which is not the contract this test protects
  // (the filter rung must gate ON structuredFiltersActive and then clear via
  // the shared helper, in that one if-block).
  // The condition itself calls isEditableTarget(event.target), a nested
  // paren pair, so the search up to structuredFiltersActive must tolerate
  // parens ([\s\S]*?, non-greedy) — but the search from "{" to the call stays
  // paren-agnostic/brace-closed ([^}]*), so a clearStructuredFilters() in a
  // LATER, unrelated if-block still cannot satisfy this match.
  assert.match(
    handlerNoComments,
    /if \([\s\S]*?structuredFiltersActive\) \{[^}]*clearStructuredFilters\(\)/,
    "the filter rung should be one if-block: gate on the shared structuredFiltersActive flag (it counts position too), then call the shared clearStructuredFilters()."
  );
});

test("the open-coded department/zone/status trio is gone from the Esc handler", async () => {
  const handlerNoComments = readEscapeHandler(await readSeatMap());

  // These setters legitimately exist elsewhere in the file (e.g. chip
  // removal), so the assertion is scoped to the handler's own text only.
  assert.doesNotMatch(handlerNoComments, /setDepartment\("all"\)/, 'the handler must not open-code setDepartment("all") — that left position unaffected.');
  assert.doesNotMatch(handlerNoComments, /setZone\("all"\)/, 'the handler must not open-code setZone("all") — that left position unaffected.');
  assert.doesNotMatch(handlerNoComments, /setStatus\("all"\)/, 'the handler must not open-code setStatus("all") — that left position unaffected.');
});
