# Plan 005: Make the recorded publish `change_summary` match what the admin reviewed

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 3119e16..HEAD -- supabase/migrations/20260715120000_publish_change_summary.sql lib/publishSummary.ts lib/publishHistory.ts tests/rpc-execution.test.mjs tests/published-employee-snapshot.test.mjs`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S-M
- **Risk**: LOW (additive counts on a nullable jsonb column; old rows unaffected)
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `3119e16`, 2026-07-24

## Why this matters

`publish_events.change_summary` is the permanent audit record of what each publish changed. It is computed in SQL inside the publish transaction (`20260715120000_publish_change_summary.sql`), and its own header says the counts "mirror `lib/publishSummary.ts` semantics" — the client function that renders the review dialog the admin approves. But the two implementations disagree on two change kinds:

1. **People added/removed.** The SQL `employee_edits` count is an **inner join** `employees e JOIN published_employees pe ON pe.id = e.id`, so it counts only edits to people present in *both* — never a newly-added or removed person. The client (`buildEmployeeDetailChanges`) explicitly counts "New in the viewer directory" and "Removed from the viewer directory".
2. **Seat detail edits.** The client's `buildOtherChangeDetail` counts label / zone / department / notes / `is_custom` changes (its `otherChanges` bucket). The SQL has **no** counterpart among its six counts.

So a publish whose only change is "added two new people" or "renamed a seat / changed its zone" writes an **all-zero** `change_summary`. The audit row then reads "No changes recorded" (`lib/publishHistory.ts:80`) for a publish that did change the viewer map — exactly the question the audit trail exists to answer, silently contradicting the dialog the admin signed off on. Nothing tests the SQL counts against the TS ones, which is why the divergence is invisible.

## Current state

- `supabase/migrations/20260715120000_publish_change_summary.sql:42-103` — the `jsonb_build_object` computing six counts inside `app_private.publish_seat_map()`, BEFORE the published layer is replaced:
  - `seats_added`, `seats_removed` (anti-joins on `coalesce(seat_key,label)`)
  - `assignments_changed`, `seats_moved` (0.0005 epsilon), `status_changes` (inner joins on matched seats)
  - `employee_edits` (inner join `employees` × `published_employees`, filtered to `e.active` and any of full_name/position/department/phone_extension/email differing) — lines 90-102.
- `lib/publishSummary.ts`:
  - `buildEmployeeDetailChanges` (`:127-153`): counts edits for people in both, **plus** "New in the viewer directory" for a live-active person absent from the published snapshot (`:138`) and "Removed from the viewer directory" for a snapshot person absent from live-active (`:147`).
  - `buildOtherChangeDetail` (`:90-100`): label, zone, department, notes, is_custom changes on a matched seat → the `otherChanges` bucket.
  - `totalChangeCount` (`:213`) = addedSeats + updatedSeatCount + removedSeats + employeeDetailChanges. `updatedSeatCount` is the size of `updatedSeatKeys`, which `otherChanges` contributes to (`:200`).
- `lib/publishHistory.ts:42-86` — `CHANGE_SUMMARY_BUCKETS` (the six keys) and `formatPublishChangeSummary`. It renders only recognized keys; unknown keys are ignored, all-zero → "No changes recorded", missing/malformed → null. **Adding new keys here is required** for them to show in the Management publish-history line.
- `tests/rpc-execution.test.mjs:202-241` — the executed publish tests read only `published_by` and `seat_count`; `change_summary` is never selected/asserted.
- `tests/published-employee-snapshot.test.mjs:55-72` — the live-publish source pin. It asserts `security definer`, the admin check, and the delete→insert→audit ordering, but NOT `set search_path` and not the change-summary block. This is the guardrail that scans all migrations for the latest `app_private.publish_seat_map()` definition (`latestPublishFunction()` at `:29-40`) — so a new migration redefining the function is automatically the one pinned.
- `tests/publish-summary.test.mjs` — exercises the TS side only.

## Commands you will need

| Purpose   | Command             | Expected on success |
|-----------|---------------------|---------------------|
| Install   | `npm install`       | exit 0 (`npm install`, not `npm ci`) |
| DB tier   | `npm run test:db`   | all pass (fast loop for the migration) |
| Tests     | `npm test`          | all pass (~400; 4-file local-env flake caveat) |
| Typecheck | `npm run typecheck` | exit 0 |
| Lint      | `npm run lint`      | exit 0 |

## Scope

**In scope**:
- `supabase/migrations/20260724160000_publish_change_summary_parity.sql` (create — supersedes the counts in `20260715120000`)
- `lib/publishHistory.ts` (add the new bucket keys so they render)
- `tests/rpc-execution.test.mjs` (add a change_summary parity test)
- `tests/published-employee-snapshot.test.mjs` (add `set search_path` + change-summary assertions to the live pin)
- `tests/publish-history.test.mjs` (extend for the new buckets, if that file asserts bucket formatting — check first)

**Out of scope** (do NOT touch):
- `supabase/migrations/20260715120000_publish_change_summary.sql` — append-only; the new migration re-creates the function.
- `lib/publishSummary.ts` — it is the source of truth this plan makes SQL match; do not change it.
- The seat-diff counts (`seats_added` … `status_changes`) — they are correct; only the employee/other-change gaps are in scope.

## Git workflow

- Branch: `advisor/005-change-summary-parity`
- Commit style: conventional (e.g. `fix(publish): change_summary counts added/removed people and seat detail edits`)
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Write the superseding migration

Create `supabase/migrations/20260724160000_publish_change_summary_parity.sql` that re-creates `app_private.publish_seat_map()` via `create or replace function`, **copying the entire existing body from `20260715120000`** and changing only the `jsonb_build_object`:

- Fix `employee_edits` to keep counting matched-and-edited people (unchanged inner-join clause).
- Add `employees_added`: count of `e` in `public.employees` with `e.active` and `not exists (select 1 from public.published_employees pe where pe.id = e.id)`.
- Add `employees_removed`: count of `pe` in `public.published_employees` with `not exists (select 1 from public.employees e where e.id = pe.id and e.active)`.
- Add `seat_detail_changes`: count of matched seats (inner join on `coalesce(seat_key,label)`) where any of label / zone / department / notes / is_custom differ (`is distinct from`), mirroring `buildOtherChangeDetail`.

Start the file with a header noting it supersedes `20260715120000` and why (parity with `lib/publishSummary.ts`: the old summary silently zeroed publishes whose only change was added/removed people or seat detail edits). Preserve `security definer`, `set search_path = public`, the admin check, and the delete→copy→snapshot→audit ordering exactly — copy them; do not paraphrase.

**Verify**: `npm run test:db` → existing publish execution tests still pass (the migration replays and the seat-copy behavior is unchanged).

### Step 2: Register the new buckets in the formatter

In `lib/publishHistory.ts`, add three entries to `CHANGE_SUMMARY_BUCKETS` (`:42-49`) so they render in the Management history line:

```ts
  { key: "employees_added", singular: "person added", plural: "people added" },
  { key: "employees_removed", singular: "person removed", plural: "people removed" },
  { key: "seat_detail_changes", singular: "seat detail change", plural: "seat detail changes" }
```

Order them sensibly within the fixed display order (people near `employee_edits`, seat detail near the seat counts — your call, but keep it stable). Unknown keys in old rows are already ignored, and old rows simply lack these keys, so backward compatibility holds.

**Verify**: `npm run typecheck` → exit 0. If `tests/publish-history.test.mjs` asserts an exact bucket list or formatted output, update it to include the new buckets (extend, don't weaken).

### Step 3: Add an execution parity test

In `tests/rpc-execution.test.mjs`, add a test in the publish section that seeds a divergence exercising **every** change kind, publishes, then reads back `change_summary` and asserts each count. Model it on the existing publish tests (`:202-241`) and the seed helpers. Cover at minimum:

- one seat added, one removed (custom seats — originals can't be deleted; see the reset block's comment at `:331`),
- one assignment changed, one seat moved past 0.0005, one status change,
- one employee edited, one employee added (active, no snapshot row), one employee removed (in snapshot, now inactive),
- one seat detail change (e.g. a `notes` or `zone` edit on a matched seat).

Assert the returned `change_summary` has the expected nonzero counts for `employees_added`, `employees_removed`, and `seat_detail_changes` specifically (the three this plan adds), plus a spot-check on an existing count. To publish twice (establish a baseline snapshot, diverge, then publish again and read the second event) follow the pattern the reset tests use to get a published baseline.

**Verify**: `npm run test:db` → the new parity test passes. Before Step 1, the three new-count assertions MUST fail (the keys don't exist) — a quick way to confirm the test bites.

### Step 4: Tighten the live source pin

In `tests/published-employee-snapshot.test.mjs`, in the "publish RPC replaces the employee snapshot atomically" test (`:55-72`), add:

- `assert.match(publishSql, /set search_path = public/);` (the DEFINER hardening that was never pinned),
- assertions that the change-summary object contains the new keys: `assert.match(publishSql, /'employees_added'/)`, `/'employees_removed'/`, `/'seat_detail_changes'/`.

Because `latestPublishFunction()` scans all migrations for the newest definition, these now pin *your* new migration automatically.

**Verify**: `node --test tests/published-employee-snapshot.test.mjs` → all pass.

### Step 5: Full-suite gate

**Verify**: `npm test`, `npm run typecheck`, `npm run lint` → all exit 0.

## Test plan

- New execution test (Step 3) asserting the three added counts plus a spot-check, against real Postgres.
- Extended live pin (Step 4) for `set search_path` and the three new keys.
- Extended formatter test if `publish-history.test.mjs` pins buckets.
- Verification: `npm run test:db` then `npm test`.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `supabase/migrations/20260724160000_publish_change_summary_parity.sql` exists; `20260715120000_*.sql` unchanged (`git diff --name-only`)
- [ ] `grep -c "employees_added\|employees_removed\|seat_detail_changes" supabase/migrations/20260724160000_publish_change_summary_parity.sql` ≥ 3
- [ ] `grep -c "employees_added\|employees_removed\|seat_detail_changes" lib/publishHistory.ts` ≥ 3
- [ ] `npm run test:db` exits 0 with the parity test present and passing
- [ ] `npm test`, `npm run typecheck`, `npm run lint` all exit 0
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The `20260715120000` function body no longer matches the excerpt (a later migration already redefined it — build on THAT one; find it via `latestPublishFunction`'s logic: newest migration defining `app_private.publish_seat_map`).
- Adding the counts changes an existing count's value in the execution test (they must be independent).
- `lib/publishSummary.ts` turns out to compute "removed" against inactive-vs-absent differently than the snapshot semantics allow in SQL — reconcile the definition of "removed from the viewer directory" (client uses live-active vs snapshot; SQL must match: a snapshot person with no active live row) before finalizing.

## Maintenance notes

- The invariant to preserve going forward: the SQL `change_summary` and `lib/publishSummary.ts` must count the same change kinds. The Step 3 parity test is the tripwire — any future change to one side without the other fails it.
- Reviewers should scrutinize the "removed" semantics (active-vs-inactive vs present-vs-absent) — that's the subtlest parity point.
- `formatPublishChangeSummary`'s "No changes recorded" branch (all recognized counts zero) is now only reachable for a genuine no-op publish; verify no path publishes with zero real changes and a nonempty dialog.
