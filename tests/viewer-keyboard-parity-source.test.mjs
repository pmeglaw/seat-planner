import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

// Viewer keyboard parity (2026-07-16 detail critique, action 6): the admin
// map had Ctrl/⌘+K with a platform-adaptive hint, arrow-key roving over
// result cards, and a keyboard legend — the viewer (the surface non-admin
// staff actually use) had none of the three.

test("the viewer search claims Ctrl/⌘+K and shows the platform hint", async () => {
  const source = await readFile(new URL("../components/seat-map/ViewerSeatFinder.tsx", import.meta.url), "utf8");

  assert.match(source, /handleSearchShortcut/);
  assert.match(source, /event\.metaKey \|\| event\.ctrlKey/);
  assert.match(source, /searchShortcutHint/);
  assert.match(source, /<kbd/);
});

test("viewer result cards rove with arrow keys and teach their keys", async () => {
  const source = await readFile(new URL("../components/seat-map/ViewerSeatFinder.tsx", import.meta.url), "utf8");

  assert.match(source, /function handleResultsKeyDown/);
  assert.match(source, /onKeyDown=\{handleResultsKeyDown\}/);
  // ArrowUp from the first card returns to the search input the cards came from.
  assert.match(source, /searchInputRef\.current\?\.focus\(\);/);
  // The same footer legend the admin panel shows.
  assert.match(source, /↑↓ to move · Enter opens · Esc clears/);
});
