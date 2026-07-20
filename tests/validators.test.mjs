import assert from "node:assert/strict";
import test from "node:test";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";

// Exercises the REAL lib/validators.ts. Previously this file re-implemented
// normalizeSeatStatus inline and never touched assertNonEmpty,
// validateSeatCoordinates, or buildInitials at all.
const { normalizeSeatStatus, assertNonEmpty, validateSeatCoordinates, buildInitials } =
  await importTsModule("lib/validators.ts");

test("assigned status is normalized to available when no employee exists", () => {
  assert.equal(normalizeSeatStatus("assigned", false), "available");
});

test("any occupied seat is normalized to assigned", () => {
  assert.equal(normalizeSeatStatus("available", true), "assigned");
  assert.equal(normalizeSeatStatus("reserved", true), "assigned");
});

test("empty non-assigned statuses are preserved", () => {
  assert.equal(normalizeSeatStatus("reserved", false), "reserved");
  assert.equal(normalizeSeatStatus("unavailable", false), "unavailable");
  assert.equal(normalizeSeatStatus("available", false), "available");
});

test("invalid statuses normalize safely", () => {
  assert.equal(normalizeSeatStatus("broken", false), "available");
  assert.equal(normalizeSeatStatus("broken", true), "assigned");
});

test("assertNonEmpty trims and returns the value, or throws on blank input", () => {
  assert.equal(assertNonEmpty("  Jane  ", "Name"), "Jane");
  assert.throws(() => assertNonEmpty("   ", "Name"), /Name is required\./);
  assert.throws(() => assertNonEmpty("", "Department"), /Department is required\./);
});

test("validateSeatCoordinates clamps and rounds to the normalized range", () => {
  assert.deepEqual(validateSeatCoordinates(2, -1), { x: 1, y: 0 });
  assert.deepEqual(validateSeatCoordinates(0.1234567, 0.5), { x: 0.123457, y: 0.5 });
});

test("buildInitials takes up to two leading initials, uppercased", () => {
  assert.equal(buildInitials("Jane Doe"), "JD");
  assert.equal(buildInitials("mary jane watson"), "MJ");
  assert.equal(buildInitials("cher"), "C");
  assert.equal(buildInitials("   "), "");
});
