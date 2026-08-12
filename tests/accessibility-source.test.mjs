import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readSource(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("viewer route renders the published map as read-only", async () => {
  const viewerSource = await readSource("../app/page.tsx");
  const adminSource = await readSource("../app/(shell)/admin/page.tsx");
  const viewerFinderSource = await readSource("../components/seat-map/ViewerSeatFinder.tsx");

  assert.match(viewerSource, /\.eq\("layer", "published"\)/);
  assert.match(viewerSource, /<ViewerSeatFinder/);
  assert.doesNotMatch(viewerSource, /<SeatMap/);
  assert.match(viewerFinderSource, /Read-only/);
  assert.match(viewerFinderSource, /Published/);
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
  assert.match(source, /aria-label="Command search"/);
  assert.match(source, /aria-label="Admin command row"/);
  assert.match(source, /aria-label="Undo last map change"/);
  assert.match(source, /aria-label="Redo last undone change"/);
  assert.match(source, /Planning canvas/);
  // v12 slice 3: the docked status strip is gone and the legend floats as a
  // layer-01 card, but it must still BE a legend AND still carry the same
  // accessible name. One assertion binds the two halves: a lone
  // /Seat status legend/ pin would keep passing if the string drifted onto a
  // title tooltip, and a lone /<MapStatusLegend/ pin would keep passing if the
  // name vanished. MapStatusLegend owns the <ul aria-label={ariaLabel}>, so
  // the status counts stay a labelled list rather than decorative text
  // painted over the map (the rendered semantics — that it really is a
  // labelled list — are verified at runtime by tests/map-status-legend.test.mjs).
  assert.match(source, /<MapStatusLegend[\s\S]{0,200}ariaLabel="Seat status legend"/);
  assert.match(source, /aria-controls="seat-map-filter-panel"/);
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
  assert.match(appShellSourceForGuard, /<AppRail[\s\S]{0,400}onNavigate=\{handlers\?\.guard\}/);
  // Settings must never appear as an unguarded peer link on the map surface
  // itself — the rail (a different file, its own guard-respecting contract)
  // plus the wiring above own it. A bare href here would bypass the guard
  // AppRail's onNavigate can't reach.
  assert.doesNotMatch(source, /href="\/admin\/settings"/);
  assert.match(source, /aria-controls="ask-planner-drawer"/);
  assert.match(source, /aria-haspopup="dialog"/);
  assert.match(source, /No map changes to undo/);
  assert.match(source, /No undone map changes to redo/);
  assert.match(source, /unpublished \$\{publishSummary\.totalChangeCount === 1 \? "change" : "changes"\}/);
  assert.match(source, /Esc exits/);
  assert.match(source, /Exit add seat/);
  // Publish chip contract, v12 (contract #4): nothing renders without draft
  // changes — no idle status chip, no publish-status-popover. The has-changes
  // cluster is the ONLY publish control and it opens the review directly.
  assert.match(source, /\{publishSummary\.hasChanges && \([\s\S]{0,500}onClick=\{openPublishReview\}/);
  assert.doesNotMatch(source, /id="publish-status-popover"/);
  assert.equal((source.match(/onClick=\{openPublishReview\}/g) ?? []).length, 1, "exactly one publish control opens the review");
  assert.match(source, /Undo \{lastUndoLabel\}/);
  assert.match(source, /onClick=\{undoDraftEdit\}/);
});

test("Carbon-for-AI tokens (--admin-ai-*) stay exclusive to Ask Planner surfaces (contract #9)", async () => {
  // Guarded semantic: AI blue is reserved EXCLUSIVELY for AI presence — no
  // non-AI control may ever paint itself with an --admin-ai- token.
  const seatMapSource = await readSource("../components/seat-map/SeatMap.tsx");
  const railSource = await readSource("../components/ui/AppRail.tsx");
  const viewerFinderSource = await readSource("../components/seat-map/ViewerSeatFinder.tsx");
  const shellBarSource = await readSource("../components/ui/AdminShellBar.tsx");
  const AI_TOKEN = "--admin-ai-";

  function countOccurrences(text, needle) {
    return text.split(needle).length - 1;
  }

  // SeatMap: the Ask Planner tool button (ref={askPlannerButtonRef} through
  // its own closing </button>) is the ONLY control allowed to use the token.
  const seatMapTotal = countOccurrences(seatMapSource, AI_TOKEN);
  const askPlannerStart = seatMapSource.indexOf("ref={askPlannerButtonRef}");
  assert.ok(askPlannerStart >= 0, "Ask Planner button anchor must exist in SeatMap.tsx");
  const askPlannerEnd = seatMapSource.indexOf("</button>", askPlannerStart);
  assert.ok(askPlannerEnd > askPlannerStart);
  const askPlannerBlock = seatMapSource.slice(askPlannerStart, askPlannerEnd);
  assert.ok(seatMapTotal > 0, "sanity: SeatMap.tsx should still consume the AI token somewhere");
  assert.equal(
    countOccurrences(askPlannerBlock, AI_TOKEN),
    seatMapTotal,
    "every --admin-ai- occurrence in SeatMap.tsx must live inside the Ask Planner tool button"
  );

  // AppRail: the token may only appear on the AI nav item (both branches of
  // the onOpenAskPlanner ternary) and the AiCell() it renders.
  const railTotal = countOccurrences(railSource, AI_TOKEN);
  const aiItemStart = railSource.indexOf("{/* Ask Planner — the AI entry");
  assert.ok(aiItemStart >= 0, "AI rail item anchor must exist in AppRail.tsx");
  const aiItemEnd = railSource.indexOf('title="Viewer — published map"', aiItemStart);
  assert.ok(aiItemEnd > aiItemStart);
  const aiItemBlock = railSource.slice(aiItemStart, aiItemEnd);
  const aiCellStart = railSource.indexOf("function AiCell(");
  assert.ok(aiCellStart >= 0, "AiCell() must exist in AppRail.tsx");
  // Bounded at the next top-level declaration (or EOF), never bare EOF: an
  // unbounded slice would absorb any declaration appended after AiCell into
  // "the AI cell", letting a new non-AI consumer slip past this pin.
  const nextTopLevelDecl = railSource
    .slice(aiCellStart + 1)
    .search(/\n(?:export |function |const |let |var |class |type |interface )/);
  const aiCellEnd = nextTopLevelDecl === -1 ? railSource.length : aiCellStart + 1 + nextTopLevelDecl;
  const aiCellBlock = railSource.slice(aiCellStart, aiCellEnd);
  assert.ok(railTotal > 0, "sanity: AppRail.tsx should still consume the AI token somewhere");
  assert.equal(
    countOccurrences(aiItemBlock, AI_TOKEN) + countOccurrences(aiCellBlock, AI_TOKEN),
    railTotal,
    "every --admin-ai- occurrence in AppRail.tsx must live inside the AI nav item or AiCell()"
  );

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
    "every --admin-ai- occurrence in SeatInspector.tsx must live inside AskPlannerSeatRow()"
  );

  // Non-AI surfaces: zero AI-blue tokens, ever.
  assert.doesNotMatch(viewerFinderSource, /--admin-ai-/);
  assert.doesNotMatch(await readSource("../components/seat-map/ViewerFindPalette.tsx"), /--admin-ai-/);
  assert.doesNotMatch(shellBarSource, /--admin-ai-/);
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
  const viewerSource = await readSource("../app/page.tsx");
  const viewerFinderSource = await readSource("../components/seat-map/ViewerSeatFinder.tsx");
  const seatMapSource = await readSource("../components/seat-map/SeatMap.tsx");
  const inspectorSource = await readSource("../components/seat-map/SeatInspector.tsx");

  const findPaletteSource = await readSource("../components/seat-map/ViewerFindPalette.tsx");
  assert.match(viewerSource, /ViewerSeatFinder/);
  assert.match(viewerFinderSource, /Search office seating/);
  // The results list moved into the palette; the viewer keeps the pointer to
  // it (the ArrowDown hop out of the search field), which is asserted with the
  // rest of the roving contract below.
  assert.match(findPaletteSource, /aria-label="Viewer search results"/);
  assert.match(viewerFinderSource, /aria-live="polite"/);
  assert.match(viewerFinderSource, /highlightedDescription=\{/);
  // The palette is a viewer surface too — it inherits the same isolation.
  for (const source of [viewerFinderSource, findPaletteSource]) {
    assert.doesNotMatch(source, /Map tools|Undo|Redo|CSV|JSON|Draft|Publish changes|Vacate|Delete seat|Ask Planner/);
  }
  assert.match(seatMapSource, /\{canEdit && \([\s\S]*draftStatusLabel/);
  assert.match(seatMapSource, /\{canEdit && \([\s\S]*<AskPlannerDrawer/);
  // The anchor has moved twice: Swap left for the canvas action bar, then Move
  // was hidden behind MOVE_UI_ENABLED (2026-07-30). Delete is the surviving
  // admin-only control in the panel. The guarantee is unchanged — admin-only
  // affordances must sit inside the canEdit branch — only its anchor moved.
  assert.match(inspectorSource, /\{canEdit \? \([\s\S]*Delete custom seat/);
  // The reseat verbs live in the inspector's icon action row now (v12 slice 4).
  // The row itself is canEdit-gated in SeatInspector; here we pin that only the
  // ADMIN mount wires the verb handlers, so a viewer inspector can never grow
  // Move/Swap/Vacate even if the internal gate regressed.
  assert.match(seatMapSource, /<SeatInspector[\s\S]{0,2400}onVacate=\{requestVacateFromBar\}/);
  assert.doesNotMatch(viewerFinderSource, /onMove=|onSwap=|onVacate=/);
  assert.match(inspectorSource, /\{canEdit && !editingAssignment && \(onMove \|\| onSwap \|\| onVacate\) && \(/);
  assert.match(inspectorSource, /\{canEdit \? \([\s\S]*Delete seat/);
  assert.match(inspectorSource, /\{canEdit \? \([\s\S]*Vacate/);
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
  const paletteResultsBlock = paletteSource.slice(
    paletteSource.indexOf('aria-label="Viewer search results"'),
    paletteSource.indexOf('aria-label="People directory"')
  );
  assert.ok(paletteResultsBlock.length > 0, "the palette must still render both lists");
  assert.doesNotMatch(paletteResultsBlock, /onPointerEnter/);
  assert.match(
    viewerFinderSource,
    /highlightedDescription=\{seatIsSearchHit \? "Highlighted search result" : "Highlighted from the people list"\}/
  );
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
  // v12 slice 5: the modal body is one unified per-seat diff table derived
  // against the published baseline — same drop-out semantics as the summary.
  assert.match(source, /buildPublishDiffRows\(localSeats, localPublishedSeats\)/);
  assert.match(source, /aria-labelledby="publish-review-title"/);
  assert.match(source, /Review draft before publishing/);
  assert.match(source, /Confirm the saved draft changes before they become visible in the read-only viewer/);
  assert.match(source, /Ready to publish reviewed changes/);
  assert.match(source, /Saved draft changes only — unsaved inspector edits are excluded\./);
  assert.match(source, /Draft and viewer map are in sync/);
  // Viewer-impact + undo-history warnings folded into one caution line —
  // both sentences must survive verbatim.
  assert.match(source, /Publishing copies the saved draft map to the read-only viewer and clears Undo\/Redo history after success\. Until you publish, viewers keep seeing the currently published map\./);
  assert.match(source, /Publish did not complete/);
  assert.match(source, /Publishing reviewed draft changes/);
  assert.match(source, /\{actionError && !pending && \(/);
  assert.match(source, /Retry publish/);
  assert.match(source, /No draft changes to publish/);
  assert.match(source, /disabled=\{pending \|\| !publishSummary\.hasChanges\}/);
  // The diff table's column contract and kind-tag tokens.
  assert.match(source, /Published now/);
  assert.match(source, /After publish/);
  assert.match(source, /--admin-diff-assigned-/);
  assert.match(source, /--admin-diff-vacated-/);
  assert.match(source, /--admin-diff-reassigned-/);
  assert.match(source, /People details/);
  assert.match(source, /Publish review blocked: Save or discard the selected seat edits before publishing/);
  assert.match(source, /Save or discard the selected seat edits before publishing/);
  assert.doesNotMatch(source, /Publish draft map to the viewer-facing seat map\?/);
});

test("publish workflow stays server-action gated and clears review history state", async () => {
  const seatMapSource = await readSource("../components/seat-map/SeatMap.tsx");
  const actionSource = await readSource("../app/actions.ts");
  const openPublishFunction = seatMapSource.match(/function openPublishReview\(\) \{[\s\S]*?function confirmPublishDraftMap/);
  const confirmPublishFunction = seatMapSource.match(/function confirmPublishDraftMap\(\) \{[\s\S]*?\n  \}/);
  // Signature carries the expected_draft_seats concurrency fence (20260805130000).
  const publishAction = actionSource.match(/export async function publishSeatMapAction\([\s\S]*?\n\}/);

  assert.ok(openPublishFunction, "openPublishReview should remain source-visible.");
  assert.ok(confirmPublishFunction, "confirmPublishDraftMap should remain source-visible.");
  assert.ok(publishAction, "publishSeatMapAction should remain source-visible.");

  assert.match(openPublishFunction[0], /if \(inspectorDirty\) \{[\s\S]*Publish review blocked: Save or discard the selected seat edits before publishing/);
  assert.match(seatMapSource, /function confirmPublishDraftMap\(\) \{[\s\S]*setActionError\(null\);\s*setActionNotice\(null\);\s*startTransition/);
  assert.match(seatMapSource, /onClick=\{confirmPublishDraftMap\}[\s\S]*disabled=\{pending \|\| !publishSummary\.hasChanges\}/);
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
  assert.match(source, /focus-visible:ring-4/);
});

test("inspector sections, validation, and actions retain accessible confidence cues", async () => {
  const inspectorSource = await readSource("../components/seat-map/SeatInspector.tsx");
  const resultsPanelSource = await readSource("../components/seat-map/ResultsPanel.tsx");

  assert.match(inspectorSource, /aria-label=\{`Ask Planner about \$\{selectedSeat\.label\}`\}/);
  // v12 slice 4: the inspector is tabbed (APG tabs pattern) and close-only —
  // the collapse rail/pill is retired, so no "VIEW DETAILS" affordance may return.
  assert.match(inspectorSource, /role="tablist"/);
  assert.match(inspectorSource, /role="tab"[\s\S]{0,200}aria-selected/);
  assert.match(inspectorSource, /role="tabpanel"/);
  assert.match(inspectorSource, /ArrowRight|ArrowLeft/);
  assert.doesNotMatch(inspectorSource, /VIEW DETAILS/);
  assert.doesNotMatch(inspectorSource, /Collapse inspector/);
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
  // Drift-proof delete gate: custom AND not a protected-original label, so
  // is_custom data drift on original seats can't resurrect a dead button.
  assert.match(inspectorSource, /\{selectedSeat\.is_custom && !isProtectedOriginalSeatLabel\(selectedSeat\.label\) && \(/);
  // An open seat has no occupant — the Contact section exists only when
  // someone is assigned (admin and viewer variants alike). Department stays
  // out of it: the header role line already carries it (dedup 2026-07-23).
  // v12 slice 4: the <details>-based InspectorSection title prop retired
  // with the flat eyebrow-heading sections — the CONTACT heading text is the
  // new anchor for the same "only when assigned" guarantee.
  assert.match(inspectorSource, /\{hasCurrentAssignment && \([\s\S]{0,200}CONTACT/);
  assert.doesNotMatch(inspectorSource, /FactRow label="Department"/);
  // The occupied-seat CTA reads as an edit verb — it opens a form, it does
  // not act; "Change assignment" collided with Move/Swap/Vacate (2026-07-23).
  assert.match(inspectorSource, /Edit assignment for \$\{selectedSeat\.label\}/);
  assert.doesNotMatch(inspectorSource, /Change assignment/);
  // v12 slice 4: Notes moved from an InspectorSection title prop into its own
  // APG tabpanel — the tabpanel id/aria-labelledby pair is the new anchor.
  assert.match(inspectorSource, /id="seat-inspector-tabpanel-notes" role="tabpanel" aria-labelledby="seat-inspector-tab-notes"/);
  // The solid Assigned status tag pairs WHITE text with the deep green — the
  // 2026-07-23 harmonization darkened --admin-status-ok (#24a148 → #1D6E41)
  // and dark #161616 text on it fails AA at 2.89:1 (axe, prod 2026-07-24).
  assert.match(inspectorSource, /bg-\[var\(--admin-status-ok\)\] text-white/);
  assert.doesNotMatch(inspectorSource, /bg-\[var\(--admin-status-ok\)\] text-\[var\(--sp-color-text-primary\)\]/);
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
  // v12 slice 4: rounded-[10px] button overrides retired everywhere in this
  // file (flat 0 radius); the layout guarantee (no-wrap-collapse of the
  // helper line) is what this pin protects, not the corner radius.
  assert.match(inspectorSource, /whitespace-normal leading-tight/);
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
  assert.match(source, /Save or discard the selected seat edits before publishing/);
  assert.match(source, /id="inspector-unsaved-title"/);
  assert.match(source, /Unsaved seat edits/);
  assert.match(source, /Save changes/);
  assert.match(source, /Discard/);
  assert.match(source, /Keep editing/);
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
  // The map ⋯ overflow menu was retired in v12 slice 3 (its two items live on
  // the zoom stack's fit button and the chrome kebab's reset-zoom), so its
  // APG menu pins moved out with it. What survives here is narrower than the
  // retired block: the popover focus-restore test below still pins that the
  // chrome ⋯ trigger gets focus back when its popover closes. Nothing in this
  // file pins the chrome ⋯ as a role="menu" (it is a role="group") —
  // FloorSelector is now the repo's only APG menu, and its pattern is pinned
  // below: role="menu" + menuitemradio items with aria-checked, an
  // ArrowDown-opens handler on the trigger, and Escape-close-refocus.
  const floorSelectorSource = await readSource("../components/seat-map/FloorSelector.tsx");
  assert.match(floorSelectorSource, /role="menu"/);
  assert.match(floorSelectorSource, /role="menuitemradio"/);
  assert.match(floorSelectorSource, /aria-checked=\{option\.id === floor\}/);
  assert.match(floorSelectorSource, /event\.key === "ArrowDown" && !open\) \{\s*event\.preventDefault\(\);\s*setOpen\(true\);/);
  assert.match(floorSelectorSource, /event\.key === "Escape"\) \{\s*event\.stopPropagation\(\);\s*closeAndRefocus\(\);/);
  assert.match(floorSelectorSource, /function closeAndRefocus\(\) \{\s*setOpen\(false\);\s*triggerRef\.current\?\.focus\(\);/);
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

  // The chrome ⋯ More menu returns focus to its trigger on Escape.
  assert.match(seatMapSource, /ref=\{chromeMenuButtonRef\}/);
  assert.match(seatMapSource, /setChromeMenuOpen\(false\);[\s\S]{0,90}returnFocusAfterClose\(chromeMenuButtonRef\)/);
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
  // Regex, not indexOf: the field wrapper carries a ref and spans several
  // lines now, so the two attributes are no longer adjacent in the source.
  const viewerSearchIndex = viewerSource.search(/role="search"\s+aria-label="Viewer search"/);
  assert.ok(viewerPanelIndex >= 0 && viewerSearchIndex >= 0, "viewer filter panel and search should remain source-visible");
  assert.ok(viewerPanelIndex < viewerSearchIndex, "viewer filter panel must precede the search in DOM order");
});

test("the admin account menu surfaces identity and sign-out from the rail on every sub-page", async () => {
  const railSource = await readSource("../components/ui/AppRail.tsx");
  const shellBarSource = await readSource("../components/ui/AdminShellBar.tsx");

  // v12 (2026-07-31 rail shell, Task 3): Settings is no longer specially
  // promoted in the sub-page bar — it's just one of AppRail's three nav items,
  // present identically on every admin surface (map included). The
  // AccountMenu-in-shell-bar pin moves here: identity + sign-out now live in
  // AppRail's own account cell (menu role + sign-out form), not a shared
  // <AccountMenu> mounted in the sub-page bar.
  assert.match(railSource, /role="menu"/);
  assert.match(railSource, /role="menuitem"/);
  assert.match(railSource, /<form action="\/auth\/signout" method="post"/);
  assert.match(railSource, /Sign out/);
  // With identity + sign-out in the rail, the sub-page bar itself must NOT
  // double as a second account or settings control (2026-07-16 session layer,
  // still true, just relocated).
  assert.doesNotMatch(shellBarSource, /<AccountMenu/);
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
  assert.equal((seatMapSource.match(/placeholder=\{SEAT_SEARCH_PLACEHOLDER\}/g) ?? []).length, 2, "both admin search inputs share the placeholder");
  assert.match(viewerSource, /placeholder=\{SEAT_SEARCH_PLACEHOLDER\}/);
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
  const namesToggleControls = (seatMapSource.match(/setShowNames\(current => !current\)/g) ?? []).length;
  assert.ok(namesToggleControls >= 1, "the admin map must keep a names toggle");
  assert.equal(
    (seatMapSource.match(/aria-(?:pressed|checked)=\{showNames\}/g) ?? []).length,
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
  assert.match(seatMapSource, /Show occupant names\s*\{showNames && \(/);

  // A skip link is the first focusable on both map surfaces, targeting a
  // focusable map region — the chrome gauntlet is 8+ tab stops otherwise.
  // The admin map's skip link is no longer a standalone anchor in this file
  // (visual-pass fix: that placement put it AFTER AppRail's 7 controls in
  // DOM order, making it the 8th tab stop) — the persistent AppShell maps
  // the route to it and AppRail renders it as the rail's first child, before
  // the hamburger. See AppRail.tsx's ordering pin below and
  // app-rail.test.mjs's ct assertion for the actual first-focusable
  // guarantee.
  const appShellSourceForSkip = await readSource("../components/ui/AppShell.tsx");
  assert.match(appShellSourceForSkip, /map: \{ href: "#planning-canvas", label: "Skip to seat map" \}/);
  assert.doesNotMatch(seatMapSource, /<a\s+href="#planning-canvas"/);
  assert.match(seatMapSource, /id="planning-canvas" tabIndex=\{-1\}/);
  assert.match(viewerSource, /href="#viewer-seat-map"[\s\S]{0,420}Skip to seat map/);
  assert.match(viewerSource, /id="viewer-seat-map"/);

  // AppRail itself must render skipLink before the hamburger button — the
  // concrete anchor for "first child of the rail" (source-text can't observe
  // actual tab order; app-rail.test.mjs's ct test does).
  const railSourceForSkip = await readSource("../components/ui/AppRail.tsx");
  const skipLinkIndex = railSourceForSkip.indexOf("{skipLink && (");
  const hamburgerIndex = railSourceForSkip.indexOf("ref={hamburgerRef}");
  assert.ok(skipLinkIndex >= 0 && hamburgerIndex >= 0, "AppRail must still define both skipLink and the hamburger button");
  assert.ok(skipLinkIndex < hamburgerIndex, "skipLink must render before the hamburger, so it is the rail's first focusable");
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
  assert.match(appShellSourceForViewer, /<AppRail\b/);
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
  assert.match(viewerSource, /aria-controls=\{paletteOpen \? "viewer-find-palette" : undefined\}/);
  assert.doesNotMatch(viewerSource, /viewer-people-directory|show the people list|Close the people list/);
  assert.match(paletteSource, /viewportWidth < VIEWER_PANEL_BREAKPOINT_PX/);
  assert.match(paletteSource, /const VIEWER_PANEL_BREAKPOINT_PX = 900/);
});

test("dark-panel selects style their options and the app declares a theme color", async () => {
  const inspectorSource = await readSource("../components/seat-map/SeatInspector.tsx");
  const layoutSource = await readSource("../app/layout.tsx");

  // Native <select> popups ignore the control's classes: without explicit
  // option colors, Windows dark mode renders OS-colored options against the
  // inspector's dark panel (#200). FilterPanel already does this — the
  // inspector's shared field class must too. Token VALUES are free to evolve;
  // the invariant is that option bg+text are explicitly set.
  assert.match(inspectorSource, /fieldClassName = "[^"]*\[&>option\]:bg-\[[^\]]+\][^"]*\[&>option\]:text-\[[^\]]+\]/);

  // Browser chrome should match the app's dark top bar on mobile (#200).
  assert.match(layoutSource, /themeColor/);
});

test("form fields carry the hygiene attributes users and password managers rely on", async () => {
  const seatMapSource = await readSource("../components/seat-map/SeatMap.tsx");
  const viewerSource = await readSource("../components/seat-map/ViewerSeatFinder.tsx");
  const inspectorSource = await readSource("../components/seat-map/SeatInspector.tsx");
  const askPlannerSource = await readSource("../components/seat-map/AskPlannerDrawer.tsx");
  const loginSource = await readSource("../components/auth/LoginForm.tsx");
  const managementSource = await readSource("../components/admin-management/AdminManagementPanel.tsx");
  const searchLibSource = await readSource("../lib/viewerSeatSearch.ts");
  const globalsSource = await readSource("../app/globals.css");

  // Search inputs are real searches: correct type, a name, no password-manager
  // triggers — and the shared placeholder ends with an ellipsis (#199). The
  // native webkit cancel button is suppressed so the app's own clear control
  // stays the single clear path (see the clear-controls test above).
  assert.match(searchLibSource, /SEAT_SEARCH_PLACEHOLDER = "Search people or seats…"/);
  assert.equal((seatMapSource.match(/name="seat-search"/g) ?? []).length, 2, "both admin search inputs carry a name");
  assert.equal((seatMapSource.match(/type="search"/g) ?? []).length, 2, "both admin search inputs are type=search");
  assert.match(viewerSource, /type="search"[\s\S]{0,240}name="seat-search"/);
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
  const managementSource = await readSource("../components/admin-management/AdminManagementPanel.tsx");
  const dataUtilitiesSource = await readSource("../components/admin-settings/DataUtilitiesPanel.tsx");
  const askPlannerSource = await readSource("../components/seat-map/AskPlannerDrawer.tsx");
  const seatMapSource = await readSource("../components/seat-map/SeatMap.tsx");
  const viewerSource = await readSource("../components/seat-map/ViewerSeatFinder.tsx");
  const accountMenuSource = await readSource("../components/ui/AccountMenu.tsx");
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
  assert.match(askPlannerSource, /min-h-0 flex-1 overflow-y-auto overscroll-contain/);
  assert.equal((dataUtilitiesSource.match(/min-h-0 overflow-y-auto overscroll-contain/g) ?? []).length, 2);
  assert.match(seatMapSource, /min-h-0 overflow-y-auto overscroll-contain/);
  assert.match(managementSource, /role="dialog"[\s\S]{0,600}overscroll-contain/);

  // Viewport-fixed bottom sheets respect the home-indicator inset (#198).
  assert.match(seatMapSource, /env\(safe-area-inset-bottom\)/);
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
  assert.match(accountMenuSource, /after:absolute after:-inset-\[9px\]/);
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
  const shellBarSource = await readSource("../components/ui/AdminShellBar.tsx");
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

  // Same list-semantics guarantee for the viewer's status counts. v12 slice 3
  // floated them off the docked footer strip onto a layer-01 card over the
  // full-bleed plan; the shared MapStatusLegend keeps them a labelled <ul>
  // instead of decorative text painted on the map. Bound to its accessible
  // name in one assertion for the same reason as the admin pin above.
  assert.match(viewerSource, /<MapStatusLegend[\s\S]{0,200}ariaLabel="Seat status summary"/);

  // Brand and seat-code tokens are identifiers — never machine-translated.
  for (const [name, source] of [["SeatMap", seatMapSource], ["Viewer", viewerSource], ["ShellBar", shellBarSource]]) {
    assert.match(source, /translate="no"[\s\S]{0,200}Megeredchian Law|Megeredchian Law[\s\S]{0,60}translate="no"/, `${name} brand is translate=no`);
  }
  assert.ok((markerSource.match(/translate="no"/g) ?? []).length >= 2, "seat-code labels are translate=no");

  // Counts render localized, consistent with the panel's own convention.
  assert.match(managementSource, /\{card\.value\.toLocaleString\(\)\}/);
  assert.match(managementSource, /\{row\.employeeCount\.toLocaleString\(\)\}/);
  assert.match(managementSource, /zoneCounts\.get\(name\) \?\? 0\)\.toLocaleString\(\)/);

  // Publisher emails truncate with a title tooltip instead of wrapping
  // mid-glyph (#202).
  assert.doesNotMatch(managementSource, /break-all/);

  // Straight apostrophe entity → curly on the login card.
  assert.doesNotMatch(loginPageSource, /You&apos;re/);
  assert.match(loginPageSource, /You’re/);

  // The admin sub-pages get the same skip affordance the maps have, via
  // AppRail's skipLink prop (not the shell bar — visual-pass fix: the shell
  // bar's copy put the skip link behind all 7 rail controls, making it the
  // 8th tab stop instead of the 1st). The persistent AppShell owns the
  // route → skip-target mapping now; each page still owns its landing
  // marker.
  assert.doesNotMatch(shellBarSource, /Skip to content/);
  const appShellSource = await readSource("../components/ui/AppShell.tsx");
  assert.match(appShellSource, /management: \{ href: "#admin-subpage-main", label: "Skip to content" \}/);
  assert.match(appShellSource, /settings: \{ href: "#admin-subpage-main", label: "Skip to content" \}/);
  assert.match(appShellSource, /reception: \{ href: "#reception-main", label: "Skip to content" \}/);
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
  assert.match(seatMapSource, /<div role="group" aria-label="Admin command row"/);

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
  // spans WITHOUT whitespace, so the literal space text nodes between the
  // code and name spans are load-bearing — without them the visible text
  // reads "C07Daniel" and fails name containment (#223). Flex containers
  // never render whitespace-only nodes, so they are visually inert.
  assert.match(markerSource, /\{employeeName && " "\}/);
  assert.match(markerSource, /\{showInlineName && " "\}/);
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
    for (const match of source.match(/bg-\[var\(--admin-primary-cta\)\][^"']*/g) ?? []) {
      assert.doesNotMatch(
        match,
        /text-\[var\(--admin-text-inverse\)\]/,
        `${file}: CTA labels must be white (4.71:1), not --admin-text-inverse (4.35:1)`
      );
    }
  }
});

test("directory rows are a mouse shortcut, not a third tab stop per employee", async () => {
  const managementSource = await readSource("../components/admin-management/AdminManagementPanel.tsx");

  // Each row already exposes two real controls — the name link (to the map)
  // and the kebab (to the edit form). Making the <tr> focusable as well put
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
