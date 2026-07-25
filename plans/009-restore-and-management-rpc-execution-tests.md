# Plan 009: Execution-test `restore_draft_snapshot` + the three unexecuted management RPCs

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat ff556e3..HEAD -- tests/rpc-execution.test.mjs tests/helpers/pgHarness.mjs supabase/migrations/20260708120000_draft_concurrency_fence.sql supabase/migrations/20260702100000_department_integrity_normalization.sql`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW (test-only; no product, migration, or prod change)
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `ff556e3`, 2026-07-24

## Why this matters

The PGlite execution tier (`tests/rpc-execution.test.mjs`) runs the real migrations and calls the atomic RPCs against a live Postgres, asserting on the resulting rows — the only tier that verifies the transaction logic rather than grepping the SQL. It covers swap, `update_draft_seat`, publish, CSV import, `deactivate_employee`, `rename_department`, and reset. But four SECURITY-sensitive, multi-row RPCs are still verified **only** by source-text `*-transaction-safety` tests: **`restore_draft_snapshot`** (the whole-draft undo/redo + JSON-restore backend — the single highest-blast-radius admin RPC, which can delete custom seats and rewrite every draft assignment), and the three management RPCs **`delete_department`**, **`rename_zone`**, **`delete_zone`**. A regression in their actual transaction logic (a broken fence, a bad convergence, an orphaned option row, a missing admin check) would pass CI green today. This plan gives all four real execution coverage, using the templates already in the file.

## Current state

- `tests/rpc-execution.test.mjs` — the execution suite. Structure (`:1-30`): a module-level `db = await createSeatPlannerDb()` (`before`), `db.reset()` in `beforeEach`, and a local `expectThrow(promise, { code, match })`. A grep confirms **none** of `restore_draft_snapshot` / `delete_department` / `rename_zone` / `delete_zone` appears anywhere in the file.
- Harness helpers (`tests/helpers/pgHarness.mjs`): `db.reset()` (starts as admin), `db.actAsViewer()` (switches to a non-admin identity — flips `auth.uid()`, so the RPC's own `is_admin()` check fails), `db.seedEmployee({ fullName, department, position, active })` → id, `db.seedSeat({ label, key, x, y, status, layer, employeeId, zone, isCustom })` → row, `db.draftSeats()`, `db.query(sql, params)`. Departments/zones have no seed helper — insert directly with `db.query("insert into public.department_options(name, active) values ($1, $2)", [...])` (see the existing rename_department test).
- **Templates to copy:**
  - The **reset** execution block (`tests/rpc-execution.test.mjs`, the `reset_draft_seats_to_published` section) is the closest structural model for `restore_draft_snapshot` — both converge the draft (mutate/delete-custom/re-add) and both carry the MLS02 fence. Note its comment that originals can't be deleted (protection trigger), so any "restore removes a seat" leg must use `isCustom: true` seats.
  - The **rename_department** test (`:365`) is the model for the three management RPCs: insert option rows + seed an employee/seat carrying the value, call the RPC, assert the rewrite + option-row toggle.
- **RPC signatures (live definitions — read the bodies before writing assertions):**
  - `public.restore_draft_snapshot(snapshot_seats jsonb, snapshot_employees jsonb, expected_draft_seats jsonb)` — live def in `supabase/migrations/20260708120000_draft_concurrency_fence.sql` (starts ~`:47`). Also read `restoreDraftSnapshotAction` in `app/actions.ts` to see the **exact shape** of the `snapshot_seats` / `snapshot_employees` JSON the client passes (field names per element) — your test must build the same shape. Contract (CLAUDE.md): it re-upserts employees and **never deletes an employee**; it deletes custom draft seats absent from the snapshot; the MLS02 fence rejects on a stale `expected_draft_seats`.
  - `public.delete_department(department_name text)` — live def in `supabase/migrations/20260702100000_department_integrity_normalization.sql`.
  - `public.rename_zone(zone_from text, zone_to text)` and `public.delete_zone(zone_name text)` — same migration file. Read each body for exact semantics (what it does to `zone_options` rows and to `seats.zone` values).
- `restore-draft-snapshot-transaction-safety.test.mjs` and `management-actions-transaction-safety.test.mjs` currently string-pin these; this plan **complements** them with execution tests (do not touch or remove the source pins).

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install | `npm install` | exit 0 (`npm install`, not `npm ci`, on the maintainer's Windows box) |
| DB tier | `npm run test:db` | all pass (fast loop — runs `rpc-execution` + `rls-execution`) |
| Tests | `npm test` | all pass (~486; 4-file local-env flake caveat — reinstall + retry first) |
| Typecheck | `npm run typecheck` | exit 0 |
| Lint | `npm run lint` | 0 errors |

## Scope

**In scope** (the only file you should modify):
- `tests/rpc-execution.test.mjs` (add four new test sections)

**Out of scope** (do NOT touch):
- Any `supabase/migrations/*.sql` — read the RPC bodies, change nothing; this plan adds no migration.
- The existing `*-transaction-safety.test.mjs` source pins — they stay as-is.
- `tests/helpers/pgHarness.mjs` — the existing helpers are sufficient; do not add helpers unless a test genuinely can't be written without one (if so, that's a STOP-and-report, not a silent addition).
- Product code (`app/`, `lib/`, `components/`).

## Git workflow

- Branch: `advisor/009-restore-and-management-rpc-execution-tests`
- Commit style: conventional (e.g. `test(db): execute restore_draft_snapshot and the department/zone management RPCs`)
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add `restore_draft_snapshot` execution tests

First **read** the live RPC body (`20260708120000_draft_concurrency_fence.sql` from `:47`) and `restoreDraftSnapshotAction` in `app/actions.ts` to learn the snapshot JSON shape. Then add a `restore_draft_snapshot` section modeled on the reset block. Cover at minimum:

1. **Converges the draft to the snapshot** — seed a draft (a couple of seats, one assigned), publish or not as needed, mutate the live draft, then call `restore_draft_snapshot` with a snapshot describing the target state; assert the draft rows match the snapshot (assignments, coords, labels) and surviving rows keep their ids.
2. **Deletes a custom seat absent from the snapshot** — a `isCustom: true` draft seat not present in the snapshot is removed; an original is never targeted for deletion.
3. **Re-upserts employees and never deletes one** — an employee present in the live directory but absent from `snapshot_employees` still exists after restore (the owner-confirmed contract; see CLAUDE.md).
4. **MLS02 fence** — a stale `expected_draft_seats` (wrong `updated_at`, like `STALE_TS` in the reset tests) rejects with `{ code: "MLS02", match: /changed in another session/ }`.
5. **Requires admin** — `db.actAsViewer()` then call → `expectThrow(..., { code: "42501", match: /Admin permission required/ })`.

**Verify**: `npm run test:db` → the new restore tests pass alongside the existing suite.

### Step 2: Add `delete_department`, `rename_zone`, `delete_zone` execution tests

Read each body in `20260702100000_department_integrity_normalization.sql`, then add three sections modeled on the existing `rename_department` test:

- **`delete_department`**: insert a `department_options` row + seed an employee with that department; call `delete_department`; assert the RPC's actual effect on the option row and the employee's `department` (read the body — it may deactivate the option and null/blank the employees' department, or reject if in use; assert whatever the body actually does, not a guess). Add a `requires admin` case.
- **`rename_zone`**: insert a `zone_options` row + seed a seat with that `zone`; call `rename_zone(from, to)`; assert `seats.zone` rewrote and the option rows toggled (mirror of `rename_department`). Add a `requires admin` case.
- **`delete_zone`**: same setup as `rename_zone`; call `delete_zone`; assert the body's actual effect on `zone_options` and `seats.zone`. Add a `requires admin` case.

For every management RPC, the `requires admin` case is: `db.actAsViewer()` then call → `expectThrow(..., { match: /Admin permission required/ })`.

**Verify**: `npm run test:db` → all four RPCs' tests pass.

### Step 3: Full-suite gate

**Verify**: `npm test` → exit 0; `npm run typecheck` → exit 0; `npm run lint` → 0 errors.

## Test plan

- New sections in `tests/rpc-execution.test.mjs` for the four RPCs, each with a happy-path convergence/effect assertion plus a `requires admin` refusal; `restore_draft_snapshot` additionally gets the fence (MLS02) and never-deletes-employees cases.
- Structural patterns: the reset block (restore) and the `rename_department` test (management RPCs), both already in the file.
- Verification: `npm run test:db` then `npm test`.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -c "restore_draft_snapshot\|delete_department\|rename_zone\|delete_zone" tests/rpc-execution.test.mjs` ≥ 4 (all four RPCs now referenced)
- [ ] `npm run test:db` exits 0 with the new tests present and passing
- [ ] `npm test`, `npm run typecheck`, `npm run lint` (0 errors) all pass
- [ ] `git diff --name-only ff556e3..HEAD` shows ONLY `tests/rpc-execution.test.mjs` (and, when you finish, `plans/README.md`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The snapshot JSON shape for `restore_draft_snapshot` is ambiguous after reading both the RPC body and `restoreDraftSnapshotAction` — report what you found rather than guessing a shape that "seems right".
- A management RPC's body does something materially different from the `rename_department` mental model (e.g. `delete_department` rejects when the department is in use) — assert the ACTUAL behavior and note it; do not force it into the template's shape.
- A new test needs a `pgHarness` helper that doesn't exist — report rather than silently adding to the harness.
- Any existing rpc-execution test fails after your additions (they share `db` + `beforeEach reset` — a test that leaks state would break a neighbor).

## Maintenance notes

- These execution tests are the runtime counterpart to the `*-transaction-safety` source pins; keep both — the source pin catches "the TS action and SQL drifted apart", the execution test catches "the SQL logic is wrong".
- Reviewers should scrutinize: that the `restore_draft_snapshot` never-deletes-employees test actually seeds an employee absent from the snapshot (the whole point), and that each `requires admin` case fails for the RPC's own `is_admin()` reason (not an incidental error).
- Follow-up recorded in `plans/README.md`: `swap_draft_seat_assignments` and the reset RPC already have execution tests; after this, the only atomic RPCs still source-only are any added in future migrations — add their execution tests in the same file.
