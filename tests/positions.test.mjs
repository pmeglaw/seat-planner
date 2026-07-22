import assert from "node:assert/strict";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";
import test from "node:test";

// The Position facet (cluster-employees-by-position) derives its option list on
// one surface and its match predicate on another, twice over (admin live set +
// viewer published snapshot). These tests pin that all four agree, so a facet
// can never offer an option that matches nothing.
const { buildPositionOptions, normalizePositionName, positionKey, seatMatchesPosition } =
  await importTsModule("lib/positions.ts");

function employee(overrides = {}) {
  return {
    id: overrides.id ?? `emp-${Math.random().toString(36).slice(2, 8)}`,
    full_name: overrides.full_name ?? "Test Person",
    position: overrides.position ?? null,
    department: overrides.department ?? null,
    phone_extension: null,
    email: null,
    avatar_url: null,
    active: overrides.active ?? true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z"
  };
}

test("normalizePositionName trims, collapses whitespace, and nulls empties", () => {
  assert.equal(normalizePositionName("  Case   Manager  "), "Case Manager");
  assert.equal(normalizePositionName("Paralegal"), "Paralegal");
  assert.equal(normalizePositionName("   "), null);
  assert.equal(normalizePositionName(null), null);
  assert.equal(normalizePositionName(undefined), null);
});

test("positionKey is case-insensitive and whitespace-safe", () => {
  assert.equal(positionKey("Case Manager"), positionKey(" case  manager "));
  assert.equal(positionKey("PARALEGAL"), positionKey("paralegal"));
  assert.equal(positionKey(""), null);
  assert.equal(positionKey(null), null);
});

test("buildPositionOptions lists each active position once, first spelling wins, sorted", () => {
  const options = buildPositionOptions([
    employee({ position: "Paralegal" }),
    employee({ position: "Case Manager" }),
    employee({ position: "case manager" }),
    employee({ position: "Assistant Case Manager" })
  ]);

  assert.deepEqual(options, ["Assistant Case Manager", "Case Manager", "Paralegal"]);
});

test("buildPositionOptions skips inactive employees and blank positions", () => {
  const options = buildPositionOptions([
    employee({ position: "Paralegal" }),
    employee({ position: "Intake Supervisor", active: false }),
    employee({ position: "   " }),
    employee({ position: null })
  ]);

  assert.deepEqual(options, ["Paralegal"]);
});

test("buildPositionOptions is empty when nobody carries a position", () => {
  assert.deepEqual(buildPositionOptions([]), []);
  assert.deepEqual(buildPositionOptions([employee({ position: null }), employee({ position: "" })]), []);
});

test('seatMatchesPosition treats "all" as no filter, including for empty seats', () => {
  assert.equal(seatMatchesPosition("Case Manager", "all"), true);
  assert.equal(seatMatchesPosition(null, "all"), true);
  assert.equal(seatMatchesPosition(undefined, "all"), true);
});

test("seatMatchesPosition compares case- and whitespace-insensitively", () => {
  assert.equal(seatMatchesPosition("Case Manager", "case  manager"), true);
  assert.equal(seatMatchesPosition("  case manager ", "Case Manager"), true);
  assert.equal(seatMatchesPosition("Paralegal", "Case Manager"), false);
});

test("an unoccupied seat never matches a real position selection", () => {
  assert.equal(seatMatchesPosition(null, "Case Manager"), false);
  assert.equal(seatMatchesPosition("", "Case Manager"), false);
  assert.equal(seatMatchesPosition("   ", "Case Manager"), false);
});

test("a blank selection is treated as no filter, not as a position nobody holds", () => {
  // Defensive: a facet value should only ever be "all" or a real option, but a
  // blank slipping through must not hide the whole map.
  assert.equal(seatMatchesPosition("Case Manager", "   "), true);
  assert.equal(seatMatchesPosition(null, ""), true);
});

test("every built option matches the employee it came from", () => {
  // The invariant that makes the facet trustworthy: no option can be offered
  // that matches nothing.
  const roster = [
    employee({ position: " Case  Manager " }),
    employee({ position: "paralegal" }),
    employee({ position: "Intake Supervisor" })
  ];

  for (const option of buildPositionOptions(roster)) {
    assert.ok(
      roster.some(person => seatMatchesPosition(person.position, option)),
      `option ${option} should match at least one employee`
    );
  }
});
