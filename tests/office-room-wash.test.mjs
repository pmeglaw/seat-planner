import test from "node:test";
import assert from "node:assert/strict";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";

// PR B of the office two-step: a room washes green only while an assigned
// seat sits inside it, and the wash yields to every stronger map treatment.
// Extended 2026-07-24 to all eight private offices (N/NE/SE/S).
const { buildOfficeRoomWashes, findOfficeRoom, isInsideOfficeRoom, OFFICE_ROOM_VISUAL_RECTS } = await importTsModule("lib/officeRoomWash.ts");

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

test("isInsideOfficeRoom accepts office points and rejects pod points", () => {
  for (const { label, point } of LIVE_OFFICE_POINTS) {
    assert.ok(isInsideOfficeRoom(point), label);
  }
  assert.ok(isInsideOfficeRoom(LEFT) && isInsideOfficeRoom(RIGHT), "south rooms");
  for (const pod of [{ x: 0.3, y: 0.32 }, { x: 0.5, y: 0.4 }, { x: 0.85, y: 0.4 }]) {
    assert.ok(!isInsideOfficeRoom(pod), JSON.stringify(pod));
  }
});
