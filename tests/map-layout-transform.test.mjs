import test from "node:test";
import assert from "node:assert/strict";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";

// lib/mapLayoutTransform.ts holds the per-area calibration math that maps saved
// normalized coordinates to on-image visual coordinates. Coordinates are a
// top bug source (CLAUDE.md), yet the only prior coverage was a source test
// asserting the constant literals were unchanged — nothing checked the math.
const {
  MAP_IMAGE_WIDTH,
  MAP_IMAGE_HEIGHT,
  MAP_ASPECT_RATIO,
  savedPointToVisualPoint,
  visualPointToSavedPoint,
  seatToVisualSeat,
  seatsToVisualSeats
} = await importTsModule("lib/mapLayoutTransform.ts");

const inRange = value => value >= 0 && value <= 1;

// A seat that sits inside the north-pod calibration area (by zone and by the
// "N" label prefix), well within its saved bounds.
const northSeat = { id: "s-n01", label: "N01", zone: "north pod", status: "assigned", x: 0.35, y: 0.12 };

test("map image constants are exposed as runtime values", () => {
  assert.equal(MAP_IMAGE_WIDTH, 3822);
  assert.equal(MAP_IMAGE_HEIGHT, 1734);
  assert.equal(MAP_ASPECT_RATIO, 3822 / 1734);
});

test("without a source, points use the default preview transform", () => {
  // 0.5 * 0.92 + 0.05 = 0.51 ; 0.5 * 1.04 + 0.016 = 0.536
  assert.deepEqual(savedPointToVisualPoint({ x: 0.5, y: 0.5 }), { x: 0.51, y: 0.536 });
});

test("visual points are always clamped to the normalized range", () => {
  const clamped = savedPointToVisualPoint({ x: 1, y: 1 });
  assert.equal(clamped.x, 0.97); // 1 * 0.92 + 0.05
  assert.equal(clamped.y, 1); // 1 * 1.04 + 0.016 = 1.056 -> clamped
  assert.ok(inRange(clamped.x) && inRange(clamped.y));
});

test("a calibrated area produces a different point than the default transform", () => {
  const withArea = savedPointToVisualPoint({ x: northSeat.x, y: northSeat.y }, northSeat);
  const withoutArea = savedPointToVisualPoint({ x: northSeat.x, y: northSeat.y });
  assert.notDeepEqual(withArea, withoutArea);
  assert.ok(inRange(withArea.x) && inRange(withArea.y));
});

test("area selection also works from the label prefix alone (no zone)", () => {
  const byLabel = savedPointToVisualPoint({ x: northSeat.x, y: northSeat.y }, { label: "N01", x: northSeat.x, y: northSeat.y });
  const byZone = savedPointToVisualPoint({ x: northSeat.x, y: northSeat.y }, northSeat);
  assert.deepEqual(byLabel, byZone);
});

test("saved -> visual -> saved round-trips within rounding tolerance", () => {
  const visual = savedPointToVisualPoint({ x: northSeat.x, y: northSeat.y }, northSeat);
  const restored = visualPointToSavedPoint(visual, { source: northSeat });
  assert.ok(Math.abs(restored.x - northSeat.x) < 1e-5, `x drifted: ${restored.x}`);
  assert.ok(Math.abs(restored.y - northSeat.y) < 1e-5, `y drifted: ${restored.y}`);
});

test("seatToVisualSeat rewrites only the coordinates and preserves other fields", () => {
  const visual = seatToVisualSeat(northSeat);
  const expected = savedPointToVisualPoint({ x: northSeat.x, y: northSeat.y }, northSeat);
  assert.equal(visual.x, expected.x);
  assert.equal(visual.y, expected.y);
  assert.equal(visual.id, "s-n01");
  assert.equal(visual.label, "N01");
  assert.equal(visual.zone, "north pod");
  assert.equal(visual.status, "assigned");
});

test("seatsToVisualSeats maps every seat", () => {
  const other = { id: "s-e01", label: "E01", zone: "east pod", x: 0.6, y: 0.4 };
  const visual = seatsToVisualSeats([northSeat, other]);
  assert.equal(visual.length, 2);
  assert.deepEqual(visual[0], seatToVisualSeat(northSeat));
  assert.deepEqual(visual[1], seatToVisualSeat(other));
});
