import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";

// lib/floorIds.ts is the LEAF the multi-floor arc hangs off (PR-1 of the
// 2026-09-01 plan): the FloorId union, the id list and the default every
// pre-migration seat carries. It has zero imports on purpose — the geometry
// modules (mapLayoutTransform, seatZones, officeRoomWash) will import it
// (PR-2), and the registry lib/floors.ts (PR-2) imports THEM, so anything
// heavier here would be an ESM value cycle that throws at module load.
const { FLOOR_IDS, DEFAULT_FLOOR, isFloorId, floorOf } = await importTsModule("lib/floorIds.ts");

test("floor ids are exactly the two floors the firm occupies, default 3", () => {
  assert.deepEqual([...FLOOR_IDS], ["3", "2"]);
  assert.equal(DEFAULT_FLOOR, "3");
  assert.ok(FLOOR_IDS.includes(DEFAULT_FLOOR));
});

test("isFloorId accepts only the registered ids", () => {
  for (const ok of ["3", "2"]) assert.equal(isFloorId(ok), true, ok);
  for (const bad of ["1", "5", "", " 3", "03", 3, null, undefined, {}]) {
    assert.equal(isFloorId(bad), false, String(bad));
  }
});

test("floorOf reads a seat's floor and defaults anything missing or invalid to 3", () => {
  // Every seat that predates the column is on Floor 3 — the column default
  // says so, and so does this helper for rows/fixtures that never carried it.
  assert.equal(floorOf({ floor: "2" }), "2");
  assert.equal(floorOf({ floor: "3" }), "3");
  assert.equal(floorOf({}), "3");
  assert.equal(floorOf({ floor: null }), "3");
  assert.equal(floorOf({ floor: "9" }), "3");
  assert.equal(floorOf(undefined), "3");
  assert.equal(floorOf(null), "3");
});

test("the TS id list and the SQL CHECK constraint cannot drift", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20260901120000_seats_floor.sql", import.meta.url), "utf8");
  const match = sql.match(/constraint seats_floor_known check \(floor in \(([^)]+)\)\)/);
  assert.ok(match, "the column migration should declare the seats_floor_known CHECK");
  const sqlIds = match[1].split(",").map(part => part.trim().replace(/^'|'$/g, "")).sort();
  assert.deepEqual(sqlIds, [...FLOOR_IDS].sort());
});
