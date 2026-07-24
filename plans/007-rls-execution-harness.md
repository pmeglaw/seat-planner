# Plan 007: Execute RLS (and the seat-protection trigger) in the PGlite tier

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 7b447ed..HEAD -- tests/helpers/pgHarness.mjs tests/rpc-execution.test.mjs supabase/migrations/005_policy_advisor_cleanup.sql supabase/migrations/010_v107_seat_protection.sql supabase/migrations/20260708230000_published_employee_snapshot.sql`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW (test-infra only; no product or prod change)
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `7b447ed`, 2026-07-24

## Why this matters

The PGlite execution tier (`tests/rpc-execution.test.mjs` via `tests/helpers/pgHarness.mjs`) applies the real migrations and calls the RPCs — but **every query runs as the PGlite database owner, which is exempt from RLS**. The harness only ever sets `auth.uid()` (via `app.current_user_id`); it never switches SQL role, so the `to authenticated` RLS policies on `seats`, `employees`, `published_employees`, `profiles`, and `publish_events` are **never actually evaluated**, and the `prevent_original_draft_seat_delete` trigger is never fired (the reset uses `truncate`, which skips row triggers). RLS is documented (`CLAUDE.md`, security boundary layer 2) as the independent enforcement layer — but nothing executes it, so a migration that dropped or widened a policy (e.g. gave viewers `update` on `seats`, or removed the draft-hiding clause) would pass CI green. This plan makes RLS a *tested* boundary. It is also the prerequisite for Plan 008 (narrowing the `employees` select policy so viewers can't read the draft-side directory) — that fix must ship with a test that proves a viewer reads zero rows, not on inspection alone.

## Current state

- `tests/helpers/pgHarness.mjs` — the harness. Key points:
  - `createSeatPlannerDb()` (`:146-157`) boots PGlite, runs `PRELUDE`, then applies every `supabase/migrations/*.sql` (filename-sorted) via `db.exec`. All of this runs as the PGlite owner (a superuser).
  - `PRELUDE` (`:38-58`) creates the `auth` schema, a settable `auth.uid()` reading `current_setting('app.current_user_id')`, `auth.role()` hardcoded to `'authenticated'`, and the roles `anon`, `authenticated`, `service_role`, `supabase_admin`, `postgres`. **The roles are created but granted nothing.**
  - `reset()` (`:83-89`) truncates data tables, recreates the admin auth user, promotes its profile to admin, and `actAs(ADMIN_ID)`.
  - `actAs(userId)` (`:92-94`) sets `app.current_user_id` (drives `auth.uid()`), nothing else — no SQL `set role`.
  - `actAsViewer()` (`:97-103`) creates a viewer auth user (id `VIEWER_ID`, whose profile defaults to `viewer` via `handle_new_user`) and `actAs`es it.
  - Seed helpers: `seedSeat({label, key, x, y, status, layer, employeeId, zone, isCustom})` returns the row; `seedEmployee({fullName, department, position, active})` returns the id; `draftSeats()`.
- The RLS policies the migrations install (latest live definitions — the new-migration-free live employees/seats policies come from `005_policy_advisor_cleanup.sql` and are re-applied identically by `010_v107_seat_protection.sql` and the timestamped advisor-cleanup files):
  - `employees_select_authenticated`: `for select to authenticated using (active = true or (select app_private.is_admin()))` — **a viewer can read every ACTIVE employee** (this is the leak Plan 008 fixes; here you assert the *current* behavior).
  - `seats_select_published_or_admin`: `for select to authenticated using (layer = 'published' or (select app_private.is_admin()))` — a viewer reads only published seats.
  - `seats_insert_admin_only` / `_update_` / `_delete_`: `with check`/`using ((select app_private.is_admin()))`.
  - `published_employees` (migration `20260708230000_published_employee_snapshot.sql`): RLS enabled, a single `for select to authenticated` policy, `revoke all ... from anon`, `grant select ... to authenticated` — **no write policy at all** (so writes are default-denied under RLS).
- `app_private.is_admin()` (`003_function_execute_hardening.sql:26-34`) is `security definer`, reads the `auth.uid()` profile's role, and is `grant execute ... to authenticated`. It works regardless of the calling SQL role.
- The seat-protection trigger `app_private.prevent_original_draft_seat_delete` (`010_v107_seat_protection.sql:22-41`): `before delete` on `public.seats`, raises `'Original seeded seats are protected and cannot be deleted.'` when `old.layer = 'draft' and old.is_custom is not true`.
- The migrations grant EXECUTE on the RPCs and `select on published_employees` to `authenticated`, but **no `grant select/insert/update/delete on public.seats`/`employees`/etc.** — in real Supabase those broad table grants come from the platform bootstrap; PGlite has none. So `set role authenticated` will hit "permission denied for table …" until the harness adds the grants (see Step 1).
- `tests/rpc-execution.test.mjs` — 30+ tests that call the RPCs as owner (`db.actAsViewer()` only changes `auth.uid()`, so the admin-refusal tests currently pass because the RPC's *own* `is_admin()` check fails, not because RLS blocks anything).

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install | `npm install` | exit 0 (`npm install`, not `npm ci`, on the maintainer's Windows box) |
| DB tier | `npm run test:db` | all pass (fast loop) |
| Tests | `npm test` | all pass (~480; 4-file local-env flake caveat — reinstall + retry first) |
| Typecheck | `npm run typecheck` | exit 0 |
| Lint | `npm run lint` | 0 errors |

## Suggested executor toolkit

- Read `.claude/skills/test-tiers/SKILL.md` before starting — it documents the PGlite harness wiring (why `SeatMap` can't be jsdom-rendered, how `rpc-execution` boots the DB). The role/grant mechanics below are new, but the harness lifecycle it describes is what you're extending.

## Scope

**In scope**:
- `tests/helpers/pgHarness.mjs` (add table grants after migrations + an `asRole` helper)
- `tests/rls-execution.test.mjs` (create — the new RLS + trigger assertions)

**Out of scope** (do NOT touch):
- Any `supabase/migrations/*.sql` — this plan adds NO migration and changes NO policy. (Plan 008 changes a policy.)
- `tests/rpc-execution.test.mjs` — leave the existing owner-run RPC tests exactly as they are; RLS execution goes in a NEW file so the two concerns stay separate and the existing atomicity tests keep their (deliberate) owner semantics.
- `app/`, `lib/`, `components/` — no product code.

## Git workflow

- Branch: `advisor/007-rls-execution-harness`
- Commit style: conventional (e.g. `test(db): execute RLS and the seat-protection trigger as authenticated`)
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Grant `authenticated` table access after migrations, faithfully

In `tests/helpers/pgHarness.mjs`, in `createSeatPlannerDb()` **after** the migration loop (after line 154, before `return new SeatPlannerDb(db)`), add a POSTLUDE that mirrors Supabase's default `authenticated` grants so that RLS — not a missing grant — becomes the deciding factor:

```js
  // Supabase grants the `authenticated` role broad table DML by default and
  // relies on RLS as the actual gate. PGlite has no such bootstrap, so mirror
  // it here: without these grants, `set role authenticated` fails with a
  // grant-level "permission denied" before any policy is even evaluated.
  await db.exec(`
    grant usage on schema public to authenticated, anon;
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant usage, select on all sequences in schema public to authenticated;
    -- published_employees is select-only for authenticated in prod
    -- (20260708230000); keep the harness faithful so a viewer write is denied
    -- by the missing grant AND the missing RLS write-policy, as in prod.
    revoke insert, update, delete on public.published_employees from authenticated;
  `);
```

**Verify**: `npm run test:db` → the existing rpc-execution tests still pass unchanged (they run as owner; the new grants don't affect owner behavior).

### Step 2: Add an `asRole` helper to the harness

Add a method to `SeatPlannerDb` (near `actAs`, ~`:94`) that runs a callback with the SQL session role switched, always resetting afterward:

```js
  // Run `fn` with the SQL session role switched (so `to authenticated` RLS
  // policies actually apply — the owner is otherwise RLS-exempt). Always resets
  // the role, even on failure. `auth.uid()` is unaffected, so set the identity
  // with actAs()/actAsViewer() first, then wrap the RLS-guarded queries here.
  async asRole(role, fn) {
    await this.db.exec(`set role ${role}`);
    try {
      return await fn();
    } finally {
      await this.db.exec("reset role");
    }
  }
```

Note: `role` is a fixed literal from the test (`'authenticated'`), never user input — no injection surface. Do not parameterize it (SET ROLE takes an identifier, not a bind parameter).

**Verify**: `npm run typecheck` → exit 0 (harness is `.mjs`, but typecheck must still pass for the repo).

### Step 3: Write the RLS + trigger assertions

Create `tests/rls-execution.test.mjs`, modeled structurally on `tests/rpc-execution.test.mjs` (same `before`/`beforeEach`/`after` lifecycle: `createSeatPlannerDb()` once, `db.reset()` before each test). Each test seeds as admin (the default after `reset()`), then switches to the viewer identity AND the `authenticated` role for the guarded read/write. Cover these invariants:

1. **Viewer cannot read draft seats; can read published.** Seed a draft seat and a published seat as admin; then:
   ```js
   await db.actAsViewer();
   await db.asRole("authenticated", async () => {
     const draft = await db.query("select id from public.seats where layer = 'draft'");
     assert.equal(draft.rows.length, 0, "RLS hides draft seats from a viewer");
     const pub = await db.query("select id from public.seats where layer = 'published'");
     assert.ok(pub.rows.length >= 1, "viewer can read published seats");
   });
   ```
2. **Viewer cannot insert a seat.** As authenticated viewer, `insert into public.seats(...)` must reject. Use `expectThrow` (import it the same way rpc-execution does) and match `/row-level security|permission denied/i` — do not pin the exact wording (PGlite's message may differ from Supabase's).
3. **Viewer cannot write `published_employees`.** As authenticated viewer, an `insert into public.published_employees(...)` must reject (denied by both the missing grant and the absent write policy).
4. **Admin, as `authenticated`, CAN read draft seats.** Seed a draft seat; stay admin (`auth.uid()` = ADMIN_ID) but `asRole("authenticated", ...)`; the draft select returns the row (because `is_admin()` is true, the policy's `or is_admin()` branch allows it). This proves the harness isn't just globally denying — RLS is genuinely evaluating the predicate.
5. **The seat-protection trigger refuses an original draft delete.** As admin owner (no role switch needed — the trigger is not RLS), seed an ORIGINAL seat (`isCustom: false`) and assert `delete from public.seats where id = $1` throws `/Original seeded seats are protected/`; then seed a custom seat (`isCustom: true`) and assert its delete succeeds. (This is the trigger the `truncate`-based reset never fires.)
6. **Current employees behavior (documents the leak Plan 008 fixes).** Seed one active and one inactive employee as admin; as authenticated viewer, assert the viewer reads the ACTIVE one and NOT the inactive one (`using (active = true or is_admin())`). Add a comment: *"Plan 008 narrows this to admin-only; when it lands, this assertion flips to 'viewer reads zero employees' and the viewer directory reads only `published_employees`."*

**Verify**: `npm run test:db` (if you wire the new file into that script — see Step 4) or `node --test tests/rls-execution.test.mjs` → all pass. If test 1 or 4 fails because the viewer sees *everything* (RLS not applied), that means `set role authenticated` didn't take effect — STOP (see STOP conditions), don't loosen the assertions.

### Step 4: Wire the new file into the DB test script

`tests/rls-execution.test.mjs` is picked up by `npm test` automatically (it globs `tests/*.test.mjs`). Also add it to the `test:db` script in `package.json` alongside `rpc-execution.test.mjs` so the fast DB loop runs it:

Current (`package.json`): `"test:db": "node --test tests/rpc-execution.test.mjs"`
Change to: `"test:db": "node --test tests/rpc-execution.test.mjs tests/rls-execution.test.mjs"`

**Verify**: `npm run test:db` → both files run, all pass.

### Step 5: Full-suite gate

**Verify**: `npm test` → exit 0 (~480 + your new RLS tests); `npm run typecheck` → exit 0; `npm run lint` → 0 errors.

## Test plan

- New file `tests/rls-execution.test.mjs` with the six invariants above. Structural pattern: `tests/rpc-execution.test.mjs` (lifecycle, `expectThrow`, seed helpers).
- The key property each test proves: with the role switched to `authenticated`, the RLS predicate actually runs (viewer denied where a viewer should be, admin allowed where `is_admin()` is true).
- Verification: `npm run test:db` then `npm test`.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `tests/rls-execution.test.mjs` exists and `node --test tests/rls-execution.test.mjs` exits 0 with ≥ 6 tests
- [ ] `grep -c "asRole" tests/helpers/pgHarness.mjs` ≥ 1 and `grep -c "grant select, insert, update, delete" tests/helpers/pgHarness.mjs` ≥ 1
- [ ] `git diff --name-only 7b447ed..HEAD -- supabase/migrations` is empty (no migration touched)
- [ ] `npm run test:db` runs both DB files and exits 0
- [ ] `npm test`, `npm run typecheck`, `npm run lint` (0 errors) all pass
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- After Step 2, a viewer under `asRole("authenticated", ...)` still sees draft seats / all employees (RLS not engaging). Likely causes to report, NOT to paper over: PGlite doesn't honor `set role` the way stock Postgres does, or the grants/role setup needs a different shape. Do **not** switch to `alter table ... force row level security` as a workaround — the policies are `to authenticated`, so forcing RLS while the session role is the owner makes the policies not match and default-denies everything, which is a *different* wrong. If `set role` genuinely can't enforce RLS in this PGlite version, that is the finding — report it with the exact error and the PGlite version from `package.json`.
- `set role authenticated` errors with "permission denied to set role" — the base connection isn't a superuser as assumed; report.
- Making the new tests pass would require editing an existing `rpc-execution` test or any migration.
- Any existing `rpc-execution` test fails after Step 1's grants (they shouldn't — owner behavior is unchanged).

## Maintenance notes

- This harness capability (run a query as `authenticated` with RLS live) is the reusable primitive; Plan 008 uses it to verify the employees-policy narrowing, and future policy changes should add an assertion here.
- Reviewers should scrutinize: that the `asRole` `finally` always resets the role (a leaked `authenticated` role would make later same-connection queries mysteriously RLS-bound), and that test 4 (admin-allowed) is present — without it, a harness that globally denies would pass tests 1–3 for the wrong reason.
- The `published_employees` grant nuance (Step 1's `revoke`) keeps the harness faithful; if a future migration legitimately grants writes there, update the revoke to match.
