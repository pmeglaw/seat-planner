# v1.0.7 Seat Protection + Advanced Utilities Cleanup

## Goals

- Protect original seeded seats from accidental deletion.
- Allow admins to delete only custom seats added through the app.
- Move custom-seat actions into the Advanced drawer.
- Add server/database protection so protected seats cannot be deleted by UI bypass.

## Included

- Adds `seats.is_custom`.
- Existing seeded seats are marked as original/protected.
- Existing manually-created seats are inferred as custom when their generated `seat_key` differs from the displayed `label`.
- New seats created through the app are saved with `is_custom = true`.
- The Advanced drawer now has a Custom seat tools section.
- Delete Custom Seat is disabled for original seats.
- Server action rejects original-seat deletion.
- Database trigger rejects deletion of protected original draft seats.
- Publish copies the `is_custom` flag to published seats.

## Migration

Run:

```sql
supabase/migrations/010_v107_seat_protection.sql
```

before deploying the code to production.

## QA

1. Select an original seeded seat and open Advanced.
2. Confirm Delete Custom Seat is disabled and the selected seat is described as protected.
3. Add a custom seat.
4. Confirm Delete Custom Seat is enabled for the custom seat.
5. Delete the custom seat and confirm it disappears from draft.
6. Publish and confirm the viewer map still works.
