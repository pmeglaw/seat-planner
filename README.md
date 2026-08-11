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
| `npm run typecheck` | `next typegen && tsc --noEmit` — typegen first, because `next-env.d.ts` and the route declarations it imports are generated and gitignored |
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
| `npm run backup:prod` | Manual production backup — needs `SUPABASE_DB_URL`; writes outside the repo |

Run a single test file with `node --test tests/seat-swap.test.mjs`.

## Architecture

Two documents carry the detailed guidance; read them before non-trivial work:

- **`CLAUDE.md`** — the cross-file architecture: the draft/published two-layer model, the three-layer security boundary, RPC-based transaction safety, the coordinate calibration transform, the design-token system, and the migration numbering scheme.
- **`AGENTS.md`** — folder map, coding conventions, and the "done means" checklist.

Key concepts in brief:

- **Draft vs. published layers.** Every seat row has a `layer` of `'draft'` or `'published'`. Viewers only ever read published; admins edit draft; `publishSeatMapAction` atomically copies draft over published. Keep the two layers strictly separate.
- **Security boundary.** Admin access is enforced in two independent places — server actions (`requireAdmin()` in `app/actions.ts`) and Postgres RLS + `SECURITY DEFINER` RPCs. The root `proxy.ts` only refreshes the auth session cookie and fails open; it is not an authorization layer. Client-side guards are UX only.
- **Coordinates.** Seats store normalized `x`/`y` in `[0,1]`; they are already normalized in the database (and CHECK-constrained there) — do not re-run any normalization pass.
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

## Backups & recovery

**The snapshot tools on `/admin/settings` are not a database backup.** "Export draft
snapshot" writes the draft seats plus the active employee directory to a JSON file, and
`restoreDraftSnapshotAction` restores exactly that. It never touches the published
`seats` layer, `published_employees`, `publish_events`, `department_options`,
`zone_options`, `profiles`, or Supabase auth users. Treat it as an undo for the draft
working copy, not as disaster recovery.

**The backup position: the Supabase organisation is on the Free plan**, which has
neither scheduled backups nor point-in-time recovery. Nothing takes a copy of the
production database automatically. **The chosen remedy is a manual weekly dump** —
`npm run backup:prod`. If a week is missed, the exposure is a week of seat and directory
edits; if the habit lapses entirely, there is no backup at all, so the calendar entry
matters more than the tooling does.

```bash
SUPABASE_DB_URL='postgresql://...' npm run backup:prod
```

`SUPABASE_DB_URL` comes from the dashboard's **Connect** button (top bar), not the
Database settings page. Three details cost time the first time round:

- Take the **Session pooler** string, port **5432**. The **Transaction pooler** (port
  6543) cannot be used by `pg_dump` at all, and the **Direct connection** is IPv6-only on
  the Free plan, so it may simply time out.
- **The database password is not viewable after project creation.** If it is not in a
  password manager, reset it on the Database settings page. The app is unaffected — it
  reaches Supabase over HTTPS with the anon key, not this password.
- When resetting, choose a password of **letters and digits only**. Special characters
  have to be percent-encoded in the connection string and fail confusingly if they are not.

Pass the string inline for the one command rather than storing it: the script
**deliberately does not read `.env.local`**, so reaching production is always an explicit
act. On Windows, `$env:SUPABASE_DB_URL = Read-Host "Connection string"` keeps it out of
the PowerShell history file; clear it with `$env:SUPABASE_DB_URL = $null` afterwards.
Docker must be running — the CLI shells out to a containerised `pg_dump`.

Each run writes three files — Supabase's full-backup triad, restored back in this order:

```
seat-planner-<YYYY-MM-DD>-roles.sql     # --role-only
seat-planner-<YYYY-MM-DD>-schema.sql
seat-planner-<YYYY-MM-DD>-data.sql      # --data-only
```

They land in `$SEAT_PLANNER_BACKUP_DIR`, defaulting to `../seat-planner-backups` — a
sibling of this repository. **The script refuses to write anywhere inside the working
tree**, because the data dump contains the entire employee directory and `.gitignore` is
one `git add -f` away from not helping. Keep the files off shared drives, and keep at
least the last four weeks so a corruption noticed late is still recoverable.

If the plan is ever upgraded to Supabase Pro (daily backups, 7-day retention; PITR is a
further paid add-on), this section and `scripts/backup-prod.mjs` become redundant rather
than wrong — retire them deliberately, don't just stop running the dump.

**Restoring.** Restore into a *new* Supabase project or the local stack first, point a
local `npm run dev` at it, confirm `/` renders the published map and `/admin` the draft,
and only then repoint production. Never restore over a live project as a first attempt.

**Rehearsal log.** A backup that has never been restored is not a backup.

| Date | What was rehearsed | Outcome |
| --- | --- | --- |
| 2026-07-29 | **First real production dump.** `npm run backup:prod` against the live project via the session pooler (`aws-1-us-east-1.pooler.supabase.com:5432`) | **Pass.** Every table matched the live row counts exactly — 29 employees, 136 seats (68 draft + 68 published), 14 published\_employees, 18 departments, 8 zones, 24 publish events, 2 profiles. The dump also captures `auth.users`, `auth.identities`, and sessions, so sign-in accounts are covered — the draft snapshot never included those. Schema dump holds all 7 tables and the publish RPC. Not restore-tested; the mechanism was proven by the local rehearsal below. |
| 2026-07-29 | `npm run backup:prod` against the **local** stack, then all three dumps restored into a fresh database in the same cluster | **Pass.** Row counts matched the source exactly (74 employees / 4,060 seats / 72 published\_employees / 8 zones / 2 publish events); all five core RPCs present; RLS still enabled on `seats`, `employees`, `profiles`, `published_employees`. Schema and data applied with zero errors. Restoring roles into the same cluster conflicts with the roles already there — harmless here, and not a case a real restore into a new project hits. **This exercised the mechanism on local fixture data; a production dump has not yet been taken or restored.** |

## Ask Planner

`/admin` includes a **read-only** AI assistant that answers questions about the map and highlights matching seats. It must never mutate data. Manual QA:

- The drawer appears on `/admin` but not on the viewer `/`.
- "Which seats are open?" returns a read-only answer with no data changes.
- "Open seats in Center Desks" highlights matching seats.
- "Move Alice to N01" is refused (read-only).
- Highlight chips only select and open the seat inspector.
