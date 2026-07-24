import assert from "node:assert/strict";
import test from "node:test";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";

// Exercises the REAL lib/csv.ts. Previously this file re-implemented the CSV
// parser/serializer inline (with a different issue shape), so the shipped
// import/export code never ran under test.
const {
  ASSIGNMENT_CSV_HEADERS,
  parseCsv,
  parseAssignmentCsv,
  stringifyCsv,
  createAssignmentCsvTemplate,
  exportSeatsToAssignmentCsv
} = await importTsModule("lib/csv.ts");

const HEADER_ROW = ASSIGNMENT_CSV_HEADERS.join(",");
const messages = result => result.issues.map(issue => issue.message);

test("CSV parser accepts assignment rows", () => {
  const result = parseAssignmentCsv(
    `${HEADER_ROW}\nN01,Jane Doe,jane@example.com,Case Manager,Intake,North Pod,assigned,Near window\n`
  );
  assert.deepEqual(result.issues, []);
  assert.equal(result.rows[0].seat_label, "N01");
  assert.equal(result.rows[0].employee_name, "Jane Doe");
  assert.equal(result.rows[0].status, "assigned");
});

test("CSV parser reports issues as {row, message} objects", () => {
  const result = parseAssignmentCsv(`${HEADER_ROW}\nN01,,,,North Pod,North Pod,assigned,\n`);
  assert.deepEqual(result.issues, [{ row: 2, message: "Assigned rows require employee_name." }]);
});

test("CSV parser rejects employee names on reserved or unavailable rows", () => {
  const result = parseAssignmentCsv(
    `${HEADER_ROW}\nN01,Jane Doe,jane@example.com,Case Manager,Intake,North Pod,reserved,\nN02,John Doe,john@example.com,Case Manager,Intake,North Pod,unavailable,\n`
  );
  assert.deepEqual(messages(result), [
    "Rows with employee_name cannot be reserved.",
    "Rows with employee_name cannot be unavailable."
  ]);
});

test("CSV parser rejects invalid status values", () => {
  const result = parseAssignmentCsv(`${HEADER_ROW}\nN01,,,,North Pod,North Pod,teleporting,\n`);
  assert.ok(messages(result).some(message => /Invalid status 'teleporting'\./.test(message)));
});

test("CSV parser rejects duplicate seat rows", () => {
  const result = parseAssignmentCsv(
    `${HEADER_ROW}\nN01,,,,North Pod,North Pod,available,\nN01,,,,North Pod,North Pod,available,\n`
  );
  assert.deepEqual(messages(result), ["Duplicate seat row 'N01'."]);
});

test("CSV parser rejects duplicate employee names even when emails differ", () => {
  const result = parseAssignmentCsv(
    `${HEADER_ROW}\nN01,Jane Doe,jane@example.com,Case Manager,Intake,North Pod,assigned,\nN02,Jane Doe,jane.alt@example.com,Case Manager,Intake,North Pod,assigned,\n`
  );
  assert.deepEqual(messages(result), ["Employee 'Jane Doe' appears as assigned more than once."]);
});

test("CSV parser rejects email-only employee identity", () => {
  const result = parseAssignmentCsv(`${HEADER_ROW}\nN01,,jane@example.com,Case Manager,Intake,North Pod,available,\n`);
  assert.deepEqual(messages(result), ["employee_email requires employee_name."]);
});

test("CSV parser flags missing required columns and empty input", () => {
  assert.deepEqual(parseAssignmentCsv("").issues, [{ row: 1, message: "CSV is empty." }]);
  const missing = parseAssignmentCsv("seat_label,employee_name\nN01,Jane Doe\n");
  assert.ok(messages(missing).some(message => /Missing required columns:/.test(message)));
});

test("parseCsv keeps newlines that are inside quoted cells", () => {
  const rows = parseCsv(`seat_label,notes\nN01,"line one\nline two"\n`);
  assert.deepEqual(rows, [
    ["seat_label", "notes"],
    ["N01", "line one\nline two"]
  ]);
});

test("CSV template exposes only the safe assignment headers", () => {
  assert.equal(createAssignmentCsvTemplate(), `${HEADER_ROW}\n`);
});

test("CSV stringifier escapes commas and quotes", () => {
  const csv = stringifyCsv([
    {
      seat_label: "N01",
      employee_name: "Doe, Jane",
      employee_email: "",
      position: 'Lead "QA"',
      department: "QA",
      zone: "North",
      status: "assigned",
      notes: ""
    }
  ]);
  assert.match(csv, /"Doe, Jane"/);
  assert.match(csv, /"Lead ""QA"""/);
});

test("exportSeatsToAssignmentCsv round-trips cleanly back through the parser", () => {
  const csv = exportSeatsToAssignmentCsv([
    {
      label: "N01",
      status: "assigned",
      zone: "North Pod",
      department: "Intake",
      notes: "Near window",
      employee: { full_name: "Jane Doe", position: "Case Manager", department: "Intake" }
    }
  ]);
  const parsed = parseAssignmentCsv(csv);
  assert.deepEqual(parsed.issues, []);
  assert.equal(parsed.rows[0].seat_label, "N01");
  assert.equal(parsed.rows[0].employee_name, "Jane Doe");
  assert.equal(parsed.rows[0].zone, "North Pod");
});

test("exportSeatsToAssignmentCsv guards cells that start with a formula trigger", () => {
  const csv = exportSeatsToAssignmentCsv([
    {
      label: "N02",
      status: "assigned",
      zone: "North Pod",
      department: "Intake",
      notes: "+cmd",
      employee: { full_name: "=SUM(A1:A9)", position: "-x", department: "@ref" }
    }
  ]);
  assert.match(csv, /'=SUM\(A1:A9\)/);
  assert.match(csv, /'-x/);
  assert.match(csv, /'@ref/);
  assert.match(csv, /'\+cmd/);
});

test("a formula-guarded export round-trips losslessly back through the parser", () => {
  const csv = exportSeatsToAssignmentCsv([
    {
      label: "N02",
      status: "assigned",
      zone: "North Pod",
      department: "Intake",
      notes: "+cmd",
      employee: { full_name: "=SUM(A1:A9)", position: "-x", department: "@ref" }
    }
  ]);
  const parsed = parseAssignmentCsv(csv);
  assert.deepEqual(parsed.issues, []);
  assert.equal(parsed.rows[0].employee_name, "=SUM(A1:A9)");
  assert.equal(parsed.rows[0].position, "-x");
  assert.equal(parsed.rows[0].department, "@ref");
  assert.equal(parsed.rows[0].notes, "+cmd");
});

test("CSV parser preserves a leading apostrophe that isn't guarding a formula trigger", () => {
  const result = parseAssignmentCsv(
    `${HEADER_ROW}\nN03,'Tis Studios,,Lead,Ops,North Pod,assigned,\n`
  );
  assert.deepEqual(result.issues, []);
  assert.equal(result.rows[0].employee_name, "'Tis Studios");
});
