import type { DepartmentOption, Employee } from "@/lib/types";

/**
 * Single source of truth for department name handling (audit finding E1).
 *
 * Departments are stored as free text on employees plus a name-keyed
 * department_options side table. Until the relational (FK) migration lands,
 * every surface that compares, counts, or lists departments must go through
 * these helpers so the four historical derivations cannot disagree again.
 */

/** Display-normalize a department name: trim + collapse inner whitespace. */
export function normalizeDepartmentName(value: string | null | undefined): string | null {
  const collapsed = (value ?? "").replace(/\s+/g, " ").trim();
  return collapsed.length > 0 ? collapsed : null;
}

/** Comparison key for a department name (case-insensitive, whitespace-safe). */
export function departmentKey(value: string | null | undefined): string | null {
  const name = normalizeDepartmentName(value);
  return name ? name.toLowerCase() : null;
}

export type DepartmentRosterRow = {
  /** Case-insensitive comparison key. */
  key: string;
  /** Display name — the managed option's spelling when one exists. */
  name: string;
  /** True when an active department_options row backs this department. */
  managed: boolean;
  /** Active employees whose department matches this row (case-insensitive). */
  employeeCount: number;
};

/**
 * Derive the one department roster both Management tabs must share:
 * the union of active managed options and every department string active
 * employees actually carry, counted case-insensitively. Unmanaged rows
 * (employee strings with no matching option) are flagged so the UI can
 * surface them instead of hiding them.
 */
export function buildDepartmentRoster(
  employees: Employee[],
  departmentOptions: DepartmentOption[]
): DepartmentRosterRow[] {
  const rows = new Map<string, DepartmentRosterRow>();

  departmentOptions.forEach(option => {
    if (!option.active) return;
    const name = normalizeDepartmentName(option.name);
    const key = departmentKey(option.name);
    if (!name || !key || rows.has(key)) return;
    rows.set(key, { key, name, managed: true, employeeCount: 0 });
  });

  employees.forEach(employee => {
    if (employee.active === false) return;
    const name = normalizeDepartmentName(employee.department);
    const key = departmentKey(employee.department);
    if (!name || !key) return;
    const row = rows.get(key);
    if (row) {
      row.employeeCount += 1;
      return;
    }
    rows.set(key, { key, name, managed: false, employeeCount: 1 });
  });

  return Array.from(rows.values()).sort((left, right) =>
    left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" })
  );
}
