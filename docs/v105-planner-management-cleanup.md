# v1.0.5 Planner Management Cleanup

This patch cleans up the v1.0.4 planner-management work before production use.

## Included

- Employee delete/deactivate is draft-safe. It refuses deletion when the employee is still assigned on the published map.
- Departments and zones are separate concepts:
  - Employee departments are managed through `department_options` and `employees.department`.
  - Physical seat zones are managed through `zone_options` and `seats.zone`.
- Added CSV export/import for draft seat assignments.
- CSV import never changes `x` or `y` marker coordinates.
- Add Seat now creates `New Desk 01`, `New Desk 02`, etc. and saves normalized coordinates.
- Publish copies `zone` from draft seats to published seats.

## Migration

Run this migration in Supabase SQL Editor before deploying the app code:

```txt
supabase/migrations/009_v105_management_csv_cleanup.sql
```

## QA

Run locally:

```bash
npm install
npm test
npm run typecheck
npm run lint
npm run build
```

Manual checks:

1. Add employee.
2. Edit employee department.
3. Add/rename/delete department.
4. Add/rename/delete zone.
5. Add a new desk and confirm `x/y` exists in inspector.
6. Export CSV.
7. Import CSV.
8. Confirm marker coordinates did not move.
9. Publish draft map.
10. Confirm viewer map works.
