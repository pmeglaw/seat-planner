# Seat Planner redesign — Phase 4: code

**Status: in progress — PR 0 #512 merged (v1.74.0). PR 1 #513 merged (v1.74.1). 1b #514 merged (v1.74.2). PR 2 #515 merged (v1.74.3). PR 3a #516 merged (v1.74.5 — v1.74.4 went to chore #517). PR 3b #518 merged (v1.74.6, 2026-09-05). PR 4 #519 merged (v1.75.0, 2026-09-05). PR 5 #522 merged (v1.76.0, 2026-09-07). PR 5b #523 merged (v1.77.0, 2026-09-07). **PR 6 — the close-out — built 2026-09-08 on `feat/phase4-closeout` (plan of record `plans/phase4-pr6-closeout.md`), v2.0.0 on merge: Phase 4 complete.** Inputs, in reading order:
`CLAUDE.md` / `AGENTS.md`; `phase3/PHASE3DS.md` §5 (20 obligations with landing files, landing files by PR, retired
names) and §7 (what Phase 3 learned); `PHASE2UX.md` §3 (component checklist), §5 (nine obligations), the per-screen
decision logs and the wireframes under `wireframes/`; `PHASE1IA.md` §B–§C; `DECISIONS.md` D0–D6 + §6 (deviations
1–16 — no. 16 is the brand terracotta primary, 2026-09-03; next free **17**) + §8; the `ibm-design-language` skill (`SKILL.md`, `references/senior-workflow.md`) — plugin
`megeredchian/design-system` 1.3.0, fingerprint **`f997ee525800e755`**, 193,908 bytes LF, verified at the start of
this phase (2026-09-03) with the PHASE3DS §0 recipe. Off-limits as inputs: `docs/design-system/AUDIT*.md`, `PLAN.md`,
`shell-reference.html`, the `docs/redesign` branch, everything under `app/concepts/`.

Phase 4 makes no design decisions. Every visual and interaction question has an answer in PHASE1IA / PHASE2UX /
PHASE3DS; one that does not is a **finding** recorded in §1 and raised in the PR, never a choice made here.

Layout of `docs/redesign-v2/phase4/`:

| Path | What |
|---|---|
| `PHASE4BUILD.md` | this file — decision log, obligations checklist, test-triage outcomes, contrast line, lessons, slice log |
| `TEST-TRIAGE.md` | every source / component / text-reading / Playwright test classified guardrail · contract · look-pinning · mixed, with its disposition and PR |
| `audit/runtime-audit.mjs` | the runtime audit every PR reruns against the local Docker stack: zero undefined `var()` in matched rules on six routes × two themes, the system-state attribute check, console errors — and it takes the screenshots |
| `audit/marker-contrast.mjs` | the marker-state contrast audit (every PR that touches the pill or its tokens): drives the real seat marker into every interaction state on both map surfaces × two themes and measures text-vs-fill contrast on the rendered pill — a same-token pair is 1:1; shrink-only `LEDGER` for states the shipped component cannot pass until its rebuild PR |
| `screenshots/<pr>/` | per-PR captures (1920×1080 both themes + the one 1024 narrow frame per screen) with a provenance README — sample data only, never production names |

Rules of the phase (from the hand-off, restated so a later session cannot miss them): the four CSS files land
unchanged (one edit: the Google Fonts `@import` line leaves `carbon-tokens.css`); no `@carbon/*` dependency; no hex
outside the two assets, no `--cds-*` outside `sp-tokens.css`, no retired `--sp-*` names
(`tests/phase4-token-layer-source.test.mjs`); server surface untouched except the two ruled exceptions (Settings
Reset-draft entry removed — ruling 22; Ask Planner drawer 408 → 400); guardrail tests never loosened; publish never
breaks (`e2e-auth` green on every PR); every PR merges to `main` after the owner walks the Vercel preview.

---

## 1. Decision log

One paragraph per place code forced a call the documents don't make. Engineering calls (a React boundary, a hook
shape, where state lives) are one line each. Anything that *seemed* to force a design call was re-measured at
1920×889, re-read against the ruling, and if it still did not fit, written under the PR's "Open for the owner" with
the smallest resolving change — never resolved here.

Shape (`senior-workflow.md`):

```
Screen: <name> → Component
Problem: <what code forced>
Options considered: <two or three, one sentence each>
Choice: <what and why it serves task + outcome>
Trade-off: <what got worse, deliberately>
Would change if: <the evidence that reopens this>
```

### 1.1 PR 0 — the phased token-layer test

**Problem.** The hand-off asks PR 0 for a source test enforcing no-hex / no-`--cds-` / no-retired-names, and asks
every PR to keep CI green — but in PR 0 nothing has moved: `app/globals.css` holds 271 hex literals and every retired
name is still the shipped vocabulary.
**Options.** (a) Land the test skipped until PR 1 — no signal, and a skipped test is the kind that stays skipped.
(b) Land it strict and let PR 0 fail CI — breaks the release path on the first PR. (c) Land it green with a per-file
hex ledger that may only shrink and a retired-name ledger grouped by sweep PR, each PR removing its rows.
**Choice.** (c) — the test is the record of what is left, fails the moment a PR adds a hex or resurrects a name, and
ends the phase empty (`HEX_LEDGER = {}`, `SWEPT = {1,2,3,4}`). Same mechanism as `auth-theme-source`'s ledger.
**Trade-off.** Each PR edits the test as well as the code; the ledger is prose that can go stale — the stale-row
assertion closes that.
**Would change if** the four CSS files landed in one PR before any component (they do not: PR 1 lands tokens with
old components on top, so partial states exist by design).

### 1.2 PR 1 — the Phase 4 bridge file

**Problem.** PR 1 lands the token layer with every old component still mounted. Those components consume ~160
retired names from groups 2–4 (`--sp-chrome-*`, `--sp-marker-*`, `--sp-legend-*`, `--sp-ai-*`, `--sp-editor-*`,
`--sp-publish-*`, `--sp-trail*`, `--sp-wash-zone`, `--sp-tag-*`, `--sp-table-*`, `--sp-extension-*`,
`--sp-identity-*`) that no longer exist — undefined `var()` everywhere until PR 2–4.
**Options.** (a) Sweep all four groups in PR 1 — conflates the token PR with four component rebuilds.
(b) Accept undefined vars — transparent gaps in the preview, and "zero undefined `var()`" is the PR's success
criterion. (c) A fifth stylesheet, `app/styles/phase4-bridge.css`, loaded last: one alias per retired name
(`--sp-marker-assigned-surface: var(--sp-pill-fill)`, a literal `transparent` / `none` where §5 retires
without replacement), deleted group by group in the PR that sweeps it.
**Choice.** (c) — 136 aliases, generated from the §5 family map; the token test asserts every alias resolves
to a defined `--sp-*` name and none survives its sweep. Owner-ruled placement (2026-09-03): the bridge is its
own file so `globals.css` (Tailwind preflight) can load *under* the design system and the bridge *over* it.
**Trade-off.** Old components render with placeholder semantics (a marker's hover edge is a pill edge) until
their PR; accepted — the preview is "looks wrong by design".
**Would change if** a sweep PR lands out of order (the bridge assertions fail, which is the point).

### 1.3 PR 1 — the font bridge (the one `--cds-*` override outside `sp-tokens.css`)

**Problem.** `next/font/local` emits a hashed family name exposed through `--font-sans` / `--font-mono`; the
asset's `--cds-font-sans: "IBM Plex Sans", …` names a family no `@font-face` declares, so every Carbon type
class would fall through to Helvetica / Arial.
**Options.** (a) Edit the asset — forbidden. (b) Author our own `@font-face` under the literal family name —
duplicates `next/font`, and the woff2 files live outside `public/`. (c) Override the two Carbon font tokens
in the bridge file: `--cds-font-sans: var(--font-sans), "IBM Plex Sans", …`.
**Choice.** (c), allowed by exact name in `tests/phase4-token-layer-source.test.mjs`; `layout.tsx` keeps
`variable: "--font-sans"` / `"--font-mono"` on `<html>` so `:root` sees them (the test pins both).
**Trade-off.** One `--cds-*` reference lives outside the semantic layer, permanently in effect; it stays in
the bridge file so the "assets untouched" rule holds and the exception is visible.
**Would change if** the asset ever reads the family from a variable of its own.

### 1.4 PR 1 — three theme states, nothing seeded

**Problem.** The shipped boot script seeded a dark OS into an explicit `data-theme="dark"` and expressed
"light" by deleting the attribute; the design system has a `prefers-color-scheme` guard and the PR 2 Account
radio has a real System option.
**Choice (owner ruling 2026-09-03).** Stored light → `data-theme="light"` (Carbon `white`, beats a dark
OS); stored dark → `dark` (`g100`); nothing stored → no attribute at all — system — and the asset's guard
renders dark for a dark OS. `lib/theme.ts` owns `carbonThemeFor`, `applyThemeAttributes`, `applyTheme` and
the boot string, built from the same constants; `theme.test` runs the boot string against a fake document
and compares it with the function. The raster lightbox filter, which keyed on `[data-theme="dark"]` alone,
takes the same three-state shape in the bridge file (light on bare `:root`, dark under the guard
`:root:not([data-theme="light"])`, dark again under the forced attribute).
**Trade-off.** A system user's `data-theme` is absent, so nothing app-side can read "dark" off the attribute;
anything that needs it reads the media query, which is what the CSS does.
**Would change if** Carbon dropped its media-query theme.

### 1.5 PR 1 — group-1 placeholders and one named shadow

Engineering, one line each (bridge semantics; every consumer is rebuilt in PR 2–5):
`--sp-brand*` → `--sp-interactive` / `-hover` → `--sp-button-primary-hover` / `-subtle`, `-wash` →
`--sp-layer-hover` / `-text`, `-deep` → `--sp-link` / `-border` → `--sp-border-interactive` / `-mark` →
`--sp-status-draft-mark`; `--sp-accent` → `--sp-interactive`; `--sp-link-on-field` → `--sp-link`;
`--sp-status-*-strong` and `-border` → `-mark`, `-hover` / `-pressed` → `--sp-button-danger-hover` /
`-active`, `-surface-hover` → `-surface`; `pending` → `draft`, `published` → `success`, `danger` →
`error`; every shadow token → `--sp-shadow`; `--sp-focus-offset-color` → `--sp-background`;
`--sp-duration-fast / -standard / -deliberate` → `-fast-01 / -fast-02 / -moderate-02`. Tailwind keeps ONE
named shadow, `shadow-sp` → `var(--sp-shadow)` (40 sites) — a bridge the owner requires gone by the end of
PR 5. The brand-orange `rgba(255,87,21,α)` / `rgba(210,63,10,α)` washes (8 sites: FilterPanel,
MapWashLayer, SeatMarker) became `color-mix(in srgb, var(--sp-interactive) α, transparent)`; the six SVG
`#fff` attributes in `LoginForm` became `stroke-[var(--sp-text-on-color)]` / `fill-[…]` classes; the
publish-diff `--admin-diff-vacated-text` (defined in the deleted block) → `--sp-status-error-text`.
Three placeholders were corrected by the `e2e-auth` axe scan (CI run 1 on #513 — 28 colour-contrast failures,
one cause): the old chrome now follows the theme (light in the light theme), so aliases that assumed a dark
surface fail on white — `--sp-chrome-heading` / `-value` / `-info-text` → `--sp-text-primary`,
`--sp-chrome-label` → `--sp-text-secondary`, `--sp-chrome-info` → `--sp-layer-02`, `--sp-ai-chrome-border` →
`--sp-ai-border-start`, `--sp-ai-chrome-text` → `--sp-ai-label-text-hover` (blue 70: blue 60 is 4.42:1 on the
hovered chrome fill, PHASE3DS §3 instance 2); and the Management monogram's `--sp-brand-text` placeholder
became `--sp-text-primary` (blue 60 on `layer-hover` is 4.08:1 at 12px bold). Reproduced and cleared locally
with an axe scan on the Docker stack before the re-push. A local `test:e2e:auth` run then caught three
more: blue 60 link text on the `layer-hover` fill (4.08:1) — every className that pairs the two now uses
`--sp-link-hover` (17 sites); helper text inside the swap dialog's `layer-accent` cards (3.8:1) →
`--sp-text-secondary`; and the dimmed (45 %) available markers, whose new opaque `layer-01` fill can never
clear 4.5:1 under the dim — the alias is a translucent `color-mix(… 55 %, transparent)` like the old 55 %
frost (PR 3 replaces the marker; the pill's quiet state is designed for this).

### 1.6 PR 1 — the selected pill's text, and the marker-state contrast audit

**Problem.** The owner's preview walk found the selected marker rendering as an empty white pill with a dark
outline in the light theme: the shipped viewer arm (live on both surfaces — the `adminMarker` arm is dormant)
pairs a literal `text-white` with `--sp-marker-selected-surface`, and the bridge maps that surface onto the
Phase 3 pill fill (`--sp-pill-fill` → `layer-02` = white). Same collision on the search-selected arm (white on
`--cds-highlight`). The dark theme masked both (white on `#393939`). Neither the token test, the runtime
audit (every var resolved) nor axe (the marker's translucent frost hides the fill from it) could see it: the
pair only collides once the bridge resolves both sides.

**Options.** (a) Text → `--sp-text-primary`: the pair Phase 3 intends — `.sp-pill[aria-selected]` keeps
`--sp-pill-text` and carries selection on the 2px inverse edge. (b) Text → `--sp-text-inverse` with the surface
re-aliased to `background-inverse`: the pair the OLD recipe intended (dark pill, white text) — a look Phase 3
retired; the bridge would be inventing an inverse pill no token defines.

**Decision.** (a), both arms. Plus a mechanical guard, `audit/marker-contrast.mjs`: it drives the real marker
into rest / hover / keyboard focus / selected / search hit / search-selected / filtered-out / admin selected /
move origin / move-candidate hover / swap origin / swap-candidate hover / swap target / changed-in-draft, on
both surfaces and both themes, and measures the rendered text against the rendered fill (span opacity, the
marker's ancestor opacity and a translucent fill are all composited before the ratio). The first run caught a
second pair: the swap target's code eyebrow at 70 % (3.47:1 light) — the target now joins
`lightProminentSurface` (90 %, 5.53:1). It also measures what the shipped 45 % dim actually does to the
filtered-out pill (2.95:1 light, 3.53:1 dark): a `LEDGER` row carries that state to PR 3, where the opacity dim
retires for the Phase 3 quiet pill (`sp-components.css` §12); the ledger is shrink-only, so a row that starts
passing fails the run. Not driven: invalid-target (`SeatMap` never passes `invalidTarget`) and planner
highlight (needs Ask Planner; its viewer arm reuses the move-origin pair).

**Would change if** PR 3 keeps any opacity-based state: then the ledger row becomes a design decision to raise
with the owner (60 % is the floor at which `text-primary` clears 4.5:1 on both themes), not a rebuild note.

---

### 1.7 PR 1b — the brand layer (owner ruling 2026-09-03; DECISIONS §6 no. 16)

**Screen** every surface · **Problem** the firm's brand hand-off (`docs/brand/`) makes terracotta #B85C2E the primary-action colour; the hand-off's CSS keyed its overrides to `[data-carbon-theme="g10"]`, a state this app never sets · **Choice** one brand file, `app/styles/brand/megeredchian-law-tokens.css`, loaded after `sp-tokens.css` and before the component layers, carrying the hand-off's values verbatim under this app's three theme selectors (bare `:root` + `[white]`, the `prefers-color-scheme` guard, `[g100]`) and re-pointing the three tier-C zone tokens that read the palette directly (`--sp-shell-current-bar`, `--sp-panel-dark-link`, `--sp-ai-border-end`) · **Trade-off** a second file may hold hex and `--cds-*` (the token test allowlists it by name and gates the brand rules instead); `--cds-highlight` stays blue 20 / blue 90 until the owner rules a terracotta tint; the Draft mark's orange 40 now sits near the brand hue — two signals keep it distinct, re-measured in the PR 3 marker rig · **Would change if** the brand changes or the 4.56:1 primary measures illegible in use. The zip's generic `CLAUDE.md` was NOT dropped over the repo's (it described `src/`, `_app.tsx`, a left rail and a `g10` state); its content became the locked "Brand System" section of the real `CLAUDE.md`, corrected to this repo, with the original kept at `docs/brand/CLAUDE.brand-handoff.md`.

### 1.8 PR 2 — the provisional tenant row (the PR 2 / PR 3 seam)

**Screen** `/` and `/admin` · **Problem** the Phase 3 header has no slot for SeatMap's bar tenants (undo/redo · floor · Ask Planner · Publish) or the viewer search, and PR 3 builds their real home (the map control row, PHASE2UX §1M.3); leaving the old top bar in place would have meant two headers · **Choice** AppShell renders one 48px `layer-01` row under the header with the three `[data-topbar-slot]` elements the surfaces already portal into, marked `PHASE 4 BRIDGE` in the JSX and named in §3's PR 3 row; the row hides itself while every slot is empty (a MutationObserver — the tenants arrive through portals the shell never sees) and the slots stay mounted for the shell's lifetime (the portal-teardown contract from #333) · **Trade-off** `/admin` and `/` carry 96px of chrome until PR 3, and SeatMap's below-`lg` viewport budgets and the floating panels' top offsets count the row as a second `--sp-shell-header-h` (marked in place) — PR 3 drops both with the row · **Would change if** PR 3 slips: then the row gets the control-row tokens instead of `layer-01`.

### 1.9 PR 2 — `getDraftStatusAction` and the live override (owner ruling 2026-09-04)

**Screen** `/admin/management`, `/admin/settings` · **Problem** D2 "the count travels": the indicator reads "Draft — N changes" on every admin route, but the sub-pages load no seat data · **Choice** ONE read-only server action — `requireAdmin()` first (so `require-admin-guard-source` covers it automatically), no RPC, no migration, no `revalidatePath`, the same paged reads as `/admin` so the count equals the publish review's — called once per shell mount on admin routes, and only when SeatMap has not pushed a live value through `useAppShellNavigation({ draftStatus })`; the viewer shell never calls it, so the two-layer rule holds. The live value is mirrored into a ref so a surface registering from a child effect suppresses the fetch in the same commit · **Trade-off** four paged reads per sub-page mount (Management already made them for its own tab); the sanctioned exception to "no new server actions" · **Would change if** the publish diff moves server-side — then the action returns the review's own summary.

### 1.10 PR 2 — skip-link copy kept (PHASE2UX §1.7 amendment, owner ruling 2026-09-04)

**Problem** §1.7 says "Skip to main content"; the shipped per-route labels ("Skip to seat map" / "Skip to content") are pinned by `accessibility-source` · **Choice** keep the shipped labels in `shellNavConfig.ts` — the guardrail is first-focusable + a real target, and the copy is more informative than the generic · **Would change if** a page gains a second landmark worth skipping to.

### 1.11 PR 2 — the left panel pushes by composition; one breakpoint constant

**Problem** PHASE2UX §1.3 says the panel *pushes* the canvas, but the landed `.sp-left-panel-host` is `position: fixed` + translate (it floats), and the four CSS files land unchanged · **Choice** AppShell pads its content pane by `--sp-panel-left-w` while the panel is open (`motion-safe` padding transition on fast-02) — the push is composition, not a CSS edit; the pane also carries the fixed header's offset and is the viewport-height flex column the pages fill (`flex min-h-0 flex-1`, `shell-viewport-height-source` rewritten to that contract). The header-nav breakpoint is read once from `BELOW_NAV_QUERY = "(max-width: 1055px)"` (the asset's own media query) through `matchMedia`; no Tailwind `nav` screen was added — nothing consumes a class-side variant · **Trade-off** the panel's `data-open` attribute lands one frame after mount so the transform transition runs; the exit is instant (the aside unmounts) · **Would change if** the asset gains a push variant.

### 1.12 PR 2 — Position stays as the fourth filter group (owner ruling 2026-09-04; PHASE1IA ruling 21 + PHASE2UX §1.3 amendments)

**Problem** the shipped viewer filters by Position; Phase 2 enumerated Department · Zone · Status · **Choice** Department · Zone · Status · Position, same pattern (checkbox items, per-group Clear, counts including zero, Hidden on the roster floor only when nobody listed has a position), `?position=` beside `?dept=` / `?zone=` / `?status=` in B3 — all four written by the viewer as URL state now (`lib/deepLink.ts`), read once after hydration like `?floor=`. Counts are per option on the current floor (seats on the plan, people on the roster), independent of the other groups (`lib/viewerFilterGroups.ts`). Single-select semantics kept: re-checking the checked item clears the group. The Q5 floor-aware summary rides the panel's note with its "Show Floor N" action so a filter never returns an unchanged map in silence · **Not a deviation** — panel pattern unchanged, only the category count · **Would change if** supervisors stop filtering by role.

### 1.13 PR 2 — header is text only; the M-mark is available on request (owner ruling 2026-09-04)

**Problem** the brand hand-off (`docs/brand/HANDOFF_FOR_CLAUDE.md` Step E) describes a header M-mark and an uppercase wordmark; D0-d rules text · **Choice** "Megeredchian Law" + "Seat Planner", text, `translate="no"` on the org name; `public/Logo-Megeredchian-Law.jpg` is not a header asset · **Available later** an inline flat SVG M-mark in `--brand-charcoal` + `--brand-terracotta` (never the logo orange) at 48px, as an owner-requested change.

### 1.14 PR 2 — what did not fit the documents (recorded, not decided)

- **Sign-out failure state** (specimen "Sign-out didn't complete"): the form is a native POST, so no client-side failure channel exists; a failed sign-out returns to the same page signed in. The state is omitted and said so here.
- **Right-panel outside click** closes the panel except when the pointer lands in the header (the triggers toggle themselves); PHASE2UX §1.4 rules only Esc and the icon. Mechanical.
- **Left panel on sub-pages below `lg`** carries only the section links; its header row then reads "Sections" (no filters registered until PR 3), so the landmark is never labelled "Filters" over a panel without any.
- **Unsaved-edits guard**: the History switch keeps `?floor=` / `?seat=`, so `isGuardedNavigationHref` now matches the pathname of a href carrying a query (the closed set spelled out only bare hrefs). Caught by the real-browser tier.
- **`adminChrome.ts`** stays until PR 3: SeatMap's bar tenants still consume its divider rule; it leaves with the tenant row.

### 1.15 PR 2 — two rulings from the preview review (owner, 2026-09-04)

**Header at laptop widths.** The indicator centred on x = width/2 (PHASE2UX §1.2, measured only at 1920) met the admin's four links below ~1580px and at 1280 sat over Settings and swallowed the click (caught by `nav-shell.spec.ts`). Options put to the owner: fold the links below ~1600 / centre the indicator in the free run / left-align it. **Ruling: centre in the free run** between the last section link and the first utility — one fluid rule correct at every width for both roles, no second breakpoint, the nav fold stays at the asset's 1055. `.sp-header-center` becomes a `flex: 1` centred cell (an `sp-components.css` override recorded in PHASE3DS §2; the Phase 3 copy edited in step so the deliverable and the specimens stay one). PHASE2UX §1.2 row 4 and PHASE1IA ruling 23 amended. Measured at 1920 (`header-geometry.spec.ts`, e2e-auth): admin indicator centre x = 1227 (links end at 679), viewer x = 1127 (links end at 479); at 1056 — the last width before the nav fold — 795 and 695. Pinned by `tests/e2e-auth/header-geometry.spec.ts`: at 1920 / 1580 / 1366 / 1280 / 1056 the indicator's box never intersects a section link or a utility, for the admin and the viewer link sets (the backend-free `viewport-matrix` tier cannot sign in, so the geometry lives with the authenticated tier).

**Current bar on a hovered current link.** Measured 2.77:1 (`#B85C2E` on the asset's gray-90-hover) against 3.97:1 at rest. **Ruling: the current link takes no hover fill** — it is not a destination, so a hover affordance promises nothing and no new colour is introduced; other links keep the asset's hover. An `sp-components.css` override (PHASE3DS §2), the fifth hover-surface instance (§3), and the bar's rest + hovered pairs added to `contrast/generate-pairs.mjs` (193/193).

### 1.16 PR 3a — the provisional tenant row is gone; the map's own control row (PHASE2UX §1M.3)

The PR 2 seam closed as named: `AppShell` no longer renders a tenant row or a slots context; `SeatMap` and `ViewerSeatFinder` mount the shared `MapControlRow` (`.sp-control-row`) as the first thing in their content pane — 48px under the fixed shell header, above canvas and slot, so the row never reflows when a panel opens. Every budget that carried `2 * var(--sp-shell-header-h)` for the row now carries `var(--sp-shell-header-h) + var(--sp-control-row-h)`; the interim 96px chrome is 48 again. The shell gained two read-only hooks in place of the slots: `useAppShellLeftPanel()` (the row's "Filters · N" opens the same panel the hamburger does — patterns.md: a collapsed filter shows its count and clears without reopening) and `useAppShellState()` (the person's published seat for "Find me", D1-f — the published layer on every surface, the admin's included). `SeatMap` now registers the same four filter groups the viewer does (`useAppShellFilters`, counted on the draft layer), so the hamburger appears on `/admin` at every width (D0-h) and the four params are URL state on both routes (PHASE1IA B3).

### 1.17 PR 3a — one Find surface on both surfaces (D1-d); the admin's results panel retires

Phase 2 gives both modes ONE search (the row's field + the 560 palette) and Phase 3 names no results panel, so the admin's `ResultsPanel`, its floating command-search card and the mobile canvas search retired into the same `ViewerFindPalette` the viewer mounts, fed from the draft working set. The field is the shared `MapSearch` (`.sp-search`: magnifier, unlabelled input, the `.sp-kbd` platform hint from the one detector in `lib/platformShortcut.ts` — P3-4 — a clear × once a query exists, and the trailing scope segment). **Scope semantics built as D1-d writes them:** "This floor" lists this floor's rows, the header always carries both counts (`Results · 7 on this floor · 11 in building`, zero included), and the zero state offers Widen when the building has hits. A row on the other floor is therefore reached by widening first — the tests that used to expect cross-floor rows under the default scope were re-pointed, not the rule. `AiHighlightChip` retired too: the row's Ask Planner button carries the highlight count (D1-c re-entry point) and the drawer's "Clear highlights" is the labelled way out.

### 1.18 PR 3a — `?q=` and `?names=` join the URL contract; one writer

`lib/deepLink.ts` gained `?q=` (the search text, D1-d landing: field pre-filled, palette open, a unique match opens itself, several stay a list, zero shows the zero state with the query kept) and `?names=`. **Finding, recorded:** the names toggle is OFF by default on both surfaces (a remembered per-browser preference), so the shareable state is ON — the URL carries `names=on` and never `names=off` (the plan said `off`; a shared link must not force names off for someone who turned them on). `lib/mapUrlState.ts` composes the whole B3 set (`floor` `seat` `q` `names` `dept` `zone` `status` `position`) in one `replaceState` per change (debounced 150ms for the query) — the viewer's two racing effects over `window.location.search` are gone — and the History switch keeps the whole set when it hops between `/` and `/admin`.

### 1.19 PR 3a — owner rulings applied (2026-09-04)

- **O1 private offices → the pill rule.** The door-plate card (`isOfficePlateSeat`, `getOfficePlateLayout`) retired with `lib/officeRoomWash.ts` (D1-h); every seat is the same marker — the shipped pill in this PR, the Phase 3 `.sp-pill` in 3b — with the seat code on hover / focus and the job title in the inspector. Recorded as a PHASE2UX §1M amendment, not a deviation.
- **O5** `SeatSheet.tsx` keeps its 12 ledgered hex until PR 5 (`/my-seat` ruling).
- **O6 the row wraps when its content does not fit** (`app/globals.css`, `.sp-control-row[role="toolbar"]`: content-driven, not a viewport query — the Docker captures showed the same overflow at 1920 with the left panel open, a 1664px pane). One line is exactly 48px, a wrapped row 96px; the search shrinks to 240px before the row wraps and never grows into the slack; above `lg` the stage is `flex-1` and absorbs the line. Not ruling-bearing (hardware target); editing is `lg`-and-up (D2 / deviation 4), so the 1024 frame keeps the draft cluster while a 1000px frame hides it and the band says "Editing needs a wider window." — captured both in `screenshots/pr3a/` (README findings 1–2: the first capture hid the wrapped line under the canvas — the rule lost to `sp-components.css` on load order; the band's note now sits outside its scroll region so it never clips).
- **O7** `public/brand/mark-1024.png` removed (no consumer; the CLAUDE.md sentence with it).
- **Retirements per D1-h / D1-i and the slice-log row:** `MapWashLayer`, `lib/zoneWash`, `lib/officeRoomWash`, `lib/seatClusters` and their three tests; `FilterPanel` / `ActiveFilterChips` / `DeptChipRow` (the shell's left panel + the row's split control are the filter UI); `FloorSelector` (→ `FloorMenuButton`, `.sp-menu-button`); `components/ui/adminChrome.ts`; the phone-stack names flipper (exactly one names control at any width — the row's). The `--sp-wash-zone` bridge alias left with the wash; the remaining group-3 aliases stay until 3b's marker sweep.

### 1.20 PR 3a — what did not fit the documents (recorded, not decided)

- **Undo / Redo disabled reasons.** The tooltips promise the shortcut ("Undo <last change> · Ctrl Z", "Redo · Ctrl Shift Z", P2-1) and the shipped controls stated their disabled reason ("No map changes to undo"); the row keeps both — the name carries the reason while nothing is undoable and the shortcut once something is. Both are the accessible name and the tier-C tooltip.
- **The band's count and the row's count are the same string** ("22 of 68 seats match"); the band adds the cross-floor line (Q5) and the row adds the live announcement. Redundant on purpose until 3b's slot work decides which one the pill states lean on.
- **Sign-in from an expired session** stays a full document navigation (`<a href="/login?next=/admin">` inside the canvas status notice) — the one sanctioned escape hatch (`lib/fullNavigation.ts`).

### 1.21 PR 3a — what the Docker-stack captures and the tiers found (2026-09-04)

- **`Ctrl K` hint 4.36:1.** The e2e-auth axe scan of `/` flagged `.sp-kbd`: the Phase 3 sheet set `--sp-text-helper` (gray 60) on `field-01` (gray 10) — Carbon's helper role is meant for text beside a field, not inside it. Now `--sp-text-secondary` (7.10 light / 8.86 dark) in `app/styles/sp-components.css` **and** the Phase 3 copy (the byte-identical pair kept; the one Phase 3 sheet amendment so far); two gated pairs added to `generate-pairs.mjs` (§4).
- **Marker rig, dark pass:** the `Swap CW01` locator matched the row's Undo ("Undo Swap CW01 · Ctrl Z") once a swap was in the history — `exact: true`. Rig captures are only trustworthy on a fresh seed: the e2e-auth publish leaves a draft the seed cannot re-apply over (`supabase db reset` + `db:seed` between runs).
- **Below `lg` on `/admin` the band's plain total count yields** to the read-only note (it duplicates the title's "N seats"); the filtered "N of M match" count never yields. The §1.20 redundancy note stands for the row/band pair at `lg` and up.
- **Ledgered for 3b:** the palette rows still wear the shipped Tailwind row styling (kind pill, count circles) — the `.sp-palette` frame, header, zero state and footer are Phase 3, the rows are 3b's sweep; the add-seat mode card is placed at `header + 48px` and overlaps a wrapped row's second line by 40px (3b's 400px slot owns the card).

### 1.22 PR 3a — the pre-merge smoke found IBM blue on the row: Carbon's light tertiary (2026-09-04)

**Screen** `/admin`, `/` · **Problem** the owner's pre-merge smoke (local Docker stack, `next start`, real Chrome, 1920×1080)
scanned every computed colour on the page for the IBM blues and found blue 60 on `Filters · N`, its Clear × and `Ask
Planner` in the light theme: the asset's `--cds-button-tertiary` is blue 60 (`carbon-tokens.css`), the brand layer
(1b) overrode primary / interactive / link / focus / brand / AI but never the tertiary role, and PR 3a is the first
slice to mount a `.cds-btn--tertiary` at all (the row's split Filters control and Ask Planner; the palette's "Widen to
the whole building"; the left panel's "Add them in Management" link). Neither the token test (blue is allowed in the
asset), the 195-pair suite (it lists the pre-brand names) nor axe (4.5:1 either way) could see it · **Choice** the
brand layer owns the tertiary role too — `--cds-button-tertiary: #B85C2E`, `-hover: #8F4521`, `-active: #7A3A1C` in
the LIGHT block only (CLAUDE.md brand rules 1 and 3: an interactive colour is never blue, primary actions and
interactive borders use the terracotta scale; no new colour introduced). The two dark states keep Carbon's white
tertiary — no blue there, and g100's white outline is Carbon's own rule · **Measured** label + 1px outline #B85C2E on
the white control row 4.56:1 (text) / 4.56:1 (graphic), white on the #8F4521 hover fill 6.91:1 — three gated pairs
added to `generate-pairs.mjs`, **198/198** (§4). Terracotta text on `layer-01` #f4f4f4 is **4.14:1**, recorded as a
not-gated pair: a tertiary must sit on white (`layer-02` / the row), never on `layer-01` — every current consumer
does; PR 4's 403 card (asset `.cds-empty` + one tertiary) must keep that · **Pinned** by
`tests/phase4-token-layer-source.test.mjs` (light block declares the tertiary role) · **Trade-off** the brand file
grows by one role; CLAUDE.md's "Where it lives" list names it · **Would change if** the owner rules the dark
tertiary terracotta too (the dark link `#E8A07A` would be the candidate, 8.39:1 on `#161616`).

### 1.23 PR 3a — the search-scope menu rendered behind the Find palette (2026-09-04)

**Screen** `/admin`, `/` · **Problem** the smoke's step "switch scope to Whole building" could not click the menu
item: `.sp-menu` is `z-index: 20` inside the row's `.sp-search`, the Find palette is `position: fixed; z-index: 70`
anchored under the same field, and the palette is open whenever the scope menu is — so the menu painted BEHIND the
palette and the pointer landed on the palette's result rows. The PR's own capture `screenshots/pr3a/admin-search-scope-*`
shows exactly that (no menu visible over the zero state) and was read as "the scope segment" — a capture that was not
verified against what it was named for. Keyboard users could still reach the items (focus is unaffected); mouse users
could not · **Choice** one product rule in `app/globals.css` beside the O6 wrap rule:
`.sp-control-row[role="toolbar"] .sp-search .sp-menu { z-index: 80 }` — the sheet's `.sp-menu` stays as landed (the
floor menu never coexists with the palette), the row-scoped override lifts only the scope menu above the palette ·
**Trade-off** a second `z` literal outside the sheet (the palette's `z-[70]` is the first) · **Would change if** the
palette moved into the search's own stacking context (then the sheet's z-20 would order them).

### 1.24 PR 3a — the ⋯ trigger had a name but no tooltip (2026-09-04)

**Screen** `/admin` · **Problem** the smoke tabbed the control row: every stop carried the 2px inset terracotta
ring, and every icon-only button showed its tier-C tooltip on focus — except "More actions". The asset's
`.cds-overflow` trigger ships without one, and PHASE2UX §1M.3 names the tooltip only for Undo / Redo; the rule
that every icon-only control in the row and the shell utilities carries the tier-C tooltip (PHASE3DS §1.9, §2)
covers it · **Choice** the ⋯ trigger takes the same `sp-has-tooltip` wrapper as the row's `IconWithTooltip`
(the menu stays a sibling of the wrapper, so focus inside the open menu never shows it); one product rule hides
the tooltip while the menu is open on hover (`.cds-overflow[data-open] .sp-tooltip`, `app/globals.css`) ·
**Not a design decision** — the pattern and the copy ("More actions" = the accessible name) already exist ·
**Would change if** the asset gains a tooltip on `.cds-overflow`.

### 1.25 PR 3a — the first Redo after a seed does nothing (pre-existing; root cause found; 3b item, not fixed here)

**Screen** `/admin` · **Observed** in one of thirteen smoke-rig runs of move → Ctrl Z → Ctrl Shift Z: the undo
applied, then Redo left the draft at "no changes" with BOTH stacks disabled. **Reproduced on demand (2026-09-04,
owner's pre-merge check)** — 30 trials each, fresh `/admin` load per trial, Playwright on real Chrome, local Docker
stack reseeded before each set:

| build | trigger | result |
|---|---|---|
| `main` @ v1.74.3 (9d53408) | Undo / Redo buttons (no shortcuts on main) | trial 1 fails, 2–30 pass (29/30) |
| `feat/phase4-map-frame` @ 69165a6 | Ctrl Z / Ctrl Shift Z | trial 1 fails, 2–30 pass (29/30) |
| either build, same database, new browser | — | 0 failures (3/3 runs) |
| either build, fresh `db reset` + seed | — | trial 1 fails every time (4/4 reseeds) |

**Repro rate** is therefore not a probability: 100 % on the first undo → redo cycle after any whole-draft state
that holds a seat with `notes = ''`, 0 % thereafter. The smoke's "1 of 13" was the one run after the e2e-auth
global-setup reseed. **Not a race and not MLS02** — the trace shows no server-action POST on the redo press, only the
`router.refresh()` RSC GET that `handleStaleDraft` fires; the text on screen (which the smoke rig's selector had
missed) is the client-side adjacency message: "The draft changed in another session after this edit was undone, so
redoing it is no longer safe. This page has been refreshed with the latest draft."

**Cause.** `002_seed_initial_data.sql` inserts every seat with `notes = ''` (an empty string, not null). The page
props carry that `''` into the history entry's `before` snapshot. Undo runs `restore_draft_snapshot`, which writes
`nullif(trim(coalesce(source.notes, '')), '')` — every draft seat's notes become `null` — and returns the payload
that `onRestored` adopts. Redo's `historyAdjacencyBroken(entry.before)` then compares `notes: ""` (snapshot) with
`notes: null` (live) through `draftStatesEquivalent`'s canonical JSON, which strips only `created_at`/`updated_at`,
so the states differ on all 60 seats and the fence path (`clearHistory()` + refresh) runs. Diff of the persisted
`seat-planner:draft-history:v1` entry before and after one restore: 60/60 seats differ, field `notes` only
(`"" → null`); employees 0/12. `update_draft_seat` already stores `nullif(trim(...))`, so an admin clearing a note
writes `null` and does not re-arm it; CSV import and the seed are the `''` writers. Production seats came from the
same migration, so any draft seat never rewritten by a restore may still carry `''` (owner to confirm:
`select layer, count(*) filter (where notes = '') from public.seats group by layer` — read-only).

**Not changed in 3a** — the fence is load-bearing (`lib/draftConcurrency.ts`) and the fix belongs with the
history helper's tests, not a map-frame PR. **Tracked for 3b** (plan `phase4-pr3-map.md`, "Carried from 3a"):
make `draftStatesEquivalent` compare the nullable text columns the RPCs normalise (`notes`, `zone`, `department`,
employee `position` / `department` / `phone_extension` / `avatar_url`) after the same `nullif(trim())` — a pure
`lib/draftHistory.ts` change with a `tests/draft-history.test.mjs` case pinning `'' ≡ null ≡ '  '` — and re-run
`redo30.mjs` (scratch rig, 30 trials, expect 30/30 on a fresh seed). Rig and traces: the session scratchpad
(`redo30.mjs`, `redo30-main-button.json`, `redo30-branch-keys.json`, `hist-fresh.json` / `hist-post.json`).

### 1.26 PR 3b — the hit surface and the Draft family leave Carbon's hues (owner rulings O2 / O3, 2026-09-04; built 2026-09-05)

**Screen** `/`, `/admin`, the header. **Two tokens families still read as Carbon after the brand layer (no. 16):**
the search / filter hit pill (`--cds-highlight` blue 20 light / blue 90 dark, `support-info` edge — the one blue
CLAUDE.md rule 1 left open) and the Draft family (`--cds-status-caution-mark` orange 60 / 40, `support-caution-major`
orange 40 in the header), which the plan measured against the terracotta primary at pill size: light orange 60
`#ba4e00` vs `#B85C2E` = **ΔE2000 5.3, 1.10:1**, same hue angle and lightness — one hue beside a focus ring.

**The skill read the ruling asked for** (`references/status-and-dataviz.md`, before numbering): the table fixes
*Draft, not started* = **Gray 60**, *Serious warning* = Orange 40 (outline Orange 60), Purple 60 = *Outlier,
undefined status*, and notes "a draft/published product already has its color decided". It does **not** leave the
draft hue open, so purple is a **deviation, not a D0-a amendment** — and so was Phase 3's orange, which PHASE3DS
recorded as TRUE-conformant on the two-signal rule alone. Recorded as **DECISIONS §6 no. 17** with the gray-60
reasoning (gray 60 is helper text and the quiet pill on a gray-dominant map — it cannot carry a mode identity).

**Built.** Brand file only (the four CSS deliverables untouched; `sp-tokens.css` still *aliases* the Carbon roles —
its comments naming orange are amended in PHASE3DS §1, not edited): light block `--cds-highlight: #FBE8DC` (light
only, per the ruling — the dark `--cds-highlight` blue 90 has **no consumer** after PR 3a: `--sp-highlight` feeds
only the retired `--sp-wash-zone` bridge alias and `--sp-status-search-surface` nothing, both gone in the T7
sweep), `--sp-pill-search-fill/-edge` in all three states (light tint + terracotta edge; dark neutral `layer-02`
fill + `#E8A07A` edge — terracotta on `#393939` is 2.53:1), `--sp-status-draft-mark` + `--sp-pill-badge` purple 60
light / purple 40 dark, zone `--sp-mode-draft-mark` purple 40. Every consumer follows through the tokens: the ◇
badge, the inspector note, the mode indicator, the History rows, and — until their own tasks restyle them — the
shipped Ask Planner "refused" / warnings chrome, the inspector dirty chip, the review dialog's "Reassigned" tag and
Settings' draft callout, which read `--sp-status-draft-*` today. Pairs regenerated (§4); the token test pins every
value per block and that the caution orange and the highlight blues are absent from the brand file.

### 1.27 PR 3b — one marker arm on the Phase 3 pill; the code tier, the text tier and the hit floor retire (O1, P3-11, P3-12)

**Screen** `/`, `/admin`. `SeatMarker.tsx` had three vocabularies (§1.6): the live viewer arm on `--sp-marker-*`, a
dormant admin arm on `--sp-legend-*`, and the never-imported raw-hex `markerStateClassRecipes` — plus a fixed 46×24
code pill de-collided by `computeCodePillNudges`, a 12px "text tier" above a collision threshold, a pitch-gated 44px
hit floor, and the office nameplate card. **Choice.** ONE arm on `.sp-pill` / `.sp-seat-footprint`: an assigned seat
is the 28px fit-width name pill (label-01 `First L.`), an empty seat the 28px footprint with its inlined `SeatMark`
symbol, and in a move or swap every seat is a pill (empty seats show their code) so the origin, the valid targets and
the invalid targets read as one set. States are CSS modifiers — one silhouette each, the specimen's grayscale strip —
and selection is `data-state="selected"`. The seat code is the tier-C tooltip on hover / focus (P3-11) and the
inspector eyebrow on selection; no `title`. Width comes from the label (P3-12); the collision nudge is an inline
transform on the marker wrapper (±14 = half the pill height, D1: `PILL_HEIGHT_PX = 2 × PILL_NUDGE_PX`, pinned to
`--sp-seat-footprint`), computed by one width-aware graph (`computeNameLabelNudges` with each pill's estimated fit
width at the live scale; an empty seat is the 28 footprint). The code-pill graph, the text tier, the hit floor
(every marker now carries the asset's `.cds-touch-target`, deviation 7), the office plate and the raw-hex recipe
table (moved to the concept board, outside the hex scan) all retired; `tests/text-tier.test.mjs` retired with the
tier. **Found in build:** the Phase 3 footprint was designed as a static mark — on the plan it is a `<button>`, so
the sheet gained its focus ring, selected edge and quiet variant (PHASE3DS §1.4 amendment); names-off + filtered-out
had no state (§1.16 amendment: the filled footprint steps to the quiet edge colour, no opacity). The `filtered-out`
marker-rig ledger row closed with the quiet pill.

### 1.28 PR 3b — the right slot, one owner at a time (C9, D2-a, INV-4)

`RightSlot` mounts once per surface over the CANVAS COLUMN (not the stage): `.sp-slot-host` slides in, the column is
pushed by `pr-[var(--sp-slot-w)]` at lg, the control row above and the band below never reflow — and the slot can
never cover the band (the browser tier pins it). Owner: a running mode until it ends (the mode card, with the O4 note),
else Ask Planner, else the inspector while a seat is selected and expanded; a displaced inspector collapses to its
re-entry (the selection stays). Below lg the host overlays from the right at `min(400, 100%)` — usable, not
ruling-bearing. The band no longer yields to any sheet (nothing owns the bottom); the floating-inspector nudge
planner (`useInspectorNudge`, `planInspectorNudge`) retired with the pushing slot. **Not changed:** the 900px
`panel:` Tailwind screen stays — the shell still uses it, and `SeatMap`'s selection-centering anchor still keys on it
(below 900 it pans the seat into the strip above what used to be a bottom sheet; harmless, PR 6 close-out item).

### 1.29 PR 3b — the inspector on `.sp-slot` (P3-7 half, P3-8, P3-14, D1-e)

Header = eyebrow `Seat NE04 · North-east pod` · title · Copy link (`?seat=`, in-place "Copied") · ×; body = the
seat-mark legend row + `◇ Changed in draft` from `lib/draftChanges` (the SAME set that badges the pill and counts in
the legend — never a second derivation), the role line, contact rows (`dl` / `.sp-contact-row`) with Copy extension
and Copy link (`?q=`, D1-e), the assignment form on the asset's form pieces + `.sp-combobox` / `.sp-listbox`
(create-on-save as a `cds-tag` + helper), Move / Swap / Vacate as ghosts, Delete as the danger ghost (P3-8) with the
block reason as helper text (Hidden for originals — the seatProtection rule), notes, activity, the facts footer; a
64px commit bar (Cancel ghost · the container's own primary, `aria-busy` while saving). Errors are the notification
component (error kind, titled "Couldn't save this seat", field links as ghosts); the saved confirmation is its
success kind, inline. The Ask Planner row wears the `.sp-ai-label` with the hover step on the ROW (P3-7); the
inspector's only AI token consumption. The `--sp-editor-*` chips and the initials monogram are gone.

### 1.30 PR 3b — invalid targets (O4), Home / End, the Esc ladder (P2-3)

`lib/seatTargets.ts` is the one predicate: the source is the source; swap with both seats empty is invalid (the
`lib/seatSwap.ts` rule, previewed); an EMPTY reserved / unavailable seat is invalid for move and swap (O4); the
reason names WHICH rule and ends in a next step. SeatMap marks every invalid destination on the pill
(`.sp-pill--invalid`, `aria-disabled`, "Not a valid target.") and refuses the click with the reason in the canvas
status region while the mode runs — `invalidTarget` had never been passed before (the PR 1 carry). Home / End land on
the reading-order edges on both marker layers; the Esc ladder (dialog → drawer → mode → inspector → selection →
palette → search → filters) was already in §1M.11 order.

### 1.31 PR 3b — Ask Planner in the slot: a side panel, seven strings (P2-9, PHASE3DS §1.18)

The drawer is a slot owner, not a modal: no backdrop, no `aria-modal`, no tab trap; the map stays usable beside it,
Escape closes it through the surface's ladder, focus returns to the row's trigger (which lost `aria-haspopup="dialog"`
— it carries `aria-expanded` + `aria-controls`). Anatomy as drawn: eyebrow with the `.sp-ai-label` opening the
explainability popover (what it reads · what it never changes · Sources · confidence), subline, the dirty warning as
the notification component, stacked ghost prompts, the AI-bordered textarea (800, counter, platform hint), Ask as the
commit bar's primary; empty / loading / answer + highlighted-seat rows / follow-ups. **One notification, seven
strings**, each ending in the next step — `role="alert"` for unreachable · timeout · rate limited · not configured ·
model unavailable, `role="status"` for question-too-long and the fallback (owner ruling). No aura, glow or ring
anywhere; `--sp-ai-*` usage is the three survivors through the sheet's classes only. The e2e-auth accessibility spec
finds the question box by its visible label ("Ask Planner question").

### 1.32 PR 3b — the publish review as the wide tearsheet (C10, PHASE3DS §1.19)

`PublishReviewSheet` replaces the modal: anchored bottom below the visible header, overlay, **no ×** (Cancel is the
exit), rail readiness ("Ready · N changes" + the kind tag set, or "No changes"), the diff as a `.cds-table` under
`tr.sp-table-group` floor eyebrows in registry order (one `tbody` per floor), People details, the facts footer with
Cancel · `Publish N changes`. Submitting = info notification + Cancel disabled + `aria-busy` "Publishing…"; failure =
error notification with **Retry publish** and the review intact — the footer primary keeps its count so the two
buttons never share a name; no-changes = `.cds-empty` naming the next step + the disabled primary with its reason;
PUBLISH_BLOCKED closes the sheet and lands in the canvas status region (unchanged). The seven remaining confirm
dialogs stay in `SeatMapDialogs.tsx`.

### 1.33 PR 3b — the group-3 sweep (`SWEPT = {1, 2, 3}`)

Every marker / legend / selection / ai / editor / publish / trail / wash alias left the bridge and every consumer:
the trail paints with the pill's origin edge (`--sp-pill-origin-edge`), the admin panels' `--sp-editor-*` chips and
`--sp-publish-ready-*` callout with the status families the bridge already mapped them to (Management and Settings
are restyled in PR 4 — this is the mechanical re-point so the rule can hold globally), `Button.tsx`'s danger variant
with the error family. The bridge is fonts + group 4 (tag / table / extension / identity). `--sp-marker-h-max` is a
live Phase 3 geometry token (deviation 8) — exempted from the retired-name regex by name.

### 1.34 PR 3b — carry-ins: the row rules leave `globals.css` (C-1, Q1/Q2), the palette rows (C-2), the Redo fix (C-3, Q3), the seed (Q4)

- **C-1.** The O6 wrap, the search flex basis / 240 minimum, the scope-menu `z-index: 80` and the overflow-open
  tooltip rule moved from `app/globals.css` into `sp-components.css` (both copies) and the `[role="toolbar"]`
  specificity hook folded into `.sp-control-row` itself — the sheet sets the row's height, so no fight remains.
  `globals.css` is Tailwind base + resets (+ the font bridge / raster filter app rules); the token test asserts it
  holds no `.sp-` / `.cds-` selector (PHASE3DS §1.14 / §1.8 amendments, §2 rows).
- **C-2.** The Find palette rows landed on `.sp-palette-row` (kind tag · code / count / Floor tag; no avatar — the
  PR 4 ruling), with `[aria-current="true"]` + a focus ring in the sheet for the app's real `<button>` rows; the
  add-seat card's fixed offset went with the slot.
- **C-3 (§1.25 fixed).** `draftStatesEquivalent` normalises the nullable text columns the draft RPCs store through
  `nullif(trim(x), '')` — seat notes / zone / department, employee position / department / phone_extension /
  avatar_url — before the canonical comparison; `'' ≡ '  ' ≡ null`, a real edit still differs, `full_name` (not
  normalised by the SQL) stays strict. **Email is not in the list**: the ruling named it, but no RPC normalises it
  (the restore snapshot does not carry it), and `tests/draft-history-sql-agreement-source.test.mjs` pins the TS lists
  to exactly the columns the migrations normalise so the two cannot drift. No SQL change, no fence change. Re-run of
  the scratch `redo30.mjs` on a fresh seed: **30/30 pass** (MODE=keys, 0 skipped; 29/30 before the helper).
- **Q4.** `supabase/seed.sql` sets NE07 reserved and NE08 unavailable (both layers; the private offices NE09 / NE10
  exist only on prod) so the invalid-target measure and the legend's non-zero counts are real in the rig — local
  container only.

### 1.35 PR 3b — what did not fit the documents (recorded, not decided)

- The explainability popover's "How Ask Planner works" link is drawn as a link to the Help panel; the shell exposes no
  panel opener to a surface yet, so the drawer renders the popover text without the link (`onOpenHelp` is wired,
  unfed). PR 6 close-out item with the shell.
- The map's below-900 selection centering (`SEAT_CENTER_PANEL_BREAKPOINT_PX`) was written for a bottom sheet the slot
  replaced; it still pans the seat into the upper strip below 900. Harmless; PR 6.
- `AskPlannerDrawer` left `tests/accessibility-source`'s aria-modal file list and `dialog-error-placement`'s dialog
  census (it is a side panel now); the Ask Planner error test asserts the fallback as a STATUS inside the drawer.

### 1.36 PR 3b — the pre-merge smoke: a person's pending edit counted in the header but badged no seat (2026-09-05)

**Screen** `/admin` · **Problem** the owner's thirteen-step pre-merge smoke of #518 (local Docker stack, `next start`,
real Chrome 1920×1080, both themes; captures in `screenshots/pr3b-smoke/`) changed a seated person's department in
the inspector and saved. The header said **Draft — 1 change**, the review sheet listed the person under People
details, and no pill carried the ◇ and the inspector showed no "Changed in draft": `lib/draftChanges` badged only
the seat-row families of the publish diff (added · assigned · vacated · status · other) and read the people items as
"not seat changes". The one place that shows the changed detail — that person's pill and the inspector for that seat
— was the one place unmarked. · **Fix** the people items carry `employeeId` (`lib/publishSummary`), and
`draftChangedSeatLabels(summary, draftSeats)` adds the label of the draft seat each changed person sits in; a person
with no draft seat badges nothing (the sheet still lists them). One source still: the ◇, the inspector note and the
legend's count all read the same set. Verified live: the pill ◇ purple 60 / purple 40, the inspector "Changed in
draft", the legend "Changed in draft 1". · **Pinned** `tests/draft-changes.test.mjs` (the item carries the id; the
seated person's seat is badged; the unseated person is not; without seats nothing is badged).

**Recorded, not changed (the smoke's other readings):**
- **Decision (owner, 2026-09-05, on the smoke's step 4): the tooltip carries the seat code only, on every seat,
  always.** The refusal reason ("NE07 is reserved — choose another seat.") lives in the canvas status notice and in
  the control's accessible name ("Not a valid target"), never in the tooltip — `lib/seatTargets` as written (the
  reason named in the status region, never colour only); the tier-C tooltip's contract stays one line, the code
  (PHASE3DS §1.8, §1.16). PHASE2UX §1M.6 carries the same line so the wireframe spec matches.
- Discard draft changes keeps a people edit made in the inspector (the dialog says so: "People edits in Management
  are kept") — after a department change the header stays "Draft — 1 change" and the ◇ stays. The smoke's step 10
  uses a seat change (a move); the people rule is Management's and predates 3b.
- The admin draft route's header is always the draft indicator (`lib/shellMode` `modeStatusFor`): after a publish
  it reads "Draft — no changes" with the ◇; "Published · <date>" with the filled square is the published surfaces'
  text (`/`, Reception) and the History panel's fact line. The smoke's step 9 reads both.
- Clicking a pill while Ask Planner owns the slot selects the seat and keeps the drawer (INV-4 owner order mode
  card > ask > inspector — the drawer's own "Select <seat>" buttons rely on it); nothing stacks; closing the drawer
  hands the slot to the inspector for the selected seat.
- The per-seat fence (MLS02) fires on the row the RPC writes — a move fences on the DESTINATION row. A people-only
  edit in another tab does not advance a seat row, so it does not trip the fence; the smoke's step 11 has the second
  tab fill the seat the first tab then targets.
- 1024 is `lg`: editing stays, the row wraps to 96, the inspector keeps its 400 (canvas 624); the "Editing needs a
  wider window." line is the 1000 frame (O6, §1.19).

### 1.37 PR 4 — Management + Settings: what the code forced (plan v2 approved 2026-09-05; built 2026-09-05)

Plan of record: `~/.claude/plans/spicy-hopping-axolotl.md` v2 — the record (PHASE2UX §1G / §1S, PHASE3DS §1.22–§1.28
+ §5, DECISIONS D5 / D6, specimen `03-panels-and-sheets.html`) is the spec; the owner's brief was read through it, and
ONE ruling amends it (§1.38). Built on `feat/phase4-pages`. Engineering calls, one line each:

- **The sticky tab strip zeroes the header offset at `lg` on its own element.** The sheet's `.sp-tabs-host { top:
  var(--sp-shell-header-h) }` assumes a scrolling document; in the shell the content pane is the scroll container at
  `lg`, so the strip would float 48px below the pane's top. `ManagementFrame` sets the custom property to `0px` on the
  strip only (`lg:[--sp-shell-header-h:0px]`) — nothing inside reads it, the tearsheets (fixed, outside the strip)
  keep the real value. No sheet change.
- **`?tab=` stays a shallow `history.replaceState`**, not `router.replace`: the page is `force-dynamic`, and a soft
  navigation refetches the whole directory for a tab click (the plan said `router.replace`; the shipped writer was
  right).
- **The directory's scroll listener is capture-phase on `window`**: `scroll` does not bubble, and at `lg` the scroll
  container is the pane, not the document — the shipped bubbling listener never fired there (pre-existing; fixed in
  `EmployeesTable`).
- **The pin-clearing effect is gone**: `pinnedEmployeeIndex` already resolves a departed id to `null`; the stale id is
  harmless until the next `focusin`. (One React-hooks lint warning fewer.)
- **`DepartmentCombobox` is a new shared component on the 3b `.sp-combobox` / `.sp-listbox` classes**
  (`components/ui/`), not an extraction: the inspector's combobox is its EMPLOYEE picker, coupled to its own state; the
  panel needed a department picker with the `.sp-listbox-create` row ("Add “X” as a new department"). The inspector is
  untouched.
- **`CarbonModal`** (`components/ui/`) hosts the asset `.cds-modal` for the two PR 4 modals (dirty-close ask, one-field
  create); the dialog census (`tests/dialog-error-placement.test.mjs`) discovers those dialogs by their literal
  `titleId="…"` since the modal's role and labelledby are props.
- **Three failure sinks, one rule** (`AdminManagementPanel`): the page banner (`showError`), the field helper under an
  inline rename / the create modal (`inlineError`), the panel's danger zone for a refused deactivation
  (`showDangerError`) — `action-input-validation-source` accepts all three.
- **Header-level CSV issues (empty file, missing columns — the parser reports them on row 1) are refused inline under
  the section** and never open the blocked sheet; only row-level issues do (PHASE2UX §1S.3).
- **The restore review holds open on MLS02** with the server text inline and Retry (PHASE2UX §1S.4); the CSV review
  still closes + refreshes (§1S.3). The census ledger moves `json-restore-review-title` to ct-covered.
- **Settings no longer reads the published layer**: the one consumer (the reset summary) retired with ruling 22; the
  page is draft-only, verified by grepping the file.
- **The 403 card's surface is set inline to `layer-02`** (both pages): the sheet paints `.sp-route-card` layer-01
  (PHASE3DS §1.29) and a utility class loses to that later rule; this card carries the tertiary, which must sit on
  white (4.14:1 on layer-01 is the not-gated pair, §1.22 — owner review item 9). The rig's first pass caught it
  (gray card); re-captured on the rebuilt server. On the white page the card's edge disappears (white on white); the
  tertiary's outline is the visible shape — if a card reading is wanted there, that is a ruling, not a build call.
- **`lib/fileGuard.ts` tolerates a File-like without `name` / `size`** (the jsdom double) — it refuses on the fields it
  can see. Real Files always carry both.
- **Recorded, not built:** positions stay free text (no managed list / RPC; owner 2026-09-05); "clear roster" was
  loose wording (owner 2026-09-05); drag-and-drop import is optional and never the only path — not built.

### 1.38 PR 4 — destructive confirmations are the narrow tearsheet (OWNER RULING 2026-09-05)

**Screen** `/admin/management` → Deactivate employee · Delete department · Delete zone. **Problem** the record drew a
confirm MODAL on top of the side panel (DECISIONS D5-b / D5-c; PHASE3DS §1.24; §5 item 17 / P3-17; specimen
`03-panels-and-sheets.html` lines 194 and 204). **Ruling** (owner, 2026-09-05, on the PR 4 plan): one confirmation
pattern with the 3a publish tearsheet — `ManagementConfirmSheet` on `.sp-tearsheet--narrow`: header eyebrow + title,
the impact section with the shipped consequence copy, the publish line; footer right-aligned Cancel (secondary) · the
danger primary (224 min — sheet **amendment B**, PHASE3DS §1.28); no ×; Esc = Cancel, not while busy; mounted until the
action settles; a failure renders inside with Retry. For Deactivate the sheet opens OVER the still-open panel (z 8000
> 7001) — the person's name stays visible; a refusal (a published seat) lands back in the panel's danger zone with the
seat link. The tearsheet opens nothing from inside (P3-17 holds); the dirty-close ask stays the modal (§1.24). Recorded
as dated amendments under D5-b, D5-c, PHASE3DS §1.24 and §5 item 17; the specimen's modal versions are superseded.
**Trade-off** a tearsheet is heavier than a 480 modal for a one-line consequence; accepted for one pattern across the
product. **Would change if** a confirmation gains a second step (then the modal returns for the short one).

### 1.39 PR 4 — the pre-merge smoke: four findings, two observations (2026-09-05)

The owner's twenty-step smoke (`audit/pr4-smoke.mjs`, local Docker stack, real Chrome 1920×1080, both themes, the
1280 / 1024 frames; captures + `results.json` in `screenshots/pr4-smoke/`) found four things the tiers had not, each
fixed on the branch and re-run:

- **Step 9 — the header indicator did not follow a people edit.** After "Alex Shabazian saved." the shell still read
  "Draft — no changes" until a reload: the indicator fetches the draft status once per admin sub-page route (§1.9) and
  nothing told it the draft changed. **Fix** `lib/draftStatusEvent.ts` — `notifyDraftStatusChanged()` dispatches a
  window event; `AppShell` listens and drops its per-route cache (the existing `retryStatus`); Management fires it on
  every success (`showSuccess`), Settings after an applied import or restore. Verified live: "Draft — 1 change" after
  the save, "Draft — 2 changes" after the rename.
- **Step 11 — the deactivate refusal never reached the panel.** `deleteEmployeeAction` threw the RPC's error, and a
  thrown Server Action error is digest-stripped in production, so the danger zone showed the generic fallback
  instead of "This employee is still on the published map at CW01…". **Fix** the F-ERR-1 shape the other actions
  use: `EmployeeDeleteResult` gains `ActionRefusedFailure` (`code: "REFUSED"`, the RPC's message) and the action
  returns it; `action-error-contract-source` pins it, `action-input-validation-source`'s union list widened. The
  refusal now renders inline with the "Open CW01 on the map" ghost; no second sheet.
- **Step 10 — a pointer on the inert overlay pulled focus out of the sheet.** A click on the dimmed panel's Save
  (behind the sheet's overlay) did nothing — correct — but the mousedown moved `document.activeElement` to `body`,
  after which Tab walked the document and Esc did nothing. `useDialogFocus` traps Tab only while focus is inside the
  node. **Fix** the overlay cancels `mousedown` (`onMouseDown={e => e.preventDefault()}`) in `ManagementConfirmSheet`,
  `CsvImportSheet`, `SnapshotRestoreSheet` and `CarbonModal`, so the focused control keeps focus. `PublishReviewSheet` (PR 3b)
  shared the overlay and the gap — **fixed here, same rule** (owner carry 2026-09-05; `publish-review-sheet` ct pins it).
- **Step 20 — the narrow frame kept the 1920 widths.** At 1024 the Settings column stayed 776 and the narrow sheet 720,
  where PHASE2UX §1S.5 says full width and viewport − 32. **Fix** sheet **amendment C** (both copies, byte-identical):
  under the asset's 1055 fold, `.sp-settings { max-width: none }` and `.sp-tearsheet--narrow { width: calc(100vw −
  2 × 16) }`. PHASE3DS §1.27 / §1.28 carry the paragraph. No token change.

**Observations (recorded, not changed):**
- Step 4: body rows measure 32.5 — the asset's 32px cell plus the collapsed 1px border share (block 21 as landed).
  The seat link's hover step is the token contract — rest `link-primary` (#8F4521 light / #E8A07A dark), on the
  ROW's hover `link-primary-hover` (#7A3A1C / #F5DDD1) — the brief's "rgb(143, 69, 33) / rgb(232, 160, 122)" are the
  rest colours.
- Step 12: the Deactivate sheet at 1920×1080 spans top 160 → bottom 490 (720 wide, centred); the bottom edge sits at
  content height, not the viewport bottom — the Phase 3 narrow sheet as landed.
- Step 3: the seed directory is short, so the strip pins (top 48, opaque `--sp-tabs-bg`) only once the pane scrolls —
  the smoke used a 1920×420 viewport to force it.

**Preview-walk finding (2026-09-05, after the smoke) — the Edit tooltip never painted.** The read-only preview walk
(`audit/pr4-preview-walk.mjs`, `screenshots/pr4-preview/`) captured the tooltip on focus and saw nothing: the asset's
cell `overflow: hidden` clipped it, on the preview and in the smoke alike (step 4 read `visibility`, which a clipped
box passes). **Fix** PHASE3DS §1.23 **amendment D** (both copies): `.sp-table td.cds-col-actions { overflow: visible }`
— the actions cell stops clipping; the last row's tooltip, which would leave `.sp-table-scroll`, flips above through
`data-tooltip-placement="above"` (the above placement minted in §1.8). The smoke's step 4, the walk and the e2e-auth
`page-frames` spec now hit-test the tooltip on the first and last row (painted + inside the viewport); ct pins the
placement attribute. Owner ruling: required by §1.23 — a defect, not a look choice. No token change.

### 1.40 PR 5 — as planned (v1 + rulings 2026-09-06)

Plan of record: `plans/phase4-pr5-reception.md` — the v1 plan (2026-09-05) reviewed against the record and
approved by the owner with seven rulings (Q-1…Q-7, 2026-09-06). Built on `feat/phase4-reception`. Scope:
Reception on the `.sp-recep` family (P3-4 Reception half, P3-18, P2-4 last half, P2-5), the route cards
(`/admin` 403, the admin / root / global boundaries, the 404), `/login` + `/my-seat` confirmed unchanged by
capture, and the carry-ins (`shadow-sp` gone, `components/ui/CloseIcon.tsx` retired, `HEX_LEDGER` down to two
permanent rows). The plan's O-items (O-1…O-17) are the deviations from the record and what the code forced;
those the owner ruled are marked there. Entries 1.41–1.44 record the rulings folded in and what the build found.

### 1.41 PR 5 — the seven owner rulings, as built (2026-09-06)

- **Q-1 Esc, two rungs** (O-2): a typed query clears first and the lock stays — the readout keeps reading the person
  because the call may still be live (PHASE2UX §1R.6); an empty field unlocks and removes `?q=`. PHASE3DS §5 item 18
  and §2 P3-18 re-worded; `reception-screen` ct pins both rungs and the no-op on an empty field with nothing locked.
- **Q-2 the root boundary and the 404 join the route-card pass** (O-17): `app/error.tsx` and `app/not-found.tsx` on
  `.sp-route-card` (layer-02 inline, the §1.22 rule), copy as shipped, the glyph on the boundary only, the 404's one
  action the tertiary (its primary verb); both outside the shell, so each keeps its own full-height centring and the
  `seats.megeredchianlaw.com · internal use only` line as `.sp-digest`. The 404 is captured (any unknown URL); the root
  boundary is not drivable — `chunk-recovery-boundary-source` keeps its anchors.
- **Q-3 `/my-seat` unchanged; two permanent ledger rows** (O-16): `HEX_LEDGER` = `app/layout.tsx` 1 (themeColor — a
  Viewport string) + `SeatSheet.tsx` 12 (deviation 12: the share card is the one surface off the token system, no
  Phase 2 / 3 design, byte-identical by capture), each with its reason in the test. `global-error.tsx`'s ten hex left
  with the route card.
- **Q-4 no status mark on Reception rows** (O-4): PHASE3DS §5 item 5's consumer list struck; P3-5's Reception half closes
  as "no mark drawn, §1.29" (§2).
- **Q-5 the map's seven confirm dialogs → PR 5b** (O-8, §1.43).
- **Q-6 the list is 1008 at 1920** (O-1): the `.sp-page` padding sits inside the 1584; PHASE2UX §1R.2 amended;
  `page-frames` asserts 480 / 32 / 1008.
- **Q-7 the partial-state copy** (O-6): "Seat locations didn't load" / "Extensions are up to date. Seat and floor
  details will show after a reload." — warning kind, `role="status"`, above the list. The asset's 640 max-width holds
  (no Reception override in the sheet; a wider notice would be a sheet change the plan does not carry).

### 1.42 PR 5 — what the code forced (engineering, one line each)

- **The live region is the readout BLOCK, not the column** (O-9 as built): the readout column is sticky (the sheet), so
  "Recent lookups" has to ride inside it — a sibling landmark after a sticky section would be covered as the section
  slides. `section.sp-recep-readout[aria-label="Caller detail"]` holds Back to the list · `div[aria-live="polite"]`
  (name, tile, seat line, fallback, Show on map) · `aside[aria-label="Recent lookups"]` — the recents stay outside the
  live region (§1R.7's `complementary`), and the sheet's direct-child ghost rule now reaches only Back to the list, so
  Show on map carries `cds-btn--md self-start`. `reception-screen` pins the aside outside `[aria-live]`.
- **The landing lock is lazy initial state, not an effect** (O-15's sibling): a unique `?q=` match is locked from the
  first render (identical on server and client — no setState-in-effect, no hydration mismatch); one effect rewrites
  `?q=` to the name. The platform hint is set in a frame after mount (the SeatMap precedent, P3-4).
- **The listbox stays mounted through the zero state**: the field's `aria-controls` must resolve (an unresolved
  reference is a critical axe finding); the `.cds-empty` renders after the empty `ul`.
- **The sticky readout zeroes `--sp-shell-header-h` on itself at `lg`** (O-11) — the PR 4 §1.37 tab-strip trick; no
  sheet change.
- **Arrows move the cursor only while typing**: at rest the readout holds the locked person and ↑ ↓ are inert (the
  cursor exists only over results).
- **`Promise.allSettled` on the page** (O-15): the directory failing still throws to the new boundary; the seats
  failing alone yields `seatsUnavailable` — every seat cell empty, no Floor tag, the readout's "Seat unknown right now"
  line, one warning notification.
- **`ErrorGlyph` cuts its cross in `--sp-layer-02`** (O-13): the route card is layer-02 by the §1.22 rule; the specimen's
  symbol strokes layer-01.
- **`mapIcons.tsx` is the shared glyph module** (O-14): the retired `components/ui/CloseIcon.tsx` drew a 20-grid
  1.8-stroke ×; the three Tailwind-sized dialog closes (Delete seat, Swap, the move-conflict ×) pass `h-4 w-4` to keep
  their 16px; the asset icon buttons are sized by the sheet. A rename to `components/ui/icons.tsx` is a PR 6 candidate.
- **The fonts moved to `app/fonts/plex.ts`** (O-7): `global-error.tsx` replaces `<html>` and needs the same families;
  it imports the four sheets + brand + bridge in `layout.tsx`'s order and the theme boot script (no theme attribute set
  → the system state). CSS and `next/font/local` resolve at build time, so the boundary gains no runtime dependency.
- **`global-error.tsx` replays the stored theme in a mount effect** (found by the Task 10 capture): the boundary is
  rendered on the client after the root layout throws, and a script inserted through `dangerouslySetInnerHTML` never
  executes there — both themes captured light on the first run. The effect reads `sp-theme` and calls
  `applyThemeAttributes` (the same derivation as the boot script); nothing stored → the system state. The inline
  script stays for the server-rendered path. Second run: `light/white` and `dark/g100` (`screenshots/pr5/route-cards/`).
- **The `/admin` 403 card drops its raster-mark strip** (O-12): the shell header already carries the product name;
  `megeredchian-mark.png` keeps its `/login` consumer (D4).
- **`page.tsx` reads `?q=` as a string only** and hands it down as `initialQuery`; nothing else is in the URL.
- **Not built, recorded:** the map's confirm dialogs (§1.43); the narrow tearsheet's content height, a distinct
  SQLSTATE for `deactivate_employee`, the Help-panel opener for the Ask Planner popover, the 900px `panel:` screen and
  `SEAT_CENTER_PANEL_BREAKPOINT_PX`, `.sp-callout` — all parked as the plan lists.

### 1.43 PR 5 — a PR 3 obligation found open: the map's confirm dialogs → PR 5b (OWNER RULING Q-5, 2026-09-06)

**Screen** `/admin` → Vacate · Delete seat · Swap · Discard draft · the move-conflict dialog and the two others.
**Problem** PHASE2UX §3 lands "Modal (Move / Swap / Delete confirms) → asset `.cds-modal`" in PR 3; 3b rebuilt the
publish review as the tearsheet and the inspector on the slot but left the seven confirm dialogs on their Tailwind
markup (`SeatMapDialogs.tsx`, `SeatInspector.tsx`) — two of them still carried `shadow-sp`. **Ruling** their own slice
after PR 5 and before PR 6: `feat/phase4-map-dialogs` → **v1.77.0**, on the PR 4 `CarbonModal` host; PR 6 becomes
v2.0.0 after it. In PR 5 they were touched only for `shadow-sp` (deleted, nothing replaces it — layer-01 + 1px border
over the overlay, as the asset `.cds-modal` reads) and the × glyph. Slice-log row 5b added.

### 1.44 PR 5 — `/login` and `/my-seat` confirmed unchanged by capture (D4; deviation 12)

No code change on either. The runtime audit gained a viewer pass (`/reception`, `/my-seat` at 1920 both themes); the
`/login` and `/my-seat` PNGs from the branch are byte-compared against the same rig's run on `main` (v1.75.0), same
seed, same fonts-ready wait — `screenshots/pr5/README.md`. DECISIONS D4 and deviation 12 each carry the dated line.
**Run 2026-09-06 (§1.45):** all five PNGs IDENTICAL (`login-{light,dark}-1920`, `login-light-1024`,
`viewer-my-seat-{light,dark}-1920`); `git diff main` shows `app/login/**`, `components/auth/**`, `app/my-seat/**` and
`SeatSheet.tsx` untouched.

**Smoke pre-fix (owner, 2026-09-06, from the evidence captures `states/reception-zero-*`):** the readout hint
followed the LOCK, so with a person locked and a query matching nobody the tile promised "Esc to unlock" while Esc
would first clear the query (Q-1's first rung). Now the hint states the current key: ↵ "to lock" while a result is
previewed; no hint while a typed query matches nobody; Esc "to unlock" only when locked and not typing (PHASE2UX
§1R.4 item 2; the specimen's readout states). `reception-screen` ct pins the three states.

### 1.45 PR 5 — the Docker-stack evidence (build box, 2026-09-06)

The session's machine had no Docker runtime and no Google Chrome at Task 10; with the owner's go-ahead colima +
docker + docker-compose and Google Chrome were installed (Docker server 29.5.2) and the evidence ran as planned on the
local stack — `screenshots/pr5/README.md` has the tables and provenance. Results: runtime audit **0 undefined
`var()`** on 6 routes × 2 themes + the three document pages at 1280 and in the system state + the viewer pass;
page-states 83 captures; **`/login` + `/my-seat` byte-identical** against the same rig on `main` (five PNGs, `cmp`);
**e2e-auth 53 / 53** on a reset + reseeded stack; contrast 202 / 202; the two tests reported environment-only pass
unsandboxed on real Chrome (backup-script-safety 5 / 5, `axe-helpers` 5 passed). The first full tier run had four
Reception failures, both test-side and fixed in the specs: the skip-link step (autofocus leaves Chrome's
sequential-focus start on the field — the specs focus `<body>` first) and the 1024 grid read (the loading skeleton's
`.sp-recep` still on screen while the streamed page waits in React's hidden pre-swap container — the specs measure
`main .sp-recep` once visible). One product finding for the owner, not changed: in the zero state with a lock the
tile hint reads "Esc to unlock" while Esc first clears the typed query (Q-1's first rung) —
`states/reception-zero-*`. Lesson for §5: check the runtime at Task 0, not Task 10; measure the live grid inside
`main`, never a class that a `loading.tsx` shares.

### 1.46 PR 5 — the pre-merge smoke: eighteen steps, three product fixes, three rig findings (2026-09-06/07)

The owner's eighteen-step smoke (`audit/pr5-smoke.mjs`, local Docker stack on colima, real Chrome 1920×1080, light +
dark + the system state for steps 1 / 4 / 9; captures + `results.json` in `screenshots/pr5-smoke/`) found three
things the tiers had not, each fixed on the branch and re-run:

- **The readout hint followed the lock, not the key** (pre-fix, owner 2026-09-06 — §1.44): with a person locked and a
  query matching nobody the tile read "Esc to unlock" while Esc would clear the query. Now ↵ "to lock" while
  previewing, no hint while a typed query matches nobody, Esc "to unlock" only when locked and not typing;
  `reception-screen` ct pins the three states.
- **Step 11 — `?q=` wrote a `null` history state, and the map's D1-d landing never selected a seated person.**
  `ReceptionScreen` called `history.replaceState(null, …)`, which wipes the App Router's own entry (the SeatMap and
  Management writers pass `window.history.state` through — the codebase's rule; now Reception does too, pinned by
  `reception-source`). Browser back onto `/reception?q=<name>` then restored the Client Router Cache's tree, whose
  server render had seen no `?q=`: the landing now reads the live URL's `?q=` when the prop is empty (identical on
  a hydration render, so no mismatch; `reception-screen` pins the cache-restored landing). And on the map, a seated
  person's name query lists TWO palette rows — the Person and their own Seat (its meta carries the name) — so
  "a unique match opens itself" (DECISIONS D1-d) never fired for anyone with a seat: `lib/viewerSeatSearch`
  `uniqueLandingResult` treats one person plus only their own seat as one match (unit-tested), consumed by BOTH
  landings — `ViewerSeatFinder` (the viewer's `/`, the one "Show on map" reaches) and `SeatMap` (`/admin`). A
  PR 3a landing found by the smoke; e2e-auth re-run green after it.
- **Step 17 — the byte-compare needs a same-day seed, captured alone.** The `main` baseline from 2026-09-06 differed
  from the 2026-09-07 recheck by 55 pixels in a 6×10 box at the login footer: the seed's "Published · Sep 6" digit. A
  baseline captured while another pass reset the database recorded the login page for `/my-seat` (the reset kills the
  session mid-audit). Re-captured alone on the same-day seed, the compare is **5/5 IDENTICAL** standalone (twice);
  inside the full run it flaked on two animated surfaces — the login thumbnail's dot (255 px, Δ ≤ 2) and
  `SeatSheet`'s ~1.9 s CSS draw at the audit's 800 ms wait (6,368 px, Δ ≤ 52). `git diff main` shows the four surfaces
  untouched. `screenshots/pr5-smoke/README.md` carries the numbers.

Rig-side findings, fixed in the rig: a flex item blockifies the sheet's `inline-flex` to `flex` (step 14 read the
display value; it asserts shown + 40px now); console "Failed to load resource" lines carry no URL, so step 18 records
the failed RESPONSES by path (66 Speed Insights 404s under a local `next start`, nothing else); and — the first run's
lesson — `pkill -f "next start"` kills the npm wrapper but not `next-server`, so a stale server kept :3200 and served
an old build against a new `.next` (chunks 404 → no hydration → every client step timed out): the rig's runner now
frees the port by listener PID before starting. Environment: the repo's `node_modules` carries Next 16.3.1 while the
lockfile (and a fresh `npm ci`, CI, Vercel) resolve 16.3.3 — the baseline worktree built on 16.3.3, the branch on
16.3.1; the login captures still compare byte-identical.

### 1.47 PR 5b — the map's seven confirm dialogs on the asset modal (plan approved 2026-09-07; built 2026-09-07)

Plan of record: `plans/phase4-pr5b-map-dialogs.md` (no plan change). Built on `feat/phase4-map-dialogs` → v1.77.0.
Scope: `SeatMapDialogs.tsx` (Vacate · Delete seat · Discard draft · the inspector guard · Swap · Move / Swap them) and
`SeatInspector.tsx`'s move-conflict dialog rebuilt on the PR 4 `CarbonModal` host — the asset `.cds-modal` (480,
`layer-02`, 50/50 footer, z 8500, overlay mousedown cancelled, `useDialogFocus`, Esc never while busy). Copy, verbs,
`titleId`s, the pending / error contracts and every label expression are as shipped (`pending-state-source` verbatim).

**Owner rulings (plan mode, 2026-09-07):**
- **R-1** all seven on the asset modal via `CarbonModal`. §1.38's "destructive confirmation = narrow tearsheet" is a
  **scope clarification**, not a reversal: it governs `/admin/management`; the map's Delete seat / Vacate / Discard stay
  the modal with the danger primary (DECISIONS D2 Phase 4 PR 5b amendment; the note under D5-b).
- **R-2** the inspector's unsaved-edits guard keeps a **plain** primary (Save changes; Discard at secondary weight —
  §1.24's dirty-close rule: discarding unsaved edits is not data destruction). **Discard draft changes** gets the
  **danger** primary (it erases saved draft work and the undo history — §1M.3's danger item); Vacate / Delete seat
  danger; Swap / Move / move-conflict plain.
- **R-3** no × on the modal — Cancel · Esc are the exits, as on every design-system container. The three `aria-label`s
  (`Cancel custom seat deletion`, `Cancel swap confirmation`, `Cancel moving employee`) retired; e2e-auth
  `draft-dialogs` re-pointed to the dialog's Cancel.

- **R-4 (found at review, 2026-09-07 — a plan omission): every one of the seven carries the asset's `.cds-modal-eyebrow`**
  (CarbonModal's existing `eyebrow` prop), as specimen `02-map.html#slot` draws ("Move employee" over the question) and
  `03-panels-and-sheets.html#confirm`'s anatomy states ("Eyebrow label-01 · heading-03 question"); the PR 4 modals
  already do. Strings only — no sheet, token or copy change to headings / bodies / buttons: Vacate → **Vacate seat**;
  Delete seat → **Delete seat**; Swap → **Swap seats**; Move (both arms) and the inspector's move-conflict → **Move
  employee**; Discard draft → **Discard draft changes**; the inspector guard → the inspector's own eyebrow (`Seat CW01 ·
  Center West`, the string `SeatInspector` composes, passed from SeatMap). `dialog-error-placement` pins the eyebrow
  per id in `DIALOG_REGISTRY` (rendered text for the six ct dialogs; a source pin that every map `CarbonModal` carries
  `eyebrow=` and that the guard's is the inspector's string).
- **R-5 (2026-09-07): the move-conflict initial-focus finding is not a 5b change** — parked for PR 6 (below); the
  rig's `06b` stays recorded as a finding, not a FAIL of this slice.

**Sheet amendment F (PHASE3DS §1.24, cross-referenced from §1.17):** `.cds-modal-footer.sp-modal-footer--3` — Carbon's
own three-button modal footer, 25 / 25 / 50 — applies only when a modal carries two secondaries, which today is the
inspector guard alone; not a licence for three-button footers elsewhere. Its second rule, found by the captures:
`.cds-modal-body > p + p, > ul + p { margin-top: spacing-03 }` — the reset zeroes `<p>` margins and the asset spaces
only its `ul`, so Delete seat's scope line and the move-conflict's publish note ran into the description on the first
run. One sheet change (both copies, byte-identical), **no token change** (§4).

**Roles — a finding, not a choice (recorded per the plan):** the six confirms carry `role="alertdialog"` (PHASE3DS §2
"`.cds-modal` + `--danger` primary, `role=alertdialog`"); the inspector guard carries `role="dialog"` — a choice with
three arms, not an alert. `dialog-error-placement` pins each id's role and a resolving `aria-describedby` (all seven
name their description paragraph; Swap gains one — it was unlabelled).

**Found in build: four dialogs closed on Esc while their RPC was in flight.** SeatMap's window Esc listener guarded
only the discard / publish rungs on `pending`; Vacate, Delete seat, Swap and Move — which render with
`pending={pending || mutationInFlight}` — closed mid-flight, hiding the only "still running" indicator (CarbonModal
ignores Esc while busy, but the window listener fires regardless). The four rungs now gate on the predicate the dialog
receives (`!pending && !mutationInFlight`); `seat-map-escape-source` pins them; `screenshots/pr5b/dialogs/01-vacate-busy-esc-*`
shows Esc ignored during a 2.5 s delayed vacate.

**What the code forced (one line each):**
- `CarbonModal` gains `describedBy` (aria-describedby on the section; the body renders the `<p id>`), `footerColumns`
  (2 default, 3 → `sp-modal-footer--3`) and a `ReactNode` title — the move heading keeps its cross-floor `.cds-tag`
  inside the question (D2′); nothing else (no ×, no danger variant — the danger is the primary button's).
- The floor tag is the asset `.cds-tag` (D2′); Swap's Source / Target are the asset's two-item body list.
- The in-modal error is the focusable `.cds-notification--error` with the `NotificationGlyph` (two signals) inside
  `.cds-modal-body`; Discard draft gains the ref + focus the other six already had (it was a bare `<p role="alert">`)
  and its verb line ("Discard did not complete.").
- `Button` and `adminDangerButtonClassName` leave both files (the export stays in `Button.tsx`, unused — nothing
  deleted this slice); `useDialogFocus` leaves the inspector (the host owns it); `CloseIcon` stays for Close inspector.
- Test re-points, never loosened — TEST-TRIAGE "PR 5b outcomes". Two scans now strip comments before matching
  (`dialog-error-placement`'s registry, `tailwind-arbitrary-alpha`'s container scan): the file headers quote the
  attributes in prose.
- The rigs `map-states.mjs` and `pr5b-dialogs.mjs` locate the confirms by `alertdialog`.

**Findings for the owner (recorded, not changed):**
- **The move-conflict dialog opens with focus on its container, not on Cancel** (`pr5b-dialogs` `06b`, both themes).
  It mounts INSIDE the rejected assignment's still-running transition, so its footer is disabled at mount and
  `useDialogFocus` falls back to the section; when the transition settles the buttons enable but focus stays on the
  invisibly-focused section (Tab reaches Cancel). Pre-existing — the pre-5b markup used the same hook the same way —
  not a 5b regression. A candidate fix is a host-level effect in `CarbonModal` (busy → idle with focus on the section →
  focus the first control); outside this slice's plan.
- Draft-only custom seats leave with Discard everything (draft = published again) — correct by definition; a rig that
  inserts a custom seat re-inserts it after a discard (`pr5b-dialogs` `07b`).

**The pre-merge smoke (owner-ordered, 2026-09-07 — `audit/pr5b-smoke.mjs`, `screenshots/pr5b-smoke/`): 22 / 22 records
pass**, light then dark on a reset + reseeded stack, every geometric claim a hit-test: Vacate (contract, the 2px inset
terracotta outline on Cancel, the five hit-tests, the Tab trap, Esc restoring the opener), Vacate mid-flight (Esc + a
pointer ignored; resolves to Open with ◇; Undo via the row), Vacate error (the notification inside with focus, Retry),
Delete seat (the 8px paragraph gap of amendment F; Cancel restores focus; deleted for real), Swap (mode card owns the
slot; list + summary; overlay mousedown inert), Move both arms (cross-floor tag N/A on the seed), move-conflict (initial
focus on the section — R-5 recorded; Tab → Cancel; moved for real; Undo), the guard (120 / 120 / 240, Keep editing
focused, Esc keeps the edit, Discard writes nothing, the shell veto → Save changes saves and continues to Management),
Discard draft (Esc; for real → "Draft — no changes", Publish disabled with its reason beside it), stacking (no tooltip
under the overlay; the overlay above the slot and the row), the brand line (terracotta / red 60 with white labels; no
`0f62fe` outside `carbon-tokens.css`). No product change was needed; three rig-side fixes are in the README. **One
further finding, recorded not changed:** mid-flight focus sits on `<body>` — Chrome drops focus from the clicked primary
when it disables under it; Tab re-anchors through the trap. Pre-existing (the old `Button` disabled while loading too);
the PR 6 host-level refocus below would also cover it (move focus to the section when `busy` flips true). After R-4:
the dialog rig **27 / 29** (the two = the R-5 finding), runtime audit **0 undefined** (6 routes × 2 themes + 1280 + system state + the viewer pass), e2e-auth **53 / 53** on the same
build; unit 1449 · ct 321 · browser 26. **Preview walk (2026-09-07, after CI on #523):** `audit/pr5b-preview-walk.mjs` on the
a30dcf1 deployment — 21 / 21, opened and dismissed only, zero writes proven by the indicator + Undo before / after and the
POST log (`screenshots/pr5b-preview/README.md`).

**Parked for PR 6 (owner ruling R-5, 2026-09-07):**
- `CarbonModal` busy → idle refocus — when the host's `busy` flips false while focus sits on the section, focus the
  first control (a shared-host change, its own ct pin); closes the move-conflict initial-focus finding above. The same
  change should anchor focus on the section when `busy` flips TRUE (the smoke's mid-flight `<body>` finding).
- `Button.tsx` `adminDangerButtonClassName` — unused since 5b (its last consumers were the map's danger confirms) —
  retire in PR 6.

**Evidence (build box, 2026-09-07 — `screenshots/pr5b/README.md`):** `pr5b-dialogs.mjs` **27 / 29** records (the two
FAILs are the one focus finding above), every computed value in the plan's Verification met — bg layer-02, 480, radius 0,
footer 64 at 240 / 240 (the guard 120 / 120 / 240), primary terracotta or red 60 with a white label, overlay 8500, no ×,
first-control focus, overlay pointer inert, Esc ignored while busy, the error notification inside with focus; runtime
audit **0 undefined** on 6 routes × 2 themes + 1280 + system state + the viewer pass; contrast **202 / 202** (no token
change); unit 1449 · ct 321 · `test:browser` 26 · e2e 36 · e2e-auth **53 / 53** (reset + reseeded stack) · clean (lint 0 errors, typecheck, coverage 98.33 / 92.39 / 98.30) · build clean. Real mutations
on the local stack only: one vacate through the delayed route (re-assigned through REST), one move + Discard everything
for real (converged), custom seat R99 inserted through REST and deleted for real through the confirm.

### 1.48 PR 6 — the close-out (plan approved with rulings 2026-09-08; built 2026-09-08)

Plan of record: `plans/phase4-pr6-closeout.md` v1 — approved as written by the reviewer, the owner ruling on its §2
rows the same day. Built on `feat/phase4-closeout` → **v2.0.0**. The docs half (the plan's §1) is this file's status
line, §2 re-read, §3 row 6, §4 line, §5, the slice-log row; PHASE1IA §D's delivered line; PHASE2UX §1S.2 + the closed
slice log; PHASE3DS §5 ticked, §6 "None", the §1.18 / §1.26 / §1.28 notes; DECISIONS reconciled (every D-entry's
"Built" line, §6 no. 18, next free 19, §7 / §8 closed); TEST-TRIAGE's PR 6 outcomes + close-out; `CLAUDE.md`'s
"Design system" paragraph for the finished state; the bridge header; `app/concepts/CLAUDE.md` + a new
`docs/design-system/README.md` marking both superseded, not deleted; three remote branches pruned after merge
(`chore/design-sync-2026-08-28` — PR #479 closed unmerged, `.design-sync/` previews of retired components;
`docs/redesign` — no PR, the off-limits `shell-reference.html`; `fix/pass1-scrim-tokens` — PR #478 closed unmerged, two
class edits onto a retired group-2 name, both surfaces rebuilt in 3b).

**Owner rulings (2026-09-08), one line each, as built:**
- **Row 1 → B.** The narrow tearsheet stays content-height; **DECISIONS §6 no. 18** (anchoring 3–8-line destructive
  confirmations leaves ~650px of empty body above the danger primary at 1080 — reviewer render); PHASE3DS §1.28 note,
  PHASE2UX §1S.2 "anchored top; height from content". No code, no sheet change; next free number 19.
- **Row 2 → build.** Migration `20260908120000_deactivate_employee_sqlstate.sql`: `create or replace` of
  `deactivate_employee(uuid)`, body verbatim (diffed against `20260702100000` — the one change is `using errcode =
  'MLS03'` on the published-map raise; revoke / grant restated). `lib/actionRefusals.ts` (`PUBLISHED_EMPLOYEE_SQLSTATE`,
  `isPublishedEmployeeRefusal`); `deleteEmployeeAction` returns `REFUSED` for that code only and throws anything else.
  **Finding F-2 recorded as the reason:** the action returned EVERY RPC error as a refusal, so a transport failure
  rendered in the panel's danger zone as if the database had refused. PGlite asserts the code; the source pins follow.
- **Row 3 → build (owner override of the hand-off's file-count threshold).** `useAppShellPanels` (`AppShell.tsx`, the
  `useAppShellLeftPanel` precedent) exposes the right panels to a surface; `SeatMap` feeds the drawer's `onOpenHelp`;
  the popover's "How Ask Planner works" link opens Help — focus per the panel's own rule, Esc through the shell's ladder
  back to the utility. `app-shell` ct + `ask-planner-ai-source` pin it. PHASE3DS §1.18's promise closed.
- **Row 4 → retire.** The Tailwind `panel` screen, `SEAT_CENTER_PANEL_BREAKPOINT_PX` / `SEAT_CENTER_SHEET_ANCHOR`, both
  map surfaces' dead `panelTier` state and the below-900 selection pan (written for the bottom sheet the slot replaced
  in 3b) are gone; `centerSeatInMap` centres at 0.5 at every width. §1.29's "the shell still uses it" was stale —
  nothing in the shell keyed on the screen; the viewer's phone-only zoom float keeps its safe-area inset (the
  `accessibility-source` guardrail, its vestigial `panel:bottom-3` half retired). `ViewerFindPalette`'s own 900px
  full-width rule (owner answer 3) is untouched. `seat-map.spec.ts` :372 (820×900) asserts the slot and the band, not
  a pan — nothing re-pointed there.
- **Row 5 → keep, record closed.** PHASE3DS §1.26 carries the built line.
- **Row 6 → rename.** `components/seat-map/mapIcons.tsx` → `components/ui/icons.tsx`, 13 imports and one test comment
  re-pointed; no glyph change.
- **Row 7 → build, with the owner's addition.** `CarbonModal` owns the busy ⇄ idle focus seam: busy **true** with focus
  dropped to `<body>` (Chrome, a primary disabling under the pointer) or on a control that has just disabled → the
  section takes it, the trap keeps its anchor; busy **false** → in a frame, **only if** focus still sits on the
  section, `<body>` or outside the dialog, the first visible enabled control takes it (`focusFirstControl`, exported
  from `useDialogFocus` so open and refocus share one definition) — a consumer's error alert always wins, and **never on
  a detached section** (`node.isConnected`; a dialog unmounting on success flips busy false as it leaves while
  `useDialogFocus` restores the opener). Four ct pins in `dialog-initial-focus`. The rig: `pr5b-dialogs.mjs`
  **29 / 29** — `06b-move-conflict-initial-focus` passes in both themes (the R-5 finding closed); the PR 4 smoke's
  dirty close (8) and create modal (14) pass inside the whole twenty-step smoke — **47 / 47** on the patched rig (below).
- **Row 8 → retire the file.** `components/ui/Button.tsx` had no importer (F-4 — the design-system `Button` carries
  the same loading contract for every remaining consumer); `pending-state-source` and `touch-target-source` re-pointed.
- **Row 9 → (c).** The four dark raster lightbox rules moved from the bridge into `globals.css` beside the light dim —
  the raster app rules owner ruling Q1 names there — three-state shape and values unchanged, no later sheet or utility
  sets `filter` on `.map-raster` (grepped); the runtime audit's dark `/` and `/admin` captures show the inverted raster
  as before. `phase4-bridge.css` is the permanent font bridge only; `theme` + `ask-planner-ai-source` read `globals.css`.
- **F-7 carried:** `.design-sync/` on `main` (previews and shims of components the redesign retired) is out of PR 6's
  scope — a separate chore after v2.0.0.

**What the code forced (one line each):** `CarbonModal`'s section ref is `useDialogFocus`'s callback composed with a
plain ref for the busy effect, and keeps the `dialogFocusRef` name `accessibility-source` pins on every aria-modal
element; `isPublishedEmployeeRefusal` stays a boolean (a type guard narrowed the else-arm to `never`), so the action
checks `error && …`; the PR 4 smoke cannot run step 14 alone (it starts on the Departments tab step 13 opened), so the
row-7 evidence is the whole twenty-step smoke on a reseeded stack; `management-actions-transaction-safety` reads the
newest migration first so `extractFunctionSql` finds the live definition.

**Rig-side finding, fixed in the rig (not a product change):** the first whole-smoke run failed steps 13–15 in both
themes on a `locator.click` timeout with the dirty-close ask open over the panel — step 13 fills the department
combobox the instant the panel appears, and `AdminManagementPanel` lands focus on Name in a frame after opening (the
PR 4 row-open rule); when the fill beats that frame, focus snaps back to Name and the Escape meant for the list opens
the ask (bisected: step 13 passes alone and after step 12, fails after step 8 — a warmed session opens the panel faster;
the probe showed `activeElement` = Name after the fill in the failing run). Step 8's own `openEdit` waits 300 ms for
exactly this; step 13's site now waits the same. A real user cannot type before the frame; the guardrail (row open
focuses Name, `management-detail-source`) is untouched.

**Evidence (build box, 2026-09-08 — `screenshots/pr6/README.md`):** unit **1457** · ct **326** · gate clean (lint 0
errors, typecheck, coverage 98.34 / 92.40 / 98.30) · build clean · e2e **36** · `test:browser` **26** · Docker stack
(reset + reseeded; the new migration confirmed applied — `MLS03` in `pg_proc`): runtime audit **0 undefined `var()`**
on 6 routes × 2 themes + 1280 + the system state + the viewer pass (34 captures); `pr5b-dialogs.mjs` **29 / 29**;
`pr4-smoke.mjs` **47 / 47** (whole, both themes, on the patched rig — the rig-side finding above); e2e-auth **53 / 53**; contrast **202 / 202** (no token change — the generator's JSON
unchanged). Real mutations on the local stack only.

**Post-bump re-run (2026-09-08, reviewer correction):** the Docker evidence was re-run after the Dependabot merge
because the MLS03 refusal rides on the supabase-js error shape — runtime audit **0 undefined** · `pr5b-dialogs`
**29 / 29** · `pr4-smoke` **47 / 47** (step 11 carries the guard's reason verbatim against 2.115.0) · e2e-auth
**53 / 53**; the reviewer's own six-step smoke is `audit/pr6-smoke.mjs` → `screenshots/pr6-smoke/`. It surfaced two
pre-existing defects, both ruled by the owner the same day.

**F-8 — the right slot covered the status band's right end. FIXED IN PR 6 (owner ruling 2026-09-08).**
`.sp-slot-host` is `position: absolute; top/right/bottom: 0` against the map **stage**, which holds the band as well
as the map viewport, so an open slot painted over the band's right 400px. Hit-tested at the band's own Zoom-in button
(1896, 1060 at 1920×1080): `div.sp-slot-body` with the slot open, the button itself with it closed; the same at
820×900. Present since PR 3b and visible in `screenshots/pr3b/admin-slot-inspector-light-1920.png` (closed shows
"60 seats − Fit +", open shows blank panel). **Not a deviation — a conformance defect against a ruling already made:**
PHASE2UX §1M.2 says "the band spans the canvas, not the slot" (band y 849–889, slot x 1520–1920), and
`MapStatusBand`'s own header repeated it. **Why it mattered enough to fix inside the close-out:** at 1920 the result
count clipped mid-word and the zoom − / Fit / + group was unreachable — and D2-b keeps **Reset zoom** only on that
control, so the loss fell exactly while a seat was being edited. **Built as sheet amendment G** (PHASE3DS §1.21,
cross-referenced from §1.17), byte-identical in `app/styles/sp-components.css` and the Phase 3 copy:
`.sp-band[data-slot-open] { padding-right: calc(var(--sp-slot-w) + var(--sp-space-03)) }`, with `MapStatusBand`
taking a `slotOpen` prop that `SeatMap` feeds from the same `slotOwner` state the canvas column's
`pr-[var(--sp-slot-w)]` push already uses. **No token change; contrast stays "no token change".** Evidence:
`pr6-smoke.mjs` step `05b` is now a PASS assertion (hit-test open and closed, 1920 and 820, both themes, captures of
all four states), the e2e-auth `page-frames` map block pins the geometry, and the real-browser tier pins the
`data-slot-open` key (that harness ships no CSS).

**The preview walk could not run on this PR (recorded, not skipped silently).** PR 6 carries a migration, so the
Supabase integration gave its preview a **branch database** (`ynhqcykgkjslzjzkwisy`; the preview's client bundle
inlines that host, not production's `wujsniclwzefvufavama`), and `[db.seed]` is disabled on purpose in
`supabase/config.toml` — so the branch has no accounts and GoTrue answers any sign-in with `400 invalid_credentials`.
PR 4 / 5 / 5b previews really did read and write production **because none of them carried a migration**; every future
migration PR will be unwalkable the same way. Owner ruling 2026-09-08: **verify F-8 on production immediately after
the merge, read-only** (`audit/pr6-preview-walk.mjs` against `seats.megeredchianlaw.com`, both themes at 1920 — the
hand-off's §6 and §7 step 2b). The fix itself is already evidenced on real seeded data by `pr6-smoke` step `05b` and
the e2e-auth `page-frames` map block, which runs in CI.

**Re-verified on the fixed head (2026-09-08, after amendment G):** unit **1457** · ct **326** · gate exit 0 (lint 0
errors, typecheck, coverage 98.34 / 92.40 / 98.30) · build clean · `test:browser` **26** · `test:e2e` **36 / 36** (the
two `waitForColorSettle` self-tests pass on real Chrome) · Docker stack, reset + reseeded between each:
`pr5b-dialogs` **29 / 29**, `pr4-smoke` **47 / 47** whole, runtime audit **0 undefined `var()`**, e2e-auth
**55 / 55** (53 + the two `page-frames` map-band tests), `pr6-smoke` **17 / 17**. Contrast unchanged at 202 / 202 —
amendment G is a padding rule and changes no token.

**F-8, the below-band tier, settled by measurement (reviewer item, 2026-09-08).** `statusBandVisible` is
`surface === "plan" && bandTier` and the floating zoom stack renders only when `!bandTier`, both keyed on the same
`(min-width: 640px)` query — so the band and the floating control are mutually exclusive by construction. The real
question was whether an **open slot** can co-occur with that floating control, and the answer differs by surface
(driven at 500 / 639 / 641 / 820 on the local stack, real Chrome):

- **`/admin` — cannot co-occur.** The slot DOES open below 640 (measured: 400 wide at x 100 on a 500 viewport), so
  the first half of the offered wording would have been wrong; what prevents the clash is that the float is *hidden*
  while a mobile interaction surface owns the screen — `mobileMapControlsHidden` (a selected seat, Ask Planner, the
  publish review or any of the four confirms) puts `hidden sm:block` on the stack, and below 640 that is simply
  hidden. Measured: the control's box collapses to 0×0 the moment the inspector opens.
- **`/` — it CAN co-occur, and the slot covers the float.** The viewer's float carries no `mobileMapControlsHidden`
  equivalent, so at 500 with the published inspector open both are mounted, their boxes overlap, and a hit-test at
  the float's Zoom-in centre (456, 814) returns `div.sp-slot-body` — the control is present and unreachable. Capture:
  `screenshots/pr6-smoke/tier-viewer-500-inspector-open.png`. **Follow-up row (not built here):** mirror the admin and
  hide the viewer's float while its slot is open, or lift it above `.sp-slot-host` — a phone-width product call, off
  the 1920 hardware target, so it goes to the owner rather than into the close-out.

**The same probe found F-8 still live on the viewer, and PR 6 fixes it there too.** Amendment G was wired only into
`SeatMap`; `ViewerSeatFinder` has its own `RightSlot` (the published inspector) and its own two `MapStatusBand` call
sites, so at 1920 with a seat selected the viewer's band still read `padding-right: 8px` and its Zoom-in hit-tested
into `div.sp-slot-body`. Both viewer bands (plan and roster — a selection survives a switch to a roster floor) now
take `slotOpen`; measured after: `data-slot-open` present, padding-right **408px**, the Zoom-in centre 1880 → **1480**
at 1920 and 601 → **201** at 641, hit-testing to itself. The e2e-auth `page-frames` map block gained the viewer arm so
the surface cannot regress unguarded.

**F-9 — the below-900 palette sheet never spans. CARRIED, not fixed (owner ruling 2026-09-08).** `.sp-palette`'s
fixed 560 beats the computed frame's `left: 12` + `right-3` stretch: 560 wide at 880, 182px off-screen at 390. Real,
but phone-width only and off the 1920 hardware target. Recorded in DECISIONS §7 beside the 400 % zoom reflow; the 900
rule itself is intact and row 4 retired only `ViewerSeatFinder`'s constant, as ruled. No code.

## 2. Obligations checklist

Ticked in the PR that discharges it, with the landing file as merged. **P3-n** = PHASE3DS §5 item n; **P2-n** =
PHASE2UX §5 item n.

| # | Obligation | Landing file | PR | Status |
|---|---|---|---|---|
| P3-1 | `sp-tokens.css` replaces the `--sp-*` block; `carbon-tokens.css` beside it minus `@import`; `tailwind.config.ts` re-pointed; retired names swept | `app/globals.css`, `app/layout.tsx`, `tailwind.config.ts` | 1 | done (PR 1) |
| P3-2 | `data-carbon-theme` derived from `data-theme` (light → `white`, dark → `g100`, absent → removed) by one function, used by the boot script and the Theme radio | `app/layout.tsx`, `components/ui/ShellPanels.tsx` | 1, 2 | done (PR 1 boot; PR 2 radio calls `applyTheme` only) |
| P3-3 | `carbon-components.css` then `sp-components.css` land verbatim; every product change is an `sp-*` override | `app/layout.tsx` (imports) | 1 | done (PR 1) |
| P3-4 | Platform-aware shortcut hint (`Ctrl K` / `⌘ K`) decided at hydration | `lib/platformShortcut.ts` (new), `MapSearch.tsx`, `SeatMap.tsx`, `ViewerSeatFinder.tsx`, `ShellPanels.tsx`; `ReceptionScreen.tsx` | 3a, 5 | done (PR 3a: map + Help; PR 5: Reception — the hint after a frame, Ctrl / ⌘ K refocuses the field from anywhere) |
| P3-5 | `SeatMark.tsx` inlines the four symbols' paths with `data-stroke` / `data-fill` / `data-hatch`; never `<use>` | `components/seat-map/SeatMark.tsx` (new) + consumers | 3a (band legend), 3b (marker, inspector), 2 (Account panel), 4 (Management status), ~~5 (Reception rows)~~ | done — `SeatMark.tsx` landed in PR 3a (six inlined kinds, `tests/seat-mark.test.mjs` pins no `<use>`); band legend consumes it; marker + inspector in 3b; Management status in PR 4; the Reception half closes as **no mark drawn, §1.29** (owner ruling Q-4, 2026-09-06) |
| P3-6 | Tier-C zone rules repeat the asset selector's element names; every dark-panel restyle gets a light-theme render before "done" | `components/ui/ShellPanels.tsx` | 2 | done (PR 2: `span.sp-radio-mark` kept; light-theme renders of Help / History / Account / left panel / tooltip in `screenshots/pr2/`) |
| P3-7 | Hover-surface text step on the ROW's hover (Management seat link, Ask Planner label); roster rows static; red on dark = `text-error` | `components/admin-management/*`, `AskPlannerDrawer.tsx` | 3, 4 | done (3b: Ask Planner label row; PR 4: `.sp-seat-link` steps on the ROW's hover — `EmployeesTable`) |
| P3-8 | Danger-ghost override covers Delete seat and Deactivate | `sp-components.css` (lands in PR 1), consumers | 3, 4 | done (3b: Delete seat; PR 4: Deactivate… in the panel's danger zone — `EmployeePanel`) |
| P3-9 | Outlined-open trigger = four shadows (`.sp-mode`, utilities); the outer shadow never dropped | `components/ui/AppTopBar.tsx` | 2 | done (PR 2: the landed `[aria-expanded="true"]` rules, TSX adds no shadow) |
| P3-10 | `--sp-event-pad` stays 10px in the History panel | `components/ui/ShellPanels.tsx` | 2 | done (PR 2: `.sp-event` consumed as landed) |
| P3-11 | Seat code via the tier-C tooltip on hover / focus only; inspector eyebrow on selection; never inline in the pill | `components/seat-map/SeatMarker.tsx` | 3 | done (3b: `.sp-tooltip` sibling of the pill, hover / focus only; eyebrow on selection — §1.27) |
| P3-12 | Pill width from the label; the nudge reasons about height 28; never a width on a pill | `SeatMarker.tsx`, `lib/` nudge helper | 3 | done (3b: no width on the pill; `PILL_HEIGHT_PX = 2 × PILL_NUDGE_PX` pinned to the token; width-aware nudge graph — §1.27) |
| P3-13 | Legend follows the Names toggle (mini pill on, ● off) | `components/seat-map/MapStatusBand.tsx` | 3a | done (PR 3a: `namesVisible` prop; `map-status-band.test.mjs`) |
| P3-14 | "Changed in draft" and the ◇ badge derive from the publish diff | `lib/publishSummary.ts`, `SeatMarker.tsx`, inspector | 3 | done (3b: `lib/draftChanges.ts` feeds the ◇, the inspector note and the legend count from the publish diff — §1.29) |
| P3-15 | Sticky tab strip offsets by `--sp-shell-header-h`, paints `--sp-tabs-bg`; primary follows `?tab=` | `components/admin-management/ManagementFrame.tsx` | 4 | done (PR 4: `.sp-tabs-host`, the `lg` offset zeroed on the strip — §1.37; the primary follows the tab; `?tab=` via `replaceState`) |
| P3-16 | File trigger = labelled button forwarding to a hidden input (`tabindex=-1`, `aria-hidden`); unhappy paths inline before the tearsheet | `components/admin-settings/FileTrigger.tsx`, `DataUtilitiesPanel.tsx`, `lib/fileGuard.ts` | 4 | done (PR 4) |
| P3-17 | Side panel: focus trap, Esc-asks-when-dirty (the modal on top), scrim = Cancel; destructive confirms = the narrow tearsheet over the panel (ruling, §1.38); tearsheets never open a modal from inside | `EmployeePanel.tsx`, `ManagementConfirmSheet.tsx`, `CarbonModal.tsx`, the two Settings sheets | 4 | done (PR 4) |
| P3-18 | Reception keyboard: ↑ ↓ move `[data-highlight]`, ↵ locks (`aria-selected`), **Esc clears a typed query; on an empty field it unlocks** (re-worded 2026-09-06, owner ruling Q-1); readout `aria-live` | `components/reception/ReceptionScreen.tsx` | 5 | done (PR 5: the cursor / lock split, the two Esc rungs, the readout block live — `reception-screen` ct + e2e-auth `reception-keyboard`) |
| P3-19 | Contrast regression rerun after every token change (192/192 or better), summary line in the PR | `docs/redesign-v2/phase3/contrast/` | 1 (+ any later token change) | done (PR 1: 192/192) |
| P3-20 | Specimens and screenshots do not ship; only the four CSS files and the generator move | — | 1 | done (PR 1) |
| P2-1 | Undo / Redo keyboard shortcuts (tooltips promise them) | `SeatMap.tsx`, `lib/platformShortcut.ts` | 3a | done (PR 3a: Ctrl/⌘ Z, Ctrl/⌘ Shift Z, Ctrl Y on Windows; never while typing or inside a dialog; the same gate as the buttons) |
| P2-2 | History "last edit N min ago" from max draft `updated_at` | `ShellPanels.tsx` (History) | 2 | done (PR 2: `lib/shellMode.ts` `relativeMinutes`; live from SeatMap, fetched on sub-pages) |
| P2-3 | Roving tabindex + arrow keys across markers; Esc cancel ladder | `SeatMap.tsx`, `SeatMarker.tsx` | 3 | done (3b: Home / End on both marker layers; the ladder was already in §1M.11 order — §1.30) |
| P2-4 | `?q=` on `/`, `/admin`, `/reception`; `?dept=` / `?zone=` / `?status=` / `?position=`; `?names=` | map surfaces, `LeftPanel.tsx`, `ReceptionScreen.tsx` | 2 (filters), 3a, 5 | done — filter params (PR 2); `?q=` / `?names=on` on `/` and `/admin` (PR 3a, `lib/mapUrlState.ts`); `/reception` `?q=` (PR 5: the landing locks a unique match, `replaceState` writes `?q=<name>` on lock and bare on unlock — one writer, `withQueryParam`) |
| P2-5 | Reception `error.tsx` in its own voice; loading skeleton on the real layout | `app/(shell)/reception/error.tsx` (new), `loading.tsx` | 5 | done (PR 5: the route card in Reception's voice with the admin boundary's recovery; the skeleton on `ReceptionFrame` + `.sp-recep`; the partial state — Q-7 copy) |
| P2-6 | 5 MB client guard on CSV and snapshot files; labelled file triggers | `lib/fileGuard.ts`, `FileTrigger.tsx`, `DataUtilitiesPanel.tsx` | 4 | done (PR 4) |
| P2-7 | Management: real tablist; 403 card gains its action; tiles removed | `ManagementFrame.tsx`, `app/(shell)/admin/management/page.tsx` (+ settings 403), `AdminManagementPanel.tsx` | 4 | done (PR 4; Publish History tab also gone — D5) |
| P2-8 | Settings: Reset-draft entry removed (ruling 22; Q7 keeps the map's Discard) | `DataUtilitiesPanel.tsx` | 4 | done (PR 4; `resetDraftToPublishedAction` has ONE call site, pinned in `bulk-destructive-action-safety-source`) |
| P2-9 | Ask Planner drawer 408 → 400 | `AskPlannerDrawer.tsx` | 3 | done (3b: the drawer is the 400 slot — §1.31) |
| P2-3b / O-8 | Map confirm dialogs → the asset `.cds-modal` (PHASE2UX §3 "Modal (Move / Swap / Delete confirms)", a PR 3 landing found open in PR 5 — §1.43) | `SeatMapDialogs.tsx`, `SeatInspector.tsx` (move-conflict), `CarbonModal.tsx` | 5b | done (PR 5b: all seven on `CarbonModal`; R-1…R-3; amendment F — §1.47) |

Architecture item the hand-off named for the **PR 2 plan** — done (owner confirmation 2026-09-03): `app/page.tsx`
moved into `app/(shell)/` so the one shell mounts on `/` (PHASE1IA B2); `auth-session-source`'s matcher list already
allowlisted `/`; `nav-shell.spec.ts` walks `/` through the History switch.

---

## 3. Test-triage outcomes

`TEST-TRIAGE.md` is the plan; this section records what each PR actually did to the suite (filled per PR).

| PR | Retired | Rewritten | Re-pointed | Notes |
|---|---|---|---|---|
| 0 | — | — | — | `tests/phase4-token-layer-source.test.mjs` added (5 tests, green with the PR 0 ledger) |
| 2 | `app-rail` (its three navigation contracts — veto with modifier bypass, deploy-skew full load, 4s watchdog disarmed on route commit — moved verbatim into `app-top-bar` before deletion) | `app-shell`, `app-top-bar`, `accessibility-source` (shell half: header id, skip-link config, guard wiring, Account panel, viewer header gone), `auth-session-source` (Account panel form; viewer under the shell), `role-fitted-tabs-source` (role-fitted `shellNavConfig`), `shell-viewport-height-source` (flex pane contract), `theme` (radio writes only through `applyTheme`), `touch-target-source` / `type-floor-source` (deleted-file rows), `nav-shell.spec.ts` (header persistence, `/` via the switch) | `full-navigation` (importer = `useShellNavigation.ts`), `published-employee-snapshot` / `viewer-seat-columns` / `desktop-seat-marker-system-source` / `accessibility-source` (page path), `browser/seat-map.spec.ts` (guarded exit = History switch), `viewer-seat-finder` (two header tests retired), `pending-state-source` (loading sentences), `phase4-token-layer-source` (`SWEPT` = {1, 2}), `deep-link` (+ filter params) | added `shell-mode`, `shell-state`, `viewer-filter-groups`, `shell-panels` (ct), `left-panel` (ct), `viewer-shell` (ct, one bundle via `tests/helpers/viewerShellEntry.ts`), `e2e/viewport-matrix.spec.ts` (owner addition); 1414 pass · 0 fail; ct 280; browser 27; build clean |
| 3a | `office-room-wash`, `zone-wash`, `seat-clusters` (D1-h / D1-i, with their modules) | `filter-feedback-source` (the control row's live count), `seat-map-components` (FloorMenuButton replaces FloorSelector; DeptChipRow + nameplate blocks gone), `map-status-band` (`.sp-band`, marks, Names), `viewer-seat-finder` (filters via URL state; D1-d scope; the row's toggle), `viewer-shell` (control row seam; Filters · N), `app-shell` (left-panel + state hooks in place of slots), `accessibility-source` (map half: control row, palette, canvas status, roster Copy link; none loosened), `browser/seat-map.spec.ts` (wash tests gone; palette; More actions), `browser/draft-history.spec.ts` (row names), `e2e-auth` accessibility / draft-dialogs (More actions menu) | `status-label-source` (Status group from `lib/viewerFilterGroups`), `touch-target-source` + `type-floor-source` (deleted-file rows; the row's 40px controls are on the ladder), `pending-state-source` (flows 12 / 13 → the row's busy Undo / Redo), `seat-creation-ui-source`, `floors` (Add seat Hidden on the roster), `focus-handoff-source`, `viewer-keyboard-parity-source` (the shared field), `ask-planner-ai-source`, `virtualized-directory`, `desktop-seat-marker-system-source`, `session-expiry-source` (the notice's sign-in action), `viewer-find-palette-source` | added `platform-shortcut`, `map-search-scope`, `map-url-state`, `seat-mark` (ct), `map-control-row` (ct); `deep-link` + `floor-roster` extended (Copy link); unit 1407 · ct 289 · browser 25 |
| 4 | `settings-tiles-source` (both anchors re-homed: the publish-boundary copy → `settings-affordance-source`, the single-call-site pin → `bulk-destructive-action-safety-source`); ct `data-utilities-panel` reset tests (feature gone, ruling 22); e2e-auth `draft-dialogs` reset review | `management-detail-source`, `management-directory-map-link-source`, `settings-affordance-source` (labelled triggers, callout, one primary per section, exports never disabled), `admin-management-panel` (ct: 16 — tabs, count, two row stops, dirty close, inline rename, create modal, the sheet over the panel), `data-utilities-panel` (ct: 12 — guard inline, triggers, header-only export, done-state ghost, MLS02 keeps the restore review) | `accessibility-source` (dialog files = the panel / sheets / `CarbonModal`; hygiene attrs in `EmployeePanel`; scroll regions = `.cds-side-panel-body` / `.sp-tearsheet-body`; counts in `lib/managementCounts` + `OptionList`; row stops in `EmployeesTable`), `bulk-destructive-action-safety-source` (host + sheets), `action-input-validation-source` (three sinks), `virtualized-directory` (host + table), `pending-state-source` (flows 15–20 → the sheets / list / create modal), `touch-target-source` (Management ledger rows gone), `close-icon-source` (Management's × = the search clear; Settings has none), `dialog-error-placement` (census + 3 ct: restore MLS02, create-modal failure, dirty-close ask; `titleId` discovery), `phase4-token-layer-source` (`SWEPT` {1,2,3,4}), e2e-auth `accessibility` (sheet + ⋯ + names) | added `management-counts`, `inline-rename`, `file-guard`; unit 1428 · ct 307 · lint 0 errors · build clean |
| 5 | `close-icon-source` (with `components/ui/CloseIcon.tsx` — the one glyph is `mapIcons.tsx`'s) | `reception-screen` (ct: 34 — the cursor / lock split, the Esc rungs, `?q=` landings + `replaceState`, the clear ×, Ctrl / ⌘ K, the platform hint, the readout tile / D3′ line / no-extension / Show on map, zero · empty · partial, fallback rows, recents outside the live region, Back to the list, no avatar) | `reception-source` (published-layer + D3′ pins verbatim; + the PR 5 contracts), `chunk-recovery-boundary-source` (+ the Reception boundary), `touch-target-source` (Reception comment block; the `/admin` 403 pin left with the card), `phase4-token-layer-source` (two permanent ledger rows; the `shadow-sp` ban; the font pin on `app/fonts/plex.ts` + both roots), e2e-auth `page-frames` (+ Reception), `header-geometry` (+ `/reception` viewer), `accessibility` (+ Reception rest / locked, the `/admin` 403) | added e2e-auth `reception-keyboard.spec.ts`; the rigs gained the Reception section (viewer), the 404, the `/admin` 403 and a viewer pass for `/my-seat`; unit 1445 (1443 pass + 2 environment-only fails on the sandboxed box — see the slice log) · ct 34 (reception) |
| 5b | — | `dialog-error-placement` (role-agnostic open-dialog query; `aria-describedby` + the ruled role for all seven; Discard's error focusable; comment-stripped registry scan), `seat-map-escape-source` (+ the four pending guards) | `dialog-initial-focus` (alertdialog container), `accessibility-source` (SeatMapDialogs + SeatInspector off the aria-modal host loop; `titleId` pins; Delete's Cancel for the × pin; the inspector's z-index look-pin → `titleId` + `alertdialog` + no `Cancel moving employee`), `touch-target-source` (two × rows), `tailwind-arbitrary-alpha-source` (container scan follows `CarbonModal`, code only), `bulk-destructive-action-safety-source` (`titleId`), e2e-auth `draft-dialogs` (alertdialog; the dialog's Cancel), browser `seat-map` + `accessibility` (alertdialog) | unit 1449 · ct 321 · browser 26 · e2e 36 · e2e-auth **53 / 53** (reset + reseeded stack) |
| 1 | `elevation-shadow-tokens-source`, `color-twin-drift-source`, `e2e/publish-ready-badge-contrast.spec.ts`, `marker-contrast.test.mjs` + `scripts/marker-contrast.mjs` (missed by the PR 0 survey: measured the old `--sp-marker-*` values from the deleted block; the obligation — marker contrast in both themes, non-hue pair distinction — is carried by the generated 192-pair suite and Phase 3's two-signal marks) | `auth-theme-source` (both-themes resolution against `sp-tokens.css` + `carbon-tokens.css`; class bans and ledger kept), `focus-brand-contrast-source` (one `--sp-focus` aliasing `$focus`, defined light + system-dark + forced-dark; tier-C panel focus; raw brand orange banned in code, not comments), `theme.test` (derivation function ↔ boot string; three states; toggle writes only through `applyTheme`) | `accessibility-source` (two kind-tag token pins: `pending-surface` → `draft-surface`, `--admin-diff-vacated-text` → `--sp-status-error-text`), `ask-planner-ai-source` (dim rules read from `globals.css` + the bridge), `phase4-token-layer-source` (`SWEPT` = {1}; ledger 4 rows; font-bridge, asset-identity, import-order and bridge-alias assertions added) | 1390 pass · 0 fail; `npm run gate` clean; `npm run build` clean |
| 6 | — (`components/ui/Button.tsx` left with no test: both of its tests re-pointed) | `dialog-initial-focus` (+4: the busy ⇄ idle seam, the alert wins, the detached section), `app-shell` (+1: `useAppShellPanels` opens Help; the no-shell no-op), `ask-planner-ai-source` (+1: the Help link fed) | `pending-state-source` (the loading contract → the design-system `Button`), `touch-target-source` (the PINS row leaves with the file), `accessibility-source` (the zoom float keeps its safe-area inset; the `*DialogFocusRef` pin holds on the composed ref), `map-viewport` + `management-detail-source` (comments), `theme` + `ask-planner-ai-source` (the raster rules read from `globals.css`), `rpc-execution` (+ `code: "MLS03"`), `action-error-contract-source` (the guarded refusal; a bare `if (error) return REFUSED` banned), `management-actions-transaction-safety` (newest definition first + the errcode pin) | added `action-refusals` (unit); unit 1457 · ct 326 · browser 26 · e2e 36 · e2e-auth 53 |

---

## 4. Contrast

Final summary lines from `node docs/redesign-v2/phase3/contrast/generate-pairs.mjs` + `check_contrast.py`, pasted
verbatim after every token change (P3-19). Baseline at the start of Phase 4 (from PHASE3DS §3, close-out 2026-09-03):

```
product-pairs.json: 192 pairs · surface-pairs-not-gated.json: 13 pairs
192/192 pass
```

PR 1 (2026-09-03, tokens landed verbatim — the generator's JSON is unchanged):

```
product-pairs.json: 192 pairs · surface-pairs-not-gated.json: 13 pairs
192/192 pass
```

PR 3b Task 1 (2026-09-05, O2 hit surface + O3 Draft family in the brand layer — §1.26; the pair names carry the old
hue in parentheses so the diff reads):

```
product-pairs.json: 198 pairs · surface-pairs-not-gated.json: 14 pairs
198/198 pass
```

PR 3b (2026-09-05, local Docker stack, fresh seed): `audit/runtime-audit.mjs` — **0 undefined `var()` on 6 routes × 2
themes** (console errors = the Vercel Speed Insights script 404ing under a local `next start`, as every PR).
`audit/marker-contrast.mjs`, rewritten for the pill (text on fill 4.5 for name pills, the mark / the ◇ badge on the
fill at 3.0 for the graphic states) — **59 measurements, 0 under their floor, 0 outside the ledger; ledger empty**
(the dark `planner-highlight` pass is SKIPPED, not failed: the model answered the zone question broadly and
highlighted no seat — a model outcome the rig reports as such; the light pass measured); the `filtered-out` ledger
row is gone (the quiet pill passes at 7.1 / 8.86). The Draft-mark crops (O3 evidence): light ◇ #8a3ffc vs the focus
ring #b85c2e **ΔE2000 47.1** (1.10:1 between them — two hues, not a contrast pair), badge on the pill fill 5.00:1;
dark #be95ff vs #b85c2e **ΔE2000 45.4** (1.94:1), badge on the fill 4.91:1; the header ◇ #be95ff beside the current
bar #b85c2e — against ΔE 5.3 before the ruling (§1.26). Worst text span 7.1:1 (the light quiet pill), worst graphic
3.95:1 (◇ on the hovered dark pill #474747). Per state, light / dark (text unless marked):

| State | Light | Dark | | State | Light | Dark |
|---|---|---|---|---|---|---|
| rest (assigned) | 18.1 | 10.5 | | admin selected | 18.1 | 10.5 |
| rest (open / reserved / unavailable) mark | 7.81 | 6.76 | | move origin | 16.45 | 13.76 |
| hover | 14.77 | 8.45 | | move target · hover | 16.41 · 14.77 | 13.76 · 8.45 |
| keyboard focus (mark) | 7.81 | 6.76 | | **invalid target** (NE07) | 16.46 | 13.76 |
| selected | 18.1 | 10.5 | | swap origin | 16.45 | 13.76 |
| search hit · search-selected | 15.23 | 10.5 | | swap candidate · hover · target | 16.41 · 14.77 · 16.41 | 13.76 · 8.45 · 13.76 |
| filtered-out (quiet) · footprint | 7.1 | 8.86 | | changed-in-draft text · ◇ | 18.1 · 5.00 | 10.5 · 4.91 |
| names off (footprint on the mat) | 18.1 | 16.45 | | changed-in-draft + focus text · ◇ | 18.1 · 5.00 | 10.5 · 4.91 |
| planner highlight (mark) | 7.81 | SKIPPED | | ◇ on the hovered pill | — | 3.95 |

```
59 measurements, 0 under their floor, 0 outside the ledger. Ledger: empty.
```

PR 3b close (2026-09-05, two component-sheet changes from the rig — the names-off ◇ inverts on the filled footprint
and the names-off quiet fill is the quiet text colour, §1.16 amendment (6); their four pairs added):

```
product-pairs.json: 202 pairs · surface-pairs-not-gated.json: 14 pairs
202/202 pass
```

PR 4 (2026-09-05, **no token change** — sheet amendment B only, §1.38; the danger primary's white-on-red-60 pairs
were already gated by 3b):

```
product-pairs.json: 202 pairs · surface-pairs-not-gated.json: 14 pairs
202/202 pass
```

PR 5 (2026-09-06, **no token change** — sheet amendment E only, §1.29; the route cards and Reception consume pairs the
suite already gates):

```
product-pairs.json: 202 pairs · surface-pairs-not-gated.json: 14 pairs
202/202 pass
```

PR 5b (2026-09-07, **no token change** — sheet amendment F only, §1.47; the modal's pairs — layer-02 text, the
secondary, the terracotta and red-60 primaries with white labels — are gated since 3b / PR 4):

```
product-pairs.json: 202 pairs · surface-pairs-not-gated.json: 14 pairs
202/202 pass
```

PR 6 (2026-09-08, **no token change** — no sheet change either: row 1 ruled B, row 9 moved four raster rules between
app files; the generator's JSON is unchanged):

```
product-pairs.json: 202 pairs · surface-pairs-not-gated.json: 14 pairs
202/202 pass
```

Marker states (`audit/marker-contrast.mjs`, local Docker stack, seed data, 2026-09-03 after the §1.6 fix) —
worst text span per state, light / dark:

| State | Light | Dark | | State | Light | Dark |
|---|---|---|---|---|---|---|
| rest (assigned) | 18.1 | 10.5 | | admin selected | 6.7 | 6.07 |
| rest (open) | 18.1 | 16.45 | | move origin | 12.64 | 11.4 |
| hover | 13.71 | 8.86 | | move-candidate hover | 13.71 | 8.86 |
| keyboard focus | 18.1 | 16.45 | | swap origin | 12.64 | 11.4 |
| selected | 6.7 | 6.07 | | swap-candidate hover | 13.71 | 8.86 |
| search hit | 10.9 | 11.26 | | swap target | 5.53 | 7.46 |
| search-selected | 5.88 | 7.24 | | changed-in-draft | 18.1 | 6.07 |
| filtered-out (ledgered → PR 3) | **2.95** | **3.53** | | | | |

```
30 measurements, 2 under 4.5:1, 0 outside the ledger
```

PR 2 (2026-09-04, no token change — the group-2 bridge aliases removed; the current bar's rest + hovered-current-link
pairs added for §1.15, replacing the pre-brand blue-50 entry):

```
product-pairs.json: 193 pairs · surface-pairs-not-gated.json: 13 pairs
193/193 pass
```

Shell states (`audit/shell-states.mjs`, local Docker stack, seed data): see `screenshots/pr2/README.md` for the
utilities' rest / hover / pressed / open measurements against the terracotta current bar and the panel link on gray 100.

PR 3a (2026-09-04, no token change — the `.sp-kbd` hint moved from `text-helper` to `text-secondary` in the component
sheet, §1.21; its light + dark pairs added):

```
product-pairs.json: 195 pairs · surface-pairs-not-gated.json: 13 pairs
195/195 pass
```

PR 3a pre-merge smoke (2026-09-04, one brand-layer token change — the light tertiary role, §1.22; its three pairs
added, plus the not-gated tertiary-on-layer-01 4.14 record):

```
product-pairs.json: 198 pairs · surface-pairs-not-gated.json: 14 pairs
198/198 pass
```

Marker states (`audit/marker-contrast.mjs`, local Docker stack, seed data): unchanged table — the shipped pill is 3b's;
`28 measurements, 2 under 4.5:1, 0 outside the ledger` (the two are `filtered-out`; `invalid-target` and
`planner-highlight` are not driven until 3b). Runtime audit: 0 undefined `var()` on 6 routes × 2 themes
(`screenshots/pr3a/README.md`).

---

## 5. What Phase 4 learned

Written at the close-out (PR 6, 2026-09-08), ordered tokens → components → surfaces like PHASE3DS §7.

**Tokens.** The phased token test (a per-file hex ledger that only shrinks, retired names swept by group) let every PR
land green while old components still consumed the old names — and its two permanent ledger rows are the honest end
state, not an empty ledger: `/my-seat` has no Phase 2 or 3 design and stays byte-identical by ruling. The brand layer
proved the semantic layer's purpose — one file overriding Carbon's interactive roles restyled every surface without a
component naming a colour — and the two hues it pulled in (the hit tint, the Draft purple) were rulings, taken because
a measurement (ΔE 5.3, 1.10:1) said the record's colour had stopped reading. Contrast is a generated suite, not a
checklist: every hue change was caught by the pair run before a capture, and "no token change" is a line the run
proves.

**Components.** Zone rules must repeat the asset's element names or lose by specificity (the radio rings vanished on the
dark panel in the light theme); the outlined-open trigger is four shadows, and a port that drops the outer one closes
the outline; the sheet is the deliverable — every product change is a dated amendment in **both** copies,
byte-identical, or the token test fails the build (six amendments, A–F, each with its paragraph in PHASE3DS). Hosts own
behaviour so consumers cannot forget it: `CarbonModal`, the tearsheets and the side panel own focus, Esc and the inert
overlay, and a host-level finding (busy → idle focus, the pointer on the overlay pulling focus out) is fixed once for
every consumer family. A hand-built row is cheaper than an overridden asset row only when the asset has no equivalent;
the callout, the narrow tearsheet and the count cards earned theirs.

**Surfaces.** The tiers are not visual verification. Every PR's decisive findings came from the Docker-stack rigs and
the owner's smokes — the indicator not following a people edit, the refusal that never reached the panel, the tooltip
clipped by the asset's cell, the `null` history state, four dialogs closing on Esc mid-flight, the move-conflict
dialog's invisible focus — each a hit-test in real Chrome, both themes, on a reseeded stack. Check the runtime at Task 0,
not Task 10 (PR 5 lost an afternoon); measure inside `main`, never a class a `loading.tsx` shares; capture byte-compare
baselines alone on a same-day seed; free the port by listener PID; run the owner's smoke whole — a step assumes the
tab its predecessor opened. And the record works: every "what did not fit the documents" line became a dated owner
ruling or a close-out row, and nothing was decided in code — which is what made a fresh session able to build the
close-out from the hand-off alone.

---

## Slice log

| PR | GitHub | Branch | Tag | Scope | Status |
|---|---|---|---|---|---|
| 0 | #512 | `docs/phase4-triage` | v1.74.0 | `TEST-TRIAGE.md`; this scaffold; `tests/phase4-token-layer-source.test.mjs` | merged |
| 1 | #513 | `feat/phase4-tokens` | v1.74.1 | tokens + CSS landing (P3-1, 2 boot half, 3, 19, 20); `app/styles/` ×4 + `phase4-bridge.css`; group-1 sweep 297 sites / 29 files; theme three-state; `tailwind.config.ts`; DECISIONS D4 confirmation + D1-h / D1-i; `screenshots/pr1/`; preview-walk fix (§1.6) + `audit/marker-contrast.mjs` | merged |
| 1b | #514 | `feat/brand-terracotta` | v1.74.2 | brand layer: `app/styles/brand/megeredchian-law-tokens.css` (+ `.json`), `public/Logo-Megeredchian-Law.jpg`, `docs/brand/`, CLAUDE.md "Brand System", DECISIONS §6 no. 16, token test brand rules | merged |
| 2 | #515 | `feat/phase4-shell` | v1.74.3 | shell (P3-2 radio, 6, 9, 10; P2-2; route-group move of `/` confirmed 2026-09-03; Position kept as the fourth filter group, owner ruling 2026-09-04; group-2 sweep; provisional tenant row = PR 2/PR 3 seam; two preview rulings — indicator in the free run, no hover fill on the current link) | merged |
| 3a | #516 | `feat/phase4-map-frame` | v1.74.5 | map frame (P3-4, 5 band half, 13; P2-1, 4 `?q=` `?names=`): control row on both surfaces, **provisional tenant row removed** (PR 2 seam closed — SeatMap's bar tenants + the viewer search move into the map control row, PHASE2UX §1M.3), one search + palette on `/admin` too, Filters split control, Find me, band + `SeatMark` + legend follows Names, canvas status region, roster Copy link; washes + clusters (D1-h/D1-i), `FilterPanel` / `ActiveFilterChips` / `DeptChipRow` / `AiHighlightChip` / `FloorSelector` / `ResultsPanel` / `adminChrome.ts` retired; owner rulings O1 O5 O6 O7 (2026-09-04); pre-merge smoke 24/24 (`screenshots/pr3a-smoke/`) + §1.22–§1.25 | merged |
| 3b | #518 | `feat/phase4-map-markers` | v1.74.6 | map markers + slot (P3-5 marker half, 7, 8, 11, 12, 14; P2-3, 9): `.sp-pill` rewrite, seat-code tooltip, ◇ from the publish diff, quiet pill replaces the dim (ledger row closed), invalid target wired (O4), 400 slot (inspector · mode card · Ask Planner), publish tearsheet, group-3 sweep, marker rig + Draft-mark crops; owner rulings O2 O3 (brand-layer tokens); carry-ins C-1 (row rules out of `globals.css`, Q1/Q2), C-2 (palette rows, add-seat card), C-3 (§1.25 Redo fix, Q3 every column); Q4 seed reserved + unavailable; Q5 one PR. **Pre-merge smoke 13/13 steps pass** (18/18 records, `screenshots/pr3b-smoke/`); fix §1.36 — people edits now badge the seat; ◇ `rgb(138, 63, 252)` light / `rgb(190, 149, 255)` dark; live hit-pill contrast **15.23:1** light / **10.50:1** dark; Redo reapplies; invalid targets refused with the notice; 1024 pass; tooltip = seat code only (ruling, §1.36) | merged 2026-09-05 (squash) |
| 4 | #519 | `feat/phase4-pages` | v1.75.0 | Management + Settings (P3-7 Management half, 8 Deactivate, 15, 16, 17; P2-6, 7, 8): `ManagementFrame` (line tabs in the sections landmark, the primary follows the tab), `EmployeesTable` (`.cds-table`, toolbar count, ● / ○, seat-code link, one ghost Edit), `EmployeePanel` (480 layer-02 slide-over, 50/50 footer, no ×, one dirty check → `CarbonModal` ask), `OptionList` (Save · Cancel inline rename, blur validates, ⋯ Delete), `OptionCreateModal`, `ManagementConfirmSheet` (**owner ruling §1.38**, sheet amendment B), Publish History tab gone; Settings: `.sp-callout`, sections in the record's order, `FileTrigger` + `lib/fileGuard` (5 MB / type, inline before a sheet), `CsvImportSheet` / `SnapshotRestoreSheet` (D6-e done-state ghost; MLS02 keeps the restore review), Reset draft gone (one call site pinned), draft-only page; group-4 sweep (`SWEPT` {1,2,3,4}, bridge §2 empty); `lib/managementCounts` / `inlineRename` / `fileGuard` | built 2026-09-05: unit 1428 · ct 307 · gate clean · e2e 36 · **e2e-auth 39/39** (local stack) · runtime audit 0 undefined (6 routes × 2 themes + 1280 + system state) · page-states rig 63 captures (`screenshots/pr4/`) · contrast 202/202 (no token change) · build clean. **Owner's twenty-step smoke 2026-09-05: 47/47 after four fixes (§1.39 — the indicator seam, the returned deactivate refusal, the inert overlay keeping focus, sheet amendment C for the narrow frame); captures + `results.json` in `screenshots/pr4-smoke/`**; read-only preview walk 22/22 on the Vercel preview (`screenshots/pr4-preview/`, people data masked) → §1.23 **amendment D** (the Edit tooltip escaped the asset's clipped cell; smoke step 4 re-run 4/4, e2e-auth 42/42) | merged (v1.75.0) 2026-09-05 (squash, 18f855d) |
| 5 | #522 | `feat/phase4-reception` | v1.76.0 | Reception on `.sp-recep` (P3-4 Reception half, 5 Reception half closed "no mark drawn", 18; P2-4 last half, 5): `ReceptionFrame`, `ReceptionScreen` (search lg + clear × + Ctrl / ⌘ K, the cursor / lock split, the Q-1 Esc rungs, `?q=` via `replaceState`, readout tile + D3′ line + "No extension on file" + Show on map, fallback rows, recents outside the live region, zero · empty · partial · loading · error), sheet **amendment E** (the 1024 fold); route cards on `.sp-route-card` (admin boundary, `/admin` 403 without its raster strip, root boundary + 404 by Q-2, `global-error` in the design system — fonts moved to `app/fonts/plex.ts`); carry-ins: `shadow-sp` 4 → 0 (+ the token ban, `boxShadow` gone from Tailwind), `components/ui/CloseIcon.tsx` retired for `mapIcons`, `HEX_LEDGER` two permanent rows (Q-3); `/login` + `/my-seat` confirmed unchanged by capture; O-8 → PR 5b (Q-5). Plan of record `plans/phase4-pr5-reception.md`; §1.40–§1.44 | built 2026-09-06 on `feat/phase4-reception`: unit 1445 (1443 pass; 2 environment-only fails — sandbox / box, `screenshots/pr5/README.md`) · ct 318 · gate clean (lint 0 errors, typecheck, coverage 98.33 / 92.35 / 98.29) · build clean · e2e 34 pass (+ 2 environment-only helper self-test fails) · contrast **202/202 (no token change)** · 404 + global-error captured both themes (the global-error theme fix, §1.42). **Docker-stack evidence (§1.45, colima + Chrome installed with the owner's go-ahead): runtime audit 0 undefined on 6 routes × 2 themes + 1280 + system state + the viewer pass · page-states 83 captures · `/login` + `/my-seat` byte-identical vs `main` (5/5) · e2e-auth 53/53 · the two environment-only tests pass unsandboxed on real Chrome**; **Owner's eighteen-step smoke 2026-09-06/07 (`audit/pr5-smoke.mjs`, `screenshots/pr5-smoke/`): 37/38 records in the final run — the one FAIL is the in-run step-17 compare flaking on two animated surfaces, 5/5 IDENTICAL standalone; three product fixes (§1.44 hint states the current key; §1.46 `replaceState` passes `history.state` + the cache-restored landing; the map's D1-d unique landing counts a person plus their own seat as one match) and e2e-auth 53/53 after them**. **Read-only preview walk 2026-09-07 (`audit/pr5-preview-walk.mjs`, `screenshots/pr5-preview/`): 29/29 on the `68e8b03` deployment as the fixture account (admin role in production — `/admin` shows the map, the 403 is proven on the local stack), people data masked; indicator identical before and after, 4 argument-less status POSTs, no other failed responses.** PR #522 CI green (verify · e2e · e2e-auth · CodeQL) | **merged (v1.76.0) 2026-09-07 (squash, 79b29d9)** — the row's build / smoke / walk facts stand |
| 5b | — | `feat/phase4-map-dialogs` | v1.77.0 | the map's seven confirm dialogs (Vacate · Delete seat · Swap · Discard draft · the inspector guard · Move / Swap them · the inspector's move-conflict) onto the asset `.cds-modal` on the PR 4 `CarbonModal` host (PHASE2UX §3, a PR 3 landing found open — §1.43, owner ruling Q-5): `CarbonModal` `describedBy` / `footerColumns` / node title; sheet **amendment F** (the guard's 25/25/50; body paragraph spacing); `alertdialog` on the six confirms, `dialog` on the guard; danger primary on Vacate / Delete / Discard (R-2); no × (R-3); found in build — Esc closed four dialogs mid-flight (fixed, pinned). Plan of record `plans/phase4-pr5b-map-dialogs.md`; §1.47 | built 2026-09-07: unit 1449 · ct 321 · gate clean (lint 0 errors, typecheck, coverage 98.33 / 92.39 / 98.30) · build clean · browser 26 · e2e 36 · **Docker-stack evidence: `pr5b-dialogs.mjs` 27/29 (the 2 = one pre-existing focus finding, §1.47) · runtime audit 0 undefined · e2e-auth **53 / 53** (reset + reseeded stack) · contrast 202/202 (no token change)** (`screenshots/pr5b/`). **R-4 (eyebrows on all seven) + R-5 folded in 2026-09-07; owner's smoke `audit/pr5b-smoke.mjs` 22/22 light + dark (`screenshots/pr5b-smoke/`), no product change**. **PR #523 CI green (verify · e2e · e2e-auth · CodeQL). Read-only preview walk 2026-09-07 (`audit/pr5b-preview-walk.mjs`, `screenshots/pr5b-preview/`): 21/21 on the a30dcf1 deployment, the owner signed in by hand in headed Chrome, every dialog opened and dismissed only, people data masked; indicator "Draft — no changes" + Undo disabled before and after; 3 action POSTs (1 status read + the move-conflict's 2 refused Assign submits); Delete seat and Discard draft N/A on production (no custom seat, no draft change)** | **merged (v1.77.0) 2026-09-07 (squash, 0e1ba92)** — the row's build / smoke / walk facts stand |
| 6 | — | `feat/phase4-closeout` | v2.0.0 | close-out (plan of record `plans/phase4-pr6-closeout.md`; §1.48): the eight parked items + finding F-1 as ruled — the deactivate SQLSTATE migration (row 2), the Help-panel opener (3), the 900px tier retired (4), the glyph module → `components/ui/icons.tsx` (6), `CarbonModal`'s busy ⇄ idle focus seam (7), `Button.tsx` retired (8), the raster rules into `globals.css` + the bridge as the font bridge (9); rows 1 (→ DECISIONS §6 no. 18) and 5 recorded; docs: this file complete + §5, PHASE1IA §D delivered, PHASE2UX / PHASE3DS closed, DECISIONS reconciled, TEST-TRIAGE closed, `CLAUDE.md` "Design system" rewritten, `app/concepts/` + `docs/design-system/` marked superseded (not deleted); three remote branches pruned after merge | built 2026-09-08: unit 1457 · ct 326 · gate clean · build clean · e2e 36 · browser 26 · **Docker-stack evidence: runtime audit 0 undefined (6 routes × 2 themes + 1280 + system + viewer) · `pr5b-dialogs` 29/29 (R-5 closed) · `pr4-smoke` 47/47 · e2e-auth 53/53 · contrast 202/202 (no token change)** (`screenshots/pr6/`); reviewer pass 2026-09-08 re-ran all four rigs post-bump and added `audit/pr6-smoke.mjs` **17/17** (`screenshots/pr6-smoke/`), which found F-8 (fixed here as sheet amendment G — the band takes the open slot's push) and F-9 (carried, DECISIONS §7); fixed head: e2e-auth **55/55**, e2e **36/36**, the rest unchanged — awaiting PR, CI, the read-only preview walk, merge → tag v2.0.0, prune |

PR 3b pre-merge smoke (2026-09-05, owner-ordered, thirteen steps, local Docker stack, real Chrome 1920×1080, both themes):
**18/18 PASS** after one fix (§1.36); captures + `results.json` in `screenshots/pr3b-smoke/`; e2e-auth 32/32 on the
same build; marker rig 58 measurements, 0 under floor, ledger empty (both planner-highlight passes SKIPPED on a
broad answer this run — a model outcome, not a marker).

Phase 4 ends with PR 6 (v2.0.0). Carried past it, not Phase 4 obligations: the 400 % zoom reflow (DECISIONS §7), `.design-sync/` on `main` (§1.48 F-7).
