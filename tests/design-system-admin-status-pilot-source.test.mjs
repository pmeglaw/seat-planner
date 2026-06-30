import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readSource(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("admin planning canvas status row keeps the StatusBadge pilot scoped", async () => {
  const seatMapSource = await readSource("../components/seat-map/SeatMap.tsx");
  const viewerSource = await readSource("../app/page.tsx");
  const adminRouteSource = await readSource("../app/admin/page.tsx");
  const managementRouteSource = await readSource("../app/admin/management/page.tsx");

  const designSystemImport = seatMapSource.match(/^import \{\s*([^}]*)\s*\} from "@\/components\/ui\/design-system";/m);
  assert.ok(designSystemImport, "SeatMap should import the design-system primitive for the pilot.");
  assert.match(designSystemImport[1], /\bStatusBadge\b/);
  assert.doesNotMatch(designSystemImport[1], /\bButton\b|\bIconButton\b|\bmarkerStateClassRecipes\b/);

  // Claude Design: the noisy "Draft map / Spatial confirmation" StatusBadges leave the
  // compact canvas header (now a clean stats + legend row). StatusBadge stays scoped to
  // the publish-review dialog so the pilot primitive is still exercised, not removed.
  const publishReviewSource = seatMapSource.match(/\{publishReviewOpen && \([\s\S]*?\{inspectorGuardAction/)?.[0] ?? "";
  assert.ok(publishReviewSource, "Publish review dialog should remain discoverable.");
  assert.match(publishReviewSource, /<StatusBadge tone=/);
  const planningCanvasSource = seatMapSource.match(/aria-labelledby="admin-planning-canvas-title"[\s\S]*?<\/ul>/)?.[0] ?? "";
  assert.ok(planningCanvasSource, "Planning Canvas header should remain discoverable.");
  assert.doesNotMatch(planningCanvasSource, /StatusBadge|Spatial confirmation/);
  assert.match(planningCanvasSource, /aria-label="Seat status legend"/);

  assert.doesNotMatch(seatMapSource, /markerStateClassRecipes/);

  for (const routeSource of [viewerSource, adminRouteSource, managementRouteSource]) {
    assert.doesNotMatch(routeSource, /components\/ui\/design-system|StatusBadge|IconButton|markerStateClassRecipes/);
  }
});
