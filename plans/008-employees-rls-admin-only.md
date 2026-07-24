# Plan 008: Narrow the `employees` select policy to admins (viewers read only the snapshot)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 7b447ed..HEAD -- supabase/migrations/005_policy_advisor_cleanup.sql app/page.tsx app/actions.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: MED (a prod RLS-policy change on a table read by admin surfaces — verify no non-admin path reads `employees`)
- **Depends on**: `plans/007-rls-execution-harness.md` (must be DONE — its `asRole` harness is how this fix is verified)
- **Category**: security
- **Planned at**: commit `7b447ed`, 2026-07-24

## Why this matters

The two-layer model promises that viewers never see the admins' draft-side working set: `employees` is the live directory admins edit, and viewers are supposed to read only the `published_employees` snapshot that publish replaces atomically. `CLAUDE.md` states RLS is the *independent* enforcement of this. But the live policy is `employees_select_authenticated ... using (active = true or app_private.is_admin())` — so **any authenticated user, holding the public anon key that ships in the client bundle, can query `public.employees` directly through PostgREST and read every active employee, including unpublished renames, title/department/extension/email edits, and people added since the last publish.** The invariant the architecture claims is enforced only by the viewer page's choice of table, not by the database. This narrows the policy to admin-only so the DB actually enforces what the app promises. Same-org internal tool, so severity is modest — but it is the one real RLS gap the audit found, and (post-Plan 007) it can be shipped with a test that proves a viewer reads zero rows.

## Current state

- Live policy (from `005_policy_advisor_cleanup.sql:19-24`, re-applied identically by `010`/timestamped advisor-cleanup migrations):
  ```sql
  create policy "employees_select_authenticated"
  on public.employees
  for select
  to authenticated
  using (active = true or (select app_private.is_admin()));
  ```
- **Who reads `employees` (must all be admin-gated for this to be safe):**
  - `app/page.tsx` (the viewer route) reads `published_employees`, NOT `employees` — guarded by `tests/published-employee-snapshot.test.mjs` (`doesNotMatch(viewerSource, /from\("employees"\)/)`).
  - `app/admin/page.tsx`, `app/admin/management/page.tsx`, `app/admin/settings/page.tsx` read `employees` — but only after `getAdminPageContext()` establishes an admin (and they run as the admin's authenticated session, so `is_admin()` is true).
  - `app/actions.ts` reads/writes `employees` — every action calls `requireAdmin()` first.
  - Confirm this inventory yourself in Step 1; the fix is safe **only if** no non-admin authenticated path reads `employees`.
- `published_employees` remains readable by any authenticated user (its own `for select to authenticated` policy, migration `20260708230000`) — viewers keep working through it. This plan does **not** touch that.
- Plan 007 added `tests/rls-execution.test.mjs` with a test documenting the *current* leak (viewer reads active employees). This plan flips that test to assert the fix.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install | `npm install` | exit 0 (`npm install`, not `npm ci`) |
| DB tier | `npm run test:db` | all pass (includes `tests/rls-execution.test.mjs` after Plan 007) |
| Tests | `npm test` | all pass (~480+; 4-file local-env flake caveat) |
| Typecheck | `npm run typecheck` | exit 0 |
| Lint | `npm run lint` | 0 errors |

## Scope

**In scope**:
- `supabase/migrations/20260724170000_employees_select_admin_only.sql` (create)
- `tests/rls-execution.test.mjs` (flip the employees assertion added in Plan 007)

**Out of scope** (do NOT touch):
- The `published_employees` policy or table — viewers must keep reading it.
- Any other `employees` policy (insert/update/delete are already admin-only).
- `app/page.tsx` / `app/actions.ts` / admin pages — no code change; the fix is purely in RLS. (You will *read* them in Step 1 to confirm the safety inventory.)
- `05_policy_advisor_cleanup.sql` and every prior migration — append-only; the new migration's drop+create supersedes.

## Git workflow

- Branch: `advisor/008-employees-rls-admin-only`
- Commit style: conventional (e.g. `fix(security): employees select is admin-only; viewers read the snapshot`)
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Confirm the safety inventory (no non-admin reads `employees`)

Run: `grep -rn 'from("employees")\|from(.employees.)' app lib components`

Expected: matches only in `app/admin/page.tsx`, `app/admin/management/page.tsx`, `app/admin/settings/page.tsx`, and `app/actions.ts` — all admin-gated (the pages via `getAdminPageContext`, the actions via `requireAdmin`). `app/page.tsx` must NOT appear. If any non-admin surface reads `employees`, **STOP and report** — narrowing the policy would break it, and the fix needs rethinking.

**Verify**: the grep inventory matches the expectation (record it in your report).

### Step 2: Write the policy-narrowing migration

Create `supabase/migrations/20260724170000_employees_select_admin_only.sql`:

```sql
-- Security fix (Plan 008): the employees table is the admins' live draft-side
-- directory; viewers must read people only through the published_employees
-- snapshot (app/page.tsx). The prior policy allowed any authenticated user to
-- read every ACTIVE employee directly via PostgREST (active = true OR is_admin),
-- leaking unpublished renames/edits/additions — a hole in the two-layer model
-- that CLAUDE.md says RLS enforces. Narrow SELECT to admins only. Viewers are
-- unaffected: they never query employees (guarded by
-- tests/published-employee-snapshot.test.mjs) and keep reading
-- published_employees, whose own policy is untouched.
drop policy if exists "employees_select_authenticated" on public.employees;
create policy "employees_select_authenticated"
on public.employees
for select
to authenticated
using ((select app_private.is_admin()));
```

The drop+create is authoritative regardless of which prior migration last defined the policy (dual-numbering history). Keep the `(select app_private.is_admin())` wrapper form (the advisor-recommended shape that avoids per-row helper re-evaluation).

**Verify**: `npm run test:db` → the migration replays; existing DB tests still pass (they run as admin or owner, both unaffected).

### Step 3: Flip the RLS test to assert the fix

In `tests/rls-execution.test.mjs` (created by Plan 007), replace the employees test that documented the leak with the fixed behavior. It must assert BOTH sides so the policy is pinned precisely:

```js
test("RLS: a viewer reads zero employees; an admin reads all", async () => {
  const alice = await db.seedEmployee({ fullName: "Alice", active: true });
  await db.seedEmployee({ fullName: "Zoe (inactive)", active: false });

  // Viewer: the live employees table is now fully hidden — people reach the
  // viewer only through published_employees (Plan 008).
  await db.actAsViewer();
  await db.asRole("authenticated", async () => {
    const seen = await db.query("select id from public.employees");
    assert.equal(seen.rows.length, 0, "viewer cannot read the draft-side directory at all");
  });

  // Admin: still reads the full live directory (active and inactive).
  await db.actAs(db.adminId);
  await db.asRole("authenticated", async () => {
    const seen = await db.query("select id from public.employees order by full_name");
    assert.equal(seen.rows.length, 2, "admin reads every employee");
    assert.ok(seen.rows.some(r => r.id === alice), "including the active one");
  });
});
```

Keep a comment noting the prior (pre-008) behavior was "viewer reads active employees," so the diff reads as an intentional tightening.

**Verify**: `node --test tests/rls-execution.test.mjs` → all pass, including this flipped test. Before Step 2's migration, this test MUST fail (the viewer would still read Alice) — a quick way to confirm it bites.

### Step 4: Full-suite gate

**Verify**: `npm run test:db`, `npm test`, `npm run typecheck`, `npm run lint` (0 errors) → all pass.

## Test plan

- The flipped RLS test (viewer reads 0 employees, admin reads all) is the regression pin, executed against real Postgres via Plan 007's `asRole` harness.
- `tests/published-employee-snapshot.test.mjs` continues to guard that the viewer *page* reads `published_employees` — the two together prove both the app path and the DB enforcement.
- Verification: `npm run test:db` then `npm test`.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `supabase/migrations/20260724170000_employees_select_admin_only.sql` exists and contains `using ((select app_private.is_admin()))` with NO `active = true` clause
- [ ] `git diff --name-only 7b447ed..HEAD -- supabase/migrations/005_policy_advisor_cleanup.sql` is empty (old migration untouched)
- [ ] `node --test tests/rls-execution.test.mjs` exits 0 with the "viewer reads zero employees" assertion present
- [ ] `npm run test:db`, `npm test`, `npm run typecheck`, `npm run lint` (0 errors) all pass
- [ ] Only the two in-scope files modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Step 1's grep finds a non-admin authenticated surface reading `employees` (e.g. `app/page.tsx`, a public API route) — the narrowing would break it; report before proceeding.
- Plan 007 is not DONE (no `asRole` helper / no `tests/rls-execution.test.mjs`) — this plan's verification depends on it; stop and say so.
- The flipped test still shows the viewer reading employees after the migration — the migration didn't take effect (wrong policy name, or a later migration re-widens it); investigate which migration is live and report.
- `tests/published-employee-snapshot.test.mjs` starts failing — that means a viewer path was pointed at `employees`; do not "fix" it by widening this policy.

## Maintenance notes

- After this, `employees` is admin-only for all four verbs; the only viewer-facing people source is `published_employees`. Any future feature that needs a viewer to see live (unpublished) people data must go through a new publish or a new, deliberately-scoped snapshot — never by re-widening this policy.
- Reviewers should scrutinize: the Step 1 inventory (the whole safety argument rests on it) and that the `published_employees` policy is untouched (viewers must not go blank).
- Deploy note for the operator: this is an RLS-policy migration — merging to main applies it to prod via the Supabase integration. There is no data change and no app change, so rollback (if ever needed) is a follow-up migration restoring the old `active = true or is_admin()` predicate, not a revert.
