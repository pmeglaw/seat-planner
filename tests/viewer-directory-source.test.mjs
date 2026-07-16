import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

// People directory guardrails (2026-07-16 regrade, review 5): the viewer's
// idle right slot hosts the directory. These pin the safety properties —
// snapshot-only data, existing selection path, slot precedence, and the
// hover highlight staying render-only (INV-2) — not the panel's styling.

test("the People directory fills the idle right slot without touching the search handoff", async () => {
  const source = await readFile(new URL("../components/seat-map/ViewerSeatFinder.tsx", import.meta.url), "utf8");

  // Built from the shared snapshot-derived builder, not an ad-hoc list.
  assert.match(source, /buildViewerDirectory\(\{ seats: publishedSeats, employees \}\)/);
  // Idle only: search results and the inspector always win the slot.
  assert.match(source, /const directoryOpen = directoryHydrated && !searchActive && !selectedSeat && !directoryCollapsed/);
  // Rows activate through the one existing selection path (explicit click —
  // INV-2 holds by construction).
  assert.match(source, /onClick=\{\(\) => openResult\(row\)\}/);
  // Collapse is a persisted preference, like the admin names toggle.
  assert.match(source, /VIEWER_DIRECTORY_COLLAPSED_STORAGE_KEY/);
  assert.match(source, /window\.localStorage\.setItem\(VIEWER_DIRECTORY_COLLAPSED_STORAGE_KEY/);
  // Hover-locate is render-only: it feeds the marker highlight prop and never
  // selects, centers, or scrolls.
  assert.match(source, /directoryHoverSeatId/);
  assert.match(source, /highlighted=\{activeResultSeatIdSet\.has\(seat\.id\) \|\| \(directoryOpen && seat\.id === directoryHoverSeatId\)\}/);
});
