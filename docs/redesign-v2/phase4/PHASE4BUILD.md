# Seat Planner redesign — Phase 4: code

**Status: in progress — PR 0 #512 merged (v1.74.0). PR 1 #513 merged (v1.74.1). 1b #514 merged (v1.74.2). PR 2 #515 merged (v1.74.3). PR 3a #516 merged (v1.74.5 — v1.74.4 went to chore #517). PR 3b #518 merged (v1.74.6, 2026-09-05). PR 4 (Management + Settings) planned, waiting for go; PR 5–6 not started.** Inputs, in reading order:
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

## 2. Obligations checklist

Ticked in the PR that discharges it, with the landing file as merged. **P3-n** = PHASE3DS §5 item n; **P2-n** =
PHASE2UX §5 item n.

| # | Obligation | Landing file | PR | Status |
|---|---|---|---|---|
| P3-1 | `sp-tokens.css` replaces the `--sp-*` block; `carbon-tokens.css` beside it minus `@import`; `tailwind.config.ts` re-pointed; retired names swept | `app/globals.css`, `app/layout.tsx`, `tailwind.config.ts` | 1 | done (PR 1) |
| P3-2 | `data-carbon-theme` derived from `data-theme` (light → `white`, dark → `g100`, absent → removed) by one function, used by the boot script and the Theme radio | `app/layout.tsx`, `components/ui/ShellPanels.tsx` | 1, 2 | done (PR 1 boot; PR 2 radio calls `applyTheme` only) |
| P3-3 | `carbon-components.css` then `sp-components.css` land verbatim; every product change is an `sp-*` override | `app/layout.tsx` (imports) | 1 | done (PR 1) |
| P3-4 | Platform-aware shortcut hint (`Ctrl K` / `⌘ K`) decided at hydration | `lib/platformShortcut.ts` (new), `MapSearch.tsx`, `SeatMap.tsx`, `ViewerSeatFinder.tsx`, `ShellPanels.tsx`; `ReceptionScreen.tsx` | 3a, 5 | done for the map + Help (PR 3a); Reception in PR 5 |
| P3-5 | `SeatMark.tsx` inlines the four symbols' paths with `data-stroke` / `data-fill` / `data-hatch`; never `<use>` | `components/seat-map/SeatMark.tsx` (new) + consumers | 3a (band legend), 3b (marker, inspector), 2 (Account panel), 4 (Management status), 5 (Reception rows) | `SeatMark.tsx` landed in PR 3a (six inlined kinds, `tests/seat-mark.test.mjs` pins no `<use>`); band legend consumes it; marker + inspector in 3b |
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
| P3-18 | Reception keyboard: ↑ ↓ move `[data-highlight]`, ↵ locks (`aria-selected`), Esc unlocks then clears; readout `aria-live` | `components/reception/ReceptionScreen.tsx` | 5 | open |
| P3-19 | Contrast regression rerun after every token change (192/192 or better), summary line in the PR | `docs/redesign-v2/phase3/contrast/` | 1 (+ any later token change) | done (PR 1: 192/192) |
| P3-20 | Specimens and screenshots do not ship; only the four CSS files and the generator move | — | 1 | done (PR 1) |
| P2-1 | Undo / Redo keyboard shortcuts (tooltips promise them) | `SeatMap.tsx`, `lib/platformShortcut.ts` | 3a | done (PR 3a: Ctrl/⌘ Z, Ctrl/⌘ Shift Z, Ctrl Y on Windows; never while typing or inside a dialog; the same gate as the buttons) |
| P2-2 | History "last edit N min ago" from max draft `updated_at` | `ShellPanels.tsx` (History) | 2 | done (PR 2: `lib/shellMode.ts` `relativeMinutes`; live from SeatMap, fetched on sub-pages) |
| P2-3 | Roving tabindex + arrow keys across markers; Esc cancel ladder | `SeatMap.tsx`, `SeatMarker.tsx` | 3 | done (3b: Home / End on both marker layers; the ladder was already in §1M.11 order — §1.30) |
| P2-4 | `?q=` on `/`, `/admin`, `/reception`; `?dept=` / `?zone=` / `?status=` / `?position=`; `?names=` | map surfaces, `LeftPanel.tsx`, `ReceptionScreen.tsx` | 2 (filters), 3a, 5 | filter params done (PR 2); `?q=` / `?names=on` done on `/` and `/admin` (PR 3a, `lib/mapUrlState.ts`); `/reception` `?q=` in PR 5 |
| P2-5 | Reception `error.tsx` in its own voice; loading skeleton on the real layout | `app/(shell)/reception/error.tsx` (new), `loading.tsx` | 5 | open |
| P2-6 | 5 MB client guard on CSV and snapshot files; labelled file triggers | `lib/fileGuard.ts`, `FileTrigger.tsx`, `DataUtilitiesPanel.tsx` | 4 | done (PR 4) |
| P2-7 | Management: real tablist; 403 card gains its action; tiles removed | `ManagementFrame.tsx`, `app/(shell)/admin/management/page.tsx` (+ settings 403), `AdminManagementPanel.tsx` | 4 | done (PR 4; Publish History tab also gone — D5) |
| P2-8 | Settings: Reset-draft entry removed (ruling 22; Q7 keeps the map's Discard) | `DataUtilitiesPanel.tsx` | 4 | done (PR 4; `resetDraftToPublishedAction` has ONE call site, pinned in `bulk-destructive-action-safety-source`) |
| P2-9 | Ask Planner drawer 408 → 400 | `AskPlannerDrawer.tsx` | 3 | done (3b: the drawer is the 400 slot — §1.31) |

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
| 1 | `elevation-shadow-tokens-source`, `color-twin-drift-source`, `e2e/publish-ready-badge-contrast.spec.ts`, `marker-contrast.test.mjs` + `scripts/marker-contrast.mjs` (missed by the PR 0 survey: measured the old `--sp-marker-*` values from the deleted block; the obligation — marker contrast in both themes, non-hue pair distinction — is carried by the generated 192-pair suite and Phase 3's two-signal marks) | `auth-theme-source` (both-themes resolution against `sp-tokens.css` + `carbon-tokens.css`; class bans and ledger kept), `focus-brand-contrast-source` (one `--sp-focus` aliasing `$focus`, defined light + system-dark + forced-dark; tier-C panel focus; raw brand orange banned in code, not comments), `theme.test` (derivation function ↔ boot string; three states; toggle writes only through `applyTheme`) | `accessibility-source` (two kind-tag token pins: `pending-surface` → `draft-surface`, `--admin-diff-vacated-text` → `--sp-status-error-text`), `ask-planner-ai-source` (dim rules read from `globals.css` + the bridge), `phase4-token-layer-source` (`SWEPT` = {1}; ledger 4 rows; font-bridge, asset-identity, import-order and bridge-alias assertions added) | 1390 pass · 0 fail; `npm run gate` clean; `npm run build` clean |

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

Filled at close-out (PR 6), ordered tokens → components → surfaces like PHASE3DS §7.

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
| 4 | — | `feat/phase4-pages` | v1.75.0 | Management + Settings (P3-7 Management half, 8 Deactivate, 15, 16, 17; P2-6, 7, 8): `ManagementFrame` (line tabs in the sections landmark, the primary follows the tab), `EmployeesTable` (`.cds-table`, toolbar count, ● / ○, seat-code link, one ghost Edit), `EmployeePanel` (480 layer-02 slide-over, 50/50 footer, no ×, one dirty check → `CarbonModal` ask), `OptionList` (Save · Cancel inline rename, blur validates, ⋯ Delete), `OptionCreateModal`, `ManagementConfirmSheet` (**owner ruling §1.38**, sheet amendment B), Publish History tab gone; Settings: `.sp-callout`, sections in the record's order, `FileTrigger` + `lib/fileGuard` (5 MB / type, inline before a sheet), `CsvImportSheet` / `SnapshotRestoreSheet` (D6-e done-state ghost; MLS02 keeps the restore review), Reset draft gone (one call site pinned), draft-only page; group-4 sweep (`SWEPT` {1,2,3,4}, bridge §2 empty); `lib/managementCounts` / `inlineRename` / `fileGuard` | built 2026-09-05: unit 1428 · ct 307 · gate clean · e2e 36 · **e2e-auth 39/39** (local stack) · runtime audit 0 undefined (6 routes × 2 themes + 1280 + system state) · page-states rig 63 captures (`screenshots/pr4/`) · contrast 202/202 (no token change) · build clean; preview walk + the owner's smoke hand-off pending |
| 5 | — | — | — | Reception, route surfaces, `/login` + `/my-seat` confirmed unchanged (P3-18; P2-5) | not started |
| 6 | — | — | v2.0.0 | close-out: this file complete; PHASE1IA §D delivered; DECISIONS reconciled; `CLAUDE.md` "Design system" rewritten; `app/concepts/` + `docs/design-system/` marked superseded (not deleted) | not started |

PR 3b pre-merge smoke (2026-09-05, owner-ordered, thirteen steps, local Docker stack, real Chrome 1920×1080, both themes):
**18/18 PASS** after one fix (§1.36); captures + `results.json` in `screenshots/pr3b-smoke/`; e2e-auth 32/32 on the
same build; marker rig 58 measurements, 0 under floor, ledger empty (both planner-highlight passes SKIPPED on a
broad answer this run — a model outcome, not a marker).

Next: PR 4 built on `feat/phase4-pages` (Tasks 1–10); Task 11 evidence (Docker stack: runtime audit, page-states rig,
e2e-auth) then the PR + preview; the owner's smoke hand-off runs before merge; on "merge" → v1.75.0.
