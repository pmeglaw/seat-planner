# v1.1.0 Admin Management + Data Quality Polish

## Summary

This pass separates day-to-day map assignment work from administrative data management.

## Changes

### Dedicated admin management area

Added `/admin/management` for:

- Employee management
- Department management
- Zone management

The main admin map now has a Management button in the top bar and the Advanced drawer links to the dedicated management page.

### Cleaner employee edit/delete experience

The management page provides:

- Searchable employee list
- Assigned/unassigned visibility
- Add/edit employee form
- Safer deactivate confirmation
- Draft assignment cleanup when employees are deactivated

### Department and zone screens

Departments and zones now have separate management sections.

Departments show employee counts.
Zones show draft-seat counts.

Rename/delete actions include safer confirmation text and local UI updates.

### CSV template and import preview

Advanced CSV tools now include:

- Download CSV Template
- Export Current CSV
- Import CSV with client-side preview summary
- Warning display before import
- JSON backup export

CSV import remains draft-only and does not change marker coordinates.

### Stricter CSV validation

CSV validation now rejects rows where:

- `status=assigned` but `employee_name` is empty
- `status=reserved` or `status=unavailable` while `employee_name` is present
- seat labels are missing, duplicated, or unknown
- assigned employees appear more than once in the same file

When importing an existing employee to a different seat, the server now clears the old draft assignment before applying the new assignment to avoid duplicate seat assignments.

## Migration

No Supabase migration required.

## QA checklist

- Open `/admin/management`
- Add/edit/deactivate an employee
- Rename/delete a department
- Rename/delete a zone
- Return to `/admin`
- Confirm Advanced drawer no longer contains employee/department/zone editor forms after applying v1.1.1
- Download CSV template
- Export current CSV
- Import valid CSV and confirm preview prompt appears
- Try importing invalid CSV and confirm issues are shown before changes are applied
- Publish draft map
- Confirm viewer map still loads
