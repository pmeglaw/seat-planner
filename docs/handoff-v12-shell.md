# v12 admin shell — where this stands

Branch `feat/v12-shell-action-bar`, eight commits on `f18efc1`. Not pushed.
Green at the tip: `npm test` 623/623 · `npm run test:ct` 41/41 ·
`npm run coverage:check` passes · `typecheck` 0 · `lint` 0 errors.

The design handoff lives in `design_handoff_shell_v12/` (gitignored — local
reference material, not source). Its §3 (contextual Publish) and §4 (header
cells + People panel) are **untouched**.

## Get oriented from the code, not from this file

This document goes stale; the code does not. Read, in order:

1. `git log -1 044dff4` — the action-bar commit message carries the design
   rationale and the reasoning behind each call.
2. `lib/seatDraftActions.ts` and `components/seat-map/SeatActionBar.tsx` —
   their docstrings explain the load-bearing details, including the ones that
   look like tidy-up targets and are not.

## What shipped

- **`--admin-chrome-h`** — the admin bar height, spelled once. Nine literals
  derived from it collapsed into one token, consumed by both bars, the
  inspector, the results panel, the Ask Planner drawer, and
  `html{scroll-padding-top}`. No visual change; the bar stays 36px.
- **`components/ui/adminChrome.ts`** — the two admin bars' duplicated class
  strings, which had already drifted apart.
- **Fluid fields on `/login`** — label inside, bottom rule only, 56px. Fields
  only; the card, tabs and buttons are unchanged.
- **`lib/seatDraftActions.ts` + `components/seat-map/useSeatDraftActions.ts`** —
  the shared vacate path. Pure core in `lib/` (tested, and inside
  `coverage:check`'s scope); React half in `components/` because a hook cannot
  be exercised by the plain `node --test` tier and would have sunk the floors.
- **`components/seat-map/SeatActionBar.tsx`** — the canvas action bar, wired
  into `SeatMap`, with the seat verbs removed from `SeatInspector`.
- **The dead code the verb move left behind** (`763420d`) — `onStartSwapSeat`
  and `SeatMap`'s pass-through, the `adminDangerButtonClassName` import,
  `vacateConfirmOpen` + its two resets, `vacateDialogFocusRef`,
  `footerDangerButtonClass`. Lint is back to its 26 baseline.
  The earlier claim that the 26 → 31 delta was `react-hooks/set-state-in-effect`
  from the new `startAssignmentSignal` effect was **wrong**: all five new
  warnings were `no-unused-vars` in `SeatInspector`, confirmed by diffing
  identifier usage against `f18efc1`. `startAssignmentSignal` adds a sixth
  `useEffect` and no warning. `handleResetEdits` is still unused — it was
  already unused at `f18efc1`, so it is left alone deliberately.
- **The superseded mocks deleted** (`880d489`) — `app/concepts/action-bar/` and
  `app/concepts/inspector/`. `nav-rail` and `login-v12` kept at the time;
  `nav-rail` was itself deleted later as superseded (v12 slice 2, 2026-07-31 —
  see §1 below). `login-v12` remains.
- **Geometry Move retired outright, 2026-07-30** — not hidden behind a flag.
  The prior entry here described `MOVE_UI_ENABLED` gating the JSX so the drag
  machinery stayed referenced and reversible by one boolean; the owner
  revisited that call the same day and confirmed the product claim it was
  waiting on: "seats never move, people do" — the app is person > action, and
  seat geometry is fixed. That settles it, so the geometry capability was
  deleted rather than kept dormant: `moveSeatAction`, `moveMode`/`dragState`/
  `handleMovePointerDown`, "Reset position to published", the
  `start-move-seat` guard arm, and `publishSummary`'s `seatMoves` category are
  all gone. Coordinates did **not** die with it — Add seat still writes x/y
  and undo/redo still restores them; position drift is still detectable, just
  folded into `publishSummary`'s `otherChanges` instead of its own category.
  In its place, **Move now means relocating the occupant**: a verb on the
  canvas `SeatActionBar` for occupied seats (bar reads Move · Swap · Vacate),
  mirroring Swap's architecture — click a destination seat on the map; an open
  destination offers a relocate confirm, an occupied one offers a swap
  (backed by the same existing `update_draft_seat`/`force_move` and
  `swap_draft_seat_assignments` RPCs Swap already used — no new RPCs, no
  migrations). Full rationale and edge-case handling:
  `docs/superpowers/specs/2026-07-30-person-move-design.md`, implemented via
  `docs/superpowers/plans/2026-07-30-person-centric-move.md`.

- **One vacate live-verified end to end** at `/admin` against the production
  draft layer (2026-07-30, owner-approved, subject seat `W08`). Verified in the
  database, not from the pill — the pill is documented to lag:
  - `status` assigned → available, `employee_id` → null.
  - **`zone` survived** as "West Pod" and **`notes` survived** verbatim. These
    are the two claims in `buildVacateSeatInput`'s docstring that no test can
    prove against the real column defaults, and both held.
  - `x`/`y` untouched; `updated_at` bumped, so the trigger fired.
  - **`layer='published'` was byte-identical throughout** — viewers saw nothing.
  - Undo restored the row exactly; the draft↔published diff went 0 → 1 → **0**
    across all 68 seats. Only `updated_at` differs, which is the trigger, not
    content.
  - The bar re-rendered contextually: occupied `Swap · Vacate` → open
    `Assign… · Swap`, hiding rather than greying.

## Next, in order

1. **The nav rail (§1)** — mock at `/concepts/nav-rail`. The risk is not the
   CSS, it is creating `app/admin/layout.tsx`:
   - `getAdminPageContext` is not `cache()`-wrapped, and
     `revalidatePath("/admin")` fires from **18** call sites in `app/actions.ts`,
     so a layout-level auth check re-runs on every seat edit.
   - The unsaved-edits guard lives inside `SeatMap`, so a layout-mounted rail can
     only reach it through a client provider wrapping `{children}`.
   - `applyInspectorGuardAction` ends in `window.location.assign` — a full
     document load, which would remount the rail on every discard.

   **SHIPPED 2026-07-31 (v12 slice 2).** Item 1's rail landed as
   `components/ui/AppRail.tsx`, built to the Carbon v12 geometry the owner
   ruled that day — a 48px collapsed column growing to a 208px overlay — not
   the 36px/232px `app/concepts/nav-rail` mock this item originally pointed
   at (that mock is now deleted; see `docs/DESIGN_DIRECTION.md` §3 and
   `CLAUDE.md`'s concepts list). The `app/admin/layout.tsx` risks above were
   **sidestepped, not solved**: no admin layout was created. The rail is
   page-mounted instead — `SeatMap` renders it directly on `/admin` so
   navigation still routes through the existing unsaved-edits guard
   (`beforeGuardedNavigation`), and `app/admin/management/page.tsx` /
   `app/admin/settings/page.tsx` render it directly beside a now
   identity-only `AdminShellBar`. Account/sign-out moved into the rail's own
   bottom cell.

## Settled — do not reopen

These were decided deliberately, several against the handoff's own text. A fresh
reader will otherwise helpfully re-propose them.

| Decision | Note |
| --- | --- |
| Inspector docks in flow at **288px**, never overlays | The Carbon-v12 prediction argues for a 400px floating panel. Rejected. |
| Chrome bar stays its **original 36px** | A 48px experiment was built and reverted. The token makes revisiting it one line. |
| Match the **live greige palette** | Not the handoff's IBM ramp (`#f4f4f4`, `#e0e0e0`, `#6f6f6f`). |
| Seat verbs live on the **canvas bar**, not the panel | Because the panel keeps a collapse rail, and collapsed is when the map is widest. |
| The bar **confirms vacate every time** | The inspector's straight-through vacate is gone with its button. |
| Geometry Move is **retired outright**; Move now relocates the occupant | Owner-confirmed on 2026-07-30: "seats never move, people do." The drag/geometry machinery, `moveSeatAction`, and `publishSummary`'s `seatMoves` category are deleted, not flagged off. Person-centric Move shipped on the canvas `SeatActionBar` instead — see `docs/superpowers/specs/2026-07-30-person-move-design.md`. Don't re-propose a geometry drag affordance. |
| Force-move reconciliation uses **fresh-payload ingestion**, not a client-side vacate helper | Fix round 1, 2026-07-30 (commit `e5c4262`): the original `vacateOtherSeatsForEmployee` helper spread a stale pre-mutation copy of the seat a force-move vacated, and the stale `updated_at` it baked into local state broke the next Undo with `MLS02` — reproduced live against the production draft. `updateSeatAction` now returns the fresh draft payload (`getDraftMapPayload`); both force-move consumers (bar Move, inspector "Move them?") ingest `result.seats`/`result.employees` wholesale instead. The helper is deleted; `tests/draft-concurrency.test.mjs` pins its absence. Don't rebuild it. |

## Traps that cost real time

- **Tailwind serves stale CSS from `.next`** after new files introduce arbitrary
  classes. A server restart is *not* enough — delete `.next`. Symptom: classes
  that exist in the compiled CSS simply don't apply.
- **`resize_window` silently fails when Chrome is maximized.** It returns
  success. Check `window.innerWidth` before trusting any responsive measurement.
- **React does not hydrate on `127.0.0.1:3000`** (Next's dev-origin
  restriction). The page renders, nothing is interactive. Use `localhost`.
- **Never `git add -A`.** `next-env.d.ts`, `skills-lock.json` and
  `.claude/skills/grill-me/` are dirty and are not part of this work.

## One asymmetry worth knowing

`vacateNeedsConfirmation` takes a `fromTransientSurface` flag, and the two
surfaces answer it differently on purpose. Do not simplify it to one rule:
making the panel confirm every time adds a dialog to a flow that already has
Undo behind it, and dropping the bar's confirm puts an unguarded destructive
action on a surface that comes and goes.
