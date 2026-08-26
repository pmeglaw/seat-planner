import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// X-03: the CI verify job's sequence (lint → typecheck → coverage:check →
// build) existed only as prose, so "run what CI runs" depended on remembering
// it. `npm run gate` is the single-command local version. These pins keep the
// script and the workflow from drifting apart — if verify gains or reorders a
// step, this fails and the gate must be updated deliberately.
//
// `build` is deliberately NOT in the gate: it is the slowest step and the one
// least likely to fail when the other three pass; CI still runs it on every PR.

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const ciWorkflow = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");

test("the gate script runs the CI verify sequence, in order, minus build", () => {
  assert.equal(
    packageJson.scripts.gate,
    "npm run lint && npm run typecheck && npm run coverage:check",
    "gate must chain lint → typecheck → coverage:check with && so a failure stops the chain"
  );
});

test("the CI verify job still runs the same steps the gate mirrors", () => {
  const lintIndex = ciWorkflow.indexOf("run: npm run lint");
  const typecheckIndex = ciWorkflow.indexOf("run: npm run typecheck");
  const coverageIndex = ciWorkflow.indexOf("run: npm run coverage:check");
  const buildIndex = ciWorkflow.indexOf("run: npm run build");

  for (const [name, index] of [
    ["lint", lintIndex],
    ["typecheck", typecheckIndex],
    ["coverage:check", coverageIndex],
    ["build", buildIndex]
  ]) {
    assert.notEqual(index, -1, `CI verify should run npm run ${name}`);
  }
  assert.ok(
    lintIndex < typecheckIndex && typecheckIndex < coverageIndex && coverageIndex < buildIndex,
    "CI verify order changed — update npm run gate to match, then these pins"
  );
});
