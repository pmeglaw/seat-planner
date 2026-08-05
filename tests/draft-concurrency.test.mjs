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

test("settings CSV import fences on the draft captured when the CSV was parsed", async () => {
  const source = await readFile(new URL("../components/admin-settings/DataUtilitiesPanel.tsx", import.meta.url), "utf8");
  const actionsSource = await readFile(new URL("../app/actions.ts", import.meta.url), "utf8");

  // Captured at parse time (into the review state), not re-read at confirm
  // time: the fence must describe the draft the admin actually reviewed.
  assert.match(source, /expectedSeats: listDraftSeatExpectations\(seats\)/);
  assert.match(source, /importAssignmentsCsvAction\(review\.text, review\.expectedSeats\)/);

  // The action forwards the expectations verbatim (never through Date) and
  // returns MLS02 as STALE_DRAFT so the client can reload and retry.
  assert.match(actionsSource, /expected_seats: expectedSeats \?\? null/);
  assert.match(actionsSource, /isStaleDraftErrorCode\(\(importError as SupabaseMutationError\)\.code\)/);
});

test("force-move outcomes ingest the fresh draft payload instead of a stale client-side vacate", async () => {
  // Fix round 1 (2026-07-30): a force_move also vacates the mover's OTHER
  // draft seat server-side, bumping its updated_at. Reconstructing that seat
  // by spreading the client's stale pre-mutation copy (the original
  // vacateOtherSeatsForEmployee approach) baked a stale timestamp into
  // localSeats and made the next Undo bounce off the per-row concurrency
  // fence (MLS02) — reproduced live. Both force_move commit paths must
  // instead ingest the fresh `seats`/`employees` updateSeatAction now returns
  // (same helper swap already uses), so both consumers must NOT reconstruct
  // the vacated seat from a client-side spread.
  const seatMapSource = await readFile(new URL("../components/seat-map/SeatMap.tsx", import.meta.url), "utf8");
  const actionsSource = await readFile(new URL("../app/actions.ts", import.meta.url), "utf8");
  const inspectorSource = await readFile(new URL("../components/seat-map/SeatInspector.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(seatMapSource, /vacateOtherSeatsForEmployee/);

  // updateSeatAction's success result carries the fresh full draft payload.
  assert.match(actionsSource, /return \{ ok: true, seat, \.\.\.\(await getDraftMapPayload\(supabase\)\) \}/);

  // Bar Move (confirmMoveEmployeeToOpenSeat): ingests result.seats/employees wholesale.
  assert.match(seatMapSource, /const afterSeats = normalizeSeats\(result\.seats\);\s*\n\s*const afterEmployees = result\.employees;/);

  // applySeatUpdated: ingests the fresh payload wholesale when the caller (a
  // force_move) hands one in, falling back to the plain spread otherwise.
  assert.match(seatMapSource, /freshDraftPayload \? normalizeSeats\(freshDraftPayload\.seats\) : replaceSeat\(beforeSnapshot\.seats, seat\)/);
  assert.match(seatMapSource, /freshDraftPayload \? freshDraftPayload\.employees : replaceEmployee\(beforeSnapshot\.employees, seat\)/);

  // SeatInspector's "Move them?" retry hands applySeatUpdated the fresh
  // payload exactly when it force_moved, never otherwise.
  assert.match(inspectorSource, /onSeatUpdated\(updated, beforeSnapshot, input\.forceMove \? \{ seats: result\.seats, employees: result\.employees \} : undefined\)/);
});
