import assert from "node:assert/strict";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";
import { readFile } from "node:fs/promises";
import test from "node:test";
const { computeVirtualWindow } = await importTsModule("lib/virtualizedList.ts");

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

test("management directory is windowed with an indexed seat lookup, look unchanged", async () => {
  const source = await readFile(new URL("../components/admin-management/AdminManagementPanel.tsx", import.meta.url), "utf8");

  assert.match(source, /from "@\/lib\/virtualizedList"/);
  assert.match(source, /computeVirtualWindow\(\{/);
  // Only the windowed slice renders; padding preserves the page scroll height.
  assert.match(source, /visibleEmployees\.map\(employee =>/);
  // Design change: the 2-column card grid became a sortable table (a11y + scale).
  // Windowing still holds — but the padding that preserves scroll height now
  // lives in spacer <tr> rows sized by employeeWindow.top/bottomPadding.
  assert.match(source, /height: employeeWindow\.topPadding/);
  assert.match(source, /height: employeeWindow\.bottomPadding/);
  // Directory rows are now table rows, not cards.
  assert.match(source, /data-directory-row/);
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

  // Viewer People directory: windowed slice + spacers preserve the scrollbar.
  assert.match(viewerSource, /useVirtualListWindow\(directory\.rows\.length/);
  assert.match(viewerSource, /visibleDirectoryRows\.map\(row =>/);
  assert.match(viewerSource, /height: directoryWindow\.topPadding/);
  assert.match(viewerSource, /height: directoryWindow\.bottomPadding/);

  // Admin results panel: same pattern, keyboard roving untouched.
  assert.match(resultsSource, /useVirtualListWindow\(results\.length/);
  assert.match(resultsSource, /visibleResults\.map\(result =>/);
  assert.match(resultsSource, /height: resultsWindow\.topPadding/);
  assert.match(resultsSource, /height: resultsWindow\.bottomPadding/);
  assert.match(resultsSource, /ArrowDown/);
  assert.match(resultsSource, /ArrowUp/);
});
