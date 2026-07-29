/**
 * Schema layer for the server-action trust boundary (CODE-01).
 *
 * A server action's parameter type is erased at build time, so an action
 * invoked over the wire receives whatever the caller sends — not what the type
 * claims. These parsers re-establish the shape at runtime and hand back a
 * field-level message, instead of letting a malformed value reach Postgres and
 * return as a raw constraint error (or, where no constraint exists, be stored
 * as-is). `public.employees` has no CHECK constraint on any text column, so for
 * those fields this module is the only bound that exists.
 *
 * Two deliberate choices worth knowing before changing anything here:
 *
 * 1. **Parsers return failures, they never throw.** `app/actions.ts` records
 *    why at `mapUpdateSeatError`: production strips a thrown error down to a
 *    digest, so the message never reaches the admin who typed the value.
 *    Callers must handle `{ ok: false }` — that is the point of the shape.
 *
 * 2. **No validation library.** Every pure module under `lib/` is transpiled
 *    and imported by `tests/helpers/tsModuleLoader.mjs`, which writes each
 *    module to an OS temp directory and rewrites only `@/…` specifiers. A bare
 *    `import { z } from "zod"` would be left intact and resolve from a
 *    directory with no `node_modules`, breaking the behaviour-test tier for
 *    this module and everything downstream of it. Hand-written keeps that tier,
 *    the coverage floors, and the client bundle unchanged.
 */

export type SchemaResult<T> =
  | { ok: true; value: T }
  | { ok: false; message: string };

export type EmployeeInput = {
  fullName: string;
  position: string | null;
  department: string | null;
  phoneExtension: string | null;
  /** Absent when the caller omitted the key — see `parseEmployeeInput`. */
  email?: string | null;
};

export const MAX_EMPLOYEE_NAME_LENGTH = 120;
export const MAX_EMPLOYEE_TEXT_LENGTH = 120;
export const MAX_PHONE_EXTENSION_LENGTH = 20;
export const MAX_EMAIL_LENGTH = 254;

// Deliberately permissive: one `@`, no whitespace, and a dotted domain. This is
// a typo guard for a directory field, not an RFC 5322 parser — Supabase Auth
// owns real deliverability, and an over-strict pattern rejects addresses that
// work. 254 is the SMTP path limit.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Scanned by char code rather than a regex so ESLint's no-control-regex rule
// stays satisfied without a disable comment.
function hasControlCharacter(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

function trimmedText(value: unknown, field: string): SchemaResult<string> {
  if (typeof value !== "string") {
    return { ok: false, message: `${field} must be text.` };
  }

  const trimmed = value.trim();
  if (hasControlCharacter(trimmed)) {
    return { ok: false, message: `${field} contains characters that are not allowed.` };
  }

  return { ok: true, value: trimmed };
}

function tooLong(field: string, maxLength: number) {
  return { ok: false as const, message: `${field} must be ${maxLength} characters or fewer.` };
}

export function parseRequiredText(value: unknown, field: string, maxLength: number): SchemaResult<string> {
  const parsed = trimmedText(value, field);
  if (!parsed.ok) return parsed;
  if (!parsed.value) return { ok: false, message: `${field} is required.` };
  if (parsed.value.length > maxLength) return tooLong(field, maxLength);
  return parsed;
}

/** Absent, null, and whitespace-only all normalize to `null` — the column default. */
export function parseOptionalText(value: unknown, field: string, maxLength: number): SchemaResult<string | null> {
  if (value === undefined || value === null) return { ok: true, value: null };

  const parsed = trimmedText(value, field);
  if (!parsed.ok) return parsed;
  if (!parsed.value) return { ok: true, value: null };
  if (parsed.value.length > maxLength) return tooLong(field, maxLength);
  return { ok: true, value: parsed.value };
}

export function parseOptionalEmail(value: unknown): SchemaResult<string | null> {
  const parsed = parseOptionalText(value, "Email", MAX_EMAIL_LENGTH);
  if (!parsed.ok) return parsed;
  if (parsed.value === null) return parsed;
  if (!EMAIL_PATTERN.test(parsed.value)) {
    return { ok: false, message: "Enter a valid email address." };
  }
  return parsed;
}

export function parseUuid(value: unknown, field: string): SchemaResult<string> {
  const parsed = parseRequiredText(value, field, 36);
  if (!parsed.ok) return parsed;
  if (!UUID_PATTERN.test(parsed.value)) {
    return { ok: false, message: `${field} is not valid.` };
  }
  return parsed;
}

export function parseEmployeeInput(input: unknown): SchemaResult<EmployeeInput> {
  if (typeof input !== "object" || input === null) {
    return { ok: false, message: "Employee details are missing." };
  }

  const source = input as Record<string, unknown>;

  const fullName = parseRequiredText(source.fullName, "Employee name", MAX_EMPLOYEE_NAME_LENGTH);
  if (!fullName.ok) return fullName;

  const position = parseOptionalText(source.position, "Position", MAX_EMPLOYEE_TEXT_LENGTH);
  if (!position.ok) return position;

  const department = parseOptionalText(source.department, "Department", MAX_EMPLOYEE_TEXT_LENGTH);
  if (!department.ok) return department;

  const phoneExtension = parseOptionalText(source.phoneExtension, "Phone extension", MAX_PHONE_EXTENSION_LENGTH);
  if (!phoneExtension.ok) return phoneExtension;

  const value: EmployeeInput = {
    fullName: fullName.value,
    position: position.value,
    department: department.value,
    phoneExtension: phoneExtension.value
  };

  // An omitted `email` key means "leave the stored address alone", which is not
  // the same as an explicit null. updateEmployeeAction depends on that
  // distinction so callers predating the column cannot blank an address, so the
  // key is only added to the result when the caller actually sent it.
  if ("email" in source) {
    const email = parseOptionalEmail(source.email);
    if (!email.ok) return email;
    value.email = email.value;
  }

  return { ok: true, value };
}
