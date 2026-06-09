import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readSource(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("viewer route renders the published map as read-only", async () => {
  const viewerSource = await readSource("../app/page.tsx");
  const adminSource = await readSource("../app/admin/page.tsx");

  assert.match(viewerSource, /\.eq\("layer", "published"\)/);
  assert.match(viewerSource, /canEdit=\{false\}/);
  assert.match(adminSource, /\.eq\("layer", "draft"\)/);
  assert.match(adminSource, /\.eq\("layer", "published"\)/);
  assert.match(adminSource, /publishedSeats=\{\(publishedSeats \?\? \[\]\) as SeatWithEmployee\[\]\}/);
  assert.match(adminSource, /canEdit\s*\/>/);
});

test("toolbar exposes panel relationships and disabled undo redo explanations", async () => {
  const source = await readSource("../components/seat-map/SeatMap.tsx");

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
  const seatMapSource = await readSource("../components/seat-map/SeatMap.tsx");
  const inspectorSource = await readSource("../components/seat-map/SeatInspector.tsx");

  assert.match(viewerSource, /canEdit=\{false\}/);
  assert.match(seatMapSource, /\{canEdit && \([\s\S]*draftStatusLabel/);
  assert.match(seatMapSource, /\{canEdit && \([\s\S]*<AdvancedDrawer/);
  assert.match(inspectorSource, /\{canEdit \? \([\s\S]*Seat action rules/);
  assert.match(inspectorSource, /\{canEdit \? \([\s\S]*Delete seat/);
  assert.match(inspectorSource, /\{canEdit \? \([\s\S]*Vacate/);
});

test("map tools and ask planner drawers keep dialog semantics and focus targets", async () => {
  const advancedDrawerSource = await readSource("../components/seat-map/AdvancedDrawer.tsx");
  const askPlannerSource = await readSource("../components/seat-map/AskPlannerDrawer.tsx");

  assert.match(advancedDrawerSource, /id="advanced-drawer"/);
  assert.match(advancedDrawerSource, /aria-labelledby="advanced-drawer-title"/);
  assert.match(advancedDrawerSource, /aria-describedby="advanced-drawer-description"/);
  assert.match(advancedDrawerSource, /Map actions, seat tools, and publishing\./);
  assert.match(advancedDrawerSource, /closeButtonRef\.current\?\.focus/);

  assert.match(askPlannerSource, /id="ask-planner-drawer"/);
  assert.match(askPlannerSource, /aria-labelledby="ask-planner-title"/);
  assert.match(askPlannerSource, /aria-describedby="ask-planner-description"/);
  assert.match(askPlannerSource, /questionRef\.current\.focus/);
});

test("publish review summarizes draft changes before publish", async () => {
  const source = await readSource("../components/seat-map/SeatMap.tsx");

  assert.match(source, /buildPublishChangeSummary\(localSeats, localPublishedSeats\)/);
  assert.match(source, /aria-labelledby="publish-review-title"/);
  assert.match(source, /Review draft before publishing/);
  assert.match(source, /You are about to publish draft changes/);
  assert.match(source, /No draft changes to publish/);
  assert.match(source, /disabled=\{pending \|\| !publishSummary\.hasChanges\}/);
  assert.match(source, /Added seats/);
  assert.match(source, /Removed custom draft seats/);
  assert.match(source, /Assignment changes/);
  assert.match(source, /Vacated seats/);
  assert.match(source, /Seat moves\/layout changes/);
  assert.match(source, /Status changes/);
  assert.match(source, /Other draft changes/);
  assert.match(source, /Save or discard the selected seat edits before publishing/);
  assert.doesNotMatch(source, /Publish draft map to the viewer-facing seat map\?/);
});

test("seat markers remain keyboard buttons with contextual accessible labels", async () => {
  const source = await readSource("../components/seat-map/SeatMarker.tsx");

  assert.match(source, /<button[\s\S]*type="button"/);
  assert.match(source, /aria-pressed=\{selected\}/);
  assert.match(source, /aria-label=\{`\$\{seat\.label\}: \$\{displayName\}\. \$\{seat\.status\} seat\./);
  assert.match(source, /Search result\./);
  assert.match(source, /Highlighted by Ask Planner\./);
  assert.match(source, /Selected\./);
  assert.match(source, /focus-visible:ring-4/);
});

test("inspector and filter actions retain accessible names and disabled save help", async () => {
  const inspectorSource = await readSource("../components/seat-map/SeatInspector.tsx");
  const filterSource = await readSource("../components/seat-map/FilterPanel.tsx");

  assert.match(inspectorSource, /aria-label=\{`View details for \$\{selectedSeat\.label\}`\}/);
  assert.match(inspectorSource, /aria-label=\{`Back to map from \$\{selectedSeat\.label\} details`\}/);
  assert.match(inspectorSource, /aria-label=\{`Ask Planner about \$\{selectedSeat\.label\}`\}/);
  assert.match(inspectorSource, /No draft changes to save\./);
  assert.match(inspectorSource, /aria-describedby=\{saveDisabledReason \? "seat-inspector-save-help" : undefined\}/);
  assert.match(inspectorSource, /Seat action rules/);
  assert.match(inspectorSource, /getSeatDeleteBlockReason/);
  assert.match(inspectorSource, /Delete seat/);
  assert.match(inspectorSource, /aria-describedby="seat-inspector-delete-help"/);
  assert.match(inspectorSource, /whitespace-normal rounded-xl leading-tight/);
  assert.doesNotMatch(inspectorSource, /Discard unsaved inspector edits before deleting this custom seat/);

  assert.match(filterSource, /aria-label="People results"/);
  assert.match(filterSource, /aria-label=\{resultActionLabel\}/);
  assert.match(filterSource, /No assigned seat to open/);
});

test("custom seat deletion remains guarded by the parent map action", async () => {
  const source = await readSource("../components/seat-map/SeatMap.tsx");
  const deleteFunction = source.match(/function deleteSelectedSeat\(\) \{[\s\S]*?function openPublishReview/);

  assert.ok(deleteFunction, "deleteSelectedSeat should remain source-visible.");
  assert.match(deleteFunction[0], /if \(inspectorDirty && !canDiscardInspectorChanges\(\)\) return;/);
  assert.match(deleteFunction[0], /getSeatDeleteBlockReason\(selectedSeat\)/);
  assert.match(deleteFunction[0], /if \(!canDeleteSeat\(selectedSeat\)\)/);
  assert.match(deleteFunction[0], /deleteSeatAction\(selectedSeat\.id\)/);
  assert.match(deleteFunction[0], /setActionNotice\(`Deleted custom seat \$\{deletedSeatLabel\}\. Undo is available until publish\.`\)/);
});
