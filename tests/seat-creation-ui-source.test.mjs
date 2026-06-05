import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("normal add-seat UI does not pass manual labels or zones", async () => {
  const source = await readFile(new URL("../components/seat-map/SeatMap.tsx", import.meta.url), "utf8");
  const createCall = source.match(/createSeatAction\(\{[\s\S]*?\}\)/);

  assert.ok(createCall, "SeatMap should call createSeatAction from add-seat mode.");
  assert.match(source, /detectSeatZoneForPointResult/);
  assert.match(source, /getSeatZoneDetectionFailureMessage/);
  assert.doesNotMatch(source, /addSeatZone|onAddSeatZoneChange|buildNextSeatLabel/);
  assert.doesNotMatch(createCall[0], /\blabel\s*:/);
  assert.doesNotMatch(createCall[0], /\bzone\s*:/);
});

test("add-seat action creates custom draft seats without publishing", async () => {
  const source = await readFile(new URL("../app/actions.ts", import.meta.url), "utf8");
  const createAction = source.match(/export async function createSeatAction[\s\S]*?export async function moveSeatAction/);

  assert.ok(createAction, "createSeatAction should remain source-visible.");
  assert.match(source, /async function getDraftSeatZoneSources[\s\S]*\.eq\("layer", "draft"\)/);
  assert.match(createAction[0], /getDraftSeatZoneSources\(supabase\)/);
  assert.match(createAction[0], /detectSeatZoneForPointResult/);
  assert.match(createAction[0], /label,\s*x:\s*point\.x,\s*y:\s*point\.y,\s*layer:\s*"draft",\s*status:\s*"available",\s*zone,\s*department:\s*null,\s*is_custom:\s*true/s);
  assert.doesNotMatch(createAction[0], /publishSeatMapAction|publish_seat_map|\.eq\("layer", "published"\)/);
});

test("custom-seat delete flow is draft-only and clearly guarded", async () => {
  const seatMapSource = await readFile(new URL("../components/seat-map/SeatMap.tsx", import.meta.url), "utf8");
  const drawerSource = await readFile(new URL("../components/seat-map/AdvancedDrawer.tsx", import.meta.url), "utf8");
  const actionSource = await readFile(new URL("../app/actions.ts", import.meta.url), "utf8");
  const deleteAction = actionSource.match(/export async function deleteSeatAction[\s\S]*?export async function importAssignmentsCsvAction/);

  assert.ok(deleteAction, "deleteSeatAction should remain source-visible.");
  assert.match(seatMapSource, /canDeleteSeat/);
  assert.match(seatMapSource, /getSeatDeleteBlockReason/);
  assert.match(seatMapSource, /Only available custom draft seats can be deleted\. Original seats are protected\./);
  assert.match(seatMapSource, /This removes custom draft seats only\. Published maps are unchanged until you publish\./);
  assert.match(drawerSource, /label="Delete custom seat"/);
  assert.match(drawerSource, /selectedSeatDeleteBlockReason/);
  assert.match(drawerSource, /Only available custom draft seats can be deleted\. Original seats are protected\./);
  assert.match(deleteAction[0], /canDeleteDraftSeat/);
  assert.match(deleteAction[0], /getSeatDeleteBlockReason/);
  assert.match(deleteAction[0], /\.select\("id,label,layer,is_custom,employee_id,status"\)/);
  assert.match(deleteAction[0], /\.eq\("layer", "draft"\)[\s\S]*\.eq\("is_custom", true\)[\s\S]*\.is\("employee_id", null\)[\s\S]*\.eq\("status", "available"\)/);
  assert.doesNotMatch(deleteAction[0], /\.eq\("layer", "published"\)|publishSeatMapAction|publish_seat_map/);
});

test("undo-redo restore deletes only eligible custom draft seats", async () => {
  const actionSource = await readFile(new URL("../app/actions.ts", import.meta.url), "utf8");
  const restoreAction = actionSource.match(/export async function restoreDraftSnapshotAction[\s\S]*?export async function getPublishHistoryAction/);

  assert.ok(restoreAction, "restoreDraftSnapshotAction should remain source-visible.");
  assert.match(restoreAction[0], /canDeleteDraftSeat/);
  assert.match(restoreAction[0], /protected or occupied seats are missing from the snapshot/);
  assert.match(restoreAction[0], /\.select\("id,label,layer,is_custom,employee_id,status"\)/);
  assert.match(restoreAction[0], /\.eq\("layer", "draft"\)[\s\S]*\.eq\("is_custom", true\)[\s\S]*\.is\("employee_id", null\)[\s\S]*\.eq\("status", "available"\)/);
});

test("redo of an added seat reselects the restored seat", async () => {
  const seatMapSource = await readFile(new URL("../components/seat-map/SeatMap.tsx", import.meta.url), "utf8");
  const redoFunction = seatMapSource.match(/function redoDraftEdit\(\) \{[\s\S]*?\n  \}/);
  const restoreFunction = seatMapSource.match(/function restoreHistorySnapshot\([\s\S]*?function undoDraftEdit/);

  assert.ok(redoFunction, "redoDraftEdit should remain source-visible.");
  assert.ok(restoreFunction, "restoreHistorySnapshot should remain source-visible.");
  assert.match(redoFunction[0], /result\.entry\.label\.match\(\/\^Add/);
  assert.match(redoFunction[0], /restoreHistorySnapshot\(result\.snapshot, result\.history, "Redo", `Redid \$\{result\.entry\.label\}\.`, addSeatLabel\)/);
  assert.match(restoreFunction[0], /setSelectedSeatId\(restoredSeat\.id\)/);
  assert.match(restoreFunction[0], /setInspectorCollapsed\(false\)/);
});

test("inspector copy uses Job Title instead of Team", async () => {
  const source = await readFile(new URL("../components/seat-map/SeatInspector.tsx", import.meta.url), "utf8");

  assert.match(source, /Job Title/);
  assert.match(source, /employeePosition/);
  assert.doesNotMatch(source, />\s*Team\s*</);
  assert.doesNotMatch(source, /No team/);
});

test("typing an unmatched employee name clears stale job title", async () => {
  const source = await readFile(new URL("../components/seat-map/SeatInspector.tsx", import.meta.url), "utf8");
  const unmatchedBranch = source.match(/if \(!matchedEmployee\) \{[\s\S]*?return \{[\s\S]*?\};\s*\}/);

  assert.ok(unmatchedBranch, "SeatInspector should handle unmatched employee names.");
  assert.match(unmatchedBranch[0], /employeeId:\s*""/);
  assert.match(unmatchedBranch[0], /employeePosition:\s*""/);
  assert.match(unmatchedBranch[0], /phoneExtension:\s*""/);
});
