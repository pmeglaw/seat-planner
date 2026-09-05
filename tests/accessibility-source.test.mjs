import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readSource(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("viewer route renders the published map as read-only", async () => {
  const viewerSource = await readSource("../app/(shell)/page.tsx");
  const adminSource = await readSource("../app/(shell)/admin/page.tsx");
  const viewerFinderSource = await readSource("../components/seat-map/ViewerSeatFinder.tsx");

  assert.match(viewerSource, /\.eq\("layer", "published"\)/);
  assert.match(viewerSource, /<ViewerSeatFinder/);
  assert.doesNotMatch(viewerSource, /<SeatMap/);
  // Multi-floor PR-2: the own-floor landing hint is matched by email against
  // the published snapshot already in hand — no new table. Under the shell
  // (redesign-v2 PR 2) the page reads the React-cache()d session context the
  // layout already probed: ONE auth probe per render, zero of its own.
  assert.equal((viewerSource.match(/getSessionContext\(/g) ?? []).length, 1, "the viewer page reads the shared session context once");
  assert.equal((viewerSource.match(/auth\.getUser\(/g) ?? []).length, 0, "the viewer page makes no auth probe of its own");
  assert.match(viewerFinderSource, /canEdit=\{false\}/);
  assert.doesNotMatch(viewerFinderSource, /createSeatAction|deleteSeatAction|publishSeatMapAction|restoreDraftSnapshotAction|swapSeatAssignmentsAction/);
  assert.match(adminSource, /\.eq\("layer", "draft"\)/);
  assert.match(adminSource, /\.eq\("layer", "published"\)/);
  // Guards that the published layer is plumbed into SeatMap as read-only
  // context. The value used to arrive as `(publishedSeats ?? []) as
  // SeatWithEmployee[]`; it is now already a non-null SeatWithEmployee[] from
  // fetchAllRows, so that cast would be dead syntax. The invariant — a distinct
  // publishedSeats prop, fed by the published-layer query asserted above — is
  // unchanged.
  assert.match(adminSource, /publishedSeats=\{publishedSeats\}/);
  // canEdit stays the literal flag (never an expression). Identity moved off
  // this component entirely — the persistent shell's rail owns the account
  // cell now — so the flag stands alone on its line, and the identity props
  // this migration removed must not quietly return as a second identity
  // surface outside AppShell.
  assert.match(adminSource, /\n\s*canEdit\s*\n/);
  assert.doesNotMatch(adminSource, /canEdit=\{/);
  assert.doesNotMatch(adminSource, /accountEmail|accountRoleLabel/);
});

test("admin planning shell exposes status, panel relationships, and undo redo explanations", async () => {
  const source = await readSource("../components/seat-map/SeatMap.tsx");

  // Claude Design: identity moves into the top bar; the publish status is the top-bar
  // Review/Published pill; the bordered nested groups collapse into one flat text toolbar.
  assert.match(source, /Seat Planner — admin map/);
  // PR 3a: the row is the shared MapControlRow (role="toolbar" "Map
  // controls"); Undo / Redo carry their shortcut in the name (P2-1).
  const controlRowSource = await readSource("../components/seat-map/MapControlRow.tsx");
  assert.match(source, /<MapControlRow/);
  assert.match(controlRowSource, /role="toolbar" aria-label="Map controls"/);
  assert.match(source, /Undo last map change/);
  assert.match(source, /Redo · \$\{redoShortcutHint\(platform\)\}/);
  assert.match(source, /Planning canvas/);
  // The status counts moved from the floating legend card into the in-flow
  // MapStatusBand (Option A, 2026-08-17), but the guarantee is unchanged:
  // they must still BE a legend AND still carry the same accessible name.
  // One assertion binds the two halves: a lone /Seat status legend/ pin would
  // keep passing if the string drifted onto a title tooltip, and a lone
  // /<MapStatusBand/ pin would keep passing if the name vanished.
  // MapStatusBand owns the <ul aria-label={ariaLabel}>, so the status counts
  // stay a labelled list rather than decorative text painted over the map
  // (the rendered semantics are verified at runtime by
  // tests/map-status-band.test.mjs).
  assert.match(source, /<MapStatusBand[\s\S]{0,200}ariaLabel="Seat status legend"/);
  // The canvas filter trigger/panel is gone (owner call 2026-08-20) — no
  // stray aria-controls may reference the retired panel id.
  assert.doesNotMatch(source, /seat-map-filter-panel/);
  // Session layer, v12 (2026-07-31 rail shell): identity + Settings moved off
  // the header AccountMenu into AppRail (Task 1), and the rail itself now
  // lives in the persistent AppShell (nav-lag fix) — SeatMap plugs its guard
  // in through useAppShellNavigation instead of mounting the rail. The guard
  // survives structurally: every rail item (map/management/settings/viewer)
  // still shares the SAME onNavigate wiring into beforeGuardedNavigation —
  // AppShell hands the registered guard to AppRail — so Settings, like every
  // other in-app destination, cannot bypass the unsaved-edits guard,
  // whichever rail item reaches it.
  assert.match(source, /useAppShellNavigation\(\{[\s\S]{0,420}guard: \(href, label\) => \(isGuardedNavigationHref\(href\) \? beforeGuardedNavigation\(href, label\) : true\)/);
  const appShellSourceForGuard = await readSource("../components/ui/AppShell.tsx");
  // The shell hands the registered guard to the ONE navigation hook every
  // shell link and the History switch share (redesign-v2 PR 2).
  assert.match(appShellSourceForGuard, /useShellNavigation\(\{ guard/);
  // Settings must never appear as an unguarded peer link on the map surface
  // itself — the shell header (a different file, its own guard-respecting
  // contract) plus the wiring above own it. A bare href here would bypass
  // the guard the shell's onLinkClick can't reach.
  assert.doesNotMatch(source, /href="\/admin\/settings"/);
  // PR 3a: the row button is wired through MapControlRow; PR 3b: the drawer is
  // the right slot (a side panel, not a dialog) — the trigger carries
  // aria-expanded + aria-controls, no haspopup.
  assert.match(source, /controlsId: "ask-planner-drawer"/);
  assert.match(controlRowSource, /aria-expanded=\{draft\.askPlanner\.open\}\s*aria-controls=\{draft\.askPlanner\.controlsId\}/);
  assert.doesNotMatch(controlRowSource, /aria-haspopup="dialog"/);
  assert.match(source, /No map changes to undo/);
  assert.match(source, /No undone map changes to redo/);
  assert.match(source, /unpublished \$\{publishSummary\.totalChangeCount === 1 \? "change" : "changes"\}/);
  // PR 3b: the mode card lives in the right slot (ModeCard.tsx) and teaches Esc there.
  assert.match(await readSource("../components/seat-map/ModeCard.tsx"), /Esc also exits\./);
  assert.match(source, /Exit add seat/);
  // Publish chip contract, v12 (contract #4): nothing renders without draft
  // changes — no idle status chip, no publish-status-popover. The has-changes
  // cluster is the ONLY publish control and it opens the review directly.
  // PR 3a (PHASE2UX §1M.3): Publish is ALWAYS present in the row — disabled at
  // zero with its reason beside it — and it is the row's one primary.
  assert.match(source, /publish: \{ count: publishSummary\.totalChangeCount, onOpen: openPublishReview \}/);
  assert.doesNotMatch(source, /id="publish-status-popover"/);
  assert.equal((source.match(/onOpen: openPublishReview/g) ?? []).length, 1, "exactly one publish control opens the review");
  assert.match(controlRowSource, /disabled=\{draft\.publish\.count === 0\}/);
  assert.match(controlRowSource, /aria-describedby=\{draft\.publish\.count === 0 \? reasonId : undefined\}/);
  assert.match(controlRowSource, /No changes to publish/);
  // The outcome notice's inline Undo rides the canvas status region (PR 3a).
  assert.match(source, /label: `Undo \$\{lastUndoLabel\}`, onClick: undoDraftEdit/);
});

test("Carbon-for-AI tokens (--sp-ai-*) stay exclusive to Ask Planner surfaces (contract #9)", async () => {
  // Guarded semantic: AI blue is reserved EXCLUSIVELY for AI presence — no
  // non-AI control may ever paint itself with an --sp-ai- token.
  const seatMapSource = await readSource("../components/seat-map/SeatMap.tsx");
  const viewerFinderSource = await readSource("../components/seat-map/ViewerSeatFinder.tsx");
  const shellBarSource = await readSource("../components/ui/AppTopBar.tsx");
  const AI_TOKEN = "--sp-ai-";

  function countOccurrences(text, needle) {
    return text.split(needle).length - 1;
  }

  // SeatMap + the control row: since PR 3a the Ask Planner trigger is the
  // asset's tertiary button (PHASE3DS §1.14) — no AI token on the map surface
  // or its row at all; the Carbon-for-AI label lives in the drawer (PR 3b).
  assert.equal(countOccurrences(seatMapSource, AI_TOKEN), 0, "SeatMap.tsx paints nothing with the AI token");
  assert.equal(countOccurrences(await readSource("../components/seat-map/MapControlRow.tsx"), AI_TOKEN), 0, "the control row paints nothing with the AI token");

  // AppRail retired with the Phase 3 shell (redesign-v2 PR 2); the shell
  // header carries no AI entry (asserted on shellBarSource below).

  // SeatInspector: v12 slice 4 factors the Ask Planner row into
  // AskPlannerSeatRow() so the AI token stays provably confined the same way
  // AppRail's AiCell() does — same bounded-slice technique as above.
  const inspectorSourceForAiTokens = await readSource("../components/seat-map/SeatInspector.tsx");
  const inspectorTotal = countOccurrences(inspectorSourceForAiTokens, AI_TOKEN);
  const inspectorAiStart = inspectorSourceForAiTokens.indexOf("function AskPlannerSeatRow(");
  assert.notEqual(inspectorAiStart, -1, "SeatInspector must isolate AI styling in AskPlannerSeatRow()");
  const inspectorAiEnd = inspectorSourceForAiTokens.slice(inspectorAiStart).search(/\n(?:export |function |const |let |var |class |type |interface )/);
  const inspectorAiEndAbs = inspectorAiEnd === -1 ? inspectorSourceForAiTokens.length : inspectorAiStart + inspectorAiEnd;
  const inspectorAiBlock = inspectorSourceForAiTokens.slice(inspectorAiStart, inspectorAiEndAbs);
  assert.ok(inspectorTotal > 0, "sanity: SeatInspector.tsx should still consume the AI token somewhere");
  assert.equal(
    countOccurrences(inspectorAiBlock, AI_TOKEN),
    inspectorTotal,
    "every --sp-ai- occurrence in SeatInspector.tsx must live inside AskPlannerSeatRow()"
  );

  // Non-AI surfaces: zero AI-blue tokens, ever.
  assert.doesNotMatch(viewerFinderSource, /--sp-ai-/);
  assert.doesNotMatch(await readSource("../components/seat-map/ViewerFindPalette.tsx"), /--sp-ai-/);
  assert.doesNotMatch(await readSource("../components/seat-map/FloorRoster.tsx"), /--sp-ai-/);
  assert.doesNotMatch(shellBarSource, /--sp-ai-/);
});

test("active modes exit after dialogs and keep visible exit controls", async () => {
  const source = await readSource("../components/seat-map/SeatMap.tsx");
  const publishDialogIndex = source.indexOf("if (publishReviewOpen)");
  const activeModeIndex = source.indexOf("if (addSeatMode || swapSourceSeatId || moveEmployeeSourceSeatId)");

  assert.ok(publishDialogIndex >= 0, "Escape handler should check publish review.");
  assert.ok(activeModeIndex >= 0, "Escape handler should check active map modes.");
  assert.ok(publishDialogIndex < activeModeIndex, "Dialogs should receive Escape before active map modes.");
  assert.match(source, /label: "Add seat"[\s\S]*exitLabel: "Exit add seat"/);
  assert.match(source, /label: "Swap seats"[\s\S]*exitLabel: "Exit swap seats"/);
  assert.match(source, /label: "Move employee"[\s\S]*exitLabel: "Exit move employee"/);
});

test("viewer rendering path stays isolated from admin-only draft and delete controls", async () => {
  const viewerSource = await readSource("../app/(shell)/page.tsx");
  const viewerFinderSource = await readSource("../components/seat-map/ViewerSeatFinder.tsx");
  const seatMapSource = await readSource("../components/seat-map/SeatMap.tsx");
  const inspectorSource = await readSource("../components/seat-map/SeatInspector.tsx");

  const findPaletteSource = await readSource("../components/seat-map/ViewerFindPalette.tsx");
  assert.match(viewerSource, /ViewerSeatFinder/);
  assert.match(viewerFinderSource, /ariaLabel: "Viewer search"/);
  // The results list moved into the palette; the viewer keeps the pointer to
  // it (the ArrowDown hop out of the search field), which is asserted with the
  // rest of the roving contract below.
  assert.match(findPaletteSource, /aria-label="Viewer search results"/);
  assert.match(viewerFinderSource, /aria-live="polite"/);
  assert.match(viewerFinderSource, /highlightedDescription=\{/);
  // The palette is a viewer surface too — it inherits the same isolation, and
  // so does the floor roster (multi-floor PR-2), which the viewer mounts for
  // an unmapped floor.
  const floorRosterSource = await readSource("../components/seat-map/FloorRoster.tsx");
  for (const source of [viewerFinderSource, findPaletteSource, floorRosterSource]) {
    assert.doesNotMatch(source, /Map tools|Undo|Redo|CSV|JSON|Draft|Publish changes|Vacate|Delete seat|Ask Planner/);
  }
  // Top-bar-first chrome: the publish cluster lives in barActionCluster,
  // gated by the same canEdit condition (ternary form) before it portals
  // into the shared bar.
  assert.match(seatMapSource, /const draftControls = canEdit && editTier[\s\S]*?publish: \{ count: publishSummary\.totalChangeCount/);
  assert.match(seatMapSource, /\{canEdit && \([\s\S]*<AskPlannerDrawer/);
  // Delete, the verbs, and the Status select all live in the Seat actions
  // body (2026-08-18 progressive disclosure), whose id is unique in the
  // file. Requiring the admin ternary to reach that id, then anchoring each
  // control within the section's bounded span, replaces the old unbounded
  // `\{canEdit \? \([\s\S]*` matches — those could satisfy themselves across
  // unrelated code anywhere later in the file.
  assert.match(inspectorSource, /\{canEdit \? \([\s\S]*?id="seat-inspector-actions"/);
  assert.match(inspectorSource, /id="seat-inspector-actions"[\s\S]{0,6000}Delete custom seat/);
  // The reseat verbs live in the inspector's Seat actions section now.
  // The section body is only mounted inside the canEdit-gated form branch;
  // here we pin that only the ADMIN mount wires the verb handlers, so a
  // viewer inspector can never grow Move/Swap/Vacate even if the internal
  // gate regressed.
  assert.match(seatMapSource, /<SeatInspector[\s\S]{0,2400}onVacate=\{requestVacateFromBar\}/);
  assert.doesNotMatch(viewerFinderSource, /onMove=|onSwap=|onVacate=/);
  assert.match(inspectorSource, /id="seat-inspector-actions"[\s\S]{0,300}\{\(onMove \|\| onSwap \|\| onVacate\) && \(/);
  assert.match(inspectorSource, /id="seat-inspector-actions"[\s\S]{0,6000}Delete seat/);
  assert.match(inspectorSource, /id="seat-inspector-actions"[\s\S]{0,6000}Vacate/);
});

// A viewer seat can light up for two unrelated reasons — it matched the active
// search result, or the pointer is resting on its row in the people list. Both
// looked identical to a screen reader while only one of them was true, so a
// hovered seat announced a search result that did not exist.
test("a highlighted viewer seat announces which of the two causes lit it up", async () => {
  const viewerFinderSource = await readSource("../components/seat-map/ViewerSeatFinder.tsx");

  assert.match(viewerFinderSource, /const seatIsSearchHit = activeResultSeatIdSet\.has\(seat\.id\)/);
  // Same two causes after the panel → palette move; the hover one is now the
  // palette's browse rows, so it is gated on paletteOpen and reads
  // hoverSeatId. Only BROWSE rows feed that state — the palette's query rows
  // deliberately have no hover-locate, which is what keeps the second
  // description ("from the people list") true rather than approximately true.
  assert.match(viewerFinderSource, /const seatIsPaletteHover = paletteOpen && seat\.id === hoverSeatId/);
  assert.match(viewerFinderSource, /highlighted=\{seatIsSearchHit \|\| seatIsPaletteHover\}/);
  const paletteSource = await readSource("../components/seat-map/ViewerFindPalette.tsx");
  // The result LIST alone, ending at the empty state that closes it — NOT
  // everything up to the browse list. The zone chips sit between the two and
  // hover/focus-preview on purpose (they drive the zone wash, not hoverSeatId),
  // so a slice that swallowed them would fail this on correct code.
  const paletteResultsBlock = paletteSource.slice(
    paletteSource.indexOf('aria-label="Viewer search results"'),
    paletteSource.indexOf('<div role="status" aria-live="polite"')
  );
  assert.ok(paletteResultsBlock.length > 0, "the palette must still render the results list");
  assert.ok(
    paletteSource.includes('aria-label="People directory"'),
    "the palette must still render the browse list"
  );
  // Every hover-ish entry point, not just the one the rows happen to use:
  // swapping onPointerEnter for onMouseEnter would feed hoverSeatId from a
  // search row and break the description contract just as thoroughly.
  assert.doesNotMatch(paletteResultsBlock, /onPointerEnter|onPointerOver|onMouseEnter|onMouseOver|onFocus/);
  assert.match(
    viewerFinderSource,
    /highlightedDescription=\{seatIsSearchHit \? "Highlighted search result" : "Highlighted from the people list"\}/
  );
});

test("ask planner drawer and settings review dialogs keep dialog semantics and focus targets", async () => {
  const askPlannerSource = await readSource("../components/seat-map/AskPlannerDrawer.tsx");
  // PR 4: the two reviews are the narrow tearsheets.
  const settingsPanelSource = [
    await readSource("../components/admin-settings/CsvImportSheet.tsx"),
    await readSource("../components/admin-settings/SnapshotRestoreSheet.tsx")
  ].join("\n");

  assert.match(askPlannerSource, /id="ask-planner-drawer"/);
  assert.match(askPlannerSource, /aria-labelledby="ask-planner-title"/);
  assert.match(askPlannerSource, /aria-describedby="ask-planner-description"/);
  assert.match(askPlannerSource, /questionRef\.current\.focus/);
  // PR 3b: the drawer is the right slot (an <aside> landmark, not a modal) —
  // its name and description still come from the title + subline ids.
  assert.match(askPlannerSource, /<aside[\s\S]{0,200}id="ask-planner-drawer"/);

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
    // Home / End land on the reading-order edges on both surfaces (PHASE2UX §1M.11, PR 3b).
    assert.match(source, /const edge = edgeKeyToPosition\(event\.key\);/);
    assert.match(source, /seatAtReadingEdge\(seatNavPoints, edge\)/);
    assert.match(source, /tabIndex=\{seat\.id === mapRovingSeatId \? 0 : -1\}/);
    assert.match(source, /onKeyDown=\{handleMarkerLayerKeyDown\}/);
    assert.match(source, /getElementById\("seat-inspector-panel"\)\?\.focus\(\)/);
  }
  assert.match(inspectorSource, /id="seat-inspector-panel"/);
  // ArrowDown hops from the search field into the palette on both surfaces (one palette since PR 3a).
  assert.match(seatMapSource, /\[aria-label="Viewer search results"\] button:not\(\[disabled\]\)/);
  assert.match(viewerSource, /\[aria-label="Viewer search results"\] button:not\(\[disabled\]\)/);
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
    "../components/seat-map/SeatMapDialogs.tsx",
    "../components/seat-map/PublishReviewSheet.tsx",
    "../components/seat-map/SeatInspector.tsx",
    // (AskPlannerDrawer left this list in PR 3b: it is the right slot, a side panel.)
    "../components/admin-settings/CsvImportSheet.tsx",
    "../components/admin-settings/SnapshotRestoreSheet.tsx",
    // PR 4: Management's dialogs are the 480 panel, the narrow confirm sheet
    // and the shared asset modal (dirty-close ask, one-field create).
    "../components/admin-management/EmployeePanel.tsx",
    "../components/admin-management/ManagementConfirmSheet.tsx",
    "../components/ui/CarbonModal.tsx"
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
  // R-02a extraction seams: the review dialog's markup lives in
  // SeatMapDialogs.tsx and the diff memos + dirty-inspector gate live in
  // usePublishReview.ts — each anchor pins the file that owns it.
  const source = await readSource("../components/seat-map/usePublishReview.ts");
  // PR 3b: the review is the wide tearsheet (PublishReviewSheet.tsx, PHASE3DS §1.19).
  const dialogsSource = await readSource("../components/seat-map/PublishReviewSheet.tsx");

  // The summary must also diff live employee details against the viewer
  // snapshot so pending people edits are reviewable before they publish.
  assert.match(source, /buildPublishChangeSummary\(localSeats, localPublishedSeats, \{\s+employees: localEmployees,\s+publishedEmployees: localPublishedEmployees\s+\}\)/);
  // v12 slice 5: the modal body is one unified per-seat diff table derived
  // against the published baseline — same drop-out semantics as the summary.
  assert.match(source, /buildPublishDiffRows\(localSeats, localPublishedSeats\)/);
  assert.match(dialogsSource, /aria-labelledby="publish-review-title"/);
  assert.match(dialogsSource, /aria-modal="true"/);
  assert.match(dialogsSource, /Review draft before publishing/);
  assert.match(dialogsSource, /Saved draft changes only — unsaved inspector edits are excluded\./);
  assert.match(dialogsSource, /Draft and published map are in sync\./);
  // No ×: leaving is Cancel (the frame invariant); nothing chains into a second modal.
  assert.doesNotMatch(dialogsSource, /aria-label="Close publish review"|<CloseIcon/);
  // Viewer-impact + undo-history warnings, one rail line — both facts must survive verbatim.
  assert.match(dialogsSource, /Replaces what everyone sees — both floors, in one step — and clears Undo\/Redo\. Viewers keep the current map until it finishes\./);
  assert.match(dialogsSource, /Publish did not complete/);
  assert.match(dialogsSource, /Publishing reviewed draft changes/);
  assert.match(dialogsSource, /\{actionError && !pending && \(/);
  assert.match(dialogsSource, /Retry publish/);
  assert.match(dialogsSource, /No draft changes to publish/);
  assert.match(dialogsSource, /disabled=\{!publishSummary\.hasChanges \|\| pending\}\s*aria-busy=\{pending \|\| undefined\}/);
  // The diff table's column contract and the floor group rows (registry order).
  assert.match(dialogsSource, /Published now/);
  assert.match(dialogsSource, /After publish/);
  assert.match(dialogsSource, /groupByFloor\(publishDiffRows\)/);
  assert.match(dialogsSource, /className="sp-table-group"/);
  // Kind tags are the asset's `.cds-tag` (the rail's tag set) and plain words in the Change cell.
  assert.match(dialogsSource, /className="cds-tag"/);
  assert.match(dialogsSource, /PUBLISH_DIFF_TAG_LABELS\[row\.kind\]/);
  assert.match(dialogsSource, /People details/);
  assert.match(source, /Publish review blocked: Save or discard the selected seat edits before publishing/);
  assert.match(source, /Save or discard the selected seat edits before publishing/);
  assert.doesNotMatch(source, /Publish draft map to the viewer-facing seat map\?/);
  assert.doesNotMatch(dialogsSource, /Publish draft map to the viewer-facing seat map\?/);
});

test("publish workflow stays server-action gated and clears review history state", async () => {
  // The publish flow lives in usePublishReview.ts (R-02a extraction);
  // SeatMap wires the hook's confirm into the extracted dialog.
  const seatMapSource = await readSource("../components/seat-map/SeatMap.tsx");
  const hookSource = await readSource("../components/seat-map/usePublishReview.ts");
  const actionSource = await readSource("../app/actions.ts");
  const openPublishFunction = hookSource.match(/function openPublishReview\(\) \{[\s\S]*?function confirmPublishDraftMap/);
  const confirmPublishFunction = hookSource.match(/function confirmPublishDraftMap\(\) \{[\s\S]*?\n  \}/);
  // Signature carries the expected_draft_seats concurrency fence (20260805130000).
  const publishAction = actionSource.match(/export async function publishSeatMapAction\([\s\S]*?\n\}/);

  assert.ok(openPublishFunction, "openPublishReview should remain source-visible.");
  assert.ok(confirmPublishFunction, "confirmPublishDraftMap should remain source-visible.");
  assert.ok(publishAction, "publishSeatMapAction should remain source-visible.");

  assert.match(openPublishFunction[0], /if \(inspectorDirty\) \{[\s\S]*Publish review blocked: Save or discard the selected seat edits before publishing/);
  assert.match(hookSource, /function confirmPublishDraftMap\(\) \{[\s\S]*setActionError\(null\);\s*setActionNotice\(null\);\s*startTransition/);
  // The confirm wiring crosses the extraction seam: SeatMap hands the
  // transition-gated confirm to the dialog, whose publish button stays
  // disabled without reviewed changes.
  const dialogsSourceForPublish = await readSource("../components/seat-map/PublishReviewSheet.tsx");
  assert.match(seatMapSource, /onConfirm=\{confirmPublishDraftMap\}/);
  assert.match(dialogsSourceForPublish, /onClick=\{onConfirm\}\s*disabled=\{!publishSummary\.hasChanges \|\| pending\}\s*aria-busy=\{pending \|\| undefined\}/);
  assert.match(confirmPublishFunction[0], /await publishSeatMapAction\(publishReviewExpectations, publishReviewEmployeeExpectations\)/);
  assert.match(confirmPublishFunction[0], /setLocalPublishedSeats\(nextPublishedSeats\)/);
  // Publish still drops the undo/redo stacks; they live in useDraftHistory now,
  // so the clear goes through the hook's own reset instead of a local setState.
  assert.match(confirmPublishFunction[0], /clearHistory\(\)/);
  assert.match(confirmPublishFunction[0], /setPublishReviewOpen\(false\)/);
  assert.match(confirmPublishFunction[0], /Draft map published\. Undo\/Redo history was cleared\./);
  assert.doesNotMatch(confirmPublishFunction[0], /supabase|\.from\("seats"\)|publish_seat_map/);

  assert.match(publishAction[0], /const supabase = await requireAdmin\(\)/);
  assert.match(publishAction[0], /\.rpc\("publish_seat_map", \{/);
  assert.match(publishAction[0], /revalidatePath\("\/"\)/);
  assert.match(publishAction[0], /revalidatePath\("\/admin"\)/);
  assert.doesNotMatch(publishAction[0], /\.from\("seats"\)|\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
});

test("seat markers remain keyboard buttons with contextual accessible labels", async () => {
  const source = await readSource("../components/seat-map/SeatMarker.tsx");

  assert.match(source, /<button[\s\S]*type="button"/);
  assert.match(source, /aria-pressed=\{selected\}/);
  // Status is announced through STATUS_LABELS ("Open seat."), never the raw
  // lowercase enum value (2026-07-16 critique, action 3).
  assert.match(source, /aria-label=\{`\$\{seat\.label\} \$\{accessibleSeatName\}\. \$\{STATUS_LABELS\[seat\.status\]\} seat\./);
  // Assistive strings carry the same display-formatted identity as the visible
  // labels: raw stored casing ("PAM", "ALEX S.") must not leak into the
  // marker's title tooltip / aria-label (2026-07-16 critique, fix 2). The
  // unassigned fallback is "Unassigned", not "Open seat" — the aria-label
  // already appends the status ("Open seat."), so an "Open seat" fallback
  // announced as "Open seat. Open seat." (2026-07-19 a11y pass).
  assert.match(source, /const displayName = formatDisplayName\(employeeName\) \|\| "Unassigned"/);
  assert.match(source, /Search result\./);
  assert.match(source, /highlightedDescription = "Highlighted by Ask Planner"/);
  assert.match(source, /\$\{highlightedDescription\}\./);
  assert.match(source, /Selected\./);
  // Phase 4 PR 3b: the focus ring is the CSS deliverable's — `.sp-pill` and
  // `.sp-seat-footprint` own a 2px inset `--sp-focus` outline in
  // sp-components.css, so the marker only has to wear the classes.
  assert.match(source, /"sp-pill cds-touch-target"/);
  assert.match(source, /"sp-seat-footprint cds-touch-target/);
  const componentsCss = await readSource("../app/styles/sp-components.css");
  assert.match(componentsCss, /\.sp-pill:is\(:focus-visible, \[data-state="focus"\]\) \{ outline: var\(--sp-focus-width\) solid var\(--sp-focus\); outline-offset: var\(--sp-focus-offset\); \}/);
  assert.match(componentsCss, /\.sp-seat-footprint:is\(:focus-visible, \[data-state="focus"\]\) \{ outline: var\(--sp-focus-width\) solid var\(--sp-focus\); outline-offset: var\(--sp-focus-offset\); \}/);
  assert.doesNotMatch(source, /focus-visible:outline-none|outline-none/);
});

test("inspector sections, validation, and actions retain accessible confidence cues", async () => {
  const inspectorSource = await readSource("../components/seat-map/SeatInspector.tsx");

  assert.match(inspectorSource, /aria-label=\{`Ask Planner about \$\{selectedSeat\.label\}`\}/);
  // Flat sections (2026-08-19 Carbon handoff, owner-approved — supersedes the
  // 2026-08-18 progressive disclosure): section headings are static h3s and
  // every section body stays mounted, so no section header may carry an
  // aria-expanded/aria-controls toggle. The inspector stays close-only — the
  // collapse rail/pill is retired, so no "VIEW DETAILS" affordance may return.
  assert.doesNotMatch(inspectorSource, /DisclosureSectionHeader/);
  assert.doesNotMatch(inspectorSource, /aria-controls=\{bodyId\}/);
  assert.doesNotMatch(inspectorSource, /setOpenSections/);
  assert.doesNotMatch(inspectorSource, /role="tablist"|role="tabpanel"/);
  assert.doesNotMatch(inspectorSource, /VIEW DETAILS/);
  assert.doesNotMatch(inspectorSource, /Collapse inspector/);
  // Phase 4 PR 3b: the inspector IS the right slot (`.sp-slot` inside
  // RightSlot's host) — no z-index of its own; the move-conflict dialog keeps
  // its own stacking above everything.
  assert.match(inspectorSource, /className="sp-slot max-w-full"/);
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
  // never sit inside a collapsible container — the primary assignment action
  // is pinned under the header and Save/Cancel sit in a conditional commit
  // bar OUTSIDE the scroll area (rendered only while editing or dirty; the
  // 2026-07-10 ban on a PERMANENT sticky ACTION footer stands — the quiet
  // facts footer bar is display-only and carries no controls). The flat
  // 2026-08-19 handoff restores "seat ops never collapse" for free: the Seat
  // management section body is always mounted.
  assert.doesNotMatch(inspectorSource, /InspectorSection title="Actions"/);
  assert.match(inspectorSource, /id="seat-actions-heading"/);
  assert.match(inspectorSource, /const showCommitBar = /);
  assert.match(inspectorSource, /id="seat-inspector-commit-bar"/);
  // The keyed remount stays: it resets transient DOM state (scroll position)
  // when the selection moves to another seat.
  assert.match(inspectorSource, /key=\{`seat-inspector-sections-\$\{selectedSeat\.id\}`\}/);
  // Delete renders only where it can actually succeed. Owner ruling
  // 2026-08-20: a delete button that can never fire must not appear at all,
  // not appear disabled — so the render gate is canDeleteSeat (draft +
  // custom + unassigned + available + not a protected-original label, which
  // keeps the gate immune to is_custom data drift on original seats).
  assert.match(inspectorSource, /\{selectedSeatCanDelete \? \(/);
  assert.match(inspectorSource, /const selectedSeatCanDelete = canDeleteSeat\(selectedSeat\);/);
  // An open seat has no occupant — the Contact section exists only when
  // someone is assigned (admin and viewer variants alike). Department stays
  // out of it: the header role line already carries it (dedup 2026-07-23).
  // v12 slice 4: the <details>-based InspectorSection title prop retired
  // with the flat eyebrow-heading sections — the CONTACT heading text is the
  // new anchor for the same "only when assigned" guarantee.
  assert.match(inspectorSource, /\{hasCurrentAssignment && \([\s\S]{0,300}title="Contact metadata"/);
  assert.match(inspectorSource, /\{hasCurrentAssignment && \([\s\S]{0,200}CONTACT/);
  assert.doesNotMatch(inspectorSource, /FactRow label="Department"/);
  // The occupied-seat CTA reads as an edit verb — it opens a form, it does
  // not act; "Change assignment" collided with Move/Swap/Vacate (2026-07-23).
  assert.match(inspectorSource, /Edit assignment for \$\{selectedSeat\.label\}/);
  assert.doesNotMatch(inspectorSource, /Change assignment/);
  // Notes keeps its stable body id — it is what the browser tier's
  // dirty-notes helper and the e2e-auth guard spec reach for.
  assert.match(inspectorSource, /title="Workspace notes"/);
  assert.match(inspectorSource, /<div id="seat-inspector-notes"/);
  // Status is the seat-mark legend row (shape + label, PHASE3DS §1.4) and the
  // saved confirmation is the one notification component's success kind —
  // never a solid status fill with a hardcoded text partner (white on the
  // dark-theme --sp-status-success-mark #42be65 fails AA at ~2.2:1, which is
  // how the old solid tag broke silently when dark mode landed).
  assert.match(inspectorSource, /<SeatMark kind=\{legendKind\} \/>\{currentStatusLabel\}/);
  assert.match(inspectorSource, /cds-notification cds-notification--success/);
  assert.doesNotMatch(inspectorSource, /bg-\[var\(--sp-status-success-mark\)\] text-white/);
  assert.doesNotMatch(inspectorSource, /bg-\[var\(--sp-status-success-mark\)\] text-\[var\(--sp-text-primary\)\]/);
  assert.doesNotMatch(inspectorSource, /sticky bottom-0/);
  assert.match(inspectorSource, /No unsaved changes\./);
  // The verbose repeated panels are gone (Claude Design cleanup).
  assert.doesNotMatch(inspectorSource, /Seat Summary|Planning inspector|Draft-only impact|Assignment workflow|Actions \/ Rules/);
  assert.match(inspectorSource, /canDeleteSeat/);
  assert.match(inspectorSource, /Fix the highlighted inspector fields before saving/);
  // Move-confirm dialog renders canonical identity casing for both segments
  // (person via formatDisplayName, seat code via formatSeatCode) — raw stored
  // values must not surface here (2026-07-16 critique, fix 2 follow-up).
  assert.match(inspectorSource, /Move \{formatDisplayName\(moveConflict\.employeeName\)\} to \{formatSeatCode\(selectedSeat\.label\)\}\?/);
  // PR 3b: the error summary is the one notification component (error kind), titled for the seat.
  assert.match(inspectorSource, /cds-notification cds-notification--error/);
  assert.match(inspectorSource, /Couldn&apos;t save this seat/);
  assert.match(inspectorSource, /errorSummaryRef\.current\?\.focus\(\)/);
  assert.match(inspectorSource, /focusInspectorField\(error\.field\)/);
  assert.match(inspectorSource, /aria-invalid=\{Boolean\(fieldErrorMap\.employeeName\)\}/);
  assert.match(inspectorSource, /Add an employee name before saving assignment details\./);
  assert.match(inspectorSource, /aria-describedby=\{saveDisabledReason \? "seat-inspector-save-help" : undefined\}/);
  assert.match(inspectorSource, /getSeatDeleteBlockReason/);
  assert.match(inspectorSource, /Delete seat/);
  assert.match(inspectorSource, /aria-describedby="seat-inspector-delete-help"/);
  // PR 3b: Delete is the asset's danger ghost (P3-8) — the one destructive
  // treatment, never a filled danger button inside the slot.
  assert.match(inspectorSource, /className="cds-btn cds-btn--danger-ghost"/);
  // Figma delete treatment: the block reason is a visible helper line, not sr-only.
  // (Class content deliberately unpinned — type-scale values are free to evolve;
  // the guardrail is the visible element carrying the aria-describedby id.)
  assert.match(inspectorSource, /<p id="seat-inspector-delete-help" className="[^"]*">\{deleteHelpText\}<\/p>/);
  assert.doesNotMatch(inspectorSource, /Discard unsaved inspector edits before deleting this custom seat/);
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
  assert.match(source, /requestInspectorGuard\(\{ kind: "start-swap-seat" \}\)/);
  assert.match(source, /requestInspectorGuard\(\{ kind: "start-move-employee" \}\)/);
  // Navigation guards carry their destination: Save/Discard must land the
  // user on the page they actually clicked (Management OR Settings), and the
  // dialog copy must name it.
  assert.match(source, /requestInspectorGuard\(\{ kind: "navigate-admin-page", href, destination \}\)/);
  // The resumed navigation stays on the client router (the persistent rail
  // must not blank into a document load) — except on a deploy-skewed tab,
  // where a soft nav would dead-end and the full load is the deliberate
  // recovery, exactly like AppRail's own click path.
  assert.match(source, /deploySkewMonitor\.isSkewed\(\)[\s\S]{0,120}assignLocation\(action\.href\)/);
  assert.match(source, /router\.push\(action\.href\)/);
  assert.doesNotMatch(source, /window\.location\.assign\(action\.href\)/);
  assert.match(source, /return `opening \$\{action\.destination\}\.`/);
  assert.match(source, /queueCenterSeatInMap\(action\.seatId\)/);
  // The dirty-inspector publish gate moved into usePublishReview.ts with the
  // publish flow (R-02a extraction).
  const publishHookSource = await readSource("../components/seat-map/usePublishReview.ts");
  assert.match(publishHookSource, /Save or discard the selected seat edits before publishing/);
  // Guard-dialog markup lives in SeatMapDialogs.tsx (R-02a extraction); the
  // guard state machine and its action descriptions stay in SeatMap.
  const guardDialogSource = await readSource("../components/seat-map/SeatMapDialogs.tsx");
  assert.match(guardDialogSource, /id="inspector-unsaved-title"/);
  assert.match(guardDialogSource, /Unsaved seat edits/);
  assert.match(guardDialogSource, /Save changes/);
  assert.match(guardDialogSource, /Discard/);
  assert.match(guardDialogSource, /Keep editing/);
  assert.match(source, /form\.requestSubmit\(\)/);
  assert.match(source, /onSubmitBlocked=\{cancelPendingInspectorGuardAction\}/);
  assert.match(source, /setPendingInspectorSaveAction\(null\)/);
  // v12: Management, Viewer, and Settings navigation all moved off individual
  // per-link handlers (each used to hardcode its own beforeGuardedNavigation
  // call) into the rail's items, which share ONE generic callback. A dirty
  // inspector must intercept every destination uniformly, and routing all of
  // them through the same registered guard guarantees that by construction —
  // there is no longer a per-link call site to individually forget the guard
  // on. (The rail mounts in the persistent AppShell now; SeatMap registers
  // the guard via useAppShellNavigation, and AppShell's own suite +
  // app-rail.test.mjs verify the rail honors it.)
  assert.match(source, /useAppShellNavigation\(\{[\s\S]{0,420}guard: \(href, label\) => \(isGuardedNavigationHref\(href\) \? beforeGuardedNavigation\(href, label\) : true\)/);
  // And the browser-owned path (tab close / hard navigation) arms beforeunload
  // while the inspector is dirty.
  assert.match(source, /window\.addEventListener\("beforeunload", warnBeforeUnload\)/);
  assert.doesNotMatch(source, /You have unsaved seat edits\. Discard them\?/);
});

test("admin search and filter confidence controls stay accessible and admin-scoped", async () => {
  const seatMapSource = await readSource("../components/seat-map/SeatMap.tsx");
  // Filter values, derived results, and their handlers live in
  // useSeatFilters.ts since the R-02a extraction.
  const filtersHookSource = await readSource("../components/seat-map/useSeatFilters.ts");
  // PR 3a: the filters live in the shell's left panel (registered through
  // useAppShellFilters) and the results in the one Find palette; the control
  // row's "Filters · N" split control opens the panel and clears without
  // reopening (patterns.md), the palette lists results with a roving list.
  const leftPanelSource = await readSource("../components/ui/LeftPanel.tsx");
  const controlRowSource = await readSource("../components/seat-map/MapControlRow.tsx");
  const findPaletteSource = await readSource("../components/seat-map/ViewerFindPalette.tsx");
  assert.match(leftPanelSource, /Clear all/);
  assert.match(controlRowSource, /aria-controls="shell-left-panel"/);
  assert.match(controlRowSource, /aria-label="Clear filters"/);
  assert.match(findPaletteSource, /role="list"/);
  assert.match(findPaletteSource, /aria-label="Viewer search results"/);
  assert.match(findPaletteSource, /ArrowDown/);
  assert.match(findPaletteSource, /ArrowUp/);

  assert.match(filtersHookSource, /function removeActiveFilterChip/);
  assert.match(seatMapSource, /useAppShellFilters\(shellFilterSpec\)/);
  assert.match(seatMapSource, /ariaLabel: "Admin search"/);
  assert.doesNotMatch(seatMapSource, /aria-label="Map tools"/);
  assert.doesNotMatch(seatMapSource, /aria-label="Admin workspace rail"/);
  assert.doesNotMatch(seatMapSource, /aria-label="Primary workspace controls"|aria-label="Secondary admin actions"/);
  assert.doesNotMatch(seatMapSource, /aria-label="Map command actions"|aria-label="Planning map actions"/);
  // Esc's filter rung routes through the shared clear (all four facets,
  // position included) — the per-facet setter literals it used to pin moved
  // into useSeatFilters; tests/seat-map-escape-source.test.mjs pins the
  // handler's shape precisely. This assertion is scoped to handleEscape
  // itself (comments stripped), not the whole file: the unrelated
  // onClearSearchContext call site elsewhere in SeatMap.tsx also mentions
  // clearStructuredFilters, and would satisfy a whole-file match even if the
  // Esc rung regressed.
  const escapeHandlerStart = seatMapSource.indexOf("function handleEscape");
  const escapeHandlerEnd = seatMapSource.indexOf('window.addEventListener("keydown", handleEscape)', escapeHandlerStart);
  assert.ok(escapeHandlerStart !== -1 && escapeHandlerEnd !== -1, "handleEscape should remain source-visible and wired up via window.addEventListener.");
  const escapeHandlerNoComments = seatMapSource
    .slice(escapeHandlerStart, escapeHandlerEnd)
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(escapeHandlerNoComments, /clearStructuredFilters\(\)/);
  // The map-pushing search hint card is removed; the input placeholder carries the guidance.
  assert.doesNotMatch(seatMapSource, /Search the draft map/);
  assert.match(seatMapSource, /placeholder: SEAT_SEARCH_PLACEHOLDER/);
  assert.match(seatMapSource, /function openSeatFromResults/);
  assert.match(seatMapSource, /queueCenterSeatInMap\(seatId\)/);
  assert.match(seatMapSource, /No search results/);
  assert.match(seatMapSource, /No filter results/);
  assert.match(seatMapSource, /No combined results/);
  assert.match(seatMapSource, /Fit matches unavailable because there are no matching seats/);
  // Panel slot (owner-revised): results open while search/filters are active and the
  // inspector is closed or auto-collapsed to its pill; searching collapses (never
  // clears) an open clean selection. No reserved gutter, no idle Map key rail.
  // PR 3a: results open in the one Find palette (D1-d) from the row's field.
  assert.match(seatMapSource, /\{paletteOpen && \(\s*<ViewerFindPalette/);
  // INV-1 lives once in lib/viewerSeatSearch (searchHandsPanelToResults,
  // unit-tested) and BOTH maps call it — the admin passes its dirty guard, the
  // read-only viewer passes false (2026-07-16 critique, fix 5). The admin
  // call site is in useSeatFilters.ts since the R-02a extraction.
  assert.match(filtersHookSource, /if \(searchHandsPanelToResults\(value, Boolean\(selectedSeatId\), inspectorDirty\)\) \{\s*setInspectorCollapsed\(true\);/);
  const viewerFinderForInv1 = await readSource("../components/seat-map/ViewerSeatFinder.tsx");
  assert.match(viewerFinderForInv1, /if \(searchHandsPanelToResults\(value, Boolean\(selectedSeatId\), false\)\) \{\s*setInspectorCollapsed\(true\);/);
  assert.doesNotMatch(seatMapSource, /mapKeyPanelOpen|desktopInspectorReserveMarginClassName|dock:/);
  assert.match(seatMapSource, /aria-labelledby="admin-planning-canvas-title" className="order-1 min-w-0 overflow-hidden/);
  assert.match(seatMapSource, /const mobileMapInteractionSurfaceOpen = canEdit && \(/);
  assert.match(seatMapSource, /const mobileMapControlsHidden = mobileMapInteractionSurfaceOpen;/);
  assert.match(seatMapSource, /mobileMapControlsHidden \? "hidden sm:block" : ""/);
  // 3b MODE CARD: modes own the panel slot (no canvas banner); move-mode copy
  // lives inside the inspector occupant.
  assert.match(seatMapSource, /const modeCardOpen = canEdit && Boolean\(activeMode\) && \(!selectedSeat \|\| inspectorCollapsed\)/);
  // PR 3b: the mode card owns the right slot until the mode ends (INV-4).
  assert.match(seatMapSource, /const slotOwner: RightSlotOwner = modeCardOpen \? "mode" : askPlannerOpen && canEdit \? "ask" : selectedSeat && !inspectorCollapsed \? "inspector" : null;/);
  assert.match(seatMapSource, /\{slotOwner === "mode" && activeMode && \(/);
  assert.match(seatMapSource, /\{paletteOpen && \(\s*<ViewerFindPalette/);
  // PR 3a: action errors, the stale-draft refresh and the outcome notice ride the canvas status region (PHASE3DS §1.21).
  assert.match(seatMapSource, /<CanvasStatus notices=\{canvasNotices\} \/>/);
  assert.match(seatMapSource, /kind: "error", alert: true, text: actionError/);
  // The card itself (ModeCard.tsx) is the polite live region named "<label> mode".
  assert.match(await readSource("../components/seat-map/ModeCard.tsx"), /role="status" aria-live="polite" aria-label=\{`\$\{label\} mode`\}/);
  // The action notice toast is IN-FLOW inside the top-cluster overlay (a
  // second flex-col row), never absolutely offset over it: any fixed top
  // clearance overlaps the cluster once its filter chips wrap to a second
  // row, and the later-painted toast then intercepts their clicks
  // (PR #404 review). pointer-events-auto is load-bearing — the cluster rail
  // is pointer-events-none and each card opts back in.
  assert.match(seatMapSource, /className=\{mapMarkerLayerClassName\}/);
  // INV-2: no auto-select - a single match stays in results until an explicit open.
  assert.doesNotMatch(seatMapSource, /singleResultSeat|autoSelectedSearchKeyRef|Auto-selected/);
  // INV-1: typing a search evicts the open inspector (unsaved edits keep the
  // guard) — rule shared via lib/viewerSeatSearch.searchHandsPanelToResults.
  assert.match(filtersHookSource, /if \(searchHandsPanelToResults\(value, Boolean\(selectedSeatId\), inspectorDirty\)\) \{/);
  assert.match(seatMapSource, /\{paletteOpen && \(\s*<ViewerFindPalette/);
  // The palette opens a seat row through the one selection path and a person
  // row through the roster hand-off (PR 3a: openResult in SeatMap).
  assert.match(seatMapSource, /onOpenRow=\{openResult\}/);
  assert.match(seatMapSource, /if \(result\.seatId\) \{\s*selectSeatResult\(result\.seatId\);/);
  assert.match(seatMapSource, /openPersonFromResults\(result\.employeeId\)/);
  // The map ⋯ overflow menu was retired in v12 slice 3 (its two items live on
  // the zoom stack's fit button and the chrome kebab's reset-zoom), so its
  // APG menu pins moved out with it. What survives here is narrower than the
  // retired block: the popover focus-restore test below still pins that the
  // chrome ⋯ trigger gets focus back when its popover closes. Nothing in this
  // file pins the chrome ⋯ as a role="menu" (it is a role="group") —
  // FloorSelector is now the repo's only APG menu, and its pattern is pinned
  // below: role="menu" + menuitemradio items with aria-checked, an
  // ArrowDown-opens handler on the trigger, and Escape-close-refocus.
  const floorSelectorSource = await readSource("../components/seat-map/FloorMenuButton.tsx");
  assert.match(floorSelectorSource, /role="menu"/);
  assert.match(floorSelectorSource, /role="menuitemradio"/);
  assert.match(floorSelectorSource, /aria-checked=\{option\.id === floor\}/);
  assert.match(floorSelectorSource, /event\.key === "ArrowDown" && !open\) \{\s*event\.preventDefault\(\);\s*setOpen\(true\);/);
  assert.match(floorSelectorSource, /event\.key === "Escape"\) \{\s*event\.stopPropagation\(\);\s*closeAndRefocus\(\);/);
  assert.match(floorSelectorSource, /function closeAndRefocus\(\) \{\s*setOpen\(false\);\s*triggerRef\.current\?\.focus\(\);/);
});

test("popovers restore trigger focus when a close unmounts the focused element", async () => {
  const seatMapSource = await readSource("../components/seat-map/SeatMap.tsx");
  const controlRowSource = await readSource("../components/seat-map/MapControlRow.tsx");
  const helperSource = await readSource("../components/ui/returnFocus.ts");

  // One shared mechanism: closing a popover from keyboard (or activating a
  // menu item) unmounts the focused element, which strands keyboard focus on
  // <body> (live-verified on prod 2026-07-14). The deferred helper is the
  // single home for the restore.
  assert.match(helperSource, /export function returnFocusAfterClose/);
  assert.match(helperSource, /setTimeout\(\(\) => trigger\.current\?\.focus\(\), 0\)/);

  // The Ask Planner drawer returns focus to its row trigger on close.
  assert.match(seatMapSource, /returnFocusAfterClose\(askPlannerButtonRef\)/);
  // The control row's ⋯ menu (Discard only, D2-b) returns focus to its trigger
  // on Escape and closes on an outside pointer.
  assert.match(controlRowSource, /event\.key === "Escape"\) \{\s*event\.stopPropagation\(\);\s*setOpen\(false\);\s*triggerRef\.current\?\.focus\(\);/);
  assert.match(controlRowSource, /rootRef\.current\?\.contains\(event\.target as Node\)/);
});

// WCAG 2.5.3 Label in Name: a control's accessible name must contain its
// VISIBLE text, so a speech-input user can say what they see. The Ask Planner
// trigger renders "✦ Ask Planner AI" with the badge aria-hidden, and named
// itself "Open Ask Planner" — dropping a word that is on screen. Lighthouse's
// axe pass caught it (label-content-name-mismatch) while the accessibility
// score still read 100, because that audit carries zero weight.
test("the Ask Planner trigger's accessible name contains the badge it renders", async () => {
  // PR 3a: the trigger is the control row's tertiary button; the count badge
  // is the asset's [data-count] pseudo (aria-hidden by construction) and the
  // name says it in words.
  const seatMapSource = await readSource("../components/seat-map/MapControlRow.tsx");

  assert.match(seatMapSource, /"Open Ask Planner AI"/);
  assert.match(seatMapSource, /`Open Ask Planner AI, \$\{draft\.askPlanner\.count\} seats highlighted`/);
  assert.match(seatMapSource, /data-count=\{draft\.askPlanner\.count > 0 \? draft\.askPlanner\.count : undefined\}/);
  assert.match(seatMapSource, />\s*Ask Planner\s*<\/button>/);
});

test("the Ask Planner trigger's retired inline badge stays retired", async () => {
  const seatMapSource = await readSource("../components/seat-map/SeatMap.tsx");
  assert.doesNotMatch(seatMapSource, /<span aria-hidden="true"[^>]*>\s*AI\s*<\/span>/);
  assert.match(seatMapSource, /askPlannerAnchor=\{askPlannerButtonRef\}/);
  return;
  // The badge stays aria-hidden — it is IN the name via the label, so exposing
  // the span too would say "AI" twice.
  assert.match(seatMapSource, /<span aria-hidden="true"[^>]*>\s*AI\s*<\/span>/);
  // The explicit space is the half that actually decides the audit. axe
  // compares the accessible name against the button's TEXT CONTENT, and JSX
  // drops the newline between a string child and the following element — so
  // "Ask Planner" + <span>AI</span> renders as "Ask PlannerAI" and Label in
  // Name fails whatever the aria-label says. Verified against axe-core 4.12
  // directly: same markup passes with the space, fails without it.
  assert.match(seatMapSource, /Ask Planner\{" "\}/);
});

test("chrome bars stay pinned and the filter menu precedes search in the tab order", async () => {
  const seatMapSource = await readSource("../components/seat-map/SeatMap.tsx");
  const viewerSource = await readSource("../components/seat-map/ViewerSeatFinder.tsx");
  const shellBarSource = await readSource("../components/ui/AppTopBar.tsx");
  const askPlannerSource = await readSource("../components/seat-map/AskPlannerDrawer.tsx");
  const globalsSource = await readSource("../app/globals.css");

  // Pinned-bar consequences: modal backdrops must still cover the chrome
  // tier (the drawer's backdrop shields Publish/Settings while the dialog is
  // open), and browser-driven scrolls must not align focused controls under
  // the opaque bar (WCAG 2.4.11 focus-obscured).
  // PR 3b: Ask Planner is the right slot — a side panel with no backdrop; the
  // map stays usable beside it and nothing sits under a fixed sheet.
  assert.match(askPlannerSource, /className="sp-slot max-w-full"/);
  assert.doesNotMatch(askPlannerSource, /fixed inset-0|aria-modal/);
  assert.match(globalsSource, /scroll-padding-top/);

  // One scroll behavior on every surface: below lg the page scrolls, and a
  // static bar carries the app's only chrome (search, filters, publish
  // status) out of view. Only the pinning behavior is pinned here — z tiers
  // and the rest of the class list are layout choices, free to evolve.
  // The shell header is the asset's fixed .cds-header (redesign-v2 PR 2);
  // the content pane carries the offset. SeatMap's standalone fallback
  // header (harness-only) keeps the sticky contract until PR 3.
  assert.match(shellBarSource, /<header id="shell-header" className="cds-header sp-header">/);
  // Neither map surface has a header of its own (route-group move + PR 3a):
  // each mounts the shared control row under the shell header instead.
  assert.doesNotMatch(seatMapSource, /<header/);
  assert.doesNotMatch(viewerSource, /<header/);
  assert.match(seatMapSource, /<MapControlRow/);
  assert.match(viewerSource, /<MapControlRow/);
  // The map roots must clip horizontal overflow with `clip`, not `hidden`:
  // overflow-x-hidden turns the root into a scroll container, which captures
  // the sticky header so it never pins to the viewport (live-caught).
  for (const source of [seatMapSource, viewerSource]) {
    assert.match(source, /overflow-x-clip/);
    assert.doesNotMatch(source, /min-h-screen flex-col overflow-x-hidden/);
  }

  // The admin canvas filter UI was removed (owner call 2026-08-20) and the
  // viewer's popover retired into the shell's left panel (PR 3a).
  assert.doesNotMatch(seatMapSource, /showFilterPanel/);
  assert.doesNotMatch(viewerSource, /filterOpen/);
});

test("the Account panel surfaces identity and sign-out from the shell on every surface", async () => {
  const shellBarSource = await readSource("../components/ui/AppTopBar.tsx");
  const panelsSource = await readSource("../components/ui/ShellPanels.tsx");

  // Redesign-v2 PR 2: identity + sign-out live in the Account panel
  // (ShellPanels), opened from the header's Account utility — present
  // identically on every shell surface (the viewer included since the
  // route-group move). The panel is a complementary landmark labelled by
  // its heading, with the real POST sign-out form; the header itself hosts
  // no form and promotes no Settings entry.
  assert.match(shellBarSource, /aria-controls=\{`shell-panel-\$\{utility\.id\}`\}/);
  assert.match(panelsSource, /<aside id=\{`shell-panel-\$\{open\}`\} className="sp-panel" aria-labelledby=/);
  assert.match(panelsSource, /<form action="\/auth\/signout" method="post"/);
  assert.match(panelsSource, /Sign out/);
  assert.doesNotMatch(shellBarSource, /<form action="\/auth\/signout"/);
  assert.doesNotMatch(shellBarSource, /onSelectSettings/);
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
  assert.match(searchLibSource, /export const SEAT_SEARCH_PLACEHOLDER = "Search people or seats…"/);
  // One field per surface since PR 3a (MapSearch); both hand it the shared string.
  assert.equal((seatMapSource.match(/placeholder: SEAT_SEARCH_PLACEHOLDER/g) ?? []).length, 1, "the admin search hands MapSearch the shared placeholder");
  assert.match(viewerSource, /placeholder: SEAT_SEARCH_PLACEHOLDER/);
  assert.match(await readSource("../components/seat-map/MapSearch.tsx"), /placeholder=\{placeholder\}/);
  assert.doesNotMatch(seatMapSource, /placeholder="Search people/);
  assert.doesNotMatch(viewerSource, /placeholder="Search people/);

  // Show names is a real toggle: stable accessible name + aria-pressed. The
  // old flipping label ("Hide names") with no pressed state left the current
  // view invisible to assistive tech — and the surviving control must keep a
  // VISIBLE state cue too (sighted users lost the flipping label).
  //
  // Counted RELATIONALLY, not as a fixed number. The toggle moved twice on
  // 2026-07-22 — out of the row into the map menu, then back to the row — so
  // HOW MANY toggles exist and WHERE are layout decisions this file does not
  // own. The invariant that survived both moves: every control which flips
  // showNames exposes its state to assistive tech. A fixed count fails on a
  // relayout while still passing a toggle that forgot the attribute entirely,
  // which is backwards.
  //
  // aria-pressed OR aria-checked, because the correct attribute depends on the
  // control's role: a plain button takes aria-pressed, a menu item cannot (see
  // the guard below) and would need role="menuitemcheckbox" + aria-checked.
  // Having NEITHER is the regression.
  // Two ways a control may satisfy the invariant: carry the attribute inline
  // (the kebab item), or delegate to the shared NamesVisibilityToggle switch,
  // which owns aria-pressed={pressed} itself (asserted below). Every flipper
  // must land in exactly one bucket.
  const namesToggleControls = (seatMapSource.match(/setShowNames\(current => !current\)/g) ?? []).length;
  assert.ok(namesToggleControls >= 1, "the admin map must keep a names toggle");
  const inlineExposures = (seatMapSource.match(/aria-(?:pressed|checked)=\{showNames\}/g) ?? []).length;
  // PR 3a: the row's toggle is delegated through MapControlRow's `names` prop,
  // which hands `pressed` to the shared switch (aria-pressed lives there).
  const delegatedExposures = (seatMapSource.match(/<NamesVisibilityToggle[\s\S]{0,160}pressed=\{showNames\}|names=\{canEdit \? \{ pressed: showNames/g) ?? []).length;
  assert.equal(
    inlineExposures + delegatedExposures,
    namesToggleControls,
    "every control that toggles showNames must expose its state to assistive tech"
  );
  // Permanent guard, learned the hard way: aria-pressed is INVALID on
  // role="menuitem" and assistive tech may drop it silently, which would void
  // the assertion above while it still passed. Putting a toggle in a role="menu"
  // means menuitemcheckbox + aria-checked — and note that changing the role also
  // breaks any [role="menuitem"] selector driving that menu's keyboard roving.
  assert.doesNotMatch(seatMapSource, /role="menuitem"[\s\S]{0,120}aria-pressed=/);
  // v12: the kebab item's label is "Show occupant names" (contract #12,
  // matching the prototype's dc.html line 103 copy exactly) — the inverse-
  // verb guard must track the CURRENT label, not the retired "Show names"
  // one, or a regression to "Hide occupant names" would slip past a stale
  // "Hide names" substring check.
  assert.doesNotMatch(seatMapSource, /Hide occupant names/);
  // PR 3a: the admin's one names control is the row's switch (delegated).
  assert.match(seatMapSource, /names=\{canEdit \? \{ pressed: showNames, hidden: surface !== "plan"/);

  // The shared switch both legend footers render: stable label, aria-pressed,
  // no inverse verb — the same contract as the inline controls, held once.
  const namesToggleSource = await readSource("../components/seat-map/NamesVisibilityToggle.tsx");
  assert.match(namesToggleSource, /aria-pressed=\{pressed\}/);
  assert.match(namesToggleSource, /Show occupant names/);
  assert.doesNotMatch(namesToggleSource, /Hide occupant names/);

  // The viewer surface gained the same toggle (2026-08-17) under the same
  // relational invariant: every control that flips its showNames must expose
  // the state, inline or via the shared switch.
  const viewerFlippers = (viewerSource.match(/setShowNames\(current => !current\)/g) ?? []).length;
  assert.ok(viewerFlippers >= 1, "the viewer must keep a names toggle");
  assert.equal(
    (viewerSource.match(/aria-(?:pressed|checked)=\{showNames\}/g) ?? []).length +
      (viewerSource.match(/<NamesVisibilityToggle[\s\S]{0,160}pressed=\{showNames\}|names=\{\{ pressed: showNames/g) ?? []).length,
    viewerFlippers,
    "every viewer control that toggles showNames must expose its state to assistive tech"
  );
  assert.doesNotMatch(viewerSource, /Hide occupant names/);

  // A skip link is the first focusable on both map surfaces, targeting a
  // focusable map region — the chrome gauntlet is 8+ tab stops otherwise.
  // Top-bar-first chrome: the persistent AppShell maps the route to the
  // link and AppTopBar renders it as the bar's — and the document's — first
  // focusable (the bar precedes the rail in DOM order). See AppTopBar.tsx's
  // ordering pin below and app-shell.test.mjs's ct assertion for the actual
  // first-focusable guarantee.
  const navConfigSourceForSkip = await readSource("../components/ui/shellNavConfig.ts");
  assert.match(navConfigSourceForSkip, /map: \{ href: "#planning-canvas", label: "Skip to seat map" \}/);
  assert.match(navConfigSourceForSkip, /viewer: \{ href: "#viewer-seat-map", label: "Skip to seat map" \}/);
  assert.doesNotMatch(seatMapSource, /<a\s+href="#planning-canvas"/);
  assert.match(seatMapSource, /id="planning-canvas" tabIndex=\{-1\}/);
  // The viewer's skip link is the shell's (shellNavConfig `viewer` entry,
  // pinned above); the surface keeps only the landing marker.
  assert.doesNotMatch(viewerSource, /Skip to seat map/);
  assert.match(viewerSource, /id="viewer-seat-map"/);

  // AppTopBar itself must render the skip anchor before every other control
  // in the bar — the concrete source anchor for "first focusable" (source
  // text can't observe actual tab order; app-shell.test.mjs's ct test does).
  const topBarSourceForSkip = await readSource("../components/ui/AppTopBar.tsx");
  const skipLinkIndex = topBarSourceForSkip.indexOf("href={skipLink.href}");
  const brandIndex = topBarSourceForSkip.indexOf("cds-header-name");
  const accountIndex = topBarSourceForSkip.indexOf("cds-header-utils");
  assert.ok(skipLinkIndex >= 0 && brandIndex >= 0 && accountIndex >= 0, "AppTopBar must define the skip link, name, and utilities");
  assert.ok(skipLinkIndex < brandIndex && skipLinkIndex < accountIndex, "the skip link must render before everything else in the bar, so it is the document's first focusable");
});

test("admin search clear controls use one clear path with distinct accessible names", async () => {
  const seatMapSource = await readSource("../components/seat-map/SeatMap.tsx");
  const searchFieldSource = await readSource("../components/seat-map/MapSearch.tsx");
  // The clear handlers live in useSeatFilters.ts (R-02a extraction); the
  // JSX call sites below stay in SeatMap.
  const filtersHookForClear = await readSource("../components/seat-map/useSeatFilters.ts");
  const clearSearchFunction = filtersHookForClear.match(/function clearSearch\(\) \{[\s\S]*?\n  \}/);

  assert.ok(clearSearchFunction, "clearSearch should remain source-visible.");
  assert.match(clearSearchFunction[0], /setSearch\(""\)/);
  // The field's × (MapSearch) and the palette's / roster's zero states all
  // clear through the one handler the row is handed.
  assert.match(searchFieldSource, /aria-label="Clear search" onClick=\{onClear\}/);
  assert.match(seatMapSource, /onClear: clearSearch,/);
  assert.equal((seatMapSource.match(/searchActive \? "Clear search results"/g) ?? []).length, 1);
  assert.equal((seatMapSource.match(/onClearSearch=\{clearSearch\}/g) ?? []).length, 2);
  assert.match(seatMapSource, /onClearSearchContext=\{searchActive \? clearSearch : clearStructuredFilters\}/);
});

test("custom seat deletion remains guarded by the parent map action", async () => {
  const source = await readSource("../components/seat-map/SeatMap.tsx");
  // Boundary: openPublishReview left for usePublishReview.ts (R-02a), so the
  // extractor now ends at the derived-label block that follows the delete
  // confirm.
  const deleteFunction = source.match(/function deleteSelectedSeat\(\) \{[\s\S]*?const searchStatusTitle/);

  assert.ok(deleteFunction, "deleteSelectedSeat should remain source-visible.");
  assert.match(deleteFunction[0], /Save or discard the selected seat edits before deleting a custom seat\./);
  assert.match(deleteFunction[0], /getSeatDeleteBlockReason\(selectedSeat\)/);
  assert.match(deleteFunction[0], /if \(!canDeleteSeat\(selectedSeat\)\)/);
  assert.match(deleteFunction[0], /setDeleteSeatConfirm\(\{ seatId: selectedSeat\.id, label: selectedSeat\.label \}\)/);
  assert.match(deleteFunction[0], /function confirmDeleteSelectedSeat\(\)/);
  assert.match(deleteFunction[0], /deleteSeatAction\(seatToDelete\.id\)/);
  assert.match(deleteFunction[0], /setActionNotice\(`Deleted custom seat \$\{deletedSeatLabel\}\. Undo is available until publish\.`\)/);
  // Confirm-dialog markup lives in SeatMapDialogs.tsx (R-02a extraction).
  const deleteDialogSource = await readSource("../components/seat-map/SeatMapDialogs.tsx");
  assert.match(deleteDialogSource, /aria-labelledby="delete-seat-confirm-title"/);
  assert.match(deleteDialogSource, /Cancel custom seat deletion/);
});

test("narrow widths keep the viewer switch and people directory reachable", async () => {
  const seatMapSource = await readSource("../components/seat-map/SeatMap.tsx");
  const viewerSource = await readSource("../components/seat-map/ViewerSeatFinder.tsx");

  // v12: the old sub-sm-only "Viewer" menu-fallback link is retired — the
  // rail (position:fixed, no responsive-hiding class) carries the Viewer
  // item at every width including phone, the original #197 concern. Since
  // the nav-lag fix the rail mounts in the persistent AppShell
  // (app/(shell)/layout.tsx) rather than inside SeatMap; SeatMap's part of
  // the contract is registering its guard via useAppShellNavigation, and
  // the old per-width guarded literal (beforeGuardedNavigation("/", "the
  // viewer")) stays gone — the Viewer item goes through the shared
  // registered-guard wiring pinned above instead. AppRail's own behavior —
  // the Viewer item's presence, accessible name, and that activating it
  // calls onNavigate("/", "the viewer") — is asserted in
  // tests/app-rail.test.mjs ("the Viewer item is reachable and routes
  // through onNavigate"), which is where that semantic actually lives; the
  // shell mounting AppRail unconditionally is pinned here.
  const appShellSourceForViewer = await readSource("../components/ui/AppShell.tsx");
  assert.match(appShellSourceForViewer, /<AppTopBar\b/);
  assert.match(appShellSourceForViewer, /<LeftPanel\b/);
  assert.match(seatMapSource, /useAppShellNavigation\(/);
  assert.doesNotMatch(seatMapSource, /beforeGuardedNavigation\("\/", "the viewer"\)\) event\.preventDefault\(\)/);

  // #197's guarantee — the people directory is reachable at EVERY width — no
  // longer needs a width-specific entry point. It used to: the docked panel
  // was panel-only, so below the breakpoint a `panel:hidden` PEOPLE pill
  // opened it as a sheet with its own close control. The Find palette
  // replaced all of that with ONE entry point, the search field, which is in
  // the chrome at every width. So the pill, the sheet and the collapse rail
  // are gone, and what is pinned instead is that the palette renders
  // unconditionally on `paletteOpen` (no responsive gate could hide it from a
  // phone) and that it lays itself out as a full-width sheet below the same
  // 900px tier rather than trimming its content (owner answer 3).
  const paletteSource = await readSource("../components/seat-map/ViewerFindPalette.tsx");
  assert.match(viewerSource, /\{paletteOpen && \(\s*<ViewerFindPalette/);
  // …and because the palette is UNMOUNTED when closed, the field's reference
  // to it has to come and go with it. A dangling id reference is a critical
  // aria-valid-attr-value violation, not a harmless one (caught by the
  // e2e-auth viewer scan, 2026-08-12).
  assert.match(viewerSource, /paletteId: paletteOpen \? "viewer-find-palette" : undefined/);
  assert.match(await readSource("../components/seat-map/MapSearch.tsx"), /aria-controls=\{paletteOpen \? paletteId : undefined\}/);
  assert.doesNotMatch(viewerSource, /viewer-people-directory|show the people list|Close the people list/);
  assert.match(paletteSource, /viewportWidth < VIEWER_PANEL_BREAKPOINT_PX/);
  assert.match(paletteSource, /const VIEWER_PANEL_BREAKPOINT_PX = 900/);
});

test("dark-panel selects style their options and the app declares a theme color", async () => {
  const inspectorSource = await readSource("../components/seat-map/SeatInspector.tsx");
  const layoutSource = await readSource("../app/layout.tsx");

  // Native <select> popups ignore the control's classes: without explicit
  // option colors, Windows dark mode renders OS-colored options against the
  // inspector's dark panel (#200). PR 3b: the inspector's selects are the
  // asset's `.cds-select`, so the option colours live in the CSS deliverable
  // (sp-components.css asset override). Token VALUES are free to evolve; the
  // invariant is that option bg+text are explicitly set.
  assert.match(inspectorSource, /className="cds-select"/);
  assert.match(await readSource("../app/styles/sp-components.css"), /\.cds-select option \{ background: var\(--sp-layer-01\); color: var\(--sp-text-primary\); \}/);

  // Browser chrome should match the app's dark top bar on mobile (#200).
  assert.match(layoutSource, /themeColor/);
});

test("form fields carry the hygiene attributes users and password managers rely on", async () => {
  const seatMapSource = await readSource("../components/seat-map/SeatMap.tsx");
  const viewerSource = await readSource("../components/seat-map/ViewerSeatFinder.tsx");
  const inspectorSource = await readSource("../components/seat-map/SeatInspector.tsx");
  const askPlannerSource = await readSource("../components/seat-map/AskPlannerDrawer.tsx");
  const loginSource = await readSource("../components/auth/LoginForm.tsx");
  // PR 4: the employee form lives in the 480 panel.
  const managementSource = await readSource("../components/admin-management/EmployeePanel.tsx");
  const searchLibSource = await readSource("../lib/viewerSeatSearch.ts");
  const globalsSource = await readSource("../app/globals.css");

  // Search inputs are real searches: correct type, a name, no password-manager
  // triggers — and the shared placeholder ends with an ellipsis (#199). The
  // native webkit cancel button is suppressed so the app's own clear control
  // stays the single clear path (see the clear-controls test above).
  assert.match(searchLibSource, /SEAT_SEARCH_PLACEHOLDER = "Search people or seats…"/);
  const searchFieldSource = await readSource("../components/seat-map/MapSearch.tsx");
  assert.match(searchFieldSource, /type="search"[\s\S]{0,240}name="seat-search"/, "the one search field (both surfaces) is a named type=search");
  assert.match(seatMapSource, /<MapControlRow/);
  assert.match(viewerSource, /<MapControlRow/);
  assert.match(globalsSource, /::-webkit-search-cancel-button/);

  // Inspector assignment fields: names for autofill sanity, autocomplete off
  // on the combobox (it is not an auth field), tel semantics on the extension,
  // and instruction placeholders end with an ellipsis (#199).
  assert.match(inspectorSource, /name="employeeName"[\s\S]{0,400}autoComplete="off"/);
  assert.match(inspectorSource, /placeholder="Search or enter employee name…"/);
  assert.match(inspectorSource, /name="employeePosition"/);
  assert.match(inspectorSource, /name="phoneExtension"[\s\S]{0,240}type="tel"/);
  assert.match(inspectorSource, /name="seatNote"/);
  assert.match(inspectorSource, /placeholder="Add a seat note…"/);

  // Ask Planner question box: named, ellipsized prompt (#199).
  assert.match(askPlannerSource, /name="askPlannerQuestion"/);
  assert.match(askPlannerSource, /placeholder="Ask about seats, zones, departments, or assignments…"/);

  // Email inputs never spellcheck (#199) — login and the management form.
  assert.match(loginSource, /type="email"[\s\S]{0,240}spellCheck=\{false\}/);
  assert.match(managementSource, /type="email"[\s\S]{0,240}spellCheck=\{false\}/);

  // Management phone extension is tel like the inspector's (#199).
  assert.match(managementSource, /type="tel"[\s\S]{0,240}inputMode="numeric"/);
});

test("looping animations honor prefers-reduced-motion via motion-safe gating", async () => {
  // Tailwind's animate-spin / animate-pulse loop forever and bypass the
  // motion-safe convention the custom keyframes follow (globals.css) — every
  // use must be motion-safe: gated (#201). Static spinners/skeletons remain
  // meaningful (each is paired with text or structure).
  const files = [
    "../components/ui/design-system.tsx",
    "../components/seat-map/AskPlannerDrawer.tsx",
    "../components/admin-management/AdminManagementPanel.tsx",
    "../components/seat-map/SeatMap.tsx",
    "../components/seat-map/SeatInspector.tsx",
    "../components/seat-map/ViewerSeatFinder.tsx"
  ];
  for (const file of files) {
    const source = await readSource(file);
    assert.doesNotMatch(source, /(?<!motion-safe:)animate-(spin|pulse)/, `${file} has an ungated looping animation`);
  }
});

test("touch devices get visible destructive affordances, contained modals, and safe-area sheets", async () => {
  // PR 4: the panel body is the Management scroll region; the lists' Delete
  // is a menu item behind ⋯ (always in the tree), never hover-revealed.
  const managementSource = await readSource("../components/admin-management/EmployeePanel.tsx");
  const dataUtilitiesSource = [
    await readSource("../components/admin-settings/CsvImportSheet.tsx"),
    await readSource("../components/admin-settings/SnapshotRestoreSheet.tsx")
  ].join("\n");
  const askPlannerSource = await readSource("../components/seat-map/AskPlannerDrawer.tsx");
  const seatMapSource = await readSource("../components/seat-map/SeatMap.tsx");
  const viewerSource = await readSource("../components/seat-map/ViewerSeatFinder.tsx");
  const globalsSource = await readSource("../app/globals.css");

  // Hover-revealed delete buttons are invisible on touch (no hover): both
  // Management row deletes must also reveal under hover-none media (#198).
  assert.equal(
    (managementSource.match(/\[@media\(hover:none\)\]:opacity-100/g) ?? []).length,
    (managementSource.match(/group-hover:opacity-100/g) ?? []).length,
    "every hover-revealed control also reveals on hover-none devices"
  );

  // Modal/drawer scroll regions contain overscroll so touch scrolls don't
  // chain to the page behind (#198).
  // PR 3b: the drawer's scroll region is the slot body (`.sp-slot-body`, overflow: auto in the sheet).
  assert.match(askPlannerSource, /<div className="sp-slot-body">/);
  // PR 4: the two Settings reviews are narrow tearsheets — their scroll
  // region is `.sp-tearsheet-body` (overflow: auto in the sheet), one each.
  assert.equal((dataUtilitiesSource.match(/className="sp-tearsheet-body"/g) ?? []).length, 2);
  // PR 3b: the publish review is the wide tearsheet — its scroll region is
  // `.sp-tearsheet-main` (overflow: auto in the sheet); the body grid is min-height 0.
  assert.match(await readSource("../components/seat-map/PublishReviewSheet.tsx"), /className="sp-tearsheet-main"/);
  // (PR 4: the panel header sits between the dialog root and its scroll body.)
  assert.match(managementSource, /role="dialog"[\s\S]{0,1400}cds-side-panel-body overscroll-contain/);

  // Viewport-fixed bottom sheets respect the home-indicator inset (#198).
  // PR 3b: the admin map has no bottom sheet left — the inspector and the
  // mode card are the right slot — so nothing there is viewport-fixed.
  assert.doesNotMatch(seatMapSource, /fixed inset-x-3 bottom-/);
  // The viewer used to need three: two bottom sheets and the PEOPLE pill. All
  // three are retired, and the palette hangs off the TOP of the screen — so
  // what has to clear the home indicator now is the bottom-anchored zoom
  // float, plus the palette's own height cap, whose bottom edge is the only
  // part of it that can reach the indicator.
  const viewerPaletteSource = await readSource("../components/seat-map/ViewerFindPalette.tsx");
  assert.match(viewerSource, /bottom-\[calc\(0\.75rem\+env\(safe-area-inset-bottom\)\)\] panel:bottom-3/);
  assert.match(viewerPaletteSource, /maxHeight: frame \? `calc\(\$\{frame\.maxHeight\}px - env\(safe-area-inset-bottom\)\)`/);

  // Tap ergonomics: interactive elements skip the double-tap zoom delay, and
  // the small chrome controls extend their hit area to ~44px without growing
  // visually (#198).
  assert.match(globalsSource, /touch-action: manipulation/);
  // Relational, not a fixed count: every 32px dialog close button must carry
  // the hit-area extension (CSV review, JSON review, reset review, …).
  assert.equal(
    (dataUtilitiesSource.match(/after:absolute after:-inset-1\.5/g) ?? []).length,
    (dataUtilitiesSource.match(/aria-label="Close [^"]+"/g) ?? []).length,
    "every dialog close button extends its hit area"
  );
});

test("nit sweep: real list semantics, translate=no tokens, localized counts, skip links on sub-pages", async () => {
  const viewerSource = await readSource("../components/seat-map/ViewerSeatFinder.tsx");
  const seatMapSource = await readSource("../components/seat-map/SeatMap.tsx");
  const markerSource = await readSource("../components/seat-map/SeatMarker.tsx");
  const shellBarSource = await readSource("../components/ui/AppTopBar.tsx");
  const managementSource = await readSource("../components/admin-management/AdminManagementPanel.tsx");
  const managementPageSource = await readSource("../app/(shell)/admin/management/page.tsx");
  const settingsPageSource = await readSource("../app/(shell)/admin/settings/page.tsx");
  const loginPageSource = await readSource("../app/login/page.tsx");

  // role="listitem" directly on a <button> overrides the native button role
  // for AT — items are wrapper divs with real buttons inside (#202, matching
  // ResultsPanel's pattern).
  // Both viewer lists live in the Find palette now — same convention, same
  // reason, one file further out.
  const paletteSource = await readSource("../components/seat-map/ViewerFindPalette.tsx");
  for (const [name, source] of [["Viewer", viewerSource], ["FindPalette", paletteSource]]) {
    assert.doesNotMatch(source, /type="button"\s+role="listitem"/, `${name} must not put listitem on a button`);
    assert.doesNotMatch(source, /role="listitem"[\s\S]{0,80}onClick/, `${name} must not make the listitem wrapper itself clickable`);
  }
  assert.ok((paletteSource.match(/role="listitem"/g) ?? []).length >= 2, "both palette lists wrap buttons in listitem divs");

  // Same list-semantics guarantee for the viewer's status counts. The Option A
  // status band (owner-picked 2026-08-17) replaced the floating MapStatusLegend
  // card on this surface, but the guarantee is unchanged: the counts stay a
  // labelled <ul> instead of decorative text painted on the map. Bound to the
  // accessible name in one assertion for the same reason as the admin pin above.
  assert.match(viewerSource, /<MapStatusBand[\s\S]{0,200}ariaLabel="Seat status summary"/);
  const statusBandSource = await readSource("../components/seat-map/MapStatusBand.tsx");
  assert.match(statusBandSource, /<ul aria-label=\{ariaLabel\}/);

  // Brand and seat-code tokens are identifiers — never machine-translated.
  // (The viewer's brand line retired with its header — the shell's is pinned.)
  for (const [name, source] of [["ShellBar", shellBarSource]]) {
    assert.match(source, /translate="no"[\s\S]{0,200}Megeredchian Law|Megeredchian Law[\s\S]{0,60}translate="no"/, `${name} brand is translate=no`);
  }
  assert.doesNotMatch(seatMapSource, /Megeredchian Law/, "the map surface carries no brand line of its own (the shell does)");
  assert.ok((markerSource.match(/translate="no"/g) ?? []).length >= 2, "seat-code labels are translate=no");

  // Counts render localized, consistent with the panel's own convention
  // (PR 4: the toolbar count in lib/managementCounts, the list counts in OptionList).
  const managementCountsSource = await readSource("../lib/managementCounts.ts");
  const optionListSource = await readSource("../components/admin-management/OptionList.tsx");
  assert.match(managementCountsSource, /total\.toLocaleString\(\)/);
  assert.match(managementCountsSource, /matching\.toLocaleString\(\)/);
  assert.match(optionListSource, /\$\{count\.toLocaleString\(\)\} \$\{countNoun\}/);

  // Publisher emails truncate with a title tooltip instead of wrapping
  // mid-glyph (#202).
  assert.doesNotMatch(managementSource, /break-all/);

  // Straight apostrophe entity → curly on the login card.
  assert.doesNotMatch(loginPageSource, /You&apos;re/);
  assert.match(loginPageSource, /You’re/);

  // The admin sub-pages get the same skip affordance the maps have, via
  // AppTopBar's skipLink prop (top-bar-first chrome: the bar renders it as
  // the document's first focusable). The persistent AppShell owns the
  // route → skip-target mapping; each page still owns its landing marker,
  // and no literal skip copy may be hardcoded in the bar itself.
  assert.doesNotMatch(shellBarSource, /Skip to content/);
  const navConfigSource = await readSource("../components/ui/shellNavConfig.ts");
  assert.match(navConfigSource, /management: \{ href: "#admin-subpage-main", label: "Skip to content" \}/);
  assert.match(navConfigSource, /settings: \{ href: "#admin-subpage-main", label: "Skip to content" \}/);
  assert.match(navConfigSource, /reception: \{ href: "#reception-main", label: "Skip to content" \}/);
  assert.match(managementPageSource, /id="admin-subpage-main" tabIndex=\{-1\}/);
  assert.match(settingsPageSource, /id="admin-subpage-main" tabIndex=\{-1\}/);
});

test("axe findings stay fixed: allowed roles, single main landmark, marker name containment", async () => {
  const seatMapSource = await readSource("../components/seat-map/SeatMap.tsx");
  const markerSource = await readSource("../components/seat-map/SeatMarker.tsx");
  const adminPageSource = await readSource("../app/(shell)/admin/page.tsx");

  // role="group" is not an allowed role on <nav> (axe aria-allowed-role); the
  // command row is a grouped toolbar cluster, not a nav landmark.
  assert.doesNotMatch(seatMapSource, /<nav role="group"/);
  assert.match(await readSource("../components/seat-map/MapControlRow.tsx"), /<div className="sp-control-row shrink-0" role="toolbar" aria-label="Map controls">/);

  // SeatMap carries its own <main>, so the admin page wrapper must not add a
  // second, nested one (axe landmark-no-duplicate-main / main-is-top-level).
  assert.doesNotMatch(adminPageSource, /<main className="admin-theme min-h-screen bg/);

  // Marker accessible names must CONTAIN the visible text (axe
  // label-content-name-mismatch): the old "W08: Patrick…" colon broke the
  // containment for assigned pills, and abbreviated visible names ("Alex S.")
  // must appear verbatim before the full name.
  assert.doesNotMatch(markerSource, /aria-label=\{`\$\{seat\.label\}: /);
  assert.match(markerSource, /accessibleSeatName/);

  // Subtree-text serializers (axe 4.10 / the Vercel toolbar) join adjacent
  // spans WITHOUT whitespace (#223). Phase 4 PR 3b: the pill renders ONE
  // visible text node (the short name, or the code for an empty seat in a
  // move/swap) followed only by the aria-hidden ◇ badge — nothing to join,
  // and the aria-label opens with that exact text.
  assert.match(markerSource, /\{hasEmployee \? visibleLabel : <span translate="no">\{visibleLabel\}<\/span>\}\s*\{draftChanged \? <SeatMark kind="draft-badge" \/> : null\}/);
  assert.match(markerSource, /const accessibleSeatName = !hasEmployee \|\| shortName === displayName \|\| namesOff \? displayName : `\$\{shortName\} \$\{displayName\}`/);
});

// v12 slice 9 (a11y pass). Both of these were found by running axe and a tab
// sweep against the real surfaces, not by reading source — pinning them here
// so the next redesign cannot reintroduce them silently.
test("CTA labels sit on the ladder's white, not the off-white inverse token", async () => {
  // #F7F6F2 on #D23F0A is 4.35:1 and axe fails it as a serious violation;
  // white is 4.71:1, which is what the CTA ladder in globals.css specifies.
  // Checked across every surface that paints the CTA background.
  for (const file of [
    "../components/admin-management/AdminManagementPanel.tsx",
    "../components/admin-settings/DataUtilitiesPanel.tsx",
    "../components/seat-map/SeatMap.tsx",
    "../components/seat-map/SeatInspector.tsx",
    "../app/login/page.tsx",
    "../app/(shell)/admin/page.tsx"
  ]) {
    const source = await readSource(file);
    for (const match of source.match(/bg-\[var\(--sp-button-primary\)\][^"']*/g) ?? []) {
      assert.doesNotMatch(
        match,
        /text-\[var\(--sp-text-inverse\)\]/,
        `${file}: CTA labels must be white (4.71:1), not --sp-text-inverse (4.35:1)`
      );
    }
  }
});

test("directory rows are a mouse shortcut, not a third tab stop per employee", async () => {
  // PR 4: the table is EmployeesTable; the two controls are the seat link and
  // the ghost Edit icon button (PHASE2UX §1G.3 — no kebab).
  const managementSource = await readSource("../components/admin-management/EmployeesTable.tsx");

  // Each row already exposes two real controls — the seat link (to the map)
  // and the Edit button (to the panel). Making the <tr> focusable as well put
  // three stops on every employee and announced the entire row for a stop that
  // offered nothing extra, which at production scale buries everything below
  // the table. Keep the row click; do not give it back a tabIndex.
  const rowTag = managementSource.match(/<tr\s+key=\{employee\.id\}[\s\S]*?>/);
  assert.ok(rowTag, "the directory row element should be source-visible");
  assert.doesNotMatch(rowTag[0], /tabIndex/);
  assert.doesNotMatch(rowTag[0], /onKeyDown/);
  // The keyboard path must still exist through the two labelled controls.
  assert.match(managementSource, /aria-label=\{`Edit \$\{displayName\}`\}/);
  assert.match(managementSource, /href=\{`\/admin\$\{withSeatParam\("", seatLabel\)\}`\}/);
});

// Multi-floor PR-2: the floor roster is the surface an unmapped floor renders.
// Its rows are static list items (DECISIONS.md deviation 9) — nothing to open,
// so nothing is disabled where content must be read (Carbon's disabled/read-
// only rule) — and the region itself is the keyboard tab stop so the list
// stays scrollable (axe scrollable-region-focusable). Its ONE control is the
// zero-result Clear search button.
test("the floor roster is a focusable read-only region with exactly one control", async () => {
  const source = await readSource("../components/seat-map/FloorRoster.tsx");
  assert.match(source, /role="region"/);
  assert.match(source, /tabIndex=\{0\}/);
  assert.match(source, /data-roster-row/);
  assert.match(source, /aria-current=\{/);
  assert.match(source, /role="status"/);
  // Three controls and nothing else: Clear search (query empty), Clear
  // filters (a structured filter hid everyone) — each rendered only in its
  // own zero state — and the row's Copy link icon button (D1-e; deviation 9
  // holds: an icon button on a static row is not a disclosure).
  assert.equal((source.match(/<button/g) ?? []).length, 3, "Clear search / Clear filters / Copy link are the roster's only controls");
  assert.match(source, /aria-label=\{`Copy link for \$\{formatDisplayName\(person\.full_name\)\}`\}/);
  assert.doesNotMatch(source, /disabled/);
  // The viewer switches floors with an announcement, never silently.
  const viewerSource = await readSource("../components/seat-map/ViewerSeatFinder.tsx");
  assert.match(viewerSource, /Showing \$\{/);
  assert.match(viewerSource, /<FloorRoster/);
  assert.match(viewerSource, /tabIndex=\{surface === "plan" \? 0 : -1\}/);
  // Multi-floor PR-3: the admin editor mounts the same roster for an
  // unmapped floor, announces its own floor switches (a find or a Move/Swap
  // target on the other floor changes the plan under the admin), and hands
  // the tab stop to the roster region there — the viewport is no landmark on
  // a floor with no map to pan.
  const adminSource = await readSource("../components/seat-map/SeatMap.tsx");
  assert.match(adminSource, /Showing \$\{FLOORS\[announcedFloor\]\.label\}\./);
  assert.match(adminSource, /<FloorRoster/);
  assert.match(adminSource, /tabIndex=\{canEdit && surface === "plan" \? 0 : undefined\}/);
  assert.match(adminSource, /focusFloorRoster\(ADMIN_ROSTER_REGION_ID\)/);
});
