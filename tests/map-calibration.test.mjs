import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

// Behavioural calibration coverage. The sibling *-source test pins the transform
// constants as literal text; this file instead asserts what those constants are
// FOR — that a seat's saved coordinate projects onto the chair it labels in the
// shipped floor-plan render. A refit that improves alignment should update the
// source pin and keep these assertions passing.
//
// CHAIR_CENTRE_X below are measured off the shipped asset
// (public/images/office-floor-plan.webp, 3822x1734) by scanning each chair row
// for warm high-luminance pixels — the cream chair pads against the blue-grey
// floor — and taking each pad run's midpoint. Re-measure only if the floor-plan
// artwork is re-rendered.
//
// KNOWN GAP — these values are NOT reproducible from the paragraph above, so
// treat them as a fixed baseline rather than something to re-derive casually.
// The script that produced them was scratch and is gone; the description omits
// the thresholds, window size and warmth/luminance formulas, and those decide
// the answer at the 1-2px level this file asserts on. A 2026-07-21 sweep of
// 1082 viable parameter combinations of the described method got no closer
// than 0.84px mean / 2.15px worst-case against these numbers — the worst case
// exceeding this file's own 2px tolerance. (Measured on the webp; the 1911x867
// master PNG is worse at 3.60px, which does confirm the webp provenance above.
// The refit harness's other detector — a down-biased darkness-weighted
// centroid — disagrees by up to 7px and finds nothing at all for NE03.)
//
// The three consequences that header used to list have now been acted on, and
// the Y assertions below are the result:
//   1. Budget for it — the 2px X tolerance is roughly the measurement noise
//      floor, so Y is asserted at 5px instead: comfortably above the floor and
//      still decisive against the failure mode this file exists for (#178/#179
//      were 10-17px, and the current transform's worst Y error is 2.9px).
//   2. Commit the generator first — done. `scripts/measure-chair-centres.mjs`
//      produces CHAIR_CENTRE_Y below and documents its method precisely enough
//      to re-run; `sharp` is now a declared devDependency rather than a
//      transitive one. Re-run it if the floor-plan artwork is re-rendered.
//   3. Assert Y — done below, which is what closes the #178/#179 blind spot.
//
// CHAIR_CENTRE_X and CHAIR_CENTRE_Y come from DIFFERENT measurement methods, and
// that is deliberate. The generator's X output disagrees with the committed
// CHAIR_CENTRE_X by up to 6.5px (NE05), because it reports the seat pad's
// centroid while the lost script reported something slightly left of it. The
// calibration was FIT to the X numbers below, so replacing them with the
// generator's would not improve alignment — it would just move the target and
// break a fit that is demonstrably good to 0.8px. Keep X as the historical
// baseline; do NOT "correct" it from the generator's output.
//
// SAVED_X are the coordinates in the live published layer. They differ from
// supabase/migrations/002_seed_initial_data.sql for the NE right quad, whose
// seats were hand-dragged in production; the calibration must fit the live
// values, so re-capture these if those seats are ever moved again.

function transpile(source) {
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Bundler
    }
  }).outputText;
}

function toDataUrl(code) {
  return `data:text/javascript;base64,${Buffer.from(code, "utf8").toString("base64")}`;
}

// mapLayoutTransform imports a runtime helper via the "@/lib/..." alias, which a
// data: URL module cannot resolve. Inline the dependency as a nested data URL.
async function importMapLayoutTransform() {
  const seatMathUrl = toDataUrl(
    transpile(await readFile(new URL("../lib/seatMath.ts", import.meta.url), "utf8"))
  );
  const source = await readFile(new URL("../lib/mapLayoutTransform.ts", import.meta.url), "utf8");
  return import(toDataUrl(transpile(source).replace("@/lib/seatMath", seatMathUrl)));
}

const { savedPointToVisualPoint } = await importMapLayoutTransform();

// Normalized x of each chair pad's centre in the rendered plan.
const CHAIR_CENTRE_X = {
  NE01: 0.7320,
  NE02: 0.7889,
  NE03: 0.8187,
  NE04: 0.8752,
  NE05: 0.7303,
  NE06: 0.7884,
  NE07: 0.8197,
  NE08: 0.8744
};

// Normalized y of each chair pad's centre, measured by
// scripts/measure-chair-centres.mjs (run it to reproduce these exactly). Each
// row is internally consistent to 0.4px, which is the check that the detector
// is measuring the pads and not something adjacent: the four chairs in a row are
// physically aligned, so a detector that wandered onto a desk or an armrest
// would not return four matching values.
const CHAIR_CENTRE_Y = {
  NE01: 0.0819,
  NE02: 0.0823,
  NE03: 0.0820,
  NE04: 0.0822,
  NE05: 0.1576,
  NE06: 0.1573,
  NE07: 0.1578,
  NE08: 0.1574
};

// Saved coordinates in the live published layer.
const SAVED = {
  NE01: { x: 0.771941, y: 0.06746 },
  NE02: { x: 0.832159, y: 0.06746 },
  NE03: { x: 0.866266, y: 0.066037 },
  NE04: { x: 0.922105, y: 0.067196 },
  NE05: { x: 0.770019, y: 0.142857 },
  NE06: { x: 0.831518, y: 0.142857 },
  NE07: { x: 0.867847, y: 0.14603 },
  NE08: { x: 0.922105, y: 0.142551 }
};

// The canonical plan master is 1911px wide; express tolerances in those pixels
// so a failure reads as a visible distance rather than a normalized fraction.
const PLAN_WIDTH_PX = 1911;
const PLAN_HEIGHT_PX = 867;
const TOLERANCE_PX = 2;
// Y sits above the noise floor of its own measurement — see the header.
const TOLERANCE_Y_PX = 5;

function visualPoint(label) {
  const seat = { ...SAVED[label], label, zone: "Northeast Pod" };
  return savedPointToVisualPoint({ x: seat.x, y: seat.y }, seat);
}

function offsetPx(label) {
  return (visualPoint(label).x - CHAIR_CENTRE_X[label]) * PLAN_WIDTH_PX;
}

function offsetYPx(label) {
  return (visualPoint(label).y - CHAIR_CENTRE_Y[label]) * PLAN_HEIGHT_PX;
}

for (const label of Object.keys(SAVED)) {
  test(`${label} projects onto its chair within ${TOLERANCE_PX}px of the plan`, () => {
    const offset = offsetPx(label);
    assert.ok(
      Math.abs(offset) <= TOLERANCE_PX,
      `${label} renders ${offset.toFixed(1)}px from its chair centre (limit ${TOLERANCE_PX}px)`
    );
  });
}

// The assertions #178/#179 needed. That bug moved seats VERTICALLY by 10-17px
// while every X assertion above stayed green.
for (const label of Object.keys(SAVED)) {
  test(`${label} projects onto its chair within ${TOLERANCE_Y_PX}px vertically`, () => {
    const offset = offsetYPx(label);
    assert.ok(
      Math.abs(offset) <= TOLERANCE_Y_PX,
      `${label} renders ${offset.toFixed(1)}px above/below its chair centre (limit ${TOLERANCE_Y_PX}px)`
    );
  });
}

test("both Northeast chair rows stay level", () => {
  // A per-area calibration that tilted would keep each seat inside the vertical
  // tolerance for a while but pull the row apart. The chairs are physically in
  // line, so their projections must be too.
  for (const row of [["NE01", "NE02", "NE03", "NE04"], ["NE05", "NE06", "NE07", "NE08"]]) {
    const projected = row.map(label => visualPoint(label).y * PLAN_HEIGHT_PX);
    const spread = Math.max(...projected) - Math.min(...projected);
    assert.ok(spread <= TOLERANCE_Y_PX, `${row[0]}-${row[3]} project across ${spread.toFixed(1)}px of vertical spread`);
  }
});

test("both Northeast quads agree on chair spacing", () => {
  // The pod repeats the same desk unit twice. If the two per-quad fits disagree,
  // one of them is fitted to its bounds rectangle rather than to the chairs —
  // the failure mode that put NE04/NE08 on bare floor.
  const leftSpan = offsetPx("NE02") - offsetPx("NE01");
  const rightSpan = offsetPx("NE04") - offsetPx("NE03");
  assert.ok(
    Math.abs(leftSpan - rightSpan) <= TOLERANCE_PX,
    `quad spacing differs by ${(leftSpan - rightSpan).toFixed(1)}px`
  );
});
