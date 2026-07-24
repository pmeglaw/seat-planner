# Plan 001: Make reset-draft-to-published survive permuted assignments and labels

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 3119e16..HEAD -- supabase/migrations/20260723230000_reset_draft_to_published.sql tests/reset-draft-transaction-safety.test.mjs tests/rpc-execution.test.mjs app/actions.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `3119e16`, 2026-07-24

## Why this matters

The "Reset draft to published" feature (PR #229, `reset_draft_seats_to_published` RPC) converges the draft seat layer back onto the published layer with **one bulk `UPDATE ... FROM`** that rewrites `employee_id` and `label`. Postgres checks non-deferrable unique indexes **per row, mid-statement** — and two such indexes exist on exactly those columns. So any draft that *permutes* assignments relative to published (the admin swapped two people, or moved a person from seat A to seat B) makes the reset abort with a raw `duplicate key value violates unique constraint` error. A two-seat swap fails deterministically. The server action re-throws non-MLS02 errors, production digest-strips the message, and the admin sees a dead generic error — the "discard everything" feature is unusable in precisely the diverged states it exists for. The codebase already knows this failure class: `update_draft_seat`'s force-move path stages through `NULL` first, with a comment saying it does so to "satisfy the one_draft_seat_per_employee invariant in one transaction" (`supabase/migrations/20260708120000_draft_concurrency_fence.sql:608`), and `restore_draft_snapshot` vacates every assigned draft seat before restoring (`20260708120000:352-357`). The reset RPC skipped that discipline.

## Current state

- `supabase/migrations/20260723230000_reset_draft_to_published.sql` — the live (and only) definition of `public.reset_draft_seats_to_published(expected_draft_seats jsonb default null)`. Structure today, in order:
  1. admin check (`app_private.is_admin()`, errcode `42501`)
  2. refuse when no published layer exists
  3. lock loop: `for update of seat` over all draft rows ordered by id
  4. optional concurrency fence: exact `(id, updated_at)` array, mismatch raises SQLSTATE `MLS02`
  5. **one bulk UPDATE** (lines 76–103) setting `seat_key, label, x, y, status, employee_id, zone, department, notes, is_custom` from the matching published row, matched on `coalesce(p.seat_key, p.label) = coalesce(d.seat_key, d.label)`, filtered to rows where any column `is distinct from`
  6. DELETE draft rows with no published counterpart (lines 105–113)
  7. INSERT published rows with no draft counterpart back as draft (lines 115–148)
  8. returns `updated_count + deleted_count + inserted_count` (each via `get diagnostics ... = row_count`)

- The colliding indexes (both **non-deferrable**):
  - `supabase/migrations/001_initial_schema.sql:63-65`:
    ```sql
    create unique index if not exists one_draft_seat_per_employee
      on public.seats(employee_id)
      where employee_id is not null and layer = 'draft';
    ```
  - `supabase/migrations/012_v111_advanced_drawer_safety.sql:17-18`: `seats_unique_label_per_layer` — unique on `(layer, label)` (read the file to confirm exact shape before writing assertions).

- Concrete failure, walked through: published has Alice@N01, Bob@N02. Admin swaps them in the draft (via the swap RPC, which stages correctly), so draft is Bob@N01, Alice@N02. Reset's bulk UPDATE must set N01.employee_id=Alice and N02.employee_id=Bob. Whichever row the executor updates first writes an `employee_id` the *other, not-yet-updated* draft row still holds → unique-index violation → whole reset aborts. The same class hits `label` permutations through `seats_unique_label_per_layer`, and a third variant: a draft-only custom seat holding a label that the UPDATE leg wants to give back to a matched row (the DELETE that would free the label runs *after* the UPDATE today).

- There is also a status/assignment CHECK constraint you must not violate mid-staging — `001_initial_schema.sql:50-58`: a seat is `status = 'assigned'` iff `employee_id is not null`, otherwise `employee_id is null`. Any staging step that nulls `employee_id` must set a non-assigned status in the same statement (the restore RPC uses `employee_id = null, status = 'available'` — copy that).

- `app/actions.ts:721-744` — `resetDraftToPublishedAction`: calls the RPC, returns `{ ok: false, code: "STALE_DRAFT", message }` on MLS02, **throws** on anything else, returns `{ ok: true, ...payload }` on success. The RPC's integer return value is discarded by the action, so the return count is informational only — but keep it truthful.

- `tests/reset-draft-transaction-safety.test.mjs` — source-pin test. **It reads the migration by fixed path** (lines 9–12):
  ```js
  const migrationSql = await readFile(
    new URL("../supabase/migrations/20260723230000_reset_draft_to_published.sql", import.meta.url),
    "utf8"
  );
  ```
  and asserts: the `create or replace function public.reset_draft_seats_to_published(\s+expected_draft_seats jsonb default null\s+)` signature, `returns integer`, `security invoker` (and NOT definer), the `is_admin` check, revoke-from-public + grant-to-authenticated, `for update of seat`, `errcode = 'MLS02'`, the `coalesce(p.seat_key, p.label) = coalesce(d.seat_key, d.label)` join, and that the SQL never writes `public.employees`. If you add a superseding migration and don't repoint this test, it starts pinning a **stale** definition — the exact drift failure mode this repo's test suite exists to prevent.

- `tests/rpc-execution.test.mjs:328-393` — five executed reset tests against real Postgres (PGlite): converge (mutate/delete/add, ids preserved), employees untouched, requires admin, refuses with no published map, MLS02 fence. **None permutes an assignment or a label** — that's why this bug shipped. Use this block as the structural template for the new tests. Note from its comments: originals can never be deleted from the draft (protection trigger), so any test that needs a deletable/insertable seat must use `isCustom: true` seats (see line 331's comment). The harness helpers you'll use: `db.seedEmployee({ fullName })`, `db.seedSeat({ label, key, status, employeeId, isCustom, layer })`, `db.query(sql, params)`, `db.actAsViewer()`, `expectThrow(promise, { code, match })`, `db.draftSeats()`.

- Repo conventions that apply:
  - Migrations are **append-only**: add a new timestamped file; do **not** edit `20260723230000_reset_draft_to_published.sql` (it is applied to prod; merging to main auto-applies new migrations via the Supabase GitHub integration).
  - Every RPC statement needs a WHERE clause (Supabase pg-safeupdate rejects bare UPDATE/DELETE on API connections).
  - All 41+ migrations are replayed into PGlite on every `npm test` run (`tests/helpers/pgHarness.mjs`), so a migration that doesn't replay cleanly fails the suite immediately.

## Commands you will need

| Purpose   | Command             | Expected on success |
|-----------|---------------------|---------------------|
| Install   | `npm install`       | exit 0 (note: `npm ci` is known to EPERM on the maintainer's Windows box; use `npm install`) |
| Tests     | `npm test`          | all pass (healthy baseline ~400 tests). If `login-form` / `rpc-execution` / `seat-inspector` / `seat-map-components` fail with module/harness import errors on an untouched tree, that is a known local-env issue — run `npm install` and retry before suspecting your change |
| DB tier only | `npm run test:db` | all pass (fast loop while iterating on the migration) |
| Typecheck | `npm run typecheck` | exit 0 |
| Lint      | `npm run lint`      | exit 0 |

## Scope

**In scope** (the only files you should modify/create):
- `supabase/migrations/20260724150000_reset_draft_staged_writes.sql` (create)
- `tests/reset-draft-transaction-safety.test.mjs` (repoint + extend)
- `tests/rpc-execution.test.mjs` (add tests to the reset block)

**Out of scope** (do NOT touch, even though they look related):
- `supabase/migrations/20260723230000_reset_draft_to_published.sql` — applied to prod; append-only discipline.
- `restore_draft_snapshot` (in `20260708120000_draft_concurrency_fence.sql`) — it has a *narrower* cousin of the label issue (only reachable through a temp-rename detour); deliberately deferred, recorded in `plans/README.md`.
- `app/actions.ts` — the action needs no change; the RPC contract (name, args, return, error codes) is unchanged.
- `components/seat-map/SeatMap.tsx` — error *surfacing* for this dialog is Plan 002.

## Git workflow

- Branch: `advisor/001-reset-rpc-staged-writes`
- Commit style: conventional, matching `git log` (e.g. `fix(publish): reset RPC stages employee/label writes to survive permutations`)
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Write the superseding migration

Create `supabase/migrations/20260724150000_reset_draft_staged_writes.sql`. It re-creates `public.reset_draft_seats_to_published(expected_draft_seats jsonb default null)` via `create or replace function`, preserving the existing header contract (seats only, never employees; fence; id stability) and changing **only the mutation section**. Start the file with a comment block explaining: supersedes `20260723230000`; the single bulk UPDATE violated `one_draft_seat_per_employee` / `seats_unique_label_per_layer` mid-statement on permuted drafts; writes are now staged inside the same transaction.

Keep steps 1–4 of the current body **verbatim** (admin check, published-exists check, lock loop, fence — copy them from `20260723230000`). Replace the mutation section with this order:

```sql
  -- Count the logical changes BEFORE mutating, so the return value stays
  -- truthful even though the staged writes below touch some rows twice.
  select count(*) into updated_count
  from public.seats as d
  join public.seats as p
    on p.layer = 'published'::public.seat_layer
   and coalesce(p.seat_key, p.label) = coalesce(d.seat_key, d.label)
  where d.layer = 'draft'::public.seat_layer
    and (
      d.label is distinct from p.label
      or d.x is distinct from p.x
      or d.y is distinct from p.y
      or d.status is distinct from p.status
      or d.employee_id is distinct from p.employee_id
      or d.zone is distinct from p.zone
      or d.department is distinct from p.department
      or d.notes is distinct from p.notes
      or d.is_custom is distinct from p.is_custom
    );

  -- 1) Delete draft-only rows FIRST so a draft-only seat can never hold a
  --    label the update leg is about to give back to a surviving row.
  --    (Same statement as before, moved ahead of the update.)
  delete from public.seats as d
  where d.layer = 'draft'::public.seat_layer
    and not exists (
      select 1
      from public.seats as p
      where p.layer = 'published'::public.seat_layer
        and coalesce(p.seat_key, p.label) = coalesce(d.seat_key, d.label)
    );
  get diagnostics deleted_count = row_count;

  -- 2) Stage: vacate every assignment that will change. one_draft_seat_per_
  --    employee is non-deferrable, so a permuted draft (two people swapped)
  --    would otherwise collide mid-statement in the final update. The paired
  --    status write keeps the seats_status_employee CHECK satisfied per row.
  update public.seats as d
  set employee_id = null,
      status = 'available'::public.seat_status
  from public.seats as p
  where d.layer = 'draft'::public.seat_layer
    and p.layer = 'published'::public.seat_layer
    and coalesce(p.seat_key, p.label) = coalesce(d.seat_key, d.label)
    and d.employee_id is not null
    and d.employee_id is distinct from p.employee_id;

  -- 3) Stage: park labels that will change on a collision-free temporary
  --    value (seats_unique_label_per_layer is also non-deferrable, so label
  --    permutations collide the same way). Only rows matched by seat_key are
  --    parked: for a row with a null seat_key the label IS the join key, so a
  --    changed label already means "no published counterpart" and the row was
  --    handled by the delete/insert legs instead.
  update public.seats as d
  set label = '~reset~' || d.id::text
  from public.seats as p
  where d.layer = 'draft'::public.seat_layer
    and p.layer = 'published'::public.seat_layer
    and d.seat_key is not null
    and p.seat_key = d.seat_key
    and d.label is distinct from p.label;

  -- 4) Converge surviving rows onto the published values (unchanged statement;
  --    row_count is no longer the reported figure — updated_count was
  --    precomputed above).
  update public.seats as d
  set
    seat_key = p.seat_key,
    label = p.label,
    x = p.x,
    y = p.y,
    status = p.status,
    employee_id = p.employee_id,
    zone = p.zone,
    department = p.department,
    notes = p.notes,
    is_custom = p.is_custom
  from public.seats as p
  where d.layer = 'draft'::public.seat_layer
    and p.layer = 'published'::public.seat_layer
    and coalesce(p.seat_key, p.label) = coalesce(d.seat_key, d.label)
    and (
      d.label is distinct from p.label
      or d.x is distinct from p.x
      or d.y is distinct from p.y
      or d.status is distinct from p.status
      or d.employee_id is distinct from p.employee_id
      or d.zone is distinct from p.zone
      or d.department is distinct from p.department
      or d.notes is distinct from p.notes
      or d.is_custom is distinct from p.is_custom
    );

  -- 5) Re-insert published-only rows as draft (unchanged statement from
  --    20260723230000, including get diagnostics inserted_count).
```

Then `return updated_count + deleted_count + inserted_count;` as before, and copy the trailing `revoke`/`grant` statements verbatim.

Notes that are load-bearing:
- The `'~reset~' || d.id::text` parking value cannot collide with a real label (real labels are short codes like `N01`) nor with another parked row (id is unique). It lives only inside this transaction — step 4's join is by `seat_key` for every parked row, so each parked row still matches and receives its final label.
- Declare no new variables beyond what the current function declares (`lock_row`, `updated_count`, `deleted_count`, `inserted_count` all exist).
- Every statement above has a WHERE clause — keep it that way (pg-safeupdate).

**Verify**: `npm run test:db` → the existing five reset tests still pass (the migration replays and the old behavior for non-permuted drafts is unchanged).

### Step 2: Add execution tests for the permuted cases

In `tests/rpc-execution.test.mjs`, inside the `reset_draft_seats_to_published` section (after the existing five tests, i.e. after line ~393), add four tests modeled on the `"reset: converges the draft back to the published map"` test:

1. **Swap**: seed Alice@N01 (assigned) and Bob@N02 (assigned); `publish_seat_map()`; then permute the draft with staged SQL (the test runs as table owner, so stage manually):
   ```js
   await db.query("update public.seats set employee_id = null, status = 'available' where layer = 'draft' and label in ('N01','N02')");
   await db.query("update public.seats set employee_id = $1, status = 'assigned' where layer = 'draft' and label = 'N01'", [bob]);
   await db.query("update public.seats set employee_id = $1, status = 'assigned' where layer = 'draft' and label = 'N02'", [alice]);
   ```
   Call `select public.reset_draft_seats_to_published()`; assert it does **not** throw, N01 is back to Alice, N02 back to Bob, and both draft rows kept their original ids.
2. **Move one person A→B**: Alice@N01 published, N02 available; in draft vacate N01 and assign Alice to N02 (stage via null as above); reset; assert Alice back on N01, N02 available.
3. **Label permutation**: two seats seeded **with explicit distinct seat keys** (`db.seedSeat({ label: "N01", key: "k-n01", ... })`, same for N02); publish; swap the two draft labels via a temp value (`~tmp~` then final); reset; assert both rows carry their published labels again and kept their ids.
4. **Draft-only seat holding a published label**: seed seat A (`label: "N01"`, `key: "k-a"`); publish; in the draft rename A's label to `N09` (direct update), then seed a **draft-only custom** seat with `label: "N01"` and a different key; reset; assert exactly one draft `N01` remains, it has seat A's original id, and the custom squatter is gone.

**Verify**: `npm run test:db` → all reset tests pass, including the four new ones. Before Step 1's migration exists these four tests MUST fail with `duplicate key value violates unique constraint` — if you want proof of the bug, run them once against a tree without the new migration.

### Step 3: Repoint and extend the source-pin test

In `tests/reset-draft-transaction-safety.test.mjs`:

1. Change the `migrationSql` path from `20260723230000_reset_draft_to_published.sql` to `20260724150000_reset_draft_staged_writes.sql`, and update the file's header comment to say the staged-writes migration is the live definition (superseding `20260723230000`).
2. All existing assertions must pass against the new file unchanged (signature, `returns integer`, `security invoker`, `is_admin`, revoke/grant, `for update of seat`, `MLS02`, the coalesce join, no `public.employees` writes) — if one fails, your migration dropped part of the contract; fix the migration, not the test.
3. Add one new test pinning the staging order, e.g.:
   ```js
   test("reset RPC stages vacate and label parking before the converging update", () => {
     const vacate = migrationSql.indexOf("set employee_id = null");
     const park = migrationSql.indexOf("'~reset~'");
     const converge = migrationSql.indexOf("seat_key = p.seat_key");
     const draftOnlyDelete = migrationSql.indexOf("delete from public.seats as d");
     assert.ok(vacate > -1 && park > -1 && converge > -1 && draftOnlyDelete > -1);
     assert.ok(draftOnlyDelete < vacate, "draft-only delete runs before staging");
     assert.ok(vacate < converge, "assignment vacate runs before the converging update");
     assert.ok(park < converge, "label parking runs before the converging update");
   });
   ```

**Verify**: `npm test` → full suite passes.

## Test plan

- New tests: the four rpc-execution cases in Step 2 (swap, move, label permutation, label squatter) and the staging-order pin in Step 3. Pattern files: the existing reset block `tests/rpc-execution.test.mjs:328-393` and the existing pins in `tests/reset-draft-transaction-safety.test.mjs`.
- Verification: `npm test` → all pass; `npm run typecheck` → exit 0; `npm run lint` → exit 0.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `supabase/migrations/20260724150000_reset_draft_staged_writes.sql` exists; `git diff --name-only` shows `20260723230000_reset_draft_to_published.sql` NOT modified
- [ ] `npm run test:db` exits 0 with the four new reset tests present and passing
- [ ] `npm test` exits 0
- [ ] `npm run typecheck` and `npm run lint` exit 0
- [ ] `grep -c "where" supabase/migrations/20260724150000_reset_draft_staged_writes.sql` ≥ 6 (every mutation carries a WHERE)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the cited locations doesn't match the excerpts (drift since `3119e16`).
- `seats_unique_label_per_layer` in `012_v111_advanced_drawer_safety.sql` turns out NOT to be a plain non-deferrable unique index on `(layer, label)` — the staging strategy assumes it is.
- The existing five reset tests fail after Step 1 for any reason other than a typo you can fix — that means the staged rewrite changed converge semantics.
- Any test failure involves the seat-protection trigger (`prevent_original_draft_seat_delete`) — the delete-first reordering should not change which rows get deleted, so a trigger error means an assumption is wrong.
- You find yourself wanting to edit `app/actions.ts` or the old migration.

## Maintenance notes

- Future publish-shaped RPCs that bulk-write `employee_id` or `label` on the draft layer must follow this same stage-then-converge discipline; point reviewers at this migration's header.
- `restore_draft_snapshot` still restores labels row-by-row without parking (narrow reachability, deferred) — if label-permutation bugs are ever reported against undo/redo or JSON restore, that is the place, and this migration is the pattern to copy.
- Reviewers should scrutinize: the precomputed `updated_count` (it intentionally counts logical changes, not physical row touches), and that the delete-first reorder didn't change which rows the protection trigger sees.
