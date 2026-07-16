import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

// Management detail pass (2026-07-16 detail critique, action 8). These pin
// vocabulary and family-consistency rules, not pixel styling.

test("the Status column speaks one vocabulary: Assigned/Unassigned", async () => {
  const source = await readFile(new URL("../components/admin-management/AdminManagementPanel.tsx", import.meta.url), "utf8");

  // The chip must agree with its own sort comparator and the summary cards —
  // "Active" answered a question the column wasn't asking (the directory
  // already lists only active employees).
  assert.match(source, /\{isAssigned \? "Assigned" : "Unassigned"\}/);
  assert.doesNotMatch(source, /\{isAssigned \? "Assigned" : "Active"\}/);
});

test("Management icons stay in the house family", async () => {
  const source = await readFile(new URL("../components/admin-management/AdminManagementPanel.tsx", import.meta.url), "utf8");

  // Trash is drawn on the 20-viewBox grid like every sibling icon — no stock
  // 24-viewBox/stroke-2 library icon.
  assert.match(source, /function TrashIcon\(\) \{[\s\S]{0,200}viewBox="0 0 20 20"/);
  // Sort carets are drawn SVGs (platform-independent), not ▲/▼ font glyphs.
  assert.doesNotMatch(source, /[▲▼]/);
  // The employee search carries the same magnifier as every other search.
  assert.match(source, /Search employees[\s\S]{0,400}circle cx="9" cy="9" r="5\.25"/);
});

test("opening a directory row hands focus to the edit form", async () => {
  const source = await readFile(new URL("../components/admin-management/AdminManagementPanel.tsx", import.meta.url), "utf8");
  assert.match(source, /employeeNameInputRef\.current\?\.focus\(\)/);
});
