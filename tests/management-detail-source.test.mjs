import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

// Management detail pass (2026-07-16 detail critique, action 8), re-pointed in
// Phase 4 PR 4 to the Employees table (EmployeesTable.tsx) and the host
// (AdminManagementPanel.tsx). These pin vocabulary and family-consistency
// rules, not pixel styling.

const read = relative => readFile(new URL(relative, import.meta.url), "utf8");

test("the Status column speaks one vocabulary: Assigned/Unassigned, with a two-signal mark", async () => {
  const source = await read("../components/admin-management/EmployeesTable.tsx");

  // The label must agree with its own sort comparator and the toolbar count —
  // "Active" answered a question the column wasn't asking (the directory
  // already lists only active employees).
  assert.match(source, /\{isAssigned \? "Assigned" : "Unassigned"\}/);
  assert.doesNotMatch(source, /\{isAssigned \? "Assigned" : "Active"\}/);
  // PHASE3DS §1.23: the seat vocabulary — ● assigned / ○ unassigned — drawn by
  // SeatMark (shape + colour, never colour alone; WCAG 1.4.1).
  assert.match(source, /<SeatMark kind=\{isAssigned \? "assigned-dot" : "open"\}/);
});

test("Management icons stay in the house family", async () => {
  const source = await read("../components/admin-management/EmployeesTable.tsx");

  // Every icon is drawn on the 16-viewBox grid like the map's line icons
  // (mapIcons) — no stock 24-viewBox/stroke-2 library icon. The Edit glyph is
  // the one icon this file draws itself.
  assert.match(source, /const EditIcon = \(\) => \([\s\S]{0,120}viewBox="0 0 16 16"/);
  assert.doesNotMatch(source, /viewBox="0 0 2[04] 2[04]"/);
  // Sort carets are drawn SVGs (platform-independent), not ▲/▼ font glyphs.
  assert.doesNotMatch(source, /[▲▼]/);
  assert.match(source, /className="cds-sort"[\s\S]{0,200}<ChevronIcon \/>/);
  // The employee search carries the same magnifier as every other search.
  assert.match(source, /className="cds-toolbar-search">\s*<SearchIcon \/>/);
});

test("opening a directory row hands focus to the panel's name field", async () => {
  const source = await read("../components/admin-management/AdminManagementPanel.tsx");
  assert.match(source, /employeeNameInputRef\.current\?\.focus\(\)/);
});
