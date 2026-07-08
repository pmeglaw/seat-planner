import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function importTsModule(relativePath) {
  const source = await readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022
    }
  });
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString("base64")}`;
  return import(moduleUrl);
}

const { computeDraftFingerprint, isStaleDraftErrorCode, STALE_DRAFT_SQLSTATE } = await importTsModule("lib/draftConcurrency.ts");

function seat(updatedAt) {
  return { updated_at: updatedAt };
}

test("computeDraftFingerprint reports an empty draft as zero seats with no timestamp", () => {
  assert.deepEqual(computeDraftFingerprint([]), { seatCount: 0, maxUpdatedAt: null });
});

test("computeDraftFingerprint counts every seat and picks the latest updated_at", () => {
  const fingerprint = computeDraftFingerprint([
    seat("2026-07-08T10:00:00.123456+00:00"),
    seat("2026-07-08T12:30:00.000001+00:00"),
    seat("2026-07-07T23:59:59.999999+00:00")
  ]);

  assert.deepEqual(fingerprint, {
    seatCount: 3,
    maxUpdatedAt: "2026-07-08T12:30:00.000001+00:00"
  });
});

test("computeDraftFingerprint orders trimmed fractional seconds correctly", () => {
  // Postgres trims trailing fractional zeros, so serialized strings vary in
  // length. Lexicographic max must still pick the numerically-latest instant.
  const fingerprint = computeDraftFingerprint([
    seat("2026-07-08T10:00:00.5+00:00"),
    seat("2026-07-08T10:00:00.25+00:00"),
    seat("2026-07-08T10:00:00+00:00")
  ]);

  assert.equal(fingerprint.maxUpdatedAt, "2026-07-08T10:00:00.5+00:00");
  assert.equal(fingerprint.seatCount, 3);
});

test("computeDraftFingerprint returns the exact serialized string it was given", () => {
  // The value is compared by the database after a ::timestamptz cast; it must
  // round-trip byte-for-byte, never re-serialized through Date (which drops
  // microsecond precision).
  const exact = "2026-07-08T10:00:00.123456+00:00";
  const fingerprint = computeDraftFingerprint([seat(exact)]);
  assert.equal(fingerprint.maxUpdatedAt, exact);
});

test("computeDraftFingerprint tolerates seats missing updated_at", () => {
  const fingerprint = computeDraftFingerprint([
    seat(null),
    seat("2026-07-08T10:00:00+00:00"),
    seat(undefined)
  ]);

  assert.deepEqual(fingerprint, {
    seatCount: 3,
    maxUpdatedAt: "2026-07-08T10:00:00+00:00"
  });
});

test("isStaleDraftErrorCode matches only the fence SQLSTATE", () => {
  assert.equal(STALE_DRAFT_SQLSTATE, "MLS02");
  assert.equal(isStaleDraftErrorCode("MLS02"), true);
  assert.equal(isStaleDraftErrorCode("MLS01"), false);
  assert.equal(isStaleDraftErrorCode("42501"), false);
  assert.equal(isStaleDraftErrorCode(null), false);
  assert.equal(isStaleDraftErrorCode(undefined), false);
});

// Multi-admin regression guardrails: every client path that can clobber another
// admin's draft edits must thread the fence, and the stale recovery must drop
// the now-invalid undo/redo baselines before re-seeding from the server.

test("SeatMap threads the fence through undo/redo restore and swap", async () => {
  const source = await readFile(new URL("../components/seat-map/SeatMap.tsx", import.meta.url), "utf8");

  assert.match(source, /restoreDraftSnapshotAction\(snapshot, computeDraftFingerprint\(localSeats\)\)/);
  assert.match(source, /sourceExpectedUpdatedAt: sourceSeat\.updated_at/);
  assert.match(source, /targetExpectedUpdatedAt: targetSeat\.updated_at/);

  const staleHandler = source.match(/function handleStaleDraft\(message: string\) \{[\s\S]*?\n  \}/);
  assert.ok(staleHandler, "stale-draft recovery handler should be source-visible");
  assert.match(staleHandler[0], /setDraftHistory\(clearDraftHistory\(\)\)/);
  assert.match(staleHandler[0], /router\.refresh\(\)/);
  // The user-facing explanation must live in dedicated state: the inspector's
  // reset/seat-sync paths call onError(null), which wipes actionError in the
  // same render cycle the fence fires (found live on the PR #99 preview).
  assert.match(staleHandler[0], /setStaleDraftNotice\(/);
  assert.doesNotMatch(staleHandler[0], /setActionError\(`/);
});

test("SeatInspector threads the per-seat fence and routes STALE_DRAFT to the parent", async () => {
  const source = await readFile(new URL("../components/seat-map/SeatInspector.tsx", import.meta.url), "utf8");

  const fenceInputs = source.match(/expectedUpdatedAt: selectedSeat\.updated_at/g) ?? [];
  assert.ok(fenceInputs.length >= 2, "both the save and vacate paths should pass the seat's updated_at");
  assert.match(source, /result\.code === "STALE_DRAFT"/);
  assert.match(source, /onStaleDraft\(result\.message\)/);
});

test("settings JSON restore fences on the draft the page loaded", async () => {
  const source = await readFile(new URL("../components/admin-settings/DataUtilitiesPanel.tsx", import.meta.url), "utf8");

  assert.match(source, /restoreDraftSnapshotAction\(review\.snapshot, computeDraftFingerprint\(seats\)\)/);
  assert.match(source, /router\.refresh\(\)/);
});
