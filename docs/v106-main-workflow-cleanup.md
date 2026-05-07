# v1.0.6 Main Workflow Cleanup

This pass simplifies the primary seat assignment workflow and moves map-manipulation tools out of the main Seat Inspector.

## Included

- Simplified Seat Inspector into the primary assignment flow:
  - Employee Name
  - Position
  - Department
  - Notes
  - Status
  - Assign Seat / Update Assignment
- Removed user-facing coordinate display from the inspector.
- Removed editable seat label and editable zone from the main inspector.
- Replaced separate Assigned Employee + Employee Name fields with one searchable/enterable employee name control.
- Department is now a dropdown sourced from department options and employee departments.
- Employee selection auto-populates position and department when the typed name matches an existing employee.
- Employee assignment automatically sets status to assigned.
- Empty seats normalize to available unless manually marked reserved or unavailable.
- Moved Move Seat out of the inspector and into Advanced → Seat utilities.
- Removed seat delete from the main inspector. Protected custom-seat deletion should be handled in a later protected-seat pass.
- Added publish confirmation with assignment summary before updating the viewer-facing map.
- Added zone-based labels for newly added seats, such as W13, N14, NE05, and SE05.
- Added duplicate seat label checks on create/update server actions.
- Added seat label helper tests.

## Not included

The following should remain separate follow-up passes:

- Original seat protection with `is_custom` / source field.
- Safe deletion of user-added custom seats.
- Dedicated `/admin/management` route for employees, departments, and zones.
- Full CSV v2 based on stable `seat_id` instead of label.
- Broader scrollbar/layout redesign.
