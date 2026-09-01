// SQL-RPC execution harness. Boots an in-process Postgres (PGlite / WASM),
// applies the REAL supabase/migrations against it, and exposes seed + reset
// helpers so tests can call the SECURITY-sensitive RPCs (swap, publish, CSV
// import, restore, management actions) and assert on the resulting rows. This
// is the deepest layer — the atomic Postgres functions where the transaction
// guarantees actually live — which source-text tests can only approximate.
//
// The migrations target Supabase (auth schema, auth.uid(), the anon/authenticated
// roles). PGlite has none of that, so PRELUDE stands up a minimal compatible
// surface: an auth schema, a settable auth.uid(), and the referenced roles. The
// RPCs gate on app_private.is_admin(), which reads the auth.uid() profile's role
// — so setting app.current_user_id to an admin vs. a viewer exercises the real
// admin gate, which is the security-relevant behavior at this layer.

import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const ROOT = new URL("../../", import.meta.url);
const MIGRATIONS_DIR = new URL("supabase/migrations/", ROOT);

export const ADMIN_ID = "11111111-1111-1111-1111-111111111111";
export const VIEWER_ID = "22222222-2222-2222-2222-222222222222";

// Data tables cleared between tests. auth.users is included so the handle_new_user
// trigger re-creates profiles from scratch on each reset.
const DATA_TABLES = [
  "public.seats",
  "public.employees",
  "public.department_options",
  "public.zone_options",
  "public.published_employees",
  "public.publish_events",
  "public.profiles",
  "auth.users"
].join(", ");

const PRELUDE = `
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('app.current_user_id', true), '')::uuid
$$;
create or replace function auth.role() returns text language sql stable as $$
  select 'authenticated'::text
$$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select '{}'::jsonb
$$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
do $$ begin create role supabase_admin; exception when duplicate_object then null; end $$;
do $$ begin create role postgres superuser; exception when duplicate_object then null; end $$;
`;

// gen_random_uuid() is core in the Postgres PGlite ships, so the pgcrypto
// extension the first migration creates is unnecessary and may not be bundled.
function sanitize(sql) {
  return sql.replace(/create extension[^;]*;/gi, "-- [stripped extension for pglite]");
}

class SeatPlannerDb {
  constructor(db) {
    this.db = db;
    this.adminId = ADMIN_ID;
    this.viewerId = VIEWER_ID;
  }

  query(sql, params) {
    return this.db.query(sql, params);
  }

  exec(sql) {
    return this.db.exec(sql);
  }

  // Clear all data, recreate the admin (auth user + promoted profile), and act
  // as that admin. Call from beforeEach so every test starts from a clean map.
  async reset() {
    await this.db.exec(`truncate table ${DATA_TABLES} restart identity cascade;`);
    await this.db.query("insert into auth.users(id, email) values ($1, $2)", [ADMIN_ID, "admin@example.com"]);
    // handle_new_user created the profile as a viewer; promote it.
    await this.db.query("update public.profiles set role = 'admin' where id = $1", [ADMIN_ID]);
    await this.actAs(ADMIN_ID);
  }

  // Set auth.uid() to the given user id (or nobody when null).
  async actAs(userId) {
    await this.db.query("select set_config('app.current_user_id', $1, false)", [userId ?? ""]);
  }

  // Switch to a non-admin (viewer) identity, creating it on first use.
  async actAsViewer() {
    await this.db.query("insert into auth.users(id, email) values ($1, $2) on conflict (id) do nothing", [
      VIEWER_ID,
      "viewer@example.com"
    ]);
    await this.actAs(VIEWER_ID);
  }

  // Run `fn` with the SQL session role switched (so `to authenticated` RLS
  // policies actually apply — the owner is otherwise RLS-exempt). Always resets
  // the role, even on failure. `auth.uid()` is unaffected, so set the identity
  // with actAs()/actAsViewer() first, then wrap the RLS-guarded queries here.
  async asRole(role, fn) {
    await this.db.exec(`set role ${role}`);
    try {
      return await fn();
    } finally {
      await this.db.exec("reset role");
    }
  }

  async isAdmin() {
    const { rows } = await this.db.query("select app_private.is_admin() as ok");
    return rows[0].ok;
  }

  async seedEmployee({ fullName = "Person", department = null, position = null, active = true } = {}) {
    const { rows } = await this.db.query(
      "insert into public.employees(full_name, department, position, active) values ($1, $2, $3, $4) returning id",
      [fullName, department, position, active]
    );
    return rows[0].id;
  }

  // Returns the inserted row ({ id, updated_at, ... }) so tests can use updated_at
  // for concurrency-fence assertions.
  // `floor` defaults to "3" like the column itself (20260901120000), so every
  // pre-multi-floor test keeps seeding Floor 3 rows unchanged.
  async seedSeat({ label, key, x = 0.5, y = 0.5, status = "available", layer = "draft", employeeId = null, zone = null, isCustom = false, floor = "3" } = {}) {
    const { rows } = await this.db.query(
      `insert into public.seats(seat_key, label, x, y, status, layer, employee_id, zone, is_custom, floor)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       returning *`,
      [key ?? label.toLowerCase(), label, x, y, status, layer, employeeId, zone, isCustom, floor]
    );
    return rows[0];
  }

  // Convenience: read draft seats (id, label, status, employee_id, zone, floor) ordered by label.
  async draftSeats() {
    const { rows } = await this.db.query(
      "select id, label, status, employee_id, zone, floor from public.seats where layer = 'draft' order by label"
    );
    return rows;
  }

  // Published twin of draftSeats(), for the publish/reset floor cases.
  async publishedSeats() {
    const { rows } = await this.db.query(
      "select id, label, status, employee_id, zone, floor from public.seats where layer = 'published' order by label"
    );
    return rows;
  }

  async close() {
    await this.db.close();
  }
}

// Boot a fresh database with the full migration history applied. Call once per
// test file (module-level) — booting + migrating is the expensive part, so
// reuse the instance and call reset() between tests.
export async function createSeatPlannerDb() {
  const db = await PGlite.create();
  await db.exec(PRELUDE);

  const files = (await readdir(fileURLToPath(MIGRATIONS_DIR))).filter(f => f.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = sanitize(await readFile(new URL(file, MIGRATIONS_DIR), "utf8"));
    await db.exec(sql);
  }

  // Supabase grants the `authenticated` role broad table DML by default and
  // relies on RLS as the actual gate. PGlite has no such bootstrap, so mirror
  // it here: without these grants, `set role authenticated` fails with a
  // grant-level "permission denied" before any policy is even evaluated.
  await db.exec(`
    grant usage on schema public to authenticated, anon;
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant usage, select on all sequences in schema public to authenticated;
    -- published_employees is select-only for authenticated in prod at both
    -- layers: no RLS write policy (20260708230000) and no table-level write
    -- grant (20260805140000). The broad grant above would mask the latter, so
    -- re-apply the revoke to keep the harness faithful — a client write is
    -- denied by the missing grant AND the missing policy, as in prod.
    revoke insert, update, delete on public.published_employees from authenticated;
  `);

  return new SeatPlannerDb(db);
}
