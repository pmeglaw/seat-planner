import assert from "node:assert/strict";
import test from "node:test";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";

const {
  buildReceptionDirectory,
  personInitials,
  pushRecentLookup,
  sameDepartmentFallback,
  searchReceptionDirectory
} = await importTsModule("lib/receptionDirectory.ts");

function employee(overrides) {
  return {
    id: overrides.id,
    full_name: overrides.full_name,
    position: overrides.position ?? null,
    department: overrides.department ?? null,
    phone_extension: overrides.phone_extension ?? null
  };
}

const dana = employee({ id: "emp-dana", full_name: "Dana Reyes", position: "Paralegal", department: "Litigation", phone_extension: "4102" });
const alex = employee({ id: "emp-alex", full_name: "Alex Rivera", position: "Litigation Associate", department: "Litigation", phone_extension: "4101" });
const cher = employee({ id: "emp-cher", full_name: "Cher", position: "Receptionist", department: "Operations", phone_extension: "4100" });
const noext = employee({ id: "emp-noext", full_name: "Noel Extless", department: "Litigation" });
const unseated = employee({ id: "emp-remote", full_name: "Remy Park", position: "Of Counsel", department: "Litigation", phone_extension: "4110" });

const seats = [
  { label: "C03", employee_id: "emp-dana", zone: "Center Desks" },
  { label: "W01", employee_id: "emp-alex", zone: "West Pod" },
  { label: "A01", employee_id: null, zone: "North" },
  { label: "N02", employee_id: "emp-cher", zone: "North" },
  { label: "N04", employee_id: "emp-noext", zone: "North" }
];

const people = buildReceptionDirectory([dana, alex, cher, noext, unseated], seats);

test("directory is alphabetical and includes unseated people with null seat", () => {
  assert.deepEqual(
    people.map(person => person.name),
    ["Alex Rivera", "Cher", "Dana Reyes", "Noel Extless", "Remy Park"]
  );
  const remy = people.find(person => person.id === "emp-remote");
  assert.equal(remy.seatLabel, null);
  assert.equal(remy.zone, null);
  assert.equal(remy.extension, "4110");
});

test("seat join carries label and zone; lowest label wins on duplicates", () => {
  const danaRow = people.find(person => person.id === "emp-dana");
  assert.equal(danaRow.seatLabel, "C03");
  assert.equal(danaRow.zone, "Center Desks");

  const doubled = buildReceptionDirectory(
    [dana],
    [
      { label: "Z09", employee_id: "emp-dana", zone: "South" },
      { label: "B01", employee_id: "emp-dana", zone: "East" }
    ]
  );
  assert.equal(doubled[0].seatLabel, "B01");
});

test("empty or whitespace query returns the full directory", () => {
  assert.deepEqual(searchReceptionDirectory(people, ""), people);
  assert.deepEqual(searchReceptionDirectory(people, "   "), people);
});

test("ranking: name-prefix beats name-contains beats other-field matches", () => {
  const results = searchReceptionDirectory(people, "re");
  // Prefix: Remy Park. Name-contains: Dana Reyes ("reyes"). Cher has no "re".
  const names = results.map(person => person.name);
  assert.equal(names[0], "Remy Park");
  assert.ok(names.includes("Dana Reyes"));
  assert.ok(names.indexOf("Remy Park") < names.indexOf("Dana Reyes"));
  // Other-field-only match ranks below both name groups: "receptionist" via
  // position for Cher.
  const litigation = searchReceptionDirectory(people, "litigation");
  // Alex matches in NAME group? No — "litigation" is not in "Alex Rivera";
  // it matches via position/department (rank 2) for Alex, Dana, Noel, Remy.
  assert.deepEqual(
    litigation.map(person => person.name),
    ["Alex Rivera", "Dana Reyes", "Noel Extless", "Remy Park"]
  );
});

test("matches across position, department, seat code, and extension", () => {
  assert.equal(searchReceptionDirectory(people, "paralegal")[0].id, "emp-dana");
  assert.equal(searchReceptionDirectory(people, "c03")[0].id, "emp-dana");
  assert.equal(searchReceptionDirectory(people, "4101")[0].id, "emp-alex");
  assert.equal(searchReceptionDirectory(people, "no such thing").length, 0);
});

test("matching is case-insensitive", () => {
  assert.equal(searchReceptionDirectory(people, "DANA")[0].id, "emp-dana");
  assert.equal(searchReceptionDirectory(people, "w01")[0].id, "emp-alex");
});

test("recents: dedupe to front, cap at 5", () => {
  let recents = [];
  recents = pushRecentLookup(recents, "a");
  recents = pushRecentLookup(recents, "b");
  recents = pushRecentLookup(recents, "a");
  assert.deepEqual(recents, ["a", "b"]);
  for (const id of ["c", "d", "e", "f"]) recents = pushRecentLookup(recents, id);
  assert.equal(recents.length, 5);
  assert.equal(recents[0], "f");
  assert.ok(!recents.includes("b"));
});

test("same-department fallback: excludes self and extension-less colleagues, caps at 3", () => {
  const danaRow = people.find(person => person.id === "emp-dana");
  const fallback = sameDepartmentFallback(people, danaRow);
  const ids = fallback.map(person => person.id);
  assert.ok(!ids.includes("emp-dana"));
  assert.ok(!ids.includes("emp-noext"));
  assert.deepEqual(ids, ["emp-alex", "emp-remote"]);

  const noDept = { ...danaRow, department: null };
  assert.deepEqual(sameDepartmentFallback(people, noDept), []);
});

test("same-department fallback sorts alphabetically even from unsorted input, then caps", () => {
  const zed = employee({ id: "emp-zed", full_name: "Zed Last", department: "Litigation", phone_extension: "4120" });
  // Four eligible colleagues against a cap of three: Zoltan sorts last, so a
  // slice-before-sort implementation would keep him and drop Alex.
  const zoltan = employee({ id: "emp-zoltan", full_name: "Zoltan Ash", department: "Litigation", phone_extension: "4121" });
  const unsorted = buildReceptionDirectory([dana, alex, unseated, zed, zoltan], [])
    // Deliberately scramble: the cap must select by name order, not input order.
    .reverse();
  const danaRow = unsorted.find(person => person.id === "emp-dana");
  const fallback = sameDepartmentFallback(unsorted, danaRow);
  assert.deepEqual(
    fallback.map(person => person.name),
    ["Alex Rivera", "Remy Park", "Zed Last"]
  );
});

test("personInitials: first+last, single-name fallback", () => {
  assert.equal(personInitials("Dana Reyes"), "DR");
  assert.equal(personInitials("Alex Q. Rivera"), "AR");
  assert.equal(personInitials("Cher"), "CH");
  assert.equal(personInitials("  "), "?");
});
