# Release Checklist

## Pre-release

- [ ] `.env.local` exists locally and contains the correct Supabase URL and anon key.
- [ ] Supabase schema has `profiles`, `employees`, and `seats` tables.
- [ ] `public.seats` has 60 draft seats and 60 published seats.
- [ ] No duplicate seat labels exist within the same layer.
- [ ] Admin profile exists for `patrick@megeredchianlaw.com`.

## Local QA

```bash
npm run test
npm run typecheck
npm run lint
npm run build
```

## Browser QA

- [ ] `/login` magic link flow works.
- [ ] `/admin` requires admin role.
- [ ] `/` displays published viewer map.
- [ ] Assigned names are visible by default.
- [ ] Hide Names / Show Names works.
- [ ] Seat inspector glass UI displays correctly.
- [ ] Save Seat persists after refresh.
- [ ] Undo and Redo restore saved draft assignment/status/notes edits.
- [ ] Undo and Redo restore add, move, and delete custom-seat actions.
- [ ] Undo and Redo are disabled when there is no matching draft history.
- [ ] Move Seat mode prevents accidental movement.
- [ ] Advanced drawer actions work.
- [ ] Advanced drawer destructive actions are separated and disabled for protected original seats.
- [ ] `/admin/management` handles employee, department, and zone edits.
- [ ] CSV import shows a preview and rejects invalid employee/status rows.
- [ ] CSV import can be undone/redone before publishing.
- [ ] Publish Draft Map updates viewer map.
- [ ] Publish Draft Map clears Undo/Redo history.

## Deployment

- [ ] Add `NEXT_PUBLIC_SUPABASE_URL` in Vercel.
- [ ] Add `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Vercel.
- [ ] Add production domain to Supabase Auth redirect URLs.
- [ ] Confirm RLS policies are enabled and admin-only mutations are protected.
- [ ] Confirm `public.publish_seat_map()` is `security invoker` and `app_private.publish_seat_map()` is `security definer`.
