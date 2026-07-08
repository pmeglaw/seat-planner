# AGENTS.md

## Purpose And Stack

This repo is a private office seat-planning app. Authenticated viewers see the published seating map at `/`; admins edit a draft map at `/admin`, manage data at `/admin/management`, and publish draft changes when ready.

Tech stack: Next.js App Router, React, TypeScript, Tailwind CSS, Supabase Auth, Supabase Postgres, RLS, and Next.js server actions.

## Commands

Package manager: npm. Use the existing `package-lock.json`.

- Install: `npm ci`
- Dev: `npm run dev`
- Build: `npm run build`
- Lint: `npm run lint`
- Test: `npm test`
- Typecheck: `npm run typecheck`

`npm test` runs `node --test tests/*.test.mjs`. It requires installed dependencies because some tests import `typescript`.

## Important Folders

- `app/`: App Router routes, layouts, auth pages, and `app/actions.ts` server actions.
- `components/`: UI for the seat map, inspector, filters, advanced drawer, auth forms, and admin management.
- `lib/`: Supabase clients, auth helpers, validators, CSV logic, seat math, seat labels, seat protection, and draft history.
- `tests/`: focused Node `.mjs` tests for business logic.
- `supabase/migrations/`: database schema, seed data, RLS policies, and security migrations.
- `public/images/`: static assets, including the office floor plan.
- `docs/`: release, QA, auth, implementation, and patch notes.

## Supabase And Env

- Copy `.env.local.example` to `.env.local`.
- Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Never add service-role keys to browser-accessible env vars or client code.
- Apply `supabase/migrations/*.sql` in numeric order.
- After creating the first user, promote the admin in `public.profiles`.
- For local auth, configure Supabase redirect URLs such as `http://localhost:3000/**` and `http://localhost:3000/auth/confirm`.

## Coding Conventions

- Keep changes small and consistent with existing patterns.
- Prefer existing helpers and components before adding new abstractions.
- Put shared business rules in `lib/` and cover risky logic with tests in `tests/`.
- Keep mutations that touch Supabase in server actions and enforce admin access with `requireAdmin()`.
- Treat Supabase RLS, `profiles.role`, and server-side checks as the security boundary.
- Use strict TypeScript; avoid `any` unless the alternative is worse.
- The UI is free to evolve — redesign visuals, layout, spacing, and design tokens as the product needs. Two enduring principles stay: the app is map-first/operational, and viewer flows stay simpler than admin flows. The only hard design guardrails are accessibility and destructive-action safety (see the `*-source.test.mjs` scope note in `CLAUDE.md`); a redesign that trips those has crossed a real line, not just changed the look.

## Safe Change Rules

- Only modify files needed for the task.
- Ask before adding production dependencies.
- Do not commit, push, or open PRs unless explicitly asked.
- Do not print, expose, commit, or transmit secrets.
- Do not bypass RLS/admin checks with client-only guards.
- Keep draft and published seat behavior separate: admins edit draft, viewers read published.
- Do not allow protected original seats to be deleted directly; only custom seats are removable.

## Done Means

- The requested change is implemented and scoped to the relevant files.
- Relevant checks were run. For broad app changes, run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`.
- If a check cannot run, explain why and provide the exact command to run.
- Documentation-only changes can skip tests, but say so explicitly.
- Summarize changed files and remaining risks.
