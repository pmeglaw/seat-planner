import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

// Employee-data layering (advisor MED finding): viewer people data must come
// only from the published_employees snapshot, replaced atomically inside the
// publish transaction — never the live employees table, which is the admins'
// draft-side working set.

// The 07-08 migration owns the snapshot table, its RLS, and the seed insert;
// those assertions read that file directly.
const migrationSql = await readFile(
  new URL("../supabase/migrations/20260708230000_published_employee_snapshot.sql", import.meta.url),
  "utf8"
);
const viewerSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const adminSource = await readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8");
const seatMapSource = await readFile(new URL("../components/seat-map/SeatMap.tsx", import.meta.url), "utf8");

function extractPublishFunction(sql) {
  // `[^)]*` (not `\(\)`): 20260805130000 added the expected_draft_seats fence
  // parameter, and the guardrail must keep pinning the LATEST definition
  // rather than silently sticking to the last zero-arg one.
  const match = sql.match(/create or replace function app_private\.publish_seat_map\([^)]*\)[\s\S]+?\$\$;/);
  return match ? match[0] : null;
}

// The publish RPC is redefined by later migrations (email column, change
// summary, …). Pin the guardrail to the LATEST definition across all
// migrations — sorting timestamped filenames ascending and keeping the last
// match — so redefining the function never silently escapes these checks.
async function latestPublishFunction() {
  const migrationsDir = new URL("../supabase/migrations/", import.meta.url);
  const files = (await readdir(migrationsDir)).filter(name => name.endsWith(".sql")).sort();
  let latest = null;
  for (const name of files) {
    const sql = await readFile(new URL(name, migrationsDir), "utf8");
    const fn = extractPublishFunction(sql);
    if (fn) latest = fn;
  }
  assert.ok(latest, "at least one migration should define app_private.publish_seat_map()");
  return latest;
}

const publishSql = await latestPublishFunction();

test("published_employees snapshot table is select-only for clients", () => {
  assert.match(migrationSql, /create table if not exists public\.published_employees/);
  assert.match(migrationSql, /alter table public\.published_employees enable row level security/);
  assert.match(migrationSql, /create policy published_employees_select_authenticated[\s\S]+?for select[\s\S]+?to authenticated/);
  // No client write path: the only writers are the SECURITY DEFINER publish
  // RPC and migrations.
  assert.doesNotMatch(migrationSql, /create policy[\s\S]{0,200}for (insert|update|delete)/i);
  assert.match(migrationSql, /revoke all on table public\.published_employees from anon;/);
  assert.match(migrationSql, /grant select on table public\.published_employees to authenticated;/);
});

test("publish RPC replaces the employee snapshot atomically with the seat copy", () => {
  assert.match(publishSql, /security definer/);
  assert.match(publishSql, /set search_path = public/);
  assert.match(publishSql, /if not app_private\.is_admin\(\) then/);

  const seatDelete = publishSql.indexOf("delete from public.seats where layer = 'published'");
  // The WHERE clause is load-bearing: Supabase's pg-safeupdate rejects bare
  // DELETEs on API connections, even inside SECURITY DEFINER functions.
  const employeeDelete = publishSql.indexOf("delete from public.published_employees where true");
  const employeeInsert = publishSql.indexOf("insert into public.published_employees");
  const auditInsert = publishSql.indexOf("insert into public.publish_events");

  assert.notEqual(seatDelete, -1);
  assert.notEqual(employeeDelete, -1, "snapshot replace should be present");
  assert.notEqual(employeeInsert, -1);
  assert.ok(employeeDelete < employeeInsert, "snapshot delete precedes reinsert");
  assert.ok(employeeInsert < auditInsert, "snapshot happens inside the same transaction, before the audit event");
  assert.match(publishSql, /from public\.employees\s+where active/);

  // Plan 005 parity: change_summary must count added/removed people and seat
  // detail edits, not just edits to people/seats present on both sides.
  assert.match(publishSql, /'employees_added'/);
  assert.match(publishSql, /'employees_removed'/);
  assert.match(publishSql, /'seat_detail_changes'/);
});

test("snapshot migration seeds the table so viewers are never blank pre-publish", () => {
  const seedIndex = migrationSql.lastIndexOf("insert into public.published_employees");
  const functionEnd = migrationSql.indexOf("$$;");
  assert.ok(seedIndex > functionEnd, "a seed insert should follow the function definition");
  assert.match(migrationSql.slice(seedIndex), /on conflict \(id\) do nothing/);
});

test("viewer page reads only the published employee snapshot", () => {
  assert.match(viewerSource, /from\("published_employees"\)/);
  assert.doesNotMatch(viewerSource, /from\("employees"\)/);
  // No embedded live-employee join on the seats query either.
  assert.doesNotMatch(viewerSource, /employee:employees/);
  assert.match(viewerSource, /\.eq\("layer", "published"\)/);
});

test("admin publish review diffs live employees against the viewer snapshot", () => {
  assert.match(adminSource, /from\("published_employees"\)/);
  // Same intent as before — the viewer snapshot reaches SeatMap as its own
  // prop, so the publish review can diff live employees against it. The value
  // is now a non-null Employee[] from fetchAllRows rather than a cast of a
  // possibly-null query result, so only the spelling moved. The query that
  // feeds it is still asserted on the line above.
  assert.match(adminSource, /publishedEmployees=\{publishedEmployees\}/);
  assert.match(seatMapSource, /employees: localEmployees,\s+publishedEmployees: localPublishedEmployees/);
  assert.match(seatMapSource, /employeeDetailChanges/);
});
