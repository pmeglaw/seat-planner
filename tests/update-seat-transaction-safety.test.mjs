import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationSql = await readFile(
  new URL("../supabase/migrations/20260616000200_update_draft_seat_rpc.sql", import.meta.url),
  "utf8"
);
const actionsSource = await readFile(new URL("../app/actions.ts", import.meta.url), "utf8");

function extractFunctionSql(sql) {
  const match = sql.match(/create or replace function public\.update_draft_seat[\s\S]+?\$\$;\s*/);
  assert.ok(match, "draft seat update RPC should be present in the migration");
  return match[0];
}

function extractUpdateSeatAction(source) {
  const match = source.match(/export async function updateSeatAction[\s\S]+?\r?\n}\r?\n\r?\nexport async function swapSeatAssignmentsAction/);
  assert.ok(match, "updateSeatAction should be present");
  return match[0];
}

const functionSql = extractFunctionSql(migrationSql);
const updateSeatActionSource = extractUpdateSeatAction(actionsSource);
const updateSeatFunctionSignature = /public\.update_draft_seat\(uuid, text, public\.seat_status, uuid, text, text, boolean, text, boolean, text, text, text\)/;

test("draft seat update migration creates an authenticated admin-only RPC", () => {
  assert.match(functionSql, /create or replace function public\.update_draft_seat\(/);
  assert.match(functionSql, /returns uuid/);
  assert.match(functionSql, /security invoker/);
  assert.doesNotMatch(functionSql, /security definer/i);
  assert.match(functionSql, /if not app_private\.is_admin\(\) then/);
  assert.match(migrationSql, new RegExp(`revoke all on function ${updateSeatFunctionSignature.source} from public, anon, authenticated;`));
  assert.match(migrationSql, new RegExp(`grant execute on function ${updateSeatFunctionSignature.source} to authenticated;`));
});

test("draft seat update RPC validates conflicting edits before mutating", () => {
  const validationChecks = [
    /Draft seat is required/,
    /Seat label is required/,
    /Draft seat not found/,
    /Seat label % already exists/,
    /Assigned seats require an employee name or selected employee/,
    /Selected employee no longer exists/,
    /matches multiple records/,
    /That employee is already assigned to %/
  ];

  for (const check of validationChecks) {
    assert.match(functionSql, check);
  }

  const firstMutation = Math.min(
    ...[
      "insert into public.department_options",
      "insert into public.employees",
      "update public.employees",
      "insert into public.zone_options",
      "update public.seats"
    ].map(fragment => {
      const index = functionSql.indexOf(fragment);
      assert.notEqual(index, -1, `${fragment} should be present`);
      return index;
    })
  );

  assert.ok(functionSql.indexOf("Seat label % already exists") < firstMutation);
  assert.ok(functionSql.indexOf("Assigned seats require an employee name or selected employee") < firstMutation);
  assert.ok(functionSql.indexOf("That employee is already assigned to %") < firstMutation);
});

test("draft seat update RPC locks and mutates only draft seats", () => {
  assert.match(functionSql, /where seat\.id = draft_seat_id\s+and seat\.layer = 'draft'::public\.seat_layer\s+for update of seat/);
  assert.doesNotMatch(functionSql, /published/);
  assert.doesNotMatch(functionSql, /insert into public\.seats/i);
  assert.doesNotMatch(functionSql, /delete from public\.seats/i);

  const seatUpdates = functionSql.match(/update public\.seats[\s\S]+?;/g) ?? [];
  assert.equal(seatUpdates.length, 1);
  assert.match(seatUpdates[0], /seat\.layer = 'draft'::public\.seat_layer/);
  assert.match(functionSql, /get diagnostics updated_count = row_count/);
  assert.match(functionSql, /raise exception 'Could not update draft seat\.'/);
  assert.doesNotMatch(functionSql, /exception\s+when/i);
});

test("draft seat update RPC preserves inspector employee and option behavior", () => {
  assert.match(functionSql, /select count\(\*\)[\s\S]+from public\.employees as employee[\s\S]+lower\(trim\(employee\.full_name\)\) = normalized_employee_key/);
  assert.match(functionSql, /insert into public\.department_options \(name, active\)[\s\S]+on conflict \(name\) do update set active = true/);
  assert.match(functionSql, /insert into public\.zone_options \(name, active\)[\s\S]+on conflict \(name\) do update set active = true/);
  assert.match(functionSql, /insert into public\.employees \([\s\S]+full_name,[\s\S]+position,[\s\S]+department,[\s\S]+phone_extension,[\s\S]+avatar_url,[\s\S]+active/);
  assert.match(functionSql, /active = true,[\s\S]+full_name = case[\s\S]+when normalized_employee_name is not null then normalized_employee_name/);
  assert.match(functionSql, /position = case[\s\S]+when coalesce\(employee_position_provided, false\) then normalized_position/);
  assert.match(functionSql, /phone_extension = case[\s\S]+when coalesce\(employee_phone_extension_provided, false\) then normalized_phone_extension/);
  assert.match(functionSql, /department = normalized_department/);
  assert.match(functionSql, /next_status := case[\s\S]+when resolved_employee_id is not null then 'assigned'::public\.seat_status[\s\S]+when requested_status in \('reserved'::public\.seat_status, 'unavailable'::public\.seat_status\) then requested_status[\s\S]+else 'available'::public\.seat_status/);
});

test("server draft seat update action delegates dependent writes to the transaction-safe RPC", () => {
  assert.match(updateSeatActionSource, /const label = assertNonEmpty\(input\.label, "Seat label"\)/);
  assert.match(updateSeatActionSource, /Assigned seats require an employee name or selected employee/);
  assert.match(updateSeatActionSource, /\.rpc\("update_draft_seat", \{/);
  assert.match(updateSeatActionSource, /draft_seat_id: input\.seatId/);
  assert.match(updateSeatActionSource, /seat_label: label/);
  assert.match(updateSeatActionSource, /requested_status: input\.status/);
  assert.match(updateSeatActionSource, /selected_employee_id: employeeId/);
  assert.match(updateSeatActionSource, /employee_name: employeeName \|\| null/);
  assert.match(updateSeatActionSource, /employee_position_provided: employeePosition !== undefined/);
  assert.match(updateSeatActionSource, /employee_phone_extension_provided: phoneExtension !== undefined/);
  assert.match(updateSeatActionSource, /employee_department: department/);
  assert.match(updateSeatActionSource, /seat_zone: zone/);
  assert.match(updateSeatActionSource, /seat_notes: notes/);
  assert.match(updateSeatActionSource, /return getDraftSeatById\(supabase, input\.seatId\)/);

  assert.doesNotMatch(updateSeatActionSource, /\.from\("seats"\)/);
  assert.doesNotMatch(updateSeatActionSource, /\.from\("employees"\)/);
  assert.doesNotMatch(updateSeatActionSource, /\.insert\(/);
  assert.doesNotMatch(updateSeatActionSource, /\.update\(/);
  assert.doesNotMatch(updateSeatActionSource, /\.delete\(/);
  assert.doesNotMatch(updateSeatActionSource, /\.upsert\(/);
  assert.doesNotMatch(updateSeatActionSource, /\.maybeSingle\(/);
  assert.doesNotMatch(updateSeatActionSource, /service[_-]?role/i);
});
