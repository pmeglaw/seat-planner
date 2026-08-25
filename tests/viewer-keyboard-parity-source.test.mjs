import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

// Viewer keyboard parity (2026-07-16 detail critique, action 6): the admin
// map had Ctrl/⌘+K with a platform-adaptive hint, arrow-key roving over
// result cards, and a keyboard legend — the viewer (the surface non-admin
// staff actually use) had none of the three.
//
// All three survive the v12 panel → Find palette move; two of them moved file.
// The roving handlers live in ViewerFindPalette because both of its lists do,
// and the legend is the palette's footer.

async function readViewer() {
  return readFile(new URL("../components/seat-map/ViewerSeatFinder.tsx", import.meta.url), "utf8");
}

async function readPalette() {
  return readFile(new URL("../components/seat-map/ViewerFindPalette.tsx", import.meta.url), "utf8");
}

test("the viewer search claims Ctrl/⌘+K and shows the platform hint", async () => {
  const source = await readViewer();

  assert.match(source, /handleSearchShortcut/);
  assert.match(source, /event\.metaKey \|\| event\.ctrlKey/);
  assert.match(source, /searchShortcutHint/);
  assert.match(source, /<kbd/);
  // The shortcut has to OPEN the palette, not just focus the field: focusing a
  // field whose surface stays shut is the same dead end as no shortcut.
  assert.match(source, /setPaletteOpen\(true\);\s*searchInputRef\.current\?\.focus\(\)/);
});

test("viewer palette rows rove with arrow keys and teach their keys", async () => {
  const palette = await readPalette();

  // Two handlers, because the palette has two lists with different mounting
  // rules: query mode renders every row (safe to walk the DOM), browse mode
  // is windowed (must step by absolute index — a DOM walk reads the first
  // RENDERED row as "first" and warps mid-list ArrowUp into the field).
  assert.match(palette, /function handleResultsKeyDown/);
  assert.match(palette, /function handleBrowseKeyDown/);
  assert.match(palette, /onKeyDown=\{handleResultsKeyDown\}/);
  assert.match(palette, /onKeyDown=\{handleBrowseKeyDown\}/);
  // ArrowUp off the first row returns to the search field the rows came from —
  // in both handlers, which is why the palette takes the input ref as a prop.
  assert.equal((palette.match(/searchInputRef\.current\?\.focus\(\)/g) ?? []).length, 2);
  // The footer legend, teaching the keys it actually honours. Esc now closes
  // the palette (contract #7 makes it the layer above the query), so the
  // legend says "closes" where the retired panel's said "clears" — and browse
  // mode drops "Enter opens" (P5), because the field's Enter handler is gated
  // on an active query.
  assert.match(palette, /↑↓ to move · Enter opens · Esc closes/);
  assert.match(palette, /↑↓ to move · Esc closes/);
});

// That legend is on screen while focus is still in the search input, so all
// three keys have to work from there. ↑↓ and Esc always did; Enter did not,
// leaving the panel advertising a key that did nothing until the user had
// first arrowed into the list.
test("the search input honours the three keys its legend promises", async () => {
  const source = await readViewer();

  // ↑: ArrowDown hops into whichever list the palette is showing, skipping
  // disabled rows (browse mode can open on an unseated person).
  assert.match(source, /if \(event\.key === "ArrowDown" && paletteOpen\)/);
  assert.match(source, /\[aria-label="Viewer search results"\] button:not\(\[disabled\]\), \[aria-label="People directory"\] button:not\(\[disabled\]\)/);

  // Enter opens the top result, through the one existing selection path,
  // exactly as a click does. An empty result set must not swallow the key.
  assert.match(source, /if \(event\.key === "Enter" && paletteOpen && searchActive\)/);
  assert.match(source, /const \[firstSearchResult\] = searchResults\.results;/);
  assert.match(source, /openResult\(firstSearchResult\)/);
  assert.match(source, /if \(!firstSearchResult\) return;/);

  // Esc closes the palette first and clears the query only on the next press —
  // the field's own handler owns those two layers so the keystroke is never
  // counted twice by the global one. preventDefault comes BEFORE the branch
  // split: a `type="search"` input clears itself on Escape natively, and that
  // clear fires an input event, which collapsed the two layers into one
  // keystroke and then re-opened the palette through updateSearch.
  assert.match(source, /event\.preventDefault\(\);\s*if \(paletteOpen\) \{\s*event\.stopPropagation\(\);\s*setPaletteOpen\(false\);/);
});
