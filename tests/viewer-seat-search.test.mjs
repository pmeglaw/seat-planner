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
  assert.equal(person.disabled, false);
  assert.ok(result.resultSeatIds.includes("seat-w02"));
});

test("viewer search keeps unassigned people read-only without a map target", () => {
  const result = viewerSearch.buildViewerSeatSearch({ query: "Jordan", seats, employees, departmentOptions, zoneOptions });
  const person = result.results.find(item => item.kind === "person");

  assert.ok(person);
  assert.equal(person.title, "Jordan Brooks");
  assert.equal(person.seatId, null);
  assert.deepEqual(person.seatIds, []);
  assert.equal(person.disabled, true);
  assert.equal(person.subtitle, "No published seat");
});

test("viewer search distinguishes seat label results", () => {
  const result = viewerSearch.buildViewerSeatSearch({ query: "N02", seats, employees, departmentOptions, zoneOptions });
  const seatResult = result.results.find(item => item.kind === "seat" && item.title === "N02");

  assert.ok(seatResult);
  assert.equal(seatResult.seatId, "seat-n02");
  assert.equal(seatResult.status, "available");
  assert.match(seatResult.meta, /Available/);
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
  assert.equal(departmentResult.meta, "1 person · 1 published seat");
  assert.doesNotMatch(departmentResult.meta, /0 people · 0 published seats/);
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

test("empty viewer search does not fabricate default results", () => {
  const result = viewerSearch.buildViewerSeatSearch({ query: "   ", seats, employees, departmentOptions, zoneOptions });

  assert.deepEqual(result.results, []);
  assert.deepEqual(result.resultSeatIds, []);
  assert.equal(result.query, "");
});
