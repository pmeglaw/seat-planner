import assert from "node:assert/strict";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";
import test from "node:test";
const publishSummary = await importTsModule("lib/publishSummary.ts");

function employee(id, fullName) {
  return {
    id,
    full_name: fullName,
    position: null,
    department: null,
    phone_extension: null,
    avatar_url: null,
    active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z"
  };
}

function seat(overrides) {
  const assignedEmployee = overrides.employee ?? null;
  return {
    id: `${overrides.layer ?? "draft"}-${overrides.label}`,
    seat_key: overrides.seat_key ?? overrides.label,
    label: overrides.label,
    x: overrides.x ?? 0.1,
    y: overrides.y ?? 0.2,
    status: overrides.status ?? (assignedEmployee ? "assigned" : "available"),
    layer: overrides.layer ?? "draft",
    employee_id: overrides.employee_id ?? assignedEmployee?.id ?? null,
    employee: assignedEmployee,
    zone: "zone" in overrides ? overrides.zone : "West Pod",
    department: overrides.department ?? null,
    notes: overrides.notes ?? null,
    is_custom: overrides.is_custom ?? false,
    floor: overrides.floor ?? "3",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z"
  };
}

test("publish summary reports added, updated, and removed counts", () => {
  const summary = publishSummary.buildPublishChangeSummary(
    [
      seat({ label: "W01" }),
      seat({ label: "W03", seat_key: "custom-w03", is_custom: true })
    ],
    [
      seat({ label: "W01", layer: "published" }),
      seat({ label: "W02", layer: "published", seat_key: "custom-w02", is_custom: true })
    ]
  );

  assert.equal(summary.addedSeats.length, 1);
  assert.equal(summary.addedSeats[0].label, "W03");
  assert.equal(summary.addedSeats[0].detail, "West Pod");
  assert.equal(summary.removedSeats.length, 1);
  assert.equal(summary.removedSeats[0].label, "W02");
  assert.equal(summary.updatedSeatCount, 0);
  assert.equal(summary.totalChangeCount, 2);
  assert.equal(summary.hasChanges, true);
});

test("publish summary classifies reliable draft-vs-published categories", () => {
  const alex = employee("emp-alex", "Alex Admin");
  const blair = employee("emp-blair", "Blair Builder");
  const casey = employee("emp-casey", "Casey Coordinator");
  const summary = publishSummary.buildPublishChangeSummary(
    [
      seat({ label: "W01", employee: blair }),
      seat({ label: "W02" }),
      seat({ label: "W03", x: 0.14, y: 0.27 }),
      seat({ label: "W04", status: "unavailable" }),
      seat({ label: "W05", notes: "Needs monitor arm", zone: "North Pod" }),
      seat({ label: "W06", employee: casey })
    ],
    [
      seat({ label: "W01", layer: "published", employee: alex }),
      seat({ label: "W02", layer: "published", employee: alex }),
      seat({ label: "W03", layer: "published", x: 0.1, y: 0.2 }),
      seat({ label: "W04", layer: "published", status: "reserved" }),
      seat({ label: "W05", layer: "published", notes: null, zone: "West Pod" }),
      seat({ label: "W06", layer: "published" })
    ]
  );

  assert.deepEqual(summary.assignmentChanges.map(item => item.label), ["W01", "W06"]);
  assert.deepEqual(summary.vacatedSeats.map(item => item.label), ["W02"]);
  assert.deepEqual(summary.statusChanges.map(item => item.label), ["W04"]);
  assert.deepEqual(summary.otherChanges.map(item => item.label), ["W03", "W05"]);
  assert.equal(summary.updatedSeatCount, 6);
});

test("publish summary matches seats by seat key so label edits are not false add remove changes", () => {
  const summary = publishSummary.buildPublishChangeSummary(
    [seat({ label: "W01A", seat_key: "west-01" })],
    [seat({ label: "W01", layer: "published", seat_key: "west-01" })]
  );

  assert.equal(summary.addedSeats.length, 0);
  assert.equal(summary.removedSeats.length, 0);
  assert.equal(summary.updatedSeatCount, 1);
  assert.equal(summary.otherChanges.length, 1);
  assert.match(summary.otherChanges[0].detail, /Label W01 -> W01A/);
});

// People-detail publish gate: live `employees` is the draft-side working set;
// `publishedEmployees` is the viewer snapshot replaced at publish. The summary
// must surface pending people edits — an employee rename never shows in the
// seat diff (both sides join the same live row), so without this the rename
// could never be published.

function withDetails(base, overrides) {
  return { ...base, ...overrides };
}

test("publish summary reports employee detail changes against the viewer snapshot", () => {
  const alexLive = withDetails(employee("emp-1", "Alexandra Shabazian"), { position: "Senior Paralegal", phone_extension: "114" });
  const alexPublished = withDetails(employee("emp-1", "Alex Shabazian"), { position: "Paralegal", phone_extension: "104" });
  const summary = publishSummary.buildPublishChangeSummary([], [], {
    employees: [alexLive],
    publishedEmployees: [alexPublished]
  });

  assert.equal(summary.employeeDetailChanges.length, 1);
  assert.equal(summary.employeeDetailChanges[0].label, "Alexandra Shabazian");
  assert.match(summary.employeeDetailChanges[0].detail, /Name Alex Shabazian -> Alexandra Shabazian/);
  assert.match(summary.employeeDetailChanges[0].detail, /Title Paralegal -> Senior Paralegal/);
  assert.match(summary.employeeDetailChanges[0].detail, /Ext\. 104 -> 114/);
  assert.equal(summary.hasChanges, true);
  assert.equal(summary.totalChangeCount, 1);
});

test("publish summary reports directory additions and removals", () => {
  const kept = employee("emp-1", "Alex Shabazian");
  const added = employee("emp-2", "Brand New Hire");
  const removed = employee("emp-3", "Former Employee");
  const summary = publishSummary.buildPublishChangeSummary([], [], {
    employees: [kept, added],
    publishedEmployees: [kept, removed]
  });

  const details = Object.fromEntries(summary.employeeDetailChanges.map(item => [item.label, item.detail]));
  assert.equal(details["Brand New Hire"], "New in the viewer directory");
  assert.equal(details["Former Employee"], "Removed from the viewer directory");
  assert.equal(summary.employeeDetailChanges.length, 2);
});

test("publish summary treats inactive live employees as removed from the directory", () => {
  const deactivated = withDetails(employee("emp-1", "Alex Shabazian"), { active: false });
  const summary = publishSummary.buildPublishChangeSummary([], [], {
    employees: [deactivated],
    publishedEmployees: [employee("emp-1", "Alex Shabazian")]
  });

  assert.equal(summary.employeeDetailChanges.length, 1);
  assert.equal(summary.employeeDetailChanges[0].detail, "Removed from the viewer directory");
});

test("publish summary reports no employee changes when directory matches snapshot", () => {
  const alex = employee("emp-1", "Alex Shabazian");
  const summary = publishSummary.buildPublishChangeSummary([], [], {
    employees: [alex],
    publishedEmployees: [{ ...alex, updated_at: "2026-07-08T00:00:00Z" }]
  });

  assert.equal(summary.employeeDetailChanges.length, 0);
  assert.equal(summary.hasChanges, false);
});

test("publish summary stays backward compatible without employee inputs", () => {
  const summary = publishSummary.buildPublishChangeSummary([], []);
  assert.deepEqual(summary.employeeDetailChanges, []);
  assert.equal(summary.hasChanges, false);
});

test("diff rows: assigned, vacated, and reassigned occupant changes", () => {
  const alice = employee("emp-1", "Alice Smith");
  const ben = employee("emp-2", "Ben Ito");
  const rows = publishSummary.buildPublishDiffRows(
    [
      seat({ label: "W01", employee: alice, status: "assigned" }),
      seat({ label: "W02", status: "available" }),
      seat({ label: "W03", employee: ben })
    ],
    [
      seat({ label: "W01", layer: "published", status: "available" }),
      seat({ label: "W02", layer: "published", employee: alice, status: "assigned" }),
      seat({ label: "W03", layer: "published", employee: alice, status: "assigned" })
    ]
  );

  assert.deepEqual(rows.map(r => [r.label, r.kind, r.from, r.to]), [
    ["W01", "assigned", "Open seat", "Alice Smith"],
    ["W02", "vacated", "Alice Smith", "Open seat"],
    ["W03", "reassigned", "Alice Smith", "Ben Ito"]
  ]);
  // The occupant tag already implies the status flip — no Status noise.
  assert.deepEqual(rows.map(r => r.detail), [null, null, null]);
});

test("diff rows: added and removed seats use the absent marker", () => {
  const alice = employee("emp-1", "Alice Smith");
  const rows = publishSummary.buildPublishDiffRows(
    [seat({ label: "S01", is_custom: true }), seat({ label: "S02", is_custom: true, employee: alice })],
    [seat({ label: "N09", layer: "published", employee: alice })]
  );

  assert.deepEqual(rows.map(r => [r.label, r.kind, r.from, r.to]), [
    ["N09", "removed", "Alice Smith", "—"],
    ["S01", "added", "—", "Open seat"],
    ["S02", "added", "—", "Alice Smith"]
  ]);
  assert.equal(rows[0].detail, "Seat removed from the map");
  assert.equal(rows[1].detail, "West Pod");
});

test("diff rows: metadata-only change is one updated row with combined detail", () => {
  const alice = employee("emp-1", "Alice Smith");
  const rows = publishSummary.buildPublishDiffRows(
    [seat({ label: "W01", employee: alice, status: "reserved", notes: "hot desk" })],
    [seat({ label: "W01", layer: "published", employee: alice, status: "assigned" })]
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, "updated");
  assert.equal(rows[0].from, "Alice Smith");
  assert.equal(rows[0].to, "Alice Smith");
  assert.equal(rows[0].detail, "Status assigned -> reserved; Notes changed");
});

test("diff rows: occupant change wins over metadata, which rides along in detail", () => {
  const alice = employee("emp-1", "Alice Smith");
  const rows = publishSummary.buildPublishDiffRows(
    [seat({ label: "W01", employee: alice, zone: "East Pod" })],
    [seat({ label: "W01", layer: "published", zone: "West Pod" })]
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, "assigned");
  assert.equal(rows[0].detail, "Zone West Pod -> East Pod");
});

test("diff rows: position drift surfaces on an otherwise-unchanged seat", () => {
  const alice = employee("emp-1", "Alice Smith");
  const rows = publishSummary.buildPublishDiffRows(
    [seat({ label: "W01", employee: alice, x: 0.5, y: 0.5 })],
    [seat({ label: "W01", layer: "published", employee: alice, x: 0.1, y: 0.2 })]
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, "updated");
  assert.equal(rows[0].detail, "position 10%, 20% -> 50%, 50%");
});

test("diff rows: a seat restored to its baseline occupant drops out entirely", () => {
  const alice = employee("emp-1", "Alice Smith");
  const rows = publishSummary.buildPublishDiffRows(
    [seat({ label: "W01", employee: alice }), seat({ label: "W02" })],
    [seat({ label: "W01", layer: "published", employee: alice }), seat({ label: "W02", layer: "published" })]
  );

  assert.deepEqual(rows, []);
});

test("diff rows: sorted numeric-aware by label", () => {
  const rows = publishSummary.buildPublishDiffRows(
    [
      seat({ label: "W10", is_custom: true }),
      seat({ label: "W2", is_custom: true }),
      seat({ label: "N1", is_custom: true })
    ],
    []
  );

  assert.deepEqual(rows.map(r => r.label), ["N1", "W2", "W10"]);
});

test("diff rows: people-only changes yield no rows while the summary still reports changes", () => {
  const alice = employee("emp-1", "Alice Smith");
  const renamed = { ...employee("emp-1", "Alicia Smith"), position: "Senior Analyst" };
  const draftSeats = [seat({ label: "W01", employee: alice })];
  const publishedSeats = [seat({ label: "W01", layer: "published", employee: alice })];

  const rows = publishSummary.buildPublishDiffRows(draftSeats, publishedSeats);
  const summary = publishSummary.buildPublishChangeSummary(draftSeats, publishedSeats, {
    employees: [renamed],
    publishedEmployees: [alice]
  });

  assert.deepEqual(rows, []);
  assert.equal(summary.hasChanges, true);
});

test("seat detail falls back through department, employee id, status, and Open seat", () => {
  // These strings are what the publish review shows for added/removed seats —
  // each fallback is a distinct way the dialog describes a seat.
  const summary = publishSummary.buildPublishChangeSummary(
    [
      seat({ label: "A01", zone: null, department: "Operations" }),
      seat({ label: "A02", zone: null, employee_id: "emp-ghost" }),
      seat({ label: "A03", zone: null }),
      seat({ label: "A04", status: "reserved" })
    ],
    []
  );

  const detailByLabel = new Map(summary.addedSeats.map(item => [item.label, item.detail]));
  // zone is null → the zone slot falls back to the department name.
  assert.equal(detailByLabel.get("A01"), "Operations");
  // employee_id with no joined employee row still names the occupant.
  assert.equal(detailByLabel.get("A02"), "Employee emp-ghost");
  // Nothing to say → the explicit "Open seat" placeholder, never "".
  assert.equal(detailByLabel.get("A03"), "Open seat");
  // Non-available status is part of the seat's description.
  assert.equal(detailByLabel.get("A04"), "West Pod · reserved");
});

test("metadata diffs name zone, department, and custom-flag changes", () => {
  const summary = publishSummary.buildPublishChangeSummary(
    [
      seat({ label: "B01", zone: "North Pod" }),
      seat({ label: "B02", zone: "Same Pod", department: "New Dept" }),
      seat({ label: "B03", is_custom: true })
    ],
    [
      seat({ label: "B01", layer: "published", zone: "West Pod" }),
      seat({ label: "B02", layer: "published", zone: "Same Pod", department: "Old Dept" }),
      seat({ label: "B03", layer: "published", is_custom: false })
    ]
  );

  const detailByLabel = new Map(summary.otherChanges.map(item => [item.label, item.detail]));
  assert.equal(detailByLabel.get("B01"), "Zone West Pod -> North Pod");
  // Zone unchanged (zone wins the zone slot), so only the department diff fires.
  assert.equal(detailByLabel.get("B02"), "Department Old Dept -> New Dept");
  assert.equal(detailByLabel.get("B03"), "Custom flag no -> yes");
  assert.equal(summary.updatedSeatCount, 3);
});

test("employee detail diffs cover title, department, extension, and email", () => {
  const published = {
    ...employee("emp-1", "Pat Person"),
    position: "Clerk",
    department: "Ops",
    phone_extension: "101",
    email: "old@example.test"
  };
  const live = {
    ...employee("emp-1", "Pat Person"),
    position: "Senior Clerk",
    department: "Legal",
    phone_extension: "202",
    email: "new@example.test"
  };

  const summary = publishSummary.buildPublishChangeSummary([], [], {
    employees: [live],
    publishedEmployees: [published]
  });

  assert.equal(summary.employeeDetailChanges.length, 1);
  assert.equal(
    summary.employeeDetailChanges[0].detail,
    "Title Clerk -> Senior Clerk; Department Ops -> Legal; Ext. 101 -> 202; Email old@example.test -> new@example.test"
  );
  assert.equal(summary.hasChanges, true);
});

// Multi-floor PR-1 (2026-09-01): the client diff must count a floor change the
// way the SQL change_summary does (seat_detail_changes gained
// `d.floor is distinct from p.floor` in 20260901120100) — the Plan 005 parity
// rule, extended to the new column.
test("diff rows: a floor change is one updated row naming both floors", () => {
  const rows = publishSummary.buildPublishDiffRows(
    [seat({ label: "W01", floor: "2" })],
    [seat({ label: "W01", layer: "published", floor: "3" })]
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, "updated");
  assert.equal(rows[0].detail, "Floor 3 -> Floor 2");
});

test("publish summary counts a floor-only change as one updated seat", () => {
  const summary = publishSummary.buildPublishChangeSummary(
    [seat({ label: "W01", floor: "2" })],
    [seat({ label: "W01", layer: "published", floor: "3" })]
  );

  assert.equal(summary.updatedSeatCount, 1);
  assert.equal(summary.totalChangeCount, 1);
  assert.equal(summary.hasChanges, true);
});

test("diff rows: a seat without a floor value reads as Floor 3, so it never diffs against Floor 3", () => {
  const legacy = seat({ label: "W01", layer: "published" });
  delete legacy.floor;

  const rows = publishSummary.buildPublishDiffRows([seat({ label: "W01", floor: "3" })], [legacy]);
  assert.equal(rows.length, 0);
});
