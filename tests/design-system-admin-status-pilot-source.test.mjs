import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readSource(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("admin planning canvas status row adopts only StatusBadge", async () => {
  const seatMapSource = await readSource("../components/seat-map/SeatMap.tsx");
  const viewerSource = await readSource("../app/page.tsx");
  const adminRouteSource = await readSource("../app/admin/page.tsx");
  const managementRouteSource = await readSource("../app/admin/management/page.tsx");

  const designSystemImport = seatMapSource.match(/^import \{\s*([^}]*)\s*\} from "@\/components\/ui\/design-system";/m);
  assert.ok(designSystemImport, "SeatMap should import the design-system primitive for the pilot.");
  assert.match(designSystemImport[1], /\bStatusBadge\b/);
  assert.doesNotMatch(designSystemImport[1], /\bButton\b|\bIconButton\b|\bfocusRingClass\b|\bmarkerStateClassRecipes\b/);

  const planningCanvasSource = seatMapSource.match(/aria-labelledby="admin-planning-canvas-title"[\s\S]*?<div className="flex shrink-0 flex-wrap gap-1\.5[\s\S]*?<\/div>\s*<\/div>\s*\)\}/)?.[0] ?? "";
  assert.ok(planningCanvasSource, "Planning Canvas status row should remain discoverable.");
  assert.match(planningCanvasSource, /<StatusBadge tone="draft"[\s\S]*>Draft map<\/StatusBadge>/);
  assert.match(planningCanvasSource, /<StatusBadge tone="info"[\s\S]*>Spatial confirmation<\/StatusBadge>/);
  assert.match(planningCanvasSource, /Draft map/);
  assert.match(planningCanvasSource, /Spatial confirmation/);
  assert.doesNotMatch(planningCanvasSource, /<span className="rounded-full bg-white px-2 py-1 text-slate-500 ring-1 ring-slate-200">Draft map<\/span>/);
  assert.doesNotMatch(planningCanvasSource, /<span className="rounded-full bg-orange-50 px-2 py-1 text-brand-dark ring-1 ring-orange-100">Spatial confirmation<\/span>/);

  assert.doesNotMatch(seatMapSource, /markerStateClassRecipes/);

  for (const routeSource of [viewerSource, adminRouteSource, managementRouteSource]) {
    assert.doesNotMatch(routeSource, /components\/ui\/design-system|StatusBadge|IconButton|markerStateClassRecipes/);
  }
});
