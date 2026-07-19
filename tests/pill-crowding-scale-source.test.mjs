import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Guardrail (v1.9.x pill-overlap fix): seat-pill crowding tiers must be
// computed against the LIVE rendered map scale on every map surface, and the
// dense cutoff must cover the crowded pill's real footprint. When either half
// regresses, dense pods render physically overlapping pills at fit zoom — the
// People directory keeps the viewer's at-rest stage narrower than the old
// full-bleed fit, so a static "fit-zoom" clearance under-flags exactly the
// pods that collide. This pins wiring, not look: pill styling is free to
// change as long as the picked treatment fits the pitch.

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("viewer computes density tiers and name nudges from the live rendered scale", async () => {
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
    !/computeSeatDensityTiers\(\s*visualSeats\s*\)/.test(source),
    "ViewerSeatFinder must not call computeSeatDensityTiers without an explicit live clearance — the static default only matches a ~1100px render"
  );
  assert.ok(
    /computeSeatDensityTiers\(\s*visualSeats\s*,\s*seatDensityClearance\s*\)/.test(source),
    "ViewerSeatFinder must pass the live seatDensityClearance to computeSeatDensityTiers"
  );
  assert.ok(
    /computeNameLabelNudges\(\s*visualSeats\s*,\s*namedSeatIdSet\s*,\s*seatDensityClearance\s*\)/.test(source),
    "ViewerSeatFinder must pass the same live clearance to computeNameLabelNudges (parity with the admin map)"
  );
});

test("admin map keeps its zoom-aware clearance wiring", async () => {
  const source = await read("components/seat-map/SeatMap.tsx");
  assert.ok(
    /clearanceFromScale\(\s*mapPixelsPerNormalizedUnit\b/.test(source),
    "SeatMap must derive the crowding clearance from mapPixelsPerNormalizedUnit"
  );
  assert.ok(
    /clearanceFromScale\([^;]*MAP_IMAGE_HEIGHT\s*\/\s*MAP_IMAGE_WIDTH/s.test(source),
    "SeatMap must pass an aspect-corrected y scale — normalized y spans the frame height, not its width"
  );
});

test("dense cutoff covers the crowded pill footprint", async () => {
  const source = await read("lib/seatCrowding.ts");
  const match = source.match(/const DENSE_CLEARANCE_FACTOR = ([0-9./ ]+);/);
  assert.ok(match, "DENSE_CLEARANCE_FACTOR must stay a plain numeric constant");
  const factor = Function(`"use strict"; return (${match[1]});`)();
  assert.ok(
    factor >= 40 / 48,
    `DENSE_CLEARANCE_FACTOR (${match[1].trim()}) must be at least 40/48 — below that, pitches between the dense cutoff and the ~40px crowded pill width render overlapping pills. Shrink the crowded pill before lowering this.`
  );
});
