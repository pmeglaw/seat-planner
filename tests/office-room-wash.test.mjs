import test from "node:test";
import assert from "node:assert/strict";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";

// PR B of the office two-step: a room washes green only while an assigned
// seat sits inside it, and the wash yields to every stronger map treatment.
// Extended 2026-07-24 to all eight private offices (N/NE/SE/S).
const { buildOfficeRoomWashes, findOfficeRoom, getOfficePlateLayout, isInsideOfficeRoom, OFFICE_ROOM_VISUAL_RECTS } = await importTsModule("lib/officeRoomWash.ts");

// Visual-space points inside each measured room.
const LEFT = { x: 0.17, y: 0.955 };
const RIGHT = { x: 0.30, y: 0.955 };

function seat(id, point, status = "assigned") {
  return { id, x: point.x, y: point.y, status };
}

test("an assigned seat inside a room produces that room's wash", () => {
  const washes = buildOfficeRoomWashes({ seats: [seat("a", LEFT)] });
  assert.equal(washes.length, 1);
  assert.equal(washes[0].key, "south-office-1");
  assert.equal(washes[0].seatId, "a");
});

test("both rooms wash independently", () => {
  const washes = buildOfficeRoomWashes({ seats: [seat("a", LEFT), seat("b", RIGHT)] });
  assert.deepEqual(washes.map(w => w.key), ["south-office-1", "south-office-2"]);
});

test("open, reserved, and unavailable seats never wash a room", () => {
  for (const status of ["available", "reserved", "unavailable"]) {
    assert.deepEqual(buildOfficeRoomWashes({ seats: [seat("a", LEFT, status)] }), [], status);
  }
});

test("a seat outside every room washes nothing", () => {
  assert.deepEqual(buildOfficeRoomWashes({ seats: [seat("a", { x: 0.5, y: 0.5 })] }), []);
});

test("the wash dims out with its seat (filter/search dim)", () => {
  const washes = buildOfficeRoomWashes({ seats: [seat("a", LEFT)], dimmedSeatIds: new Set(["a"]) });
  assert.deepEqual(washes, []);
});

test("the wash mutes while its seat carries the search highlight", () => {
  const washes = buildOfficeRoomWashes({ seats: [seat("a", LEFT)], searchActiveSeatIds: new Set(["a"]) });
  assert.deepEqual(washes, []);
});

test("swap mode clears every wash", () => {
  const washes = buildOfficeRoomWashes({ seats: [seat("a", LEFT), seat("b", RIGHT)], swapMode: true });
  assert.deepEqual(washes, []);
});

test("a dragged seat's room drops its wash until the drop", () => {
  const washes = buildOfficeRoomWashes({ seats: [seat("a", LEFT)], draggingSeatId: "a" });
  assert.deepEqual(washes, []);
});

test("eight measured office rooms, none overlapping", () => {
  assert.equal(OFFICE_ROOM_VISUAL_RECTS.length, 8);
  for (const rect of OFFICE_ROOM_VISUAL_RECTS) {
    assert.ok(rect.xMin < rect.xMax && rect.yMin < rect.yMax, rect.key);
    assert.ok(rect.xMin >= 0 && rect.xMax <= 1 && rect.yMin >= 0 && rect.yMax <= 1, rect.key);
  }
  for (const a of OFFICE_ROOM_VISUAL_RECTS) {
    for (const b of OFFICE_ROOM_VISUAL_RECTS) {
      if (a === b) continue;
      const overlaps = a.xMin < b.xMax && b.xMin < a.xMax && a.yMin < b.yMax && b.yMin < a.yMax;
      assert.ok(!overlaps, `${a.key} overlaps ${b.key}`);
    }
  }
});

// Live positions of the six 2026-07-24 office seats (read off prod) — each
// must land in its intended room, so the plate gate and wash both catch them.
const LIVE_OFFICE_POINTS = [
  { label: "N13", point: { x: 0.1413, y: 0.181 }, room: "north-office-1" },
  { label: "N14", point: { x: 0.2416, y: 0.1882 }, room: "north-office-2" },
  { label: "NE09", point: { x: 0.5531, y: 0.1766 }, room: "northeast-office-1" },
  { label: "NE10", point: { x: 0.6593, y: 0.168 }, room: "northeast-office-2" },
  { label: "SE05", point: { x: 0.8567, y: 0.8458 }, room: "southeast-office-5" },
  { label: "SE06", point: { x: 0.6987, y: 0.7505 }, room: "southeast-office-6" }
];

test("each live office seat washes exactly its own room when assigned", () => {
  for (const { label, point, room } of LIVE_OFFICE_POINTS) {
    const washes = buildOfficeRoomWashes({ seats: [seat(label, point)] });
    assert.deepEqual(washes.map(w => w.key), [room], label);
  }
});

test("findOfficeRoom returns the containing room, null elsewhere", () => {
  assert.equal(findOfficeRoom({ x: 0.17, y: 0.955 })?.key, "south-office-1");
  assert.equal(findOfficeRoom({ x: 0.6593, y: 0.168 })?.key, "northeast-office-2");
  assert.equal(findOfficeRoom({ x: 0.3, y: 0.32 }), null);
});

test("getOfficePlateLayout centers in the room and fits the width", () => {
  // NE10's live point at a 1000px-wide map: room northeast-office-2 spans
  // 0.623–0.704 (81px) — width floors at 96; offsets aim at the room center.
  const layout = getOfficePlateLayout({ x: 0.6593, y: 0.168 }, 1000);
  assert.equal(layout.widthPx, 96, "narrow room floors at 96px");
  assert.equal(layout.offsetXPx, Math.round(((0.623 + 0.704) / 2 - 0.6593) * 1000));
  assert.equal(layout.offsetYPx, Math.round(((0.11 + 0.248) / 2 - 0.168) * 1000 * (1734 / 3822)));
  // Wide south room at the same scale caps at 152.
  const wide = getOfficePlateLayout({ x: 0.3, y: 0.955 }, 1000);
  assert.equal(wide.widthPx, 152);
});

test("getOfficePlateLayout is null outside rooms and before first measure", () => {
  assert.equal(getOfficePlateLayout({ x: 0.3, y: 0.32 }, 1000), null);
  assert.equal(getOfficePlateLayout({ x: 0.6593, y: 0.168 }, 0), null);
});

// The wash + plate layout must exist on BOTH map surfaces — the viewer is
// ViewerSeatFinder, not SeatMap, and the 2026-07-24 publish check caught the
// viewer shipping plates with no wash and no room fit. Source-level parity pin.
test("both map surfaces render washes and feed the plate layout", async () => {
  const { readFile } = await import("node:fs/promises");
  for (const file of ["components/seat-map/SeatMap.tsx", "components/seat-map/ViewerSeatFinder.tsx"]) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
    // The wash JSX itself now lives in the shared MapWashLayer (checked
    // below); each surface still has to compute its own washes and mount it.
    assert.match(source, /<MapWashLayer\b/, `${file} mounts the shared wash layer`);
    assert.match(source, /officeRoomWashes=\{officeRoomWashes\}/, `${file} feeds it the room washes`);
    assert.match(source, /buildOfficeRoomWashes\(/, `${file} computes washes`);
    assert.match(source, /getOfficePlateLayout\(/, `${file} feeds the plate layout`);
    assert.match(source, /officePlateOffsetXPx=/, `${file} passes the plate offset`);
  }

  // One wash implementation for both surfaces. #323 tokenized only the admin
  // copy of these ~30 lines and the viewer kept a raw #1D6E41 hex for months;
  // the extraction is what makes that class of drift unrepresentable.
  const layer = await readFile(new URL("../components/seat-map/MapWashLayer.tsx", import.meta.url), "utf8");
  assert.match(layer, /data-office-wash/, "MapWashLayer renders the room wash");
  assert.match(layer, /bg-\[var\(--sp-wash-zone\)\]/, "room wash fill stays tokenized");
  assert.doesNotMatch(layer, /bg-\[#/, "no raw hex fill class in the wash layer");
});

test("isInsideOfficeRoom accepts office points and rejects pod points", () => {
  for (const { label, point } of LIVE_OFFICE_POINTS) {
    assert.ok(isInsideOfficeRoom(point), label);
  }
  assert.ok(isInsideOfficeRoom(LEFT) && isInsideOfficeRoom(RIGHT), "south rooms");
  for (const pod of [{ x: 0.3, y: 0.32 }, { x: 0.5, y: 0.4 }, { x: 0.85, y: 0.4 }]) {
    assert.ok(!isInsideOfficeRoom(pod), JSON.stringify(pod));
  }
});

// ---- Per-floor dispatch (multi-floor PR-2, approach A)

test("floor dispatch: floor 3 is the default; floor 2 has no rooms yet", () => {
  assert.equal(findOfficeRoom({ x: 0.17, y: 0.955 })?.key, findOfficeRoom({ x: 0.17, y: 0.955 }, "3")?.key);
  assert.equal(findOfficeRoom({ x: 0.17, y: 0.955 }, "2"), null);
  assert.equal(isInsideOfficeRoom({ x: 0.17, y: 0.955 }, "2"), false);
  assert.deepEqual(buildOfficeRoomWashes({ floor: "2", seats: [seat("a", LEFT)] }), []);
  assert.equal(getOfficePlateLayout({ x: 0.6593, y: 0.168, floor: "2" }, 1000), null);
  // A point that carries its floor dispatches on it; a bare point stays floor 3.
  assert.equal(getOfficePlateLayout({ x: 0.6593, y: 0.168, floor: "3" }, 1000).widthPx, 96);
});
