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

const { buildSeatSwapPlan } = await importTsModule("lib/seatSwap.ts");

function employee(name) {
  return {
    id: `emp-${name.toLowerCase().replace(/\s+/g, "-")}`,
    full_name: name,
    position: null,
    department: null,
    phone_extension: null,
    avatar_url: null,
    active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z"
  };
}

function seat(label, occupant = null, status = "available") {
  const assignedEmployee = occupant ? employee(occupant) : null;
  return {
    id: `seat-${label}`,
    label,
    status: assignedEmployee ? "assigned" : status,
    employee_id: assignedEmployee?.id ?? null,
    employee: assignedEmployee
  };
}

test("seat swap plan swaps assigned employees without moving marker data", () => {
  const plan = buildSeatSwapPlan(seat("W01", "Alex Admin"), seat("W02", "Jordan Manager"));

  assert.deepEqual(plan.sourcePatch, {
    seatId: "seat-W01",
    employeeId: "emp-jordan-manager",
    status: "assigned"
  });
  assert.deepEqual(plan.targetPatch, {
    seatId: "seat-W02",
    employeeId: "emp-alex-admin",
    status: "assigned"
  });
  assert.equal("x" in plan.sourcePatch, false);
  assert.equal("y" in plan.sourcePatch, false);
  assert.equal(plan.summary.sourceNextEmployeeName, "Jordan Manager");
  assert.equal(plan.summary.targetNextEmployeeName, "Alex Admin");
});

test("seat swap plan supports assigned-to-open swaps", () => {
  const plan = buildSeatSwapPlan(seat("W01", "Alex Admin"), seat("W02"));

  assert.deepEqual(plan.sourcePatch, {
    seatId: "seat-W01",
    employeeId: null,
    status: "available"
  });
  assert.deepEqual(plan.targetPatch, {
    seatId: "seat-W02",
    employeeId: "emp-alex-admin",
    status: "assigned"
  });
});

test("seat swap plan preserves reserved open seat state when assignment moves out", () => {
  const plan = buildSeatSwapPlan(seat("W01", "Alex Admin"), seat("W02", null, "reserved"));

  assert.deepEqual(plan.sourcePatch, {
    seatId: "seat-W01",
    employeeId: null,
    status: "reserved"
  });
  assert.deepEqual(plan.targetPatch, {
    seatId: "seat-W02",
    employeeId: "emp-alex-admin",
    status: "assigned"
  });
});

test("seat swap plan supports open-to-assigned swaps", () => {
  const plan = buildSeatSwapPlan(seat("W01", null, "reserved"), seat("W02", "Jordan Manager"));

  assert.deepEqual(plan.sourcePatch, {
    seatId: "seat-W01",
    employeeId: "emp-jordan-manager",
    status: "assigned"
  });
  assert.deepEqual(plan.targetPatch, {
    seatId: "seat-W02",
    employeeId: null,
    status: "reserved"
  });
});

test("seat swap plan rejects invalid swap targets", () => {
  assert.throws(
    () => buildSeatSwapPlan(seat("W01"), seat("W02")),
    /at least one assigned seat/
  );

  assert.throws(
    () => buildSeatSwapPlan(seat("W01", "Alex Admin"), seat("W01", "Alex Admin")),
    /different target seat/
  );
});
