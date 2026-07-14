import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

// mapLayoutTransform has a runtime import of lib/seatMath, so transpile that
// first and rewrite the "@/lib/seatMath" specifier to its data URL before
// transpiling the transform itself (type-only imports erase on their own).
function transpile(source) {
  return ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
  }).outputText;
}

function toDataUrl(js) {
  return `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`;
}

async function readSource(relativePath) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const seatMathUrl = toDataUrl(transpile(await readSource("lib/seatMath.ts")));
const transformSource = (await readSource("lib/mapLayoutTransform.ts")).replace('"@/lib/seatMath"', JSON.stringify(seatMathUrl));
const transform = await import(toDataUrl(transpile(transformSource)));

// One representative saved point per calibration area (savedBounds centers
// with the matching zone), plus an uncalibrated fallback point.
const SAMPLES = [
  { zone: "North Pod", label: "N05", x: 0.375, y: 0.145 },
  { zone: "Northeast Pod", label: "NE05", x: 0.784, y: 0.115 },
  { zone: "Northeast Pod", label: "NE07", x: 0.909, y: 0.115 },
  { zone: "West Pod", label: "W05", x: 0.135, y: 0.56 },
  { zone: "Center West", label: "CW02", x: 0.32, y: 0.41 },
  { zone: "Center West", label: "CW07", x: 0.32, y: 0.63 },
  { zone: "Center Desks", label: "C03", x: 0.505, y: 0.61 },
  { zone: "East Pod", label: "E04", x: 0.675, y: 0.42 },
  { zone: "Southeast Office", label: "SE01", x: 0.905, y: 0.555 },
  { zone: "Southeast Office", label: "SE03", x: 0.92, y: 0.625 }
];

test("saved-to-visual-to-saved round-trips through the v3 remap in every area", () => {
  for (const sample of SAMPLES) {
    const source = { x: sample.x, y: sample.y, zone: sample.zone, label: sample.label };
    const visual = transform.savedPointToVisualPoint({ x: sample.x, y: sample.y }, source);
    const roundTripped = transform.visualPointToSavedPoint(visual, { source });
    assert.ok(Math.abs(roundTripped.x - sample.x) <= 2e-6, `${sample.label}: x ${sample.x} -> ${roundTripped.x}`);
    assert.ok(Math.abs(roundTripped.y - sample.y) <= 2e-6, `${sample.label}: y ${sample.y} -> ${roundTripped.y}`);
  }
});

test("visual points land inside the v3 image's content region", () => {
  // The v3 asset keeps 12px margins each side (12/1695 ≈ 0.0071); every
  // calibrated seat must render inside the plan, never in the margins or
  // clamped to an edge.
  for (const sample of SAMPLES) {
    const visual = transform.savedPointToVisualPoint({ x: sample.x, y: sample.y }, sample);
    assert.ok(visual.x > 0.0071 && visual.x < 0.9929, `${sample.label}: visual x ${visual.x}`);
    assert.ok(visual.y > 0 && visual.y < 1, `${sample.label}: visual y ${visual.y}`);
  }
});

test("uncalibrated fallback path round-trips through the v3 remap too", () => {
  const point = { x: 0.5, y: 0.5 };
  const visual = transform.savedPointToVisualPoint(point);
  const roundTripped = transform.visualPointToSavedPoint(visual);
  assert.ok(Math.abs(roundTripped.x - point.x) <= 2e-6, `fallback x -> ${roundTripped.x}`);
  assert.ok(Math.abs(roundTripped.y - point.y) <= 2e-6, `fallback y -> ${roundTripped.y}`);
});
