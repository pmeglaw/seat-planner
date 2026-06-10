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

test("admin names visibility preference persists locally without server storage", async () => {
  const seatMapSource = await readFile(new URL("../components/seat-map/SeatMap.tsx", import.meta.url), "utf8");

  assert.match(seatMapSource, /ADMIN_NAMES_VISIBLE_STORAGE_KEY = "seat-planner:names-visible"/);
  assert.match(seatMapSource, /window\.localStorage\.getItem\(ADMIN_NAMES_VISIBLE_STORAGE_KEY\)/);
  assert.match(seatMapSource, /window\.localStorage\.setItem\(ADMIN_NAMES_VISIBLE_STORAGE_KEY, showNames \? "true" : "false"\)/);
  assert.match(seatMapSource, /if \(!canEdit\) \{[\s\S]*?setNamesPreferenceHydrated\(true\);[\s\S]*?return;/);
  assert.doesNotMatch(seatMapSource, /supabase[\s\S]*seat-planner:names-visible|seat-planner:names-visible[\s\S]*supabase/);
});

test("map tools add seat row is neutral until add-seat mode is active", async () => {
  const drawerSource = await readFile(new URL("../components/seat-map/AdvancedDrawer.tsx", import.meta.url), "utf8");
  const addSeatCommand = drawerSource.match(/<CommandButton\s+label=\{addSeatMode \? "Cancel Add Seat" : "Add Seat"\}[\s\S]*?disabled=\{busy\}\s+\/>/);

  assert.ok(addSeatCommand, "Add Seat command should remain source-visible.");
  assert.match(addSeatCommand[0], /tone=\{addSeatMode \? "active" : "default"\}/);
  assert.match(addSeatCommand[0], /Active\. Click a seating zone or cancel/);
  assert.doesNotMatch(addSeatCommand[0], /tone="active"/);
  assert.match(drawerSource, /border-slate-200\/70 bg-white\/75 text-slate-900 hover:border-slate-300 hover:bg-white/);
});

test("seat labels stay readable and expand on hover or keyboard focus", async () => {
  const markerSource = await readFile(new URL("../components/seat-map/SeatMarker.tsx", import.meta.url), "utf8");

  assert.match(markerSource, /getPassiveEmployeeLabel/);
  assert.match(markerSource, /group-hover:w-\[126px\]/);
  assert.match(markerSource, /group-focus-visible:w-\[126px\]/);
  assert.match(markerSource, /group-hover:block group-focus-visible:block/);
  assert.match(markerSource, /text-\[10px\]/);
  assert.match(markerSource, /selected[\s\S]*w-\[140px\]/);
  assert.match(markerSource, /searchProminent[\s\S]*border-orange-300 bg-orange-50\/90/);
});

test("seat marker coordinates anchor the dot instead of the label chip", async () => {
  const markerSource = await readFile(new URL("../components/seat-map/SeatMarker.tsx", import.meta.url), "utf8");
  const seatMapSource = await readFile(new URL("../components/seat-map/SeatMap.tsx", import.meta.url), "utf8");

  assert.match(markerSource, /function getSeatLabelPlacement/);
  assert.match(markerSource, /westPod[\s\S]*"aboveRight"[\s\S]*"right"/);
  assert.match(markerSource, /southeastOffice[\s\S]*"aboveLeft"[\s\S]*"left"/);
  assert.match(markerSource, /denseAboveDot[\s\S]*"aboveCompact"/);
  assert.match(markerSource, /group absolute z-10 flex -translate-x-1\/2 -translate-y-1\/2/);
  assert.match(markerSource, /absolute left-1\/2 top-1\/2 h-0 w-0 overflow-visible/);
  assert.match(markerSource, /absolute left-0 top-0 z-20 flex -translate-x-1\/2 -translate-y-1\/2/);
  assert.match(markerSource, /dotTargetSizeClass/);
  assert.match(markerSource, /placementClasses\.chip/);
  assert.match(markerSource, /compactCallout = compactNameLabel \|\| labelPlacement === "aboveCompact"/);
  assert.match(seatMapSource, /if \(seatTarget\?\.dataset\.seatId\) return;/);
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
