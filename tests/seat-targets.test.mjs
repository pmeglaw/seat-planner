import assert from "node:assert/strict";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";
import test from "node:test";

// Phase 4 PR 3b, owner ruling O4 (2026-09-04): invalid move / swap destinations
// = the rules the code already refuses + reserved / unavailable seats as
// destinations. One pure predicate feeds the marker layer (`.sp-pill--invalid`,
// aria-disabled) and the click (refused, reason in the status region).
const { targetValidity, invalidTargetReason } = await importTsModule("lib/seatTargets.ts");

const seat = (id, overrides = {}) => ({ id, label: id.toUpperCase(), status: "available", employee_id: null, ...overrides });
const assigned = (id) => seat(id, { status: "assigned", employee_id: `emp-${id}` });

test("the source seat is the source, never a target", () => {
  const source = assigned("n01");
  assert.equal(targetValidity("swap", source, source), "source");
  assert.equal(targetValidity("move", source, source), "source");
  assert.equal(invalidTargetReason("move", source, source), null);
});

test("swap: two empty seats cannot swap (lib/seatSwap's rule, previewed on the map)", () => {
  const source = seat("n01");
  assert.equal(targetValidity("swap", source, seat("n02")), "invalid");
  assert.match(invalidTargetReason("swap", source, seat("n02")), /^Swap needs at least one assigned seat/);
  // With a person on either side the swap is valid.
  assert.equal(targetValidity("swap", assigned("n01"), seat("n02")), "valid");
  assert.equal(targetValidity("swap", seat("n01"), assigned("n02")), "valid");
});

test("O4: an empty reserved or unavailable seat is never a destination — move or swap", () => {
  const source = assigned("n01");
  for (const status of ["reserved", "unavailable"]) {
    const blocked = seat("ne09", { status });
    assert.equal(targetValidity("move", source, blocked), "invalid", `move onto ${status}`);
    assert.equal(targetValidity("swap", source, blocked), "invalid", `swap onto ${status}`);
    assert.equal(invalidTargetReason("move", source, blocked), `NE09 is ${status} — choose another seat.`);
  }
  // A reserved seat that already holds a person is an ordinary occupied seat.
  const occupiedReserved = seat("ne10", { status: "reserved", employee_id: "emp-x" });
  assert.equal(targetValidity("move", source, occupiedReserved), "valid");
  assert.equal(targetValidity("swap", source, occupiedReserved), "valid");
});

test("move: an open seat and an assigned seat are both valid (the latter offers a swap)", () => {
  const source = assigned("n01");
  assert.equal(targetValidity("move", source, seat("n02")), "valid");
  assert.equal(targetValidity("move", source, assigned("n03")), "valid");
  assert.equal(invalidTargetReason("move", source, seat("n02")), null);
});

test("the reason names the rule and ends in a next step (never colour only)", () => {
  const source = assigned("n01");
  for (const candidate of [seat("ne09", { status: "reserved" }), seat("ne09", { status: "unavailable" })]) {
    const reason = invalidTargetReason("move", source, candidate);
    assert.match(reason, /NE09 is (reserved|unavailable)/);
    assert.match(reason, /choose another seat\.$/);
  }
  assert.match(invalidTargetReason("swap", seat("a"), seat("b")), /choose a seat with someone in it\.$/);
});
