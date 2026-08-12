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
    /computeCodePillNudges\(\s*visualSeats\s*,\s*seatDensityClearance\s*,\s*\{\s*nameNudges:\s*nameLabelNudges\s*,\s*namedSeatIds:\s*namedSeatIdSet\s*\}\s*\)/.test(source),
    "ViewerSeatFinder must de-collide uniform-size code pills via computeCodePillNudges at the same live clearance, feeding it the name-label rows — two independent graphs converge pills onto the same row"
  );
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
    /computeCodePillNudges\(\s*visualLocalSeats\s*,\s*seatDensityClearance\s*,\s*\{\s*nameNudges:\s*nameLabelNudges\s*,\s*namedSeatIds:\s*namedSeatIdSet\s*\}\s*\)/.test(source),
    "SeatMap must de-collide uniform-size code pills via computeCodePillNudges at the same zoom-aware clearance, feeding it the name-label rows"
  );
});

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
});
