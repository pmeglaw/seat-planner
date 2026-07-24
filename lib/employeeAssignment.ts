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
 * Contact fact rows for the inspector, keeping only fields with something on
 * file. Rendering "—" for missing email/extension made the directory read as
 * broken when most profiles are sparse (2026-07-16 critique carryover) — an
 * absent row says "nothing recorded" more honestly than a dash. Order is
 * fixed: Email, Extension. Department is deliberately NOT a row: the header
 * role line (position · department) already names it, and the duplicate row
 * was the inspector's last reading-order defect (2026-07-23 dedup).
 */
export type ContactFactRow = { label: "Email" | "Extension"; value: string };

export function buildContactRows(input: {
  email?: string | null;
  extension?: string | null;
}): ContactFactRow[] {
  const rows: ContactFactRow[] = [];
  const email = input.email?.trim();
  const extension = input.extension?.trim();
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
