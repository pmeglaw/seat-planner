# v1.2.8 Atomic Draft Seat Swap

This patch hardens admin draft seat swaps by moving the assignment swap into the database as `public.swap_draft_seat_assignments(source_draft_seat_id uuid, target_draft_seat_id uuid)`.

## Scope

- Swaps draft `employee_id` and `status` values atomically.
- Keeps marker coordinates, labels, zones, notes, custom-seat flags, and published seats untouched.
- Keeps the existing admin-only swap UX and client undo history behavior.
- Keeps viewer reads on published seats and admin/management reads on draft seats.

## QA

1. In `/admin`, swap assigned-to-open and confirm the viewer route `/` does not change before publish.
2. In `/admin`, swap assigned-to-assigned when safe preview data is available.
3. Confirm canceling swap mode makes no draft data changes.
4. Confirm Undo is available after a confirmed swap.
5. Confirm seat coordinates remain unchanged.
