import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Scope note: this file guards marker *correctness* — that true coordinates and
// the map calibration constants stay untouched, and that the marker/map code
// never crosses data/auth/publish/route boundaries. The marker's visual styling
// (colors, pill sizes, name truncation classes) is intentionally NOT locked here
// so the marker look can be redesigned freely.

async function readSource(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("desktop marker system keeps true coordinates and calibration constants untouched", async () => {
  const markerSource = await readSource("../components/seat-map/SeatMarker.tsx");
  const seatMapSource = await readSource("../components/seat-map/SeatMap.tsx");
  const transformSource = await readSource("../lib/mapLayoutTransform.ts");

  assert.match(markerSource, /style=\{pointToStyle\(\{ x: seat\.x, y: seat\.y \}\)\}/);
  assert.match(markerSource, /markerUsesTrueCoordinate = addSeatMode \|\| moveSeatMode \|\| swapMode/);
  assert.match(markerSource, /resolvedViewportEdgeOffsetPx = markerUsesTrueCoordinate \|\| !tokenCanHugViewportEdge \? 0 : Math\.max\(0, Math\.round\(viewportEdgeOffsetPx\)\)/);
  assert.match(seatMapSource, /const visualSeat = visualSeatById\.get\(seat\.id\) \?\? seat/);
  assert.match(seatMapSource, /viewportEdgeOffsetPx=\{viewportPlacement\.offsetPx\}/);
  assert.match(seatMapSource, /onMovePointerDown=\{handleMovePointerDown\}/);

  assert.match(transformSource, /MAP_IMAGE_SRC = "\/images\/office-floor-plan\.webp\?v=map-v3-cool-1695x841"/);
  assert.match(transformSource, /MAP_IMAGE_WIDTH = 1695/);
  assert.match(transformSource, /MAP_IMAGE_HEIGHT = 841/);
  assert.match(transformSource, /xScale: 0\.815189/);
  assert.match(transformSource, /xOffset: 0\.101478/);
  assert.match(transformSource, /yScale: 1\.125499/);
  // Chair-center micro-tune, 2026-07 (fix/floor-plan-polish): NE split into
  // per-quad areas; SE/CW-upper refit. These pin the tuned constants.
  assert.match(transformSource, /xOffset: -0\.175684/);
  assert.match(transformSource, /xScale: 0\.835824/);
  // Map v3 remap (owner-approved cool-palette crop, issue #121): the per-area
  // constants above stay in v2 image space; this single composition converts
  // to the v3 asset. Both directions must keep flowing through it.
  assert.match(transformSource, /MAP_V3_REMAP: LinearTransform = \{\s*xScale: 1\.110811,\s*xOffset: -0\.074293,\s*yScale: 1\.008851,\s*yOffset: -0\.004197\s*\}/);
  assert.match(transformSource, /applyTransform\(applyTransform\(point, area\?\.transform \?\? DEFAULT_PREVIEW_TRANSFORM\), MAP_V3_REMAP\)/);
  assert.match(transformSource, /const v2Point = applyInverseTransform\(point, MAP_V3_REMAP\)/);
});

test("desktop marker redesign stays clear of data auth publish and route boundaries", async () => {
  const markerSource = await readSource("../components/seat-map/SeatMarker.tsx");
  const seatMapSource = await readSource("../components/seat-map/SeatMap.tsx");
  const viewerSource = await readSource("../app/page.tsx");
  const viewerFinderSource = await readSource("../components/seat-map/ViewerSeatFinder.tsx");
  const managementSource = await readSource("../app/admin/management/page.tsx");

  assert.match(viewerSource, /\.eq\("layer", "published"\)/);
  assert.match(viewerSource, /<ViewerSeatFinder/);
  assert.match(viewerFinderSource, /Read-only/);
  assert.match(viewerFinderSource, /Published/);
  assert.doesNotMatch(viewerFinderSource, /Map tools|Undo|Redo|CSV|JSON|Publish changes|Vacate|Delete seat/);
  assert.doesNotMatch(managementSource, /SeatMarker|draftChangedSeatLabelSet|Admin command row/);

  for (const source of [markerSource, seatMapSource]) {
    assert.doesNotMatch(source, /createServerSupabaseClient|requireAdmin|profiles\.role|\.rpc\("publish_seat_map"\)|\.from\("seats"\)\.insert|\.from\("seats"\)\.delete/);
  }
});
