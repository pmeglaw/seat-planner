# AGENTS.md

## Purpose And Working Approach

This is the shared project guide for coding agents working on Seat Planner, a private office seat-planning app. Viewers read the published map at `/`; admins edit the shared draft at `/admin`, manage people at `/admin/management`, and use data utilities at `/admin/settings`. `/reception` is a read-only directory for signed-in users. Keep the product map-first and simple for non-technical staff.

- Read the relevant code, explain the intended change briefly, and make the smallest change that satisfies the request. Preserve unrelated work.
- This guide is the shared source of project rules and essential architecture; root `CLAUDE.md` points here. Use current source to establish behavior and approved owner decisions to establish intended behavior. Report mismatches; do not treat an existing bug as a new requirement.
- Search narrowly, reuse findings, and load only the workflow guides needed for the task. Avoid broad scans of dependencies, generated output, and lockfiles. Targeted reads are appropriate for installed framework documentation, exact dependency versions, and build diagnostics.
- Use Context7 for uncertain library APIs when available, matching the installed version. Prefer local framework docs or dedicated official documentation tools when they answer the question. Never send secrets or private office records in documentation queries.
- Keep detailed procedures in skills and owner decisions in the design record. When changing a documented route, command, or architectural contract, update its guidance in the same change; avoid duplicating reference material.

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

Choose checks using **Verification And Completion** below.

## Project Map And Workflow Guides

| Area | Start here |
| --- | --- |
| Viewer / admin / reception routes | `app/(shell)/page.tsx`, `app/(shell)/admin/`, `app/(shell)/reception/` |
| Seat-map UI | `components/seat-map/SeatMap.tsx` and its siblings |
| Mutations / publishing | `app/actions.ts`, `lib/publishGuard.ts`, `lib/publishSummary.ts`, `lib/publishHistory.ts` |
| Authentication | `lib/serverAuth.ts`, `lib/adminPageGuard.ts`, `components/auth/LoginForm.tsx`, `app/auth/` |
| Supabase clients / session refresh | `lib/supabase/`, root `proxy.ts` |
| Business rules / database history | `lib/`, `supabase/migrations/` |
| Tests | `tests/`, `tests/browser/`, `tests/e2e/`, `tests/e2e-auth/` |

- Consult `README.md` for setup and operations.
- Read `.claude/skills/test-tiers/SKILL.md` before writing or debugging framework-coupled tests.
- Read `.claude/skills/run-seat-planner/SKILL.md` when running or visually checking the app.
- Read `.claude/skills/web-app-performance/SKILL.md` for performance work; measure before optimizing.
- Read `app/concepts/CLAUDE.md` when working in `app/concepts/`. Those prototypes are historical, gated, and excluded from search indexing; they are not design inputs for shipped surfaces.
- These are explicit file references even when a skill is absent from the session's skill list. Preserve vendored skills and assets; do not hand-edit third-party skill contents.

## Data And Mutation Contracts

- **Seats have two layers.** Viewers read only `published`; admins edit only `draft`. Publishing atomically replaces the published map. Never write published seats directly from a UI mutation.
- **Employees are snapshotted at publish.** `employees` is the live admin directory; viewers use `published_employees`. People edits become visible to viewers on the next publish. Existing viewer filter chips may read live department/zone option names; do not widen that exception to people data or other live tables.
- **Published notes are private.** `published_seat_notes` stores the admin-only published note snapshot. Keep private notes out of viewer-readable published seat rows and viewer responses. Preserve the access and publish invariants exercised by `tests/private-seat-notes-execution.test.mjs`.
- **The draft is shared across admins.** Preserve the stale-edit fence in `lib/draftConcurrency.ts`: exact per-row IDs and `updated_at` expectations, with timestamps returned verbatim rather than parsed through `Date`. SQLSTATE `MLS02` means the state changed; do not silently overwrite it. Preserve active-employee expectations for publishing too.
- **Undo/restore does not delete people.** Restoring seats may upsert employees but must not delete an employee created during assignment. Directory removal happens through Management deactivation.
- **Multi-row operations are atomic RPCs.** Keep seat swaps, imports, restores, publishing, and management transactions in database functions called from server actions. Update the action, a new migration, and relevant tests together when changing a transaction contract.
- **Protected original seats cannot be deleted.** Only custom seats are removable; preserve agreement between `lib/seatProtection.ts` and database enforcement.
- Current schema and migrations are authoritative when a change depends on their details. Use focused reads instead of treating this summary as an exhaustive schema inventory.

## Authentication And Navigation

- Mutations require server-side admin authorization via `requireAdmin()` and independent database enforcement through RLS/RPC checks. Client guards and page redirects are not the security boundary.
- Reuse `lib/serverAuth.ts` and `lib/adminPageGuard.ts` for server authentication and page gating. Preserve the shared cached context rather than adding duplicate authentication probes.
- `proxy.ts` and `lib/supabase/middleware.ts` refresh sessions. Preserve their route allowlist, bounded waits, and local claim-validation strategy; do not turn session refresh into an unbounded network dependency.
- Preserve neutral login/reset responses, magic-link `shouldCreateUser: false`, and pre-hydration form safeguards. `/auth/confirm` is primary; `/auth/callback` retains compatibility. See the auth tests before changing these flows.
- The `app/(shell)/` layout owns persistent navigation chrome. Pages own their content; do not mount duplicate rails or bars. Preserve SeatMap's unsaved-edit veto and shell registration lifecycle.
- Use client-side navigation within the shell. Full-document navigation is limited to the established cases in `lib/fullNavigation.ts`. Preserve route-commit cancellation of the stalled-navigation watchdog.
- Mutating actions must invalidate affected paths. Other tabs may temporarily display cached data; the stale-edit fence still protects writes. Do not confuse cache freshness with authorization or concurrency safety.
- Ask Planner answers questions and highlights seats; it must remain read-only.

## Deployment

Production is hosted on Vercel. Per the repository deployment documentation, changes to `main` deploy to production and the Supabase GitHub integration applies migrations. Keep deployment work explicit; use a branch and preview for risky or visual changes. Do not manually apply migrations to production.

## Supabase And Environment

- Start from `.env.local.example`; use the local Docker database for routine mutation testing. Check the effective database target before writes instead of assuming local execution means local data. Never print credentials while checking configuration.
- If connected to production, draft and directory edits still affect shared office data even before publishing. Do not modify production records unless explicitly authorized.
- Preserve the fail-closed guard in `lib/publishGuard.ts`: publishing requires a recognized local database, the Vercel production signal, or an explicit `SEAT_PLANNER_ALLOW_PROD_PUBLISH=true` override. `NODE_ENV=production` alone proves nothing. Keep the refusal as `PUBLISH_BLOCKED`; never enable the override merely to make a test pass.
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are client-safe configuration. `OPENAI_API_KEY` and optional `OPENAI_MODEL` are server-only. Never expose service-role keys. Review any new `NEXT_PUBLIC_` variable for browser exposure.
- Add database changes as timestamped migrations; preserve legacy numbering and existing migration history. Preserve RLS and role checks rather than bypassing them to resolve errors.
- Local seeding must remain confined to the Docker container; do not replace it with a generic connection-string target.
- Preserve `scripts/backup-prod.mjs` safeguards: explicit process-environment database URL, no implicit `.env.local` loading, and output outside the repository. Do not assume a hosted backup plan exists; verify operational status when needed.
- Restart the dev server after environment changes. Follow `README.md` for local users, admin roles, and authentication redirects.

## Coding Conventions

- Use strict TypeScript; avoid `any` unless the alternative is worse. Keep shared business rules in `lib/` with focused tests for risky logic.
- Seat coordinates remain normalized in `[0,1]`; use `lib/seatMath.ts` and `lib/mapLayoutTransform.ts` for display calibration. Raster dimensions are not the saved coordinate space.
- When changing the shipped map image, regenerate its cache-buster and blur preview in `lib/mapLayoutTransform.ts`.
- Fonts are vendored and loaded with `next/font/local`; preserve reproducible builds instead of introducing build-time downloads through `next/font/google`.
- Read **Design System** below before changing visuals, layout, spacing, tokens, or copy. Viewer flows stay simpler than admin flows.

## Design System (read before any UI change)

- The governed design record controls layout, tokens, components, and copy. Cite the relevant section for design claims. Implement approved changes as dated amendments; never rewrite owner decisions merely to justify an implementation.
- Read `.agents/skills/ibm-design-language/SKILL.md` for IBM/Carbon patterns. Before touching colours, tokens, or `app/styles/`, also read `.claude/skills/brand-system/SKILL.md` for exact values, approved exceptions, contrast tooling, and verification.
- The record is `docs/redesign-v2/`: `PHASE1IA.md`, `PHASE2UX.md`, `phase3/PHASE3DS.md`, `phase4/PHASE4BUILD.md`, and `DECISIONS.md`. Later owner amendments are recorded in `phase5/PHASE5.md`. Historical prototypes and `docs/design-system/` are not current design authority.
- **Brand changes require owner approval.** Preserve terracotta primary fills, the approved light/dark link and focus roles, apricot dark interactive edges, and the sanctioned Draft purple family. Logo orange is mark-only. Do not introduce blue into product interactive roles; the underlying vendored Carbon palette is not itself a violation.
- Components use semantic `--sp-*` tokens. Preserve the explicit exceptions in `tests/phase4-token-layer-source.test.mjs`, including its hex ledger and font bridge allowances. Do not expand an exception or hard-code a new colour as a shortcut.
- Preserve vendored Carbon assets and the IBM skill's provenance. Its fingerprint and verification recipe are recorded in `docs/redesign-v2/phase3/PHASE3DS.md`, section 0. Report drift before relying on a mismatched copy.
- Keep `app/styles/sp-components.css` byte-identical to `docs/redesign-v2/phase3/components/sp-components.css`; approved component amendments update both copies.
- **Visual target:** Chrome at 1920x1080 in light and dark themes. Maintain responsive behavior from 320px; `/reception` additionally needs its operational 480-1055px band checked. Preserve explicit and system-selected theme behavior.
- Accessibility, destructive-action safety, draft isolation, protected-seat rules, and coordinate integrity remain mandatory. A source-test failure requires investigation: correct a real regression, or update the assertion when a legitimate refactor preserves the requirement and equivalent behavior is verified. Never weaken the requirement to obtain a passing test.

## Safe Change Rules

- Ask before adding production dependencies.
- Do not commit, push, open PRs, merge, or deploy unless explicitly authorized. Task completion does not grant these permissions.
- Never expose or commit secrets. Access, export, or transmit private office records only within the authorized task and to its intended destination; exclude them from unrelated external tools, documentation queries, logs, and example fixtures.
- Do not disable tests, weaken safety checks, or edit design decisions merely to make a change pass.
- Do not delete branches or clean unrelated files to produce a clean working tree.

## Verification And Completion

For every TypeScript/TSX change, run `npm run typecheck` and focused ESLint checks on the changed files (for example, `npx eslint path/to/file.tsx`). A passing full gate satisfies both requirements. Start with the narrowest relevant behavior check; combine rows below when a change crosses boundaries:

| Change | Required verification |
| --- | --- |
| Pure business logic | Relevant Node behavior tests |
| Database schema, RLS, or RPC behavior | Relevant SQL execution tests and action/RPC wiring tests; use the local stack for integration behavior PGlite cannot establish |
| Login, session handling, role gates, publish integration, or shell navigation | Relevant unit/component tests and affected authenticated e2e scenarios against local Supabase |
| Components, interactions, or layout | Relevant component/browser tests and visual inspection of affected routes, roles, loading/empty/error states, and applicable theme/viewport targets |
| Broad application changes | `npm run gate` and `npm run build`, plus applicable browser/authenticated checks above |
| Documentation only | Review the diff and verify changed paths and commands; application tests may be skipped with an explicit note |

- `npm run gate` includes lint, typecheck, and the Node suite with coverage checks. Do not repeat `npm test` on the same unchanged tree solely to duplicate it.
- Automated checks do not replace visual inspection. PGlite and local-stack results do not establish live production behavior. Report fixtures, authenticated browser checks, and production verification accurately.
- Report what changed, checks performed, and remaining limitations; distinguish implemented, verified, committed, and deployed. If a required check is blocked, explain why and provide the exact next command or user action.
- Completion means the authorized scope is finished and its status is reported accurately. Preserve unrelated work; do not claim the entire repository is clean without checking it.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
