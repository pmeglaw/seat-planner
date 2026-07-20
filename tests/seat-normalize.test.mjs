import test from "node:test";
import assert from "node:assert/strict";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";

// lib/seatNormalize.ts coerces raw DB rows into the SeatWithEmployee shape the
// UI expects (numeric coordinates, zone/department fallback, boolean
// is_custom). It had no test coverage.
const { normalizeSeat, normalizeSeats } = await importTsModule("lib/seatNormalize.ts");

const baseSeat = {
  id: "seat-1",
  seat_key: "n01",
  label: "N01",
  status: "assigned",
  notes: null,
  employee: { id: "emp-1", full_name: "Jane Doe" }
};

test("string coordinates are coerced to numbers", () => {
  const seat = normalizeSeat({ ...baseSeat, x: "0.5", y: "0.25", zone: "North", department: "Intake" });
  assert.equal(seat.x, 0.5);
  assert.equal(seat.y, 0.25);
  assert.equal(typeof seat.x, "number");
  assert.equal(typeof seat.y, "number");
});

test("zone falls back to department, then to null", () => {
  assert.equal(normalizeSeat({ ...baseSeat, x: 0.1, y: 0.1, zone: null, department: "North" }).zone, "North");
  assert.equal(normalizeSeat({ ...baseSeat, x: 0.1, y: 0.1, zone: "West", department: "North" }).zone, "West");
  assert.equal(normalizeSeat({ ...baseSeat, x: 0.1, y: 0.1, zone: null, department: null }).zone, null);
});

test("is_custom is coerced to a boolean", () => {
  assert.equal(normalizeSeat({ ...baseSeat, x: 0.1, y: 0.1, is_custom: 1 }).is_custom, true);
  assert.equal(normalizeSeat({ ...baseSeat, x: 0.1, y: 0.1, is_custom: true }).is_custom, true);
  assert.equal(normalizeSeat({ ...baseSeat, x: 0.1, y: 0.1, is_custom: null }).is_custom, false);
  assert.equal(normalizeSeat({ ...baseSeat, x: 0.1, y: 0.1 }).is_custom, false);
});

test("non-coordinate fields are preserved", () => {
  const seat = normalizeSeat({ ...baseSeat, x: 0.1, y: 0.1, zone: "North", department: "Intake" });
  assert.equal(seat.id, "seat-1");
  assert.equal(seat.label, "N01");
  assert.deepEqual(seat.employee, { id: "emp-1", full_name: "Jane Doe" });
});

test("normalizeSeats maps every seat", () => {
  const seats = normalizeSeats([
    { ...baseSeat, x: "0.2", y: "0.3", zone: null, department: "North", is_custom: 1 },
    { ...baseSeat, id: "seat-2", x: 0.4, y: 0.6, zone: "East", department: null, is_custom: false }
  ]);
  assert.equal(seats.length, 2);
  assert.equal(seats[0].x, 0.2);
  assert.equal(seats[0].zone, "North");
  assert.equal(seats[0].is_custom, true);
  assert.equal(seats[1].zone, "East");
  assert.equal(seats[1].is_custom, false);
});
