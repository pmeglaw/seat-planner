import assert from "node:assert/strict";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";
import test from "node:test";
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

// 2026-07-16 critique carryover fix: the inspector's Occupant section hides
// fields with nothing on file instead of rendering "—" dash rows (which made
// the directory read as broken when 6/8 employees lack contact details).
const { buildOccupantRows } = await importTsModule("lib/employeeAssignment.ts");

test("buildOccupantRows keeps only fields that have values, in Department/Email/Extension order", () => {
  const rows = buildOccupantRows({ department: "Intake", email: "pam@firm.com", extension: "202" });
  assert.deepEqual(rows, [
    { label: "Department", value: "Intake" },
    { label: "Email", value: "pam@firm.com" },
    { label: "Extension", value: "202" }
  ]);
});

test("buildOccupantRows drops empty, null, and whitespace-only fields", () => {
  const rows = buildOccupantRows({ department: "Intake", email: null, extension: "   " });
  assert.deepEqual(rows, [{ label: "Department", value: "Intake" }]);
});

test("buildOccupantRows returns an empty list when nothing is on file", () => {
  assert.deepEqual(buildOccupantRows({ department: undefined, email: "", extension: null }), []);
});

test("buildOccupantRows trims surrounding whitespace from kept values", () => {
  const rows = buildOccupantRows({ department: " Intake ", email: null, extension: null });
  assert.deepEqual(rows, [{ label: "Department", value: "Intake" }]);
});
