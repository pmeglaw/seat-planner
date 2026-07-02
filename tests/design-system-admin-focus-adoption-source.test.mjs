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

function sliceAround(source, startNeedle, charCount) {
  const startIndex = source.indexOf(startNeedle);
  assert.notEqual(startIndex, -1, `Expected source to include ${startNeedle}`);
  return source.slice(startIndex, startIndex + charCount);
}

test("admin focus adoption uses the shared focus helper on narrow planning controls", async () => {
  const seatMapSource = await readSource("../components/seat-map/SeatMap.tsx");

  const designSystemImport = seatMapSource.match(/^import \{\s*([^}]*)\s*\} from "@\/components\/ui\/design-system";/m);
  assert.ok(designSystemImport, "SeatMap should import the design-system focus helper.");
  assert.match(designSystemImport[1], /\bStatusBadge\b/);
  assert.match(designSystemImport[1], /\bfocusRingClass\b/);
  assert.doesNotMatch(designSystemImport[1], /\bButton\b|\bIconButton\b|\bmarkerStateClassRecipes\b/);

  const clearSearchButton = sliceFrom(seatMapSource, 'aria-label="Clear top search"', "</button>");
  assert.match(clearSearchButton, /title="Clear top search"/);
  assert.match(clearSearchButton, /onClick=\{clearSearch\}/);
  assert.match(clearSearchButton, /focusRingClass/);
  assert.doesNotMatch(clearSearchButton, /focus-visible:ring-orange-100/);

  // Top-bar text toolbar buttons carry the orange chrome focus ring via the shared
  // chromeToolbarBtn / chromeToolbarBtnActive class constants.
  assert.match(seatMapSource, /const chromeToolbarBtn = "[\s\S]*focus-visible:ring-\[var\(--admin-primary\)\]/);
  assert.match(seatMapSource, /const chromeToolbarBtnActive = "[\s\S]*focus-visible:ring-\[var\(--admin-primary\)\]/);

  const filterButton = sliceFrom(seatMapSource, "onClick={toggleFilterPanel}", "</button>");
  assert.match(filterButton, /aria-label=\{filterCollapsed \? "Open filters" : "Collapse filters"\}/);
  assert.match(filterButton, /chromeToolbarBtnActive : chromeToolbarBtn/);
  assert.doesNotMatch(filterButton, /focus-visible:ring-orange-100/);

  const namesButton = sliceFrom(seatMapSource, "onClick={() => setShowNames(current => !current)}", "</button>");
  assert.match(namesButton, /aria-label=\{namesToggleLabel\}/);
  assert.match(namesButton, /title=\{namesToggleLabel\}/);
  assert.match(seatMapSource, /const namesToggleLabel = showNames \? "Hide names" : "Show names"/);
  assert.match(namesButton, /chromeToolbarBtnActive : chromeToolbarBtn/);
  assert.doesNotMatch(namesButton, /focus-visible:ring-orange-100/);

  const mapViewModeGroup = sliceAround(seatMapSource, 'aria-label="Map view mode"', 1400);
  assert.match(seatMapSource, /label: "Overview"/);
  assert.match(seatMapSource, /label: "Detail"/);
  assert.match(mapViewModeGroup, /MAP_VIEW_MODE_OPTIONS\.map/);
  assert.match(mapViewModeGroup, /aria-pressed=\{active\}/);
  assert.match(mapViewModeGroup, /focusRingClass/);
  assert.doesNotMatch(mapViewModeGroup, /focus-visible:ring-orange-100/);
});

test("admin focus adoption does not migrate production routes to new design-system buttons", async () => {
  const viewerRouteSource = await readSource("../app/page.tsx");
  const adminRouteSource = await readSource("../app/admin/page.tsx");
  const managementRouteSource = await readSource("../app/admin/management/page.tsx");

  assert.match(viewerRouteSource, /<ViewerSeatFinder/);
  assert.doesNotMatch(viewerRouteSource, /Map tools|Draft map|StatusBadge|focusRingClass/);

  for (const routeSource of [viewerRouteSource, adminRouteSource, managementRouteSource]) {
    assert.doesNotMatch(routeSource, /components\/ui\/design-system|IconButton|markerStateClassRecipes/);
  }
});
