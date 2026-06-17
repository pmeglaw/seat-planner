# Transaction Safety Rollout

This note covers the local UX and transaction-safety slices that replace native destructive confirmations and move multi-write draft/admin mutations into Supabase RPCs.

## Migration Order

Apply these migrations before deploying app code that calls the new RPCs:

1. `supabase/migrations/20260616000100_import_assignments_csv_rpc.sql`
2. `supabase/migrations/20260616000200_update_draft_seat_rpc.sql`
3. `supabase/migrations/20260616000300_restore_draft_snapshot_rpc.sql`
4. `supabase/migrations/20260616000400_management_actions_rpc.sql`

The migrations were prepared locally. They have not been applied to production Supabase from this checkout.

## Commit And Deploy Sequence

1. Commit the UX confirmation changes and source tests.
2. Commit each transaction-safety slice, or commit the four RPC slices together if the deployment will be coordinated as one release.
3. Apply the four migrations above to a disposable Supabase branch or test project.
4. Deploy app code only after the target Supabase project has the RPCs available.
5. After production migration and deploy, verify `/admin`, `/admin/management`, and `/` before doing new feature work.

## Disposable Supabase Verification

Use a disposable branch or test project first. Do not use production data for failure drills.

1. Apply all four migrations in order.
2. Confirm these functions exist and are `security invoker`:
   - `public.import_assignments_csv(jsonb)`
   - `public.update_draft_seat(uuid, text, public.seat_status, uuid, text, text, boolean, text, boolean, text, text, text)`
   - `public.restore_draft_snapshot(jsonb, jsonb)`
   - `public.deactivate_employee(uuid)`
   - `public.rename_department(text, text)`
   - `public.delete_department(text)`
   - `public.rename_zone(text, text)`
   - `public.delete_zone(text)`
3. Confirm each function has execute revoked from `public`, `anon`, and `authenticated`, then granted only to `authenticated`.
4. Run a successful CSV import, draft seat update, JSON restore, employee deactivation, department rename/delete, and zone rename/delete.
5. Force a mid-operation failure for CSV import, draft seat update, JSON restore, and management cleanup, then confirm no partial employee, option, or draft-seat writes persist.
6. Confirm draft mutations do not change the published viewer map until `publish_seat_map` is run.
7. Confirm native browser confirmation usage remains absent with:

```bash
rg "window\.confirm|confirm\(" components app lib tests
```

## Known Follow-Ups

The following smaller flows still have low-risk option-upsert-plus-main-write behavior and can be handled in a later pass:

- `createEmployeeAction`
- `updateEmployeeAction`
- `createSeatAction`

`createDepartmentAction` and `createZoneAction` are single-table upserts and do not need RPC treatment for transaction safety.
