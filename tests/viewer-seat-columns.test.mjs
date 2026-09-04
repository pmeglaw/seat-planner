import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";

// The seats table carries admin-only free text (`notes`). Viewer surfaces must
// request published seats through an explicit column list — a select("*")
// ships every column to every signed-in browser, whether or not the UI renders
// it (that is exactly how the notes leak shipped: delivered, unrendered).

const { VIEWER_SEAT_COLUMNS, withNullNotes } = await importTsModule("lib/viewerSeatColumns.ts");

// Every published-layer viewer surface. Admin pages read draft + published for
// editing and are entitled to notes; they are deliberately not listed.
const VIEWER_SEAT_READERS = [
  "../app/(shell)/page.tsx",
  "../app/my-seat/page.tsx",
  "../app/(shell)/reception/page.tsx"
];

test("the viewer column list never includes notes and keeps the render-critical columns", () => {
  const columns = VIEWER_SEAT_COLUMNS.split(",");
  assert.ok(!columns.includes("notes"), "notes must never ship to viewer browsers");
  for (const required of ["id", "label", "x", "y", "status", "employee_id", "zone", "department", "floor"]) {
    assert.ok(columns.includes(required), `viewer surfaces render from '${required}' — it must stay on the wire`);
  }
});

test("withNullNotes keeps the Seat shape honest without resurrecting the column", () => {
  const row = withNullNotes({ id: "s1", label: "N01" });
  assert.equal(row.notes, null);
  assert.equal(row.id, "s1");
});

// Multi-floor PR-2: `floor` is on the viewer wire (the column list above), so
// the helper passes a selected floor through untouched and no longer invents
// one — the PR-1 default shim is gone with its reason.
test("withNullNotes keeps a selected floor and adds nothing but notes", () => {
  const row = withNullNotes({ id: "s2", label: "L01", floor: "2" });
  assert.equal(row.floor, "2");
  assert.deepEqual(Object.keys(row).sort(), ["floor", "id", "label", "notes"]);
});

for (const page of VIEWER_SEAT_READERS) {
  test(`${page} selects seats by explicit viewer columns, not *`, async () => {
    const source = await readFile(new URL(page, import.meta.url), "utf8");
    const seatQueries = [...source.matchAll(/from\("seats"\)[\s\S]{0,200}?\.select\(([^),]+)/g)];
    assert.ok(seatQueries.length > 0, "the page should read seats");
    for (const [, selectArg] of seatQueries) {
      // A narrow literal like "updated_at" is fine; "*" is the leak.
      assert.ok(!selectArg.includes('"*"'),
        `seats select must not use "*" on a viewer surface (got ${selectArg.trim()})`);
    }
    if (seatQueries.some(([, arg]) => arg.includes("VIEWER_SEAT_COLUMNS"))) {
      assert.match(source, /from "@\/lib\/viewerSeatColumns"/,
        "VIEWER_SEAT_COLUMNS must come from the shared lib module");
    }
  });
}
