---
name: test-tiers
description: How the seat-planner test tiers are wired — the jsdom component-test harness (renderComponent.mjs), the real-browser Playwright SeatMap tier (test:browser), the backend-free e2e smoke suite (test:e2e), the PGlite SQL-execution harness behind rpc-execution, and the c8 coverage wiring. Use when writing, debugging, or extending tests in any of these tiers, when coverage attributes to the wrong files, or when a test fails for harness/boundary-stubbing reasons rather than product logic.
---

# Test tier mechanics

Reference for the three framework-coupled test tiers, plus the SQL-execution harness that runs inside `npm test`. The always-loaded rules (prefer extending a `lib/` helper; the `*-source.test.mjs` guardrail contract) live in `CLAUDE.md` — this file is only the wiring.

## Component tests (jsdom) — `npm run test:ct`

**Component tests** render real client components in jsdom via `tests/helpers/renderComponent.mjs`: it bundles a component with esbuild (resolving `@/` through tsconfig) while swapping the server/framework boundaries — `@/app/actions`, `@/lib/supabase/client`, `next/navigation`, `next/image`, `next/link` — for controllable doubles read from `globalThis.__ct`, then renders with `@testing-library/react`. `login-form` (auth flows, validation, the `safeNextPath` redirect guard) and `seat-inspector` (viewer↔admin isolation, close/collapse/delete callbacks, custom-vs-protected delete) cover their whole components, as do `admin-management-panel` and `data-utilities-panel` (both pin that the destructive-action review dialogs actually GATE the mutations — no server action fires before confirm, blocking CSV issues disable apply, and the MLS02 concurrency fences are captured from the reviewed props). One jsdom gotcha those panel tests exposed: `offsetHeight` is always 0 in jsdom, so any virtualization geometry that divides by a measured row height must treat 0 as "not measured yet" or the window NaNs out. `SeatMap` itself can't be unit-rendered in jsdom — it runs live layout/de-collision measurement that never converges against jsdom's zero-size geometry — so `seat-map-components` covers the renderable pieces it composes (`SeatMarker`, `MapZoomControl`, `FloorSelector`) there. Needs `esbuild`, `jsdom`, and `@testing-library/*` installed.

## Real-browser SeatMap tier — `npm run test:browser`

The **full SeatMap** is instead exercised in a **real browser** by a separate Playwright tier (`npm run test:browser`, `playwright-ct.config.ts`, `tests/browser/`). `tests/browser/build-harness.ts` esbuild-bundles the real SeatMap into a static IIFE harness (the same server/framework boundaries swapped for doubles that call back to Node via `window.__ctCall`), which `seat-map.spec.ts` loads over `file://` — no app server, no Next build — and drives marker→inspector selection, close, and the viewer↔admin edit-affordance gate. The harness ships no Tailwind CSS, so markers aren't laid out for hit-testing: clicks use `dispatchEvent` and assertions are presence-based (`toBeAttached`), targeting SeatMap's composed behavior, not pixel layout. It runs in CI's `e2e` job (Chromium already installed there), separate from `npm test`.

## End-to-end smoke suite — `npm run test:e2e`

A separate **end-to-end tier** lives in `tests/e2e/` (Playwright, config in `playwright.config.ts`). It is a **backend-free smoke suite**: it builds the app, boots it with only *dummy* Supabase env, and asserts the app starts, `/login` renders the sign-in form, and unauthenticated `/` and `/admin` end at `/login` (the redirect streams from the page guards — since #333 the middleware never redirects, it only refreshes cookies on its allowlisted routes). Authenticated flows live in the e2e-auth tier below, which runs in CI.

## Authenticated e2e tier — `npm run test:e2e:auth`

Real sign-in, the admin role gate, a real **publish**, and the persistent-shell
**nav regression** (`nav-shell.spec.ts`: zero full-document requests across all
four rail sections, the rail stays ONE mounted DOM node, the expanded drawer
closes on navigation — the #333 blank-flash bug, pinned end to end), driven
against a disposable local Supabase stack (`npm run db:start` →
`supabase start`, Docker). Config `playwright-auth.config.ts`, specs in
`tests/e2e-auth/`. Credentials are seeded by `supabase/seed.sql` and are
local-only. Because the stack dies with `npm run db:stop`, these specs are free
to mutate seats and publish for real — coverage the hosted-production setup
could never safely have. Two nav-shell-specific notes: the spec's hamburger
expand doubles as its hydration gate (a pre-hydration click on a rail `<Link>`
navigates natively as a full document — a harness artifact that would fail the
zero-documents assertion for the wrong reason), and its section probes are the
pages' zero-height skip-link markers, so they use `state: "attached"`, never
visibility.

Three traps, each of which costs an hour if rediscovered:

- **The config BUILDS the app, it does not just start it.** `NEXT_PUBLIC_*` is
  inlined at *build* time, so a build made from `.env.local` ships a browser
  bundle pointed at **production** no matter what env `npm run start` is given.
  Symptom: sign-in silently fails and the page stays on `/login`.
- **Hand-seeded `auth.users` rows need `''`, not NULL, in the token columns**
  (`confirmation_token`, `recovery_token`, `email_change*`, `phone_change*`,
  `reauthentication_token`). GoTrue scans them into non-nullable Go strings, so
  NULL yields a 500 "Database error querying schema" that names the schema and
  never the row. The app renders it as an empty `{}` alert.
- **Prefer `supabase start` over `supabase db reset`.** A reset restarts the
  containers with new IPs while Kong keeps the old ones cached, so the auth
  endpoint 502s and it reads as a broken login. If you do reset, restart the
  auth and kong containers afterwards.

**`[db.seed] enabled = false` in `supabase/config.toml` is deliberate — do not
flip it back.** Adding that config.toml made the Supabase GitHub integration
create a hosted **preview branch per PR**, and preview branches run `seed.sql`.
That put accounts whose password is committed in plain text onto an
internet-reachable database (found on PR #251; branch deleted). Seeding is now
explicit — `scripts/seed-local-db.mjs`, run by `tests/e2e-auth/global-setup.ts`
or `npm run db:seed` — and goes through `docker exec` into the local container,
so it has no connection string and cannot address a hosted project even by
mistake. Keep that property when editing it.

`supabase/seed.sql` also replicates the hosted platform's bootstrap grants
(`grant all on all tables in schema public to anon, authenticated,
service_role`). The migrations never declare these — production only works
because Supabase Cloud sets them at project-creation time. Without them every
viewer query 403s locally and the map renders Next's generic server-error page.

## SQL-execution harness — `tests/rpc-execution.test.mjs`

Unlike the three tiers above, this one runs inside `npm test`. `tests/helpers/pgHarness.mjs` stubs what PGlite doesn't have: Supabase's `auth` schema, `auth.uid()`, and the `anon`/`authenticated` roles. The RPCs' own `app_private.is_admin()` gate is then exercised by switching `app.current_user_id` between an admin and a viewer. What the tier covers and why it exists stays in `CLAUDE.md`.

## Coverage wiring — `npm run coverage`

c8 emits a text summary plus HTML in `coverage/`. Coverage is measured against the real `lib/*.ts` rather than transpiled temp modules: the behavior tests load source through `tests/helpers/tsModuleLoader.mjs`, which emits **inline source maps**, and c8 runs with **`exclude-after-remap`** so it attributes coverage back to the source files. That pairing is load-bearing — drop either half and `lib/**` reads as uncovered.

Scope is `lib/**`, the tested business core, with **`all: true`** in `.c8rc.json`: a lib module no test ever imports now reads 0% and drags the floors down, instead of silently vanishing from the report (which is what `all: false` used to allow). The only exclusions are explicit in `.c8rc.json` — `lib/types.ts` (type-only) and `lib/supabase/{client,server}.ts` (thin `createBrowserClient`/`next/headers` factory glue; exercised for real by the e2e-auth tier). Everything else in `lib/`, including the framework-coupled server modules (`serverAuth`, `adminPageGuard`, `lib/supabase/middleware.ts`, `authRedirect`, `cookieOptions`), has a behavior suite: `tests/helpers/tsModuleLoader.mjs` accepts a `stubs` option that swaps boundary imports ("react", "next/server", "@/lib/supabase/server", ...) for controllable doubles — the node-tier analogue of renderComponent.mjs's bundle-time swaps — plus `fresh: true` for a new module instance when module-scope state (e.g. the middleware's JWKS memo) must reset between tests. `npm run coverage:check` enforces the floors (lines 90 / funcs 95 / branches 80) and CI runs it on every PR.
