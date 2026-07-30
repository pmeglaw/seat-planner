import assert from "node:assert/strict";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";
import { readFile } from "node:fs/promises";
import test from "node:test";
const { listDraftSeatExpectations, isStaleDraftErrorCode, STALE_DRAFT_SQLSTATE } = await importTsModule("lib/draftConcurrency.ts");

function seat(id, updatedAt) {
  return { id, updated_at: updatedAt };
}

test("listDraftSeatExpectations reports an empty draft as an empty list", () => {
  assert.deepEqual(listDraftSeatExpectations([]), []);
});

test("listDraftSeatExpectations lists every seat with its exact serialized timestamp", () => {
  // The values are compared by the database after a ::timestamptz cast; they
  // must round-trip byte-for-byte, never re-serialized through Date (which
  // drops microsecond precision). An exact per-row map — NOT an aggregate like
  // (count, max) — because an aggregate is blind to an older concurrent edit
  // once the stale client makes a newer edit of its own.
  const expectations = listDraftSeatExpectations([
    seat("a", "2026-07-08T10:00:00.123456+00:00"),
    seat("b", "2026-07-08T12:30:00.000001+00:00"),
    seat("c", "2026-07-07T23:59:59.999999+00:00")
  ]);

  assert.deepEqual(expectations, [
    { id: "a", updated_at: "2026-07-08T10:00:00.123456+00:00" },
    { id: "b", updated_at: "2026-07-08T12:30:00.000001+00:00" },
    { id: "c", updated_at: "2026-07-07T23:59:59.999999+00:00" }
  ]);
});

test("listDraftSeatExpectations tolerates seats missing updated_at", () => {
  assert.deepEqual(
    listDraftSeatExpectations([seat("a", null), seat("b", "2026-07-08T10:00:00+00:00"), seat("c", undefined)]),
    [
      { id: "a", updated_at: null },
      { id: "b", updated_at: "2026-07-08T10:00:00+00:00" },
      { id: "c", updated_at: null }
    ]
  );
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

  assert.match(source, /restoreDraftSnapshotAction\(snapshot, listDraftSeatExpectations\(localSeats\)\)/);
  assert.match(source, /sourceExpectedUpdatedAt: sourceSeat\.updated_at/);
  assert.match(source, /targetExpectedUpdatedAt: targetSeat\.updated_at/);

  const staleHandler = source.match(/function handleStaleDraft\(message: string\) \{[\s\S]*?\n  \}/);
  assert.ok(staleHandler, "stale-draft recovery handler should be source-visible");
  assert.match(staleHandler[0], /setDraftHistory\(clearDraftHistory\(\)\)/);
  assert.match(staleHandler[0], /router\.refresh\(\)/);

  // Client-side adjacency guard: the server fence only proves the VIEW is
  // fresh; a foreign edit that reached this client via a server-action refresh
  // makes the history SNAPSHOT stale while the view is current. Undo/redo must
  // value-compare the live draft against the entry state before restoring.
  const undoHandler = source.match(/function undoDraftEdit\(\) \{[\s\S]*?\n  \}/);
  const redoHandler = source.match(/function redoDraftEdit\(\) \{[\s\S]*?\n  \}/);
  assert.ok(undoHandler && redoHandler, "undo/redo handlers should be source-visible");
  assert.match(undoHandler[0], /historyAdjacencyBroken\(result\.entry\.after\)/);
  assert.match(redoHandler[0], /historyAdjacencyBroken\(result\.entry\.before\)/);
  assert.match(source, /draftStatesEquivalent\(createDraftSnapshot\(localSeats, localEmployees\), expectedCurrent\)/);
  // The user-facing explanation must live in dedicated state: the inspector's
  // reset/seat-sync paths call onError(null), which wipes actionError in the
  // same render cycle the fence fires (found live on the PR #99 preview).
  assert.match(staleHandler[0], /setStaleDraftNotice\(/);
  assert.doesNotMatch(staleHandler[0], /setActionError\(`/);
});

test("the save and vacate paths both thread the per-seat fence and route STALE_DRAFT to the parent", async () => {
  const source = await readFile(new URL("../components/seat-map/SeatInspector.tsx", import.meta.url), "utf8");
  const vacateSource = await readFile(new URL("../lib/seatDraftActions.ts", import.meta.url), "utf8");
  const hookSource = await readFile(new URL("../components/seat-map/useSeatDraftActions.ts", import.meta.url), "utf8");

  // This used to count two `expectedUpdatedAt: selectedSeat.updated_at` inputs
  // in one file, because the inspector was the only surface that wrote a seat.
  // Vacate moved out so the canvas action bar shares one path with it, so the
  // guarantee is now checked where each half actually lives. Same two rules,
  // and one more file's worth of them — do not collapse this back to a count.

  // Save path: still builds its own input inline in the inspector.
  assert.match(source, /expectedUpdatedAt: selectedSeat\.updated_at/);
  assert.match(source, /result\.code === "STALE_DRAFT"/);
  assert.match(source, /onStaleDraft\(result\.message\)/);

  // Vacate path: the payload carries the fence through verbatim...
  assert.match(vacateSource, /expectedUpdatedAt: seat\.updated_at/);
  assert.match(vacateSource, /result\.code === "STALE_DRAFT"/);
  // ...and a rejected write reaches the parent's stale recovery rather than
  // being surfaced as a generic error the user can only retry into.
  assert.match(hookSource, /outcome\.kind === "stale"/);
  assert.match(hookSource, /onStaleDraft\(outcome\.message\)/);
});

test("settings JSON restore fences on the draft the page loaded", async () => {
  const source = await readFile(new URL("../components/admin-settings/DataUtilitiesPanel.tsx", import.meta.url), "utf8");

  assert.match(source, /restoreDraftSnapshotAction\(review\.snapshot, listDraftSeatExpectations\(seats\)\)/);
  assert.match(source, /router\.refresh\(\)/);
});

test("force-move outcomes reconcile the vacated source seat locally", async () => {
  const seatMapSource = await readFile(new URL("../components/seat-map/SeatMap.tsx", import.meta.url), "utf8");
  // Both force_move commit paths must clear the mover's previous seat before
  // recording history, or undo snapshots bake in a double assignment.
  assert.match(seatMapSource, /replaceSeat\(vacateOtherSeatsForEmployee\(beforeSnapshot\.seats, seat\), seat\)/);
  assert.match(seatMapSource, /replaceSeat\(vacateOtherSeatsForEmployee\(beforeSnapshot\.seats, result\.seat\), result\.seat\)/);
});
