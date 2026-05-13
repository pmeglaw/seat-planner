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
