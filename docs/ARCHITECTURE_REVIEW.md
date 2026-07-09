# Architecture Review — Office Seat Planner

**Date:** 2026-07-08 · **Reviewed at:** `main` (post PR #100, `published_employees` snapshot) · **Phase:** 1 — Discovery (read-only)

This document records how the system *actually works today*, verified by reading the code, and assesses production readiness. It builds on `CLAUDE.md` / `AGENTS.md` rather than restating them: where those docs are confirmed, this says so briefly; where they are wrong or incomplete, that is called out explicitly. The companion document `docs/RISKS.md` holds the prioritized risks and recommendations.

**Method.** Every claim below was verified against source files (cited as `path:line`) unless explicitly marked *inferred* or *unverified*. Scope excluded `node_modules`, `.next`, and generated output. Live-database behavior (RLS in effect, RPC atomicity under load) was **not** re-verified as part of this review — those claims are grounded in migration SQL as written, plus manual verification performed during the PR #99/#100 work noted in the repo history.

---

## 1. What the app is (confirmed)

An internal, authenticated seating map for a single office (Megeredchian Law), deployed on Vercel at `seats.megeredchianlaw.com`. Four user-facing surfaces:

| Route | Audience | Purpose | Source |
|---|---|---|---|
| `/` | Any signed-in user | Read-only **published** map + people finder | `app/page.tsx` |
| `/admin` | Admins | Edit the **draft** map; publish; Ask Planner drawer | `app/admin/page.tsx` |
| `/admin/management` | Admins | Employees, departments, zones directory | `app/admin/management/page.tsx` |
| `/admin/settings` | Admins | CSV import/export, JSON snapshot restore | `app/admin/settings/page.tsx` |

Plus `/login`, `/auth/callback`, `/auth/confirm`, `/auth/update-password` (auth plumbing), and a prototype route `/concepts/component-state-board` that 404s in production unless `SEAT_PLANNER_ENABLE_PROTOTYPES=true` (`app/concepts/component-state-board/page.tsx:10-17`).

**Stack correction (doc drift, first-class finding):** the app runs **Next.js 16.2.10** — `package.json:21` pins `^16.2.10` and `package-lock.json:4962` resolves `16.2.10` — while `README.md:9` and `CLAUDE.md`'s stack line both still say "Next.js 15". React 19, TypeScript 5.7 (strict), Tailwind 3.4, `@supabase/ssr` 0.12, Node ≥ 22 (`package.json:5-7`, `.nvmrc`) are all as documented.

---

## 2. End-to-end request walkthroughs

### 2.1 Viewer loads `/`

1. **Middleware** (`middleware.ts:8-11`) matches everything except static assets and calls `updateSession` (`lib/supabase/middleware.ts:10-41`), which builds a cookie-aware Supabase client and calls `auth.getUser()` to refresh the session cookie. **The middleware never redirects** — it is session-refresh only. If Supabase env vars are missing it silently no-ops (`lib/supabase/middleware.ts:16-18`), which is what lets the backend-free e2e smoke suite boot.
2. **The page itself is the auth gate.** `app/page.tsx` is an async React Server Component with `export const dynamic = "force-dynamic"` and `revalidate = 0` (`app/page.tsx:7-8`) plus `await connection()` to opt out of prerendering. It calls `auth.getUser()` and `redirect("/login?next=/")` when unauthenticated (`app/page.tsx:14-18`).
3. **Data fetch (server-side, RLS-scoped):** seats where `layer = 'published'` (`app/page.tsx:25-29`), the `published_employees` snapshot (`:31-36`), active `department_options` and `zone_options` (`:43`, `:49`). The seat→employee join is stitched **in memory from the snapshot** (`:37-41`); the live `employees` table is never referenced in this file.
4. **Render:** the RSC passes plain arrays into the `"use client"` component `ViewerSeatFinder` (`components/seat-map/ViewerSeatFinder.tsx`, 536 lines), which renders the floor plan via `next/image` (`unoptimized`, fixed 1911×867 asset) and one `SeatMarker` per seat (`ViewerSeatFinder.tsx:342`). All subsequent interactivity (search, filter, highlight) is client-side over the props; there are no client-side Supabase reads on this path.

### 2.2 Admin edits a seat on `/admin`

1. Same middleware pass; `app/admin/page.tsx:14-37` re-checks the user **and** `profiles.role === 'admin'`, rendering an access-denied card otherwise. It fetches draft seats, published seats (read-only diff context), live `employees`, `published_employees` (for the publish review diff), and both option tables (`app/admin/page.tsx:39-74`) — six sequential awaited queries (see RISKS R-08).
2. Data lands in `SeatMap` (`components/seat-map/SeatMap.tsx`, 2,684 lines, `"use client"`), which copies each prop into local state (`localSeats`, `localEmployees`, etc., `SeatMap.tsx:247-252`) so edits can be applied optimistically. Prop→state re-sync happens in dedicated effects (`:337-342`).
3. The admin edits a seat in `SeatInspector`, which calls the server action `updateSeatAction` passing `expectedUpdatedAt: selectedSeat.updated_at` (`components/seat-map/SeatInspector.tsx`).
4. **Server action** (`app/actions.ts:302`): first statement is `requireAdmin()` (`:317`), which re-authenticates via `auth.getUser()` and re-reads `profiles.role` (`app/actions.ts:26-46`). It then invokes the Postgres RPC `update_draft_seat` (`:332`) with the concurrency fence parameter.
5. **Database:** `update_draft_seat` (live definition `supabase/migrations/20260708120000_draft_concurrency_fence.sql:478-711`) re-checks `app_private.is_admin()`, locks the row `FOR UPDATE`, compares `updated_at` against `expected_updated_at` and raises SQLSTATE `MLS02` on mismatch (`:542-547`), enforces double-booking rules (`MLS01`), and writes — one transaction. RLS independently restricts seat writes to admins (`005_policy_advisor_cleanup.sql:48-75`).
6. **Result handling:** the action returns a typed discriminated union rather than throwing for the stale case — `{ ok: false, code: "STALE_DRAFT", message }` — because Next.js digest-strips thrown error messages in production (rationale at `app/actions.ts:297-301`). On success, `revalidatePath` invalidates `/` and `/admin`; the client applies the change to `localSeats` and records an undo/redo snapshot (`lib/draftHistory.ts`). On `STALE_DRAFT`, `SeatMap.handleStaleDraft` (`SeatMap.tsx:953`) shows a dedicated banner, clears history, and `router.refresh()`es.

### 2.3 Admin publishes

1. The publish review dialog diffs `localSeats` vs `localPublishedSeats` **and** live employees vs the `published_employees` snapshot via `buildPublishChangeSummary` (`lib/publishSummary.ts:153`, employee diff at `:125`).
2. `publishSeatMapAction` (`app/actions.ts:767`) → RPC `publish_seat_map` → `app_private.publish_seat_map` (live definition `supabase/migrations/20260708230000_published_employee_snapshot.sql:56-138`, SECURITY DEFINER, `search_path` pinned): re-checks admin, deletes published seats, copies draft→published, **atomically replaces the `published_employees` snapshot from active live employees** (`:108-133`; the `where true` on the delete is load-bearing — Supabase's pg-safeupdate rejects bare DELETEs on API connections), and appends a `publish_events` audit row.

---

## 3. The two-layer model, as implemented (confirms + extends CLAUDE.md)

`CLAUDE.md`'s central claim holds exactly:

- **Seats** are layered by row (`seats.layer` enum, `001_initial_schema.sql:15-19`). Viewer reads only `published` (`app/page.tsx:28`); RLS makes draft rows invisible to non-admins (`005_policy_advisor_cleanup.sql:48-75` — `SELECT` policy is `layer = 'published' or is_admin()`), so even a bug in a viewer query could not leak draft data to a non-admin.
- **Employees** are layered by snapshot, not by row (added 2026-07-08): live `employees` is the admin working set; `published_employees` is replaced wholesale inside the publish transaction and is the only people source for `/`. The snapshot table is select-only under RLS with no write policies at all (`20260708230000:35-54`) — the only writers are the SECURITY DEFINER publish RPC and migrations. Guarded by `tests/published-employee-snapshot.test.mjs`.
- **Zones/departments option tables** are *not* layered — they are shared admin metadata, readable by any authenticated user when `active` (`009_v105_management_csv_cleanup.sql:51-107`). This is intentional (they name filter options, not people data).

**Concurrency layer (not yet in CLAUDE.md's model description):** the shared draft layer is protected by an optimistic-concurrency fence added in `20260708120000_draft_concurrency_fence.sql` — per-seat `expected_updated_at` on update/swap, an exact per-row `(id, updated_at)` map on whole-draft restore (deliberately not an aggregate; rationale in the migration header `:14-19`), SQLSTATE `MLS02`, checked after `FOR UPDATE` locks. The client adds a second, independent guard: undo/redo verify the live draft still value-equals the history entry's adjacent snapshot (`draftStatesEquivalent`, `lib/draftHistory.ts:141`, with a thorough why-comment at `:129-140`). **Not fenced:** `import_assignments_csv`, `publish_seat_map`, and direct seat create/delete (see RISKS R-07).

---

## 4. Security boundary — verified, with two nuances

The three-layer claim in `CLAUDE.md` is real, but the layers are not equally shaped:

1. **Server actions.** All 19 exported actions in `app/actions.ts` call `requireAdmin()` as their first executable statement — verified individually, no exceptions (inventory in RISKS appendix; e.g. `askPlannerAction` deliberately calls it *outside* its try/catch so the gate cannot degrade to a soft error, `app/actions.ts:90-92`). Only type exports accompany the actions; all helpers are non-exported.
2. **Database.** Every table has RLS enabled; **every policy is `to authenticated`** — `anon` has no policy anywhere and is explicitly revoked from RPC EXECUTE and from `published_employees` (`20260708230000:53`). All write policies require `app_private.is_admin()`; every RPC re-checks `is_admin()` as its first statement. Mutation RPCs are SECURITY **INVOKER** with `search_path` pinned (so RLS still applies inside them); only `app_private.publish_seat_map`, `handle_new_user`, and the `is_admin`/`current_user_role` helpers are SECURITY DEFINER, each with pinned `search_path` (`003_function_execute_hardening.sql:26-39`, `20260708230000:59-60`). No unpinned DEFINER functions were found.
3. **Middleware** refreshes the session cookie on every matched request (`lib/supabase/middleware.ts:38`) but — **nuance 1** — performs **no authorization**. Route protection is a per-page `redirect()` block copy-pasted into each protected page (`app/page.tsx:14-18`, `app/admin/page.tsx:14-37`, `app/admin/management/page.tsx:14-37`, `app/admin/settings/page.tsx:15-38`). A future page that forgets the block would render to any authenticated user — RLS would still hide draft data, but the surface would be exposed (RISKS R-05).

**Nuance 2 — a CLAUDE.md claim that is false:** `CLAUDE.md` says `lib/permissions.ts` (`isAdmin`/`assertAdmin`) "is the pure-function version used in components/tests." A repo-wide search finds **zero callers** — the module is referenced only by that CLAUDE.md sentence. `requireAdmin()` re-implements the `role === "admin"` predicate inline (`app/actions.ts:41`). The admin definition therefore lives in one real place, with an unused twin that could silently drift.

**Auth flow:** email/password-primary with magic-link fallback (confirmed — `components/auth/LoginForm.tsx`; note `BASELINE_NOTES.md:8` still describes magic-link-only login and a 60-seat baseline; treat that file as historical). Both callback routes delegate to `completeAuthRedirect` (`lib/supabase/authRedirect.ts:16-47`), which sanitizes the `next` param against open redirects (`safeNextPath` rejects non-`/` and `//` prefixes, `:7-10`) and handles both PKCE `code` exchange and allow-listed `token_hash` OTP verification.

**Secrets:** only `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY` reach the browser (`lib/supabase/client.ts:4-5`). `OPENAI_API_KEY` is read in exactly one server-side location (`lib/mapOperationsAgent.ts:1293`). No service-role key appears anywhere in the repo.

---

## 5. Ask Planner — verified read-only

`askPlannerAction` (`app/actions.ts:89`) → `answerMapOperationsQuestion` (`lib/mapOperationsAgent.ts:1276`), a 1,344-line module that talks to the OpenAI Responses API. Verified properties:

- **No database handle at all** — the module imports only types (`lib/mapOperationsAgent.ts:1`); it operates purely on arrays the action passes in (draft-layer data). It *cannot* mutate.
- The five exposed tools are pure in-memory lookups (`buildReadOnlyTools`, `:833-907`); mutation-style questions hit a structured refusal path (`:1315-1316`, plus a `WRITE_ACTION_PATTERN` pre-filter at `:28`).
- **Model output is not trusted:** `validateAskPlannerResponse` (`:646`) drops any highlight whose `seatId` doesn't exist in the real seat set, overwrites labels with trusted values, caps highlight counts, and normalizes enums. A hallucinated or prompt-injected seat ID cannot drive the UI.
- Bounded execution: 5 tool iterations max, 22s abort timeout, 1,600 output-token cap, question-length cap. Deterministic fast paths answer seat-explain and broad open-seat questions without calling OpenAI at all (`:1286-1289`).
- **Residual exposure (inferred, by design):** employee names/titles and seat notes flow into the prompt, so stored text is a prompt-injection *steering* surface — but the blast radius is limited to wrong/refused answers, since there is no write capability and output is re-validated. No per-user rate limit exists on this billed endpoint (RISKS R-11).

---

## 6. `lib/` — the business core (confirms CLAUDE.md, with gaps)

21 top-level modules, 3,347 lines. Layering is genuinely clean — verified: no `lib/` module imports from `app/` or `components/`, and **no business-logic module imports a Supabase client**; only `lib/supabase/*` touches Supabase. The only intra-lib dependency hub is `seatMath.ts`. This makes the core trivially testable, and mostly it is tested (see §8).

Notable verified mechanics beyond what CLAUDE.md documents:

- `draftConcurrency.ts` passes `updated_at` strings **verbatim, never through `Date`** — re-parsing would drop Postgres microsecond precision and false-trip the fence (comment `lib/draftConcurrency.ts:32-37`).
- `draftHistory.ts` snapshots via `JSON.parse(JSON.stringify(...))` clones, caps history at 20 entries, and compares states with a key-order-independent canonical serializer that strips volatile timestamps (`:90-127`).
- `publishSummary.ts` diffs are O(n) via Maps, key seats by `seat_key || label`, use a 0.0005 coordinate epsilon for "moved", and include the live-vs-snapshot employee diff that makes people edits publishable (`lib/publishSummary.ts:125-153`).
- `csv.ts` is a proper RFC-4180-ish state machine (quoted fields, escaped quotes, embedded newlines, BOM strip) with layered validation (`lib/csv.ts:64-179`). Export escaping does **not** guard formula injection (RISKS R-14).
- `mapLayoutTransform.ts` holds 9 hand-calibrated per-area linear transforms with opaque constants (e.g. `xScale: 0.815189`) and an affinity+distance fallback selector (`lib/mapLayoutTransform.ts:42-155`). It is the **highest-risk untested logic** in the repo: 240 lines with no behavior test, only a source-token guard pinning the constants (RISKS R-06).
- `seatProtection.ts` encodes the "original seats can't be deleted" rule via a **hard-coded per-prefix max-seat-number allowlist** (`lib/seatProtection.ts:5-13`) — it will silently misclassify if the floor plan gains seats.

---

## 7. Component architecture and state management

13 component files, ~8,470 lines; 11 are `"use client"`. All `app/` pages are RSCs — the server/client boundary is exactly "pages fetch, components interact," with no client-side Supabase reads outside auth forms.

**The dominant structural fact is `SeatMap.tsx`: 2,684 lines, ~85 hooks (~40 `useState`), owning all editor state** — the local mirrors of six server props (`SeatMap.tsx:247-252`), undo/redo, publish review, stale-draft handling, selection/modes/drag, filters, and viewport logic — with all four confirm dialogs as inline JSX (e.g. `:2601`, `:2631`) rather than components. `SeatInspector` (1,336 lines) receives ~30 props from it. The optimistic-update contract: mutations run in `startTransition`, on success mutate local state directly and record history — `router.refresh()` happens **only** on stale-draft recovery (`:965`), so the local mirror is the source of truth between server loads.

Other verified facts:

- **One `SeatMarker` serves both surfaces** via a `variant` prop — but the admin map passes `variant="viewer"` (`SeatMap.tsx:2232`), so the `--admin-marker-*` branches in `SeatMarker.tsx:152+` and the matching token block in `app/globals.css:262-318` are dead styling paths.
- **Filter/results logic is duplicated:** admin uses the extracted `FilterPanel`/`ResultsPanel`; the viewer re-implements filtering and a results list inline (`ViewerSeatFinder.tsx:418+`).
- **`SeatMarker` is not memoized**, and per-marker filter matching is recomputed inline in the render loop (`SeatMap.tsx:2197-2237`) — every search keystroke and drag frame re-renders every marker (RISKS R-02b).
- **Design-system reality vs CLAUDE.md:** the token pipeline (`--sp-color-*` in `app/globals.css:5-152` → `tailwind.config.ts:16-78`) exists as documented, but there are **two divergent Button primitives** — the app ships the non-token `components/ui/Button.tsx` (slate/rose palette, `Button.tsx:11-16`) everywhere, while the token-based `design-system.tsx` Button/IconButton is used only by the 404-gated prototype. 67 raw hex values across 6 component files bypass the tokens. This doesn't trip any guardrail (docs permit value changes) but it contradicts the "restyle in one place" framing.
- Accessibility semantics are real and consistent: `role="dialog" aria-modal` with labelled/described-by on every dialog, `role="status"`/`role="alert"` split for notices vs errors, a defined Escape-key precedence ladder (`SeatMap.tsx:491-568`), programmatic focus restoration, shared `focusRingClass`.

---

## 8. Database schema and migrations

Full schema, RPC inventory, RLS policy set, and the dual-numbering reconciliation story are in the migration files; the review verified:

- **34 migration files; 10 are deliberate no-op `select 1;` placeholders** reconciling the Supabase migration ledger with what production already recorded (two events: the legacy `00N_*` → timestamped rename, and PR #32 where the connector applied timestamps before the code merged). Legacy `00N_*` files sort before all `2026*` files, so apply order is correct.
- **Live RPC definitions** (the copy a maintainer must edit): `update_draft_seat` / `swap_draft_seat_assignments` / `restore_draft_snapshot` in `20260708120000_draft_concurrency_fence.sql`; `import_assignments_csv` in `20260616000100` (only copy); the five management RPCs in `20260702100000`; `app_private.publish_seat_map` in `20260708230000`. **`publish_seat_map` has been rewritten across nine files** — stale, plausible-looking full definitions sit in `001` and `010`, and no test pins the live copy (RISKS R-03).
- Integrity: `x`/`y` CHECK-constrained to `[0,1]` in the DB (`001:43-44`) — the "already normalized, don't re-normalize" rule from `BASELINE_NOTES.md` is DB-enforced, not just convention. `assigned ⇔ employee_id` coupling is a CHECK (`001:52-57`); one seat per employee per layer via partial unique indexes (`001:63-69`); unique `(layer, seat_key)` and `(layer, lower(trim(label)))`; a BEFORE DELETE trigger blocks deleting non-custom draft seats at the DB layer (`010:22-41`), mirroring `lib/seatProtection.ts`.
- **Departments and zones are free text** with no FK to their option tables; consistency is maintained only inside the RPCs, with the relational model explicitly deferred ("Phase 3", `20260702100000:15-17`).
- No `supabase/config.toml` and no seed file — seeding lives in migration `002` behind guards, which is part of why there is no documented local-database workflow (RISKS R-12).

---

## 9. Testing architecture (three tiers — one of them partly hollow)

30 test files in three tiers:

1. **Real behavior tests (13)** import the actual `lib/` source via the `importTsModule` pattern (`ts.transpileModule` → data-URL import, e.g. `tests/publish-summary.test.mjs:5-16`). These exercise shipped code and are the backbone of the safety story. The pattern works because the tested modules are self-contained pure functions; it does no type-checking and resolves no imports.
2. **Source-text guardrail tests (11)** read files and assert regexes/orderings — the `*-transaction-safety` suite (asserting on migration SQL text), `accessibility-source`, `bulk-destructive-action-safety-source`, `published-employee-snapshot`, `desktop-seat-marker-system-source`. They are change-detectors, strong at catching a deleted guard clause, weak as correctness proofs (no database ever runs), and brittle to benign refactors — `accessibility-source` pins exact Tailwind class strings and copy text.
3. **E2E (1 spec, 3 tests):** backend-free Playwright smoke — app boots with dummy env, `/login` renders, unauthenticated `/` and `/admin` redirect (`tests/e2e/smoke.spec.ts`). Authenticated flows are explicitly deferred (`playwright.config.ts:5-6`).

**A fourth, problematic category (new finding): 5 tests re-implement the code they claim to test.** `tests/seatMath.test.mjs:4-11`, `tests/validators.test.mjs:4`, `tests/auth-messages.test.mjs:4,28`, `tests/csv-import-export.test.mjs:6`, and `tests/csv-preview.test.mjs:6,10` define private copies of `clamp`/`roundCoordinate`/`normalizeSeatStatus`/`friendlyAuthMessage`/`safeNextPath`/`parseCsvLine`/`validateRow` inline and never import the real modules. They stay green if `lib/seatMath.ts`, `lib/validators.ts`, `lib/authMessages.ts`, or `lib/csv.ts` silently diverge (RISKS R-04).

**What has zero runtime coverage:** all 19 server actions (never imported by any test — only their source text is pattern-matched), all RPCs against a real Postgres (RLS, atomicity, pg-safeupdate behavior — the last of which already caused a live publish failure that SQL-editor repros false-passed), and all React component behavior (no RTL/jsdom dependency exists). This is the single biggest gap (RISKS R-01).

**CI** (`.github/workflows/ci.yml`): two parallel jobs on every PR and push to main — `verify` (npm ci → lint → typecheck → `npm test` → build) and `e2e` (build → Playwright smoke), Node 22, npm cache, report artifact upload. Dependabot runs weekly (grouped minor+patch). Solid for what exists; nothing DB-backed runs anywhere.

---

## 10. Doc-vs-code discrepancy register

| # | Doc claim | Reality | Evidence |
|---|---|---|---|
| D-1 | `README.md:9`, `CLAUDE.md` stack line: "Next.js 15" | Next.js **16.2.10** installed | `package.json:21`, `package-lock.json:4962` |
| D-2 | `CLAUDE.md:39`: `lib/permissions.ts` "used in components/tests" | Zero callers anywhere; dead code | repo-wide grep; only match is the CLAUDE.md sentence itself |
| D-3 | `CLAUDE.md:57` lists `formatName` among modules "covered by matching tests" | No `formatName` test exists; its title-casing edge logic is untested | `tests/` directory listing; `lib/formatName.ts:11-31` |
| D-4 | `CLAUDE.md` design-system section: shared primitives in `components/ui/` restyle the app via tokens | Two divergent Buttons; the shipped one is non-token; 67 raw hex bypasses in 6 files | `components/ui/Button.tsx:11-16`; `design-system.tsx` used only by the gated prototype |
| D-5 | `BASELINE_NOTES.md`: magic-link login, 60-seat baseline, "glass UI" | Historical snapshot; auth is now email/password-primary (`README.md:61`), UI has been redesigned | `components/auth/LoginForm.tsx` |
| D-6 | Migration `011` restores the `public.publish_seat_map` wrapper as SECURITY INVOKER by design | The *last* definition (`012:89-98`) re-declares it SECURITY DEFINER | `012_v111_advanced_drawer_safety.sql:89-98`; not exploitable (inner fn re-checks admin) but contradicts stated intent |
| D-7 | `.env.local.example:4` defaults `OPENAI_MODEL=gpt-5.5` | Matches code default (`lib/mapOperationsAgent.ts:13`) — not drift, but an external-service assumption a new dev must satisfy | — |

Also of note: several tests are hybrids — `map-operations-agent.test.mjs`, `draft-concurrency.test.mjs`, `seat-zones.test.mjs`, and `virtualized-directory.test.mjs` combine real-module behavior tests with source-text asserts on components/actions, so the tier boundary in CLAUDE.md ("two kinds of tests coexist") understates the mixing.

---

## 11. Production readiness assessment

Ratings are honest judgments for *this app's actual context*: a single-office internal tool (~60 seats, ~10 employees, a handful of admins) heading into long-term maintenance with possible new contributors.

| Dimension | Rating | Reasoning |
|---|---|---|
| **Reliability (server/data)** | **Strong** | Atomic RPCs for every multi-row write; DB-level CHECKs, unique indexes, delete-protection trigger; optimistic-concurrency fences with a client adjacency guard; append-only publish audit. The weak spot is *verification*, not design — none of it is exercised by automated tests against a real database. |
| **Security** | **Strong** | Three genuine layers verified end to end (§4). Caveats: route protection is per-page copy-paste with a refresh-only middleware (R-05); no rate limiting on the billed AI endpoint (R-11). |
| **Code organization** | **Good** | `lib/` layering is exemplary (pure, DB-free, no upward imports). `app/actions.ts` as the single mutation surface is a defensible pattern at 776 lines but is a growth concern. |
| **Readability** | **Split** | `lib/` and migrations are unusually well-commented (fence rationale, pg-safeupdate note, timestamp-precision comments). The component tier is the opposite: `SeatMap.tsx` at 2,684 lines/~85 hooks requires holding the whole editor in your head. |
| **Test coverage & CI** | **Lopsided** | Pure logic: well covered. Everything that touches Next.js, React, or Postgres at runtime: **zero** executed coverage — actions, RPCs, RLS, components, authenticated flows. Plus 5 tests that test stale inline copies. CI itself is well-constructed for what exists. |
| **Performance** | **Adequate for scale, with known hotspots** | ~60 seats and small directories make O(n²) searches and full marker re-renders invisible today. The unmemoized marker layer (R-02b) and six sequential admin-page queries (R-08) are the first things to bite if scale or map size grows. `force-dynamic` everywhere is correct for this data-freshness model. |
| **Extensibility** | **Medium** | New seat-level features must thread through SeatMap's state monolith and ~30-prop inspector contract. New data entities are easy (the RPC + lib + test pattern is well-worn). Free-text departments/zones (R-13) tax anything relational. |
| **Consistency** | **Medium** | Server tier is highly consistent (action → RPC → typed result). UI tier has two Buttons, token bypasses, duplicated filter logic, and inline dialogs. |
| **Developer experience** | **Medium-low** | Good: one-command dev/test/lint/typecheck, `.env.local.example`, strict TS, fast pure-logic tests. Bad: **no documented local-database workflow at all** (no config.toml, no CLI instructions, no seed script outside migration 002), manual first-admin SQL, e2e needs undocumented local Chromium setup, stale docs mislead onboarding (D-1..D-5). A new contributor's first day is mostly Supabase archaeology. |
| **Scalability** | **Fit for purpose** | This is a single-tenant internal tool; nothing suggests multi-office ambitions. If that changes, the shared-draft model, snapshot publishing, and free-text taxonomy would all need revisiting — none are blockers today. |

**Deprioritized in this review** (stated per instructions): pixel-level accessibility audit (semantics were characterized, not audited), `docs/` historical notes beyond checking for contradictions, the gated prototype surface, and live-database re-verification of RLS/RPC behavior.

---

## 12. Assumptions and unknowns

- **Assumed:** production data volumes remain at office scale (~60 seats). All performance ratings depend on this.
- **Assumed:** the Supabase GitHub integration and Vercel deploy pipeline work as `README.md:81` describes; not re-verified in this phase.
- **Unverified:** actual RLS behavior under each role against a live database (policies were audited as written in SQL only). Prior manual verification exists for the PR #99/#100 paths but is not automated.
- **Unverified:** `OPENAI_MODEL=gpt-5.5` resolves for the production key.
- **Unknown:** whether the dead `--admin-marker-*` token branches and the prototype design-system Button represent an in-flight design direction (in which case "dead code" findings become "not yet wired") or abandonment. The owner should adjudicate before cleanup.
