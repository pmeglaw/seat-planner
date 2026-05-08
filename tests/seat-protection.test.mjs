import assert from "node:assert/strict";
import test from "node:test";

function isCustomSeat(seat) {
  return Boolean(seat?.is_custom);
}

function canDeleteSeat(seat) {
  return Boolean(seat && seat.layer === "draft" && isCustomSeat(seat));
}

function getSeatDeleteBlockReason(seat) {
  if (!seat) return "Select a custom seat first.";
  if (seat.layer !== "draft") return "Only draft seats can be deleted.";
  if (!isCustomSeat(seat)) return `${seat.label} is an original seat and cannot be deleted.`;
  return null;
}

test("original draft seats are protected from deletion", () => {
  const seat = { label: "N01", layer: "draft", is_custom: false };
  assert.equal(canDeleteSeat(seat), false);
  assert.equal(getSeatDeleteBlockReason(seat), "N01 is an original seat and cannot be deleted.");
});

test("custom draft seats can be deleted", () => {
  const seat = { label: "W13", layer: "draft", is_custom: true };
  assert.equal(canDeleteSeat(seat), true);
  assert.equal(getSeatDeleteBlockReason(seat), null);
});

test("published seats are not deleted directly", () => {
  const seat = { label: "W13", layer: "published", is_custom: true };
  assert.equal(canDeleteSeat(seat), false);
  assert.equal(getSeatDeleteBlockReason(seat), "Only draft seats can be deleted.");
});
