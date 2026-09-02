import assert from "node:assert/strict";
import test from "node:test";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";

const { findEmployeeByEmail, findSeatForEmployee, pickNeighbors, frameCluster, NEIGHBOR_COUNT } =
  await importTsModule("lib/mySeat.ts");

function employee(overrides = {}) {
  return {
    id: "emp-1",
    full_name: "Alex Petrosyan",
    position: "Case Manager",
    department: "Case Management",
    phone_extension: null,
    email: "alex@megeredchianlaw.com",
    avatar_url: null,
    active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides
  };
}

function seat(overrides = {}) {
  return {
    id: "seat-1",
    seat_key: "E06",
    label: "E06",
    x: 0.5,
    y: 0.5,
    status: "assigned",
    layer: "published",
    employee_id: "emp-1",
    zone: "East Pod",
    department: null,
    notes: null,
    is_custom: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    employee: employee(),
    ...overrides
  };
}

test("findEmployeeByEmail matches case-insensitively and trims", () => {
  const employees = [employee({ id: "a", email: "First@Example.com" }), employee({ id: "b", email: "second@example.com" })];
  assert.equal(findEmployeeByEmail(employees, "  first@example.COM ")?.id, "a");
  assert.equal(findEmployeeByEmail(employees, "second@example.com")?.id, "b");
});

test("findEmployeeByEmail returns null for missing email, no match, or null employee emails", () => {
  const employees = [employee({ id: "a", email: null })];
  assert.equal(findEmployeeByEmail(employees, null), null);
  assert.equal(findEmployeeByEmail(employees, undefined), null);
  assert.equal(findEmployeeByEmail(employees, ""), null);
  assert.equal(findEmployeeByEmail(employees, "nobody@example.com"), null);
});

test("findEmployeeByEmail never matches an empty employee email against an empty query", () => {
  const employees = [employee({ id: "a", email: "   " })];
  assert.equal(findEmployeeByEmail(employees, "   "), null);
});

test("findSeatForEmployee returns the employee's seat or null", () => {
  const seats = [seat({ id: "s1", employee_id: "emp-1" }), seat({ id: "s2", employee_id: "emp-2" })];
  assert.equal(findSeatForEmployee(seats, "emp-2")?.id, "s2");
  assert.equal(findSeatForEmployee(seats, "emp-9"), null);
});

test("pickNeighbors returns nearest assigned seats, same zone first", () => {
  const mine = seat({ id: "mine", x: 0.5, y: 0.5, zone: "East Pod" });
  const seats = [
    mine,
    // other zone but physically closest
    seat({ id: "other-close", x: 0.505, y: 0.5, zone: "West Pod", employee_id: "e2", employee: employee({ id: "e2" }) }),
    // same zone, farther
    seat({ id: "same-far", x: 0.6, y: 0.5, zone: "East Pod", employee_id: "e3", employee: employee({ id: "e3" }) }),
    seat({ id: "same-near", x: 0.52, y: 0.5, zone: "East Pod", employee_id: "e4", employee: employee({ id: "e4" }) })
  ];
  const picked = pickNeighbors(seats, mine, 3);
  assert.deepEqual(
    picked.map(s => s.id),
    ["same-near", "same-far", "other-close"]
  );
});

test("pickNeighbors skips unassigned seats, seats without employees, and my own seat", () => {
  const mine = seat({ id: "mine" });
  const seats = [
    mine,
    seat({ id: "empty", employee_id: null, employee: null, status: "available", x: 0.51, y: 0.5 }),
    seat({ id: "ghost", employee_id: "gone", employee: null, x: 0.52, y: 0.5 }),
    seat({ id: "real", employee_id: "e2", employee: employee({ id: "e2" }), x: 0.53, y: 0.5 })
  ];
  assert.deepEqual(
    pickNeighbors(seats, mine).map(s => s.id),
    ["real"]
  );
});

test("pickNeighbors caps at the requested count with a deterministic label tie-break", () => {
  const mine = seat({ id: "mine", x: 0.5, y: 0.5 });
  const ring = ["B", "A", "D", "C", "E"].map((label, i) =>
    seat({
      id: `n-${label}`,
      label,
      // all equidistant
      x: 0.5 + (i % 2 === 0 ? 0.01 : -0.01),
      y: 0.5,
      employee_id: `e-${label}`,
      employee: employee({ id: `e-${label}` })
    })
  );
  const picked = pickNeighbors([mine, ...ring], mine);
  assert.equal(picked.length, NEIGHBOR_COUNT);
  assert.deepEqual(
    picked.map(s => s.label),
    ["A", "B", "C", "D"]
  );
});

test("pickNeighbors distance is aspect-corrected: horizontal spans outweigh equal normalized vertical spans", () => {
  // On a wide floor plan, dx 0.05 is physically farther than dy 0.05.
  const mine = seat({ id: "mine", x: 0.5, y: 0.5, zone: "East Pod" });
  const seats = [
    mine,
    seat({ id: "horizontal", x: 0.55, y: 0.5, zone: "East Pod", employee_id: "e2", employee: employee({ id: "e2" }) }),
    seat({ id: "vertical", x: 0.5, y: 0.55, zone: "East Pod", employee_id: "e3", employee: employee({ id: "e3" }) })
  ];
  assert.deepEqual(
    pickNeighbors(seats, mine, 2).map(s => s.id),
    ["vertical", "horizontal"]
  );
});

test("frameCluster returns a padded bounding box over the points", () => {
  const frame = frameCluster([
    { x: 0.2, y: 0.4 },
    { x: 0.6, y: 0.5 }
  ]);
  assert.ok(frame.minX < 0.2);
  assert.ok(frame.minY < 0.4);
  assert.ok(frame.minX + frame.width > 0.6);
  assert.ok(frame.minY + frame.height > 0.5);
});

test("frameCluster never collapses: a single point still yields a usable box", () => {
  const frame = frameCluster([{ x: 0.5, y: 0.5 }]);
  assert.ok(frame.width > 0);
  assert.ok(frame.height > 0);
  assert.ok(frame.minX < 0.5 && frame.minX + frame.width > 0.5);
  assert.ok(frame.minY < 0.5 && frame.minY + frame.height > 0.5);
});

test("frameCluster clamps to the unit square", () => {
  const frame = frameCluster([
    { x: 0.01, y: 0.02 },
    { x: 0.99, y: 0.98 }
  ]);
  assert.ok(frame.minX >= 0);
  assert.ok(frame.minY >= 0);
  assert.ok(frame.minX + frame.width <= 1);
  assert.ok(frame.minY + frame.height <= 1);
});

test("pickNeighbors never crosses floors, even when the other floor's seat is physically closest", () => {
  const mine = seat({ id: "mine", x: 0.5, y: 0.5, zone: "East Pod", floor: "3" });
  const seats = [
    mine,
    seat({ id: "downstairs", x: 0.501, y: 0.5, zone: "East Pod", floor: "2", employee_id: "e2", employee: employee({ id: "e2" }) }),
    seat({ id: "upstairs-far", x: 0.6, y: 0.5, zone: "East Pod", employee_id: "e3", employee: employee({ id: "e3" }) })
  ];
  assert.deepEqual(pickNeighbors(seats, mine).map(s => s.id), ["upstairs-far"]);
});
