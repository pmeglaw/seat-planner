# Plan 022: Never strand the map frame at a partial inspector-nudge translate

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 52b652f..HEAD -- components/seat-map/useInspectorNudge.ts lib/animateValue.ts lib/mapViewport.ts tests/`
> If `useInspectorNudge.ts` changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (animation-timing code shared by both map surfaces)
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `52b652f`, 2026-08-13

## Why this matters

The inspector nudge shifts the map frame left (a `style.translate` tween) so
a selected seat clears the floating inspector, and unwinds it on deselect.
Interrupting the 200ms unwind — deselect seat A, then select seat B inside
that window — cancels the unwind tween mid-flight WITHOUT settling the
translate. If seat B needs no nudge (`planInspectorNudge` returns null), the
trigger effect returns early and nothing ever repairs the leftover offset:
the floor plan and every marker sit shifted (up to ~90px) from the true
scroll position for the rest of the selection. Reachable by ordinary fast
clicking between seats, on BOTH the admin map and the viewer (both mount
this hook). It self-heals only on the next deselect.

## Current state

- `components/seat-map/useInspectorNudge.ts` (155 lines) — the hook, sole
  owner of `frameRef.current.style.translate`. Key pieces:
  - `cancelNudge` (lines 57–60) stops the in-flight `animateValue` tween but
    never settles the translate:

```ts
  const cancelNudge = useCallback(() => {
    nudgeCancelRef.current?.();
    nudgeCancelRef.current = null;
  }, []);
```

  - `setFrameTranslate` (lines 66–70) writes `frameTranslateRef.current`
    and the DOM style.
  - The **trigger effect** (lines 74–131): double-rAF, then
    `cancelNudge()` (line 98), then three early returns that can leave a
    stale nonzero translate behind: the skip-with-scroll-room return
    (lines 91–94, BEFORE the cancel), the resolver-null return (line 100),
    and the plan-null return (line 107). Its cleanup (lines 126–130)
    cancels the rAFs and the tween.
  - The **restore effect** (lines 135–152): when nothing is selected
    (`shouldRest`), tweens the translate back to 0 over 200ms. Its cleanup
    (line 151) is `() => cancelNudge()` — the mid-unwind freeze happens
    here when a new selection re-renders while the unwind runs.
- `lib/mapViewport.ts:282` — `planInspectorNudge` returns `null` when the
  seat already clears the inspector threshold; the doc comment says
  "callers must not animate at all in that case". That contract is why the
  early return exists; the fix must keep honoring it for the NUDGE while
  still unwinding any RESIDUAL translate.
- `lib/animateValue.ts` — the tween. Already **injectable for tests** by
  design (its header: "The clock (raf/now) is injectable so node:test can
  drive it deterministically"); `reducedMotion: true` or `durationMs <= 0`
  lands immediately and synchronously (lines 34–38).
- Bug sequence, concretely: (1) seat A selected at the right edge → nudge
  completes, `frameTranslateRef.current = 90`. (2) Deselect → restore
  effect starts the 200ms unwind. (3) Within 200ms, select seat B → restore
  cleanup fires `cancelNudge()` freezing translate at e.g. 45; restore
  re-runs but `shouldRest` is false → returns. (4) Trigger effect runs for
  B; `planInspectorNudge` returns null (B is clear of the panel) → early
  return at line 107 → translate stays 45 forever.
- Test harness facts (`tests/helpers/renderComponent.mjs`):
  - `loadComponent(specifier)` (line ~253) returns a module's exports —
    hooks can be tested via a tiny host component.
  - jsdom runs with `pretendToBeVisual` (rAF exists, timer-backed ~16ms).
  - The `matchMedia` double evaluates only `min-width`/`max-width` queries;
    `(prefers-reduced-motion: reduce)` returns `matches: false` — so the
    hook's real tweens RUN asynchronously in jsdom. Do not fight this with
    real-time waits; inject the clock instead (Step 1 makes that possible).
  - Existing hook/component test files to model on:
    `tests/viewer-seat-finder.test.mjs` (mounting + geometry stubs).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install (if needed) | `npm install` | exit 0 (NOT `npm ci`) |
| New test file | `node --test tests/use-inspector-nudge.test.mjs` | all pass |
| Component tier | `npm run test:ct` | all pass (the tier-membership guard `tests/test-tier-scripts-source.test.mjs` will FAIL `npm test` if the new file imports the ct harness but is missing from the `test:ct` script — add it there) |
| Typecheck | `npm run typecheck` | exit 0 |
| Full suite | `npm test` | ~1090+ pass / 0 fail |
| Lint | `npm run lint` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `components/seat-map/useInspectorNudge.ts`
- `tests/use-inspector-nudge.test.mjs` (create)
- `package.json` (ONLY to append the new test file to the `test:ct` script
  list — required by the tier guard)

**Out of scope** (do NOT touch):
- `lib/animateValue.ts` — already injectable; no change.
- `lib/mapViewport.ts` / `planInspectorNudge` — its null contract is
  correct; the fix lives in the hook.
- `SeatMap.tsx` / `ViewerSeatFinder.tsx` call sites — the hook's public
  signature may gain an OPTIONAL test-only parameter (Step 1) but existing
  call sites must not need edits.
- The #341 fix (cancelling tweens on unmount) — do not reintroduce a tween
  that outlives the component.

## Git workflow

- Branch: `advisor/022-nudge-translate-strand`
- Conventional commits (e.g. `fix(map): settle the nudge translate on every early exit`)
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Thread the tween's injectability through the hook

Add an optional `animate` parameter to the hook's props, defaulting to the
real implementation:

```ts
import { animateValue } from "@/lib/animateValue";
...
export function useInspectorNudge({
  ...,
  resolveSeatVisualX,
  // Injectable for tests only — animateValue's own raf/now injection can't
  // be reached through the hook otherwise. Production callers omit it.
  animate = animateValue
}: {
  ...
  animate?: typeof animateValue;
}) {
```

Replace both internal `animateValue(...)` calls with `animate(...)`. Keep
the resolver-ref discipline the file already documents (the new parameter is
read inside effects; mirror it through a ref exactly the way
`resolveRef` mirrors `resolveSeatVisualX` at lines 52–55, so effect deps
stay selection-driven).

**Verify**: `npm run typecheck` → exit 0; `npm run lint` → exit 0 (the
`react-hooks` rules are strict here — follow them, do not suppress).

### Step 2: Extract and reuse a single unwind path

Currently the unwind tween exists only in the restore effect (lines
138–150). Extract it into a `useCallback` (e.g. `startUnwind()`), guarded by
`frameTranslateRef.current !== 0`, that: cancels any in-flight tween, tweens
`frameTranslateRef.current → 0` via `animate`, honoring
`prefers-reduced-motion` the way the existing code does, and stores the
cancel in `nudgeCancelRef`. The restore effect body becomes a call to it.

**Verify**: `npm run typecheck` → exit 0.

### Step 3: Unwind residual translate on every no-nudge exit

In the trigger effect's inner rAF, change the three early-return paths so
none of them can leave a nonzero translate behind:

- the skip return (lines 91–94, the scroll-room branch),
- the resolver-null return (line 100),
- the plan-null return (line 107)

— each becomes: `if (frameTranslateRef.current !== 0) startUnwind(); return;`
Keep `planInspectorNudge`'s contract intact: the NUDGE still never animates
for a clear seat — the unwind is repairing leftover state, not nudging. Add
a comment on the plan-null branch naming the bug it closes (fast reselect
during the restore unwind froze a partial translate; see plan 022).

Note the ordering subtlety: `cancelNudge()` at line 98 already runs before
the resolver/plan returns — the skip return at 91–94 runs BEFORE it, so
`startUnwind()` there must itself cancel first (Step 2's helper does).

**Verify**: `npm run typecheck` → exit 0; `npm run lint` → exit 0.

### Step 4: Test the strand scenario deterministically

Create `tests/use-inspector-nudge.test.mjs` in the jsdom ct tier (import
the harness like `tests/viewer-seat-finder.test.mjs` does; add the file to
`test:ct` in `package.json`).

Test rig:
- A tiny host component that renders a viewport div containing a frame div,
  wires real refs to them, and calls `useInspectorNudge` with a
  controllable `selectedSeatId` prop, `panelBreakpointPx: 0` (so the
  breakpoint gate passes at any jsdom width), a `resolveSeatVisualX` stub
  the test steers per seat id, and an injected `animate` implementation.
- Geometry: `Object.defineProperty` the viewport/frame elements'
  `offsetLeft`/`offsetWidth`/`clientWidth`/`scrollWidth` (and
  `scrollLeft` as a writable property) so `planInspectorNudge` produces —
  for seat "A" — a plan with `translateDelta > 0` and no scroll room
  (`scrollWidth === clientWidth`), and — for seat "B" — null (resolve B far
  left, e.g. `seatVisualX 0.05`). Import `INSPECTOR_FLOAT_*` constants from
  `@/lib/mapViewport` if exported (check; otherwise pick a viewport width
  large enough that A at `seatVisualX 0.98` lands right of the panel edge —
  compute from the constants in the source).
- Injected `animate`: a manual-pump fake — records `{from, to, onUpdate,
  onDone}`, returns a cancel fn, and exposes `pump(t)` to the test to drive
  `onUpdate` partway and `finish()` to complete. This gives the test exact
  control over "mid-unwind".

Tests (drive with `act()` + the harness's rAF flush helper):
1. `"a completed nudge translates the frame"` — select A, flush rAFs, pump
   the tween to completion → `frame.style.translate` is a negative-x value;
   `frameTranslateRef` equivalent observable: style not empty.
2. `"fast reselect during the unwind settles the frame at zero"` — the bug:
   select A → complete nudge; deselect (null) → unwind tween starts; pump
   the unwind HALFWAY only; select B (plan-null geometry) → flush rAFs →
   the fix should start a repair unwind — finish it → assert
   `frame.style.translate === ""` (the hook writes `""` at 0). Mutation
   check: revert Step 3's plan-null branch, rerun, confirm this FAILS with
   a stuck non-empty translate; re-apply.
3. `"deselect still unwinds"` — regression on the restore path: select A,
   complete, deselect, finish unwind → translate `""`.
4. `"unmount mid-tween cancels without writing"` — regression on #341:
   select A, pump partway, unmount host → no further `onUpdate` calls (the
   fake records calls; count stops).

**Verify**: `node --test tests/use-inspector-nudge.test.mjs` → all pass,
including the mutation check performed for test 2.
`npm run test:ct` → all pass. `npm test` → 0 fail (the tier guard passes
because package.json lists the new file).

### Step 5: Full gate

**Verify**: `npm test` → 0 fail. `npm run typecheck` → exit 0.
`npm run lint` → exit 0.

## Test plan

Covered in Step 4 — four deterministic jsdom tests with an injected tween,
no real-time waits. This also gives `useInspectorNudge` its first executing
test (it is currently regex-pinned only — T-10's cluster in
`plans/README.md`; this plan closes the gap for THIS hook only).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `node --test tests/use-inspector-nudge.test.mjs` exits 0 (4 tests)
- [ ] `package.json` `test:ct` includes `tests/use-inspector-nudge.test.mjs`
- [ ] `npm run test:ct` exits 0
- [ ] `npm test` exits 0; `npm run typecheck` exits 0; `npm run lint` exits 0
- [ ] Both `SeatMap.tsx` and `ViewerSeatFinder.tsx` are UNMODIFIED (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any "Current state" excerpt doesn't match the live code (drift).
- The `react-hooks` lint rules reject the `animate` ref-mirror pattern in a
  way the existing `resolveRef` pattern doesn't explain — do not suppress
  rules; report the conflict.
- Test 2 passes even WITHOUT Step 3's fix (mutation check does not fail) —
  the rig is not reproducing the strand; report the rig's actual behavior
  instead of shipping a test that asserts nothing.
- You need to modify `SeatMap.tsx` or `ViewerSeatFinder.tsx` to make the
  hook testable — the plan's claim that the optional parameter suffices is
  then wrong; report.
- jsdom geometry stubbing cannot steer `planInspectorNudge` (e.g. the
  constants make a null-plan seat unreachable) — report the numbers you
  tried rather than loosening assertions.

## Maintenance notes

- The residual-unwind on the skip path (lines 91–94) also covers a
  previously unreported variant (skip armed while a translate lingers).
  A reviewer should confirm no interaction with the programmatic-center
  flow: the unwind animates `style.translate` only, never `scrollLeft`, so
  it cannot race the center's smooth scroll.
- Known edge deliberately out of scope: a selection surviving a viewport
  resize BELOW `panelBreakpointPx` can still strand a translate (the
  breakpoint gate returns before any unwind). Pre-existing, needs a resize
  listener to fix — record it, don't fix it here.
- If a future refactor extracts the viewport block (D-09 in
  `plans/README.md`), this hook's test rig is the pattern to reuse.
