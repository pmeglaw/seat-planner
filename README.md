# Office Seat Planner

Internal interactive office seating map for Megeredchian Law. Authenticated viewers see the published seating map at `/`; admins edit a draft map at `/admin`, manage employees, departments, and zones at `/admin/management`, run data utilities (CSV import/export, snapshot restore) at `/admin/settings`, and publish draft changes when ready.

Production: [seats.megeredchianlaw.com](https://seats.megeredchianlaw.com) (deployed on Vercel).

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS 3 · Supabase (Auth + Postgres + Row Level Security) · Next.js server actions.

## Getting started

```bash
npm install
cp .env.local.example .env.local   # then fill in your Supabase values
npm run dev                        # http://localhost:3000
```

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
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Node test runner over `tests/*.test.mjs` (requires installed deps) |
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
