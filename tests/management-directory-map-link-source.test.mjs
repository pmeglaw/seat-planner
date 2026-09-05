import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

// v12 slice 8, contract #13, re-pointed in Phase 4 PR 4 (PHASE2UX §1G.3): the
// directory keeps two distinct affordances — the SEAT code shows the person
// on the map, the one ghost Edit action opens the 480 side panel. These pin
// that split and the panel that replaced the modal — behavior and a11y only,
// no colors, spacing, or class names.

const read = relative => readFile(new URL(relative, import.meta.url), "utf8");
const readTable = () => read("../components/admin-management/EmployeesTable.tsx");
const readHost = () => read("../components/admin-management/AdminManagementPanel.tsx");
const readPanel = () => read("../components/admin-management/EmployeePanel.tsx");

test("the directory seat cell deep-links to the map through the shared seat param", async () => {
  const source = await readTable();

  // One URL contract with SeatMap/ViewerSeatFinder — never a hand-built query.
  assert.match(source, /from "@\/lib\/deepLink"/);
  assert.match(source, /href=\{`\/admin\$\{withSeatParam\("", seatLabel\)\}`\}/);
  assert.doesNotMatch(source, /href=\{`\/admin\?seat=/);

  // Unseated people have nothing to show, so only assigned rows get the link.
  assert.match(source, /isAssigned \? \([\s\S]{0,300}<Link/);

  // The row itself still opens the panel, so the link must not bubble into
  // it — clicking a seat code would otherwise navigate AND open the panel.
  assert.match(source, /<Link[\s\S]{0,300}onClick=\{event => event\.stopPropagation\(\)\}/);
});

test("the edit path is one labelled ghost action per row and keeps handing focus to the name field", async () => {
  const table = await readTable();
  const host = await readHost();

  // The ghost Edit icon button is the explicit edit affordance (no kebab — an
  // overflow holding one item is a tell, PHASE3DS §1.23); it carries the name.
  assert.match(table, /aria-label=\{`Edit \$\{displayName\}`\}/);
  assert.match(table, /className="cds-btn cds-btn--ghost cds-btn--icon"/);
  assert.doesNotMatch(table, /aria-haspopup="menu"/);
  assert.match(table, /event\.stopPropagation\(\);\s*onEdit\(employee\);/);
  // Clicking the row still opens the same panel. It is a mouse shortcut only —
  // the keyboard path is the Edit button, see the tab-stop test in
  // accessibility-source.
  assert.match(table, /onClick=\{\(\) => onEdit\(employee\)\}/);
  assert.match(host, /employeeNameInputRef\.current\?\.focus\(\)/);
});

test("the add/edit form is a focus-trapped side panel with one dirty-close check", async () => {
  const panel = await readPanel();
  const host = await readHost();

  assert.match(panel, /aria-labelledby="management-employee-title"/);
  assert.match(panel, /ref=\{employeeDialogFocusRef\}/);
  assert.match(panel, /const employeeDialogFocusRef = useDialogFocus/);
  // Esc, the scrim and Cancel all route through the host's ONE dirty check
  // (P3-17), never mid-flight while a transition is pending.
  assert.match(panel, /event\.key === "Escape" && !pending[\s\S]{0,120}onRequestClose\(\)/);
  assert.match(panel, /className="cds-side-panel-catch" onClick=\{\(\) => \{ if \(!pending\) onRequestClose\(\); \}\}/);
  assert.match(host, /function requestCloseEmployeePanel\(\) \{[\s\S]{0,200}isFormDirty\(employeeForm, initialEmployeeForm\)/);
  // No ×: leaving is a decision (PHASE3DS §1.24).
  assert.doesNotMatch(panel, /aria-label="Close employee form"/);
  // Both entry points open the same panel rather than two copies of the form.
  assert.equal((host.match(/setEmployeeDialogOpen\(true\)/g) ?? []).length, 2);
  assert.match(host, /if \(activeTab === "employees"\) openAddEmployee\(\);/);
});

test("opening the add form mutates nothing on its own", async () => {
  const source = await readHost();

  // Review-before-mutate: the header primary only opens the panel. Every write
  // still goes through saveEmployee/confirmManagementDestructiveAction.
  const openAddEmployee = source.match(/function openAddEmployee\(\) \{[\s\S]*?\n  \}/);
  assert.ok(openAddEmployee, "openAddEmployee should be source-visible");
  assert.doesNotMatch(openAddEmployee[0], /Action\(/);
});
