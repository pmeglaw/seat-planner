import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Guardrail (v1.9.x pill-overlap fix, reshaped twice — for the uniform-pill
// system and then for the Phase 3 pill in Phase 4 PR 3b): pills render at ONE
// constant height on every map surface, so collisions are resolved by nudging
// — and the nudge graph must be computed against the LIVE rendered map scale,
// with each pill at its own fit width. When any of this regresses, dense pods
// render physically overlapping pills at fit zoom. This pins wiring, not look.
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

const NUDGE_CALL = (seats, scale) => new RegExp(
  `computeNameLabelNudges\\(${seats}, namedSeatIdSet, seatDensityClearance, \\{\\s*` +
  `widthPx: seat => seat\\.employee \\? estimatePillWidthPx\\(seatPillLabel\\(seat\\)\\) : PILL_HEIGHT_PX,\\s*` +
  `pixelsPerXUnit: ${scale}\\s*\\}\\)`
);

test("viewer computes nudges from the live rendered scale, each pill at its own width", async () => {
  const source = await read("components/seat-map/ViewerSeatFinder.tsx");
  assert.ok(
    source.includes("clearanceFromScale("),
    "ViewerSeatFinder must derive the crowding clearance from the rendered map width via clearanceFromScale"
  );
  assert.ok(
    /clearanceFromScale\([^;]*MAP_IMAGE_HEIGHT\s*\/\s*MAP_IMAGE_WIDTH[^;]*PILL_CLEARANCE_PX\)/.test(source),
    "ViewerSeatFinder must pass an aspect-corrected y scale and the pill clearance — normalized y spans the frame height, not its width"
  );
  assert.match(
    source,
    NUDGE_CALL("visualSeats", "mapRenderedWidth \\?\\? 0"),
    "ViewerSeatFinder must feed computeNameLabelNudges the live clearance AND each seat's estimated pill width at the live x scale (an empty seat is the footprint)"
  );
  assertOnePillLayer(source, "ViewerSeatFinder");
});

test("admin map keeps its zoom-aware clearance wiring, each pill at its own width", async () => {
  const source = await read("components/seat-map/SeatMap.tsx");
  assert.ok(
    /clearanceFromScale\(\s*\n?\s*mapPixelsPerNormalizedUnit\b/.test(source),
    "SeatMap must derive the crowding clearance from mapPixelsPerNormalizedUnit"
  );
  assert.ok(
    /clearanceFromScale\([^;]*MAP_IMAGE_HEIGHT\s*\/\s*MAP_IMAGE_WIDTH[^;]*PILL_CLEARANCE_PX\s*\)/s.test(source),
    "SeatMap must pass an aspect-corrected y scale and the pill clearance"
  );
  assert.match(
    source,
    NUDGE_CALL("visualLocalSeats", "mapPixelsPerNormalizedUnit"),
    "SeatMap must feed computeNameLabelNudges the zoom-aware clearance AND each seat's estimated pill width at the live x scale"
  );
  assertOnePillLayer(source, "SeatMap");
});

// Phase 4 PR 3b: ONE pill layer. The code-pill graph, the text tier and the
// pitch-gated hit floor retired with the Phase 3 pill — a surface that
// re-grows a second geometry re-opens the converging-rows bug.
function assertOnePillLayer(source, surface) {
  for (const retired of ["computeCodePillNudges", "textTierActive", "markerHitFloorMet", "TEXT_TIER_PILL_GEOMETRY", "RESTING_PILL_GEOMETRY", "codeNudge=", "textTier=", "hitFloor=", "compactNameLabel"]) {
    assert.ok(!source.includes(retired), `${surface} must not reference the retired ${retired}`);
  }
  assert.match(source, /nameNudge=\{nameLabelNudges\.get\(seat\.id\) \?\? 0\}/, `${surface} passes the one nudge to SeatMarker`);
}

test("the pill height, the nudge amplitude and the token agree (DECISIONS D1)", async () => {
  // PILL_HEIGHT_PX = 2 × PILL_NUDGE_PX is the geometry that lets a colliding
  // pair nudged −1 / +1 touch without overlapping; the height itself is the
  // 28px footprint token. Three literals, three files — pinned in sync.
  const lib = await read("lib/seatCrowding.ts");
  const heightMatch = lib.match(/export const PILL_HEIGHT_PX = (\d+);/);
  const nudgeMatch = lib.match(/export const PILL_NUDGE_PX = (\d+);/);
  assert.ok(heightMatch, "lib/seatCrowding.ts must export PILL_HEIGHT_PX as a plain literal");
  assert.ok(nudgeMatch, "lib/seatCrowding.ts must export PILL_NUDGE_PX as a plain literal");
  const height = Number(heightMatch[1]);
  const nudge = Number(nudgeMatch[1]);
  assert.equal(height, 2 * nudge, "two nudged rows sit exactly one pill height apart");

  const tokens = await read("app/styles/sp-tokens.css");
  assert.match(tokens, /--sp-pill-h:\s*var\(--sp-seat-footprint\);/, "the pill height IS the footprint token");
  const footprint = tokens.match(/--sp-seat-footprint:\s*(\d+)px;/);
  assert.ok(footprint, "--sp-seat-footprint must be a plain px literal");
  assert.equal(Number(footprint[1]), height, "PILL_HEIGHT_PX matches --sp-seat-footprint");

  // The marker never sets a width (fit-width, P3-12) or a height (the sheet
  // owns it), and the nudge is an inline transform reasoning in PILL_NUDGE_PX.
  const marker = await read("components/seat-map/SeatMarker.tsx");
  assert.doesNotMatch(marker, /(?<![\w-])(?:w|h|min-w|min-h|max-w)-\[/, "no Tailwind size on the pill — width from the label, height from the token");
  assert.match(marker, /import \{ PILL_NUDGE_PX \} from "@\/lib\/seatCrowding";/);
  assert.match(marker, /calc\(-50% \+ \$\{nudge \* PILL_NUDGE_PX\}px\)/, "the nudge translates by ±PILL_NUDGE_PX inline");
});
