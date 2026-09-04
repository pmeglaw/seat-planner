// Server-side facts the persistent shell needs on every signed-in route
// (redesign-v2 PR 2): when the map was last published (the mode indicator's
// "Published · date" and the History panel's fact line) and the signed-in
// person's own published seat (the Account panel's "My seat" row).
//
// Both come from the VIEWER-SAFE published layer only — `seats` where
// layer = 'published' and the `published_employees` snapshot — because the
// shell mounts for viewers too. The live `employees` table is never read
// here (tests/published-employee-snapshot.test.mjs). The Supabase reads
// live in app/(shell)/layout.tsx; this module is the pure derivation so the
// shape is testable without a database.

export type ShellServerState = {
  /** ISO timestamp of the last publish, or null when nothing has been published. */
  publishedAt: string | null;
  /** The signed-in person's published seat, or null when unseated / unmatched. */
  mySeat: { label: string; floor: string } | null;
};

export function deriveShellState(args: {
  /** max(updated_at) over published seats — publish_seat_map() re-inserts
   *  every published row, so this IS the last publish moment (the same
   *  derivation app/page.tsx has always used). */
  latestPublishedUpdatedAt: string | null | undefined;
  mySeatRow: { label: string | null; floor: string | null } | null | undefined;
}): ShellServerState {
  const publishedAt = args.latestPublishedUpdatedAt || null;
  const row = args.mySeatRow;
  const mySeat = row && row.label ? { label: row.label, floor: row.floor ?? "" } : null;
  return { publishedAt, mySeat };
}

/** PostgREST `ilike` treats `%` and `_` as wildcards; an email is matched
 *  case-insensitively but must otherwise be literal. */
export function escapeIlikePattern(value: string): string {
  return value.replace(/[\\%_]/g, match => `\\${match}`);
}
