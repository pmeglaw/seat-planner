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

test("the employee mutation result stays a discriminated union", () => {
  assert.match(
    actionsSource,
    /export type EmployeeMutationResult =\s+\| \{ ok: true; employee: Employee \}\s+\| \{ ok: false; code: "VALIDATION"; message: string \};/
  );
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
