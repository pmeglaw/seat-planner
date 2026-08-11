# CodeRabbit Review Context & Improvement Plan — seat-planner

Purpose: paste this (or link it) into CodeRabbit review prompts, planning issues, or `@coderabbitai` chat requests when asking it to identify bugs, performance issues, and design enhancements, and to plan fixes. It complements `.coderabbit.yaml` (path-scoped rules) and the auto-ingested `CLAUDE.md` / `AGENTS.md`.

## 1. What this app is

Private office seat-planning app: Next.js App Router + Supabase (TypeScript strict), deployed on Vercel to `seats.megeredchianlaw.com`. Authenticated viewers see the published seating map at `/`; admins edit a draft map at `/admin`, manage directory data at `/admin/management`, and publish when ready. There is **no staging database** — local dev writes to production Supabase, so any change that can reach `publish_seat_map()` is effectively a production deploy.

## 2. Non-negotiable invariants (rank findings against these)

1. **Draft/published separation.** Every seat row has `layer = 'draft' | 'published'`. Viewers read published only; admins edit draft only; `publish_seat_map()` is the sole path that copies draft → published. Most historical bugs come from blurring this line.
2. **Employee snapshot layering.** Viewers join seats to `published_employees` (snapshot replaced atomically at publish), never live `employees`. `published_employees` is select-only under RLS; only the publish RPC or migrations write it.
3. **Draft concurrency fence.** The draft is one shared copy. Whole-draft operations (undo/redo, JSON restore) send a per-row `(id, updated_at)` expectation; per-seat edits send that seat's `updated_at`. RPCs reject stale state with SQLSTATE `'MLS02'`. Every new draft mutation must thread this fence. Two details in `lib/draftConcurrency.ts` look redundant but are load-bearing: the per-row map (not an aggregate) and timestamps passed back verbatim (never re-parsed through `Date`). As of v1.34.0 the rollout is complete — every bulk draft mutation (undo/redo, JSON restore, reset, CSV import, publish) is fenced.
4. **Three-layer security boundary.** (a) every exported server action calls `requireAdmin()`; (b) Postgres RLS + SECURITY DEFINER RPCs enforce admin independently; (c) the root `proxy.ts` refreshes the session cookie. Client guards (`adminPageGuard`) are UX only. Service-role key and `OPENAI_API_KEY` never reach the browser.
5. **Atomicity via RPCs.** Anything touching multiple rows (swap, CSV import, snapshot restore, publish, department/zone rename+delete, force-move, deactivate) is a single Postgres function called via `supabase.rpc()`. Changing such logic means editing both the TS action and a **new** timestamped migration.
6. **Seat protection.** Original seats can never be deleted — only `is_custom` seats.
7. **Coordinates.** Seat `x`/`y` are already normalized to `[0,1]` in the DB. Never re-normalize. The 3822×1734 image constants are not a coordinate space. If shipped map pixels change, regenerate both the `?v=` cache-buster and `MAP_IMAGE_BLUR_DATA_URL`.
8. **Intentional "bug".** Undo/redo and snapshot restore never delete employees created during seat assignment. Owner-confirmed. Do not plan a fix for it.
9. **Ask Planner is read-only.** `AskPlannerDrawer` → `askPlannerAction` → `lib/mapOperationsAgent.ts` may answer and highlight, never mutate.
10. **Guardrail tests.** `*-source.test.mjs` tests protect a11y, destructive-action safety, and data integrity — not visual style. If a change trips one, the change crossed a real line; fix the code, never loosen the test.

## 3. Review focus areas

### A. Bugs / correctness (highest priority)

Look for: draft reads on viewer paths or published writes on edit paths; new draft mutations that skip the `MLS02` fence; sequential query-builder writes where an atomic RPC is required; TS action and SQL function drifting apart; race conditions between concurrent admin sessions; stale-closure or optimistic-update bugs in undo/redo history; CSV import edge cases (duplicates, missing employees, malformed rows) that bypass the review-before-mutate step; auth callback routes mishandling PKCE `code` vs `token_hash`; timestamp handling that round-trips through `Date` and loses precision.

### B. Security

Look for: exported server actions missing `requireAdmin()`; SECURITY DEFINER functions that skip the server-side role re-check or are callable by non-admins; RLS policy gaps (especially on new tables/columns); secrets or service-role usage reachable from client bundles; `NEXT_PUBLIC_` prefix creep; magic-link flows that could self-provision accounts (`shouldCreateUser` must stay `false`); prototype pages (`app/concepts/*`) reachable in production or importing real mutations; `proxy.ts` matcher changes that drop auth-refresh coverage.

### C. Performance

Look for: unbatched or N+1 Supabase queries in page loads and actions (`fetchAllRows` pagination misuse); over-fetching (select `*` where a column list would do, viewer pulling admin-only fields); missing indexes for new filter/order columns in migrations; RLS policies re-evaluating `auth.uid()` per row; large client bundles — map rendering re-render storms (seat markers re-rendering on every pan/zoom), missing memoization in `SeatMap` and marker layers, `virtualizedList` bypasses on long directory lists; images served without the blur-up/cache-buster contract; server components doing work that could be cached vs client components fetching redundantly.

### D. Design / UX enhancements (propose, don't block)

The design system (semantic `--sp-color-*` tokens, `components/ui/` primitives, `.admin-theme` scope) is an evolvable starting point. Suggestions welcome for: inconsistent token usage or raw hex values; spacing/hierarchy drift between admin surfaces; unclear destructive-action confirmations (must keep review-before-mutate, but wording/clarity can improve); keyboard-nav or focus-order rough edges (a11y is a hard rule: focus rings, dialog semantics, ≥ 4.5:1 body-text contrast); viewer simplicity — viewer flows must stay simpler than admin flows; empty/loading/error states; mobile/responsive behavior of the map. Frame these as enhancement proposals with mockup-level detail, not as blocking findings.

## 4. Severity rubric for findings

- **Critical**: violates invariants 1–5 (data loss, cross-layer leakage, security bypass, broken atomicity/fence). Block merge.
- **High**: correctness bug in `lib/` logic, missing test for risky change, guardrail-test loosening, contrast/a11y regression. Block merge.
- **Medium**: performance issue with measurable user impact, TS/SQL drift risk, missing index, over-fetch. Fix in PR or file follow-up.
- **Low / Enhancement**: design polish, refactors, token cleanups, docs. File as planned work, never block.

## 5. Fix-planning template

When asked to plan fixes (e.g. `@coderabbitai plan fixes for the findings above`), produce one entry per finding in this format:

```
### <short title>  [Critical|High|Medium|Low]
Symptom: what a user or admin observes.
Root cause: file:line and mechanism.
Invariant at risk: number from section 2 (or "none — enhancement").
Proposed fix: concrete change; if a multi-row mutation, name the RPC and
  note the new timestamped migration required alongside the TS action.
Files to touch: list.
Tests: which tier covers it (unit in tests/*.test.mjs, rpc-execution,
  transaction-safety, source guardrail, jsdom ct, browser, e2e) and what
  assertion to add. lib/ changes must keep coverage floors (90/95/80).
Risk & rollback: prod-DB impact (remember: local publish = prod publish),
  and whether the change is publish-gated (safe in draft) or viewer-facing.
```

Sequence plans as: Critical → High → Medium, batching by area (one PR per invariant area, migrations isolated per PR). Design enhancements go in a separate track and must not ride along with correctness fixes.

## 6. Things CodeRabbit should NOT do

Do not suggest: deleting employees on undo/redo (invariant 8); loosening `*-source.test.mjs` assertions; applying migrations manually to prod (merge to `main` triggers Supabase GitHub integration + Vercel deploy); re-normalizing coordinates; pinning specific colors/layout (visuals are free to evolve); replacing the per-row concurrency map with an aggregate hash; editing existing migration files.

## 7. Verification checklist per PR

`npm test` (includes rpc-execution against real migrations), `npm run typecheck`, `npm run lint`, `npm run build`, `npm run coverage:check` for `lib/` changes. E2E (`npm run test:e2e`) deliberately excludes authenticated flows — publish and seat-edit changes require manual verification, so plans touching them must include a manual-QA step.
