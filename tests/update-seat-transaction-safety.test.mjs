import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// The force_move migration drops the original 12-arg overload and recreates the
// RPC with the trailing force_move parameter, so it holds the live definition.
const migrationSql = await readFile(
  new URL("../supabase/migrations/20260629000100_update_draft_seat_force_move.sql", import.meta.url),
  "utf8"
);
const actionsSource = await readFile(new URL("../app/actions.ts", import.meta.url), "utf8");

function extractFunctionSql(sql) {
  const match = sql.match(/create or replace function public\.update_draft_seat[\s\S]+?\$\$;\s*/);
  assert.ok(match, "draft seat update RPC should be present in the migration");
  return match[0];
}

function extractUpdateSeatAction(source) {
  // Capture only updateSeatAction itself (it now ends before the mapUpdateSeatError
  // helper, which is extracted separately below) so the delegation guards apply to
  // the action body alone.
  const match = source.match(/export async function updateSeatAction[\s\S]+?\r?\n}\r?\n/);
  assert.ok(match, "updateSeatAction should be present");
  return match[0];
}

// updateSeatAction RETURNS expected failures (instead of throwing, which Next.js
// strips to a generic digest in production). The conflict classification lives in
// the mapUpdateSeatError helper; load it as a runnable function so we can assert the
// actual returned result shape, not just the source text.
function loadMapUpdateSeatError(source) {
  const match = source.match(/function mapUpdateSeatError\(error[\s\S]+?\r?\n}\r?\n/);
  assert.ok(match, "mapUpdateSeatError helper should be present");
  const js = match[0].replace(
    /function mapUpdateSeatError\(error:[^)]*\)\s*:\s*UpdateSeatResult/,
    "function mapUpdateSeatError(error)"
  );
  return new Function(`${js}\nreturn mapUpdateSeatError;`)();
}

const functionSql = extractFunctionSql(migrationSql);
const updateSeatActionSource = extractUpdateSeatAction(actionsSource);
const updateSeatFunctionSignature = /public\.update_draft_seat\(uuid, text, public\.seat_status, uuid, text, text, boolean, text, boolean, text, text, text, boolean\)/;

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

  // The persistent employee/option/main-seat writes only run after all pre-flight
  // validation. The conditional force_move vacate is intentionally excluded: it lives
  // inside the double-booking branch, which is itself the conflict check.
  const firstMutation = Math.min(
    ...[
      "insert into public.department_options",
      "insert into public.employees",
      "update public.employees",
      "insert into public.zone_options"
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

  // Two seat updates now: the conditional force_move vacate and the main assignment.
  // Both must stay scoped to the draft layer.
  const seatUpdates = functionSql.match(/update public\.seats[\s\S]+?;/g) ?? [];
  assert.equal(seatUpdates.length, 2);
  for (const seatUpdate of seatUpdates) {
    assert.match(seatUpdate, /seat\.layer = 'draft'::public\.seat_layer/);
  }
  assert.match(functionSql, /get diagnostics updated_count = row_count/);
  assert.match(functionSql, /raise exception 'Could not update draft seat\.'/);
  assert.doesNotMatch(functionSql, /exception\s+when/i);
});

test("draft seat update RPC supports an atomic force_move with a coded conflict", () => {
  // New trailing parameter, defaulting false so existing callers keep raising.
  assert.match(functionSql, /force_move boolean default false/);

  // Without force_move the conflict carries a stable custom SQLSTATE and the occupied
  // seat label in DETAIL, so the action can classify it without string-parsing.
  assert.match(
    functionSql,
    /raise exception 'That employee is already assigned to %\.', duplicate_assignment_label\s*\r?\n\s*using errcode = 'MLS01', detail = duplicate_assignment_label/
  );

  // With force_move set, the employee's other draft seat is freed to Open in the same
  // transaction instead of raising.
  assert.match(functionSql, /if coalesce\(force_move, false\) then/);
  assert.match(
    functionSql,
    /update public\.seats as seat\s+set\s+employee_id = null,\s+status = 'available'::public\.seat_status\s+where seat\.layer = 'draft'::public\.seat_layer\s+and seat\.employee_id = resolved_employee_id\s+and seat\.id <> draft_seat_id;/
  );

  // The original 12-arg overload is dropped so the signature change leaves one version.
  assert.match(
    migrationSql,
    /drop function if exists public\.update_draft_seat\(uuid, text, public\.seat_status, uuid, text, text, boolean, text, boolean, text, text, text\);/
  );
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
  assert.match(updateSeatActionSource, /force_move: input\.forceMove \?\? false/);
  // Success path now wraps the seat in a discriminated result; failures are returned
  // (via mapUpdateSeatError) rather than thrown so the friendly RPC message survives.
  assert.match(updateSeatActionSource, /const seat = await getDraftSeatById\(supabase, input\.seatId\)/);
  assert.match(updateSeatActionSource, /return \{ ok: true, seat \}/);
  assert.match(updateSeatActionSource, /return mapUpdateSeatError\(error\)/);
  assert.doesNotMatch(updateSeatActionSource, /throw new Error\(error\.message\)/);

  assert.doesNotMatch(updateSeatActionSource, /\.from\("seats"\)/);
  assert.doesNotMatch(updateSeatActionSource, /\.from\("employees"\)/);
  assert.doesNotMatch(updateSeatActionSource, /\.insert\(/);
  assert.doesNotMatch(updateSeatActionSource, /\.update\(/);
  assert.doesNotMatch(updateSeatActionSource, /\.delete\(/);
  assert.doesNotMatch(updateSeatActionSource, /\.upsert\(/);
  assert.doesNotMatch(updateSeatActionSource, /\.maybeSingle\(/);
  assert.doesNotMatch(updateSeatActionSource, /service[_-]?role/i);
});

test("updateSeatAction returns the double-booking conflict as data instead of throwing", () => {
  const mapUpdateSeatError = loadMapUpdateSeatError(actionsSource);

  // Today the RPC raises a friendly message with no custom code; the helper must
  // still recognise the conflict and name the occupied seat.
  const messageOnly = mapUpdateSeatError({ message: "That employee is already assigned to W11." });
  assert.deepEqual(messageOnly, {
    ok: false,
    code: "EMPLOYEE_ALREADY_ASSIGNED",
    message: "That employee is already assigned to W11.",
    currentSeatLabel: "W11"
  });

  // Once the Phase 2 migration lands, the same conflict carries SQLSTATE MLS01.
  const withCode = mapUpdateSeatError({ code: "MLS01", message: "That employee is already assigned to W11." });
  assert.equal(withCode.ok, false);
  assert.equal(withCode.code, "EMPLOYEE_ALREADY_ASSIGNED");
  assert.equal(withCode.currentSeatLabel, "W11");

  // Other RPC validation messages surface verbatim as a plain validation result.
  assert.deepEqual(mapUpdateSeatError({ message: "Seat label C01 already exists." }), {
    ok: false,
    code: "VALIDATION",
    message: "Seat label C01 already exists."
  });

  // The action wires the RPC error straight through the mapper and never throws it.
  assert.match(updateSeatActionSource, /return mapUpdateSeatError\(error\)/);
  assert.doesNotMatch(updateSeatActionSource, /throw new Error\(error\.message\)/);
});
