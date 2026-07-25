# Plan 010: Stub `auth.getUser` in the browser harness and land the 002 discard-error regression test

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat ff556e3..HEAD -- tests/browser/build-harness.ts tests/browser/harness.ts tests/browser/seat-map.spec.ts components/seat-map/SeatMap.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW (test-tier only; no product, migration, or prod change)
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `ff556e3`, 2026-07-24

## Why this matters

The real-browser SeatMap harness stubs `@/lib/supabase/client`'s `createClient` with an `auth` object that has **only `signOut`** — no `getUser`. But SeatMap runs a session-expiry probe whenever an admin edit fails: `createBrowserSupabaseClient().auth.getUser()` (`components/seat-map/SeatMap.tsx:549-552`, gated on `canEdit && actionError`). So **any** browser spec that combines `canEdit: true` with a rejected action crashes the mounted app on `getUser is not a function` — which is why plan 002 (discard-dialog error surfacing) shipped with **no** automated browser test; the executor hit exactly this wall and had to revert its spec. This plan adds the missing `getUser` stub (unblocking the whole class of admin-mutation *error-path* browser tests) and lands the 002 regression test that the stub makes possible — giving 002's fix the automated coverage it's missing.

## Current state

- `tests/browser/build-harness.ts:59` — the client mock, the entire `auth` surface:
  ```ts
  "@/lib/supabase/client": `export const createClient = () => ({ auth: { signOut: async () => window.__ctCall("supabase.signOut", []) } });`
  ```
- `components/seat-map/SeatMap.tsx:546-553` — the probe that needs `getUser`:
  ```tsx
  useEffect(() => {
    if (!canEdit || !actionError) return;
    let cancelled = false;
    createBrowserSupabaseClient()
      .auth.getUser()
      .then(({ data }) => {
        if (!cancelled) setSessionExpired(!data.user);
      })
      .catch(() => { /* … */ });
  ```
  It **destructures `{ data }`** from the resolved value and reads `data.user` — so a stub must resolve to a `{ data: { user: … } }` shape. The harness's default `__ctCall` return is `null` (`tests/browser/harness.ts:28`, `result ?? null`), and `null` would itself crash the destructure — so the stub cannot simply forward an unconfigured `__ctCall`; it must default to a valid-session object.
- `tests/browser/harness.ts:23-35` — `mountSeatMap(page, props, { responses })`: `__ctCall(name, args)` records the call and returns `responses[name]` (value or function of args), else `null`. Actions are keyed `"action:<name>"`; a **rejecting** action is expressed as a response function that throws: `responses: { "action:resetDraftToPublishedAction": () => { throw new Error("Server error"); } }`.
- `tests/browser/seat-map.spec.ts` — the spec file. Conventions: mount with `{ seats, employees, canEdit, … }`; **clicks use `locator.dispatchEvent("click")`** (the harness ships no CSS, so nothing is laid out for hit-testing); assert with `.toBeAttached()` / `.toHaveCount()` (DOM presence, not paint visibility); markers are `button[aria-label^="<label>"]`. Existing admin-affordance test (`:128`) shows the `canEdit: true` mount shape.
- `restoreDraftSnapshotAction` / `resetDraftToPublishedAction` are in `ACTION_EXPORTS` (`build-harness.ts:27, 19-33`), so they're already mockable through `responses`.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install | `npm install` | exit 0 (`npm install`, not `npm ci`) |
| Build browser bundle | (implicit — `test:browser` rebuilds the harness via globalSetup) | — |
| Browser tier | `npm run test:browser` | all pass; needs a Chromium — Playwright uses its managed cache if `PW_CHROMIUM_PATH` is unset (it was available in this repo's worktrees). If genuinely no browser is present, that's a STOP-and-report, not a skip. |
| Tests | `npm test` | all pass (~486; 4-file local-env flake caveat) |
| Typecheck | `npm run typecheck` | exit 0 |
| Lint | `npm run lint` | 0 errors |

## Suggested executor toolkit

- Read `.claude/skills/test-tiers/SKILL.md` before starting — it documents the `test:browser` tier wiring (esbuild bundle of the real SeatMap, the `__ctCall` Node↔browser bridge, why no CSS). The `playwright-best-practices` skill (if available) is useful for the locator/assertion choices.

## Scope

**In scope**:
- `tests/browser/build-harness.ts` (add `getUser` to the client mock)
- `tests/browser/seat-map.spec.ts` (add the 002 regression test)

**Out of scope** (do NOT touch):
- `components/seat-map/SeatMap.tsx` and any product code — the probe is correct; the harness was incomplete.
- `tests/browser/harness.ts` — the `responses`/`__ctCall` bridge already supports everything needed; don't change it.
- The e2e (`tests/e2e/`) tier and the PGlite tier.

## Git workflow

- Branch: `advisor/010-browser-harness-getuser-and-002-regression`
- Commit style: conventional (e.g. `test(browser): stub auth.getUser and cover the discard-error dialog (002)`)
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add a crash-safe `getUser` to the client mock

In `tests/browser/build-harness.ts:59`, extend the `@/lib/supabase/client` mock's `auth` object with `getUser`. It must (a) be observable/overridable via `__ctCall` like the other mocks, and (b) default to a **valid session** so the probe's `{ data }` destructure never crashes and `sessionExpired` stays false when a test doesn't care about it:

```ts
"@/lib/supabase/client": `export const createClient = () => ({ auth: {
  signOut: async () => window.__ctCall("supabase.signOut", []),
  getUser: async () => (await window.__ctCall("supabase.getUser", [])) ?? { data: { user: { id: "harness-user" } }, error: null }
} });`
```

So a test that provides `responses["supabase.getUser"]` controls the result (e.g. to drive the session-expired path later), and one that doesn't gets a valid session.

**Verify**: `npm run typecheck` → exit 0 (this file is TS). The real check is Step 3's browser run.

### Step 2: Add the 002 discard-error regression test

Add a spec to `tests/browser/seat-map.spec.ts` that reproduces plan 002's scenario: an admin's discard fails, and the error must surface **inside** the discard dialog with a "Retry discard" affordance (not silently swallowed).

Work out the mount props and drive sequence by reading `SeatMap.tsx` (the publish-review + discard-confirm JSX and the `confirmDiscardDraftChanges` handler) — the key requirements:

1. **Mount** with `canEdit: true` and a draft that has at least one change so the publish review is reachable (a draft seat with no published counterpart is an "added" change — pass `publishedSeats: []` or whatever SeatMap's props require; confirm by reading how SeatMap computes the review from `seats` vs `publishedSeats`). Configure a **rejecting** reset action:
   ```ts
   await mountSeatMap(page, { seats: [custom], employees: [], canEdit: true, publishedSeats: [] }, {
     responses: { "action:resetDraftToPublishedAction": () => { throw new Error("Server error"); } }
   });
   ```
   (Use the exact prop names SeatMap declares — read `SeatMapProps`.)
2. **Drive** (each click via `dispatchEvent("click")`): open the publish review (the "Review … unpublished change" button), then the "Discard all draft changes" button, then "Discard everything". Locate by role/name, e.g. `page.getByRole("button", { name: /unpublished change/ })`, `page.getByRole("button", { name: "Discard all draft changes" })`, `page.getByRole("button", { name: "Discard everything" })`.
3. **Assert** the fix's behavior: the discard dialog is still attached, an in-dialog alert carries the error, and the confirm button now reads "Retry discard":
   ```ts
   await expect(page.getByRole("dialog", { name: /Discard all draft changes/ })).toBeAttached();
   await expect(page.getByRole("alert")).toBeAttached();  // scope to the dialog if needed
   await expect(page.getByRole("button", { name: "Retry discard" })).toBeAttached();
   ```

The point this proves: with the `getUser` stub in place, `canEdit: true` + a rejected action no longer crashes the app, and the discard dialog surfaces the error (plan 002's fix) instead of swallowing it.

**Verify**: `npm run test:browser` → all pass, including the new spec. If the spec still crashes on `getUser`, Step 1 didn't take effect (the harness rebuilds the bundle in globalSetup — confirm the mock edit is in `build-harness.ts`).

### Step 3: Full gate

**Verify**: `npm run test:browser` (new spec passes, no regressions in the existing specs), `npm test` (exit 0), `npm run typecheck` (exit 0), `npm run lint` (0 errors).

## Test plan

- One new browser spec in `tests/browser/seat-map.spec.ts` driving the discard-error path and asserting the in-dialog alert + "Retry discard" — the automated regression test plan 002 shipped without.
- The `getUser` stub is exercised implicitly by that spec (without it, the spec crashes) — so no separate stub test is needed, but a one-line comment at the stub explaining why it defaults to a valid session helps the next reader.
- Verification: `npm run test:browser` then `npm test`.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -c "getUser" tests/browser/build-harness.ts` ≥ 1
- [ ] `grep -c "Retry discard" tests/browser/seat-map.spec.ts` ≥ 1
- [ ] `npm run test:browser` exits 0 with the new spec present and passing (report the pass count)
- [ ] `npm test`, `npm run typecheck`, `npm run lint` (0 errors) all pass
- [ ] `git diff --name-only ff556e3..HEAD` shows ONLY `tests/browser/build-harness.ts` and `tests/browser/seat-map.spec.ts` (and, at the end, `plans/README.md`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `npm run test:browser` cannot run because no Chromium is available in this environment (report it — do NOT mark the plan done on typecheck alone; the stub's whole point is the browser run).
- After Step 1, the new spec still crashes on `getUser` — means the bundle didn't rebuild or the mock shape is wrong; report the exact error.
- You cannot reach the discard-confirm dialog because the publish review won't show a change with any reasonable prop combination — **land Step 1 (the stub) alone**, report that Part B is blocked on the review-flow props, and stop. The stub is the reusable unblock and is worth landing even if the 002 spec proves intractable.
- Driving the flow would require editing `SeatMap.tsx` or `harness.ts` — both are out of scope; report instead.

## Maintenance notes

- This `getUser` stub unblocks the whole class of `canEdit: true` + action-rejection browser tests (connects to TEST-04 — admin write surfaces have thin interaction coverage). Future error-path specs (publish failure, restore failure, stale-draft MLS02 recovery) can now be written against the browser tier.
- Reviewers should scrutinize: that the new spec actually reaches and asserts the *in-dialog* alert (not a page-chrome banner), since surfacing the error inside the `z-[95]` dialog is precisely what 002 fixed; and that the stub's valid-session default doesn't mask a real session-expiry code path any existing spec relied on (none does today — the probe only runs on `canEdit && actionError`).
- If a future spec needs the session-*expired* path, pass `responses: { "supabase.getUser": { data: { user: null }, error: null } }` — the stub already routes through `__ctCall` for exactly that.
