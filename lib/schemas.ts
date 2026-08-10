/**
 * Schema layer for the server-action trust boundary (CODE-01).
 *
 * A server action's parameter type is erased at build time, so an action
 * invoked over the wire receives whatever the caller sends — not what the type
 * claims. These parsers re-establish the shape at runtime and hand back a
 * field-level message, instead of letting a malformed value reach Postgres and
 * return as a raw constraint error.
 *
 * Since 20260810120000 every user-writable text column also carries a
 * `char_length(trim(...)) <= N` CHECK matching the MAX_* values below, so this
 * module is no longer the only bound — but it is the only one that produces a
 * message naming the field, and the only one that checks types and control
 * characters at all. Treat the constraint as the backstop for a write path that
 * forgot to parse (S-01), not as a reason to skip parsing.
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
// Nothing writes an avatar today (the column is empty in production), but the
// snapshot normalizers carry the value through, so it needs a bound like every
// other text column. 2048 is the practical URL ceiling browsers agree on.
export const MAX_AVATAR_URL_LENGTH = 2048;
// department_options.name and zone_options.name are `text not null unique check
// (char_length(trim(name)) > 0)`; 20260810120000 adds the matching upper bound.
// The type and control-character checks still only exist here.
export const MAX_OPTION_NAME_LENGTH = 120;
// seats.label is `text not null check (char_length(trim(label)) > 0)` and is
// generated as "W11"-style text; 60 is far above anything the generator or an
// admin produces while still being a bound. seat_key derives from the label
// plus a base-36 timestamp suffix, hence the extra room.
export const MAX_SEAT_LABEL_LENGTH = 60;
export const MAX_SEAT_KEY_LENGTH = 80;
// Notes is the one genuinely free-text field (a textarea in SeatInspector), so
// it gets a paragraph rather than a name-sized bound. Owner ruling 2026-08-10.
export const MAX_SEAT_NOTES_LENGTH = 1000;

// Deliberately permissive: one `@`, no whitespace, and a dotted domain. This is
// a typo guard for a directory field, not an RFC 5322 parser — Supabase Auth
// owns real deliverability, and an over-strict pattern rejects addresses that
// work. 254 is the SMTP path limit.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Scanned by char code rather than a regex so ESLint's no-control-regex rule
// stays satisfied without a disable comment. `allowLineBreaks` exempts newline,
// carriage return and tab — see parseOptionalMultilineText for who needs that
// and why nothing else does.
function hasControlCharacter(value: string, allowLineBreaks = false) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (allowLineBreaks && (code === 9 || code === 10 || code === 13)) continue;
    if (code < 32 || code === 127) return true;
  }
  return false;
}

function trimmedText(value: unknown, field: string, allowLineBreaks = false): SchemaResult<string> {
  if (typeof value !== "string") {
    return { ok: false, message: `${field} must be text.` };
  }

  const trimmed = value.trim();
  if (hasControlCharacter(trimmed, allowLineBreaks)) {
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
  return optionalText(value, field, maxLength, false);
}

/**
 * parseOptionalText for the ONE field where a line break is real input rather
 * than junk: seat notes, typed into a textarea and quoted by the CSV export, so
 * rejecting newlines would break both the inspector and the export→import
 * round-trip. Everything else stays out — a tab or newline in a name, zone or
 * department can only come from a paste accident or a wire-level caller.
 */
export function parseOptionalMultilineText(value: unknown, field: string, maxLength: number): SchemaResult<string | null> {
  return optionalText(value, field, maxLength, true);
}

function optionalText(
  value: unknown,
  field: string,
  maxLength: number,
  allowLineBreaks: boolean
): SchemaResult<string | null> {
  if (value === undefined || value === null) return { ok: true, value: null };

  const parsed = trimmedText(value, field, allowLineBreaks);
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

export type SeatTextInput = {
  label: string;
  employeeName: string | null;
  department: string | null;
  zone: string | null;
  notes: string | null;
  /** Absent when the caller omitted the key — see `parseSeatTextInput`. */
  employeePosition?: string | null;
  /** Absent when the caller omitted the key — see `parseSeatTextInput`. */
  phoneExtension?: string | null;
};

/**
 * The seat-edit counterpart to `parseEmployeeInput`, and the reason it exists:
 * `updateSeatAction` writes `employees.full_name`, `.position`,
 * `.phone_extension` and `.department` through the `update_draft_seat` RPC —
 * the same columns the employee actions bound — but reached them with a
 * trim-only helper, so the same column had two different bounds depending on
 * which action the caller invoked (S-01).
 *
 * `department` and `zone` share MAX_OPTION_NAME_LENGTH because both are upserted
 * into `department_options` / `zone_options`, whose names the option actions
 * already bound to that.
 */
export function parseSeatTextInput(input: unknown): SchemaResult<SeatTextInput> {
  if (typeof input !== "object" || input === null) {
    return { ok: false, message: "Seat details are missing." };
  }

  const source = input as Record<string, unknown>;

  const label = parseRequiredText(source.label, "Seat label", MAX_SEAT_LABEL_LENGTH);
  if (!label.ok) return label;

  const employeeName = parseOptionalText(source.employeeName, "Employee name", MAX_EMPLOYEE_NAME_LENGTH);
  if (!employeeName.ok) return employeeName;

  const department = parseOptionalText(source.department, "Department", MAX_OPTION_NAME_LENGTH);
  if (!department.ok) return department;

  const zone = parseOptionalText(source.zone, "Zone", MAX_OPTION_NAME_LENGTH);
  if (!zone.ok) return zone;

  const notes = parseOptionalMultilineText(source.notes, "Notes", MAX_SEAT_NOTES_LENGTH);
  if (!notes.ok) return notes;

  const value: SeatTextInput = {
    label: label.value,
    employeeName: employeeName.value,
    department: department.value,
    zone: zone.value,
    notes: notes.value
  };

  // Same absent-vs-null rule as parseEmployeeInput's email, and load-bearing for
  // the same reason: updateSeatAction turns "key present" into the RPC's
  // employee_position_provided / employee_phone_extension_provided flags. Adding
  // the key unconditionally would make every seat edit blank the person's
  // position and extension.
  if ("employeePosition" in source) {
    const employeePosition = parseOptionalText(source.employeePosition, "Position", MAX_EMPLOYEE_TEXT_LENGTH);
    if (!employeePosition.ok) return employeePosition;
    value.employeePosition = employeePosition.value;
  }

  if ("phoneExtension" in source) {
    const phoneExtension = parseOptionalText(source.phoneExtension, "Phone extension", MAX_PHONE_EXTENSION_LENGTH);
    if (!phoneExtension.ok) return phoneExtension;
    value.phoneExtension = phoneExtension.value;
  }

  return { ok: true, value };
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
