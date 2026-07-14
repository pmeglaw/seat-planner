import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function importTsModule(relativePath) {
  const source = await readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022
    }
  });
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString("base64")}`;
  return import(moduleUrl);
}

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
