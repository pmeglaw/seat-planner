import type { Employee } from "@/lib/types";

/**
 * Inspector form-field patch for choosing an occupant.
 *
 * Every employee-derived field mirrors the chosen employee's record —
 * including an EMPTY department when the employee has none. Falling back to
 * the field's previous value here would silently carry the prior occupant's
 * department over to the new occupant.
 */
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
