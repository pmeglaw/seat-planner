import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

// v12 slice 7 — the Carbon-for-AI treatment for Ask Planner.
//
// These are guardrails, not a styling freeze. Carbon for AI makes two demands
// that protect users rather than decorate: an AI surface must DISCLOSE what it
// read, that it cannot write, and how confident it is; and the AI visual
// language must stay exclusive to AI presence, so a blue aura never comes to
// mean anything else. Colors, spacing and copy wording stay free to evolve —
// the disclosures and the confinement do not.

async function readSource(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

test("the answer carries an explainability disclosure: sources, read-only, confidence", async () => {
  const source = await readSource("../components/seat-map/AskPlannerDrawer.tsx");

  // Required by handoff contract #9 — the three claims a reader needs in order
  // to weigh an AI answer at all.
  assert.match(source, /Sources/, "the disclosure must label the data it read");
  assert.match(source, /draft/i, "the disclosure must name the draft layer as its source");
  assert.match(source, /cannot (modify|change)/i, "the disclosure must state it cannot write");
  assert.match(source, /confidence/i, "the disclosure must state a confidence level");
});

test("the explainability disclosure is keyboard-reachable, not a hover tooltip", async () => {
  const source = await readSource("../components/seat-map/AskPlannerDrawer.tsx");

  // A pointer-only reveal would put a REQUIRED disclosure out of reach of
  // keyboard and touch users.
  assert.match(source, /aria-expanded=\{[^}]*explain/i, "the AI toggle must expose its expanded state");
  assert.match(source, /aria-controls="ask-planner-explain"/, "the toggle must point at the panel it reveals");
  assert.match(source, /id="ask-planner-explain"/, "the disclosure panel must carry the controlled id");
});

test("no AI token touches the seat pill — the planner highlight is the search-hit state", async () => {
  const markerSource = await readSource("../components/seat-map/SeatMarker.tsx");

  // Phase 3 (PHASE3DS §1.16, §1.18): Carbon for AI is the drawer's label +
  // border only. On the map, "Ask Planner chose this seat" renders as the
  // search-hit pill with the accessible name saying who highlighted it — the
  // AI visual language stays exclusive to the AI surface, and no aura, ring
  // or halo ever reaches a marker.
  assert.equal((markerSource.match(/--sp-ai-|shadow-marker-ai|aura|halo/g) ?? []).length, 0,
    "the seat marker must not consume the AI token family");
  assert.match(markerSource, /const plannerHighlighted = highlighted && !activeMarker;/);
  assert.match(markerSource, /const hit = \(searchProminent \|\| plannerHighlighted\) && !origin && !target && !invalidTarget;/);
  assert.match(markerSource, /hit \? "sp-pill--search"/);
  assert.match(markerSource, /highlightedDescription = "Highlighted by Ask Planner"/);
});

test("the map's AI emphasis only engages while seats are actually highlighted", async () => {
  const seatMapSource = await readSource("../components/seat-map/SeatMap.tsx");

  // Dimming every other seat and desaturating the floor plan is a heavy,
  // whole-map state: it must follow a live highlight set and never latch on.
  assert.match(seatMapSource, /plannerHighlightedSeatIds\.length > 0/,
    "AI emphasis must derive from a non-empty highlight set");
  assert.match(seatMapSource, /plannerHighlightedSeatIds\.length > 0 \? "map-raster-dim"/,
    "the floor-plan raster dim class engages only while AI highlights are live");

  // The dim itself lives in CSS so the dark lightbox filter can restate it —
  // `filter` is one property, so an inline saturate() would erase the invert.
  // The light dim rule lives in globals.css; the dark variants (the lightbox
  // chain with the dim folded in) sit in the Phase 4 bridge until PR 3
  // rebuilds the raster — read both.
  const globalsSource =
    (await readSource("../app/globals.css")) + (await readSource("../app/styles/phase4-bridge.css"));
  const dimRules = globalsSource.match(/\.map-raster-dim\s*{[^}]*saturate\([^}]*}/g) ?? [];
  assert.ok(dimRules.length >= 2,
    "globals.css must define .map-raster-dim saturate rules for BOTH themes (light + dark restatement)");
});

// The AI highlight chip retired with PR 3a: the control row's Ask Planner
// button carries the highlight count (D1-c re-entry point) and the drawer's
// "Clear highlights" is the labelled way out of the AI state.
test("the control row's Ask Planner button is the labelled re-entry point while highlights exist", async () => {
  const rowSource = await readSource("../components/seat-map/MapControlRow.tsx");
  assert.match(rowSource, /`Open Ask Planner AI, \$\{draft\.askPlanner\.count\} seats highlighted`/);
  const drawerSource = await readSource("../components/seat-map/AskPlannerDrawer.tsx");
  assert.match(drawerSource, /Clear highlighted seats|Clear highlights/);
});

test("viewer isolation holds: no Ask Planner, no AI language on the viewer map", async () => {
  const viewerSource = await readSource("../components/seat-map/ViewerSeatFinder.tsx");

  // Ask Planner is admin-only (do-not-touch #2). accessibility-source pins the
  // token; this adds the component and the state name, so a future "just reuse
  // the aura" copy-paste trips here first.
  assert.doesNotMatch(viewerSource, /AskPlanner/, "the viewer must not reference Ask Planner");
  assert.doesNotMatch(viewerSource, /AiHighlightChip/, "the viewer must not render the AI chip");
  assert.doesNotMatch(viewerSource, /--sp-ai-/, "the viewer must not borrow the AI token family");
});
