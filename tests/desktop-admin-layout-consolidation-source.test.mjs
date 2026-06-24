import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readSource(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

function sliceFrom(source, startNeedle, endNeedle) {
  const startIndex = source.indexOf(startNeedle);
  assert.notEqual(startIndex, -1, `Expected source to include ${startNeedle}`);
  const endIndex = source.indexOf(endNeedle, startIndex);
  assert.notEqual(endIndex, -1, `Expected source after ${startNeedle} to include ${endNeedle}`);
  return source.slice(startIndex, endIndex + endNeedle.length);
}

test("admin layout consolidation moves identity and status into the rail", async () => {
  const seatMapSource = await readSource("../components/seat-map/SeatMap.tsx");
  const railSource = sliceFrom(seatMapSource, 'aria-label="Admin workspace rail"', "</aside>");

  assert.match(railSource, /Office Seat Planner/);
  assert.match(railSource, /\{canEdit \? "Draft" : "Published"\}/);
  assert.match(railSource, /aria-label="Seat inventory summary"/);
  assert.match(railSource, /\{stats\.total\}[\s\S]*Seats/);
  assert.match(railSource, /\{stats\.assigned\}[\s\S]*Assigned/);
  assert.match(railSource, /\{stats\.available\}[\s\S]*Open/);
  assert.match(railSource, /onClick=\{openPublishReview\}/);
  assert.match(railSource, /Draft publication status/);
  assert.match(railSource, /\{draftStatusHeadline\}/);
  assert.match(railSource, /\{draftStatusActionLabel\}/);
  assert.match(railSource, /\{draftStatusDescription\}/);
  assert.match(railSource, /\{draftStatusLabel\}/);
});

test("admin layout consolidation keeps planning actions in one command row", async () => {
  const seatMapSource = await readSource("../components/seat-map/SeatMap.tsx");
  const commandSource = sliceFrom(seatMapSource, 'aria-label="Admin command row"', "</header>");

  assert.match(commandSource, /Command search/);
  assert.match(commandSource, /Search employee, seat, job title, department, or zone/);
  assert.match(commandSource, /onClick=\{toggleFilterPanel\}/);
  assert.match(commandSource, /aria-label=\{filterCollapsed \? "Open filters" : "Collapse filters"\}/);
  assert.match(commandSource, /const namesToggleLabel = showNames \? "Hide names" : "Show names"|aria-label=\{namesToggleLabel\}/);
  assert.match(commandSource, /aria-label="Map command actions"/);
  assert.match(commandSource, /aria-label="Planning map actions"[\s\S]*aria-label="Map tools"/);
  assert.match(commandSource, /aria-label="Draft history controls"[\s\S]*disabled=\{pending \|\| inspectorDirty \|\| !undoAvailable\}[\s\S]*disabled=\{pending \|\| inspectorDirty \|\| !redoAvailable\}/);
  assert.match(commandSource, /aria-label="Admin support actions"[\s\S]*href="\/admin\/management"[\s\S]*aria-label=\{plannerHighlightedSeatIds\.length > 0 \? `Open Ask Planner/);
  assert.doesNotMatch(seatMapSource, /aria-label="Primary workspace controls"|aria-label="Secondary admin actions"/);
});

test("admin layout consolidation preserves viewer, management, and publish boundaries", async () => {
  const seatMapSource = await readSource("../components/seat-map/SeatMap.tsx");
  const viewerRouteSource = await readSource("../app/page.tsx");
  const adminRouteSource = await readSource("../app/admin/page.tsx");
  const managementRouteSource = await readSource("../app/admin/management/page.tsx");
  const actionsSource = await readSource("../app/actions.ts");

  assert.match(viewerRouteSource, /\.eq\("layer", "published"\)/);
  assert.match(viewerRouteSource, /<ViewerSeatFinder/);
  assert.doesNotMatch(viewerRouteSource, /<SeatMap|Map tools|Undo|Redo|publishSeatMapAction/);
  assert.match(adminRouteSource, /publishedSeats=\{\(publishedSeats \?\? \[\]\) as SeatWithEmployee\[\]\}/);
  assert.doesNotMatch(managementRouteSource, /components\/seat-map\/SeatMap|Admin command row|Admin workspace rail/);

  const confirmPublishFunction = seatMapSource.match(/function confirmPublishDraftMap\(\) \{[\s\S]*?^\s*\}/m)?.[0] ?? "";
  assert.match(confirmPublishFunction, /await publishSeatMapAction\(\)/);
  assert.doesNotMatch(confirmPublishFunction, /supabase|\.from\("seats"\)|publish_seat_map/);

  const publishAction = actionsSource.match(/export async function publishSeatMapAction\(\) \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(publishAction, /const supabase = await requireAdmin\(\)/);
  assert.match(publishAction, /\.rpc\("publish_seat_map"\)/);
  assert.doesNotMatch(publishAction, /\.from\("seats"\)|\.insert\(|\.update\(|\.delete\(|\.upsert\(/);

  assert.match(seatMapSource, /savedPointToVisualPoint/);
  assert.match(seatMapSource, /visualPointToSavedPoint/);
  assert.doesNotMatch(seatMapSource, /MAP_IMAGE_SRC\s*=\s*|MAP_IMAGE_WIDTH\s*=\s*|MAP_IMAGE_HEIGHT\s*=/);
});
