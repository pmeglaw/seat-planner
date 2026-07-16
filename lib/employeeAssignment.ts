import type { Employee } from "@/lib/types";

/**
 * Inspector form-field patch for choosing an occupant.
 *
 * Every employee-derived field mirrors the chosen employee's record —
 * including an EMPTY department when the employee has none. Falling back to
 * the field's previous value here would silently carry the prior occupant's
 * department over to the new occupant.
 */
/**
 * Occupant fact rows for the inspector, keeping only fields with something on
 * file. Rendering "—" for missing email/extension made the directory read as
 * broken when most profiles are sparse (2026-07-16 critique carryover) — an
 * absent row says "nothing recorded" more honestly than a dash. Order is
 * fixed: Department, Email, Extension.
 */
export type OccupantFactRow = { label: "Department" | "Email" | "Extension"; value: string };

export function buildOccupantRows(input: {
  department?: string | null;
  email?: string | null;
  extension?: string | null;
}): OccupantFactRow[] {
  const rows: OccupantFactRow[] = [];
  const department = input.department?.trim();
  const email = input.email?.trim();
  const extension = input.extension?.trim();
  if (department) rows.push({ label: "Department", value: department });
  if (email) rows.push({ label: "Email", value: email });
  if (extension) rows.push({ label: "Extension", value: extension });
  return rows;
}

export function employeeAssignmentFields(employee: Employee) {
  return {
    employeeId: employee.id,
    employeeName: employee.full_name,
    employeePosition: employee.position ?? "",
    phoneExtension: employee.phone_extension ?? "",
    department: employee.department ?? "",
    status: "assigned" as const
  };
}
