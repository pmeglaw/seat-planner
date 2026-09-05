import assert from "node:assert/strict";
import test from "node:test";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";

const scope = await importTsModule("lib/mapSearchScope.ts");

// D1-d: focused search with a scope segment; the header always carries both
// counts, zero included, and the building count is the widen affordance.

const rows = [
  { id: "a", floor: "3" },
  { id: "b", floor: "3" },
  { id: "c", floor: "2" },
  { id: "d", floor: null } // spans floors — counts on this floor too
];

test("scopeResults: floor scope lists this floor's rows (null floor included); building lists all; counts are both", () => {
  const onFloor = scope.scopeResults(rows, "3", "floor");
  assert.deepEqual(onFloor.shown.map(r => r.id), ["a", "b", "d"]);
  assert.equal(onFloor.onFloor, 3);
  assert.equal(onFloor.inBuilding, 4);
  const building = scope.scopeResults(rows, "3", "building");
  assert.deepEqual(building.shown.map(r => r.id), ["a", "b", "c", "d"]);
  assert.equal(building.onFloor, 3);
  assert.equal(building.inBuilding, 4);
});

test("resultsHeader carries both counts, zero included", () => {
  assert.equal(scope.resultsHeader({ onFloor: 7, inBuilding: 11 }), "Results · 7 on this floor · 11 in building");
  assert.equal(scope.resultsHeader({ onFloor: 0, inBuilding: 0 }), "Results · 0 on this floor · 0 in building");
});

test("zeroState: Widen when the other scope has hits, Clear search otherwise; the query stays visible", () => {
  const widen = scope.zeroState("xyz", { onFloor: 0, inBuilding: 3 }, "floor");
  assert.equal(widen.title, "No results for “xyz” on this floor");
  assert.equal(widen.counts, "0 on this floor · 3 in building");
  assert.equal(widen.action, "widen");
  const nowhere = scope.zeroState("xyz", { onFloor: 0, inBuilding: 0 }, "floor");
  assert.equal(nowhere.action, "clear");
  const building = scope.zeroState("xyz", { onFloor: 0, inBuilding: 0 }, "building");
  assert.equal(building.title, "No results for “xyz”");
  assert.equal(building.action, "clear");
});

test("scope labels are the D1-d strings", () => {
  assert.deepEqual(scope.SEARCH_SCOPE_LABELS, { floor: "This floor", building: "Whole building" });
});
