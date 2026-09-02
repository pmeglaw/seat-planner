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

// ---- Fallback area selection (a seat that matches no calibration area exactly)

// A seat whose zone/label say "north pod" but whose coordinates have drifted
// outside every saved bounds. Area selection must stay with the zone's
// calibration (affinity beats proximity) — silently switching transforms is
// how a drifted seat renders in the wrong pod.
const strayNorthSeat = { id: "s-n99", label: "N99", zone: "north pod", x: 0.6, y: 0.55 };
const probePoint = { x: 0.45, y: 0.15 };

test("fallback: an out-of-bounds seat with a matching zone keeps that zone's calibration", () => {
  const exact = savedPointToVisualPoint(probePoint, northSeat);
  const viaFallback = savedPointToVisualPoint(probePoint, strayNorthSeat);
  assert.deepEqual(viaFallback, exact);
});

test("fallback: label-prefix affinity alone still selects the zone's calibration", () => {
  const exact = savedPointToVisualPoint(probePoint, northSeat);
  const viaLabel = savedPointToVisualPoint(probePoint, { label: "N77", zone: "mystery pod", x: 0.6, y: 0.55 });
  assert.deepEqual(viaLabel, exact);
});

test("fallback: zone affinity outranks label-prefix affinity when they disagree", () => {
  const westSeat = { id: "s-w01", label: "W01", zone: "west pod", x: 0.1, y: 0.5 };
  const exactWest = savedPointToVisualPoint(probePoint, westSeat);
  // Label says north ("N"), zone says west — the zone must win.
  const conflicted = savedPointToVisualPoint(probePoint, { label: "N05", zone: "west pod", x: 0.6, y: 0.9 });
  assert.deepEqual(conflicted, exactWest);
});

test("fallback: with no zone or label affinity, the nearest saved bounds win", () => {
  const westSeat = { id: "s-w01", label: "W01", zone: "west pod", x: 0.1, y: 0.5 };
  const exactWest = savedPointToVisualPoint(probePoint, westSeat);
  // Unknown zone and prefix; the point sits inside west-pod's saved bounds.
  const unknown = savedPointToVisualPoint(probePoint, { label: "X01", zone: "annex", x: 0.05, y: 0.4 });
  assert.deepEqual(unknown, exactWest);
});

// ---- Visual-side selection (inspector nudges: no saved source, only context)

test("visual selection: zone context with an in-bounds point matches the source-based inverse", () => {
  const visualPoint = { x: 0.4, y: 0.1 }; // inside north-pod's visual bounds
  const bySource = visualPointToSavedPoint(visualPoint, { source: northSeat });
  const byContext = visualPointToSavedPoint(visualPoint, { zone: "north pod", label: "N01" });
  assert.deepEqual(byContext, bySource);
});

test("visual selection: an out-of-visual-bounds point still follows zone affinity", () => {
  const farPoint = { x: 0.95, y: 0.95 };
  const bySource = visualPointToSavedPoint(farPoint, { source: northSeat });
  const byContext = visualPointToSavedPoint(farPoint, { zone: "north pod", label: null });
  assert.deepEqual(byContext, bySource);
});

test("visual selection: no source, zone, or label falls back to the default preview transform", () => {
  const visual = savedPointToVisualPoint({ x: 0.5, y: 0.5 });
  const restored = visualPointToSavedPoint(visual, {});
  assert.ok(Math.abs(restored.x - 0.5) < 1e-5);
  assert.ok(Math.abs(restored.y - 0.5) < 1e-5);
});

// ---- Per-floor dispatch (multi-floor PR-2, approach A): the floor-3
// calibration is untouched; a floor with no geometry yet resolves to identity.

test("floor dispatch: a floor-3 seat resolves exactly as a seat that carries no floor", () => {
  const withFloor = savedPointToVisualPoint({ x: northSeat.x, y: northSeat.y }, { ...northSeat, floor: "3" });
  const without = savedPointToVisualPoint({ x: northSeat.x, y: northSeat.y }, northSeat);
  assert.deepEqual(withFloor, without);
});

test("floor dispatch: a floor-2 seat never borrows floor-3 calibration — it round-trips through identity", () => {
  const source = { ...northSeat, floor: "2" };
  const visual = savedPointToVisualPoint({ x: northSeat.x, y: northSeat.y }, source);
  assert.deepEqual(visual, { x: northSeat.x, y: northSeat.y });
  const restored = visualPointToSavedPoint(visual, { source });
  assert.deepEqual(restored, { x: northSeat.x, y: northSeat.y });
  const byContext = visualPointToSavedPoint(visual, { zone: "north pod", label: "N01", floor: "2" });
  assert.deepEqual(byContext, { x: northSeat.x, y: northSeat.y });
});

test("floor dispatch: seatsToVisualSeats handles a mixed-floor array per seat", () => {
  const [three, two] = seatsToVisualSeats([{ ...northSeat, floor: "3" }, { ...northSeat, id: "s-l01", label: "L01", zone: "somewhere", floor: "2" }]);
  assert.notDeepEqual({ x: three.x, y: three.y }, { x: northSeat.x, y: northSeat.y });
  assert.deepEqual({ x: two.x, y: two.y }, { x: northSeat.x, y: northSeat.y });
});
