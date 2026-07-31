import assert from "node:assert/strict";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";
import test from "node:test";

const seatDraftActions = await importTsModule("lib/seatDraftActions.ts");
const { buildVacateSeatInput, canVacateSeat, classifySeatUpdateResult, vacateNeedsConfirmation } = seatDraftActions;

// The vacate flow used to live inline in SeatInspector, where the docked
// inspector was its only caller. The canvas action bar is a second caller, so
// the payload and the result handling moved into lib/ to stop the two drifting.
// These tests exist because every field below is one a careless "cleanup" could
// drop, and dropping any of them silently writes the wrong thing to a real seat.

function seat(overrides = {}) {
  return {
    id: "seat-1",
    seat_key: "se04",
    label: "SE04",
    x: 0.5,
    y: 0.5,
    status: "assigned",
    layer: "draft",
    employee_id: "emp-1",
    department: null,
    zone: "South-East Pod",
    notes: null,
    is_custom: false,
    created_at: "",
    updated_at: "2026-07-30T10:15:00.123456+00:00",
    employee: null,
    ...overrides
  };
}

test("vacate clears the occupant but keeps the seat's own identity", () => {
  const input = buildVacateSeatInput(seat());

  assert.equal(input.seatId, "seat-1");
  assert.equal(input.label, "SE04");
  assert.equal(input.status, "available");
  assert.equal(input.employeeId, null);
  assert.equal(input.employeeName, null);
  assert.equal(input.department, null);
});

test("vacate preserves the zone, falling back through department before null", () => {
  // The zone is what the map's crowding and zone-detection logic reads. Sending
  // a bare null would unzone the seat as a side effect of clearing its occupant.
  assert.equal(buildVacateSeatInput(seat({ zone: "North Pod" })).zone, "North Pod");
  assert.equal(buildVacateSeatInput(seat({ zone: null, department: "Intake" })).zone, "Intake");
  assert.equal(buildVacateSeatInput(seat({ zone: null, department: null })).zone, null);
});

test("vacate preserves the seat note, trimmed — a note describes the seat, not the person", () => {
  assert.equal(buildVacateSeatInput(seat({ notes: "  monitor arm broken  " })).notes, "monitor arm broken");
  assert.equal(buildVacateSeatInput(seat({ notes: null })).notes, null);
  // Whitespace-only collapses to null rather than writing a blank string.
  assert.equal(buildVacateSeatInput(seat({ notes: "   " })).notes, null);
});

test("vacate carries expectedUpdatedAt through verbatim", () => {
  // lib/draftConcurrency.ts's header explains why: round-tripping the timestamp
  // through Date loses precision the fence compares on, so the string the client
  // rendered must reach the server unchanged.
  const updatedAt = "2026-07-30T10:15:00.123456+00:00";
  assert.equal(buildVacateSeatInput(seat({ updated_at: updatedAt })).expectedUpdatedAt, updatedAt);
});

test("vacate omits phoneExtension while explicitly nulling employeePosition", () => {
  // Not a quirk to tidy away. updateSeatAction distinguishes the two with
  // `"phoneExtension" in input` (app/actions.ts:333-334): an omitted key means
  // "leave unchanged", an explicit null means "clear". Adding phoneExtension
  // here would start writing to a field vacate has never touched.
  const input = buildVacateSeatInput(seat());

  assert.equal("employeePosition" in input, true, "employeePosition must be present and null");
  assert.equal(input.employeePosition, null);
  assert.equal("phoneExtension" in input, false, "phoneExtension must be absent, not null");
});

test("only an occupied seat can be vacated", () => {
  assert.equal(canVacateSeat(seat({ employee_id: "emp-1" })), true);
  assert.equal(canVacateSeat(seat({ employee_id: null })), false);
  assert.equal(canVacateSeat(null), false);
  assert.equal(canVacateSeat(undefined), false);
});

test("a successful result is classified as saved and carries the seat", () => {
  const updated = seat({ status: "available", employee_id: null });
  const outcome = classifySeatUpdateResult({ ok: true, seat: updated });

  assert.equal(outcome.kind, "saved");
  assert.equal(outcome.seat, updated);
});

test("STALE_DRAFT classifies apart from ordinary failure", () => {
  // The fence is not an error to show — it means this client's view predates
  // another admin's edit, and the caller must reload rather than surface a
  // message. Folding it into `failed` would leave a stale client re-arming the
  // same rejected write.
  const outcome = classifySeatUpdateResult({
    ok: false,
    code: "STALE_DRAFT",
    message: "This seat changed in another session."
  });

  assert.equal(outcome.kind, "stale");
  assert.equal(outcome.message, "This seat changed in another session.");
});

test("a double-booking becomes a conflict carrying the seat they already occupy", () => {
  const outcome = classifySeatUpdateResult({
    ok: false,
    code: "EMPLOYEE_ALREADY_ASSIGNED",
    message: "That employee is already assigned to W11.",
    currentSeatLabel: "W11"
  });

  assert.equal(outcome.kind, "conflict");
  assert.equal(outcome.currentSeatLabel, "W11");
});

test("a conflict without a parsed label still names something", () => {
  const outcome = classifySeatUpdateResult({
    ok: false,
    code: "EMPLOYEE_ALREADY_ASSIGNED",
    message: "That employee is already assigned."
  });

  assert.equal(outcome.kind, "conflict");
  assert.equal(outcome.currentSeatLabel, "another seat");
});

test("any other code is an ordinary failure", () => {
  const outcome = classifySeatUpdateResult({ ok: false, code: "VALIDATION", message: "Seat label is required." });

  assert.equal(outcome.kind, "failed");
  assert.equal(outcome.message, "Seat label is required.");
});

test("vacate confirms on unsaved edits, or whenever it is fired from a transient surface", () => {
  // Undo cannot restore edits that were never committed, so unsaved work always
  // stops for a dialog. The canvas action bar additionally confirms every time:
  // a small target that appears and disappears with the selection earns less
  // trust than a 44px cell in a panel the user deliberately opened.
  assert.equal(vacateNeedsConfirmation({ hasUnsavedEdits: false }), false);
  assert.equal(vacateNeedsConfirmation({ hasUnsavedEdits: true }), true);
  assert.equal(vacateNeedsConfirmation({ hasUnsavedEdits: false, fromTransientSurface: true }), true);
  assert.equal(vacateNeedsConfirmation({ hasUnsavedEdits: true, fromTransientSurface: true }), true);
});
