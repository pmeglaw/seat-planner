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
  computeCrowdedSeatIds,
  computeSeatDensityTiers,
  computeNameLabelNudges
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

test("computeSeatDensityTiers flags a tight pitch as both crowded and dense", () => {
  const seats = [
    { id: "a", x: 0.5, y: 0.5 },
    { id: "b", x: 0.52, y: 0.5 } // 0.02 pitch — well inside dense (0.6x) clearance
  ];
  const tiers = computeSeatDensityTiers(seats);
  assert.deepEqual([...tiers.crowded].sort(), ["a", "b"]);
  assert.deepEqual([...tiers.dense].sort(), ["a", "b"]);
});

test("computeSeatDensityTiers flags a looser pitch as crowded only, not dense", () => {
  const seats = [
    { id: "a", x: 0.5, y: 0.5 },
    { id: "b", x: 0.535, y: 0.5 } // 0.035 pitch — inside crowded clearance, outside 0.6x dense clearance
  ];
  const tiers = computeSeatDensityTiers(seats);
  assert.deepEqual([...tiers.crowded].sort(), ["a", "b"]);
  assert.equal(tiers.dense.size, 0);
});

test("computeSeatDensityTiers dense set is always a subset of crowded", () => {
  const seats = [
    { id: "a", x: 0.5, y: 0.5 },
    { id: "b", x: 0.52, y: 0.5 },
    { id: "c", x: 0.8, y: 0.1 }
  ];
  const tiers = computeSeatDensityTiers(seats);
  for (const id of tiers.dense) {
    assert.ok(tiers.crowded.has(id), `${id} is dense but not crowded`);
  }
});

test("computeSeatDensityTiers honors an explicit clearance override", () => {
  const seats = [
    { id: "a", x: 0.5, y: 0.5 },
    { id: "b", x: 0.6, y: 0.5 }
  ];
  // Not crowded under the default clearance...
  assert.equal(computeSeatDensityTiers(seats).crowded.size, 0);
  // ...but crowded (and dense) under a wide explicit clearance.
  const wide = computeSeatDensityTiers(seats, { x: 0.2, y: 0.2 });
  assert.deepEqual([...wide.crowded].sort(), ["a", "b"]);
  assert.deepEqual([...wide.dense].sort(), ["a", "b"]);
});

test("computeNameLabelNudges gives two colliding named seats distinct nudges", () => {
  const seats = [
    { id: "a", x: 0.5, y: 0.5 },
    { id: "b", x: 0.52, y: 0.5 } // within default clearance
  ];
  const nudges = computeNameLabelNudges(seats, new Set(["a", "b"]), CODE_PILL_DEFAULT_CLEARANCE);
  const nudgeA = nudges.get("a");
  const nudgeB = nudges.get("b");
  assert.notEqual(nudgeA, nudgeB);
  assert.ok([nudgeA, nudgeB].includes(0));
  const other = nudgeA === 0 ? nudgeB : nudgeA;
  assert.ok([-1, 1].includes(other));
});

test("computeNameLabelNudges gives three colliding named seats in a row pairwise-distinct nudges", () => {
  const seats = [
    { id: "a", x: 0.5, y: 0.5 },
    { id: "b", x: 0.52, y: 0.5 },
    { id: "c", x: 0.54, y: 0.5 }
  ];
  const nudges = computeNameLabelNudges(seats, new Set(["a", "b", "c"]), CODE_PILL_DEFAULT_CLEARANCE);
  const values = ["a", "b", "c"].map((id) => nudges.get(id));
  assert.equal(new Set(values).size, 3, "expected all three nudges to be pairwise distinct");
  for (const value of values) {
    assert.ok([-1, 0, 1].includes(value));
  }
});

test("computeNameLabelNudges gives 0 to a named seat that only collides with an unnamed seat", () => {
  const seats = [
    { id: "namedSeat", x: 0.5, y: 0.5 },
    { id: "unnamedSeat", x: 0.52, y: 0.5 } // within clearance, but not named
  ];
  const nudges = computeNameLabelNudges(seats, new Set(["namedSeat"]), CODE_PILL_DEFAULT_CLEARANCE);
  assert.equal(nudges.get("namedSeat") ?? 0, 0);
  assert.equal(nudges.has("unnamedSeat"), false);
});

test("computeNameLabelNudges returns an empty map when no seats are named", () => {
  const seats = [
    { id: "a", x: 0.5, y: 0.5 },
    { id: "b", x: 0.52, y: 0.5 }
  ];
  const nudges = computeNameLabelNudges(seats, new Set(), CODE_PILL_DEFAULT_CLEARANCE);
  assert.equal(nudges.size, 0);
});

test("computeNameLabelNudges never mutates the input seats", () => {
  const seats = [
    { id: "a", x: 0.5, y: 0.5 },
    { id: "b", x: 0.52, y: 0.5 }
  ];
  const snapshot = JSON.parse(JSON.stringify(seats));
  computeNameLabelNudges(seats, new Set(["a", "b"]), CODE_PILL_DEFAULT_CLEARANCE);
  assert.deepEqual(seats, snapshot);
});
