import type { CsvAssignmentRow, SeatStatus, SeatWithEmployee } from "@/lib/types";
import { SEAT_STATUSES } from "@/lib/types";

export const ASSIGNMENT_CSV_HEADERS = [
  "seat_label",
  "employee_name",
  "employee_email",
  "position",
  "department",
  "zone",
  "status",
  "notes"
] as const;

export type AssignmentCsvHeader = typeof ASSIGNMENT_CSV_HEADERS[number];

export type CsvValidationIssue = {
  row: number;
  message: string;
};

export type CsvValidationResult = {
  rows: CsvAssignmentRow[];
  issues: CsvValidationIssue[];
};

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
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

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  let currentLine = "";
  let inQuotes = false;

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const nextChar = normalized[index + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      currentLine += char + nextChar;
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      currentLine += char;
      continue;
    }

    if (char === "\n" && !inQuotes) {
      if (currentLine.trim()) rows.push(parseCsvLine(currentLine));
      currentLine = "";
      continue;
    }

    currentLine += char;
  }

  if (currentLine.trim()) rows.push(parseCsvLine(currentLine));
  return rows;
}

function emptyAssignmentRow(): CsvAssignmentRow {
  return {
    seat_label: "",
    employee_name: "",
    employee_email: "",
    position: "",
    department: "",
    zone: "",
    status: "",
    notes: ""
  };
}

export function parseAssignmentCsv(text: string): CsvValidationResult {
  const rawRows = parseCsv(text);
  if (rawRows.length === 0) {
    return { rows: [], issues: [{ row: 1, message: "CSV is empty." }] };
  }

  const headers = rawRows[0].map(normalizeHeader);
  const issues: CsvValidationIssue[] = [];
  const missingHeaders = ASSIGNMENT_CSV_HEADERS.filter(header => !headers.includes(header));
  if (missingHeaders.length > 0) {
    issues.push({ row: 1, message: `Missing required columns: ${missingHeaders.join(", ")}.` });
  }

  const rows = rawRows.slice(1).map((cells, rowIndex) => {
    const row = emptyAssignmentRow();
    headers.forEach((header, cellIndex) => {
      if (ASSIGNMENT_CSV_HEADERS.includes(header as AssignmentCsvHeader)) {
        row[header as AssignmentCsvHeader] = cells[cellIndex]?.trim() ?? "";
      }
    });

    if (!row.seat_label) {
      issues.push({ row: rowIndex + 2, message: "Seat label is required." });
    }

    if (row.status && !SEAT_STATUSES.includes(row.status.toLowerCase() as SeatStatus)) {
      issues.push({ row: rowIndex + 2, message: `Invalid status '${row.status}'.` });
    }

    if (row.status.toLowerCase() === "assigned" && !row.employee_name.trim()) {
      issues.push({ row: rowIndex + 2, message: "Assigned rows require employee_name." });
    }

    return {
      ...row,
      status: row.status.toLowerCase()
    };
  });

  const seenSeats = new Set<string>();
  const seenAssignedEmployees = new Set<string>();
  rows.forEach((row, index) => {
    const seatKey = row.seat_label.trim().toLowerCase();
    if (seatKey) {
      if (seenSeats.has(seatKey)) issues.push({ row: index + 2, message: `Duplicate seat row '${row.seat_label}'.` });
      seenSeats.add(seatKey);
    }

    if (row.employee_name.trim() && (row.status === "assigned" || !row.status)) {
      const employeeKey = row.employee_email.trim().toLowerCase() || row.employee_name.trim().toLowerCase();
      if (seenAssignedEmployees.has(employeeKey)) {
        issues.push({ row: index + 2, message: `Employee '${row.employee_name}' appears as assigned more than once.` });
      }
      seenAssignedEmployees.add(employeeKey);
    }
  });

  return { rows, issues };
}

function escapeCsvCell(value: unknown) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function stringifyCsv(rows: Record<string, unknown>[], headers: readonly string[] = ASSIGNMENT_CSV_HEADERS) {
  const lines = [headers.map(escapeCsvCell).join(",")];
  rows.forEach(row => {
    lines.push(headers.map(header => escapeCsvCell(row[header])).join(","));
  });
  return `${lines.join("\n")}\n`;
}

export function exportSeatsToAssignmentCsv(seats: SeatWithEmployee[]) {
  return stringifyCsv(
    seats.map(seat => ({
      seat_label: seat.label,
      employee_name: seat.employee?.full_name ?? "",
      employee_email: "",
      position: seat.employee?.position ?? "",
      department: seat.employee?.department ?? "",
      zone: seat.zone ?? seat.department ?? "",
      status: seat.status,
      notes: seat.notes ?? ""
    }))
  );
}
