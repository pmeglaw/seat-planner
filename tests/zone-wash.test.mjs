import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";

const { buildZoneWash, ZONE_WASH_PAD_X, ZONE_WASH_PAD_Y } = await importTsModule("lib/zoneWash.ts");
const { NO_ZONE_LABEL } = await importTsModule("lib/seatFilters.ts");

// v12 slice 6 (handoff contract #8): hovering/pinning a zone chip washes that
// zone on the map. The wash is a single bounding box over the zone's seats in
// VISUAL space — the same space the markers render in — padded so the box
// reads as an area, not a tight seat outline.

async function readSource(relativePath) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

test("buildZoneWash boxes the zone's seats with the prototype padding", () => {
  const wash = buildZoneWash("North Pod", [
    { x: 0.2, y: 0.2, zone: "North Pod" },
    { x: 0.4, y: 0.1, zone: "North Pod" },
    { x: 0.8, y: 0.8, zone: "East Pod" }
  ]);

  assert.ok(wash);
  assert.equal(wash.zone, "North Pod");
  assert.equal(wash.seatCount, 2);
  assert.ok(Math.abs(wash.xMin - (0.2 - ZONE_WASH_PAD_X)) < 1e-9);
  assert.ok(Math.abs(wash.xMax - (0.4 + ZONE_WASH_PAD_X)) < 1e-9);
  assert.ok(Math.abs(wash.yMin - (0.1 - ZONE_WASH_PAD_Y)) < 1e-9);
  assert.ok(Math.abs(wash.yMax - (0.2 + ZONE_WASH_PAD_Y)) < 1e-9);
});

test("buildZoneWash falls back to department when a seat has no zone (facet parity)", () => {
  // The zone facet itself groups by seat.zone ?? seat.department (getSeatZone
  // in both map surfaces) — the wash must light the same seats the facet
  // would keep, or hover-preview and click-to-pin disagree.
  const wash = buildZoneWash("Ops", [
    { x: 0.5, y: 0.5, zone: null, department: "Ops" },
    { x: 0.6, y: 0.6, zone: "Ops", department: "Legal" }
  ]);

  assert.ok(wash);
  assert.equal(wash.seatCount, 2);
});

// The pinned zone carries a DISPLAY spelling — the option list's, or whichever
// seat was seen first — while the seats carry whatever was stored. Matching on
// the display string washed nothing at all in exactly the case the filter still
// kept seats: the map went blank behind a pinned chip reporting a live count.
test("buildZoneWash matches on the filter's key, so casing and padding cannot blank the wash", () => {
  const wash = buildZoneWash("North Pod", [
    { x: 0.2, y: 0.2, zone: "north pod" },
    { x: 0.4, y: 0.1, zone: "  North Pod  " },
    { x: 0.8, y: 0.8, zone: "NORTH POD" },
    { x: 0.9, y: 0.9, zone: "East Pod" }
  ]);

  assert.ok(wash, "a zone whose seats differ only in casing must still wash");
  assert.equal(wash.seatCount, 3);
  // The box frames all three spellings, and the East Pod seat stays outside it.
  assert.ok(Math.abs(wash.xMax - (0.8 + ZONE_WASH_PAD_X)) < 1e-9);
  // The rect still reports the DISPLAY spelling it was asked for — the key is
  // a comparison detail, not something the caller renders.
  assert.equal(wash.zone, "North Pod");
});

test("buildZoneWash clamps the padded box inside the [0,1] map frame", () => {
  const wash = buildZoneWash("Edge", [
    { x: 0.005, y: 0.995, zone: "Edge" },
    { x: 0.99, y: 0.01, zone: "Edge" }
  ]);

  assert.ok(wash);
  assert.equal(wash.xMin, 0);
  assert.equal(wash.yMin, 0);
  assert.equal(wash.xMax, 1);
  assert.equal(wash.yMax, 1);
});

test("buildZoneWash returns null when nothing can wash", () => {
  assert.equal(buildZoneWash(null, [{ x: 0.5, y: 0.5, zone: "A" }]), null);
  assert.equal(buildZoneWash("", [{ x: 0.5, y: 0.5, zone: "A" }]), null);
  assert.equal(buildZoneWash("Missing", [{ x: 0.5, y: 0.5, zone: "A" }]), null);
  assert.equal(buildZoneWash("A", []), null);
  // Seats with unusable coordinates cannot anchor a box.
  assert.equal(buildZoneWash("A", [{ x: Number.NaN, y: 0.5, zone: "A" }]), null);
});

// A published seat with neither zone nor department gets a synthesized
// "No zone" chip in the viewer palette (getSeatZone in
// lib/viewerFindPalette.ts). Pinning that chip must wash the same seats the
// filter keeps, or the chip filters correctly with no visible wash.
test("a pinned 'No zone' chip washes the seats with neither zone nor department", () => {
  const wash = buildZoneWash(NO_ZONE_LABEL, [
    { x: 0.2, y: 0.2, zone: null, department: null },
    { x: 0.4, y: 0.1, zone: null, department: null },
    { x: 0.8, y: 0.8, zone: "Ops" }
  ]);

  assert.ok(wash, "a pinned 'No zone' chip must still produce a wash rect");
  assert.equal(wash.seatCount, 2);
  assert.ok(Math.abs(wash.xMin - (0.2 - ZONE_WASH_PAD_X)) < 1e-9);
  assert.ok(Math.abs(wash.xMax - (0.4 + ZONE_WASH_PAD_X)) < 1e-9);
  assert.ok(Math.abs(wash.yMin - (0.1 - ZONE_WASH_PAD_Y)) < 1e-9);
  assert.ok(Math.abs(wash.yMax - (0.2 + ZONE_WASH_PAD_Y)) < 1e-9);
});

test("the no-zone fallback matches on the shared key, not the spelling", () => {
  const seats = [
    { x: 0.2, y: 0.2, zone: null, department: null },
    { x: 0.4, y: 0.1, zone: null, department: null },
    { x: 0.8, y: 0.8, zone: "Ops" }
  ];

  const wash = buildZoneWash("no ZONE", seats);

  assert.ok(wash, "zoneKey normalization must apply to the no-zone fallback too");
  assert.equal(wash.seatCount, 2);
});

test("an empty pin still returns null", () => {
  const seats = [
    { x: 0.2, y: 0.2, zone: null, department: null },
    { x: 0.8, y: 0.8, zone: "Ops" }
  ];

  // The admin path: no-zone seats group under "", and admin never pins a
  // "No zone" chip, so an empty/absent pin must keep returning null.
  assert.equal(buildZoneWash("", seats), null);
  assert.equal(buildZoneWash(null, seats), null);
});

test("both map surfaces render the wash as an inert decorative layer", async () => {
  // Safety anchors, not look: the wash must never intercept map clicks or
  // reach the accessibility tree (the chip list carries the zone fact in
  // text), and it must render from the shared lib helper on both surfaces.
  for (const path of ["../components/seat-map/SeatMap.tsx", "../components/seat-map/ViewerSeatFinder.tsx"]) {
    const source = await readSource(path);
    assert.match(source, /buildZoneWash/, `${path} should build the zone wash from lib/zoneWash`);
    assert.match(source, /<MapWashLayer\b[\s\S]{0,200}?zoneWash=\{zoneWash\}/, `${path} should hand its zone wash to the shared layer`);
  }

  // The overlay markup itself is shared by both surfaces — assert the safety
  // anchors once, where they now live.
  const layer = await readSource("../components/seat-map/MapWashLayer.tsx");
  const openingTag = layer.match(/aria-hidden="true"\s*\r?\n\s*data-zone-wash[\s\S]{0,300}?className="[^"]*"/);
  assert.ok(openingTag, "MapWashLayer should render an aria-hidden data-zone-wash overlay");
  assert.match(openingTag[0], /pointer-events-none/, "zone wash must not intercept map pointer events");
});
