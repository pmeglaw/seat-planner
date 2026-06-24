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

test("move-seat action updates one draft seat without publishing", async () => {
  const source = await readFile(new URL("../app/actions.ts", import.meta.url), "utf8");
  const moveAction = source.match(/export async function moveSeatAction[\s\S]*?export async function updateSeatAction/);

  assert.ok(moveAction, "moveSeatAction should remain source-visible.");
  assert.match(moveAction[0], /const supabase = await requireAdmin\(\)/);
  assert.match(moveAction[0], /validateSeatCoordinates\(input\.x, input\.y\)/);
  assert.match(moveAction[0], /\.from\("seats"\)[\s\S]*\.update\(\{ x: point\.x, y: point\.y \}\)[\s\S]*\.eq\("id", input\.seatId\)[\s\S]*\.eq\("layer", "draft"\)/);
  assert.match(moveAction[0], /return getDraftSeatById\(supabase, input\.seatId\)/);
  assert.doesNotMatch(moveAction[0], /\.eq\("layer", "published"\)|publishSeatMapAction|publish_seat_map|revalidatePath\("\/"\)/);
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

test("seat map uses the component-board desktop workspace shell", async () => {
  const seatMapSource = await readFile(new URL("../components/seat-map/SeatMap.tsx", import.meta.url), "utf8");

  assert.match(seatMapSource, /bg-\[var\(--sp-color-workspace-deep\)\] px-2 py-2/);
  assert.match(seatMapSource, /max-w-\[1920px\][\s\S]*rounded-\[30px\][\s\S]*border border-white\/10 bg-\[var\(--sp-color-canvas\)\]/);
  assert.match(seatMapSource, /lg:grid-cols-\[286px_minmax\(0,1fr\)\]/);
  assert.match(seatMapSource, /aria-label="Admin workspace rail"[\s\S]*bg-\[var\(--sp-color-workspace\)\]/);
  assert.match(seatMapSource, /border-b border-\[var\(--sp-color-border-subtle\)\] bg-\[var\(--sp-color-surface\)\]\/95/);
  assert.match(seatMapSource, /aria-label="Admin planning workspace"[\s\S]*Office Seat Planner/);
  assert.match(seatMapSource, /aria-label="Seat inventory summary"[\s\S]*stats\.total[\s\S]*stats\.assigned[\s\S]*stats\.available/);
  assert.match(seatMapSource, /Draft publication status[\s\S]*draftStatusHeadline[\s\S]*draftStatusActionLabel[\s\S]*draftStatusDescription/);
  assert.match(seatMapSource, /Command search/);
  assert.match(seatMapSource, /aria-label="Admin command row"[\s\S]*bg-\[var\(--sp-color-surface-raised\)\]\/90/);
  assert.match(seatMapSource, /aria-label="Map command actions"[\s\S]*Open filters[\s\S]*namesToggleLabel[\s\S]*aria-label="Map tools"[\s\S]*Undo last map change[\s\S]*Redo last undone change[\s\S]*\/admin\/management[\s\S]*Open Ask Planner/);
  assert.doesNotMatch(seatMapSource, /aria-label="Primary workspace controls"|aria-label="Secondary admin actions"/);
  assert.match(seatMapSource, /bg-\[var\(--sp-color-map-workspace\)\] p-2 lg:min-h-0/);
  assert.match(seatMapSource, /aria-labelledby="admin-planning-canvas-title"[\s\S]*rounded-\[24px\][\s\S]*bg-\[var\(--sp-color-surface\)\]\/55/);
  assert.match(seatMapSource, /MAP_VIEW_MODE_OPTIONS[\s\S]*Overview[\s\S]*Detail/);
  assert.match(seatMapSource, /useState<MapViewMode>\("detail"\)/);
  assert.match(seatMapSource, /aria-label="Map view mode"/);
  assert.match(seatMapSource, /rounded-\[22px\] border border-\[var\(--sp-color-border-strong\)\] bg-\[var\(--sp-color-map-workspace\)\]/);
  assert.match(seatMapSource, /bg-\[var\(--sp-color-workspace\)\]\/90 p-0\.5 text-white/);
  assert.match(seatMapSource, /mapViewMode === "overview"[\s\S]*overflow-hidden p-1\.5[\s\S]*min-h-\[360px\] max-h-\[82svh\] overflow-auto/);
  assert.match(seatMapSource, /w-\[1120px\][\s\S]*sm:w-\[1460px\][\s\S]*lg:w-\[1911px\]/);
  assert.doesNotMatch(seatMapSource, /fitMapOverview|Fit map overview|>\s*Fit map\s*</);
  assert.doesNotMatch(seatMapSource, /lg:w-\[96%\]|max-w-\[1840px\]|max-w-\[1760px\]/);
  assert.doesNotMatch(seatMapSource, /bg-\[#eef2f7\]/);
});

test("seat badges use compact map-native labels with strong active states", async () => {
  const markerSource = await readFile(new URL("../components/seat-map/SeatMarker.tsx", import.meta.url), "utf8");

  assert.match(markerSource, /function SeatToken/);
  assert.match(markerSource, /getPassiveEmployeeLabel/);
  assert.match(markerSource, /type MarkerIntent =/);
  assert.match(markerSource, /draftChanged\?: boolean/);
  assert.match(markerSource, /data-marker-intent=\{markerIntent\}/);
  assert.match(markerSource, /data-draft-changed=\{draftChanged \|\| undefined\}/);
  assert.match(markerSource, /border-\[#B7AB9E\]\/85 bg-\[#FFFDF8\]\/95/);
  assert.match(markerSource, /border-\[#C8BFB3\]\/90 bg-\[#E8E2DA\]\/\[0\.92\]/);
  assert.match(markerSource, /border-\[#D4CABF\]\/90 bg-\[#F9F5ED\]\/\[0\.86\]/);
  assert.doesNotMatch(markerSource, /bg-\[#(?:E8E2DA|F9F5ED)\]\/(?:92|86)/);
  assert.match(markerSource, /min-h-\[34px\] rounded-\[12px\]/);
  assert.match(markerSource, /w-\[92px\] max-w-\[92px\] sm:w-\[104px\]/);
  assert.match(markerSource, /overflow-visible border ring-1 ring-white\/45 backdrop-blur-\[1px\]/);
  assert.match(markerSource, /const baseStatusToneClass =/);
  assert.match(markerSource, /const statusToneClass = \(tokenMode === "selected" \|\| tokenMode === "prominent"\) \? "" : baseStatusToneClass/);
  assert.match(markerSource, /border-\[#D46A24\] bg-\[#171A1D\] text-white/);
  assert.match(markerSource, /searchSelected[\s\S]*outline-\[#2F6668\]/);
  assert.match(markerSource, /draftChanged && !selected && !searchProminent[\s\S]*bg-\[#F4E7CF\]/);
  assert.match(markerSource, /group-hover:border-\[#D46A24\]/);
  assert.match(markerSource, /group-hover:w-\[124px\]/);
  assert.match(markerSource, /group-focus-visible:w-\[124px\]/);
  assert.match(markerSource, /leading-\[1\.05\]/);
  assert.match(markerSource, /leading-\[1\.08\]/);
  assert.match(markerSource, /text-\[10px\]/);
  assert.match(markerSource, /tokenMode === "selected"[\s\S]*w-\[126px\]/);
  assert.match(markerSource, /searchProminent[\s\S]*border-\[#2F6668\] bg-\[#DCEDEA\]/);
  assert.match(markerSource, /namesVisible = showNames && hasEmployee && !dimmed/);
  assert.match(markerSource, /inlineNameLabel = expandedNameBadge \|\| \(namesVisible && tokenDensity === "standard" && !compactNameLabel\) \? employeeName : compactEmployeeName/);
  assert.match(markerSource, /\{inlineNameLabel\}/);
  assert.match(markerSource, /block min-w-0 truncate font-bold/);
});

test("selected inspector and search results stay attached to the map workspace", async () => {
  const seatMapSource = await readFile(new URL("../components/seat-map/SeatMap.tsx", import.meta.url), "utf8");
  const inspectorSource = await readFile(new URL("../components/seat-map/SeatInspector.tsx", import.meta.url), "utf8");
  const filterSource = await readFile(new URL("../components/seat-map/FilterPanel.tsx", import.meta.url), "utf8");

  assert.match(seatMapSource, /selectedResultIsVisible/);
  assert.match(seatMapSource, /resultSummaryShellClass/);
  assert.match(seatMapSource, /selectedResultIsVisible[\s\S]*rounded-xl border-\[var\(--sp-color-border-subtle\)\] bg-\[var\(--sp-color-graphite-soft\)\] text-\[var\(--sp-color-text-muted\)\] shadow-none/);
  assert.match(seatMapSource, /singleResultSeat[\s\S]*rounded-xl border-\[var\(--sp-color-state-search-border\)\] bg-\[var\(--sp-color-state-search-surface\)\]/);
  assert.match(seatMapSource, /singleResultOverlayClassName[\s\S]*border-\[var\(--sp-color-state-search-border\)\] bg-\[var\(--sp-color-state-search-surface\)\]\/95/);
  assert.match(seatMapSource, /resultActionButtonClassName = "inline-flex min-h-8 items-center justify-center rounded-lg border border-\[var\(--sp-color-border-strong\)\] bg-\[var\(--sp-color-surface-raised\)\]/);
  assert.match(seatMapSource, /resultClearButtonClassName = "inline-flex min-h-8[\s\S]*bg-\[var\(--sp-color-brand-paper\)\]/);
  assert.match(seatMapSource, /onClick=\{\(\) => fitSeatsInMap\(matchingSeats\)\}/);
  assert.match(seatMapSource, /onClick=\{\(\) => fitSeatsInMap\(\[singleResultSeat\]\)\}/);
  assert.match(seatMapSource, /detailFocusSeatId = selectedSeatId \?\? \(filtersActive && matchingSeats\.length === 1 \? matchingSeats\[0\]\.id : null\)/);
  assert.match(seatMapSource, /if \(detailFocusSeatId\) \{[\s\S]*queueCenterSeatInMap\(detailFocusSeatId\)/);
  assert.match(inspectorSource, /sm:bottom-3 sm:right-3 sm:top-\[84px\]/);
  assert.match(inspectorSource, /sm:max-h-none[\s\S]*sm:w-\[376px\][\s\S]*sm:rounded-l-\[24px\][\s\S]*sm:rounded-r-\[18px\]/);
  assert.match(inspectorSource, /sm:shadow-\[-12px_0_34px_rgba\(23,26,29,0\.18\)/);
  assert.match(inspectorSource, /bg-\[var\(--sp-color-workspace\)\][\s\S]*Planning inspector/);
  assert.match(inspectorSource, /bg-\[var\(--sp-color-brand-paper\)\][\s\S]*Draft-only impact/);
  assert.match(filterSource, /rounded-xl border border-slate-200\/80 bg-slate-50\/70 p-2 shadow-none/);
  assert.match(filterSource, /density = "panel"/);
  assert.match(filterSource, /max-h-\[196px\] space-y-1/);
  assert.match(filterSource, /max-h-\[96px\] space-y-0\.5/);
  assert.match(filterSource, /overflow-auto overscroll-contain pr-1/);
  assert.match(filterSource, /grid-cols-\[minmax\(3rem,auto\)_minmax\(0,1fr\)_auto\]/);
  assert.match(seatMapSource, /density="rail"/);
});

test("seat marker coordinates anchor one compact token instead of detached callouts", async () => {
  const markerSource = await readFile(new URL("../components/seat-map/SeatMarker.tsx", import.meta.url), "utf8");
  const seatMapSource = await readFile(new URL("../components/seat-map/SeatMap.tsx", import.meta.url), "utf8");

  assert.match(markerSource, /function SeatToken/);
  assert.match(markerSource, /function getSeatTokenDensity/);
  assert.match(markerSource, /prefix === "N"/);
  assert.match(markerSource, /prefix === "NE"/);
  assert.match(markerSource, /prefix === "W"/);
  assert.match(markerSource, /prefix === "CW"/);
  assert.match(markerSource, /prefix === "C"/);
  assert.match(markerSource, /prefix === "E"/);
  assert.match(markerSource, /prefix === "SE"/);
  assert.match(markerSource, /group absolute z-10 flex -translate-x-1\/2 -translate-y-1\/2/);
  assert.match(markerSource, /tokenPositionClass/);
  assert.match(markerSource, /viewportEdgeOffsetPx/);
  assert.match(markerSource, /tokenPositionStyle/);
  assert.match(markerSource, /markerUsesTrueCoordinate = addSeatMode \|\| moveSeatMode \|\| swapMode/);
  assert.match(markerSource, /tokenCanHugViewportEdge = showInlineName \|\| prominentToken/);
  assert.match(markerSource, /resolvedViewportEdge = markerUsesTrueCoordinate \|\| !tokenCanHugViewportEdge \? "none" : viewportEdge/);
  assert.match(markerSource, /resolvedViewportEdgeOffsetPx = markerUsesTrueCoordinate \|\| !tokenCanHugViewportEdge \? 0 : Math\.max\(0, Math\.round\(viewportEdgeOffsetPx\)\)/);
  assert.match(markerSource, /resolvedViewportEdge === "left"/);
  assert.match(markerSource, /resolvedViewportEdge === "right"/);
  assert.match(markerSource, /left: `calc\(50% \+ \$\{resolvedViewportEdgeOffsetPx\}px\)`/);
  assert.match(markerSource, /right: `calc\(50% \+ \$\{resolvedViewportEdgeOffsetPx\}px\)`/);
  assert.match(markerSource, /<SeatToken[\s\S]*z-10 isolate flex items-center justify-center/);
  assert.match(markerSource, /absolute bottom-1\.5 left-1\.5 top-1\.5 w-0\.5 rounded-full/);
  assert.match(markerSource, /prominentToken = activeMarker \|\| searchProminent \|\| plannerHighlighted/);
  assert.doesNotMatch(markerSource, /function getSeatLabelPlacement|dotTargetSizeClass|placementClasses|connector|h-1\.5 w-1\.5/);
  assert.match(seatMapSource, /if \(seatTarget\?\.dataset\.seatId\) return;/);
  assert.match(seatMapSource, /mapVisibleRange/);
  assert.match(seatMapSource, /markerEdgeBaseOffsetPx = 0/);
  assert.match(seatMapSource, /getMarkerViewportPlacement\(visualSeat\.x\)/);
  assert.match(seatMapSource, /viewportEdgeOffsetPx=\{viewportPlacement\.offsetPx\}/);
  assert.match(seatMapSource, /draftChanged=\{draftChangedSeatLabelSet\.has\(seat\.label\)\}/);
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
