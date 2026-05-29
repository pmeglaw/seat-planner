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

Ask Planner on `/admin` also requires a server-only OpenAI key:

```bash
OPENAI_API_KEY=your-server-side-openai-api-key
OPENAI_MODEL=gpt-5.5 # optional
```

Do not prefix the OpenAI key with `NEXT_PUBLIC_`; it must only be available to server actions.

For Vercel, add `OPENAI_API_KEY` as a server-side environment variable for Production.
Also add it for Preview if you test Ask Planner in preview deployments. Redeploy after
adding or changing OpenAI environment variables. `OPENAI_MODEL` is optional and defaults
to the app-configured model when omitted.

Ask Planner manual QA checklist:

- Admin `/admin` shows the Ask Planner drawer; viewer `/` does not.
- "Which seats are open?" returns a broad read-only answer with no data changes.
- "Open seats in Center Desks" highlights matching seats when available.
- "What looks unhealthy?" returns map health findings.
- "Move Alice to N01" is refused/read-only.
- Highlight chips only select/open the seat inspector.

## Supabase setup

Run the SQL files in order:

```bash
supabase/migrations/001_initial_schema.sql
supabase/migrations/002_seed_initial_data.sql
supabase/migrations/003_function_execute_hardening.sql
supabase/migrations/004_live_security_cleanup.sql
supabase/migrations/005_policy_advisor_cleanup.sql
supabase/migrations/006_remaining_advisor_cleanup.sql
supabase/migrations/007_departments_zones_management.sql
supabase/migrations/008_drop_management_unused_indexes.sql
supabase/migrations/009_v105_management_csv_cleanup.sql
supabase/migrations/010_v107_seat_protection.sql
supabase/migrations/011_publish_seat_map_rpc_security.sql
supabase/migrations/012_v111_advanced_drawer_safety.sql
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

Supabase free projects may continue to show the Auth advisor warning for leaked
password protection because that feature is not available on the free plan. The
database-side Seat Planner security-definer and RLS advisor items are handled by
the migrations above.

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

This package is Step 3 of the production conversion. It includes admin employee and department management, separate employee departments vs. physical seat zones, Advanced drawer map controls, Add Seat coordinate persistence, Move Seat mode, inspector save/delete, direct employee entry, and publish action wiring.

## Auth callback fix

Magic-link auth redirects to `/auth/confirm`. The route accepts Supabase PKCE
`code` redirects and `token_hash` email-template links, then stores the session
in server cookies.

Supabase Auth URL configuration for local dev:

- Site URL: `http://localhost:3000`
- Redirect URLs: `http://localhost:3000/**`

Restart the Next.js dev server after changing `.env.local` or Auth URL settings.

See `docs/magic-link-auth.md` for the Magic Link email template.


## v1.0.8 Auth Reliability

The login screen now supports email/password sign-in as the primary flow, with magic link as a fallback. Password reset links route through `/auth/confirm` and then `/auth/update-password`.

Recommended Supabase Auth settings:

- Email provider enabled
- Minimum password length: 12
- Redirect URL: `https://seats.megeredchianlaw.com/auth/confirm`
- Local redirect URL: `http://localhost:3000/auth/confirm`

## v1.1.1 Advanced Drawer Safety

The Advanced drawer is now reserved for draft map tools, CSV/backups, publishing, and destructive custom-seat actions. Employee, department, and zone management lives on `/admin/management`.

## v1.1.2 Undo / Redo Draft History

Admin draft edits now have Undo and Redo controls on the draft map toolbar. History is scoped to draft map actions and clears after a successful Publish Draft Map. No Supabase migration is required for this patch.
