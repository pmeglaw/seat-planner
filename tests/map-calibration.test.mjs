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
const TOLERANCE_PX = 2;

function offsetPx(label) {
  const seat = { ...SAVED[label], label, zone: "Northeast Pod" };
  const visual = savedPointToVisualPoint({ x: seat.x, y: seat.y }, seat);
  return (visual.x - CHAIR_CENTRE_X[label]) * PLAN_WIDTH_PX;
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
