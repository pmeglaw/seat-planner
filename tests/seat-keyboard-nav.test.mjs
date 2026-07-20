import assert from "node:assert/strict";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";
import test from "node:test";
const nav = await importTsModule("lib/seatKeyboardNav.ts");

// A 2x3 grid (pixel-ish coordinates):
//   A(0,0)   B(100,0)   C(200,0)
//   D(0,80)  E(100,80)  F(200,80)
const GRID = [
  { id: "A", x: 0, y: 0 },
  { id: "B", x: 100, y: 0 },
  { id: "C", x: 200, y: 0 },
  { id: "D", x: 0, y: 80 },
  { id: "E", x: 100, y: 80 },
  { id: "F", x: 200, y: 80 }
];

test("arrow navigation walks the grid in all four directions", () => {
  assert.equal(nav.findNearestSeatInDirection(GRID, "A", "right"), "B");
  assert.equal(nav.findNearestSeatInDirection(GRID, "B", "right"), "C");
  assert.equal(nav.findNearestSeatInDirection(GRID, "C", "left"), "B");
  assert.equal(nav.findNearestSeatInDirection(GRID, "A", "down"), "D");
  assert.equal(nav.findNearestSeatInDirection(GRID, "E", "up"), "B");
});

test("arrow navigation stops at the map edge instead of wrapping", () => {
  assert.equal(nav.findNearestSeatInDirection(GRID, "C", "right"), null);
  assert.equal(nav.findNearestSeatInDirection(GRID, "A", "left"), null);
  assert.equal(nav.findNearestSeatInDirection(GRID, "A", "up"), null);
  assert.equal(nav.findNearestSeatInDirection(GRID, "D", "down"), null);
});

test("arrow navigation prefers staying in line over a nearer diagonal seat", () => {
  // Y(150,10) is euclidean-closer to X than Z(220,0), but Z is straight ahead.
  const seats = [
    { id: "X", x: 0, y: 0 },
    { id: "Y", x: 150, y: 60 },
    { id: "Z", x: 220, y: 0 }
  ];
  assert.equal(nav.findNearestSeatInDirection(seats, "X", "right"), "Z");
  // With no in-line candidate the diagonal seat still wins over nothing.
  assert.equal(nav.findNearestSeatInDirection([seats[0], seats[1]], "X", "right"), "Y");
});

test("arrow navigation handles unknown ids and empty maps", () => {
  assert.equal(nav.findNearestSeatInDirection(GRID, "missing", "right"), null);
  assert.equal(nav.findNearestSeatInDirection([], "A", "right"), null);
});

test("roving tab stop prefers the visited seat and falls back to top-left", () => {
  assert.equal(nav.resolveRovingSeatId(GRID, "E"), "E");
  assert.equal(nav.resolveRovingSeatId(GRID, "gone"), "A");
  assert.equal(nav.resolveRovingSeatId(GRID, null), "A");
  assert.equal(nav.resolveRovingSeatId([], "A"), null);
});

test("arrowKeyToDirection maps only arrow keys", () => {
  assert.equal(nav.arrowKeyToDirection("ArrowUp"), "up");
  assert.equal(nav.arrowKeyToDirection("ArrowDown"), "down");
  assert.equal(nav.arrowKeyToDirection("ArrowLeft"), "left");
  assert.equal(nav.arrowKeyToDirection("ArrowRight"), "right");
  assert.equal(nav.arrowKeyToDirection("Enter"), null);
  assert.equal(nav.arrowKeyToDirection("a"), null);
});
