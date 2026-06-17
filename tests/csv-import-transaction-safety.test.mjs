import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationSql = await readFile(
  new URL("../supabase/migrations/20260616000100_import_assignments_csv_rpc.sql", import.meta.url),
  "utf8"
);
const actionsSource = await readFile(new URL("../app/actions.ts", import.meta.url), "utf8");

function extractFunctionSql(sql) {
  const match = sql.match(/create or replace function public\.import_assignments_csv[\s\S]+?\$\$;\s*/);
  assert.ok(match, "CSV import RPC should be present in the migration");
  return match[0];
}

function extractCsvImportAction(source) {
  const match = source.match(/export async function importAssignmentsCsvAction[\s\S]+?\r?\n}\r?\n\r?\nexport async function restoreDraftSnapshotAction/);
  assert.ok(match, "CSV import action should be present");
  return match[0];
}

const functionSql = extractFunctionSql(migrationSql);
const importActionSource = extractCsvImportAction(actionsSource);

test("CSV import migration creates an authenticated admin-only RPC", () => {
  assert.match(functionSql, /create or replace function public\.import_assignments_csv\(assignment_rows jsonb\)/);
  assert.match(functionSql, /returns integer/);
  assert.match(functionSql, /security invoker/);
  assert.doesNotMatch(functionSql, /security definer/i);
  assert.match(functionSql, /if not app_private\.is_admin\(\) then/);
  assert.match(migrationSql, /revoke all on function public\.import_assignments_csv\(jsonb\) from public, anon, authenticated;/);
  assert.match(migrationSql, /grant execute on function public\.import_assignments_csv\(jsonb\) to authenticated;/);
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
  assert.doesNotMatch(importActionSource, /for \(const row of parsed\.rows\)/);
  assert.doesNotMatch(importActionSource, /\.insert\(/);
  assert.doesNotMatch(importActionSource, /\.update\(/);
  assert.doesNotMatch(importActionSource, /\.delete\(/);
  assert.doesNotMatch(importActionSource, /\.upsert\(/);
  assert.doesNotMatch(importActionSource, /service[_-]?role/i);
});
