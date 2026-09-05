import assert from "node:assert/strict";
import test from "node:test";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";

const counts = await importTsModule("lib/managementCounts.ts");

// PHASE2UX §1G.3 / DECISIONS D5-a: the summary tiles are gone; the Employees
// toolbar count carries the numbers, aria-live, zero included. At rest it is
// the whole directory; while filtering it is the match count.

test("at rest: total · assigned · unassigned", () => {
  assert.equal(counts.toolbarCount({ total: 68, assigned: 56, matching: 68, searching: false }), "68 employees · 56 assigned · 12 unassigned");
  assert.equal(counts.toolbarCount({ total: 1, assigned: 1, matching: 1, searching: false }), "1 employee · 1 assigned · 0 unassigned");
  assert.equal(counts.toolbarCount({ total: 0, assigned: 0, matching: 0, searching: false }), "0 employees · 0 assigned · 0 unassigned");
});

test("while filtering: matches of total, zero included", () => {
  assert.equal(counts.toolbarCount({ total: 68, assigned: 56, matching: 7, searching: true }), "7 of 68 match");
  assert.equal(counts.toolbarCount({ total: 68, assigned: 56, matching: 0, searching: true }), "0 of 68 match");
});

test("assignedCount: active employees holding a draft seat", () => {
  const employees = [{ id: "a", active: true }, { id: "b", active: true }, { id: "c", active: false }];
  const seats = [{ employee_id: "a" }, { employee_id: "c" }, { employee_id: null }];
  assert.equal(counts.assignedCount(employees, seats), 1, "inactive people and empty seats do not count");
});
