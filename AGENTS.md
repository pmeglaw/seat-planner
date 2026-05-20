# AGENTS.md

## Repo Layout

This is a private Next.js App Router seat-planning app using React, TypeScript, Tailwind CSS, Supabase Auth, Supabase Postgres, RLS, and server actions.

- `app/`: routes, layouts, auth pages, and server actions.
- `app/page.tsx`: authenticated viewer map using the published seat layer.
- `app/admin/page.tsx`: admin draft map editor.
- `app/admin/management/page.tsx`: employee, department, and zone management.
- `components/`: client UI, including the seat map, inspector, filters, drawer, auth forms, and admin management panel.
- `lib/`: business logic, validators, Supabase helpers, auth messages, CSV helpers, and draft history.
- `tests/`: Node test runner `.mjs` tests for focused business logic.
- `supabase/migrations/`: schema, seed data, RLS, and security migrations. Run them in numeric order.
- `public/images/office-floor-plan.png`: floor plan image used by the map.
- `docs/`: setup, QA, release, auth, and patch notes.

## Commands

Package manager: npm. Use `package-lock.json`.

- Install: `npm ci`
- Dev/run: `npm run dev`
- Test: `npm test`
- Typecheck: `npm run typecheck`
- Lint: `npm run lint`
- Build: `npm run build`

`npm test` runs `node --test tests/*.test.mjs`. If dependencies are missing, it can fail because `tests/draft-history.test.mjs` imports `typescript`.

## Local Setup

- Copy `.env.local.example` to `.env.local`.
- Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Apply all SQL files in `supabase/migrations/` in order.
- Create the first Supabase user, then promote the intended admin in `public.profiles`.
- Configure Supabase Auth redirect URLs for local testing, including `http://localhost:3000/**` and `/auth/confirm`.

## Coding Conventions

- Keep changes small and reviewable.
- Prefer existing components, helpers, server actions, and Tailwind patterns.
- Keep business rules in focused `lib/` helpers when practical, with tests nearby in `tests/`.
- Use TypeScript strictly; avoid `any` unless there is no clean alternative.
- Preserve the operational, map-first UI style. Viewer mode should stay simpler than admin mode.
- Use server actions in `app/actions.ts` for mutations that touch Supabase.
- Keep auth/session behavior in the existing `lib/supabase/*` and middleware patterns.

## Constraints

- Do not add production dependencies without asking first.
- Do not commit, push, or open PRs unless explicitly asked.
- Do not print, expose, commit, or transmit secrets.
- Never use Supabase service-role keys in browser-accessible code.
- Treat Supabase RLS, `profiles.role`, and server-side `requireAdmin()` as the authorization boundary.
- Client-side admin UI checks are convenience only, not security.
- Draft and published seat layers are separate; admin edits draft, viewer reads published.
- Protected original seats must not be deleted directly; only custom seats are removable.

## Done Means

- The requested behavior is implemented and scoped to the relevant files.
- Relevant checks have been run, usually `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` for broad app changes.
- If a check cannot run, report why and give the exact command to run.
- Documentation-only changes do not require tests, but say tests were skipped and why.
- Summarize changed files and any remaining risks before handing back.
