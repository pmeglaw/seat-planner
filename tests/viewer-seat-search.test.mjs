import assert from "node:assert/strict";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";
import test from "node:test";
const viewerSearch = await importTsModule("lib/viewerSeatSearch.ts");

function employee(overrides) {
  return {
    id: overrides.id,
    full_name: overrides.full_name,
    position: overrides.position ?? null,
    department: overrides.department ?? null,
    phone_extension: overrides.phone_extension ?? null,
    avatar_url: null,
    active: overrides.active ?? true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z"
  };
}

function seat(overrides) {
  return {
    id: overrides.id,
    seat_key: overrides.seat_key ?? overrides.label,
    label: overrides.label,
    x: overrides.x ?? 0.1,
    y: overrides.y ?? 0.2,
    status: overrides.status ?? (overrides.employee ? "assigned" : "available"),
    layer: "published",
    employee_id: overrides.employee?.id ?? overrides.employee_id ?? null,
    employee: overrides.employee ?? null,
    zone: overrides.zone ?? "West Pod",
    department: overrides.department ?? null,
    notes: null,
    is_custom: overrides.is_custom ?? false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z"
  };
}

const alex = employee({ id: "emp-alex", full_name: "Alex Rivera", position: "Litigation Associate", department: "Litigation" });
const jordan = employee({ id: "emp-jordan", full_name: "Jordan Brooks", position: "Paralegal", department: "Litigation" });
const maya = employee({ id: "emp-maya", full_name: "Maya Chen", position: "Intake Coordinator", department: "Intake" });
const seats = [
  seat({ id: "seat-w02", label: "W02", employee: alex, zone: "West Pod" }),
  seat({ id: "seat-c02", label: "C02", employee: maya, zone: "Center Desks" }),
  seat({ id: "seat-n02", label: "N02", status: "available", zone: "North Pod" })
];
const employees = [alex, jordan, maya];
const departmentOptions = [{ id: "dep-lit", name: "Litigation", active: true }];
const zoneOptions = [{ id: "zone-west", name: "West Pod", active: true }];

test("viewer search returns people with their published seat when assigned", () => {
  const result = viewerSearch.buildViewerSeatSearch({ query: "Alex", seats, employees, departmentOptions, zoneOptions });
  const person = result.results.find(item => item.kind === "person" && item.title === "Alex Rivera");

  assert.ok(person);
  assert.equal(person.seatId, "seat-w02");
  assert.deepEqual(person.seatIds, ["seat-w02"]);
  assert.equal(person.floor, "3");
  assert.equal("disabled" in person, false, "rows no longer carry a disabled flag");
  assert.ok(result.resultSeatIds.includes("seat-w02"));
});

// Contract #9 amended 2026-09-01 (multi-floor): an unseated person is listed,
// honest and OPENABLE — they work on the floor that is not live yet.
test("viewer search places unassigned people on the unmapped floor without a map target", () => {
  const result = viewerSearch.buildViewerSeatSearch({ query: "Jordan", seats, employees, departmentOptions, zoneOptions });
  const person = result.results.find(item => item.kind === "person");

  assert.ok(person);
  assert.equal(person.title, "Jordan Brooks");
  assert.equal(person.seatId, null);
  assert.deepEqual(person.seatIds, []);
  assert.equal(person.floor, "2");
  assert.equal(person.employeeId, "emp-jordan");
  assert.equal(person.subtitle, "Floor 2 · Litigation");
});

test("viewer search distinguishes seat label results", () => {
  const result = viewerSearch.buildViewerSeatSearch({ query: "N02", seats, employees, departmentOptions, zoneOptions });
  const seatResult = result.results.find(item => item.kind === "seat" && item.title === "N02");

  assert.ok(seatResult);
  assert.equal(seatResult.seatId, "seat-n02");
  assert.equal(seatResult.status, "available");
  assert.match(seatResult.meta, /Open/);
});

test("viewer search supports department and zone queries from existing viewer data", () => {
  const departmentResult = viewerSearch.buildViewerSeatSearch({ query: "Litigation", seats, employees, departmentOptions, zoneOptions })
    .results.find(item => item.kind === "department");
  const zoneResult = viewerSearch.buildViewerSeatSearch({ query: "West", seats, employees, departmentOptions, zoneOptions })
    .results.find(item => item.kind === "zone");

  assert.ok(departmentResult);
  assert.equal(departmentResult.title, "Litigation");
  assert.deepEqual(departmentResult.seatIds, ["seat-w02"]);
  assert.match(departmentResult.meta, /2 people/);

  assert.ok(zoneResult);
  assert.equal(zoneResult.title, "West Pod");
  assert.deepEqual(zoneResult.seatIds, ["seat-w02"]);
  assert.match(zoneResult.meta, /1 seat/);
});

test("viewer department aggregates align with tagged person and seat results", () => {
  const accountingEmployee = employee({
    id: "emp-accounting",
    full_name: "Alex Shabaz",
    position: null,
    department: "Accounting"
  });
  const accountingSeat = seat({
    id: "seat-w11",
    label: "W11",
    employee_id: accountingEmployee.id,
    employee: null,
    status: "assigned",
    zone: "West Pod",
    department: null
  });
  const result = viewerSearch.buildViewerSeatSearch({
    query: "Accounting",
    seats: [accountingSeat],
    employees: [accountingEmployee],
    departmentOptions: [{ id: "dep-accounting", name: "Accounting", active: true }],
    zoneOptions: []
  });
  const personResult = result.results.find(item => item.kind === "person");
  const seatResult = result.results.find(item => item.kind === "seat");
  const departmentResult = result.results.find(item => item.kind === "department");

  assert.ok(personResult);
  assert.equal(personResult.title, "Alex Shabaz");
  assert.equal(personResult.seatId, "seat-w11");
  assert.ok(seatResult);
  assert.equal(seatResult.title, "W11");
  assert.match(seatResult.meta, /Accounting/);
  assert.ok(departmentResult);
  assert.equal(departmentResult.title, "Accounting");
  assert.equal(departmentResult.meta, "1 person · 1 seat");
  assert.doesNotMatch(departmentResult.meta, /0 people · 0 seats/);
});

test("viewer department search suppresses empty option-only aggregate rows", () => {
  const result = viewerSearch.buildViewerSeatSearch({
    query: "Accounting",
    seats: [],
    employees: [],
    departmentOptions: [{ id: "dep-accounting", name: "Accounting", active: true }],
    zoneOptions: []
  });

  assert.equal(result.results.find(item => item.kind === "department"), undefined);
});

// Review 2026-09-10, C3: the palette reads a seat's department through
// lib/departments (seatDepartmentValue / departmentKey) — the same rule as
// the left-panel chip (buildViewerFilterGroups) and the filter predicate —
// so spellings that differ only by case or inner whitespace fold into ONE
// department row whose seat count IS the chip's count, and a seat row's meta
// shows the normalized name. Before, the palette trimmed but kept inner
// whitespace runs, so "Case  Management" was a second department here while
// the chip counted it under "Case Management".
test("viewer department rows fold case and whitespace variants and agree with the chip count", async () => {
  const { buildViewerFilterGroups } = await importTsModule("lib/viewerFilterGroups.ts");
  const canonical = employee({ id: "emp-cm-1", full_name: "Ana Lima", department: "Case Management" });
  const doubleSpaced = employee({ id: "emp-cm-2", full_name: "Ben Ode", department: "Case  Management" });
  const shouting = employee({ id: "emp-cm-3", full_name: "Cy Park", department: "  CASE MANAGEMENT " });
  const caseSeats = [
    seat({ id: "seat-cm-1", label: "C01", employee: canonical, zone: "Center" }),
    seat({ id: "seat-cm-2", label: "C02", employee: doubleSpaced, zone: "Center" }),
    seat({ id: "seat-cm-3", label: "C03", employee: shouting, zone: "Center" }),
    seat({ id: "seat-cm-4", label: "C04", status: "available", zone: "Center" })
  ];
  const result = viewerSearch.buildViewerSeatSearch({
    query: "case management",
    seats: caseSeats,
    employees: [canonical, doubleSpaced, shouting],
    departmentOptions: [{ id: "dep-cm", name: "Case Management", active: true }],
    zoneOptions: []
  });

  const departmentRows = result.results.filter(item => item.kind === "department");
  assert.equal(departmentRows.length, 1, "one row, not one per spelling");
  assert.equal(departmentRows[0].title, "Case Management", "the managed option's spelling wins");
  assert.equal(departmentRows[0].meta, "3 people · 3 seats");
  assert.deepEqual(departmentRows[0].seatIds, ["seat-cm-1", "seat-cm-2", "seat-cm-3"]);

  const [chip] = buildViewerFilterGroups({
    surface: "plan",
    floorSeats: caseSeats,
    floorPeople: [],
    departments: ["Case Management"],
    positions: [],
    zones: [],
    seatZone: item => item.zone ?? "",
    selected: { department: "all", position: "all", zone: "all", status: "all" }
  }).find(group => group.id === "department").items;
  assert.equal(chip.count, departmentRows[0].seatIds.length, "the palette's seat count IS the chip's count");

  // Seat-row meta shows the occupant's department through the same rule:
  // trimmed and whitespace-collapsed, case kept (the rule folds case for
  // comparison, not display — only the row title takes the option's spelling).
  const seatRow = result.results.find(item => item.id === "seat:seat-cm-3");
  assert.ok(seatRow, "the shouting spelling still matches the seat row");
  assert.equal(seatRow.meta, "Assigned · CASE MANAGEMENT · Center", "leading/trailing whitespace trimmed");
  const bySeatLabel = viewerSearch.buildViewerSeatSearch({
    query: "c02",
    seats: caseSeats,
    employees: [canonical, doubleSpaced, shouting],
    departmentOptions: [{ id: "dep-cm", name: "Case Management", active: true }],
    zoneOptions: []
  });
  const doubleSpacedRow = bySeatLabel.results.find(item => item.id === "seat:seat-cm-2");
  assert.equal(doubleSpacedRow.meta, "Assigned · Case Management · Center", "inner whitespace run collapsed");
});

test("viewer search formats a person's assigned seat label canonically in the subtitle", () => {
  const casey = employee({ id: "emp-casey", full_name: "Casey Park", department: "Litigation" });
  const caseySeat = seat({ id: "seat-cw01", label: "Cw01", employee: casey, zone: "Center West" });
  const result = viewerSearch.buildViewerSeatSearch({
    query: "Casey",
    seats: [caseySeat],
    employees: [casey],
    departmentOptions,
    zoneOptions
  });
  const person = result.results.find(item => item.kind === "person");

  assert.ok(person);
  assert.match(person.subtitle, /^CW01 · /);
});

test("viewer search formats a seat's assigned employee name canonically in the subtitle", () => {
  const pam = employee({ id: "emp-pam", full_name: "PAM", department: "Intake" });
  const pamSeat = seat({ id: "seat-w09", label: "W09", employee: pam, zone: "West Pod" });
  const result = viewerSearch.buildViewerSeatSearch({
    query: "W09",
    seats: [pamSeat],
    employees: [pam],
    departmentOptions,
    zoneOptions
  });
  const seatResult = result.results.find(item => item.kind === "seat");

  assert.ok(seatResult);
  assert.equal(seatResult.subtitle, "Pam");
});

test("viewer search matching stays case-insensitive on raw stored seat labels", () => {
  const dee = employee({ id: "emp-dee", full_name: "Dee Osei", department: "Litigation" });
  const deeSeat = seat({ id: "seat-cw01-b", label: "Cw01", employee: dee, zone: "Center West" });
  const result = viewerSearch.buildViewerSeatSearch({
    query: "cw01",
    seats: [deeSeat],
    employees: [dee],
    departmentOptions,
    zoneOptions
  });
  const seatResult = result.results.find(item => item.kind === "seat");

  assert.ok(seatResult);
  assert.equal(seatResult.seatId, "seat-cw01-b");
});

test("empty viewer search does not fabricate default results", () => {
  const result = viewerSearch.buildViewerSeatSearch({ query: "   ", seats, employees, departmentOptions, zoneOptions });

  assert.deepEqual(result.results, []);
  assert.deepEqual(result.resultSeatIds, []);
  assert.equal(result.query, "");
});

test("INV-1: an active search keystroke hands the panel slot to results", () => {
  const handsOver = viewerSearch.searchHandsPanelToResults;

  // Typing a query while a seat is selected: results surface over the
  // inspector (selection retained; expand to return).
  assert.equal(handsOver("p", true, false), true);
  assert.equal(handsOver("pam", true, false), true);

  // No selection: the results panel already owns the slot; nothing to collapse.
  assert.equal(handsOver("p", false, false), false);

  // Unsaved inspector edits stay put — no collapse until save/discard.
  assert.equal(handsOver("p", true, true), false);

  // Clearing or whitespace-only input is not an active search.
  assert.equal(handsOver("", true, false), false);
  assert.equal(handsOver("   ", true, false), false);
});

test("viewer search: seat rows carry their floor; department and zone rows carry a floor only when every seat agrees", () => {
  const mixed = [
    seat({ id: "seat-w02", label: "W02", employee: alex, zone: "West Pod" }),
    { ...seat({ id: "seat-l01", label: "L01", employee: jordan, zone: "Litigation Pod" }), floor: "2" }
  ];
  const result = viewerSearch.buildViewerSeatSearch({ query: "Litigation", seats: mixed, employees, departmentOptions, zoneOptions });
  const department = result.results.find(item => item.kind === "department");
  const zone = result.results.find(item => item.kind === "zone" && item.title === "Litigation Pod");
  const seatRow = viewerSearch.buildViewerSeatSearch({ query: "L01", seats: mixed, employees }).results.find(item => item.kind === "seat");
  assert.ok(department && zone && seatRow);
  assert.equal(department.floor, null, "Litigation has seats on both floors");
  assert.equal(zone.floor, "2");
  assert.equal(seatRow.floor, "2");
});

test("viewer search: with nothing published, an unseated person belongs to no floor and keeps the plain subtitle", () => {
  const result = viewerSearch.buildViewerSeatSearch({ query: "Jordan", seats: [], employees });
  const person = result.results.find(item => item.kind === "person");
  assert.equal(person.floor, null);
  assert.equal(person.subtitle, "No assigned seat");
});

// The ?q= landing's unique match (D1-d; PR 5 smoke step 11): a seated person's
// name query lists the person AND their seat row — one match, two rows.
test("uniqueLandingResult: one result, or one person whose only other rows are their own seat", async () => {
  const { uniqueLandingResult } = await importTsModule("lib/viewerSeatSearch.ts");
  const person = { id: "p-1", kind: "person", title: "Alex", subtitle: "", meta: "", seatId: "s-1", seatIds: ["s-1"], floor: "3", employeeId: "e-1" };
  const ownSeat = { id: "s-1", kind: "seat", title: "CW01", subtitle: "Alex", meta: "", seatId: "s-1", seatIds: ["s-1"], floor: "3" };
  const otherSeat = { id: "s-2", kind: "seat", title: "CW02", subtitle: "", meta: "", seatId: "s-2", seatIds: ["s-2"], floor: "3" };
  const otherPerson = { ...person, id: "p-2", employeeId: "e-2", seatId: null, seatIds: [] };
  assert.equal(uniqueLandingResult([]), null);
  assert.equal(uniqueLandingResult([ownSeat]), ownSeat, "a single result of any kind is unique");
  assert.equal(uniqueLandingResult([person, ownSeat]), person, "the person and their own seat are one match");
  assert.equal(uniqueLandingResult([ownSeat, person]), person, "order does not matter");
  assert.equal(uniqueLandingResult([person, otherSeat]), null, "another seat keeps the list");
  assert.equal(uniqueLandingResult([person, otherPerson]), null, "two people keep the list");
  assert.equal(uniqueLandingResult([otherPerson, ownSeat]), null, "an unseated person beside a seat keeps the list");
});
