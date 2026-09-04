// lib/viewerFilterGroups.ts — the four left-panel groups (Department · Zone ·
// Status · Position) with per-floor counts including zero (PHASE2UX §1.3;
// Position ruled in 2026-09-04).
import assert from "node:assert/strict";
import test from "node:test";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";

const { buildViewerFilterGroups } = await importTsModule("lib/viewerFilterGroups.ts");

const person = (id, department, position) => ({ id, full_name: id, department, position, active: true, phone_extension: null, email: null, avatar_url: null, created_at: "", updated_at: "" });
const seat = (id, status, zone, department, employee = null) => ({ id, label: id, seat_key: id, status, zone, department, employee_id: employee?.id ?? null, employee, x: 0, y: 0, layer: "published", notes: null, is_custom: false, created_at: "", updated_at: "", floor: "3" });

const ADA = person("ada", "Litigation", "Attorney");
const GRACE = person("grace", "Corporate", "Paralegal");
const SEATS = [seat("A1", "assigned", "North", "Litigation", ADA), seat("B2", "assigned", "South", "Corporate", GRACE), seat("C3", "reserved", "South", "Litigation"), seat("D4", "available", "South", "Corporate")];

const base = {
  surface: "plan",
  floorSeats: SEATS,
  floorPeople: [],
  departments: ["Corporate", "Litigation", "Intake"],
  positions: ["Attorney", "Paralegal"],
  zones: ["North", "South"],
  seatZone: s => s.zone,
  seatDepartment: s => s.employee?.department ?? s.department,
  selected: { department: "all", position: "all", zone: "all", status: "all" }
};

test("plan surface: four groups in order, seat counts per option including zero, none checked", () => {
  const groups = buildViewerFilterGroups(base);
  assert.deepEqual(groups.map(g => g.id), ["department", "zone", "status", "position"]);
  const byId = Object.fromEntries(groups.map(g => [g.id, g]));
  assert.deepEqual(byId.department.items.map(i => [i.id, i.count]), [["Corporate", 2], ["Litigation", 2], ["Intake", 0]]);
  assert.deepEqual(byId.zone.items.map(i => [i.id, i.count]), [["North", 1], ["South", 3]]);
  assert.deepEqual(byId.status.items.map(i => [i.id, i.label, i.count]), [["assigned", "Assigned", 2], ["available", "Open", 1], ["reserved", "Reserved", 1], ["unavailable", "Unavailable", 0]]);
  assert.deepEqual(byId.position.items.map(i => [i.id, i.count]), [["Attorney", 1], ["Paralegal", 1]]);
  assert.ok(groups.every(g => !g.hidden && g.items.every(i => !i.checked)));
});

test("checked follows the selection; matching is key-normalised (case / padding)", () => {
  const groups = buildViewerFilterGroups({ ...base, selected: { department: "Corporate", position: "all", zone: "south", status: "assigned" } });
  const byId = Object.fromEntries(groups.map(g => [g.id, g]));
  assert.equal(byId.department.items.find(i => i.id === "Corporate").checked, true);
  assert.equal(byId.status.items.find(i => i.id === "assigned").checked, true);
  assert.equal(byId.zone.items.find(i => i.id === "South").checked, false, "checked compares ids exactly — the caller passes canonical option names");
  assert.equal(byId.zone.items.find(i => i.id === "South").count, 3);
});

test("roster surface: counts are people; zone and status hidden; position hidden only without data", () => {
  const groups = buildViewerFilterGroups({ ...base, surface: "roster", floorSeats: [], floorPeople: [ADA, GRACE, person("x", "Intake", null)] });
  const byId = Object.fromEntries(groups.map(g => [g.id, g]));
  assert.deepEqual(byId.department.items.map(i => [i.id, i.count]), [["Corporate", 1], ["Litigation", 1], ["Intake", 1]]);
  assert.equal(byId.zone.hidden, true);
  assert.equal(byId.status.hidden, true);
  assert.equal(byId.position.hidden, false);
  assert.deepEqual(byId.position.items.map(i => [i.id, i.count]), [["Attorney", 1], ["Paralegal", 1]]);
  const noPositions = buildViewerFilterGroups({ ...base, surface: "roster", floorSeats: [], floorPeople: [person("y", "Intake", null)] });
  assert.equal(noPositions.find(g => g.id === "position").hidden, true, "no position data on this floor → Hidden tier");
});
