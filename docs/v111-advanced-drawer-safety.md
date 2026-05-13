# v1.1.1 Advanced Drawer Polish + Safety Patch

## Summary

This patch keeps admin map work focused and makes import/publish actions more intentional.

## Changes

- Advanced drawer now groups actions as:
  - View utilities
  - Draft map tools
  - CSV and backups
  - Management link
  - Publishing
  - Destructive actions
- Employee, department, and zone CRUD stays on `/admin/management`.
- The admin header exposes `/admin/management` directly, while the drawer keeps a secondary Management link for context.
- Delete Custom Seat is separated into a destructive section and remains disabled unless a custom draft seat is selected.
- CSV tools include template download, current CSV export, JSON backup export, and a preview confirmation before import.
- CSV validation rejects unsafe employee/status combinations before server import.
- CSV import now clears an employee's old draft assignment before assigning them to a new imported seat.
- Public `publish_seat_map()` remains a `security invoker` wrapper; the privileged implementation remains in `app_private`.

## Migration

Run after the earlier migrations:

```sql
supabase/migrations/012_v111_advanced_drawer_safety.sql
```

Before applying to a live project, confirm this query returns no rows:

```sql
select layer, lower(trim(label)) as label_key, count(*)
from public.seats
group by layer, lower(trim(label))
having count(*) > 1;
```

## QA

1. Open `/admin`.
2. Open Advanced and confirm management forms are gone.
3. Confirm the header Management link and drawer Open Management link route to `/admin/management`.
4. Select an original seat and confirm Delete Selected Custom Seat is disabled.
5. Select a custom draft seat and confirm Delete Selected Custom Seat is enabled in the destructive section.
6. Download CSV Template.
7. Export Current CSV.
8. Import a valid CSV and confirm the preview prompt appears before changes apply.
9. Try importing `reserved` or `unavailable` rows with `employee_name` and confirm validation blocks the import.
10. Publish Draft Map and confirm the viewer map still loads.
