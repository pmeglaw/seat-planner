# Seat Planner redesign — Phase 1: Information Architecture

**Status: signed off by the owner 2026-09-02; amended the same day with rulings 17–24 (section C, second table)
after a conformance review and mockups.** Companion to `DECISIONS.md` (D0–D4, D1′), which stays the
decision log; this file is the IA layer beneath it and the Carbon conformance record for Phase 1.
The amendments are applied in `DECISIONS.md` (D0-a…e, D1-a/b, D5, D6, §6 nos. 11–14, §8 Q7).

## Context

The redesign runs as a strict sequence: **1 IA → 2 UX/wireframes → 3 UI design system → 4 code**.
This file is the Phase 1 deliverable. **No code, wireframes, tokens, or components were produced in
Phase 1.** Phase 2 starts from section B as the fixed IA.

Inputs (read 2026-09-02): IBM skill (`SKILL.md`, `references/ui-shell.md`, `senior-workflow.md`,
`composition.md`); `docs/redesign-v2/DECISIONS.md` on `main` (D0–D4, D1′; §8 Q1–Q6 all closed);
multi-floor plan `C:\Users\JP\.claude\plans\shimmying-napping-sparrow.md` (PR-1 #495 + PR-2 #497 merged,
PR-3 admin unbuilt at the time of the sweep — **merged as #498 later the same day**, slice B blocked on the 2nd-floor drawing); three read-only codebase sweeps
(routes/chrome, schema/RPC/actions, per-surface state). Off-limits, not read: `docs/redesign` branch,
`docs/design-system/AUDIT*.md`, `PLAN.md`, shell-reference mockup.

Owner rulings this session (2026-09-02, 16 answers) are recorded in section C and folded into B.
A second pass the same day (rulings 17–24, section C) was made against the conformance review and the
"Seat Planner Shell Mockups" canvas (pages: E2.5 Filters; E2.1–E2.2 Shell panels); it is folded into B, E and F.

---

## A. Current IA (as-is, `main` @ d70d4a6; PR-3 #498 merged the same day — see B6 note)

### Routes

| URL | Access | Gate | Chrome | Reads |
|---|---|---|---|---|
| `/` | any signed-in | `getUser` → `/login?next=/` (`app/page.tsx:31`) | viewer's OWN 36px header, no rail | published seats, `published_employees`, live options |
| `/my-seat` | any signed-in | own `getUser` | none; only via AccountMenu | published only, identity = email match |
| `/reception` | any signed-in | `getSessionContext` | `(shell)`: AppTopBar 40px + AppRail (viewer mode = Reception + Viewer) | published only |
| `/admin` | admin; viewer gets in-page card | `getAdminPageContext` | `(shell)`; SeatMap portals into bar slots | draft + published seats, live `employees`, snapshot, options |
| `/admin/management?tab=` | admin | same | `(shell)` | tabs employees / departments / zones / publishHistory |
| `/admin/settings` | admin | same | `(shell)` | CSV / JSON snapshot / reset draft |
| `/login`, `/auth/*` | anon | — | none (D4) | — |
| `/api/build-id` | anon | — | — | — |
| `/concepts/*` | build flag | `prototypesEnabled()` | own | fixtures |

### Chrome
- Two implementations: `(shell)` = `components/ui/AppShell.tsx` (`AppTopBar` 40px + `AppRail` 48px/208px overlay); viewer hand-rolls its own header in `ViewerSeatFinder.tsx:1429`. `/my-seat`, `/login`, `/auth/update-password` have none.
- Rail `NAV_ITEMS` (`AppRail.tsx:87-95`): Seat map `/admin` · Management · Settings · Reception; then Ask Planner (admin); then Viewer `/`.
- Four hand-synced enums keyed on `AppRailActive`: `NAV_ITEMS`, `SKIP_LINKS`, `SECTION_TITLES` (`AppShell.tsx:107-122`, `AppTopBar.tsx:28-33`) + `GUARDED_NAVIGATION_HREFS` (`SeatMap.tsx:143-151`, fails open). `activeFromPathname` catch-all = `"map"`.
- `/reception` has no own `error.tsx` — fails as "The seat map could not load".
- `useAppShellNavigation` (guard veto + Ask Planner opener) has one caller: SeatMap. `lib/fullNavigation.ts` sanctions exactly three full-document loads.

### URL and persisted state
- URL (all `history.replaceState`, `lib/deepLink.ts`): `?seat=<label>` (`/`, `/admin`), `?floor=2|3` (viewer only; admin `useState("3")` until PR-3; default floor paramless), `?tab=`, `?ask-planner=open`, `?next=`, `?error=`.
- NOT in URL: search query, department/zone/status filters, names toggle.
- localStorage: `sp-theme`, `seat-planner:viewer-floor`, `seat-planner:viewer-names-visible`, `seat-planner:names-visible` (admin, separate key on purpose), `seat-planner:login-email`. sessionStorage: draft undo history, chunk-reload guard. Reception recents in-memory.
- Landing floor precedence (`lib/floors.ts:169`): `?seat=` → `?floor=` → remembered → own seat → Floor 3.

### Roles
- `profiles.role` enum `admin | viewer`; default viewer via `handle_new_user()`; promotion = manual DB edit. No front-desk role.
- Enforcement = RLS + `requireAdmin()` in every action in `app/actions.ts`. Page guards are UX-only.

### Data
- `seats` single table, `layer` draft|published; `floor` text `'2'|'3'` default `'3'`, no index, **no RPC takes a floor** — publish/restore/reset are whole-building with the MLS02 exact per-row fence.
- People: `employees` (admin-only SELECT) vs `published_employees` snapshot (viewer, select-only). Viewer reads `department_options`/`zone_options` live — the documented exception.
- `createSeatAction` never sets floor; CSV import floor-blind (labels building-unique, so it works by label).
- Floor registry code-only: `lib/floorIds.ts` (leaf), `lib/floors.ts` (`FLOORS`, `floorSurface` plan|roster, INTERIM RULE in `rosterFloorForUnseated` only). Floor 2 `plan: null`.
- Vestigial: `seats.department` (nulled in 007, still copied/compared); `public.set_updated_at()` attached to nothing.

---

## B. Proposed IA (ruled 2026-09-02)

### B1. Sections and navigation (D0 header-only shell, taken as fixed)

| Section | Route | Who | Header link |
|---|---|---|---|
| **Seat map** (home) | `/` published · `/admin` draft | everyone · admins | wordmark → `/`; "Seat map" link; **mode switch Published ⇄ Draft in the D0 mode indicator** (admins); indicator informational for viewers |
| **Reception** | `/reception` | any signed-in | link (viewer's one section besides home) |
| **Management** | `/admin/management?tab=employees\|departments\|zones` | admin | link; in-page tabs, no third tier |
| **Settings** | `/admin/settings` | admin | link; CSV import / JSON snapshot restore (kept separate: irreversible ops own a page). **Reset draft retired from Settings — ruling 22.** Snapshot restore gets a confirm-with-consequences dialog (moderate impact). **Q7 ruled 2026-09-02:** the map's "Discard draft changes" (SeatMap overflow menu, `/admin`) stays; it keeps calling `resetDraftToPublishedAction` |

Utilities (ui-shell order, flush right, 48×48, no gaps): **Help · History · Account** — IBM's exact standalone three (History occupies IBM's Notifications slot). **Theme is no longer a utility — ruling 20**; it is a row in the Account panel.
- **Help** = right panel, static content (shortcuts, Draft vs Published, who to ask). No route, no data.
- **History** = right panel: **row one is the Published ⇄ Draft mode switch (admins only)**, then publish events newest-first. The **mode indicator is status only** ("Published · <date>" / "Draft — N changes"; two signals in the mark — square for Published, hollow diamond for Draft — plus text); pressing it opens this same panel. One panel, two triggers. The switch is a **control, not a panel item**, so it may show the current mode (ui-shell's "no selected state" rule is about navigation items). `getPublishHistoryAction` unchanged. Management drops the `publishHistory` tab. Viewers see history Hidden (RLS admin-only) — for them the panel holds only the published date. **Approved against the mockups — ruling 23.** Panel width 320px provisional (Carbon HeaderPanel 256, ibm-products NotificationsPanel 360); Phase 2 settles it.
- **Account** = email + role, **Theme** (Light / Dark / System — ruling 20), **My seat**, Sign out. Section links no longer fold in here at narrow widths: with a hamburger now in the header (ruling 21) they move into the left panel above the filters, as ui-shell describes. The shipped Account-menu fallback retires.
- Right panels (Help, History): one open at a time, anchored to their icon, float over content, no selected state (ui-shell).
- **Ask Planner** is a map-surface control on `/admin` (D2), not shell chrome. Not in the header. Viewer never gets it (ruled).
- **Find me**: viewer affordance on the map that lands on own floor and selects own seat (email match in `app/page.tsx:102-105` already exists). `/my-seat` keeps its route and stays a chrome-free share sheet outside `(shell)` — **deviation 12**.
- **Search** is surface-local **Focused search** (patterns.md): active results within the current floor plus a "whole building" widening affordance with per-scope counts; a unique cross-floor match auto-switches floor (this is also what `?q=` landing relies on). Header search utility slot stays empty; **no global header search — ruling 17.** Reception keeps its own field.
- **Filters** (department / zone / status) live in a **left panel, 256px, hidden by default, toggled by the header hamburger — ruling 21 ("Option A2").** Slide-in: pushes the map, no focus trap; closes on the icon or Esc; open/closed remembered per user. While closed, a **"Filters N ×"** button in the map control row carries the applied count and clears without reopening (patterns.md collapsed-container rule). One clear per category, global Clear all at the top of the panel. Chosen because people filter occasionally; the map keeps its full width by default.
- No navigation rail — the left panel holds filters only (and, below `lg`, the section links above them). No switcher. No breadcrumbs (floor selector is the place marker on the map; sub-pages are one level deep). Note for D0: in other Carbon products the hamburger opens navigation; here it opens filters. Not a deviation (the header-only shell has no nav panel to conflict with), but it is product-specific and is recorded.

### B2. Routing changes
- **URLs unchanged**: `/`, `/admin`, `/admin/management`, `/admin/settings`, `/reception`, `/my-seat`, `/login`, `/auth/*`, `/api/build-id`.
- **Move `app/page.tsx` into `app/(shell)/`** so the one 48px `AppShell` serves `/`. `/my-seat`, `/login`, `/auth/*` stay outside. Proxy matcher already lists every shell route — no change.
- **One route registry** (`lib/routes.ts`, tested): key, href, label, role, skip-link target, section title, guarded. Consumed by header links, left panel (narrow-width links), skip link, `AppTopBar` title, and SeatMap's navigation guard. Retires the four hand-synced enums; `activeFromPathname` gets an explicit match, no catch-all.
- Add an error boundary for `/reception` (own voice).
- Post-login landing: `?next=` else `/` for every role. Viewer requesting `/admin`: in-page "Admin access required" card (as-is); Draft mode Hidden (not disabled) in nav for viewers.

### B3. URL state contract (D0: "view, filters, selection and mode")

| Param | Surfaces | Written | Rule |
|---|---|---|---|
| `?seat=<label>` | `/`, `/admin` | replaceState on selection | wins over `?floor=` (ruled) |
| `?floor=2\|3` | `/`, `/admin` (admin symmetric since PR-3 #498) | replaceState | default floor paramless (e2e pins `/admin$`) |
| `?q=<text>` **new** | `/`, `/admin`, `/reception` | replaceState | landing auto-selects a unique match and auto-switches floor; **this is the person share link** |
| `?dept=` `?zone=` `?status=` **new** | `/` (admin filters dormant since 2026-08-20) | replaceState, written by the filter panel | floor-aware filter ruling (Q5) carries over; zone/status Hidden on roster floors; the "Filters N ×" count reflects these params |
| `?names=1\|0` **new** | `/`, `/admin` | replaceState | URL wins on landing; localStorage keys keep the last choice when the param is absent |
| `?tab=` | `/admin/management` | replaceState | default tab paramless |
| `?ask-planner=open` | `/admin` | link from sub-pages | stripped after open (as-is) |

Never a history entry per state change. Theme and login email stay localStorage. Reception recents stay in-memory (ruled 2026-08-05).
**Copy link** affordance: on a selected seat → `?seat=`; on a person → `?q=<name>`. Backlog DIR-1 closes.

### B4. Layout hierarchy
- `AppShell` (D0): 48px fixed header at every width — **hamburger (48×48, toggles the filter panel; below `lg` the panel also holds the section links above the filters)** → header name: organization name (`body-compact-01`, 14/400) + "Seat Planner" (`heading-compact-01`, 14/600), text not graphic, links to `/` → section links (`lg`+) → **mode indicator** (status only; opens the History panel; one graceful narrow fallback, not per-breakpoint variants — see F) → utilities Help · History · Account.
- Page header: map = none (canvas, fluid to 1911px); Management / Settings / Reception = title + one primary action on the 1584px centred live area (D0 second decision).
- Right panels: Help, History (mode switch + events), Account (Theme, My seat, Sign out). One open at a time; anchored to their icon (icon outlined, panel flows from it); dark like the header; flush right, float over content (ui-shell).
- Left panel: filters (B1). 256px, slide-in, pushes the canvas; hidden by default.
- Map surface control row (one 48px row): floor selector + focused search ("This floor ▾" scope) + **"Filters N ×"** button + result count + Find me + names toggle + mode-specific controls (Ask Planner and Publish in draft mode; Ask Planner drawer is deviation 14). The old popover `FilterPanel` retires (E2.5). D1/D1′/D2 govern the rest — Phase 2 territory.

  **B4 amendment (owner ruling, 2026-09-02, Phase 2 map PR — B4 enumerated the row before the editor's own controls were listed):** in Draft mode the row continues, after a divider, with **Undo · Redo** (ghost icon buttons; tooltips carry the shortcuts; Redo disabled when its stack is empty) · **Add seat** (ghost, with label) · **Ask Planner** (tertiary) · **Publish N changes** (the one primary) · **⋯ overflow** (holds *Discard draft changes* only — last, danger, divider above, disabled when nothing to discard) · **Names** toggle. Reset zoom stays with the canvas zoom/fit control, not in the overflow. The seat inspector is a **400px** slide-in side panel (D2-a, deviation 15). Mockups: "Seat Planner Shell Mockups" canvas, page "Phase 2 Q1–Q2". Recorded in `DECISIONS.md` D2-a / D2-b.

### B5. Permissions matrix

| Surface / action | anon | viewer | admin |
|---|---|---|---|
| `/`, `/reception`, `/my-seat`, Help panel | → login | read | read |
| Draft mode `/admin`, Management, Settings | → login | Hidden in nav; in-page card on direct URL | full |
| Publish history panel | — | Hidden (RLS: `publish_events` admin-only) | read |
| Ask Planner | — | Hidden | `/admin` only |
| Publish | — | — | admin + `lib/publishGuard.ts` env attestation |
| Snapshot restore | — | — | admin; confirm with consequences spelled out |
| Reset draft (Settings) | — | — | **retired (ruling 22)** — Phase 4 removes only the Settings entry in `components/admin-settings/DataUtilitiesPanel.tsx`; `resetDraftToPublishedAction` and the `reset_draft_*` RPC family **stay** for the map's "Discard draft changes" (Q7, ruled 2026-09-02) |

Roles stay `admin | viewer`. No front-desk role (ruled; slot noted, no schema reservation).

### B6. Multi-floor placement
- Floor is an in-page dimension of the map (selector + `?floor=`), never a section. Floor 2 renders the roster surface until slice B lands its raster.
- PR-3 (admin canvas floor scoping, roster from live employees, cross-floor Move/Swap, publish review grouped by floor, `createSeatAction` floor, `?floor=` on `/admin`, Ask Planner floor fields) was ruled "absorbed into Phase 4" in the morning session and then **merged on the current chrome as #498 (D2′) before this amendment landed**. The ruling therefore changes shape, not substance: PR-3's behaviour is an *input* to Phase 2 (admin `?floor=` is live, B3's "PR-3 work" note is moot), and Phase 4 re-homes it on the new shell rather than building it. Slice B stays blocked on the 2nd-floor drawing; its seams (registry entry, geometry file, protected-original seeding) are unchanged.

### B7. Data architecture impact
- **No migration required by the IA.** Floor stays column + code registry; whole-building publish; MLS02 fence shape untouched (any per-floor fetch would break the `count(*)` assertion — do not partial-load the draft).
- Server actions: none added, none removed. **`resetDraftToPublishedAction` and the `reset_draft_*` RPC family stay (Q7, ruled 2026-09-02)** — `SeatMap.tsx`'s "Discard draft changes" menu item still uses them. Phase 4 removes only the Settings call site in `components/admin-settings/DataUtilitiesPanel.tsx` (ruling 22). The MLS02 fence is unaffected. `getPublishHistoryAction` re-homed to the panel; option/employee actions keep `revalidatePath("/")` because viewer options are live.
- `?q=` landing uses the published snapshot only (viewer) / draft payload (admin) — no new read path.
- Deferred cleanups, not IA-blocking: `seats.department` vestigial column; `set_updated_at()` dead function; `GUARDED_NAVIGATION_HREFS` dangling `?tab=publishHistory` entry (retires with the tab).

---

## C. Owner answers (2026-09-02)

| # | Question | Ruling |
|---|---|---|
| 1 | Relation to DECISIONS.md + multi-floor arc | D0–D4 fixed inputs; redesign build absorbs PR-3 |
| 2 | Map: one section or two | One section, Published ⇄ Draft mode in header; URLs stay `/` and `/admin` |
| 3 | Front-desk role | No new role; `admin \| viewer` stays; Reception any-signed-in |
| 4 | URL state additions | `?q=`, filters (`dept`/`zone`/`status`), names toggle — all three |
| 5 | Management sub-nav | Keep `?tab=` in-page tabs |
| 6 | Publish history home | Right panel under the mode indicator |
| 7 | `/my-seat` entry | Account menu + "Find me" on the map; route kept |
| 8 | Help utility | Right panel, static content; no route |
| 9 | Person share link | `?q=<name>` search link; seats keep `?seat=` |
| 10 | Admin post-login landing | `/` published map, one rule for all roles |
| 11 | `/my-seat` chrome | Chrome-free sheet, outside `(shell)` |
| 12 | Viewer hits `/admin` | In-page "Admin access required" card, as-is |
| 13 | E2.1 mode switch placement | Indicator is status only; opens the History panel; switch is the panel's first row |
| 14 | E2.2 history trigger | History utility icon in the Notifications slot; indicator text opens the same panel |
| 15 | E2.3 `/my-seat` shell | Keep chrome-free; ledger deviation 12 |
| 16 | E2.4 search scope | Surface-local Focused search with a widen-to-building affordance (Phase 2); header slot empty |

Second pass, same day, after the conformance review (section E) and the "Seat Planner Shell Mockups" canvas:

| # | Question | Ruling |
|---|---|---|
| 17 | E2.4 header search vs Focused search | Build the widen-to-building control; **no header search** |
| 18 | E2.3 `/my-seat` chrome | Unchanged — deviation 12 stands |
| 19 | E2.6 Ask Planner placement | Unchanged — deviation 14 stands |
| 20 | Theme utility | **Go with IBM**: Theme leaves the utility group, becomes a row in the Account panel; utilities are Help · History · Account |
| 21 | E2.5 filter placement (mockups: always-on rail, strip in control row, collapsed strip, hidden rail + hamburger) | **Option A2**: 256px left panel hidden by default, header hamburger toggles it; "Filters N ×" in the control row. People filter occasionally. **Amended 2026-09-04 (owner, Phase 4 PR 2):** the panel carries FOUR groups — Department · Zone · Status · **Position** (supervisors filter by role); `?position=` joins B3. Same pattern, one more category — not a deviation |
| 22 | Reset draft on Settings | **Retire it** — too destructive. Snapshot restore stays with a confirmation |
| 23 | E2.1 + E2.2 mockups (indicator, History panel admin + viewer) | **Approved** as mocked. **Amended 2026-09-04 (owner, Phase 4 PR 2):** "centred" means centred in the header's free run between the last section link and the first utility, not at the page midpoint — one fluid rule for both roles at every width |
| 24 | "320+ adaptive" standing ruling | Reworded, not dropped — see F1 |

Raised after the second pass, ruled the same day:

| # | Question | Ruling |
|---|---|---|
| Q7 | Ruling 22 retires "Reset draft" on Settings. The map's "Discard draft changes" (SeatMap overflow menu, `/admin`) is the same action behind a confirm dialog. Does it go too? | **Ruled 2026-09-02 — no.** The map's "Discard draft changes" stays (scoped to the admin's editing session, sits next to Publish, already confirms); only Settings' "Reset draft" is retired. `resetDraftToPublishedAction` and the `reset_draft_*` RPCs stay |

Standing rulings honoured, not re-asked: Carbon v12 skill-derived target; works at any width, designed and tested at 1920 (F1); `lg` hinge (D0); marker carries the name (Q6); admin editing `lg`+ read-only below; viewer never gets Ask Planner; Reception link for all viewers; in-memory recents; whole-building publish; code floor registry; undo never deletes employees; no SVG floor-plan replacement; no `@carbon/*` dependency; branch + Vercel preview per PR.

---

## D. Hand-off to Phase 2 (UX & wireframes) — inputs, not work

Phase 2 designs, per screen, in `senior-workflow.md` order (job → data → one primary → archetype → all states → unhappy paths → disclosure → grid): shell header + filter left panel (closed / open / narrow-width with links) + three right panels (Help, History, Account); map in both modes with the mode switch, Find me, copy link, `?q=` landing, Focused-search scope control; Reception; Management (3 tabs); Settings (CSV import, snapshot restore with confirmation; no Reset draft); login unchanged (D4). The approved mockups on the "Seat Planner Shell Mockups" canvas are the starting point for the shell and map control row, not the finished wireframes. Every screen: empty / loading / error / partial / overflow states. Decision-log entries appended to `docs/redesign-v2/DECISIONS.md` (D0 amended for the Help / History / Account panels, the mode switch as a control, Theme in Account, the hamburger-as-filter-toggle and the header-name anatomy; D1 for Find me + copy link + Focused-search scope; new entries for Management and Settings, which currently inherit D0 only; §6 gains deviations 12 and 14). Applied in the same PR.

**Delivered — Phase 3 (2026-09-03, `docs/redesign-v2/phase3/PHASE3DS.md`, tags v1.73.4–v1.73.8).** The UI system this hand-off asked Phase 2 to specify and Phase 3 to build: Carbon v11 tokens + the `--sp-*` semantic layer, the hand-built component layer for every PHASE2UX §3 row (shell, map, pages), six static specimens in both themes, a generated contrast suite (192/192), the conformance ledger (no new deviations; §6 stays at 1–15) and the Phase 4 obligations with landing files. Nothing under `app/`, `components/` or `lib/` changed; Phase 4 starts from PHASE3DS §5 and §7.

---

## E. Carbon conformance of Phase 1 — what is true to IBM, what differs

Method: each Phase 1 ruling (the 12 answers plus the inherited D0 items the IA depends on) checked
against the skill text actually read: `SKILL.md`, `references/ui-shell.md`, `senior-workflow.md`,
`composition.md`, `patterns.md`. Verdicts: **TRUE** = direct application of a stated rule;
**DIFFERS** = contradicts or goes beyond a stated rule (must be ledgered as a deviation or fixed);
**NOT COVERED** = IBM has no rule; ours is a product decision.

### E1. True to IBM

| Ruling | IBM text |
|---|---|
| Header-only shell, four sections, no persistent left panel (D0) | ui-shell "Header only — a small number of main sections"; left panel only past five secondary items |
| 48px fixed full-width header at every breakpoint (D0) | ui-shell "Header height 48px, full viewport width, fixed, persistent" |
| Links collapse into a hamburger overlay below `lg` (D0) | ui-shell "Header links … collapse into the left panel at narrow widths"; at narrow widths links sit *above* the panel's own items |
| No switcher, standalone product (D0) | ui-shell "Standalone: no switcher, and the system half of the header shrinks to account and help" |
| Draft/Published shown persistently in the header (D0, answer 2) | ui-shell "Sense of place … If a product has a draft/published split … the header is where that belongs, persistently, on every screen" |
| One section, one landing rule for every role (answers 2, 10) | ui-shell "transitional volatility": every inconsistency between screens costs re-orientation; consistency is a performance argument |
| Utilities Theme · Help · Account, flush right, 48×48 (D0) | ui-shell utility order: product-specific icons in the middle, Help 4th from right, Account 2nd from right; "open panels rather than navigating directly" |
| Help = right panel, static (answer 8) | ui-shell right panel "invoked by a right-side header icon and anchored to it … floats over page content"; utilities open panels |
| Publish history as a newest-first activity panel (answer 6, content) | senior-workflow archetype "Activity / notifications — Notifications panel, newest first" |
| State in the URL: seat, floor, tab, `q`, filters, names (answer 4) | ui-shell "encode view, filters, selection and mode in the URL so a reload or a shared link lands in the same place"; persistence "must be added during implementation" |
| `?q=` share link that lands and auto-selects (answer 9) | ui-shell "track essential state in the URL and return the user there automatically" |
| Management as in-page tabs, no third tier (answer 5) | senior-workflow "tabs for peer facets of one object"; ui-shell "The left panel does not support three tiers — use tabs in the page" |
| Settings kept as its own page (B1) | senior-workflow archetype "Settings — infrequent configuration, single-column forms grouped by section" |
| No breadcrumbs (B1) | composition "Breadcrumbs on record pages and any full-page flow" — Management/Settings/Reception are index/settings pages one level deep; the seat record is a side panel, not a page |
| Draft mode Hidden for viewers, not disabled (B5) | patterns "Hidden — the user lacks permission to know it exists. Absent entirely until permissions change"; senior default "Hide what a role can't do" |
| Viewer on `/admin` gets an in-page card with a way back (answer 12) | composition `FullPageError` kind 403 "with a recovery path" |
| Active search, count always shown incl. zero (D1, carried) | patterns Search "Active — results in place, no results page. Small data sets"; "Always display the number of results, including zero" |
| Instant filter updates, chips with clear-all (carried) | patterns "Instant when there's one category or one expected selection"; "Every category needs a clear-all; multiple categories need a global clear-all" |
| Login off the shell, single surface, no account oracle (D4, carried) | ui-shell scope "products only"; patterns Login "Don't reveal whether an account exists"; "Keep the primary button closest to the input" |
| No new role; nav by task not by role (answer 3) | ui-shell "Structure by the tasks users need to do, not by the org chart"; role-based schemes "hurt discovery when tasks overlap roles" |
| D0–D4 fixed; decisions carried in a log (answer 1) | senior-workflow "Consistency vs the better local solution — default to the system … deviate only with evidence, and record it"; the decision log "is the artifact" |

### E2. Differs from IBM — needs a ledger entry or a fix

| # | Ruling | IBM text | Gap | Recommended resolution |
|---|---|---|---|---|
| E2.1 | **Mode indicator doubles as the Published ⇄ Draft switch** (answer 2) | ui-shell: header links navigate; utilities "open panels rather than navigating directly"; "A sub-menu label opens the menu and nothing else — it can never also be a link"; changing what occupies the shell is the **Switcher's** job, which lives in a right panel — and D0 rules "no switcher, ever" | One header element doing two jobs (state + navigation); IBM keeps them apart | Indicator stays a **status element**; pressing it opens the **right panel** (E2.2) whose first row is the mode switch, followed by publish history. State display and state change separate; the panel is the sanctioned container. Ledger as deviation 11 if the owner prefers the indicator itself to switch |
| E2.2 | **Publish-history panel triggered from the mode indicator in the centre slot** (answer 6) | ui-shell: right panels are "invoked by a right-side header icon and anchored to it"; utility order reserves **Notifications, 3rd from right**, exactly for activity/history | Our trigger is a centre-slot text element, not a right-side 48×48 icon | Add a **History utility icon in the Notifications slot** (Theme · Help · History · Account). The mode-indicator text also opens the same panel (one panel, two triggers). Removes the deviation entirely |
| E2.3 | **`/my-seat` stays chrome-free** (answer 11) | ui-shell: the shell is "present everywhere in the UI, consistent from one context to another" for a tool the user is signed into; the only sanctioned shell-less surfaces are expressive pages (login is already deviation 5) | A signed-in, productive surface without the shell | Ledger as **deviation 12**: share-card use on phones; wordmark/back-link to `/` stands in for the header. Would change if `/my-seat` gains any action beyond reading |
| E2.4 | **Search lives in the map surface, not the header** (D1, carried) | ui-shell: Search is the **leftmost utility** "so an expanding field doesn't displace anything" | IBM places product search in the header; ours is scope-local per surface (map, reception) | Acceptable as **Focused search** (patterns: "active results within the current scope plus an option to widen") if Phase 2 gives it a scope affordance; otherwise ledger as deviation 13. No global search exists, so the utility slot stays empty |
| E2.5 | **Multi-category filter in a popover** (shipped `FilterPanel`; carried into B3) | patterns Filtering: "Multiple categories must never be inside a menu or dropdown. Left rail, vertical; or a horizontal strip above the data"; "A collapsed filter container needs a visible count of applied filters and a way to clear without reopening" | Department + zone + status sit in one disclosure | **Ruled 21: left panel, hidden by default, hamburger toggle ("Option A2")**, with a "Filters N ×" button in the control row for the collapsed-container rule. Mockups compared an always-on rail (256px of map lost), a strip merged into the control row, its collapsed state, and A2. A2 chosen because filtering is occasional and the map keeps its width |
| E2.6 | **Ask Planner is a map-surface drawer, not a header product icon** (D2, carried) | ui-shell: product-specific utility icons sit in the header middle and open right panels | An AI panel opened from inside the page rather than from the header; also competes for the right edge with the inspector | Keep in-surface (it is mode- and route-specific: admin, draft only), ledger as **deviation 14**; Phase 3 applies Carbon-for-AI labelling (`carbon-next.md`) |
| E2.7 | **`?names=` in the URL** (answer 4) | ui-shell lists "view, filters, selection and mode" | Label visibility is a display preference, closer to theme than to view | Kept as ruled; note in the URL contract that URL wins on landing and the localStorage key carries the last choice. NOT a deviation, but the one item IBM would not have put there |

### E3. Not covered by IBM — product decisions, no conflict

| Ruling | Note |
|---|---|
| Absorb multi-floor PR-3 into Phase 4 (answer 1) | Sequencing; IBM has no rule. senior-workflow's "one Hill per project" supports one build over two |
| Floor as an in-page dimension, never a section (B6) | No IBM rule for spatial canvases (already deviation 2). Floor selector as place marker is consistent with "sense of place" |
| Person share link via `?q=` rather than an id (answer 9) | IBM: "long URLs" are overflow candidates; a name is shorter than a uuid. Fine |
| Find me on the map (answer 7) | Product task; local scope; IBM neutral |
| Route registry replacing four enums (B2) | Engineering hygiene; supports ui-shell's "identical everywhere" |
| Reception error boundary in its own voice (B2) | patterns Empty states "Error management — why there's no data *and* what to do" applies to the copy, not the IA |

### E4. Rulings on E2 (owner, 2026-09-02) and the resulting ledger

- E2.1 → **resolved, no deviation**: indicator is status; History panel row one is the switch.
- E2.2 → **resolved, no deviation**: History icon in the Notifications slot.
- E2.3 → **deviation 12**: `/my-seat` renders without the shell (share-card use). Would change if the sheet gains any action beyond reading.
- E2.4 → **resolved, no deviation**: Focused search with a widen affordance (Phase 2 must deliver it, else deviation 13 re-enters).
- E2.5 → **resolved, no deviation** (ruling 21): hidden left panel + hamburger; "Filters N ×" in the control row.
- E2.6 → **deviation 14**: Ask Planner opens from the map surface, not a header product icon.
- E2.7 → noted, not a deviation.

Append to `docs/redesign-v2/DECISIONS.md` §6 when Phase 2 opens: **12** and **14**. Number 11 and 13 are deliberately unused (reserved for the options not taken, so cross-references in this file stay stable).

### E5. What Phase 2 must deliver because of E2
- Right-panel family: Help, History (mode switch + events); single-open rule; History icon in the Notifications slot; indicator-as-second-trigger.
- Filter left panel: 256px, hidden by default, hamburger toggle, slide-in pushes the canvas, Esc closes, state remembered; "Filters N ×" button in the control row with count + clear (E2.5, ruling 21). Below `lg` the same panel carries the section links above the filters.
- Focused-search widen affordance ("this floor" → "whole building") on the map with per-scope counts and auto floor-switch on a unique match (E2.4, ruling 17).
- Account panel with Theme (Light / Dark / System), My seat, Sign out (ruling 20).
- Settings without Reset draft; snapshot restore behind a confirm-with-consequences dialog (ruling 22).
- Header name anatomy: organization name 14/400 + "Seat Planner" 14/600, text (F2).

### E6. Second-pass items not in the original E2 (2026-09-02)

| # | Item | IBM text | Resolution |
|---|---|---|---|
| E6.1 | Mode switch inside a right panel shows a selected state | ui-shell "Right panel items have no selected state" | Not a deviation: the rule targets navigation items; the switch is a control. Recorded in D0 |
| E6.2 | Theme toggle acted directly from the utility group | ui-shell utilities "open panels rather than navigating directly" | **Ruled 20**: Theme moves into the Account panel; utilities Help · History · Account |
| E6.3 | Reset draft needed the destructive-action treatment (typed confirmation) | SKILL.md destructive actions; senior-workflow enterprise defaults | **Ruled 22**: retired instead of guarded. Snapshot restore: confirm with consequences |
| E6.4 | Header name anatomy unspecified ("wordmark") | ui-shell header name: organization prefix + product name, text, links home | F2 |
| E6.5 | Hamburger opens filters, not navigation | ui-shell: hamburger "only when there's a collapsible left panel" (a nav panel) | Product-specific meaning, recorded in D0; not a deviation in a header-only shell |

## F. Standing-ruling amendments (2026-09-02, second pass)

### F1. "320+ adaptive, 1920 primary" → "works at any width; designed and tested at 1920"
The original wording fused two things. The **floor** — nothing breaks at any width — is a property of a proper application and stays a hard requirement; Carbon's fluid grid, the header's built-in link collapse into the left panel and the token layer supply most of it. The **design mandate** that had grown on top of it — separate degradation designs for the mode indicator, a tuned collapsed filter treatment, a read-only editing variant, each wireframed and tested at five breakpoints — is withdrawn. Phase 2 designs and Phase 4 tests at 1920×1080 (the only viewport in use at the firm) plus **one deliberate narrow fallback** checked once: header links fold into the left panel, pages go single-column, map editing goes read-only. Reopens the day the planner is used on a laptop. (Ruling 24.)

### F2. Header name anatomy
Organization name (`body-compact-01`, 14/400) followed by "Seat Planner" (`heading-compact-01`, 14/600), as text; links to `/`. No graphic wordmark, so both themes come for free. (E6.4.)

## Phase 1 close-out
- Signed off 2026-09-02 (sixteen rulings, section C); amended the same day with rulings 17–24. Nothing built.
- Mockups approved as inputs: "Seat Planner Shell Mockups" canvas — E2.5 Filters page (A2 chosen), Shell panels page (E2.1–E2.2 approved, G2 Account panel).
- Phase 2 opens with the shell (D0 header + filter left panel + Help/History/Account panels) first — every other screen is measured against it.
