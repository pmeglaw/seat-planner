# Carbon Shell — Refinement Brief (owner-directed)

**Owner:** Patrick · **Date:** 2026-07-21 · **Status:** direction LOCKED — perfect, do not replace
**Authority:** `docs/DESIGN_DIRECTION.md` + prototype `docs/ui/seat-planner-shell.html` (visual source of truth)
**Scope:** presentation-layer refinement only. No business logic, data, security, or coordinate-math changes. `SeatMarker` stays protected; the raster floor plan stays raster; AA contrast (≥ 4.5:1 body) and all guardrail source-tests stay green.

The Carbon Shell is the right direction. This brief tightens four things the owner flagged — **top chrome, search bar, filter, and color discipline** — *within* the Carbon look (IBM Plex, dark shell `#161616`, flat/square, sparing orange accent).

---

## Target 1 — Colors: too many hues and shades (highest priority)

### Current state (measured from `app/globals.css`)
- **59 distinct hex values** in one stylesheet.
- **Three overlapping token namespaces** aliasing the *same* colors: `--ml-*` (5), `--sp-color-*` (~90), `--admin-*` (~140, incl. ~60 `--admin-marker-*`). Example: `#161616` is defined under `--ml-ink`, `--sp-color-text-primary`, `--sp-color-workspace`, **and** `--admin-chrome-bg`. `#C94A12` lives under `--ml-orange-cta`, `--sp-color-brand-copper`, `--sp-color-action-primary`, **and** `--sp-color-state-selected`. That's why it *reads* as far more colors than it is.
- **Shade sprawl inside single families:**
  - Greens: **6** — `#1d6e41 #24a148 #42be65 #284c3b #a9d7b8 #def3e4`
  - Teals: **7** — `#31626a #2f6668 #244e50 #a9cdd2 #a9cfcc #dcedea #e0eef0`
  - Ambers: **6** — `#8a6116 #f1c21b #e0c46e #6d4712 #684e00 #fcf4d6`
- **A real inconsistency:** the header comment says orange is "the search/filter highlight," yet a *separate* teal `--sp-color-state-search` (`#2F6668`) family also exists — two near-identical teals (`#2F6668` search vs `#31626A` info) doing similar jobs. Classic "too many shades of the same color."

### The problem
Not the neutrals — the IBM-gray ramp is correct Carbon. The sprawl is: (a) **7 accent hue families** in play (copper, green, amber, red, **two** teals, plus grays), (b) **ad-hoc shades** generated per component instead of reused, and (c) **three parallel namespaces** for the same hexes.

### Target — one disciplined Carbon palette (~59 → ~24 hexes)
Carbon's own status palette is one blue / one green / one yellow / one red / grays. We keep that discipline and swap Carbon blue for the firm's orange.

| Role | Keep | Retire / fold in |
|---|---|---|
| **Neutrals** (IBM gray, one ramp) | `#161616 #262626 #525252 #6f6f6f #8d8d8d #a8a8a8 #c6c6c6 #e0e0e0 #f4f4f4 #ffffff` | Warm neutrals as separate tokens (`brand-paper #FBEAE1`, `brand-ivory`, `brand-clay`) — the map's cream is baked into the raster, not a UI neutral |
| **Brand accent** (one orange family, used sparingly) | **`#FF5715`** identity/selection/focus/**search+filter highlight** (ink `#161616` on it ≈ 5.7:1; **~3.2:1 on white → never white text**) · white-label fill **`#D23F0A`** (4.71:1) · hover **`#B83708`** (5.85:1) · pressed **`#9E2F06`** (7.33:1) | one matched-hue (17°) orange ladder — replaces both the old `#F15A24` accent **and** the copper `#C94A12` CTA |
| **Success / Published** | fill **`#24A148`** (dot/bar/badge — **ink label**, 5.40:1) · text **`#1D6E41`** on light/soft (6.25 / 5.37:1) · surface `#DEF3E4` | `#42be65 #284c3b #a9d7b8` extras |
| **Warning / Draft** | fill **`#F1C21B`** (dot/bar/badge — **ink label only**, 10.75:1; white fails 1.68:1) · text **`#8A6116`** on light/soft (5.52 / 5.01:1) · surface `#FCF4D6` | `#684e00 #6d4712 #e0c46e` extras |
| **Danger / Error** | fill **`#DA1E28`** (badge — **white label**, 5.00:1) · text **`#A2191F`** on light/soft (7.79 / 6.66:1) · surface `#FBE9EA` | `#b3232c #fa4d56 #ff8389` variants |
| **Info** | **none — fold into neutral gray** (merge with the existing `state-planner`: text `#525252` · surface `#f4f4f4` · border `#c6c6c6`) | **Delete BOTH teals** — `state-info #31626A` *and* `state-search #2F6668`. Search/filter highlight = the orange accent |

**Status roles (Carbon model, owner-set 2026-07-21):** each hue plays three roles — a **bright fill** (`#24A148` / `#F1C21B` / `#DA1E28`) for dots, bars, and badges; a **dark text** variant (`#1D6E41` / `#8A6116` / `#A2191F`) for status text and icons on light or soft surfaces; and a **soft surface**. Bright fills can't hold white text (green 3.35:1, yellow 1.68:1) — labels on the green and yellow fills use **ink `#161616`**; only the red fill takes white (5.00:1). All values WCAG-verified.

**Structure fix (do this too):** collapse to a **2-tier system** — raw primitives (`--sp-color-*` ramp) → semantic aliases that *reference* them. `--admin-*` and `--admin-marker-*` must **reference primitives, never redefine hexes**. Delete `--ml-*` (fold into brand primitives). The ~60 `--admin-marker-*` tokens keep their functional seat-state meaning but derive from the 3 status hues + brand + neutrals rather than carrying their own hexes.

**Guardrail:** several hexes exist to hit measured AA on soft surfaces (the `-on-soft` text partners). Consolidation = "one hue family with its AA-text and one soft surface, reused everywhere" — **not** naive deletion. Keep one AA-text partner per family; re-check the measured-contrast comments in `globals.css` after any change. Body text stays ≥ 4.5:1.

**Accent swap (owner, 2026-07-21):** the brand orange moves `#F15A24` → **`#FF5715`**, and the deepened CTA is re-hued from the old copper `#C94A12` to a **matched 17° ladder** so the whole button family reads as one orange. Values below are WCAG-verified (computed, not eyeballed):

| Token role | Hex | rgb | Contrast |
|---|---|---|---|
| accent — identity / selection / focus / search highlight (**ink text only**) | `#FF5715` | `255 87 21` | 3.17:1 white · **5.71:1 ink `#161616`** |
| cta — primary fill, white label | `#D23F0A` | `210 63 10` | **4.71:1 white** |
| cta — hover | `#B83708` | `184 55 8` | 5.85:1 white |
| cta — pressed | `#9E2F06` | `158 47 6` | 7.33:1 white |

At implementation, in `app/globals.css`: set `--ml-orange-signature` / `--sp-color-brand-accent` / `--admin-primary` → `#FF5715`; `--sp-color-action-primary` → `#D23F0A`, `-hover` → `#B83708`, `-pressed` → `#9E2F06`; retire `--ml-orange-cta` / `--sp-color-brand-copper`; refresh every `*-rgb` partner and the measured-contrast comments; move `--sp-focus-ring-color` onto the `#FF5715` hue. Update the `#F15A24` references in `docs/DESIGN_DIRECTION.md` too. The hero Publish button keeps **ink `#161616` text** on `#FF5715`.

**Implementation status (2026-07-21):** the orange swap is **applied in code** — `app/globals.css` (every `--ml-*` / `--sp-color-*` / `--admin-*` orange token, the `rgb`/`rgba` partners, both focus rings, and the measured-contrast comments) plus the one hardcoded avatar gradient in `components/seat-map/SeatInspector.tsx`. CSS re-verified (PostCSS parse clean, braces balanced). Status fills (`#24A148` / `#F1C21B`) and their dark text partners already match this brief in code — no change needed. **Teal removal is intentionally staged for the implementation PR:** the search highlight's teal (`#2F6668`) is hardcoded inside the *protected* `SeatMarker` and guarded by `desktop-seat-marker-system-source`, so it must be re-hued to the accent there with the marker test run — a globals-only edit would leave viewer search markers teal while admin ones went gray. Also still for the PR: `docs/DESIGN_DIRECTION.md` copy, the `--ml-*`→primitive namespace collapse, and the `#F15A24` mentions in this repo's other docs.

---

## Target 2 — Top chrome: crowded, icon/label heavy

### Current state (`components/seat-map/SeatMap.tsx` map header — the crowded one; `AdminShellBar.tsx` sub-page bar is already lean)
A single **40px** dark bar packs: brand chip · section nav (Seat map / Management / Settings) · **Command search** · **Undo** · **Redo** · **names toggle** ("Show/hide occupant names") · **More tools** overflow · **Viewer/Admin** surface toggle · **Publish** + **Publish status** — plus a separate mobile "Canvas search" and "More map actions." Every item pairs an icon *and* a text label.

### Target (within Carbon)
- **Primary row = only the top jobs:** search, the active-tool set, and **Publish** (the hero action). Publish keeps the accent `#FF5715` + ink text; everything else is quieter. *(Superseded 2026-07-31: Publish moved to the CTA ladder — v12 owner decision 2a.)*
- **Push secondary tools into the existing "More tools" overflow:** names toggle, and undo/redo if the row is still tight (or group undo/redo as a single segmented control). The overflow pattern already exists — use it harder.
- **Reduce icon+label doubling:** Carbon convention — labels for primary text nav; icon-only (with tooltip + `aria-label`, already present) for secondary tool buttons. Don't show both for every control.
- **One divider rhythm, one underline:** keep a single active-underline per bar (the code already fixed a duplicate-underline bug — hold that line).
- Keep the 40px height and dark `#161616` continuity between bar and inspector.
  **Superseded 2026-07-22:** the bar is now **48px**. The owner chose Carbon `md`
  (40px) fields over the `sm` (32px) proposed in Target 3 below, and a 40px field
  cannot sit in a 40px bar without touching both edges. The `#161616` continuity
  is unchanged.

---

## Target 3 — Search bar: too narrow

### Current state
- Admin map search/filter field: `h-[26px]`, filter control capped `lg:max-w-[340px]` (`SeatMap.tsx:2457`); command search flexes but competes in the crowded bar (`:2509`).
- Viewer: search **and** filter share **one** bordered container capped `lg:max-w-[340px]`, `h-[26px]` (`ViewerSeatFinder.tsx:777`).
- **26px is below Carbon's smallest field** (Carbon fields are 32 / 40 / 48px), and 340px shared with the filter is cramped for "find your seat / look up a person" — a *paramount* user job.

### Target
- Give search its **own** field, not a box shared with the filter.
- Raise the field height to **Carbon `sm` = 32px** (fits inside a 40px bar with padding), keep flat/square.
  **Superseded 2026-07-22:** shipped at **Carbon `md` = 40px**, with the bar grown
  to 48px to hold it. Filter matches Search so the paired controls align.
- Widen the cap: allow **~420–560px** on `lg` where space exists; on the viewer, search is a primary job — let it dominate the row.
- Carbon search affordances: leading search glyph, clear (✕) affordance (already present), visible focus ring in brand orange.

---

## Target 4 — Filter: needs refinement

### Current state
`components/seat-map/FilterPanel.tsx` (170 lines) renders inside the same 26px, 340px-capped bordered container as search (`data-filter-ui`, `SeatMap.tsx:2457`; viewer shares it entirely). The filter reads as a cramped sibling of search rather than a distinct control.

### Target
- **Separate the filter from the search field** visually — a distinct Carbon control (dropdown/menu button or a small filter chip-set), 32px tall, flat/square.
- Make the **applied-filter state legible** — show active filters as removable Carbon tags rather than hiding them in a narrow box.
- **This is where the missing admin job lands:** *cluster employees by position into zones.* The filter (and the Management flow) should let an admin filter/group by `position` and act on the group — surface `position` as a first-class filter facet alongside department/zone. Confirm the workflow, not just the schema (`employees.position`, `seats.zone` exist; the grouping UX may not).

---

## Definition of done (for the refinement)
- Palette reduced to the consolidated set above (**~24 hexes; no teal — three status hues, info = neutral gray**), one 2-tier namespace, `--ml-*` gone, `--admin-*` referencing primitives; no new hues, no third neutral. AA re-verified against the `globals.css` contrast comments.
- Top chrome: primary row limited to search + active tools + Publish; secondaries in overflow; no icon+label doubling on secondary buttons.
- Search: own field, ≥ 32px tall, wider cap on `lg`.
- Filter: distinct control with legible active-filter tags and a `position` facet supporting cluster-by-position.
- All flat/square, IBM Plex, `#161616` shell preserved; `SeatMarker`, raster map, calibration untouched; guardrail source-tests + coverage floors green.
