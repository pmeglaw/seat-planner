import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";

// PHASE4BUILD §1.25 / Phase 4 PR 3b (owner ruling Q3, 2026-09-05): the
// history comparison normalises exactly the nullable text columns the draft
// RPCs normalise with nullif(trim(coalesce(x, '')), ''). This pins the TS
// lists to the SQL so a column added to (or dropped from) either side fails
// here instead of re-arming the first-Redo-after-a-seed defect.
const { NORMALISED_SEAT_TEXT_COLUMNS, NORMALISED_EMPLOYEE_TEXT_COLUMNS } = await importTsModule("lib/draftHistory.ts");

async function migration(name) {
  return readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8");
}
const NULLIF = column => new RegExp(`nullif\\(trim\\(coalesce\\((?:source|import_row)\\.${column}, ''\\)\\), ''\\)`);
const NULLIF_ANY = /nullif\(trim\(coalesce\(source\.(\w+), ''\)\), ''\)/g;

test("restore_draft_snapshot normalises exactly the seat and employee columns the history helper normalises", async () => {
  // The newest restore_draft_snapshot definition (multi-floor PR-1).
  const sql = await migration("20260901120200_restore_draft_snapshot_floor.sql");
  const seatBlock = sql.slice(sql.indexOf("as seat_key"), sql.indexOf("as is_custom"));
  const employeeBlock = sql.slice(sql.indexOf("trim(source.full_name)"), sql.indexOf("coalesce(source.active, true)"));
  for (const column of NORMALISED_SEAT_TEXT_COLUMNS) assert.match(seatBlock, NULLIF(column), `restore normalises seat.${column}`);
  for (const column of NORMALISED_EMPLOYEE_TEXT_COLUMNS) assert.match(employeeBlock, NULLIF(column), `restore normalises employee.${column}`);
  // And nothing else: every nullif(trim()) in those blocks names a listed column.
  const listedSeat = new Set([...NORMALISED_SEAT_TEXT_COLUMNS]);
  for (const [, column] of seatBlock.matchAll(NULLIF_ANY)) assert.ok(listedSeat.has(column), `seat.${column} is normalised by the SQL but not by the helper`);
  const listedEmployee = new Set([...NORMALISED_EMPLOYEE_TEXT_COLUMNS]);
  for (const [, column] of employeeBlock.matchAll(NULLIF_ANY)) assert.ok(listedEmployee.has(column), `employee.${column} is normalised by the SQL but not by the helper`);
});

test("import_assignments_csv normalises the same seat columns (the '' writer the seed shares)", async () => {
  const sql = await migration("20260806140000_import_assignments_csv_employee_fence.sql");
  for (const column of ["notes", "zone", "department"]) assert.match(sql, NULLIF(column), `import normalises seat.${column}`);
  assert.match(sql, NULLIF("position"), "import normalises the employee position it writes");
});
