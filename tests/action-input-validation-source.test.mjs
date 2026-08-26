import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// CODE-01 (#275): a server action's parameter type is erased at build time, so
// the actions must parse what actually arrived before they write. This is an
// ordering guardrail, not a style rule: a parse that runs after the insert (or
// not at all) means unvalidated input lands in the directory, and the length
// CHECKs added for S-01 (20260810120000) only reject it — they cannot tell the
// admin which field was wrong. The parser's behaviour is covered by
// tests/schemas.test.mjs.
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
  { name: "deleteZoneAction", nextName: "DeleteSeatResult", field: "Zone" }
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

// S-01: updateSeatAction writes employees.full_name, .position,
// .phone_extension and .department through update_draft_seat — the same columns
// the employee actions bound — but reached them with a trim-only helper, so the
// bound depended on which action the caller invoked. Ordering guardrail, same as
// the employee actions above; parseSeatTextInput's behaviour is covered by
// tests/schemas.test.mjs.
test("updateSeatAction parses its text before calling the RPC", () => {
  const source = extractAction("updateSeatAction", "SwapSeatAssignmentsResult");

  const guardIndex = source.indexOf("parseSeatTextInput(input)");
  const rpcIndex = source.indexOf('.rpc("update_draft_seat"');

  assert.notEqual(guardIndex, -1, "updateSeatAction should parse its text input");
  assert.notEqual(rpcIndex, -1, "updateSeatAction should call update_draft_seat");
  assert.ok(guardIndex < rpcIndex, "the parse must run before the write");
  assert.ok(source.indexOf("await requireAdmin()") < guardIndex, "authorize before validating");

  // Returned, not thrown: production strips a thrown error to a digest, so the
  // admin who typed the over-long value would see nothing useful.
  assert.match(
    source,
    /if \(!parsed\.ok\) return \{ ok: false, code: "VALIDATION", message: parsed\.message \};/,
    "a bound failure should be returned as a VALIDATION result"
  );
});

test("updateSeatAction forwards the PARSED values, not the raw input", () => {
  const source = extractAction("updateSeatAction", "SwapSeatAssignmentsResult");
  // A parse whose result is discarded is decoration. Every text argument the RPC
  // receives must come off the parsed object.
  for (const argument of [
    "seat_label: label",
    "employee_name: employeeName",
    "employee_position: employeePosition ?? null",
    "employee_phone_extension: phoneExtension ?? null",
    "employee_department: department",
    "seat_zone: zone",
    "seat_notes: notes"
  ]) {
    assert.ok(source.includes(argument), `${argument} should be passed to the RPC`);
  }
  assert.doesNotMatch(source, /normalizeOptionalText\(input\./, "no trim-only helper should survive here");
  assert.doesNotMatch(source, /assertNonEmpty\(input\.label/, "the label goes through the bounded parser");
});

// The *_provided flags tell the RPC "the caller sent this key", which is how a
// seat edit avoids blanking a person's position. They must be derived from the
// parsed object, or the flag and the value can disagree.
test("updateSeatAction keeps the absent-versus-null distinction after parsing", () => {
  const source = extractAction("updateSeatAction", "SwapSeatAssignmentsResult");
  assert.match(source, /employee_position_provided: employeePosition !== undefined/);
  assert.match(source, /employee_phone_extension_provided: phoneExtension !== undefined/);
});

// Snapshot restore rewrites the whole draft from client-held JSON, so the
// snapshot is wire input like any other. It threw for a missing id already; it
// stored any length of text.
test("snapshot restore normalizers bound the text they rewrite", () => {
  const seatNormalizer = actionsSource.match(/function normalizeRestoreSeat\([\s\S]+?\r?\n}/)?.[0];
  const employeeNormalizer = actionsSource.match(/function normalizeRestoreEmployee\([\s\S]+?\r?\n}/)?.[0];
  assert.ok(seatNormalizer && employeeNormalizer, "both normalizers should be present");

  for (const [name, source] of [
    ["normalizeRestoreSeat", seatNormalizer],
    ["normalizeRestoreEmployee", employeeNormalizer]
  ]) {
    assert.doesNotMatch(source, /normalizeOptionalText\(/, `${name} should not use the trim-only helper`);
    assert.match(source, /boundedOptional\(|boundedRequired\(/, `${name} should bound its text`);
  }

  assert.ok(seatNormalizer.includes("MAX_SEAT_LABEL_LENGTH"), "the restored label is bounded");
  assert.ok(seatNormalizer.includes("MAX_SEAT_NOTES_LENGTH"), "the restored note is bounded");
  assert.ok(employeeNormalizer.includes("MAX_EMPLOYEE_NAME_LENGTH"), "the restored name is bounded");
});

// S-05: parseUuid was applied inconsistently — updateEmployeeAction and
// deleteEmployeeAction parsed their target ids while the seat-facing actions
// took theirs on trust (trim-only or raw). Legibility hardening, not a
// vulnerability fix: PostgREST parameterizes and RLS + the RPCs' is_admin
// checks hold either way, but a malformed id should fail as a readable
// validation error at the boundary, not as a Postgres uuid cast deep in a
// query.
test("updateSeatAction validates the seat and employee ids it targets", () => {
  const source = extractAction("updateSeatAction", "SwapSeatAssignmentsResult");

  const seatIdGuard = source.indexOf('parseUuid(input.seatId, "Seat id")');
  assert.notEqual(seatIdGuard, -1, "the seat id should be parsed as a uuid");
  assert.ok(seatIdGuard < source.indexOf('.rpc("update_draft_seat"'), "seat id must be validated before the RPC call");
  assert.match(source, /draft_seat_id: seatId\.value/, "the parsed seat id is what reaches the RPC");

  assert.match(source, /parseUuid\(input\.employeeId, "Employee id"\)/, "a provided employee id should be parsed as a uuid");
  assert.doesNotMatch(source, /input\.employeeId \|\| null/, "the raw employee id must not reach the RPC");
});

test("swapSeatAssignmentsAction validates both seat ids", () => {
  // extractAction needs a `}\n\nexport` boundary; swap is followed by the
  // ActionValidationFailure doc comment instead, so anchor on that comment.
  const source = actionsSource.match(
    /export async function swapSeatAssignmentsAction\([\s\S]+?\r?\n}(?=\r?\n\r?\n\/\*\*)/
  )?.[0];
  assert.ok(source, "swapSeatAssignmentsAction should be present");

  const sourceGuard = source.indexOf('parseUuid(input.sourceSeatId, "Source seat id")');
  const targetGuard = source.indexOf('parseUuid(input.targetSeatId, "Target seat id")');
  assert.notEqual(sourceGuard, -1, "the source seat id should be parsed as a uuid");
  assert.notEqual(targetGuard, -1, "the target seat id should be parsed as a uuid");
  const readIndex = source.indexOf('.from("seats")');
  assert.ok(sourceGuard < readIndex && targetGuard < readIndex, "ids must be validated before the seats read");
  assert.doesNotMatch(source, /assertNonEmpty\(/, "the trim-only helper must not survive here");
});

test("deleteSeatAction validates the seat id it deletes", () => {
  const source = extractAction("deleteSeatAction", "ImportAssignmentsCsvResult");

  const guardIndex = source.indexOf('parseUuid(seatId, "Seat id")');
  assert.notEqual(guardIndex, -1, "the seat id should be parsed as a uuid");
  assert.ok(guardIndex < source.indexOf('.from("seats")'), "id must be validated before the seats read");
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
