import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";

async function importTsModule(path) {
  const source = await import("node:fs/promises").then(fs => fs.readFile(new URL(`../${path}`, import.meta.url), "utf8"));
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Bundler
    }
  });
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString("base64")}`;
  return import(moduleUrl);
}

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
  assert.deepEqual(summary.seatMoves.map(item => item.label), ["W03"]);
  assert.deepEqual(summary.statusChanges.map(item => item.label), ["W04"]);
  assert.deepEqual(summary.otherChanges.map(item => item.label), ["W05"]);
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
