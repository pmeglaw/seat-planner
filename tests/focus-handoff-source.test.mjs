import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

// Focus never falls to <body> when the control that held it unmounts
// (2026-07-16 detail critique, action 5). These pin the handoffs; the visual
// styling of the targets is free to evolve.

async function readSource(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

test("inspector commit bar hands focus to the pinned primary action when the editor closes", async () => {
  const source = await readSource("../components/seat-map/SeatInspector.tsx");

  assert.match(source, /function focusPrimaryActionSoon\(\)/);
  assert.match(source, /primaryActionRef/);
  // Cancel (both non-closing branches) and the save-success path all hand off.
  const handoffs = source.match(/focusPrimaryActionSoon\(\);/g) ?? [];
  assert.ok(handoffs.length >= 3, `expected >=3 focusPrimaryActionSoon() call sites, saw ${handoffs.length}`);
});

test("inspector collapse/expand hands focus across the transition — but only for explicit toggles", async () => {
  const source = await readSource("../components/seat-map/SeatInspector.tsx");

  // Explicit toggle clicks set a flag; the auto-collapse-on-search path sets
  // none, so typing in search never loses focus to the rail.
  assert.match(source, /focusRailAfterCollapseRef/);
  assert.match(source, /focusPanelAfterExpandRef/);
  assert.match(source, /collapseRailRef/);
});

test("Escape-deselect restores focus to the seat marker on both surfaces", async () => {
  const seatMap = await readSource("../components/seat-map/SeatMap.tsx");
  assert.match(seatMap, /focusSeatMarker\(escDeselectSeatId\)/);

  const viewer = await readSource("../components/seat-map/ViewerSeatFinder.tsx");
  assert.match(viewer, /function focusViewerSeatMarker/);
  const viewerRestores = viewer.match(/focusViewerSeatMarker\(/g) ?? [];
  assert.ok(viewerRestores.length >= 3, `expected the helper + Escape + Close call sites, saw ${viewerRestores.length}`);
});

test("Esc-clear from inside a results panel returns focus to the search input", async () => {
  const seatMap = await readSource("../components/seat-map/SeatMap.tsx");
  assert.match(seatMap, /closest\('\[aria-label="Admin search results"\]'\)/);

  const viewer = await readSource("../components/seat-map/ViewerSeatFinder.tsx");
  assert.match(viewer, /closest\('\[aria-label="Viewer search results"\]'\)/);
});
