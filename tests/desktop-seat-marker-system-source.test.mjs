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
  assert.match(markerSource, /markerUsesTrueCoordinate = addSeatMode \|\| swapMode \|\| moveEmployeeMode/);
  assert.match(markerSource, /resolvedViewportEdgeOffsetPx = markerUsesTrueCoordinate \|\| !tokenCanHugViewportEdge \? 0 : Math\.max\(0, Math\.round\(viewportEdgeOffsetPx\)\)/);
  assert.match(seatMapSource, /const visualSeat = visualSeatById\.get\(seat\.id\) \?\? seat/);
  assert.match(seatMapSource, /viewportEdgeOffsetPx=\{viewportPlacement\.offsetPx\}/);

  assert.match(transformSource, /MAP_IMAGE_SRC = "\/images\/office-floor-plan\.webp\?v=map-v2-cool-2x-3822x1734"/);
  assert.match(transformSource, /MAP_IMAGE_WIDTH = 3822/);
  assert.match(transformSource, /MAP_IMAGE_HEIGHT = 1734/);
  assert.match(transformSource, /xScale: 0\.815189/);
  assert.match(transformSource, /xOffset: 0\.101478/);
  assert.match(transformSource, /yScale: 1\.125499/);
  // Chair-centre re-fits. Phase 1 (fix/floor-plan-chair-calibration): north /
  // west / center-west (both) / center-desks were ~10–17px above their chairs.
  // Phase 2 (fix/floor-plan-calibration-ene-tighten, #178/#179) re-fit east and
  // both NE quads — but NE-right regressed to a savedBounds->visualBounds
  // RECTANGLE fit, landing NE01-NE08 3.0-8.4px off their chairs with the two
  // quads disagreeing by 13.3px. The 2026-07-19 chair-centre fit below is the
  // correct one; tests/map-calibration.test.mjs measures the alignment these
  // constants exist to produce and is the authority — these pins are only a
  // change-detector, so update both together. SE-lower xScale is unchanged
  // since the fix/floor-plan-polish micro-tune:
  assert.match(transformSource, /xOffset: -0\.056543/);
  assert.match(transformSource, /xScale: 0\.835824/);
});

test("desktop marker redesign stays clear of data auth publish and route boundaries", async () => {
  const markerSource = await readSource("../components/seat-map/SeatMarker.tsx");
  const seatMapSource = await readSource("../components/seat-map/SeatMap.tsx");
  const viewerSource = await readSource("../app/page.tsx");
  const viewerFinderSource = await readSource("../components/seat-map/ViewerSeatFinder.tsx");
  const managementSource = await readSource("../app/(shell)/admin/management/page.tsx");

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
