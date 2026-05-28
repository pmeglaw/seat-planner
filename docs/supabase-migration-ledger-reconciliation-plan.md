# Supabase Migration Ledger Reconciliation Plan

Date: 2026-05-28

Project: Seat Planner

Supabase project checked: `wujsniclwzefvufavama` (`Seat Planner Prototype`)

Branch for this plan: `v1.3.0-supabase-migration-ledger-reconciliation-plan`

## Purpose

Document a safe plan for reconciling Supabase migration history drift without changing production data, applying migrations, editing Supabase settings, or changing runtime app code.

The immediate trigger is the Supabase Branches UI reporting the default `main` branch as `MIGRATIONS_FAILED` while production itself remains healthy and app-required objects exist.

## Current Production Runtime Health

Production status from Supabase project metadata:

- Project status: `ACTIVE_HEALTHY`
- Default branch preview project status: `ACTIVE_HEALTHY`
- Database engine: Postgres 17
- Database version: 17.6.1.113

Runtime objects required by current app code exist in production:

- `public.employees.phone_extension`
- `public.seats.zone`
- `public.seats.is_custom`
- `public.publish_events`
- `public.department_options`
- `public.zone_options`
- `public.publish_seat_map()`
- `app_private.publish_seat_map()`
- `public.swap_draft_seat_assignments(source_draft_seat_id uuid, target_draft_seat_id uuid)`
- `app_private.prevent_original_draft_seat_delete()`
- `public.seats_unique_label_per_layer`

The current finding is therefore a migration-ledger and branch-integration problem, not evidence of a production runtime outage.

## Current Production Migration Ledger

`supabase_migrations.schema_migrations` currently reports these production ledger entries:

| Ledger version | Ledger name |
| --- | --- |
| `20260506222834` | `seat_planner_live_security_cleanup` |
| `20260506222924` | `seat_planner_policy_advisor_cleanup` |
| `20260506223948` | `seat_planner_remaining_advisor_cleanup` |
| `20260506235849` | `departments_zones_management` |
| `20260507000032` | `drop_management_unused_indexes` |
| `20260520235335` | `publish_audit_logging_hardening` |
| `20260528001634` | `atomic_draft_seat_swap` |

Recent Supabase branch-action logs for protected `main` repeatedly show:

```text
Remote migration versions not found in local migrations directory.
```

That message matches the ledger/file mismatch below.

## Current Repo Migration Files

The repo currently contains these migration files:

| Repo migration file | Notes |
| --- | --- |
| `001_initial_schema.sql` | Initial app schema, RLS, seed-facing functions |
| `002_seed_initial_data.sql` | Initial seed data |
| `003_function_execute_hardening.sql` | Early function and policy hardening |
| `004_live_security_cleanup.sql` | Mirrors live cleanup applied as `20260506222834` |
| `005_policy_advisor_cleanup.sql` | Mirrors live cleanup applied as `20260506222924` |
| `006_remaining_advisor_cleanup.sql` | Mirrors live cleanup applied as `20260506223948` |
| `007_departments_zones_management.sql` | Mirrors live cleanup applied as `20260506235849` |
| `008_drop_management_unused_indexes.sql` | Mirrors live cleanup applied as `20260507000032` |
| `009_v105_management_csv_cleanup.sql` | Management tables, CSV cleanup, publish function updates |
| `010_v107_seat_protection.sql` | `seats.is_custom`, protection trigger, publish function updates |
| `011_publish_seat_map_rpc_security.sql` | Restores public publish RPC as security invoker |
| `012_v111_advanced_drawer_safety.sql` | Unique seat label per layer |
| `20260521000100_publish_audit_logging_hardening.sql` | Publish audit table/index/policies and publish event insert |
| `20260521182500_stale_object_cleanup.sql` | Drops stale non-app objects |
| `20260527000100_add_employee_phone_extension.sql` | Adds `employees.phone_extension` |
| `20260527000200_atomic_draft_seat_swap.sql` | Adds atomic draft seat swap RPC |

## Ledger To Repo Mapping

| Production ledger version | Production ledger name | Intended repo migration | Status |
| --- | --- | --- | --- |
| `20260506222834` | `seat_planner_live_security_cleanup` | `004_live_security_cleanup.sql` | Equivalent change exists under different repo version/name |
| `20260506222924` | `seat_planner_policy_advisor_cleanup` | `005_policy_advisor_cleanup.sql` | Equivalent change exists under different repo version/name |
| `20260506223948` | `seat_planner_remaining_advisor_cleanup` | `006_remaining_advisor_cleanup.sql` | Equivalent change exists under different repo version/name |
| `20260506235849` | `departments_zones_management` | `007_departments_zones_management.sql` | Equivalent change exists under different repo version/name |
| `20260507000032` | `drop_management_unused_indexes` | `008_drop_management_unused_indexes.sql` | Equivalent change exists under different repo version/name |
| `20260520235335` | `publish_audit_logging_hardening` | `20260521000100_publish_audit_logging_hardening.sql` | Partial/equivalent change exists under different repo version/name |
| `20260528001634` | `atomic_draft_seat_swap` | `20260527000200_atomic_draft_seat_swap.sql` | Equivalent RPC exists; ledger version differs from repo filename |

Repo migrations that are important but do not currently have matching production ledger versions:

| Repo migration file | Production schema state |
| --- | --- |
| `001_initial_schema.sql` | Baseline schema exists, but no matching ledger version is present |
| `002_seed_initial_data.sql` | Production seed/baseline state exists outside current visible ledger mapping |
| `003_function_execute_hardening.sql` | Equivalent hardening appears superseded by later production ledger entries |
| `009_v105_management_csv_cleanup.sql` | Runtime objects exist, but no matching ledger version is present |
| `010_v107_seat_protection.sql` | `seats.is_custom` and trigger exist, but no matching ledger version is present |
| `011_publish_seat_map_rpc_security.sql` | Public publish RPC is currently security invoker, but no matching ledger version is present |
| `012_v111_advanced_drawer_safety.sql` | `seats_unique_label_per_layer` exists, but no matching ledger version is present |
| `20260521182500_stale_object_cleanup.sql` | Target stale objects are absent, but no matching ledger version is present |
| `20260527000100_add_employee_phone_extension.sql` | `employees.phone_extension` exists, but no matching ledger version is present |

## Known Manually Applied Schema

- `employees.phone_extension` exists in production.
- Production does not show the repo migration version `20260527000100` in `supabase_migrations.schema_migrations`.
- This is a known drift note and not a runtime blocker because the column exists and the app can read/write it.

The atomic swap RPC also exists in production:

- `public.swap_draft_seat_assignments(source_draft_seat_id uuid, target_draft_seat_id uuid)` exists.
- It is callable by `authenticated`.
- It is not callable by `anon`.
- It is `security invoker`.
- Production records it as ledger version `20260528001634`.
- The repo file is `20260527000200_atomic_draft_seat_swap.sql`.

## Non-Blocking Schema Drift

Production is missing `public.publish_events_created_at_idx`.

The repo migration `20260521000100_publish_audit_logging_hardening.sql` includes:

```sql
create index if not exists publish_events_created_at_idx
  on public.publish_events (created_at desc);
```

Current production state:

- `publish_events_published_by_idx` exists.
- `publish_events_created_at_idx` does not exist.
- `publish_events` currently has very few rows.
- The admin publish-history query orders by `created_at desc`, so this is a performance drift only and not a correctness blocker.

Do not add this index as part of the ledger investigation. If it is needed later, ship it as a normal tested migration after the ledger strategy is settled.

## Risks Of Doing Nothing

- Supabase Branches UI may continue to show `MIGRATIONS_FAILED` for `main`.
- Future Supabase Git integration runs may keep failing before reaching newer migrations.
- Future PR previews may be noisy or unreliable for migration-heavy branches.
- Engineers may have less confidence distinguishing real migration failures from known ledger drift.
- A future migration may be blocked or misdiagnosed because remote versions are absent from the local migration directory.
- Fresh environment setup may remain harder to reason about because production history and repo history tell different stories.

## Risks Of Editing Migration History

Editing migration history is high-risk because it changes how Supabase decides which migrations are already applied.

Risks include:

- Accidentally causing Supabase to re-run schema-changing SQL against production.
- Marking a migration as applied when the corresponding schema object is missing.
- Breaking future preview branch creation.
- Creating a mismatch between fresh databases and production.
- Losing the ability to audit how production reached its current state.
- Making rollback/recovery harder if the migration ledger is changed without a backup.

Direct edits to `supabase_migrations.schema_migrations` should be treated as production database changes, even when only metadata rows are edited.

## Recommended Safe Reconciliation Strategy

Use a staged reconciliation plan. Do not start with production ledger edits.

1. Capture a read-only production inventory:
   - project and branch status
   - `supabase_migrations.schema_migrations`
   - key table columns
   - key functions and grants
   - key indexes
   - RLS policies
   - recent branch-action logs

2. Build a reconciliation matrix:
   - map every production ledger version to an intended repo migration
   - map every repo migration to production schema evidence
   - flag production-only ledger versions
   - flag repo-only migration versions
   - flag schema objects that exist without matching ledger versions

3. Prefer a no-production-write test first:
   - create a disposable Supabase branch or separate test project
   - replay the repo migration set there
   - verify whether branch creation and migration application succeed
   - compare resulting schema to production inventory

4. Test one reconciliation approach at a time:
   - Option A: add source-controlled placeholder migrations for production-only ledger versions, with no schema-changing SQL, so local files acknowledge existing production ledger history.
   - Option B: use a Supabase-supported migration repair workflow, if available, to align migration history.
   - Option C: as a last resort only, manually adjust migration ledger metadata after backup, confirmation, and a successful disposable-project rehearsal.

5. Keep runtime schema repairs separate from ledger reconciliation:
   - do not combine the missing `publish_events_created_at_idx` with migration-history cleanup
   - do not combine unrelated advisor cleanup with ledger reconciliation
   - do not change app code as part of ledger reconciliation

The safest likely direction is to avoid production ledger edits if possible and first test source-controlled migration-history placeholders in a disposable environment. This should only proceed after confirming that fresh setup, branch previews, and production comparison all remain clean.

## Disposable Branch Or Project Test Plan

Before touching production ledger metadata:

1. Create a disposable Supabase branch or separate test project.
2. Apply the current repo migrations in order.
3. Verify app-required objects:
   - `employees.phone_extension`
   - `seats.is_custom`
   - `seats.zone`
   - `publish_events`
   - `publish_events_created_at_idx`
   - `seats_unique_label_per_layer`
   - `public.swap_draft_seat_assignments(uuid, uuid)`
   - `public.publish_seat_map()`
   - `app_private.publish_seat_map()`
4. Verify stale objects are absent:
   - `public.messages`
   - `public.thread_members`
   - `public.threads`
   - `public.get_or_create_dm_thread(uuid)`
   - `public.publish_draft_seats()`
5. Test the candidate reconciliation strategy on the disposable branch/project.
6. Confirm Supabase branch status no longer reports missing remote versions.
7. Run advisors and record any security/performance deltas.
8. Compare disposable schema inventory against production inventory.
9. Only after the disposable test passes, prepare a production change proposal with:
   - exact SQL or file changes
   - backup steps
   - rollback plan
   - confirmation checklist

## Explicit No-Go Actions

- Do not delete production data.
- Do not drop live production tables or functions.
- Do not rename existing migrations without a tested plan.
- Do not manually edit `supabase_migrations.schema_migrations` in production without backup and explicit confirmation.
- Do not apply migrations during investigation.
- Do not change Supabase production settings during investigation.
- Do not combine runtime schema cleanup with ledger reconciliation.
- Do not treat the missing `publish_events_created_at_idx` as urgent production breakage.

## Read-Only Verification SQL

These queries are safe for status verification only. They should not be mixed with DDL or data-changing statements.

```sql
select *
from supabase_migrations.schema_migrations
order by version;
```

```sql
select to_regclass('public.publish_events_created_at_idx') is not null as has_publish_events_created_at_idx,
       to_regclass('public.publish_events_published_by_idx') is not null as has_publish_events_published_by_idx,
       to_regclass('public.seats_unique_label_per_layer') is not null as has_seats_unique_label_per_layer;
```

```sql
select n.nspname as schema_name,
       p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as arguments,
       p.prosecdef as security_definer,
       pg_get_function_result(p.oid) as result_type,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute,
       has_function_privilege('anon', p.oid, 'execute') as anon_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where (n.nspname, p.proname) in (
  ('public', 'publish_seat_map'),
  ('app_private', 'publish_seat_map'),
  ('app_private', 'is_admin'),
  ('app_private', 'prevent_original_draft_seat_delete'),
  ('public', 'swap_draft_seat_assignments')
)
order by schema_name, function_name, arguments;
```

```sql
select 'public.messages' as object_name, to_regclass('public.messages') is not null as exists
union all select 'public.thread_members', to_regclass('public.thread_members') is not null
union all select 'public.threads', to_regclass('public.threads') is not null
union all select 'public.get_or_create_dm_thread(uuid)', to_regprocedure('public.get_or_create_dm_thread(uuid)') is not null
union all select 'public.publish_draft_seats()', to_regprocedure('public.publish_draft_seats()') is not null;
```

## Documentation-Only Validation

This plan intentionally changes documentation only:

- no app code changes
- no schema changes
- no migrations applied
- no production data modified
- no Supabase settings changed
