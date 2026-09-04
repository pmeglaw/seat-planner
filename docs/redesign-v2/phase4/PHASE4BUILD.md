# Seat Planner redesign — Phase 4: code

**Status: in progress — PR 0 #512 merged (v1.74.0). PR 1 #513 merged (v1.74.1). 1b #514 merged (v1.74.2). PR 2 #515 shell open (`feat/phase4-shell`). PR 3–6 not started.** Inputs, in reading order:
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

## 2. Obligations checklist

Ticked in the PR that discharges it, with the landing file as merged. **P3-n** = PHASE3DS §5 item n; **P2-n** =
PHASE2UX §5 item n.

| # | Obligation | Landing file | PR | Status |
|---|---|---|---|---|
| P3-1 | `sp-tokens.css` replaces the `--sp-*` block; `carbon-tokens.css` beside it minus `@import`; `tailwind.config.ts` re-pointed; retired names swept | `app/globals.css`, `app/layout.tsx`, `tailwind.config.ts` | 1 | done (PR 1) |
| P3-2 | `data-carbon-theme` derived from `data-theme` (light → `white`, dark → `g100`, absent → removed) by one function, used by the boot script and the Theme radio | `app/layout.tsx`, `components/ui/ShellPanels.tsx` | 1, 2 | done (PR 1 boot; PR 2 radio calls `applyTheme` only) |
| P3-3 | `carbon-components.css` then `sp-components.css` land verbatim; every product change is an `sp-*` override | `app/layout.tsx` (imports) | 1 | done (PR 1) |
| P3-4 | Platform-aware shortcut hint (`Ctrl K` / `⌘ K`) decided at hydration | `SeatMap.tsx`, `ReceptionScreen.tsx` | 3, 5 | open |
| P3-5 | `SeatMark.tsx` inlines the four symbols' paths with `data-stroke` / `data-fill` / `data-hatch`; never `<use>` | `components/seat-map/SeatMark.tsx` (new) + consumers | 3 (band, marker, inspector), 2 (Account panel), 4 (Management status), 5 (Reception rows) | open — PR 2: the Account panel's My-seat row is text, no consumer there (the mode-indicator marks are inlined in `AppTopBar.tsx`) |
| P3-6 | Tier-C zone rules repeat the asset selector's element names; every dark-panel restyle gets a light-theme render before "done" | `components/ui/ShellPanels.tsx` | 2 | done (PR 2: `span.sp-radio-mark` kept; light-theme renders of Help / History / Account / left panel / tooltip in `screenshots/pr2/`) |
| P3-7 | Hover-surface text step on the ROW's hover (Management seat link, Ask Planner label); roster rows static; red on dark = `text-error` | `components/admin-management/*`, `AskPlannerDrawer.tsx` | 3, 4 | open |
| P3-8 | Danger-ghost override covers Delete seat and Deactivate | `sp-components.css` (lands in PR 1), consumers | 3, 4 | open |
| P3-9 | Outlined-open trigger = four shadows (`.sp-mode`, utilities); the outer shadow never dropped | `components/ui/AppTopBar.tsx` | 2 | done (PR 2: the landed `[aria-expanded="true"]` rules, TSX adds no shadow) |
| P3-10 | `--sp-event-pad` stays 10px in the History panel | `components/ui/ShellPanels.tsx` | 2 | done (PR 2: `.sp-event` consumed as landed) |
| P3-11 | Seat code via the tier-C tooltip on hover / focus only; inspector eyebrow on selection; never inline in the pill | `components/seat-map/SeatMarker.tsx` | 3 | open |
| P3-12 | Pill width from the label; the nudge reasons about height 28; never a width on a pill | `SeatMarker.tsx`, `lib/` nudge helper | 3 | open |
| P3-13 | Legend follows the Names toggle (mini pill on, ● off) | `components/seat-map/MapStatusBand.tsx` | 3 | open |
| P3-14 | "Changed in draft" and the ◇ badge derive from the publish diff | `lib/publishSummary.ts`, `SeatMarker.tsx`, inspector | 3 | open |
| P3-15 | Sticky tab strip offsets by `--sp-shell-header-h`, paints `--sp-tabs-bg`; primary follows `?tab=` | `app/(shell)/admin/management/page.tsx` | 4 | open |
| P3-16 | File trigger = labelled button forwarding to a hidden input (`tabindex=-1`, `aria-hidden`); unhappy paths inline before the tearsheet | `app/(shell)/admin/settings/page.tsx`, `DataUtilitiesPanel.tsx` | 4 | open |
| P3-17 | Side panel: focus trap, Esc-asks-when-dirty, scrim = Cancel, confirm modal on top; tearsheets never open a modal from inside | `components/admin-management/*`, `components/admin-settings/*` | 4 | open |
| P3-18 | Reception keyboard: ↑ ↓ move `[data-highlight]`, ↵ locks (`aria-selected`), Esc unlocks then clears; readout `aria-live` | `components/reception/ReceptionScreen.tsx` | 5 | open |
| P3-19 | Contrast regression rerun after every token change (192/192 or better), summary line in the PR | `docs/redesign-v2/phase3/contrast/` | 1 (+ any later token change) | done (PR 1: 192/192) |
| P3-20 | Specimens and screenshots do not ship; only the four CSS files and the generator move | — | 1 | done (PR 1) |
| P2-1 | Undo / Redo keyboard shortcuts (tooltips promise them) | `SeatMap.tsx` | 3 | open |
| P2-2 | History "last edit N min ago" from max draft `updated_at` | `ShellPanels.tsx` (History) | 2 | done (PR 2: `lib/shellMode.ts` `relativeMinutes`; live from SeatMap, fetched on sub-pages) |
| P2-3 | Roving tabindex + arrow keys across markers; Esc cancel ladder | `SeatMap.tsx`, `SeatMarker.tsx` | 3 | open |
| P2-4 | `?q=` on `/`, `/admin`, `/reception`; `?dept=` / `?zone=` / `?status=` / `?position=`; `?names=` | map surfaces, `LeftPanel.tsx`, `ReceptionScreen.tsx` | 2 (filters), 3, 5 | filter params done (PR 2, `lib/deepLink.ts`); `?q=` / `?names=` open |
| P2-5 | Reception `error.tsx` in its own voice; loading skeleton on the real layout | `app/(shell)/reception/error.tsx` (new), `loading.tsx` | 5 | open |
| P2-6 | 5 MB client guard on CSV and snapshot files; labelled file triggers | `DataUtilitiesPanel.tsx` | 4 | open |
| P2-7 | Management: real tablist; 403 card gains its action; tiles removed | `app/(shell)/admin/management/page.tsx`, `AdminManagementPanel.tsx` | 4 | open |
| P2-8 | Settings: Reset-draft entry removed (ruling 22; Q7 keeps the map's Discard) | `DataUtilitiesPanel.tsx` | 4 | open |
| P2-9 | Ask Planner drawer 408 → 400 | `AskPlannerDrawer.tsx` | 3 | open |

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
| 2 | #515 | `feat/phase4-shell` | — | shell (P3-2 radio, 6, 9, 10; P2-2; route-group move of `/` confirmed 2026-09-03; Position kept as the fourth filter group, owner ruling 2026-09-04; group-2 sweep; provisional tenant row = PR 2/PR 3 seam) | open |
| 3 | — | — | — | map (P3-4, 5, 7, 11–14; P2-1, 3, 4, 9); **remove the provisional tenant row** (PR 2 seam — SeatMap's bar tenants + viewer search move into the map control row, PHASE2UX §1M.3); retire `FilterPanel` / `ActiveFilterChips`; split 3a / 3b if the diff passes ~1,500 lines | not started |
| 4 | — | — | — | Management + Settings (P3-15, 16, 17; P2-6, 7, 8) | not started |
| 5 | — | — | — | Reception, route surfaces, `/login` + `/my-seat` confirmed unchanged (P3-18; P2-5) | not started |
| 6 | — | — | v2.0.0 | close-out: this file complete; PHASE1IA §D delivered; DECISIONS reconciled; `CLAUDE.md` "Design system" rewritten; `app/concepts/` + `docs/design-system/` marked superseded (not deleted) | not started |

Next: PR 2 plan — shell; route-group proposal for `/` confirmed by the owner 2026-09-03; Position filter ruled in 2026-09-04.
