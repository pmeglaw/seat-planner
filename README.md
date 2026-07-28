# Office Seat Planner

Internal interactive office seating map for Megeredchian Law. Authenticated viewers see the published seating map at `/`; admins edit a draft map at `/admin`, manage employees, departments, and zones at `/admin/management`, run data utilities (CSV import/export, snapshot restore) at `/admin/settings`, and publish draft changes when ready.

Production: [seats.megeredchianlaw.com](https://seats.megeredchianlaw.com) (deployed on Vercel).

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 3 · Supabase (Auth + Postgres + Row Level Security) · Next.js server actions.

## Getting started

```bash
npm install
npm run db:start                   # local Supabase; applies supabase/migrations
npm run db:seed                    # local admin + viewer accounts
npm run dev                        # http://localhost:3000
```

`npm run db:start` prints a local API URL and anon key. Put them in `.env.local`,
or export them for a single run — process environment variables take precedence
over `.env.local`, so this leaves the file untouched:

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
NEXT_PUBLIC_SUPABASE_ANON_KEY=<local anon key> npm run dev
```

`npm run db:stop` tears the stack down. The seeded accounts are
`e2e-admin@example.test` and `e2e-viewer@example.test` (password in
`supabase/seed.sql`) — local-only, and the container is disposable. CI's
`e2e-auth` job runs the authenticated suite against exactly this stack, so it is
a supported path, not a workaround.

> ⚠️ **Pointing `.env.local` at the live project makes local dev write to
> PRODUCTION.** Draft-layer seat edits are still safe (viewers only ever read
> published data), but **Publish updates the live map for real viewers** — treat
> any local publish as a production deploy. Prefer the local stack above for all
> routine work; use the live project only when you specifically need production
> data in front of you.

Required environment variables (`.env.local`):

| Variable | Scope | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | client-safe | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client-safe | Supabase anon key |
| `OPENAI_API_KEY` | **server-only** | Ask Planner assistant on `/admin` |
| `OPENAI_MODEL` | server-only, optional | Overrides the default Ask Planner model |

Never prefix `OPENAI_API_KEY` with `NEXT_PUBLIC_`, and never expose the Supabase service-role key to the browser. On Vercel, add server-only variables for Production (and Preview if you test Ask Planner there) and redeploy after changing them.

Restart the dev server after editing `.env.local`, `tailwind.config.ts`, or Supabase Auth settings — env and CSS changes are not always picked up hot.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm start` | Serve a production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Node test runner over `tests/*.test.mjs` (requires installed deps) |
| `npm run test:db` | SQL tier — applies the real migrations to in-process Postgres (PGlite) and calls the RPCs |
| `npm run test:ct` | jsdom component tests |
| `npm run test:browser` | Real-Chromium `SeatMap` tests (Playwright) |
| `npm run test:e2e` | Backend-free smoke suite (needs a prior `npm run build`) |
| `npm run test:e2e:auth` | Authenticated publish-flow suite (needs the local Supabase stack) |
| `npm run coverage` | Coverage report, scoped to `lib/**` |
| `npm run coverage:check` | Coverage with enforced floors (lines 90 / funcs 95 / branches 80) — the gate CI runs |
| `npm run db:start` | Start the local Supabase stack and apply migrations |
| `npm run db:seed` | Seed local-only admin + viewer accounts |
| `npm run db:stop` | Stop and remove the local Supabase stack |
| `npm run qa:handoff` | Regenerate the improvement-loop QA handoff |

Run a single test file with `node --test tests/seat-swap.test.mjs`.

## Architecture

Two documents carry the detailed guidance; read them before non-trivial work:

- **`CLAUDE.md`** — the cross-file architecture: the draft/published two-layer model, the three-layer security boundary, RPC-based transaction safety, the coordinate calibration transform, the design-token system, and the migration numbering scheme.
- **`AGENTS.md`** — folder map, coding conventions, and the "done means" checklist.

Key concepts in brief:

- **Draft vs. published layers.** Every seat row has a `layer` of `'draft'` or `'published'`. Viewers only ever read published; admins edit draft; `publishSeatMapAction` atomically copies draft over published. Keep the two layers strictly separate.
- **Security boundary.** Admin access is enforced in three independent places — server actions (`requireAdmin()` in `app/actions.ts`), Postgres RLS + `SECURITY DEFINER` RPCs, and the auth-session middleware. Client-side guards are UX only.
- **Coordinates.** Seats store normalized `x`/`y` in `[0,1]`; they are already normalized in the database — do not re-run any normalization pass (see `BASELINE_NOTES.md`).
- **Business logic lives in `lib/`** and is covered by matching tests in `tests/`.

## Authentication

Sign-in is email/password-primary with magic link as a fallback. Auth callbacks route through `/auth/confirm` (PKCE `code` and `token_hash` links) and, for resets, `/auth/update-password`. See `docs/magic-link-auth.md` for the email template.

Recommended Supabase Auth settings:

- Site URL: `http://localhost:3000` for local dev (your production URL in prod)
- Redirect URLs: `http://localhost:3000/**`
- Email provider enabled; minimum password length 12

After creating your first user, promote yourself to admin:

```sql
update public.profiles
set role = 'admin'
where email = 'your-email@company.com';
```

## Database & migrations

Schema, seed, RLS policies, and RPCs live in `supabase/migrations/`. Add new work as a new timestamped (`YYYYMMDDHHMMSS_*.sql`) migration.

**Do not apply migrations to prod manually.** Merging to `main` triggers the Supabase GitHub integration, which applies migrations and deploys via Vercel.

## Ask Planner

`/admin` includes a **read-only** AI assistant that answers questions about the map and highlights matching seats. It must never mutate data. Manual QA:

- The drawer appears on `/admin` but not on the viewer `/`.
- "Which seats are open?" returns a read-only answer with no data changes.
- "Open seats in Center Desks" highlights matching seats.
- "Move Alice to N01" is refused (read-only).
- Highlight chips only select and open the seat inspector.
