# Seat Planner — full audit, 2026-09-10

**Commit audited:** `5b29b36` (`main` at v2.5.0, the Phase 5 PR 5 merge; audit branch `claude/caveman-8u6ztj`).
**Lenses:** the `brand-system` skill's per-PR checklist, the `ibm-design-language` skill's non-negotiables, review checklist and taste rubric, and the `code-review-and-quality` skill's five axes (correctness, readability, architecture, security, performance).
**Method:** every gate and tier that can run without Docker was executed on Node 24.21.0 (the `engines` version); four parallel read-only reviews (brand + Carbon, security, correctness + architecture, performance + UX) were run over the shipped app and then spot-verified against source before anything below was written. `app/concepts/`, `node_modules`, build output and the design hand-off directories were out of scope. No production data was read and nothing in the app was modified.

This is a frozen point-in-time record per `docs/audits/README.md`. Open findings should become issues; this file is not edited as they close.

### Errata (2026-09-10, same day — found by the adversarial review of fix pack 1)

- **DS-4 withdrawn.** The audit compared the two-button dirty-close ask with the three-button inspector guard. The design record already rules the two-button case: PHASE3DS §1.24 (owner ruling 2026-09-05, PHASE4BUILD §1.38) — "Keep editing (secondary) · Discard changes (plain primary): a discard of unsaved edits is not destruction of data." `AdminManagementPanel.tsx:719` was therefore correct as shipped. The three-button guard's "Discard at secondary weight" (amendment F) has no analogue in a two-button ask.
- **UX-4 withdrawn pending ruling.** DECISIONS D6-c / D6-d rule restore a moderate-impact, reviewed action whose section "loses its danger styling — nothing destructive remains on the page"; the sheet's header comment records the plain primary. Making the confirm `cds-btn--danger` would be a reopening of that record, not an application of it. Left to the owner as a ruling request.
- **BR-5 added (missed).** Section 4.5 states `--sp-status-info-*` has no consumer; that is true of the `--sp-*` alias, but `app/styles/carbon-components.css:368-371` paints `--cds-support-info` (blue 70 light / blue 50 dark) and `--cds-support-info-subtle` (`#edf5ff` light) directly on `.cds-notification--info`, which is live on three surfaces: `SeatInspector.tsx:989`, `PublishReviewSheet.tsx:128`, `AskPlannerDrawer.tsx:414`. Neither role is overridden by the brand file, so an info notification's bar, icon and light fill are IBM blue today. Same class as BR-1 (an un-overridden `--cds-*` role), Required, and a ruling request because the replacement colour is the owner's call (the terracotta family per rule 4, or a neutral).

---

## 1. Executive summary

**Overall grade: B+** (2026-07-28 audit: B−).

The two enforcing security layers hold everywhere they were checked: all 21 server actions gate on `requireAdmin()` (machine-enforced from the TypeScript AST), every mutating RPC re-checks `is_admin()` and has `EXECUTE` revoked from `anon`, no viewer surface reads live `employees` or the draft layer, and the eleven TypeScript-to-SQL RPC call sites match their latest SQL signatures parameter for parameter. Every gate is green on Node 24: lint (0 errors), typecheck, 1,488 of 1,489 Node tests (0 failed, 1 skipped) with lib coverage at 98.4 / 92.4 / 98.3 / 98.4 (statements / branches / functions / lines), and the production build. The brand token mechanics are test-enforced and confirmed in a real Chromium against the served build in all four theme states.

What holds the grade below A is concentrated in a few places:

- **The brand rule "no blue is in use anywhere" is broken on one live surface.** The roster's search-hit row paints Carbon blue 70 / blue 50 as its bar and, in dark, Carbon blue 90 as its fill, because two `--sp-status-search-*` tokens still alias `--cds-support-info` and `--cds-highlight`, which the brand file never re-points. The roster is mounted on both the viewer and the admin map.
- **The dark-theme focus ring fails the 3:1 non-text floor on hovered and selected rows** (2.77:1 on `#333333`, 2.53:1 on `#393939`) — the same numbers owner ruling O5 used to move the interactive border to `#E8A07A`, but the focus ring was kept at `#B85C2E`. Carbon's own g100 focus is white for this reason.
- **The login page's zone classes have no CSS.** `.login-theme` and `.sp-zone-chrome` appear in five shipped files and are defined nowhere, so the "dark brand panel, constant `#161616` in both themes" renders white in the light theme (screenshot-verified) and the hand-off's dark-chrome focus contract is void.
- **Two correctness defects and one race** in code that the tested `lib/` core is supposed to own: the `/admin` department chip counts and the department filter predicate use different definitions of a seat's department; `validateSeatCoordinates` coerces `NaN` to `(0, 0)` at the server-action boundary and returns `ok: true`; and `runManagementOp`'s `finally` clears whichever operation's busy token is current, which can re-enable Save while the employee write is still in flight.
- **`SeatMap.tsx` is 3,436 lines** (46 `useState`, 32 `useEffect`, 61 inner functions) and its viewer twin `ViewerSeatFinder.tsx` (1,617 lines) re-implements five `lib/mapViewport` helpers by hand, outside the coverage floor, with drift between them. The shipped code carries 58 lint warnings (34 `react-hooks/set-state-in-effect`, 22 unused variables, 2 hook-dependency) that CI does not fail on.
- **Two real security gaps, both narrow:** published seat `notes` are readable by any signed-in viewer through PostgREST because RLS is row-level only and the column list is enforced app-side; and the session cookie is not `httpOnly` (acknowledged in `lib/supabase/cookieOptions.ts`, tracked separately), which with `script-src 'unsafe-inline'` makes any future XSS a 13-month token theft.

| Category | Grade | One line |
|---|---|---|
| Security | **A−** | Two layers verified; two Required gaps (notes column, cookie flag), both documented-adjacent |
| Brand system | **B** | Mechanics enforced and computed-verified; one live blue path, dark focus contrast, stale contrast rig |
| Carbon / design language | **B−** | Product surfaces are on-system; the auth pair is off-grid, off-scale and uses glow focus rings; dead zone classes |
| Correctness & architecture | **B** | Strict types (zero `any`), RPC lockstep, fences; three logic defects, one race, god component with a diverging twin |
| Performance | **B+** | Markers memoized, assets excellent, no leaks; one double-fetch per admin route, no code splitting, unthrottled pan |
| UX patterns & accessibility | **A−** | States, keyboard, dialogs and counts are exemplary; nested `aria-modal`, hidden filter entry |
| Tests, lint, docs | **B−** | 1,489 tests and a PGlite tier; 40 source-text tests over-pin copy, lint warnings tolerated, codebase map points at files that do not exist |

---

## 2. Verification record

Everything below ran on this checkout at `5b29b36`. Node 24.21.0, npm 11.19.0, dependencies from `npm ci` against the committed lockfile.

| Check | Command | Result |
|---|---|---|
| Lint | `npm run lint` | exit 0 — **0 errors, 84 warnings** (58 in shipped `components/`; the rest in `.design-sync/`, `docs/` rigs, `scripts/`, `tests/`) |
| Typecheck | `npm run typecheck` | exit 0 |
| Node suite + coverage floors | `npm run coverage:check` | exit 0 — tests 1489, pass 1488, fail 0, skipped 1; `lib/**` 98.36 % statements / 92.44 % branches / 98.33 % functions / 98.36 % lines (floors 90 / 80 / 95) |
| Production build | `npm run build` | exit 0 (Turbopack, 20 routes) |
| Dependency advisories | `npm audit --omit=dev` / `npm audit` | runtime: **0**; dev: **1 high** — `js-yaml` 4.0.0–4.3.1 (GHSA-2883-xcg3-v3hh, CPU exhaustion on merge keys) via `eslint → @eslint/eslintrc`; fix available |
| Contrast, committed pairs | `node docs/redesign-v2/phase3/contrast/generate-pairs.mjs` then `python check_contrast.py --pairs product-pairs.json` | regenerated JSON is byte-identical to the committed file; **214/214 pass** on surfaces white, layer-01, layer-hover-01, layer-selected, the O2 tint, and the dark ladder |
| Contrast, live brand pairs | same checker on 48 hand-listed pairs the rig does not carry (§4.3) | 8 fail, of which 4 are real product surfaces; see §4.3 |
| Brand checklist, computed styles | Playwright + system Chromium against `next start` of the Node 24 build, route `/login`, theme states `white`, `g100`, system-dark, system-light | primary `rgb(184, 92, 46)`, hover `rgb(143, 69, 33)`, focus `solid 2px rgb(184, 92, 46)` at `-2px`, `--cds-border-interactive` light `rgb(184, 92, 46)` / dark `rgb(232, 160, 122)`, `--cds-link-primary` light `rgb(143, 69, 33)` / dark `rgb(232, 160, 122)`, draft mark purple 60 / 40, body `#ffffff` / `#161616`, radius `0px` on the primary — **all as ruled**; dark `--cds-highlight` resolves to `rgb(0, 29, 108)` (see BR-1) |
| Security headers, served | `curl -I /login` | CSP with `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`, `object-src 'none'`; `X-Frame-Options: DENY`; `nosniff`; `Referrer-Policy`; `Permissions-Policy`; HSTS 2 years |
| Backend-free e2e smoke | `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:e2e` | exit 0 — **36 passed** (2.1 min; includes the 390×844 viewport matrix across `/`, `/admin`, `/admin/management`, `/admin/settings`, `/reception`) |
| Real-browser SeatMap tier | `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:browser` | exit 0 — **26 passed** (9.4 s) |
| Authenticated e2e (`test:e2e:auth`), Phase 5 rigs (`pr5-dark-edges.mjs`, `pr4-*`), runtime brand audit | need the Docker Supabase stack | **not run** — Docker is not available in this session. `PHASE5.md` records these as owed post-merge on `main`; this audit discharges only the token-level half of that debt (row above). |

Tree state after all runs: `git status` clean; regenerating the contrast JSON produced no diff.

### 2.1 Browser tiers

Both Playwright tiers that need no backend ran against the Node 24 build with the sandbox's prebuilt Chromium (the repo's pinned Playwright expects a newer headless shell, so `PW_CHROMIUM_PATH` was required, exactly as `CLAUDE.md` describes for local runs). The e2e smoke suite passed 36/36 and the real-browser SeatMap tier passed 26/26. Nothing in either run was skipped or flaky.

---

## 3. Findings, ranked

Severity follows the review skill: **Critical** blocks (a hard rule or data/a11y line is crossed on a live surface), **Required** must be addressed, **Consider** is a suggestion, **Nit** is optional, **FYI** needs no action. Findings within a severity are in leverage order. Each is expanded in §4–§9.

### Critical

| ID | Finding | Where |
|---|---|---|
| BR-1 | IBM blue painted on the roster's search-hit row in both themes (`--cds-support-info` bar; dark `--cds-highlight` fill) — brand rule 1 and ruling O2 | `app/styles/sp-tokens.css:262-263` → `app/styles/sp-components.css:753` ← `components/seat-map/FloorRoster.tsx:192,199` |

### Required

| ID | Finding | Where |
|---|---|---|
| BR-2 | Dark focus ring `#B85C2E` is 2.77:1 on hovered rows and 2.53:1 on selected rows / current menu items (floor 3:1) — needs an owner ruling because the brand layer is locked | `app/styles/brand/megeredchian-law-tokens.css:123,154`; consumers `sp-components.css:455,508`, `carbon-components.css:238-239` |
| DS-1 | `.login-theme` / `.sp-zone-chrome` are applied in five shipped files and defined in no stylesheet; the login's dark brand panel renders white in the light theme | `app/login/page.tsx:58-59`, `app/login/loading.tsx:9`, `app/auth/update-password/page.tsx:12`, `app/my-seat/loading.tsx:12` |
| SEC-1 | `seats.notes` (admin free text) is readable by any signed-in viewer via PostgREST; RLS is row-level only and the column list is app-side | `supabase/migrations/005_policy_advisor_cleanup.sql:52`, `20260727190000_declare_table_grants.sql:55`, `lib/viewerSeatColumns.ts:4-7` |
| SEC-2 | Session cookie is not `httpOnly`; combined with `script-src 'unsafe-inline'` an XSS yields access + refresh token | `lib/supabase/cookieOptions.ts:10-15`, `next.config.js:24` |
| COR-1 | `/admin` department chip counts include seats with a legacy `seats.department`; the filter predicate excludes them — a chip can read "· 1" and pin to zero matches | `lib/viewerFilterGroups.ts:41` + `components/seat-map/SeatMap.tsx:2736` vs `lib/seatFilters.ts:96-98` |
| COR-2 | `validateSeatCoordinates` coerces `NaN` / out-of-range to the clamp bound; `createSeatAction` returns `ok: true` with a seat at `(0, 0)`; the restore path is documented as "must throw" and does not | `lib/validators.ts:25-27`, `lib/seatMath.ts:9-12`, `app/actions.ts:278,366,369` |
| COR-3 | `runManagementOp` `finally { setBusyOp(null) }` clears another in-flight operation's token; Save can re-enable mid-write | `components/admin-management/AdminManagementPanel.tsx:132-145` |
| COR-4 | Admin overview fit re-implements `fitMapWidth` with a 16 px inset charged to width and height, against the helper's documented 24 px height-only gutter | `components/seat-map/SeatMap.tsx:797-803` vs `lib/mapViewport.ts:44-65` |
| UX-1 | Two `aria-modal="true"` dialogs mounted at once (employee panel under the discard modal and under the deactivate tearsheet) | `components/admin-management/AdminManagementPanel.tsx:681,709,738`; `EmployeePanel.tsx:83`, `CarbonModal.tsx:112`, `ManagementConfirmSheet.tsx:73` |
| PERF-1 | `getDraftStatusAction` re-reads four whole tables (plus a second auth probe) from the client on every `/admin/*` mount, duplicating the page's own server load | `components/ui/AppShell.tsx:257-263` → `app/actions.ts:1145-1188` |
| BR-3 | Tertiary "Add to list" button sits on a layer-01 table row: `#B85C2E` on `#f4f4f4` is 4.14:1 (text floor 4.5) — the contrast rig's own comment says a tertiary must never land on layer-01 | `components/admin-management/OptionList.tsx:143` on `carbon-components.css:237`; rule at `generate-pairs.mjs:84-89` |
| BR-4 | Contrast record is stale: the rig still gates blue-60 as the primary, current bar, AI label and seat link, and carries no pair for the primary button label or the dark focus ring on layer surfaces | `docs/redesign-v2/phase3/contrast/generate-pairs.mjs:42-44,66,72-74,83,106,113,117-118,133-134` |
| DS-2 | Login primary label is 13.5 px (brand rule 5 requires ≥ 14 px on `#B85C2E`); the auth pair uses 14 off-scale sizes, 62 off-grid spacing utilities, arbitrary px geometry and unitless leading | `components/auth/LoginForm.tsx:354,381,413,436,575,630`, `UpdatePasswordForm.tsx:39,85,135`, `app/login/page.tsx:107,132,138,157` |
| DS-3 | Focus rings drawn as outset box-shadow glows (`ring-4` + offset, `ring-2` + offset) instead of the 2 px inset outline; one is rounded | `components/ui/design-system.tsx:9-10` used at `LoginForm.tsx:383`, `UpdatePasswordForm.tsx:137`; inline at `SeatMap.tsx:2571`, `ViewerSeatFinder.tsx:1276`; `app/login/page.tsx:138`; `ViewerFindPalette.tsx:424` |
| DS-4 | Dirty-close dialog makes "Discard changes" the primary; the sibling dialog follows §1.24 (discard at secondary weight) | `components/admin-management/AdminManagementPanel.tsx:719` vs `SeatMapDialogs.tsx:265-277` |
| ARC-1 | `SeatMap.tsx` is 3,436 lines / 46 `useState` / 32 `useEffect` / 61 inner functions; `ViewerSeatFinder.tsx` re-implements five `lib/mapViewport` helpers outside the coverage floor, with drift | `components/seat-map/SeatMap.tsx`, `components/seat-map/ViewerSeatFinder.tsx:679-714,763-808` |
| ARC-2 | Nine `getSeatZone`-shaped helpers with four different null fallbacks; the `NO_ZONE_LABEL` invariant is violated by the predicate it was written for | `lib/seatFilters.ts:43,57-63,102`, `lib/viewerFindPalette.ts:23`, `lib/viewerSeatSearch.ts:116`, five more |
| LINT-1 | 58 lint warnings in shipped code: 34 `react-hooks/set-state-in-effect`, 22 `no-unused-vars` (dead derived values computed every render), 2 `exhaustive-deps`; CI passes on warnings | `SeatMap.tsx:86,203,640-656,2376-2427,2610-2611,2637`, `SeatInspector.tsx:4,501`, `ViewerSeatFinder.tsx:11,31,102,900,1127`, `useSeatFilters.ts:37-38`, six more files |
| DEAD-1 | `Button`, `IconButton`, `StatusBadge` are exported and never rendered; `lib/animateValue.ts` has no caller; `SeatMap.tsx:2610-2611` class strings (with a hand-written orange and `rounded-lg`) are unused | `components/ui/design-system.tsx:59,132,196`, `lib/animateValue.ts`, `SeatMap.tsx:2610-2611` |
| TEST-1 | 40 `*-source.test.mjs` files; several pin handler bodies, template literals, variable names and button copy verbatim, contrary to the scope `CLAUDE.md` states | `tests/settings-affordance-source.test.mjs:18-40`, `role-fitted-tabs-source.test.mjs:31`, `pending-state-source.test.mjs:249,309`, `status-label-source.test.mjs:37` |
| DOC-1 | `CLAUDE.md`'s codebase map points at `app/page.tsx` and `app/admin/page.tsx` (neither exists) and at `tests/app-rail.test.mjs` (does not exist); the matcher allowlist omits `/my-seat`; "four families" of source tests versus forty | `CLAUDE.md:38-39,56,66,90,141` |

### Consider

| ID | Finding | Where |
|---|---|---|
| SEC-3 | Raw Postgres error text returned to the (admin) client in four places | `app/actions.ts:408,532,867,883` |
| SEC-4 | Ask Planner rate limit is in-memory per serverless instance (effective ceiling N×10/min, resets on deploy); no cumulative wall-clock bound (5 × 22 s) and no `maxDuration` | `app/actions.ts:146-147`, `lib/rateLimit.ts:5-7`, `lib/mapOperationsAgent.ts:17,22,1343` |
| SEC-5 | CSP `connect-src` falls open to `https://*.supabase.co` when the URL env var is missing or malformed | `next.config.js:8,12` |
| SEC-6 | `SECURITY DEFINER` functions pin `search_path = public` without `pg_temp` | `001_initial_schema.sql:101,127,140,149`, `20260901120100_publish_seat_map_floor.sql:22` |
| SEC-7 | Upload size limits are client-side only; no declared `serverActions.bodySizeLimit`; `updateSeatAction` passes `status` through unparsed | `lib/fileGuard.ts:10,34`, `app/actions.ts:470,919,963` |
| COR-5 | `sameDepartmentFallback` compares departments raw, not through `departmentKey` | `lib/receptionDirectory.ts:105-108` |
| COR-6 | `app/global-error.tsx` is the one boundary without stale-chunk recovery; `/` and `/my-seat` have no segment boundary (they fall to the document-level card and lose the rail) | `app/global-error.tsx:72-74`, `tests/chunk-recovery-boundary-source.test.mjs:17` |
| PERF-2 | No `next/dynamic`, `React.lazy` or `Suspense` anywhere; drawer, publish tearsheet, six dialogs and the full `SeatInspector` edit path ship in the initial chunk of `/admin` and, for the inspector, of the viewer | `components/seat-map/SeatMap.tsx:54-84`, `ViewerSeatFinder.tsx:55,1504` |
| PERF-3 | Unthrottled `scroll` → `setState` about every 4 px of pan; `dimmedSeatIdSet` rebuilt every render defeats the `namedSeatIdSet` / nudge memos while names are on (O(n²) per frame) | `SeatMap.tsx:827,2637,2670,2678`, `lib/seatCrowding.ts:191-207` |
| PERF-4 | Shell's "my seat" lookup is two sequential round-trips on every signed-in render; `getDraftMapPayload` awaits its two reads serially; option tables read unbounded `select("*")` against the repo's own paging invariant | `app/(shell)/layout.tsx:67-80`, `app/actions.ts:96-122`, `app/(shell)/page.tsx:63-64`, `admin/page.tsx:95-96`, `management/page.tsx:82-83` |
| PERF-5 | `publishSeatMapAction` does not revalidate `/reception` or `/my-seat`, both of which read the layer it just replaced (up to 120 s stale in the acting tab) | `app/actions.ts:1247-1248` |
| UX-2 | Filter entry point in the control row is hidden until a filter is applied; the header's only door is a hamburger glyph labelled "Filters" without the tooltip its siblings have | `MapControlRow.tsx:57`, `AppTopBar.tsx:72-87` |
| UX-3 | The two irreversible high-impact actions (discard everything, restore snapshot) stop at a confirm; no type-to-confirm and no recorded ruling that review + export-first substitutes | `SeatMapDialogs.tsx:187-235`, `SnapshotRestoreSheet.tsx:86-120` |
| UX-4 | Restore-snapshot confirm is `cds-btn--primary`; the management deactivate confirm is `cds-btn--danger` | `SnapshotRestoreSheet.tsx:118` vs `ManagementConfirmSheet.tsx:131` |
| DS-5 | `--cds-ai-aura-*` (four declarations per block) have no consumer; `--sp-status-info-*` (Carbon blue) is aliased in `tailwind.config.ts` with no consumer — the next `text-sp-info` ships blue | `megeredchian-law-tokens.css:91-95,126-129,157-160`, `sp-tokens.css:246-248`, `tailwind.config.ts:65` |
| DS-6 | Three `rgba()` colours outside the brand file escape the hex ledger (`rgba(184,82,7,…)`, `rgba(38,40,42,…)`, `rgba(169,106,56,…)`) | `app/login/page.tsx:90`, `components/seat-map/SeatSheet.tsx:41,326` |
| DS-7 | Live off-table motion: `duration-200` on the raster filter; `250 ms` + cubic-out default in `lib/animateValue.ts`; 3000 ms linear skeleton sweep in both sheet copies | `SeatMap.tsx:3040`, `lib/animateValue.ts:20,28`, `sp-components.css:88,289,390,795` |
| DS-8 | Two live all-caps eyebrows with hand-written tracking; `text-white` ×12 as the only literal Tailwind colour (deliberate, test-pinned, but theme-blind) | `ViewerFindPalette.tsx:74,406,456`; `design-system.tsx:28-124`, `LoginForm.tsx:381`, `app/login/page.tsx:138` |
| ARC-3 | `usePublishReview` takes 14 parameters, 8 of them setters; four independent in-flight flags gate one draft mutation and the inspector guard dialog gates on the wrong one | `components/seat-map/usePublishReview.ts:30-61`, `SeatMap.tsx:398,3395`, `useDraftHistory.ts:89`, `useSeatDraftActions.ts:55`, `SeatInspector.tsx:337` |
| ARC-4 | `SeatInspector.tsx` is a 1,150-line function serving both the read-only viewer and the editing admin (11 `canEdit` branches, 13 no-op callback defaults, two form-equality implementations) | `components/seat-map/SeatInspector.tsx:310-1461` |
| ARC-5 | `lib/mapOperationsAgent.ts` (1,376 lines) holds five concerns; ~40 `lib/` exports exist only for tests, nine of them untested | `lib/mapOperationsAgent.ts:154-1376`, `lib/seatZones.ts`, `lib/deepLink.ts` |
| ARC-6 | `app/actions.ts` duplicates the publish-log read between two actions and the admin page's paged reads in `getDraftStatusAction` | `app/actions.ts:1025-1064,1084-1125,1138-1196` |
| TEST-2 | `lib/draftStatusEvent.ts` (the fix for a documented prod finding) and `lib/floorGeometry/floor2.ts` have no test; `lib/adminPageGuard.ts` only a source-text one | `tests/` |
| DEP-1 | `js-yaml` high advisory in the dev tree via `eslint`; fix available | `package-lock.json` |

### Nit / FYI

| ID | Finding | Where |
|---|---|---|
| N-1 | `resultActionButtonClassName` / `resultClearButtonClassName` carry `hover:bg-[rgba(242,110,34,0.16)]`, `rounded-lg`, `active:duration-75`, `disabled:opacity-50` — all dead | `SeatMap.tsx:2610-2611` |
| N-2 | Employee-action `revalidatePath` is inconsistent (create → `/admin`; update → `/` + `/admin`; delete → `/admin`) | `app/actions.ts:659,701,724` |
| N-3 | Two `otherChanges` rows for one seat that both moved and changed details; blank CSV lines shift reported row numbers; unreachable trailing return | `lib/publishSummary.ts:199,210`, `lib/csv.ts:96-105,182`, `app/actions.ts:406` |
| N-4 | Duplicate `nav aria-label="Sections"` below 1055 px; required marker uses class `cds-optional`; the layout builds a second Supabase client | `AppTopBar.tsx:96`, `LeftPanel.tsx:99`, `EmployeePanel.tsx:125`, `app/(shell)/layout.tsx:34` |
| N-5 | 1.84 MB unreferenced `office-floor-plan.png` ships in `public/`; `canDeleteSeat` is a pure alias of `canDeleteDraftSeat`; 33 `localeCompare` calls in three option styles | `public/images/`, `lib/seatProtection.ts:44-46` |
| N-6 | Six in-code comments reference pre-`(shell)` paths | `lib/receptionDirectory.ts:8-9`, `lib/shellState.ts:23`, `lib/shellMode.ts:11`, `app/my-seat/page.tsx:22,108`, `app/login/page.tsx:26,62` |
| F-1 | `/auth/signout` POST has no CSRF token (mitigated by `sameSite: "lax"`); `/api/build-id` discloses the commit SHA unauthenticated (documented as deliberate) | `app/auth/signout/route.ts:10`, `app/api/build-id/route.ts:6-14` |
| F-2 | Every signed-in user receives the whole published directory including emails; `published_employees` is readable in full by `authenticated` — both by design | `app/(shell)/page.tsx:102`, `20260708230000_published_employee_snapshot.sql:44-49` |
| F-3 | Production GoTrue settings (signup disabled, token lifetimes, captcha, MFA) and the live project's policies/grants are not verifiable from the repo | — |
| F-4 | `--sp-radius-tag` is 12 px on a 24 px tag (asset-consistent; the skill text says 16 px) — not a defect | `sp-tokens.css:63`, `carbon-components.css:306` |
| F-5 | `/concepts/*` return HTTP 200 with the app's 404 body and `noindex` when the prototypes flag is off — as the directory's `CLAUDE.md` documents | `app/concepts/CLAUDE.md` |

---

## 4. Brand system

### 4.1 What the checklist confirmed

Measured in Chromium on the served Node 24 build, `/login`, four theme states (`data-carbon-theme="white"`, `"g100"`, and absent with `prefers-color-scheme` dark and light):

- primary button computed background `rgb(184, 92, 46)`; hover `rgb(143, 69, 33)`; label `rgb(255, 255, 255)`; radius `0px`; height 48 px
- focus on the email field: `outline: solid 2px rgb(184, 92, 46)`, `outline-offset: -2px`
- `--cds-border-interactive`: light `rgb(184, 92, 46)`, both dark states `rgb(232, 160, 122)` (ruling O5)
- `--cds-link-primary`: light `rgb(143, 69, 33)`, dark `rgb(232, 160, 122)`
- `--cds-button-tertiary`: light `rgb(184, 92, 46)`, dark `rgb(255, 255, 255)` (PHASE4BUILD §1.22)
- `--sp-status-draft-mark`: light `rgb(138, 63, 252)` (purple 60), dark `rgb(190, 149, 255)` (purple 40)
- `grep -rn "0f62fe" app components lib` returns 17 hits, all in the vendored `app/styles/carbon-tokens.css`
- no `EB7C35`, `B85C2E`, `8F4521`, `7A3A1C` or `E8A07A` hand-written outside `app/styles/brand/`; `#EB7C35` appears once, as `--brand-orange-logo`, bound to no role
- `app/styles/sp-components.css` is byte-identical to `docs/redesign-v2/phase3/components/sp-components.css`; the seven sheets load from `app/layout.tsx:12-18` in the contracted order
- the tier-C zone tokens (`--sp-shell-current-bar`, `--sp-panel-dark-link`, `--sp-panel-dark-link-hover`, `--sp-ai-border-end`) are re-pointed by the brand file's `:root` block at lines 175-181
- `tests/phase4-token-layer-source.test.mjs` passes 14/14; the brand-layer test asserts terracotta in all three blocks and the absence of the five IBM blues and the two highlight blues

The pixel-level half of the checklist — the five consumer bars measured by `docs/redesign-v2/phase5/audit/pr5-dark-edges.mjs` — needs a signed-in admin against the Docker stack and was not run.

### 4.2 BR-1 — a blue is in use (Critical)

`app/styles/sp-tokens.css:262-263`:

```css
--sp-status-search-surface:  var(--cds-highlight);
--sp-status-search-mark:     var(--cds-support-info);
```

`--cds-support-info` is Carbon blue 70 `#0043ce` in light and blue 50 `#4589ff` in dark (`carbon-tokens.css:149,254`); the brand file never overrides it. `--cds-highlight` is overridden to the O2 tint in the light block only (line 98, and the token test asserts exactly that), so in dark it stays Carbon blue 90 `#001d6c` — confirmed as `rgb(0, 29, 108)` in the computed-style run. Both are painted by `app/styles/sp-components.css:753`:

```css
.sp-roster-row[data-highlight] { background: var(--sp-status-search-surface); box-shadow: inset 3px 0 0 var(--sp-status-search-mark), … }
```

and `components/seat-map/FloorRoster.tsx:192,199` sets `data-highlight` on the roster row for the current search hit. `FloorRoster` is imported by both `SeatMap.tsx:56` and `ViewerSeatFinder.tsx:51`, so the blue bar (and in dark the blue fill) is live on the viewer and the admin map whenever a search hits.

Ruling O2 moved the *pill's* hit surface to the terracotta tint (`--sp-pill-search-fill` / `--sp-pill-search-edge`, brand file lines 99-100, 131-132, 162-163) and did not reach the roster's pair. No test guards it: the token test checks the brand file's own text, not what un-overridden `--cds-*` roles resolve to.

Remedy: declare `--sp-status-search-mark` (`#B85C2E` light / `#E8A07A` dark) and `--sp-status-search-surface` (`#FBE8DC` light / `#393939` dark) in all three brand blocks, mirroring the pill pair; add a resolved-value check (the `scripts/css-resolved-map.mjs` rig exists for this) so a `--cds-*` role the brand file forgets cannot paint blue again.

### 4.3 BR-2 and BR-3 — contrast on the brand's own surfaces (Required)

The committed rig passes 214/214, but it measures colours the brand layer retired (BR-4). Running the checker on the pairs the brand actually paints:

| Pair | Ratio | Floor | Verdict | Where it lands |
|---|---|---|---|---|
| white on `#B85C2E` (primary label) | 4.56 | 4.5 text | pass | every primary; rule 5's ≥ 14 px caveat applies |
| `#8F4521` link on white / `#f4f4f4` / `#e8e8e8` / `#e0e0e0` / `#FBE8DC` | 6.91 / 6.28 / 5.64 / 5.23 / 5.81 | 4.5 | pass | links, ghost buttons, AI label text |
| `#B85C2E` tertiary text on white | 4.56 | 4.5 | pass | control row, error cards |
| **`#B85C2E` tertiary text on layer-01 `#f4f4f4`** | **4.14** | 4.5 | **fail** | `OptionList.tsx:143` "Add to list" inside a `.cds-table tbody tr` (`carbon-components.css:237`) |
| **`#B85C2E` tertiary text on hovered row `#e8e8e8`** | **3.72** | 4.5 | **fail** | the same button while the row is hovered |
| `#B85C2E` focus / border on white / `#f4f4f4` / `#e8e8e8` / `#e0e0e0` / `#FBE8DC` | 4.56 / 4.14 / 3.72 / 3.45 / 3.84 | 3.0 graphic | pass | light focus everywhere |
| `#B85C2E` dark focus on `#161616` / `#262626` | 3.97 / 3.32 | 3.0 | pass | dark background, fields (`--sp-field` = field-01 `#262626`) |
| **`#B85C2E` dark focus on hovered row `#333333`** | **2.77** | 3.0 | **fail** | `.cds-table tbody tr:hover` (`carbon-components.css:238`), palette row hover |
| **`#B85C2E` dark focus on selected `#393939`** | **2.53** | 3.0 | **fail** | `.sp-menu button[aria-current]` (`sp-components.css:455`), `.sp-palette-row[aria-selected]` (`:508`), `.cds-table tr[aria-selected]` (`:239`), ghost buttons inside those rows |
| `#E8A07A` dark link on `#161616` / `#262626` / `#333333` / `#393939` | 8.39 / 7.02 / 5.86 / 5.36 | 4.5 | pass | |
| `#E8A07A` dark link on layer-selected-02 `#525252` | 3.62 | 4.5 | fail on paper | no link found on the Reception locked row; listed so it is not placed there |
| `#E8A07A` dark border on `#393939` / `#333333` / `#525252` / `#161616` | 5.36 / 5.86 / 3.62 / 8.39 | 3.0 | pass | O5 |
| purple 60 / 40 draft marks on their surfaces | 4.08 – 7.70 | 3.0 | pass | |
| `#EB7C35` logo orange on white | 2.81 | 4.5 | fail | reference row: the mark-only rule is correct |

Two of these are the same surface the O5 measurements moved the border for. The brand file's own comment (lines 43-52) records 2.53 on `#393939` and 2.77 on `#333333` for the *border* and keeps the *focus ring* at `#B85C2E` on the same surfaces. The shell and dark panels already use a white focus (`--sp-shell-focus`, `--sp-panel-dark-focus`, `sp-tokens.css:282,295`), which is Carbon's g100 default. The main zone in dark is the one place the ring is under the floor, and it is the keyboard user's only indicator.

The brand layer is locked, so this is a ruling request, not a change: dark `--cds-focus` to `#ffffff` (Carbon g100) or to `#E8A07A` (which clears 3:1 on every dark surface above). Either keeps the light ring, the primary fills and the border ruling untouched.

BR-3 is narrower: the rig's own comment at `generate-pairs.mjs:84-89` says "a tertiary must not land on layer-01", and one does. Switching that in-row action to `cds-btn--ghost` (link colour `#8F4521`, 6.28:1 on layer-01) is a one-class change with no ruling needed.

### 4.4 BR-4 — the contrast record measures retired colours (Required)

`generate-pairs.mjs` still gates "current bar blue-60" (line 66), "AI label text blue-60" (72-74), "text-on-color white on primary blue-60" (83, 113), "seat link blue-60 / blue-40" (117-118, 133-134) and "panel ghost blue-40 / blue-30" (42-44). None of those colours is painted since the brand layer; the pairs that replaced them — white on `#B85C2E`, `#8F4521` on the table and hover surfaces, `#E8A07A` in the dark panels, and the dark focus ring on layer surfaces — are absent, apart from the handful of terracotta pairs added in Phase 4/5. Brand rule 5 ("contrast is verified with generate-pairs + the checker after any token change") is therefore satisfied by a run that cannot fail on the brand's own colours. Remedy: replace the blue rows with the brand rows (the rig is the source; the JSON is generated) and add the dark focus surfaces as gated pairs.

### 4.5 Other brand items

- **DS-6**: three `rgba()` colours outside the brand file — `rgba(184,82,7,0.35)` (`#B85207`, a near-miss of terracotta) at `app/login/page.tsx:90`, and `rgba(38,40,42,0.38)` / `rgba(169,106,56,0.14)` in `SeatSheet.tsx:41,326` — bypass the hex ledger's `#rrggbb` regex. Extend the ledger regex to `rgba?(`; the sheet's two make its real raw-colour count 14, not the ledgered 12.
- **DS-5**: the four `--cds-ai-aura-*` declarations in each brand block have no consumer in any sheet; `--sp-status-info-*` (Carbon blue 70 / 50 with a blue-tint surface) is aliased as `info` in `tailwind.config.ts:65` with no consumer — the first `text-sp-info` ships IBM blue. Delete the alias or override the role.
- Theme parity of the brand file itself is sound: the light-only `--cds-button-tertiary*` and `--cds-highlight` overrides are the documented ones; every other role appears in all three blocks.

---

## 5. Carbon / design language

Run in the rubric's order (hierarchy → spacing → type → colour → depth → polish), stopping at the first failure per surface.

**Product surfaces (`/`, `/admin`, `/admin/management`, `/admin/settings`, `/reception`)** pass the non-negotiables. Evidence: `tailwind.config.ts:25-36` zeroes every named radius and `--sp-radius` resolves to Carbon's `0`; the only `border-radius` declarations in non-vendored CSS are the tag (12 px), two radio marks and the toggle; `sp-components.css` carries 17 focus rules of the exact form `outline: var(--sp-focus-width) solid …; outline-offset: var(--sp-focus-offset)` with width 2 px and offset −2 px; the productive type set in `sp-tokens.css:111-123` is Carbon's; IBM Plex is vendored through `next/font/local` with one variable sans file and three mono cuts, bridged in `phase4-bridge.css:28-29`; `prefers-reduced-motion` is honoured on all 22 animation sites and pinned by `tests/accessibility-source.test.mjs:1135`; seat marks carry shape and colour (`SeatMark.tsx:39-74` gives six silhouettes; origin and invalid states add dashed outlines) and survive grayscale; touch targets use `.cds-touch-target` so 40 px controls hit 44 px; one primary per section holds on every control row, tearsheet and dialog except DS-4 and UX-4; read-only surfaces are read-only by omission (no `disabled` anywhere in `components/reception/`, admin controls absent from the viewer DOM rather than greyed); density is dense where scanned (48 px control row, 28 px pills, table rows) and calm where decided (256 px readiness rail plus diff table in the publish sheet, 720 px narrow tearsheets, a callout before any control on Settings).

**The auth pair (`/login`, `/auth/update-password`) fails at spacing and type.** It was built before the Phase 3 sheets and never migrated:

- **DS-1** — `.login-theme` and `.sp-zone-chrome` are applied by `app/login/page.tsx:58-59`, `app/login/loading.tsx:9`, `app/auth/update-password/page.tsx:12` and `app/my-seat/loading.tsx:12`, and defined in no loaded sheet (zero rule definitions across `app/styles/**`, `app/globals.css` and the Phase 3 deliverable; they survive only in `.design-sync/conventions.md`, `SEAT-PLANNER-HANDOFF.md:40-52` and two scripts that now match nothing). The page comment at lines 53-54 describes the left section as a "dark brand panel … constant `#161616` in BOTH themes"; it paints `bg-[var(--sp-background)]` and so renders white in the light theme (the two screenshots taken during the checklist run show it). The hand-off's rule that `[data-chrome="dark"]` plus `.sp-zone-chrome` together prevent the 2.68:1 dark-chrome focus bug is void: `data-chrome` occurs in the repo only inside a comment.
- **DS-2** — type: 14 off-scale sizes (`text-[13.5px]` ×5, `text-[12.5px]` ×5, `text-[13px]` ×2, `text-[15px]`, `text-[10px]`), 16 unitless line-heights, five hand-written letter-spacings, five `font-medium`. The computed run shows the primary "Log in" label at 13.5 px, below brand rule 5's ≥ 14 px for white on `#B85C2E`. Spacing: 62 off-grid Tailwind utilities across `app/` and `components/` (mostly `mt-3`, `gap-3`, which are Carbon's `$spacing-04` and defensible, but also `-1`, `-1.5`, `-2.5`, `-3.5`, `-5`, `-7`) and arbitrary geometry in `LoginForm.tsx` (`h-[15px] w-[15px]` ×7, `gap-[9px]`, `mt-[22px]` ×4, `border-[1.5px]`). `components/ui/design-system.tsx:55-56,129,200` puts control heights at 36, 44 and 28 px, off the 24/32/40/48 ladder.
- **DS-3** — focus: `focusRingClass` (`design-system.tsx:9-10`) is `outline-none focus-visible:ring-4 … ring-offset-2` — a 4 px outset glow with a 2 px gap, the opposite of Carbon's 2 px inset outline, applied to the two primary buttons of the auth pair and copied inline onto both map viewports (`SeatMap.tsx:2571`, `ViewerSeatFinder.tsx:1276`). Four more outset `ring-2` sites and seven `ring-2 ring-inset` sites use box-shadow rather than `outline`, so they vanish in forced-colours mode. The zone-chip ring at `ViewerFindPalette.tsx:424` follows its `rounded-full` radius. The correct Tailwind form already exists at six sites (`FloorRoster.tsx:122`, `SeatInspector.tsx:236,301,1009,1382`, `MapStatusBand.tsx:58`).
- **DS-7** — motion: `duration-200` on the raster's dim transition (`SeatMap.tsx:3040`, table value is 240), 500 ms entrance keyframes on the auth pair (curve is Carbon's), `lib/animateValue.ts` defaulting to 250 ms cubic-out with no caller, and the 3000 ms linear skeleton sweep in the Phase 3 sheet (correctly reduced-motion gated; changing it means amending both copies).
- **DS-8** — the two live all-caps eyebrows in the find palette (`ViewerFindPalette.tsx:74`, `tracking-[0.12em]`), and `text-white` ×12 as the only literal Tailwind colour (pinned deliberately by `tests/accessibility-source.test.mjs:1321`; a `--sp-text-on-brand-fixed` token would keep the intent and lose the literal).

**DS-4** is a hierarchy failure on one dialog: `AdminManagementPanel.tsx:719` makes "Discard changes" the primary of the dirty-close alert, while `SeatMapDialogs.tsx:265-277` implements the same situation with Discard at secondary weight and cites PHASE3DS §1.24. **UX-4** is the same shape: the restore-snapshot confirm is `cds-btn--primary` where the deactivate confirm is `cds-btn--danger`.

**Enforcement gap.** None of the grid, type, radius-on-chips, focus-geometry, motion-duration or `rgba()` rules has a test; `phase4-token-layer-source` and `accessibility-source` cover tokens, hexes and reduced motion only. The auth pair can drift further without a red build.

---

## 6. Security

### 6.1 Verified sound

- **Action gate complete and machine-enforced.** All 21 exported functions in `app/actions.ts` call `requireAdmin()` / `requireAdminContext()` as their first `await` (lines 154, 359, 437, 546, 630, 671, 707, 729, 749, 771, 788, 807, 829, 853, 918, 962, 1010, 1028, 1092, 1144, 1217). `tests/require-admin-guard-source.test.mjs` enumerates exported actions from the AST and asserts the gate is the first await, so a new action is covered automatically. `app/actions.ts` is the only `"use server"` file.
- **RLS.** Enabled on all seven tables; no policy names `anon`. Effective matrix: `seats` — viewer selects `layer='published'` rows only; `employees` — no viewer access at all (`20260724170000`); `published_employees` — select only, writes closed at policy and grant layer (`20260805140000:28-29`); `publish_events` — admin select + insert, no update/delete for anyone (append-only audit); option tables — viewer selects `active = true`; `profiles` — viewer selects own row, no insert/update/delete policy, admin update only (`005:11-17`), rows created by the `SECURITY DEFINER` trigger with `'viewer'` hard-coded. No privilege escalation path.
- **RPCs.** Every mutating RPC re-checks `app_private.is_admin()` and raises `42501`; every migration pairs `revoke all … from public, anon, authenticated` with `grant execute … to authenticated`; the one historical gap was closed by `20260820120000_revoke_anon_reset_draft_execute.sql`. Only `publish_seat_map` is `SECURITY DEFINER`; the rest are invoker so RLS applies to the caller too.
- **Layer isolation.** No action accepts `layer`; `createSeatAction` hard-codes `draft`, `deleteSeatAction` constrains on `layer/is_custom/employee_id/status` and re-checks the deleted row count, `normalizeRestoreSeat` throws on a non-draft row and rewrites `layer`. Viewer pages (`app/(shell)/page.tsx:47,55`, `my-seat/page.tsx:42,50`, `reception/page.tsx:55,63`, `layout.tsx:40,69,77`) read published + snapshot only; `tests/rls-execution.test.mjs:41-52` evaluates the policies as `authenticated`.
- **Auth flow.** `safeNextPath` (`lib/authMessages.ts:90-106`) rejects non-`/` prefixes, `//`, every C0 control, DEL and backslash, then re-parses against a sentinel origin; it is the single choke point for both callback routes and the client form. No account-existence oracle; `shouldCreateUser: false`; `?error=` text is mapped, never echoed; inputs are name-less and the submit ships disabled pre-hydration.
- **Middleware** is refresh-only, bounded by a 5 s race, validates JWTs locally with a memoised JWKS, skips cookie-less requests, makes no authorization decision and sets nothing the app trusts.
- **Publish guard** fails closed; `NODE_ENV` is not an input; the refusal is returned as `PUBLISH_BLOCKED`.
- **Fences** are server-enforced inside the transaction on publish, import, restore, reset, per-seat update and swap; `MLS02` is dispatched on SQLSTATE, not message text; the publish RPC locks draft rows `for update … order by id` before checking the fence.
- **No XSS sink.** The two `dangerouslySetInnerHTML` uses inject a constant theme-boot script; no `innerHTML`/`eval`; every dynamic `href` is an internal path built with `URLSearchParams` or a fixed-prefix `mailto:`; `ilike` input is escaped.
- **Secrets.** `OPENAI_API_KEY` is read server-side only; the only `NEXT_PUBLIC_*` names are the three documented; the seeded test password cannot reach a hosted project (`[db.seed] enabled = false` with the PR #251 incident written up in `config.toml:67-78`; `db:seed` shells `docker exec` with no connection string); OpenAI diagnostics are redacted before logging.
- **CSV** export guards formula triggers on every cell including headers and strips the guard losslessly on import; headers are whitelisted and every cell is length-bounded through `lib/schemas`.
- **Error boundaries** render only `error.digest`. **Headers** are configured, served (verified with `curl`) and pinned by `tests/security-headers-source.test.mjs`. **CI**: `permissions: contents: read`, every action pinned to a SHA, `persist-credentials: false`, no `secrets.*` reference, `allowScripts` allowlist.

### 6.2 SEC-1 — `seats.notes` is on the wire for viewers (Required)

The seats policy is `using (layer = 'published' or is_admin())` (`005_policy_advisor_cleanup.sql:52`) and the grant is table-wide (`20260727190000_declare_table_grants.sql:55`); there is no `grant select (columns)` anywhere in the migrations. `publish_seat_map` copies `notes` into the published layer (`20260901120100:232,246`). The only thing keeping admin free text off a viewer's screen is `lib/viewerSeatColumns.ts`, which is a client-of-the-API choice: a viewer holding their own JWT and the public anon key can request `GET /rest/v1/seats?layer=eq.published&select=label,notes` directly. `CLAUDE.md`'s statement that RLS enforces the viewer model independently of the app is not true for this column.

Remedy options: strip `notes` from the published copy in the publish RPC (viewers never render it, so nothing is lost); or move notes to an admin-only table; or issue a column-level grant plus an admin RPC for notes. The first is a one-line migration and closes the gap without touching RLS.

### 6.3 SEC-2 — session cookie without `httpOnly` (Required)

`lib/supabase/cookieOptions.ts:22-27` returns `{ secure, sameSite: "lax", path: "/" }`; lines 10-15 explain that the browser client writes the cookie through `document.cookie`, so `httpOnly` cannot be set from here and a server-side sign-in is "tracked separately". With `next.config.js:24` at `script-src 'self' 'unsafe-inline'` (SEC-4 in the Consider table), the CSP is not a second line of defence, so any script injection — none was found today (§6.1) — becomes theft of an access + refresh token pair with about 13 months of validity. Remedy: move sign-in to a server action or route so `@supabase/ssr`'s server client sets the cookie with `HttpOnly`, then retire the browser sign-in path; separately, thread a per-request nonce through `proxy.ts` and drop `'unsafe-inline'`.

### 6.4 Consider-level items

SEC-3 raw Postgres text in four action returns (map to fixed copy the way the `23514` arm at `app/actions.ts:514-523` already does); SEC-4 Ask Planner limiter in-memory per instance and a 110 s worst-case loop with no `maxDuration`; SEC-5 CSP `connect-src` wildcard on a missing env var (return `'self'` or throw at build); SEC-6 `search_path` without `pg_temp` (unreachable through PostgREST, cheap to fix); SEC-7 upload bounds client-side only and `updateSeatAction`'s `status` unparsed until the enum cast. Ask Planner's prompt-injection surface was reviewed: admin-authored names reach the model, the response schema is strict, highlights are validated against real seat ids, output renders as React text nodes, the tool dispatcher has no write and no database handle, and `notes` is deliberately excluded from the prompt. Residual risk is model-authored copy in the app's own voice, which requires admin rights to plant.

---

## 7. Correctness and architecture

### 7.1 Verified sound

Zero `any`, `as any`, `as unknown as`, `@ts-ignore`, non-null assertions, `TODO`/`FIXME`/`HACK` in `app/`, `components/`, `lib/`. All ten `eslint-disable` comments carry a written reason. Every `export` in `lib/` (96 names) has a runtime importer or an in-module use. TS-to-SQL lockstep holds for all eleven RPC call sites (`update_draft_seat` 14/14 params, `swap_draft_seat_assignments` 4/4, `deactivate_employee`, `rename_/delete_department`, `rename_/delete_zone`, `import_assignments_csv` 3/3, `restore_draft_snapshot` 3/3, `reset_draft_seats_to_published`, `publish_seat_map` wrapper + definer). `fetchAllRows` uses inclusive ranges and asserts count-versus-length so a server cap below the page size cannot truncate silently. Date formatting pins `America/Los_Angeles` and guards `NaN` and negative elapsed. The navigation watchdog disarms on route commit and the unsaved-edits veto is evaluated before the skew check. Seat protection is enforced three deep (TS predicate, conditional delete with row-count check, SQL trigger). `lib/viewerSeatColumns.ts:22-27` pins at type level that `notes` can never enter the viewer column list. The concurrency-fence details `CLAUDE.md` warns about (per-row map, verbatim timestamps) are intact.

### 7.2 Required defects

- **COR-1.** `lib/viewerFilterGroups.ts:41` counts chips with `seatDepartment(seat)`, which `SeatMap.tsx:2736` supplies as `seat.employee?.department ?? seat.department ?? ""`; `lib/seatFilters.ts:96-98` filters with `seat.employee?.department ?? ""`. A draft seat with no occupant and a legacy `seats.department` value counts toward a chip that, when pinned, excludes it. That is verbatim the failure `lib/seatFilters.ts`'s header says the module exists to make unrepresentable, and `lib/viewerSeatSearch.ts:125-131` (audit finding E1: "departments belong to people; `seats.department` is legacy zone data and must never be aggregated as a department") is a third, contradicting rule on the same screen. Remedy: one `seatDepartmentValue(seat)` in `lib/departments.ts` encoding E1, consumed by the predicate, both `buildViewerFilterGroups` call sites and `ViewerSeatFinder.getSeatDepartment`.
- **COR-2.** `validateSeatCoordinates` (`lib/validators.ts:25-27`) is `normalizePoint`, whose `clamp` maps `NaN` to `0` (`lib/seatMath.ts:9-12`). Server-action parameter types are erased at runtime, so `createSeatAction` (`app/actions.ts:366,369`) accepts `x: NaN` or `x: "abc"` and returns `ok: true` with a seat at the top-left corner; the DB CHECK cannot catch it because 0 is in range. `normalizeRestoreSeat` (`:278`) sits under a comment saying a failure here "means tampering or corruption" and throws for every other field. Remedy: `parseCoordinate` in `lib/schemas.ts` rejecting non-finite and out-of-`[0,1]` values; return `VALIDATION` from create, throw from restore; keep `clamp` for render-time drift.
- **COR-3.** `runManagementOp` (`AdminManagementPanel.tsx:132-145`) sets a single shared `busyOp` and clears it unconditionally in `finally`. Seven call sites share it; `saving = pending && busyOp === "employee-save"` and `busy={pending && busyOp === "management-confirm"}` are the only spinner/disable discriminators. An `adopt-department:…` op still in flight when Save is pressed will, on completion, null the token and re-enable Save while the employee write is in flight. Remedy: `setBusyOp(current => (current === op ? null : current))` and refuse a new op while one is active.
- **COR-4.** `SeatMap.tsx:797-803` inlines the overview fit with a 16 px inset charged to both axes; `lib/mapViewport.ts:44-65` documents the 24 px height-only gutter and the 2026-07-28 regression (two seats losing their bottom edge at 1024) it prevents. `fitMapWidth` is not in `SeatMap`'s import list; `tests/map-viewport.test.mjs` covers a function the admin map never calls. Remedy: call `fitMapWidth`.

### 7.3 Decomposition (ARC-1, ARC-3, ARC-4, ARC-5, ARC-6)

`SeatMap.tsx`: 3,436 lines; one component body from line 269 to 2864 plus 571 lines of JSX; 46 `useState` declared in a 117-line block (279-396); 14 `useRef`; 32 `useEffect`; 21 `useMemo`; 11 `useCallback`; 61 named inner functions. Counting the hooks it consumes, `/admin` holds about 70 independent state atoms. The risk register's R-02(a) recorded 3,406 lines on 2026-08-12 as "open, improving"; it has grown by 30 since.

The next cohesive clusters, each a closed set of state, effects and handlers with a narrow interface:

| Extract | Lines | Moves out |
|---|---|---|
| `useMapViewport()` | 369-384, 546-570, 781-866, 1594-1681, 1722-1862, 2612-2714 | zoom, pan, visible range, overview width, marker-edge placement — about 450 lines, zero coupling to draft data; also the natural home for COR-4's fix |
| `useInspectorGuard()` | 130-166, 335-338, 1262-1457 | the unsaved-edits veto state machine and its seven `apply*Action` branches |
| `useSeatModes()` | 385-393, 1816-1930, 2007-2188, 2297-2374 | swap / move / add / delete modes, targets and commits |
| `useMapDeepLink()` | 1012-1086 | the read-once mount effect and the debounced `replaceState` writer — the exact twin of `ViewerSeatFinder.tsx:916-961` |
| `<MapCanvas>` | 2865-3250 | plan image, marker layer, trail, zoom control — props-only, memoisable |
| `mapStyles.ts` / `seatMapNotices.ts` | 2460-2611, 2829-2864 | nine class-string builders (two of them dead, N-1) and the five-push notice chain, which should become a dispatcher |

`ViewerSeatFinder.tsx` (1,617 lines, 26 `useState`, 19 `useEffect`) duplicates the admin's pan handlers, scroll-to-point, fit-set, deep-link, palette shortcuts and Escape ladder with drift in each: it re-implements `hasPassedPanThreshold`, `panScrollTarget`, `clampScroll`, `scrollTargetForPoint` and `boundingBoxCenter` from `lib/mapViewport` by hand (`:679-714`, `:763-808`), which puts the viewer's scroll and fit math outside `.c8rc.json`'s `lib/**` coverage floor while the tested originals sit unused beside it. `uniqueOptionNames` (`SeatMap.tsx:249-258`) and `uniqueVisibleOptions` (`ViewerSeatFinder.tsx:134-143`) are byte-identical under two names. First cut: import the five helpers on the viewer and delete the inline copies (no new abstraction); then extract `useMapDeepLink` and `useFindPalette` as the two shared hooks.

`usePublishReview` takes 14 parameters, eight of them setters, so the publish flow's ownership still sits in `SeatMap`; four independent in-flight flags (`SeatMap.tsx:398`, `useDraftHistory.ts:89`, `useSeatDraftActions.ts:55`, `SeatInspector.tsx:337`) gate one draft mutation, and `InspectorGuardDialog` is handed `SeatMap`'s flag (`:3395`) while the write it triggers runs in the inspector's transition via `form.requestSubmit()` (`:1399-1407`). One `useDraftMutationGate()` owning a single token would let every dialog gate on one truth.

`SeatInspector.tsx` is a 1,150-line function with 11 `canEdit` branches and 13 no-op callback defaults, shipping the whole edit path to the viewer at `canEdit={false}` (PERF-2). `lib/mapOperationsAgent.ts` holds map context + tools, response validation, deterministic intent shortcuts, the OpenAI wire protocol and the orchestration loop in one 1,376-line module; splitting it would also give a home to the nine exports that exist only for tests and have no test.

### 7.4 Duplication (ARC-2 and Consider items)

Nine helpers answer "what is this seat's zone" with four different null fallbacks (`""`, `NO_ZONE_LABEL`, the literal `"No zone"`, `null`, lower-cased `""`), across `lib/seatFilters.ts:43`, `lib/viewerFindPalette.ts:23`, `lib/viewerSeatSearch.ts:116`, `lib/publishSummary.ts:47`, `lib/seatLabels.ts:20`, `lib/mapOperationsAgent.ts:193,197`, `lib/mapLayoutTransform.ts:170`, `components/seat-map/useSeatFilters.ts:26`, `AdminManagementPanel.tsx:63`. The live consequence: `lib/seatFilters.ts:57-63` documents that every consumer must treat a null zone as `NO_ZONE_LABEL`, the predicate in the same file compares through `seatZoneValue` which returns `""`, and the palette chip built from `viewerFindPalette.ts` returns `NO_ZONE_LABEL` and is wired straight into `setZone` (`SeatMap.tsx:3376-3379`) — pinning "No zone" on `/admin` matches nothing. Reachability is narrow today (no write path nulls both columns), so this is Consider rather than Required; the fix is one `seatZoneValue(seat, { fallback })`. `NO_DEPARTMENT_LABEL` is exported from `lib/floors.ts:198` and the literal is hand-written in five other places. `lib/receptionDirectory.ts:105-108` compares departments raw while everything else goes through `departmentKey`.

### 7.5 Error handling

Boundaries exist for every segment (`app/error.tsx`, `global-error.tsx`, `(shell)/admin/error.tsx`, `(shell)/reception/error.tsx`) and a `loading.tsx` for all eight route segments. Two consistency gaps: `app/global-error.tsx:72-74` is the one boundary without `planChunkErrorRecovery`, so a stale-chunk failure from the root layout's client subtree leaves a "Try again" that cannot work (the test at `tests/chunk-recovery-boundary-source.test.mjs:17` lists three files and excludes this one); and `/` and `/my-seat` have no `(shell)`-level boundary, so a `fetchAllRows` throw on the viewer falls to the document-level card and loses the rail, while `/reception` keeps it.

---

## 8. Performance

### 8.1 Verified sound

- One `auth.getUser()` and one `profiles.role` read per server render of any `(shell)` route, through `cache()` in `lib/serverAuth.ts:21`; middleware does zero network auth work in the steady state; each action calls `requireAdmin()` once.
- Every page loads its sets in one `Promise.all` (or `allSettled` on Reception, with the correct rethrow-only-on-the-directory split); no query inside a loop anywhere; stitching is by `Map` in memory.
- `SeatMarker` is `memo`'d with a comparator that walks `Object.keys(next)` (new props are covered automatically) and compares an explicit five-field seat list pinned by `tests/seat-marker-memo.test.mjs`; `onSelect` is routed through a latest-value ref so its identity is stable; keys are `seat.id`; pan is pointer-capture with direct `scrollLeft` writes; `getBoundingClientRect` is called once per discrete pointer event, never per frame.
- The map image is `priority` + `fetchPriority="high"` + `placeholder="blur"` with explicit dimensions on both surfaces, 176 KB for 3822×1734, cache-busted (`?v=map-v2-cool-2x-3822x1734`) with the `localPatterns` pin guarded by `tests/map-image-pin-source.test.mjs`, and pre-warmed from the login page with `fetchPriority="low"`.
- Fonts: four vendored files, one variable sans axis, `display: "swap"`, shared by the root layout and `global-error`.
- The viewer does not ship `SeatMap`; `lib/mapOperationsAgent.ts` is imported only by the server-action module; no date, icon or utility library in any bundle.
- No Supabase Realtime; one 5-minute interval (deploy-skew check) with focus/visibility triggers and full cleanup; every `setTimeout` and `requestAnimationFrame` has a matching cancel.
- `EmployeesTable` and the palette's browse feed are windowed; `getPublishHistoryAction`'s `limit` is clamped to 1..25; whole-log reads are documented with a re-rule trigger.

### 8.2 PERF-1 — the shell's draft indicator double-loads every admin route (Required)

`components/ui/AppShell.tsx:257-263` fires `getDraftStatusAction()` after hydration on every `/admin/*` mount; `app/actions.ts:1145-1188` then runs `requireAdmin()` (a second `getUser()` and `profiles` read) and four `fetchAllRows` reads — draft seats and published seats with `*, employee:employees(*)`, `employees`, `published_employees` — to compute a change count for the header pill. `/admin/settings` therefore costs 2 paged reads server-side plus 4 client-side plus a second auth probe for a page of five buttons; `/admin/management` the same on top of its four. These routes are `force-dynamic` with `revalidate = 0`, so every rail click pays it twice, and the indicator is the last thing to settle. Remedy: return `changeCount` from the server page as a prop (both pages already hold the draft side) or add a narrow count RPC.

### 8.3 Consider items

PERF-2 — no `next/dynamic`, `React.lazy` or `Suspense` in the app; `AskPlannerDrawer`, `PublishReviewSheet`, the six `SeatMapDialogs` and `SeatInspector` are all static imports gated behind `&&`, so the call sites need no restructuring to split them. PERF-3 — `scroll` is bound unthrottled (`SeatMap.tsx:827`), commits state about every 3.8 px of pan, and `dimmedSeatIdSet` (`:2637`, the lint warning) is rebuilt per render so `namedSeatIdSet` and `nameLabelNudges` recompute the O(n²) collision graph each frame while names are on; invisible at 60 seats, ~250 k operations per render at 500; `useVirtualListWindow.ts:92-97` already shows the `requestAnimationFrame` coalescer. PERF-4 — the layout's two sequential "my seat" reads on every signed-in render, `getDraftMapPayload`'s serial awaits, and the four unbounded `select("*")` option reads that bypass the `fetchAllRows` invariant. PERF-5 — publish revalidates `/` and `/admin` but not `/reception` or `/my-seat`.

---

## 9. UX patterns and accessibility

### 9.1 Verified sound

- **Interruptions.** No `window.alert`/`confirm`; every dialog opens from a click or a URL parameter (a user action); background completions land in `role="status"` regions; every dialog renders its own failure inside its body and takes focus once settled (`useSettledErrorFocus`), fixing the documented "banner under the scrim" bug; no tearsheet chains into a modal.
- **Destructive actions** are proportional: low-impact seat actions confirm with the publish-impact note; department/zone/employee deletes name the affected count; CSV import and snapshot restore are review-before-mutate with counts, row-level issues and fences captured at parse time; publish is a full per-seat diff tearsheet; every confirm stays mounted through the round-trip with a present-participle label and relabels to "Retry …" on failure (pinned by `tests/pending-state-source.test.mjs`); success notifications follow every mutation.
- **Forms.** No "Submit"/"OK"/"Yes"/"No" anywhere; verbs throughout; secondary-first footers at the bottom; required marks the minority (`aria-hidden` marker plus a real `required`); every validating field wires `aria-invalid` + `aria-describedby`; unlabelled search fields carry `aria-label`; inputs are `readOnly` (not `disabled`) while saving.
- **Search and filters.** Every search publishes a count including zero (`MapControlRow.tsx:75`, `ViewerFindPalette.tsx:304-308`, `FloorRoster.tsx:134-142`, `EmployeesTable.tsx:213`, `ReceptionScreen.tsx:305`, `PublishLogTable.tsx:104,171`), with distinct first-run versus no-match empties and a next step in each; filter categories live in a 256 px rail of `fieldset`/`legend` groups with per-item counts, a per-group Clear and a global Clear all; the panel pushes content and closes on Esc.
- **States.** Eight `loading.tsx` skeletons (`aria-hidden`, reduced-motion safe); boundaries on every segment; every empty state names a next step and forks copy on role; Reception's partial-data state is modelled (`allSettled`, blanked seat cells, a `role="status"` warning); overflow paginates with an announced count or scrolls inside focusable regions.
- **Keyboard.** Roving tabindex on the marker layer with arrow/Home/End resolved spatially by `lib/seatKeyboardNav.ts` (`LATERAL_PENALTY` walks the pod row before jumping), enforced on both surfaces by `tests/accessibility-source.test.mjs:286`; a layered Escape ladder guarded by `isEditableTarget`; the skip link is the first focusable with per-surface targets; dialog focus is trapped, initial-focused and restored, with `tests/dialog-initial-focus.test.mjs` covering the busy-mount, body-drop and unmount-on-settle cases; the only clickable non-button is a scrim with an Esc equivalent; Reception rows are `role="option"` under `aria-activedescendant` (not a third tab stop per employee); all ten icon-only buttons are labelled; 28 `aria-live` regions, always mounted so they announce, `assertive` only for errors.
- **Read-only.** The viewer omits admin controls rather than disabling them; the disabled Publish button states its reason in a visible sibling wired by `aria-describedby`, and the pattern is repeated on the inspector's save and Undo/Redo; the invalid-target marker is `aria-disabled` with the reason in its name.

### 9.2 UX-1 — nested `aria-modal` (Required)

`AdminManagementPanel.tsx:681-707` mounts `EmployeePanel` (`role="dialog" aria-modal="true"`, `EmployeePanel.tsx:83`); `:709` mounts `CarbonModal` (`aria-modal="true"`, `CarbonModal.tsx:112`) over it for the dirty-close question; `:738` mounts `ManagementConfirmSheet` (`aria-modal="true"`, `ManagementConfirmSheet.tsx:73`) over it for Deactivate. With two concurrent `aria-modal` nodes, which subtree assistive technology confines the reader to is implementation-defined, and some expose the occluded panel's fields. The Tab trap itself is correct (listener on the dialog node, DOM siblings), so this is an AT-semantics defect. `CarbonModal.tsx:5-7` records a ruling that a modal over a side panel is allowed while `ManagementConfirmSheet.tsx:15-16` asserts the converse for tearsheets — the two comments disagree. Remedy: `inert` (or drop `aria-modal`) on the outer panel while an inner dialog is mounted, and one test asserting at most one `aria-modal="true"` in the tree.

### 9.3 Consider items

UX-2 — `MapControlRow.tsx:57` renders the Filters chip only when `appliedCount > 0`, so at zero the only door is the header hamburger (`AppTopBar.tsx:72-87`), whose glyph says "menu" and whose label says "Filters", and which is the one header control without the tooltip its siblings carry. UX-3 — discard-everything and restore-snapshot are the two irreversible high-impact actions; both confirm with consequences and Restore offers export-first, but neither asks the user to type anything and no ruling records that review substitutes; worth deciding deliberately. UX-4 — restore confirm at primary weight where the deactivate confirm is danger. N-4 — two `nav` landmarks named "Sections" below 1055 px (not reachable at the 1920×1080 target).

---

## 10. Tests, lint and documentation

- **Suite.** 1,489 Node tests across 146 files including the PGlite tier that executes the real migrations as owner and as `authenticated`; the jsdom component tier; and the harnesses in `tests/helpers/` (both well-documented). `lib/**` sits at 98.4 / 92.4 / 98.3 / 98.4 against floors of 90 / 80 / 95 / 90.
- **TEST-1.** `CLAUDE.md:90` scopes `*-source.test.mjs` to four guardrail families; there are 40, and several pin text rather than properties: `settings-affordance-source.test.mjs:36` pins `onClick={() => inputRef.current?.click()}` verbatim (renaming `inputRef` fails the build), `:39-40` pins four statements and their whitespace, `:18-21` pins button copy; `role-fitted-tabs-source.test.mjs:31` pins a config object's source; `pending-state-source.test.mjs:249,309` pin a Tailwind class and a string; `status-label-source.test.mjs:37` pins a variable name. Each converts a rename or reflow into a red build whose message names no user-facing property. The intent is usually sound; assert the property (through `test:ct`, which is already wired) instead of the text.
- **TEST-2.** `lib/draftStatusEvent.ts` (the wire from a Management save to the shell indicator, and the fix for a documented prod finding) and `lib/floorGeometry/floor2.ts` have no test; both are inside the coverage `include` and drag the floor rather than being exempt. `lib/adminPageGuard.ts` has only a source-text test.
- **LINT-1.** 58 warnings in shipped code and CI passes on warnings. The 34 `set-state-in-effect` hits include the six prop-mirroring effects at `SeatMap.tsx:648-653` (`useEffect(() => setLocalSeats(normalizeSeats(seats)), [seats])` and five siblings — a one-render stale flash and a double render on every server refresh; derive during render or key the subtree), and clusters in `ViewerSeatFinder`, `SeatInspector`, `ShellPanels`, `AppShell`, `LeftPanel`, `LoginForm`, `PublishLogTable`, `useDraftHistory`, `useVirtualListWindow`. The 22 unused variables include seven derived strings computed on every `SeatMap` render and never read (`searchStatusSummary`, `resultEmptyTitle`, `resultEmptyDescription`, `undoTitle`, `redoTitle`, `draftStatusLabel`, `draftStatusTitle`, lines 2376-2427), `handleResetEdits` in `SeatInspector.tsx:501`, `VIEWPORT_NATIVE_SCROLL_KEYS` in two files, the `focusRingClass` import at `SeatMap.tsx:86`, and two parameters in `useSeatFilters.ts:37-38`. Recommend `--max-warnings 0` on the lint step once cleared.
- **DEAD-1.** `Button`, `IconButton` and `StatusBadge` in `components/ui/design-system.tsx` are exported and rendered nowhere (only `cx` and `focusRingClass` are imported from that module) — and they are the file with the off-ladder heights, the glow ring and a colour-only status badge whose `warning` tone maps to the Draft purple. `lib/animateValue.ts` has no caller. Delete or wire.
- **DOC-1.** `CLAUDE.md:38-39,141` send every session to `app/page.tsx` and `app/admin/page.tsx`, which do not exist (`app/(shell)/page.tsx`, `app/(shell)/admin/page.tsx`); `:66` cites `tests/app-rail.test.mjs`, which does not exist (the contract lives in `app-top-bar` and `app-shell`); `:56` and `:21` omit `/my-seat` from the matcher and route lists (`proxy.ts:25` and `tests/auth-session-source.test.mjs:102` include it); `:72,88` omit `reset_draft_seats_to_published`. The five spot-checks that came back clean: `staleTimes.dynamic = 120`, the two-row `HEX_LEDGER`, the publish-guard decision table, `lib/floorIds.ts` mirroring the SQL CHECK, `SWEPT = {1,2,3,4}`.

---

## 11. Status of previously open risks

From `docs/RISKS.md` (status refreshed 2026-08-12):

| ID | Then | Now |
|---|---|---|
| R-02(a) `SeatMap.tsx` god component | open, improving — 3,406 lines | **open — 3,436 lines** (+30); extraction map in §7.3 |
| R-07 seat create/delete plain writes | mostly resolved, low residual | unchanged; `createSeatAction`/`deleteSeatAction` still carry no fence (acceptable per the register's reasoning) |
| R-13 free-text departments | open, deliberate | unchanged; COR-1 and ARC-2 are downstream of it |
| R-16 `Employee ${id}` UUID fallback | still open | **still present** at `lib/publishSummary.ts:55` |

From `docs/redesign-v2/phase5/PHASE5.md` (PR 5): "the PR 5 / PR 4 rigs, runtime audit and the real-Chrome brand checklist were not run before merge … owed as a post-merge check on `main`." This audit ran the computed-token half of the checklist in real Chromium on `/login` in all four theme states (§4.1) and it passes. The five consumer-bar measurements in `pr5-dark-edges.mjs`, `pr4-reception-locked-row.mjs` and the runtime audit still need the Docker stack and remain owed.

---

## 12. Not verified

- The live Supabase project's policies, grants and `EXECUTE` privileges (everything in §6 is read from the migration files); production GoTrue settings.
- Authenticated flows (`test:e2e:auth`), the Phase 5 rigs, and every admin-only surface in a real browser — no Docker.
- Bundle sizes and Core Web Vitals under production traffic; §8 is read from code.
- Contrast of the invalid-target pill and the tinted origin pill against the plan raster at zoom extremes (not in any rig).

---

## 13. Recommended order

1. **BR-1** — brand-file overrides for the two `--sp-status-search-*` tokens (three blocks, six lines), plus a resolved-value guard. Closes the only hard-rule break.
2. **COR-3** — one-line `setBusyOp` fix. **COR-2** — `parseCoordinate` at the boundary. **COR-1** — one `seatDepartmentValue`. **COR-4** — call `fitMapWidth`.
3. **SEC-1** — drop `notes` from the published copy in the publish RPC (one migration).
4. **BR-2** — owner ruling on the dark focus ring; **BR-3** — ghost weight for the in-row tertiary; **BR-4** — replace the rig's blue rows with the brand rows and add the dark focus surfaces.
5. **UX-1** — `inert` on the outer panel; **DS-4** / **UX-4** — button weights; **PERF-1** — change count from the server page.
6. **DS-1 → DS-3** — migrate the auth pair onto the Phase 3 sheets (or delete the dead zone classes and re-spec the login panel with a token); replace the six glow rings with the inset outline already used elsewhere.
7. **LINT-1 / DEAD-1 / DOC-1** — clear the 58 warnings, delete the unused primitives and `animateValue`, fix the codebase map, then `--max-warnings 0`.
8. **ARC-1** — import the five `lib/mapViewport` helpers on the viewer and delete the inline copies; extract `useMapViewport()` from `SeatMap`.
9. **SEC-2** — server-side sign-in so the cookie is `HttpOnly`; nonce-based CSP.
10. The Consider list, in the order it appears.
