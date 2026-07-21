# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

An `AGENTS.md` also exists with overlapping guidance (folder map, coding conventions, "done means" checklist). Read it too; this file focuses on the architecture that only becomes clear after reading several files together.

## Stack

Private office seat-planning app (Next.js App Router + Supabase, TypeScript strict). Deployed on Vercel to `seats.megeredchianlaw.com`.

Framework and library **versions live in `package.json`** — don't restate them here, they go stale silently.

## Commands

- Dev server: `npm run dev` (http://localhost:3000; `/` = viewer, `/admin` = editor, `/admin/management` = data, `/admin/settings` = data utilities)
- Build: `npm run build` · Lint: `npm run lint` · Typecheck: `npm run typecheck`
- Tests: `npm test` (runs `node --test tests/*.test.mjs`; requires `node_modules` because some tests import `typescript` to type-check source)
- Single test file: `node --test tests/seat-swap.test.mjs`
- Coverage: `npm run coverage` (c8; text summary + HTML in `coverage/`) · `npm run coverage:check` enforces floors (lines 90 / funcs 95 / branches 80). Coverage is measured against the real `lib/*.ts` because the behavior tests run source through `tests/helpers/tsModuleLoader.mjs`, which emits inline source maps; c8 runs with `exclude-after-remap` so it attributes coverage to the source files. Scope is `lib/**` (the tested business core); framework-coupled modules with no unit suite (`lib/supabase/*`, `lib/adminPageGuard.ts`, page-level code, Ask Planner's OpenAI I/O) fall outside it.
- E2E smoke suite: `npm run test:e2e` (Playwright; needs a prior `npm run build`)
- Install (CI-faithful): `npm ci` (Node `>=22`, matching CI and `engines`)
- QA handoff report: `npm run qa:handoff` (regenerates the improvement-loop handoff under `tools/seat-planner-improvement-loop/`)

Restart the dev server after editing `.env.local`, `tailwind.config.ts`, or Supabase Auth settings — Tailwind/CSS and env changes are not always picked up hot.

Env vars: `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` are the only client-safe values. `OPENAI_API_KEY` (+ optional `OPENAI_MODEL`) is **server-only** — it powers Ask Planner and must never be prefixed with `NEXT_PUBLIC_`. The Supabase service-role key must never reach the browser.

## The draft / published two-layer model (central concept)

Every seat row carries a `layer` of `'draft'` or `'published'`. There are effectively two parallel copies of the whole map:

- **Viewers** (`/`, `app/page.tsx`) only ever read `layer = 'published'`.
- **Admins** (`/admin`, `app/admin/page.tsx`) edit `layer = 'draft'` and see published as read-only context.
- `publishSeatMapAction` → `publish_seat_map()` RPC atomically copies draft over published.

Keep this separation absolute: never let a viewer path read draft, never let an edit write published directly. Most bugs in this codebase come from blurring the two layers. `lib/publishSummary.ts` / `lib/publishHistory.ts` compute the diff and audit trail around publishing.

**Employee data is layered by snapshot, not by row.** `employees` (plus `department_options`/`zone_options`) is the admins' live working set; viewers never read it. `publish_seat_map()` atomically replaces `public.published_employees` (a snapshot of the active directory) alongside the seat copy, and `app/page.tsx` stitches viewer seat→employee joins from that snapshot only. Consequences: employee/department edits (Management, inspector, CSV, `rename_department`) reach viewers **only at the next publish**; the publish review diffs live vs snapshot (`employeeDetailChanges` in `lib/publishSummary.ts`) so pending people edits are visible and publishable. Never point a viewer surface at live `employees`, and never write `published_employees` outside the publish RPC/migrations (it is select-only under RLS; `tests/published-employee-snapshot.test.mjs` guards all of this).

## Security boundary (three enforced layers, do not rely on any one alone)

1. **Server actions** — all mutations live in `app/actions.ts` (`"use server"`). Every exported action calls `requireAdmin()` first, which re-checks `profiles.role === 'admin'` against the authenticated Supabase user. `lib/permissions.ts` (`isAdmin`/`assertAdmin`) is the pure-function version used in components/tests.
2. **Postgres RLS + SECURITY DEFINER RPCs** — the database independently enforces admin. Client-side guards are UX only.
3. **`middleware.ts`** → `lib/supabase/middleware.ts` refreshes the auth session cookie on every matched request.

Never bypass admin checks with client-only guards, and never expose the service-role key to the browser (only `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` are client-safe). Auth is email/password-primary with magic-link fallback; the callback routes (`app/auth/confirm`, `app/auth/callback`, `app/auth/update-password`) accept PKCE `code` / `token_hash` links and store the session in server cookies. Auth-facing copy lives in `lib/authMessages.ts`.

## Mutations go through RPCs for transaction safety

Simple single-row writes use the Supabase query builder directly in `app/actions.ts`. Anything that touches multiple rows atomically (seat swap, CSV import, snapshot restore, publish, department/zone rename+delete, force-move) is a **Postgres function invoked via `supabase.rpc(...)`**, so the whole operation is one transaction. Examples: `update_draft_seat`, `swap_draft_seat_assignments`, `import_assignments_csv`, `restore_draft_snapshot`, `publish_seat_map`, `rename_department` / `delete_department` (+ zone equivalents), `deactivate_employee`.

When changing this kind of logic you usually edit **both** the TypeScript action and the SQL function in a new migration. The `*-transaction-safety.test.mjs` tests exist to guard this atomicity — keep them passing.

## Coordinates and the map calibration transform

Seats store **normalized `x`/`y` in `[0,1]`** (already normalized in the DB — do not re-run any normalization pass; see `BASELINE_NOTES.md`). `lib/seatMath.ts` clamps/rounds and converts to CSS percentages. `lib/mapLayoutTransform.ts` applies a per-area linear calibration between *saved* coordinates and *visual* on-image coordinates. When adding/moving seats, keep saved coordinates normalized and let the transform handle display.

`MAP_IMAGE_WIDTH`/`MAP_IMAGE_HEIGHT` are **3822×1734** — the shipped webp is a 2x upscale (#124) of the 1911×867 master PNG, which is still the canonical source. The display cap stays 1911px, and because calibration is normalized and the upscale kept the same framing, the 2x swap changed no constants. Don't read 3822 as a coordinate space: saved and visual coordinates are both in `[0,1]`.

## `lib/` is the tested business core

Risky/pure logic lives in `lib/*.ts` and is covered by matching `tests/*.test.mjs` (plain Node test runner, no framework). Prefer extending an existing `lib/` helper over inlining logic in a component or action, and add/adjust its test. Notable modules: `seatSwap`, `seatProtection` (original seats can't be deleted — only `is_custom` seats), `draftHistory` (undo/redo snapshots), `csv` (import/export), `seatZones`/`departments`, `seatClusters`, `seatLabels`, `viewerSeatSearch`, `virtualizedList` (directory virtualization), `validators`, `formatName`, `mapOperationsAgent` (Ask Planner).

The atomic Postgres RPCs (`swap_draft_seat_assignments`, `update_draft_seat`, `publish_seat_map`, `import_assignments_csv`, `restore_draft_snapshot`, the management actions) are covered by an **execution tier**: `tests/rpc-execution.test.mjs` applies the real `supabase/migrations` to an in-process Postgres (PGlite / WASM) via `tests/helpers/pgHarness.mjs`, then calls the RPCs and asserts on the resulting rows — so the transaction/atomicity/concurrency-fence guarantees are verified against the real SQL, not just grepped. The harness stubs Supabase's `auth` schema, `auth.uid()`, and the `anon`/`authenticated` roles (PGlite has none of them); the RPCs' own `app_private.is_admin()` gate is exercised by switching `app.current_user_id` between an admin and a viewer. This complements the `*-transaction-safety` source tests (which pin that the TS action + SQL stay in lockstep). It runs inside `npm test`, so it needs `@electric-sql/pglite` installed.

Two kinds of *source-facing* tests coexist within `tests/*.test.mjs`. Behavior tests exercise a helper's runtime logic. **`*-source.test.mjs` tests instead assert against source text** — they read files and check for required tokens/classes/patterns. These are **deliberately scoped to guardrails that protect users and data, not to a particular look**: `accessibility-source` (keyboard/focus/dialog semantics, viewer read-only isolation), `bulk-destructive-action-safety-source` (review-before-mutate on imports/restores/deletes), plus the correctness anchors in `seat-creation-ui-source` (draft-only mutation, custom-seat protection, undo/redo eligibility) and `desktop-seat-marker-system-source` (true coordinates / calibration constants untouched, no data/auth/route crossing). They do **not** freeze visual or layout choices — colors, spacing, marker/inspector styling, and token *values* are free to evolve. If a redesign trips one of these, you have crossed a real guardrail (an a11y, safety, or data-integrity line), not merely changed the look — so fix the crossing rather than loosen the test.

**Component tests** render real client components in jsdom via `tests/helpers/renderComponent.mjs`: it bundles a component with esbuild (resolving `@/` through tsconfig) while swapping the server/framework boundaries — `@/app/actions`, `@/lib/supabase/client`, `next/navigation`, `next/image`, `next/link` — for controllable doubles read from `globalThis.__ct`, then renders with `@testing-library/react`. `login-form` (auth flows, validation, the `safeNextPath` redirect guard) and `seat-inspector` (viewer↔admin isolation, close/collapse/delete callbacks, custom-vs-protected delete) cover their whole components. `SeatMap` itself can't be unit-rendered in jsdom — it runs live layout/de-collision measurement that never converges against jsdom's zero-size geometry — so `seat-map-components` covers the renderable pieces it composes (`SeatMarker`, `MapZoomControl`, `FloorSelector`) there. Needs `esbuild`, `jsdom`, and `@testing-library/*` installed.

The **full SeatMap** is instead exercised in a **real browser** by a separate Playwright tier (`npm run test:browser`, `playwright-ct.config.ts`, `tests/browser/`). `tests/browser/build-harness.ts` esbuild-bundles the real SeatMap into a static IIFE harness (the same server/framework boundaries swapped for doubles that call back to Node via `window.__ctCall`), which `seat-map.spec.ts` loads over `file://` — no app server, no Next build — and drives marker→inspector selection, close, and the viewer↔admin edit-affordance gate. The harness ships no Tailwind CSS, so markers aren't laid out for hit-testing: clicks use `dispatchEvent` and assertions are presence-based (`toBeAttached`), targeting SeatMap's composed behavior, not pixel layout. It runs in CI's `e2e` job (Chromium already installed there), separate from `npm test`.

A separate **end-to-end tier** lives in `tests/e2e/` (Playwright, `npm run test:e2e`, config in `playwright.config.ts`). It is a **backend-free smoke suite**: it builds the app, boots it with only *dummy* Supabase env, and asserts the app starts, `/login` renders the sign-in form, and the auth middleware redirects unauthenticated `/` and `/admin` to `/login`. It deliberately does **not** cover authenticated flows (publish, seat edits) — those need a seeded test project + CI secrets (tracked as a follow-up), so keep verifying them manually. CI (`.github/workflows/ci.yml`) runs two jobs on every PR and push to `main`: `verify` (lint → typecheck → `npm run coverage:check` → build) and `e2e` (`npm run test:browser` SeatMap real-browser tests → build → Playwright smoke). The test step runs under c8 and enforces the coverage floors, so a drop below lines 90 / funcs 95 / branches 80 fails CI.

## Design system (semantic CSS tokens)

Styling is organized around **semantic design tokens**: CSS custom properties named `--sp-color-*` (brand, action, text, surface, border, state) defined in `app/globals.css` and surfaced through `tailwind.config.ts`. Shared primitives live in `components/ui/` — `design-system.tsx` (`Button`, `focusRingClass`, variant/size maps) and `Button.tsx`. Admin surfaces are scoped under `.admin-theme`.

Treat the tokens and primitives as an **evolvable starting point, not fixed law**: they exist so a redesign can restyle the whole app by changing values in one place, and adding/renaming/retiring tokens or reworking the look is expected and welcome. The only hard rule the tests still enforce is **accessibility** (`accessibility-source` — keep focus rings, keyboard operability, and dialog semantics intact) and **not leaking contrast/a11y regressions** — nothing pins a specific palette or layout. `app/globals.css` documents measured contrast ratios in comments; when you change colors, keep body text ≥ 4.5:1 and re-check those notes, but the colors themselves are yours to change.

`app/concepts/component-state-board` is a **prototype-only** design surface, gated by `prototypesEnabled()` — it returns 404 in production unless `SEAT_PLANNER_ENABLE_PROTOTYPES=true`. It is not part of the shipped viewer/admin flows.

## Migrations directory has a dual-numbering history

`supabase/migrations/` contains both legacy `00N_*.sql` files and newer `YYYYMMDDHHMMSS_*.sql` timestamped files (some intentionally duplicated / `placeholder` to reconcile local vs prod history). Add new work as a new timestamped migration. **Do not apply migrations to prod manually** — merging to `main` triggers the Supabase GitHub integration, which applies them and deploys via Vercel. Prod is `seats.megeredchianlaw.com`.

## Ask Planner

`/admin` includes a read-only AI assistant (`AskPlannerDrawer` → `askPlannerAction` → `lib/mapOperationsAgent.ts`). It answers questions and highlights seats but must never mutate data — keep it read-only.
