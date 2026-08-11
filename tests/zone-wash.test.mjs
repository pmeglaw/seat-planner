import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";

const { buildZoneWash, ZONE_WASH_PAD_X, ZONE_WASH_PAD_Y } = await importTsModule("lib/zoneWash.ts");

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
