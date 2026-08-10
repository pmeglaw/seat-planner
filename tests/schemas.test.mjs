import assert from "node:assert/strict";
import test from "node:test";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";

// Exercises the REAL lib/schemas.ts, the trust boundary for the server actions
// (CODE-01). Since 20260810120000 the length bounds are mirrored by Postgres
// CHECK constraints (tests/text-length-constraints.test.mjs probes those), but
// the type check, the control-character rule and the field-level message exist
// only here — the database can reject a value, not explain which field it was.
const {
  parseEmployeeInput,
  parseRequiredText,
  parseOptionalText,
  parseOptionalMultilineText,
  parseOptionalEmail,
  parseSeatTextInput,
  parseUuid,
  MAX_EMPLOYEE_NAME_LENGTH,
  MAX_PHONE_EXTENSION_LENGTH,
  MAX_EMAIL_LENGTH,
  MAX_OPTION_NAME_LENGTH,
  MAX_SEAT_LABEL_LENGTH,
  MAX_SEAT_NOTES_LENGTH
} = await importTsModule("lib/schemas.ts");

// Built with fromCharCode so no raw control byte is ever embedded in this file,
// where an editor or a diff view would silently swallow it.
const BELL = String.fromCharCode(7);
const DELETE_CHAR = String.fromCharCode(127);

test("required text trims and accepts a normal value", () => {
  assert.deepEqual(parseRequiredText("  Ada Lovelace  ", "Employee name", 120), {
    ok: true,
    value: "Ada Lovelace"
  });
});

test("required text rejects empty, whitespace-only, and non-string input", () => {
  assert.deepEqual(parseRequiredText("", "Employee name", 120), {
    ok: false,
    message: "Employee name is required."
  });
  assert.deepEqual(parseRequiredText("   ", "Employee name", 120), {
    ok: false,
    message: "Employee name is required."
  });
  // The wire can send anything — the parameter type is erased at build time.
  for (const value of [undefined, null, 42, true, {}, []]) {
    const result = parseRequiredText(value, "Employee name", 120);
    assert.equal(result.ok, false);
    assert.equal(result.message, "Employee name must be text.");
  }
});

test("required text enforces the length bound", () => {
  const atLimit = "a".repeat(MAX_EMPLOYEE_NAME_LENGTH);
  assert.equal(parseRequiredText(atLimit, "Employee name", MAX_EMPLOYEE_NAME_LENGTH).ok, true);

  const overLimit = "a".repeat(MAX_EMPLOYEE_NAME_LENGTH + 1);
  assert.deepEqual(parseRequiredText(overLimit, "Employee name", MAX_EMPLOYEE_NAME_LENGTH), {
    ok: false,
    message: "Employee name must be 120 characters or fewer."
  });
});

test("control characters are rejected rather than stored", () => {
  assert.deepEqual(parseRequiredText(`Ada${BELL}Lovelace`, "Employee name", 120), {
    ok: false,
    message: "Employee name contains characters that are not allowed."
  });
  assert.deepEqual(parseRequiredText(`Ada${DELETE_CHAR}Lovelace`, "Employee name", 120), {
    ok: false,
    message: "Employee name contains characters that are not allowed."
  });
  // A trailing newline is only whitespace, so trimming removes it and the value
  // is accepted — the guard is for embedded control bytes, not for stray space.
  assert.deepEqual(parseRequiredText("Ada\n", "Employee name", 120), { ok: true, value: "Ada" });
});

test("optional text normalizes absent, null, and blank to null", () => {
  for (const value of [undefined, null, "", "   "]) {
    assert.deepEqual(parseOptionalText(value, "Position", 120), { ok: true, value: null });
  }
});

test("optional text still type-checks and length-checks a supplied value", () => {
  assert.deepEqual(parseOptionalText("  Partner ", "Position", 120), { ok: true, value: "Partner" });
  assert.deepEqual(parseOptionalText(7, "Position", 120), { ok: false, message: "Position must be text." });
  assert.deepEqual(parseOptionalText("x".repeat(21), "Phone extension", MAX_PHONE_EXTENSION_LENGTH), {
    ok: false,
    message: "Phone extension must be 20 characters or fewer."
  });
  assert.deepEqual(parseOptionalText(`Ada${BELL}`, "Position", 120), {
    ok: false,
    message: "Position contains characters that are not allowed."
  });
});

test("email is format-checked, which the database never does", () => {
  assert.deepEqual(parseOptionalEmail("  Person@Example.com "), { ok: true, value: "Person@Example.com" });
  assert.deepEqual(parseOptionalEmail(undefined), { ok: true, value: null });
  assert.deepEqual(parseOptionalEmail(""), { ok: true, value: null });
  assert.deepEqual(parseOptionalEmail(5), { ok: false, message: "Email must be text." });

  for (const invalid of ["person", "person@", "@example.com", "person@example", "a b@example.com", "a@@example.com"]) {
    assert.deepEqual(parseOptionalEmail(invalid), { ok: false, message: "Enter a valid email address." }, invalid);
  }

  const overLimit = `${"a".repeat(MAX_EMAIL_LENGTH)}@example.com`;
  assert.deepEqual(parseOptionalEmail(overLimit), {
    ok: false,
    message: "Email must be 254 characters or fewer."
  });
});

// Seat notes are typed into a TEXTAREA (SeatInspector), and the CSV round-trip
// quotes them, so an embedded newline is ordinary input here — unlike every
// other text field, where a control byte can only be junk. This parser is the
// one exception, and it is deliberately narrow: newline and tab, nothing else.
test("multiline text keeps newlines and tabs but still rejects other control bytes", () => {
  assert.deepEqual(parseOptionalMultilineText("Window seat.\nQuiet corner.", "Notes", MAX_SEAT_NOTES_LENGTH), {
    ok: true,
    value: "Window seat.\nQuiet corner."
  });
  assert.deepEqual(parseOptionalMultilineText("Row\tone", "Notes", MAX_SEAT_NOTES_LENGTH), {
    ok: true,
    value: "Row\tone"
  });
  assert.deepEqual(parseOptionalMultilineText(`Quiet${BELL}corner`, "Notes", MAX_SEAT_NOTES_LENGTH), {
    ok: false,
    message: "Notes contains characters that are not allowed."
  });
  assert.deepEqual(parseOptionalMultilineText(`Quiet${DELETE_CHAR}corner`, "Notes", MAX_SEAT_NOTES_LENGTH), {
    ok: false,
    message: "Notes contains characters that are not allowed."
  });
});

test("multiline text still normalizes blanks and enforces its bound", () => {
  for (const value of [undefined, null, "", "   "]) {
    assert.deepEqual(parseOptionalMultilineText(value, "Notes", MAX_SEAT_NOTES_LENGTH), { ok: true, value: null });
  }
  assert.deepEqual(parseOptionalMultilineText(7, "Notes", MAX_SEAT_NOTES_LENGTH), {
    ok: false,
    message: "Notes must be text."
  });
  assert.deepEqual(parseOptionalMultilineText("a".repeat(MAX_SEAT_NOTES_LENGTH + 1), "Notes", MAX_SEAT_NOTES_LENGTH), {
    ok: false,
    message: "Notes must be 1000 characters or fewer."
  });
});

// updateSeatAction writes the same employees columns as the employee actions —
// full_name, position, phone_extension, department — through the
// update_draft_seat RPC. Before this parser it bounded none of them, so one
// column had two different bounds depending on which action you called.
test("seat text input parses a full payload and normalizes optional fields", () => {
  const result = parseSeatTextInput({
    label: "  W11 ",
    employeeName: "  Ada Lovelace  ",
    employeePosition: "  Partner ",
    phoneExtension: " 204 ",
    department: "",
    zone: "  Corner Offices  ",
    notes: "  Prefers the window.  "
  });

  assert.deepEqual(result, {
    ok: true,
    value: {
      label: "W11",
      employeeName: "Ada Lovelace",
      employeePosition: "Partner",
      phoneExtension: "204",
      department: null,
      zone: "Corner Offices",
      notes: "Prefers the window."
    }
  });
});

test("seat text input requires a label and bounds it", () => {
  assert.deepEqual(parseSeatTextInput({ label: "   " }), { ok: false, message: "Seat label is required." });
  assert.deepEqual(parseSeatTextInput({ label: 42 }), { ok: false, message: "Seat label must be text." });
  assert.equal(parseSeatTextInput({ label: "a".repeat(MAX_SEAT_LABEL_LENGTH) }).ok, true);
  assert.deepEqual(parseSeatTextInput({ label: "a".repeat(MAX_SEAT_LABEL_LENGTH + 1) }), {
    ok: false,
    message: `Seat label must be ${MAX_SEAT_LABEL_LENGTH} characters or fewer.`
  });
});

test("seat text input bounds every field it forwards to the database", () => {
  const cases = [
    ["employeeName", MAX_EMPLOYEE_NAME_LENGTH, "Employee name"],
    ["employeePosition", 120, "Position"],
    ["phoneExtension", MAX_PHONE_EXTENSION_LENGTH, "Phone extension"],
    ["department", MAX_OPTION_NAME_LENGTH, "Department"],
    ["zone", MAX_OPTION_NAME_LENGTH, "Zone"],
    ["notes", MAX_SEAT_NOTES_LENGTH, "Notes"]
  ];

  for (const [field, maxLength, label] of cases) {
    assert.deepEqual(
      parseSeatTextInput({ label: "W11", [field]: "a".repeat(maxLength + 1) }),
      { ok: false, message: `${label} must be ${maxLength} characters or fewer.` },
      field
    );
    assert.equal(parseSeatTextInput({ label: "W11", [field]: "a".repeat(maxLength) }).ok, true, field);
    assert.deepEqual(
      parseSeatTextInput({ label: "W11", [field]: `bad${BELL}value` }),
      { ok: false, message: `${label} contains characters that are not allowed.` },
      field
    );
  }
});

// updateSeatAction distinguishes an absent key ("leave the stored value alone")
// from an explicit null ("clear it") for position and phone extension, and
// passes a *_provided flag to the RPC based on that. Flattening the two here
// would let any seat edit silently blank a person's position.
test("seat text input preserves absent-versus-null for position and phone extension", () => {
  const absent = parseSeatTextInput({ label: "W11" });
  assert.equal(absent.ok, true);
  assert.equal("employeePosition" in absent.value, false);
  assert.equal("phoneExtension" in absent.value, false);

  const explicit = parseSeatTextInput({ label: "W11", employeePosition: null, phoneExtension: "  " });
  assert.equal(explicit.value.employeePosition, null);
  assert.equal(explicit.value.phoneExtension, null);
  assert.equal("employeePosition" in explicit.value, true);
  assert.equal("phoneExtension" in explicit.value, true);
});

test("seat text input keeps a multiline note but rejects control bytes elsewhere", () => {
  const multiline = parseSeatTextInput({ label: "W11", notes: "Line one\nLine two" });
  assert.equal(multiline.value.notes, "Line one\nLine two");

  assert.deepEqual(parseSeatTextInput({ label: "W11", zone: "Corner\nOffices" }), {
    ok: false,
    message: "Zone contains characters that are not allowed."
  });
});

test("seat text input rejects a non-object payload", () => {
  for (const value of [null, undefined, "label", 5]) {
    assert.deepEqual(parseSeatTextInput(value), { ok: false, message: "Seat details are missing." }, String(value));
  }
});

test("uuid parsing rejects anything that is not a uuid", () => {
  assert.deepEqual(parseUuid("3f1b9d3e-4a2c-4f7b-9d5e-8c1a2b3c4d5e", "Employee id"), {
    ok: true,
    value: "3f1b9d3e-4a2c-4f7b-9d5e-8c1a2b3c4d5e"
  });
  for (const invalid of ["", "not-a-uuid", "3f1b9d3e4a2c4f7b9d5e8c1a2b3c4d5e", 12345]) {
    assert.equal(parseUuid(invalid, "Employee id").ok, false, String(invalid));
  }
  assert.equal(parseUuid("x".repeat(40), "Employee id").message, "Employee id must be 36 characters or fewer.");
});

test("employee input parses a full payload and normalizes optional fields", () => {
  const result = parseEmployeeInput({
    fullName: "  Ada Lovelace ",
    position: "  Partner  ",
    department: "",
    phoneExtension: " 4021 ",
    email: " ada@example.com "
  });

  assert.deepEqual(result, {
    ok: true,
    value: {
      fullName: "Ada Lovelace",
      position: "Partner",
      department: null,
      phoneExtension: "4021",
      email: "ada@example.com"
    }
  });
});

// updateEmployeeAction spreads `email` only when the key is present, so a caller
// that predates the column cannot blank a stored address. Collapsing absent to
// null here would silently erase email on every legacy update.
test("an omitted email key stays omitted, while an explicit blank clears it", () => {
  const omitted = parseEmployeeInput({ fullName: "Ada Lovelace" });
  assert.equal(omitted.ok, true);
  assert.equal("email" in omitted.value, false);

  const cleared = parseEmployeeInput({ fullName: "Ada Lovelace", email: "" });
  assert.equal(cleared.ok, true);
  assert.equal("email" in cleared.value, true);
  assert.equal(cleared.value.email, null);

  const explicitNull = parseEmployeeInput({ fullName: "Ada Lovelace", email: null });
  assert.equal(explicitNull.value.email, null);
});

test("employee input rejects a missing name and a malformed email", () => {
  assert.deepEqual(parseEmployeeInput({ fullName: "   " }), {
    ok: false,
    message: "Employee name is required."
  });
  assert.deepEqual(parseEmployeeInput({ fullName: "Ada", email: "nope" }), {
    ok: false,
    message: "Enter a valid email address."
  });
  assert.deepEqual(parseEmployeeInput({ fullName: "Ada", phoneExtension: "x".repeat(21) }), {
    ok: false,
    message: "Phone extension must be 20 characters or fewer."
  });
  assert.deepEqual(parseEmployeeInput({ fullName: "Ada", position: 9 }), {
    ok: false,
    message: "Position must be text."
  });
  assert.deepEqual(parseEmployeeInput({ fullName: "Ada", department: "d".repeat(121) }), {
    ok: false,
    message: "Department must be 120 characters or fewer."
  });
});

test("employee input rejects a payload that is not an object at all", () => {
  for (const value of [undefined, null, "Ada", 5]) {
    const result = parseEmployeeInput(value);
    assert.equal(result.ok, false);
    assert.equal(result.message, "Employee details are missing.");
  }
});

test("extra keys are ignored rather than forwarded to the database", () => {
  const result = parseEmployeeInput({
    fullName: "Ada Lovelace",
    active: false,
    id: "spoofed",
    avatar_url: "https://evil.example/x.png"
  });

  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(result.value).sort(), ["department", "fullName", "phoneExtension", "position"]);
});
