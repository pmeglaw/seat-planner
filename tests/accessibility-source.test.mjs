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

  assert.match(source, /aria-label="Admin planning workspace"/);
  assert.match(source, /Draft publication status/);
  assert.match(source, /Draft has unpublished changes/);
  assert.match(source, /Viewer map already matches this saved draft/);
  assert.match(source, /Planning map actions/);
  assert.match(source, /Draft history controls/);
  assert.match(source, /Admin support actions/);
  assert.match(source, /Planning canvas/);
  assert.match(source, /Spatial confirmation/);
  assert.match(source, /aria-controls="seat-map-filter-panel"/);
  assert.match(source, /aria-controls="advanced-drawer"/);
  assert.match(source, /aria-controls="ask-planner-drawer"/);
  assert.match(source, /aria-haspopup="dialog"/);
  assert.match(source, /No map changes to undo/);
  assert.match(source, /No undone map changes to redo/);
  assert.match(source, /Draft matches published/);
  assert.match(source, /Draft changes:/);
  assert.match(source, /Esc exits/);
  assert.match(source, /Exit Add Seat/);
  assert.match(source, /\{canEdit \? \([\s\S]*aria-label=\{`Review \$\{draftStatusLabel\.toLowerCase\(\)\}`\}/);
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
  assert.match(seatMapSource, /\{canEdit \? \([\s\S]*draftStatusLabel/);
  assert.match(seatMapSource, /\{canEdit && \([\s\S]*<AdvancedDrawer/);
  assert.match(inspectorSource, /\{canEdit \? \([\s\S]*Actions \/ Rules/);
  assert.match(inspectorSource, /\{canEdit \? \([\s\S]*Delete seat/);
  assert.match(inspectorSource, /\{canEdit \? \([\s\S]*Vacate/);
});

test("map tools and ask planner drawers keep dialog semantics and focus targets", async () => {
  const advancedDrawerSource = await readSource("../components/seat-map/AdvancedDrawer.tsx");
  const askPlannerSource = await readSource("../components/seat-map/AskPlannerDrawer.tsx");

  assert.match(advancedDrawerSource, /id="advanced-drawer"/);
  assert.match(advancedDrawerSource, /aria-labelledby="advanced-drawer-title"/);
  assert.match(advancedDrawerSource, /aria-describedby="advanced-drawer-description"/);
  assert.match(advancedDrawerSource, /Common seat tools first\. Advanced import, recovery, and destructive utilities stay separated\./);
  assert.ok(
    advancedDrawerSource.indexOf("Common map tools") < advancedDrawerSource.indexOf("Secondary shortcuts"),
    "Common map tools should appear before secondary shortcuts."
  );
  assert.ok(
    advancedDrawerSource.indexOf("Secondary shortcuts") < advancedDrawerSource.indexOf("CSV and backups"),
    "Secondary shortcuts should stay above advanced utilities."
  );
  assert.match(advancedDrawerSource, /Publishing stays out of advanced utilities/);
  assert.doesNotMatch(advancedDrawerSource, /Publish Draft Map/);
  assert.match(advancedDrawerSource, /closeButtonRef\.current\?\.focus/);
  assert.match(advancedDrawerSource, /z-\[80\][\s\S]*sm:z-50/);

  assert.match(askPlannerSource, /id="ask-planner-drawer"/);
  assert.match(askPlannerSource, /aria-labelledby="ask-planner-title"/);
  assert.match(askPlannerSource, /aria-describedby="ask-planner-description"/);
  assert.match(askPlannerSource, /questionRef\.current\.focus/);
  assert.match(askPlannerSource, /z-\[80\][\s\S]*sm:z-50/);
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
  const filterSource = await readSource("../components/seat-map/FilterPanel.tsx");

  assert.match(inspectorSource, /aria-label=\{`View details for \$\{selectedSeat\.label\}`\}/);
  assert.match(inspectorSource, /aria-label=\{`Back to map from \$\{selectedSeat\.label\} details`\}/);
  assert.match(inspectorSource, /aria-label=\{`Ask Planner about \$\{selectedSeat\.label\}`\}/);
  assert.match(inspectorSource, /z-\[80\][\s\S]*sm:z-40/);
  assert.match(inspectorSource, /z-\[90\][\s\S]*sm:z-\[70\]/);
  assert.match(inspectorSource, /Seat Summary/);
  assert.match(inspectorSource, /Planning inspector/);
  assert.match(inspectorSource, /Draft-only impact/);
  assert.match(inspectorSource, /Viewers see changes after review and publish/);
  assert.match(inspectorSource, /Assignment workflow/);
  assert.match(inspectorSource, /aria-labelledby="seat-assignment-heading"/);
  assert.match(inspectorSource, /id=\{employeeHelpId\}/);
  assert.match(inspectorSource, /id=\{employeeStateId\}/);
  assert.match(inspectorSource, /aria-describedby=\{employeeNameDescribedBy\}/);
  assert.match(inspectorSource, /id="seat-inspector-new-employee-notice" role="note"/);
  assert.match(inspectorSource, /Published Assignment/);
  assert.match(inspectorSource, /Seat Metadata/);
  assert.match(inspectorSource, /Actions \/ Rules/);
  assert.match(inspectorSource, /No unsaved changes\./);
  assert.match(inspectorSource, /Saved to draft/);
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

  assert.match(filterSource, /aria-label="People results"/);
  assert.match(filterSource, /aria-label=\{resultActionLabel\}/);
  assert.match(filterSource, /No assigned seat to open/);
});

test("unsaved inspector changes use an explicit save discard keep-editing guard", async () => {
  const source = await readSource("../components/seat-map/SeatMap.tsx");
  const drawerSource = await readSource("../components/seat-map/AdvancedDrawer.tsx");

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
  assert.match(source, /Opened \$\{seat\.label\} from \$\{action\.sourceLabel\}\./);
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
  assert.match(drawerSource, /onBeforeManagementNavigation/);
  assert.match(drawerSource, /event\.preventDefault\(\)/);
  assert.doesNotMatch(source, /You have unsaved seat edits\. Discard them\?/);
});

test("admin search and filter confidence controls stay accessible and admin-scoped", async () => {
  const seatMapSource = await readSource("../components/seat-map/SeatMap.tsx");
  const filterSource = await readSource("../components/seat-map/FilterPanel.tsx");

  assert.match(filterSource, /export function ActiveFilterChips/);
  assert.match(filterSource, /aria-label="Active filters"/);
  assert.match(filterSource, /aria-label=\{chip\.removeLabel\}/);
  assert.match(filterSource, /Clear all/);
  assert.match(filterSource, /export function SeatResultsList/);
  assert.match(filterSource, /titleId = "seat-results-title"/);
  assert.match(filterSource, /aria-label="Seat results"/);
  assert.match(filterSource, /Select and center on map/);
  assert.match(filterSource, /onKeyDown=\{event =>/);
  assert.match(filterSource, /event\.key === "Enter"/);
  assert.match(filterSource, /id="mobile-seat-results"/);
  assert.match(filterSource, /titleId="mobile-seat-results-title"/);

  assert.match(seatMapSource, /function removeActiveFilterChip/);
  assert.match(seatMapSource, /aria-label="Admin workspace rail"/);
  assert.match(seatMapSource, /aria-label="Admin command row"/);
  assert.match(seatMapSource, /aria-label="Map command actions"/);
  assert.match(seatMapSource, /aria-label="Planning map actions"/);
  assert.match(seatMapSource, /aria-label="Draft history controls"/);
  assert.match(seatMapSource, /aria-label="Admin support actions"/);
  assert.doesNotMatch(seatMapSource, /aria-label="Primary workspace controls"|aria-label="Secondary admin actions"/);
  assert.match(seatMapSource, /setDepartment\("all"\)/);
  assert.match(seatMapSource, /setZone\("all"\)/);
  assert.match(seatMapSource, /setStatus\("all"\)/);
  assert.match(seatMapSource, /showSearchNoQueryHint/);
  assert.match(seatMapSource, /showSearchNoQueryHint = canEdit && searchFocused && !searchActive && !selectedSeatId/);
  assert.match(seatMapSource, /Search the draft map/);
  assert.match(seatMapSource, /function openSeatFromResults/);
  assert.match(seatMapSource, /queueCenterSeatInMap\(seatId\)/);
  assert.match(seatMapSource, /setResultRailCollapsed\(true\)/);
  assert.match(seatMapSource, /No search results/);
  assert.match(seatMapSource, /No filter results/);
  assert.match(seatMapSource, /No combined results/);
  assert.match(seatMapSource, /Fit results unavailable because there are no matching seats/);
  assert.match(seatMapSource, /singleResultSeat = filtersActive && matchingSeats\.length === 1 \? matchingSeats\[0\] : null/);
  assert.match(seatMapSource, /const desktopInspectorOpen = canEdit && Boolean\(selectedSeat && !inspectorCollapsed\)/);
  assert.match(seatMapSource, /const desktopInspectorReserveMarginClassName = desktopInspectorOpen \? "lg:mr-\[26\.5rem\] xl:mr-\[27\.75rem\]" : ""/);
  assert.match(seatMapSource, /const desktopInspectorReservePaddingClassName = desktopInspectorOpen \? "lg:pr-\[26\.5rem\] xl:pr-\[27\.75rem\]" : ""/);
  assert.match(seatMapSource, /const mobileMapInteractionSurfaceOpen = canEdit && \(/);
  assert.match(seatMapSource, /const mobileMapControlsHidden = mobileMapInteractionSurfaceOpen;/);
  assert.match(seatMapSource, /mobileMapControlsHidden \? "hidden sm:flex" : ""/);
  assert.match(seatMapSource, /mobileMapControlsHidden \? "hidden sm:block" : ""/);
  assert.match(seatMapSource, /const resultSummaryShellClass = \[[\s\S]*desktopInspectorReserveMarginClassName[\s\S]*\]\.filter\(Boolean\)\.join\(" "\)/);
  assert.match(seatMapSource, /const singleResultOverlayShellClassName = \[[\s\S]*desktopInspectorReservePaddingClassName[\s\S]*\]\.filter\(Boolean\)\.join\(" "\)/);
  assert.match(seatMapSource, /const activeModeBannerClassName = \[[\s\S]*desktopInspectorReserveMarginClassName[\s\S]*\]\.filter\(Boolean\)\.join\(" "\)/);
  assert.match(seatMapSource, /className=\{singleResultOverlayShellClassName\}/);
  assert.match(seatMapSource, /className=\{activeModeBannerClassName\}/);
  assert.match(seatMapSource, /className=\{desktopResultRailClassName\}/);
  assert.match(seatMapSource, /className=\{mapMarkerLayerClassName\}/);
  assert.match(seatMapSource, /showSeatResults=\{canEdit && filtersActive && !singleResultSeat\}/);
  assert.match(seatMapSource, /\{canEdit && filtersActive && !singleResultSeat && !resultRailCollapsed && \(/);
  assert.match(seatMapSource, /Fit result/);
  assert.match(seatMapSource, /onClick=\{\(\) => selectSeatResult\(singleResultSeat\.id\)\}/);
  assert.match(seatMapSource, /autoSelectedSearchKeyRef/);
  assert.match(seatMapSource, /Auto-selected \$\{singleResultSeat\.label\} for/);
  assert.match(seatMapSource, /const changingSelectedSeat = selectedSeatId !== singleResultSeat\.id/);
  assert.match(seatMapSource, /selectedSeatId && changingSelectedSeat && inspectorDirty/);
  assert.match(seatMapSource, /if \(changingSelectedSeat\) setInspectorDirty\(false\)/);
  assert.match(seatMapSource, /matchingSeats\.length <= 1/);
  assert.match(seatMapSource, /aria-controls="seat-results-rail"/);
  assert.match(seatMapSource, /id="seat-results-rail"/);
  assert.match(seatMapSource, /titleId="seat-results-rail-title"/);
  assert.match(seatMapSource, /id="mobile-seat-results-tray"/);
  assert.match(filterSource, /aria-label="Back to map from seat results"/);
  assert.match(filterSource, /relative z-\[70\][\s\S]*lg:z-auto/);
  assert.match(seatMapSource, /onSeatResultSelect=\{selectSeatResult\}/);
});

test("admin search clear controls use one clear path with distinct accessible names", async () => {
  const seatMapSource = await readSource("../components/seat-map/SeatMap.tsx");
  const filterSource = await readSource("../components/seat-map/FilterPanel.tsx");
  const clearSearchFunction = seatMapSource.match(/function clearSearch\(\) \{[\s\S]*?\n  \}/);

  assert.ok(clearSearchFunction, "clearSearch should remain source-visible.");
  assert.match(clearSearchFunction[0], /setSearch\(""\)/);
  assert.match(clearSearchFunction[0], /setSearchSelectionNotice\(null\)/);
  assert.match(seatMapSource, /aria-label="Clear top search"[\s\S]*onClick=\{clearSearch\}/);
  assert.equal((seatMapSource.match(/searchActive \? "Clear search results"/g) ?? []).length, 2);
  assert.equal((seatMapSource.match(/onClearSearch=\{clearSearch\}/g) ?? []).length, 3);
  assert.match(seatMapSource, /onClearSearchContext=\{searchActive \? clearSearch : clearStructuredFilters\}/);
  assert.match(filterSource, /onClick=\{onClearSearch\} aria-label="Clear search in empty results"/);
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
