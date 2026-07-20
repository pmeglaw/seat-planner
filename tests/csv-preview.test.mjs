import assert from "node:assert/strict";
import test from "node:test";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";

// Exercises the REAL lib/csv.ts preview path. Previously this file invented a
// `validateRow` helper that does not exist in the source and tested that copy.
const { createAssignmentCsvTemplate, ASSIGNMENT_CSV_HEADERS, parseAssignmentCsv } =
  await importTsModule("lib/csv.ts");

const HEADER_ROW = ASSIGNMENT_CSV_HEADERS.join(",");

test("CSV template includes only safe assignment headers", () => {
  assert.equal(
    createAssignmentCsvTemplate(),
    "seat_label,employee_name,employee_email,position,department,zone,status,notes\n"
  );
});

test("CSV preview surfaces reserved rows that still include employees", () => {
  const preview = parseAssignmentCsv(`${HEADER_ROW}\nN01,Jane Doe,,,,,reserved,\n`);
  const issue = preview.issues.find(entry => /cannot be reserved/.test(entry.message));
  assert.ok(issue, "expected a reserved-with-employee issue");
  assert.equal(issue.row, 2);
});

test("CSV preview keeps a clean bill for a valid assignment row", () => {
  const preview = parseAssignmentCsv(`${HEADER_ROW}\nN01,Jane Doe,,Case Manager,Intake,North Pod,assigned,\n`);
  assert.deepEqual(preview.issues, []);
});
