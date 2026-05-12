import assert from "node:assert/strict";
import test from "node:test";

const headers = ["seat_label", "employee_name", "employee_email", "position", "department", "zone", "status", "notes"];

function createAssignmentCsvTemplate() {
  return `${headers.join(",")}\n`;
}

function validateRow(row, rowNumber) {
  const issues = [];
  if ((row.status === "reserved" || row.status === "unavailable") && row.employee_name.trim()) {
    issues.push({ row: rowNumber, message: "Rows with employee_name cannot be reserved or unavailable. Use assigned, or remove employee_name." });
  }
  if (row.status === "assigned" && !row.employee_name.trim()) {
    issues.push({ row: rowNumber, message: "Assigned rows require employee_name." });
  }
  return issues;
}

test("CSV template includes only safe assignment headers", () => {
  assert.equal(createAssignmentCsvTemplate(), "seat_label,employee_name,employee_email,position,department,zone,status,notes\n");
});

test("CSV validation rejects reserved rows that still include employees", () => {
  const issues = validateRow({ seat_label: "N01", employee_name: "Jane Doe", status: "reserved" }, 2);
  assert.equal(issues.length, 1);
  assert.match(issues[0].message, /cannot be reserved/);
});
