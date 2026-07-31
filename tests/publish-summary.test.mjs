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
    zone: overrides.zone ?? "West Pod",
    department: overrides.department ?? null,
    notes: overrides.notes ?? null,
    is_custom: overrides.is_custom ?? false,
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
