# Plan 015: Cancel the inner rAF and in-flight tween in `useInspectorNudge` cleanups

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 89a8fea..HEAD -- components/seat-map/useInspectorNudge.ts lib/animateValue.ts`
> On any change, compare the "Current state" excerpts against the live code
> before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `89a8fea`, 2026-08-07

## Why this matters

`useInspectorNudge` (shared by the admin SeatMap and the viewer map) scrolls
the selected seat clear of the inspector panel via a double-`requestAnimationFrame`
followed by a 250 ms tween that writes `viewport.scrollLeft` and
`frame.style.translate`. Two cleanup gaps: (1) the trigger effect's cleanup
cancels only the OUTER rAF — once the outer callback has run, the inner rAF is
untracked and fires even after the effect re-ran for a newer selection,
starting a tween for the superseded seat (one-frame scroll jitter on rapid
seat switching); (2) neither effect's cleanup cancels the in-flight tween, so
navigating away mid-nudge (rail navigation unmounts the map) leaves the
animation loop writing to detached DOM nodes for up to 250 ms. Bounded and
non-fatal, but it is a leaked animation loop, and the fix is mechanical.

## Current state

- `components/seat-map/useInspectorNudge.ts` — the hook. The trigger effect
  (lines 74-126) ends:
  ```ts
    const first = requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        // ... plans and starts the tween, storing its canceller:
        // nudgeCancelRef.current = animateValue({ ... })
      });
    });
    return () => cancelAnimationFrame(first);
  }, [selectedSeatId, inspectorHidden, panelBreakpointPx, viewportRef, frameRef, cancelNudge, setFrameTranslate]);
  ```
  The inner rAF's id is never captured. `cancelNudge` (lines 57-60) invokes
  and clears `nudgeCancelRef` — the inner callback already calls it before
  (re)planning ("Finding 3" comment), which is what makes adding it to the
  cleanups behavior-preserving for the within-page path.
- The restore effect (lines 130-146) starts an unwind tween the same way and
  has NO cleanup at all.
- `lib/animateValue.ts` — the tween; re-arms rAF until done; only stop is the
  returned canceller. Do not modify.
- The hook carries dense contract comments ("Finding 1/3", skip-nudge
  semantics). Preserve every existing comment; you are adding cancellation,
  not changing the nudge contract.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install | `npm install` (NOT `npm ci`) | exit 0 |
| Component tier (mounts SeatMap surfaces) | `npm run test:ct` | all pass |
| Full suite | `npm test` | all pass |
| Typecheck / Lint | `npm run typecheck` / `npm run lint` | exit 0 |

## Scope

**In scope**:
- `components/seat-map/useInspectorNudge.ts`
- `plans/README.md` (status row)

**Out of scope** (do NOT touch):
- `lib/animateValue.ts` — correct as designed.
- `lib/mapViewport.ts` (`planInspectorNudge`) and both consuming surfaces
  (`SeatMap.tsx`, `ViewerSeatFinder.tsx`).
- The skip-next / reduced-motion / translate-ownership semantics of the hook.

## Git workflow

- Branch: `advisor/015-inspector-nudge-cleanup`
- Commit style: `fix(map): cancel inner rAF and in-flight nudge tween on cleanup`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Track and cancel the inner rAF; cancel the tween in both cleanups

In the trigger effect, capture both frame ids and extend the cleanup:

```ts
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = window.requestAnimationFrame(() => {
        // ...existing body unchanged...
      });
    });
    return () => {
      cancelAnimationFrame(first);
      if (second) window.cancelAnimationFrame(second);
      cancelNudge();
    };
```

In the restore effect, add a cleanup as the effect's return value:

```ts
    return () => cancelNudge();
```

Why this is behavior-preserving within a page: on a selection change, cleanups
run before the effects re-run, and the re-run's inner rAF called `cancelNudge()`
first anyway (the "Finding 3" line) — the cancellation just happens earlier,
before a superseded inner rAF could fire. On unmount, the cleanups now stop
both the pending inner frame and the running tween.

**Verify**: `npm run typecheck` → exit 0.

### Step 2: Full gates

**Verify**: `npm run test:ct` → all pass; `npm test` → all pass;
`npm run lint` → exit 0.

### Step 3: Manual sanity (nudge behavior unchanged)

Run the app (`run-seat-planner` skill or `npm run dev`); on `/admin` at a
desktop width where the inspector panel floats:

1. Select a seat under the panel's edge → map nudges left as before.
2. Rapidly click through 4-5 seats → no jitter, final seat clears the panel.
3. Select a seat, immediately click a rail item to navigate away → no console
   errors.

**Verify**: behaviors 1-3 as described.

## Test plan

- No dedicated hook test exists today and the hook's rAF choreography is not
  meaningfully assertable in jsdom (no layout). The regression gates are the
  existing `test:ct` suite (which mounts the consuming surfaces) and step 3.
- If a unit is wanted later: extract nothing — instead a browser-tier spec
  that navigates away mid-nudge and asserts no post-unmount exceptions; noted
  as deferred, since the browser harness's ResizeObserver-convergence
  limitation (recorded in `plans/README.md`) makes tween-settlement assertions
  unreliable there today.

## Done criteria

- [ ] Trigger-effect cleanup cancels BOTH frame ids and calls `cancelNudge()`
- [ ] Restore effect has a cleanup calling `cancelNudge()`
- [ ] `npm test`, `npm run test:ct`, `npm run typecheck`, `npm run lint` all exit 0
- [ ] Manual behaviors in step 3 confirmed (state observations in your report)
- [ ] `git status` shows only in-scope files modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The effect bodies no longer match the excerpts (drift).
- Any `test:ct` failure after step 1 — the cleanups must not change
  within-page nudge behavior; a failure means a test depends on the superseded
  inner rAF actually running, which would be a real finding.
- Fixing the leak appears to require changes in `SeatMap.tsx` /
  `ViewerSeatFinder.tsx` (it should not — both already call `cancelNudge`
  through the returned handle for their own reasons).

## Maintenance notes

- The hook remains the sole owner of `frame.style.translate` (its header
  contract). The new cleanups do not unwind an applied translate on unmount —
  the node is detached, so there is nothing to unwind; if the hook is ever
  reused on a surface that survives deselection-by-unmount, revisit.
- Reviewer: confirm `second` is a `let` captured by the cleanup closure (not a
  ref — per-effect-run locals are the correct scope here).
