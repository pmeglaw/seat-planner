# Plan 012: Stage label/seat_key writes in `restore_draft_snapshot` so permuted snapshots restore cleanly

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 89a8fea..HEAD -- supabase/migrations/ app/actions.ts tests/rpc-execution.test.mjs tests/restore-draft-snapshot-transaction-safety.test.mjs`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `89a8fea`, 2026-08-07

## Why this matters

Undo/redo and JSON snapshot restore call the `restore_draft_snapshot` Postgres
RPC, which rewrites the whole draft seat layer row by row. The unique indexes
`seats_unique_label_per_layer` and `seats_unique_key_per_layer` are
**non-deferrable**, so when a snapshot permutes two seats' labels (or seat_keys)
relative to the live draft — e.g. the admin swapped two labels and then hits
Undo — the loop's first UPDATE collides with a row later in the loop and the
whole RPC aborts with a raw `23505` duplicate-key error. In production that
surfaces as a useless digest-stripped error and the undo step is lost. The
sibling RPC `reset_draft_seats_to_published` had exactly this bug and was fixed
on 2026-07-24 by staging ("parking") changing labels on a collision-free
temporary value (migration `20260724150000_reset_draft_staged_writes.sql`).
`restore_draft_snapshot` never received the equivalent fix. This plan ports the
parking technique and adds executing regression tests.

## Current state

Relevant files:

- `supabase/migrations/20260708120000_draft_concurrency_fence.sql` — holds the
  **live** definition of `public.restore_draft_snapshot(snapshot_seats jsonb,
  snapshot_employees jsonb, expected_draft_seats jsonb default null)`. No later
  migration redefines it (verify in step 1). The restore section:
  - Vacates all assigned draft seats first (this is why employee-assignment
    permutations do NOT collide — only labels/seat_keys do):
    ```sql
    update public.seats
    set
      employee_id = null,
      status = 'available'::public.seat_status
    where layer = 'draft'::public.seat_layer
      and status = 'assigned'::public.seat_status;
    ```
  - Deletes eligible custom draft seats missing from the snapshot, asserts
    `affected_count <> expected_delete_count` → exception.
  - Then a `for restore_row in ... order by source.id loop` that per-row
    UPDATEs an existing draft seat (`set seat_key = ..., label = ...`) or
    INSERTs a re-created one. **No label/seat_key staging anywhere** — this is
    the bug.
- `supabase/migrations/20260724150000_reset_draft_staged_writes.sql` — the
  pattern to port. Its staging step 3 (comment verbatim from the file):
  ```sql
  -- 3) Stage: park labels that will change on a collision-free temporary value
  --    (seats_unique_label_per_layer is also non-deferrable). ...
  update public.seats as d
  set label = '~reset~' || d.id::text
  from public.seats as p
  where d.layer = 'draft'::public.seat_layer
    and p.layer = 'published'::public.seat_layer
    and d.seat_key is not null
    and p.seat_key = d.seat_key
    and d.label is distinct from p.label;
  ```
- `app/actions.ts:833-846` — `restoreDraftSnapshotAction` calls the RPC;
  MLS02 (stale-draft fence) errors are returned as `{ ok: false, code:
  "STALE_DRAFT" }`, everything else is thrown (digest-stripped in prod). Do
  NOT change this action — the fix is entirely in SQL.
- `tests/rpc-execution.test.mjs` — PGlite tier that applies the real
  migrations and executes RPCs. Contains the exact test patterns to copy:
  `"reset: survives a permuted assignment swap between two draft seats"`,
  `"reset: survives a label permutation between two draft seats with stable
  seat_key"` (~line 1090-1180). The restore tests live around lines 796-892.
- `tests/restore-draft-snapshot-transaction-safety.test.mjs:9` — pins the live
  restore definition to `20260708120000_draft_concurrency_fence.sql` by
  reading that file. **When you add a new migration redefining the function,
  this test must be re-pointed at the new file** or it will keep asserting on
  the superseded copy (and may still pass — the pin exists to prevent exactly
  this kind of silent supersession).

Repo conventions that apply:

- New migrations are timestamped `YYYYMMDDHHMMSS_slug.sql` and must sort after
  the newest existing one (`20260806140000_import_assignments_csv_employee_fence.sql`).
- Migrations run on prod automatically when merged to `main` (Supabase GitHub
  integration) — never apply to prod manually.
- Supabase API connections run `pg-safeupdate`: bare `UPDATE`/`DELETE` without
  a `WHERE` are rejected. Every statement you write must carry a `WHERE`
  (the parking UPDATE naturally does).
- `SECURITY DEFINER` functions must `set search_path` — copy the header
  (admin check, `search_path`, fence validation) from the existing definition
  verbatim; only the body between the vacate step and the loop changes.
- The MLS02 fence logic (`expected_draft_seats` validation raising SQLSTATE
  `MLS02`) must be preserved byte-for-byte in behavior. Two details there are
  load-bearing and documented in `lib/draftConcurrency.ts`'s header: per-row
  expectation map, timestamps compared verbatim.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install | `npm install` (NOT `npm ci` — EPERMs on this Windows box) | exit 0 |
| DB-execution tests only | `npm run test:db` | all pass |
| Full suite | `npm test` | all pass (healthy baseline ~600+ pass / 0 fail) |
| Typecheck | `npm run typecheck` | exit 0 |
| Lint | `npm run lint` | exit 0 |

Note: 4 test files (`login-form`, `rpc-execution`, `seat-inspector`,
`seat-map-components`) can fail on an untouched tree when `node_modules`
drifts — reinstall before suspecting your change.

## Scope

**In scope** (the only files you should modify/create):
- `supabase/migrations/20260807120000_restore_draft_snapshot_staged_writes.sql` (create)
- `tests/rpc-execution.test.mjs` (add tests)
- `tests/restore-draft-snapshot-transaction-safety.test.mjs` (re-point the pinned file)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch, even though they look related):
- `app/actions.ts` — the action's error contract is correct as-is.
- `supabase/migrations/20260708120000_draft_concurrency_fence.sql` and every
  other existing migration — migrations are append-only history.
- `reset_draft_seats_to_published` — already fixed; it is your template, not
  your target.
- Employee handling in the RPC — `restore_draft_snapshot` deliberately only
  inserts/upserts employees, never deletes (owner-confirmed design; tests pin
  it). Do not "fix" that.

## Git workflow

- Branch: `advisor/012-restore-snapshot-label-parking`
- Commit style: conventional commits, e.g. `fix(draft): stage label/seat_key writes in restore_draft_snapshot` (see `git log --oneline -10` for the house style)
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Confirm the live definition

Run: `grep -l "create or replace function public.restore_draft_snapshot" supabase/migrations/*.sql`

**Verify**: exactly two files — `20260616000300_restore_draft_snapshot_rpc.sql`
(superseded) and `20260708120000_draft_concurrency_fence.sql` (live). If a
third file appears, the function was redefined after this plan was written —
STOP.

### Step 2: Write the new migration

Create `supabase/migrations/20260807120000_restore_draft_snapshot_staged_writes.sql`.
Copy the **entire** current `create or replace function
public.restore_draft_snapshot(...)` definition from
`20260708120000_draft_concurrency_fence.sql` (signature, admin check,
`security definer`, `set search_path`, fence validation, employee upserts,
zone-option upsert, vacate step, delete step, loop) and insert ONE new staging
statement between the custom-seat delete block (the one ending in
`raise exception 'Could not remove every eligible custom draft seat missing
from the snapshot.'`) and the `for restore_row in` loop:

```sql
  -- Stage: park label AND seat_key for every surviving draft row the snapshot
  -- will change. Both unique indexes (seats_unique_label_per_layer,
  -- seats_unique_key_per_layer) are non-deferrable, so a permuted snapshot
  -- would collide with a not-yet-updated row mid-loop. Parking on the row id
  -- is collision-free against real labels and against other parked rows.
  -- Mirrors 20260724150000_reset_draft_staged_writes.sql step 3.
  update public.seats as d
  set label = '~restore~' || d.id::text,
      seat_key = '~restore~' || d.id::text
  from jsonb_to_recordset(snapshot_seats) as source(id uuid, seat_key text, label text)
  where d.layer = 'draft'::public.seat_layer
    and d.id = source.id
    and (
      d.label is distinct from trim(source.label)
      or d.seat_key is distinct from trim(source.seat_key)
    );
```

Notes that are load-bearing:
- Join on `d.id = source.id` — the restore loop matches rows by `id` (unlike
  reset, which joins on `coalesce(seat_key, label)`), so the parking join must
  be by `id` too.
- Park BOTH columns whenever EITHER changes: parking only the changed one can
  still collide on the other index when both permute in one snapshot.
- The trim on `source.label` / `source.seat_key` must match the loop's own
  `trim(source.seat_key)` / `trim(source.label)` so "changed" is judged the
  same way the write will happen.
- Rows the parking touches are then converged to their snapshot values by the
  existing loop (the loop overwrites `label` and `seat_key` unconditionally
  for every matched row), so no parked value can survive the transaction.
- Add a header comment in the new migration naming the bug and pointing at the
  reset counterpart, matching the style of `20260724150000`'s header.

**Verify**: `npm run test:db` → all existing tests still pass (your new tests
come in step 4).

### Step 3: Re-point the transaction-safety pin

In `tests/restore-draft-snapshot-transaction-safety.test.mjs:9`, change the
pinned path from `20260708120000_draft_concurrency_fence.sql` to
`20260807120000_restore_draft_snapshot_staged_writes.sql`. Run the test; if it
asserts on tokens that moved, keep the assertions and fix the migration copy
(the assertions describe required properties of the live definition — admin
check, fence, atomic ordering — and your copy must satisfy all of them
unchanged).

**Verify**: `node --test tests/restore-draft-snapshot-transaction-safety.test.mjs` → pass.

### Step 4: Add executing regression tests

In `tests/rpc-execution.test.mjs`, next to the existing restore tests
(~line 796-892), add three tests modeled on the `"reset: survives a label
permutation..."` pattern (~line 1161):

1. **Label permutation**: seed two seats `N01`/`N02` (with distinct
   `seat_key`s), capture the draft as a snapshot (same shape the client sends —
   see the existing restore tests for the snapshot-building helper), swap the
   two labels in the snapshot payload, call
   `public.restore_draft_snapshot(snapshot, employees, null)`, assert both
   rows carry the swapped labels, original ids preserved, and no `~restore~`
   residue: `select count(*) from seats where label like '~restore~%' or seat_key like '~restore~%'` → 0.
2. **seat_key permutation**: same shape, swap the `seat_key`s instead of the
   labels; assert convergence and no residue.
3. **Insert-branch collision**: seed seats `N01` (original) and a custom seat
   `X01`; snapshot the draft; then in the live draft delete the custom seat
   and rename `N01`→`X01` is not possible (label change on original) — instead:
   seed custom seats `X01` and `X02`; snapshot; in the live draft delete `X02`
   and relabel `X01`→`X02`; restore the snapshot. The loop must re-insert the
   deleted `X02`... whose label the live `X01` row currently holds. Assert the
   restore succeeds and both customs carry their snapshot labels.

Before the fix these tests fail with `23505`; after, they pass — you can
confirm by stashing the migration temporarily if you want the red state, but
it is not required.

**Verify**: `npm run test:db` → all pass including the 3 new tests.

### Step 5: Full gates

**Verify**: `npm test` → all pass; `npm run typecheck` → exit 0; `npm run lint` → exit 0.

## Test plan

Covered by step 4 (three new PGlite execution tests in
`tests/rpc-execution.test.mjs`, pattern: the reset permutation tests) plus the
re-pointed source pin in step 3. No client-side tests needed — no TS changed.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run test:db` exits 0; the 3 new restore-permutation tests exist and pass
- [ ] `node --test tests/restore-draft-snapshot-transaction-safety.test.mjs` exits 0 and its pinned path names the NEW migration file
- [ ] `npm test`, `npm run typecheck`, `npm run lint` all exit 0
- [ ] `git status` shows changes only in the in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Step 1 finds a third definition of `restore_draft_snapshot` (post-plan drift).
- The current definition's fence section differs from what
  `tests/restore-draft-snapshot-transaction-safety.test.mjs` asserts — the pin
  and the code disagree, which is itself a finding.
- Your new tests still raise `23505` after the parking statement is in place —
  the collision has a second source this plan did not model.
- The fix appears to require touching `app/actions.ts` or any existing
  migration.
- PGlite fails to apply the new migration (syntax accepted by prod Postgres
  but not PGlite) — report the exact error rather than working around it.

## Maintenance notes

- Any future migration that redefines `restore_draft_snapshot` must carry the
  parking statement forward and re-point the transaction-safety pin again —
  the pin is what makes forgetting loud.
- The same parking technique now exists in two RPCs (reset + restore). If a
  third bulk rewrite RPC is ever added, park by the join key that RPC uses.
- Reviewer should scrutinize: the parking join is by `id` (not
  `coalesce(seat_key,label)` — that is reset's join, not restore's), and both
  columns are parked together.
