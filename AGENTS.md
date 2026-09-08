# AGENTS.md

## Purpose

This repo is a private office seat-planning app. Authenticated viewers see the published seating map at `/`; admins edit a draft map at `/admin`, manage data at `/admin/management`, and publish draft changes when ready.

## Commands

Use npm and the existing `package-lock.json`; match the Node version in `package.json` (also pinned in CI). Install with `npm ci`. Framework versions belong in `package.json`, not duplicated here.

| Task | Command / prerequisite |
| --- | --- |
| Develop locally | `npm run dev` (port 3000); configure the local database first for routine mutation testing |
| Start / seed local database | Docker running, then `npm run db:start` and `npm run db:seed`; use its local URL and anon key as described in `README.md` |
| Node behavior tests | `npm test`; requires installed dependencies and includes the SQL and jsdom component tiers |
| SQL subset | `npm run test:db`; real migrations in in-process PGlite, no hosted database required |
| jsdom component subset | `npm run test:ct` |
| Real-browser SeatMap tests | `npm run test:browser`; Chromium required, no Next build or app server |
| Backend-free smoke tests | `npm run build`, then `npm run test:e2e`; Chromium required |
| Authenticated flows | `npm run test:e2e:auth`; local Supabase and Chromium required; the harness seeds locally and builds with local database settings |
| CI verification gate | `npm run gate` (lint, typecheck, coverage thresholds), then `npm run build`; browser tiers are separate |

For focused changes, run the relevant test file or tier. `npm run coverage:check` already runs the Node suite; do not also run `npm test` on the same unchanged tree just to duplicate it.

## Project Map And Workflow Guides

- `app/`: routes, layouts, and server actions; `components/`: shared UI; `lib/`: shared business rules and service helpers.
- `supabase/migrations/`: database history; `tests/`: behavior tests, with `tests/browser/`, `tests/e2e/`, and `tests/e2e-auth/` for browser tiers.
- Read `CLAUDE.md` for cross-file architecture before non-trivial work; consult `README.md` for setup and operational details.
- Test harness details: read `.claude/skills/test-tiers/SKILL.md` before writing or debugging framework-coupled tests.
- Local UI workflow: read `.claude/skills/run-seat-planner/SKILL.md` when running or visually checking the app. These are explicit file paths even if the skills are not listed in the current tool session.
- UI changes need a browser check of affected routes and relevant loading, empty, error, and role-specific states; report blocked coverage accurately.

## Deployment

Production is hosted on Vercel. Per the repository deployment documentation, changes to `main` deploy to production and the Supabase GitHub integration applies migrations. Keep deployment work explicit; use a branch and preview for risky or visual changes. Do not manually apply migrations to production.

## Supabase And Env

- Copy `.env.local.example` to `.env.local`.
- Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Set `OPENAI_API_KEY` (server-only — never `NEXT_PUBLIC_`-prefixed) to enable Ask Planner; optional `OPENAI_MODEL` overrides `ASK_PLANNER_DEFAULT_MODEL` in `lib/mapOperationsAgent.ts`.
- Never add service-role keys to browser-accessible env vars or client code.
- Add new database changes as timestamped migrations in `supabase/migrations/`; preserve existing migration history. Use the local stack for routine testing.
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

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
