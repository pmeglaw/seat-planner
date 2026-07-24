import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Pins the reset-to-published TS action and SQL RPC in lockstep, like the
// other *-transaction-safety tests: the whole reset is one fenced transaction,
// seats only, admin only. Execution behavior is covered in rpc-execution.
//
// The live definition is 20260724150000_reset_draft_staged_writes.sql, which
// supersedes 20260723230000_reset_draft_to_published.sql (create or replace):
// the original's single bulk UPDATE rewrote employee_id/label per row and
// collided with itself mid-statement on the non-deferrable
// one_draft_seat_per_employee / seats_unique_label_per_layer indexes whenever
// the draft permuted an assignment or label relative to published. The
// staged-writes migration keeps the same contract (seats only, fenced,
// stable draft ids) and only changes how the mutation is sequenced.

const migrationSql = await readFile(
  new URL("../supabase/migrations/20260724150000_reset_draft_staged_writes.sql", import.meta.url),
  "utf8"
);
const actionsSource = await readFile(new URL("../app/actions.ts", import.meta.url), "utf8");

function extractResetAction(source) {
  const match = source.match(/export async function resetDraftToPublishedAction[\s\S]+?\r?\n}\r?\n/);
  assert.ok(match, "resetDraftToPublishedAction should be present");
  return match[0];
}

const resetActionSource = extractResetAction(actionsSource);

test("reset migration creates an authenticated admin-only fenced RPC", () => {
  assert.match(migrationSql, /create or replace function public\.reset_draft_seats_to_published\(\s+expected_draft_seats jsonb default null\s+\)/);
  assert.match(migrationSql, /returns integer/);
  assert.match(migrationSql, /security invoker/);
  assert.doesNotMatch(migrationSql, /security definer/i);
  assert.match(migrationSql, /if not app_private\.is_admin\(\) then/);
  assert.match(migrationSql, /revoke all on function public\.reset_draft_seats_to_published\(jsonb\) from public;/);
  assert.match(migrationSql, /grant execute on function public\.reset_draft_seats_to_published\(jsonb\) to authenticated;/);
});

test("reset RPC locks the draft, fences staleness, and never touches employees", () => {
  // Stable-order lock before the fence, like restore_draft_snapshot.
  assert.match(migrationSql, /for update of seat/);
  assert.match(migrationSql, /using errcode = 'MLS02'/);
  // The three-way seat sync keys on the same coalesce publish uses.
  assert.match(migrationSql, /coalesce\(p\.seat_key, p\.label\) = coalesce\(d\.seat_key, d\.label\)/);
  // Seats only — the owner-confirmed people contract: no employee writes.
  assert.doesNotMatch(migrationSql, /insert into public\.employees|update public\.employees|delete from public\.employees/);
});

test("reset action is a fenced server action returning STALE_DRAFT instead of throwing", () => {
  assert.match(resetActionSource, /const supabase = await requireAdmin\(\);/);
  assert.match(resetActionSource, /supabase\.rpc\("reset_draft_seats_to_published", \{\s+expected_draft_seats: expectedDraftSeats \?\? null\s+\}\)/);
  assert.match(resetActionSource, /isStaleDraftErrorCode/);
  assert.match(resetActionSource, /return \{ ok: false, code: "STALE_DRAFT", message: error\.message \};/);
  assert.match(resetActionSource, /revalidatePath\("\/admin"\)/);
});

test("reset RPC stages vacate and label parking before the converging update", () => {
  const vacate = migrationSql.indexOf("set employee_id = null");
  const park = migrationSql.indexOf("'~reset~'");
  const converge = migrationSql.indexOf("seat_key = p.seat_key");
  const draftOnlyDelete = migrationSql.indexOf("delete from public.seats as d");
  assert.ok(vacate > -1 && park > -1 && converge > -1 && draftOnlyDelete > -1);
  assert.ok(draftOnlyDelete < vacate, "draft-only delete runs before staging");
  assert.ok(vacate < converge, "assignment vacate runs before the converging update");
  assert.ok(park < converge, "label parking runs before the converging update");
});
