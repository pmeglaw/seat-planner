import assert from "node:assert/strict";
import test from "node:test";

import {
  FRAME_BUDGET_MS,
  missedFrames,
  numericFlag,
  percentile,
  samePath,
  stutterIntervals
} from "../.claude/skills/web-app-performance/scripts/measure-shared.mjs";

// The frame maths behind the web-app-performance skill's interaction tier.
// It is covered here because a wrong answer is worse than no answer: the metric
// exists to tell someone whether a stutter is real, and both plausible-looking
// alternatives to the current implementation get the single most important case
// wrong. Counting intervals rather than frames flattens a 500 ms freeze into the
// same "1" as a brief hiccup, and flooring instead of rounding scores the
// canonical 33.3 ms dropped frame as perfectly smooth.

const B = FRAME_BUDGET_MS;

test("a steady 60 fps stream misses nothing", () => {
  const smooth = Array.from({ length: 60 }, () => 16.7);
  assert.equal(missedFrames(smooth), 0);
  assert.equal(stutterIntervals(smooth), 0);
});

test("one 33.3 ms interval is one missed frame, not zero", () => {
  // The regression that motivates rounding over flooring: 33.3 / 16.667 is
  // 1.998, so Math.floor yields 1 slot and reports zero missed frames.
  assert.equal(missedFrames([33.3]), 1);
  assert.equal(stutterIntervals([33.3]), 1);
});

test("missed frames scale with how long the stall lasted", () => {
  assert.equal(missedFrames([50]), 2);
  assert.equal(missedFrames([100]), 5);
  // A long freeze must not score the same as a brief hiccup — that flattening
  // is what made the first version of this metric understate sustained jank.
  assert.ok(missedFrames([500]) > missedFrames([33.3]) * 10);
});

test("stutter count and missed frames answer different questions", () => {
  const oneLongFreeze = [16.7, 16.7, 100];
  const manySmallHiccups = [33.3, 33.3, 33.3, 33.3, 33.3];

  assert.equal(stutterIntervals(oneLongFreeze), 1);
  assert.equal(missedFrames(oneLongFreeze), 5);

  assert.equal(stutterIntervals(manySmallHiccups), 5);
  assert.equal(missedFrames(manySmallHiccups), 5);
});

test("degenerate intervals never produce negative or NaN counts", () => {
  for (const intervals of [[], [0], [-5], [Number.NaN], [Number.POSITIVE_INFINITY]]) {
    const missed = missedFrames(intervals);
    assert.ok(Number.isFinite(missed) || intervals[0] === Number.POSITIVE_INFINITY);
    assert.ok(missed >= 0, `expected a non-negative count for ${JSON.stringify(intervals)}`);
  }
  assert.equal(missedFrames([]), 0);
  assert.equal(missedFrames([0]), 0);
  assert.equal(missedFrames([-5]), 0);
  assert.equal(missedFrames([Number.NaN]), 0);
});

test("a custom budget rescales the slot maths", () => {
  // 120 Hz: 8.33 ms is on time, 16.7 ms is one missed frame.
  assert.equal(missedFrames([8.33], B / 2), 0);
  assert.equal(missedFrames([16.7], B / 2), 1);
});

test("percentile returns 0 for an empty set rather than NaN", () => {
  assert.equal(percentile([], 50), 0);
  assert.equal(percentile([], 95), 0);
});

test("percentile picks by nearest rank", () => {
  const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  assert.equal(percentile(values, 50), 6);
  assert.equal(percentile(values, 95), 10);
  assert.equal(percentile([42], 95), 42);
});

test("numericFlag returns the fallback when the flag is absent", () => {
  assert.equal(numericFlag(["--route", "/"], "--runs", { fallback: 5 }), 5);
});

test("numericFlag rejects the values that used to yield a confident all-zero report", () => {
  const cases = [
    { argv: ["--runs", "0"], opts: { fallback: 5, min: 1, integer: true } },
    { argv: ["--runs", "-3"], opts: { fallback: 5, min: 1, integer: true } },
    { argv: ["--runs", "abc"], opts: { fallback: 5, min: 1, integer: true } },
    { argv: ["--runs", "2.5"], opts: { fallback: 5, min: 1, integer: true } },
    { argv: ["--cpu", "0.5"], opts: { fallback: 1, min: 1 } }
  ];
  for (const { argv, opts } of cases) {
    assert.throws(() => numericFlag(argv, argv[0], opts), Error, `expected ${argv.join(" ")} to be rejected`);
  }
});

test("numericFlag rejects a flag given no value", () => {
  // `--runs --cpu 4` must not silently read "--cpu" as the run count.
  assert.throws(() => numericFlag(["--runs", "--cpu", "4"], "--runs", { fallback: 5, min: 1, integer: true }), Error);
  assert.throws(() => numericFlag(["--route", "/", "--runs"], "--runs", { fallback: 5, min: 1 }), Error);
});

test("samePath treats a trailing-slash redirect as the same page", () => {
  assert.ok(samePath("/admin", "/admin/"));
  assert.ok(samePath("/admin/", "/admin"));
  assert.ok(samePath("/", "/"));
  assert.ok(samePath("/admin/management", "/admin/management/"));
});

test("samePath rejects a redirect to a genuinely different page", () => {
  // The mislabelling this guards: reporting /login's numbers under /admin.
  assert.ok(!samePath("/login", "/admin"));
  assert.ok(!samePath("/", "/admin"));
  assert.ok(!samePath("/admin", "/admin/settings"));
  // "/" must not collapse to "" and start matching everything.
  assert.ok(!samePath("/", "/login"));
});

test("numericFlag accepts valid values", () => {
  assert.equal(numericFlag(["--runs", "7"], "--runs", { fallback: 5, min: 1, integer: true }), 7);
  assert.equal(numericFlag(["--cpu", "4"], "--cpu", { fallback: 1, min: 1 }), 4);
  assert.equal(numericFlag(["--cpu", "1.5"], "--cpu", { fallback: 1, min: 1 }), 1.5);
});
