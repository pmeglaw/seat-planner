# Release Checklist

## Pre-release

- [ ] `.env.local` exists locally and contains the correct Supabase URL and anon key.
- [ ] Supabase schema has `profiles`, `employees`, and `seats` tables.
- [ ] `public.seats` has 60 draft seats and 60 published seats.
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
- [ ] Move Seat mode prevents accidental movement.
- [ ] Advanced drawer actions work.
- [ ] Publish Draft Map updates viewer map.

## Deployment

- [ ] Add `NEXT_PUBLIC_SUPABASE_URL` in Vercel.
- [ ] Add `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Vercel.
- [ ] Add production domain to Supabase Auth redirect URLs.
- [ ] Confirm RLS policies are enabled and admin-only mutations are protected.
