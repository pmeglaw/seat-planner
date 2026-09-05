import assert from "node:assert/strict";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";
import test from "node:test";
const draftHistory = await importTsModule("lib/draftHistory.ts");

function snapshot(label, employeeName = null) {
  const employee = employeeName
    ? {
        id: `emp-${employeeName}`,
        full_name: employeeName,
        position: null,
        department: null,
        avatar_url: null,
        active: true,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z"
      }
    : null;

  return draftHistory.createDraftSnapshot(
    [
      {
        id: `seat-${label}`,
        seat_key: label,
        label,
        x: 0.1,
        y: 0.2,
        status: employee ? "assigned" : "available",
        layer: "draft",
        employee_id: employee?.id ?? null,
        employee,
        zone: "West Pod",
        department: null,
        notes: null,
        is_custom: false,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z"
      }
    ],
    employee ? [employee] : []
  );
}

function seatRecord(label, isCustom = false) {
  return {
    id: `seat-${label}`,
    seat_key: label.toLowerCase(),
    label,
    x: 0.1,
    y: 0.2,
    status: "available",
    layer: "draft",
    employee_id: null,
    employee: null,
    zone: "West Pod",
    department: null,
    notes: null,
    is_custom: isCustom,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z"
  };
}

function snapshotFromSeats(seats) {
  return draftHistory.createDraftSnapshot(seats, []);
}

test("draft history undo and redo restore before and after snapshots", () => {
  const before = snapshot("W01");
  const after = snapshot("W01", "Alex Admin");
  const initial = draftHistory.createDraftHistory();

  const pushed = draftHistory.pushDraftHistory(initial, {
    label: "Assign W01",
    before,
    after
  });

  assert.equal(draftHistory.canUndoDraftHistory(pushed), true);
  assert.equal(draftHistory.canRedoDraftHistory(pushed), false);

  const undone = draftHistory.undoDraftHistory(pushed);
  assert.equal(undone.entry.label, "Assign W01");
  assert.deepEqual(undone.snapshot, before);
  assert.equal(draftHistory.canUndoDraftHistory(undone.history), false);
  assert.equal(draftHistory.canRedoDraftHistory(undone.history), true);

  const redone = draftHistory.redoDraftHistory(undone.history);
  assert.deepEqual(redone.snapshot, after);
  assert.equal(draftHistory.canUndoDraftHistory(redone.history), true);
  assert.equal(draftHistory.canRedoDraftHistory(redone.history), false);
});

test("draft history clears redo on new edits and ignores no-op entries", () => {
  const firstBefore = snapshot("W01");
  const firstAfter = snapshot("W01", "Alex Admin");
  const secondAfter = snapshot("W01", "Jordan Manager");

  const pushed = draftHistory.pushDraftHistory(draftHistory.createDraftHistory(), {
    label: "Assign W01",
    before: firstBefore,
    after: firstAfter
  });
  const undone = draftHistory.undoDraftHistory(pushed);
  const branched = draftHistory.pushDraftHistory(undone.history, {
    label: "Assign W01 to Jordan",
    before: firstBefore,
    after: secondAfter
  });

  assert.equal(draftHistory.canUndoDraftHistory(branched), true);
  assert.equal(draftHistory.canRedoDraftHistory(branched), false);

  const noOp = draftHistory.pushDraftHistory(branched, {
    label: "No change",
    before: secondAfter,
    after: secondAfter
  });

  assert.deepEqual(noOp, branched);
});

test("draft history clears after publish checkpoints", () => {
  const history = draftHistory.pushDraftHistory(draftHistory.createDraftHistory(), {
    label: "Assign W01",
    before: snapshot("W01"),
    after: snapshot("W01", "Alex Admin")
  });

  const cleared = draftHistory.clearDraftHistory(history);

  assert.equal(draftHistory.canUndoDraftHistory(cleared), false);
  assert.equal(draftHistory.canRedoDraftHistory(cleared), false);
});

test("draft history undo removes an added custom seat and redo restores it", () => {
  const originalSeat = seatRecord("W01");
  const customSeat = seatRecord("W13", true);
  const before = snapshotFromSeats([originalSeat]);
  const after = snapshotFromSeats([originalSeat, customSeat]);

  const pushed = draftHistory.pushDraftHistory(draftHistory.createDraftHistory(), {
    label: "Add W13",
    before,
    after
  });

  const undone = draftHistory.undoDraftHistory(pushed);
  assert.equal(undone.entry.label, "Add W13");
  assert.deepEqual(undone.snapshot.seats.map(seat => seat.label), ["W01"]);
  assert.equal(draftHistory.canRedoDraftHistory(undone.history), true);

  const redone = draftHistory.redoDraftHistory(undone.history);
  assert.deepEqual(redone.snapshot.seats.map(seat => seat.label), ["W01", "W13"]);
  assert.equal(redone.snapshot.seats.find(seat => seat.label === "W13")?.is_custom, true);
});

test("draft history undo restores a deleted custom seat and redo removes it again", () => {
  const originalSeat = seatRecord("W01");
  const customSeat = seatRecord("W13", true);
  const before = snapshotFromSeats([originalSeat, customSeat]);
  const after = snapshotFromSeats([originalSeat]);

  const pushed = draftHistory.pushDraftHistory(draftHistory.createDraftHistory(), {
    label: "Delete W13",
    before,
    after
  });

  const undone = draftHistory.undoDraftHistory(pushed);
  assert.deepEqual(undone.snapshot.seats.map(seat => seat.label), ["W01", "W13"]);
  assert.equal(undone.snapshot.seats.find(seat => seat.label === "W13")?.is_custom, true);

  const redone = draftHistory.redoDraftHistory(undone.history);
  assert.deepEqual(redone.snapshot.seats.map(seat => seat.label), ["W01"]);
});

// draftStatesEquivalent guards undo/redo adjacency: whole-draft restores are
// only safe while the live draft still equals the state the history entry
// left it in — value-equivalence, ignoring volatile timestamps (a successful
// restore rewrites every row's updated_at without changing values).

test("draftStatesEquivalent ignores volatile timestamps and key order", () => {
  const left = snapshot("W01", "Alex");
  const right = snapshot("W01", "Alex");
  right.seats[0].updated_at = "2026-07-08T21:00:00.123456+00:00";
  right.seats[0].created_at = "2026-07-08T21:00:00.123456+00:00";
  right.seats[0].employee.updated_at = "2026-07-08T21:00:00.123456+00:00";
  right.employees[0].updated_at = "2026-07-08T21:00:00.123456+00:00";
  // Reorder keys on one side; equality must not depend on insertion order.
  right.seats[0] = Object.fromEntries(Object.entries(right.seats[0]).reverse());

  assert.equal(draftHistory.draftStatesEquivalent(left, right), true);
});

// PHASE4BUILD §1.25 (Phase 4 PR 3b, carry-in C-3): the draft RPCs store
// nullable text through nullif(trim(x), ''), so a snapshot holding '' (the
// seed, a CSV import) must compare EQUAL to the restored draft's null — the
// first Redo after a seed used to clear both stacks on exactly that mismatch.
test("draftStatesEquivalent treats '', '  ' and null as one value on the columns the RPCs normalise", () => {
  const { NORMALISED_SEAT_TEXT_COLUMNS, NORMALISED_EMPLOYEE_TEXT_COLUMNS } = draftHistory;
  assert.deepEqual([...NORMALISED_SEAT_TEXT_COLUMNS], ["notes", "zone", "department"]);
  assert.deepEqual([...NORMALISED_EMPLOYEE_TEXT_COLUMNS], ["position", "department", "phone_extension", "avatar_url"]);
  for (const column of NORMALISED_SEAT_TEXT_COLUMNS) {
    const blank = snapshot("A", "Ann"); blank.seats[0][column] = "";
    const padded = snapshot("A", "Ann"); padded.seats[0][column] = "   ";
    const nulled = snapshot("A", "Ann"); nulled.seats[0][column] = null;
    assert.equal(draftHistory.draftStatesEquivalent(blank, nulled), true, `seat.${column}: '' ≡ null`);
    assert.equal(draftHistory.draftStatesEquivalent(padded, nulled), true, `seat.${column}: '  ' ≡ null`);
    const edited = snapshot("A", "Ann"); edited.seats[0][column] = "a";
    assert.equal(draftHistory.draftStatesEquivalent(edited, nulled), false, `seat.${column}: a real edit still differs`);
    const paddedEdit = snapshot("A", "Ann"); paddedEdit.seats[0][column] = "  a ";
    assert.equal(draftHistory.draftStatesEquivalent(paddedEdit, edited), true, `seat.${column}: trimmed like the SQL`);
  }
  for (const column of NORMALISED_EMPLOYEE_TEXT_COLUMNS) {
    const blank = snapshot("A", "Ann"); blank.employees[0][column] = ""; blank.seats[0].employee[column] = "";
    const nulled = snapshot("A", "Ann"); nulled.employees[0][column] = null; nulled.seats[0].employee[column] = null;
    assert.equal(draftHistory.draftStatesEquivalent(blank, nulled), true, `employee.${column}: '' ≡ null (directory and the seat's stitched employee)`);
    const edited = snapshot("A", "Ann"); edited.employees[0][column] = "x"; edited.seats[0].employee[column] = "x";
    assert.equal(draftHistory.draftStatesEquivalent(edited, nulled), false, `employee.${column}: a real edit still differs`);
  }
  // Columns the SQL does NOT normalise stay strict: '' and null differ on full_name.
  const blankName = snapshot("A", "Ann"); blankName.employees[0].full_name = "";
  const nullName = snapshot("A", "Ann"); nullName.employees[0].full_name = null;
  assert.equal(draftHistory.draftStatesEquivalent(blankName, nullName), false);
  assert.equal(draftHistory.normalizeNullableText("  x "), "x");
  assert.equal(draftHistory.normalizeNullableText(""), null);
  assert.equal(draftHistory.normalizeNullableText(undefined), null);
  assert.equal(draftHistory.normalizeNullableText(3), 3);
});

test("draftStatesEquivalent detects a foreign edit hiding behind fresh timestamps", () => {
  const left = snapshot("W01", "Alex");
  const right = snapshot("W01", "Alex");
  right.seats[0].notes = "edited by another admin";

  assert.equal(draftHistory.draftStatesEquivalent(left, right), false);
});

test("draftStatesEquivalent detects assignment, employee, and set differences", () => {
  const base = snapshot("W01", "Alex");

  const vacated = snapshot("W01", "Alex");
  vacated.seats[0].employee_id = null;
  vacated.seats[0].employee = null;
  vacated.seats[0].status = "available";
  assert.equal(draftHistory.draftStatesEquivalent(base, vacated), false);

  const renamed = snapshot("W01", "Alex");
  renamed.employees[0].full_name = "Alexandra";
  assert.equal(draftHistory.draftStatesEquivalent(base, renamed), false);

  const extraSeat = snapshot("W01", "Alex");
  extraSeat.seats.push({ ...base.seats[0], id: "seat-W02", seat_key: "w02", label: "W02" });
  assert.equal(draftHistory.draftStatesEquivalent(base, extraSeat), false);
});

test("draftStatesEquivalent is order-independent for seats and employees", () => {
  const left = snapshot("W01", "Alex");
  left.seats.push({ ...left.seats[0], id: "seat-W02", seat_key: "w02", label: "W02", employee_id: null, employee: null, status: "available" });

  const right = draftHistory.createDraftSnapshot([...left.seats].reverse(), [...left.employees]);
  assert.equal(draftHistory.draftStatesEquivalent(left, right), true);
});

// Persistence: the stacks round-trip through sessionStorage so a reload keeps
// undo working — but only when the live draft still matches the state the
// stacks left it in (the same adjacency rule that guards each undo click).

test("draft history serializes and deserializes losslessly", () => {
  const pushed = draftHistory.pushDraftHistory(draftHistory.createDraftHistory(), {
    label: "Assign W01",
    before: snapshot("W01"),
    after: snapshot("W01", "Alex Admin")
  });
  const undone = draftHistory.undoDraftHistory(pushed);

  const restored = draftHistory.deserializeDraftHistory(draftHistory.serializeDraftHistory(undone.history));

  assert.deepEqual(restored, undone.history);
  assert.equal(draftHistory.canRedoDraftHistory(restored), true);
});

test("deserializeDraftHistory rejects garbage, foreign versions, and malformed entries", () => {
  assert.equal(draftHistory.deserializeDraftHistory(null), null);
  assert.equal(draftHistory.deserializeDraftHistory(""), null);
  assert.equal(draftHistory.deserializeDraftHistory("not json {"), null);
  assert.equal(draftHistory.deserializeDraftHistory(JSON.stringify({ version: 999, history: { undoStack: [], redoStack: [] } })), null);
  assert.equal(draftHistory.deserializeDraftHistory(JSON.stringify({ version: 1 })), null);
  assert.equal(draftHistory.deserializeDraftHistory(JSON.stringify({ version: 1, history: { undoStack: [{ label: "x" }], redoStack: [] } })), null);
  assert.equal(
    draftHistory.deserializeDraftHistory(JSON.stringify({ version: 1, history: { undoStack: [{ label: "x", before: { seats: [] }, after: { seats: [], employees: [] } }], redoStack: [] } })),
    null
  );
});

test("persisted history is adopted only while the live draft matches its edge snapshots", () => {
  const before = snapshot("W01");
  const after = snapshot("W01", "Alex Admin");
  const pushed = draftHistory.pushDraftHistory(draftHistory.createDraftHistory(), {
    label: "Assign W01",
    before,
    after
  });

  // Reload with an unchanged draft (fresh timestamps only): adoptable.
  const freshCurrent = snapshot("W01", "Alex Admin");
  freshCurrent.seats[0].updated_at = "2026-07-14T09:00:00+00:00";
  assert.equal(draftHistory.canAdoptPersistedHistory(pushed, freshCurrent), true);

  // The draft moved on while the history sat in storage: not adoptable.
  const foreignEdit = snapshot("W01", "Alex Admin");
  foreignEdit.seats[0].notes = "edited elsewhere";
  assert.equal(draftHistory.canAdoptPersistedHistory(pushed, foreignEdit), false);

  // After an undo the live draft must equal the newest redo entry's `before`.
  const undone = draftHistory.undoDraftHistory(pushed);
  assert.equal(draftHistory.canAdoptPersistedHistory(undone.history, before), true);
  assert.equal(draftHistory.canAdoptPersistedHistory(undone.history, after), false);

  // Empty stacks carry nothing worth adopting.
  assert.equal(draftHistory.canAdoptPersistedHistory(draftHistory.createDraftHistory(), before), false);
});

// --- Entry labels -----------------------------------------------------------
//
// The label is load-bearing, not just display text: redo parses it back to
// learn which seat an "Add" entry created so it can reselect that seat. Builder
// and parser previously lived ~500 lines apart in SeatMap.tsx with nothing
// pinning the format between them.

function labelSeat(overrides = {}) {
  return { id: "s1", label: "W13", status: "available", employee_id: null, ...overrides };
}

function snapshotOf(seats) {
  return { seats, employees: [] };
}

test("an added-seat label round-trips through build and parse", () => {
  const built = draftHistory.addedSeatHistoryLabel("W13");
  assert.equal(built, "Add W13");
  assert.equal(draftHistory.parseAddedSeatLabel(built), "W13");
});

test("labels containing spaces and punctuation survive the round-trip", () => {
  for (const seatLabel of ["W13", "South Office 2", "CW-01", "Add"]) {
    assert.equal(
      draftHistory.parseAddedSeatLabel(draftHistory.addedSeatHistoryLabel(seatLabel)),
      seatLabel,
      `round-trip should preserve ${seatLabel}`
    );
  }
});

test("parseAddedSeatLabel returns null for every non-add entry", () => {
  // Null means "nothing to reselect", which is correct for these.
  for (const other of ["Move W13", "Vacate W13", "Undo", "Added W13", "add W13", ""]) {
    assert.equal(draftHistory.parseAddedSeatLabel(other), null, `${other} is not an add entry`);
  }
});

test("describeSeatUpdate names the assignment transitions before the status change", () => {
  // Assigning and vacating also move the status, so they must be reported as
  // themselves rather than as the vaguer "Change status".
  const assignedBefore = snapshotOf([labelSeat({ employee_id: "emp-1", status: "assigned" })]);
  const openBefore = snapshotOf([labelSeat()]);

  assert.equal(
    draftHistory.describeSeatUpdate(assignedBefore, labelSeat({ employee_id: null, status: "available" })),
    "Vacate W13"
  );
  assert.equal(
    draftHistory.describeSeatUpdate(openBefore, labelSeat({ employee_id: "emp-1", status: "assigned" })),
    "Assign W13"
  );
  assert.equal(
    draftHistory.describeSeatUpdate(assignedBefore, labelSeat({ employee_id: "emp-2", status: "assigned" })),
    "Reassign W13"
  );
});

test("describeSeatUpdate falls back to status and then to a generic update", () => {
  const openBefore = snapshotOf([labelSeat()]);

  assert.equal(
    draftHistory.describeSeatUpdate(openBefore, labelSeat({ status: "reserved" })),
    "Change status W13"
  );
  assert.equal(draftHistory.describeSeatUpdate(openBefore, labelSeat()), "Update W13");
  // A seat absent from the before-snapshot has no transition to describe.
  assert.equal(draftHistory.describeSeatUpdate(snapshotOf([]), labelSeat()), "Update W13");
});
