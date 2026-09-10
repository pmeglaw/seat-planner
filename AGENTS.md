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
- UI changes are governed by the design system — read **Design System** below before changing
  visuals, layout, spacing, tokens or copy. Two enduring product principles stay: the app is
  map-first/operational, and viewer flows stay simpler than admin flows.

## Design System (read before any UI change)

The app has been through a governed Carbon redesign. The UI is **not** free-form: layout, tokens,
components and copy are fixed by a written record, and a change that contradicts it is a defect
even if it looks better. Cite a section for any design claim; never invent a requirement, and
never resolve a conflict by editing the record.

- **The rules**: the `ibm-design-language` skill, vendored at `.agents/skills/ibm-design-language/`
  (IBM Design Language + Carbon — tokens, 2x grid, UI shell, patterns, taste rubric, contrast
  script). Codex discovers it automatically; invoke it explicitly as `$ibm-design-language`. Its
  `assets/*.css` are reference copies — the sheets the app loads are `app/styles/carbon-tokens.css`
  and `app/styles/carbon-components.css`. Provenance: Claude plugin `megeredchian/design-system`
  1.3.0, fingerprint `f997ee525800e755`, reproducible with the recipe in
  `docs/redesign-v2/phase3/PHASE3DS.md` §0. A different value means this copy has drifted from the
  text the record was written against — say so rather than working from it.
- **The record**: `docs/redesign-v2/` — `PHASE1IA.md` (information architecture), `PHASE2UX.md`
  (wireframes and flows), `phase3/PHASE3DS.md` (tokens, components, specimens),
  `phase4/PHASE4BUILD.md` (build log), `DECISIONS.md` (owner rulings; §6 is the numbered list of
  deliberate Carbon deviations). The record was complete at v2.0.0; every slice after it is a
  dated amendment in `phase5/PHASE5.md`, never a reopening.

### Brand colours (LOCKED — owner approval required to change)

Carbon ships blue 60 `#0f62fe` as primary, link, focus and interactive. All four roles are
overridden in `app/styles/brand/megeredchian-law-tokens.css`. **No blue is in use anywhere.**

    Primary                #B85C2E   both themes (4.56:1 on white, 3.97:1 on gray 100)
    Primary hover          #8F4521   ·  active #7A3A1C
    Focus ring             #B85C2E   both themes
    Tertiary / outlined    #B85C2E   light only; dark keeps Carbon's white tertiary
    Link                   #8F4521 light  /  #E8A07A dark
    Link hover             #7A3A1C light  /  #F5DDD1 dark
    Interactive border     #B85C2E light  /  #E8A07A dark   (ruling O5, 2026-09-10)
    Search / filter hit    fill #FBE8DC light, #393939 dark · edge #B85C2E light, #E8A07A dark
    Reception locked row   #FBE8DC light  /  #525252 dark   (ruling O4)
    Draft family           #8A3FFC light  /  #BE95FF dark   (Carbon purple 60 / 40, §6 no. 17)
    Brand neutrals         charcoal #5D5C5B (#3F3E3D) · tints #F5DDD1 / #FBE8DC · paper #FFFBF7

On dark, interactive *edges and links* carry apricot `#E8A07A` — terracotta measures 1.71–2.77:1
on the dark layers it has to draw on, under the 3:1 graphic floor. Filled primaries, the focus
ring and `--cds-interactive` stay terracotta.

**Logo orange `#EB7C35` is the logo mark only** — 2.81:1 on white, fails AA. Never a button, text,
link, border or focus colour; the token test fails the build if it appears outside the brand
declaration.

Components consume `--sp-*` names only: no hex and no `--cds-*` outside the token files
(`tests/phase4-token-layer-source.test.mjs`). Never hand-write terracotta into a component — it
arrives through the role. New colours derive from the terracotta scale; the Draft purple is the
one sanctioned exception. Token values, contrast tooling and the per-PR checklist are in the
`brand-system` skill (`.claude/skills/brand-system/`) — read it before touching any colour or
anything under `app/styles/`.

### Working rules

- **Target frame**: desktop, 1920×1080, Chrome maximized (dual 27" FHD monitors; nobody uses a
  laptop). Narrower widths must still work — `DECISIONS.md` §2 binds every viewport from 320px —
  but they do not carry design rulings. One named exception: `/reception` is operated at about a
  third of the screen, so its narrow band is designed and verified 480→1055.
- **Guardrails that are not style**: `accessibility-source` and
  `bulk-destructive-action-safety-source`, plus the correctness anchors in
  `seat-creation-ui-source` and `desktop-seat-marker-system-source`, assert against source text.
  Tripping one means a real accessibility, safety or data-integrity line was crossed — fix the
  crossing, never loosen the test.
- `app/styles/sp-components.css` is kept **byte-identical** to
  `docs/redesign-v2/phase3/components/sp-components.css`. A product change is a dated amendment in
  both copies, never an edit to one.
- Tests passing is **not** visual verification. Render the page at 1920×1080 in both themes and
  look at it.

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
