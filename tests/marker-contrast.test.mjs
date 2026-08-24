import assert from "node:assert/strict";
import test from "node:test";
import { measure, VOCABULARY } from "../scripts/marker-contrast.mjs";

// PR-C guard: the two-axis marker vocabulary, measured from the real
// globals.css. Sits alongside the other palette scripts (zone-completeness,
// css-dangling-refs, css-resolved-map) — this is the one wired into the
// test run, because a single token edit can put a mark under its floor or
// collapse a state pair back to hue.

test("every marker mark clears its contrast floor on the HOVERED surface, both themes", () => {
  const { failures, checks } = measure();
  assert.deepEqual(failures, []);
  // The measurement actually ran (16 floor checks per theme).
  assert.equal(checks.length, 32);
  assert.ok(checks.every(check => check.theme === "light" || check.theme === "dark"));
});

test("pairwise frame: all 36 state pairs differ on a non-hue channel", () => {
  const { pairwise } = measure();
  assert.equal(pairwise.length, 36);
  for (const { pair, channels } of pairwise) {
    assert.ok(channels.length > 0, `${pair} is distinguishable by hue alone`);
  }
});

test("the ruled vocabulary mapping itself cannot drift", () => {
  // Owner ruling 2026-08-24 (PR-C): fill = availability, glyph = reason.
  assert.deepEqual(VOCABULARY.available, { fillAxis: "hollow", glyph: "none", geometry: "resting" });
  assert.deepEqual(VOCABULARY.reserved, { fillAxis: "hollow", glyph: "dot", geometry: "resting" });
  assert.deepEqual(VOCABULARY.assigned, { fillAxis: "solid", glyph: "dot", geometry: "resting" });
  assert.deepEqual(VOCABULARY.unavailable, { fillAxis: "hatched", glyph: "none", geometry: "resting" });
  assert.equal(VOCABULARY["target-valid"].glyph, "check");
  assert.equal(VOCABULARY["target-invalid"].glyph, "cross");
  // Change 2: target modes preserve the underlying fill.
  assert.equal(VOCABULARY["target-valid"].fillAxis, "underlying");
  assert.equal(VOCABULARY["target-invalid"].fillAxis, "underlying");
});
