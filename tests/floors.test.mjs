import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";

// lib/floors.ts is the floor REGISTRY and the home of every floor rule the
// viewer, reception, my-seat and (PR-3) the admin editor share: which floors
// exist, what they are called, whether a floor is LIVE (mapped and published),
// which surface a floor renders (plan or roster), the interim "unseated people
// work on the unmapped floor" inference, landing precedence, and the roster
// grouping/summary copy. Multi-floor PR-2 (2026-09-01); owner rulings in the
// plan file. Everything here is exercised because lib/** carries coverage
// floors (95% functions).
const floors = await importTsModule("lib/floors.ts");
const {
  FLOORS,
  VIEWER_FLOOR_STORAGE_KEY,
  listFloors,
  floorLabel,
  floorShortLabel,
  floorTag,
  floorIsLive,
  floorSurface,
  rosterFloorForUnseated,
  floorOfPerson,
  peopleOnFloor,
  landingFloor,
  urlFloorFor,
  groupRosterByDepartment,
  floorDepartmentSummary,
  floorSuffix,
  groupByFloor
} = floors;

function employee(id, full_name, overrides = {}) {
  return {
    id,
    full_name,
    position: null,
    department: null,
    phone_extension: null,
    email: null,
    avatar_url: null,
    active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides
  };
}

function seat(id, label, overrides = {}) {
  return { id, label, employee_id: null, floor: "3", ...overrides };
}

const alice = employee("alice", "Alice Smith", { department: "Case Management", position: "Case Manager", phone_extension: "101", email: "alice@example.test" });
const bob = employee("bob", "Bob Ito", { department: "Litigation", position: "Attorney", phone_extension: "102" });
const cara = employee("cara", "cara VANCE", { department: "litigation ", position: "Paralegal", phone_extension: "103" });
const dan = employee("dan", "Dan Ng", { department: null, position: "Runner" });
const ghost = employee("ghost", "Gone Person", { department: "Litigation", active: false });

const publishedSeats = [seat("s-n01", "N01", { employee_id: "alice" }), seat("s-n02", "N02")];

// ---- registry

test("registry lists the two floors in display order with the owner's labels", () => {
  assert.deepEqual(listFloors().map(f => f.id), ["3", "2"]);
  assert.equal(FLOORS["3"].label, "Floor 3 · Pre-Litigation");
  assert.equal(FLOORS["2"].label, "Floor 2 · Litigation");
  assert.equal(floorLabel("2"), "Floor 2 · Litigation");
  // The chrome trigger label is the practice-group name alone (owner call
  // 2026-08-14); the tag is the short floor name every other surface uses.
  assert.equal(floorShortLabel("3"), "Pre-Litigation");
  assert.equal(floorShortLabel("2"), "Litigation");
  assert.equal(floorTag("3"), "Floor 3");
  assert.equal(floorTag("2"), "Floor 2");
  assert.equal(FLOORS["3"].number, 3);
  assert.equal(FLOORS["2"].number, 2);
});

test("a floor is mapped exactly when it has a plan asset — one home for that fact", () => {
  for (const floor of listFloors()) {
    assert.equal(floor.mapped, floor.plan !== null, floor.id);
  }
  assert.equal(FLOORS["3"].mapped, true);
  assert.equal(FLOORS["2"].mapped, false);
});

// Floor 3's plan IS the shipped raster — same src, dims and blur the map
// surfaces have always rendered (desktop-seat-marker-system-source pins the
// constants; this pins that the registry points at them, not a copy).
test("floor 3's plan references the shipped raster constants by value", async () => {
  const { MAP_IMAGE_SRC, MAP_IMAGE_WIDTH, MAP_IMAGE_HEIGHT, MAP_IMAGE_BLUR_DATA_URL } = await importTsModule("lib/mapLayoutTransform.ts");
  assert.equal(FLOORS["3"].plan.src, MAP_IMAGE_SRC);
  assert.equal(FLOORS["3"].plan.width, MAP_IMAGE_WIDTH);
  assert.equal(FLOORS["3"].plan.height, MAP_IMAGE_HEIGHT);
  assert.equal(FLOORS["3"].plan.blurDataUrl, MAP_IMAGE_BLUR_DATA_URL);
  assert.match(FLOORS["3"].plan.src, /\?v=/);
});

test("the module layering is cycle-free: every geometry module and the registry load", async () => {
  // Load order matters for an ESM value cycle (TDZ throws on first import), so
  // enter through each module in a FRESH instance.
  for (const entry of ["lib/floorGeometry/floor2.ts", "lib/mapLayoutTransform.ts", "lib/seatZones.ts", "lib/floors.ts"]) {
    await importTsModule(entry, { fresh: true });
  }
  // floor2.ts may import ONLY the two leaves — anything else is the cycle.
  const floor2Source = await readFile(new URL("../lib/floorGeometry/floor2.ts", import.meta.url), "utf8");
  const specifiers = [...floor2Source.matchAll(/\bfrom\s*["']([^"']+)["']/g)].map(m => m[1]);
  for (const specifier of specifiers) {
    assert.ok(["@/lib/floorIds", "@/lib/floorGeometry/types"].includes(specifier), `floor2.ts imports ${specifier}`);
  }
  const idsSource = await readFile(new URL("../lib/floorIds.ts", import.meta.url), "utf8");
  assert.doesNotMatch(idsSource, /^\s*import\s/m, "lib/floorIds.ts stays a zero-import leaf");
});

// ---- liveness + surface

test("a floor is live only when it is mapped AND a seat carries it", () => {
  assert.equal(floorIsLive("3", publishedSeats), true);
  assert.equal(floorIsLive("3", []), false, "mapped but nothing published is not live");
  assert.equal(floorIsLive("2", publishedSeats), false, "not mapped");
  assert.equal(floorIsLive("2", [seat("s-l01", "L01", { floor: "2" })]), false, "a seat alone does not make an unmapped floor live");
});

test("floorSurface renders a plan for a live floor and a roster otherwise", () => {
  assert.equal(floorSurface("3", publishedSeats), "plan");
  assert.equal(floorSurface("2", publishedSeats), "roster");
  assert.equal(floorSurface("3", []), "roster", "nothing published yet: the roster, not an empty plan");
});

// ---- INTERIM RULE (owner 2026-09-01): unseated = the one floor that is not live

test("the interim rule names the single non-live floor, and nothing when that is ambiguous", () => {
  assert.equal(rosterFloorForUnseated(publishedSeats), "2");
  assert.equal(rosterFloorForUnseated([]), null, "no floor is live: which one the unseated are on is unknowable");
});

test("floorOfPerson: a seated person is on their seat's floor; an unseated person is on the roster floor", () => {
  assert.equal(floorOfPerson(seat("s-n01", "N01"), publishedSeats), "3");
  assert.equal(floorOfPerson(seat("s-l01", "L01", { floor: "2" }), publishedSeats), "2");
  assert.equal(floorOfPerson(null, publishedSeats), "2");
  assert.equal(floorOfPerson(null, []), null);
});

test("peopleOnFloor lists a floor's seated people plus, on the roster floor, every unseated active person", () => {
  const everyone = [alice, bob, cara, dan, ghost];
  assert.deepEqual(peopleOnFloor("3", publishedSeats, everyone).map(e => e.id), ["alice"]);
  assert.deepEqual(peopleOnFloor("2", publishedSeats, everyone).map(e => e.id).sort(), ["bob", "cara", "dan"], "inactive people are never listed");
});

test("once a floor is live its roster is seat-based and unseated people belong to no floor", () => {
  const bothLive = [...publishedSeats, seat("s-l01", "L01", { floor: "2", employee_id: "bob" })];
  // Floor 2 has a seat but is not mapped, so it is still not live — the
  // registry decides mapped; this exercises the seat-based branch through a
  // registry override.
  const registry = { ...FLOORS, "2": { ...FLOORS["2"], plan: { src: "/x.webp?v=1", width: 3822, height: 1734, blurDataUrl: "data:," } } };
  assert.equal(floors.floorIsLive("2", bothLive, registry), true);
  assert.equal(floors.rosterFloorForUnseated(bothLive, registry), null);
  assert.deepEqual(floors.peopleOnFloor("2", bothLive, [alice, bob, cara], registry).map(e => e.id), ["bob"]);
  assert.equal(floors.floorOfPerson(null, bothLive, registry), null, "unseated with both floors live: genuinely no seat");
});

// ---- landing precedence

test("landingFloor: url beats stored beats own floor beats the default", () => {
  assert.equal(landingFloor({ urlFloor: "2", storedFloor: "3", ownFloor: "3" }), "2");
  assert.equal(landingFloor({ urlFloor: null, storedFloor: "2", ownFloor: "3" }), "2");
  assert.equal(landingFloor({ urlFloor: null, storedFloor: null, ownFloor: "2" }), "2");
  assert.equal(landingFloor({ urlFloor: null, storedFloor: null, ownFloor: null }), "3");
  assert.equal(landingFloor({ urlFloor: undefined, storedFloor: undefined, ownFloor: undefined }), "3");
  assert.equal(landingFloor({ urlFloor: null, storedFloor: "9", ownFloor: null }), "3", "an invalid stored value is ignored");
});

test("urlFloorFor: a ?seat= match wins over ?floor=, an unknown seat falls to ?floor=, both absent is null", () => {
  const seats = [seat("s-n01", "N01"), seat("s-l01", "L01", { floor: "2" })];
  assert.equal(urlFloorFor(seats, { seat: "l01", floor: "3" }), "2");
  assert.equal(urlFloorFor(seats, { seat: "ZZ99", floor: "2" }), "2");
  assert.equal(urlFloorFor(seats, { seat: null, floor: "9" }), null);
  assert.equal(urlFloorFor(seats, {}), null);
});

// ---- roster grouping

test("groupRosterByDepartment groups on the department key, first spelling wins, No department last, A to Z within", () => {
  const groups = groupRosterByDepartment([dan, cara, bob, alice]);
  assert.deepEqual(groups.map(g => g.department), ["Case Management", "Litigation", "No department"]);
  assert.deepEqual(groups[1].people.map(p => p.full_name), ["Bob Ito", "cara VANCE"], "sorted by display name, case-insensitive");
  assert.deepEqual(groups[2].people.map(p => p.id), ["dan"]);
});

test("groupRosterByDepartment filters people by a case-insensitive query over name, position, department, extension and email", () => {
  assert.deepEqual(groupRosterByDepartment([alice, bob, cara, dan], "para").flatMap(g => g.people.map(p => p.id)), ["cara"]);
  assert.deepEqual(groupRosterByDepartment([alice, bob, cara, dan], "102").flatMap(g => g.people.map(p => p.id)), ["bob"]);
  assert.deepEqual(groupRosterByDepartment([alice, bob, cara, dan], "alice@").flatMap(g => g.people.map(p => p.id)), ["alice"]);
  assert.deepEqual(groupRosterByDepartment([alice, bob], "nobody"), []);
});

// ---- Q5: the department filter is floor-aware

test("floorDepartmentSummary on a plan floor with matches keeps the plain count", () => {
  const result = floorDepartmentSummary({
    floor: "3",
    department: "all",
    position: "all",
    floorMatchCount: 12,
    floorSeatCount: 68,
    seats: publishedSeats,
    employees: [alice, bob]
  });
  assert.deepEqual(result, { text: "12 of 68 seats on Floor 3 match", switchTo: null });
});

test("floorDepartmentSummary names the other floor when a department has people there and no seats here", () => {
  const result = floorDepartmentSummary({
    floor: "3",
    department: "litigation",
    position: "all",
    floorMatchCount: 0,
    floorSeatCount: 68,
    seats: publishedSeats,
    employees: [alice, bob, cara, ghost]
  });
  assert.deepEqual(result, { text: "0 of 68 seats on Floor 3 · 2 people in Litigation are on Floor 2", switchTo: "2" });
  const one = floorDepartmentSummary({
    floor: "3",
    department: "Litigation",
    position: "all",
    floorMatchCount: 0,
    floorSeatCount: 68,
    seats: publishedSeats,
    employees: [alice, bob]
  });
  assert.equal(one.text, "0 of 68 seats on Floor 3 · 1 person in Litigation is on Floor 2");
});

test("floorDepartmentSummary with zero matches anywhere stays a plain zero", () => {
  const result = floorDepartmentSummary({
    floor: "3",
    department: "Finance",
    position: "all",
    floorMatchCount: 0,
    floorSeatCount: 68,
    seats: publishedSeats,
    employees: [alice, bob]
  });
  assert.deepEqual(result, { text: "0 of 68 seats on Floor 3 match", switchTo: null });
});

test("floorDepartmentSummary on the roster floor counts people, filtered by department and position", () => {
  const all = floorDepartmentSummary({
    floor: "2",
    department: "all",
    position: "all",
    floorMatchCount: 0,
    floorSeatCount: 0,
    seats: publishedSeats,
    employees: [alice, bob, cara, dan]
  });
  assert.deepEqual(all, { text: "3 of 3 people on Floor 2 match", switchTo: null });
  const filtered = floorDepartmentSummary({
    floor: "2",
    department: "Litigation",
    position: "Paralegal",
    floorMatchCount: 0,
    floorSeatCount: 0,
    seats: publishedSeats,
    employees: [alice, bob, cara, dan]
  });
  assert.deepEqual(filtered, { text: "1 of 3 people on Floor 2 match", switchTo: null });
});

// ---- copy helpers

test("floorSuffix names a seat's floor only when it differs from the context floor", () => {
  assert.equal(floorSuffix(seat("s", "N01"), "3"), "");
  assert.equal(floorSuffix(seat("s", "L01", { floor: "2" }), "3"), " on Floor 2");
  assert.equal(floorSuffix({ label: "X" }, "3"), "", "a row without a floor is Floor 3");
});

test("the viewer's floor preference key is stable", () => {
  assert.equal(VIEWER_FLOOR_STORAGE_KEY, "seat-planner:viewer-floor");
});

// ---- copy helpers the surfaces compose

test("floorOrdinal spells the floor number for prose (\"The 2nd-floor plan…\")", () => {
  assert.equal(floors.floorOrdinal("2"), "2nd");
  assert.equal(floors.floorOrdinal("3"), "3rd");
});

test("personPassesFilters applies the department and position facets to a person (roster floor, Q5)", () => {
  assert.equal(floors.personPassesFilters(cara, { department: "all", position: "all" }), true);
  assert.equal(floors.personPassesFilters(cara, { department: "litigation", position: "all" }), true, "departmentKey compare");
  assert.equal(floors.personPassesFilters(cara, { department: "Litigation", position: "Paralegal" }), true);
  assert.equal(floors.personPassesFilters(cara, { department: "Litigation", position: "Attorney" }), false);
  assert.equal(floors.personPassesFilters(cara, { department: "Finance", position: "all" }), false);
});

test("floorDepartmentSummary offers the other floor only when the DEPARTMENT has no seats here — a zone/status zero stays plain", () => {
  const summary = floors.floorDepartmentSummary({
    floor: "3",
    department: "Case Management",
    position: "all",
    floorMatchCount: 0,
    floorDepartmentMatchCount: 5,
    floorSeatCount: 68,
    seats: publishedSeats,
    // An unseated Case Management person on the roster floor: without the
    // department-only count the summary would blame Floor 2 for a zero the
    // zone/status facet caused.
    employees: [alice, bob, cara, employee("emma", "Emma Case", { department: "Case Management", position: "Case Manager" })]
  });
  assert.equal(summary.text, "0 of 68 seats on Floor 3 match");
  assert.equal(summary.switchTo, null);
});

// ---- grouping (multi-floor PR-3: the publish review's floor eyebrows)

test("groupByFloor buckets items in registry order, keeps item order, omits empty floors", () => {
  const rows = [
    { key: "b", floor: "2" },
    { key: "a", floor: "3" },
    { key: "c" }, // no floor value → Floor 3, like every pre-column row
    { key: "d", floor: "2" }
  ];
  const groups = groupByFloor(rows);
  assert.deepEqual(groups.map(group => group.floor), ["3", "2"]);
  assert.deepEqual(groups.map(group => group.label), ["Floor 3 · Pre-Litigation", "Floor 2 · Litigation"]);
  assert.deepEqual(groups[0].items.map(row => row.key), ["a", "c"]);
  assert.deepEqual(groups[1].items.map(row => row.key), ["b", "d"]);
  assert.deepEqual(groupByFloor([]), []);
  assert.deepEqual(groupByFloor([{ floor: "2" }]).map(group => group.floor), ["2"]);
});

// The admin editor (PR-3) draws the plan for any MAPPED floor and the roster
// for an unmapped one — its people come from the LIVE working set, and a
// draft seat on a floor makes it live for the editor's interim rule.
test("the admin editor mounts the roster from the live working set and gates Add seat on the plan surface", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../components/seat-map/SeatMap.tsx", import.meta.url), "utf8");
  assert.match(source, /floorIsMapped\(floor\) \? "plan" : "roster"/);
  assert.match(source, /peopleOnFloor\(floor, localSeats, localEmployees\)/);
  // PR 3a: Add seat is the control row's ghost, Hidden on a roster floor (never disabled).
  assert.match(source, /addSeat: \{ active: addSeatMode, hidden: surface !== "plan"/);
  assert.match(source, /<FloorRoster/);
  assert.doesNotMatch(source, /FloorPlaceholder/);
  assert.doesNotMatch(source, /floor === "3"|floor === "2"/, "the canvas dispatches on the registry, never on a floor literal");
});
