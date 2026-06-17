import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationSql = await readFile(
  new URL("../supabase/migrations/20260616000400_management_actions_rpc.sql", import.meta.url),
  "utf8"
);
const actionsSource = await readFile(new URL("../app/actions.ts", import.meta.url), "utf8");

const rpcContracts = [
  { name: "deactivate_employee", signature: "public\\.deactivate_employee\\(uuid\\)", returns: /returns uuid/ },
  { name: "rename_department", signature: "public\\.rename_department\\(text, text\\)", returns: /returns void/ },
  { name: "delete_department", signature: "public\\.delete_department\\(text\\)", returns: /returns void/ },
  { name: "rename_zone", signature: "public\\.rename_zone\\(text, text\\)", returns: /returns void/ },
  { name: "delete_zone", signature: "public\\.delete_zone\\(text\\)", returns: /returns void/ }
];

function extractFunctionSql(name) {
  const match = migrationSql.match(new RegExp(`create or replace function public\\.${name}[\\s\\S]+?\\$\\$;\\s*`));
  assert.ok(match, `${name} RPC should be present in the management migration`);
  return match[0];
}

function extractActionSource(name, nextName) {
  const start = actionsSource.indexOf(`export async function ${name}`);
  assert.notEqual(start, -1, `${name} should be present`);

  const end = actionsSource.indexOf(`export async function ${nextName}`, start + 1);
  assert.notEqual(end, -1, `${nextName} should follow ${name}`);
  return actionsSource.slice(start, end);
}

const deactivateEmployeeSql = extractFunctionSql("deactivate_employee");
const renameDepartmentSql = extractFunctionSql("rename_department");
const deleteDepartmentSql = extractFunctionSql("delete_department");
const renameZoneSql = extractFunctionSql("rename_zone");
const deleteZoneSql = extractFunctionSql("delete_zone");

test("management migration creates authenticated admin-only RPCs", () => {
  for (const contract of rpcContracts) {
    const functionSql = extractFunctionSql(contract.name);
    assert.match(functionSql, new RegExp(`create or replace function public\\.${contract.name}\\(`));
    assert.match(functionSql, contract.returns);
    assert.match(functionSql, /security invoker/);
    assert.doesNotMatch(functionSql, /security definer/i);
    assert.match(functionSql, /if not app_private\.is_admin\(\) then/);
    assert.doesNotMatch(functionSql, /exception\s+when/i);
    assert.match(migrationSql, new RegExp(`revoke all on function ${contract.signature} from public, anon, authenticated;`));
    assert.match(migrationSql, new RegExp(`grant execute on function ${contract.signature} to authenticated;`));
  }
});

test("employee deactivation keeps published assignments protected before mutation", () => {
  const publishedCheckIndex = deactivateEmployeeSql.indexOf("where seat.layer = 'published'::public.seat_layer");
  const firstMutationIndex = Math.min(
    deactivateEmployeeSql.indexOf("update public.seats"),
    deactivateEmployeeSql.indexOf("update public.employees")
  );

  assert.notEqual(publishedCheckIndex, -1, "employee deactivation should check the published map");
  assert.ok(publishedCheckIndex < firstMutationIndex, "published-map guard should run before any mutation");
  assert.match(deactivateEmployeeSql, /This employee is still on the published map at %\. Remove them from draft and publish before deleting\./);

  const seatUpdates = deactivateEmployeeSql.match(/update public\.seats[\s\S]+?;/g) ?? [];
  assert.equal(seatUpdates.length, 1);
  assert.match(seatUpdates[0], /set\s+employee_id = null,\s+status = 'available'::public\.seat_status/);
  assert.match(seatUpdates[0], /where seat\.layer = 'draft'::public\.seat_layer\s+and seat\.employee_id = employee_to_deactivate/);
  assert.doesNotMatch(seatUpdates[0], /published/i);
  assert.match(deactivateEmployeeSql, /update public\.employees as employee[\s\S]+set active = false[\s\S]+where employee\.id = employee_to_deactivate/);
});

test("department management RPCs preserve option-state and employee behavior atomically", () => {
  assert.match(renameDepartmentSql, /insert into public\.department_options \(name, active\)[\s\S]+values \(normalized_to, true\)[\s\S]+on conflict \(name\) do update\s+set active = true/);
  assert.match(renameDepartmentSql, /update public\.employees as employee\s+set department = normalized_to\s+where employee\.department = normalized_from/);
  assert.match(renameDepartmentSql, /update public\.department_options as department_option\s+set active = false\s+where department_option\.name = normalized_from/);
  assert.doesNotMatch(renameDepartmentSql, /public\.seats/);
  assert.doesNotMatch(renameDepartmentSql, /published/i);

  assert.match(deleteDepartmentSql, /update public\.employees as employee\s+set department = null\s+where employee\.department = normalized_name/);
  assert.match(deleteDepartmentSql, /update public\.department_options as department_option\s+set active = false\s+where department_option\.name = normalized_name/);
  assert.doesNotMatch(deleteDepartmentSql, /public\.seats/);
  assert.doesNotMatch(deleteDepartmentSql, /published/i);
});

test("zone management RPCs preserve option-state behavior and mutate draft seats only", () => {
  assert.match(renameZoneSql, /insert into public\.zone_options \(name, active\)[\s\S]+values \(normalized_to, true\)[\s\S]+on conflict \(name\) do update\s+set active = true/);
  assert.match(renameZoneSql, /update public\.zone_options as zone_option\s+set active = false\s+where zone_option\.name = normalized_from/);

  for (const functionSql of [renameZoneSql, deleteZoneSql]) {
    const seatUpdates = functionSql.match(/update public\.seats[\s\S]+?;/g) ?? [];
    assert.equal(seatUpdates.length, 1);
    assert.match(seatUpdates[0], /where seat\.layer = 'draft'::public\.seat_layer/);
    assert.doesNotMatch(seatUpdates[0], /published/i);
    assert.doesNotMatch(functionSql, /insert into public\.seats/i);
    assert.doesNotMatch(functionSql, /delete from public\.seats/i);
  }

  assert.match(renameZoneSql, /set zone = normalized_to/);
  assert.match(deleteZoneSql, /set zone = null/);
  assert.match(deleteZoneSql, /update public\.zone_options as zone_option\s+set active = false\s+where zone_option\.name = normalized_name/);
});

test("management server actions delegate multi-write mutations to RPCs", () => {
  const actionContracts = [
    {
      name: "deleteEmployeeAction",
      nextName: "createDepartmentAction",
      rpc: "deactivate_employee",
      args: [/employee_to_deactivate: employeeId/],
      returnShape: /return \{ employeeId \};/
    },
    {
      name: "renameDepartmentAction",
      nextName: "deleteDepartmentAction",
      rpc: "rename_department",
      args: [/department_from: from/, /department_to: to/],
      returnShape: /return \{ from, to \};/
    },
    {
      name: "deleteDepartmentAction",
      nextName: "createZoneAction",
      rpc: "delete_department",
      args: [/department_name: target/],
      returnShape: /return \{ department: target \};/
    },
    {
      name: "renameZoneAction",
      nextName: "deleteZoneAction",
      rpc: "rename_zone",
      args: [/zone_from: from/, /zone_to: to/],
      returnShape: /return \{ from, to \};/
    },
    {
      name: "deleteZoneAction",
      nextName: "deleteSeatAction",
      rpc: "delete_zone",
      args: [/zone_name: target/],
      returnShape: /return \{ zone: target \};/
    }
  ];

  for (const contract of actionContracts) {
    const actionSource = extractActionSource(contract.name, contract.nextName);
    assert.match(actionSource, /const supabase = await requireAdmin\(\)/);
    assert.match(actionSource, new RegExp(`\\.rpc\\("${contract.rpc}", \\{`));
    for (const arg of contract.args) {
      assert.match(actionSource, arg);
    }
    assert.match(actionSource, contract.returnShape);
    assert.doesNotMatch(actionSource, /\.from\("seats"\)/);
    assert.doesNotMatch(actionSource, /\.from\("employees"\)/);
    assert.doesNotMatch(actionSource, /\.from\("department_options"\)/);
    assert.doesNotMatch(actionSource, /\.from\("zone_options"\)/);
    assert.doesNotMatch(actionSource, /\.insert\(/);
    assert.doesNotMatch(actionSource, /\.update\(/);
    assert.doesNotMatch(actionSource, /\.delete\(/);
    assert.doesNotMatch(actionSource, /\.upsert\(/);
    assert.doesNotMatch(actionSource, /service[_-]?role/i);
  }
});
