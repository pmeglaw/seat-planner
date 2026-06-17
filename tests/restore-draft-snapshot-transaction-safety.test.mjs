import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationSql = await readFile(
  new URL("../supabase/migrations/20260616000300_restore_draft_snapshot_rpc.sql", import.meta.url),
  "utf8"
);
const actionsSource = await readFile(new URL("../app/actions.ts", import.meta.url), "utf8");

function extractFunctionSql(sql) {
  const match = sql.match(/create or replace function public\.restore_draft_snapshot[\s\S]+?\$\$;\s*/);
  assert.ok(match, "draft snapshot restore RPC should be present in the migration");
  return match[0];
}

function extractRestoreAction(source) {
  const match = source.match(/export async function restoreDraftSnapshotAction[\s\S]+?\r?\n}\r?\n\r?\nexport async function getPublishHistoryAction/);
  assert.ok(match, "restoreDraftSnapshotAction should be present");
  return match[0];
}

const functionSql = extractFunctionSql(migrationSql);
const restoreActionSource = extractRestoreAction(actionsSource);

test("draft snapshot restore migration creates an authenticated admin-only RPC", () => {
  assert.match(functionSql, /create or replace function public\.restore_draft_snapshot\(\s+snapshot_seats jsonb,\s+snapshot_employees jsonb\s+\)/);
  assert.match(functionSql, /returns integer/);
  assert.match(functionSql, /security invoker/);
  assert.doesNotMatch(functionSql, /security definer/i);
  assert.match(functionSql, /if not app_private\.is_admin\(\) then/);
  assert.match(migrationSql, /revoke all on function public\.restore_draft_snapshot\(jsonb, jsonb\) from public, anon, authenticated;/);
  assert.match(migrationSql, /grant execute on function public\.restore_draft_snapshot\(jsonb, jsonb\) to authenticated;/);
});

test("draft snapshot restore RPC validates unsafe snapshots before mutating", () => {
  const validationChecks = [
    /Draft snapshot seats must be a JSON array/,
    /Draft snapshot employees must be a JSON array/,
    /Cannot restore an empty draft map snapshot/,
    /Draft snapshot contains an invalid seat/,
    /Undo\/redo can only restore draft seats/,
    /Cannot restore duplicate draft seat label/,
    /Draft snapshot contains an invalid employee/,
    /employee is assigned to multiple seats/,
    /assigned employee record is missing/,
    /Cannot restore protected original seat/,
    /protected or occupied seats are missing from the snapshot/
  ];

  for (const check of validationChecks) {
    assert.match(functionSql, check);
  }

  const firstMutation = Math.min(
    ...[
      "insert into public.department_options",
      "insert into public.employees",
      "insert into public.zone_options",
      "update public.seats",
      "delete from public.seats",
      "insert into public.seats"
    ].map(fragment => {
      const index = functionSql.indexOf(fragment);
      assert.notEqual(index, -1, `${fragment} should be present`);
      return index;
    })
  );

  assert.ok(functionSql.indexOf("Cannot restore duplicate draft seat label") < firstMutation);
  assert.ok(functionSql.indexOf("assigned employee record is missing") < firstMutation);
  assert.ok(functionSql.indexOf("protected or occupied seats are missing from the snapshot") < firstMutation);
});

test("draft snapshot restore RPC keeps all seat mutations draft-scoped", () => {
  assert.match(functionSql, /order by seat\.id\s+for update of seat/);
  assert.doesNotMatch(functionSql, /published/);

  const seatUpdates = functionSql.match(/update public\.seats[\s\S]+?;/g) ?? [];
  assert.equal(seatUpdates.length, 2);
  for (const statement of seatUpdates) {
    assert.match(statement, /layer = 'draft'::public\.seat_layer|seat\.layer = 'draft'::public\.seat_layer/);
  }

  const seatDeletes = functionSql.match(/delete from public\.seats[\s\S]+?;/g) ?? [];
  assert.equal(seatDeletes.length, 1);
  assert.match(seatDeletes[0], /seat\.layer = 'draft'::public\.seat_layer/);
  assert.match(seatDeletes[0], /seat\.is_custom is true/);
  assert.match(seatDeletes[0], /seat\.employee_id is null/);
  assert.match(seatDeletes[0], /seat\.status = 'available'::public\.seat_status/);

  assert.match(functionSql, /insert into public\.seats \([\s\S]+layer,[\s\S]+is_custom[\s\S]+values \([\s\S]+'draft'::public\.seat_layer/);
  assert.match(functionSql, /get diagnostics affected_count = row_count/);
  assert.match(functionSql, /Could not remove every eligible custom draft seat missing from the snapshot/);
  assert.doesNotMatch(functionSql, /exception\s+when/i);
});

test("draft snapshot restore RPC preserves employee and option restore behavior", () => {
  assert.match(functionSql, /insert into public\.department_options \(name, active\)[\s\S]+on conflict \(name\) do update set active = true/);
  assert.match(functionSql, /insert into public\.employees \([\s\S]+full_name,[\s\S]+position,[\s\S]+department,[\s\S]+phone_extension,[\s\S]+avatar_url,[\s\S]+active/);
  assert.match(functionSql, /on conflict \(id\) do update set[\s\S]+full_name = excluded\.full_name[\s\S]+phone_extension = excluded\.phone_extension[\s\S]+active = excluded\.active/);
  assert.match(functionSql, /coalesce\(source\.zone, source\.department, ''\)/);
  assert.match(functionSql, /insert into public\.zone_options \(name, active\)[\s\S]+on conflict \(name\) do update set active = true/);
  assert.match(functionSql, /next_status := case[\s\S]+when restore_row\.employee_id is not null then 'assigned'::public\.seat_status[\s\S]+when restore_row\.status = 'assigned' then 'available'::public\.seat_status/);
});

test("server draft snapshot restore action delegates dependent writes to the transaction-safe RPC", () => {
  assert.match(restoreActionSource, /JSON backup must include seats and employees arrays/);
  assert.match(restoreActionSource, /const seatsToRestore = snapshot\.seats\.map\(normalizeRestoreSeat\)/);
  assert.match(restoreActionSource, /const employeesToRestore = snapshot\.employees\.map\(normalizeRestoreEmployee\)/);
  assert.match(restoreActionSource, /Cannot restore an empty draft map snapshot/);
  assert.match(restoreActionSource, /Cannot restore duplicate draft seat label/);
  assert.match(restoreActionSource, /\.rpc\("restore_draft_snapshot", \{\s+snapshot_seats: seatsToRestore,\s+snapshot_employees: employeesToRestore\s+\}\)/);
  assert.match(restoreActionSource, /return getDraftMapPayload\(supabase\)/);

  assert.doesNotMatch(restoreActionSource, /\.from\("seats"\)/);
  assert.doesNotMatch(restoreActionSource, /\.from\("employees"\)/);
  assert.doesNotMatch(restoreActionSource, /\.insert\(/);
  assert.doesNotMatch(restoreActionSource, /\.update\(/);
  assert.doesNotMatch(restoreActionSource, /\.delete\(/);
  assert.doesNotMatch(restoreActionSource, /\.upsert\(/);
  assert.doesNotMatch(restoreActionSource, /service[_-]?role/i);
});
