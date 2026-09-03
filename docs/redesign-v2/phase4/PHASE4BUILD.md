# Seat Planner redesign — Phase 4: code

**Status: in progress — PR 0 #512 merged (v1.74.0). PR 1 #513 (tokens + CSS landing) open. PR 2–6 not started.** Inputs, in reading order:
`CLAUDE.md` / `AGENTS.md`; `phase3/PHASE3DS.md` §5 (20 obligations with landing files, landing files by PR, retired
names) and §7 (what Phase 3 learned); `PHASE2UX.md` §3 (component checklist), §5 (nine obligations), the per-screen
decision logs and the wireframes under `wireframes/`; `PHASE1IA.md` §B–§C; `DECISIONS.md` D0–D6 + §6 (deviations
1–15, next free **16**) + §8; the `ibm-design-language` skill (`SKILL.md`, `references/senior-workflow.md`) — plugin
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

---

## 2. Obligations checklist

Ticked in the PR that discharges it, with the landing file as merged. **P3-n** = PHASE3DS §5 item n; **P2-n** =
PHASE2UX §5 item n.

| # | Obligation | Landing file | PR | Status |
|---|---|---|---|---|
| P3-1 | `sp-tokens.css` replaces the `--sp-*` block; `carbon-tokens.css` beside it minus `@import`; `tailwind.config.ts` re-pointed; retired names swept | `app/globals.css`, `app/layout.tsx`, `tailwind.config.ts` | 1 | done (PR 1) |
| P3-2 | `data-carbon-theme` derived from `data-theme` (light → `white`, dark → `g100`, absent → removed) by one function, used by the boot script and the Theme radio | `app/layout.tsx`, `components/ui/ShellPanels.tsx` | 1, 2 | boot half done (PR 1); radio in PR 2 |
| P3-3 | `carbon-components.css` then `sp-components.css` land verbatim; every product change is an `sp-*` override | `app/layout.tsx` (imports) | 1 | done (PR 1) |
| P3-4 | Platform-aware shortcut hint (`Ctrl K` / `⌘ K`) decided at hydration | `SeatMap.tsx`, `ReceptionScreen.tsx` | 3, 5 | open |
| P3-5 | `SeatMark.tsx` inlines the four symbols' paths with `data-stroke` / `data-fill` / `data-hatch`; never `<use>` | `components/seat-map/SeatMark.tsx` (new) + consumers | 3 (band, marker, inspector), 2 (Account panel), 4 (Management status), 5 (Reception rows) | open |
| P3-6 | Tier-C zone rules repeat the asset selector's element names; every dark-panel restyle gets a light-theme render before "done" | `components/ui/ShellPanels.tsx` | 2 | open |
| P3-7 | Hover-surface text step on the ROW's hover (Management seat link, Ask Planner label); roster rows static; red on dark = `text-error` | `components/admin-management/*`, `AskPlannerDrawer.tsx` | 3, 4 | open |
| P3-8 | Danger-ghost override covers Delete seat and Deactivate | `sp-components.css` (lands in PR 1), consumers | 3, 4 | open |
| P3-9 | Outlined-open trigger = four shadows (`.sp-mode`, utilities); the outer shadow never dropped | `components/ui/AppTopBar.tsx` | 2 | open |
| P3-10 | `--sp-event-pad` stays 10px in the History panel | `components/ui/ShellPanels.tsx` | 2 | open |
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
| P2-2 | History "last edit N min ago" from max draft `updated_at` | `ShellPanels.tsx` (History) | 2 | open |
| P2-3 | Roving tabindex + arrow keys across markers; Esc cancel ladder | `SeatMap.tsx`, `SeatMarker.tsx` | 3 | open |
| P2-4 | `?q=` on `/`, `/admin`, `/reception`; `?dept=` / `?zone=` / `?status=`; `?names=` | map surfaces, `LeftPanel.tsx`, `ReceptionScreen.tsx` | 3, 5 | open |
| P2-5 | Reception `error.tsx` in its own voice; loading skeleton on the real layout | `app/(shell)/reception/error.tsx` (new), `loading.tsx` | 5 | open |
| P2-6 | 5 MB client guard on CSV and snapshot files; labelled file triggers | `DataUtilitiesPanel.tsx` | 4 | open |
| P2-7 | Management: real tablist; 403 card gains its action; tiles removed | `app/(shell)/admin/management/page.tsx`, `AdminManagementPanel.tsx` | 4 | open |
| P2-8 | Settings: Reset-draft entry removed (ruling 22; Q7 keeps the map's Discard) | `DataUtilitiesPanel.tsx` | 4 | open |
| P2-9 | Ask Planner drawer 408 → 400 | `AskPlannerDrawer.tsx` | 3 | open |

Architecture item the hand-off names for the **PR 2 plan** (owner confirmation before doing it): move `app/page.tsx`
into `app/(shell)/` so the one shell mounts on `/` (PHASE1IA B2), with its effect on `auth-session-source`'s matcher
list (`/` is already allowlisted) and `nav-shell.spec.ts`.

---

## 3. Test-triage outcomes

`TEST-TRIAGE.md` is the plan; this section records what each PR actually did to the suite (filled per PR).

| PR | Retired | Rewritten | Re-pointed | Notes |
|---|---|---|---|---|
| 0 | — | — | — | `tests/phase4-token-layer-source.test.mjs` added (5 tests, green with the PR 0 ledger) |
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

---

## 5. What Phase 4 learned

Filled at close-out (PR 6), ordered tokens → components → surfaces like PHASE3DS §7.

---

## Slice log

| PR | GitHub | Branch | Tag | Scope | Status |
|---|---|---|---|---|---|
| 0 | #512 | `docs/phase4-triage` | v1.74.0 | `TEST-TRIAGE.md`; this scaffold; `tests/phase4-token-layer-source.test.mjs` | merged |
| 1 | #513 | `feat/phase4-tokens` | — | tokens + CSS landing (P3-1, 2 boot half, 3, 19, 20); `app/styles/` ×4 + `phase4-bridge.css`; group-1 sweep 297 sites / 29 files; theme three-state; `tailwind.config.ts`; DECISIONS D4 confirmation + D1-h / D1-i; `screenshots/pr1/` | open |
| 2 | — | — | — | shell (P3-2, 6, 9, 10; P2-2; route-group move on confirmation) | not started |
| 3 | — | — | — | map (P3-4, 5, 7, 11–14; P2-1, 3, 4, 9); split 3a / 3b if the diff passes ~1,500 lines | not started |
| 4 | — | — | — | Management + Settings (P3-15, 16, 17; P2-6, 7, 8) | not started |
| 5 | — | — | — | Reception, route surfaces, `/login` + `/my-seat` confirmed unchanged (P3-18; P2-5) | not started |
| 6 | — | — | v2.0.0 | close-out: this file complete; PHASE1IA §D delivered; DECISIONS reconciled; `CLAUDE.md` "Design system" rewritten; `app/concepts/` + `docs/design-system/` marked superseded (not deleted) | not started |
