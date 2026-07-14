import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function importTsModule(relativePath) {
  const source = await readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022
    }
  });
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString("base64")}`;
  return import(moduleUrl);
}

const {
  CODE_PILL_CLEARANCE_PX,
  CODE_PILL_DEFAULT_CLEARANCE,
  clearanceFromScale,
  computeCrowdedSeatIds
} = await importTsModule("lib/seatCrowding.ts");

test("adjacent seats inside the clearance box are both flagged", () => {
  const seats = [
    { id: "cw05", x: 0.35, y: 0.62 },
    { id: "cw06", x: 0.382, y: 0.62 }, // 0.032 pitch — the tightest real pod
    { id: "e01", x: 0.62, y: 0.42 } // far away from both
  ];
  const crowded = computeCrowdedSeatIds(seats, { x: 0.044, y: 0.024 });
  assert.deepEqual([...crowded].sort(), ["cw05", "cw06"]);
});

test("seats aligned on x but vertically separated are not crowded", () => {
  const seats = [
    { id: "n01", x: 0.3, y: 0.2 },
    { id: "n05", x: 0.3, y: 0.26 } // same column, next row — pills stack fine
  ];
  assert.equal(computeCrowdedSeatIds(seats, { x: 0.044, y: 0.024 }).size, 0);
});

test("clearance shrinks as the render scale grows, uncrowding zoomed-in pods", () => {
  const seats = [
    { id: "a", x: 0.5, y: 0.5 },
    { id: "b", x: 0.532, y: 0.5 }
  ];
  // Fit zoom (~1060px per normalized unit): 0.032 pitch < 48px clearance → crowded.
  const atFit = computeCrowdedSeatIds(seats, clearanceFromScale(1060));
  assert.equal(atFit.size, 2);
  // Zoomed to ~150% (1600px per unit): 0.032 * 1600 = 51px > 48px → clear.
  const zoomed = computeCrowdedSeatIds(seats, clearanceFromScale(1600));
  assert.equal(zoomed.size, 0);
});

test("clearanceFromScale converts px clearance and falls back on degenerate scales", () => {
  const converted = clearanceFromScale(1000);
  assert.equal(converted.x, CODE_PILL_CLEARANCE_PX.x / 1000);
  assert.equal(converted.y, CODE_PILL_CLEARANCE_PX.y / 1000);
  assert.deepEqual(clearanceFromScale(0), CODE_PILL_DEFAULT_CLEARANCE);
  assert.deepEqual(clearanceFromScale(Number.NaN), CODE_PILL_DEFAULT_CLEARANCE);
  assert.deepEqual(clearanceFromScale(-5), CODE_PILL_DEFAULT_CLEARANCE);
});

test("empty and single-seat inputs return an empty set", () => {
  assert.equal(computeCrowdedSeatIds([]).size, 0);
  assert.equal(computeCrowdedSeatIds([{ id: "solo", x: 0.5, y: 0.5 }]).size, 0);
});
