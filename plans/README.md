# Implementation Plans

Two audit cycles are recorded here. **Current cycle: 2026-08-07**, audited at
commit `89a8fea` (HEAD, post PR #336) by the `improve` skill — 172 commits
after the prior cycle. The prior cycle's record (2026-07-24, commit `3119e16`,
all eleven plans shipped) is preserved at the bottom; its plan files were
removed in the 2026-08-06 docs sweep (recover from git history).

Each executor: read the plan fully before starting, honor its STOP conditions,
and update your row when done.

## Execution order & status (2026-08-07 cycle)

| Plan | Title | Priority | Effort | Risk | Depends on | Category | Status |
|------|-------|----------|--------|------|------------|----------|--------|
| 012 | Stage label/seat_key writes in `restore_draft_snapshot` (permuted snapshots restore cleanly) | P1 | M | MED | — | bug | DONE — merged to main as `c366273` (PR #339, 2026-08-07; incl. CodeRabbit round `ac84294`: coverage comment, anchor guards, fence-threaded permutation test). Migration applied to prod via merge |
| 013 | Deterministic total order on every paged Supabase read | P1 | S | LOW | — | bug | DONE — merged to main as `a51f7ae` (PR #338, 2026-08-07; incl. CodeRabbit round `3f6d293`: exact-multiset assertion). Scope grew 5→7 full_name sites (STOP-condition grep caught `/admin/management` + `/admin/settings`; plan amended) |
| 014 | Stop `applyMapZoom` arming a zoom anchor on no-op zooms | P2 | S | LOW | — | bug | DONE — merged to main as `5742efa` (PR #340, 2026-08-07; manual browser QA passed with JS-measured scroll positions) |
| 015 | Cancel inner rAF + in-flight tween in `useInspectorNudge` cleanups | P2 | S | LOW | — | bug | DONE — merged to main as `4d8d9d1` (PR #341, 2026-08-07; CodeRabbit 0-sentinel finding reviewed and rejected: platform guarantees non-zero rAF ids, repo convention is the 0-sentinel) |
| 016 | Pin the focused row in the Management directory's windowed table | P2 | M | MED | — | bug/a11y | DONE — merged to main as `f885600` (PR #342, 2026-08-07; three-commit stack: pin + live keyboard QA, CodeRabbit identity-pin round, empty-state listener re-attach fix). Prod note: 16 active employees — pin engages only at short viewports today |

Status values: TODO | IN PROGRESS | DONE | BLOCKED (one-line reason) | REJECTED (one-line rationale).

All five are independent — any order, any parallelism. Recommended: 013 first
(smallest, purely additive), then 012 (highest value), then 014/015/016.

Local-env notes for executors (from the maintainer's environment): use
`npm install`, NOT `npm ci` (EPERM on the Windows box); four harness-heavy
test files (`login-form`, `rpc-execution`, `seat-inspector`,
`seat-map-components`) can fail on an untouched tree when `node_modules`
drifts — reinstall before suspecting a change. Healthy baseline: ~600+ pass /
0 fail.

## 2026-08-07 findings recorded but NOT planned this cycle

The user scoped this cycle to the correctness backlog. Everything below was
verified at `89a8fea` with fresh evidence; candidates for a future cycle — do
not re-audit from zero.

**Security (all verified by reading the full path):**
- **S-01 input-bound bypass** — `lib/schemas.ts` is the only text bound in the
  system (no DB CHECK on any text column), and three write paths skip it:
  `updateSeatAction` (`app/actions.ts:361-368`, trim-only), CSV import
  (`lib/csv.ts:137-169`, no length/control-char bound), snapshot restore
  normalizers (`app/actions.ts:215-262`). Admin-authenticated only — data
  integrity, not access control. Fix: route all three through
  `parseRequiredText`/`parseOptionalText`-style bounds; optionally add
  `char_length` CHECKs in their own migration. S-M effort.
- **S-02 `/login` double-decode** — `components/auth/LoginForm.tsx:32` calls
  `decodeURIComponent` on an already-decoded `URLSearchParams` value: a lone
  `%` throws `URIError` in an uncaught effect (one-click login-page DoS), and
  unrecognized text falls through `friendlyAuthMessage` and renders verbatim
  in the trusted error banner (content spoofing; React escapes, no XSS). Fix:
  drop the decode, allow-list the display. S effort.
- **S-03 auth-config posture** — `supabase/config.toml:186,192` declares
  `enable_signup = true` and `minimum_password_length = 6`; the client's
  12-char minimum (`UpdatePasswordForm.tsx:20`) is browser-only;
  `handle_new_user()` (`001_initial_schema.sql:100-114`) provisions a working
  viewer profile for ANY new auth user. Severity depends on unverified
  dashboard state (prod signup setting, preview-branch integration). Fix:
  flip config.toml, verify + record the prod dashboard values. S effort.
- **S-04 backup argv exposure** — `scripts/backup-prod.mjs:110` passes the prod
  DB connection string on the child-process command line (world-readable in
  the process table for the dump's duration). Single-operator machine —
  verdict: marginal; fix via child `env` if ever touched anyway.

**Tests:**
- **T-00 (from #339 review, deferred)** — `restore_draft_snapshot` validates
  duplicate snapshot LABELS (case-insensitive) but not duplicate trimmed
  seat_keys: a tampered/corrupted snapshot with two identical trimmed
  seat_keys still dies with raw 23505 instead of a controlled validation
  error. Pre-existing (not introduced by plan 012), unreachable from
  app-built snapshots (they mirror real rows already under the unique index).
  Fix when next touching the RPC: mirror the label-dupe check for
  `trim(seat_key)` (no lower() — the key index is case-sensitive) + a PGlite
  test with keys like `"A"` vs `" A "`. CodeRabbit finding, reviewer-skipped
  in PR #339 as scope expansion. S.
- **T-01 coverage floor blind** — `.c8rc.json` `"all": false`: 9 never-imported
  `lib/**` files invisible to the 90/95/80 floors, including the whole
  Supabase auth surface (`lib/supabase/authRedirect.ts`, `middleware.ts`,
  `serverAuth.ts`, `adminPageGuard.ts`, `fullNavigation.ts` — the last is
  stubbed by the jsdom harness so never executed). Fix: `"all": true` +
  cover-or-exclude-with-reason; `completeAuthRedirect` is directly
  unit-testable. M effort. (Prior TEST-03, wider than previously scoped.)
- **T-02 source-text-only big surfaces** — `ViewerSeatFinder.tsx` (1,620 lines,
  2nd-highest churn, the surface non-admins actually use),
  `AdminManagementPanel.tsx`, `DataUtilitiesPanel.tsx`, `ReceptionScreen.tsx`:
  regex-over-source tests only; no tier mounts them. jsdom harness plumbing
  exists (`tests/helpers/renderComponent.mjs`). Start with ViewerSeatFinder. L.
- **T-03 calibration breadth** — behaviorally pinned for 1 of 10 areas, X axis
  only (`tests/map-calibration.test.mjs:76-118`); the test's own header
  documents that the #178/#179 vertical bug would have stayed green, and
  documents the re-fixture recipe. M. (Prior TEST-05.)
- **T-04 seatProtection↔SQL divergence** —
  `20260724100000_repair_original_is_custom.sql:14` regex requires
  zero-padded 2-digit labels; `lib/seatProtection.ts:15-24` compares
  numerically (accepts `W8`). Two hand-maintained copies, zero linking tests.
  Fix: PGlite agreement test generating labels from
  `ORIGINAL_SEAT_LABEL_MAX_BY_PREFIX`. S. (Prior TEST-07.)
- **T-05 browser-harness `pending` never settles** — unchanged from prior
  record (see `tests/browser/seat-map.spec.ts:235-241`); both fix routes
  scoped there. Prefer the harness-CSS route.
- **T-06 `test:ct` lists 5 of 7 jsdom files** — `package.json:14` misses
  `app-shell.test.mjs` (the #333 nav pin) and `map-status-legend.test.mjs`.
  Fix: naming convention or add the two. S.
- **T-07 (2026-08-07, rate WORSENING) flaky PGlite fence test** — `tests/rpc-execution.test.mjs`
  "fences when a NON-targeted draft seat changed out-of-band (vacate
  collateral, MLS02)". First recorded as one failure in each of TWO separate
  full-suite runs (plan 013 review round and plan 015 execution). **Re-measured
  2026-08-10 during #354: 2 failures in 6 consecutive full-suite runs** — same
  test, same signature, on a branch touching no SQL at all. Passes in isolation
  every time (66/66) and on immediate rerun. Pattern still points at PGlite
  resource contention under full-suite parallelism, not product logic, but at
  ~1-in-3 it is now likely to redden CI. Fix likely lives in
  `tests/helpers/pgHarness.mjs` isolation, not the RPC. S-M to investigate.

**Tech debt / architecture:**
- **D-01 SeatMap.tsx** — 4,064 lines / 138 hooks (50 useState) / 7 inline
  dialogs; grew +181 lines during the refactor cycle. First slice: extract the
  3 confirm dialogs behind a shared `ConfirmDialog`; second: swap/move mode
  machinery → discriminated-union hook. Incremental only. L.
- **D-02 14 hand-rolled dialogs** (+2 since prior audit) sharing only
  `useDialogFocus` — a `ConfirmDialog` primitive with a required in-dialog
  `role="alert"` error slot would make plan-002's fix structural. M-L.
- **D-03 wash-layer JSX drift** — ~30 identical lines in `SeatMap.tsx:3387-3417`
  vs `ViewerSeatFinder.tsx:1272-1303`, EXCEPT #323 tokenized only the admin
  copy: viewer still ships raw `#1D6E41` (`:1295`) where admin uses
  `var(--admin-zone-wash-fill)` (`:3410`). Extract `MapWashLayer`, fix the hex
  in the same change. S. **Already-drifted — cheapest high-value debt item.**
- **D-04 results-list aria-label coupling** — focus handoff reaches into lists
  by hardcoded string in two places each (`SeatMap.tsx:899`,
  `ViewerSeatFinder.tsx:521,1098`); renaming an accessible name silently
  breaks keyboard nav. Cheap first step: export the label consts. S (consts) /
  M (full unification).
- **D-07 (from #342 review, generalized)** — `useVirtualListWindow.ts` still
  pins by INDEX; the same stale-pin-on-same-count-reorder class CodeRabbit
  found in the Management table applies to its two consumers (viewer People
  directory, admin Results panel), reachable only via out-of-band data
  refresh while focus sits in a row. Port the identity-based pin from
  `AdminManagementPanel.tsx` (`804b46d`) when next touching the hook. S.
- **D-05 `getSeatZone` exists but private** — `lib/seatZones.ts:71` holds the
  canonical `seat.zone ?? seat.department ?? null` helper with one internal
  caller, while 22 sites open-code it with 5 empty-value conventions
  ("Unzoned" vs "No zone" user-visible split), and 3 sites drop the
  department fallback entirely (`lib/receptionDirectory.ts:39,51`,
  `SeatMap.tsx:2155` — reads like an oversight; decide deliberately). S-M.
- **D-06 `markerStateClassRecipes`** — 54 raw hexes in
  `components/ui/design-system.tsx:211-227`, a diverged snapshot of the
  now-tokenized marker palette, consumed only by the 404-gated prototype.
  Rewrite in `var(--admin-marker-*)` or move into the prototype dir. S.

**Perf / deps / DX / docs:**
- **P-01 CI caching** — three cold Next builds per run, no `.next/cache` or
  Playwright-browser caching (`.github/workflows/ci.yml:47,71,105-131`,
  `playwright-auth.config.ts:95`). Biggest CI wall-clock lever. S.
- **X-01 image-pin mismatch** — `next.config.js:94` `localPatterns.search`
  pins `?v=map-v2-warm-1911x867`; live is `?v=map-v2-cool-2x-3822x1734`
  (`lib/mapLayoutTransform.ts:14`). Inert while every `<Image>` is
  `unoptimized`; 400s the floor plan if that ever changes. Fix + source test
  pinning the two together. S.
- **DEP-01 `sharp` override** — `package.json:56` forces `^0.35.0` outside
  next\@16.2.12's declared `^0.34.5`; nothing reaches sharp at runtime (all
  images `unoptimized`, blur URL hardcoded). Remove the override. S.
- **DEP-02 `@types/node` ^26 vs Node 22** runtime/engines/CI — typecheck
  accepts APIs the runtime lacks. Pin to `^22`. S.
- **DEP-03 unused `@testing-library/user-event`** devDep. S.
- **DEP-04 `js-yaml` high advisory** — CLOSED: PR #337 (`24cca6a`, 2026-08-07)
  bumped js-yaml to 4.3.1 on main.
- **DOC-01 `CLAUDE.md:26` says "there is no dev or staging database"** while
  README documents the full local stack (`db:start`/`db:seed`) and CI uses it
  — the doc half that warns about the prod footgun also removes the safe
  alternative. Rewrite the clause + add db scripts to the Commands list. S.
- **DOC-02 `docs/RISKS.md`** — 2026-07-08 snapshot, no staleness banner,
  materially wrong numbers (SeatMap "2,684 lines", "no React component ever
  rendered by a test"); Appendix A-1..A-5 is still the live settled-decisions
  record. Add a HISTORICAL header pointing Parts 1-2 at this file. S.

## 2026-08-07 verdicts: considered, not worth doing (do not re-audit)

- **Tailwind 3→4 / ESLint 9→10 / TS 6→7** — nothing forced (no EOL/security
  cutoff); ESLint 10 blocked by transitive `typescript-eslint@8` peer; TS 7
  ecosystem not ready; Tailwind 4 needs a dedicated spike gated on the
  zeroed-`borderRadius` design contract in `tailwind.config.ts:11-25`.
- **Repo-size prune** — prior "~294 MB pack" claim was WRONG: pack is
  119.65 MiB, working tree 25 MB (18 MB = `docs/audits/2026-07-28/screenshots/`,
  which IS tracked — the old "gitignored dir" claim was also wrong). Bounded
  cost (shallow CI clones); HEAD-only delete is fine if ever wanted; no
  history rewrite.
- **SeatMap micro-memoization** (`dimmedSeatIdSet`, per-marker loop work) —
  deliberate; microseconds at 30 seats; `EMPTY_SEAT_ID_SET` short-circuit
  absorbs the instability downstream.
- **CSP `script-src 'unsafe-inline'`** — recorded, reasoned deferral in
  `next.config.js:16-21`; the only HTML sink is a build-time static theme
  script.
- **Reception exposing phone extensions** to signed-in viewers — the feature's
  purpose, from the published snapshot.
- **S-04 backup argv** — see above; marginal on a single-operator machine.

## 2026-08-07 direction options (unchanged from prior cycle; evidence re-verified)

Owner previously chose "none for now"; still current:
- **Floor 2 decision** — `FloorSelector.tsx:136` still ships a permanent
  "SOON" badge to all viewers; build (needs `seats.floor` + second
  calibration — do T-03 first) or remove.
- **Publish-layer rollback** — published remains the only layer with no
  recovery path (draft has undo/redo/restore/reset).
- **"Your seat" viewer landing** — email match + highlight-on-load; deep-link
  infra exists without a share affordance.
- **Bulk position→zone assignment**; **Ask Planner "what's pending publish?"**
  (read-only over `lib/publishSummary.ts`).

## Verified-closed since the 2026-07-24 record (fresh at `89a8fea` — do not re-report)

- **CORRECTNESS-05 (fence completion)** — CLOSED: CSV import + publish +
  employee-directory fences shipped (#319/#320/#327/#331 and migrations
  `20260805120000`→`20260806140000`); superseded unfenced RPC overloads
  explicitly dropped. `reset` also got staged writes (`20260724150000`) —
  restore's half is now **Plan 012**.
- **SECURITY-04 (rate limit)** — CLOSED (#321): 10 req/60s per user in
  `app/actions.ts:124-140` + `lib/rateLimit.ts`.
- **PERF-02 (sequential queries)** — CLOSED: `Promise.all` on all five server
  pages.
- **PERF-03 (stale crowding-cache comment)** — CLOSED: passes memoized, comment
  accurate (`SeatMap.tsx:2663-2719`).
- **DEBT-07 (no error/loading boundaries)** — CLOSED: `app/error.tsx`,
  `global-error.tsx`, `loading.tsx`, `not-found.tsx` + route-level files.
- **DEBT-03 (`lib/permissions.ts` false trail)** — CLOSED: file deleted.
- **DOCS-01 (README "Next.js 15")** — CLOSED: README says Next.js 16.
- **`MAP_ZOOM_*` copy-paste** — CLOSED: single-sourced in `lib/mapViewport.ts`.
- **Raw-hex debt** — mostly closed by #323 (164→115 occurrences; 54 of the
  remainder are the prototype-only recipes = D-06; most others are contrast
  documentation in comments).
- **SeatMarker memoization** — CLOSED: `memo` + custom comparator + pinned
  field list (`SeatMarker.tsx:577,616`).
- **`requireAdmin` on every action** — re-verified: all 19 exports gate;
  AST-driven test pins it. **Ask Planner read-only** — re-verified: five read
  tools only, no Supabase client in the module. **Service-role key** — never
  in client code. **npm audit (runtime)** — 0 vulnerabilities.

---

# Historical record — 2026-07-24 cycle (commit `3119e16`)

All eleven plans (001–011) shipped to main. Kept for the audit trail — the
"Fixed since the prior audit" and "rejected — do not re-audit" knowledge has
been carried forward into the sections above where still relevant.

| Plan | Title | Status |
|------|-------|--------|
| 001 | Reset RPC stages employee/label writes | DONE (cd31605) |
| 002 | Discard-draft dialog surfaces reset errors | DONE (1415ffe) |
| 003 | Control-character open redirect in `safeNextPath` | DONE (e9ee393) |
| 004 | South Offices zone rect | DONE (40515a2) |
| 005 | Publish `change_summary` parity | DONE (921a328) |
| 006 | CSV formula injection on export | DONE (a757062) |
| 007 | RLS + seat-protection trigger in PGlite tier | DONE (0ea5afa) |
| 008 | `employees` select policy admin-only | DONE (0ea5afa) |
| 009 | Execution-test restore + 3 management RPCs | DONE (cbd7242) |
| 010 | Browser harness `auth.getUser` stub + 002 regression | DONE (ae7471b) |
| 011 | Doc-drift + prod-DB footgun warning | DONE (e3e70d4) |

Post-005 minor note (still open, negligible): `change_summary` uses raw
`is distinct from`, so null↔'' flips can over-count by 1 vs the review dialog.

## Findings considered and rejected in earlier cycles (do not re-audit)

- **Ask Planner mutation capability** — must stay read-only (owner contract).
- **SVG floor plan** — static raster is a hard owner constraint.
- **SeatMarker `--admin-marker-*` dormant branches** — owner-closed, by design.
- **Undo/redo not deleting employees created during assignment** — deliberate,
  owner-confirmed; the tests asserting it are correct.
- **Migration dual-numbering / placeholder files** — intentional reconciliation
  history.
- **`docs/RISKS.md` appendix A-1..A-5** — known-and-accepted (digest-stripped
  action errors; deliberately non-atomic option upserts; Supabase advisor
  warnings open by decision; publish_events index drift; free-text
  departments/zones deferred to Phase 3).
