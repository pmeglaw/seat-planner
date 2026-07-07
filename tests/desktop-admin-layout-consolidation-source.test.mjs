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

test("admin layout consolidation moves identity and status into the top bar (rail removed)", async () => {
  const seatMapSource = await readSource("../components/seat-map/SeatMap.tsx");
  // The low-utility left rail is gone (map-first). Identity + publish status live in the
  // top bar; the seat stats + status legend move into the compact canvas header.
  const topBar = sliceFrom(seatMapSource, 'bg-[var(--admin-chrome-bg)]', "</header>");
  const canvasHeader = sliceFrom(seatMapSource, 'id="admin-planning-canvas-title"', "</ul>");

  assert.doesNotMatch(seatMapSource, /aria-label="Admin workspace rail"/);
  assert.match(topBar, /Megeredchian Law Seats/);
  // Chrome pass (owner-approved): publish is elevated to a right-side primary button
  // that carries the review action + change count and goes quiet ("Published") when in
  // sync; the brand subtitle shows a small draft-status dot next to identity. This
  // intentionally supersedes the earlier single-left-chip (3b) arrangement.
  assert.match(topBar, /Published · Viewer/);
  assert.match(topBar, /onClick=\{openPublishReview\}/);
  assert.match(topBar, /aria-label=\{`Review \$\{draftStatusLabel\.toLowerCase\(\)\}`\}/);
  assert.match(topBar, /\{publishSummary\.hasChanges \? \(/);
  assert.match(topBar, /Review changes/);
  assert.match(topBar, /\{publishSummary\.totalChangeCount\}/);
  assert.doesNotMatch(topBar, /Draft · Admin/);

  assert.match(canvasHeader, /aria-label="Seat inventory summary"/);
  assert.match(canvasHeader, /\{stats\.total\}[\s\S]*seats/);
  assert.match(canvasHeader, /\{stats\.assigned\}[\s\S]*assigned/);
  assert.match(canvasHeader, /\{stats\.available\}[\s\S]*open/);
  assert.match(canvasHeader, /aria-label="Seat status legend"/);
});

test("admin layout consolidation keeps planning actions in one command row", async () => {
  const seatMapSource = await readSource("../components/seat-map/SeatMap.tsx");
  // 3b chrome: the command search lives IN the 56px bar at lg+ (⌘K focuses it);
  // below that tier it stays as the slim canvas row.
  const topBar = sliceFrom(seatMapSource, 'bg-[var(--admin-chrome-bg)]', "</header>");
  const searchRow = sliceFrom(seatMapSource, 'role="search" aria-label="Command search"', "</div>");
  const canvasSearchRow = sliceFrom(seatMapSource, 'role="search" aria-label="Canvas search"', "</div>");

  assert.match(topBar, /Megeredchian Law Seats/);
  assert.match(topBar, /role="search" aria-label="Command search"/);
  assert.match(topBar, /hidden min-w-0 lg:block lg:max-w-\[448px\] lg:flex-1/);
  assert.match(topBar, /handleSearchInputChange/);
  assert.match(topBar, /\{searchShortcutHint\}/);
  assert.match(canvasSearchRow, /lg:hidden/);
  assert.match(canvasSearchRow, /handleSearchInputChange/);
  assert.match(seatMapSource, /const handleSearchShortcut = \(event: globalThis\.KeyboardEvent\) => \{/);
  assert.match(seatMapSource, /event\.key\.toLowerCase\(\) === "k"/);
  assert.match(topBar, /aria-label="Admin command row"/);
  assert.match(topBar, /onClick=\{toggleFilterPanel\}/);
  assert.match(topBar, /aria-label=\{filterCollapsed \? "Open filters" : "Collapse filters"\}/);
  assert.match(topBar, /aria-label=\{namesToggleLabel\}/);
  assert.doesNotMatch(topBar, /aria-label="Map tools"/);
  assert.match(topBar, /href="\/admin\/settings"/);
  assert.match(topBar, /disabled=\{pending \|\| inspectorDirty \|\| !undoAvailable\}[\s\S]*aria-label="Undo last map change"/);
  assert.match(topBar, /disabled=\{pending \|\| inspectorDirty \|\| !redoAvailable\}[\s\S]*aria-label="Redo last undone change"/);
  assert.match(topBar, /href="\/admin\/management"/);
  assert.match(topBar, /aria-label=\{plannerHighlightedSeatIds\.length > 0 \? `Open Ask Planner/);

  assert.match(searchRow, /Search employee, seat, job title, department, or zone/);
  assert.match(seatMapSource, /const namesToggleLabel = showNames \? "Hide names" : "Show names"/);
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
