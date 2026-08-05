import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// 20260805120000 supersedes 20260616000100, re-creating the function with the
// trailing expected_seats concurrency-fence parameter; the lockstep checks
// must read the definition that is actually live.
const migrationSql = await readFile(
  new URL("../supabase/migrations/20260805120000_import_assignments_csv_fence.sql", import.meta.url),
  "utf8"
);
const actionsSource = await readFile(new URL("../app/actions.ts", import.meta.url), "utf8");

function extractFunctionSql(sql) {
  const match = sql.match(/create or replace function public\.import_assignments_csv[\s\S]+?\$\$;\s*/);
  assert.ok(match, "CSV import RPC should be present in the migration");
  return match[0];
}

function extractCsvImportAction(source) {
  // Anchor on the next export of any kind (a result type now precedes the
  // restore action) so the extraction stays stable.
  const match = source.match(/export async function importAssignmentsCsvAction[\s\S]+?\r?\n}\r?\n\r?\nexport/);
  assert.ok(match, "CSV import action should be present");
  return match[0];
}

const functionSql = extractFunctionSql(migrationSql);
const importActionSource = extractCsvImportAction(actionsSource);

test("CSV import migration creates an authenticated admin-only RPC", () => {
  assert.match(functionSql, /create or replace function public\.import_assignments_csv\(\s*assignment_rows jsonb,\s*expected_seats jsonb default null\s*\)/);
  assert.match(functionSql, /returns integer/);
  assert.match(functionSql, /security invoker/);
  assert.doesNotMatch(functionSql, /security definer/i);
  assert.match(functionSql, /if not app_private\.is_admin\(\) then/);
  // The old 1-arg overload must be dropped, or PostgREST calls turn ambiguous.
  assert.match(migrationSql, /drop function if exists public\.import_assignments_csv\(jsonb\);/);
  assert.match(migrationSql, /revoke all on function public\.import_assignments_csv\(jsonb, jsonb\) from public, anon, authenticated;/);
  assert.match(migrationSql, /grant execute on function public\.import_assignments_csv\(jsonb, jsonb\) to authenticated;/);
});

test("CSV import RPC validates unsafe rows before mutating draft data", () => {
  const validationChecks = [
    /CSV import rows must be a JSON array/,
    /Row 1: CSV is empty/,
    /CSV import rows must include valid row_number values/,
    /Seat label is required/,
    /Duplicate seat row/,
    /Invalid status/,
    /Rows with employee_name cannot be/,
    /Assigned rows require employee_name/,
    /employee_email requires employee_name/,
    /Unknown seat label/,
    /appears as assigned more than once/,
    /matches multiple records/
  ];

  for (const check of validationChecks) {
    assert.match(functionSql, check);
  }

  const firstMutation = Math.min(
    ...[
      "insert into public.department_options",
      "update public.employees",
      "insert into public.employees",
      "insert into public.zone_options",
      "update public.seats"
    ].map(fragment => {
      const index = functionSql.indexOf(fragment);
      assert.notEqual(index, -1, `${fragment} should be present`);
      return index;
    })
  );

  assert.ok(functionSql.indexOf("Unknown seat label") < firstMutation);
  assert.ok(functionSql.indexOf("matches multiple records") < firstMutation);
  assert.ok(functionSql.indexOf("locked_seat_count <> expected_row_count") < firstMutation);
  assert.ok(functionSql.indexOf("valid row_number values") < firstMutation);
});

test("CSV import RPC checks the concurrency fence after locking and before mutating", () => {
  // Row-by-row `is distinct from` against the client's (id, updated_at) map —
  // never an aggregate (see 20260708120000_draft_concurrency_fence.sql).
  assert.match(functionSql, /expected_seats is not null/);
  assert.match(functionSql, /seat\.updated_at is distinct from/);
  assert.match(functionSql, /errcode = 'MLS02'/);
  assert.doesNotMatch(functionSql, /max\(\s*updated_at\s*\)/i);
  assert.doesNotMatch(functionSql, /count\(\*\)[\s\S]{0,80}expected_seats/);

  const lockCheck = functionSql.indexOf("locked_seat_count <> expected_row_count");
  const fence = functionSql.indexOf("errcode = 'MLS02'");
  const firstMutation = Math.min(
    ...[
      "insert into public.department_options",
      "update public.employees",
      "insert into public.employees",
      "insert into public.zone_options",
      "update public.seats"
    ].map(fragment => functionSql.indexOf(fragment))
  );

  assert.ok(lockCheck !== -1 && fence !== -1);
  assert.ok(lockCheck < fence, "fence must run after the lock loop");
  assert.ok(fence < firstMutation, "fence must run before any mutation");
});

test("CSV import RPC locks target draft seats and keeps all writes inside one function transaction", () => {
  assert.match(functionSql, /order by seat\.id\s+for update of seat/);
  assert.match(functionSql, /where seat\.layer = 'draft'::public\.seat_layer/);
  assert.match(functionSql, /get diagnostics affected_count = row_count/);
  assert.match(functionSql, /raise exception 'Row %: Could not update draft seat/);
  assert.doesNotMatch(functionSql, /exception\s+when/i);
});

test("CSV import RPC cannot mutate published seats", () => {
  assert.doesNotMatch(functionSql, /published/);
  assert.doesNotMatch(functionSql, /insert into public\.seats/i);
  assert.doesNotMatch(functionSql, /delete from public\.seats/i);

  const seatUpdates = functionSql.match(/update public\.seats[\s\S]+?;/g) ?? [];
  assert.equal(seatUpdates.length, 2);

  for (const statement of seatUpdates) {
    assert.match(statement, /layer = 'draft'::public\.seat_layer/);
  }
});

test("server CSV import action delegates mutations to the transaction-safe RPC", () => {
  assert.match(importActionSource, /const parsed = parseAssignmentCsv\(csvText\)/);
  assert.match(importActionSource, /if \(parsed\.issues\.length > 0\)/);
  assert.match(importActionSource, /\.rpc\("import_assignments_csv", \{\s+assignment_rows: parsed\.rows\.map\(\(row, index\) => \(\{/);
  assert.match(importActionSource, /row_number: index \+ 2/);
  // Fence threading: expectations forwarded verbatim, MLS02 returned as
  // STALE_DRAFT (not thrown) so the message survives digest stripping.
  assert.match(importActionSource, /expected_seats: expectedSeats \?\? null/);
  assert.match(importActionSource, /isStaleDraftErrorCode\(\(importError as SupabaseMutationError\)\.code\)/);
  assert.match(importActionSource, /return \{ ok: false, code: "STALE_DRAFT", message: importError\.message \}/);
  assert.doesNotMatch(importActionSource, /for \(const row of parsed\.rows\)/);
  assert.doesNotMatch(importActionSource, /\.insert\(/);
  assert.doesNotMatch(importActionSource, /\.update\(/);
  assert.doesNotMatch(importActionSource, /\.delete\(/);
  assert.doesNotMatch(importActionSource, /\.upsert\(/);
  assert.doesNotMatch(importActionSource, /service[_-]?role/i);
});
