import assert from "node:assert/strict";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";
import test from "node:test";
const deepLink = await importTsModule("lib/deepLink.ts");

// Deep-link helpers (#196): the seat/tab query params are the shareable
// surface of map selection and the Management tabs. Pure string/lookup logic
// so both map components and the management panel share one contract.

const SEATS = [
  { id: "s1", label: "W08" },
  { id: "s2", label: "CW01" },
  { id: "s3", label: "N01" }
];

test("findSeatIdByParam matches labels case-insensitively", () => {
  assert.equal(deepLink.findSeatIdByParam(SEATS, "W08"), "s1");
  assert.equal(deepLink.findSeatIdByParam(SEATS, "w08"), "s1");
  assert.equal(deepLink.findSeatIdByParam(SEATS, "cw01"), "s2");
});

test("findSeatIdByParam returns null for unknown, empty, or missing params", () => {
  assert.equal(deepLink.findSeatIdByParam(SEATS, "ZZ99"), null);
  assert.equal(deepLink.findSeatIdByParam(SEATS, ""), null);
  assert.equal(deepLink.findSeatIdByParam(SEATS, null), null);
  assert.equal(deepLink.findSeatIdByParam(SEATS, "  "), null);
});

test("withSeatParam sets the seat param while preserving other params", () => {
  assert.equal(deepLink.withSeatParam("", "W08"), "?seat=W08");
  assert.equal(deepLink.withSeatParam("?floor=3", "W08"), "?floor=3&seat=W08");
  assert.equal(deepLink.withSeatParam("?seat=N01", "W08"), "?seat=W08");
});

test("withSeatParam with null clears the seat param, emptying the query if last", () => {
  assert.equal(deepLink.withSeatParam("?seat=W08", null), "");
  assert.equal(deepLink.withSeatParam("?floor=3&seat=W08", null), "?floor=3");
  assert.equal(deepLink.withSeatParam("", null), "");
});

test("withTabParam sets the tab and drops it again for the default tab", () => {
  assert.equal(deepLink.withTabParam("", "zones", "employees"), "?tab=zones");
  assert.equal(deepLink.withTabParam("?tab=zones", "publishHistory", "employees"), "?tab=publishHistory");
  assert.equal(deepLink.withTabParam("?tab=zones", "employees", "employees"), "");
  assert.equal(deepLink.withTabParam("?q=x&tab=zones", "employees", "employees"), "?q=x");
});

test("readSeatParam pulls the seat param out of a search string", () => {
  assert.equal(deepLink.readSeatParam("?seat=W08"), "W08");
  assert.equal(deepLink.readSeatParam("?floor=3&seat=cw01"), "cw01");
  assert.equal(deepLink.readSeatParam(""), null);
  assert.equal(deepLink.readSeatParam("?floor=3"), null);
});

// ?floor= (multi-floor PR-2): raw read (callers sanitize through isFloorId so
// this module stays free of the registry) and a set/clear that mirrors ?seat=.
test("readFloorParam pulls the raw floor param; withFloorParam sets and clears it", () => {
  assert.equal(deepLink.readFloorParam("?floor=2&seat=W08"), "2");
  assert.equal(deepLink.readFloorParam("?seat=W08"), null);
  assert.equal(deepLink.readFloorParam(""), null);
  assert.equal(deepLink.withFloorParam("", "2"), "?floor=2");
  assert.equal(deepLink.withFloorParam("?seat=W08", "2"), "?seat=W08&floor=2");
  assert.equal(deepLink.withFloorParam("?floor=2&seat=W08", null), "?seat=W08");
  assert.equal(deepLink.withFloorParam("?floor=2", null), "");
  assert.equal(deepLink.FLOOR_PARAM, "floor");
});

// ?dept= / ?zone= / ?status= / ?position= (PHASE1IA B3; Position ruled in
// 2026-09-04): one param per structured filter, "all" = absent.
test("readFilterParams reads the four filter params; missing or blank = all", () => {
  assert.deepEqual(deepLink.readFilterParams("?dept=Litigation&zone=North&status=assigned&position=Attorney&seat=W08"), {
    department: "Litigation",
    position: "Attorney",
    zone: "North",
    status: "assigned"
  });
  assert.deepEqual(deepLink.readFilterParams("?dept=%20&floor=2"), { department: "all", position: "all", zone: "all", status: "all" });
  assert.deepEqual(deepLink.readFilterParams(""), { department: "all", position: "all", zone: "all", status: "all" });
  assert.deepEqual(deepLink.FILTER_PARAMS, { department: "dept", position: "position", zone: "zone", status: "status" });
});

test("withFilterParams writes only non-default filters and preserves the other params", () => {
  assert.equal(
    deepLink.withFilterParams("?floor=2&seat=W08", { department: "Litigation", position: "all", zone: "all", status: "assigned" }),
    "?floor=2&seat=W08&dept=Litigation&status=assigned"
  );
  assert.equal(deepLink.withFilterParams("?dept=Litigation&position=Attorney", { department: "all", position: "all", zone: "all", status: "all" }), "");
  assert.equal(deepLink.withFilterParams("?dept=Old&floor=2", { department: "New", position: "all", zone: "all", status: "all" }), "?dept=New&floor=2");
});
