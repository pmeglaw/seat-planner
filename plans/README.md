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
- **S-01 input-bound bypass** — **DONE (2026-08-10).** All three recorded paths
  confirmed unbounded and now routed through `lib/schemas.ts`; the optional
  `char_length` CHECKs were taken too (owner ruling), so both layers hold.
  New `parseSeatTextInput` (the seat-edit counterpart to `parseEmployeeInput`)
  backs `updateSeatAction`; `lib/csv.ts` bounds every imported cell as a
  per-row review issue; the restore normalizers bound through throwing
  wrappers, keeping their existing "a malformed snapshot throws" contract.
  Migration `20260810120000_text_length_bounds.sql` adds
  `char_length(trim(...)) <= N` to `seats`, `employees`, `published_employees`
  and both option tables, and `mapUpdateSeatError` maps SQLSTATE 23514 to a
  readable message so a backstop trip is not raw constraint text.
  **Two findings worth keeping.** (1) The sharpest framing was not "unbounded
  text" but *inconsistent* bound: `updateSeatAction` writes the same
  `employees` columns as `createEmployeeAction` through the RPC, so one column
  had two different bounds depending on which action you called. (2) Seat notes
  had to become the one field that permits line breaks
  (`parseOptionalMultilineText`) — it is a textarea in `SeatInspector` and the
  CSV export quotes it, so a blanket control-character rule would have broken
  both the inspector and the export→import round-trip. Bounds are length-only
  in SQL for the same reason: that split does not express well as a constraint.
  Notes cap is 1000 (owner ruling); everything else mirrors the existing MAX_*
  values. Not done, deliberately: CSV `employee_email` is length-bounded but
  still not format-checked (`parseOptionalEmail` is only on the employee
  actions), and `updateSeatAction` still does not `parseUuid` its `seatId`.
- **S-02 `/login` double-decode** — **DONE (2026-08-10).** Recorded cause
  confirmed exactly as written, at both ends: `decodeURIComponent` on an
  already-decoded `URLSearchParams` value threw `URIError: URI malformed` from
  the mount effect, and unmapped text rendered verbatim in the `role="alert"`
  banner. Fixed by dropping the decode and splitting `lib/authMessages.ts` into
  a shared `classifyAuthMessage` plus two wrappers: `friendlyAuthMessage`
  (SDK errors — still echoes unmapped text, the only clue for a failure we
  have not mapped) and `friendlyAuthMessageFromQuery` (`?error=` — maps or
  returns the generic message, never echoes). **Worth knowing: the crash was
  not only hand-reachable.** `lib/supabase/authRedirect.ts` encodes a message
  ONCE, so any provider `error_description` containing a literal `%` — "100%
  down" — came back through `URLSearchParams` as `100% down` and killed the
  page on arrival. Covered by 3 jsdom tests in `tests/login-form.test.mjs` and
  2 in `tests/auth-messages.test.mjs`; live-verified at `/login?error=%`.
- **S-03 auth-config posture** — **DONE in repo (2026-08-10); two items left
  for the owner in the Supabase dashboard.** The recorded facts were right but
  the *severity* was overstated, and the reason is worth keeping: **nothing in
  CI pushes `supabase/config.toml` to the hosted project** (no `supabase config
  push`, no `supabase link` in `.github/workflows/`), so that file governs the
  LOCAL stack and preview branches only — it was never what protected
  production. Live GoTrue settings (`GET /auth/v1/settings`, 2026-08-10) report
  **`disable_signup: true`** on the hosted project, so self-service signup was
  already off in prod.
  What the divergence actually cost: the e2e-auth job's disposable stack ran
  with signup ON and a 6-character minimum, i.e. the authenticated tests were
  exercising a more permissive system than the real one. `config.toml` now sets
  `enable_signup = false` and `minimum_password_length = 12`; the 12 comes from
  the new `MIN_PASSWORD_LENGTH` in `lib/authMessages.ts`, which
  `UpdatePasswordForm` now reads instead of a bare literal, and
  `tests/auth-config-source.test.mjs` fails if the two drift. Seeded local users
  are inserted straight into `auth.users` (`supabase/seed.sql`), so none of this
  touches the e2e fixtures.
  `handle_new_user()` is left alone deliberately: provisioning a viewer profile
  for a new auth user is exactly right for an admin-created account, and it is
  the mechanism magic-link sign-in depends on. With signup off and
  `shouldCreateUser: false` on the magic-link path, no self-provisioning route
  exists — the trigger is not the hole, the signup switch was.
  **Owner, in the dashboard (not reachable from here):** (1) confirm
  Authentication → Policies → minimum password length is 12, not the default 6
  — the settings endpoint does not expose it, so it is the one value still
  unverified; (2) **GitHub OAuth is enabled on the hosted project**
  (`"github": true` in the same settings response) though the app only ever
  uses email/password and magic links — unused sign-in surface, almost
  certainly left over from the prototype phase. Disable it unless it is
  wanted.
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
- **T-02 source-text-only big surfaces** — **DONE (2026-08-10, v1.37.11 +
  v1.37.12).** Every component it named is now mounted by a jsdom tier test.
  **Recorded scope was stale on 3 of its 4 components — re-verified 2026-08-10:**
  `AdminManagementPanel.tsx` and `DataUtilitiesPanel.tsx` already had full
  jsdom mounting tests (`tests/{admin-management-panel,data-utilities-panel}.test.mjs`,
  added 2026-08-08 in `0d3f47f` — i.e. *after* this entry was written), so
  those two were never open work. `ViewerSeatFinder.tsx` was genuinely
  source-text-only and is now mounted by `tests/viewer-seat-finder.test.mjs`
  (14 tests, all 8 mutations killed).
  Verified along the way, because it decided the tier: **ViewerSeatFinder does
  NOT share SeatMap's jsdom problem.** Its crowding nudges are pure
  `lib/seatCrowding` calls over a measured scale, not an iterative
  de-collision pass, and every measurement site is guarded (`offsetWidth ||
  null`, `Math.max(1, ...)`), so jsdom's zero-size geometry gives one stable
  pass instead of never converging. The real-browser fallback was not needed.
  What actually blocked it was three jsdom environment gaps, now fixed once in
  `tests/helpers/renderComponent.mjs` for every component test:
  `requestAnimationFrame` (needs `pretendToBeVisual`), `matchMedia` +
  `ResizeObserver` (jsdom implements neither), and `Element.scrollTo`.
  `ReceptionScreen.tsx` (327 lines — the entry implied a far bigger surface)
  is now mounted by `tests/reception-screen.test.mjs` (23 tests, all 14
  mutations killed). It has no layout measurement at all, so it mounted
  cleanly on the harness fixes above; its real cost was the keyboard loop
  (↑↓ highlight → Enter locks → focus never leaves the input) and the recents
  contract, none of which regex could see.
  **Finding worth keeping: `RECENTS_DISPLAY_MAX` (4) in `ReceptionScreen.tsx`
  is unreachable as a constraint.** `lock()` pushes the same id it selects, so
  the store always contains the current selection and
  `.filter(id => id !== selectedId)` already yields ≤ 4 of `RECENTS_STORED_MAX`
  (5). The visible cap of 4 is enforced by the STORE cap minus the selection;
  the display slice is defensive and can never bind. Harmless — left in place
  deliberately, and the test says so rather than pretending to guard it. Don't
  "fix" a failing display-cap test by widening the store.

**Tech debt / architecture:**
- **D-01 SeatMap.tsx** — 4,064 lines / 138 hooks (50 useState) / 7 inline
  dialogs; grew +181 lines during the refactor cycle. First slice: extract the
  3 confirm dialogs behind a shared `ConfirmDialog`; second: swap/move mode
  machinery → discriminated-union hook. Incremental only. L.
- **D-02 14 hand-rolled dialogs** (+2 since prior audit) sharing only
  `useDialogFocus` — a `ConfirmDialog` primitive with a required in-dialog
  `role="alert"` error slot would make plan-002's fix structural. M-L.
- **D-03 wash-layer JSX drift** — **DONE (2026-08-10).** Extracted
  `components/seat-map/MapWashLayer.tsx` (zone wash + room washes) and both
  surfaces now mount it; the viewer's raw `#1D6E41` became
  `var(--admin-zone-wash-fill)` in the same change.
  *Corrections to the recorded entry:* the SeatMap line range was stale — the
  block sat at **3315-3356**, not 3387-3417 (viewer 1265-1303 was right, hex at
  `:1295`). And the fix is **pixel-neutral, not a visual repair**:
  `--admin-zone-wash-fill` is `color-mix(in srgb, #1D6E41 10%, transparent)` =
  `rgba(29,110,65,0.10)` — byte-for-byte the value the raw class produced
  (confirmed live: computed `color(srgb 0.113725 0.431373 0.254902 / 0.1)`).
  The token was also already in scope for the viewer: it is declared for
  `.admin-theme, .shell-theme` (`globals.css:517`) and `ViewerSeatFinder:982`
  carries `shell-theme`. So the value of the item was the de-duplication and
  the removal of a future drift vector, not a wrong colour on screen.
  *Test debt paid with it:* the two source pins that regex'd this JSX in BOTH
  component files (`office-room-wash.test.mjs`, `zone-wash.test.mjs`) now assert
  the mount + prop wiring per surface and the a11y/pointer-inert/tokenized-fill
  anchors once, in `MapWashLayer.tsx`. Any future wash extraction has to move
  those anchors, not delete them.
  *Not touched (deliberate):* the inset ring `rgba(29,110,65,0.22)` is still a
  raw value, but it was **identical on both copies** — never drifted — so
  tokenizing it is a design decision, not debt cleanup. Left for whoever owns
  the next token pass.
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

- **T-01 coverage floor blind** — CLOSED, and it was **already closed when this
  entry was written**: #345 landed `"all": true` on 2026-08-08, one day after
  the 2026-08-07 audit that recorded it, and nobody retired the entry. Verified
  2026-08-10 rather than assumed: `.c8rc.json` has `"all": true`, all five files
  the entry names — `adminPageGuard`, `fullNavigation`, `serverAuth`,
  `authRedirect`, `middleware` — report 100% lines/branches/functions, no
  `lib/**` file sits below the 90% line floor, and the only runtime exclusions
  are the three documented ones (`lib/types.ts` plus the two thin Supabase
  client factories) alongside the blanket `**/*.d.ts` type-declaration filter.
  It was carrying an M effort estimate against work that did not exist.
- **T-03 calibration breadth** — CLOSED 2026-08-10 on the axis that mattered.
  The file now asserts **Y as well as X** for the Northeast pod, which is the
  part its own header called worth more than adding seats: #178/#179 was a
  VERTICAL error and every existing assertion stayed green throughout it.
  Proven, not assumed — shifting the NE left quad down 12px (that bug's
  magnitude) turns 5 assertions red while all 8 X assertions stay green.
  `scripts/measure-chair-centres.mjs` is the committed generator the header
  asked for: it measures each chair pad's centroid from the shipped webp, states
  its method precisely enough to re-run, and fails loudly rather than drifting
  when a pad is not where it expects. The test suite runs the generator and
  fails if it stops reproducing the committed fixture, at the shipped
  resolution and at 1x — its size bounds are in master-plan pixels, so a
  re-rendered plan at another scale still measures the same chairs. `sharp` is now a declared devDependency
  instead of a transitive one. Y tolerance is 5px, above its own noise floor,
  against a current worst-case error of 2.9px. Two things deliberately NOT done:
  the other 9 areas remain unpinned (same generator would extend to them, but
  each needs its own seed row), and CHAIR_CENTRE_X is untouched — the generator
  disagrees with it by up to 6.5px because it measures the pad centroid while
  the lost script measured something slightly left of it, and the calibration
  was fit to the committed numbers, so "correcting" them would break a fit
  that is good to 0.8px. The test header now says this explicitly.
- **T-04 seatProtection↔SQL divergence** — CLOSED 2026-08-10, with the framing
  corrected: there are THREE copies of the protected-label ranges, not two, and
  the divergent one is not live. The zero-padded regex the entry cites
  (`20260724100000_repair_original_is_custom.sql:14`, rejects `W8`) belongs to a
  one-time data repair that has already run and cannot run again — an applied
  migration must not be edited, so it stays as-is. The copy that actually
  executes is `restore_draft_snapshot`'s `protected_original_label` CASE
  (`20260807120000:226-242`), and it already agreed with
  `lib/seatProtection.ts`: same numeric comparison, same acceptance of bare
  `W8`. The real gap was the missing link, now closed by
  `tests/seat-protection-sql-agreement.test.mjs` (44 cases): it generates the
  matrix from the exported `ORIGINAL_SEAT_LABEL_MAX_BY_PREFIX` and asserts
  agreement end to end against the REAL RPC — seed one custom, unoccupied draft
  seat, restore a snapshot omitting it, see whether the database refuses —
  rather than comparing regexes. Proven sensitive by mutation: narrowing the TS
  `W` range to 8 turns the suite red on `W09`.
- **T-05 browser-harness `pending` never settles** — CLOSED 2026-08-10, and it
  was **not a harness limitation**. The recorded cause (SeatMap's CSS-less
  layout effects never converging) was wrong, and the prescribed harness-CSS
  route would not have fixed it. Measured: the harness committed ~28,000 renders
  per SECOND while idle, with ResizeObserver and rAF disabled making no
  difference. A DevTools-hook probe over SeatMap's own hook list found two state
  hooks taking a new identity on every single commit — `localDepartmentOptions`
  and `localZoneOptions`. Cause: `departmentOptions = []` / `zoneOptions = []`
  were INLINE default parameters, so an omitted prop built a fresh array each
  render, and the identity-keyed sync effects (now `SeatMap.tsx:591-592`) set
  state every render forever. Hoisted to module constants, matching
  `DEFAULT_PUBLISHED_SEATS` which already existed for this exact reason.
  `/admin` passes both props, so production was never in the loop — but any
  caller taking the documented defaults would have been. The browser tier now
  asserts the `Retry discard` relabel that was previously unassertable.
  Residual (not blocking): `overviewMapWidth` still oscillates 50↔165 px at
  ~31/s in the CSS-less harness — the real ResizeObserver feedback, harmless to
  assertions now that the render storm is gone. That is the piece the
  harness-CSS route would address, if it ever needs addressing.
- **T-06 `test:ct` under-reported the jsdom tier** — CLOSED 2026-08-10: the
  script listed 7 of 9 files, missing `app-shell.test.mjs` (the #333 nav pin)
  and `map-status-legend.test.mjs`. Both were always run in CI — the verify job
  runs `coverage:check`, which globs `tests/*.test.mjs` — so this was a local
  under-report, not a CI hole. All 9 now listed (107 tests), and
  `tests/test-tier-scripts-source.test.mjs` derives each tier's membership from
  the harness a file imports and fails when `test:ct` or `test:db` drifts from
  it, so the list cannot silently fall behind again.
- **T-07 flaky PGlite fence test** — CLOSED 2026-08-10, root-caused. Every
  earlier note on this entry guessed wrong, so the correction is worth keeping:
  it was never PGlite contention, never suite parallelism, and `pgHarness.mjs`
  needed no change. **PGlite's `now()` ticks in whole milliseconds** (its
  `gettimeofday` is a JS millisecond clock) where real Postgres carries
  microseconds, so when the review snapshot and the test's simulated
  other-session write landed in the same millisecond, the touch trigger wrote
  back the exact value the expectation held — the fence had nothing to detect
  and the RPC resolved instead of raising MLS02. Measured: a standalone probe
  replaying the scenario resolved 58 of 300 times, and `updated_at` was
  byte-identical in **all 58**. The "passes in isolation every time" claim was
  luck: re-measured at 6 failures in 20 isolation runs. Fix: every expectation
  capture in `tests/rpc-execution.test.mjs` now waits for the clock to tick, so
  a later write always lands on a later millisecond, as against a real server.
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
