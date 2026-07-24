import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { createSeatPlannerDb } from "./helpers/pgHarness.mjs";

// Execution tests for the atomic SECURITY-sensitive RPCs. Unlike the
// *-transaction-safety source tests (which grep the SQL), these apply the real
// migrations to an in-process Postgres, call the RPCs, and assert on the rows
// that result — so a regression in the actual transaction logic fails here.

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
  assert.fail("expected the RPC to throw, but it resolved");
}

function callUpdateDraftSeat(handle, opts) {
  const {
    seatId,
    label,
    status = "available",
    employeeId = null,
    employeeName = null,
    position = null,
    positionProvided = false,
    phone = null,
    phoneProvided = false,
    department = null,
    zone = null,
    notes = null,
    forceMove = false,
    expectedUpdatedAt = null
  } = opts;
  return handle.query(
    `select public.update_draft_seat($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) as id`,
    [seatId, label, status, employeeId, employeeName, position, positionProvided, phone, phoneProvided, department, zone, notes, forceMove, expectedUpdatedAt]
  );
}

const STALE_TS = "2000-01-01T00:00:00.000Z";

// ---------------------------------------------------------------------------
// swap_draft_seat_assignments
// ---------------------------------------------------------------------------

test("swap: exchanges employee assignments between two draft seats", async () => {
  const alice = await db.seedEmployee({ fullName: "Alice" });
  const n01 = await db.seedSeat({ label: "N01", status: "assigned", employeeId: alice });
  const n02 = await db.seedSeat({ label: "N02", status: "available" });

  const { rows } = await db.query("select * from public.swap_draft_seat_assignments($1, $2)", [n01.id, n02.id]);
  assert.equal(rows.length, 2);

  const seats = await db.draftSeats();
  const byLabel = Object.fromEntries(seats.map(s => [s.label, s]));
  assert.equal(byLabel.N01.status, "available");
  assert.equal(byLabel.N01.employee_id, null);
  assert.equal(byLabel.N02.status, "assigned");
  assert.equal(byLabel.N02.employee_id, alice);
});

test("swap: requires admin", async () => {
  const alice = await db.seedEmployee({ fullName: "Alice" });
  const n01 = await db.seedSeat({ label: "N01", status: "assigned", employeeId: alice });
  const n02 = await db.seedSeat({ label: "N02", status: "available" });
  await db.actAsViewer();
  await expectThrow(db.query("select public.swap_draft_seat_assignments($1, $2)", [n01.id, n02.id]), {
    code: "42501",
    match: /Admin permission required/
  });
});

test("swap: rejects swapping a seat with itself", async () => {
  const alice = await db.seedEmployee({ fullName: "Alice" });
  const n01 = await db.seedSeat({ label: "N01", status: "assigned", employeeId: alice });
  await expectThrow(db.query("select public.swap_draft_seat_assignments($1, $2)", [n01.id, n01.id]), {
    match: /different target seat/
  });
});

test("swap: rejects when neither seat is assigned", async () => {
  const n01 = await db.seedSeat({ label: "N01", status: "available" });
  const n02 = await db.seedSeat({ label: "N02", status: "available" });
  await expectThrow(db.query("select public.swap_draft_seat_assignments($1, $2)", [n01.id, n02.id]), {
    match: /at least one assigned seat/
  });
});

test("swap: enforces the concurrency fence on a stale updated_at (MLS02)", async () => {
  const alice = await db.seedEmployee({ fullName: "Alice" });
  const n01 = await db.seedSeat({ label: "N01", status: "assigned", employeeId: alice });
  const n02 = await db.seedSeat({ label: "N02", status: "available" });
  await expectThrow(
    db.query("select public.swap_draft_seat_assignments($1, $2, $3, $4)", [n01.id, n02.id, STALE_TS, null]),
    { code: "MLS02", match: /changed in another session/ }
  );
});

// ---------------------------------------------------------------------------
// update_draft_seat
// ---------------------------------------------------------------------------

test("update_draft_seat: assigns an existing employee and flips status to assigned", async () => {
  const alice = await db.seedEmployee({ fullName: "Alice" });
  const n01 = await db.seedSeat({ label: "N01", status: "available" });

  await callUpdateDraftSeat(db, { seatId: n01.id, label: "N01", status: "assigned", employeeId: alice });

  const [seat] = await db.draftSeats();
  assert.equal(seat.status, "assigned");
  assert.equal(seat.employee_id, alice);
});

test("update_draft_seat: creates a new employee (and department option) from a name", async () => {
  const n01 = await db.seedSeat({ label: "N01", status: "available" });

  await callUpdateDraftSeat(db, {
    seatId: n01.id,
    label: "N01",
    status: "assigned",
    employeeName: "New Hire",
    department: "Operations"
  });

  const emp = await db.query("select id, department from public.employees where full_name = 'New Hire'");
  assert.equal(emp.rows.length, 1);
  assert.equal(emp.rows[0].department, "Operations");
  const [seat] = await db.draftSeats();
  assert.equal(seat.employee_id, emp.rows[0].id);
  const opt = await db.query("select active from public.department_options where name = 'Operations'");
  assert.equal(opt.rows[0]?.active, true);
});

test("update_draft_seat: rejects double-booking an already-seated employee (MLS01)", async () => {
  const alice = await db.seedEmployee({ fullName: "Alice" });
  await db.seedSeat({ label: "N01", status: "assigned", employeeId: alice });
  const n02 = await db.seedSeat({ label: "N02", status: "available" });

  await expectThrow(
    callUpdateDraftSeat(db, { seatId: n02.id, label: "N02", status: "assigned", employeeId: alice }),
    { code: "MLS01", match: /already assigned to N01/ }
  );
});

test("update_draft_seat: force_move frees the employee's previous seat atomically", async () => {
  const alice = await db.seedEmployee({ fullName: "Alice" });
  await db.seedSeat({ label: "N01", status: "assigned", employeeId: alice });
  const n02 = await db.seedSeat({ label: "N02", status: "available" });

  await callUpdateDraftSeat(db, { seatId: n02.id, label: "N02", status: "assigned", employeeId: alice, forceMove: true });

  const seats = await db.draftSeats();
  const byLabel = Object.fromEntries(seats.map(s => [s.label, s]));
  assert.equal(byLabel.N01.status, "available");
  assert.equal(byLabel.N01.employee_id, null);
  assert.equal(byLabel.N02.status, "assigned");
  assert.equal(byLabel.N02.employee_id, alice);
});

test("update_draft_seat: enforces the concurrency fence (MLS02)", async () => {
  const n01 = await db.seedSeat({ label: "N01", status: "available" });
  await expectThrow(
    callUpdateDraftSeat(db, { seatId: n01.id, label: "N01", status: "available", expectedUpdatedAt: STALE_TS }),
    { code: "MLS02", match: /changed in another session/ }
  );
});

test("update_draft_seat: rejects a duplicate seat label", async () => {
  await db.seedSeat({ label: "N01", status: "available" });
  const n02 = await db.seedSeat({ label: "N02", status: "available" });
  await expectThrow(callUpdateDraftSeat(db, { seatId: n02.id, label: "N01" }), { match: /already exists/ });
});

test("update_draft_seat: requires admin", async () => {
  const n01 = await db.seedSeat({ label: "N01", status: "available" });
  await db.actAsViewer();
  await expectThrow(callUpdateDraftSeat(db, { seatId: n01.id, label: "N01" }), {
    code: "42501",
    match: /Admin permission required/
  });
});

// ---------------------------------------------------------------------------
// publish_seat_map
// ---------------------------------------------------------------------------

test("publish: copies the draft map onto the published layer", async () => {
  const alice = await db.seedEmployee({ fullName: "Alice" });
  await db.seedSeat({ label: "N01", status: "assigned", employeeId: alice });
  await db.seedSeat({ label: "N02", status: "available" });

  await db.query("select public.publish_seat_map()");

  const published = await db.query("select label, status, employee_id from public.seats where layer = 'published' order by label");
  assert.deepEqual(published.rows.map(r => r.label), ["N01", "N02"]);
  assert.equal(published.rows[0].status, "assigned");
  assert.equal(published.rows[0].employee_id, alice);
});

test("publish: snapshots the active employee directory into published_employees", async () => {
  const alice = await db.seedEmployee({ fullName: "Alice" });
  await db.seedEmployee({ fullName: "Ghost", active: false });
  await db.seedSeat({ label: "N01", status: "assigned", employeeId: alice });

  await db.query("select public.publish_seat_map()");

  const snap = await db.query("select full_name from public.published_employees order by full_name");
  const names = snap.rows.map(r => r.full_name);
  assert.ok(names.includes("Alice"), "active employee should be snapshotted");
  assert.ok(!names.includes("Ghost"), "inactive employee should not be snapshotted");
});

test("publish: records an audit row attributed to the publishing admin", async () => {
  await db.seedSeat({ label: "N01", status: "available" });
  await db.query("select public.publish_seat_map()");

  const events = await db.query("select published_by, seat_count from public.publish_events");
  assert.equal(events.rows.length, 1);
  assert.equal(events.rows[0].published_by, db.adminId);
});

test("publish: requires admin", async () => {
  await db.seedSeat({ label: "N01", status: "available" });
  await db.actAsViewer();
  await expectThrow(db.query("select public.publish_seat_map()"), { match: /Admin permission required/ });
});

// ---------------------------------------------------------------------------
// import_assignments_csv
// ---------------------------------------------------------------------------

test("import: assigns a seat by label and returns the imported row count", async () => {
  await db.seedSeat({ label: "N01", status: "available" });
  const rows = [
    {
      seat_label: "N01",
      employee_name: "Imported Person",
      employee_email: "",
      position: "Analyst",
      department: "Finance",
      zone: "North",
      status: "assigned",
      notes: "",
      row_number: 2
    }
  ];

  const res = await db.query("select public.import_assignments_csv($1::jsonb) as count", [JSON.stringify(rows)]);
  assert.ok(res.rows[0].count >= 1);

  const seat = await db.query(
    `select e.full_name from public.seats s join public.employees e on e.id = s.employee_id
     where s.layer = 'draft' and s.label = 'N01'`
  );
  assert.equal(seat.rows[0]?.full_name, "Imported Person");
});

test("import: requires admin", async () => {
  await db.seedSeat({ label: "N01", status: "available" });
  await db.actAsViewer();
  const rows = [{ seat_label: "N01", employee_name: "X", status: "assigned", row_number: 2 }];
  await expectThrow(db.query("select public.import_assignments_csv($1::jsonb)", [JSON.stringify(rows)]), {
    match: /Admin permission required/
  });
});

// ---------------------------------------------------------------------------
// deactivate_employee
// ---------------------------------------------------------------------------

test("deactivate_employee: unassigns from draft and marks the employee inactive", async () => {
  const alice = await db.seedEmployee({ fullName: "Alice" });
  await db.seedSeat({ label: "N01", status: "assigned", employeeId: alice });

  await db.query("select public.deactivate_employee($1)", [alice]);

  const [seat] = await db.draftSeats();
  assert.equal(seat.status, "available");
  assert.equal(seat.employee_id, null);
  const emp = await db.query("select active from public.employees where id = $1", [alice]);
  assert.equal(emp.rows[0].active, false);
});

test("deactivate_employee: blocks an employee still on the published map", async () => {
  const alice = await db.seedEmployee({ fullName: "Alice" });
  await db.seedSeat({ label: "N01", status: "assigned", employeeId: alice, layer: "published" });

  await expectThrow(db.query("select public.deactivate_employee($1)", [alice]), { match: /published map/ });
});

// ---------------------------------------------------------------------------
// rename_department
// ---------------------------------------------------------------------------

test("rename_department: rewrites employees and toggles the option rows", async () => {
  await db.query("insert into public.department_options(name, active) values ('Old', true)");
  const alice = await db.seedEmployee({ fullName: "Alice", department: "Old" });

  await db.query("select public.rename_department($1, $2)", ["Old", "New"]);

  const emp = await db.query("select department from public.employees where id = $1", [alice]);
  assert.equal(emp.rows[0].department, "New");
  const options = await db.query("select name, active from public.department_options order by name");
  const byName = Object.fromEntries(options.rows.map(o => [o.name, o.active]));
  assert.equal(byName.New, true);
  assert.equal(byName.Old, false);
});

// ---------------------------------------------------------------------------
// reset_draft_seats_to_published
// ---------------------------------------------------------------------------

test("reset: converges the draft back to the published map, preserving draft ids", async () => {
  const alice = await db.seedEmployee({ fullName: "Alice" });
  const n01 = await db.seedSeat({ label: "N01", status: "assigned", employeeId: alice });
  // N02 is a published CUSTOM seat: originals can never be deleted from the
  // draft (protection trigger), so the "restore a missing seat" leg must use
  // a custom seat that was published and then deleted.
  const n02 = await db.seedSeat({ label: "N02", status: "available", isCustom: true });
  await db.query("select public.publish_seat_map()");

  // Diverge the draft in all three ways: mutate, delete, add.
  await db.query("update public.seats set status = 'available', employee_id = null, x = 0.9 where id = $1", [n01.id]);
  await db.query("delete from public.seats where id = $1", [n02.id]);
  await db.seedSeat({ label: "CX01", key: "cx01", status: "available", isCustom: true });

  const { rows } = await db.query("select public.reset_draft_seats_to_published() as changed");
  assert.ok(Number(rows[0].changed) >= 3, "reports the touched row count");

  const seats = await db.draftSeats();
  const byLabel = Object.fromEntries(seats.map(s => [s.label, s]));
  assert.deepEqual(Object.keys(byLabel).sort(), ["N01", "N02"], "custom addition erased, deleted seat restored");
  assert.equal(byLabel.N01.status, "assigned");
  assert.equal(byLabel.N01.employee_id, alice);
  assert.equal(byLabel.N01.id, n01.id, "surviving draft rows keep their ids");

  const coords = await db.query("select x from public.seats where id = $1", [n01.id]);
  assert.equal(Number(coords.rows[0].x), 0.5, "moved seat returns to the published position");
});

test("reset: leaves the employee directory untouched", async () => {
  const alice = await db.seedEmployee({ fullName: "Alice" });
  await db.seedSeat({ label: "N01", status: "assigned", employeeId: alice });
  await db.query("select public.publish_seat_map()");
  const bob = await db.seedEmployee({ fullName: "Bob (added after publish)" });

  await db.query("select public.reset_draft_seats_to_published()");

  const employees = await db.query("select id from public.employees order by full_name");
  assert.deepEqual(employees.rows.map(r => r.id).sort(), [alice, bob].sort(), "reset never adds or removes people");
});

test("reset: requires admin", async () => {
  await db.seedSeat({ label: "N01", status: "available" });
  await db.query("select public.publish_seat_map()");
  await db.actAsViewer();
  await expectThrow(db.query("select public.reset_draft_seats_to_published()"), {
    code: "42501",
    match: /Admin permission required/
  });
});

test("reset: refuses when no published map exists", async () => {
  await db.seedSeat({ label: "N01", status: "available" });
  await expectThrow(db.query("select public.reset_draft_seats_to_published()"), {
    match: /No published map exists/
  });
});

test("reset: enforces the concurrency fence on stale expectations (MLS02)", async () => {
  const n01 = await db.seedSeat({ label: "N01", status: "available" });
  await db.query("select public.publish_seat_map()");
  const staleExpectations = JSON.stringify([{ id: n01.id, updated_at: STALE_TS }]);
  await expectThrow(
    db.query("select public.reset_draft_seats_to_published($1::jsonb)", [staleExpectations]),
    { code: "MLS02", match: /changed in another session/ }
  );
});

// Permuted-draft cases: before the staged-writes migration, the RPC's single
// bulk UPDATE rewrote employee_id/label per row and collided with itself
// mid-statement on the non-deferrable one_draft_seat_per_employee /
// seats_unique_label_per_layer indexes whenever the draft permuted an
// assignment or label relative to published. These reproduce that class.

test("reset: survives a permuted assignment swap between two draft seats", async () => {
  const alice = await db.seedEmployee({ fullName: "Alice" });
  const bob = await db.seedEmployee({ fullName: "Bob" });
  const n01 = await db.seedSeat({ label: "N01", status: "assigned", employeeId: alice });
  const n02 = await db.seedSeat({ label: "N02", status: "assigned", employeeId: bob });
  await db.query("select public.publish_seat_map()");

  // Permute the draft assignments, staged through null the way the UI would.
  await db.query(
    "update public.seats set employee_id = null, status = 'available' where layer = 'draft' and label in ('N01', 'N02')"
  );
  await db.query(
    "update public.seats set employee_id = $1, status = 'assigned' where layer = 'draft' and label = 'N01'",
    [bob]
  );
  await db.query(
    "update public.seats set employee_id = $1, status = 'assigned' where layer = 'draft' and label = 'N02'",
    [alice]
  );

  await db.query("select public.reset_draft_seats_to_published()");

  const seats = await db.draftSeats();
  const byLabel = Object.fromEntries(seats.map(s => [s.label, s]));
  assert.equal(byLabel.N01.employee_id, alice, "N01 restored to its published occupant");
  assert.equal(byLabel.N01.status, "assigned");
  assert.equal(byLabel.N02.employee_id, bob, "N02 restored to its published occupant");
  assert.equal(byLabel.N02.status, "assigned");
  assert.equal(byLabel.N01.id, n01.id, "surviving draft row keeps its id");
  assert.equal(byLabel.N02.id, n02.id, "surviving draft row keeps its id");
});

test("reset: survives moving one person from seat A to seat B in the draft", async () => {
  const alice = await db.seedEmployee({ fullName: "Alice" });
  const n01 = await db.seedSeat({ label: "N01", status: "assigned", employeeId: alice });
  const n02 = await db.seedSeat({ label: "N02", status: "available" });
  await db.query("select public.publish_seat_map()");

  // Move Alice from N01 to N02 in the draft, staged through null.
  await db.query(
    "update public.seats set employee_id = null, status = 'available' where layer = 'draft' and label = 'N01'"
  );
  await db.query(
    "update public.seats set employee_id = $1, status = 'assigned' where layer = 'draft' and label = 'N02'",
    [alice]
  );

  await db.query("select public.reset_draft_seats_to_published()");

  const seats = await db.draftSeats();
  const byLabel = Object.fromEntries(seats.map(s => [s.label, s]));
  assert.equal(byLabel.N01.employee_id, alice, "Alice restored to her published seat");
  assert.equal(byLabel.N01.status, "assigned");
  assert.equal(byLabel.N01.id, n01.id, "surviving draft row keeps its id");
  assert.equal(byLabel.N02.employee_id, null, "N02 returns to available");
  assert.equal(byLabel.N02.status, "available");
  assert.equal(byLabel.N02.id, n02.id, "surviving draft row keeps its id");
});

test("reset: survives a label permutation between two draft seats with stable seat_key", async () => {
  const n01 = await db.seedSeat({ label: "N01", key: "k-n01", status: "available" });
  const n02 = await db.seedSeat({ label: "N02", key: "k-n02", status: "available" });
  await db.query("select public.publish_seat_map()");

  // Swap the two draft labels one seat at a time via a collision-free temp
  // value, the way sequential single-seat edits would leave the draft.
  await db.query("update public.seats set label = '~tmp~' where id = $1", [n01.id]);
  await db.query("update public.seats set label = 'N01' where id = $1", [n02.id]);
  await db.query("update public.seats set label = 'N02' where id = $1", [n01.id]);

  await db.query("select public.reset_draft_seats_to_published()");

  const seats = await db.draftSeats();
  const byLabel = Object.fromEntries(seats.map(s => [s.label, s]));
  assert.deepEqual(Object.keys(byLabel).sort(), ["N01", "N02"]);
  assert.equal(byLabel.N01.id, n01.id, "seat_key k-n01 keeps its id and its published label");
  assert.equal(byLabel.N02.id, n02.id, "seat_key k-n02 keeps its id and its published label");
});

test("reset: a draft-only seat squatting on a published label is removed before labels converge", async () => {
  const seatA = await db.seedSeat({ label: "N01", key: "k-a", status: "available" });
  await db.query("select public.publish_seat_map()");

  // Diverge: rename A in the draft, then let a new custom seat squat on the
  // label A is about to reclaim.
  await db.query("update public.seats set label = 'N09' where id = $1", [seatA.id]);
  const squatter = await db.seedSeat({ label: "N01", key: "k-squat", status: "available", isCustom: true });

  await db.query("select public.reset_draft_seats_to_published()");

  const seats = await db.draftSeats();
  const n01Rows = seats.filter(s => s.label === "N01");
  assert.equal(n01Rows.length, 1, "exactly one draft N01 remains");
  assert.equal(n01Rows[0].id, seatA.id, "the surviving N01 is seat A, restored to its published label");
  assert.ok(!seats.some(s => s.id === squatter.id), "the squatter is gone");
});
