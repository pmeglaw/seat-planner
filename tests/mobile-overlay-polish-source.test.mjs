import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readSource(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

function sliceBetween(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  assert.ok(start >= 0, `${startNeedle} should be present.`);
  const end = source.indexOf(endNeedle, start);
  assert.ok(end > start, `${endNeedle} should appear after ${startNeedle}.`);
  return source.slice(start, end);
}

test("mobile active interaction surfaces hide map-only controls", async () => {
  const source = await readSource("../components/seat-map/SeatMap.tsx");
  const surfaceSource = sliceBetween(
    source,
    "const mobileMapInteractionSurfaceOpen",
    "const mobileMapControlsHidden"
  );
  const mapModeShellSource = sliceBetween(
    source,
    "const mapModeOverlayShellClassName",
    "const mapMarkerLayerClassName"
  );
  const mapMarkerLayerSource = sliceBetween(
    source,
    "const mapMarkerLayerClassName",
    "const actionErrorBannerClassName"
  );

  assert.match(surfaceSource, /Boolean\(selectedSeat && !inspectorCollapsed\)/);
  assert.match(surfaceSource, /showFilterPanel/);
  assert.match(surfaceSource, /askPlannerOpen/);
  assert.match(surfaceSource, /publishReviewOpen/);
  assert.match(surfaceSource, /Boolean\(deleteSeatConfirm\)/);
  assert.match(surfaceSource, /Boolean\(inspectorGuardAction\)/);
  assert.match(surfaceSource, /Boolean\(swapConfirm\)/);
  assert.match(source, /const mobileMapControlsHidden = mobileMapInteractionSurfaceOpen;/);
  assert.match(mapModeShellSource, /mobileMapControlsHidden \? "hidden sm:block" : ""/);
  assert.match(mapMarkerLayerSource, /mobileMapControlsHidden \? "hidden sm:block" : ""/);
  assert.match(source, /aria-label="Map view mode"/);
});

test("selected mobile inspector sheet owns its visual layer", async () => {
  const inspectorSource = await readSource("../components/seat-map/SeatInspector.tsx");

  assert.match(
    inspectorSource,
    /className="fixed inset-x-3 bottom-3 z-\[80\][\s\S]*bg-\[var\(--sp-color-surface\)\][\s\S]*sm:bg-\[var\(--sp-color-surface\)\]\/95/
  );
  assert.match(
    inspectorSource,
    /className="sticky bottom-0 z-20[\s\S]*bg-\[var\(--sp-color-surface\)\][\s\S]*sm:bg-\[var\(--sp-color-surface\)\]\/95/
  );
  assert.match(inspectorSource, /aria-label=\{canEdit \? "Selected draft seat inspector" : "Selected published seat details"\}/);
  assert.match(inspectorSource, /Back to map/);
});

test("mobile overlay polish does not expand viewer or production route imports", async () => {
  const viewerRouteSource = await readSource("../app/page.tsx");
  const viewerFinderSource = await readSource("../components/seat-map/ViewerSeatFinder.tsx");
  const managementRouteSource = await readSource("../app/admin/management/page.tsx");

  assert.match(viewerRouteSource, /<ViewerSeatFinder/);
  assert.doesNotMatch(viewerRouteSource, /<SeatMap/);
  assert.doesNotMatch(viewerFinderSource, /mobileMapControlsHidden|mobileMapInteractionSurfaceOpen|Map tools|publishSeatMapAction/);
  assert.doesNotMatch(managementRouteSource, /mobileMapControlsHidden|mobileMapInteractionSurfaceOpen/);
});
