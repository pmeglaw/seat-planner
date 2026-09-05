import assert from "node:assert/strict";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";
import test from "node:test";

// Phase 4 PR 3b (P3-14): the ◇ badge, the inspector's "Changed in draft" note
// and the legend's draft count read ONE set, derived from the publish diff.
const { draftChangedSeatLabels } = await importTsModule("lib/draftChanges.ts");
const { buildPublishChangeSummary } = await importTsModule("lib/publishSummary.ts");

const seat = (label, overrides = {}) => ({
  id: `id-${label}`, seat_key: label.toLowerCase(), label, x: 0.5, y: 0.5, status: "available", layer: "draft",
  employee_id: null, department: null, zone: "North Pod", notes: null, is_custom: false, created_at: "", updated_at: "", employee: null, ...overrides
});
const alice = { id: "emp-1", full_name: "Alice Smith", position: "Analyst", department: "Intake", phone_extension: null, email: null, avatar_url: null, active: true, created_at: "", updated_at: "" };

test("every seat the publish review lists as changed is badged; unchanged and removed seats are not", () => {
  const published = [seat("N01"), seat("N02", { status: "assigned", employee_id: "emp-1", employee: alice }), seat("N03"), seat("N04", { status: "reserved" }), seat("N05")];
  const draft = [
    seat("N01", { status: "assigned", employee_id: "emp-1", employee: alice }), // assigned
    seat("N02"),                                                               // vacated
    seat("N03", { x: 0.7 }),                                                   // moved (other)
    seat("N04", { status: "unavailable" }),                                    // status
    // N05 removed from the draft — not on the map, nothing to badge
    seat("S01", { is_custom: true })                                           // added
  ];
  const summary = buildPublishChangeSummary(draft, published, { employees: [alice], publishedEmployees: [alice] });
  const labels = draftChangedSeatLabels(summary);
  assert.deepEqual([...labels].sort(), ["N01", "N02", "N03", "N04", "S01"]);
  assert.ok(!labels.has("N05"), "a removed seat has no draft marker to badge");
});

test("an unchanged draft badges nothing; people-only edits badge no seat", () => {
  const published = [seat("N01", { status: "assigned", employee_id: "emp-1", employee: alice })];
  const same = buildPublishChangeSummary(published, published, { employees: [alice], publishedEmployees: [alice] });
  assert.equal(draftChangedSeatLabels(same).size, 0);
  const renamed = { ...alice, position: "Senior Analyst" };
  const peopleOnly = buildPublishChangeSummary(published, published, { employees: [renamed], publishedEmployees: [alice] });
  assert.equal(draftChangedSeatLabels(peopleOnly).size, 0, "employee-detail changes have no seat label");
  assert.ok(peopleOnly.hasChanges, "…but the review still lists them");
});
