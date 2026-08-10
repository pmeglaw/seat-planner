import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { createSeatPlannerDb } from "./helpers/pgHarness.mjs";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";

// Execution tier for the S-01 backstop: applies the REAL migrations to an
// in-process Postgres and checks that each bounded text column actually rejects
// an over-long value. lib/schemas.ts is the layer that produces a readable
// message for the admin who typed it; these constraints are the layer that
// holds when a write path forgets to call it — the same "never rely on one
// layer" rule the admin gate follows.
//
// Only LENGTH lives in SQL. The type check and the control-character rule stay
// in TypeScript: they need per-field nuance (seat notes may contain newlines,
// nothing else may) that is not worth expressing as a constraint, and no write
// path reaches these tables except through the app.

const {
  MAX_AVATAR_URL_LENGTH,
  MAX_EMAIL_LENGTH,
  MAX_EMPLOYEE_NAME_LENGTH,
  MAX_EMPLOYEE_TEXT_LENGTH,
  MAX_OPTION_NAME_LENGTH,
  MAX_PHONE_EXTENSION_LENGTH,
  MAX_SEAT_KEY_LENGTH,
  MAX_SEAT_LABEL_LENGTH,
  MAX_SEAT_NOTES_LENGTH
} = await importTsModule("lib/schemas.ts");

const CHECK_VIOLATION = "23514";

let db;
before(async () => {
  db = await createSeatPlannerDb();
});
beforeEach(async () => {
  await db.reset();
});
after(async () => {
  await db?.close();
});

// Each case knows how to insert one row with `column` set to `value`, so the
// same table can be probed at the limit and one character past it.
const CASES = [
  {
    table: "public.seats",
    column: "seat_key",
    maxLength: MAX_SEAT_KEY_LENGTH,
    insert: value => [
      "insert into public.seats (seat_key, label, x, y, layer, status) values ($1, 'W11', 0.5, 0.5, 'draft', 'available')",
      [value]
    ]
  },
  {
    table: "public.seats",
    column: "label",
    maxLength: MAX_SEAT_LABEL_LENGTH,
    insert: value => [
      "insert into public.seats (seat_key, label, x, y, layer, status) values ('w11', $1, 0.5, 0.5, 'draft', 'available')",
      [value]
    ]
  },
  {
    table: "public.seats",
    column: "zone",
    maxLength: MAX_OPTION_NAME_LENGTH,
    insert: value => [
      "insert into public.seats (seat_key, label, x, y, layer, status, zone) values ('w11', 'W11', 0.5, 0.5, 'draft', 'available', $1)",
      [value]
    ]
  },
  {
    table: "public.seats",
    column: "department",
    maxLength: MAX_OPTION_NAME_LENGTH,
    insert: value => [
      "insert into public.seats (seat_key, label, x, y, layer, status, department) values ('w11', 'W11', 0.5, 0.5, 'draft', 'available', $1)",
      [value]
    ]
  },
  {
    table: "public.seats",
    column: "notes",
    maxLength: MAX_SEAT_NOTES_LENGTH,
    insert: value => [
      "insert into public.seats (seat_key, label, x, y, layer, status, notes) values ('w11', 'W11', 0.5, 0.5, 'draft', 'available', $1)",
      [value]
    ]
  },
  {
    table: "public.employees",
    column: "full_name",
    maxLength: MAX_EMPLOYEE_NAME_LENGTH,
    insert: value => ["insert into public.employees (full_name) values ($1)", [value]]
  },
  {
    table: "public.employees",
    column: "position",
    maxLength: MAX_EMPLOYEE_TEXT_LENGTH,
    insert: value => ["insert into public.employees (full_name, position) values ('Ada Lovelace', $1)", [value]]
  },
  {
    table: "public.employees",
    column: "department",
    maxLength: MAX_EMPLOYEE_TEXT_LENGTH,
    insert: value => ["insert into public.employees (full_name, department) values ('Ada Lovelace', $1)", [value]]
  },
  {
    table: "public.employees",
    column: "phone_extension",
    maxLength: MAX_PHONE_EXTENSION_LENGTH,
    insert: value => ["insert into public.employees (full_name, phone_extension) values ('Ada Lovelace', $1)", [value]]
  },
  {
    table: "public.employees",
    column: "email",
    maxLength: MAX_EMAIL_LENGTH,
    insert: value => ["insert into public.employees (full_name, email) values ('Ada Lovelace', $1)", [value]]
  },
  {
    table: "public.employees",
    column: "avatar_url",
    maxLength: MAX_AVATAR_URL_LENGTH,
    insert: value => ["insert into public.employees (full_name, avatar_url) values ('Ada Lovelace', $1)", [value]]
  },
  {
    table: "public.department_options",
    column: "name",
    maxLength: MAX_OPTION_NAME_LENGTH,
    insert: value => ["insert into public.department_options (name) values ($1)", [value]]
  },
  {
    table: "public.zone_options",
    column: "name",
    maxLength: MAX_OPTION_NAME_LENGTH,
    insert: value => ["insert into public.zone_options (name) values ($1)", [value]]
  }
];

for (const testCase of CASES) {
  const label = `${testCase.table}.${testCase.column}`;

  test(`${label} accepts a value at its bound and rejects one past it`, async () => {
    const [sql, params] = testCase.insert("a".repeat(testCase.maxLength));
    await db.query(sql, params);

    await db.reset();

    const [overSql, overParams] = testCase.insert("a".repeat(testCase.maxLength + 1));
    try {
      await db.query(overSql, overParams);
      assert.fail(`${label} accepted ${testCase.maxLength + 1} characters`);
    } catch (error) {
      assert.equal(
        error.code,
        CHECK_VIOLATION,
        `${label} should fail with a check violation, got ${error.code}: ${error.message}`
      );
    }
  });
}

// The bound is on trimmed length, matching lib/schemas.ts, which trims before it
// measures. Without that agreement a value the parser accepts (padding trimmed
// away) could still be rejected by Postgres.
test("the length bound measures the trimmed value, as the parser does", async () => {
  const padded = `  ${"a".repeat(MAX_EMPLOYEE_NAME_LENGTH)}  `;
  await db.query("insert into public.employees (full_name) values ($1)", [padded]);
  const { rows } = await db.query("select char_length(full_name) as length from public.employees");
  assert.equal(rows[0].length, MAX_EMPLOYEE_NAME_LENGTH + 4, "the row stores what it was given");
});

// published_employees is a snapshot of employees written only by the publish
// RPC. Bounding one and not the other would let a value that cannot exist in
// the directory exist in what viewers read.
test("published_employees carries the same bounds as employees", async () => {
  const { rows } = await db.query(`
    select conname
    from pg_constraint
    where conrelid = 'public.published_employees'::regclass
      and contype = 'c'
      and conname like '%length%'
  `);
  const names = rows.map(row => row.conname).sort();
  assert.deepEqual(names, [
    "published_employees_avatar_url_length",
    "published_employees_department_length",
    "published_employees_email_length",
    "published_employees_full_name_length",
    "published_employees_phone_extension_length",
    "published_employees_position_length"
  ]);
});

// A publish must still succeed for values the parser accepts — the backstop
// exists to catch a missing parse, not to break the normal path.
test("publish still copies rows that sit exactly at the bound", async () => {
  await db.query(
    "insert into public.employees (id, full_name, position) values ('33333333-3333-3333-3333-333333333333', $1, $2)",
    ["a".repeat(MAX_EMPLOYEE_NAME_LENGTH), "b".repeat(MAX_EMPLOYEE_TEXT_LENGTH)]
  );
  await db.query(
    `insert into public.seats (seat_key, label, x, y, layer, status, employee_id, notes)
     values ('w11', $1, 0.5, 0.5, 'draft', 'assigned', '33333333-3333-3333-3333-333333333333', $2)`,
    ["a".repeat(MAX_SEAT_LABEL_LENGTH), "c".repeat(MAX_SEAT_NOTES_LENGTH)]
  );

  await db.query("select public.publish_seat_map()");

  const { rows } = await db.query(
    "select count(*)::int as count from public.published_employees where char_length(full_name) = $1",
    [MAX_EMPLOYEE_NAME_LENGTH]
  );
  assert.equal(rows[0].count, 1, "the at-bound employee reached the published snapshot");
});
