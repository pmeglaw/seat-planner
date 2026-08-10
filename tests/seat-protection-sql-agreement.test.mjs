import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { createSeatPlannerDb } from "./helpers/pgHarness.mjs";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";

// Which seat labels are "protected originals" is implemented TWICE: in
// lib/seatProtection.ts (the client/server guard) and again inside
// restore_draft_snapshot, which refuses to drop a protected draft seat that a
// snapshot omits (supabase/migrations/20260807120000, the protected_original_label
// CASE). Two hand-maintained copies of the same ranges, and until this file
// nothing checked that they agreed — a divergence would let the UI call a seat
// protected while the database silently allowed a restore to delete it, or the
// reverse.
//
// The agreement is asserted end to end against the REAL RPC rather than by
// comparing regexes: seed one custom, unoccupied draft seat carrying the label
// under test, restore a snapshot that omits it, and see whether the RPC
// refuses. Every other condition in that guard (custom, unassigned, available)
// is held true, so the label classification is the only thing that can decide
// the outcome.
//
// A third copy exists in 20260724100000_repair_original_is_custom.sql, whose
// regex demands zero-padded numbers (`W08`, never `W8`). It is a one-time,
// already-applied data repair that can never run again, so it is deliberately
// out of scope here — an applied migration must not be edited.

const { isProtectedOriginalSeatLabel, ORIGINAL_SEAT_LABEL_MAX_BY_PREFIX } =
  await importTsModule("lib/seatProtection.ts");

let db;
before(async () => {
  db = await createSeatPlannerDb();
});
beforeEach(async () => {
  await db.reset();
});
after(async () => {
  await db?.close();
});

// Derived from the prefix map, so a new prefix or a changed range is covered
// automatically: for each prefix, the first and last in-range seat in both
// zero-padded and bare form, plus the first number past the range.
function generatedLabels() {
  const labels = [];
  for (const [prefix, max] of Object.entries(ORIGINAL_SEAT_LABEL_MAX_BY_PREFIX)) {
    for (const seatNumber of [1, max]) {
      labels.push(`${prefix}${String(seatNumber).padStart(2, "0")}`);
      labels.push(`${prefix}${seatNumber}`);
    }
    labels.push(`${prefix}${String(max + 1).padStart(2, "0")}`);
  }
  return [...new Set(labels)];
}

// Shapes the generated matrix cannot produce, each one a place the two
// implementations could plausibly disagree.
const EDGE_CASE_LABELS = [
  "n01",       // lowercase: both sides upper-case before matching
  " N01 ",     // padded with whitespace: both sides trim
  "N012",      // extra leading zero, still inside the range
  "N0",        // zero is below every range
  "X01",       // unknown prefix
  "NN01",      // unknown two-letter prefix
  "N",         // no number at all
  "01",        // no prefix at all
  "N1A",       // trailing junk after the number
  "ZZ99"       // unknown prefix with a number far past every range
];

// Survives every restore below (unknown prefix, so never protected) and keeps
// the snapshot non-empty. Its label must not collide with any label under test.
const KEEPER = { label: "QQ01", key: "keeper" };

function toSnapshotSeat(seat) {
  return {
    id: seat.id,
    seat_key: seat.seat_key,
    label: seat.label,
    x: seat.x,
    y: seat.y,
    status: seat.status,
    layer: "draft",
    employee_id: null,
    zone: null,
    department: null,
    notes: null,
    is_custom: true
  };
}

// True when restore_draft_snapshot refuses to drop the seat, i.e. the DATABASE
// considers this label a protected original.
async function sqlTreatsLabelAsProtected(label) {
  const keeper = await db.seedSeat({ label: KEEPER.label, key: KEEPER.key, isCustom: true, status: "available" });
  await db.seedSeat({ label, key: "subject", isCustom: true, status: "available" });

  try {
    await db.query("select public.restore_draft_snapshot($1::jsonb, $2::jsonb)", [
      JSON.stringify([toSnapshotSeat(keeper)]),
      JSON.stringify([])
    ]);
    return false;
  } catch (error) {
    assert.match(
      error.message,
      /protected or occupied seats are missing/,
      `restore failed for an unrelated reason on label ${JSON.stringify(label)}: ${error.message}`
    );
    return true;
  }
}

test("the generated label matrix actually covers both padded and bare forms", () => {
  const labels = generatedLabels();
  assert.ok(labels.includes("W12"), "expected the top of the W range");
  assert.ok(labels.includes("W8") === false, "W8 is not first-or-last in the W range");
  assert.ok(labels.includes("C1"), "expected a bare in-range label, the historical divergence shape");
  assert.ok(labels.includes("SE05"), "expected the first label past the SE range");
});

for (const label of [...generatedLabels(), ...EDGE_CASE_LABELS]) {
  test(`restore_draft_snapshot agrees with seatProtection on ${JSON.stringify(label)}`, async () => {
    const expected = isProtectedOriginalSeatLabel(label);
    const actual = await sqlTreatsLabelAsProtected(label);

    assert.equal(
      actual,
      expected,
      expected
        ? `lib/seatProtection.ts protects ${JSON.stringify(label)} but restore_draft_snapshot let the restore drop it`
        : `restore_draft_snapshot protects ${JSON.stringify(label)} but lib/seatProtection.ts does not`
    );
  });
}
