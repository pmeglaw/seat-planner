import assert from "node:assert/strict";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";
import test from "node:test";

const {
  TEXT_TIER_CLEARANCE_PX,
  TEXT_TIER_CODE_PILL_SIZE_PX,
  TEXT_TIER_EXIT_SLACK_PX,
  TEXT_TIER_PILL_GEOMETRY,
  clearanceFromScale,
  computeCodePillNudges,
  textTierActive
} = await importTsModule("lib/seatCrowding.ts");

// PR-2 text tier gate (owner ruling 2026-08-24): canvas labels are marks
// below the collision threshold and 12px text at or above it. The threshold
// is DERIVED from the actual seat set at the live scale — these tests drive
// textTierActive across synthetic pitch sweeps and a continuous fit-mode
// width sweep (the deadband case: frame width is continuous under window
// resize, and the tier must not flap at the boundary).

const ASPECT = 1734 / 3822; // MAP_IMAGE_HEIGHT / MAP_IMAGE_WIDTH
const yScale = (pxPerNormX) => pxPerNormX * ASPECT;

// The tightest production pitch (~0.0294 normalized, CW pod) as a 2×2 pod —
// the geometry that decides the threshold for the real seat set.
const densePod = [
  { id: "cw05", x: 0.35, y: 0.62 },
  { id: "cw06", x: 0.3794, y: 0.62 },
  { id: "cw15", x: 0.35, y: 0.68 },
  { id: "cw16", x: 0.3794, y: 0.68 }
];

const sparseSeats = [
  { id: "a", x: 0.2, y: 0.3 },
  { id: "b", x: 0.32, y: 0.3 },
  { id: "c", x: 0.2, y: 0.55 }
];

test("dense pod stays marks at fit scale; sparse set flips to text", () => {
  // 1376px fit frame (the measured common case): 0.0294 pitch ≈ 40.4px < 48.
  assert.equal(textTierActive(densePod, 1376, yScale(1376)), false);
  // The same pod at a wide rendered frame: 0.0294 × 1700 ≈ 50px ≥ 48.
  assert.equal(textTierActive(densePod, 1700, yScale(1700)), true);
  // A sparse set clears the text-tier footprints even at the fit scale.
  assert.equal(textTierActive(sparseSeats, 1376, yScale(1376)), true);
});

test("threshold derives from the seat set — tightening pitch retreats the tier", () => {
  const scale = 1700;
  assert.equal(textTierActive(densePod, scale, yScale(scale)), true);
  // Add one seat that halves the tightest pitch: the tier retreats at the
  // same scale, by construction — no constant to update.
  const tightened = [...densePod, { id: "cw05b", x: 0.3647, y: 0.62 }];
  assert.equal(textTierActive(tightened, scale, yScale(scale)), false);
});

test("unmeasured or degenerate scale always reads as marks", () => {
  assert.equal(textTierActive(sparseSeats, 0, 0), false);
  assert.equal(textTierActive(sparseSeats, Number.NaN, Number.NaN), false);
  assert.equal(textTierActive(sparseSeats, -100, -50), false);
  // Even with the tier previously active, a lost measure drops to marks.
  assert.equal(textTierActive(sparseSeats, 0, 0, true), false);
});

test("deadband: continuous width sweep across the boundary never oscillates", () => {
  // Fit mode is continuous under window resize — sweep the rendered frame
  // width up and back down in 1px steps, threading the hysteresis exactly as
  // the surfaces do (previous value in, next value out).
  const transitions = [];
  let active = false;
  for (let width = 1400; width <= 1900; width += 1) {
    const next = textTierActive(densePod, width, yScale(width), active);
    if (next !== active) transitions.push({ width, to: next });
    active = next;
  }
  for (let width = 1900; width >= 900; width -= 1) {
    const next = textTierActive(densePod, width, yScale(width), active);
    if (next !== active) transitions.push({ width, to: next });
    active = next;
  }
  // Exactly one enter and one exit across the whole double sweep.
  assert.equal(transitions.length, 2, `expected 2 transitions, got ${JSON.stringify(transitions)}`);
  assert.equal(transitions[0].to, true);
  assert.equal(transitions[1].to, false);
  // Hysteresis is jitter-sized and no larger (owner re-ruling 2026-08-24):
  // the band must exceed resize noise, but a wide band is path-dependence —
  // two windows at the same width showing different tiers depending on
  // arrival direction. Pin both edges of the slack's frame-width conversion.
  const enterWidth = transitions[0].width;
  const exitWidth = transitions[1].width;
  const pitch = 0.0294;
  const bandWidth = enterWidth - exitWidth;
  assert.ok(
    bandWidth >= (TEXT_TIER_EXIT_SLACK_PX / pitch) * 0.9,
    `deadband too narrow: enter ${enterWidth}, exit ${exitWidth}`
  );
  assert.ok(
    bandWidth <= (TEXT_TIER_EXIT_SLACK_PX / pitch) * 1.2 + 2,
    `deadband too wide (path-dependence): enter ${enterWidth}, exit ${exitWidth}`
  );

  // Jitter directly across the enter boundary: once entered, the tier holds.
  let jitterActive = false;
  const states = [];
  for (const width of [enterWidth - 2, enterWidth + 2, enterWidth - 2, enterWidth + 2, enterWidth - 2]) {
    jitterActive = textTierActive(densePod, width, yScale(width), jitterActive);
    states.push(jitterActive);
  }
  assert.deepEqual(states, [false, true, true, true, true]);
});

test("exit slack is jitter-sized — in-band overlap still de-collides", () => {
  // Owner re-ruling 2026-08-24: slack is in FOOTPRINT px and the tightest
  // pitch multiplies it into frame width (~34px of frame per footprint px),
  // so it only needs to beat resize jitter — 2px ≈ a ~68px band. Anything
  // like the original 14 is ~477px of visible path-dependence.
  assert.equal(TEXT_TIER_EXIT_SLACK_PX, 2);
  // Inside the deadband the residual footprint overlap is at most the slack,
  // and the nudge scorer (fed the text-tier geometry) resolves it: a pair one
  // px tighter than the enter threshold still gets divergent rows.
  const pxPerNormX = 1000;
  const pxPerNormY = yScale(1000);
  const pitchPx = TEXT_TIER_CODE_PILL_SIZE_PX.w - TEXT_TIER_EXIT_SLACK_PX + 1; // 47px — in-band
  const pair = [
    { id: "a", x: 0.5, y: 0.5 },
    { id: "b", x: 0.5 + pitchPx / pxPerNormX, y: 0.5 }
  ];
  const clearance = clearanceFromScale(pxPerNormX, pxPerNormY, TEXT_TIER_CLEARANCE_PX);
  const nudges = computeCodePillNudges(pair, clearance, { geometry: TEXT_TIER_PILL_GEOMETRY });
  assert.equal(nudges.size, 2);
  assert.notEqual(nudges.get("a"), nudges.get("b"));
});
