import assert from "node:assert/strict";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";
import test from "node:test";

// E1 regression coverage: the management Departments tab and Employees tab must
// derive department counts from ONE case-insensitive source so "Accounting — 0
// employees" while an Accounting employee exists is structurally impossible.
const { buildDepartmentRoster, departmentKey, normalizeDepartmentName } = await importTsModule("lib/departments.ts");

function employee(overrides = {}) {
  return {
    id: overrides.id ?? `emp-${Math.random().toString(36).slice(2, 8)}`,
    full_name: overrides.full_name ?? "Test Person",
    position: overrides.position ?? null,
    department: overrides.department ?? null,
    phone_extension: null,
    avatar_url: null,
    active: overrides.active ?? true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z"
  };
}

function option(name, overrides = {}) {
  return {
    id: overrides.id ?? `opt-${name.toLowerCase()}`,
    name,
    active: overrides.active ?? true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z"
  };
}

test("normalizeDepartmentName trims, collapses whitespace, and nulls empties", () => {
  assert.equal(normalizeDepartmentName("  Case   Management  "), "Case Management");
  assert.equal(normalizeDepartmentName("Accounting"), "Accounting");
  assert.equal(normalizeDepartmentName("   "), null);
  assert.equal(normalizeDepartmentName(null), null);
  assert.equal(normalizeDepartmentName(undefined), null);
});

test("departmentKey is case-insensitive and whitespace-safe", () => {
  assert.equal(departmentKey("Accounting"), departmentKey(" accounting "));
  assert.equal(departmentKey("Case  Management"), departmentKey("case management"));
  assert.equal(departmentKey(""), null);
});

test("roster counts case/whitespace variants under the managed option's spelling (the E1 symptom)", () => {
  const roster = buildDepartmentRoster(
    [
      employee({ department: "Accounting" }),
      employee({ department: "accounting " }),
      employee({ department: " ACCOUNTING" })
    ],
    [option("Accounting")]
  );

  assert.equal(roster.length, 1);
  assert.equal(roster[0].name, "Accounting");
  assert.equal(roster[0].managed, true);
  assert.equal(roster[0].employeeCount, 3);
});

test("orphan employee departments surface as unmanaged rows instead of disappearing", () => {
  const roster = buildDepartmentRoster(
    [
      employee({ department: "Social Media" }),
      employee({ department: "HR" }),
      employee({ department: "IT" })
    ],
    [option("IT")]
  );

  const socialMedia = roster.find(row => row.name === "Social Media");
  const hr = roster.find(row => row.name === "HR");
  const it = roster.find(row => row.name === "IT");

  assert.ok(socialMedia, "orphan department must appear in the roster");
  assert.equal(socialMedia.managed, false);
  assert.equal(socialMedia.employeeCount, 1);
  assert.ok(hr);
  assert.equal(hr.managed, false);
  assert.equal(it.managed, true);
  assert.equal(it.employeeCount, 1);
});

test("managed options with zero employees still appear with an honest zero", () => {
  const roster = buildDepartmentRoster([employee({ department: null })], [option("Litigation")]);
  assert.equal(roster.length, 1);
  assert.equal(roster[0].name, "Litigation");
  assert.equal(roster[0].managed, true);
  assert.equal(roster[0].employeeCount, 0);
});

test("inactive employees and inactive options are excluded", () => {
  const roster = buildDepartmentRoster(
    [
      employee({ department: "Records", active: false }),
      employee({ department: "Intake" })
    ],
    [option("Records", { active: false }), option("Intake")]
  );

  assert.equal(roster.length, 1);
  assert.equal(roster[0].name, "Intake");
  assert.equal(roster[0].employeeCount, 1);
});

test("roster is sorted case-insensitively by display name", () => {
  const roster = buildDepartmentRoster(
    [employee({ department: "records" }), employee({ department: "Accounting" })],
    [option("Intake")]
  );
  assert.deepEqual(roster.map(row => row.name), ["Accounting", "Intake", "records"]);
});
