import test from "node:test";
import assert from "node:assert/strict";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";

// PR B of the office two-step: a room washes green only while an assigned
// seat sits inside it, and the wash yields to every stronger map treatment.
const { buildOfficeRoomWashes, SOUTH_OFFICE_ROOM_VISUAL_RECTS } = await importTsModule("lib/officeRoomWash.ts");

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

test("the measured rects stay two rooms inside the map band", () => {
  assert.equal(SOUTH_OFFICE_ROOM_VISUAL_RECTS.length, 2);
  for (const rect of SOUTH_OFFICE_ROOM_VISUAL_RECTS) {
    assert.ok(rect.xMin < rect.xMax && rect.yMin < rect.yMax);
    assert.ok(rect.yMin > 0.9 && rect.yMax <= 1);
  }
  const [left, right] = SOUTH_OFFICE_ROOM_VISUAL_RECTS;
  assert.ok(left.xMax <= right.xMin, "rooms never overlap");
});
