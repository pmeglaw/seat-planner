import assert from "node:assert/strict";
import test from "node:test";

const headers = ["seat_label", "employee_name", "employee_email", "position", "department", "zone", "status", "notes"];

function parseCsvLine(line) {
  const cells = [];
  let cell = "";
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];
    if (char === '"' && inQuotes && nextChar === '"') {
      cell += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      cells.push(cell);
      cell = "";
      continue;
    }
    cell += char;
  }
  cells.push(cell);
  return cells.map(value => value.trim());
}

function parseAssignmentCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  const parsedHeaders = parseCsvLine(lines[0]).map(value => value.trim().toLowerCase());
  const issues = [];
  for (const header of headers) {
    if (!parsedHeaders.includes(header)) issues.push(`Missing ${header}`);
  }
  const rows = lines.slice(1).map((line, rowIndex) => {
    const cells = parseCsvLine(line);
    const row = Object.fromEntries(headers.map(header => [header, ""]));
    parsedHeaders.forEach((header, index) => {
      if (header in row) row[header] = cells[index] ?? "";
    });
    if (!row.seat_label) issues.push(`Row ${rowIndex + 2}: Seat label is required.`);
    if (row.status === "assigned" && !row.employee_name) issues.push(`Row ${rowIndex + 2}: Assigned rows require employee_name.`);
    if ((row.status === "reserved" || row.status === "unavailable") && row.employee_name) {
      issues.push(`Row ${rowIndex + 2}: Rows with employee_name cannot be ${row.status}.`);
    }
    if (row.employee_email && !row.employee_name) {
      issues.push(`Row ${rowIndex + 2}: employee_email requires employee_name.`);
    }
    return row;
  });
  const seenSeats = new Set();
  const seenAssignedEmployees = new Set();
  rows.forEach((row, rowIndex) => {
    const seatKey = row.seat_label.trim().toLowerCase();
    if (seatKey) {
      if (seenSeats.has(seatKey)) issues.push(`Row ${rowIndex + 2}: Duplicate seat row '${row.seat_label}'.`);
      seenSeats.add(seatKey);
    }
    if (row.employee_name.trim() && row.status !== "reserved" && row.status !== "unavailable") {
      const employeeKey = row.employee_name.trim().toLowerCase();
      if (seenAssignedEmployees.has(employeeKey)) {
        issues.push(`Row ${rowIndex + 2}: Employee '${row.employee_name}' appears as assigned more than once.`);
      }
      seenAssignedEmployees.add(employeeKey);
    }
  });
  return { rows, issues };
}

function escapeCsvCell(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function stringifyCsv(rows) {
  return [headers.join(","), ...rows.map(row => headers.map(header => escapeCsvCell(row[header])).join(","))].join("\n") + "\n";
}

test("CSV parser accepts assignment rows", () => {
  const result = parseAssignmentCsv(`seat_label,employee_name,employee_email,position,department,zone,status,notes\nN01,Jane Doe,jane@example.com,Case Manager,Intake,North Pod,assigned,Near window\n`);
  assert.equal(result.issues.length, 0);
  assert.equal(result.rows[0].seat_label, "N01");
  assert.equal(result.rows[0].employee_name, "Jane Doe");
});

test("CSV parser rejects assigned rows without employee name", () => {
  const result = parseAssignmentCsv(`seat_label,employee_name,employee_email,position,department,zone,status,notes\nN01,,,,North Pod,North Pod,assigned,\n`);
  assert.equal(result.issues.length, 1);
});

test("CSV parser rejects employee names on reserved or unavailable rows", () => {
  const result = parseAssignmentCsv(`seat_label,employee_name,employee_email,position,department,zone,status,notes\nN01,Jane Doe,jane@example.com,Case Manager,Intake,North Pod,reserved,\nN02,John Doe,john@example.com,Case Manager,Intake,North Pod,unavailable,\n`);
  assert.deepEqual(result.issues, [
    "Row 2: Rows with employee_name cannot be reserved.",
    "Row 3: Rows with employee_name cannot be unavailable."
  ]);
});

test("CSV parser rejects duplicate employee names even when emails differ", () => {
  const result = parseAssignmentCsv(`seat_label,employee_name,employee_email,position,department,zone,status,notes\nN01,Jane Doe,jane@example.com,Case Manager,Intake,North Pod,assigned,\nN02,Jane Doe,jane.alt@example.com,Case Manager,Intake,North Pod,assigned,\n`);
  assert.deepEqual(result.issues, ["Row 3: Employee 'Jane Doe' appears as assigned more than once."]);
});

test("CSV parser rejects email-only employee identity", () => {
  const result = parseAssignmentCsv(`seat_label,employee_name,employee_email,position,department,zone,status,notes\nN01,,jane@example.com,Case Manager,Intake,North Pod,available,\n`);
  assert.deepEqual(result.issues, ["Row 2: employee_email requires employee_name."]);
});

test("CSV stringifier escapes commas and quotes", () => {
  const csv = stringifyCsv([{ seat_label: "N01", employee_name: "Doe, Jane", employee_email: "", position: "Lead \"QA\"", department: "QA", zone: "North", status: "assigned", notes: "" }]);
  assert.match(csv, /"Doe, Jane"/);
  assert.match(csv, /"Lead ""QA"""/);
});
