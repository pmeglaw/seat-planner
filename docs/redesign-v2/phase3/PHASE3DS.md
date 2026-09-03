# Seat Planner redesign — Phase 3: UI design system

**Status: in progress — PR 1 merged v1.73.4; PR 2 merged v1.73.5; PR 3 merged v1.73.6; PR 4 (pages) open; PR 5 (close-out) next.** Inputs: `PHASE2UX.md` (§1 geometry, §2 states,
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
| `contrast/generate-pairs.mjs` → `*.json` | the pair generator (marks × the surfaces they land on) and its output, fed to `scripts/check_contrast.py` (§3) |

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
the control's `aria-label`, never interactive content. **No caret** (owner ruling on PR 2): 8px below a 48px
target leaves no ambiguity about the anchor, and a caret adds a shape nothing else in the system uses.
**Would change if** a tooltip is needed on a theme surface (then a theme-following variant, not this one).

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
gray-100-hover / gray 80 sweep. **Event rows** are 72px = 10 / 52 / 10: line 1 is `heading-01` (14/20 — a
heading over a 20px rhythm, not a compact label; owner ruling on PR 2), lines 2–3 `label-01` (12/16); 20 +
16 + 16 = 52 and the 10px pads are the symmetric remainder (`--sp-event-pad`, deliberately not a spacing
step). Measured in the rig at exactly 72 / 10 / 10. The first draft used `body-compact-01` (18) and landed
on 12 / 50 / 10 — asymmetric padding, the tell `taste.md` names; the fix was inside the type set. Show more is the ghost (an action), the cap
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
`span.sp-radio-mark` to beat the base rule — caught in the rig, §7). **16px, not Carbon's 18** — a product
decision: the radio shares 32px rows and panels with the asset's 16px checkbox, and one control size
outranks matching Carbon for one control (owner ruling on PR 2). No skill text states 18, so nothing is
ledgered. Never disabled: Theme is always available. **Would change if** a radio is needed on a `layer-01` surface in a modal (the halo colour would
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
current one (owner ruling on PR 2: 3px so the product has one current-mark thickness, header and panel
alike; blue 50 on `layer-selected` dark = 3.45:1 is the lowest passing pair in §3); empty / loading / partial / overflow / roster-floor states are the asset's empty state,
`.sp-skeleton-row`, and `.cds-notification--error` with ghost Retry, each scoped to the panel's padding;
slide-in fast-02 on one axis via `.sp-left-panel-host[data-open]`. **Trade-off.** Counts are 12px on a
14px row; they read as secondary by size and colour, which is the intent. **Would change if** the filter
set grows past three groups (then collapsible groups).

### 1.13 Skeleton line — `.sp-skeleton` (§3 "Skeleton rows · exists (needs a dark variant)")

The asset's skeleton is `td::after` — table cells only. Panels and lists need a bare 12px line with the
same sweep; `.sp-skeleton-row` (32px) and `.sp-skeleton-event` (72px, three lines) reserve the dimensions
of what they replace so nothing jumps. Dark variant by the `.sp-panel` scope.

### 1.14 Control row — Map → `.sp-control-row` (§3 "Control row (toolbar) · hand-built")

**Problem.** A 48px row of 40px controls that never reflows when the slot opens, carrying ONE primary
(Publish) and the editor's controls after a divider (D2-b). **Options.** The asset's `.cds-toolbar` is the
data-table toolbar (search + batch bar); wrong semantics. **Choice.** Flex row, 8px gaps and side padding,
1px × 24 divider; Publish is the only `.cds-btn--primary`; disabled Publish keeps its place and states the
reason in `label-01` beside it (`aria-describedby`), never only a tooltip; Undo / Redo are icon ghosts with
PR 2 tooltips; Add seat is a ghost whose label flips; Ask Planner is tertiary with the asset's
`[data-count]` badge; ⋯ is the asset's overflow with a disabled danger Discard. **Floor selector**
`.sp-menu-button`: a menu button on the field surface with a place marker and chevron, opening a
`.sp-menu` (the asset's overflow-menu geometry) whose current item takes the 3px bar + `layer-selected`.
**Names toggle** `.sp-toggle`: Carbon's small toggle (32×16 track, 12 knob), on = `--sp-status-success-mark`
(the hover-safe grade of Carbon's `$support-success` toggle colour), `aria-pressed`, state word beside it.
**"Filters · N" split control** `.sp-filters` (owner ruling): a tag is metadata, this is a control — a 40px
tertiary "Filters · N" that opens the left panel (the hamburger's target) plus a separate 40×40 Clear
filters icon button; one interactive element per control; Hidden at N = 0. `patterns.md`: a collapsed
filter shows its count and a way to clear without reopening. Not a deviation. **Would change if** the
row gains a second section that needs its own primary (then it is two toolbars).

### 1.15 Search field and palette — Map → `.sp-search`, `.sp-palette` (§3 "Search field with scope segment", "Search palette (560)")

**Problem.** Focused search (D1-d): an unlabelled field with a trailing scope segment, results in a
560px palette anchored to the field's left edge, both scope counts always shown. **Choice.** Field 40 on
the field surface with a leading icon, a `.sp-kbd` hint (24px, `code-01`) and the scope segment as a
button inside the field (1px left rule, `label-01`); a clear × replaces the hint while a query exists.
Palette: header = "Results · 7 on this floor · 11 in building" (the building count is the widen
affordance); rows 48 = title `body-compact-01` + subtitle `label-01`, kind as `.cds-tag--outline`, seat
code in `code-02` or a Floor tag; selected row = `layer-selected` + 3px bar; footer = the key legend.
States: browse (zones, then people seated-first) · results · zero with Widen · zero nowhere · loading
(only past 300ms) · error. **Platform-aware hint:** Ctrl K on Windows (the firm's machines), ⌘ K on Mac
— both rendered; detection is a Phase 4 obligation (§5). **Would change if** search gains a third scope.

### 1.16 Seat pill — Map → `.sp-pill` (§3 "Status marks"; DECISIONS §3.2.1, deviations 3, 7, 8)

**Problem.** The name marker: ≤ 28 tall, fit-width, one line, no truncation, the code on demand, and a
state set that survives grayscale on a raster. **Options.** Two-line pill with the code (the shipped 40px
— retired by §3.2.1); an inline code suffix on hover (rejected: widens the pill into its neighbours); a
4px tooltip variant (rejected: don't mint a variant).
**Choice.** Height = the 28 footprint (constant), `label-01` `First L.`, 8px pads, 1px `--sp-pill-edge`
on `layer-02`. **Code on hover / focus** via the tier-C tooltip at its 8px offset; selection shows the
code in the inspector eyebrow, so the tooltip is hover / focus only. States, each a distinct silhouette:
rest (1px edge) · hover (`layer-hover-02`) · focus (2px `$focus` inset) · selected (2px `border-inverse`)
· search hit (`highlight` fill + `support-info` edge) · quiet / filtered out (`layer-01`, subtle edge,
`text-secondary` — not helper, 4.10 on the hovered fill) · move origin (2px dashed) · move target (2px
`success` mark edge + subtle fill) · invalid target (`border-disabled`, `text-disabled`, not-allowed) ·
**changed in draft** = an 8px hollow ◇ in `--sp-status-draft-mark` at the top-right (the Draft family's
own shape; 3.83–7.35:1 on every fill it lands on, §3) with the inspector saying "Changed in draft" in
text so the badge is never the only carrier · **names off** = the assigned pill collapses to the filled
28 footprint (`--sp-icon-primary`) while empty seats keep their symbols, and **the legend follows the
toggle** (pill miniature when names are on, ● when off — PR 1's legend ruling amended). Every marker
carries the asset's 44px `.cds-touch-target` pseudo (deviation 7). **Move target / invalid target** share
one construction (owner ruling): a 2px edge + a subtle tint, in the success and the error family, and
differ by shape as well as colour — target solid, invalid dashed; both transient interaction states, so
"grays dominate" does not apply. Pairs for each edge on each tint in both themes are in §3. **Stroke
rule** (owner ruling, replacing two exceptions): strokes go below 2px only where a 2px stroke would
close the shape — the 8px hollow ◇ at 1.5px, **verified crisp at 1x and 3x in the rig** (`badge-1x.png`,
`badge-3x.png`); the 16px hatch, which the rule would also admit, stays at 2px because 2px proved
crisp at 3x and 1.5 straddled pixels at 1x. Rig lesson: the badge's fill and stroke are set on the
`<svg>` so they inherit into the `<use>`d symbol — a `path` selector cannot reach a use's shadow tree,
and the first render showed a filled diamond (§7). **Would change if** the marker pitch changes (a new
plan) or a state is added past the five-indicator budget.

### 1.17 Right slot and inspector — Map → `.sp-slot`, commit bar, combobox, text area (§3 rows "Seat inspector side panel, 400", "Combobox", "text area", "Danger button")

**Problem.** One 400px slot (deviation 15) with three owners; the inspector reads in Published and edits
in Draft, with a commit bar and a form the asset only partly supplies. **Options.** `.cds-side-panel`
(480, `layer-02`, slide-over with footer) — wrong width and it traps focus; the slot pushes and doesn't.
**Choice.** `.sp-slot` on `layer-01` with a 1px left rule, header (eyebrow `label-01` · title `heading-03`
sized for ≤ 22 characters inside 368 · legend row · Copy link + × icon buttons), scrolling body, and a
64px commit bar that bleeds: Cancel ghost · primary (Save draft changes / Assign employee; Saving…).
**Two primaries in view** — Publish in the row and Save here — are acceptable because a side panel is its
own container (the same reasoning covers the drawer's Ask; both §3 rows say so). Form pieces the asset
lacks: `.sp-combobox` (text input + `.sp-listbox` 40px rows with meta, a Create row, and the "Create new
employee on save" tag + helper); `.sp-textarea` (80 min, the field surface, vertical resize; a counter
line for the AI drawer); `.sp-actions` ghost row Move · Swap · Vacate; **Delete seat** = `.cds-btn--danger-ghost`,
shown only for `is_custom` seats — original seats show no Delete at all (Hidden, never disabled; the
seatProtection rule) — with the block reason as helper text outside the button. Contact rows 48 with a
label column and an icon action. Status select is Hidden while a person is assigned. **Mode card**
`.sp-mode-card`: eyebrow · title · body-01 message · ghost exit · Esc note; the cancel message is an
info notification. The Move / Swap confirm is the asset's modal and may open over the inspector (a side
panel is not a modal) — never from inside the tearsheet. **Would change if** the inspector gains a
second step (then a tearsheet, not a longer panel).

### 1.18 Ask Planner — Map → `.sp-ai-label`, `.sp-ai-popover`, `.sp-textarea--ai`, drawer parts (§3 "Ask Planner drawer · Carbon-for-AI label")

**Problem.** The one AI surface must be marked as AI and explain itself (`carbon-next.md`: the AI label
is both the marker and the entry point to explainability) without a "magic" treatment. **Options.** A
sparkle icon; the full Carbon-for-AI set (label, aura, gradient fields); the label + border only.
**Choice (owner ruling).** Label text and border-start/end only — no aura ("grays dominate"). Because
the asset predates Carbon for AI, `--sp-ai-border-end` is a palette reference (blue 40) — **the second
tier-C exception**, recorded; `--sp-ai-label-text` is `$link-primary` and `--sp-ai-border-start`
`$border-interactive`, so both follow the theme. The gradient appears on exactly two things: the 24px
"AI" label (a button opening the explainability popover: what it reads, what it never changes, a link to
the Help panel) and the textarea's 1px border. Label hover text steps to blue 70 (blue 60 is 4.08 on the
hovered fill — caught by the pair run). Drawer: subline, dirty banner (warning notification), suggested
prompts as stacked ghosts, textarea 800 with a counter and the Ctrl+Enter hint, Ask as the drawer's own
primary in the commit bar, empty / loading ("Checking saved draft map data") / answer + highlighted-seat
list / **one error notification, seven strings** (the six named errors + the fallback; each ends in the
next step — Try again · Ask something shorter · Ask the office manager; `role="alert"` only for the
five that stop the task, `role="status"` for question-too-long and the fallback; owner ruling) /
broad-answer info note / Clear highlights. **Would change if** Carbon ships AI tokens in the asset (then the palette reference
retires).

### 1.19 Publish review — Map → `.sp-tearsheet` wide (§3 "Wide tearsheet (publish review) · hand-built")

**Problem.** A review of a 68-row diff plus people details, with one decision at the end — too large
for a dialog (SKILL). **Options.** Modal (rejected: large data); full page (rejected: the map behind is
the context). **Choice.** Anchored bottom below the visible header, overlay dims the page, **no ×**
(Cancel is the exit — the frame invariant); rail 256 carries the readiness summary (the wide rail
otherwise holds a progress indicator; a single step has none, PHASE2UX §4), the body a `.cds-table`
with **group rows** (`tr.sp-table-group`, `layer-accent`) per floor and a People details list, the
footer 64 with facts left and Cancel · Publish right. States: ready · no changes (empty state + disabled
primary "No changes to publish") · submitting (info notification, Cancel disabled, "Publishing…") ·
failure (error notification + Retry publish, review intact) · PUBLISH_BLOCKED (the sheet closes; the
server text lands as an error notification in the canvas status region). Nothing in the flow chains
into a second modal. `.sp-table-group` is shared with PR 4's Management tables. **Would change if** the
review gains steps (then the rail is a progress indicator).

### 1.20 Roster — Map → `.sp-roster` (§3 "Roster region + static rows")

Heading `heading-03`, helper line, department groups (`heading-compact-01` + count), 40px **static** rows
name · position · ext · email + a copy-link icon button with tooltip and an in-place "Copied" done-state.
The row is not interactive: hover lives on the button only (owner ruling; a hovering row would promise a
row action that does not exist — deviation 9). A `?q=` landing highlights the matched row with the
search surface + 3px mark. Empty / filtered-empty / loading / error states each name the next step.

### 1.21 Status band and canvas — Map → `.sp-band`, `.sp-canvas`

Band 40 on `layer-01` with a top rule: title · legend (PR 1 marks, following the Names toggle) · count
(zero included, with Clear filters and the cross-floor hint) · zoom/fit as 32px controls; the read-only
line "Editing needs a wider window." and the title-only roster variant. Canvas: the mat behind the plan,
a status region (`role="status"`, top-left) for inline notifications — the MLS02 stale-draft refresh
(inline and self-clearing, not a toast: it happened *to* the user), PUBLISH_BLOCKED, partial-load — and
the empty states over the plan (published-empty in the viewer's and the admin's voice, draft-empty),
skeleton plan, error + Retry, the 403 card. One narrow (1024) read-only frame.

### 1.22 Page frame and tabs — Management / Settings / Reception → `.sp-page`, `.sp-tabs` (§3 "Page header (title + subtitle, no action) · exists", "Page header with tabs + one primary · tabs hand-built")

**Problem.** Three pages share one frame (32 padding, live area 1584) and one header shape; Management adds
tabs and a primary that follows the tab, the other two have no primary at all. The asset has the page header
and no tabs.
**Options.** (a) Contained tabs at 48 (the tab row is the toolbar's height); (b) line tabs at 40 with a 2px
bar; (c) line styling at contained height. **Choice.** (b) — Carbon's line tabs are 40; 48 is the contained
variant's height, and mixing the two is the half-measure the taste rubric catches (owner ruling, PR 4).
Selected = `heading-compact-01` + a 2px `$border-interactive` bar; others `body-compact-01` text-secondary;
hover = text-primary + a 2px `border-strong` bar; focus the 2px inset ring; a 1px rule under the list. The
strip is sticky under the header (`top: --sp-shell-header-h`), painted `background` so the table scrolls
under it. The page primary is a 40px control — every control in the product is 40 (§0 ladder comment); a
48 button beside a `heading-04` would be the one 48 control outside the shell.
**Trade-off.** A 2px bar is thinner than the shell's 3px current bars — one family (blue, bottom or left),
two weights: the shell mark is the heavier because it sits on Gray 100. **Would change if** Phase 4 puts a
tab row on Gray 100 (then 3px).

### 1.23 Management table — `.sp-table` on the asset `.cds-table` (§3 "Data table, sortable, kebab per row · exists", "Toolbar with search + live count · exists")

**Problem.** The asset rows are 32 and the header 32; Phase 2 asks for a 40 header, ● / ○ status, a mono
seat link, a per-row action. **Choice.** Header 40 (`--sp-table-header-h`), rows stay 32 (the table is the
scanning zone). Status = the **seat vocabulary**: ● Assigned (filled, `icon-primary`) / ○ Unassigned
(2px ring, `icon-secondary`), 16px with the label beside — not ■ / □, which are the mode marks; one shape
must not carry two meanings across the product (owner ruling). The set survives grayscale (rendered).
Seat = `code-02` link that steps to `link-primary-hover` on the hovered row (`--sp-table-link-on-hover-row`)
— blue 60 measures 4.08 on `layer-hover-01`, the **third hover-surface trap** (§3). **One row action**
(Edit) = a 40×32 ghost icon button with the tier-C tooltip; an overflow menu holding one item is a tell, so
a kebab appears only once a row carries two or more actions — Deactivate lives in the side panel, so today
there are none (owner ruling). Toolbar: the asset's, search 320, count `aria-live` with zero included; the
saved-status banner is an inline `role="status"` notification under the toolbar. Narrow: the table scrolls
inside `.sp-table-scroll`, never the page.
**Trade-off.** The tooltip on the last column would leave the table on the right; it is right-anchored there.

### 1.24 Side panel 480 slide-over — `.sp-side-panel-host` on the asset `.cds-side-panel` (§3 "Side panel 480, slide-over (focus-trapped) · partial")

**Problem.** The asset panel slides *in* beside the page with no overlay; Management's form is a task with
more than five fields that must keep the table behind for reference — a slide-**over** with a scrim
(composition.md). **Choice.** The asset's catch element becomes the scrim (`--sp-scrim` = `overlay`); the
panel is `layer-02` with a 1px left rule, `role="dialog"`, focus-trapped, Esc asks when dirty. Header
`heading-03` + the one helper line ("Changes reach the map and Reception at the next publish."); body =
the form (Name is the one field marked — required is the minority), the read-only **fact row** ("Draft seat ·
NE04 · Floor 3 · Open on the map" — a `dl` with a 32px ghost, not a disabled field), and the **danger zone**:
Deactivate… as a danger ghost above the footer with its block reason as helper text. Footer 64 keeps the
asset's **50/50 bleed** (Cancel secondary · primary): that is the side panel's own footer, the modal shares
it, and the tearsheet does not (§1.28) — containers read apart by their footers alone. No ×.
The confirm modal (asset `.cds-modal`, z 8500) opens **on top of** the open panel (z 7001): a modal over a
side panel is allowed; a modal over a modal is not. States: saving (primary `aria-busy`, fields read-only,
never disabled), server error (inline notification above the form, ghost Retry inside), deactivate refused
(inline error at the danger zone with the map link), dirty-close ask.
**Danger ghost on dark surfaces.** The asset paints `.cds-btn--danger-ghost` `button-danger-primary` (red
60) — 2.3:1 on the dark `layer-02` (this panel) and 3.0:1 on the dark `layer-01` (the PR 3 inspector).
Carbon's own token for it is `$button-danger-secondary`, which equals `$text-error` in both themes (red 60
light, red 40 g100); the asset lacks the name, so `--sp-button-danger-ghost-text` aliases `text-error` and
the product overrides the asset class (and the overflow menu's danger item) globally. Hover stays the
filled danger surface. 4.87 / 6.38 dark, 5.00 / 4.55 light (§3).

### 1.25 Structured list with inline rename — `.sp-list` (§3 "Structured list with inline rename · none needed")

48px rows: name · count (text-secondary, tabular, 96) · ghost Rename · ⋯ overflow holding Delete (danger) —
two actions per row, so the overflow is earned here. Rename swaps the name for a 40px field + Save
(primary 40) · Cancel (ghost); Enter saves, Esc cancels; a duplicate name is invalid on blur with the
primary disabled. A department people carry that the list lacks shows the `outline` tag "Not in list" and
a tertiary Add to list in the action column. Empty state per list.

### 1.26 Callout — `.sp-callout` (§3 "Callout (non-dismissible, no status) · partial .cds-notification")

Guidance read before acting (patterns.md): loads with the page, never dismissed, never triggered. Hand-built
on the notification's geometry — `layer-01`, a 3px **gray** (`border-strong`) edge, body-01 — with no icon,
no close and no status colour. The edge measures 3.02 / 3.01 (§3): gated as a graphic, on the floor.
**Would change if** the callout ever carries a status; then it is a notification.

### 1.27 Settings sections and the file trigger — `.sp-settings`, `.sp-section` (§3 "Section with one primary + file line · exists")

Column 776, left-aligned; callout first; 48 between sections. Section = `heading-03` · helper body-01 ·
action row (40px buttons, 8 gaps) · `label-01` file line. The **file trigger** is a button + a hidden input
with the same name; the label states type and limit up front ("Import CSV · .csv up to 5 MB"). Every
unhappy path (wrong type, too large with the size named, empty, missing columns) is an inline error under
the section *before* any tearsheet opens; MLS02 is a `status`; success is an inline `status` with the map
link. Busy: the primary keeps its label with `aria-busy`, the tertiary beside it is disabled for the
transaction, and a progress line with an sr-only "Working…" replaces the file line.

### 1.28 Narrow tearsheet 720 — `.sp-tearsheet--narrow` (§3 "Narrow tearsheet · hand-built"); count cards; consequences; ghost done-state

Centred, top 112 under the header, no rail; body scrolls; **footer 64 with right-aligned buttons** (Cancel
secondary · primary 224 min) — tearsheet footers align right, modal and side-panel footers bleed 50/50
(owner ruling; PHASE2UX §1S.3 and §3 amended). No ×. **Count cards** (`.sp-count-card`): `layer-01`,
`heading-03` tabular numeral, `label-01` label, five across inside the 656 inner width (`--sp-count-card-min-w`
112) — a reading surface, not a tile (D5-d): no border, no hover, no link. Consequence line (CSV) or
consequences list (restore), one line each. The row list scrolls inside the body (256 = eight 32px rows);
in the blocked state an `alert` notification sits above it, the blocked rows carry the error family's 3px
edge and tint, and the primary is disabled with its reason in a line above the footer. The **ghost with
a done-state** ("Export the current draft first" → "✓ Exported 14:02") swaps its label for the outcome,
takes text-secondary with a success-mark check, and stays a button — never disabled. Applying: primary
`aria-busy`, Cancel disabled for the transaction.

### 1.29 Reception — `.sp-recep` family (§3 "Search input lg with clear ×", "Listbox rows", "Readout tile with display numeral", "Row-buttons", "Error boundary card"); route cards

Two zones. **List (dense):** search `lg` — the asset field at 48 with a leading glyph, a 40 clear × once
typed, the platform hint (Ctrl K / ⌘ K — Phase 4 obligation from PR 3), unlabelled (the placeholder is the
label; "never label a search field"), autofocus. 32px header row with the live count (zero included) and
"Ext". 48px rows: name `heading-compact-01` + meta `label-01` (position · department); **seat code as
plain `code-01` text-secondary** — no chip (it would be the only rounded shape in the row and Management
renders the seat as mono text), not a link (the row's map action is Show on map); a Floor 2 tag where the
floor differs; extension right-aligned tabular 96 with "—" for none. Highlighted (keyboard cursor) = hover
surface + 3px bar; locked (↵) = selected surface + bar; meta on both steps to `text-helper-on-row`. **No
avatar** (owner ruling): a 32px initials disc is decoration and a circle is a radius the system does not
have; name + meta carry the row, and the seat column already gives the scan rhythm.
**Readout (calm):** sticky 480 column, 32 padding, a 1px left rule: `heading-03` name · role · the tile
(`layer-01`, `label-01` eyebrow, **`heading-06` Light 300 at 42/50 tabular**, the ↵ / Esc hint) · seat
line with the pin glyph · "If no answer — same department" with up to three 40px full-width ghost
row-buttons (name left, extension right) · Show on map (ghost) · Recent lookups (`heading-compact-01`,
up to four 40px ghost rows). "No extension on file" is body-01 in the tile; partial = "Seat unknown right
now — the map is still loading."
**Numeral weight.** Rendered at 1× and at 50% (the arm's-length proxy) beside 400: at 50% the 300 numeral
keeps distinct strokes and counters (the crops read "214" without effort), so **300 ships** — a bolder 42px
numeral is the dashboard-number tell; 400 is the only fallback if a real desk reading disagrees, never 600.
States: first run ("Waiting for a call"), zero (count says 0, ghost Clear search), empty directory, loading
(six skeleton rows under the header), error boundary card (Try again tertiary · Open the seat map ghost ·
`code-01` digest). Route cards for the admin pages: 403 and "This admin page could not load" on the asset
empty state with a digest line. Narrow 1024: one column, readout below the list with Back to the list.

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
| Control row (toolbar) · divider · result count · disabled-Publish reason | `.sp-control-row`, `.sp-control-divider`, `.sp-control-count`, `.sp-control-reason` | `02-map.html#row` | 3 |
| Floor selector (menu button + menu) | `.sp-menu-button` (+`.sp-chevron`, `-label`), `.sp-menu` (+`.sp-menu-meta`) | `02-map.html#row` | 3 |
| Search field with scope segment · keyboard hint · clear | `.sp-search`, `.sp-search-scope`, `.sp-search-clear`, `.sp-kbd` | `02-map.html#search` | 3 |
| Search palette (560) | `.sp-palette`, `-header`, `-group`, `-list` > `.sp-palette-row` (`-title`, `-sub`, `-code`), `-footer`, `-empty`, `-loading` | `02-map.html#search` | 3 |
| Filters split control "Filters · N" + Clear filters | `.sp-filters` > `.cds-btn--tertiary` + `.cds-btn--icon` | `02-map.html#row` | 3 |
| Ghost / tertiary / primary / icon buttons in the row · Ask Planner count badge | asset `.cds-btn` set; `.cds-btn--tertiary[data-count]` | `02-map.html#row` | 3 |
| Toggle (Names) | `.sp-toggle` (+`.sp-toggle-track`, `-state`) | `02-map.html#row` | 3 |
| Overflow menu ⋯ with danger item | asset `.cds-overflow` / `.cds-overflow-menu` / `.cds-danger` | `02-map.html#row` | 3 |
| Seat pill (name marker) and states · ◇ changed-in-draft · names-off · 44px hit | `.sp-pill` (+`--search`, `--quiet`, `--origin`, `--target`, `--invalid`, `--names-off`), `.sp-pill-badge`, `.cds-touch-target` | `02-map.html#pill` | 3 |
| Seat inspector side panel (400) · commit bar · contact rows | `.sp-slot`, `.sp-slot-host[data-open]`, `-header`, `-eyebrow`, `-title`, `-actions`, `-body`, `-section`, `.sp-commit-bar`, `.sp-contact-row`, `.sp-person-role`, `.sp-draft-note` | `02-map.html#slot` | 3 |
| Combobox (employee name; inline create) | `.sp-combobox` > `.cds-text-input[role=combobox]` + `.sp-listbox` (`.sp-listbox-create`, `-meta`), `.sp-create-note` | `02-map.html#slot` | 3 |
| Select · text input · text area · counter | asset `.cds-select`, `.cds-text-input`; `.sp-textarea`, `.sp-field-counter` | `02-map.html#slot` | 3 |
| Actions row · Danger button (Delete seat, custom only) · block reason | `.sp-actions`, `.cds-btn--danger-ghost`, `.sp-block-reason` | `02-map.html#slot` | 3 |
| Modal (Move / Swap / Delete confirms) | asset `.cds-modal` | `02-map.html#slot` | 3 |
| Mode card | `.sp-mode-card` (+`-title`, `.sp-esc-note`) | `02-map.html#slot` | 3 |
| Ask Planner drawer · AI label · explainability popover · AI textarea | `.sp-ai-label`, `.sp-ai-popover-host[data-open]` > `.sp-ai-popover`, `.sp-textarea--ai`, `.sp-drawer-subline`, `.sp-prompt-list`, `.sp-answer`, `.sp-highlight-list`, `.sp-drawer-loading` | `02-map.html#slot` | 3 |
| Wide tearsheet (publish review) · readiness rail · group rows | `.sp-tearsheet-host[data-open]` > `.sp-tearsheet-overlay` + `.sp-tearsheet` (`-header`, `-body`, `-rail`, `-main`, `-footer`, `-facts`, `-section`), `.sp-readiness` (+`-title`, `-facts`), `.sp-rail-heading` / `-text`, `.sp-detail-list`, `tr.sp-table-group` | `02-map.html#review` | 3 |
| Data table (publish review) with floor eyebrow rows | asset `.cds-table` + `tr.sp-table-group` | `02-map.html#review` | 3 |
| Roster region + static rows · copy-link button with done-state | `.sp-roster`, `-helper`, `-group` (+`-count`), `-list` > `.sp-roster-row[data-highlight]` (`-meta`), `.cds-btn--icon[data-done]` | `02-map.html#roster` | 3 |
| Status band (legend · counts · zoom/fit) | `.sp-band`, `-title`, `-legend`, `-count`, `-zoom`, `-note` | `02-map.html#band` | 3 |
| Canvas states · status region · empty / skeleton | `.sp-canvas` (+`--skeleton`), `.sp-canvas-plan`, `.sp-canvas-status[role=status]`, `.sp-canvas-empty`, `.sp-marker` | `02-map.html#canvas` | 3 |
| 403 card | asset `.cds-empty` + one tertiary | `02-map.html#canvas` | 3 |
| Narrow fallback (1024, read-only) | composition of the above | `02-map.html#narrow` | 3 |
| Page header (title + subtitle, no action) · with tabs + one primary | `.sp-page` + asset `.cds-page-header`, `.sp-page-actions`; `.sp-tabs-host` > `.sp-tabs[role=tablist]` > `.sp-tab[aria-selected]` (+`.sp-tab-count`) | `04-forms-and-tables.html#header` | 4 |
| Toolbar with search + live count · inline saved status | asset `.cds-toolbar.sp-toolbar`, `.cds-toolbar-count[aria-live]`, `.sp-search-clear`; `.cds-notification--success[role=status]` | `04-forms-and-tables.html#table` | 4 |
| Data table, sortable, one row action (no kebab until two actions) · ● ○ status · mono seat link | `.sp-table` + asset `.cds-table` / `.cds-sort`, `.sp-table-scroll`, `.sp-col-seat` / `.sp-col-ext`, `.sp-seat-link`, `.sp-seat-legend` + `.sp-seat-mark--assigned` / ring, `.cds-col-actions` + `.sp-has-tooltip` | `04-forms-and-tables.html#table` | 4 |
| Table states: grayscale · zero search · loading · empty | asset `.cds-skeleton-row`, `.cds-empty` | `04-forms-and-tables.html#table` | 4 |
| Side panel 480, slide-over (focus-trapped) + scrim · fact row · danger zone | `.sp-side-panel-host[data-panel=open]` > asset `.cds-side-panel-catch` (scrim) + `.cds-side-panel[role=dialog]`, `.sp-fact-row`, `.sp-danger-zone`, `.sp-required-note` | `03-panels-and-sheets.html#side-panel` | 4 |
| Combobox (department; managed list + free text) | PR 3 `.sp-combobox` + `.sp-listbox` (`.sp-listbox-create`) | `03-panels-and-sheets.html#side-panel` | 4 |
| Confirm modal over a side panel · dirty-close · one-field create modal · delete confirm | asset `.cds-modal` (+`--danger` primary, `role=alertdialog`) | `03-panels-and-sheets.html#confirm` | 4 |
| Structured list with inline rename · Tag "Not in list" | `.sp-list-header`, `.sp-list` > `.sp-list-row` (`-name`, `-count`; `--editing`), asset `.cds-overflow` + `.cds-danger`, `.cds-tag--outline` | `04-forms-and-tables.html#list` | 4 |
| Danger ghost on every surface (asset override) | `.cds-btn--danger-ghost`, `.cds-overflow-menu .cds-danger` → `--sp-button-danger-ghost-text` | `03-panels-and-sheets.html#side-panel`, `04-forms-and-tables.html#list` | 4 |
| Callout (non-dismissible, no status) | `.sp-callout` | `03-panels-and-sheets.html#callout`, `04-forms-and-tables.html#settings` | 4 |
| Section with one primary + file line · file trigger · busy | `.sp-settings`, `.sp-section` (`-helper`), `.sp-action-row`, `.sp-file-line`, `.sp-progress-line`, `.cds-btn[aria-busy]` | `04-forms-and-tables.html#settings` | 4 |
| Inline status / error under a section | asset `.cds-notification` (`--error[role=alert]`, `[role=status]`, `--success[role=status]`) | `04-forms-and-tables.html#settings` | 4 |
| Narrow tearsheet (CSV review · snapshot restore) · blocked · applying | `.sp-tearsheet.sp-tearsheet--narrow` (+`--static`), `.sp-tearsheet-reason`, `.sp-consequence`, `.sp-consequence-list`, `.sp-row-list` (`li[data-blocked]`, `.sp-row-meta`) | `03-panels-and-sheets.html#tearsheet` | 4 |
| Count cards | `.sp-count-cards` > `.sp-count-card` (`.sp-count-numeral`, `.sp-count-label`) | `03-panels-and-sheets.html#tearsheet`, `04-forms-and-tables.html#settings` | 4 |
| Ghost button with in-place done-state | `.cds-btn--ghost[data-done]` | `03-panels-and-sheets.html#tearsheet`, `04-forms-and-tables.html#settings` | 4 |
| Search input `lg` with clear × · platform hint | `.sp-search-lg` > asset `.cds-text-input` + `.sp-search-trailing` (`.sp-kbd`, `.sp-search-clear`) | `04-forms-and-tables.html#reception` | 4 |
| Listbox rows (Reception) · highlighted · locked · Floor tag · no seat / no extension | `.sp-recep`, `.sp-recep-list`, `.sp-recep-header` (`.sp-recep-count[aria-live]`, `.sp-recep-ext-head`), `.sp-recep-rows[role=listbox]` > `.sp-recep-row[role=option]` (`-name`, `-meta`, `-seat`, `-ext`; `[data-highlight]`, `[aria-selected=true]`) | `04-forms-and-tables.html#reception` | 4 |
| Readout tile with display numeral · seat line · hints | `.sp-recep-readout[aria-live]`, `.sp-recep-role`, `.sp-readout` (`-eyebrow`, `-numeral`, `-hint`, `-none`), `.sp-recep-seatline` (`.sp-seat-code`, `.sp-recep-partial`) | `04-forms-and-tables.html#reception` | 4 |
| Row-buttons (same-department fallback) · Recent lookups | `.sp-recep-fallback` > `.sp-row-buttons` > `.cds-btn--ghost` (`.sp-row-button-ext`); `.sp-recep-recent` | `04-forms-and-tables.html#reception` | 4 |
| Reception states: first run · zero · empty · loading · error boundary | `.sp-recep-waiting`, asset `.cds-empty`, `.sp-recep-skeleton-row` + `.sp-skeleton`, `.sp-route-card` + `.sp-digest` | `04-forms-and-tables.html#reception` | 4 |
| 403 card · route error card (admin pages) | `.sp-route-card` > asset `.cds-empty` + `.sp-digest` | `04-forms-and-tables.html#route` | 4 |
| Radio group (reference) | PR 2 `.sp-radio-group` — unchanged | `01-shell.html#radio` | 2 |
| Narrow fallback (1024): table scrolls in its container · Reception one column · tearsheet full width − 32 | composition of the above | `04-forms-and-tables.html#narrow`, `03-panels-and-sheets.html#narrow` | 4 |

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

**Pairs are generated, not hand-appended (from PR 3).** One command regenerates both files and the
checker gates the first:

```
node docs/redesign-v2/phase3/contrast/generate-pairs.mjs
python <skill>/scripts/check_contrast.py --pairs docs/redesign-v2/phase3/contrast/product-pairs.json
```

`generate-pairs.mjs` lists every drawn mark with the surfaces it actually lands on — rest, hover,
pressed, selected, highlight — per zone (shell, dark panel) and per theme. **Summary line pasted verbatim:**

```
product-pairs.json: 170 pairs · surface-pairs-not-gated.json: 9 pairs
170/170 pass
```

PR 3 additions: the seat-pill fills (rest / hover / search highlight) under the ◇ badge orange 60 (3.83 on
the light highlight is the lowest) and orange 40; the move-target edge and toggle-on green 60 / green 40
on white, layer-01, hover and the success-subtle fill (4.09 lowest); the search edge blue 70 / blue 50;
the AI label text blue 60 / blue 40 and its hover step blue 70 (blue 60 measured 4.08 on `layer-hover-01`
and was fixed by the token, not the surface — **the second hover-surface trap after helper-on-row,
§1.6: any blue-60 text that sits on something that hovers steps to blue 70, exactly as the asset's ghost
button does; Phase 4 will meet this shape again on every hoverable row with a link in it**); the
invalid-target edge red 60 on the error-subtle tint (light) and red 50 on `layer-01` (dark), the target
and invalid labels text-primary on both tints; the AI border start blue 60 / blue 50 on the field; white
on the primary. **Measured, not gated (9):** the PR 1–2 dividers and steps plus the AI gradient's low
stop (blue 40 — Carbon's own light `ai-border-start`; the label carries the meaning), the left-panel rule
and the quiet pill's edge (quiet is the intent).

**PR 4 (pages) — regenerated, summary line pasted verbatim:**

```
product-pairs.json: 194 pairs · surface-pairs-not-gated.json: 11 pairs
194/194 pass
```

The 24 new pairs are the surfaces the owner asked for and the ones the build added: the count cards and
the readout tile (`layer-01` under text-primary 16.45 / 13.76 and text-secondary 7.10 / 8.86); the Reception
highlighted row's 3px bar (blue 60 on `layer-hover-01` 4.08; blue 50 on `#333333` 3.78) and the locked row's
meta (gray 70 on `layer-selected` 5.92; gray 30 on `#393939` 6.76); the sticky tab strip's text on the page
background and the tab hover bar (gray 50 on white 3.32; gray 60 on `#161616` 3.60); the callout's gray edge
(3.02 / 3.01 — on the floor, gated as a graphic); the seat link on the `layer-01` table row (blue 60 = 4.55)
and its hover step (blue 70 on `layer-hover-01` 6.36) — **the third hover-surface trap** after helper-on-row
and the AI label: the link on a row that hovers steps to `link-primary-hover`, exactly as §3 predicted for
Phase 4; white on the danger primary (5.00). **One asset failure found and fixed by token:** the asset's
danger ghost text is `button-danger-primary` (red 60), 2.3:1 on the dark `layer-02` (side panel) and 3.0:1 on
the dark `layer-01` (the PR 3 inspector, which had not been gated as text). `--sp-button-danger-ghost-text`
aliases `text-error` — Carbon's `$button-danger-secondary` value in both themes (red 60 / red 40) — and the
product overrides the asset class: 5.00 / 4.55 light, 4.87 / 6.38 dark. The failing value is kept in the
not-gated file as a record. Also not gated: the scrim (a dimming layer, not a mark).

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
`layer-selected` light (3.79) and blue 50 on dark (3.45) — **the lowest passing pair in the set**, above the
3:1 non-text floor; it is the below-lg nav mark only.

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
| Radio 16px, the asset checkbox's size | NOT COVERED — product decision | no skill text states a radio size; the checkbox in the same rows is 16 |
| Event row 72 = 10 / 52 / 10 with heading-01 | TRUE | every line-height a type token; symmetric padding (taste.md) |
| Tooltip without caret | NOT COVERED — product decision | 8px below a 48px target; no other shape in the system |
| Left panel pushes, no focus trap; Esc closes; counts text-secondary | TRUE | composition slide-in; tokens.md hover trap |
| Filters as a 40px split control, not a tag | TRUE | patterns.md collapsed filter: count + clear without reopening; a tag is metadata |
| Disabled Publish keeps its place with the reason beside it | TRUE | patterns Disabled: pair with an inline explanation |
| Two primaries in view (row + side panel / drawer) | TRUE | SKILL one primary per section; a side panel / drawer is its own container |
| Seat code via the tier-C tooltip, hover / focus only | TRUE | SKILL details on demand; design-engineering: tooltips never carry interactive content |
| ◇ changed-in-draft badge + "Changed in draft" text | TRUE | status-and-dataviz: colour + shape in the mark; the label is the third signal |
| Names-off legend follows the toggle | TRUE | status-and-dataviz: label what the chart draws |
| Carbon for AI: label + border only, no aura | TRUE (carbon-next) / NOT COVERED (tokens) | carbon-next: use the AI label; asset has no AI tokens → tier-C exception 2 |
| Delete seat Hidden for original seats | TRUE | SKILL hidden table: the user lacks permission to act; seatProtection |
| Tearsheet: no ×, Cancel exits; no nested modal | TRUE | composition: containers omit the close X; modals never nest |
| MLS02 as an inline status notification, self-clearing | TRUE | patterns Notifications: task-generated → inline; toasts are for system messages the user caused |
| Roster rows static; hover on the button only | TRUE | deviation 9; taste.md: a row that hovers promises an action |
| Platform-aware ⌘K / Ctrl K hint | NOT COVERED | Phase 4 detects the platform (§5) |
| Line tabs, 40 tall, 2px bar; sticky | TRUE | Carbon line tabs are 40 (contained are 48); taste.md: no half-measures |
| Page primary at 40, not 48 | NOT COVERED — product decision | the ladder comment: every control 40; the shell holds the only 48 controls |
| Table header 40, rows 32 | TRUE | asset comment: compact rows where the user scans |
| Status ● / ○ = the seat vocabulary, never ■ / □ | TRUE | status-and-dataviz: one shape, one meaning; grayscale-safe |
| One row action as a ghost icon + tooltip; kebab only at two or more | TRUE | taste.md tells: an overflow holding one item |
| Seat link steps to link-hover on the hovered row | TRUE | tokens.md hover trap; the asset's ghost does the same |
| Side panel as a slide-over with a scrim | TRUE | composition.md: >5 fields, keep the reference behind; the asset's slide-in is the no-reference case |
| Side panel / modal footers 50/50; tearsheet footer right-aligned | TRUE | composition.md container guide; asset footers |
| Modal on top of the open side panel | TRUE | SKILL: never nest modals — a side panel is not a modal |
| Danger ghost text = `text-error` (asset override) | TRUE | Carbon `$button-danger-secondary` = `$text-error`; tokens.md dark ladder |
| Deactivate = danger ghost above the footer, moderate-impact confirm (no typed name) | TRUE | SKILL destructive actions: moderate → spell out consequences |
| Callout: layer + gray 3px edge, no icon / close / status | TRUE | patterns.md Callout: read before acting, never dismissible, no status |
| File trigger label states type and limit; unhappy paths inline before the sheet | TRUE | patterns.md forms: state constraints up front; inline notification for task feedback |
| Count cards: layer-01, no border, no hover | NOT COVERED — product decision | D5-d retired tiles; a reading surface, not a tile |
| Readout numeral `heading-06` Light 300 | TRUE (verified at 50%) | SKILL type table: display sizes get lighter |
| No avatar in Reception rows | TRUE | SKILL: grays dominate; zero radius except tags |
| Seat code as plain mono text, not a tag, not a link | TRUE | tags are metadata (patterns.md); one map action per row |
| Search `lg` unlabelled, count published with zero | TRUE | SKILL search: never label; always publish the count |

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

**Landing files (PR 3 scope).** `.sp-control-row` and its controls → `SeatMap.tsx`'s toolbar (the
shipped `MapStatusBand` keeps the band, restyled as `.sp-band`); `.sp-menu-button` → the floor selector;
`.sp-search` + `.sp-palette` → `ViewerSeatFinder.tsx`'s header is **retired** and the palette component
keeps its virtualisation; `.sp-filters` → the control row, driving the shell's `LeftPanel.tsx` (PR 2);
`.sp-pill` / `.sp-seat-footprint` → `SeatMarker.tsx` (the two-line 124×40 pill retires; the nudge keeps
28 as `H`); `.sp-slot` family → the inspector (`SeatInspector` / `SeatSheet` siblings in
`components/seat-map/`), the mode card, and `AskPlannerDrawer.tsx` (408 → 400 is PHASE2UX §5's item);
`.sp-tearsheet` → the publish review (replacing the shipped review dialog); `.sp-roster` → the roster
region; `.sp-canvas-status` → the map region's notification slot (MLS02 banner, PUBLISH_BLOCKED).
**Phase 4 obligations added:** platform-aware keyboard hint (⌘ on Mac, Ctrl elsewhere, from
`navigator.platform` / UA-CH at hydration); the tooltip carries the seat code on hover and focus only;
the legend re-renders on the Names toggle; the inspector's "Changed in draft" line derives from the
publish diff (`lib/publishSummary.ts`). **Retired `--sp-*` names (PR 3):** `--sp-marker-*` (30 names) →
*`--sp-pill-*`* (fill, fill-hover, edge, text, selected-edge, search-fill/edge, quiet-*, origin-edge,
target-*, invalid-*, badge, names-off); `--sp-legend-*` (24) → *`--sp-seat-mark-*`* + the pill tokens (the
legend is the marker); `--sp-selection`, `-border`, `-surface` → *`--sp-pill-selected-edge`* / *`--sp-layer-selected`*;
`--sp-ai-*` (16: accent, aura, glow, ring, marker-*, chrome-*, panel-border, row, text) → *`--sp-ai-label-text`*,
*`--sp-ai-border-start`*, *`--sp-ai-border-end`* (aura, glow, ring, marker halos retired — no decoration);
`--sp-editor-*` (21 save-state chips) → the notification kinds + the commit-bar states (Saving… is
`aria-busy` on the primary); `--sp-publish-ready-*` / `-no-change-*` / `-viewer-impact-*` → *`--sp-status-success-mark`*
+ text tokens in the readiness rail; `--sp-trail`, `--sp-trail-origin` → *`--sp-pill-origin-edge`* / *`--sp-pill-target-edge`*
(the move trail is the origin's dashed edge and the target's solid one); `--sp-wash-zone` → *`--sp-highlight`*
(zone hit = the search surface); `--sp-map-mat` keeps its name.

**Landing files (PR 4 scope).** `.sp-page` + `.sp-tabs` → the `(shell)` layout's content pane and
`app/(shell)/admin/management/page.tsx` (the tab strip replaces the shipped tab component; the primary follows
`?tab=`); `.sp-table` → the Management employees table (`components/management/*`; rows 32, header 40, the
shipped kebab retires for one Edit icon button); `.sp-side-panel-host` → the employee editor (the shipped
dialog becomes the 480 slide-over; focus trap + dirty-close ask are behaviour); `.sp-list` → the departments
and zones lists (inline rename replaces the shipped rename dialog); `.sp-callout`, `.sp-settings`,
`.sp-section`, `.sp-tearsheet--narrow`, `.sp-count-card` → `app/(shell)/admin/settings/page.tsx` and the CSV /
snapshot review dialogs (`bulk-destructive-action-safety-source` keeps its review-before-mutate anchors: the
tearsheet IS the review); `.sp-recep` family → `app/(shell)/reception/page.tsx` and its components (the
shipped avatar and seat chip retire; the readout tile and row-buttons replace the shipped extension block);
`.sp-route-card` → the `error.tsx` / 403 surfaces. **Phase 4 obligations added:** the file trigger forwards
the button click to the hidden input (`tabindex=-1`, `aria-hidden`) so focus stays on the button; the sticky
tab strip offsets by `--sp-shell-header-h`; the danger-ghost override applies to every `.cds-btn--danger-ghost`
(the PR 3 inspector's Delete seat included); the seat link's hover step is the row's `:hover`, not the link's;
Reception's keyboard path (↑ ↓ move the highlight, ↵ locks, Esc unlocks / clears) drives `[data-highlight]` and
`aria-selected`. **Retired `--sp-*` names (PR 4):** `--sp-tag-bg` / `--sp-tag-text` → the asset `.cds-tag`
(light) and *`--sp-panel-dark-tag-bg`* / *`-text`* (dark panels); `--sp-table-header` → *`--sp-layer-selected`*
(the asset's `thead`), `--sp-table-row-border` → *`--sp-border-subtle`*; `--sp-extension-bg` / `-border` /
`-label` → *`--sp-readout-bg`* / retired (no border) / *`--sp-readout-eyebrow`*; `--sp-identity-avatar-bg` /
`-avatar-fg` / `-gradient` → retired (no avatar, no gradient — owner ruling).

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
- Retired in their component PRs: `--sp-chrome-*` (PR 2), `--sp-marker-*`, `--sp-legend-*`, `--sp-selection*`, `--sp-ai-*`, `--sp-editor-*`, `--sp-publish-*`, `--sp-trail*`, `--sp-wash-zone` (PR 3), `--sp-tag-*`, `--sp-table-*`, `--sp-extension-*`, `--sp-identity-*` (PR 4) — every shipped `--sp-*` name now has a replacement or a retirement above

---

## 6. Open for the owner

None after PR 4. Ruled on the PR 4 proposal and folded in: `heading-06` at 300, verified at 50% (§1.29);
line tabs at 40 with a 2px bar (§1.22); seat code as plain `code-01` text (§1.29); count cards as a reading
surface (§1.28); ● / ○ for Assigned / Unassigned (§1.23); one row action, no kebab (§1.23); tearsheet footer
right-aligned (§1.28); no avatar (§1.29). Found and fixed during the build, recorded not asked: the asset's
danger ghost on dark layers (§1.24, §3).

Closed after PR 3. Ruled on PR 3: stroke rule + ◇ at 1.5px verified (§1.16); move target / invalid target
as one construction in two families differing by shape (§1.16); one error notification, seven strings
with alert / status roles (§1.18).

Closed after PR 2: event row 10 / 52 / 10 with `heading-01` (§1.9); radio 16 (§1.11); tooltip without
caret (§1.8); below-lg current nav item 3px bar + `layer-selected` (§1.12).

Closed after PR 1: Ruled on #507: pressed shell = gray 80 and open = outlined (§1.3); theme attribute kept,
Carbon attribute derived (§1.2); seat marks ○ / lock / hatch with the assigned legend entry as a miniature
pill (§1.4).

---

## 7. What I'd tell Phase 4 (grows per PR)

1. **Zone rules must match the base rule's element names.** `.sp-panel .sp-radio-mark` (0,2,0) silently lost
   to `.sp-radio span.sp-radio-mark` (0,2,1) and the rings vanished on the dark panel in the light theme;
   only the rig showed it. Every dark-panel restyle of an asset class — ghost, tag, empty, notification,
   skeleton, radio, checkbox — must repeat the asset selector's element names (or exceed its specificity),
   and every such override gets a light-theme render of the dark panel before it is called done. This
   recurs with every component that lands inside `.sp-panel`.
2. **The outlined-open trigger is four shadows**, not a border (see the Phase 4 note in `.sp-mode`): three
   inset 1px rules plus one outer 1px shadow in the shell colour over the header rule, with
   `position: relative; z-index: 1`. A CSS-in-JS port that drops the outer shadow closes the outline.
3. **`--sp-event-pad` is 10px on purpose** — the symmetric remainder of 72 − 52 — and is the one geometry
   value not on the spacing scale; don't "fix" it to 8 or 12.
4. **The seat code tooltip is the tier-C tooltip**, gray 80 on the light canvas too. Do not theme it; the
   canvas mat and the raster are light in both themes' light regions and the box must read on either.
5. **`.sp-pill` widths come from the label**; the nudge (`SeatMarker.tsx`) reasons about height, which is
   the constant 28. Never set a width on a pill; never let the code render inline (it widens the pill
   into its neighbours — the reason the tooltip exists).
6. **Styling a `<use>`d symbol: set `fill` / `stroke` / `stroke-width` on the `<svg>` (they inherit), never
   on a `path` selector — CSS cannot reach a use's shadow tree. The ◇ badge rendered filled until this
   was fixed; every icon that takes a state colour (marks, badges, notification glyphs) is affected.
   **It bit again in PR 4:** the ○ Unassigned mark rendered filled because `[data-stroke]` inside a `<use>`d
   symbol is unreachable — the seat marks (`.sp-seat-mark [data-stroke]` / `[data-fill]` / `[data-hatch]`)
   must be **inlined** in the `<svg>`, never `<use>`d. In React that is a `SeatMark` component that emits
   the paths, not a sprite reference.
7. **`generate-pairs.mjs` is the contrast source of truth.** Add a mark or a surface there, regenerate,
   re-run the checker; never edit the JSON.
8. **The asset's danger ghost fails on dark layers** (§1.24). Keep the global `.cds-btn--danger-ghost` /
   `.cds-overflow-menu .cds-danger` override that paints it `--sp-button-danger-ghost-text`; if the asset is
   ever refreshed with a `--cds-button-danger-secondary`, re-point the token and drop the override.
9. **Containers are told apart by their footers.** Modal and side panel bleed 50/50 (asset); tearsheets
   right-align in the 64 bar (`.sp-tearsheet-footer`). A tearsheet ported onto the modal footer, or a side
   panel given right-aligned buttons, collapses the distinction the owner ruled on.
10. **The sticky tab strip needs the header offset and a painted background** (`--sp-tabs-bg`); a
    transparent strip lets the table's rows show through the tab labels as they scroll under.
11. **Links on rows that hover step to `link-primary-hover`** — the seat link in the Management table is
    the third instance (§3); every future row with a link in it gets the same `tr:hover a` rule.

---

## Slice log

| PR | Branch | Contents |
|---|---|---|
| 4 | (`docs/phase3-pages`) | `.sp-page` + line tabs; `.sp-table` (● ○ status, seat link hover step, one row action); side panel 480 slide-over + scrim, fact row, danger zone, confirm modal on top; `.sp-list` inline rename; `.sp-callout`; `.sp-settings` / `.sp-section` + file trigger + unhappy paths + busy; `.sp-tearsheet--narrow` (right-aligned footer), count cards, consequences, row list, ghost done-state; `.sp-recep` family (search lg, rows, readout tile heading-06 verified at 50%, row-buttons, recent, every state); route cards; the danger-ghost asset override; specimens `03-panels-and-sheets` + `04-forms-and-tables`; §1.22–1.29, §2 (+24 rows), §3 (194/194), §4, §5 (PR 4 landing files + every shipped name retired), §6, §7 (items 8–11); PHASE2UX §1R.3, §1S.3, §3 amendments. Owner rulings folded in before build: heading-06 300, line tabs 40, seat code plain text, count cards, ● ○, no kebab, tearsheet footer right-aligned, no avatar |
| 3 | #509 (`docs/phase3-map`) | control row + floor menu + search/palette + Filters split control + toggle; `.sp-pill` (11 states) + ◇ + names-off; `.sp-slot` inspector / mode card / Ask Planner (Carbon for AI); wide tearsheet + group rows; roster; band; canvas states; specimen `02-map`; §1.14–1.21, §2, §3 (generated, 170/170), §4, §5, §6, §7; PHASE2UX §3 amendments (Filters control, two-primaries justification, Delete hidden for originals, roster hover on the button). Owner rulings folded in before merge: stroke rule, invalid target in the error family, seven error strings |
| 2 | #508 (`docs/phase3-shell`) | `.sp-header` overrides, `.sp-header-slot`, `.sp-tooltip`, `.sp-panel` + zone-scoped variants, `.sp-switch`, `.sp-radio`, `.sp-left-panel`, `.sp-skeleton`; specimen `01-shell` (header ×3, hamburger ×7, utilities ×5, panels ×12, switch ×4, radio ×3, left panel ×7, narrow 1024); §1.7–1.13, §2, §3 (78/78), §4, §5; D0-f Phase 3 confirmation; PHASE2UX §3 ghost-on-dark row |
| 1 | #507 (`docs/phase3-tokens`) | assets copied; `sp-tokens.css`; `.sp-mode`, seat marks; specimens 00 + 05 + index + compare; §1.1–1.6, §2 (partial), §3, §4, §5 (partial). Owner rulings folded in before merge: pressed gray 80 + outlined open, theme decided, assigned legend = mini pill |
