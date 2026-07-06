import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readSource(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("viewer route renders the published map as read-only", async () => {
  const viewerSource = await readSource("../app/page.tsx");
  const adminSource = await readSource("../app/admin/page.tsx");
  const viewerFinderSource = await readSource("../components/seat-map/ViewerSeatFinder.tsx");

  assert.match(viewerSource, /\.eq\("layer", "published"\)/);
  assert.match(viewerSource, /<ViewerSeatFinder/);
  assert.doesNotMatch(viewerSource, /<SeatMap/);
  assert.match(viewerFinderSource, /Read-only/);
  assert.match(viewerFinderSource, /Published/);
  assert.doesNotMatch(viewerFinderSource, /createSeatAction|deleteSeatAction|moveSeatAction|publishSeatMapAction|restoreDraftSnapshotAction|swapSeatAssignmentsAction/);
  assert.match(adminSource, /\.eq\("layer", "draft"\)/);
  assert.match(adminSource, /\.eq\("layer", "published"\)/);
  assert.match(adminSource, /publishedSeats=\{\(publishedSeats \?\? \[\]\) as SeatWithEmployee\[\]\}/);
  assert.match(adminSource, /canEdit\s*\/>/);
});

test("admin planning shell exposes status, panel relationships, and undo redo explanations", async () => {
  const source = await readSource("../components/seat-map/SeatMap.tsx");

  // Claude Design: identity moves into the top bar; the publish status is the top-bar
  // Review/Published pill; the bordered nested groups collapse into one flat text toolbar.
  assert.match(source, /Megeredchian Law Seats/);
  assert.match(source, /Review changes/);
  assert.match(source, /aria-label="Admin command row"/);
  assert.match(source, /aria-label="Undo last map change"/);
  assert.match(source, /aria-label="Redo last undone change"/);
  assert.match(source, /Planning canvas/);
  assert.match(source, /aria-label="Seat status legend"/);
  assert.match(source, /aria-controls="seat-map-filter-panel"/);
  assert.match(source, /aria-label="Open settings"/);
  assert.match(source, /aria-controls="ask-planner-drawer"/);
  assert.match(source, /aria-haspopup="dialog"/);
  assert.match(source, /No map changes to undo/);
  assert.match(source, /No undone map changes to redo/);
  assert.match(source, /Draft matches published/);
  assert.match(source, /Draft changes:/);
  assert.match(source, /Esc exits/);
  assert.match(source, /Exit Add Seat/);
  assert.match(source, /\{canEdit && \([\s\S]*aria-label=\{`Review \$\{draftStatusLabel\.toLowerCase\(\)\}`\}/);
  assert.match(source, /Undo \{lastUndoLabel\}/);
  assert.match(source, /onClick=\{undoDraftEdit\}/);
});

test("active modes exit after dialogs and keep visible exit controls", async () => {
  const source = await readSource("../components/seat-map/SeatMap.tsx");
  const publishDialogIndex = source.indexOf("if (publishReviewOpen)");
  const activeModeIndex = source.indexOf("if (addSeatMode || moveSeatMode || swapSourceSeatId)");

  assert.ok(publishDialogIndex >= 0, "Escape handler should check publish review.");
  assert.ok(activeModeIndex >= 0, "Escape handler should check active map modes.");
  assert.ok(publishDialogIndex < activeModeIndex, "Dialogs should receive Escape before active map modes.");
  assert.match(source, /label: "Add Seat"[\s\S]*exitLabel: "Exit Add Seat"/);
  assert.match(source, /label: "Move Seat"[\s\S]*exitLabel: "Exit Move Seat"/);
  assert.match(source, /label: "Swap Seats"[\s\S]*exitLabel: "Exit Swap Seats"/);
});

test("viewer rendering path stays isolated from admin-only draft and delete controls", async () => {
  const viewerSource = await readSource("../app/page.tsx");
  const viewerFinderSource = await readSource("../components/seat-map/ViewerSeatFinder.tsx");
  const seatMapSource = await readSource("../components/seat-map/SeatMap.tsx");
  const inspectorSource = await readSource("../components/seat-map/SeatInspector.tsx");

  assert.match(viewerSource, /ViewerSeatFinder/);
  assert.match(viewerFinderSource, /Search published seating/);
  assert.match(viewerFinderSource, /aria-label="Viewer search results"/);
  assert.match(viewerFinderSource, /aria-live="polite"/);
  assert.match(viewerFinderSource, /highlightedDescription="Highlighted search result"/);
  assert.doesNotMatch(viewerFinderSource, /Map tools|Undo|Redo|CSV|JSON|Draft|Publish changes|Vacate|Delete seat|Ask Planner/);
  assert.match(seatMapSource, /\{canEdit && \([\s\S]*draftStatusLabel/);
  assert.match(seatMapSource, /\{canEdit && \([\s\S]*<AskPlannerDrawer/);
  assert.match(inspectorSource, /\{canEdit \? \([\s\S]*Swap seat/);
  assert.match(inspectorSource, /\{canEdit \? \([\s\S]*Delete seat/);
  assert.match(inspectorSource, /\{canEdit \? \([\s\S]*Vacate/);
});

test("ask planner drawer and settings review dialogs keep dialog semantics and focus targets", async () => {
  const askPlannerSource = await readSource("../components/seat-map/AskPlannerDrawer.tsx");
  const settingsPanelSource = await readSource("../components/admin-settings/DataUtilitiesPanel.tsx");

  assert.match(askPlannerSource, /id="ask-planner-drawer"/);
  assert.match(askPlannerSource, /aria-labelledby="ask-planner-title"/);
  assert.match(askPlannerSource, /aria-describedby="ask-planner-description"/);
  assert.match(askPlannerSource, /questionRef\.current\.focus/);
  assert.match(askPlannerSource, /z-\[80\][\s\S]*sm:z-50/);

  // Map tools is retired (B1/B2): the gated Settings route hosts the data
  // utilities, and both review flows keep proper dialog semantics.
  assert.match(settingsPanelSource, /aria-labelledby="csv-import-review-title"/);
  assert.match(settingsPanelSource, /aria-describedby="csv-import-review-description"/);
  assert.match(settingsPanelSource, /aria-labelledby="json-restore-review-title"/);
  assert.match(settingsPanelSource, /aria-describedby="json-restore-review-description"/);
});

test("publish review summarizes draft changes before publish", async () => {
  const source = await readSource("../components/seat-map/SeatMap.tsx");

  assert.match(source, /buildPublishChangeSummary\(localSeats, localPublishedSeats\)/);
  assert.match(source, /aria-labelledby="publish-review-title"/);
  assert.match(source, /Review draft before publishing/);
  assert.match(source, /Confirm the saved draft changes before they become visible in the read-only viewer/);
  assert.match(source, /Ready to publish reviewed changes/);
  assert.match(source, /Draft and viewer map are in sync/);
  assert.match(source, /Publishing copies the saved draft map to the read-only viewer/);
  assert.match(source, /Until you publish, viewers keep seeing the currently published map/);
  assert.match(source, /Publish did not complete/);
  assert.match(source, /Publishing reviewed draft changes/);
  assert.match(source, /formatPublishChangeUnit\(value\)/);
  assert.match(source, /value === 1 \? "change" : "changes"/);
  assert.match(source, /\{actionError && !pending && \(/);
  assert.match(source, /Retry publish/);
  assert.match(source, /Count note:/);
  assert.match(source, /Impact groups can overlap/);
  assert.match(source, /Use Total publish changes below as the unique publish-summary total/);
  assert.match(source, /No draft changes to publish/);
  assert.match(source, /disabled=\{pending \|\| !publishSummary\.hasChanges\}/);
  assert.match(source, /People affected/);
  assert.match(source, /Seat inventory/);
  assert.match(source, /Metadata/);
  assert.match(source, /Added seats/);
  assert.match(source, /Removed seats/);
  assert.match(source, /Assignment changes/);
  assert.match(source, /Vacated seats/);
  assert.match(source, /Seat moves\/layout changes/);
  assert.match(source, /Status changes/);
  assert.match(source, /Other draft changes/);
  assert.match(source, /Publish review blocked: Save or discard the selected seat edits before publishing/);
  assert.match(source, /Save or discard the selected seat edits before publishing/);
  assert.doesNotMatch(source, /Publish draft map to the viewer-facing seat map\?/);
});

test("publish workflow stays server-action gated and clears review history state", async () => {
  const seatMapSource = await readSource("../components/seat-map/SeatMap.tsx");
  const actionSource = await readSource("../app/actions.ts");
  const openPublishFunction = seatMapSource.match(/function openPublishReview\(\) \{[\s\S]*?function confirmPublishDraftMap/);
  const confirmPublishFunction = seatMapSource.match(/function confirmPublishDraftMap\(\) \{[\s\S]*?\n  \}/);
  const publishAction = actionSource.match(/export async function publishSeatMapAction\(\) \{[\s\S]*?\n\}/);

  assert.ok(openPublishFunction, "openPublishReview should remain source-visible.");
  assert.ok(confirmPublishFunction, "confirmPublishDraftMap should remain source-visible.");
  assert.ok(publishAction, "publishSeatMapAction should remain source-visible.");

  assert.match(openPublishFunction[0], /if \(inspectorDirty\) \{[\s\S]*Publish review blocked: Save or discard the selected seat edits before publishing/);
  assert.match(seatMapSource, /function confirmPublishDraftMap\(\) \{[\s\S]*setActionError\(null\);\s*setActionNotice\(null\);\s*startTransition/);
  assert.match(seatMapSource, /onClick=\{confirmPublishDraftMap\}[\s\S]*disabled=\{pending \|\| !publishSummary\.hasChanges\}/);
  assert.match(confirmPublishFunction[0], /await publishSeatMapAction\(\)/);
  assert.match(confirmPublishFunction[0], /setLocalPublishedSeats\(nextPublishedSeats\)/);
  assert.match(confirmPublishFunction[0], /setDraftHistory\(clearDraftHistory\(\)\)/);
  assert.match(confirmPublishFunction[0], /setPublishReviewOpen\(false\)/);
  assert.match(confirmPublishFunction[0], /Draft map published\. Undo\/Redo history was cleared\./);
  assert.doesNotMatch(confirmPublishFunction[0], /supabase|\.from\("seats"\)|publish_seat_map/);

  assert.match(publishAction[0], /const supabase = await requireAdmin\(\)/);
  assert.match(publishAction[0], /\.rpc\("publish_seat_map"\)/);
  assert.match(publishAction[0], /revalidatePath\("\/"\)/);
  assert.match(publishAction[0], /revalidatePath\("\/admin"\)/);
  assert.doesNotMatch(publishAction[0], /\.from\("seats"\)|\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
});

test("seat markers remain keyboard buttons with contextual accessible labels", async () => {
  const source = await readSource("../components/seat-map/SeatMarker.tsx");

  assert.match(source, /<button[\s\S]*type="button"/);
  assert.match(source, /aria-pressed=\{selected\}/);
  assert.match(source, /aria-label=\{`\$\{seat\.label\}: \$\{displayName\}\. \$\{seat\.status\} seat\./);
  assert.match(source, /Search result\./);
  assert.match(source, /highlightedDescription = "Highlighted by Ask Planner"/);
  assert.match(source, /\$\{highlightedDescription\}\./);
  assert.match(source, /Selected\./);
  assert.match(source, /focus-visible:ring-4/);
});

test("inspector sections, validation, and actions retain accessible confidence cues", async () => {
  const inspectorSource = await readSource("../components/seat-map/SeatInspector.tsx");
  const resultsPanelSource = await readSource("../components/seat-map/ResultsPanel.tsx");

  assert.match(inspectorSource, /aria-label=\{`View details for \$\{selectedSeat\.label\}`\}/);
  assert.match(inspectorSource, /aria-label=\{`Back to map from \$\{selectedSeat\.label\} details`\}/);
  assert.match(inspectorSource, /aria-label=\{`Ask Planner about \$\{selectedSeat\.label\}`\}/);
  assert.match(inspectorSource, /z-\[80\][\s\S]*sm:z-40/);
  assert.match(inspectorSource, /z-\[90\][\s\S]*sm:z-\[70\]/);
  assert.match(inspectorSource, /hasCurrentAssignment \? "Assignment" : "Assign this seat"/);
  assert.match(inspectorSource, /aria-labelledby="seat-assignment-heading"/);
  assert.match(inspectorSource, /id=\{employeeHelpId\}/);
  assert.match(inspectorSource, /id=\{employeeStateId\}/);
  assert.match(inspectorSource, /aria-describedby=\{employeeNameDescribedBy\}/);
  assert.match(inspectorSource, /id="seat-inspector-new-employee-notice" role="note"/);
  assert.match(inspectorSource, /Published assignment/);
  assert.match(inspectorSource, /Status &amp; notes/);
  assert.match(inspectorSource, /No unsaved changes\./);
  // The verbose repeated panels are gone (Claude Design cleanup).
  assert.doesNotMatch(inspectorSource, /Seat Summary|Planning inspector|Draft-only impact|Assignment workflow|Actions \/ Rules/);
  assert.match(inspectorSource, /isProtectedOriginalSeatLabel/);
  assert.match(inspectorSource, /Protected original/);
  assert.match(inspectorSource, /Fix the highlighted inspector fields before saving/);
  assert.match(inspectorSource, /Review inspector fields/);
  assert.match(inspectorSource, /errorSummaryRef\.current\?\.focus\(\)/);
  assert.match(inspectorSource, /focusInspectorField\(error\.field\)/);
  assert.match(inspectorSource, /aria-invalid=\{Boolean\(fieldErrorMap\.employeeName\)\}/);
  assert.match(inspectorSource, /Add an employee name before saving assignment details\./);
  assert.match(inspectorSource, /aria-describedby=\{saveDisabledReason \? "seat-inspector-save-help" : undefined\}/);
  assert.match(inspectorSource, /getSeatDeleteBlockReason/);
  assert.match(inspectorSource, /Delete seat/);
  assert.match(inspectorSource, /aria-describedby="seat-inspector-delete-help"/);
  assert.match(inspectorSource, /whitespace-normal rounded-xl leading-tight/);
  assert.doesNotMatch(inspectorSource, /Discard unsaved inspector edits before deleting this custom seat/);

  assert.match(resultsPanelSource, /aria-label="Admin search results"/);
  assert.match(resultsPanelSource, /No assigned seat to open/);
});

test("unsaved inspector changes use an explicit save discard keep-editing guard", async () => {
  const source = await readSource("../components/seat-map/SeatMap.tsx");

  assert.match(source, /type InspectorGuardAction/);
  assert.match(source, /function focusSeatMarker/);
  assert.match(source, /document\.querySelector<HTMLButtonElement>\(`\[data-seat-id="\$\{seatId\}"\]`\)\?\.focus\(\)/);
  assert.match(source, /focusSeatMarker\(seatIdToFocus\)/);
  assert.match(source, /function requestInspectorGuard/);
  assert.match(source, /requestInspectorGuard\(\{ kind: "select-seat", seatId \}\)/);
  assert.match(source, /requestInspectorGuard\(\{ kind: "select-seat", seatId, center: true, sourceLabel \}\)/);
  assert.match(source, /requestInspectorGuard\(\{ kind: "close-inspector" \}\)/);
  assert.match(source, /requestInspectorGuard\(\{ kind: "start-add-seat" \}\)/);
  assert.match(source, /requestInspectorGuard\(\{ kind: "start-move-seat" \}\)/);
  assert.match(source, /requestInspectorGuard\(\{ kind: "start-swap-seat" \}\)/);
  assert.match(source, /requestInspectorGuard\(\{ kind: "navigate-management" \}\)/);
  assert.match(source, /queueCenterSeatInMap\(action\.seatId\)/);
  assert.match(source, /Save or discard the selected seat edits before publishing/);
  assert.match(source, /window\.location\.assign\("\/admin\/management"\)/);
  assert.match(source, /id="inspector-unsaved-title"/);
  assert.match(source, /Unsaved seat edits/);
  assert.match(source, /Save changes/);
  assert.match(source, /Discard/);
  assert.match(source, /Keep editing/);
  assert.match(source, /form\.requestSubmit\(\)/);
  assert.match(source, /onSubmitBlocked=\{cancelPendingInspectorGuardAction\}/);
  assert.match(source, /setPendingInspectorSaveAction\(null\)/);
  assert.match(source, /href="\/admin\/management"[\s\S]{0,220}beforeManagementNavigation\(\)\) event\.preventDefault\(\)/);
  assert.match(source, /href="\/admin\/settings"[\s\S]{0,320}beforeManagementNavigation\(\)\) event\.preventDefault\(\)/);
  assert.doesNotMatch(source, /You have unsaved seat edits\. Discard them\?/);
});

test("admin search and filter confidence controls stay accessible and admin-scoped", async () => {
  const seatMapSource = await readSource("../components/seat-map/SeatMap.tsx");
  const filterSource = await readSource("../components/seat-map/FilterPanel.tsx");
  const resultsPanelSource = await readSource("../components/seat-map/ResultsPanel.tsx");

  assert.match(filterSource, /export function ActiveFilterChips/);
  assert.match(filterSource, /aria-label="Active filters"/);
  assert.match(filterSource, /aria-label=\{chip\.removeLabel\}/);
  assert.match(filterSource, /Clear all/);
  // Results moved out of the left filter panel into the right panel slot (B3/F1).
  assert.doesNotMatch(filterSource, /SeatResultsList|People results|employeeResults/);
  assert.match(resultsPanelSource, /aria-labelledby="admin-results-title"/);
  assert.match(resultsPanelSource, /role="list"/);
  assert.match(resultsPanelSource, /aria-label="Admin search results"/);
  assert.match(resultsPanelSource, /ArrowDown/);
  assert.match(resultsPanelSource, /ArrowUp/);
  assert.match(resultsPanelSource, /Show on map/);

  assert.match(seatMapSource, /function removeActiveFilterChip/);
  assert.match(seatMapSource, /aria-label="Admin command row"/);
  assert.match(seatMapSource, /role="search" aria-label="Command search"/);
  assert.doesNotMatch(seatMapSource, /aria-label="Map tools"/);
  assert.doesNotMatch(seatMapSource, /aria-label="Admin workspace rail"/);
  assert.doesNotMatch(seatMapSource, /aria-label="Primary workspace controls"|aria-label="Secondary admin actions"/);
  assert.doesNotMatch(seatMapSource, /aria-label="Map command actions"|aria-label="Planning map actions"/);
  assert.match(seatMapSource, /setDepartment\("all"\)/);
  assert.match(seatMapSource, /setZone\("all"\)/);
  assert.match(seatMapSource, /setStatus\("all"\)/);
  // The map-pushing search hint card is removed; the input placeholder carries the guidance.
  assert.doesNotMatch(seatMapSource, /Search the draft map/);
  assert.match(seatMapSource, /placeholder="Search people, seats, departments, or zones"/);
  assert.match(seatMapSource, /function openSeatFromResults/);
  assert.match(seatMapSource, /queueCenterSeatInMap\(seatId\)/);
  assert.match(seatMapSource, /No search results/);
  assert.match(seatMapSource, /No filter results/);
  assert.match(seatMapSource, /No combined results/);
  assert.match(seatMapSource, /Fit matches unavailable because there are no matching seats/);
  // Panel slot: one occupant at a time - results (search/filters, no selection) or the inspector.
  assert.match(seatMapSource, /const resultsPanelOpen = canEdit && filtersActive && !selectedSeat/);
  assert.match(seatMapSource, /const desktopPanelSlotOpen = desktopInspectorOpen \|\| resultsPanelOpen/);
  assert.match(seatMapSource, /const desktopInspectorOpen = canEdit && Boolean\(selectedSeat && !inspectorCollapsed\)/);
  assert.match(seatMapSource, /const desktopInspectorReserveMarginClassName = desktopPanelSlotOpen \? "sm:mr-\[28rem\] xl:mr-\[29\.5rem\]" : ""/);
  assert.match(seatMapSource, /const canvasBannerSafeAreaClassName = desktopInspectorReserveMarginClassName/);
  assert.match(seatMapSource, /const mobileMapInteractionSurfaceOpen = canEdit && \(/);
  assert.match(seatMapSource, /const mobileMapControlsHidden = mobileMapInteractionSurfaceOpen;/);
  assert.match(seatMapSource, /mobileMapControlsHidden \? "hidden sm:block" : ""/);
  assert.match(seatMapSource, /const activeModeBannerClassName = \[[\s\S]*canvasBannerSafeAreaClassName[\s\S]*\]\.filter\(Boolean\)\.join\(" "\)/);
  assert.match(seatMapSource, /const actionErrorBannerClassName = \[[\s\S]*canvasBannerSafeAreaClassName[\s\S]*\]\.filter\(Boolean\)\.join\(" "\)/);
  assert.match(seatMapSource, /const actionNoticeBannerClassName = \[[\s\S]*canvasBannerSafeAreaClassName[\s\S]*\]\.filter\(Boolean\)\.join\(" "\)/);
  assert.match(seatMapSource, /className=\{activeModeBannerClassName\}/);
  assert.match(seatMapSource, /className=\{actionErrorBannerClassName\}/);
  assert.match(seatMapSource, /className=\{actionNoticeBannerClassName\}/);
  assert.match(seatMapSource, /className=\{mapMarkerLayerClassName\}/);
  // INV-2: no auto-select - a single match stays in results until an explicit open.
  assert.doesNotMatch(seatMapSource, /singleResultSeat|autoSelectedSearchKeyRef|Auto-selected/);
  // INV-1: typing a search evicts the open inspector (unsaved edits keep the guard).
  assert.match(seatMapSource, /if \(value\.trim\(\) && selectedSeatId && !inspectorDirty\) \{/);
  assert.match(seatMapSource, /\{resultsPanelOpen && \(/);
  assert.match(seatMapSource, /onOpen=\{selectSeatResult\}/);
  assert.match(seatMapSource, /onShowOnMap=\{queueCenterSeatInMap\}/);
});

test("admin search clear controls use one clear path with distinct accessible names", async () => {
  const seatMapSource = await readSource("../components/seat-map/SeatMap.tsx");
  const resultsPanelSource = await readSource("../components/seat-map/ResultsPanel.tsx");
  const clearSearchFunction = seatMapSource.match(/function clearSearch\(\) \{[\s\S]*?\n  \}/);

  assert.ok(clearSearchFunction, "clearSearch should remain source-visible.");
  assert.match(clearSearchFunction[0], /setSearch\(""\)/);
  assert.match(seatMapSource, /aria-label="Clear top search"[\s\S]*onClick=\{clearSearch\}/);
  assert.equal((seatMapSource.match(/searchActive \? "Clear search results"/g) ?? []).length, 1);
  assert.equal((seatMapSource.match(/onClearSearch=\{clearSearch\}/g) ?? []).length, 1);
  assert.match(seatMapSource, /onClearSearchContext=\{searchActive \? clearSearch : clearStructuredFilters\}/);
  assert.match(resultsPanelSource, /onClick=\{onClearSearch\}/);
});

test("custom seat deletion remains guarded by the parent map action", async () => {
  const source = await readSource("../components/seat-map/SeatMap.tsx");
  const deleteFunction = source.match(/function deleteSelectedSeat\(\) \{[\s\S]*?function openPublishReview/);

  assert.ok(deleteFunction, "deleteSelectedSeat should remain source-visible.");
  assert.match(deleteFunction[0], /Save or discard the selected seat edits before deleting a custom seat\./);
  assert.match(deleteFunction[0], /getSeatDeleteBlockReason\(selectedSeat\)/);
  assert.match(deleteFunction[0], /if \(!canDeleteSeat\(selectedSeat\)\)/);
  assert.match(deleteFunction[0], /setDeleteSeatConfirm\(\{ seatId: selectedSeat\.id, label: selectedSeat\.label \}\)/);
  assert.match(deleteFunction[0], /function confirmDeleteSelectedSeat\(\)/);
  assert.match(deleteFunction[0], /deleteSeatAction\(seatToDelete\.id\)/);
  assert.match(deleteFunction[0], /setActionNotice\(`Deleted custom seat \$\{deletedSeatLabel\}\. Undo is available until publish\.`\)/);
  assert.match(source, /aria-labelledby="delete-seat-confirm-title"/);
  assert.match(source, /Cancel custom seat deletion/);
});
