# Risks & Recommendations — Office Seat Planner

**Date:** 2026-07-08 · **Companion to:** `docs/audits/2026-07-09-architecture-review.md` (which holds the verified system description this document assumes)

Findings are ordered by impact. Every finding cites at least one concrete location. "Effort" is a rough engineering estimate assuming familiarity with the codebase. Context matters for calibration: this is an internal, admin-gated tool at office scale — several items that would be High in a public SaaS are Medium here, and that is stated where it applies.

---

## Part 1 — Prioritized risks

### Summary table

| ID | Finding | Impact | Effort |
|----|---------|--------|--------|
| R-01 | Zero runtime coverage of the entire mutation path (actions, RPCs, RLS, authenticated flows) | High | Large |
| R-02 | `SeatMap.tsx` god component (2,684 lines, ~85 hooks) + unmemoized marker layer | High | Large (incremental) |
| R-03 | `publish_seat_map` definition drift risk across nine migration files, unpinned by tests | High | Small |
| R-04 | Five tests assert on stale inline copies of lib code, not the shipped modules | High | Small |
| R-05 | Route protection is per-page copy-paste; middleware never authorizes | Medium-High | Small |
| R-06 | `lib/mapLayoutTransform.ts`: 240 lines of calibration math with no behavior test | Medium | Small-Medium |
| R-07 | Unfenced concurrent-write paths: CSV import, publish, seat create/delete | Medium | Medium |
| R-08 | No `error.tsx`/`loading.tsx` anywhere; admin page runs 6 sequential awaited queries | Medium | Small |
| R-09 | Documentation drift (Next 15→16, dead `permissions.ts` claim, phantom `formatName` test, stale `BASELINE_NOTES.md`) | Medium | Small |
| R-10 | Dead code: `lib/permissions.ts`, token-based Button, `--admin-marker-*` branches | Medium | Small |
| R-11 | No rate limiting on the OpenAI-billed `askPlannerAction` | Medium | Small |
| R-12 | No documented local-database workflow; onboarding requires Supabase archaeology | Medium | Small-Medium |
| R-13 | Departments/zones are free text with no FK to their option tables | Medium | Medium-Large |
| R-14 | CSV export lacks formula-injection guarding | Low-Medium | Small |
| R-15 | Brittle source-guardrail tests pin styling and copy, causing false failures on benign change | Low-Medium | Medium |
| R-16 | Assorted UI-tier duplication and hygiene (two Buttons, duplicated filter logic, inline dialogs, hex bypasses, UUID leak in publish review) | Low | Medium (bundled) |
| R-17 | `tools/seat-planner-improvement-loop` is ~7 weeks stale with an untracked leftover artifact | Low | Trivial |

### Details

**R-01 — The mutation path has zero executed test coverage. (High / Large)**
No test imports `app/actions.ts` as a module — all 19 server actions are verified only by regex over their source text (e.g. `tests/csv-import-transaction-safety.test.mjs:9` reads the file as a string). The `*-transaction-safety` suite asserts on migration SQL *text*, never a running Postgres, so RLS, SECURITY DEFINER/INVOKER semantics, and actual atomicity are unverified by automation. The Playwright tier is deliberately backend-free (`playwright.config.ts:4-6`); no React component is ever rendered by a test (no RTL/jsdom dependency in `package.json`). **Why it matters — this failure mode has already occurred:** the `pg-safeupdate` incident (publish RPC failing on the API path while SQL-editor repros passed; documented at `supabase/migrations/20260708230000_published_employee_snapshot.sql:105-107`) is exactly the class of bug that only a real-database test catches, and it reached a preview deploy before being found by manual browser QA. Publish, restore, import, and the concurrency fences are currently protected by string-matching and human diligence.

**R-02 — `SeatMap.tsx` is a 2,684-line god component; the marker layer re-renders wholesale. (High / Large, but incremental)**
(a) *Maintainability:* `components/seat-map/SeatMap.tsx` holds ~85 hooks (~40 `useState` at `:246-293`), six local mirrors of server props, undo/redo, publish review, stale-draft recovery, drag, filters, viewport logic, and four confirm dialogs as inline JSX (`:2601`, `:2631`). `SeatInspector.tsx` (1,336 lines) receives ~30 props from it (`:2542-2599`). Every seat-editor feature change lands in this file; the concurrency-correctness contract (prop→local re-sync at `:337-342` + `handleStaleDraft` at `:953`) is spread across it. New-contributor ramp-up on the editor means reading 4,000+ lines. (b) *Performance:* `SeatMarker` is not wrapped in `React.memo`, and `matchesFilters(seat)` is recomputed per marker inline in the render loop (`SeatMap.tsx:2197-2237`) — every search keystroke and drag frame re-renders all markers. Invisible at 60 seats; the first thing to bite if the map grows.

**R-03 — `publish_seat_map` drift risk: nine rewrites, stale plausible copies, no test pin. (High / Small)**
The publish RPC body has been redefined in `001`, `006`, `007`, `009`, `010`, `011`, `012`, `20260521000100`, and `20260708230000`. A maintainer opening `001_initial_schema.sql:145-182` or `010_v107_seat_protection.sql:43-84` sees a complete, plausible definition that is **stale** (no employee snapshot, no audit logging). Unlike `update_draft_seat`/`restore_draft_snapshot` (pinned to their live file by `tests/update-seat-transaction-safety.test.mjs:9` and `tests/restore-draft-snapshot-transaction-safety.test.mjs:9`), **no transaction-safety test reads the live publish definition** — `tests/published-employee-snapshot.test.mjs` covers the snapshot-replace ordering but a future migration that recreates the function without the snapshot logic would only fail *that* test if it also deleted the old file's text, which it wouldn't. Also: the `public.publish_seat_map` wrapper's last definition is SECURITY DEFINER (`012_v111_advanced_drawer_safety.sql:89-98`) although migration `011` deliberately reverted it to INVOKER — not exploitable (the inner `app_private` function re-checks admin), but it contradicts stated intent and will confuse the next security reviewer. `swap_draft_seat_assignments` similarly has no dedicated pin.

**R-04 — Five tests verify stale inline copies, not shipped code. (High / Small)**
`tests/seatMath.test.mjs:4-11`, `tests/validators.test.mjs:4`, `tests/auth-messages.test.mjs:4,28`, `tests/csv-import-export.test.mjs:6`, and `tests/csv-preview.test.mjs:6,10` re-implement `clamp`, `roundCoordinate`, `normalizeSeatStatus`, `friendlyAuthMessage`, `safeNextPath`, `parseCsvLine`, and `validateRow` inside the test file and never import `lib/seatMath.ts` / `lib/validators.ts` / `lib/authMessages.ts` / `lib/csv.ts`. The 13 healthy behavior tests prove the `importTsModule` pattern works for exactly these kinds of modules (e.g. `tests/publish-summary.test.mjs:5-16`), so this is pure drift debt: the real modules can change behavior — including the open-redirect guard `safeNextPath` — while the suite stays green. This converts apparent coverage into false confidence on security-adjacent code.

**R-05 — Route protection is copy-paste per page; a forgotten guard ships an open page. (Medium-High / Small)**
`proxy.ts` (the root file, `middleware.ts` before the Next 16 rename) only refreshes the session (`lib/supabase/middleware.ts:38`) — it never redirects. The auth+role guard block is duplicated near-identically across `app/admin/page.tsx:14-37`, `app/admin/management/page.tsx:14-37`, and `app/admin/settings/page.tsx:15-38` (viewer variant at `app/page.tsx:14-18`). A new admin page whose author forgets the block renders for **any authenticated viewer**; RLS would still hide draft seat rows, but server-action results, layout, live-employee data fetched by the page itself, and any future non-RLS-protected content would be exposed. Three copies also means a fix to the guard (e.g. adding an audit log or a role change) must be applied three times. Downgraded from High only because RLS provides real depth behind it.

**R-06 — The coordinate calibration transform is the largest untested pure-logic surface. (Medium / Small-Medium)**
`lib/mapLayoutTransform.ts` (240 lines) maps saved↔visual coordinates through 9 hand-calibrated areas with opaque constants (`:42-115`) and an affinity-then-distance fallback selector (`:138-155`); two areas (`center-west`, `southeast-office`) have near-overlapping bounds making selection order-sensitive (`:68-82`, `:100-114`). Its only guard is a source-token test asserting the constants' text is unchanged (`tests/desktop-seat-marker-system-source.test.mjs:27-33`) — nothing verifies round-trip correctness (`applyTransform` ∘ `applyInverseTransform` ≈ identity) or that each calibration area is selected for points inside it. A subtle regression here silently renders every seat in the wrong place, which for a seating map is a total-failure mode that no current test can catch.

**R-07 — Concurrency fence has known uncovered write paths. (Medium / Medium)**
The MLS02 fence (see review §3) covers seat update, swap, and whole-draft restore. Not covered: **`import_assignments_csv`** takes no fence parameter (`supabase/migrations/20260616000100_import_assignments_csv_rpc.sql:8`) — a CSV import can silently clobber another admin's concurrent edits, and it is precisely the bulk path where clobbering hurts most; **`publish_seat_map`** publishes whatever the draft is at commit time, with no check that it matches what the admin reviewed in the dialog; **seat create/delete** go through plain table writes (`app/actions.ts:251`, `:614-622`), unfenced. The restore fence also cannot block a concurrent brand-new-seat INSERT (acknowledged trade-off, `20260708120000_draft_concurrency_fence.sql:30-35`). With very few concurrent admins, the residual risk is low-probability — but the failure is silent data loss, and users now *expect* the fence to protect them, which makes the uncovered paths more surprising than they were before PR #99.

**R-08 — No error/loading boundaries; serialized admin data fetching. (Medium / Small)**
There is no `error.tsx`, `loading.tsx`, `not-found.tsx`, or `global-error.tsx` anywhere under `app/` (verified by glob). Each page throws raw `Error` on a failed query (`app/page.tsx:56`, `app/admin/page.tsx:77`), landing users on Next's default framework error screen with no recovery path — for an internal tool, a transient Supabase blip becomes a support call. Separately, `app/admin/page.tsx:39-74` awaits six queries **sequentially**; `Promise.all` would cut admin TTFB roughly to the slowest single query. Same pattern on the other admin pages.

**R-09 — Documentation drift misleads both humans and AI contributors. (Medium / Small)**
Register in review §10: README/CLAUDE.md say Next.js 15 while 16.2.10 is installed (`package.json:21`); `CLAUDE.md:39` claims `lib/permissions.ts` is "used in components/tests" (zero callers); `CLAUDE.md:57` lists `formatName` as test-covered (no test exists); `BASELINE_NOTES.md` describes a superseded auth model and UI. This repo explicitly onboards contributors through these files (`CLAUDE.md`, `AGENTS.md` are the entry points), so drift here propagates errors into every future change — including by coding agents that treat the docs as ground truth.

**R-10 — Dead code creates false trails. (Medium / Small)**
(a) `lib/permissions.ts` — both exports unused anywhere; the real predicate is re-implemented inline in `requireAdmin()` (`app/actions.ts:41`), so the "shared" admin definition can silently diverge. (b) The token-based `Button`/`IconButton` in `components/ui/design-system.tsx` are consumed only by the 404-gated prototype, while the whole app uses the divergent non-token `components/ui/Button.tsx`. (c) The `--admin-marker-*` token branches in `SeatMarker.tsx:152+` and `app/globals.css:262-318` are unreachable because the admin map passes `variant="viewer"` (`SeatMap.tsx:2232`). Each is a trap: a maintainer "fixing" the admin marker tokens or extending `permissions.ts` changes nothing and wastes a cycle. Note review §12: confirm with the owner these aren't in-flight design direction before deleting.

**R-11 — `askPlannerAction` has no rate limit on a billed external API. (Medium / Small)**
The action is admin-gated (`app/actions.ts:92`) with per-request caps (question length `lib/mapOperationsAgent.ts:1281`, 5 tool iterations `:1312`, 22s timeout), but nothing limits request *frequency* per user or globally. A stuck client loop, a pasted script, or a compromised admin session can run unbounded OpenAI spend. Low likelihood given the audience; unbounded cost given the gap.

**R-12 — Onboarding requires undocumented Supabase archaeology. (Medium / Small-Medium)**
There is no `supabase/config.toml`, no seed script outside migration `002`, and no README mention of `supabase start`/`db reset` or *any* way to apply the 34 migrations to a fresh project (README covers env vars and first-admin SQL only, `README.md:69-81`). The e2e suite additionally expects a prebuilt Chromium via `PW_CHROMIUM_PATH` locally (`playwright.config.ts:27-32`) — unstated. A new contributor cannot get a working local stack from the docs alone; today the effective workflow is "point at a shared/preview Supabase project," which is nowhere written down.

**R-13 — Free-text taxonomy: departments/zones have no FK to their option tables. (Medium / Medium-Large)**
`employees.department` and `seats.zone` are plain text; consistency with `department_options`/`zone_options` is maintained only inside the management RPCs (case-insensitive matching, orphan registration), with the relational model explicitly deferred to "Phase 3" (`supabase/migrations/20260702100000_department_integrity_normalization.sql:15-17`). Any write path that bypasses the RPCs — a future action, a manual data fix, an import edge case — can desynchronize the taxonomy, and the failure surfaces as confusing filter/roster behavior rather than an error. The migration's own comments show this is a known, deliberately-staged debt; it should stay on the roadmap rather than fade.

**R-14 — CSV export lacks formula-injection guarding. (Low-Medium / Small)**
`escapeCsvCell` (`lib/csv.ts:184`) quotes cells containing `",\n\r` but does not prefix cells starting with `=`, `+`, `-`, or `@`. An employee name or seat note beginning with `=` lands executable in Excel/Sheets when an admin opens the export. Mitigated by the tight authorship circle (only admins create the data) — but names are imported from CSVs too, so the loop can close without malice.

**R-15 — Source-guardrail tests over-pin implementation detail. (Low-Medium / Medium)**
`tests/accessibility-source.test.mjs` pins exact Tailwind class strings, z-index literals (`:93`), and full copy strings (`:160`, `:217`); `tests/bulk-destructive-action-safety-source.test.mjs:56` extracts functions by *declaration order* between named boundaries, so reordering two functions breaks the extractor. The invariants guarded (dialog semantics, confirm-before-destroy) are real and worth keeping — but the anchoring means benign refactors produce false failures, which trains contributors to "fix the test to match," eroding the guardrails' authority over time. (`desktop-seat-marker-system-source.test.mjs` is the model to follow: it scopes itself to numeric contracts and boundary-crossing checks, `:5-9`.)

**R-16 — UI-tier duplication and hygiene (bundled). (Low / Medium)**
Two Button primitives (R-10b); viewer re-implements filter/results inline (`ViewerSeatFinder.tsx:418+`) instead of sharing `FilterPanel`/`ResultsPanel`; four dialogs are hand-rolled inline JSX with duplicated overlay/aria scaffolding (`SeatMap.tsx:2601`, `:2631`); 67 raw hex values across 6 component files bypass the token system (`design-system.tsx` alone has 28, including all marker state recipes at `:212-228`); `publishSummary` can surface a raw UUID as `Employee ${id}` in the review dialog when a join is missing (`lib/publishSummary.ts:52`); the `seat.zone ?? seat.department` fallback is duplicated across 7 lib modules (e.g. `lib/publishSummary.ts:47`, `lib/viewerSeatSearch.ts:66`); viewer search is O(people×seats) (`lib/viewerSeatSearch.ts:87`) — harmless at this scale, noted for the record.

**R-17 — Stale QA tooling. (Low / Trivial)**
`tools/seat-planner-improvement-loop/` is versioned "1.2.4" with seed-only findings; the on-disk `output/codex_handoff.md` was generated 2026-05-22 at a commit ~7 weeks behind HEAD and is an untracked leftover (the output dir is gitignored except `.gitkeep`). Harmless but confusing — a reader can't tell whether the loop is an active process or a relic.

---

## Part 2 — Recommendations

Each recommendation states current approach → why improve → proposed alternative → benefit → complexity → migration risk. Grouped by horizon; ordering/dependency notes at the end.

### Quick wins (hours each; no behavior change)

**Q1. Re-point the five inline-copy tests at the real modules.** *(fixes R-04)*
Current: tests define private copies. Proposed: use the existing `importTsModule` helper (as 13 tests already do) to import `lib/seatMath.ts`, `lib/validators.ts`, `lib/authMessages.ts`, `lib/csv.ts`; keep the same assertions. Benefit: coverage becomes real, including `safeNextPath`'s open-redirect guard. Complexity: trivial — the pattern and helper exist. Risk: a test may *fail* after the switch, revealing genuine drift; that's the point — fix the divergence, don't loosen the test.

**Q2. Pin `publish_seat_map` (and `swap_draft_seat_assignments`) to their live migration files with a transaction-safety test.** *(fixes the unpinned half of R-03)*
Current: no test reads `20260708230000`'s publish body as *the* publish definition. Proposed: a `publish-transaction-safety.test.mjs` mirroring the existing suite — assert the live file defines `app_private.publish_seat_map` with the admin check, the delete→copy→snapshot→audit ordering, and `security definer` + pinned `search_path`; add a comment in each stale copy (`001`, `010`) pointing at the live file. Benefit: editing a stale copy fails CI immediately. Complexity: trivial (copy an existing test's shape). Risk: none.

**Q3. Fix the documentation drift register.** *(fixes R-09; touches CLAUDE.md/README.md, which Phase 1 could not)*
Update "Next.js 15"→16 in `README.md:9` and CLAUDE.md; delete or rewrite the `lib/permissions.ts` sentence at `CLAUDE.md:39` per the Q6 decision; remove `formatName` from the covered-modules list at `CLAUDE.md:57` (or add the test — 15 minutes, kills two findings); mark `BASELINE_NOTES.md` as historical with a one-line header. Benefit: the onboarding docs stop lying; AI contributors stop inheriting the errors. Complexity: trivial. Risk: none.

**Q4. Add `error.tsx` (root + `/admin`) and `loading.tsx`; parallelize page queries with `Promise.all`.** *(fixes R-08)*
Current: default framework error screen; serialized fetches. Proposed: a small branded error boundary with a retry button; `Promise.all` the six admin queries (they're independent). Benefit: graceful degradation on Supabase blips; faster admin loads. Complexity: small. Risk: minimal — verify the error boundary doesn't swallow the `redirect()` control flow (redirects throw; Next handles them above error boundaries, but test it).

**Q5. Add formula-injection guarding to CSV export.** *(fixes R-14)*
Current: `escapeCsvCell` (`lib/csv.ts:184`) handles quoting only. Proposed: prefix cells matching `/^[=+\-@\t\r]/` with `'` (the OWASP-recommended approach), and extend `tests/csv-import-export.test.mjs` (after Q1 makes it real). Benefit: closes a classic export vuln. Complexity: trivial. Risk: a leading apostrophe appears if such a cell is re-imported round-trip — strip it on import, and note it in the test.

**Q6. Adjudicate and remove dead code.** *(fixes R-10; needs one owner decision)*
Current: three false trails. Proposed: either wire `requireAdmin()` through `lib/permissions.ts.isAdmin` (one-line change, restores the documented design) or delete the module; delete the prototype-only Button path from `design-system.tsx` or promote it (see M3); remove the unreachable `--admin-marker-*` branches or switch the admin map to `variant="admin"` if that was the intent. Benefit: the code stops pointing maintainers at machinery that does nothing. Complexity: small. Risk: only that a branch was in-flight design work — hence the owner check first.

**Q7. Add a simple rate limit to `askPlannerAction`.** *(fixes R-11)*
Current: unbounded frequency. Proposed: a small in-memory token bucket per user id inside the action (e.g. 10 requests/min) — no infrastructure needed at this scale; return the existing `{error}` shape when throttled. Benefit: caps worst-case OpenAI spend. Complexity: small (note: per-instance memory on Vercel means the limit is per-lambda, i.e. approximate — acceptable for a cost guard; a Postgres-based counter is the exact alternative). Risk: none meaningful.

### Medium-term (days each)

**M1. Centralize page-level auth into shared loaders.** *(fixes R-05)*
Current: guard block copy-pasted into four pages. Proposed: `lib/auth/requireUserPage()` and `requireAdminPage()` helpers (returning `{ user, supabase }` or performing the redirect), used by every page; optionally add a defense-in-depth middleware redirect for `/admin/*` paths without making middleware the primary gate. Benefit: a new page gets protection by calling one function; guard changes happen once. Complexity: small-medium (four call sites + a helper + tests). Risk: minimal; keep per-page rendering of the access-denied card as-is.

**M2. Give `mapLayoutTransform` a behavior test.** *(fixes R-06)*
Current: constants pinned by string match only. Proposed: property-style tests via `importTsModule`: round-trip identity within epsilon for sample points in every calibration area; area-selection stability for the two overlapping areas; fallback selection for out-of-area points. Benefit: the "every seat renders in the wrong place" failure mode becomes catchable. Complexity: small-medium (choosing good fixture points requires care — derive them from the existing bounds). Risk: none; do not change the constants themselves.

**M3. Consolidate the UI primitives: one Button, one Dialog.** *(fixes R-16's core, halves R-15 exposure)*
Current: two Buttons (non-token one ships), four hand-rolled dialogs, duplicated overlay/aria scaffolding. Proposed: converge on a single tokenized `Button` (port the shipped variants' semantics into token values — visual output can stay identical); extract a `ConfirmDialog`/`Overlay` primitive carrying the `role="dialog" aria-modal` + focus scaffolding; migrate the four SeatMap dialogs onto it one at a time. Benefit: the design-token promise in CLAUDE.md becomes true; dialog a11y is enforced by construction rather than by regex; `accessibility-source` can then pin the primitive once instead of every instance. Complexity: medium. Risk: `accessibility-source` and other guardrail tests will trip on the refactor — per CLAUDE.md's own scope note, update the anchors to the new primitive *without* weakening the invariant asserted; visual QA the four dialogs.

**M4. Begin decomposing `SeatMap.tsx` — extraction only, no behavior change.** *(starts R-02a)*
Current: 2,684-line monolith. Proposed order (dependency-light first): (1) the four inline dialogs → components (unblocked by M3); (2) publish-review state+dialog → `usePublishReview` hook + component; (3) draft-history/undo-redo + stale-draft recovery → `useDraftHistory` hook (this isolates the concurrency contract — `historyAdjacencyBroken`, `handleStaleDraft` — into one testable unit); (4) filters/search state → `useSeatFilters`. Do **not** attempt a full rewrite; each step ships separately and must leave `tests/draft-concurrency.test.mjs` and `accessibility-source` green (updating anchors as in M3). Benefit: each extraction shrinks the blast radius of every future editor change; step 3 makes the concurrency guard unit-testable. Complexity: medium per step. Risk: the local-mirror/optimistic-update contract is subtle — extract state *with* its effects, never split a mirror from its re-sync effect; the source-guardrail tests act as a tripwire.

**M5. Memoize the marker layer.** *(fixes R-02b)*
Current: all markers re-render per keystroke/drag frame. Proposed: wrap `SeatMarker` in `React.memo`, precompute the filter-match set once per render (`useMemo` on `matchingSeats` already exists — pass membership down as a boolean), and ensure callback props are stable (`useCallback`). Benefit: render cost proportional to changed markers. Complexity: small-medium (auditing prop stability is the real work). Risk: memoization bugs show as stale visuals — manual QA the drag/swap/highlight paths; cheap to revert.

**M6. Document the local development database story.** *(fixes R-12)*
Current: none. Proposed: add `supabase/config.toml` + a README section: `supabase start` → `supabase db reset` (runs all 34 migrations including seed `002`) → first-admin SQL → optional `PW_CHROMIUM_PATH` note for e2e. Benefit: a new contributor reaches a working stack from docs alone; also the prerequisite for L1's CI database. Complexity: small-medium (verify the migration chain actually replays clean on an empty local stack — the `seed-migration-replay` test suggests it does, but prove it). Risk: none to production; local-only.

### Larger initiatives (weeks; sequenced)

**L1. Stand up a real-database integration test tier.** *(fixes R-01, the top finding)*
Current: string-matching stands in for runtime verification. Proposed, in increasing order of value and cost: (a) **RPC/RLS integration tests** against a local Supabase (from M6) or an ephemeral CI database: apply all migrations, then exercise each RPC as `authenticated` non-admin (expect refusal), as admin (expect effect), fence violations (expect MLS02), publish atomicity, and pg-safeupdate behavior on the API path via PostgREST rather than raw SQL — the false-pass trap is documented in the migrations; (b) **authenticated Playwright flows** on a seeded test project (login → edit seat → publish → viewer sees change; CSV import round-trip; restore), which the Playwright config already anticipates as a follow-up (`playwright.config.ts:5-6`); (c) then *demote* the transaction-safety string tests to their remaining useful role (pinning which file is live, per Q2). Benefit: the app's strongest engineering (the RPC/RLS/fence design) finally gets verification matching its sophistication; regressions like the pg-safeupdate incident get caught in CI, not on previews. Complexity: large (CI Supabase provisioning, seed fixtures, auth in Playwright). Migration risk: none to prod — purely additive; main cost is CI time (~minutes/run).

**L2. Relational departments/zones (the deferred "Phase 3").** *(fixes R-13)*
Current: free text + RPC-maintained consistency. Proposed: add `department_id`/`zone_id` FK columns alongside the text columns, backfill in a migration, dual-write in the RPCs, flip reads, then drop the text columns across two or three releases. Benefit: taxonomy integrity enforced by the database; rename becomes an UPDATE of one row. Complexity: large (touches RPCs, CSV import/export, publish snapshot, publish diff, filters). Migration risk: **highest of any recommendation** — staged rollout with the dual-numbering-aware migration discipline this repo already practices; requires L1's integration tests first to be done safely. Only worth scheduling if taxonomy pain is actually felt; otherwise leave as recorded debt.

**L3. Extend the concurrency fence to CSV import (and optionally publish).** *(fixes R-07)*
Current: import/publish unfenced. Proposed: add `expected_draft_seats jsonb default null` to `import_assignments_csv` mirroring the restore fence (the pattern, client plumbing, and error handling all exist — `DataUtilitiesPanel` already threads expectations for restore); for publish, pass the reviewed draft's expectation map into `publish_seat_map` so the publish fails with MLS02 if the draft changed after the review dialog opened. Benefit: closes the silent-clobber window on the bulk path where it hurts most, and makes "what you reviewed is what you published" a guarantee instead of a likelihood. Complexity: medium (new migration + action + client threading + tests, all following the 20260708120000 template). Migration risk: low — `default null` keeps old clients working, the proven deploy-skew pattern.

### Ordering and dependencies

1. **Q1–Q7 first** — independent of each other, all shippable this week; Q6 needs one owner decision.
2. **M6 → L1**: the local database story is the foundation for the integration tier. This pair addresses the #1 finding and should anchor Phase 2.
3. **M3 → M4**: dialog primitive before SeatMap dialog extraction avoids extracting four copies of the scaffolding.
4. **M1, M2, M5** are independent; slot anywhere.
5. **L1 → L3 → L2**: integration tests make fence extension safe to verify, and are a hard prerequisite for the taxonomy migration.
6. R-15 (guardrail brittleness) is deliberately folded into M3/M4 — re-anchor tests as the primitives consolidate rather than as a standalone rewrite.

---

## Three highest-impact findings (summary)

1. **R-01 — the entire runtime mutation path is unverified by automation.** The DB design is the best-engineered part of the system and the least-tested; the pg-safeupdate incident proves the failure mode is real. Fix foundation: M6 + L1.
2. **R-02 — `SeatMap.tsx`** concentrates 2,684 lines, ~85 hooks, the concurrency contract, and a wholesale re-render hotspot in one file; every editor change pays its tax. Fix: M3 → M4 + M5, incrementally.
3. **R-03/R-04 — the safety net has holes shaped like its own methodology:** the most-rewritten RPC (`publish_seat_map`) is the one no test pins, and five tests assert on stale copies of shipped code. Fix: Q1 + Q2, in hours.

---

## Appendix — known-and-accepted, rescued from retired docs (2026-07-22)

These are **recorded, not prioritized**: each was the only surviving copy of a fact
in a doc deleted during the 2026-07-22 `docs/` sweep. They sit outside the R-NN
taxonomy deliberately — none is new work, and several are decisions *not* to act.

**A-1 · Server-action errors are digest-stripped in production.** Every remaining
`throw new Error(rpcMessage)` in `app/actions.ts` (`createEmployeeAction`,
`updateEmployeeAction`, `createDepartmentAction`, `deleteEmployeeAction`) is
replaced by Next.js with the generic "Server Components render … digest" string
once deployed, so the RPC's carefully-worded message never reaches the admin.
Only `updateSeatAction` / `swapSeatAssignmentsAction` / the restore path return
discriminated results instead of throwing. **Diagnostic signature:** a red banner
mentioning "a digest property is included". Formerly
`docs/crash-fix-double-booking-assignment.md` §8.

**A-2 · Two option-upserts are deliberately non-atomic.** `createEmployeeAction`,
`updateEmployeeAction` and `createSeatAction` each `await upsertDepartmentOption(…)`
(or the zone equivalent) and *then* issue a separate main write — two statements,
no transaction — so a failure between them leaves an orphan
`department_options` / `zone_options` row. Low risk (additive, self-healing) and
knowingly left out of the RPC conversion. `createDepartmentAction` and
`createZoneAction` are single-table upserts and **intentionally do not need RPC
treatment**. This is an *atomicity* gap; R-07 covers the separate *concurrency*
gaps. Formerly `docs/transaction-safety-rollout.md`.

**A-3 · Two Supabase advisor warnings are open by decision, not oversight.**
(1) *Leaked-password protection disabled* — Supabase gates HaveIBeenPwned checking
to Pro and above; this project is on Hobby, so enabling it fails. Revisit only if
upgrading to Pro or adding external password users. (2) *Unused-index INFO
advisories* (`publish_events_published_by_idx`, `department_options_active_idx`,
`zone_options_active_idx`, `seats_layer_custom_idx`, `seats_employee_id_idx`) —
expected on low-traffic tables. **Do not drop useful indexes to silence them.**
Formerly `docs/v1.3.5-supabase-maintenance-review.md` / `docs/supabase-live-cleanup.md`.

**A-4 · Known non-blocking schema drift (recorded 2026-05-28, deliberately not
fixed).** Production was missing `public.publish_events_created_at_idx`, which
`20260521000100_publish_audit_logging_hardening.sql` creates.
`publish_events_published_by_idx` exists; the admin publish-history query orders
by `created_at desc`, so this is performance-only on a near-empty table. If it is
ever wanted, ship it as a normal tested migration — **do not fold it into
migration-history work.** Not re-verified against prod since 2026-05-28. Formerly
`docs/supabase-migration-ledger-reconciliation-plan.md`.

**A-5 · The "Phase 3" relational target that R-13 defers to.** `departments` /
`zones` as unique-name tables with **no stored counts**; `people.department_id` FK
replacing free-text `employees.department` (backfill creates rows for legacy
orphans "Social Media" / "HR"); `zone_id` on seats; and every count a live
aggregate rather than a stored column. This is the design
`supabase/migrations/20260702100000_department_integrity_normalization.sql` defers
to — that migration cited `docs/redesign-architecture.md §5`, which no longer
exists, so the citation now points here. Never implemented; captured so R-13 has a
target rather than a blank.
