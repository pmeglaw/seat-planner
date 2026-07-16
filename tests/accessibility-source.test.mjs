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
  assert.match(source, /aria-label="Command search"/);
  assert.match(source, /aria-label="Admin command row"/);
  assert.match(source, /aria-label="Undo last map change"/);
  assert.match(source, /aria-label="Redo last undone change"/);
  assert.match(source, /Planning canvas/);
  assert.match(source, /aria-label="Seat status legend"/);
  assert.match(source, /aria-controls="seat-map-filter-panel"/);
  // Settings lives behind the identity chip (owner preference — data
  // utilities are management-adjacent, not a peer nav item). The avatar shape
  // doesn't announce its purpose, so the chip link MUST stay labeled and
  // route through the unsaved-edits guard; the viewer keeps a decorative twin.
  assert.match(source, /aria-label="Open settings"/);
  assert.match(source, /<Link\s+href="\/admin\/settings"\s+aria-label="Open settings"[\s\S]{0,400}beforeAdminPageNavigation\("\/admin\/settings", "Settings"\)[\s\S]{0,600}>\s*A\s*<\/Link>/);
  assert.doesNotMatch(source, /className=\{chromeToolbarBtnCollapsibleXl\}[\s\S]{0,220}Settings\s*<\/Link>/);
  assert.match(source, /aria-controls="ask-planner-drawer"/);
  assert.match(source, /aria-haspopup="dialog"/);
  assert.match(source, /No map changes to undo/);
  assert.match(source, /No undone map changes to redo/);
  assert.match(source, /Draft matches published/);
  assert.match(source, /unpublished \$\{publishSummary\.totalChangeCount === 1 \? "change" : "changes"\}/);
  assert.match(source, /Esc exits/);
  assert.match(source, /Exit Add Seat/);
  // Publish chip contract (2026-07-16 critique, fix 3): with changes it is the
  // review entry point; idle it is a DISCLOSURE for the status popover — a
  // status indicator must not launch the publish workflow modal.
  assert.match(source, /\{canEdit && \([\s\S]*aria-label=\{publishSummary\.hasChanges \? `Review \$\{draftStatusLabel\.toLowerCase\(\)\}` : `Publish status: \$\{draftStatusLabel\.toLowerCase\(\)\}`\}/);
  assert.match(source, /if \(publishSummary\.hasChanges\) \{\s*openPublishReview\(\);\s*return;\s*\}\s*setPublishStatusOpen\(current => !current\);/);
  assert.match(source, /id="publish-status-popover"[\s\S]{0,300}aria-label="Publish status"/);
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
  assert.match(viewerFinderSource, /Search office seating/);
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

test("seat maps use a roving tabindex with arrow-key traversal on both surfaces", async () => {
  const markerSource = await readSource("../components/seat-map/SeatMarker.tsx");
  const seatMapSource = await readSource("../components/seat-map/SeatMap.tsx");
  const viewerSource = await readSource("../components/seat-map/ViewerSeatFinder.tsx");
  const inspectorSource = await readSource("../components/seat-map/SeatInspector.tsx");

  // One tab stop per map, not one per seat: the marker takes its tabIndex from
  // the surface, arrows move between seats, and a keyboard activation hands
  // focus into the inspector panel.
  assert.match(markerSource, /tabIndex=\{tabIndex\}/);
  for (const source of [seatMapSource, viewerSource]) {
    assert.match(source, /findNearestSeatInDirection/);
    assert.match(source, /resolveRovingSeatId/);
    assert.match(source, /tabIndex=\{seat\.id === mapRovingSeatId \? 0 : -1\}/);
    assert.match(source, /onKeyDown=\{handleMarkerLayerKeyDown\}/);
    assert.match(source, /getElementById\("seat-inspector-panel"\)\?\.focus\(\)/);
  }
  assert.match(inspectorSource, /id="seat-inspector-panel"/);
  // ArrowDown hops from the search input into the results panel on both surfaces.
  assert.match(seatMapSource, /\[aria-label="Admin search results"\] button/);
  assert.match(viewerSource, /\[aria-label="Viewer search results"\] button/);
});

test("aria-modal dialogs take focus, trap Tab, and restore the opener", async () => {
  const hookSource = await readSource("../components/ui/useDialogFocus.ts");
  assert.match(hookSource, /key !== "Tab"/);
  assert.match(hookSource, /event\.preventDefault\(\)/);
  assert.match(hookSource, /addEventListener\("keydown"/);
  assert.match(hookSource, /restoreTargetRef\.current\?\.focus\(\)/);

  // Every aria-modal surface must carry the shared focus hook (ref +
  // tabIndex={-1}); aria-modal without focus management tells assistive tech
  // the page is inert while the keyboard proves otherwise.
  const dialogFiles = [
    "../components/seat-map/SeatMap.tsx",
    "../components/seat-map/SeatInspector.tsx",
    "../components/seat-map/AskPlannerDrawer.tsx",
    "../components/admin-settings/DataUtilitiesPanel.tsx",
    "../components/admin-management/AdminManagementPanel.tsx"
  ];
  for (const file of dialogFiles) {
    const source = await readSource(file);
    const modalCount = (source.match(/aria-modal="true"/g) ?? []).length;
    const focusRefCount = (source.match(/ref=\{\w*[Dd]ialogFocusRef\}/g) ?? []).length;
    assert.ok(modalCount > 0, `${file} should still host at least one aria-modal dialog`);
    assert.equal(focusRefCount, modalCount, `${file}: every aria-modal dialog needs a useDialogFocus ref`);
    assert.ok((source.match(/tabIndex=\{-1\}/g) ?? []).length >= modalCount, `${file}: aria-modal dialogs need tabIndex={-1}`);
  }
});

test("publish review summarizes draft changes before publish", async () => {
  const source = await readSource("../components/seat-map/SeatMap.tsx");

  // The summary must also diff live employee details against the viewer
  // snapshot so pending people edits are reviewable before they publish.
  assert.match(source, /buildPublishChangeSummary\(localSeats, localPublishedSeats, \{\s+employees: localEmployees,\s+publishedEmployees: localPublishedEmployees\s+\}\)/);
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
  // Assistive strings carry the same display-formatted identity as the visible
  // labels: raw stored casing ("PAM", "ALEX S.") must not leak into the
  // marker's title tooltip / aria-label (2026-07-16 critique, fix 2).
  assert.match(source, /const displayName = formatDisplayName\(employeeName\) \|\| "Open seat"/);
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
  assert.match(inspectorSource, /z-\[80\][\s\S]*panel:z-40/);
  assert.match(inspectorSource, /z-\[90\][\s\S]*sm:z-\[70\]/);
  assert.match(inspectorSource, /hasCurrentAssignment \? "Assignment" : "Assign this seat"/);
  assert.match(inspectorSource, /aria-labelledby="seat-assignment-heading"/);
  assert.match(inspectorSource, /id=\{employeeHelpId\}/);
  assert.match(inspectorSource, /id=\{employeeStateId\}/);
  assert.match(inspectorSource, /aria-describedby=\{employeeNameDescribedBy\}/);
  assert.match(inspectorSource, /id="seat-inspector-new-employee-notice" role="note"/);
  assert.match(inspectorSource, /Published assignment/);
  // Owner QA (2026-07-10, Shell round 3): status has exactly ONE home — the
  // Seat section (editable select for open seats, derived tag for occupied).
  assert.doesNotMatch(inspectorSource, /Status &amp; notes/);
  assert.equal((inspectorSource.match(/ref=\{statusRef\}/g) ?? []).length, 1, "exactly one status control");
  // Owner QA (2026-07-16, inspector reorg): action and commit controls may
  // never sit inside a collapsible container. "Actions" stopped being a
  // <details> section — the primary assignment action is pinned under the
  // header, seat ops live in a static end-of-panel group, and Save/Cancel sit
  // in a conditional commit bar OUTSIDE the scroll area (rendered only while
  // editing or dirty; the 2026-07-10 ban on a PERMANENT sticky footer stands).
  assert.doesNotMatch(inspectorSource, /InspectorSection title="Actions"/);
  assert.match(inspectorSource, /id="seat-actions-heading"/);
  assert.match(inspectorSource, /const showCommitBar = /);
  assert.match(inspectorSource, /id="seat-inspector-commit-bar"/);
  // Collapsible sections hold only readable content and reset per seat —
  // uncontrolled <details> open state must not leak from one seat to the next.
  assert.match(inspectorSource, /key=\{`seat-inspector-sections-\$\{selectedSeat\.id\}`\}/);
  // Delete renders only where it can ever succeed (custom draft seats); the
  // Seat type fact explains protected originals instead of a dead button.
  assert.match(inspectorSource, /\{selectedSeat\.is_custom && \(/);
  // An open seat has no occupant — the Occupant section exists only when
  // someone is assigned (admin and viewer variants alike).
  assert.match(inspectorSource, /\{hasCurrentAssignment && \([\s\S]{0,200}title="Occupant"/);
  assert.match(inspectorSource, /title="Notes" headingId="seat-notes-heading"/);
  assert.doesNotMatch(inspectorSource, /sticky bottom-0/);
  assert.match(inspectorSource, /No unsaved changes\./);
  // The verbose repeated panels are gone (Claude Design cleanup).
  assert.doesNotMatch(inspectorSource, /Seat Summary|Planning inspector|Draft-only impact|Assignment workflow|Actions \/ Rules/);
  assert.match(inspectorSource, /isProtectedOriginalSeatLabel/);
  assert.match(inspectorSource, /Protected original/);
  assert.match(inspectorSource, /Fix the highlighted inspector fields before saving/);
  // Move-confirm dialog renders canonical identity casing for both segments
  // (person via formatDisplayName, seat code via formatSeatCode) — raw stored
  // values must not surface here (2026-07-16 critique, fix 2 follow-up).
  assert.match(inspectorSource, /Move \{formatDisplayName\(moveConflict\.employeeName\)\} to \{formatSeatCode\(selectedSeat\.label\)\}\?/);
  assert.match(inspectorSource, /Review inspector fields/);
  assert.match(inspectorSource, /errorSummaryRef\.current\?\.focus\(\)/);
  assert.match(inspectorSource, /focusInspectorField\(error\.field\)/);
  assert.match(inspectorSource, /aria-invalid=\{Boolean\(fieldErrorMap\.employeeName\)\}/);
  assert.match(inspectorSource, /Add an employee name before saving assignment details\./);
  assert.match(inspectorSource, /aria-describedby=\{saveDisabledReason \? "seat-inspector-save-help" : undefined\}/);
  assert.match(inspectorSource, /getSeatDeleteBlockReason/);
  assert.match(inspectorSource, /Delete seat/);
  assert.match(inspectorSource, /aria-describedby="seat-inspector-delete-help"/);
  assert.match(inspectorSource, /whitespace-normal rounded-\[10px\] leading-tight/);
  // Figma delete treatment: the block reason is a visible helper line, not sr-only.
  // (Class content deliberately unpinned — type-scale values are free to evolve;
  // the guardrail is the visible element carrying the aria-describedby id.)
  assert.match(inspectorSource, /<p id="seat-inspector-delete-help" className="[^"]*">\{deleteHelpText\}<\/p>/);
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
  // Navigation guards carry their destination: Save/Discard must land the
  // user on the page they actually clicked (Management OR Settings), and the
  // dialog copy must name it.
  assert.match(source, /requestInspectorGuard\(\{ kind: "navigate-admin-page", href, destination \}\)/);
  assert.match(source, /window\.location\.assign\(action\.href\)/);
  assert.match(source, /return `opening \$\{action\.destination\}\.`/);
  assert.match(source, /queueCenterSeatInMap\(action\.seatId\)/);
  assert.match(source, /Save or discard the selected seat edits before publishing/);
  assert.match(source, /id="inspector-unsaved-title"/);
  assert.match(source, /Unsaved seat edits/);
  assert.match(source, /Save changes/);
  assert.match(source, /Discard/);
  assert.match(source, /Keep editing/);
  assert.match(source, /form\.requestSubmit\(\)/);
  assert.match(source, /onSubmitBlocked=\{cancelPendingInspectorGuardAction\}/);
  assert.match(source, /setPendingInspectorSaveAction\(null\)/);
  assert.match(source, /href="\/admin\/management"[\s\S]{0,260}beforeAdminPageNavigation\("\/admin\/management", "Management"\)\) event\.preventDefault\(\)/);
  assert.match(source, /href="\/admin\/settings"[\s\S]{0,360}beforeAdminPageNavigation\("\/admin\/settings", "Settings"\)\) event\.preventDefault\(\)/);
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
  assert.match(seatMapSource, /placeholder=\{SEAT_SEARCH_PLACEHOLDER\}/);
  assert.match(seatMapSource, /function openSeatFromResults/);
  assert.match(seatMapSource, /queueCenterSeatInMap\(seatId\)/);
  assert.match(seatMapSource, /No search results/);
  assert.match(seatMapSource, /No filter results/);
  assert.match(seatMapSource, /No combined results/);
  assert.match(seatMapSource, /Fit matches unavailable because there are no matching seats/);
  // Panel slot (owner-revised): results open while search/filters are active and the
  // inspector is closed or auto-collapsed to its pill; searching collapses (never
  // clears) an open clean selection. No reserved gutter, no idle Map key rail.
  assert.match(seatMapSource, /const resultsPanelOpen = canEdit && filtersActive && \(!selectedSeat \|\| inspectorCollapsed\)/);
  // INV-1 lives once in lib/viewerSeatSearch (searchHandsPanelToResults,
  // unit-tested) and BOTH maps call it — the admin passes its dirty guard, the
  // read-only viewer passes false (2026-07-16 critique, fix 5).
  assert.match(seatMapSource, /if \(searchHandsPanelToResults\(value, Boolean\(selectedSeatId\), inspectorDirty\)\) \{\s*setInspectorCollapsed\(true\);/);
  const viewerFinderForInv1 = await readSource("../components/seat-map/ViewerSeatFinder.tsx");
  assert.match(viewerFinderForInv1, /if \(searchHandsPanelToResults\(value, Boolean\(selectedSeatId\), false\)\) \{\s*setInspectorCollapsed\(true\);/);
  assert.doesNotMatch(seatMapSource, /mapKeyPanelOpen|desktopInspectorReserveMarginClassName|dock:/);
  assert.match(seatMapSource, /const canvasBannerSafeAreaClassName = ""/);
  assert.match(seatMapSource, /aria-labelledby="admin-planning-canvas-title" className=\{\[filterCollapsed \? "order-1" : "order-2", "min-w-0 overflow-hidden/);
  assert.match(seatMapSource, /const mobileMapInteractionSurfaceOpen = canEdit && \(/);
  assert.match(seatMapSource, /const mobileMapControlsHidden = mobileMapInteractionSurfaceOpen;/);
  assert.match(seatMapSource, /mobileMapControlsHidden \? "hidden sm:block" : ""/);
  // 3b MODE CARD: modes own the panel slot (no canvas banner); move-mode copy
  // lives inside the inspector occupant.
  assert.match(seatMapSource, /const modeCardOpen = canEdit && Boolean\(activeMode\) && \(!selectedSeat \|\| inspectorCollapsed\)/);
  assert.match(seatMapSource, /\{modeCardOpen && activeMode && \(/);
  assert.match(seatMapSource, /\{resultsPanelOpen && !modeCardOpen && \(/);
  assert.doesNotMatch(seatMapSource, /activeModeBannerClassName/);
  assert.match(seatMapSource, /const actionErrorBannerClassName = \[[\s\S]*canvasBannerSafeAreaClassName[\s\S]*\]\.filter\(Boolean\)\.join\(" "\)/);
  assert.match(seatMapSource, /const actionNoticeBannerClassName = \[[\s\S]*canvasBannerSafeAreaClassName[\s\S]*\]\.filter\(Boolean\)\.join\(" "\)/);
  assert.match(seatMapSource, /aria-label=\{`\$\{activeMode\.label\} mode`\}/);
  assert.match(seatMapSource, /className=\{actionErrorBannerClassName\}/);
  assert.match(seatMapSource, /className=\{actionNoticeBannerClassName\}/);
  assert.match(seatMapSource, /className=\{mapMarkerLayerClassName\}/);
  // INV-2: no auto-select - a single match stays in results until an explicit open.
  assert.doesNotMatch(seatMapSource, /singleResultSeat|autoSelectedSearchKeyRef|Auto-selected/);
  // INV-1: typing a search evicts the open inspector (unsaved edits keep the
  // guard) — rule shared via lib/viewerSeatSearch.searchHandsPanelToResults.
  assert.match(seatMapSource, /if \(searchHandsPanelToResults\(value, Boolean\(selectedSeatId\), inspectorDirty\)\) \{/);
  assert.match(seatMapSource, /\{resultsPanelOpen && !modeCardOpen && \(/);
  assert.match(seatMapSource, /onOpen=\{selectSeatResult\}/);
  assert.match(seatMapSource, /onShowOnMap=\{queueCenterSeatInMap\}/);
  // Map ⋯ overflow is a real menu: ARIA role/haspopup semantics plus
  // roving keyboard support, not a plain button group.
  assert.match(seatMapSource, /id="seat-map-overflow-menu"[\s\S]{0,160}role="menu"/);
  // Pin role="menuitem" as a real JSX attribute on both items specifically
  // (not just satisfied by the querySelector string above).
  assert.match(seatMapSource, /role="menuitem"[\s\S]{0,800}Fit map to view/);
  assert.match(seatMapSource, /role="menuitem"[\s\S]{0,800}Zoom to 100%/);
  assert.match(seatMapSource, /aria-haspopup="menu"/);
  // Roving tabindex (APG menu-button pattern): items sit out of the native
  // tab order — reachable only via the focus-on-open effect and the
  // Arrow/Home/End cycling below, not by Tab.
  assert.match(seatMapSource, /role="menuitem"[\s\S]{0,40}tabIndex=\{-1\}[\s\S]{0,800}Fit map to view/);
  assert.match(seatMapSource, /role="menuitem"[\s\S]{0,40}tabIndex=\{-1\}[\s\S]{0,800}Zoom to 100%/);
  // Tab (and Shift+Tab) must close the menu and hand focus back to the
  // trigger synchronously — preventDefault() stops the native focus hop and
  // the trigger is focused immediately (not via the deferred
  // returnFocusAfterClose helper), avoiding a double focus move.
  assert.match(seatMapSource, /event\.key === "Tab"[\s\S]{0,450}event\.preventDefault\(\);[\s\S]{0,120}setMapMenuOpen\(false\);[\s\S]{0,90}mapMenuButtonRef\.current\?\.focus\(\)/);
  // The Arrow/Home/End branch must stopPropagation like the adjacent
  // Escape branch, for consistency and to avoid latent bubbling conflicts.
  assert.match(seatMapSource, /event\.key === "ArrowDown" \|\| event\.key === "ArrowUp"[\s\S]{0,120}event\.preventDefault\(\);\s*event\.stopPropagation\(\);/);
});

test("popovers restore trigger focus when a close unmounts the focused element", async () => {
  const seatMapSource = await readSource("../components/seat-map/SeatMap.tsx");
  const viewerSource = await readSource("../components/seat-map/ViewerSeatFinder.tsx");
  const filterSource = await readSource("../components/seat-map/FilterPanel.tsx");
  const helperSource = await readSource("../components/ui/returnFocus.ts");

  // One shared mechanism: closing a popover from keyboard (or activating a
  // menu item) unmounts the focused element, which strands keyboard focus on
  // <body> (live-verified on prod 2026-07-14). The deferred helper is the
  // single home for the restore.
  assert.match(helperSource, /export function returnFocusAfterClose/);
  assert.match(helperSource, /setTimeout\(\(\) => trigger\.current\?\.focus\(\), 0\)/);

  // FilterPanel owns its Escape contract on BOTH surfaces: close, then
  // restore the caller-supplied trigger.
  assert.match(filterSource, /onKeyDown=\{event => \{\s*if \(event\.key === "Escape"\) \{[\s\S]{0,220}onClose\(\);[\s\S]{0,200}returnFocusAfterClose\(returnFocusRef\)/);
  for (const source of [seatMapSource, viewerSource]) {
    assert.match(source, /ref=\{filterTriggerRef\}/);
    assert.match(source, /returnFocusRef=\{filterTriggerRef\}/);
  }

  // The chrome ⋯ More menu and the map ⋯ actions menu return focus to their
  // triggers on Escape.
  assert.match(seatMapSource, /ref=\{chromeMenuButtonRef\}/);
  assert.match(seatMapSource, /setChromeMenuOpen\(false\);[\s\S]{0,90}returnFocusAfterClose\(chromeMenuButtonRef\)/);
  assert.match(seatMapSource, /ref=\{mapMenuButtonRef\}/);
  assert.match(seatMapSource, /setMapMenuOpen\(false\);[\s\S]{0,90}returnFocusAfterClose\(mapMenuButtonRef\)/);
});

test("chrome bars stay pinned and the filter menu precedes search in the tab order", async () => {
  const seatMapSource = await readSource("../components/seat-map/SeatMap.tsx");
  const viewerSource = await readSource("../components/seat-map/ViewerSeatFinder.tsx");
  const shellBarSource = await readSource("../components/ui/AdminShellBar.tsx");
  const askPlannerSource = await readSource("../components/seat-map/AskPlannerDrawer.tsx");
  const globalsSource = await readSource("../app/globals.css");

  // Pinned-bar consequences: modal backdrops must still cover the chrome
  // tier (the drawer's backdrop shields Publish/Settings while the dialog is
  // open), and browser-driven scrolls must not align focused controls under
  // the opaque bar (WCAG 2.4.11 focus-obscured).
  assert.match(askPlannerSource, /aria-label="Close Ask Planner"[\s\S]{0,320}sm:z-50/);
  assert.match(globalsSource, /scroll-padding-top/);

  // One scroll behavior on every surface: below lg the page scrolls, and a
  // static bar carries the app's only chrome (search, filters, publish
  // status) out of view. Only the pinning behavior is pinned here — z tiers
  // and the rest of the class list are layout choices, free to evolve.
  assert.match(shellBarSource, /<header className="sticky top-0 /);
  assert.match(seatMapSource, /<header className="sticky top-0 /);
  assert.match(viewerSource, /<header className="sticky top-0 /);
  // The map roots must clip horizontal overflow with `clip`, not `hidden`:
  // overflow-x-hidden turns the root into a scroll container, which captures
  // the sticky header so it never pins to the viewport (live-caught).
  for (const source of [seatMapSource, viewerSource]) {
    assert.match(source, /overflow-x-clip/);
    assert.doesNotMatch(source, /min-h-screen flex-col overflow-x-hidden/);
  }

  // The filter popover renders visually beneath its trigger, so it must also
  // FOLLOW the trigger in DOM order — before the search field — or Tab from
  // the open trigger detours through search before reaching the menu.
  const adminPanelIndex = seatMapSource.indexOf("{showFilterPanel && (");
  const adminSearchIndex = seatMapSource.indexOf('role="search" aria-label="Command search"');
  assert.ok(adminPanelIndex >= 0 && adminSearchIndex >= 0, "admin filter panel and command search should remain source-visible");
  assert.ok(adminPanelIndex < adminSearchIndex, "admin filter panel must precede the command search in DOM order");

  const viewerPanelIndex = viewerSource.indexOf("{filterOpen && (");
  const viewerSearchIndex = viewerSource.indexOf('role="search" aria-label="Viewer search"');
  assert.ok(viewerPanelIndex >= 0 && viewerSearchIndex >= 0, "viewer filter panel and search should remain source-visible");
  assert.ok(viewerPanelIndex < viewerSearchIndex, "viewer filter panel must precede the search in DOM order");
});

test("the admin sub-page bar surfaces Settings clearly in the management context", async () => {
  const shellBarSource = await readSource("../components/ui/AdminShellBar.tsx");

  // On the map header Settings is tucked behind the identity chip (clean map
  // bar), but in the management/data context — the sub-page bar — it surfaces
  // as a plain, labeled, current-aware nav item next to Management.
  assert.match(shellBarSource, /href="\/admin\/settings"\s+aria-current=\{page === "settings" \? "page" : undefined\}[\s\S]{0,500}Settings\s*<\/Link>/);
  // With Settings visible in the nav, the identity chip here must NOT double
  // as a second (avatar-shaped) settings control — it is decorative only.
  assert.match(shellBarSource, /<span\s+aria-hidden="true"[\s\S]{0,240}>\s*A\s*<\/span>/);
  assert.doesNotMatch(shellBarSource, /<Link[^>]*aria-label="Open settings"/);
});

test("chrome copy is unified, the names toggle exposes state, and skip links reach the maps", async () => {
  const seatMapSource = await readSource("../components/seat-map/SeatMap.tsx");
  const viewerSource = await readSource("../components/seat-map/ViewerSeatFinder.tsx");
  const searchLibSource = await readSource("../lib/viewerSeatSearch.ts");

  // One placeholder everywhere: three diverging copies each claimed a
  // different search scope. The shared string is short enough for the
  // narrowest chrome input (longer copy ellipsized exactly the part it
  // advertised); the full field enumeration lives on each input's sr-label.
  assert.match(searchLibSource, /export const SEAT_SEARCH_PLACEHOLDER = "Search people or seats"/);
  assert.equal((seatMapSource.match(/placeholder=\{SEAT_SEARCH_PLACEHOLDER\}/g) ?? []).length, 2, "both admin search inputs share the placeholder");
  assert.match(viewerSource, /placeholder=\{SEAT_SEARCH_PLACEHOLDER\}/);
  assert.doesNotMatch(seatMapSource, /placeholder="Search people/);
  assert.doesNotMatch(viewerSource, /placeholder="Search people/);

  // Show names is a real toggle: stable accessible name + aria-pressed. The
  // old flipping label ("Hide names") with no pressed state left the current
  // view invisible to assistive tech — and the More-menu item must keep a
  // VISIBLE state cue too (sighted users lost the flipping label).
  assert.equal((seatMapSource.match(/aria-pressed=\{showNames\}/g) ?? []).length, 2, "row button and More-menu item both expose pressed state");
  assert.doesNotMatch(seatMapSource, /Hide names/);
  assert.match(seatMapSource, /Show names\s*\{showNames && \(/);

  // A skip link is the first focusable on both map surfaces, targeting a
  // focusable map region — the chrome gauntlet is 8+ tab stops otherwise.
  assert.match(seatMapSource, /href="#planning-canvas"[\s\S]{0,420}Skip to seat map/);
  assert.match(seatMapSource, /id="planning-canvas" tabIndex=\{-1\}/);
  assert.match(viewerSource, /href="#viewer-seat-map"[\s\S]{0,420}Skip to seat map/);
  assert.match(viewerSource, /id="viewer-seat-map"/);
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
