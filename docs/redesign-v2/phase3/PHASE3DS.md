# Seat Planner redesign — Phase 3: UI design system

**Status: in progress — PR 1 of 5 (tokens + foundations).** Inputs: `PHASE2UX.md` (§1 geometry, §2 states,
§3 component table, the close-out note), `DECISIONS.md` (D0–D6, §6 deviations 1–15), the `ibm-design-language`
skill (`SKILL.md`, `tokens.md`, `design-engineering.md`, `status-and-dataviz.md`, `carbon-next.md`, `taste.md`) and
its two assets, `app/globals.css` as an inventory of consumer names only. Nothing under `app/`, `components/`
or `lib/` changes in this phase.

Layout of `docs/redesign-v2/phase3/`:

| Path | What |
|---|---|
| `tokens/carbon-tokens.css` | skill asset, copied verbatim (sha1 `13493d0…` before git's CRLF→LF normalisation; byte-identical modulo line endings), both themes — never edited |
| `tokens/sp-tokens.css` | the product semantic layer — every name `--sp-*`, no hex |
| `components/carbon-components.css` | skill asset, copied verbatim (sha1 `0c3f28e…`) — never edited |
| `components/sp-components.css` | hand-built components from PHASE2UX §3 only |
| `specimens/*.html` | one static page per group + `index.html` + `compare.html` (light beside dark); four CSS files, nothing else |
| `contrast/*.json` | the product pairs fed to `scripts/check_contrast.py` (§3) |

Verification method (close-out note, lesson 2): every specimen is rendered through the headless-Chrome rig
(static server on localhost + Playwright `chromium.launch({ channel: "chrome" })`, 1920×1080, both themes) and
the PNGs are read before a conformance claim is made. The rig also audits every `var(--…)` in the two `sp-*`
files against the four loaded sheets — zero undefined references is a merge gate.

---

## 1. Decision log

Shape per `senior-workflow.md`: Screen → Component · Problem · Options considered (incl. the asset's nearest
class and why it isn't enough) · Choice · Trade-off · Would change if.

### 1.1 Token tiers

**Problem.** The shipped `app/globals.css` carries ~270 `--sp-*` names across five vocabularies (theme roles,
brand, status, component, primitives) with literal values, `*-rgb` twins and a warm palette; Phase 4 must
rebind those consumers to Carbon without another value-by-value audit.
**Options.** (a) Point components straight at `--cds-*` — one tier fewer, but intent is unreadable in review
and the v12 DTCG rename touches every component. (b) Keep the shipped names and swap values — preserves the
five vocabularies and their drift. (c) One `--sp-*` layer in three tiers, every value a `var()` into the asset.
**Choice.** (c). Tier A *theme roles* alias `--cds-*` one-to-one and flip with the theme. Tier B *component
roles* carry product meaning (`--sp-mode-draft-mark`, `--sp-seat-footprint-fill`) and point at tier A or a
`--cds-status-*-mark`. Tier C *zone* covers the two surfaces that do not follow the theme — the Gray 100 shell
and the right panels — and is the one place a value references the asset's palette tier (`--gray-*`,
`--blue-50`, `--red-50`) rather than a theme token, because no theme token is invariant;
`carbon-components.css` does the same for its own `.cds-header`. Geometry, type (`--sp-type-*` as `font:`
shorthands) and motion are aliases of the asset's ladders; the only literal values are product widths from
Phase 2 (256 · 320 · 400 · 480 · 560 · 720 · 28) and the tag radius.
**Trade-off.** Tier C breaks the letter of "every value a `--cds-*` reference" for ~30 names; the alternative
(a scoped dark-theme block) would duplicate the asset's g100 ladder and drift from it.
**Would change if** Carbon ships an invariant-shell token set (v12 direction, not shipped — `carbon-next.md`).

### 1.2 Theme mechanism

**Problem.** The asset switches on `html[data-carbon-theme]` (`white` / `g100` / absent = system). The app
already ships `html[data-theme]` (`dark` / absent) set pre-hydration in `app/layout.tsx` and by
`ThemeToggle.tsx`, persisted as `sp-theme`; the hand-off rules that attribute name stays.
**Options.** (a) Rename the app attribute to Carbon's — a rename across the codebase for no user gain.
(b) Re-declare the dark ladder in `sp-tokens.css` under `[data-theme="dark"]` — ~90 palette references that
drift from the asset. (c) Keep `data-theme` as the app's attribute and *derive* `data-carbon-theme` from it in
the same two places that set it today (light → `white`, dark → `g100`, system → both removed).
**Choice.** (c). Because every tier-A value aliases a `--cds-*` token, `sp-tokens.css` needs no theme blocks of
its own: light on bare `:root`, dark under the asset's `prefers-color-scheme` guard, dark again under the
forced attribute — three states, one definition each. Every specimen page runs exactly this script (inline,
eight lines) so the mechanism is proven before Phase 4 binds it; the Account panel's Theme radio (D0-b) drives
it.
**Trade-off.** Two attributes on `<html>` instead of one. **Would change if** the asset ever switches on
`data-theme` natively.

### 1.3 Mode indicator — Shell → `.sp-mode` (§3 "Mode indicator · hand-built")

**Problem.** A status-only button on the Gray 100 header whose mark must say Published / Draft / never
published / error without colour (PHASE2UX §1.5, D0-a), with a skeleton, pressable, and centred on x=960.
**Options.** Nearest asset classes: `.cds-header-utils button` (48×48 icon-only — no text slot, no marks,
no skeleton); `.cds-status` (icon + label — right anatomy, but its mark colours are theme tokens for theme
surfaces, not the invariant shell). A `.cds-tag` was rejected: rounded, 24px, and a tag reads as a label
not a control.
**Choice.** Hand-built: mark 12px · gap 8 · `body-compact-01` with tabular numerals · 48px tall · 16px side
padding. Marks, each two signals (shape + fill): **■** filled square gray 10 = Published; **◇** hollow
diamond 2px orange 40 (`--cds-support-caution-major`, identical in both themes) = Draft; **□** hollow square
gray 40 = never published; **⊗** filled circle red 50 with a 2px cut = error, still pressable. Surfaces:
rest `#161616`, hover `#333333` (the asset's `.cds-header-nav a:hover` step), pressed `#262626` (hand-off),
open = pressed. Focus 2px white inset. Loading = a 160×16 skeleton in the slot with `aria-busy`, not a
disabled button. Narrow: mark + "Published" / "Draft · 4" (D0-e) is copy, not a variant class.
**Trade-off.** Orange is the one non-gray hue in the shell; it is the product's Draft colour by ruling and
clears 5.13:1 on the hover surface (§3). Pressed `#262626` sits *darker* than hover `#333333`, against
Carbon's dark-ladder direction (active steps lighter) — kept as ruled, listed under "Open for the owner".
**Would change if** the History panel gains a third mode, or the owner reverses the pressed grade.

### 1.4 Seat status marks — Map → `.sp-seat-mark`, `.sp-seat-legend`, `.sp-seat-footprint` (§3 "Status marks", deviation 3)

**Problem.** Four enum states (`lib/types.ts` `SeatStatus`: available · assigned · reserved · unavailable)
must read on a spatial plan where every seat is a fixed footprint, in the band legend, in the inspector
header, and inside the dark Account panel — and survive grayscale on a hovered row.
**Options.** `.cds-status` supplies icon + label and hover-safe mark colours but no symbol set and no
footprint. Colour per state (the shipped legend) was rejected: colour alone never carries meaning and five
colours on 68 markers is exactly the "colourful screen" failure. Shape per state on the plan was rejected:
seats are positions; changing the outline lies about geometry (D1).
**Choice.** Constant footprint, distinct **symbol** per state, grays only — the symbol is the signal:
● filled circle = assigned (legend only; on the plan the *name pill* is the mark, PR 3); ○ hollow ring 2px
= open; lock (hollow shackle, filled body) = reserved; hatched square with a 2px edge = unavailable. Marks
16px beside 14px type, strokes 2px (status-and-dataviz sizing at 16px). Stroke colour `--sp-icon-secondary`
(gray 70 light / gray 30 dark), fill `--sp-icon-primary`. The empty-seat marker on the plan is a 28×28
footprint (`--sp-seat-footprint`, deviation 8's height cap) with the symbol centred, fill `--sp-layer-02`,
1px edge `--sp-icon-secondary`, hover fill `--sp-layer-hover-02`.
**Trade-off.** The lock and hatch are drawn inline (four `<svg>` fragments) rather than taken from an icon
library — Phase 4 may swap them for `@carbon/icons` `Locked` / a pattern fill as long as the grayscale
strip still separates the four. **Would change if** `reserved` / `unavailable` acquire data and the primary
read needs them promoted (D1: "symbols specified but not designed into the primary read until data exists").

### 1.5 Specimen state hooks

Every interactive block styles hover / pressed / focus through `:is(:hover, [data-state="hover"])` (etc.)
so a specimen can pin a state without scripting and the sheet stays a static file. Phase 4 keeps the
selectors and never sets the attribute. Rejected: duplicating each state rule inside the specimen's inline
`<style>` (drift), or scripting synthetic hover in the rig (invisible to a human opening the file).

### 1.6 Helper text on hoverable rows

`text-helper` (gray 60) measures 4.10:1 on `layer-hover-01` and fails 4.5:1 for 12px text (§3). The
left-panel option counts ("Case Management · 38") and any other helper-*style* text that sits on a row
that hovers use `--sp-text-helper-on-row` (= `text-secondary`, 6.38:1). `text-helper` itself stays for
field helper lines and captions, which never sit on a hover surface.

---

## 2. Component index (PHASE2UX §3 → class → specimen anchor)

Filled per PR. Rows marked *pending* land in the PR named.

| §3 row | Class(es) | Specimen | PR |
|---|---|---|---|
| Foundations: type · spacing · sizes · grid · focus · motion · theme roles · grayscale strip | tokens only (`--sp-type-*`, `--sp-space-*`, `--sp-size-*`, `--sp-focus-*`, `--sp-duration-*`) | `00-foundations.html#type` … `#grayscale` | 1 |
| Mode indicator | `.sp-mode`, `.sp-mode--published / --draft / --unpublished / --error / --loading`, `.sp-mode-mark`, `.sp-mode-skeleton` | `05-status-and-marks.html#mode` | 1 |
| Status marks (seat legend) | `.sp-seat-mark`, `.sp-seat-mark--assigned / --available / --reserved / --unavailable`, `.sp-seat-legend`, `.sp-seat-footprint` | `05-status-and-marks.html#seat` | 1 |
| Skip link · header · hamburger · utilities · left panel · right panel · mode switch · tooltip · dark skeleton / empty / notification | *pending* | `01-shell.html` | 2 |
| Control row … roster rows (map) | *pending* | `02-map.html` | 3 |
| Side panel 480 · modals · narrow tearsheet · callout | *pending* | `03-panels-and-sheets.html` | 4 |
| Page header + tabs · table · structured list · radio · file trigger · count cards · readout · ghost done-state | *pending* | `04-forms-and-tables.html` | 4 |

---

## 3. Contrast

Script: `scripts/check_contrast.py` from the `ibm-design-language` skill, run once at the end of PR 1.
Surfaces checked: white, `layer-01`, `layer-hover-01` (the preset), plus — because this product has them —
the shell / dark-panel surface `#161616`, the hover surface `#333333`, the pressed surface `#262626`, the
dark-theme `layer-selected` `#393939`, and both themes' `highlight`.

**`--preset all` — summary line pasted verbatim:**

```
20/26 clear every surface — 6 to fix
```

The six are Carbon's own known traps (`tokens.md`), none of which any `--sp-*` token uses as a drawn mark:

| Preset failure | Ratio on hover | How the token layer avoids it |
|---|---|---|
| success green 50 | 2.74 | `--sp-status-success-mark` = `--cds-status-success-mark` (green 60, 4.10+) |
| warning yellow 30 | 1.37 | `--sp-status-warning-mark` = yellow 60; yellow 30 exists only as `--sp-status-warning-fill` behind a dark glyph |
| caution orange 40 | 2.01 | `--sp-status-draft-mark` = `--cds-status-caution-mark` (orange 60 on light; orange 40 only on dark and in the invariant shell) |
| text-helper gray 60 | 4.10 | §1.6 — `--sp-text-helper-on-row` (gray 70) on any row that hovers |
| text-error red 60 | 4.08 | error text sits under a field or in a notification, never on a hovered row; the asset's `--error` notification has no hover |
| link blue 60 | 4.08 | no links on hoverable rows (roster rows are static); the asset's `.cds-btn--ghost:hover` already steps to blue 70 |

**Product pairs (`contrast/product-pairs.json`, 52 pairs) — summary line pasted verbatim:**

```
52/52 pass
```

Every mark on every surface it lands on: the four mode marks on `#161616` / `#333333` / `#262626`
(lowest: error ⊗ red 50 on hover, 3.77:1); shell text, secondary, helper, current-link bar (blue 50,
5.41), white focus; panel link (blue 40, 7.68) and error mark; the seat stroke gray 70 on white / `layer-01` /
`layer-hover-01` / `layer-selected` (lowest 5.92) and on both footprint fills; the dark-theme stroke gray 30
on `#161616` / `#262626` / `#333333` / `#393939` / footprint hover `#474747` (lowest 5.44); the Draft orange
on both themes' hover surfaces (light orange 60: 4.10; dark orange 40: 5.13); the search highlight pair in
both themes.

**Measured, not gated (`contrast/surface-pairs-not-gated.json`, 3 pairs)** — dividers, a skeleton and a
hover step, none of which is a mark or text: shell rule gray 80 on `#161616` = 1.57:1 (a separator; Carbon's
own g100 `border-subtle` is the same pair), skeleton element on skeleton background = 1.26:1 (a
placeholder, deliberately quiet, Carbon's g100 values), panel row hover `#333333` on `#161616` = 1.43:1
(a hover step; the focus ring, not the fill, identifies the control). The utility "outlined when open"
state (PR 2) must therefore not rely on the outline alone — the open panel and `aria-expanded` carry it.

---

## 4. Carbon conformance — Phase 3 (TRUE / DIFFERS / NOT COVERED)

Next free deviation number: **16**.

| Decision | Verdict | Skill text |
|---|---|---|
| Assets copied verbatim; product CSS is a semantic layer on top | TRUE | SKILL "copy them in rather than retyping"; token discipline |
| Tier C palette references for the invariant shell | NOT COVERED | tokens.md has no invariant-surface token; the asset's `.cds-header` sets the precedent. Reopens if v12 ships one |
| `data-theme` kept, Carbon attribute derived | NOT COVERED | asset documents `data-carbon-theme` only; app attribute is an owner ruling |
| Mode marks: ■ ◇ □ ⊗, shape + fill | TRUE | status-and-dataviz "two of colour, shape, symbol … in the mark itself" |
| Draft = orange 40 on the shell | TRUE | status palette: orange 40 "serious warning" outline grade on dark; 5.13:1 on hover |
| Pressed shell surface `#262626` darker than hover `#333333` | DIFFERS — *not ledgered* | tokens.md: dark themes step *up* on active. Kept per hand-off; owner decides (§6) — becomes deviation 16 only if kept |
| Seat states as symbols in a constant footprint | TRUE (deviation 3 already ledgered) | status-and-dataviz spatial-map clause |
| Marks 16px / strokes 2px / grays only | TRUE | status-and-dataviz sizing; SKILL "grays dominate" |
| `text-helper` replaced by `text-secondary` on hover rows | TRUE | tokens.md known traps — hover surface is the worst case |
| Focus 2px inset, white on Gray 100 | TRUE | SKILL non-negotiable; tokens.md "focus flips to white on dark" |
| Tag radius 12px on 24px, radius 0 elsewhere | TRUE | SKILL |
| Motion tokens only; skeleton sweep 3000ms linear | TRUE | asset precedent for the skeleton; design-engineering "never linear except progress" applies to interface motion, not a loading texture |

---

## 5. Phase 4 hand-off (appends PHASE2UX §5's nine items; filled per PR)

**Font loading (note, not a decision).** `app/fonts/` already vendors IBM Plex Sans (variable weight, covers
300/400/600) and Plex Mono 400/500/600 through `next/font/local`. The asset's Google Fonts `@import` serves
the specimens only; when `carbon-tokens.css` moves into the codebase the import line is the one edit Phase 4
makes to it (the `next/font` class supplies the family). Italic faces are not vendored and the fixed set
never uses them.

**Theme.** `app/layout.tsx` boot script and `components/ui/ThemeToggle.tsx` set `data-carbon-theme`
alongside `data-theme` (§1.2); the Account panel's Theme radio group (PR 2) replaces `ThemeToggle`.

**Landing files (PR 1 scope).** `sp-tokens.css` → `app/globals.css` (replacing the `--sp-*` block) and
`tailwind.config.ts` (re-point the theme extension at the new names). `.sp-mode` → `AppTopBar.tsx` (the
indicator replaces the shipped `PublishStateChip`-style element; History panel wiring is PR 2).
`.sp-seat-mark` / `.sp-seat-legend` / `.sp-seat-footprint` → `components/seat-map/` (legend in
`MapStatusBand`, footprint in `SeatMarker.tsx`, marks in the inspector header and the Account panel).

**Retired `--sp-*` names (PR 1 — primitives, theme roles, brand, status).** *Replaced by* in italics.

- `--sp-space-1…7` → *`--sp-space-01…13`* (values are the Carbon scale, not the old 4-based one)
- `--sp-radius-sm / -md / -lg / -xl / -full / -sheet` → *`--sp-radius` (0), `--sp-radius-tag`*
- `--sp-shadow-floating / -modal / -raised / -sheet`, `--sp-elevation-2…5 / -panel / -rail` → retired; depth is layers (*`--sp-layer-02`*); the overflow menu keeps *`--sp-shadow`*
- `--sp-duration-fast / -standard / -deliberate` → *`--sp-duration-fast-01 / -fast-02 / -moderate-02`* + *`--sp-ease-*`*
- `--sp-focus-offset-color`, `--sp-focus-marker-ring`, `--sp-focus-marker-offset` → retired (one inset ring); `--sp-focus-width` / `--sp-focus-offset` keep their names, values change
- `--sp-background-hover` keeps its name; `--sp-layer-hover` / `-selected` / `-accent` keep theirs
- `--sp-border-hairline`, `--sp-border-hairline-soft`, `--sp-border-soft` → *`--sp-border-subtle-00`*, *`--sp-border-subtle`*
- `--sp-text-on-brand` → *`--sp-text-on-color`*; `--sp-link-on-field` → retired; `--sp-overlay-base` → *`--sp-overlay`*
- `--sp-neutral-strong` / `--sp-neutral-muted` → *`--sp-text-secondary`* / *`--sp-text-helper`*; `--sp-surface-disabled` → *`--sp-button-disabled`*
- `--sp-brand`, `-hover`, `-subtle`, `-wash`, `-border`, `-text`, `-mark`, `-deep`, `--sp-accent` → retired (no brand orange in the system; the Draft mark is *`--sp-mode-draft-mark`* / *`--sp-status-draft-mark`*, the one action colour *`--sp-interactive`*)
- `--sp-button-secondary-soft` → retired
- `--sp-status-danger-*` → *`--sp-status-error-*`*; `--sp-status-pending-*` and `--sp-status-draft-*` → *`--sp-status-draft-*`*; `--sp-status-published-*` → *`--sp-status-success-*`*; `--sp-status-neutral-*`, `--sp-status-search-*` keep their families; roles collapse to `-mark / -surface / -text` (+ `-fill` for warning)
- `--sp-color-*`, `--sp-color-workspace`, `--sp-color-workspace-deep`, `--sp-color-state-planner-*` → retired (grouped prefixes; `--sp-map-mat` covers the workspace surface)
- Deferred to their component PRs: `--sp-chrome-*` (PR 2), `--sp-marker-*`, `--sp-legend-*`, `--sp-selection*`, `--sp-ai-*`, `--sp-editor-*`, `--sp-publish-*`, `--sp-trail*`, `--sp-wash-zone` (PR 3), `--sp-tag-*`, `--sp-table-*`, `--sp-extension-*`, `--sp-identity-*` (PR 4)

---

## 6. Open for the owner (batched; each with a default)

1. **Pressed shell surface.** Hand-off names `#262626`; Carbon's dark ladder steps lighter on active
   (`#393939`). Default: keep `#262626` and ledger it as deviation 16 at close-out.
2. **Theme attribute.** Default: keep `data-theme`, derive `data-carbon-theme` (§1.2).
3. **Seat symbols.** Default: ○ open · lock reserved · hatch unavailable; ● assigned in the legend only.

---

## Slice log

| PR | Branch | Contents |
|---|---|---|
| 1 | `docs/phase3-tokens` | assets copied; `sp-tokens.css`; `.sp-mode`, seat marks; specimens 00 + 05 + index + compare; §1.1–1.6, §2 (partial), §3, §4, §5 (partial) |
