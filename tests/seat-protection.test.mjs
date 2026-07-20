import assert from "node:assert/strict";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";
import test from "node:test";
const { canDeleteDraftSeat, canDeleteSeat, getSeatDeleteBlockReason, isProtectedOriginalSeatLabel } = await importTsModule("lib/seatProtection.ts");

function seat(overrides) {
  return {
    label: "W13",
    layer: "draft",
    is_custom: true,
    employee_id: null,
    status: "available",
    ...overrides
  };
}

test("original draft seats are protected from deletion", () => {
  const originalSeat = seat({ label: "N01", is_custom: false });
  assert.equal(canDeleteSeat(originalSeat), false);
  assert.equal(getSeatDeleteBlockReason(originalSeat), "Original seats are protected. Only custom draft seats can be deleted.");
});

test("baseline labels are protected even when is_custom is wrong", () => {
  const originalSeat = seat({ label: "W08", is_custom: true });
  assert.equal(isProtectedOriginalSeatLabel("W08"), true);
  assert.equal(canDeleteDraftSeat(originalSeat), false);
  assert.equal(getSeatDeleteBlockReason(originalSeat), "Original seats are protected. Only custom draft seats can be deleted.");
});

test("assigned custom-flagged seats are protected from deletion", () => {
  const assignedSeat = seat({
    label: "W08",
    is_custom: true,
    employee_id: "employee-1",
    status: "assigned"
  });

  assert.equal(canDeleteSeat(assignedSeat), false);
  assert.equal(getSeatDeleteBlockReason(assignedSeat), "Assigned seats cannot be deleted. Vacate the seat before removing a custom draft seat.");
});

test("custom draft seats can be deleted", () => {
  const customSeat = seat({ label: "W13" });
  assert.equal(isProtectedOriginalSeatLabel("W13"), false);
  assert.equal(canDeleteDraftSeat(customSeat), true);
  assert.equal(canDeleteSeat(customSeat), true);
  assert.equal(getSeatDeleteBlockReason(customSeat), null);
});

test("custom draft seats must be available and unassigned", () => {
  const reservedSeat = seat({ label: "SE05", status: "reserved" });
  const unavailableSeat = seat({ label: "SE05", status: "unavailable" });

  assert.equal(canDeleteSeat(reservedSeat), false);
  assert.equal(getSeatDeleteBlockReason(reservedSeat), "Only available custom draft seats can be deleted.");
  assert.equal(canDeleteSeat(unavailableSeat), false);
  assert.equal(getSeatDeleteBlockReason(unavailableSeat), "Only available custom draft seats can be deleted.");
});

test("published seats are not deleted directly", () => {
  const publishedSeat = seat({ label: "W13", layer: "published" });
  assert.equal(canDeleteSeat(publishedSeat), false);
  assert.equal(getSeatDeleteBlockReason(publishedSeat), "Only draft seats can be deleted.");
});
