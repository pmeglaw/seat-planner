# AGENTS.md

## Purpose

This repo is a private office seat-planning app. Authenticated viewers see the published seating map at `/`; admins edit a draft map at `/admin`, manage data at `/admin/management`, and publish draft changes when ready.

## Commands

Package manager: npm. Use the existing `package-lock.json`. The script names are in `package.json`; the non-obvious parts are the test tiers — see the `test-tiers` skill for how each is wired.

`npm test` runs `node --test tests/*.test.mjs`. It requires installed dependencies because some tests import `typescript`, and `tests/rpc-execution.test.mjs` (`npm run test:db`) applies the real `supabase/migrations` to an in-process Postgres (`@electric-sql/pglite`) to exercise the atomic RPCs.

## Supabase And Env

- Copy `.env.local.example` to `.env.local`.
- Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Set `OPENAI_API_KEY` (server-only — never `NEXT_PUBLIC_`-prefixed) to enable Ask Planner; optional `OPENAI_MODEL` overrides `ASK_PLANNER_DEFAULT_MODEL` in `lib/mapOperationsAgent.ts`.
- Never add service-role keys to browser-accessible env vars or client code.
- Apply `supabase/migrations/*.sql` in numeric order.
- After creating the first user, promote the admin in `public.profiles`.
- For local auth, configure Supabase redirect URLs such as `http://localhost:3000/**` and `http://localhost:3000/auth/confirm`.
- `/auth/confirm` is the primary magic-link route; `/auth/callback` stays supported for older links and PKCE callbacks.

## Coding Conventions

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
