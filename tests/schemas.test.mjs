import assert from "node:assert/strict";
import test from "node:test";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";

// Exercises the REAL lib/schemas.ts. This module is the trust boundary for the
// employee server actions (CODE-01): `public.employees` has no CHECK constraint
// on any text column, so every bound asserted here is the only one that exists.
const {
  parseEmployeeInput,
  parseRequiredText,
  parseOptionalText,
  parseOptionalEmail,
  parseUuid,
  MAX_EMPLOYEE_NAME_LENGTH,
  MAX_PHONE_EXTENSION_LENGTH,
  MAX_EMAIL_LENGTH
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
