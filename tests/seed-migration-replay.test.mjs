import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationSql = await readFile(
  new URL("../supabase/migrations/002_seed_initial_data.sql", import.meta.url),
  "utf8",
);

function extractGuardBlock(tableName) {
  const escapedTableName = tableName.replace(".", "\\.");
  const match = migrationSql.match(
    new RegExp(`if not exists \\(select 1 from ${escapedTableName}\\) then([\\s\\S]*?)end if;`, "i"),
  );
  assert.ok(match, `${tableName} seed should be protected by an empty-table guard`);
  return match[1];
}

test("initial employee seed is skipped when employees already exist", () => {
  const employeeSeed = extractGuardBlock("public.employees");

  assert.match(employeeSeed, /insert into public\.employees/i);
  assert.match(employeeSeed, /on conflict \(id\) do nothing;/i);
});

test("initial seat seed is skipped when seats already exist", () => {
  const seatSeed = extractGuardBlock("public.seats");
  const seatInsertCount = [...seatSeed.matchAll(/insert into public\.seats/gi)].length;

  assert.equal(seatInsertCount, 2);
  assert.match(seatSeed, /'draft'::public\.seat_layer/i);
  assert.match(seatSeed, /'published'::public\.seat_layer/i);
  assert.match(seatSeed, /on conflict \(layer, seat_key\) do nothing;/i);
});
