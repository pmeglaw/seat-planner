import type { Employee } from "@/lib/types";

/**
 * Single source of truth for job-title ("position") handling.
 *
 * Positions are free text on `employees` with no side table — there is no
 * `position_options` analogue to `department_options`, so the spellings that
 * reach the UI are whatever was typed or imported from CSV. The facet's option
 * list and the map's match predicate must therefore share one normalization,
 * across BOTH surfaces (admin reads the live working set, viewer reads the
 * published_employees snapshot). Otherwise "Case Manager" and "case manager "
 * become two options that each match half the roster — the exact drift
 * `lib/departments.ts` was written to prevent.
 */

/** Display-normalize a position: trim + collapse inner whitespace. */
export function normalizePositionName(value: string | null | undefined): string | null {
  const collapsed = (value ?? "").replace(/\s+/g, " ").trim();
  return collapsed.length > 0 ? collapsed : null;
}

/** Comparison key for a position (case-insensitive, whitespace-safe). */
export function positionKey(value: string | null | undefined): string | null {
  const name = normalizePositionName(value);
  return name ? name.toLowerCase() : null;
}

/**
 * The option list for the Position facet: every distinct position an ACTIVE
 * employee carries, de-duplicated case-insensitively (first spelling wins) and
 * sorted for display. Employees with no position contribute nothing — an
 * empty option is not a filter anyone can act on.
 */
export function buildPositionOptions(employees: Employee[]): string[] {
  const byKey = new Map<string, string>();

  employees.forEach(employee => {
    if (employee.active === false) return;
    const name = normalizePositionName(employee.position);
    const key = positionKey(employee.position);
    if (!name || !key || byKey.has(key)) return;
    byKey.set(key, name);
  });

  return Array.from(byKey.values()).sort((left, right) =>
    left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" })
  );
}

/**
 * Does a seat's occupant hold the selected position? `"all"` matches every
 * seat, including empty ones — it is the "no position filter" sentinel, not a
 * position. An unoccupied seat never matches a real position selection.
 */
export function seatMatchesPosition(seatPosition: string | null | undefined, selected: string): boolean {
  if (selected === "all") return true;
  const selectedKey = positionKey(selected);
  if (!selectedKey) return true;
  return positionKey(seatPosition) === selectedKey;
}
