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
  assert.match(drawerSource, /border-\[var\(--admin-border\)\] bg-\[var\(--admin-surface\)\] text-\[var\(--admin-text-primary\)\] hover:border-\[var\(--admin-border-strong\)\] hover:bg-\[var\(--admin-surface-alt\)\]/);
});

test("seat map uses the component-board desktop workspace shell", async () => {
  const seatMapSource = await readFile(new URL("../components/seat-map/SeatMap.tsx", import.meta.url), "utf8");

  // Claude Design: flush full-width dark top bar over a single, full-width content column
  // (the low-utility left rail is removed — map-first). Identity lives in the top bar;
  // stats + legend move into the compact canvas header.
  assert.match(seatMapSource, /flex min-h-screen flex-col overflow-x-hidden bg-\[var\(--admin-bg\)\]/);
  assert.match(seatMapSource, /mx-auto flex w-full max-w-\[1920px\] flex-1 flex-col px-2 py-2/);
  assert.doesNotMatch(seatMapSource, /lg:grid-cols-\[286px_minmax\(0,1fr\)\]/);
  assert.doesNotMatch(seatMapSource, /aria-label="Admin workspace rail"/);
  assert.match(seatMapSource, /h-\[54px\] shrink-0 items-center[\s\S]*bg-\[var\(--admin-chrome-bg\)\]/);
  assert.match(seatMapSource, /Megeredchian Law Seats/);
  assert.match(seatMapSource, /aria-label="Seat inventory summary"[\s\S]*stats\.total[\s\S]*stats\.assigned[\s\S]*stats\.available/);
  assert.match(seatMapSource, /aria-label="Seat status legend"/);
  assert.match(seatMapSource, /role="search" aria-label="Command search"/);
  assert.match(seatMapSource, /aria-label="Admin command row"[\s\S]*Open filters[\s\S]*namesToggleLabel[\s\S]*aria-label="Map tools"[\s\S]*Undo last map change[\s\S]*Redo last undone change[\s\S]*\/admin\/management[\s\S]*Open Ask Planner/);
  assert.doesNotMatch(seatMapSource, /aria-label="Primary workspace controls"|aria-label="Secondary admin actions"/);
  assert.match(seatMapSource, /bg-\[var\(--admin-surface-muted\)\] p-2 lg:min-h-0/);
  assert.match(seatMapSource, /aria-labelledby="admin-planning-canvas-title"[\s\S]*rounded-\[14px\][\s\S]*bg-\[var\(--admin-surface\)\]\/68/);
  assert.match(seatMapSource, /MAP_VIEW_MODE_OPTIONS[\s\S]*Overview[\s\S]*Detail/);
  assert.match(seatMapSource, /useState<MapViewMode>\("detail"\)/);
  assert.match(seatMapSource, /aria-label="Map view mode"/);
  assert.match(seatMapSource, /rounded-\[22px\] border border-\[var\(--admin-border-strong\)\] bg-\[var\(--admin-surface-muted\)\]/);
  assert.match(seatMapSource, /bg-\[var\(--admin-rail-bg\)\]\/90 p-0\.5 text-white/);
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
  assert.match(markerSource, /variant = "viewer"/);
  assert.match(markerSource, /draftChanged\?: boolean/);
  assert.match(markerSource, /data-marker-intent=\{markerIntent\}/);
  assert.match(markerSource, /data-draft-changed=\{draftChanged \|\| undefined\}/);
  assert.match(markerSource, /border-\[var\(--admin-marker-assigned-border\)\] bg-\[var\(--admin-marker-assigned-surface\)\]/);
  assert.match(markerSource, /border-\[#B7AB9E\]\/85 bg-\[#FFFDF8\]\/95/);
  assert.match(markerSource, /border-\[var\(--admin-marker-unavailable-border\)\] bg-\[var\(--admin-marker-unavailable-surface\)\]/);
  assert.match(markerSource, /border-\[var\(--admin-marker-available-border\)\] bg-\[var\(--admin-marker-available-surface\)\]/);
  assert.match(markerSource, /border-\[#D4CABF\]\/90 bg-\[#F9F5ED\]\/\[0\.86\]/);
  assert.doesNotMatch(markerSource, /bg-\[#(?:E8E2DA|F9F5ED)\]\/(?:92|86)/);
  assert.match(markerSource, /min-h-\[34px\] rounded-\[12px\]/);
  assert.match(markerSource, /w-\[92px\] max-w-\[92px\] sm:w-\[104px\]/);
  assert.match(markerSource, /overflow-visible border ring-1 ring-white\/45 backdrop-blur-\[1px\]/);
  assert.match(markerSource, /const baseStatusToneClass =/);
  assert.match(markerSource, /const statusToneClass = \(tokenMode === "selected" \|\| tokenMode === "prominent"\) \? "" : baseStatusToneClass/);
  assert.match(markerSource, /border-\[var\(--admin-marker-selected-border\)\] bg-\[var\(--admin-marker-selected-surface\)\] text-\[var\(--admin-marker-selected-text\)\]/);
  assert.match(markerSource, /searchSelected[\s\S]*outline-\[var\(--admin-marker-search-border\)\]/);
  assert.match(markerSource, /draftChanged && !selected && !searchProminent[\s\S]*bg-\[var\(--admin-marker-draft-surface\)\]/);
  assert.match(markerSource, /group-hover:border-\[var\(--admin-marker-hover-border\)\]/);
  assert.match(markerSource, /group-hover:w-\[124px\]/);
  assert.match(markerSource, /group-focus-visible:w-\[124px\]/);
  assert.match(markerSource, /leading-\[1\.05\]/);
  assert.match(markerSource, /leading-\[1\.08\]/);
  assert.match(markerSource, /text-\[10px\]/);
  assert.match(markerSource, /tokenMode === "selected"[\s\S]*w-\[126px\]/);
  assert.match(markerSource, /searchProminent[\s\S]*border-\[var\(--admin-marker-search-border\)\] bg-\[var\(--admin-marker-search-surface\)\]/);
  assert.match(markerSource, /namesVisible = showNames && hasEmployee && !dimmed/);
  assert.match(markerSource, /inlineNameLabel = expandedNameBadge \|\| \(namesVisible && tokenDensity === "standard" && !compactNameLabel\) \? employeeName : compactEmployeeName/);
  assert.match(markerSource, /\{inlineNameLabel\}/);
  assert.match(markerSource, /block min-w-0 truncate font-bold/);
});

test("selected inspector and search results stay attached to the map workspace", async () => {
  const seatMapSource = await readFile(new URL("../components/seat-map/SeatMap.tsx", import.meta.url), "utf8");
  const inspectorSource = await readFile(new URL("../components/seat-map/SeatInspector.tsx", import.meta.url), "utf8");
  const filterSource = await readFile(new URL("../components/seat-map/FilterPanel.tsx", import.meta.url), "utf8");
  const resultsPanelSource = await readFile(new URL("../components/seat-map/ResultsPanel.tsx", import.meta.url), "utf8");

  // Results live in the right panel slot; the searching status bar carries Fit/Clear.
  assert.match(seatMapSource, /const resultsPanelOpen = canEdit && filtersActive && !selectedSeat/);
  assert.match(seatMapSource, /resultActionButtonClassName = "inline-flex min-h-8 items-center justify-center rounded-lg border border-\[var\(--admin-border-strong\)\] bg-\[var\(--admin-surface\)\]/);
  assert.match(seatMapSource, /resultClearButtonClassName = "inline-flex min-h-8[\s\S]*bg-\[var\(--admin-primary-soft\)\]/);
  assert.match(seatMapSource, /onClick=\{\(\) => fitSeatsInMap\(matchingSeats\)\}/);
  assert.match(seatMapSource, /detailFocusSeatId = selectedSeatId \?\? \(filtersActive && matchingSeats\.length === 1 \? matchingSeats\[0\]\.id : null\)/);
  assert.match(seatMapSource, /if \(detailFocusSeatId\) \{[\s\S]*queueCenterSeatInMap\(detailFocusSeatId\)/);
  assert.match(inspectorSource, /sm:bottom-3 sm:right-3 sm:top-\[84px\]/);
  // Claude Design: narrower (360/384), flat (one soft shadow, no -16px blur slab), 14px radius.
  assert.match(inspectorSource, /sm:max-h-none[\s\S]*sm:w-\[360px\][\s\S]*sm:rounded-\[14px\]/);
  assert.match(inspectorSource, /shadow-\[0_18px_44px_rgba\(31,34,37,0\.16\)\]/);
  // Claude Design: the shared header is light (surface bg, not the old dark workspace slab).
  assert.match(inspectorSource, /sticky top-0 z-20[\s\S]*bg-\[var\(--sp-color-surface\)\][\s\S]*Seat details/);
  assert.match(inspectorSource, /aria-labelledby="seat-assignment-heading"[\s\S]*Assign this seat/);
  // Results share the inspector's right-dock geometry (panel slot) instead of a rail.
  assert.match(resultsPanelSource, /sm:bottom-3 sm:right-3 sm:top-\[84px\]/);
  assert.match(resultsPanelSource, /sm:w-\[360px\][\s\S]*xl:w-\[384px\]/);
  assert.match(resultsPanelSource, /overflow-y-auto overscroll-contain p-2/);
  assert.match(filterSource, /id="seat-map-filter-panel"/);
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
