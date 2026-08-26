import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// AUDIT-2 F-ERR-1: expected/validation failures are RETURNED, never thrown.
// A thrown error inside a production Server Action is digest-stripped by
// Next.js, so every `throw new Error("friendly text")` ships gibberish to the
// user while the written fallback in the client catch stays dead code. The
// rule already lives as a comment in app/actions.ts (above updateSeatAction);
// this suite makes it survive context loss for the two actions that violated
// it, and pins that their call sites consume the returned union.

async function readSource(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

function actionSlice(source, name) {
  const start = source.indexOf(`export async function ${name}(`);
  assert.notEqual(start, -1, `${name} should be source-visible as an exported async function.`);
  const end = source.indexOf("\nexport ", start + 1);
  assert.notEqual(end, -1, `${name} should be followed by another export.`);
  return source.slice(start, end);
}

test("createSeatAction returns expected failures instead of throwing", async () => {
  const source = await readSource("../app/actions.ts");
  const slice = actionSlice(source, "createSeatAction");

  assert.doesNotMatch(
    slice,
    /throw new Error/,
    "createSeatAction must not throw expected failures — production digest-strips them (see the returned-not-thrown comment in this file)."
  );
  assert.match(slice, /ok:\s*false/, "createSeatAction should return an { ok: false, message } union arm.");
  assert.match(slice, /ok:\s*true/, "createSeatAction should return an { ok: true, seat } union arm.");
});

test("deleteSeatAction returns expected failures instead of throwing", async () => {
  const source = await readSource("../app/actions.ts");
  const slice = actionSlice(source, "deleteSeatAction");

  assert.doesNotMatch(
    slice,
    /throw new Error/,
    "deleteSeatAction must not throw expected failures — production digest-strips them."
  );
  assert.match(slice, /ok:\s*false/, "deleteSeatAction should return an { ok: false, message } union arm.");
  assert.match(slice, /ok:\s*true/, "deleteSeatAction should return an { ok: true, seatId } union arm.");
});

// Client catch blocks must not prefer error.message: expected failures arrive
// as returned values, so a caught throw is unexpected and its message is a
// production digest. The written fallback goes through clientActionErrorMessage
// (lib/clientActionError.ts), which logs the original for dev.
// Deliberate exception, ruled 2026-08-26: AskPlannerDrawer maps CLIENT-side
// network failure text through friendlyDrawerError — askPlannerAction returns
// its failures, so nothing digest-stripped reaches that catch.
const SWEPT_CLIENT_FILES = [
  "../components/seat-map/SeatMap.tsx",
  "../components/seat-map/usePublishReview.ts",
  "../components/seat-map/useDraftHistory.ts",
  "../components/seat-map/useSeatDraftActions.ts",
  "../components/seat-map/SeatInspector.tsx",
  "../components/admin-management/AdminManagementPanel.tsx",
  "../components/admin-settings/DataUtilitiesPanel.tsx"
];

test("client catches surface written fallbacks, not digest-stripped messages", async () => {
  for (const path of SWEPT_CLIENT_FILES) {
    const source = await readSource(path);
    assert.doesNotMatch(
      source,
      /instanceof Error\s*\?\s*\w+\.message/,
      `${path} must not prefer a caught error's message — production digest-strips it; use clientActionErrorMessage(error, fallback).`
    );
    assert.match(
      source,
      /clientActionErrorMessage/,
      `${path} should route caught errors through clientActionErrorMessage.`
    );
  }
});

test("a confirmed vacate that turned ineligible tells the admin instead of silently returning", async () => {
  const source = await readSource("../components/seat-map/SeatMap.tsx");
  const start = source.indexOf("function confirmVacateFromBar()");
  assert.notEqual(start, -1, "confirmVacateFromBar should be source-visible.");
  const slice = source.slice(start, source.indexOf("\n  }", source.indexOf("canVacateSeat(seatToVacate)", start)));

  // F-ERR-2 (AUDIT-2 §8.3): the admin confirmed a destructive action; the
  // ineligible-at-confirm branch must surface something, never bare-return.
  assert.match(
    slice,
    /can no longer be vacated/,
    "the ineligible-at-confirm branch must set an action error naming what happened."
  );
  assert.match(slice, /setActionError\(/, "the ineligible branch surfaces via the action error banner.");
});

test("canvas seat creation is single-flight — a second click cannot mint a second seat", async () => {
  const source = await readSource("../components/seat-map/SeatMap.tsx");
  const start = source.indexOf("function handleMapPointerDown(");
  assert.notEqual(start, -1, "handleMapPointerDown should be source-visible.");
  const branch = source.slice(start, source.indexOf("createSeatAction(", start));

  // AUDIT-2 §8.1 double-click exposure: nothing marked the add-seat canvas
  // path in-flight, so two rapid clicks fired two createSeatAction calls —
  // two seats from one intent. The branch must consult mutationInFlight
  // BEFORE reaching the action, and mark it synchronously (in the event
  // handler, not inside the transition) so the second discrete click sees it.
  assert.match(branch, /mutationInFlight/, "the add-seat branch must consult the in-flight flag before creating.");
  assert.match(
    branch,
    /setMutationInFlight\(true\);\s*\n\s*startTransition/,
    "the in-flight flag must be set synchronously before the transition, not inside it."
  );
});

test("delete confirm is single-flight", async () => {
  const source = await readSource("../components/seat-map/SeatMap.tsx");
  const start = source.indexOf("function confirmDeleteSelectedSeat()");
  assert.notEqual(start, -1, "confirmDeleteSelectedSeat should be source-visible.");
  const slice = source.slice(start, source.indexOf("deleteSeatAction(", start));

  assert.match(slice, /if \(mutationInFlight\) return;/, "a delete confirm mid-flight must be a no-op.");
  assert.match(
    slice,
    /setMutationInFlight\(true\);\s*\n\s*startTransition/,
    "the in-flight flag must be set synchronously before the transition."
  );
});

// SeatMap cannot be jsdom-rendered (test-tiers: live layout measurement never
// converges on zero-size geometry), so the zero-draft first-run state is
// pinned at source level like its siblings in this file.
test("the admin map names the zero-draft first-run state instead of a bare floor plan", async () => {
  const source = await readSource("../components/seat-map/SeatMap.tsx");
  assert.match(source, /No seats in the draft yet/i, "the zero-draft state should exist and name itself.");
  assert.match(
    source,
    /visualLocalSeats\.length === 0/,
    "the state must key off the draft seat set the canvas actually renders."
  );
  assert.match(source, /Add seat/, "the first-run copy should point at the add-seat affordance.");
});

test("SeatMap consumes the create/delete unions and surfaces their messages", async () => {
  const source = await readSource("../components/seat-map/SeatMap.tsx");

  const createCall = source.match(/const created = await createSeatAction\([\s\S]*?\n\s*\}\);/);
  assert.ok(createCall, "SeatMap's create handler should be source-visible.");
  assert.match(
    source,
    /created\.ok/,
    "The create call site must branch on the returned union, not a try/catch of thrown text."
  );
  assert.match(
    source,
    /result\.ok[\s\S]*?deleteSeatAction|deleteSeatAction[\s\S]{0,600}?\.ok/,
    "The delete call site must branch on the returned union."
  );
});
