// Expected refusals a database guard raises with its own SQLSTATE, so a
// server action can tell "the database said no, and here is why" from an
// unexpected failure (transport, permission, a bug). The MLS02 stale-draft
// fence (lib/draftConcurrency.ts) is the precedent; this module holds the
// codes that are refusals rather than fences.
//
// A refusal is RETURNED to the caller with its written reason (the
// `ActionRefusedFailure` arm in app/actions.ts — a thrown Error is
// digest-stripped in production and the reason never reaches the admin);
// anything else is thrown like every sibling action does. Before Phase 4 PR 6
// deleteEmployeeAction returned EVERY error as a refusal (finding F-2).

/** SQLSTATE raised by deactivate_employee while the person still holds a
 *  PUBLISHED seat (migration 20260908120000). */
export const PUBLISHED_EMPLOYEE_SQLSTATE = "MLS03";

type ErrorLike = { code?: string | null };

/** True only for the deactivate guard's own refusal — never for a transport
 *  or permission error, which carries a different (or no) code. */
export function isPublishedEmployeeRefusal(error: ErrorLike | null | undefined): boolean {
  return Boolean(error) && error?.code === PUBLISHED_EMPLOYEE_SQLSTATE;
}
