import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Guardrail (v1.9.x pill-overlap fix, reshaped for the uniform-pill system):
// code pills render at ONE fixed size on every map surface, so collisions are
// resolved by nudging — and the nudge graphs must be computed against the
// LIVE rendered map scale, with the name-label rows fed into the code-pill
// graph. When any of this regresses, dense pods render physically
// overlapping pills at fit zoom, and two independent nudge graphs converge
// pills onto the same row. This pins wiring, not look.
//
// The original symptom came from the docked People directory, which kept the
// viewer's at-rest stage ~330px narrower than a full-bleed fit, so a static
// "fit-zoom" clearance under-flagged exactly the pods that collided. That
// panel is gone — the Find palette floats and reserves nothing — so the
// viewer now rests at the wider scale. The wiring still has to be live, for
// the same reason at the other end of the range: detail zoom, the mobile
// fixed-width frame, and every window size in between all render at scales a
// constant cannot describe.

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("viewer computes nudges from the live rendered scale, names feeding codes", async () => {
  const source = await read("components/seat-map/ViewerSeatFinder.tsx");
  assert.ok(
    source.includes("clearanceFromScale("),
    "ViewerSeatFinder must derive the crowding clearance from the rendered map width via clearanceFromScale"
  );
  assert.ok(
    /clearanceFromScale\([^;]*MAP_IMAGE_HEIGHT\s*\/\s*MAP_IMAGE_WIDTH/.test(source),
    "ViewerSeatFinder must pass an aspect-corrected y scale — normalized y spans the frame height, not its width"
  );
  assert.ok(
    /computeNameLabelNudges\(\s*visualSeats\s*,\s*namedSeatIdSet\s*,\s*seatDensityClearance\s*\)/.test(source),
    "ViewerSeatFinder must pass the same live clearance to computeNameLabelNudges (parity with the admin map)"
  );
  assert.ok(
    /computeCodePillNudges\(\s*visualSeats\s*,\s*seatDensityClearance\s*,\s*\{\s*nameNudges:\s*nameLabelNudges\s*,\s*namedSeatIds:\s*namedSeatIdSet\s*,\s*geometry:\s*seatPillGeometry\s*\}\s*\)/.test(source),
    "ViewerSeatFinder must de-collide uniform-size code pills via computeCodePillNudges at the same live clearance, feeding it the name-label rows AND the tier-aware pill geometry — two independent graphs converge pills onto the same row, and a marks-geometry scorer is blind to text-tier pills"
  );
  assertTextTierWiring(source, "ViewerSeatFinder", "visualSeats");
});

test("admin map keeps its zoom-aware clearance wiring, names feeding codes", async () => {
  const source = await read("components/seat-map/SeatMap.tsx");
  assert.ok(
    /clearanceFromScale\(\s*\n?\s*mapPixelsPerNormalizedUnit\b/.test(source),
    "SeatMap must derive the crowding clearance from mapPixelsPerNormalizedUnit"
  );
  assert.ok(
    /clearanceFromScale\([^;]*MAP_IMAGE_HEIGHT\s*\/\s*MAP_IMAGE_WIDTH/s.test(source),
    "SeatMap must pass an aspect-corrected y scale — normalized y spans the frame height, not its width"
  );
  assert.ok(
    /computeCodePillNudges\(\s*visualLocalSeats\s*,\s*seatDensityClearance\s*,\s*\{\s*nameNudges:\s*nameLabelNudges\s*,\s*namedSeatIds:\s*namedSeatIdSet\s*,\s*geometry:\s*seatPillGeometry\s*\}\s*\)/.test(source),
    "SeatMap must de-collide uniform-size code pills via computeCodePillNudges at the same zoom-aware clearance, feeding it the name-label rows AND the tier-aware pill geometry"
  );
  assertTextTierWiring(source, "SeatMap", "visualLocalSeats");
});

// PR-2 text tier: both surfaces must derive the tier from the live scale via
// textTierActive (threading the hysteresis ref — the fit-mode deadband), and
// must swap the scorer geometry with the tier so the nudge graphs model the
// pills actually on screen.
function assertTextTierWiring(source, surface, seatSet) {
  assert.ok(
    new RegExp(`textTierActive\\(\\s*${seatSet}\\s*,`).test(source),
    `${surface} must gate the text tier with textTierActive over the same visual seat set the nudge graphs use`
  );
  assert.ok(
    /textTierActive\([^;]*textTierWasActiveRef\.current\s*\)/.test(source),
    `${surface} must thread the previous tier state into textTierActive — the deadband is what keeps a continuous fit-mode width sweep from flapping the marker layer`
  );
  assert.ok(
    /const seatPillGeometry = textTier \? TEXT_TIER_PILL_GEOMETRY : RESTING_PILL_GEOMETRY;/.test(source),
    `${surface} must swap the scorer geometry with the tier`
  );
  assert.ok(
    /clearanceFromScale\([^;]*seatPillGeometry\.clearancePx\s*\)/.test(source),
    `${surface} must derive the crowding clearance from the SAME geometry it feeds the scorer — mismatched bases mis-scale every projected pill rect`
  );
  assert.ok(
    /textTier=\{textTier\}/.test(source),
    `${surface} must pass the tier to SeatMarker`
  );
}

test("SeatMarker's pill geometry matches the scoring model's constants", async () => {
  // The nudge scorer reasons about pills of CODE_PILL_SIZE_PX nudged by
  // ±PILL_NUDGE_PX, but SeatMarker's Tailwind classes must embed literal
  // numbers for static extraction — this pin keeps the two in sync. If the
  // pill is restyled, update lib/seatCrowding's constants (and vice versa)
  // or the scorer models pills that don't exist on screen.
  const lib = await read("lib/seatCrowding.ts");
  const sizeMatch = lib.match(/CODE_PILL_SIZE_PX = \{ w: (\d+), h: (\d+) \}/);
  const nudgeMatch = lib.match(/PILL_NUDGE_PX = (\d+)/);
  assert.ok(sizeMatch, "lib/seatCrowding.ts must export CODE_PILL_SIZE_PX as a plain literal");
  assert.ok(nudgeMatch, "lib/seatCrowding.ts must export PILL_NUDGE_PX as a plain literal");
  const [, w, h] = sizeMatch;
  const [, nudge] = nudgeMatch;

  const marker = await read("components/seat-map/SeatMarker.tsx");
  assert.ok(
    marker.includes(`h-[${h}px] min-h-[${h}px] w-[${w}px]`),
    `SeatMarker's resting code pill must be the fixed ${w}×${h}px geometry the nudge scorer models`
  );
  assert.ok(
    marker.includes(`-translate-y-[calc(50%+${nudge}px)]`) && marker.includes(`-translate-y-[calc(50%-${nudge}px)]`),
    `SeatMarker's token nudge classes must translate by the ±${nudge}px the nudge scorer models`
  );

  // PR-2 text tier: same contract for the tier footprints. The text-tier code
  // pill rests at w-auto on the min-width the tier gate and scorer model, at
  // 12px type; the text-tier name token rests at the width the name-obstacle
  // footprint models.
  const textSizeMatch = lib.match(/TEXT_TIER_CODE_PILL_SIZE_PX = \{ w: (\d+), h: (\d+) \}/);
  const textNameMatch = lib.match(/TEXT_TIER_NAME_OBSTACLE_PX = \{ w: (\d+), h: (\d+) \}/);
  assert.ok(textSizeMatch, "lib/seatCrowding.ts must export TEXT_TIER_CODE_PILL_SIZE_PX as a plain literal");
  assert.ok(textNameMatch, "lib/seatCrowding.ts must export TEXT_TIER_NAME_OBSTACLE_PX as a plain literal");
  const [, textW] = textSizeMatch;
  const [, textNameW] = textNameMatch;
  assert.ok(
    marker.includes(`w-auto min-w-[${textW}px]`),
    `SeatMarker's text-tier code pill must rest at w-auto with the ${textW}px min-width the tier gate models`
  );
  assert.ok(
    /textTier\s*\?\s*"text-\[12px\]"/.test(marker),
    "SeatMarker's text-tier code label must hold the 12px floor (the tier IS the at-or-above-threshold state)"
  );
  assert.ok(
    marker.includes(`w-[${textNameW}px] max-w-[${textNameW}px]`),
    `SeatMarker's text-tier name token must rest at the ${textNameW}px width the name-obstacle footprint models`
  );
});
