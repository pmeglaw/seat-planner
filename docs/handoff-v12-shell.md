# v12 admin shell — where this stands

Branch `feat/v12-shell-action-bar`, five commits on `f18efc1`. Not pushed.
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

## Next, in order

1. **Remove the dead `onStartSwapSeat` prop.** Still in `SeatInspector`'s props
   type and destructure, still passed by `SeatMap`, consumed by nothing since
   the verbs moved.
2. **Account for lint warnings going 26 → 31**, all
   `react-hooks/set-state-in-effect`. At least one is the new
   `startAssignmentSignal` effect in `SeatInspector`. Decide fix-or-accept —
   don't just restate the count.
3. **Delete `app/concepts/action-bar/` and `app/concepts/inspector/`.** Both are
   superseded by the shipped `SeatActionBar` and the stripped inspector, and a
   mock that disagrees with shipped code misleads. Keep `nav-rail` and
   `login-v12`; they describe work that isn't built.
4. **Live-verify one vacate end to end at `/admin`.** It is the only path proven
   by tests alone. Local dev writes to the **production** draft layer, so
   nominate a seat, record its baseline first, and undo after.
5. **Retire Move.** "Seats never move, people do." Removing the button makes
   `moveSeatAction`, `moveMode`/`dragState`/`handleMovePointerDown`, "Reset
   position to published", the `start-move-seat` guard arm, and
   `publishSummary`'s `seatMoves` all unreachable. Coordinates do **not** die:
   Add seat still writes x/y and undo/redo still restores them.
6. **The nav rail (§1)** — mock at `/concepts/nav-rail`. The risk is not the
   CSS, it is creating `app/admin/layout.tsx`:
   - `getAdminPageContext` is not `cache()`-wrapped, and
     `revalidatePath("/admin")` fires from **18** call sites in `app/actions.ts`,
     so a layout-level auth check re-runs on every seat edit.
   - The unsaved-edits guard lives inside `SeatMap`, so a layout-mounted rail can
     only reach it through a client provider wrapping `{children}`.
   - `applyInspectorGuardAction` ends in `window.location.assign` — a full
     document load, which would remount the rail on every discard.

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
| **Move is retired** | From the row now; the capability in step 5. |

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
