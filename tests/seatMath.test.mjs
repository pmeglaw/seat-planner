import test from "node:test";
import assert from "node:assert/strict";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";

// Exercises the REAL lib/seatMath.ts (previously this file re-implemented
// clamp/roundCoordinate inline, so the shipped module was never executed).
const {
  clamp,
  roundCoordinate,
  normalizePoint,
  coordinateToPercent,
  pointToStyle,
  clientPointToNormalized
} = await importTsModule("lib/seatMath.ts");

test("clamp keeps values inside the normalized range and defaults NaN to min", () => {
  assert.equal(clamp(-3), 0);
  assert.equal(clamp(5), 1);
  assert.equal(clamp(0.5), 0.5);
  assert.equal(clamp(Number.NaN), 0);
  assert.equal(clamp(50, 0, 100), 50);
});

test("roundCoordinate clamps coordinates to normalized range", () => {
  assert.equal(roundCoordinate(-1), 0);
  assert.equal(roundCoordinate(2), 1);
  assert.equal(roundCoordinate(0.1234567), 0.123457);
});

test("coordinate percentages stay stable", () => {
  assert.equal(`${roundCoordinate(0.42) * 100}%`, "42%");
  assert.equal(coordinateToPercent(0.42), "42%");
  assert.equal(coordinateToPercent(2), "100%");
});

test("normalizePoint clamps and rounds both axes", () => {
  assert.deepEqual(normalizePoint({ x: 2, y: -1 }), { x: 1, y: 0 });
  assert.deepEqual(normalizePoint({ x: 0.1234567, y: 0.7654321 }), { x: 0.123457, y: 0.765432 });
});

test("pointToStyle produces CSS left/top percentages", () => {
  assert.deepEqual(pointToStyle({ x: 0.25, y: 0.5 }), { left: "25%", top: "50%" });
});

test("clientPointToNormalized maps client coordinates through bounds and clamps overflow", () => {
  const bounds = { left: 0, top: 0, width: 200, height: 100 };
  assert.deepEqual(clientPointToNormalized(50, 50, bounds), { x: 0.25, y: 0.5 });
  // Points outside the element clamp back into [0, 1].
  assert.deepEqual(clientPointToNormalized(-40, 400, bounds), { x: 0, y: 1 });
});
