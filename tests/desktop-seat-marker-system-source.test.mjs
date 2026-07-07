import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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

  assert.match(transformSource, /MAP_IMAGE_SRC = "\/images\/office-floor-plan\.png\?v=map-v2-1911x867"/);
  assert.match(transformSource, /MAP_IMAGE_WIDTH = 1911/);
  assert.match(transformSource, /MAP_IMAGE_HEIGHT = 867/);
  assert.match(transformSource, /xScale: 0\.815189/);
  assert.match(transformSource, /xOffset: 0\.101478/);
  assert.match(transformSource, /yScale: 1\.125499/);
  assert.match(transformSource, /xOffset: -0\.065111/);
});

test("desktop marker system exposes assigned available selected search and draft state wiring", async () => {
  const markerSource = await readSource("../components/seat-map/SeatMarker.tsx");
  const seatMapSource = await readSource("../components/seat-map/SeatMap.tsx");

  assert.match(markerSource, /type MarkerIntent = "assigned" \| "available" \| "reserved" \| "unavailable" \| "draft-changed" \| "search-result" \| "search-selected" \| "selected" \| "move-origin" \| "swap-source" \| "swap-target" \| "target-valid" \| "target-invalid"/);
  assert.match(markerSource, /markerIntent: MarkerIntent = swapSource/);
  assert.match(markerSource, /searchSelected = selected && searchProminent/);
  assert.match(markerSource, /variant\?: "admin" \| "viewer"/);
  assert.match(markerSource, /variant = "viewer"/);
  assert.match(markerSource, /data-marker-intent=\{markerIntent\}/);
  assert.match(markerSource, /data-draft-changed=\{draftChanged \|\| undefined\}/);
  assert.match(markerSource, /bg-\[var\(--admin-marker-unavailable-surface\)\]/);
  assert.match(markerSource, /bg-\[var\(--admin-marker-available-surface\)\]/);
  assert.doesNotMatch(markerSource, /bg-\[#(?:E8E2DA|F9F5ED)\]\/(?:92|86)/);
  assert.match(markerSource, /border-\[var\(--admin-marker-selected-border\)\] bg-\[var\(--admin-marker-selected-surface\)\]/);
  assert.match(markerSource, /searchSelected[\s\S]*ring-\[var\(--admin-marker-selected-border\)\]/);
  assert.match(markerSource, /draftChanged && !selected && !searchProminent[\s\S]*--admin-marker-draft-surface/);
  assert.match(markerSource, /aria-pressed=\{selected\}/);
  assert.match(markerSource, /Draft changed\./);
  assert.match(markerSource, /Search result\./);
  assert.match(markerSource, /Selected\./);

  // 17-state taxonomy port (SxS verdict): mode-target states are token-driven with
  // per-state aria strings; the swap target is teal, never neutral.
  assert.match(markerSource, /const moveOrigin = isMovable && !dragging/);
  assert.match(markerSource, /const swapCandidate = canEdit && swapMode && !swapSource && !swapTarget && !invalidTarget/);
  assert.match(markerSource, /--admin-marker-move-origin-surface/);
  assert.match(markerSource, /--admin-marker-target-valid-surface/);
  assert.match(markerSource, /--admin-marker-target-invalid-surface/);
  assert.match(markerSource, /--admin-marker-target-invalid-accent/);
  assert.match(markerSource, /swapTarget \? adminMarker \? "border-\[var\(--admin-marker-search-border\)\]/);
  assert.match(markerSource, /Move origin\. Drag to reposition\./);
  assert.match(markerSource, /Swap source\./);
  assert.match(markerSource, /Swap target\./);
  assert.match(markerSource, /Valid swap target\./);
  assert.match(markerSource, /Not a valid target\./);

  assert.match(seatMapSource, /const draftChangedSeatLabelSet = useMemo\(\(\) => new Set\(/);
  assert.match(seatMapSource, /\.\.\.publishSummary\.addedSeats/);
  assert.match(seatMapSource, /\.\.\.publishSummary\.assignmentChanges/);
  assert.match(seatMapSource, /\.\.\.publishSummary\.vacatedSeats/);
  assert.match(seatMapSource, /\.\.\.publishSummary\.seatMoves/);
  assert.match(seatMapSource, /\.\.\.publishSummary\.statusChanges/);
  assert.match(seatMapSource, /\.\.\.publishSummary\.otherChanges/);
  assert.match(seatMapSource, /draftChanged=\{draftChangedSeatLabelSet\.has\(seat\.label\)\}/);
  // Owner preference: admin map adopts the viewer marker pills (passes viewer variant).
  assert.match(seatMapSource, /variant="viewer"/);
});

test("desktop marker system protects show-names and long-name rendering", async () => {
  const markerSource = await readSource("../components/seat-map/SeatMarker.tsx");

  assert.match(markerSource, /namesVisible = showNames && hasEmployee && !dimmed/);
  assert.match(markerSource, /getPassiveEmployeeLabel/);
  // Design change: marker names go through formatDisplayName(...) instead of .toUpperCase().
  // The label-selection logic is unchanged — expanded/standard-density names show the full
  // (now formatted) name; everything else falls back to the compact passive label.
  assert.match(markerSource, /inlineNameLabel = expandedNameBadge \|\| \(namesVisible && tokenDensity === "standard" && !compactNameLabel\) \? formatDisplayName\(employeeName\) : compactEmployeeName/);
  assert.doesNotMatch(markerSource, /employeeName\.toUpperCase\(\)/);
  assert.match(markerSource, /showInlineName = Boolean\(employeeName\) && \(namesVisible \|\| activeMarker \|\| searchProminent \|\| plannerHighlighted\)/);
  assert.match(markerSource, /truncate font-bold/);
  assert.match(markerSource, /max-w-\[94px\]/);
  assert.match(markerSource, /max-w-\[86px\]/);
  assert.match(markerSource, /group-hover:max-w-\[96px\]/);
  assert.doesNotMatch(markerSource, /whitespace-pre|break-all|overflow-hidden text-clip/);
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
