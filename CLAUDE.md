# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

An `AGENTS.md` also exists with overlapping guidance (coding conventions, safe-change rules, "done means" checklist). Read it too; this file focuses on the architecture that only becomes clear after reading several files together.

Repo-scoped skills live in `.claude/skills/` — `run-seat-planner` (boot and drive the app), `chrome-pixel-capture` (pixel-accurate screenshots), `test-tiers` (harness mechanics). Use `run-seat-planner` to check UI work in a real browser: build, typecheck and tests passing is **not** visual verification. When a convention or workflow needs repeating across sessions, add a `SKILL.md` there rather than growing this file — only a skill's one-line description stays resident, while everything here is loaded into every session.

## Stack

Private office seat-planning app (Next.js App Router + Supabase, TypeScript strict). Deployed on Vercel to `seats.megeredchianlaw.com`.

Framework and library **versions live in `package.json`** — don't restate them here, they go stale silently.

## Commands

- Dev server: `npm run dev` — `/` = viewer, `/admin` = editor, `/admin/management` = data, `/admin/settings` = data utilities
- Tests: `npm test` (runs `node --test tests/*.test.mjs`; requires `node_modules` because some tests import `typescript` to type-check source)
- Coverage: `npm run coverage` · `npm run coverage:check` enforces floors (lines 90 / funcs 95 / branches 80), scoped to `lib/**`. The c8/source-map wiring behind that is in the `test-tiers` skill.
- E2E smoke suite: `npm run test:e2e` (Playwright; needs a prior `npm run build`; locally point `PW_CHROMIUM_PATH` at a prebuilt Chromium — CI installs its own)

Restart the dev server after editing `.env.local`, `tailwind.config.ts`, or Supabase Auth settings — Tailwind/CSS and env changes are not always picked up hot.

Env vars: `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` are the client-safe Supabase values; the only other `NEXT_PUBLIC_` value is `NEXT_PUBLIC_BUILD_ID` (a non-secret commit SHA wired in `next.config.js` for deploy-skew detection — see `lib/deploySkew.ts`). Treat any further `NEXT_PUBLIC_` addition as suspect. `OPENAI_API_KEY` (+ optional `OPENAI_MODEL`) is **server-only** — it powers Ask Planner and must never be prefixed with `NEXT_PUBLIC_`. The Supabase service-role key must never reach the browser.

**Local dev writes to PRODUCTION.** `NEXT_PUBLIC_SUPABASE_URL` points at the live Supabase project — there is no dev or staging database. Draft-layer edits are safe (viewers never read draft), but running `publish_seat_map()` from a local `npm run dev` updates the live map at `seats.megeredchianlaw.com` for real viewers — treat any local publish as a production deploy.

## The draft / published two-layer model (central concept)

Every seat row carries a `layer` of `'draft'` or `'published'`. There are effectively two parallel copies of the whole map:

- **Viewers** (`/`, `app/page.tsx`) only ever read `layer = 'published'`.
- **Admins** (`/admin`, `app/admin/page.tsx`) edit `layer = 'draft'` and see published as read-only context.
- `publishSeatMapAction` → `publish_seat_map()` RPC atomically copies draft over published.

Keep this separation absolute: never let a viewer path read draft, never let an edit write published directly. Most bugs in this codebase come from blurring the two layers. `lib/publishSummary.ts` / `lib/publishHistory.ts` compute the diff and audit trail around publishing.

**Employee data is layered by snapshot, not by row.** `employees` is the admins' live working set; viewers never read it — that rule is absolute. `publish_seat_map()` atomically replaces `public.published_employees` (a snapshot of the active directory) alongside the seat copy, and `app/page.tsx` stitches viewer seat→employee joins from that snapshot only. One acknowledged, deliberately narrow exception: the viewer reads live `department_options`/`zone_options` for its filter chips (option **names** only, never people data — behavior that predates the snapshot model). Don't widen it: any new live-table read from a viewer surface is a violation; closing the exception means snapshotting the options at publish, a product change to take deliberately. Consequences: employee/department edits (Management, inspector, CSV, `rename_department`) reach viewers **only at the next publish**; the publish review diffs live vs snapshot (`employeeDetailChanges` in `lib/publishSummary.ts`) so pending people edits are visible and publishable. Never point a viewer surface at live `employees`, and never write `published_employees` outside the publish RPC/migrations (it is select-only under RLS; `tests/published-employee-snapshot.test.mjs` guards all of this).

**The draft layer is ONE shared copy, and concurrent admin edits are fenced.** Undo/redo and JSON restore rewrite the *whole* draft from a client-held snapshot, so a session working from stale data can silently revert another admin's edits. `lib/draftConcurrency.ts` plus the draft RPCs close that hole: the client sends the state it believes is current — an exact per-row `(id, updated_at)` expectation for whole-draft operations, or one seat's `updated_at` for per-seat edits — and the RPC rejects with SQLSTATE `'MLS02'` (`STALE_DRAFT_SQLSTATE`) if the database has advanced past it. `updated_at` is maintained by the `touch_seats_updated_at` trigger.

**Undo/redo and snapshot restore never remove an employee created during assignment — this is deliberate and owner-confirmed.** Draft history restores `seats` rows and re-upserts employees; `restore_draft_snapshot` only ever inserts/upserts into `public.employees`, never deletes. So a person created inline while assigning a seat stays in the directory after an undo, and is removed via Management → Deactivate. It reads like an undo bug and is not — do not "fix" it by adding a delete.

**Thread the fence through any new draft mutation** — `tests/draft-concurrency.test.mjs` guards it. Two details there look like redundancy and are load-bearing (the per-row map instead of an aggregate; timestamps passed back verbatim, never re-parsed through `Date`); the header comment in `lib/draftConcurrency.ts` explains why before you "simplify" either.

## Security boundary (two enforcing layers, do not rely on either alone; the third refreshes only)

1. **Server actions** — all mutations live in `app/actions.ts` (`"use server"`). Every exported action calls `requireAdmin()` first, which re-checks `profiles.role === 'admin'` against the authenticated Supabase user.
2. **Postgres RLS + SECURITY DEFINER RPCs** — the database independently enforces admin. Client-side guards are UX only.
3. **`proxy.ts`** → `lib/supabase/middleware.ts` refreshes the auth session cookie — and is deliberately NOT a security layer (layers 1–2 enforce). Next 16 renamed the root `middleware.ts` convention to `proxy.ts` (export `proxy`, same matcher semantics); the helper module keeps its `lib/supabase/middleware.ts` name, matching Supabase's own `updateSession` docs. Its matcher is an **explicit allowlist** (`/`, `/admin/*`, `/reception`, `/login`, `/auth/*` — never `/api/build-id` or static assets; `tests/auth-session-source.test.mjs` pins the list *and* the `proxy` export name, so dropping a route silently kills session refresh there and a half-done rename kills it everywhere). It validates JWTs **locally** (`getClaims` + a module-memoized JWKS with failure backoff), skips requests carrying no `sb-*` cookie, and races a 5s fail-open timeout — a per-request `getUser()` network call or an unbounded await here is a regression (the pre-#333 version hung into Vercel's 25s kill).

`lib/adminPageGuard.ts` (`getAdminPageContext`) is the shared prologue for the `/admin*` pages (login redirect + `profiles.role` check). It is UX-layer gating only — **not** a substitute for layers 1–2. Both it and the `(shell)` layout read auth through `lib/serverAuth.ts` (`getSessionContext`, React-`cache()`d), so layout chrome + page guard cost ONE auth probe and ONE role lookup per server render — don't add a second `getUser()` on a server surface, reuse the context.

Never bypass admin checks with client-only guards, and never expose the service-role key to the browser (only `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` are client-safe). Auth is email/password-primary with magic-link fallback; magic-link sign-in passes `shouldCreateUser: false`, so it never self-provisions accounts. The callback routes (`app/auth/confirm`, `app/auth/callback`, `app/auth/update-password`) accept PKCE `code` / `token_hash` links and store the session in server cookies. Auth-facing copy lives in `lib/authMessages.ts`.

## The persistent app shell (navigation is client-side by contract)

`/admin`, `/admin/management`, `/admin/settings`, and `/reception` live in the `app/(shell)/` route group (URLs unchanged). Its layout mounts the chrome **once per document load** — `components/ui/AppShell.tsx` renders the fixed `AppRail` plus (on sub-pages) `AdminShellBar` — and client-side navigation swaps only the content pane below, streaming each section's own `loading.tsx` skeleton. Pages must NOT mount a second rail or bar (`tests/auth-session-source.test.mjs` pins this); they own their content pane, theme class, `pl-12` rail offset, and skip-link landing marker, while AppShell owns the route→active-item and route→skip-link maps.

Surface-owned behavior reaches the persistent rail through registration, not props: SeatMap plugs its unsaved-edits veto + in-place Ask Planner opener in via `useAppShellNavigation` (registered on mount, cleared on unmount — the veto contract from `tests/app-rail.test.mjs` is unchanged). Full-document navigation stays an escape hatch with exactly the sanctioned callers listed in `lib/fullNavigation.ts`: post-auth redirects, the deploy-skew fallback (`assignLocation` fires ONLY when `isBuildSkewed` is true), and the 4s stalled-router watchdog — which now disarms on route commit via `usePathname` (a stale timer must never hijack back/forward). Anything else that turns a rail click into a document load — a bare `<a href>`, `window.location`, an unconditional `router.refresh()` — reintroduces the blank-flash bug #333 removed; `tests/app-shell.test.mjs` and the e2e-auth `nav-shell` spec (zero document requests, one persistent rail node) guard it.

Client Router Cache: `staleTimes.dynamic = 120` in `next.config.js`. Freshness scope is deliberate and documented there — `revalidatePath`/`router.refresh()` cover the acting tab only; OTHER browsers may show a revisited route up to 120s stale (accepted display lag; the MLS02 fence owns write integrity regardless). Mutating server actions must keep calling `revalidatePath`, or the acting tab goes stale too.

## Mutations go through RPCs for transaction safety

Simple single-row writes use the Supabase query builder directly in `app/actions.ts`. Anything that touches multiple rows atomically (seat swap, CSV import, snapshot restore, publish, department/zone rename+delete, force-move) is a **Postgres function invoked via `supabase.rpc(...)`**, so the whole operation is one transaction. Examples: `update_draft_seat`, `swap_draft_seat_assignments`, `import_assignments_csv`, `restore_draft_snapshot`, `publish_seat_map`, `rename_department` / `delete_department` (+ zone equivalents), `deactivate_employee`.

When changing this kind of logic you usually edit **both** the TypeScript action and the SQL function in a new migration. The `*-transaction-safety.test.mjs` tests exist to guard this atomicity — keep them passing.

## Coordinates and the map calibration transform

Seats store **normalized `x`/`y` in `[0,1]`** (already normalized in the DB and CHECK-constrained there — do not re-run any normalization pass). `lib/seatMath.ts` clamps/rounds and converts to CSS percentages. `lib/mapLayoutTransform.ts` applies a per-area linear calibration between *saved* coordinates and *visual* on-image coordinates. When adding/moving seats, keep saved coordinates normalized and let the transform handle display.

`MAP_IMAGE_WIDTH`/`MAP_IMAGE_HEIGHT` are **3822×1734** — the shipped webp is a 2x upscale (#124) of the 1911×867 master PNG, which is still the canonical source. The display cap stays 1911px, and because calibration is normalized and the upscale kept the same framing, the 2x swap changed no constants. Don't read 3822 as a coordinate space: saved and visual coordinates are both in `[0,1]`.

Re-rendering that asset (quality, color, size) is allowed, but it carries a contract: `MAP_IMAGE_SRC` ends in a `?v=…` cache-buster and `MAP_IMAGE_BLUR_DATA_URL` holds a tiny blur-up preview, both in `lib/mapLayoutTransform.ts`. **Regenerate both whenever the shipped pixels change** — skip the version bump and browsers keep serving the stale image, which looks like "the deploy didn't land" rather than a caching bug.

## `lib/` is the tested business core

Risky/pure logic lives in `lib/*.ts` and is covered by matching `tests/*.test.mjs` (plain Node test runner, no framework). Prefer extending an existing `lib/` helper over inlining logic in a component or action, and add/adjust its test. One contract worth knowing up front: `seatProtection` enforces that original seats can't be deleted — only `is_custom` seats. (The module list itself lives in `lib/` — like versions, don't restate it here.)

The atomic Postgres RPCs (`swap_draft_seat_assignments`, `update_draft_seat`, `publish_seat_map`, `import_assignments_csv`, `restore_draft_snapshot`, the management actions) are covered by an **execution tier**: `tests/rpc-execution.test.mjs` applies the real `supabase/migrations` to an in-process Postgres (PGlite / WASM) via `tests/helpers/pgHarness.mjs`, then calls the RPCs and asserts on the resulting rows — so the transaction/atomicity/concurrency-fence guarantees are verified against the real SQL, not just grepped. This complements the `*-transaction-safety` source tests (which pin that the TS action + SQL stay in lockstep). It runs inside `npm test`, so it needs `@electric-sql/pglite` installed.

Two kinds of *source-facing* tests coexist within `tests/*.test.mjs`. Behavior tests exercise a helper's runtime logic. **`*-source.test.mjs` tests instead assert against source text** — they read files and check for required tokens/classes/patterns. These are **deliberately scoped to guardrails that protect users and data, not to a particular look**: `accessibility-source` (keyboard/focus/dialog semantics, viewer read-only isolation), `bulk-destructive-action-safety-source` (review-before-mutate on imports/restores/deletes), plus the correctness anchors in `seat-creation-ui-source` (draft-only mutation, custom-seat protection, undo/redo eligibility) and `desktop-seat-marker-system-source` (true coordinates / calibration constants untouched, no data/auth/route crossing). They do **not** freeze visual or layout choices — colors, spacing, marker/inspector styling, and token *values* are free to evolve. If a redesign trips one of these, you have crossed a real guardrail (an a11y, safety, or data-integrity line), not merely changed the look — so fix the crossing rather than loosen the test.

Three further tiers are framework-coupled and have their own harnesses: jsdom **component tests** (`npm run test:ct`), a **real-browser** Playwright tier for the full SeatMap (`npm run test:browser`), and a **backend-free e2e smoke suite** (`npm run test:e2e`). How each is wired — and why `SeatMap` can't be unit-rendered in jsdom — is in the `test-tiers` skill; invoke it before writing or debugging tests in those tiers.

Authenticated flows run in CI's **e2e-auth** job (`npm run test:e2e:auth`, Docker + a disposable local Supabase stack): real sign-in, the admin role gate, a real publish, and the persistent-shell nav regression (`nav-shell.spec.ts`). The backend-free `test:e2e` smoke tier stays Docker-free by design. Passing tests are still **not** visual verification — for UI work, look at the real app (`run-seat-planner` skill). CI enforces the coverage floors on every PR — see `.github/workflows/ci.yml`.

## Design system (semantic CSS tokens)

Styling is organized around **semantic design tokens**: CSS custom properties named `--sp-color-*` in `app/globals.css`, surfaced through `tailwind.config.ts`; shared primitives in `components/ui/`. Admin surfaces are scoped under `.admin-theme`.

Treat the tokens and primitives as an **evolvable starting point, not fixed law**: they exist so a redesign can restyle the whole app by changing values in one place, and adding/renaming/retiring tokens or reworking the look is expected and welcome. The only hard rule the tests still enforce is **accessibility** (`accessibility-source` — keep focus rings, keyboard operability, and dialog semantics intact) and **not leaking contrast/a11y regressions** — nothing pins a specific palette or layout. `app/globals.css` documents measured contrast ratios in comments; when you change colors, keep body text ≥ 4.5:1 and re-check those notes, but the colors themselves are yours to change.

`app/concepts/` holds **prototype-only** design surfaces — `component-state-board`, `map-redesign`, and `login-v12`. Each page carries its own `prototypesEnabled()` gate and returns 404 in production unless `SEAT_PLANNER_ENABLE_PROTOTYPES=true`. They are not part of the shipped viewer/admin flows. Because the pages are statically prerendered, that flag must be set at **build** time to reach them via `npm run start` — setting it at request time only works in dev.

## Migrations directory has a dual-numbering history

`supabase/migrations/` contains both legacy `00N_*.sql` files and newer `YYYYMMDDHHMMSS_*.sql` timestamped files (some intentionally duplicated / `placeholder` to reconcile local vs prod history). Add new work as a new timestamped migration. **Do not apply migrations to prod manually** — merging to `main` triggers the Supabase GitHub integration, which applies them and deploys via Vercel. Prod is `seats.megeredchianlaw.com`.

## Ask Planner

`/admin` includes a read-only AI assistant (`AskPlannerDrawer` → `askPlannerAction` → `lib/mapOperationsAgent.ts`). It answers questions and highlights seats but must never mutate data — keep it read-only.
