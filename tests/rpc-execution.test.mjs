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

test("publish: enforces the concurrency fence when a draft seat changed out-of-band (MLS02)", async () => {
  const n01 = await db.seedSeat({ label: "N01", status: "available" });
  // updated_at as Postgres text, not the driver's Date: the fence compares the
  // value byte-for-byte after a ::timestamptz cast, and Date drops microseconds.
  const { rows: expectations } = await db.query(
    "select id, updated_at::text as updated_at from public.seats where layer = 'draft'"
  );

  // Another session's committed edit after the review opened: the touch
  // trigger bumps updated_at, so the reviewed expectation no longer matches.
  await db.query("update public.seats set notes = 'foreign edit' where id = $1", [n01.id]);

  await expectThrow(
    db.query("select public.publish_seat_map($1::jsonb)", [JSON.stringify(expectations)]),
    { code: "MLS02", match: /changed in another session/ }
  );

  const published = await db.query("select count(*)::int as n from public.seats where layer = 'published'");
  assert.equal(published.rows[0].n, 0, "a fenced-off publish must not touch the published layer");
  const events = await db.query("select count(*)::int as n from public.publish_events");
  assert.equal(events.rows[0].n, 0, "a fenced-off publish must not record an audit event");
});

test("publish: fences on a draft seat added after the review opened (count mismatch)", async () => {
  await db.seedSeat({ label: "N01", status: "available" });
  const { rows: expectations } = await db.query(
    "select id, updated_at::text as updated_at from public.seats where layer = 'draft'"
  );

  await db.seedSeat({ label: "N02", status: "available" });

  await expectThrow(
    db.query("select public.publish_seat_map($1::jsonb)", [JSON.stringify(expectations)]),
    { code: "MLS02", match: /changed in another session/ }
  );
});

test("publish: passes the fence when expectations exactly match the draft", async () => {
  const alice = await db.seedEmployee({ fullName: "Alice" });
  await db.seedSeat({ label: "N01", status: "assigned", employeeId: alice });
  const { rows: expectations } = await db.query(
    "select id, updated_at::text as updated_at from public.seats where layer = 'draft'"
  );

  await db.query("select public.publish_seat_map($1::jsonb)", [JSON.stringify(expectations)]);

  const published = await db.query("select label, employee_id from public.seats where layer = 'published'");
  assert.equal(published.rows.length, 1);
  assert.equal(published.rows[0].employee_id, alice);
});

// updated_at as Postgres text, not the driver's Date: the fence compares the
// value byte-for-byte after a ::timestamptz cast, and Date drops microseconds.
async function activeEmployeeExpectations() {
  const { rows } = await db.query(
    "select id, updated_at::text as updated_at from public.employees where active"
  );
  return rows;
}

async function draftSeatExpectations() {
  const { rows } = await db.query(
    "select id, updated_at::text as updated_at from public.seats where layer = 'draft'"
  );
  return rows;
}

test("publish: fences when an active employee was edited after the review opened (MLS02)", async () => {
  // Publish replaces the published_employees snapshot from the live ACTIVE
  // directory in the same transaction, so people edits are reviewed state too
  // (20260806121000): a rename/phone edit committed by another admin after
  // the review opened must not ship silently just because no seat row moved.
  const alice = await db.seedEmployee({ fullName: "Alice" });
  await db.seedSeat({ label: "N01", status: "assigned", employeeId: alice });
  const seatExpectations = await draftSeatExpectations();
  const employeeExpectations = await activeEmployeeExpectations();

  // Another session's Management edit: touches employees only, no seat row.
  await db.query("update public.employees set position = 'Manager' where id = $1", [alice]);

  await expectThrow(
    db.query("select public.publish_seat_map($1::jsonb, $2::jsonb)", [
      JSON.stringify(seatExpectations),
      JSON.stringify(employeeExpectations)
    ]),
    { code: "MLS02", match: /employee directory changed in another session/ }
  );

  const snap = await db.query("select count(*)::int as n from public.published_employees");
  assert.equal(snap.rows[0].n, 0, "a fenced-off publish must not replace the employee snapshot");
  const events = await db.query("select count(*)::int as n from public.publish_events");
  assert.equal(events.rows[0].n, 0, "a fenced-off publish must not record an audit event");
});

test("publish: fences when an employee was deactivated after the review opened (count mismatch)", async () => {
  const alice = await db.seedEmployee({ fullName: "Alice" });
  const bob = await db.seedEmployee({ fullName: "Bob" });
  await db.seedSeat({ label: "N01", status: "assigned", employeeId: alice });
  const seatExpectations = await draftSeatExpectations();
  const employeeExpectations = await activeEmployeeExpectations();

  await db.query("update public.employees set active = false where id = $1", [bob]);

  await expectThrow(
    db.query("select public.publish_seat_map($1::jsonb, $2::jsonb)", [
      JSON.stringify(seatExpectations),
      JSON.stringify(employeeExpectations)
    ]),
    { code: "MLS02", match: /employee directory changed in another session/ }
  );
});

test("publish: fences when an employee was created after the review opened", async () => {
  await db.seedEmployee({ fullName: "Alice" });
  await db.seedSeat({ label: "N01", status: "available" });
  const seatExpectations = await draftSeatExpectations();
  const employeeExpectations = await activeEmployeeExpectations();

  await db.seedEmployee({ fullName: "Grace" });

  await expectThrow(
    db.query("select public.publish_seat_map($1::jsonb, $2::jsonb)", [
      JSON.stringify(seatExpectations),
      JSON.stringify(employeeExpectations)
    ]),
    { code: "MLS02", match: /employee directory changed in another session/ }
  );
});

test("publish: passes when seat and employee expectations both match, and inactive edits don't fence", async () => {
  const alice = await db.seedEmployee({ fullName: "Alice" });
  const ghost = await db.seedEmployee({ fullName: "Ghost", active: false });
  await db.seedSeat({ label: "N01", status: "assigned", employeeId: alice });
  const seatExpectations = await draftSeatExpectations();
  const employeeExpectations = await activeEmployeeExpectations();

  // Inactive rows never reach the snapshot, so editing one is deliberately
  // outside the fence — it cannot ship unreviewed changes.
  await db.query("update public.employees set position = 'Emeritus' where id = $1", [ghost]);

  await db.query("select public.publish_seat_map($1::jsonb, $2::jsonb)", [
    JSON.stringify(seatExpectations),
    JSON.stringify(employeeExpectations)
  ]);

  const snap = await db.query("select full_name from public.published_employees order by full_name");
  assert.deepEqual(snap.rows.map(r => r.full_name), ["Alice"]);
});

test("publish: null employee expectations skips the employee fence (rollout back-compat)", async () => {
  // Already-deployed application code sends only expected_draft_seats; the
  // default-null employee parameter must keep that call working unfenced.
  const alice = await db.seedEmployee({ fullName: "Alice" });
  await db.seedSeat({ label: "N01", status: "assigned", employeeId: alice });
  const seatExpectations = await draftSeatExpectations();

  await db.query("update public.employees set position = 'Manager' where id = $1", [alice]);

  await db.query("select public.publish_seat_map($1::jsonb)", [JSON.stringify(seatExpectations)]);

  const snap = await db.query("select count(*)::int as n from public.published_employees");
  assert.equal(snap.rows[0].n, 1);
});

test("publish: change_summary counts every change kind the client review dialog shows (Plan 005 parity)", async () => {
  // Baseline employees. Alice/Erin swap N01 (assignment change); Frank gets
  // edited between publishes; Bob is deactivated between publishes (removed);
  // Grace is created only after the baseline publish (added).
  const alice = await db.seedEmployee({ fullName: "Alice" });
  const erin = await db.seedEmployee({ fullName: "Erin" });
  const frank = await db.seedEmployee({ fullName: "Frank", position: "Analyst" });
  const bob = await db.seedEmployee({ fullName: "Bob" });

  const n01 = await db.seedSeat({ label: "N01", status: "assigned", employeeId: alice }); // assignment change target
  const n02 = await db.seedSeat({ label: "N02", status: "available", zone: "North" }); // seat detail change target
  const n03 = await db.seedSeat({ label: "N03", status: "available" }); // status change target
  const n04 = await db.seedSeat({ label: "N04", status: "available", x: 0.5, y: 0.5 }); // seat moved target
  const cx02 = await db.seedSeat({ label: "CX02", key: "cx02", status: "available", isCustom: true }); // seat removed target (custom: deletable)

  // Baseline publish establishes the "currently published" side of the diff
  // the second publish's change_summary will be computed against.
  await db.query("select public.publish_seat_map()");
  const baseline = await db.query("select id from public.publish_events");
  const baselineId = baseline.rows[0].id;

  // Diverge the draft, exercising every change kind independently so no two
  // counts can be satisfied by the same edit.
  await db.query("update public.seats set employee_id = $1 where id = $2", [erin, n01.id]); // assignments_changed (status stays 'assigned' both sides)
  await db.query("update public.seats set zone = $1 where id = $2", ["South", n02.id]); // seat_detail_changes
  await db.query("update public.seats set status = 'reserved' where id = $1", [n03.id]); // status_changes (employee_id stays null both sides)
  await db.query("update public.seats set x = 0.9 where id = $1", [n04.id]); // seats_moved (delta 0.4 >> 0.0005 epsilon)
  await db.query("delete from public.seats where id = $1", [cx02.id]); // seats_removed
  await db.seedSeat({ label: "CX01", key: "cx01", status: "available", isCustom: true }); // seats_added

  await db.query("update public.employees set position = 'Manager' where id = $1", [frank]); // employee_edits
  await db.query("update public.employees set active = false where id = $1", [bob]); // employees_removed
  await db.seedEmployee({ fullName: "Grace" }); // employees_added (active, no snapshot row yet)

  await db.query("select public.publish_seat_map()");

  const second = await db.query("select change_summary from public.publish_events where id <> $1", [baselineId]);
  assert.equal(second.rows.length, 1, "the diverging publish recorded exactly one new event");
  const summary = second.rows[0].change_summary;

  // The three counts this plan adds.
  assert.equal(summary.employees_added, 1, "Grace has no published_employees row yet");
  assert.equal(summary.employees_removed, 1, "Bob's snapshot row has no matching active employee");
  assert.equal(summary.seat_detail_changes, 1, "N02's zone changed North -> South");

  // Spot-check (plus full coverage) of the pre-existing counts: adding the
  // three new jsonb keys must not perturb any of these.
  assert.equal(summary.seats_added, 1, "CX01 exists in draft but not in the baseline publish");
  assert.equal(summary.seats_removed, 1, "CX02 was published then deleted from the draft");
  assert.equal(summary.assignments_changed, 1, "N01 moved from Alice to Erin");
  assert.equal(summary.seats_moved, 1, "N04 moved past the 0.0005 epsilon");
  assert.equal(summary.status_changes, 1, "N03 flipped available -> reserved with no employee change");
  assert.equal(summary.employee_edits, 1, "Frank's position changed");
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

// updated_at as Postgres text, not the driver's Date: the fence compares the
// value byte-for-byte after a ::timestamptz cast, and Date drops microseconds.
async function seatExpectation(seatId) {
  const { rows } = await db.query("select id, updated_at::text as updated_at from public.seats where id = $1", [seatId]);
  return rows[0];
}

test("import: enforces the concurrency fence when a targeted seat changed out-of-band (MLS02)", async () => {
  const n01 = await db.seedSeat({ label: "N01", status: "available" });
  const expectation = await seatExpectation(n01.id);

  // Another session's committed edit: touch trigger bumps updated_at.
  await db.query("update public.seats set notes = 'foreign edit' where id = $1", [n01.id]);

  const rows = [{ seat_label: "N01", employee_name: "X", employee_email: "", position: "", department: "", zone: "", status: "assigned", notes: "", row_number: 2 }];
  await expectThrow(
    db.query("select public.import_assignments_csv($1::jsonb, $2::jsonb)", [JSON.stringify(rows), JSON.stringify([expectation])]),
    { code: "MLS02", match: /changed in another session/ }
  );

  const [seat] = await db.draftSeats();
  assert.equal(seat.status, "available", "a fenced-off import must not mutate the draft");
  assert.equal(seat.employee_id, null);
});

test("import: passes the fence when expectations match the locked rows", async () => {
  const n01 = await db.seedSeat({ label: "N01", status: "available" });
  const expectation = await seatExpectation(n01.id);

  const rows = [{ seat_label: "N01", employee_name: "Fresh Person", employee_email: "", position: "", department: "", zone: "", status: "assigned", notes: "", row_number: 2 }];
  const res = await db.query("select public.import_assignments_csv($1::jsonb, $2::jsonb) as count", [
    JSON.stringify(rows),
    JSON.stringify([expectation])
  ]);
  assert.equal(res.rows[0].count, 1);

  const [seat] = await db.draftSeats();
  assert.equal(seat.status, "assigned");
});

test("import: fences when a NON-targeted draft seat changed out-of-band (vacate collateral, MLS02)", async () => {
  // The regression 20260806120000 closes: assigning an employee also vacates
  // their OTHER draft seat, so a non-targeted seat that changed since the
  // review is exactly as stale as a targeted one. Admin B assigns Alice to
  // N05 while admin A's import review (CSV assigning Alice to N01) is open;
  // the old targeted-only fence passed and the import silently vacated N05.
  const alice = await db.seedEmployee({ fullName: "Alice" });
  await db.seedSeat({ label: "N01", status: "available" });
  const n05 = await db.seedSeat({ label: "N05", status: "available" });
  const expectations = await draftSeatExpectations();

  // Another session's committed assignment after the CSV was parsed.
  await db.query("update public.seats set employee_id = $1, status = 'assigned' where id = $2", [alice, n05.id]);

  const rows = [{ seat_label: "N01", employee_name: "Alice", employee_email: "", position: "", department: "", zone: "", status: "assigned", notes: "", row_number: 2 }];
  await expectThrow(
    db.query("select public.import_assignments_csv($1::jsonb, $2::jsonb)", [JSON.stringify(rows), JSON.stringify(expectations)]),
    { code: "MLS02", match: /changed in another session/ }
  );

  const seats = await db.draftSeats();
  const byLabel = Object.fromEntries(seats.map(s => [s.label, s]));
  assert.equal(byLabel.N05.employee_id, alice, "the other admin's assignment must survive the fenced-off import");
  assert.equal(byLabel.N05.status, "assigned");
  assert.equal(byLabel.N01.employee_id, null, "a fenced-off import must not mutate the targeted seat either");
});

test("import: fences on a draft seat added after the CSV was parsed (count mismatch)", async () => {
  await db.seedSeat({ label: "N01", status: "available" });
  const expectations = await draftSeatExpectations();

  await db.seedSeat({ label: "N02", status: "available" });

  const rows = [{ seat_label: "N01", employee_name: "X", employee_email: "", position: "", department: "", zone: "", status: "assigned", notes: "", row_number: 2 }];
  await expectThrow(
    db.query("select public.import_assignments_csv($1::jsonb, $2::jsonb)", [JSON.stringify(rows), JSON.stringify(expectations)]),
    { code: "MLS02", match: /changed in another session/ }
  );
});

test("import: fences on a draft seat deleted after the CSV was parsed (count check only)", async () => {
  await db.seedSeat({ label: "N01", status: "available" });
  // Custom seat: seatProtection's trigger blocks deleting original draft
  // seats, and deletion is the scenario under test.
  const cx01 = await db.seedSeat({ label: "CX01", key: "cx01", status: "available", isCustom: true });
  const expectations = await draftSeatExpectations();

  // A deleted row is absent from the per-row scan, so the count check is the
  // only guard that can catch it (20260806120000).
  await db.query("delete from public.seats where id = $1", [cx01.id]);

  const rows = [{ seat_label: "N01", employee_name: "X", employee_email: "", position: "", department: "", zone: "", status: "assigned", notes: "", row_number: 2 }];
  await expectThrow(
    db.query("select public.import_assignments_csv($1::jsonb, $2::jsonb)", [JSON.stringify(rows), JSON.stringify(expectations)]),
    { code: "MLS02", match: /draft map changed in another session/ }
  );

  const [seat] = await db.draftSeats();
  assert.equal(seat.employee_id, null, "a fenced-off import must not mutate the remaining draft");
});

test("import: passes when whole-draft expectations match, non-targeted seats included", async () => {
  await db.seedSeat({ label: "N01", status: "available" });
  await db.seedSeat({ label: "N02", status: "available" });
  const expectations = await draftSeatExpectations();

  const rows = [{ seat_label: "N01", employee_name: "Fresh Person", employee_email: "", position: "", department: "", zone: "", status: "assigned", notes: "", row_number: 2 }];
  const res = await db.query("select public.import_assignments_csv($1::jsonb, $2::jsonb) as count", [
    JSON.stringify(rows),
    JSON.stringify(expectations)
  ]);
  assert.equal(res.rows[0].count, 1);

  const seats = await db.draftSeats();
  const byLabel = Object.fromEntries(seats.map(s => [s.label, s]));
  assert.equal(byLabel.N01.status, "assigned");
  assert.equal(byLabel.N02.status, "available", "the untouched non-targeted seat stays as reviewed");
});

test("import: fences when a matched employee was edited after the CSV was parsed (MLS02)", async () => {
  // Issue #328: the import overwrites matched employee rows (name/position/
  // department, active=true) — a rename or detail edit committed by another
  // admin while the review sat open must not be silently overwritten.
  const alice = await db.seedEmployee({ fullName: "Alice", position: "Analyst" });
  await db.seedSeat({ label: "N01", status: "available" });
  const seatExpectations = await draftSeatExpectations();
  const employeeExpectations = await activeEmployeeExpectations();

  await db.query("update public.employees set position = 'Manager' where id = $1", [alice]);

  const rows = [{ seat_label: "N01", employee_name: "Alice", employee_email: "", position: "Analyst", department: "", zone: "", status: "assigned", notes: "", row_number: 2 }];
  await expectThrow(
    db.query("select public.import_assignments_csv($1::jsonb, $2::jsonb, $3::jsonb)", [
      JSON.stringify(rows),
      JSON.stringify(seatExpectations),
      JSON.stringify(employeeExpectations)
    ]),
    { code: "MLS02", match: /employee directory changed in another session/ }
  );

  const employee = await db.query("select position from public.employees where id = $1", [alice]);
  assert.equal(employee.rows[0].position, "Manager", "the other admin's edit must survive the fenced-off import");
  const [seat] = await db.draftSeats();
  assert.equal(seat.employee_id, null, "a fenced-off import must not mutate the draft");
});

test("import: fences when an employee was deactivated after the CSV was parsed (count mismatch)", async () => {
  await db.seedEmployee({ fullName: "Alice" });
  const bob = await db.seedEmployee({ fullName: "Bob" });
  await db.seedSeat({ label: "N01", status: "available" });
  const seatExpectations = await draftSeatExpectations();
  const employeeExpectations = await activeEmployeeExpectations();

  await db.query("update public.employees set active = false where id = $1", [bob]);

  const rows = [{ seat_label: "N01", employee_name: "Alice", employee_email: "", position: "", department: "", zone: "", status: "assigned", notes: "", row_number: 2 }];
  await expectThrow(
    db.query("select public.import_assignments_csv($1::jsonb, $2::jsonb, $3::jsonb)", [
      JSON.stringify(rows),
      JSON.stringify(seatExpectations),
      JSON.stringify(employeeExpectations)
    ]),
    { code: "MLS02", match: /employee directory changed in another session/ }
  );
});

test("import: fences when an employee was created after the CSV was parsed", async () => {
  await db.seedEmployee({ fullName: "Alice" });
  await db.seedSeat({ label: "N01", status: "available" });
  const seatExpectations = await draftSeatExpectations();
  const employeeExpectations = await activeEmployeeExpectations();

  await db.seedEmployee({ fullName: "Grace" });

  const rows = [{ seat_label: "N01", employee_name: "Alice", employee_email: "", position: "", department: "", zone: "", status: "assigned", notes: "", row_number: 2 }];
  await expectThrow(
    db.query("select public.import_assignments_csv($1::jsonb, $2::jsonb, $3::jsonb)", [
      JSON.stringify(rows),
      JSON.stringify(seatExpectations),
      JSON.stringify(employeeExpectations)
    ]),
    { code: "MLS02", match: /employee directory changed in another session/ }
  );
});

test("import: passes when both fences match, and inactive edits don't fence", async () => {
  await db.seedEmployee({ fullName: "Alice" });
  const ghost = await db.seedEmployee({ fullName: "Ghost", active: false });
  await db.seedSeat({ label: "N01", status: "available" });
  const seatExpectations = await draftSeatExpectations();
  const employeeExpectations = await activeEmployeeExpectations();

  // Inactive rows are outside the fence's active-only scope (documented in
  // 20260806140000) — editing one must not produce a false MLS02.
  await db.query("update public.employees set position = 'Emeritus' where id = $1", [ghost]);

  const rows = [{ seat_label: "N01", employee_name: "Alice", employee_email: "", position: "", department: "", zone: "", status: "assigned", notes: "", row_number: 2 }];
  const res = await db.query("select public.import_assignments_csv($1::jsonb, $2::jsonb, $3::jsonb) as count", [
    JSON.stringify(rows),
    JSON.stringify(seatExpectations),
    JSON.stringify(employeeExpectations)
  ]);
  assert.equal(res.rows[0].count, 1);

  const [seat] = await db.draftSeats();
  assert.equal(seat.status, "assigned");
});

test("import: omitting employee expectations skips that fence (rollout back-compat)", async () => {
  // Already-deployed application code sends (assignment_rows, expected_seats);
  // the default-null employee parameter must keep that call working unfenced.
  const alice = await db.seedEmployee({ fullName: "Alice" });
  await db.seedSeat({ label: "N01", status: "available" });
  const seatExpectations = await draftSeatExpectations();

  await db.query("update public.employees set position = 'Manager' where id = $1", [alice]);

  const rows = [{ seat_label: "N01", employee_name: "Alice", employee_email: "", position: "", department: "", zone: "", status: "assigned", notes: "", row_number: 2 }];
  const res = await db.query("select public.import_assignments_csv($1::jsonb, $2::jsonb) as count", [
    JSON.stringify(rows),
    JSON.stringify(seatExpectations)
  ]);
  assert.equal(res.rows[0].count, 1);
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
// restore_draft_snapshot
// ---------------------------------------------------------------------------
//
// Builds the same JSON shape restoreDraftSnapshotAction sends: snapshot_seats
// mirrors DraftSeatRestoreRecord (an Omit<SeatWithEmployee, "employee">, see
// normalizeRestoreSeat in app/actions.ts) and snapshot_employees mirrors
// Employee (normalizeRestoreEmployee). Extra properties like created_at are
// harmless — jsonb_to_recordset only reads the columns it declares.

function toSnapshotSeat(seat, overrides = {}) {
  return {
    id: seat.id,
    seat_key: seat.seat_key,
    label: seat.label,
    x: seat.x,
    y: seat.y,
    status: seat.status,
    layer: "draft",
    employee_id: seat.employee_id ?? null,
    zone: seat.zone ?? null,
    department: seat.department ?? null,
    notes: seat.notes ?? null,
    is_custom: Boolean(seat.is_custom),
    ...overrides
  };
}

function toSnapshotEmployee(employee, overrides = {}) {
  return {
    id: employee.id,
    full_name: employee.full_name,
    position: employee.position ?? null,
    department: employee.department ?? null,
    phone_extension: employee.phone_extension ?? null,
    avatar_url: employee.avatar_url ?? null,
    active: employee.active !== false,
    ...overrides
  };
}

async function employeeRow(id) {
  const { rows } = await db.query("select * from public.employees where id = $1", [id]);
  return rows[0];
}

test("restore_draft_snapshot: converges the draft to the snapshot, preserving ids", async () => {
  const alice = await db.seedEmployee({ fullName: "Alice" });
  const n01 = await db.seedSeat({ label: "N01", status: "assigned", employeeId: alice });
  const n02 = await db.seedSeat({ label: "N02", status: "available", zone: "North" });

  const snapshotSeats = [toSnapshotSeat(n01), toSnapshotSeat(n02)];
  const snapshotEmployees = [toSnapshotEmployee(await employeeRow(alice))];

  // Diverge the live draft: unassign N01 and move it, change N02's zone, and
  // add a custom seat that isn't part of the snapshot at all.
  await db.query("update public.seats set status = 'available', employee_id = null, x = 0.9 where id = $1", [n01.id]);
  await db.query("update public.seats set zone = 'South' where id = $1", [n02.id]);
  await db.seedSeat({ label: "CX01", key: "cx01", status: "available", isCustom: true });

  const { rows } = await db.query("select public.restore_draft_snapshot($1::jsonb, $2::jsonb) as count", [
    JSON.stringify(snapshotSeats),
    JSON.stringify(snapshotEmployees)
  ]);
  assert.equal(Number(rows[0].count), 2, "returns the snapshot's seat count");

  const seats = await db.draftSeats();
  const byLabel = Object.fromEntries(seats.map(s => [s.label, s]));
  assert.deepEqual(Object.keys(byLabel).sort(), ["N01", "N02"], "the un-snapshotted custom seat is gone");
  assert.equal(byLabel.N01.status, "assigned");
  assert.equal(byLabel.N01.employee_id, alice);
  assert.equal(byLabel.N01.id, n01.id, "surviving draft rows keep their ids");
  assert.equal(byLabel.N02.zone, "North", "zone reverted to the snapshot value");

  const coords = await db.query("select x from public.seats where id = $1", [n01.id]);
  assert.equal(Number(coords.rows[0].x), 0.5, "moved seat returns to the snapshot position");
});

test("restore_draft_snapshot: refuses when an original (non-custom) seat is missing from the snapshot", async () => {
  // N01 is deliberately left unbound: it only needs to exist in the draft
  // (excluded from the snapshot below is the point of the test) and its id
  // is never read.
  await db.seedSeat({ label: "N01", status: "available" });
  const n02 = await db.seedSeat({ label: "N02", status: "available" });

  // The snapshot omits N01 (is_custom: false) entirely. Unlike an eligible
  // custom seat, an original can never be silently dropped by a restore.
  const snapshotSeats = [toSnapshotSeat(n02)];

  await expectThrow(
    db.query("select public.restore_draft_snapshot($1::jsonb, $2::jsonb)", [JSON.stringify(snapshotSeats), JSON.stringify([])]),
    { match: /protected or occupied seats are missing/ }
  );

  const seats = await db.draftSeats();
  assert.deepEqual(seats.map(s => s.label).sort(), ["N01", "N02"], "the whole restore rolled back; N01 still exists");
});

test("restore_draft_snapshot: re-upserts employees from the snapshot and never deletes one absent from it", async () => {
  const alice = await db.seedEmployee({ fullName: "Alice", position: "Analyst" });
  const bob = await db.seedEmployee({ fullName: "Bob" }); // absent from the snapshot below
  const n01 = await db.seedSeat({ label: "N01", status: "assigned", employeeId: alice });

  const snapshotSeats = [toSnapshotSeat(n01)];
  const snapshotEmployees = [toSnapshotEmployee(await employeeRow(alice))];

  // Diverge Alice's live record so the restore has something to re-upsert.
  await db.query("update public.employees set position = 'Manager' where id = $1", [alice]);

  await db.query("select public.restore_draft_snapshot($1::jsonb, $2::jsonb)", [
    JSON.stringify(snapshotSeats),
    JSON.stringify(snapshotEmployees)
  ]);

  const aliceAfter = await employeeRow(alice);
  assert.equal(aliceAfter.position, "Analyst", "the snapshot's employee fields are re-upserted");

  const bobAfter = await db.query("select id, active from public.employees where id = $1", [bob]);
  assert.equal(bobAfter.rows.length, 1, "an employee absent from the snapshot is never deleted (owner-confirmed contract)");
  assert.equal(bobAfter.rows[0].active, true);
});

test("restore_draft_snapshot: enforces the concurrency fence on stale expected_draft_seats (MLS02)", async () => {
  const n01 = await db.seedSeat({ label: "N01", status: "available" });
  const snapshotSeats = [toSnapshotSeat(n01)];
  const staleExpectations = JSON.stringify([{ id: n01.id, updated_at: STALE_TS }]);

  await expectThrow(
    db.query("select public.restore_draft_snapshot($1::jsonb, $2::jsonb, $3::jsonb)", [
      JSON.stringify(snapshotSeats),
      JSON.stringify([]),
      staleExpectations
    ]),
    { code: "MLS02", match: /changed in another session/ }
  );
});

test("restore_draft_snapshot: requires admin", async () => {
  const n01 = await db.seedSeat({ label: "N01", status: "available" });
  const snapshotSeats = [toSnapshotSeat(n01)];
  await db.actAsViewer();
  await expectThrow(
    db.query("select public.restore_draft_snapshot($1::jsonb, $2::jsonb)", [JSON.stringify(snapshotSeats), JSON.stringify([])]),
    { code: "42501", match: /Admin permission required/ }
  );
});

async function residueCount() {
  const { rows } = await db.query(
    "select count(*)::int as count from public.seats where label like '~restore~%' or seat_key like '~restore~%'"
  );
  return rows[0].count;
}

// Permuted-snapshot cases (Plan 012): before the staged-writes migration, the
// restore loop's per-row UPDATE ran one row at a time in id order and
// collided with itself mid-loop on the non-deferrable
// seats_unique_label_per_layer / seats_unique_key_per_layer indexes whenever
// the snapshot being restored permuted a label or seat_key relative to the
// live draft. These reproduce that class (mirrors the "reset: survives a ..."
// permutation tests above for reset_draft_seats_to_published).

test("restore_draft_snapshot: survives a label permutation between two draft seats", async () => {
  const n01 = await db.seedSeat({ label: "N01", key: "k-n01", status: "available" });
  const n02 = await db.seedSeat({ label: "N02", key: "k-n02", status: "available" });

  // Permute the labels in the snapshot payload only — the live draft still
  // holds N01/N02, so restoring collides mid-loop without staged parking.
  const snapshotSeats = [toSnapshotSeat(n01, { label: "N02" }), toSnapshotSeat(n02, { label: "N01" })];

  await db.query("select public.restore_draft_snapshot($1::jsonb, $2::jsonb)", [
    JSON.stringify(snapshotSeats),
    JSON.stringify([])
  ]);

  const { rows } = await db.query("select id, label from public.seats where layer = 'draft'");
  const byId = Object.fromEntries(rows.map(r => [r.id, r.label]));
  assert.equal(byId[n01.id], "N02", "seat n01's row now carries the snapshot's swapped label, keeping its id");
  assert.equal(byId[n02.id], "N01", "seat n02's row now carries the snapshot's swapped label, keeping its id");
  assert.equal(await residueCount(), 0, "no parked residue survives the transaction");
});

test("restore_draft_snapshot: survives a seat_key permutation between two draft seats", async () => {
  const n01 = await db.seedSeat({ label: "N01", key: "k-n01", status: "available" });
  const n02 = await db.seedSeat({ label: "N02", key: "k-n02", status: "available" });

  // Permute the seat_keys in the snapshot payload only — labels stay put, but
  // restoring the live rows to their snapshot seat_key still collides
  // mid-loop without staged parking (seats_unique_key_per_layer).
  const snapshotSeats = [toSnapshotSeat(n01, { seat_key: "k-n02" }), toSnapshotSeat(n02, { seat_key: "k-n01" })];

  await db.query("select public.restore_draft_snapshot($1::jsonb, $2::jsonb)", [
    JSON.stringify(snapshotSeats),
    JSON.stringify([])
  ]);

  const { rows } = await db.query("select id, seat_key from public.seats where layer = 'draft'");
  const byId = Object.fromEntries(rows.map(r => [r.id, r.seat_key]));
  assert.equal(byId[n01.id], "k-n02", "seat n01's row now carries the snapshot's swapped seat_key, keeping its id");
  assert.equal(byId[n02.id], "k-n01", "seat n02's row now carries the snapshot's swapped seat_key, keeping its id");
  assert.equal(await residueCount(), 0, "no parked residue survives the transaction");
});

test("restore_draft_snapshot: re-inserts a deleted custom seat whose snapshot label the live draft currently holds", async () => {
  // The restore loop processes rows in `order by source.id`, so this only
  // reliably reproduces the collision (insert of X02 racing X01's still-live
  // row, which currently holds label X02) when X02's id sorts BEFORE X01's —
  // seedSeat's random gen_random_uuid() id can't guarantee that, so both ids
  // are pinned explicitly.
  const { rows: seeded } = await db.query(
    `insert into public.seats (id, seat_key, label, x, y, status, layer, is_custom)
     values
       ('00000000-0000-0000-0000-000000000002', 'k-x01', 'X01', 0.5, 0.5, 'available', 'draft', true),
       ('00000000-0000-0000-0000-000000000001', 'k-x02', 'X02', 0.5, 0.5, 'available', 'draft', true)
     returning *`
  );
  const x01 = seeded.find(s => s.label === "X01");
  const x02 = seeded.find(s => s.label === "X02");
  assert.ok(x02.id < x01.id, "test setup: X02's id must sort before X01's to reproduce the collision");
  const snapshotSeats = [toSnapshotSeat(x01), toSnapshotSeat(x02)];

  // Diverge the live draft: delete X02 entirely, then relabel X01 onto X02's
  // old label/seat_key. The insert branch must re-create X02 (its row no
  // longer exists) while X01's surviving row currently squats on the label
  // X02 is about to reclaim.
  await db.query("delete from public.seats where id = $1", [x02.id]);
  await db.query("update public.seats set label = 'X02', seat_key = 'k-x02' where id = $1", [x01.id]);

  await db.query("select public.restore_draft_snapshot($1::jsonb, $2::jsonb)", [
    JSON.stringify(snapshotSeats),
    JSON.stringify([])
  ]);

  const seats = await db.draftSeats();
  const byLabel = Object.fromEntries(seats.map(s => [s.label, s]));
  assert.deepEqual(Object.keys(byLabel).sort(), ["X01", "X02"]);
  assert.equal(byLabel.X01.id, x01.id, "the surviving custom seat keeps its id and reverts to its snapshot label");
  assert.equal(byLabel.X02.id, x02.id, "X02 is re-created with the id captured in the snapshot before it was deleted");
  assert.equal(await residueCount(), 0, "no parked residue survives the transaction");
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
// delete_department
// ---------------------------------------------------------------------------
//
// Unlike rename_department, delete_department does NOT reject an in-use
// department: it clears employees.department to null and deactivates the
// option row (read from the live RPC body, 20260702100000).

test("delete_department: clears the department from matching employees and deactivates the option", async () => {
  await db.query("insert into public.department_options(name, active) values ('Ops', true)");
  const alice = await db.seedEmployee({ fullName: "Alice", department: "Ops" });

  await db.query("select public.delete_department($1)", ["Ops"]);

  const emp = await db.query("select department from public.employees where id = $1", [alice]);
  assert.equal(emp.rows[0].department, null, "the employee's department is cleared, not the employee itself");
  const opt = await db.query("select active from public.department_options where name = 'Ops'");
  assert.equal(opt.rows[0]?.active, false);
});

test("delete_department: requires admin", async () => {
  await db.query("insert into public.department_options(name, active) values ('Ops', true)");
  await db.actAsViewer();
  await expectThrow(db.query("select public.delete_department($1)", ["Ops"]), {
    code: "42501",
    match: /Admin permission required/
  });
});

// ---------------------------------------------------------------------------
// rename_zone
// ---------------------------------------------------------------------------
//
// Unlike rename_department (case-insensitive, trim-safe, matches employees
// with no layer concept), rename_zone matches seats.zone by exact string
// equality and only ever rewrites layer = 'draft' seats (read from the live
// RPC body, 20260702100000) — the published layer is untouched until the
// next publish.

test("rename_zone: rewrites draft seats and toggles the option rows", async () => {
  await db.query("insert into public.zone_options(name, active) values ('North', true)");
  const n01 = await db.seedSeat({ label: "N01", status: "available", zone: "North" });

  await db.query("select public.rename_zone($1, $2)", ["North", "Northwest"]);

  const seat = await db.query("select zone from public.seats where id = $1", [n01.id]);
  assert.equal(seat.rows[0].zone, "Northwest");
  const options = await db.query("select name, active from public.zone_options order by name");
  const byName = Object.fromEntries(options.rows.map(o => [o.name, o.active]));
  assert.equal(byName.Northwest, true);
  assert.equal(byName.North, false);
});

test("rename_zone: only rewrites draft-layer seats, leaving published untouched", async () => {
  await db.query("insert into public.zone_options(name, active) values ('North', true)");
  const draftSeat = await db.seedSeat({ label: "N01", status: "available", zone: "North" });
  const publishedSeat = await db.seedSeat({ label: "N02", status: "available", zone: "North", layer: "published" });

  await db.query("select public.rename_zone($1, $2)", ["North", "Northwest"]);

  const draft = await db.query("select zone from public.seats where id = $1", [draftSeat.id]);
  assert.equal(draft.rows[0].zone, "Northwest");
  const published = await db.query("select zone from public.seats where id = $1", [publishedSeat.id]);
  assert.equal(published.rows[0].zone, "North", "rename_zone does not touch the published layer");
});

test("rename_zone: requires admin", async () => {
  await db.query("insert into public.zone_options(name, active) values ('North', true)");
  await db.actAsViewer();
  await expectThrow(db.query("select public.rename_zone($1, $2)", ["North", "Northwest"]), {
    code: "42501",
    match: /Admin permission required/
  });
});

// ---------------------------------------------------------------------------
// delete_zone
// ---------------------------------------------------------------------------

test("delete_zone: clears the zone from draft seats and deactivates the option", async () => {
  await db.query("insert into public.zone_options(name, active) values ('North', true)");
  const n01 = await db.seedSeat({ label: "N01", status: "available", zone: "North" });

  await db.query("select public.delete_zone($1)", ["North"]);

  const seat = await db.query("select zone from public.seats where id = $1", [n01.id]);
  assert.equal(seat.rows[0].zone, null);
  const opt = await db.query("select active from public.zone_options where name = 'North'");
  assert.equal(opt.rows[0]?.active, false);
});

test("delete_zone: only clears draft-layer seats, leaving published untouched", async () => {
  await db.query("insert into public.zone_options(name, active) values ('North', true)");
  const publishedSeat = await db.seedSeat({ label: "N01", status: "available", zone: "North", layer: "published" });

  await db.query("select public.delete_zone($1)", ["North"]);

  const published = await db.query("select zone from public.seats where id = $1", [publishedSeat.id]);
  assert.equal(published.rows[0].zone, "North", "delete_zone does not touch the published layer");
});

test("delete_zone: requires admin", async () => {
  await db.query("insert into public.zone_options(name, active) values ('North', true)");
  await db.actAsViewer();
  await expectThrow(db.query("select public.delete_zone($1)", ["North"]), {
    code: "42501",
    match: /Admin permission required/
  });
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
