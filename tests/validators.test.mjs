import assert from "node:assert/strict";
import test from "node:test";

function normalizeSeatStatus(status, hasEmployee) {
  const statuses = ["available", "assigned", "reserved", "unavailable"];
  if (!statuses.includes(status)) return hasEmployee ? "assigned" : "available";
  if (hasEmployee) return "assigned";
  if (status === "assigned") return "available";
  return status;
}

test("assigned status is normalized to available when no employee exists", () => {
  assert.equal(normalizeSeatStatus("assigned", false), "available");
});

test("any occupied seat is normalized to assigned", () => {
  assert.equal(normalizeSeatStatus("available", true), "assigned");
  assert.equal(normalizeSeatStatus("reserved", true), "assigned");
});

test("invalid statuses normalize safely", () => {
  assert.equal(normalizeSeatStatus("broken", false), "available");
  assert.equal(normalizeSeatStatus("broken", true), "assigned");
});
