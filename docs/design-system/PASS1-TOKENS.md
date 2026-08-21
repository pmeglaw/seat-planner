# PASS1-TOKENS.md — Token-Layer Consolidation (Proposal)

Pass 1 of the design-system adoption. **Proposal only — no code changed.** Companion to `AUDIT.md`.

Scope: collapse the five token vocabularies (`--sp-color-*` 181, `--admin-*` 353, `--login-*` 41,
`--r-*` 38, `--ml-*` 5 — 404 unique names, 618 definitions) into **one vocabulary** of
product-semantic names pointing at system values, per the IBM token-discipline rule
(product meaning → system token, one semantic layer, DTCG-rename-friendly).

**Visual-change contract:** every mapping below is a rename or an alias — pixel-identical —
**except** the two measured accessibility fixes in §5, which are the only sanctioned value
changes in this pass. Anything that *cannot* be consolidated without a value change is not
consolidated; it is flagged in §6 instead.

Headline: **404 names → ~230**. Deleted outright: 46 `*-rgb` twins (§4.1), ~25 pure aliases
and duplicates, ~6 zero-consumer orphans (verify at execution). Everything else renames 1:1
or collapses onto a shared role.

---

## 1. The proposed vocabulary

One prefix — **`--sp-`** (it already names the system and is wired into `tailwind.config.ts`).
Three tiers, plus zones:

**Tier 1 — theme roles** (Carbon-shaped names, values scoped per theme/zone):
`background`, `background-hover`, `background-deep`, `layer-01`, `layer-02`, `layer-hover`,
`layer-selected`, `layer-accent`, `field`, `field-hover`, `field-border`, `surface-disabled`,
`border-subtle`, `border-strong`, `border-hairline`, `border-hairline-soft`, `border-interactive`,
`text-primary`, `text-secondary`, `text-helper`, `text-disabled`, `text-placeholder`,
`text-inverse`, `text-on-brand`, `link`, `link-on-field`, `focus`, `overlay-base`,
`neutral-strong`, `neutral-muted`.

**Tier 1b — brand & action:**
`brand` (#FF5715 — indicator-only, never behind white text), `brand-hover` (#E64E13),
`brand-subtle` (#FBEAE1), `brand-wash` (α-orange), `brand-border` (α-orange, decorative only),
`brand-text` (#9E2F06 — orange text on tinted surfaces), `brand-mark` (#FC672A), `brand-deep`
(#6D4712), `accent` (theme-aware non-text accent: #D23F0A light / #FF5715 dark),
`button-primary` / `-hover` / `-active` / `-text`, `button-secondary` / `-hover` / `-soft`.

**Tier 1c — status families** (`--sp-status-<family>-<role>`; roles: `strong`, `mark`,
`surface`, `border`, `text`, plus `hover`/`pressed` where interactive):

| Family | Meaning (product) | Light anchor | Dark anchor |
|---|---|---|---|
| `success` | ok / saved / assigned / clean | #1D6E41 | #42be65 |
| `pending` | draft / dirty / reserved / reassigned — the teal "in-flux" family (this app has **no yellow warning**; today's `*-warning-*` names ARE this family) | #136A67 strong / #009d9a mark | #08bdba |
| `danger` | error / destructive / vacated | #B3232C | #fa4d56 |
| `neutral` | info folded into gray (deliberate, 2026-07-22) | #55504A | #c6c6c6 |
| `search` | search/filter highlight (brand-orange family) | #9E2F06 text / #D23F0A border | #FF8A5C / #FF5715 |
| `published` / `draft` | product aliases — `published-*` ≡ `success-*`, `draft-*` ≡ `pending-*` (values verified identical today; keep the product names, point them at the families) | — | — |
| `selection` | selected seat/row (brand family): `--sp-selection` #D23F0A, `-surface` #FBEAE1, `-border` #F0B49A | | #FF8A5C |

**Tier 2 — component tokens** (product-semantic, point at tier 1 or carry the component's
pinned literals): `--sp-marker-*` (live seat pills), `--sp-legend-*` (legend chips + the
dormant admin-marker arm), `--sp-ai-*` (Carbon-for-AI, unchanged sub-names), `--sp-editor-*`
(save-state chips), `--sp-publish-*`, `--sp-chrome-*` (chrome-only extras), `--sp-table-*`,
`--sp-tag-*`, `--sp-extension-*` (reception readout), `--sp-identity-*` (avatar/monogram),
`--sp-trail`/`--sp-trail-origin`, `--sp-wash-zone`, `--sp-map-mat`.

**Tier 3 — primitives** (names unchanged): `--sp-space-1..7`, `--sp-radius-*`,
`--sp-duration-*`, `--sp-shadow-*`, plus `--sp-elevation-2..5`, `--sp-elevation-rail`,
`--sp-elevation-panel`, and the focus geometry (`--sp-focus-width`, `--sp-focus-offset`,
`--sp-focus-offset-color`, `--sp-focus-marker-ring`, `--sp-focus-marker-offset`).

## 2. The zone model — how five vocabularies become one

Carbon's own pattern for a dark header on a light app is a **theme zone** (g100 zone inside a
white theme), not a second vocabulary. That is exactly what `--admin-chrome-*`,
`--login-panel-*`, and the `--r-*`/`--login-*` divergences are today:

| Zone | Where | What it is |
|---|---|---|
| *(base)* | admin workspace, viewer, reception | Greige light theme / graphite dark theme (`data-theme`) |
| `zone: chrome` | top bar, rail, SeatInspector, login brand panel | **Permanently dark** (Gray-100-style), in both themes |
| `zone: login` | `/login` form column | White/cool-gray temperature (Carbon White ramp: #525252/#6f6f6f/#e0e0e0), values preserved |
| *(reception overrides)* | `/reception` | Two row-state values of its own (`layer-hover` #F7F4EE, `layer-selected` #FBF1E9) |

One set of role *names*; zones re-declare *values*. `--admin-chrome-text` stops being a
different word for "text-primary" and becomes `--sp-text-primary` **inside the chrome zone**
(value #F7F6F2, unchanged). This is what deletes ~80 names without touching a pixel, and it
is the same mechanism the dark theme already uses.

---

## 3. Mapping table — every existing name

Legend: **[chrome]** / **[login]** / **[reception]** = same role name, zone-scoped value
(pixel-identical to today). *delete* = no replacement needed (alias, twin, or orphan).
⚑n = see flag n in §6.

### 3.1 `--ml-*` (5) — brand constants, zero `var()` consumers (verify)

| Current | New |
|---|---|
| `--ml-orange-signature` | *delete* — duplicate of `--sp-brand` |
| `--ml-orange-hover` | *delete* — duplicate of `--sp-brand-hover` |
| `--ml-orange-cta` | *delete* — duplicate of `--sp-button-primary` |
| `--ml-graphite` | *delete* — value lives in the chrome zone `layer-02` |
| `--ml-ink` | *delete* — duplicate of light `--sp-text-primary` |

### 3.2 `--sp-color-*` and `--sp-*` primitives

| Current | New | Note |
|---|---|---|
| `--sp-color-canvas` | `--sp-background` | |
| `--sp-color-surface` | `--sp-layer-01` | |
| `--sp-color-surface-raised` | `--sp-layer-02` | |
| `--sp-color-border-subtle` | `--sp-border-subtle` | |
| `--sp-color-border-strong` | `--sp-border-strong` | |
| `--sp-color-text-primary` | `--sp-text-primary` | |
| `--sp-color-text-secondary` | `--sp-text-secondary` | |
| `--sp-color-text-muted` | `--sp-text-helper` | Carbon role name |
| `--sp-color-text-disabled` | `--sp-text-disabled` | |
| `--sp-color-workspace` | `--sp-background` **[chrome]** | name lied ("workspace" = dark chrome #161616) ⚑6 |
| `--sp-color-workspace-deep` | `--sp-overlay-base` + `--sp-background-deep` **[chrome]** | #0a0a0a; scrim base and deep chrome |
| `--sp-color-graphite-soft` | `--sp-layer-accent` | subtle raised neutral (#F7F6F2 / #262626) |
| `--sp-color-stone` | `--sp-neutral-strong` | solid neutral accent (#E7E1D8 / #333333) |
| `--sp-color-stone-muted` | `--sp-neutral-muted` | #B8AEA2 / #6f6f6f |
| `--sp-color-state-disabled` | `--sp-surface-disabled` | |
| `--sp-color-brand-ivory` | *delete* — it is #FFFFFF; use `--sp-layer-01` | name lied ⚑7 |
| `--sp-color-brand-paper` | `--sp-brand-subtle` | |
| `--sp-color-brand-copper` | *delete* — duplicate of `--sp-button-primary` | |
| `--sp-color-brand-accent` | `--sp-brand` | indicator-only; pairs with `--sp-text-on-brand` (§5.1) |
| `--sp-color-brand-clay` | `--sp-brand-deep` | rgb twin disagrees ⚑1 |
| `--sp-color-action-primary` | `--sp-button-primary` | #D23F0A |
| `--sp-color-action-primary-hover` | `--sp-button-primary-hover` | #B83708 |
| `--sp-color-action-primary-pressed` | `--sp-button-primary-active` | #9E2F06 |
| `--sp-color-state-selected` | `--sp-selection` | |
| `--sp-color-state-selected-surface` | `--sp-selection-surface` | |
| `--sp-color-state-selected-border` | `--sp-selection-border` | |
| `--sp-color-state-published` / `-surface` / `-border` / `-on-soft` | `--sp-status-published-strong` / `-surface` / `-border` / `-text` | alias family → `success` (values identical today, verified) |
| `--sp-color-state-draft` / `-surface` / `-border` / `-on-soft` | `--sp-status-draft-strong` / `-surface` / `-border` / `-text` | alias family → `pending` (values identical today, verified) |
| `--sp-color-state-success` / `-surface` / `-border` / `-on-soft` | `--sp-status-success-strong` / `-surface` / `-border` / `-text` | |
| `--sp-color-state-warning` / `-surface` / `-border` / `-on-soft` | `--sp-status-pending-strong` / `-surface` / `-border` / `-text` | "warning" was always this teal family ⚑10 |
| `--sp-color-state-danger` / `-surface` / `-border` / `-on-soft` | `--sp-status-danger-strong` / `-surface` / `-border` / `-text` | |
| `--sp-color-state-danger-hover` / `-pressed` | `--sp-status-danger-hover` / `-pressed` | |
| `--sp-color-state-info` / `-surface` / `-border` / `-on-soft` | `--sp-status-neutral-strong` / `-surface` / `-border` / `-text` | info≡neutral is deliberate (2026-07-22 note kept) |
| `--sp-color-state-search` / `-surface` / `-border` | `--sp-status-search-text` / `-surface` / `-border` | |
| `--sp-focus-ring-color` | `--sp-focus` | **value changes — fix §5.2** |
| `--sp-focus-ring-width` / `-offset` / `-offset-color` | `--sp-focus-width` / `--sp-focus-offset` / `--sp-focus-offset-color` | geometry unchanged |
| `--sp-space-1..7` | unchanged | |
| `--sp-radius-sm` / `-md` / `-lg` / `-xl` / `-sheet` / `-full` | unchanged | all-zero scale; collapse candidate ⚑13 |
| `--sp-shadow-raised` / `-floating` / `-sheet` / `-modal` | unchanged | |
| `--sp-duration-fast` / `-standard` / `-deliberate` | unchanged | off Carbon's ladder — Pass-2 question, not this pass |
| All 31 `--sp-color-*-rgb` twins (`action-primary-rgb`, `action-primary-hover-rgb`, `action-primary-pressed-rgb`, `border-strong-rgb`, `border-subtle-rgb`, `brand-accent-rgb`, `brand-clay-rgb`, `brand-copper-rgb`, `brand-ivory-rgb`, `brand-paper-rgb`, `canvas-rgb`, `graphite-soft-rgb`, `state-danger-rgb`, `state-disabled-rgb`, `state-draft-rgb`, `state-info-rgb`, `state-published-rgb`, `state-search-rgb`, `state-selected-rgb`, `state-success-rgb`, `state-warning-rgb`, `stone-muted-rgb`, `stone-rgb`, `surface-raised-rgb`, `surface-rgb`, `text-disabled-rgb`, `text-muted-rgb`, `text-primary-rgb`, `text-secondary-rgb`, `workspace-deep-rgb`, `workspace-rgb`) | *delete* | call sites move to `color-mix(in srgb, var(--sp-…) N%, transparent)` — see §4.1 and ⚑1 |

### 3.3 `--admin-*` — surfaces, text, chrome

| Current | New | Note |
|---|---|---|
| `--admin-bg` | *delete* — alias; use `--sp-background` | |
| `--admin-surface` | *delete* — alias; use `--sp-layer-01` | |
| `--admin-surface-alt` / `--admin-surface-muted` | *delete* — both alias canvas; use `--sp-background` | |
| `--admin-surface-hover` | `--sp-layer-hover` | #FBFAF8 / #262626 |
| `--admin-field-fill` | `--sp-field` | |
| `--admin-field-rule` | `--sp-field-border` | 3.02:1 boundary pair — keep together |
| `--admin-border` | `--sp-border-subtle` | same value as sp twin, merges clean |
| `--admin-border-soft` | `--sp-border-soft` | α-variant of subtle |
| `--admin-border-strong` | `--sp-border-strong` | |
| `--admin-table-header-bg` | `--sp-table-header` | ⚑14 (≡ `--r-rule-soft` value) |
| `--admin-table-row-border` | `--sp-table-row-border` | ⚑14 |
| `--admin-text-primary` / `-secondary` / `-muted` | `--sp-text-primary` / `-secondary` / `-helper` | values match sp twins |
| `--admin-text-subtle` | *delete* — duplicate of `--sp-text-helper` (same hex both themes) | |
| `--admin-text-inverse` | `--sp-text-inverse` | |
| `--admin-map-workspace` | `--sp-map-mat` | decorative band behind the raster |
| `--admin-chrome-h` | `--sp-chrome-height` | layout token; 5 test files pin the old name (§7) |
| `--admin-chrome-bg` | `--sp-background` **[chrome]** | #161616 (dark: #0a0a0a) |
| `--admin-chrome-elevated` | `--sp-layer-01` **[chrome]** | #1f1f1f |
| `--admin-chrome-raised` | `--sp-layer-02` **[chrome]** | #262626 |
| `--admin-chrome-hover` | `--sp-background-hover` **[chrome]** | #262626 |
| `--admin-chrome-raised-hover` | `--sp-layer-hover` **[chrome]** | #333333 |
| `--admin-chrome-field` | `--sp-field` **[chrome]** | rgba(255,255,255,.08) |
| `--admin-chrome-text` | `--sp-text-primary` **[chrome]** | #F7F6F2 |
| `--admin-chrome-text-soft` | `--sp-text-secondary` **[chrome]** | #D8D0C5 |
| `--admin-chrome-muted` | `--sp-text-helper` **[chrome]** | #B8AEA2 |
| `--admin-chrome-disabled` | `--sp-text-disabled` **[chrome]** | #8E8276 |
| `--admin-chrome-border` | `--sp-border-subtle` **[chrome]** | |
| `--admin-chrome-border-strong` | `--sp-border-strong` **[chrome]** | |
| `--admin-chrome-danger` | `--sp-status-danger-strong` **[chrome]** | #fa4d56 |
| `--admin-chrome-danger-text` | `--sp-status-danger-text` **[chrome]** | #ff8389 |
| `--admin-chrome-success-text` | `--sp-status-success-text` **[chrome]** | #42be65 |
| `--admin-chrome-warn-text` | `--sp-status-pending-text` **[chrome]** | #08bdba |
| `--admin-chrome-info` / `--admin-chrome-info-text` | `--sp-chrome-info` / `--sp-chrome-info-text` | blue hint family; near-dup of AI hexes ⚑11 |
| `--admin-chrome-heading` | `--sp-chrome-heading` | text role sharing stone's value — keeps own name (per globals note) |
| `--admin-chrome-value-text` | `--sp-chrome-value` | |
| `--admin-chrome-action-text` | `--sp-chrome-action` | |
| `--admin-chrome-label` | `--sp-chrome-label` | |
| `--admin-chrome-commit-bg` | `--sp-chrome-commit` | |
| `--admin-chrome-danger-raised` | `--sp-chrome-danger-raised` | |
| `--admin-rail-bg` / `--admin-rail-border` / `--admin-rail-muted` | *delete* — pure aliases of chrome-zone `background` / `border-subtle` / `text-helper` | |
| `--admin-rail-surface` | `--sp-chrome-wash` | rgba(255,255,255,.05) |
| `--admin-rail-overlay-shadow` | `--sp-elevation-rail` | named Tailwind utility — rename in `tailwind.config.ts` too |

### 3.4 `--admin-*` — brand, buttons, status, states

| Current | New | Note |
|---|---|---|
| `--admin-primary` | `--sp-brand` | |
| `--admin-primary-hover` | `--sp-brand-hover` | #E64E13 — non-text fills only (white on it = 3.84) |
| `--admin-primary-cta` | `--sp-button-primary` | |
| `--admin-primary-cta-hover` | `--sp-button-primary-hover` | |
| `--admin-primary-cta-active` | `--sp-button-primary-active` | |
| `--admin-primary-on-soft` | `--sp-brand-text` | #9E2F06 |
| `--admin-primary-ink` | `--sp-text-on-brand` | #161616 — becomes the enforced pair of `--sp-brand` (§5.1) |
| `--admin-primary-soft` | `--sp-brand-wash` | |
| `--admin-primary-border` | `--sp-brand-border` | decorative only; essential boundaries take `--sp-border-interactive` (§5.2) |
| `--admin-paper` | *delete* — duplicate of `--sp-brand-subtle` | |
| `--admin-copper` | *delete* — duplicate of `--sp-button-primary` | |
| `--admin-brand` | `--sp-brand-mark` | #FC672A monogram chip |
| `--admin-avatar-gradient` | `--sp-identity-gradient` | |
| `--admin-secondary` / `-hover` / `-soft` | `--sp-button-secondary` / `-hover` / `-soft` | zero JSX consumers per globals note — delete candidate ⚑8 |
| `--admin-focus` | `--sp-focus` | **value changes — fix §5.2** |
| `--admin-status-ok` / `-warn` / `-bad` / `-neutral` | `--sp-status-success-mark`* / `--sp-status-pending-mark` / `--sp-status-danger-mark`* / `--sp-status-neutral-mark` | *ok/bad share the strong value — mark ≡ strong for these two |
| `--admin-success` | *delete* — same value as `--sp-status-success-strong` | |
| `--admin-success-soft` | *delete* — same value as `--sp-status-success-surface` | |
| `--admin-warning` | *delete* — same value as `--sp-status-pending-mark` | |
| `--admin-warning-text` | *delete* — same value as `--sp-status-pending-text` | |
| `--admin-warning-soft` | *delete* — same value as `--sp-status-pending-surface` | |
| `--admin-error` / `--admin-danger` | `--sp-status-danger-strong` | error≡danger today — one name ⚑12 |
| `--admin-danger-soft` | `--sp-status-danger-surface` | |
| `--admin-danger-soft-hover` | `--sp-status-danger-surface-hover` | tile hover, unique value #F8DEE0 |
| `--admin-info` / `--admin-info-soft` | `--sp-status-neutral-strong` / `-surface` | |
| `--admin-analytics` | *delete* — duplicate of `--sp-status-neutral-strong` ⚑11 | |
| `--admin-state-clean-bg` / `-border` / `-text` | `--sp-editor-clean-bg` / `-border` / `-text` | border α differs from status border — values kept ⚑15 |
| `--admin-state-dirty-bg` / `-border` / `-text` | `--sp-editor-dirty-bg` / `-border` / `-text` | |
| `--admin-state-saving-bg` / `-border` / `-text` | `--sp-editor-saving-bg` / `-border` / `-text` | |
| `--admin-state-saved-bg` / `-border` / `-text` | `--sp-editor-saved-bg` / `-border` / `-text` | |
| `--admin-state-error-bg` / `-border` / `-text` | `--sp-editor-error-bg` / `-border` / `-text` | |
| `--admin-state-danger-bg` / `-border` / `-text` | `--sp-editor-danger-bg` / `-border` / `-text` | |
| `--admin-state-neutral-bg` / `-border` / `-text` | `--sp-editor-neutral-bg` / `-border` / `-text` | |
| `--admin-publish-ready-bg` / `-border` / `-text` | `--sp-publish-ready-bg` / `-border` / `-text` | aliases of brand-wash/brand-border/brand-text; e2e contrast spec pins these names (§7) |
| `--admin-publish-no-change-bg` / `-border` / `-text` | `--sp-publish-no-change-bg` / `-border` / `-text` | alias → editor-clean |
| `--admin-publish-viewer-impact-bg` / `-border` / `-text` | `--sp-publish-viewer-impact-bg` / `-border` / `-text` | alias → neutral |
| `--admin-diff-assigned-bg` / `-border` / `-text` | *delete* → `--sp-status-success-surface` / `-border` / `-text` | values verified identical — true merge, zero visual change |
| `--admin-diff-vacated-bg` / `-border` | *delete* → `--sp-status-danger-surface` / `-border` | identical |
| `--admin-diff-vacated-text` | *delete* → `--sp-status-danger-strong` | #B3232C used as text (5.6:1 on its surface, documented) |
| `--admin-diff-reassigned-bg` / `-border` / `-text` | *delete* → `--sp-status-pending-surface` / `-border` / `-text` | identical |
| `--admin-zone-wash-fill` | `--sp-wash-zone` | |
| `--admin-draft-trail` / `--admin-draft-trail-origin` | `--sp-trail` / `--sp-trail-origin` | #B85207 pinned by handoff ⚑2 |
| `--admin-elevation-2/3/4/5-shadow` | `--sp-elevation-2/3/4/5` | named utilities — rename in `tailwind.config.ts` + test (§7) |
| `--admin-shadow-panel` | `--sp-elevation-panel` | alias of elevation-3 |
| `--admin-shadow-shell` / `--admin-shadow-command` / `--admin-shadow-map` | *delete* — all `none`; call sites drop the var | |
| `--admin-ai-*` (16: `accent`, `accent-soft`, `aura`, `border`, `chrome-border`, `chrome-text`, `chrome-text-hover`, `glow`, `marker-aura`, `marker-surface`, `panel-border`, `ring`, `ring-soft`, `row`, `text`) + `--admin-marker-ai-shadow` | `--sp-ai-*` (same sub-names) + `--sp-ai-marker-shadow` | family kept whole; `accessibility-source` + `ask-planner-ai-source` pin the prefix (§7) |
| `--admin-ai-rgb` | *delete* (twin) | |
| All 15 `--admin-*-rgb` twins (`border-rgb`, `chrome-bg-rgb`, `chrome-danger-rgb`, `chrome-danger-text-rgb`, `chrome-info-rgb`, `info-rgb`, `primary-rgb`, `rail-bg-rgb`, `status-bad-rgb`, `status-ok-rgb`, `status-warn-rgb`, `success-rgb`, `surface-rgb`, `warning-text-rgb`, + `ai-rgb` above) | *delete* | §4.1; `status-ok-rgb` and `status-bad-rgb` disagree with their hexes ⚑1 |

### 3.5 `--admin-marker-*` — legend chips + dormant admin arm → `--sp-legend-*`

Uniform prefix rename, values untouched (the globals comment "do not point the markers at
these" stays true — legend and live stay separate families ⚑15):

`--admin-marker-assigned-surface/-border/-text/-accent`, `--admin-marker-available-surface/-border/-text/-accent`,
`--admin-marker-reserved-surface/-border/-text/-accent`, `--admin-marker-unavailable-surface/-border/-text/-accent`,
`--admin-marker-draft-surface/-border/-text/-accent`, `--admin-marker-search-surface/-border/-text/-ring/-halo`,
`--admin-marker-selected-surface/-border/-text/-shadow`, `--admin-marker-move-origin-surface/-border/-text`,
`--admin-marker-target-valid-surface/-border/-text`, `--admin-marker-target-invalid-surface/-border/-text/-accent`,
`--admin-marker-hover-border/-shadow`
→ same name with `--sp-legend-` in place of `--admin-marker-`
(e.g. `--admin-marker-selected-shadow` → `--sp-legend-selected-shadow`; the two shadows are
named Tailwind utilities — rename in config + tests §7).

- `--admin-marker-hover-border` is documented dormant → delete candidate ⚑9.
- The `selected`/`search`/`move-origin`/`target-*` subset serves the **dormant admin marker
  arm** (memory-confirmed: pills render `variant="viewer"`); keep through Pass 1, list for a
  consumer audit ⚑9.
- `--admin-marker-focus-ring` / `--admin-marker-focus-offset` | `--sp-focus-marker-ring` / `--sp-focus-marker-offset` — **ring value changes, fix §5.2**; offset (white .70) unchanged.

### 3.6 `--admin-marker-live-*` — the live seat pills → `--sp-marker-*`

Uniform prefix rename, all values untouched (this family is the shipped marker system):

`ink`, `pill-ring`, `active-edge`, `active-edge-strong`, `active-edge-soft`,
`assigned-surface/-border/-text`, `available-surface/-border`,
`reserved-surface/-border/-text`, `unavailable-surface/-border/-text`,
`draft-surface/-border/-text/-ring/-badge`, `selected-surface`, `search-selected-surface`,
`search-surface/-border/-text/-ring`, `positive-surface/-border/-text/-ring/-outline`,
`planner-ring`, `invalid-surface/-border/-text`, `neutral-surface/-border/-text/-ring`
→ `--admin-marker-live-X` becomes `--sp-marker-X` for every X above
(e.g. `--admin-marker-live-active-edge` → `--sp-marker-active-edge`).

### 3.7 `--r-*` (reception, 19)

| Current | New | Note |
|---|---|---|
| `--r-bg` | `--sp-background` | value already matches |
| `--r-card` | `--sp-layer-01` | matches |
| `--r-card-border` | `--sp-border-subtle` | matches |
| `--r-rule` | `--sp-border-hairline` | #EDE8E0 ⚑14 |
| `--r-rule-soft` | `--sp-border-hairline-soft` | #F0EDE7 ⚑14 |
| `--r-text` / `--r-secondary` / `--r-muted` | `--sp-text-primary` / `-secondary` / `-helper` | values match base theme |
| `--r-micro` | *delete* — duplicate of `--r-muted` (same hex both themes) → `--sp-text-helper` | |
| `--r-chip-bg` / `--r-chip-fg` | `--sp-tag-bg` / `--sp-tag-text` | |
| `--r-hover` | `--sp-layer-hover` **[reception]** | #F7F4EE (base is #FBFAF8) — scoped value ⚑14 |
| `--r-selected` | `--sp-layer-selected` **[reception]** | #FBF1E9 brand-tinted row |
| `--r-accent` | `--sp-accent` | #D23F0A light / #FF5715 dark — the new theme-aware accent role |
| `--r-ext-bg` / `--r-ext-border` / `--r-ext-label` | `--sp-extension-bg` / `-border` / `-label` | product-specific readout family |
| `--r-avatar-bg` / `--r-avatar-fg` | `--sp-identity-avatar-bg` / `-fg` | |

### 3.8 `--login-*` (30)

| Current | New | Note |
|---|---|---|
| `--login-bg` | `--sp-background` **[login]** | #ffffff — White-zone value |
| `--login-field` / `--login-field-hover` | `--sp-field` / `--sp-field-hover` **[login]** | |
| `--login-border-subtle` / `--login-border-strong` | `--sp-border-subtle` / `-strong` **[login]** | cool-gray values ⚑3 |
| `--login-text-primary` / `-secondary` / `-tertiary` | `--sp-text-primary` / `-secondary` / `-helper` **[login]** | #525252/#6f6f6f cool grays ⚑3 |
| `--login-placeholder` | `--sp-text-placeholder` | promoted to an app-wide role (login zone values) |
| `--login-accent` / `--login-accent-hover` | `--sp-button-primary` / `-hover` **[login]** | #B85207/#9F4605 — second CTA ladder ⚑2 |
| `--login-link` | `--sp-link` | #B85207 |
| `--login-link-on-field` | `--sp-link-on-field` | AA-forced role, keep separate (its reason is documented) |
| `--login-error` | `--sp-status-danger-mark` **[login]** | #da1e28 ⚑4 |
| `--login-error-text` | `--sp-status-danger-text` **[login]** | |
| `--login-success` | `--sp-status-success-mark` **[login]** | #24a148 — Carbon green-50 hover trap ⚑5 |
| `--login-notice-error-bg` / `--login-notice-success-bg` | `--sp-status-danger-surface` / `--sp-status-success-surface` **[login]** | |
| `--login-panel-bg` | `--sp-background` **[chrome]** | #161616 exact match — panel IS a chrome zone |
| `--login-panel-text` / `-text-soft` / `-text-faint` | `--sp-text-primary` / `-secondary` / `-helper` **[chrome, login-scoped values]** | #f4f4f4/#c6c6c6/#8d8d8d — 1-step off the bar's #F7F6F2/#D8D0C5/#B8AEA2 ⚑3 |
| `--login-panel-outline` / `--login-panel-divider` | `--sp-border-strong` / `--sp-border-subtle` **[chrome, login-scoped values]** | ⚑3 |
| `--login-publish-dot` | `--sp-status-success-mark` **[chrome]** | #42be65 exact match |

---

## 4. Deletions worth naming

### 4.1 The 46 `*-rgb` twins — and the drift bug they hide

Every `-rgb` twin exists only so call sites can write `rgb(var(--x-rgb) / α)`. Modern CSS
(`color-mix(in srgb, var(--x) N%, transparent)`) — already used by the marker family in this
same file — makes every one redundant. Delete all 46; migrate ~25 consuming call sites.

**The bug:** 15 twins no longer hold the same color as their hex partner. The hexes were
migrated to the greige/shell palette; the twins kept the old IBM-gray or old-green values.
Today the app literally renders two different hues for "the same token" — solid uses the hex,
alpha washes use the stale twin. Disagreeing pairs:

| Token | Hex says | `-rgb` twin says | Twin consumed? |
|---|---|---|---|
| `--sp-color-text-secondary` | #55504A | 82 82 82 (#525252) | — |
| `--sp-color-text-muted` | #6E655A | 111 111 111 (#6f6f6f) | — |
| `--sp-color-text-disabled` | #B8AEA2 | 168 168 168 (#a8a8a8) | — |
| `--sp-color-canvas` | #F7F6F2 | 244 244 244 (#f4f4f4) | yes (2) |
| `--sp-color-graphite-soft` | #F7F6F2 | 244 244 244 | yes (2) |
| `--sp-color-stone` | #E7E1D8 | 224 224 224 (#e0e0e0) | yes (2) |
| `--sp-color-stone-muted` | #B8AEA2 | 168 168 168 | yes (2) |
| `--sp-color-border-subtle` | #E7E1D8 | 224 224 224 | — |
| `--sp-color-border-strong` | #D8D0C5 | 198 198 198 (#c6c6c6) | — |
| `--sp-color-state-info` | #55504A | 82 82 82 | yes (2) |
| `--sp-color-state-disabled` | #E7E1D8 | 224 224 224 | yes (2) |
| `--sp-color-brand-clay` | #6D4712 | 122 46 12 (#7A2E0C) | — |
| `--admin-status-ok` | #1D6E41 | 36 161 72 (#24A148) | **yes (5)** |
| `--admin-status-bad` | #B3232C | 218 30 40 (#da1e28) | yes (3) |
| *(also the ghost)* `--admin-state-clean-border` / `--admin-state-saved-border` | — | rgba(36,161,72,…) — the old #24A148 green inline | yes |

Consolidating a disagreeing consumed pair to ONE value necessarily moves one side a step —
a sub-perceptual-to-subtle change, but a change. **These ~8 consumed pairs are therefore
excluded from Pass 1's no-visual-change guarantee and parked as flag ⚑1**: owner picks the
survivor (recommendation: the hex — the ramp is the source of truth — then re-measure the
affected washes with the contrast script).

### 4.2 Other deletions

Pure aliases: `--admin-bg`, `--admin-surface`, `--admin-surface-alt`, `--admin-surface-muted`,
`--admin-rail-bg`, `--admin-rail-border`, `--admin-rail-muted`, `--admin-text-subtle`,
`--admin-copper`, `--admin-paper`, `--admin-analytics`, `--admin-error`-vs-`danger`,
`--r-micro`, all 5 `--ml-*`, `--sp-color-brand-ivory`, `--sp-color-brand-copper`,
`--admin-success(-soft)`, `--admin-warning(-text/-soft)`, the 9 `--admin-diff-*`,
`--admin-shadow-shell/command/map`. Zero-consumer candidates (verify with grep before
deleting): `--admin-secondary` family, `--admin-marker-hover-border`, `--ml-*`,
`--sp-color-brand-ivory`.

---

## 5. The two folded fixes (the only value changes)

### 5.1 Primary-action text on brand orange

Measured (WCAG relative luminance):

| Pair | Ratio | Verdict |
|---|---|---|
| #FFFFFF on #FF5715 | **3.17** | fails AA text |
| #000000 on #FF5715 | 6.63 | passes |
| #161616 (ink) on #FF5715 | 5.71 | passes |
| #FFFFFF on #D23F0A | 4.71 | passes |
| #FFFFFF on #B83708 (hover) | 5.85 | passes |
| #FFFFFF on #9E2F06 (active) | 7.33 | passes |

**Token fix:** two paired roles, so the failing combination becomes unexpressible:

- `--sp-button-primary` (#D23F0A → #B83708 → #9E2F06) pairs with
  **`--sp-button-primary-text: #FFFFFF`** — white is legal on the whole CTA ladder, and only there.
- `--sp-brand` (#FF5715) pairs with **`--sp-text-on-brand: #161616`** (5.71:1; today's
  `--admin-primary-ink`, promoted and renamed). The raw signature orange never takes white
  text — the same move Carbon makes for its yellow warning fill (dark ink on the fill, always).
- `--sp-brand-hover` #E64E13 is likewise ink-only (white on it = 3.84; ink on it = 4.71).

Current shipped surfaces already mostly obey this (Button/design-system primaries sit on
#D23F0A; the one raw-orange chip found pairs with ink) — the fix makes it a *structural*
guarantee and closes the known wish-list trap (the dark-mode spec's selected-pill
"#FF5715 fill + white text", already refused once in the globals dark-block comment, becomes
expressible only as orange fill + ink).

### 5.2 Focus and interactive borders — `#FF5715` cannot carry them on layered light surfaces

Measured against every light surface, hover states included (the skill's rule: check the
hovered surface, not the resting one):

| Candidate | on #FFFFFF | #F4F4F4 (field) | #F7F6F2 (bg) | #FBFAF8 (hover) | #E8E8E8 | #E7E1D8 |
|---|---|---|---|---|---|---|
| #FF5715 (today) | 3.17 | **2.88 ✗** | 2.93 ✗ | 3.04 | **2.59 ✗** | **2.44 ✗** |
| #E64E13 | 3.84 | 3.49 | 3.55 | 3.68 | 3.14 | **2.96 ✗** |
| **#D23F0A** | **4.71** | **4.29** | **4.36** | **4.52** | **3.85** | **3.63** |
| #B83708 | 5.85 | 5.32 | 5.41 | 5.61 | 4.78 | 4.50 |

**Proposal — `--sp-focus` and the new `--sp-border-interactive`:**

- **Light theme and light zones: #D23F0A.** First step of the existing brand ladder that
  clears 3:1 on *every* light surface including hover fills and the greige hairline — no new
  hue, and it is already the app's CTA/selection color, so the focus ring stays
  recognizably brand.
- **Dark theme and the chrome zone: #FF8A5C** (7.79:1 on #161616, 6.52:1 on #262626,
  5.44:1 on #333333 hover — passes everywhere). This keeps brand hue; the Carbon-orthodox
  alternative is white (Carbon flips `$focus` to white on dark) — offered, not recommended,
  since #FF8A5C clears every floor and preserves identity.
- **Ring geometry unchanged** (4px / 2px offset / offset-color) — a geometry change is a
  visible redesign and stays out of Pass 1. Carbon's 2px-inset style is a Pass-2/3 question.
- The current viewer ring color is `rgb(255 87 21 / 0.9)` — **alpha on an already-failing
  hue**; the fix is a *solid* #D23F0A (alpha over unknown ground can only lower contrast).
- `--admin-marker-focus-ring` rgba(255,87,21,.75) → `--sp-focus-marker-ring` solid #D23F0A;
  its white offset ring (`--sp-focus-marker-offset`, unchanged) keeps the double-signal
  separation on the busy raster.
- **`--sp-border-interactive`** (new role): #D23F0A light / #FF8A5C dark — for any border that
  *is* the signal (active tab underline, selected control outline, essential field boundary).
  `--sp-brand-border` (α-orange) survives for decorative borders that always ride with a
  second signal.
- Raw `#FF5715` (`--sp-brand`) remains legal: on dark chrome (5.71:1 on #161616 — passes as a
  mark), as a large fill with ink text, and as a decorative accent paired with another signal.
  It stops being legal as the *sole* drawn signal on layered light surfaces.

What changes on screen: focus rings and interactive borders shift one brand-ladder step
deeper on light surfaces (#FF5715→#D23F0A) and one step lighter on dark (#FF5715→#FF8A5C
where not already). Everything else in this document is pixel-identical.

---

## 6. Flags — no clean home / needs an owner decision

1. **15 hex/rgb twin mismatches** (§4.1), ~8 with live consumers — consolidation forces a
   value pick; recommend the hex ramp wins, then batch re-measure.
2. **Two orange CTA ladders**: app #D23F0A/#B83708/#9E2F06 vs login-1e #B85207/#9F4605 (also
   pinned into `--sp-trail`). Both AA-clean; converging them is a visual change — Pass 2
   decision. Until then the login zone scopes its own `button-primary` values.
3. **Two neutral temperatures**: greige (#55504A/#6E655A/#E7E1D8/#D8D0C5) vs login's Carbon
   cool grays (#525252/#6f6f6f/#e0e0e0/#8d8d8d), and the login panel's grays sit one step off
   the chrome bar's warm set (#f4f4f4 vs #F7F6F2 etc.). Zones carry both today; convergence
   is Pass 2+.
4. **Two danger reds**: app #B3232C vs login #da1e28 (Carbon red 60). Same treatment.
5. **`--login-success` #24a148 is Carbon green 50 — the documented hover-surface trap**
   (3.35:1 on white, 2.74:1 on #E8E8E8). Safe where it sits (login has no hovered-row
   context); must not be exported to app surfaces — the app's own success marks (#1D6E41 /
   #42be65) are the safe pair.
6. `--sp-color-workspace(-deep)` — name says workspace, values are the dark chrome; folded
   into the chrome zone, name retired.
7. `--sp-color-brand-ivory` is #FFFFFF — name retired.
8. `--admin-secondary` family: documented zero consumers — delete after grep confirms.
9. Dormant admin-marker arm (`--sp-legend-selected/search/move-origin/target-*`,
   `--sp-legend-hover-border`): kept in Pass 1; audit consumers before Pass 2, deletion likely.
10. **This system has no yellow warning family.** "Warning" today *is* the teal pending
    family — renamed honestly. If a true warning tier is ever needed, the skill's trap table
    applies (yellow 30 fails as a mark on light; use yellow 60 for drawn parts).
11. `--admin-chrome-info` (#4589ff/#78a9ff) duplicates the AI family's hexes while meaning
    "keyboard hint," not "AI presence." Kept separate (roles differ); candidate to re-anchor
    on the neutral family in Pass 2 so blue stays AI-exclusive (the Carbon-for-AI reservation
    the globals comment already declares).
12. `--admin-error` ≡ `--admin-danger` — merged; call sites of both go to one name.
13. `--sp-radius-sm/md/lg/xl/sheet` are all 0px — kept for Tailwind wiring; collapsing to a
    single `--sp-radius-none` is safe whenever convenient.
14. Hairline cluster: `--r-rule` #EDE8E0, `--r-rule-soft` ≡ `--sp-table-header` #F0EDE7,
    `--sp-table-row-border` #F0ECE5, `--r-hover` #F7F4EE vs `--sp-layer-hover` #FBFAF8 —
    four near-identical greiges within 2 steps. Kept as-is (no-visual-change rule);
    prime candidates for Pass-2 convergence onto two values.
15. Deliberate non-merges kept deliberate: legend vs live marker families (globals comment),
    editor save-state borders vs status borders (α values differ), `--sp-trail-origin` vs
    `--sp-text-helper` (same hex, independent by documented design).

## 7. Execution constraints (for the pass that implements this)

- **Nine test files grep old token names** and must move in lockstep:
  `accessibility-source` (`--admin-ai-*`, `--admin-status-ok`, `--admin-text-inverse`,
  `--admin-state-clean-*`, `--admin-primary-cta`, `--admin-diff-vacated-*`,
  `--sp-color-text-primary`), `shell-viewport-height-source` + `app-top-bar` (`--admin-chrome-h`),
  `e2e/publish-ready-badge-contrast.spec.ts` (`--admin-publish-ready-*`, `--admin-primary-on-soft`,
  `--admin-primary-cta`), `ask-planner-ai-source`, `app-rail` (`--admin-ai-chrome-border`),
  `seat-map-components` (`--admin-draft-trail*`), `office-room-wash` (`--admin-zone-wash-fill`),
  `elevation-shadow-tokens-source` (`--admin-elevation-*`, `--admin-shadow-panel`,
  `--admin-marker-*-shadow`).
- `tailwind.config.ts` re-wires: the `sp` color/spacing/shadow/duration maps and every **named**
  shadow utility (the `shadow-[var(--…)]` Tailwind-v3 silent-drop trap is why they are named —
  do not convert them to arbitrary values).
- ~2,820 arbitrary-value class call sites reference old names; the rename is mechanical
  (`--admin-marker-live-` → `--sp-marker-`, etc.) but must cover **both map surfaces**
  (`SeatMap` + `ViewerSeatFinder`) and the `components/ui` primitives in one change.
- Recommended execution shape: one migration PR per family (chrome zone, statuses, markers,
  login/reception zones), each landing globals.css + call sites + tests together, with the
  old name kept as a one-line alias for one release only if a PR must split.
- The globals.css measured-contrast comments move with their tokens — they are the palette's
  audit trail (and §4.1 shows why a wrong number is worse than none).
- After execution: batch contrast re-check (`check_contrast.py` equivalent for the greige
  ramp), then visual QA in the real app (`run-seat-planner`) — light and dark, both map
  surfaces, login, reception.

---

## 8. Marker-state 1.4.1 audit (pre-implementation evidence, 2026-08-21)

WCAG 1.4.1 check of every marker state's non-colour signal, from `SeatMarker.tsx` (shipped
`viewer` branch; both map surfaces share it). Universal but non-distinguishing signals: seat-code
text, title tooltip, status-bearing aria-label (`:456,468`) — these serve AT but do not cure a
visually hue-only pair.

| State | Non-colour signal | Verdict |
|---|---|---|
| assigned | ● presence-coded dot (`:486`, deliberate colourblind intent) + occupant name | PASS |
| available | unmarked member of the dot pair | PASS vs assigned |
| reserved | none | **FAIL** (1.18:1 vs available fill, 1.10:1 vs unavailable) |
| unavailable | none | **FAIL** (1.30:1 fill / 1.76:1 text vs available) |
| draft-changed | "D" badge glyph (`:492`) | PASS |
| selected | 17.47:1 luminance inversion + size jump + name + aria-pressed | PASS |
| search | size promotion + name reveal + ring/glow structure | PASS (hue-only vs viewer green highlight — caveat) |
| target-valid | none — resting geometry; hover ring fires on invalid too (`:346`) | **FAIL** |
| target-invalid | none — fills 1.01:1, borders 1.05:1 vs valid, identical geometry | **FAIL** |

Four failures (reserved, unavailable, target-valid, target-invalid). Fixing them requires new
glyph/pattern design (out of Pass 1's no-visual-change scope) → proposed as **Pass 1.5 / PR-C**:
e.g. reserved = hold glyph or dashed border; unavailable = strike/hatch treatment + `cursor:
not-allowed`; target-valid/invalid = ✓/✕ affordance glyphs (and exclude invalid targets from the
`:346` hover ring). Design pass required before implementation; the two-signal rule
(colour + shape/symbol) is the acceptance bar.

## 9. Execution split — two PRs

**PR-A — the §5 value fixes, alone.** Values change on *existing* token names; zero renames,
zero test-name churn, revertible in isolation:
1. `--sp-focus-ring-color`: `rgb(255 87 21 / 0.9)` → solid `#D23F0A`; add dark-theme override `#FF8A5C`.
2. `--admin-focus`: `#FF5715` → `#D23F0A` (dark zones/theme `#FF8A5C`).
3. `--admin-marker-focus-ring`: `rgba(255,87,21,.75)` → solid `#D23F0A` (white offset ring unchanged).
4. Button-text guarantee: no shipped surface changes value (the CTA ladder already carries
   white legally); add a source test pinning that no `text-white` co-locates with a raw
   `#FF5715` / `var(--admin-primary)` fill, and document `--admin-primary-ink` as the raw-orange
   text pair.
Verification: batch contrast check of the new pairs (§5 tables already measure them), then
live QA — tab-through on light + dark, both map surfaces, login, reception.

**PR-B — the renames (§3), nothing else.** Pixel-identical by construction. Sequenced by
family (chrome zone → statuses → markers → login/reception zones), each landing globals.css +
call sites + `tailwind.config.ts` + the §7 test files together. The 8 consumed hex/rgb
disagreeing twins (⚑1) stay under their old names, parked, so PR-B's no-visual-change claim
holds without waiting on the owner ruling; the other 38 twins delete as planned.

Order: A before B — the accessibility fixes must not be buried in (or reverted with) a
3,000-line mechanical rename.
