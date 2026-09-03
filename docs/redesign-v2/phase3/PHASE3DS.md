# Seat Planner redesign — Phase 3: UI design system

**Status: in progress — PR 1 (tokens + foundations) merged v1.73.4; PR 2 (shell) open; PR 3 (map) next.** Inputs: `PHASE2UX.md` (§1 geometry, §2 states,
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
`data-theme` natively. **Ruled by the owner (#507): decided, not open.**

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
rest `#161616`, hover `#333333` (the asset's `.cds-header-nav a:hover` step), pressed `#393939` — gray 80, the
dark ladder steps *lighter* on active (owner ruling #507; the hand-off's `#262626` named a surface to test
marks against, not the pressed design). **Open ≠ pressed:** `[aria-expanded="true"]` keeps the shell
background and draws a 1px `--sp-shell-rule` on top, left and right with no bottom edge, so the outline
flows into the History panel's left rule (`ui-shell.md`); the Help / History / Account utilities take the
same treatment in PR 2. Focus 2px white inset. Loading = a 160×16 skeleton in the slot with `aria-busy`, not a
disabled button. Narrow: mark + "Published" / "Draft · 4" (D0-e) is copy, not a variant class.
**Trade-off.** Orange is the one non-gray hue in the shell; it is the product's Draft colour by ruling and
clears 5.13:1 on hover and 4.69:1 on pressed (§3) — gray 70 was rejected for pressed because orange 40
lands near 3:1 on `#525252`. **Would change if** the History panel gains a third mode.

### 1.4 Seat status marks — Map → `.sp-seat-mark`, `.sp-seat-legend`, `.sp-seat-footprint` (§3 "Status marks", deviation 3)

**Problem.** Four enum states (`lib/types.ts` `SeatStatus`: available · assigned · reserved · unavailable)
must read on a spatial plan where every seat is a fixed footprint, in the band legend, in the inspector
header, and inside the dark Account panel — and survive grayscale on a hovered row.
**Options.** `.cds-status` supplies icon + label and hover-safe mark colours but no symbol set and no
footprint. Colour per state (the shipped legend) was rejected: colour alone never carries meaning and five
colours on 68 markers is exactly the "colourful screen" failure. Shape per state on the plan was rejected:
seats are positions; changing the outline lies about geometry (D1).
**Choice.** Constant footprint, distinct **mark** per state, grays only — the mark is the signal:
assigned = a 28×16 **miniature of the name pill** (footprint fill + edge, a 2px name-line) because ● never
appears on the plan and ○ vs ● differ by fill alone (owner ruling #507; `.sp-seat-mark--assigned` removed,
nothing consumes it); ○ hollow ring 2px = open; lock (hollow shackle, filled body) = reserved; hatched
square with a 2px edge = unavailable. Marks 16px beside 14px type, every stroke 2px including the hatch
(1.5px straddled pixels at 16px in the rig). Stroke colour `--sp-icon-secondary`
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

### 1.7 Header overrides — Shell → `.sp-header` on `.cds-header` (§3 "Header · exists", "Hamburger", "Utility · outlined when open")

**Problem.** The asset's header is right in geometry (48, Gray 100, gray 80 rule, utilities flush right) but
applies `--cds-button-primary` (blue 60) to the current link, pads the name 0 32 0 16, has no hamburger
slot, no pressed state, and no open state for a panel trigger.
**Options.** Fork the header into `sp-components.css` (a second 48px header to maintain) — rejected. Or add
one class and override only what the shell zone needs.
**Choice.** `.sp-header` overrides: current bar 3px `--sp-shell-current-bar` (blue 50 — what
`$border-interactive` resolves to on g100; applying a theme token the asset didn't, not a deviation); name
padding 0 16 (PHASE2UX §1.2); nav pressed gray 80. `.sp-header-slot` is the 48×48 hamburger / reserved slot:
Menu glyph 20px; open = Close glyph + `aria-expanded="true"` with **no persistent fill** (hover / pressed
apply as normal — the outlined-open treatment belongs to right-panel triggers only, `ui-shell.md`);
`--reserved` is the same box, empty, on Reception / Management / Settings at lg+ (D0-h). Utilities: rest ·
hover gray-90-hover (asset) · pressed gray 80 · focus white · **open = outlined**: shell background, 1px
`--sp-shell-rule` top / left / right, and a 1px outer shadow in the shell colour that covers the header's
bottom rule so the outline opens into the panel's left rule. `.sp-mode` takes the same open treatment.
**Trade-off.** The open outline is gray 80 on gray 100 (1.57:1, measured, not gated): the open state is also
carried by the panel itself and `aria-expanded`. **Would change if** Carbon ships an invariant-shell token
set.

### 1.8 Tooltip — Shell → `.sp-tooltip` (§3 "Tooltip on icon buttons · hand-built")

**Problem.** Icon-only 48px utilities need their name on hover and on focus. **Options.** Carbon's tooltip
uses `$background-inverse`, which flips to gray 80 → light in the dark theme and would go pale on the
invariant dark header — rejected. A `title` attribute — not styled, not on focus — rejected.
**Choice.** Tier C: gray 80 surface, gray 10 `label-01`, 24px tall, 8px below the control, centred, shown
on `:hover` and `:focus-within`, Esc dismisses (behaviour), suppressed under `(hover: none)`. The text is
the control's `aria-label`, never interactive content. **Would change if** a tooltip is needed on a theme
surface (then a theme-following variant, not this one).

### 1.9 Right panel — Shell → `.sp-panel` (§3 "Right panel (dark, 320, floats) · hand-built" + dark variants)

**Problem.** Help / History / Account share one 320 panel on Gray 100 that floats over content in both
themes, and everything inside — ghost buttons, tag, empty state, notification, skeleton — exists in the
asset only for theme surfaces. **Options.** `.cds-side-panel` (480, `layer-02`, slide-in form container
with a footer) — wrong width, theme surface, wrong role. A separate dark component set — rejected; the
markup should not know which surface it is on.
**Choice.** `.sp-panel`: heading-03 in 16px padding, content column 288, rows 48, 1px gray 80 left rule,
moderate-02 on one axis via `.sp-panel-host[data-open]`. **Zone-scoped variants** restyle the asset's
markup: `.sp-panel .cds-btn--ghost` → `--sp-panel-dark-link` (blue 40), hover fill gray-90-hover with
blue 30 text, pressed gray 80 (one step lighter again, the header's direction), focus white;
`.sp-panel .cds-tag` → gray 80 / gray 10, the one rounded element; `.sp-panel .cds-empty` → gray 10 title,
gray 30 body, no page padding; `.sp-panel .cds-notification--error` → low-contrast: layer
`--sp-panel-dark-layer` (gray 90), 3px left border `--sp-panel-dark-error-mark` (red 50), ⊗ mark, Retry as
the ghost variant inside it — never a filled danger button in a notification; `.sp-panel .sp-skeleton` →
gray-100-hover / gray 80 sweep. **Event rows** are 72px: 12 top · 18 + 16 + 16 · 10 bottom — the three
token line-heights sum to 50, so neither 12/48/12 nor 16/40/16 is reachable without a non-token
line-height; measured in the rig at exactly 72 / 12 / 10. Show more is the ghost (an action), the cap
caption is `--sp-panel-dark-text-helper`. Width 320 is recorded under DECISIONS D0-f (Phase 3
confirmation), not §6. Viewers' History has no switch (Hidden) — the fact line stands alone.
**Trade-off.** Nine zone-scoped rules instead of nine dark components. **Would change if** the panels ever
follow the theme (then the scope collapses into tier A).

### 1.10 Mode switch — History panel → `.sp-switch` (§3 "Two-segment mode switch · hand-built")

**Problem.** Published ⇄ Draft, a control that shows the current mode on a Gray 100 surface, 40px, full
content width. **Options.** Two ghost buttons (no selected state); a toggle (Draft is not "on");
Carbon's content switcher — the right pattern, absent from the asset.
**Choice.** Carbon's inverse-selected content switcher on g100: selected gray 10 fill / gray 100 text;
unselected gray 100 with a 1px gray 80 edge; unselected hover gray-90-hover; pressed gray 80; focus white
2px inset; `aria-pressed` marks the current mode. Compliant, not a deviation. Pressing the other segment
navigates `/` ⇄ `/admin` keeping `?floor=` and `?seat=` and closes the panel (D0-a). **Would change if** a
third mode appears (then a real tablist).

### 1.11 Radio group — Account panel → `.sp-radio-group` / `.sp-radio` (§3 "Radio group (Theme) · hand-built")

**Problem.** Theme = Light · Dark · System, instant, persisted; the asset has a checkbox and no radio.
Built here (PR 2) because the Account specimen is incomplete without it; PR 4 references it.
**Choice.** Native `input[type=radio]` under a `fieldset`/`legend`, 16px ring (1px) + 8px dot — the
asset's checkbox geometry — 32px items, `body-compact-01` label, hover = 4px halo in the layer-hover
colour, focus 2px `$focus` with 1px offset (the checkbox's own ring). Inside `.sp-panel` the ring and dot
take the panel text colour and the focus ring goes white (specificity note: the zone rule must name
`span.sp-radio-mark` to beat the base rule — caught in the rig). Never disabled: Theme is always
available. **Would change if** a radio is needed on a `layer-01` surface in a modal (the halo colour would
need `layer-hover-02`).

### 1.12 Left filter panel — Shell → `.sp-left-panel` (§3 "Left filter panel (slide-in, pushes) · hand-built")

**Problem.** 256px, `layer-01`, below the header, pushes the canvas, no focus trap, pinned header row,
scrolling body, three checkbox groups with per-group Clear and counts, section links above it below lg.
**Options.** `.cds-side-panel` — right, 480, slide-over, focus-trapped; wrong on every axis. A Carbon side
nav — right idea, absent from the asset.
**Choice.** `.sp-left-panel`: header row 48 (`heading-compact-01` + ghost Clear all, Hidden while nothing
is applied), body scrolls; `fieldset.sp-filter-group` with the legend laid out as a 32px row (title + ghost
Clear, Hidden while the group is empty); items 32px = `.cds-checkbox` + name (truncates with `title`) +
count in `label-01` coloured `--sp-text-helper-on-row` (§1.6) because the row hovers to `layer-hover-01`;
`.sp-left-nav` items 32px with a 3px `--sp-border-interactive` left bar and `layer-selected` fill on the
current one; empty / loading / partial / overflow / roster-floor states are the asset's empty state,
`.sp-skeleton-row`, and `.cds-notification--error` with ghost Retry, each scoped to the panel's padding;
slide-in fast-02 on one axis via `.sp-left-panel-host[data-open]`. **Trade-off.** Counts are 12px on a
14px row; they read as secondary by size and colour, which is the intent. **Would change if** the filter
set grows past three groups (then collapsible groups).

### 1.13 Skeleton line — `.sp-skeleton` (§3 "Skeleton rows · exists (needs a dark variant)")

The asset's skeleton is `td::after` — table cells only. Panels and lists need a bare 12px line with the
same sweep; `.sp-skeleton-row` (32px) and `.sp-skeleton-event` (72px, three lines) reserve the dimensions
of what they replace so nothing jumps. Dark variant by the `.sp-panel` scope.

---

## 2. Component index (PHASE2UX §3 → class → specimen anchor)

Filled per PR. Rows marked *pending* land in the PR named.

| §3 row | Class(es) | Specimen | PR |
|---|---|---|---|
| Foundations: type · spacing · sizes · grid · focus · motion · theme roles · grayscale strip | tokens only (`--sp-type-*`, `--sp-space-*`, `--sp-size-*`, `--sp-focus-*`, `--sp-duration-*`) | `00-foundations.html#type` … `#grayscale` | 1 |
| Mode indicator | `.sp-mode`, `.sp-mode--published / --draft / --unpublished / --error / --loading`, `.sp-mode-mark`, `.sp-mode-skeleton` | `05-status-and-marks.html#mode` | 1 |
| Status marks (seat legend) | `.sp-seat-mark`, `.sp-seat-mark--assigned / --available / --reserved / --unavailable`, `.sp-seat-legend`, `.sp-seat-footprint` | `05-status-and-marks.html#seat` | 1 |
| Skip link | `.cds-skip-link` (asset) | `01-shell.html` (first focusable) | 2 |
| Header, name, nav, utils | `.cds-header.sp-header`, `.cds-header-name`, `.cds-header-nav`, `.cds-header-utils`, `.sp-header-center` | `01-shell.html#header` | 2 |
| Hamburger / reserved slot | `.sp-header-slot`, `.sp-header-slot--reserved`, `.sp-glyph-menu` / `.sp-glyph-close` | `01-shell.html#hamburger` | 2 |
| Utility icon button, outlined when open | `.sp-header .cds-header-utils button[aria-expanded="true"]` | `01-shell.html#utilities` | 2 |
| Tooltip on icon buttons | `.sp-has-tooltip` > `.sp-tooltip[role=tooltip]` | `01-shell.html#utilities` | 2 |
| Right panel (dark, 320, floats) | `.sp-panel`, `.sp-panel-host[data-open]`, `.sp-panel-body`, `.sp-panel-status`, `.sp-panel-caption`, `.sp-panel-fact`, `.sp-panel-divider`, `.sp-panel-row` (+`--static`), `.sp-panel-email`, `.sp-panel-dl` | `01-shell.html#panels` | 2 |
| Two-segment mode switch | `.sp-switch` > `button[aria-pressed]` | `01-shell.html#switch` | 2 |
| Event list (static rows) | `.sp-event-list` > `.sp-event` (`-what` / `-when` / `-who`) | `01-shell.html#panels` | 2 |
| Show more (ghost) · Ghost on dark | `.sp-panel .cds-btn--ghost` | `01-shell.html#panels` | 2 |
| Skeleton rows (+ dark) | `.sp-skeleton`, `.sp-skeleton-row`, `.sp-skeleton-event`; `.sp-panel .sp-skeleton` | `01-shell.html#panels`, `#left` | 2 |
| Empty state (+ dark) | `.cds-empty`; `.sp-panel .cds-empty`; `.sp-left-panel .cds-empty` | `01-shell.html#panels`, `#left` | 2 |
| Inline notification (error) + ghost Retry (+ dark) | `.cds-notification--error`; `.sp-panel .cds-notification--error` | `01-shell.html#panels`, `#left` | 2 |
| Tag (role) | `.cds-tag`; `.sp-panel .cds-tag` | `01-shell.html#panels` | 2 |
| Radio group (Theme) | `fieldset.sp-radio-group` > `label.sp-radio` > `input` + `.sp-radio-mark` | `01-shell.html#radio` | 2 |
| Read-only row text | `.sp-panel-row.sp-panel-row--static` | `01-shell.html#panels` | 2 |
| Left filter panel | `.sp-left-panel`, `.sp-left-panel-host[data-open]`, `-header`, `-body`, `.sp-filter-group` / `-row`, `.sp-filter-item` (`-name`, `-count`), `.sp-left-nav`, `.sp-left-divider`, `.sp-left-panel-note` | `01-shell.html#left` | 2 |
| Checkbox group with per-group Clear + counts | `.sp-filter-group` + `.cds-checkbox` + `.cds-btn--ghost.cds-btn--sm` | `01-shell.html#left` | 2 |
| Narrow fallback (1024) | composition of the above | `01-shell.html#narrow` | 2 |
| Control row … roster rows (map) | *pending* | `02-map.html` | 3 |
| Side panel 480 · modals · narrow tearsheet · callout | *pending* | `03-panels-and-sheets.html` | 4 |
| Page header + tabs · table · structured list · radio · file trigger · count cards · readout · ghost done-state | *pending* | `04-forms-and-tables.html` | 4 |

---

## 3. Contrast

Script: `scripts/check_contrast.py` from the `ibm-design-language` skill, run once at the end of PR 1.
Surfaces checked: white, `layer-01`, `layer-hover-01` (the preset), plus — because this product has them —
the shell / dark-panel surface `#161616`, the hover surface `#333333`, the pressed surface `#393939` (gray
80, which is also the dark-theme `layer-selected` and footprint fill), the dark panel's raised row `#262626`,
and both themes' `highlight`.

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

Every mark on every surface it lands on: the four mode marks on `#161616` / `#333333` / `#393939`
(lowest: error ⊗ red 50 on pressed, 3.44:1; Draft ◇ orange 40 on pressed 4.69:1); shell text, secondary, helper, current-link bar (blue 50,
5.41), white focus; panel link (blue 40, 7.68) and error mark; the seat stroke gray 70 on white / `layer-01` /
`layer-hover-01` / `layer-selected` (lowest 5.92) and on both footprint fills; the dark-theme stroke gray 30
on `#161616` / `#262626` / `#333333` / `#393939` / footprint hover `#474747` (lowest 5.44); the Draft orange
on both themes' hover surfaces (light orange 60: 4.10; dark orange 40: 5.13); the search highlight pair in
both themes.

**PR 2 pairs (added to `product-pairs.json`, now 78 pairs) — summary line pasted verbatim:**

```
78/78 pass
```

Every new dark surface: tooltip gray 10 on gray 80 (10.50); switch selected gray 100 on gray 10 (16.45) and
unselected gray 10 on hover (11.49); tag gray 10 on gray 80 (10.50); ghost blue 40 on gray 100 (7.68), blue
30 on hover gray-90-hover (7.42) and on pressed gray 80 (6.78), blue 40 on the notification layer gray 90
(6.43); panel text and secondary on the layer and row-hover surfaces; radio ring gray 10 on gray 100 /
hover (16.45 / 11.49) and gray 100 on white; nav link gray 30 on gray 100 / hover (10.59 / 7.40); left
panel text, count and checkbox on `layer-hover-01` in both themes; the current-nav bar blue 60 on
`layer-selected` light (3.79) and blue 50 on dark (3.45) — the two lowest, both above 3:1.

**Measured, not gated (`contrast/surface-pairs-not-gated.json`, 6 pairs)** — dividers, a skeleton and a
hover step, none of which is a mark or text: shell rule gray 80 on `#161616` = 1.57:1 (a separator; Carbon's
own g100 `border-subtle` is the same pair), skeleton element on skeleton background = 1.26:1 (a
placeholder, deliberately quiet, Carbon's g100 values), panel row hover `#333333` on `#161616` = 1.43:1
(a hover step; the focus ring, not the fill, identifies the control); PR 2 adds the tag fill gray 80 on gray
100 (1.57 — the text carries it), the switch's unselected edge (1.57 — identity is the selected fill + text),
and the left panel's rule. The utility "outlined when open" state does not rely on the outline alone — the
open panel and `aria-expanded` carry it.

---

## 4. Carbon conformance — Phase 3 (TRUE / DIFFERS / NOT COVERED)

Next free deviation number: **16** (nothing ledgered in PR 1).

| Decision | Verdict | Skill text |
|---|---|---|
| Assets copied verbatim; product CSS is a semantic layer on top | TRUE | SKILL "copy them in rather than retyping"; token discipline |
| Tier C palette references for the invariant shell | NOT COVERED | tokens.md has no invariant-surface token; the asset's `.cds-header` sets the precedent. Reopens if v12 ships one |
| `data-theme` kept, Carbon attribute derived | NOT COVERED | asset documents `data-carbon-theme` only; app attribute is an owner ruling |
| Mode marks: ■ ◇ □ ⊗, shape + fill | TRUE | status-and-dataviz "two of colour, shape, symbol … in the mark itself" |
| Draft = orange 40 on the shell | TRUE | status palette: orange 40 "serious warning" outline grade on dark; 5.13:1 on hover |
| Pressed shell surface gray 80, lighter than hover; open trigger outlined with the bottom edge open | TRUE | tokens.md: dark themes step *up* on active; ui-shell.md: open trigger outlined, flowing into the panel |
| Seat states as symbols in a constant footprint | TRUE (deviation 3 already ledgered) | status-and-dataviz spatial-map clause |
| Marks 16px / strokes 2px / grays only | TRUE | status-and-dataviz sizing; SKILL "grays dominate" |
| `text-helper` replaced by `text-secondary` on hover rows | TRUE | tokens.md known traps — hover surface is the worst case |
| Focus 2px inset, white on Gray 100 | TRUE | SKILL non-negotiable; tokens.md "focus flips to white on dark" |
| Tag radius 12px on 24px, radius 0 elsewhere | TRUE | SKILL |
| Motion tokens only; skeleton sweep 3000ms linear | TRUE | asset precedent for the skeleton; design-engineering "never linear except progress" applies to interface motion, not a loading texture |
| Current-link bar blue 50 (theme token the asset didn't apply) | TRUE | tokens.md: `border-interactive` on g100 = 4589ff |
| Hamburger open = Close glyph, no persistent fill | TRUE | ui-shell.md: the outlined-open treatment is the right panel trigger's |
| Utility / mode indicator open = outlined, bottom flows into the panel | TRUE | ui-shell.md Right panel |
| Tooltip on gray 80, invariant | NOT COVERED | Carbon tooltips use `$background-inverse`; the invariant header needs a zone value. Reopens if a tooltip lands on a theme surface |
| Right panel 320, one width | TRUE | ui-shell.md "consistent width" — no number; D0-f Phase 3 confirmation |
| Mode switch = inverse-selected content switcher on g100 | TRUE | Carbon ContentSwitcher (g100 selected = `layer-selected-inverse`) |
| Viewers: no switch (Hidden, not disabled) | TRUE | SKILL disabled / read-only / hidden table |
| Ghost on dark = blue 40 / hover blue 30 / pressed gray 80 | TRUE | tokens.md g100 `link-primary` / `link-primary-hover`; active steps lighter |
| Dark notification: layer + 3px error border + ⊗, ghost Retry inside | TRUE | patterns: inline notification, task feedback; no filled primary inside a notification |
| Radio built from a native input with the checkbox's geometry | NOT COVERED | asset has no radio; Carbon's is 18px — 16 keeps the asset's checkbox parity. Reopens if the two sit side by side and read unequal |
| Event row 72 = 12 / 50 / 10 | NOT COVERED | three token line-heights sum to 50; neither 8px rhythm is reachable without a non-token line-height (§6 default) |
| Left panel pushes, no focus trap; Esc closes; counts text-secondary | TRUE | composition slide-in; tokens.md hover trap |

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

**Landing files (PR 2 scope).** `.sp-header`, `.sp-header-slot`, utilities + `.sp-tooltip` → `AppTopBar.tsx`
(the rail in `AppRail.tsx` retires — the shell is a top bar with a hamburger, D0); `.sp-panel` family +
`.sp-switch` + `.sp-radio` → new `components/ui/ShellPanels.tsx` (Help / History / Account), mounted once
by `AppShell.tsx`; `ThemeToggle.tsx` retires into the Account panel's radio; `.sp-left-panel` →
`FilterPanel.tsx` is **retired** and replaced by a shell-owned `LeftPanel.tsx` (filters + below-lg section
links) driven by `useAppShellNavigation`; `.sp-skeleton*` → `loading.tsx` skeletons for the panels. The
`--sp-chrome-*` names (`action`, `commit`, `danger-raised`, `heading`, `height`, `info`, `info-text`,
`label`, `scrim`, `value`, `wash`) retire: `--sp-chrome-height` → *`--sp-shell-header-h`*, `--sp-chrome-heading`
/ `-label` / `-value` → *`--sp-panel-dark-text`* / *`-text-secondary`* / *`-text`*, `--sp-chrome-info` /
`-info-text` → *`--sp-panel-dark-layer`* / *`-text`*, `--sp-chrome-scrim` → *`--sp-overlay`*, `--sp-chrome-action`
/ `-commit` / `-danger-raised` / `-wash` → retired (no raised or washed chrome surfaces remain).

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

## 6. Open for the owner (PR 2; defaults included)

1. **Event row rhythm.** 72px with token line-heights gives 12 / 50 / 10, not 12/48/12 or 16/40/16. Default:
   keep 12 / 50 / 10 (top edge on the grid, 2px asymmetry at the bottom, no non-token line-height).
2. **Radio 16px** (the asset's checkbox size) rather than Carbon's 18. Default: 16 — the two controls sit in
   the same panels and should share a size.
3. **Tooltip has no caret.** Carbon's has one; the square, caret-less box is the smaller deviation from
   "zero radius, no decoration". Default: no caret.
4. **Left-panel current nav item** uses a 3px `$border-interactive` bar + `layer-selected` (Carbon side nav).
   Below lg only. Default: yes.

Closed after PR 1: Ruled on #507: pressed shell = gray 80 and open = outlined (§1.3); theme attribute kept,
Carbon attribute derived (§1.2); seat marks ○ / lock / hatch with the assigned legend entry as a miniature
pill (§1.4).

---

## Slice log

| PR | Branch | Contents |
|---|---|---|
| 2 | `docs/phase3-shell` | `.sp-header` overrides, `.sp-header-slot`, `.sp-tooltip`, `.sp-panel` + zone-scoped variants, `.sp-switch`, `.sp-radio`, `.sp-left-panel`, `.sp-skeleton`; specimen `01-shell` (header ×3, hamburger ×7, utilities ×5, panels ×12, switch ×4, radio ×3, left panel ×7, narrow 1024); §1.7–1.13, §2, §3 (78/78), §4, §5; D0-f Phase 3 confirmation; PHASE2UX §3 ghost-on-dark row |
| 1 | #507 (`docs/phase3-tokens`) | assets copied; `sp-tokens.css`; `.sp-mode`, seat marks; specimens 00 + 05 + index + compare; §1.1–1.6, §2 (partial), §3, §4, §5 (partial). Owner rulings folded in before merge: pressed gray 80 + outlined open, theme decided, assigned legend = mini pill |
