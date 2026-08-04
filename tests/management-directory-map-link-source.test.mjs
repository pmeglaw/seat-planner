import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

// v12 slice 8, contract #13. The directory grew two distinct affordances where
// it used to have one: the NAME shows the person on the map, the kebab opens
// the edit form. These pin that split and the dialog that replaced the side
// panel — behavior and a11y only, no colors, spacing, or class names.

const panelUrl = new URL("../components/admin-management/AdminManagementPanel.tsx", import.meta.url);
const readPanel = () => readFile(panelUrl, "utf8");

test("the directory name cell deep-links to the map through the shared seat param", async () => {
  const source = await readPanel();

  // One URL contract with SeatMap/ViewerSeatFinder — never a hand-built query.
  assert.match(source, /from "@\/lib\/deepLink"/);
  assert.match(source, /href=\{`\/admin\$\{withSeatParam\("", seatLabel\)\}`\}/);
  assert.doesNotMatch(source, /href=\{`\/admin\?seat=/);

  // Unseated people have nothing to show, so only assigned rows get the link.
  assert.match(source, /isAssigned \? \([\s\S]{0,200}<Link/);

  // The row itself still opens the edit form, so the link must not bubble into
  // it — clicking a name would otherwise navigate AND open the dialog.
  assert.match(source, /<Link[\s\S]{0,300}onClick=\{event => event\.stopPropagation\(\)\}/);
});

test("the edit path stays reachable and keeps handing focus to the name field", async () => {
  const source = await readPanel();

  // The kebab is the explicit edit affordance now that the name navigates.
  assert.match(source, /aria-label=\{`Edit \$\{displayName\}`\}/);
  assert.match(source, /event\.stopPropagation\(\);\s*editEmployee\(employee\);/);
  // Clicking the row still opens the same form. It is a mouse shortcut only —
  // the keyboard path is the kebab, see the tab-stop test in
  // accessibility-source (v12 slice 9).
  assert.match(source, /onClick=\{\(\) => editEmployee\(employee\)\}/);
  assert.match(source, /employeeNameInputRef\.current\?\.focus\(\)/);
});

test("the add/edit form is a real modal dialog with managed focus", async () => {
  const source = await readPanel();

  assert.match(source, /aria-labelledby="management-employee-title"/);
  assert.match(source, /ref=\{employeeDialogFocusRef\}/);
  assert.match(source, /const employeeDialogFocusRef = useDialogFocus/);
  // Escape closes it, and never mid-flight while a transition is pending.
  assert.match(source, /event\.key === "Escape" && !pending[\s\S]{0,120}closeEmployeeDialog\(\)/);
  // Both entry points open the same dialog rather than two copies of the form.
  assert.equal((source.match(/setEmployeeDialogOpen\(true\)/g) ?? []).length, 2);
  assert.match(source, /onClick=\{openAddEmployee\}/);
});

test("opening the add form mutates nothing on its own", async () => {
  const source = await readPanel();

  // Review-before-mutate: the toolbar CTA only opens the form. Every write
  // still goes through saveEmployee/confirmManagementDestructiveAction.
  const openAddEmployee = source.match(/function openAddEmployee\(\) \{[\s\S]*?\n  \}/);
  assert.ok(openAddEmployee, "openAddEmployee should be source-visible");
  assert.doesNotMatch(openAddEmployee[0], /Action\(/);
});
