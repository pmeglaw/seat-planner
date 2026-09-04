# Seat Planner redesign — Phase 4 test triage

**Status: PR 0 (2026-09-03, main @ c36f216 / v1.73.8).** Every `tests/*-source.test.mjs` (42), every jsdom component
test in `test:ct` (18), every other test that reads `app/**`, `components/**`, `app/globals.css` or `tailwind.config.ts`
as text, and every Playwright spec, classified before any component moves. Inputs: `CLAUDE.md` ("`lib/` is the tested
business core" — the `*-source` scope note), the `test-tiers` skill, PHASE3DS §5 (landing files, retired names) and
the Phase 4 hand-off.

## 0. The three kinds and the rule for each

| Kind | Meaning | Rule |
|---|---|---|
| **guardrail** | Protects users or data: accessibility semantics, destructive-action safety, auth / security boundary, draft-vs-published isolation, data integrity, CI/process integrity | **Never retired, never weakened.** A guardrail that names a file or a string is *re-pointed* when that file or string is replaced (a path edit, a copy edit, a selector edit) — the assertion's meaning does not change. If a redesign PR trips one, the PR crossed a line: fix the crossing, not the test |
| **contract** | Behaviour that must survive on a new component: the unsaved-edits navigation veto, one persistent shell, focus return, the Esc ladder, keyboard parity, memo comparators, render-loop shape | **Re-pointed, never dropped.** When the component retires, the contract moves to the test of the component that inherits the behaviour, in the same PR |
| **look-pinning** | Pins a palette, a shadow, a tile, a tab style, a marker size, a class literal, a viewport-height formula, an icon path | **Retires in the PR that replaces the look it pins**, citing `CLAUDE.md` "Design system": *"tokens and primitives are an evolvable starting point, not fixed law … nothing pins a specific palette or layout"*. Any guardrail half inside a look-pinning file is carried to a surviving test first |
| **mixed** | A file with a guardrail or contract half and a look-pinning half | **Rewrite** in the named PR: keep the guardrail/contract assertions against the new selectors, delete the look assertions |

Disposition vocabulary below: **keep** (unchanged), **re-point** (paths / strings / selectors edited, meaning kept),
**rewrite** (mixed file split as above), **retire** (deleted, with its surviving half named), **new** (PR 0).

Two mechanics every PR must respect: `test-tier-scripts-source` forces the `test:ct` list in `package.json` to match
the set of tests importing `renderComponent.mjs`, so a retired or added ct test edits `package.json` in the same PR;
and `dialog-error-placement` keeps a census of every `role="dialog"` under `components/**` — each PR that adds a
dialog, side panel or tearsheet re-enumerates it.

## 1. `tests/*-source.test.mjs` (42)

| Test | Kind | What it protects (kept) | Look half (dropped) | Disposition | PR |
|---|---|---|---|---|---|
| `accessibility-source` | mixed (mostly guardrail) | 32 tests: named landmarks (`Admin search results`, `Viewer search results`, `Map tools`, `Command search`, `Active filters`, `Undo last map change`), `aria-labelledby` ids on every dialog, roving tabindex, focus trap/restore, `aria-modal`, skip links, `motion-safe:` gating, viewer read-only isolation, `SEAT_SEARCH_PLACEHOLDER` | `sp-zone-chrome sticky top-0` literal, `sm:z-50`, `[&>option]:bg-[…]`, `VIEWER_PANEL_BREAKPOINT_PX = 900`, `scroll-padding-top` / `::-webkit-search-cancel-button` in globals.css, `--sp-ai-*` exclusivity by old name, `map-raster-dim` | rewrite (guardrail half kept whole; landmark names follow the wireframes' copy) | 2 (`Admin workspace rail` → header nav), 3 (map surfaces), 4 |
| `action-error-contract-source` | guardrail | actions return failures, never throw; single-flight create/delete; first-run copy | — | keep | — |
| `action-input-validation-source` | guardrail | parse-before-write, shared failure arm, panel renders returned failures | — | re-point (panel file) | 4 |
| `ask-planner-ai-source` | mixed | AI disclosure (Sources / draft / cannot modify / confidence), `aria-expanded` + `aria-controls="ask-planner-explain"`, viewer contains no Ask Planner / `--sp-ai-` reference | `shadow-marker-ai`, `map-raster-dim` rule count, `AiHighlightChip` file, old `--sp-ai-*` names | rewrite (viewer-exclusion regex keeps the `--sp-ai-` prefix — it covers the three new names too) | 3 |
| `ask-planner-followup-source` | contract | `askFollowUp` submits, `choosePrompt` only fills, chips `disabled={pending}` | — | re-point | 3 |
| `auth-config-source` | guardrail | local stack signup/anon/linking off; `MIN_PASSWORD_LENGTH` shared | — | keep | — |
| `auth-session-source` | guardrail | real POST sign-out; identity + no-JS sign-out affordance on every signed-in surface; proxy matcher allowlist; `/login` session detection; one shell (no second rail/bar) | — | re-point: `AccountMenu.tsx` → `ShellPanels.tsx` (Account panel hosts the `<form>` sign-out); the "no second rail" assertion becomes "no second header"; matcher list unchanged (`/` already listed) unless PR 2's route-group move needs it | 2 |
| `auth-theme-source` | look-pinning + one correctness half | every `--sp-*` the auth files use resolves in both themes | bans on `rounded-*`, palette classes, `focus:ring-4`; per-file `text-white` ledger; old token names (`--sp-brand`, `--sp-shadow-*`, `--sp-status-danger-mark`) | rewrite: keep the both-themes resolution check against `sp-tokens.css`; drop the class bans (the asset owns radius = 0); the ledger stays only if `/login` keeps its `text-white` sites (D4 unchanged) | 1 |
| `bulk-destructive-action-safety-source` | guardrail | no `window.confirm`; CSV / JSON / discard flows open an in-app review before the action; review copy anchors (`Review CSV import`, `CSV import has blocking errors`, `Apply import`, `Fix CSV first`, `Review draft snapshot restore`, `Restore draft snapshot`, `Deactivation impact`, `Department delete impact`, `Zone delete impact`); `management-confirm-title`; confirm stays mounted until settled | — | re-point: the tearsheet IS the review (PHASE3DS §5 PR 4). The **Settings Reset-draft anchor is removed** in PR 4 because the feature is removed (ruling 22) — a scope reduction the owner ruled, not a loosening; the map's Discard anchor stays | 3 (map), 4 (settings, management) |
| `chunk-recovery-boundary-source` | guardrail | chunk-load recovery + loop guard + `onClick={reset}` in both error boundaries | — | re-point (route cards keep the reset control) | 5 |
| `close-icon-source` | look-pinning | — (one shared × glyph across four surfaces) | SVG path `m5.5 5.5 9 9m0-9-9 9`, import graph | **retire**: tearsheets have no × (frame invariant), the side panel's × is the asset's; PR 3 drops the two map consumers, PR 4 deletes the file with the last two | 4 |
| `color-twin-drift-source` | look-pinning | — (`--x-rgb` twins equal their partner) | the twin convention; `:root` / `.admin-theme` cascade shape | **retire**: `sp-tokens.css` has zero `-rgb` twins (alpha derives in place); nothing to verify | 1 |
| `desktop-seat-marker-system-source` | mixed | calibration literals (`MAP_IMAGE_SRC` `?v=`, 3822×1734, per-floor `xScale/xOffset/yScale`) untouched; two-signal glyphs per state (WCAG 1.4.1); no data / auth / publish / route call in the marker path | `--sp-marker-unavailable-hatch`, `--sp-marker-active-edge`, `bg-clip-padding`, `text-[9px]` C05 chip, `validTargetTone` ban, `Read-only` / `Published` strings in `ViewerSeatFinder` | rewrite (glyph presence → `SeatMark` parts `data-stroke` / `data-fill` / `data-hatch`) | 3 |
| `elevation-shadow-tokens-source` | look-pinning + one build rule | `shadow-[var(` is dropped by Tailwind v3 — **carried to `phase4-token-layer-source`** (PR 0) | `shadow-elevation-N`, `shadow-panel`, `marker-selected` / `marker-hover` theme keys and the `--sp-elevation-*` / `--sp-legend-*-shadow` tokens | **retire** (depth is layers; the overflow menu keeps `--sp-shadow`) | 1 |
| `filter-feedback-source` | mixed | live match summary in `aria-live="polite"`; legend counts follow active filters | `FilterPanel` / `DeptChipRow` / `ActiveFilterChips` render sites, `ml-auto`, `mapCrumbLabel` | rewrite: the summary + counts contract re-points to `LeftPanel.tsx` (PR 2) and the control row's `Filters · N` (PR 3); `FilterPanel` / `DeptChipRow` retire | 2, 3 |
| `focus-brand-contrast-source` | guardrail via old names | focus ring declared in both themes and never the brand orange; white text never on a raw orange fill | `#FF5715`, `data-chrome="dark"` mechanism, the five component roots | rewrite: "`--sp-focus` never a brand hue" becomes "`--sp-focus` resolves to `--cds-focus` in both themes and inside `.sp-panel`" against `sp-tokens.css`; the `data-chrome` attribute retires with the chrome | 1 (tokens), 2 (panels) |
| `focus-handoff-source` | contract | `focusPrimaryActionSoon`, marker focus return on Esc / deselect, palette re-focus | — | re-point | 3 |
| `local-gate-source` | guardrail | `scripts.gate` order; CI verify order | — | keep | — |
| `management-detail-source` | mixed | `Assigned` / `Unassigned` vocabulary (never `Active`); row open focuses the name input | `TrashIcon` `viewBox`, search-icon circle geometry, `▲▼` ban | rewrite (status = `SeatMark` ● / ○ + label; focus lands in the side panel) | 4 |
| `management-directory-map-link-source` | mixed | deep link via `withSeatParam` (never hand-built `?seat=`); `Edit ${displayName}` label; editor `aria-labelledby="management-employee-title"` + `useDialogFocus` + Esc-when-not-pending; opening mutates nothing | kebab wording, `setEmployeeDialogOpen` call count | rewrite (the 480 slide-over is the dialog; the one ghost Edit action carries the label) | 4 |
| `map-image-pin-source` | guardrail | `MAP_IMAGE_SRC` `?v=` ↔ `next.config.js` `localPatterns` | — | keep | — |
| `music-visualizer-source` | guardrail | prototype gating, no data / auth / network, a11y of the visualizer | — | keep (`app/concepts/` untouched) | — |
| `pending-state-source` | guardrail | every mutating flow shows a present-participle pending state with `loading={pending}`; `role="status" aria-live="polite"` "Working…" region per surface; `Button` `aria-busy` + disabled while loading; loading.tsx copy | the `motion-safe:animate-spin` spinner class | re-point per PR (participle registry follows the wireframes' verbs; `aria-busy` on the primary is PHASE3DS §5's commit-bar rule) | 1 (`Button`), 3, 4, 5 |
| `pill-crowding-scale-source` | mixed | `clearanceFromScale` with the aspect correction; nudges fed `namedSeatIds` + geometry; text-tier hysteresis | `h-[Npx] min-h-[Npx] w-[Npx]`, `-translate-y-[calc(50%±Npx)]`, `w-auto min-w-[Npx]`, `text-[12px]` literals | rewrite: the pill is fit-width, height 28 is the one constant the nudge reasons about (PHASE3DS §5 item 12; deviation 8) — the geometry pins become "no width set on `.sp-pill`; `PILL_HEIGHT_PX === 28`" | 3 |
| `reception-source` | guardrail | page reads `published_employees` + `layer='published'` only; no actions / rpc; login redirect; combobox / listbox / `aria-activedescendant` / `aria-selected` / Arrow + Esc / `aria-live`; voicemail copy | — | re-point (copy follows `reception.html`; `[data-highlight]` + `aria-selected` are PHASE3DS §5 item 18) | 5 |
| `require-admin-guard-source` | guardrail | every exported action calls `requireAdmin()` first | — | keep | — |
| `role-fitted-tabs-source` | mixed | viewer never sees admin-only navigation (Draft mode Hidden, B5) | the whitespace-exact JSX regex, `Open viewer surface` label, "AppTopBar has no `<nav`" | rewrite: "header section links are role-fitted: viewer sees Seat map · Reception; admin sees Management · Settings; Draft is Hidden for viewers" against `AppTopBar.tsx`; the rail assertions retire with the rail | 2 |
| `seat-creation-ui-source` | guardrail | add-seat creates draft custom seats; delete is draft-only and protected; undo / redo eligibility; names preference local-only; `aria-pressed` on the add-seat control; `Job Title` copy | — | re-point (mode card + control row) | 3 |
| `seat-map-escape-source` | contract | `handleEscape` named + window-bound; peels one layer per press; cannot dismiss a pending publish / discard; no open-coded filter resets | — | re-point (PHASE2UX §5's Esc cancel ladder extends it) | 3 |
| `seat-map-render-loop-source` | contract | three visible-range number states with functional updaters | — | keep | — |
| `security-headers-source` | guardrail | headers, CSP, cookies, clients | — | keep | — |
| `session-expiry-source` | guardrail | session-expired detection + `/login?next=/admin` link; banner suppressed behind dialogs | the exact banner condition expression | re-point (the canvas notification slot, `.sp-canvas-status`) | 3 |
| `settings-affordance-source` | mixed | verb honesty: `Download CSV template`, never `Blank CSV`; no ASCII chevrons | `affordance="download"` × 3 | rewrite | 4 |
| `settings-tiles-source` | look-pinning + two anchors | publish-boundary copy ("The published map is never touched until you publish."); exactly one `resetDraftToPublishedAction` call site | tiles, `uppercase tracking-[0.04em]`, `tone="danger"`, tile `aria-label` template, `openResetReview` | **retire** in PR 4: the callout carries the standing copy (`settings.html` wording wins); the single-call-site anchor moves to `bulk-destructive-action-safety-source` as "`resetDraftToPublishedAction` is called from `SeatMap` Discard only" | 4 |
| `shell-viewport-height-source` | mixed | each scroll page has a focusable, named internal scroll region; no `min-h-screen` | `--sp-chrome-height` formula, `lg:h-[calc(…)]`, `lg:overflow-*` literals | rewrite (`--sp-shell-header-h`; `.sp-page` owns the height) | 2 |
| `status-label-source` | guardrail | one status vocabulary (`Open`), `STATUS_LABELS` everywhere, marker `aria-label` uses it, no `title=` on markers | — | re-point (`FilterPanel` → `LeftPanel`) | 2, 3 |
| `tailwind-arbitrary-alpha-source` | mixed | `-[var(--x)]/alpha` and `rgba(var(--x-rgb),` compile to nothing (build correctness) | `focus-visible:outline-none` on dialog containers | rewrite: keep the alpha rule (Tailwind stays for layout utilities); drop the outline pin (the 2px inset ring is the asset's and must not be removed) | 3 |
| `test-tier-scripts-source` | guardrail | `test:ct` / `test:db` lists match helper imports | — | keep (edits `package.json` whenever a ct test comes or goes) | — |
| `touch-target-source` | mixed | 44px hit floor on every interactive sized literal (WCAG 2.5.5; deviation 7) | the mechanism: exact Tailwind class strings per file, ~20 pinned `after:-inset*` ledgers | rewrite per PR: the sweep keeps running; ledger rows leave with their components; the asset-overridden 44px touch target (PHASE3DS §2) is asserted on `.sp-*` classes in `sp-components.css` for the header, control row, pills and Reception rows | 2, 3, 4, 5 |
| `type-floor-source` | look-pinning ledger over an a11y floor | no shipped word below 12px (owner ruling, type-floor arc) | per-file sub-12px counts (`SeatMarker` 16, …) | rewrite in PR 1: the sweep asserts zero sub-12px declarations outside a ledger; rows leave as components move; Carbon's smallest text roles (`label-01`, `code-01`, `helper-text-01`) are 12px, so the end state is an empty ledger | 1, 3, 4, 5 |
| `viewer-find-palette-source` | mixed | palette fed by `buildViewerPaletteBrowse` from the published snapshot; hover is render-only (INV-2); re-measure on rAF + `ResizeObserver`; `VIEWER_NAMES_VISIBLE_STORAGE_KEY`; dead keys stay deleted | `fixed z-[70] flex flex-col`, `panel:pr-[`, `[@media(pointer:coarse)]:hidden`, the two legend strings | rewrite (`.sp-palette` keeps virtualisation; legend copy per `map-published.html`) | 3 |
| `viewer-keyboard-parity-source` | contract | Ctrl / ⌘ K shortcut + `<kbd>` hint; results / browse key handlers; Enter opens first result; Esc closes | the exact `[aria-label=…] button:not([disabled])` selector | re-point (the platform-aware hint is PHASE3DS §5 item 4) | 3 |

## 2. `test:ct` component tests (18)

| Test | Kind | Kept | Dropped | Disposition | PR |
|---|---|---|---|---|---|
| `dialog-initial-focus` | guardrail | first enabled control receives focus, container fallback | — | re-point (modal export names) | 3 |
| `login-form` | guardrail | name-less inputs, disabled-pre-hydration primary, validation, no account oracle, `?next` guard, `Log in` as a direct text child | — | keep (D4: login unchanged) | — |
| `update-password-form` | guardrail | `name="password"` / `confirmPassword`, alerts, no auth call on invalid | — | keep | — |
| `seat-inspector` | mixed | viewer mode has no edit affordances; admin verbs gated on handlers + `busy`; custom-seat delete vs protected original; `mailto`, `Copy extension`, `Move / Swap / Vacate ${label}` names | `seat-inspector-*` ids, `#seat-inspector-actions`, "collapsed renders nothing" | rewrite (`.sp-slot` inspector; Delete Hidden for originals — PHASE2UX §3) | 3 |
| `seat-map-components` | mixed | marker code + name in the label, `aria-pressed`, no name stutter; zoom `Zoom in` / `Zoom out`; floor menu `Change floor…` + `menuitemradio`; trail colours from tokens not hex | `h-10 w-10` / `h-8 w-8` / `after:-inset-*`, plate-vs-pill geometry, `data-trail-part` anatomy, `DeptChipRow`, `DraftTrailOverlay` | rewrite (`.sp-pill` 11 states; the trail is the origin's dashed edge + the target's solid one — `DraftTrailOverlay` and `DeptChipRow` retire) | 3 |
| `map-status-band` | mixed | `Seat status legend` list, one `li` per entry with counts; `Floor summary` scroll region | `data-map-status-band` / `data-band-scroll-region` anatomy | rewrite (`.sp-band`; legend follows the Names toggle — §5 item 13) | 3 |
| `floor-roster` | mixed | static `listitem` rows, nothing `disabled`; `aria-live` count incl. zero; empty / no-match copy names the floor and offers Clear | `data-roster-*`, sticky inset | rewrite (`.sp-roster`; rows stay non-interactive — deviation 9) | 3 |
| `names-visibility-toggle` | mixed | stable accessible name + `aria-pressed`; label never flips | `data-state` track cue | re-point (Carbon toggle, label per wireframe) | 3 |
| `app-rail` | contract + look | **navigation veto** (`onNavigate` false vetoes; ctrl-click bypasses), deploy-skew full-document fallback, 4s watchdog, Esc collapse + focus return | `w-12` ↔ `w-[208px]`, `opacity-*`, inset-shadow token class, `app-rail` id, scrim | **retire the file** in PR 2; the three contracts move verbatim to `app-top-bar.test.mjs` / `app-shell.test.mjs` (header links + hamburger) in the same PR | 2 |
| `app-shell` | contract | ONE `banner` per surface incl. the map; bar persists as the SAME DOM node across routes; `router.push` unless skewed; registered guard vetoes; registered Ask Planner opener; slot portals unmount cleanly; account menu roles + focus | `w-12` / `w-[208px]`, `getByText("Management", { selector: "div" })` | rewrite (header + panels; `role="menu"` account menu → Account panel `dialog`/region semantics per `shell-right-panels.html`) | 2 |
| `app-top-bar` | mixed | skip link is the first tab stop; toggle `aria-expanded` + names | slot DOM order, `h-px` hairline at `left-12`, `--sp-chrome-height` text read of `AccountMenu.tsx` | rewrite (48px `.sp-header`: hamburger → name → links → `.sp-mode` → utilities; outlined-open state) | 2 |
| `admin-management-panel` | guardrail | deactivation double-gated, cancel never calls; server failure keeps the row; dept / zone delete states blast radius; save disabled until a name; first-run vs no-match copy | — | re-point (side panel + confirm modal on top; button names per `management.html`) | 4 |
| `dialog-error-placement` | guardrail | every action error renders inside the still-open container with `Retry <verb>`, values kept, focus into the alert; `role="dialog"` census over `components/**` | — | re-point + re-enumerate the census (tearsheets, side panel, mode card) | 3, 4 |
| `data-utilities-panel` | guardrail | choosing a file only opens the review; blocking errors disable apply; stale-draft rejection; snapshot fence; malformed payload rejected pre-review; Esc closes without mutating | — | re-point (narrow tearsheets; 5 MB guard added). **Reset-draft tests removed** with the feature (ruling 22) | 4 |
| `viewer-seat-finder` | mixed | every published seat renders; inspector read-only; NO server action from any viewer interaction; admin shortcut role-gated; counts follow filters; `?seat=` round-trip; inactive employees excluded; zero-seats = never-published state; default floor | band / floating-stack breakpoint choreography, `data-token-mode`, `Filter seating` button | rewrite (control row + left panel; `?q=` / `?dept=` / `?zone=` / `?status=` / `?names=` added — PHASE2UX §5) | 3 |
| `viewer-find-palette-component` | mixed | hover previews then releases; one selection path; unseated person listed honestly; cross-floor rows tagged; arrow roving with ArrowUp exit; zero-people copy | "same slot" swap, eyebrow / legend copy | rewrite (`.sp-palette` 560) | 3 |
| `reception-screen` | guardrail | combobox `Search the directory` → listbox `People`, `aria-activedescendant`, clamp not wrap, Enter locks + clears, Esc clears, focus returns; recents newest-first ≤ 5 no dupes; `Caller detail` region reads ext / seat / floor / zone with the voicemail warning; same-department fallbacks only with an extension | — | re-point (names and copy per `reception.html`; readout tile `aria-live`) | 5 |
| `use-inspector-nudge` | contract | nudge translates then unwinds; reselect settles at zero; unmount cancels | — | keep (height 28 unchanged) | — |

## 3. Other tests that read app / component source as text

| Test | Kind | Kept | Disposition | PR |
|---|---|---|---|---|
| `theme` | mixed | boot + toggle use `lib/theme` constants, never raw literals; `color-scheme: dark` under `[data-theme="dark"]` | rewrite: `data-carbon-theme` derived from `data-theme` by one function (PHASE3DS §5 item 2); `.admin-theme` block and `ThemeToggle` mount sites retire (Account radio) | 1, 2 |
| `full-navigation` | guardrail | `assignLocation` is the only full-document escape hatch; sanctioned callers listed | re-point the allowlist (`AppRail.tsx` → `AppTopBar.tsx`) with `lib/fullNavigation.ts`'s own list | 2 |
| `draft-concurrency` | guardrail | MLS02 fence threaded through undo / redo / swap / save / restore / import / publish | re-point (file names) | 3, 4 |
| `office-room-wash` | look-adjacent | eight room rectangles; assigned seats wash their room | **decide in the PR 3 plan**: `--sp-wash-zone` retires → `--sp-highlight` (zone hit = the search surface), and the Phase 2 map wireframes draw no room washes. Default: retire `MapWashLayer` + this test in PR 3; raised under "Open for the owner" there | 3 |
| `seat-marker-memo` | contract | `SeatMarker` exported memoised; comparator covers every rendered field; identity-stable callbacks | re-point (comparator follows the new prop list) | 3 |
| `virtualized-directory` | contract | windowing maths; `stepFocusIndex` skips disabled rows | re-point (`ResultsPanel` retires with the shipped viewer header; the palette + Management keep the hook) | 3, 4 |
| `seat-clusters` | mixed | cluster maths; "the admin map never swaps markers for cluster pills" | **decide in the PR 3 plan**: cluster pills are not in `map-published.html`. Default: retire with the viewer's cluster layer; raised under "Open for the owner" | 3 |
| `floors` | contract | registry order, landing-floor precedence, `?seat=` beats `?floor=`, roster grouping | re-point | 3 |
| `marker-contrast` (+ `scripts/marker-contrast.mjs`) — **missed by the PR 0 survey** | look-pinning over a contrast obligation | marker marks ≥ floor on the hovered surface, both themes; 36 state pairs differ on a non-hue channel — measured from the OLD `--sp-marker-*` values in `globals.css` | **retired in PR 1**: the values it measured left with the token block; the obligation is carried by the generated 192-pair contrast suite (pill states × surfaces, both themes) and Phase 3's two-signal marks (`.sp-seat-mark`, §1.4) | 1 |
| `published-employee-snapshot` | guardrail | viewer reads the snapshot only; publish RPC replaces it atomically | keep (route-group move in PR 2 edits the path only) | 2 |
| `publish-guard`, `map-operations-agent`, the six `*-transaction-safety`, `floor-ids`, `seed-migration-replay`, `backup-script-safety`, `viewer-seat-columns`, `measure-shared` | guardrail / contract | server, SQL and tooling — no UI coupling | keep | — |

## 4. Playwright specs

| Spec | Tier | Kind | Disposition | PR |
|---|---|---|---|---|
| `e2e/smoke.spec.ts`, `e2e/accessibility.spec.ts`, `e2e/axe-helpers.spec.ts` | backend-free | guardrail (login renders, redirects, axe) | keep | — |
| `e2e/publish-ready-badge-contrast.spec.ts` | backend-free | look-pinning (`#D23F0A`, `--sp-publish-ready-*`, `--sp-brand-text`, `admin-theme` body class in a synthetic fixture) | **retire** in PR 1: the tokens retire; contrast is gated by `generate-pairs.mjs` + `check_contrast.py` at 192/192 | 1 |
| `e2e-auth/nav-shell.spec.ts` | e2e-auth | contract (zero document loads across sections; ONE persistent shell node; the expanded panel closes on navigation) | **stays**, re-pointed: `#app-rail` → the header; hamburger `aria-controls` → the left panel; the hydration gate keeps its shape | 2 |
| `e2e-auth/publish-flow.spec.ts` | e2e-auth | guardrail (a real publish; admin gate) | re-point button names (`Publish N changes`, the wide tearsheet's title) | 3 |
| `e2e-auth/draft-dialogs.spec.ts` | e2e-auth | guardrail (confirm dialogs gate every draft mutation) | re-point names / headings per `map-draft.html`; the Settings Reset-draft steps removed with the feature | 3, 4 |
| `e2e-auth/accessibility.spec.ts` | e2e-auth | guardrail (axe in every open-container state) | re-point button names; add the side panel + tearsheets to the state list | 3, 4, 5 |
| `browser/seat-map.spec.ts`, `browser/draft-history.spec.ts`, `browser/accessibility.spec.ts` | real-browser | guardrail / contract (marker → inspector, discard, undo / redo, MLS02 recovery, axe) | re-point (marker `aria-label`s, `More tools` → the ⋯ overflow, dialog titles) | 3 |

## 5. By PR — what each PR does to the test suite

| PR | New / kept whole | Re-pointed | Rewritten | Retired |
|---|---|---|---|---|
| 0 | `phase4-token-layer-source` (new) | — | — | — |
| 1 | — | `accessibility-source` (two token pins), `ask-planner-ai-source` (dim rules + bridge), `phase4-token-layer-source` (`SWEPT` {1}) — `pending-state-source` and `type-floor-source` needed no change (the sweep left counts and classes intact) | `auth-theme-source`, `focus-brand-contrast-source` (tokens half), `theme` (three-state derivation) | `elevation-shadow-tokens-source` (build rule carried to PR 0's test), `color-twin-drift-source`, `e2e/publish-ready-badge-contrast.spec.ts`, `marker-contrast` + its script |
| 2 | — | `auth-session-source`, `full-navigation`, `status-label-source` (panel), `nav-shell.spec.ts`, `published-employee-snapshot` (path) | `accessibility-source` (shell half), `filter-feedback-source` (left panel), `focus-brand-contrast-source` (panels half), `role-fitted-tabs-source`, `shell-viewport-height-source`, `touch-target-source` (shell rows), `theme` (toggle), `app-shell`, `app-top-bar` | `app-rail.test.mjs` (three contracts moved first) |
| 3 | — | `ask-planner-followup-source`, `focus-handoff-source`, `seat-creation-ui-source`, `seat-map-escape-source`, `session-expiry-source`, `viewer-keyboard-parity-source`, `dialog-initial-focus`, `names-visibility-toggle`, `seat-marker-memo`, `floors`, `draft-concurrency`, `virtualized-directory`, the three `browser/*` specs, `publish-flow.spec.ts`, `draft-dialogs.spec.ts` | `accessibility-source` (map half), `ask-planner-ai-source`, `desktop-seat-marker-system-source`, `filter-feedback-source` (control row), `pill-crowding-scale-source`, `tailwind-arbitrary-alpha-source`, `touch-target-source` (map rows), `type-floor-source` (rows), `viewer-find-palette-source`, `seat-inspector`, `seat-map-components`, `map-status-band`, `floor-roster`, `viewer-seat-finder`, `viewer-find-palette-component`, `dialog-error-placement` (census) | `office-room-wash` and `seat-clusters` **if** the owner confirms the PR 3 defaults; `close-icon-source` loses its two map consumers |
| 4 | — | `action-input-validation-source`, `bulk-destructive-action-safety-source` (+ the single-call-site anchor from `settings-tiles`), `admin-management-panel`, `data-utilities-panel`, `draft-concurrency`, `virtualized-directory` | `management-detail-source`, `management-directory-map-link-source`, `settings-affordance-source`, `touch-target-source` / `type-floor-source` (rows), `dialog-error-placement` (census) | `settings-tiles-source`, `close-icon-source` |
| 5 | — | `chunk-recovery-boundary-source`, `reception-source`, `reception-screen`, `e2e-auth/accessibility.spec.ts` | `touch-target-source` / `type-floor-source` (last rows) | — |
| 6 | — | — | — | — (close-out verifies: no look-pinning test asserts the old look, no guardrail weakened, `HEX_LEDGER` empty, `SWEPT = {1,2,3,4}`) |

## 6. The PR 0 test — `tests/phase4-token-layer-source.test.mjs`

Three rules from the hand-off, phased so PR 0 is green before any component moves:

1. **No hex outside the two asset files** (`carbon-tokens.css`, `carbon-components.css`, matched by basename wherever
   PR 1 lands them). TypeScript is scanned by string literal, CSS with comments stripped, so a comment may name a hex
   while explaining a token. Today's counts are a per-file `HEX_LEDGER` (seven files: `app/globals.css` 271,
   `components/ui/design-system.tsx` 54, `SeatSheet.tsx` 12, `app/global-error.tsx` 10, `LoginForm.tsx` 6,
   `tailwind.config.ts` 3, `app/layout.tsx` 1); a row may shrink or leave, never grow or appear, and a stale row fails.
2. **No `--cds-*` outside `sp-tokens.css` and the assets.** True today (zero references) and stays so.
3. **No retired `--sp-*` name** from PHASE3DS §5, grouped by the PR that sweeps it (1: primitives / theme roles /
   brand / status; 2: `--sp-chrome-*`; 3: marker / legend / selection / ai / editor / publish / trail / wash;
   4: tag / table / extension / identity). A `SWEPT` set gains the group number in the sweeping PR. Each pattern ends
   at `(?![\w-])` so a retired name never shadows its replacement (`--sp-duration-fast` vs `--sp-duration-fast-01`).

Plus the one build-correctness rule carried from `elevation-shadow-tokens-source`: no `shadow-[var(` arbitrary class
(Tailwind v3 drops it silently). PR 1 adds the fourth assertion the hand-off implies — the two asset files in the
app are byte-identical to `docs/redesign-v2/phase3/` modulo the removed `@import` line.

## 7. Flags surfaced by the triage (for the PR that owns them)

- **PR 1 — login inherits the system.** RULED 2026-09-03 (DECISIONS D4 confirmation): D4 rules the layout
  only; the primary going Blue 60 is the token layer working. `LoginForm.tsx` swept mechanically in PR 1;
  `login-form.test.mjs` untouched.
- **PR 3 — two shipped map layers the wireframes do not draw.** RULED 2026-09-03 (DECISIONS D1-h, D1-i): room
  washes + zone wash retire in PR 3 (`MapWashLayer`, `lib/officeRoomWash`, `lib/zoneWash`, `--sp-wash-zone`,
  `office-room-wash.test.mjs` together); cluster pills deleted in PR 3 (`lib/seatClusters.ts` is imported by
  nothing; it and `seat-clusters.test.mjs` go).
- **PR 3 plan check (owner, 2026-09-03).** The shipped map renders private offices (N13, N14, NE09, NE10, SE05,
  SE06, S01, S02) as nameplate cards — code, name, job title — not as 28px pills (`isOfficePlateSeat` in
  `SeatMarker.tsx`). The Phase 2 map wireframes and PHASE2UX do not mention private offices (grepped
  2026-09-03), so the PR 3 plan raises it under "Open for the owner" with the default that keeps the pill
  rule: name pill on the office seat, code via tooltip, title in the inspector. The card is never carried
  forward silently.
- **PR 4 — a guardrail loses an anchor by ruling.** `bulk-destructive-action-safety-source` and `data-utilities-panel`
  drop their Settings Reset-draft assertions because ruling 22 removes the feature; `resetDraftToPublishedAction`'s
  single call site (SeatMap Discard) is pinned instead.
