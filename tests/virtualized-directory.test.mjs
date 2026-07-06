import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function importTsModule(relativePath) {
  const source = await readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022
    }
  });
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString("base64")}`;
  return import(moduleUrl);
}

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
  assert.match(source, /paddingTop: employeeWindow\.topPadding, paddingBottom: employeeWindow\.bottomPadding/);
  assert.match(source, /data-directory-card/);
  // The card grid keeps its exact classes (performance work, not a re-skin).
  assert.match(source, /className="grid grid-cols-1 gap-2 lg:grid-cols-2"/);
  // O(seats) index replaces the per-employee seat scan.
  assert.match(source, /const seatLabelByEmployeeId = useMemo/);
  assert.doesNotMatch(source, /localSeats\.find\(seat => seat\.employee_id/);
  // Results stay countable at scale (Figma: "results capped with counts").
  assert.match(source, /of \{activeEmployees\.length\.toLocaleString\(\)\} shown/);
});
