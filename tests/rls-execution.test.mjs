import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { createSeatPlannerDb } from "./helpers/pgHarness.mjs";

// Execution tests for Postgres Row Level Security itself. tests/rpc-execution.test.mjs
// calls the RPCs as the PGlite database owner, which is exempt from RLS by
// definition — those tests exercise each RPC's own `is_admin()` check, not the
// `to authenticated` policies on the underlying tables. This file switches the
// SQL session role to `authenticated` (via db.asRole) so those policies are
// actually evaluated, plus the seat-protection delete trigger (not RLS, but
// also invisible to the owner-run RPC tests because reset() uses truncate,
// which skips row triggers). If a migration ever drops or widens a policy, it
// should fail here even though the RPC-level tests stay green.

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

async function expectThrow(promise, { code, match } = {}) {
  try {
    await promise;
  } catch (err) {
    if (code) assert.equal(err.code, code, `expected SQLSTATE ${code}, got ${err.code} (${err.message})`);
    if (match) assert.match(err.message, match);
    return err;
  }
  assert.fail("expected the query to throw, but it resolved");
}

// ---------------------------------------------------------------------------
// seats_select_published_or_admin
// ---------------------------------------------------------------------------

test("RLS: viewer cannot read draft seats but can read published seats", async () => {
  await db.seedSeat({ label: "N01", key: "n01", status: "available", layer: "draft" });
  await db.seedSeat({ label: "N02", key: "n02", status: "available", layer: "published" });

  await db.actAsViewer();
  await db.asRole("authenticated", async () => {
    const draft = await db.query("select id from public.seats where layer = 'draft'");
    assert.equal(draft.rows.length, 0, "viewer must not see draft seats");

    const published = await db.query("select id from public.seats where layer = 'published'");
    assert.ok(published.rows.length >= 1, "viewer can see published seats");
  });
});

test("RLS: admin, as authenticated, CAN read draft seats (proves the role switch genuinely evaluates policies)", async () => {
  const seat = await db.seedSeat({ label: "N01", key: "n01", status: "available", layer: "draft" });

  // Stay admin (auth.uid() is still ADMIN_ID from reset()); only the SQL role
  // changes. If this failed the same way the viewer test passed, it would mean
  // asRole is globally denying reads rather than RLS genuinely evaluating
  // `is_admin()` inside the policy.
  await db.asRole("authenticated", async () => {
    const { rows } = await db.query("select id from public.seats where layer = 'draft'");
    assert.ok(
      rows.some(r => r.id === seat.id),
      "admin identity under the authenticated role still sees draft seats"
    );
  });
});

// ---------------------------------------------------------------------------
// seats_insert_admin_only
// ---------------------------------------------------------------------------

test("RLS: viewer cannot insert a seat", async () => {
  await db.actAsViewer();
  await db.asRole("authenticated", async () => {
    await expectThrow(
      db.query("insert into public.seats(seat_key, label, x, y) values ($1, $2, $3, $4)", [
        "viewer-insert-test",
        "Viewer Insert Test",
        0.5,
        0.5
      ]),
      { match: /row-level security|permission denied/i }
    );
  });
});

// ---------------------------------------------------------------------------
// published_employees: select-only for authenticated (no write policy)
// ---------------------------------------------------------------------------

test("RLS: viewer cannot write published_employees", async () => {
  await db.actAsViewer();
  await db.asRole("authenticated", async () => {
    await expectThrow(
      db.query("insert into public.published_employees(id, full_name) values (gen_random_uuid(), $1)", [
        "Viewer Ghost"
      ]),
      { match: /row-level security|permission denied/i }
    );
  });
});

test("RLS: even an admin, as authenticated, cannot insert/update/delete published_employees directly", async () => {
  // The snapshot's only writer is the SECURITY DEFINER publish RPC
  // (20260708230000 RLS + 20260805140000 grant narrowing). The admin identity
  // matters: seats policies DO admit admins, so passing here proves the
  // denial comes from this table's select-only posture, not from the role
  // switch failing generally.
  const alice = await db.seedEmployee({ fullName: "Alice" });
  await db.seedSeat({ label: "N01", status: "assigned", employeeId: alice });
  await db.query("select public.publish_seat_map()");

  await db.asRole("authenticated", async () => {
    await expectThrow(
      db.query("insert into public.published_employees(id, full_name) values (gen_random_uuid(), $1)", [
        "Backdoor Person"
      ]),
      { match: /row-level security|permission denied/i }
    );
    await expectThrow(
      db.query("update public.published_employees set full_name = 'Renamed' where id = $1", [alice]),
      { match: /row-level security|permission denied/i }
    );
    await expectThrow(
      db.query("delete from public.published_employees where id = $1", [alice]),
      { match: /row-level security|permission denied/i }
    );
  });

  // And the snapshot row is untouched.
  const snap = await db.query("select full_name from public.published_employees where id = $1", [alice]);
  assert.equal(snap.rows[0]?.full_name, "Alice");
});

// ---------------------------------------------------------------------------
// app_private.prevent_original_draft_seat_delete (trigger, not RLS)
// ---------------------------------------------------------------------------

test("RLS-adjacent: the seat-protection trigger refuses an original draft delete but allows a custom one", async () => {
  // Runs as the admin owner identity with no role switch: the protection
  // trigger fires `before delete` regardless of RLS/role, and reset()'s
  // truncate (used between tests) bypasses row triggers entirely, so this is
  // the only place in the suite that actually fires it.
  const original = await db.seedSeat({ label: "N01", key: "n01", status: "available", isCustom: false });
  await expectThrow(db.query("delete from public.seats where id = $1", [original.id]), {
    match: /Original seeded seats are protected/
  });

  const custom = await db.seedSeat({ label: "CX01", key: "cx01", status: "available", isCustom: true });
  await db.query("delete from public.seats where id = $1", [custom.id]);
  const remaining = await db.query("select id from public.seats where id = $1", [custom.id]);
  assert.equal(remaining.rows.length, 0, "custom seats can still be deleted");
});

// ---------------------------------------------------------------------------
// employees_select_authenticated
// ---------------------------------------------------------------------------

test("RLS: a viewer reads zero employees; an admin reads all", async () => {
  const alice = await db.seedEmployee({ fullName: "Alice", active: true });
  await db.seedEmployee({ fullName: "Zoe (inactive)", active: false });

  // Viewer: the live employees table is now fully hidden — people reach the
  // viewer only through published_employees (Plan 008). (Pre-008 this read the
  // active row.)
  await db.actAsViewer();
  await db.asRole("authenticated", async () => {
    const seen = await db.query("select id from public.employees");
    assert.equal(seen.rows.length, 0, "viewer cannot read the draft-side directory at all");
  });

  // Admin: still reads the full live directory (active and inactive).
  await db.actAs(db.adminId);
  await db.asRole("authenticated", async () => {
    const seen = await db.query("select id from public.employees order by full_name");
    assert.equal(seen.rows.length, 2, "admin reads every employee");
    assert.ok(seen.rows.some(r => r.id === alice), "including the active one");
  });
});
