import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// CODE-01 (#275): a server action's parameter type is erased at build time, so
// the employee actions must parse what actually arrived before they write. This
// is an ordering guardrail, not a style rule — `public.employees` has no CHECK
// constraint on any text column, so a parse that runs after the insert (or not
// at all) means unvalidated input lands in the directory. The behaviour of the
// parser itself is covered by tests/schemas.test.mjs.
const actionsSource = await readFile(new URL("../app/actions.ts", import.meta.url), "utf8");

function extractAction(name, nextName) {
  const match = actionsSource.match(
    new RegExp(`export async function ${name}\\([\\s\\S]+?\\r?\\n}\\r?\\n\\r?\\nexport (?:async function|type) ${nextName}`)
  );
  assert.ok(match, `${name} should be present and followed by ${nextName}`);
  return match[0];
}

const employeeActions = [
  { name: "createEmployeeAction", nextName: "updateEmployeeAction" },
  { name: "updateEmployeeAction", nextName: "deleteEmployeeAction" }
];

test("employee actions parse their input before touching the database", () => {
  for (const action of employeeActions) {
    const source = extractAction(action.name, action.nextName);

    const guardIndex = source.indexOf("parseEmployeeInput(input)");
    const writeIndex = source.indexOf('.from("employees")');
    const optionUpsertIndex = source.indexOf("upsertDepartmentOption(supabase");

    assert.notEqual(guardIndex, -1, `${action.name} should parse its input`);
    assert.notEqual(writeIndex, -1, `${action.name} should write to employees`);
    assert.ok(guardIndex < writeIndex, `${action.name} must parse before writing employees`);
    assert.ok(
      guardIndex < optionUpsertIndex,
      `${action.name} must parse before upserting the department option`
    );

    // requireAdmin stays the first thing the action does; validation never
    // replaces the authorization check, it runs after it.
    assert.ok(
      source.indexOf("await requireAdmin()") < guardIndex,
      `${action.name} must still authorize before validating`
    );
  }
});

test("employee validation failures are returned, never thrown", () => {
  for (const action of employeeActions) {
    const source = extractAction(action.name, action.nextName);

    // Thrown errors are reduced to a digest in production, so the admin who
    // typed the value would see nothing useful — see mapUpdateSeatError.
    assert.match(
      source,
      /if \(!parsed\.ok\) return \{ ok: false, code: "VALIDATION", message: parsed\.message \};/,
      `${action.name} should return its validation failure`
    );
    assert.match(source, /Promise<EmployeeMutationResult>/);
    assert.match(source, /return \{ ok: true, employee: data as Employee \};/);
  }
});

test("updateEmployeeAction validates the employee id it targets", () => {
  const source = extractAction("updateEmployeeAction", "deleteEmployeeAction");
  const guardIndex = source.indexOf('parseUuid(input.employeeId, "Employee id")');
  assert.notEqual(guardIndex, -1, "the target id should be parsed as a uuid");
  assert.ok(guardIndex < source.indexOf('.from("employees")'), "id must be validated before the update");
  assert.match(source, /\.eq\("id", employeeId\.value\)/, "the parsed id is what reaches the query");
});

test("every input-parsing action shares one discriminated failure arm", () => {
  // A single alias means a new action cannot invent its own rejection shape,
  // which is what lets callers handle `!result.ok` uniformly.
  assert.match(
    actionsSource,
    /export type ActionValidationFailure = \{ ok: false; code: "VALIDATION"; message: string \};/
  );

  const unions = [
    /export type EmployeeMutationResult = \{ ok: true; employee: Employee \} \| ActionValidationFailure;/,
    /export type EmployeeDeleteResult = \{ ok: true; employeeId: string \} \| ActionValidationFailure;/,
    /export type DepartmentMutationResult = \{ ok: true; department: DepartmentOption \} \| ActionValidationFailure;/,
    /export type DepartmentDeleteResult = \{ ok: true; department: string \} \| ActionValidationFailure;/,
    /export type ZoneMutationResult = \{ ok: true; zone: ZoneOption \} \| ActionValidationFailure;/,
    /export type ZoneDeleteResult = \{ ok: true; zone: string \} \| ActionValidationFailure;/,
    /export type OptionRenameResult = \{ ok: true; from: string; to: string \} \| ActionValidationFailure;/
  ];
  for (const union of unions) assert.match(actionsSource, union);
});

// Department and zone names are free text typed by an admin. Postgres only
// rejects blank (`check (char_length(trim(name)) > 0)`), so the type check, the
// control-character check, and the length bound exist solely in lib/schemas.ts.
const optionActions = [
  { name: "createDepartmentAction", nextName: "renameDepartmentAction", field: "Department name" },
  { name: "renameDepartmentAction", nextName: "deleteDepartmentAction", field: "Department to rename" },
  { name: "deleteDepartmentAction", nextName: "createZoneAction", field: "Department" },
  { name: "createZoneAction", nextName: "renameZoneAction", field: "Zone name" },
  { name: "renameZoneAction", nextName: "deleteZoneAction", field: "Zone to rename" },
  { name: "deleteZoneAction", nextName: "deleteSeatAction", field: "Zone" }
];

test("option actions parse their name before writing, and return the failure", () => {
  for (const action of optionActions) {
    const source = extractAction(action.name, action.nextName);

    const guardIndex = source.indexOf("parseRequiredText(");
    assert.notEqual(guardIndex, -1, `${action.name} should parse its name`);
    assert.ok(
      source.includes(`"${action.field}", MAX_OPTION_NAME_LENGTH`),
      `${action.name} should bound the name length`
    );

    const writeIndex = Math.min(
      ...[".rpc(", '.from("department_options")', '.from("zone_options")']
        .map(fragment => source.indexOf(fragment))
        .filter(index => index !== -1)
    );
    assert.ok(guardIndex < writeIndex, `${action.name} must parse before it writes`);
    assert.ok(source.indexOf("await requireAdmin()") < guardIndex, `${action.name} must authorize before validating`);
    assert.match(source, /return \{ ok: false, code: "VALIDATION", message: parsed(From|To)?\.message \};/);
  }
});

test("deleteEmployeeAction validates the id it deactivates", () => {
  const source = extractAction("deleteEmployeeAction", "createDepartmentAction");
  const guardIndex = source.indexOf('parseUuid(targetEmployeeId, "Employee id")');
  assert.notEqual(guardIndex, -1, "the target id should be parsed as a uuid");
  assert.ok(guardIndex < source.indexOf(".rpc("), "id must be validated before the RPC call");
  assert.match(source, /employee_to_deactivate: employeeId/, "the parsed id is what reaches the RPC");
});

test("the management panel handles every returned option failure", async () => {
  const panel = await readFile(new URL("../components/admin-management/AdminManagementPanel.tsx", import.meta.url), "utf8");
  const fallbacks = [
    "Could not add department.",
    "Could not add department to the managed list.",
    "Could not rename department.",
    "Could not add zone.",
    "Could not rename zone.",
    "Could not deactivate employee.",
    "Could not delete department.",
    "Could not delete zone."
  ];
  for (const fallback of fallbacks) {
    assert.ok(
      panel.includes(`showError(result.message, "${fallback}")`) ||
        panel.includes(`showError(zoneResult.message, "${fallback}")`),
      `${fallback} should be surfaced from a returned failure`
    );
  }
});

test("the management panel surfaces a returned validation message", () => {
  const panel = new URL("../components/admin-management/AdminManagementPanel.tsx", import.meta.url);
  return readFile(panel, "utf8").then(source => {
    // Without the string branch in showError, a returned message falls through
    // to the generic fallback and the admin never learns which field is wrong.
    assert.match(source, /if \(typeof errorValue === "string" && errorValue\.trim\(\)\)/);
    assert.match(source, /if \(!result\.ok\) \{\s+showError\(result\.message, "Could not save employee\."\);\s+return;\s+\}/);
  });
});
