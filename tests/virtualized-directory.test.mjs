import assert from "node:assert/strict";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";
import { readFile } from "node:fs/promises";
import test from "node:test";
const { computeVirtualWindow, computeVirtualSegments, stepFocusIndex } = await importTsModule("lib/virtualizedList.ts");

test("small directories render entirely with no padding", () => {
  const window = computeVirtualWindow({
    itemCount: 12,
    columns: 2,
    rowHeight: 100,
    viewportHeight: 900,
    scrollOffset: 0,
    overscanRows: 4
  });

  assert.deepEqual(window, { startIndex: 0, endIndex: 12, topPadding: 0, bottomPadding: 0 });
});

test("mid-scroll windows slice on row boundaries and preserve scroll height", () => {
  const rowHeight = 100;
  const window = computeVirtualWindow({
    itemCount: 5000,
    columns: 2,
    rowHeight,
    viewportHeight: 800,
    scrollOffset: 100_000,
    overscanRows: 2
  });

  // firstVisibleRow=1000, visibleRowCount=9, overscan 2 → rows 998..1011.
  assert.equal(window.startIndex, 998 * 2);
  assert.equal(window.endIndex, 1011 * 2);
  assert.equal(window.topPadding, 998 * rowHeight);
  assert.equal(window.bottomPadding, (2500 - 1011) * rowHeight);
  // Rendered slice + paddings always reconstruct the full grid height.
  const renderedRows = (window.endIndex - window.startIndex) / 2;
  assert.equal(window.topPadding + renderedRows * rowHeight + window.bottomPadding, 2500 * rowHeight);
});

test("windows clamp at the end of the list", () => {
  const window = computeVirtualWindow({
    itemCount: 101,
    columns: 2,
    rowHeight: 100,
    viewportHeight: 600,
    scrollOffset: 1_000_000,
    overscanRows: 3
  });

  assert.equal(window.endIndex, 101);
  assert.equal(window.bottomPadding, 0);
  assert.ok(window.startIndex <= window.endIndex);
});

test("zero items and degenerate inputs stay safe", () => {
  assert.deepEqual(
    computeVirtualWindow({ itemCount: 0, columns: 2, rowHeight: 100, viewportHeight: 800, scrollOffset: 0 }),
    { startIndex: 0, endIndex: 0, topPadding: 0, bottomPadding: 0 }
  );
  const degenerate = computeVirtualWindow({ itemCount: 10, columns: 0, rowHeight: -5, viewportHeight: 0, scrollOffset: -50 });
  assert.equal(degenerate.startIndex, 0);
  assert.ok(degenerate.endIndex >= degenerate.startIndex);
});

// ---------------------------------------------------------------------------
// computeVirtualSegments — window expansion with the focused row kept mounted
// ---------------------------------------------------------------------------

function segmentHeightTotal(segments, rowHeight) {
  return segments.reduce((total, segment) => total + (segment.kind === "spacer" ? segment.height : rowHeight), 0);
}

test("segments without a pin mirror the window's spacer-rows-spacer shape", () => {
  const win = { startIndex: 10, endIndex: 20, topPadding: 1000, bottomPadding: 8000 };
  const segments = computeVirtualSegments({ window: win, itemCount: 100, rowHeight: 100, pinnedIndex: null });

  assert.deepEqual(segments[0], { kind: "spacer", height: 1000 });
  assert.deepEqual(segments.at(-1), { kind: "spacer", height: 8000 });
  const rows = segments.filter(segment => segment.kind === "row");
  assert.deepEqual(rows.map(row => row.index), [10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
  assert.ok(rows.every(row => !row.pinned));
  assert.equal(segmentHeightTotal(segments, 100), 100 * 100, "total height must be preserved");
});

test("a focused row above the window stays mounted at its true offset", () => {
  const win = { startIndex: 50, endIndex: 60, topPadding: 5000, bottomPadding: 4000 };
  const segments = computeVirtualSegments({ window: win, itemCount: 100, rowHeight: 100, pinnedIndex: 7 });

  // [7 rows worth of spacer][pinned row 7][42 rows worth of spacer][window rows][bottom]
  assert.deepEqual(segments[0], { kind: "spacer", height: 700 });
  assert.deepEqual(segments[1], { kind: "row", index: 7, pinned: true });
  assert.deepEqual(segments[2], { kind: "spacer", height: 4200 });
  assert.deepEqual(segments[3], { kind: "row", index: 50, pinned: false });
  assert.equal(segmentHeightTotal(segments, 100), 100 * 100);
});

test("a focused row below the window stays mounted at its true offset", () => {
  const win = { startIndex: 0, endIndex: 10, topPadding: 0, bottomPadding: 9000 };
  const segments = computeVirtualSegments({ window: win, itemCount: 100, rowHeight: 100, pinnedIndex: 95 });

  const pinnedPosition = segments.findIndex(segment => segment.kind === "row" && segment.pinned);
  assert.deepEqual(segments[pinnedPosition - 1], { kind: "spacer", height: (95 - 10) * 100 });
  assert.deepEqual(segments[pinnedPosition], { kind: "row", index: 95, pinned: true });
  assert.deepEqual(segments[pinnedPosition + 1], { kind: "spacer", height: 4 * 100 });
  assert.equal(segmentHeightTotal(segments, 100), 100 * 100);
});

test("a pin adjacent to the window edge emits no zero-height spacer", () => {
  const win = { startIndex: 5, endIndex: 10, topPadding: 500, bottomPadding: 0 };
  const segments = computeVirtualSegments({ window: win, itemCount: 10, rowHeight: 100, pinnedIndex: 4 });

  assert.deepEqual(segments[0], { kind: "spacer", height: 400 });
  assert.deepEqual(segments[1], { kind: "row", index: 4, pinned: true });
  // Row 4 abuts window row 5 directly — no spacer between them.
  assert.deepEqual(segments[2], { kind: "row", index: 5, pinned: false });
  assert.equal(segmentHeightTotal(segments, 100), 10 * 100);
});

test("an in-window or out-of-range pin renders as a plain window", () => {
  const win = { startIndex: 10, endIndex: 20, topPadding: 1000, bottomPadding: 8000 };
  for (const pinnedIndex of [10, 15, 19, -1, 100, 250]) {
    const segments = computeVirtualSegments({ window: win, itemCount: 100, rowHeight: 100, pinnedIndex });
    assert.ok(segments.every(segment => segment.kind === "spacer" || !segment.pinned), `pin ${pinnedIndex} must not add a pinned row`);
    assert.equal(segments.filter(segment => segment.kind === "row").length, 10);
    assert.equal(segmentHeightTotal(segments, 100), 100 * 100);
  }
});

// ---------------------------------------------------------------------------
// stepFocusIndex — absolute-index arrow navigation over windowed lists
// ---------------------------------------------------------------------------

test("stepFocusIndex moves by absolute index and clamps at the ends", () => {
  assert.equal(stepFocusIndex({ itemCount: 10, currentIndex: 4, direction: 1 }), 5);
  assert.equal(stepFocusIndex({ itemCount: 10, currentIndex: 4, direction: -1 }), 3);
  // Mid-list ArrowUp keeps walking upward — never a false "top of list", which
  // was the rendered-slice regression (first RENDERED row read as index 0).
  assert.equal(stepFocusIndex({ itemCount: 1000, currentIndex: 200, direction: -1 }), 199);
  assert.equal(stepFocusIndex({ itemCount: 10, currentIndex: 9, direction: 1 }), null);
  assert.equal(stepFocusIndex({ itemCount: 10, currentIndex: 0, direction: -1 }), null);
});

test("stepFocusIndex skips disabled rows in both directions", () => {
  const disabled = new Set([1, 2, 5]);
  const isDisabled = index => disabled.has(index);
  assert.equal(stepFocusIndex({ itemCount: 7, currentIndex: 0, direction: 1, isDisabled }), 3);
  assert.equal(stepFocusIndex({ itemCount: 7, currentIndex: 3, direction: -1, isDisabled }), 0);
  assert.equal(stepFocusIndex({ itemCount: 7, currentIndex: 4, direction: 1, isDisabled }), 6);
  // Nothing enabled above → null (viewer exits to the search input on this).
  assert.equal(stepFocusIndex({ itemCount: 7, currentIndex: 0, direction: -1, isDisabled }), null);
  assert.equal(stepFocusIndex({ itemCount: 3, currentIndex: 0, direction: 1, isDisabled: () => true }), null);
});

test("stepFocusIndex enters an unfocused list at the visible window, not row 0", () => {
  assert.equal(stepFocusIndex({ itemCount: 100, currentIndex: null, direction: 1, fallbackIndex: 40 }), 40);
  // ArrowUp with nothing focused leaves the list.
  assert.equal(stepFocusIndex({ itemCount: 100, currentIndex: null, direction: -1, fallbackIndex: 40 }), null);
  // Every row at/after the fallback disabled → scan back upward.
  const isDisabled = index => index >= 40;
  assert.equal(stepFocusIndex({ itemCount: 100, currentIndex: null, direction: 1, isDisabled, fallbackIndex: 40 }), 39);
  // Out-of-range current index is treated as unfocused.
  assert.equal(stepFocusIndex({ itemCount: 10, currentIndex: 42, direction: 1, fallbackIndex: 3 }), 3);
});

test("stepFocusIndex stays safe on empty and degenerate inputs", () => {
  assert.equal(stepFocusIndex({ itemCount: 0, currentIndex: null, direction: 1 }), null);
  assert.equal(stepFocusIndex({ itemCount: 0, currentIndex: 0, direction: -1 }), null);
  assert.equal(stepFocusIndex({ itemCount: 5, currentIndex: null, direction: 1, fallbackIndex: 99 }), 4);
  assert.equal(stepFocusIndex({ itemCount: 5, currentIndex: null, direction: 1, fallbackIndex: -3 }), 0);
});

test("management directory is windowed with an indexed seat lookup, look unchanged", async () => {
  const source = await readFile(new URL("../components/admin-management/AdminManagementPanel.tsx", import.meta.url), "utf8");

  assert.match(source, /from "@\/lib\/virtualizedList"/);
  assert.match(source, /computeVirtualWindow\(\{/);
  // Only the windowed slice renders; spacer + row segments preserve the page
  // scroll height. Padding lives in split spacers around any pinned row (not
  // a flat top/bottom pad), so a focused row keeps its true scroll offset
  // even after it scrolls out of the window.
  assert.match(source, /computeVirtualSegments\(\{/);
  assert.match(source, /employeeSegments\.map\(/);
  assert.match(source, /segment\.kind === "spacer"/);
  assert.match(source, /height: segment\.height/);
  // Directory rows are now table rows, not cards.
  assert.match(source, /data-directory-row/);
  // Pinned rows are marked so row-height measurement can exclude them (they
  // sit against a split spacer, not real neighbors) and so the focused row
  // can be identified in the DOM. An unmount-blur reports relatedTarget
  // null, so only a focusout that provably left the tbody may clear the pin.
  assert.match(source, /data-vpinned/);
  assert.match(source, /:not\(\[data-vpinned\]\)/);
  assert.match(source, /if \(next && !grid\.contains\(next\)\) setPinnedEmployeeIndex\(null\)/);
  // The directory is a real semantic table with a header and body.
  assert.match(source, /<table\b/);
  assert.match(source, /<thead>/);
  assert.match(source, /<tbody ref=\{employeeGridRef\}>/);
  // Sortable column headers expose sort state to assistive tech.
  assert.match(source, /aria-sort=\{isSorted \?/);
  assert.match(source, /onClick=\{\(\) => toggleSort\(column\.key\)\}/);
  // O(seats) index replaces the per-employee seat scan.
  assert.match(source, /const seatLabelByEmployeeId = useMemo/);
  assert.doesNotMatch(source, /localSeats\.find\(seat => seat\.employee_id/);
  // Results stay countable at scale (Figma: "results capped with counts").
  assert.match(source, /of \{activeEmployees\.length\.toLocaleString\(\)\} shown/);
});

test("viewer directory and admin results panel window through the shared hook", async () => {
  const hookSource = await readFile(new URL("../components/seat-map/useVirtualListWindow.ts", import.meta.url), "utf8");
  const viewerSource = await readFile(new URL("../components/seat-map/ViewerSeatFinder.tsx", import.meta.url), "utf8");
  const resultsSource = await readFile(new URL("../components/seat-map/ResultsPanel.tsx", import.meta.url), "utf8");

  // The hook delegates the math to the unit-tested lib module.
  assert.match(hookSource, /from "@\/lib\/virtualizedList"/);
  assert.match(hookSource, /computeVirtualWindow\(\{/);
  assert.match(hookSource, /computeVirtualSegments\(\{/);
  // The focused row is pinned so scrolling never unmounts it (focus would
  // drop to <body> and kill the arrow-key handler), and pinned rows are
  // excluded from stride measurement — they aren't adjacent to neighbors.
  assert.match(hookSource, /addEventListener\("focusin"/);
  assert.match(hookSource, /addEventListener\("focusout"/);
  assert.match(hookSource, /:not\(\[data-vpinned\]\)/);

  // Viewer People directory: segments render (spacers + absolute-indexed
  // rows), arrow keys navigate by absolute index via the unit-tested helper.
  assert.match(viewerSource, /useVirtualListWindow\(directory\.rows\.length/);
  assert.match(viewerSource, /directorySegments\.map\(/);
  assert.match(viewerSource, /data-vindex=\{segment\.index\}/);
  assert.match(viewerSource, /function handleDirectoryKeyDown/);
  assert.match(viewerSource, /stepFocusIndex\(\{/);
  // ArrowUp with nothing above still exits to the search input — but only
  // through the absolute-index handler, never by walking the rendered slice.
  assert.match(viewerSource, /if \(direction === -1\) searchInputRef\.current\?\.focus\(\)/);

  // Admin results panel: same segments pattern and absolute-index roving.
  assert.match(resultsSource, /useVirtualListWindow\(results\.length/);
  assert.match(resultsSource, /segments\.map\(/);
  assert.match(resultsSource, /data-vindex=\{segment\.index\}/);
  assert.match(resultsSource, /stepFocusIndex\(\{/);
  assert.match(resultsSource, /ArrowDown/);
  assert.match(resultsSource, /ArrowUp/);
});
