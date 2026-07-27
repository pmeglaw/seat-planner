import assert from "node:assert/strict";
import test from "node:test";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";

const {
  FILTER_ALL,
  seatZoneValue,
  seatSearchHaystack,
  seatMatchesFilters,
  activeStructuredFilters,
  structuredFilterCount,
  hasStructuredFilters,
  hasActiveConstraints,
  clearedStructuredFilters,
  clearedFilters
} = await importTsModule("lib/seatFilters.ts");

function criteria(overrides = {}) {
  return { search: "", department: FILTER_ALL, position: FILTER_ALL, zone: FILTER_ALL, status: FILTER_ALL, ...overrides };
}

function seat(overrides = {}) {
  return {
    id: "s1",
    label: "N01",
    status: "assigned",
    zone: "North Pod",
    department: null,
    employee: {
      full_name: "Alice Smith",
      position: "Analyst",
      department: "Intake",
      phone_extension: "123"
    },
    ...overrides
  };
}

test("seatZoneValue falls back to department for seats predating zones", () => {
  assert.equal(seatZoneValue(seat()), "North Pod");
  assert.equal(seatZoneValue(seat({ zone: null, department: "Legacy Pod" })), "Legacy Pod");
  assert.equal(seatZoneValue(seat({ zone: null, department: null })), "");
});

test("seatSearchHaystack covers the seat and its occupant, lowercased", () => {
  const haystack = seatSearchHaystack(seat());
  for (const term of ["n01", "assigned", "north pod", "alice smith", "analyst", "intake", "123"]) {
    assert.ok(haystack.includes(term), `haystack should contain ${term}`);
  }
});

test("seatSearchHaystack drops empty fields so they cannot fuse unrelated values", () => {
  // With a blank position, "alice smith" and "intake" must not become adjacent
  // through a doubled separator and produce a phantom substring.
  const haystack = seatSearchHaystack(seat({ employee: { full_name: "Alice Smith", position: null, department: "Intake", phone_extension: null } }));
  assert.equal(haystack.includes("  "), false, "no doubled separators");
  assert.ok(haystack.includes("alice smith intake"));
});

test("an unfiltered criteria matches every seat", () => {
  assert.equal(seatMatchesFilters(seat(), criteria()), true);
  assert.equal(seatMatchesFilters(seat({ employee: null }), criteria()), true);
});

test("search matches the occupant's name case-insensitively and ignores surrounding space", () => {
  assert.equal(seatMatchesFilters(seat(), criteria({ search: "ALICE" })), true);
  assert.equal(seatMatchesFilters(seat(), criteria({ search: "  alice  " })), true);
  assert.equal(seatMatchesFilters(seat(), criteria({ search: "bob" })), false);
});

test("department is compared through departmentKey, not raw text", () => {
  // Casing/spacing drift between the stored value and the option list must not
  // hide a seat — that is the whole reason departmentKey exists.
  assert.equal(seatMatchesFilters(seat(), criteria({ department: "intake" })), true);
  assert.equal(seatMatchesFilters(seat(), criteria({ department: "  Intake " })), true);
  assert.equal(seatMatchesFilters(seat(), criteria({ department: "Finance" })), false);
});

test("zone filtering uses the department fallback", () => {
  const legacy = seat({ zone: null, department: "Legacy Pod" });
  assert.equal(seatMatchesFilters(legacy, criteria({ zone: "Legacy Pod" })), true);
  assert.equal(seatMatchesFilters(legacy, criteria({ zone: "North Pod" })), false);
});

test("status filtering is exact", () => {
  assert.equal(seatMatchesFilters(seat(), criteria({ status: "assigned" })), true);
  assert.equal(seatMatchesFilters(seat(), criteria({ status: "available" })), false);
});

test("filters are ANDed, so one failing term rejects the seat", () => {
  const matchesBoth = criteria({ search: "alice", status: "assigned" });
  const searchHitStatusMiss = criteria({ search: "alice", status: "available" });

  assert.equal(seatMatchesFilters(seat(), matchesBoth), true);
  assert.equal(seatMatchesFilters(seat(), searchHitStatusMiss), false);
});

test("a seat with no occupant fails occupant-scoped filters instead of throwing", () => {
  const empty = seat({ status: "available", employee: null });
  assert.equal(seatMatchesFilters(empty, criteria({ department: "Intake" })), false);
  assert.equal(seatMatchesFilters(empty, criteria({ search: "alice" })), false);
  assert.equal(seatMatchesFilters(empty, criteria({ status: "available" })), true);
});

test("activeStructuredFilters reports which filters constrain, in UI order", () => {
  assert.deepEqual(activeStructuredFilters(criteria()), []);
  assert.deepEqual(activeStructuredFilters(criteria({ zone: "North Pod", department: "Intake" })), ["department", "zone"]);
  assert.equal(structuredFilterCount(criteria({ zone: "North Pod", status: "assigned" })), 2);
  assert.equal(hasStructuredFilters(criteria()), false);
  assert.equal(hasStructuredFilters(criteria({ position: "Analyst" })), true);
});

test("search alone counts as a constraint but not as a structured filter", () => {
  const searchOnly = criteria({ search: "alice" });
  assert.equal(hasActiveConstraints(searchOnly), true);
  assert.equal(hasStructuredFilters(searchOnly), false);
  assert.equal(structuredFilterCount(searchOnly), 0);
  // Whitespace is not a constraint.
  assert.equal(hasActiveConstraints(criteria({ search: "   " })), false);
});

test("hasActiveConstraints agrees with the inline derivations it replaced", () => {
  // The legend spelled out five comparisons; the result list counted chips.
  // They agreed only by coincidence — this pins that they cannot diverge.
  const values = [FILTER_ALL, "something"];
  for (const search of ["", "alice"]) {
    for (const department of values) {
      for (const position of values) {
        for (const zone of values) {
          for (const status of values) {
            const current = { search, department, position, zone, status };
            const legendStyle =
              search.trim() !== "" ||
              department !== FILTER_ALL ||
              position !== FILTER_ALL ||
              zone !== FILTER_ALL ||
              status !== FILTER_ALL;
            const chipStyle =
              (search.trim() !== "" ? 1 : 0) +
                [department, position, zone, status].filter(value => value !== FILTER_ALL).length >
              0;

            assert.equal(hasActiveConstraints(current), legendStyle, JSON.stringify(current));
            assert.equal(hasActiveConstraints(current), chipStyle, JSON.stringify(current));
          }
        }
      }
    }
  }
});

test("clearing returns new criteria and never mutates the input", () => {
  const current = criteria({ search: "alice", department: "Intake", zone: "North Pod" });
  const snapshot = { ...current };

  const structuredCleared = clearedStructuredFilters(current);
  assert.equal(structuredCleared.search, "alice", "clearing structured filters keeps the search");
  assert.equal(hasStructuredFilters(structuredCleared), false);

  const allCleared = clearedFilters(current);
  assert.equal(allCleared.search, "");
  assert.equal(hasActiveConstraints(allCleared), false);

  assert.deepEqual(current, snapshot, "input criteria must not be mutated");
});
