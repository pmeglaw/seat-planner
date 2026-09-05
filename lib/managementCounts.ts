// Management → Employees toolbar count (PHASE2UX §1G.3; DECISIONS D5-a).
// The summary tiles were dropped (owner, 2026-09-03): the numbers an admin
// needs while editing people sit beside the table they describe, in the
// toolbar's aria-live count — always published, zero included (SKILL.md:
// "Always publish the number of results, zero included").

export type ToolbarCountInput = {
  /** Active employees in the directory. */
  total: number;
  /** Active employees holding a draft seat. */
  assigned: number;
  /** Rows matching the current search. */
  matching: number;
  /** True while the search field has text. */
  searching: boolean;
};

function plural(count: number, noun: string) {
  return `${count.toLocaleString()} ${noun}${count === 1 ? "" : "s"}`;
}

export function toolbarCount({ total, assigned, matching, searching }: ToolbarCountInput): string {
  if (searching) return `${matching.toLocaleString()} of ${total.toLocaleString()} match`;
  return `${plural(total, "employee")} · ${assigned.toLocaleString()} assigned · ${(total - assigned).toLocaleString()} unassigned`;
}

/** Active employees that a draft seat points at. */
export function assignedCount(
  employees: ReadonlyArray<{ id: string; active: boolean }>,
  seats: ReadonlyArray<{ employee_id: string | null }>
): number {
  const seated = new Set(seats.map(seat => seat.employee_id).filter((id): id is string => Boolean(id)));
  return employees.filter(employee => employee.active && seated.has(employee.id)).length;
}
