import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Employee-data layering (advisor MED finding): viewer people data must come
// only from the published_employees snapshot, replaced atomically inside the
// publish transaction — never the live employees table, which is the admins'
// draft-side working set.

const migrationSql = await readFile(
  new URL("../supabase/migrations/20260708230000_published_employee_snapshot.sql", import.meta.url),
  "utf8"
);
const viewerSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const adminSource = await readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8");
const seatMapSource = await readFile(new URL("../components/seat-map/SeatMap.tsx", import.meta.url), "utf8");

function extractPublishFunction(sql) {
  const match = sql.match(/create or replace function app_private\.publish_seat_map\(\)[\s\S]+?\$\$;/);
  assert.ok(match, "publish RPC should be recreated in the snapshot migration");
  return match[0];
}

const publishSql = extractPublishFunction(migrationSql);

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
  assert.match(publishSql, /if not app_private\.is_admin\(\) then/);

  const seatDelete = publishSql.indexOf("delete from public.seats where layer = 'published'");
  const employeeDelete = publishSql.indexOf("delete from public.published_employees");
  const employeeInsert = publishSql.indexOf("insert into public.published_employees");
  const auditInsert = publishSql.indexOf("insert into public.publish_events");

  assert.notEqual(seatDelete, -1);
  assert.notEqual(employeeDelete, -1, "snapshot replace should be present");
  assert.notEqual(employeeInsert, -1);
  assert.ok(employeeDelete < employeeInsert, "snapshot delete precedes reinsert");
  assert.ok(employeeInsert < auditInsert, "snapshot happens inside the same transaction, before the audit event");
  assert.match(publishSql, /from public\.employees\s+where active/);
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
  assert.match(adminSource, /publishedEmployees=\{\(publishedEmployees \?\? \[\]\) as Employee\[\]\}/);
  assert.match(seatMapSource, /employees: localEmployees,\s+publishedEmployees: localPublishedEmployees/);
  assert.match(seatMapSource, /employeeDetailChanges/);
});
