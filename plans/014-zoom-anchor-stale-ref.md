# Plan 014: Stop `applyMapZoom` arming a zoom anchor on no-op zooms

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 89a8fea..HEAD -- components/seat-map/SeatMap.tsx`
> If the file changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it as
> a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `89a8fea`, 2026-08-07

## Why this matters

The admin map's zoom keeps the previously-centered point centered by stashing a
scroll anchor in a ref (`pendingZoomCenterRef`) and consuming it in an effect
keyed on `[zoomFactor]`. `applyMapZoom` arms that ref **unconditionally** in
detail mode — but if the clamped zoom equals the current `zoomFactor`, React
bails out of the state update, the effect never runs, and the ref stays armed
indefinitely. The next thing to change `zoomFactor` through any other path
(e.g. `fitMapToView`, or a zoom applied from overview mode — both of which do
NOT re-arm the ref) fires the effect against the stale, minutes-old anchor, and
the viewport jumps to an unrelated part of the floor plan. Reachable today via
"Zoom to 100%" in the map menu while already in detail mode at 100%.

## Current state

All in `components/seat-map/SeatMap.tsx`:

- `applyMapZoom` (lines 1677-1695):
  ```ts
  function applyMapZoom(nextZoom: number) {
    cancelNudge();
    const clamped = clampZoom(nextZoom);

    if (mapViewMode !== "detail") {
      setMapViewMode("detail");
      setZoomFactor(clamped);
      window.requestAnimationFrame(() => centerMapViewport("auto"));
      return;
    }

    const viewport = mapViewportRef.current;
    const map = mapRef.current;
    if (viewport && map) {
      pendingZoomCenterRef.current = zoomAnchorFromViewport(viewport, map);
    }

    setZoomFactor(clamped);
  }
  ```
- The consuming effect (lines 1697-1709) — reads and clears
  `pendingZoomCenterRef.current`, keyed on `[zoomFactor]`. Correct as-is; do
  not modify.
- `fitMapToView` (lines 1711-1715) — sets `zoomFactor` to 1 WITHOUT going
  through `applyMapZoom` (so it can neither clear nor re-arm the ref). Correct
  as-is once the arming guard exists; do not modify.
- The reachable no-op arming path: the "Zoom to 100%" map-menu item
  (~line 3070-3080) calls `applyMapZoom(1)`; the +/- zoom buttons are guarded
  by `zoomInDisabled`/`zoomOutDisabled` (~line 3488) so they cannot produce a
  no-op call, but the menu item can.

Convention: this file's comments state contracts/constraints (see the comment
above `applyMapZoom`, "Presentation-only zoom: ...spec §9"). Your one-line
guard deserves a one-line constraint comment, matching that register.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install | `npm install` (NOT `npm ci`) | exit 0 |
| Tests | `npm test` | all pass |
| Typecheck | `npm run typecheck` | exit 0 |
| Lint | `npm run lint` | exit 0 |

## Scope

**In scope**:
- `components/seat-map/SeatMap.tsx` — the `applyMapZoom` function body ONLY
- `plans/README.md` (status row)

**Out of scope** (do NOT touch):
- The consuming effect, `fitMapToView`, `changeMapViewMode`,
  `centerMapViewport`, the zoom menu/buttons JSX.
- `lib/mapViewport.ts` (`zoomAnchorFromViewport` / `scrollTargetForZoomAnchor`
  are pure helpers and correct).
- Anything else in SeatMap.tsx — this file is a known god component; resist
  every temptation to clean up nearby code.

## Git workflow

- Branch: `advisor/014-zoom-anchor-stale-ref`
- Commit style: `fix(map): don't arm zoom anchor on no-op zoom`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Guard the no-op

In `applyMapZoom`, immediately after `const clamped = clampZoom(nextZoom);`
and BEFORE the `mapViewMode !== "detail"` branch, add:

```ts
    // A no-op zoom must not arm pendingZoomCenterRef: setZoomFactor bails on
    // an unchanged value, the [zoomFactor] effect never consumes the anchor,
    // and the stale anchor hijacks the next zoom change from any other path.
    if (mapViewMode === "detail" && clamped === zoomFactor) return;
```

(Keep the early `cancelNudge()` above it unchanged — a no-op zoom canceling an
in-flight nudge preserves current behavior, since `cancelNudge` ran before the
arming today too.)

**Verify**: `npm run typecheck` → exit 0.

### Step 2: Full gates

**Verify**: `npm test` → all pass; `npm run lint` → exit 0.

### Step 3: Manual QA (the repro)

Using the repo's `run-seat-planner` skill if available (or `npm run dev` with
an existing `.env.local`), on `/admin`:

1. Zoom in (detail mode), open the map menu, click "Zoom to 100%".
2. Click "Zoom to 100%" AGAIN (the no-op — previously armed the stale ref).
3. Scroll the map far from its center. Click "Fit to view".
4. Zoom in once.

**Verify**: after step 4 the viewport centers normally (previously it could
jump to the position captured in step 2). Also confirm normal zoom in/out still
anchors on the centered point (zoom in on a corner seat — it stays put).

## Test plan

- No new automated test: the guard is a 2-line early return inside a 4,000-line
  component that no jsdom/browser tier currently drives through this menu path,
  and extracting the predicate into `lib/` for a unit test is not worth the
  churn for this fix. The manual repro in step 3 is the regression check.
- If the browser tier (`tests/browser/seat-map.spec.ts`) later gains zoom
  coverage, add: no-op zoom → fit → zoom-in scroll position assertion.

## Done criteria

Machine-checkable plus one manual gate. ALL must hold:

- [ ] `applyMapZoom` contains the early-return guard before any arming of `pendingZoomCenterRef`
- [ ] `npm test`, `npm run typecheck`, `npm run lint` all exit 0
- [ ] Manual repro in step 3 verified (state the observed behavior in your report)
- [ ] `git status` shows only `components/seat-map/SeatMap.tsx` + `plans/README.md` modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `applyMapZoom` no longer matches the excerpt (drift).
- Any existing test fails after the guard — the guard must be behaviorally
  invisible except for the stale-anchor case; a failure means something
  depends on the no-op path in a way this plan did not model.
- You cannot run the app for step 3 (no `.env.local` / no browser) — deliver
  the code change and report the manual gate as NOT done rather than skipping
  silently.

## Maintenance notes

- If a new caller of `setZoomFactor` is ever added, it must either go through
  `applyMapZoom` or leave `pendingZoomCenterRef` alone knowing the effect will
  consume whatever is armed — the guard keeps "armed" and "will change" in
  lockstep; preserve that pairing.
- Reviewer: check the guard compares against the `zoomFactor` state variable
  (the render-current value), not a ref — that equality is exactly React's
  bail-out condition, which is the point.
