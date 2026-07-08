import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// The draft-concurrency-fence migration drops the original 2-arg overload and
// recreates the RPC with trailing expected-updated_at fence parameters, so it
// holds the live definition.
const migrationSql = await readFile(
  new URL("../supabase/migrations/20260708120000_draft_concurrency_fence.sql", import.meta.url),
  "utf8"
);
const actionsSource = await readFile(new URL("../app/actions.ts", import.meta.url), "utf8");

function extractFunctionSql(sql) {
  const match = sql.match(/create or replace function public\.swap_draft_seat_assignments[\s\S]+?\$\$;\s*/);
  assert.ok(match, "atomic swap function should be present in the migration");
  return match[0];
}

function extractSwapAction(source) {
  const match = source.match(/export async function swapSeatAssignmentsAction[\s\S]+?\r?\n}\r?\n\r?\nexport async function createEmployeeAction/);
  assert.ok(match, "swap action should be present");
  return match[0];
}

const functionSql = extractFunctionSql(migrationSql);
const swapActionSource = extractSwapAction(actionsSource);

test("atomic draft swap migration creates an authenticated admin-only RPC", () => {
  assert.match(functionSql, /create or replace function public\.swap_draft_seat_assignments\(\s*source_draft_seat_id uuid,\s*target_draft_seat_id uuid,\s*source_expected_updated_at timestamptz default null,\s*target_expected_updated_at timestamptz default null\s*\)/);
  assert.match(functionSql, /returns setof public\.seats/);
  assert.match(functionSql, /security invoker/);
  assert.match(functionSql, /if not app_private\.is_admin\(\) then/);
  assert.match(migrationSql, /drop function if exists public\.swap_draft_seat_assignments\(uuid, uuid\);/);
  assert.match(migrationSql, /revoke all on function public\.swap_draft_seat_assignments\(uuid, uuid, timestamptz, timestamptz\) from public, anon, authenticated;/);
  assert.match(migrationSql, /grant execute on function public\.swap_draft_seat_assignments\(uuid, uuid, timestamptz, timestamptz\) to authenticated;/);
});

test("atomic draft swap migration fences stale clients after locking both rows", () => {
  const lockIndex = functionSql.indexOf("for update");
  const sourceFenceIndex = functionSql.indexOf("source_seat.updated_at is distinct from source_expected_updated_at");
  const targetFenceIndex = functionSql.indexOf("target_seat.updated_at is distinct from target_expected_updated_at");
  const firstMutation = functionSql.indexOf("update public.seats");

  assert.notEqual(lockIndex, -1);
  assert.notEqual(sourceFenceIndex, -1, "source seat fence should be present");
  assert.notEqual(targetFenceIndex, -1, "target seat fence should be present");
  assert.ok(lockIndex < sourceFenceIndex, "fence must run after the rows are locked");
  assert.ok(targetFenceIndex < firstMutation, "fence must run before any mutation");
  assert.match(functionSql, /using errcode = 'MLS02'/);
});

test("atomic draft swap migration rejects same-seat, missing-seat, non-draft, and both-open swaps", () => {
  assert.match(functionSql, /source_draft_seat_id = target_draft_seat_id/);
  assert.match(functionSql, /source_seat\.id is null or target_seat\.id is null/);
  assert.match(functionSql, /source_seat\.layer <> 'draft'::public\.seat_layer or target_seat\.layer <> 'draft'::public\.seat_layer/);
  assert.match(functionSql, /source_seat\.employee_id is null and target_seat\.employee_id is null/);
});

test("atomic draft swap migration locks both rows and never updates marker or published-seat fields", () => {
  assert.match(functionSql, /order by id\s+for update/);
  assert.match(functionSql, /where id in \(source_draft_seat_id, target_draft_seat_id\)\s+and layer = 'draft'::public\.seat_layer/);
  assert.match(functionSql, /where seat\.id in \(source_draft_seat_id, target_draft_seat_id\)\s+and seat\.layer = 'draft'::public\.seat_layer/);
  assert.match(functionSql, /where id in \(source_draft_seat_id, target_draft_seat_id\)\s+and layer = 'draft'::public\.seat_layer\s+order by label/);

  const updateStatements = functionSql.match(/update public\.seats(?:\s+as\s+\w+)?[\s\S]+?;/g) ?? [];
  assert.equal(updateStatements.length, 2);
  for (const statement of updateStatements) {
    assert.doesNotMatch(statement, /\b(?:x|y|label|seat_key|zone|department|notes|is_custom)\s*=/);
    assert.match(statement, /layer = 'draft'::public\.seat_layer/);
  }
});

test("atomic draft swap migration keeps the uniqueness workaround inside one function transaction", () => {
  assert.match(functionSql, /employee_id = null,\s+status = 'available'::public\.seat_status/);
  assert.match(functionSql, /employee_id = case[\s\S]+source_next_employee_id[\s\S]+target_next_employee_id/);
  assert.match(functionSql, /status = case[\s\S]+source_next_status[\s\S]+target_next_status/);
  assert.doesNotMatch(functionSql, /exception\s+when/i);
});

test("server swap action calls the atomic RPC instead of sequential seat assignment updates", () => {
  assert.match(swapActionSource, /\.rpc\("swap_draft_seat_assignments", \{/);
  assert.match(swapActionSource, /source_draft_seat_id: originalSourceSeat\.id/);
  assert.match(swapActionSource, /target_draft_seat_id: originalTargetSeat\.id/);
  assert.doesNotMatch(swapActionSource, /restoreOriginalAssignments/);
  assert.doesNotMatch(swapActionSource, /updateDraftSeatAssignment/);
  assert.doesNotMatch(swapActionSource, /clearError/);
});

test("server swap action threads the concurrency fence and returns STALE_DRAFT as data", () => {
  assert.match(swapActionSource, /source_expected_updated_at: input\.sourceExpectedUpdatedAt \?\? null/);
  assert.match(swapActionSource, /target_expected_updated_at: input\.targetExpectedUpdatedAt \?\? null/);
  assert.match(swapActionSource, /code: "STALE_DRAFT"/);
});
