# Plan 002: Surface reset failures inside the discard-draft dialog and give it an Escape branch

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 3119e16..HEAD -- components/seat-map/SeatMap.tsx`
> If the file changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it as
> a STOP condition. (Line numbers below are from `3119e16` — re-locate by the
> quoted code, not the numbers, if the file has shifted.)

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (pairs naturally with plan 001, which fixes the most likely *cause* of the failure this plan makes visible)
- **Category**: bug
- **Planned at**: commit `3119e16`, 2026-07-24

## Why this matters

When `resetDraftToPublishedAction` throws (server error, network failure — and until plan 001 lands, any permuted draft), the discard-draft confirmation dialog handles it by setting `actionError` — but that error banner renders in the page chrome **behind** the dialog's full-screen `z-[95]` overlay. The dialog itself stays open (the catch never closes it, unlike the success and stale paths), its button flips from "Discarding…" back to "Discard everything", and the admin gets zero visible feedback. They retry a destructive-looking action indefinitely against a silent failure. Separately, the global Escape ladder has a branch for every other dialog/menu but not this one: the dialog's own `onKeyDown` handles Escape only while focus is inside it — if focus lands outside (e.g. a backdrop click focuses `<body>`), Escape falls through to the window ladder, which closes the **underlying publish review** instead, leaving a destructive confirm floating over a bare map.

## Current state

All in `components/seat-map/SeatMap.tsx` (3,883 lines, `"use client"`).

- **The handler** (`confirmDiscardDraftChanges`, lines 2179–2207). Success path closes the dialog (`setDiscardDraftConfirmOpen(false)` at 2197), stale path closes it (2190); the catch does not:
  ```tsx
  } catch (error) {
    setActionNotice(null);
    setActionError(error instanceof Error ? error.message : "Could not discard draft changes.");
  } finally {
    setMutationInFlight(false);
  }
  ```
- **The dialog** (lines 3657–3696): `discardDraftConfirmOpen && (...)` renders a `fixed inset-0 z-[95]` overlay containing a `<section role="dialog" aria-modal="true" aria-labelledby="discard-draft-title" aria-describedby="discard-draft-description">` with its own Escape `onKeyDown` (stops propagation, closes itself, guarded by `!pending`), a title `<h2 id="discard-draft-title">`, a description `<p id="discard-draft-description">`, and a two-button grid: "Keep draft changes" / "Discard everything" (the latter shows "Discarding…" while `pending`). There is **no error region inside the dialog**.
- **The global Escape ladder** (`handleEscape`, lines 735–777) checks, in order: `inspectorGuardAction` → `deleteSeatConfirm` → `publishReviewOpen` → `swapConfirm` → `askPlannerOpen` → `publishStatusOpen` → `mapMenuOpen` → `chromeMenuOpen` → active modes. **No `discardDraftConfirmOpen` branch.** The discard dialog is opened from *inside* the publish review dialog, which stays mounted underneath, so the fall-through closes the wrong dialog.
- The generic error banner the catch feeds lives in the page chrome (`actionError` state) — fine for non-modal contexts, invisible under this overlay.
- Conventions to match: dialogs in this file use `role="alert"` for error text and `role="status"` for notices; admin-theme text tokens like `text-[var(--admin-text-secondary)]`; the dialog already composes `useDialogFocus` via `discardDraftDialogFocusRef`.

## Commands you will need

| Purpose   | Command             | Expected on success |
|-----------|---------------------|---------------------|
| Install   | `npm install`       | exit 0 (use `npm install`, not `npm ci`, on the maintainer's Windows box) |
| Tests     | `npm test`          | all pass (~400). Known local-env flake: `login-form`/`rpc-execution`/`seat-inspector`/`seat-map-components` failing with import/harness errors on an untouched tree means run `npm install` first |
| Typecheck | `npm run typecheck` | exit 0 |
| Lint      | `npm run lint`      | exit 0 |
| Browser tier (optional, env-dependent) | `npm run test:browser` | all pass; requires a Chromium — locally set `PW_CHROMIUM_PATH`; skip if unavailable and say so |

## Suggested executor toolkit

- Read `.claude/skills/test-tiers/SKILL.md` before touching `tests/browser/` — the real-browser harness (`mountSeatMap`, its `responses`/`calls` action bridge) is documented there.

## Scope

**In scope** (the only files you should modify):
- `components/seat-map/SeatMap.tsx`
- `tests/browser/seat-map.spec.ts` (extend, optional step — see Step 3)

**Out of scope** (do NOT touch):
- The reset RPC / migrations (plan 001).
- `tests/accessibility-source.test.mjs` — unless it fails; then re-anchor per its own scope note (fix the anchor, never weaken the invariant), and report the exact edit in your summary.
- The other four SeatMap dialogs, the shared error banner, `useDialogFocus`.

## Git workflow

- Branch: `advisor/002-discard-dialog-error-surfacing`
- Commit style: conventional (e.g. `fix(map): discard-confirm surfaces reset errors and joins the Escape ladder`)
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Render the error inside the dialog

In the discard dialog section (after the `<p id="discard-draft-description">…</p>` block, before the button grid), add an error region that shows the existing `actionError` state while the dialog is open:

```tsx
{actionError && (
  <p role="alert" className="mt-3 border border-[var(--admin-state-danger-border,#b91c1c)] bg-[var(--admin-state-danger-bg,transparent)] p-2 text-sm leading-5 text-[var(--admin-state-danger-text,#b91c1c)]">
    {actionError}
  </p>
)}
```

Before writing it, check `app/globals.css` for the actual danger-state token names used by the admin theme (search `--admin-state-danger` and, if absent, look at how the existing `actionError` banner elsewhere in SeatMap styles error text) and use those exact tokens — do not invent new token names and do not hardcode hex if a token exists. Keep the dialog open on error (do NOT add a close call to the catch): the admin should read the message, then retry or "Keep draft changes". Also change the confirm button's idle label to acknowledge a failed attempt, mirroring the publish dialog's pattern at line 3645 (`actionError ? "Retry publish" : …`):

```tsx
{pending ? "Discarding…" : actionError ? "Retry discard" : "Discard everything"}
```

**Verify**: `npm run typecheck` → exit 0. `npm run lint` → exit 0.

### Step 2: Add the Escape-ladder branch

In `handleEscape` (lines 735–777), add a `discardDraftConfirmOpen` branch as the **first** check (it is the top-most overlay, `z-[95]`, and opens above the publish review):

```tsx
if (discardDraftConfirmOpen) {
  setDiscardDraftConfirmOpen(false);
  return;
}
```

Then find the effect that registers `handleEscape` on `window` and add `discardDraftConfirmOpen` to its dependency array if the handler is re-created per render inside the effect (match how the existing branches' states are handled — inspect the effect's current deps and mirror them exactly).

**Verify**: `npm run typecheck` → exit 0.

### Step 3 (environment-permitting): Browser-tier regression test

If a Playwright Chromium is available (`PW_CHROMIUM_PATH` set or CI), extend `tests/browser/seat-map.spec.ts` with one spec: mount via the harness with a `responses` override that makes `resetDraftToPublishedAction` reject (read `tests/browser/harness.ts` for the exact override shape and how existing specs stub actions); drive: open publish review → open discard confirm → click "Discard everything" → assert (a) the dialog is still visible, (b) a `role="alert"` element inside it contains the error text, (c) the confirm button reads "Retry discard". If no Chromium is available in your environment, skip this step and state that explicitly in your final summary — do not fake it.

**Verify**: `npm run test:browser` → all pass (or the step is reported as skipped for environment reasons).

### Step 4: Full-suite gate

**Verify**: `npm test` → exit 0. If `tests/accessibility-source.test.mjs` fails, read the failing assertion: it pins dialog structure by source text. Your additions are additive (new `<p role="alert">`), so a failure means an anchor matched too narrowly — extend the anchor to accommodate the new element without deleting any asserted invariant, and list the exact test-file diff in your summary.

## Test plan

- The Step 3 browser spec (rejection → visible in-dialog alert + retry label + dialog stays open) is the regression test; pattern: existing specs in `tests/browser/seat-map.spec.ts` that stub actions through `mountSeatMap`.
- Manual QA note for the reviewer (cannot be automated here): with the dev server up, Escape pressed after clicking the dialog *backdrop* must close the discard confirm, not the publish review beneath it.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -n "Retry discard" components/seat-map/SeatMap.tsx` → exactly 1 match
- [ ] `grep -n "discardDraftConfirmOpen" components/seat-map/SeatMap.tsx` shows a branch inside `handleEscape` before the `inspectorGuardAction` branch
- [ ] The catch block of `confirmDiscardDraftChanges` still does NOT close the dialog (no `setDiscardDraftConfirmOpen(false)` between `catch` and `finally`)
- [ ] `npm test`, `npm run typecheck`, `npm run lint` all exit 0
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `confirmDiscardDraftChanges` or the dialog markup no longer matches the excerpts (drift).
- `app/globals.css` has no danger-state tokens AND SeatMap has no existing error-text styling to copy — do not invent a visual treatment; report and ask.
- `tests/accessibility-source.test.mjs` cannot be re-anchored without weakening an asserted invariant (e.g. it asserts an exact child sequence for this dialog).
- The Escape-registration effect turns out to use a ref-based handler where dependency edits are load-bearing in a non-obvious way.

## Maintenance notes

- This dialog is the fifth hand-rolled modal in SeatMap; a shared `ConfirmDialog` primitive (deferred finding, see `plans/README.md`) would make the error region and Escape wiring structural instead of per-dialog. When that consolidation happens, this dialog's error/alert region is part of the contract to carry over.
- Reviewers should scrutinize: that `actionError` set by *other* actions can't leak into this dialog stale — the handler clears it on entry (`setActionError(null)` at line 2180), which is what makes reusing the shared state safe.
