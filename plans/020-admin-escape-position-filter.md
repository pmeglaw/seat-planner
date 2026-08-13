# Plan 020: Make Esc clear the Position filter on the admin map

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 52b652f..HEAD -- components/seat-map/SeatMap.tsx tests/`
> If `SeatMap.tsx` changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `52b652f`, 2026-08-13

## Why this matters

The admin map's Esc-key ladder ends with "clear the structured filters" —
but the branch checks and clears only department/zone/status, not
**position**. An admin who narrows the map by Position alone presses Esc and
nothing happens (the key looks dead); with Department + Position active, Esc
clears Department but silently leaves Position pinned, so the map stays
narrowed right after the user pressed the key that means "clear". The viewer
surface had this exact defect, fixed it by calling the shared
`clearStructuredFilters()`, and pinned it with a comment and test — the
admin twin was never updated. The fix is the same one-line swap.

## Current state

- `components/seat-map/SeatMap.tsx` — the admin map monolith. The defect is
  the last rung of the Esc handler at lines 921–925:

```tsx
      if (!isEditableTarget(event.target) && (department !== "all" || zone !== "all" || status !== "all")) {
        setDepartment("all");
        setZone("all");
        setStatus("all");
      }
```

  `position` appears in the effect's dependency array (line 930) but in
  neither the condition nor the body. The hook powering this state already
  exposes everything needed — `components/seat-map/useSeatFilters.ts`
  returns `structuredFiltersActive` (line 55: true when ANY of the four
  facets is set, position included) and `clearStructuredFilters()`
  (lines 125–130: resets all four). SeatMap already destructures from
  `useSeatFilters(...)` (search for `useSeatFilters(` around line 430) —
  check whether `structuredFiltersActive` and `clearStructuredFilters` are
  already in that destructuring; add them if not.

- The viewer twin — the pattern to copy, including its comment style —
  `components/seat-map/ViewerSeatFinder.tsx:486-493`:

```tsx
      if (!editable && structuredFiltersActive) {
        // clearStructuredFilters(), not three hand-written setters: this branch
        // fires when structuredFiltersActive is true, and that flag counts
        // POSITION too — so the open-coded trio left a position-only filter
        // pinned while Escape reported itself as having cleared the layer, and
        // any future facet would have inherited the same silent gap.
        clearStructuredFilters();
      }
```

- Repo conventions: SeatMap cannot mount in jsdom (known harness
  limitation), so SeatMap-internal contracts are pinned by focused
  `*-source.test.mjs` files that read the source and assert tokens — e.g.
  `tests/seat-map-render-loop-source.test.mjs` (small, single-purpose,
  comment explains the WHY). Model the new test on it.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install (if needed) | `npm install` | exit 0 (NOT `npm ci` — EPERMs on this box) |
| New test file | `node --test tests/seat-map-escape-source.test.mjs` | all pass |
| Typecheck | `npm run typecheck` | exit 0 |
| Full suite | `npm test` | ~1090 pass / 0 fail |
| Lint | `npm run lint` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `components/seat-map/SeatMap.tsx` (the Esc-handler branch + hook
  destructuring + effect dep array only)
- `tests/seat-map-escape-source.test.mjs` (create)

**Out of scope** (do NOT touch):
- `components/seat-map/useSeatFilters.ts` — it already exposes everything
  needed; no change.
- `ViewerSeatFinder.tsx` and its tests — already correct.
- The other rungs of the Esc ladder (dialogs, search-clear, selection-clear)
  and their ordering — the ladder's priority order is deliberate.

## Git workflow

- Branch: `advisor/020-admin-escape-position-filter`
- Conventional commits (e.g. `fix(seat-map): Esc clears the Position filter too`)
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Swap the open-coded trio for the shared clear

In `SeatMap.tsx` lines 921–925, mirror the viewer:

```tsx
      if (!isEditableTarget(event.target) && structuredFiltersActive) {
        // clearStructuredFilters(), not three hand-written setters: the flag
        // counts POSITION too — the open-coded trio left a position-only
        // filter pinned while Escape reported itself as having cleared the
        // layer (the viewer twin fixed and pinned this first; see
        // ViewerSeatFinder's Esc handler).
        clearStructuredFilters();
      }
```

Ensure `structuredFiltersActive` and `clearStructuredFilters` are
destructured from the `useSeatFilters(...)` call. Update the effect's
dependency array (line 930): the individual `department`, `position`,
`zone`, `status` entries used by this branch can be replaced by
`structuredFiltersActive` + `clearStructuredFilters` — BUT only remove a
facet from the deps if nothing ELSE in the same effect reads it. Read the
whole effect body first; `search` and others are used by earlier rungs and
must stay. If the linter (`react-hooks/exhaustive-deps`) demands a
different set, follow the linter.

**Verify**: `npm run typecheck` → exit 0; `npm run lint` → exit 0 (no NEW
warnings in SeatMap.tsx — 27 pre-existing warnings repo-wide are normal).

### Step 2: Pin it with a source test

Create `tests/seat-map-escape-source.test.mjs`, modeled structurally on
`tests/seat-map-render-loop-source.test.mjs` (read it first). Assert on the
SeatMap.tsx source text:

1. The Esc handler's filter rung tests `structuredFiltersActive` and calls
   `clearStructuredFilters()` (both tokens present in the handler function's
   text).
2. The open-coded trio is gone from the handler: no
   `setDepartment("all")` / `setZone("all")` / `setStatus("all")` sequence
   inside the Esc handler (scope the assertion to the handler's text — the
   setters legitimately appear elsewhere in the file, e.g. chip removal).
   Extract the handler block by slicing between `function handleEscape` and
   the `window.addEventListener("keydown", handleEscape)` line, then assert
   within the slice.
3. A comment in the test states WHY this is a source test (SeatMap cannot
   mount in jsdom) and what user contract it protects (Esc peels the filter
   layer, all four facets).

**Verify**: `node --test tests/seat-map-escape-source.test.mjs` → all pass.
Then mutation-check: temporarily restore the old trio branch, rerun,
confirm the test FAILS; re-apply the fix.

### Step 3: Full gate

**Verify**: `npm test` → 0 fail. `npm run typecheck` → exit 0.
`npm run lint` → exit 0.

## Test plan

Covered in Step 2 (source test + mutation check). Deliberately not a
browser-tier test: the browser tier (`npm run test:browser`) needs a build
and is heavyweight for a one-branch change; the source pin matches how this
file's other keyboard contracts are guarded today.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `node --test tests/seat-map-escape-source.test.mjs` exits 0
- [ ] `grep -n "clearStructuredFilters()" components/seat-map/SeatMap.tsx` shows a call inside the Esc handler
- [ ] `npm test` exits 0; `npm run typecheck` exits 0; `npm run lint` exits 0
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The Esc-handler excerpt at `SeatMap.tsx:921-925` doesn't match the live
  code (drift).
- `useSeatFilters` no longer exports `clearStructuredFilters` or
  `structuredFiltersActive`.
- Changing the effect's dependency array causes ANY new
  `react-hooks/exhaustive-deps` warning you cannot satisfy by following the
  linter's suggestion — the dep list at line 930 is long and other rungs
  depend on it; do not suppress the rule.

## Maintenance notes

- Any future filter facet added to `useSeatFilters` is now automatically
  covered on both surfaces' Esc paths — that's the point of the shared
  clear. A reviewer should check no facet-specific Esc behavior is wanted.
- Deferred: a real-browser assertion of the Esc ladder end-to-end (would
  belong in the `test:browser` tier alongside its SeatMap coverage).
