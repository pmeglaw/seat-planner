import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readSource(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("advanced drawer reviews CSV imports in-app before calling the mutation", async () => {
  const source = await readSource("../components/seat-map/AdvancedDrawer.tsx");
  const importCsvFunction = source.match(/function importCsv\(file: File \| undefined\) \{[\s\S]*?function confirmCsvImport\(\)/);
  const confirmCsvFunction = source.match(/function confirmCsvImport\(\) \{[\s\S]*?function importJson/);
  const closeCsvFunction = source.match(/function closeCsvReview\(\) \{[\s\S]*?\n  \}/);

  assert.ok(importCsvFunction, "CSV import file-read flow should be source-visible.");
  assert.ok(confirmCsvFunction, "CSV confirm flow should be source-visible.");
  assert.ok(closeCsvFunction, "CSV cancel flow should be source-visible.");
  assert.doesNotMatch(source, /window\.confirm/);
  assert.match(source, /type CsvImportReview/);
  assert.match(source, /setCsvReview\(\{[\s\S]*text,[\s\S]*rowCount: parsed\.rows\.length/);
  assert.doesNotMatch(importCsvFunction[0], /importAssignmentsCsvAction/);
  assert.match(confirmCsvFunction[0], /if \(!csvReview \|\| csvReview\.issues\.length > 0\) return/);
  assert.match(confirmCsvFunction[0], /importAssignmentsCsvAction\(review\.text\)/);
  assert.match(closeCsvFunction[0], /setCsvReview\(null\)/);
  assert.match(source, /Review CSV import/);
  assert.match(source, /CSV import has blocking errors/);
  assert.match(source, /Blocking validation errors/);
  assert.match(source, /No draft data has changed/);
  assert.match(source, /Marker positions and the published viewer map will not change until you publish/);
  assert.match(source, /Apply import/);
  assert.match(source, /Fix CSV first/);
});

test("advanced drawer reviews JSON restores in-app before calling the restore callback", async () => {
  const source = await readSource("../components/seat-map/AdvancedDrawer.tsx");
  const importJsonFunction = source.match(/function importJson\(file: File \| undefined\) \{[\s\S]*?function confirmJsonRestore\(\)/);
  const confirmJsonFunction = source.match(/function confirmJsonRestore\(\) \{[\s\S]*?return \(/);
  const closeJsonFunction = source.match(/function closeJsonReview\(\) \{[\s\S]*?\n  \}/);

  assert.ok(importJsonFunction, "JSON import file-read flow should be source-visible.");
  assert.ok(confirmJsonFunction, "JSON confirm flow should be source-visible.");
  assert.ok(closeJsonFunction, "JSON cancel flow should be source-visible.");
  assert.doesNotMatch(importJsonFunction[0], /onJsonImported/);
  assert.match(confirmJsonFunction[0], /onJsonImported\(review\.snapshot, beforeSnapshot\)/);
  assert.match(closeJsonFunction[0], /setJsonReview\(null\)/);
  assert.match(source, /Review JSON restore/);
  assert.match(source, /JSON restore imports a full draft backup/);
  assert.match(source, /This can replace draft assignments, custom seats, notes, and employee details in the draft/);
  assert.match(source, /Restore draft backup/);
});

test("management destructive actions use one in-app confirmation path", async () => {
  const source = await readSource("../components/admin-management/AdminManagementPanel.tsx");
  const deleteEmployeeFunction = source.match(/function deleteEmployee\(\) \{[\s\S]*?function createDepartment/);
  const deleteDepartmentFunction = source.match(/function deleteDepartment\(name: string\) \{[\s\S]*?function createZone/);
  const deleteZoneFunction = source.match(/function deleteZone\(name: string\) \{[\s\S]*?function closeManagementConfirm/);
  const confirmFunction = source.match(/function confirmManagementDestructiveAction\(\) \{[\s\S]*?return \(/);

  assert.ok(deleteEmployeeFunction, "employee deactivation request path should be source-visible.");
  assert.ok(deleteDepartmentFunction, "department delete request path should be source-visible.");
  assert.ok(deleteZoneFunction, "zone delete request path should be source-visible.");
  assert.ok(confirmFunction, "management confirm mutation path should be source-visible.");
  assert.doesNotMatch(source, /window\.confirm/);
  assert.match(source, /type ManagementConfirmState/);
  assert.doesNotMatch(deleteEmployeeFunction[0], /deleteEmployeeAction/);
  assert.doesNotMatch(deleteDepartmentFunction[0], /deleteDepartmentAction/);
  assert.doesNotMatch(deleteZoneFunction[0], /deleteZoneAction/);
  assert.match(deleteEmployeeFunction[0], /setManagementConfirm\(\{ kind: "employee"/);
  assert.match(deleteDepartmentFunction[0], /setManagementConfirm\(\{ kind: "department"/);
  assert.match(deleteZoneFunction[0], /setManagementConfirm\(\{ kind: "zone"/);
  assert.match(confirmFunction[0], /deleteEmployeeAction\(action\.employee\.id\)/);
  assert.match(confirmFunction[0], /deleteDepartmentAction\(action\.name\)/);
  assert.match(confirmFunction[0], /deleteZoneAction\(action\.name\)/);
  assert.match(source, /aria-labelledby="management-confirm-title"/);
  assert.match(source, /Deactivation impact/);
  assert.match(source, /Department delete impact/);
  assert.match(source, /Zone delete impact/);
  assert.match(source, /Published assignments are protected server-side/);
  assert.match(source, /published viewer map is unchanged until publish/i);
});
