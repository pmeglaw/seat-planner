# Office Seat Planner

Production starter for the in-house interactive office seating map.

This package is Step 1 of the migration from the approved v15 HTML prototype into a production Next.js + Supabase app.

## What is included

- Next.js App Router project structure
- Tailwind setup
- Static built-in floor plan image at `/public/images/office-floor-plan.png`
- Supabase Auth client/server helpers
- Supabase schema migration
- RLS policies
- Draft/published seat layers
- Seed data generated from the v15 prototype
- Initial React seat map component scaffold
- Marker positions stored as normalized `x/y` coordinates
- Admin route scaffold at `/admin`
- Viewer route scaffold at `/`
- Magic-link login route at `/login`

## Setup

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

Add your Supabase values to `.env.local`.

## Supabase setup

Run the SQL files in order:

```bash
supabase/migrations/001_initial_schema.sql
supabase/migrations/002_seed_initial_data.sql
```

After creating your first user, promote yourself to admin:

```sql
update public.profiles
set role = 'admin'
where email = 'your-email@company.com';
```

## Important security notes

The HTML prototype used client-side admin/viewer toggles. Production must not do that.

This starter enforces admin behavior with:

- Supabase Auth
- `profiles.role`
- Row Level Security
- Server-side action checks

Do not expose service-role keys in the browser.

## Next implementation step

Port the v15/v14 interaction logic into the React components:

1. Advanced drawer
2. Add Seat mode
3. Move Seat mode with pointer dragging
4. Seat inspector save action
5. Employee create/assign from inspector
6. Publish draft map
7. Viewer route polish

## Current milestone

This package is Step 2 of the production conversion. It includes the first interactive admin tools from the v15 HTML prototype: Advanced drawer, Add Seat mode, Move Seat mode, inspector save/delete, direct employee entry, and publish action wiring.

## Auth callback fix

Magic-link auth redirects to `/auth/callback?next=/`, where the route handler exchanges the auth code for a server cookie session using `supabase.auth.exchangeCodeForSession(code)`.

Supabase Auth URL configuration for local dev:

- Site URL: `http://localhost:3001`
- Redirect URLs: `http://localhost:3001/**`

Restart the Next.js dev server after changing `.env.local` or Auth URL settings.
