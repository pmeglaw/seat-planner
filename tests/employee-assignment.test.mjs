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

const { employeeAssignmentFields } = await importTsModule("lib/employeeAssignment.ts");

function employee(overrides = {}) {
  return {
    id: "emp-1",
    full_name: "Alex Megerdchian",
    position: "Managing Partner",
    department: "Exec",
    phone_extension: "201",
    avatar_url: null,
    active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides
  };
}

test("mirrors the chosen employee's record into the form fields", () => {
  const fields = employeeAssignmentFields(employee());

  assert.deepEqual(fields, {
    employeeId: "emp-1",
    employeeName: "Alex Megerdchian",
    employeePosition: "Managing Partner",
    phoneExtension: "201",
    department: "Exec",
    status: "assigned"
  });
});

test("blanks the department when the employee has none — never keeps the previous occupant's", () => {
  const currentForm = {
    employeeId: "emp-0",
    employeeName: "Previous Occupant",
    employeePosition: "Paralegal",
    phoneExtension: "119",
    department: "IT",
    status: "assigned",
    notes: "corner desk"
  };

  const next = { ...currentForm, ...employeeAssignmentFields(employee({ department: null })) };

  assert.equal(next.department, "", "stale department must not carry over to the new occupant");
  assert.equal(next.employeeId, "emp-1");
  assert.equal(next.status, "assigned");
  assert.equal(next.notes, "corner desk", "fields outside the assignment patch stay untouched");
});

test("null position and extension become empty strings, not carried-over values", () => {
  const currentForm = { employeePosition: "Paralegal", phoneExtension: "119", department: "IT" };
  const next = { ...currentForm, ...employeeAssignmentFields(employee({ position: null, phone_extension: null, department: null })) };

  assert.equal(next.employeePosition, "");
  assert.equal(next.phoneExtension, "");
  assert.equal(next.department, "");
});
