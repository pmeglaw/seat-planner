import test from "node:test";
import assert from "node:assert/strict";

function clamp(value, min = 0, max = 1) {
  if (Number.isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function roundCoordinate(value) {
  return Number(clamp(value).toFixed(6));
}

test("roundCoordinate clamps coordinates to normalized range", () => {
  assert.equal(roundCoordinate(-1), 0);
  assert.equal(roundCoordinate(2), 1);
  assert.equal(roundCoordinate(0.1234567), 0.123457);
});

test("coordinate percentages stay stable", () => {
  assert.equal(`${roundCoordinate(0.42) * 100}%`, "42%");
});
