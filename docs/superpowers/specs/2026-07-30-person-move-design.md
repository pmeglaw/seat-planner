# Person-centric Move — design

- **Date:** 2026-07-30
- **Branch:** `feat/v12-shell-action-bar`
- **Status:** Approved by owner (this session)

## Why

The app's interaction model is **person > action**. "Move" was always intended to relocate the *occupant* to another seat. The shipped implementation instead moved the *seat marker's position* on the map (geometry) — the wrong semantic. That geometry Move is currently hidden behind `MOVE_UI_ENABLED = false` in `components/seat-map/SeatInspector.tsx` (owner call, 2026-07-30). The flag's docstring asked for an owner decision on the product claim "seats never move, people do"; this spec records that decision: **the claim is confirmed as product intent**. The geometry capability retires outright, and the Move name is reassigned to the person action.

## Owner decisions

1. **Geometry-move machinery:** retire outright (not kept hidden, not renamed).
2. **Destination selection:** click the target seat on the map — the same mode pattern Swap uses.
3. **Occupied destination:** offer a swap instead of erroring, consistent with the codebase's existing conflict-becomes-offer philosophy (today's double-booking "Move them?" dialog).

## Part 1 — retire geometry move

Delete, following the enumeration in `docs/handoff-v12-shell.md`:

- `moveSeatAction` in `app/actions.ts`. The SQL function it called stays in `supabase/migrations/` untouched — migrations are history; the function simply becomes uncalled.
- `SeatMap.tsx`: move-seat mode state, `dragState`, `handleMovePointerDown` and related drag plumbing, the `start-move-seat` guard arm, and the mode's Esc/cancel handling.
- `SeatInspector.tsx`: the `MOVE_UI_ENABLED` constant and its guarded JSX, the `onStartMoveSeat` / `moveMode` props, and the move-mode microcopy.
- `lib/publishSummary.ts`: the `seatMoves` diff category, plus its rendering in the publish review and its test coverage.
- **"Reset position to published": delete as well.** Verified live 2026-07-30 against prod: a draft-vs-published position drift query returned zero rows, so no existing draft depends on this escape hatch.

Leave intact: the assignment flow's "Move them?" double-booking dialog in `SeatInspector` (same person-move semantic, different entry point), and `update_draft_seat`'s `force_move` behavior.

## Part 2 — person-centric Move

Mirrors Swap's architecture exactly: verb button in the inspector, mode logic in `SeatMap`.

- The Move button appears in the inspector action row (Change / Move / Swap / Vacate) **only for occupied seats** — it acts on the occupant. Accessible name: "Move {name} to another seat".
- Button fires `onStartMoveEmployee` → `SeatMap` enters move mode (`moveEmployeeSourceSeatId`), with a dirty-inspector guard arm `start-move-employee` (same pattern as `start-swap-seat`).
- **Click an open destination seat** → confirm dialog: "Move {A} to {B}? Frees {source seat} (it becomes Open)." Confirm executes the existing `update_draft_seat` RPC with `force_move` — already atomic and concurrency-fenced. **No new RPCs, no migrations.**
- **Click an occupied destination seat** → swap offer: "{B} sits there — swap {A} and {B}?" Confirm executes the existing `swap_draft_seat_assignments` RPC.
- **Esc** cancels the mode. Clicking the source seat itself cancels with a neutral notice.

## Edge handling

- Stale draft: existing SQLSTATE `MLS02` handling covers both RPC paths — no new code.
- Undo/redo: capture a before-snapshot exactly as Swap does, so the move (or swap) is one undo step.
- Move never displaces anyone into unassigned — occupied destinations route to swap, and declining the swap leaves everything unchanged.

## Tests

- Update `tests/seat-inspector.test.mjs` and the SeatMap jsdom component tier for the new verb, mode, and dialogs.
- `lib/publishSummary` tests: drop `seatMoves` expectations.
- `tests/accessibility-source.test.mjs`: mode microcopy, `aria-pressed`/labels, dialog semantics for both confirm dialogs.
- Transaction-safety tests referencing `moveSeatAction`: remove or repoint.
- Source-test guardrails (`seat-creation-ui-source`, `desktop-seat-marker-system-source`) must stay green — calibration constants and draft-only mutation lines are untouched by this work.

## Out of scope

- Any change to the assignment flow's employee picker or the "Move them?" dialog copy.
- Seat geometry editing of any kind (the product claim is: seats never move).
- New RPCs, migrations, or publish-summary categories.

## Verification

- `npm test` and the jsdom component tier pass; coverage floors hold.
- Manual real-browser verification via the `run-seat-planner` skill: move to open seat, move onto occupied seat (swap offer), Esc cancel, dirty-guard, undo. Auth-gated flows are not e2e-covered, so this manual pass is mandatory.
