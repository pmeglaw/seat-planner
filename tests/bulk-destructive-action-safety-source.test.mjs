import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readSource(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("settings data utilities review CSV imports in-app before calling the mutation", async () => {
  const source = await readSource("../components/admin-settings/DataUtilitiesPanel.tsx");
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

test("settings data utilities review JSON restores in-app before calling the restore action", async () => {
  const source = await readSource("../components/admin-settings/DataUtilitiesPanel.tsx");
  const importJsonFunction = source.match(/function importJson\(file: File \| undefined\) \{[\s\S]*?function confirmJsonRestore\(\)/);
  const confirmJsonFunction = source.match(/function confirmJsonRestore\(\) \{[\s\S]*?return \(/);
  const closeJsonFunction = source.match(/function closeJsonReview\(\) \{[\s\S]*?\n  \}/);

  assert.ok(importJsonFunction, "JSON import file-read flow should be source-visible.");
  assert.ok(confirmJsonFunction, "JSON confirm flow should be source-visible.");
  assert.ok(closeJsonFunction, "JSON cancel flow should be source-visible.");
  assert.doesNotMatch(importJsonFunction[0], /restoreDraftSnapshotAction/);
  // The restore must carry the draft-concurrency fence fingerprint so a stale
  // page cannot silently revert edits another admin committed after it loaded.
  assert.match(confirmJsonFunction[0], /restoreDraftSnapshotAction\(review\.snapshot, listDraftSeatExpectations\(seats\)\)/);
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
  assert.match(source, /The published map everyone sees won't change until you publish again/);
  assert.match(source, /published map (everyone sees )?(won't|will not) change until you publish/i);
  assert.match(source, /published viewer map is unchanged until publish/i);
});

test("reset-to-published reviews in-app on both surfaces before calling the reset action", async () => {
  const settingsSource = await readSource("../components/admin-settings/DataUtilitiesPanel.tsx");
  const seatMapSource = await readSource("../components/seat-map/SeatMap.tsx");

  // Settings: the danger tile opens a review dialog (counts of what gets
  // discarded) and only the dialog's confirm calls the action.
  assert.match(settingsSource, /function openResetReview\(\)[\s\S]{0,400}setResetReviewOpen\(true\)/);
  assert.match(settingsSource, /aria-labelledby="reset-review-title"/);
  assert.match(settingsSource, /function confirmResetToPublished\(\)[\s\S]{0,900}resetDraftToPublishedAction\(listDraftSeatExpectations\(seats\)\)/);
  assert.equal((settingsSource.match(/resetDraftToPublishedAction\(/g) ?? []).length, 1, "settings has exactly one reset call site, inside the confirm");

  // Seat map: the publish review dialog's discard button opens a SECOND
  // explicit confirm dialog; only that confirm calls the fenced action.
  assert.match(seatMapSource, /setDiscardDraftConfirmOpen\(true\)/);
  assert.match(seatMapSource, /aria-labelledby="discard-draft-title"/);
  assert.match(seatMapSource, /function confirmDiscardDraftChanges\(\)[\s\S]{0,900}resetDraftToPublishedAction\(listDraftSeatExpectations\(localSeats\)\)/);
  assert.equal((seatMapSource.match(/resetDraftToPublishedAction\(/g) ?? []).length, 1, "the map has exactly one reset call site, inside the confirm");
});
