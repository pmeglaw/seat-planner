import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Scope note: this file guards seat-creation *behavior* — draft-only mutation,
// custom-seat protection, undo/redo eligibility, and copy/state correctness.
// Purely visual snapshot checks (workspace shell classes, badge pixel sizes,
// inspector/marker geometry) were intentionally removed so the UI can be
// redesigned freely without editing this test. Accessibility and destructive-
// action-safety invariants live in accessibility-source / bulk-destructive-
// action-safety-source.

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

test("move-seat action updates one draft seat without publishing", async () => {
  const source = await readFile(new URL("../app/actions.ts", import.meta.url), "utf8");
  const moveAction = source.match(/export async function moveSeatAction[\s\S]*?export async function updateSeatAction/);

  assert.ok(moveAction, "moveSeatAction should remain source-visible.");
  assert.match(moveAction[0], /const supabase = await requireAdmin\(\)/);
  assert.match(moveAction[0], /validateSeatCoordinates\(input\.x, input\.y\)/);
  assert.match(moveAction[0], /\.from\("seats"\)[\s\S]*\.update\(\{ x: point\.x, y: point\.y \}\)[\s\S]*\.eq\("id", input\.seatId\)[\s\S]*\.eq\("layer", "draft"\)/);
  assert.match(moveAction[0], /return \{ ok: true, seat: await getDraftSeatById\(supabase, input\.seatId\) \}/);
  assert.doesNotMatch(moveAction[0], /\.eq\("layer", "published"\)|publishSeatMapAction|publish_seat_map|revalidatePath\("\/"\)/);
});

test("custom-seat delete flow is draft-only and clearly guarded", async () => {
  const seatMapSource = await readFile(new URL("../components/seat-map/SeatMap.tsx", import.meta.url), "utf8");
  const inspectorDeleteSource = await readFile(new URL("../components/seat-map/SeatInspector.tsx", import.meta.url), "utf8");
  const actionSource = await readFile(new URL("../app/actions.ts", import.meta.url), "utf8");
  const deleteAction = actionSource.match(/export async function deleteSeatAction[\s\S]*?export async function importAssignmentsCsvAction/);

  assert.ok(deleteAction, "deleteSeatAction should remain source-visible.");
  assert.match(seatMapSource, /canDeleteSeat/);
  assert.match(seatMapSource, /getSeatDeleteBlockReason/);
  assert.match(seatMapSource, /Only available custom draft seats can be deleted\. Original seats are protected\./);
  assert.match(seatMapSource, /This removes custom draft seats only\. Published maps are unchanged until you publish\./);
  assert.match(inspectorDeleteSource, /Delete custom seat/);
  assert.match(inspectorDeleteSource, /deleteHelpText/);
  assert.match(deleteAction[0], /canDeleteDraftSeat/);
  assert.match(deleteAction[0], /getSeatDeleteBlockReason/);
  assert.match(deleteAction[0], /\.select\("id,label,layer,is_custom,employee_id,status"\)/);
  assert.match(deleteAction[0], /\.eq\("layer", "draft"\)[\s\S]*\.eq\("is_custom", true\)[\s\S]*\.is\("employee_id", null\)[\s\S]*\.eq\("status", "available"\)/);
  assert.doesNotMatch(deleteAction[0], /\.eq\("layer", "published"\)|publishSeatMapAction|publish_seat_map/);
});

test("undo-redo restore deletes only eligible custom draft seats", async () => {
  const actionSource = await readFile(new URL("../app/actions.ts", import.meta.url), "utf8");
  const restoreMigration = await readFile(new URL("../supabase/migrations/20260616000300_restore_draft_snapshot_rpc.sql", import.meta.url), "utf8");
  const restoreAction = actionSource.match(/export async function restoreDraftSnapshotAction[\s\S]*?export async function getPublishHistoryAction/);
  const restoreFunction = restoreMigration.match(/create or replace function public\.restore_draft_snapshot[\s\S]+?\$\$;\s*/);

  assert.ok(restoreAction, "restoreDraftSnapshotAction should remain source-visible.");
  assert.ok(restoreFunction, "restore_draft_snapshot RPC should remain source-visible.");
  assert.match(restoreAction[0], /\.rpc\("restore_draft_snapshot"/);
  assert.match(restoreFunction[0], /protected or occupied seats are missing from the snapshot/);
  assert.match(restoreFunction[0], /protected_original_label/);
  assert.match(restoreFunction[0], /delete from public\.seats as seat[\s\S]*seat\.layer = 'draft'::public\.seat_layer[\s\S]*seat\.is_custom is true[\s\S]*seat\.employee_id is null[\s\S]*seat\.status = 'available'::public\.seat_status/);
});

test("redo of an added seat reselects the restored seat", async () => {
  const seatMapSource = await readFile(new URL("../components/seat-map/SeatMap.tsx", import.meta.url), "utf8");
  const redoFunction = seatMapSource.match(/function redoDraftEdit\(\) \{[\s\S]*?\n  \}/);
  const restoreFunction = seatMapSource.match(/function restoreHistorySnapshot\([\s\S]*?function undoDraftEdit/);

  assert.ok(redoFunction, "redoDraftEdit should remain source-visible.");
  assert.ok(restoreFunction, "restoreHistorySnapshot should remain source-visible.");
  // The label parse moved into lib/draftHistory.ts, where addedSeatHistoryLabel
  // and parseAddedSeatLabel are round-tripped by tests/draft-history.test.mjs —
  // builder and parser can no longer drift apart. The contract this line
  // guards is unchanged: redo must still derive the added seat's label from
  // the entry so restoreHistorySnapshot can reselect it.
  assert.match(redoFunction[0], /parseAddedSeatLabel\(result\.entry\.label\)/);
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
  // Local-only guarantee, stated precisely: every use of the storage key is a
  // window.localStorage call (plus its one declaration) — the key can never
  // ride along into a supabase/server pathway. (The old whole-file
  // "supabase never co-occurs with the key" regex broke the moment the file
  // gained an unrelated supabase import for the session-expiry probe.)
  const keyUses = seatMapSource.match(/ADMIN_NAMES_VISIBLE_STORAGE_KEY/g) ?? [];
  const localStorageKeyUses = seatMapSource.match(/window\.localStorage\.(?:get|set)Item\(ADMIN_NAMES_VISIBLE_STORAGE_KEY/g) ?? [];
  assert.equal(keyUses.length, localStorageKeyUses.length + 1, "names-visible key must be used only via window.localStorage");
});

test("canvas add seat toggle is wired to add-seat mode", async () => {
  const seatMapSource = await readFile(new URL("../components/seat-map/SeatMap.tsx", import.meta.url), "utf8");
  const addSeatToggle = seatMapSource.match(/aria-pressed=\{addSeatMode\}[\s\S]*?\{addSeatMode \? "Exit add seat" : "Add seat"\}/);

  assert.ok(addSeatToggle, "Canvas Add seat toggle should be source-visible.");
  assert.match(addSeatToggle[0], /onClick=\{addSeatMode \? cancelAddSeatMode : startAddSeatMode\}/);
});

test("inspector copy uses Job Title instead of Team", async () => {
  const source = await readFile(new URL("../components/seat-map/SeatInspector.tsx", import.meta.url), "utf8");

  assert.match(source, /Job title/);
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
