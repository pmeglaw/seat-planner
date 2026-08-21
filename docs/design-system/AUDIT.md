# AUDIT.md — Design-System Adoption, Pass 0

Read-only audit for a prospective IBM Design Language / Carbon adoption. No code was changed.
Counts were gathered with ripgrep over `app/`, `components/`, `lib/` (133 TS/TSX files), excluding
`app/concepts/` (prototype-only, flag-gated) unless stated. Counts marked "~" are exact match counts
of a pattern, which is the honest precision level — a few comment false-positives are called out where found.

Important framing up front: **this codebase already went through a deliberate Carbon-v12-inspired
redesign** (the "Carbon v12" slices, owner-ratified, prod-verified — see code comments and
`plans/` history). So "matches Carbon by accident" below is mostly "matches Carbon on purpose,
via a hand-rolled token layer instead of `@carbon/react`". There are **zero** `@carbon/*` or
`@ibm/*` dependencies in `package.json`.

---

## 1. Screens and routes, and who reaches them

### Shipped surfaces

| Route | Surface | Who can reach it | Data layer read |
|---|---|---|---|
| `/` | Viewer map (`ViewerSeatFinder`) | Any **signed-in** user (redirects to `/login?next=/` otherwise); both roles | `layer='published'` seats + `published_employees` snapshot only |
| `/my-seat` | Personal seat sheet | Any signed-in user | Published layer + snapshot only |
| `/admin` | Seat map editor (`SeatMap`) | Signed-in **admin** (`getAdminPageContext`); non-admin gets an in-page "no admin permissions" screen, not a redirect | Draft layer (edits) + published (read-only context) |
| `/admin/management` | Employee/department/zone data | Signed-in admin | Live `employees` (admins' working set) |
| `/admin/settings` | Data utilities (CSV, snapshots, reset-draft) | Signed-in admin | Draft + snapshots |
| `/reception` | Front-desk call-routing directory | Any signed-in role, read-only | Published |
| `/login` | Single-surface login form | Public | — |
| `/auth/update-password` | Password update page | Via PKCE link | — |
| `/auth/confirm`, `/auth/callback`, `/auth/signout` | Route handlers (no UI) | Public endpoints | — |
| `/api/build-id` | Deploy-skew probe (JSON) | Public | — |

`/admin`, `/admin/management`, `/admin/settings`, `/reception` live in the `app/(shell)/` route
group: one persistent chrome (`AppShell` → fixed `AppRail` + `AdminShellBar`/`AppTopBar` on
sub-pages) mounted once per document load; navigation swaps only the content pane. Any Carbon
UI-shell adoption has to respect this contract (pinned by `tests/app-shell.test.mjs` and the
e2e `nav-shell` spec).

### Prototype-only routes (`app/concepts/`, gated by `SEAT_PLANNER_ENABLE_PROTOTYPES` + noindex)

`component-state-board`, `login-v12`, `map-redesign`, `my-seat-preview`, `seat-card`,
`music-visualizer`. Not part of shipped flows; excluded from the counts below (they add
431 more hex literals if ever brought in scope).

Also present: root `loading.tsx` / `not-found.tsx` / per-section `loading.tsx` skeletons and
`app/(shell)/admin/error.tsx`.

---

## 2. How styling is done

Effectively **one mechanism: Tailwind utility classes reading a hand-rolled CSS-custom-property
token layer**, plus one global stylesheet.

| Mechanism | Rough count | Notes |
|---|---|---|
| Tailwind `className=` | 1,702 occurrences | The styling system |
| Tailwind **arbitrary-value** classes `x-[…]` | 2,820 occurrences | The dominant idiom is `text-[var(--admin-text-muted)]`, `bg-[var(--sp-color-surface)]` — tokens consumed via arbitrary values rather than named utilities |
| Named token utilities via `tailwind.config.ts` | subset | `sp-*` colors/spacing/durations, named shadows (`elevation-*`, `sp-*`), zeroed radius scale |
| Plain CSS files | 2 | `app/globals.css` (1,200 lines: the token layer, theme scopes, ~15 keyframe/scoped rules) + `visualizer.css` (concepts-only) |
| Inline `style={{…}}` | 19 | Almost all dynamic geometry (seat positioning, wash rects) — legitimately dynamic, not styling debt |
| CSS Modules | 0 | |
| styled-components / CSS-in-JS | 0 | |

Token layer: **618 custom properties** in `globals.css`, in five scoped families:
`--admin-*` (353, admin + shell chrome), `--sp-*` (181, viewer/base system), `--login-*` (41),
`--r-*` (38, reception), `--ml-*` (5, brand orange + inks). Dark mode is an app-wide
`html[data-theme="dark"]` switch that re-declares tokens per scope.

---

## 3. Hardcoded values — the size of the token migration

### Colors

- **Token layer (single source, expected):** 505 hex literals inside `globals.css` defining the
  618 properties; 3 in `tailwind.config.ts` (default border `#E7E1D8`, `brand` orange pair).
- **Scattered outside the token layer (the actual migration debt):** ~160 hex matches in shipped
  TS/TSX, of which ~30 are PR-number false positives in comments (`#276`, `#316`…) →
  **~130 real hardcoded hex occurrences, ~75 distinct values.** Top offenders:

  | Value | Count | | Value | Count |
  |---|---|---|---|---|
  | `#fff` | 7 | | `#8d8d8d` | 4 |
  | `#161616` | 7 | | `#6E655A` | 4 |
  | `#D8D0C5` | 5 | | `#353532` | 4 |
  | `#F7F6F2` | 4 | | `#262626` | 4 |
  | `#D46A24` | 4 | | `#1D6E41` | 4 |
  | `#9E2F06` | 4 | | `#070A0D` | 4 |

  …then a long tail of 1–3× greige/status values.
- **Raw `rgba()`/`hsl()` outside the token layer:** ~60 occurrences — mostly scrim/shadow alphas in
  three families: ink `rgba(23,26,29,α)` ~10×, white `rgba(255,255,255,α)` ~12×, brand orange
  `rgba(255,87,21,α)` 5×. Another ~35 are already `rgb(var(--…-rgb))` token reads (fine).

**Color migration size: small.** The heavy lifting (a semantic token layer) exists; the debt is
~190 stray literals, concentrated in the seat-map components and shadows.

### Radius

- The **named Tailwind radius scale is zeroed globally** in `tailwind.config.ts`
  (`rounded-sm`→`3xl` all = `0px`), so the 39 uses of `rounded`/`rounded-lg`/`rounded-xl`/`rounded-2xl`
  render **square** — they are dead vocabulary, not round corners.
- Actual non-zero radius: `rounded-full` ×72 (seat pills, chips, dots, avatars, count badges),
  arbitrary `rounded-[2px]`/`[12px]`/`[16px]` ×1 each, `rounded-[var(--sp-radius-*)]` ×6
  (all tokens are `0px` except `--sp-radius-full: 999px`).
- **Zero** raw `border-radius` declarations in shipped code.

### Font sizes

- Named Tailwind: `text-sm` (14px) ×99, `text-xs` (12px) ×60, `text-base` ×16, `text-lg`+ ×~15.
- **Arbitrary px sizes: ~250 occurrences across ~25 distinct values, 7.5px→46px.** Top:
  `[11px]` ×87, `[12.5px]` ×36, `[10px]` ×36, `[13px]` ×21, `[12px]` ×21, `[15px]` ×15,
  `[9px]` ×15, then half-pixel steps (`9.5`, `10.5`, `11.5`, `13.5`, `14.5`, `16.5`) and display
  sizes (`[22px]`, `[28px]`, `[42px]`, `[46px]` — the reception extension readout).
- ~17 raw `font-size:`/`fontSize:` declarations (keyframe-adjacent and dynamic label sizing).

**This is the largest migration surface**, and much of it sits *below* Carbon's 12px floor
(see §7).

### Spacing / sizing

- **442 arbitrary px/rem values** in Tailwind classes; frequent off-grid values: `[2px]` ×16,
  `[15px]` ×15, `[9px]` ×15, `[26px]` ×9, `[46px]` ×8, `[3px]` ×7, `[52px]` ×4, plus layout widths
  (`[300px]`, `[760px]`, `[520px]`…).
- The bulk of spacing uses Tailwind's default 4px scale (`p-2`, `gap-3`, …) — thousands of
  instances, tokenized to Tailwind's scale, not to `--sp-space-*`.
- A spacing token ladder exists but is barely used: `--sp-space-1..7` = 4/8/12/16/24/32/48px
  (exactly a Carbon spacing-scale subset).
- Control heights: `h-8`(32) ×26, `h-7`(28) ×12, `h-6`(24) ×11, `h-9`(36) ×8, `h-10`(40) ×8,
  `h-11`(44) ×7, `h-12`(48) ×6 — a mixed ladder; 28/36/44 are off Carbon's fixed sizes
  (24/32/40/48/64/80).

### Transitions / motion

- `transition` ×86, `transition-colors` ×26 (Tailwind default 150ms/ease), `duration-75` ×11,
  `duration-150` ×11, `duration-200` ×1, `transition-none` ×5.
- Duration tokens exist: `--sp-duration-fast/standard/deliberate` = 150/200/280ms (not Carbon's
  70/110/150/240/400/700 ladder).
- 4 distinct `cubic-bezier`s in source; notably `cubic-bezier(0,0,.38,.9)` — **Carbon's productive
  entrance curve, verbatim** — in the map-trail and chrome entrance keyframes. Motion is `motion-safe:`
  gated (reduced-motion honored).

---

## 4. How the seat canvas is rendered ← the load-bearing answer

**DOM nodes over a raster image. Not `<canvas>`, not an SVG scene.**

- The floor plan is a `next/image` raster (3822×1734 webp, displayed ≤1911px, **must stay
  `unoptimized`** — stale `localPatterns` trap). Seats store normalized `[0,1]` coords;
  `lib/seatMath.pointToStyle` converts to CSS percentages; `lib/mapLayoutTransform` applies
  per-area calibration.
- **Each seat is a real `<button>`** (`SeatMarker.tsx:441`) absolutely positioned on the map,
  with a `<span>` token inside. Full CSS token styling, `:hover`, `focus-visible`, and ARIA all apply.
- Keyboard: **roving tabindex with arrow keys is already implemented** (one seat is the tab stop,
  arrows move between seats) — exactly the pattern the IBM accessibility floor prescribes for
  spatial grids. Skip link and landmark regions exist (pinned by `accessibility-source`).
- SVG appears only for (a) inline icons and (b) `DraftTrailOverlay` — a `pointer-events-none`
  absolutely-positioned SVG that draws moved-seat trails. `MapWashLayer` (zone/room washes) is
  plain positioned `<div>`s. The only `<canvas>` in the repo is the music-visualizer concept.

**Consequence:** CSS tokens, focus management, contrast tooling, and screen-reader semantics are
fully available on every seat. A Carbon token swap does not require re-architecting the map.

**One structural caveat:** there are **two parallel map surfaces** sharing `SeatMarker` —
`SeatMap` (admin, 3,511 lines) and `ViewerSeatFinder` (viewer, 1,554 lines). They are *not* the
same component (known parity trap). Any marker/chrome restyle must land on both.

---

## 5. The real seat state model (data layer)

From `supabase/migrations/001_initial_schema.sql` + `010_v107_seat_protection.sql`:

- **`seats.status`** — Postgres enum `seat_status`: `available | assigned | reserved | unavailable`.
  UI names come from ONE map, `STATUS_LABELS` in `lib/types.ts`: **Open / Assigned / Reserved /
  Unavailable**.
- **What drives `assigned`:** a CHECK constraint makes it equivalent to employment:
  `status='assigned' ⇔ employee_id IS NOT NULL`. Status is not free-floating UI state — it is the
  assignment relation.
- **`seats.layer`** — enum `seat_layer`: `draft | published`. Two full parallel copies of the map
  (unique on `(layer, seat_key)`; one draft seat per employee).
- **`seats.is_custom`** — boolean; original (non-custom) draft seats cannot be deleted
  (`seatProtection` in TS + a SQL trigger, both pinned by tests).
- **`seats.updated_at`** — maintained by trigger; the draft-concurrency fence (SQLSTATE `MLS02`)
  rides on it. Not a display state, but it shapes UI (stale-draft notices).
- **`employees.active`** — boolean; deactivation is the removal path. Viewers never read
  `employees` — they read the **`published_employees` snapshot**, replaced atomically by
  `publish_seat_map()`.
- **`profiles.role`** — enum `admin | viewer`.

**Render-layer states with no DB column** (derived per frame; the `MarkerIntent` union in
`SeatMarker.tsx` names 12): `draft-changed` (diff vs published), `search-result`,
`search-selected`, `selected`, `swap-source`, `swap-target`, `target-valid`, `target-invalid`,
plus AI `highlighted` and `dimmed`. A future Carbon status-indicator mapping has to cover the
4 persisted statuses **and** these 8+ interaction intents.

---

## 6. Where the draft/published split shows up in the UI

The split is **structural before it is visual**: draft data never reaches a viewer client, so the
viewer needs almost no layer signaling.

**Viewer surfaces** (`/`, `/my-seat`, `/reception`):
- Always published; the seat sheet carries an explicit "Published" label (`SeatSheet.tsx:433`);
  the last-updated timestamp *is* the publish moment; the rail item is titled "Viewer — published
  map"; login copy states "Viewers see the published map; admins can edit the draft."

**Admin surface** (`/admin` edits draft; published is read-only context):
- **"Draft · N changes" pill + a Publish button with a change-count badge**, portaled into the
  persistent top bar — rendered **only when `publishSummary.hasChanges`** (`SeatMap.tsx:2832-2848`).
- `DraftTrailOverlay` draws trails from published position → draft position for moved seats.
- A `draft-changed` marker intent and a "draft-changed" entry in the shared `MapStatusBand` legend.
- The publish dialog reviews the full diff (added/updated/removed seats + pending people edits via
  `employeeDetailChanges`), and states that viewers keep seeing the current published map until publish.
- Settings ("reset draft to published") and Management ("The published map everyone sees won't
  change until you publish") repeat the model in copy.

**How a user tells which layer they're on:** viewers can't be on the wrong one; admins are always
on draft, and the *divergence* (not the layer) is what's signaled — via the change-count pill.
When draft == published, the admin map shows **no** layer badge at all. If Carbon status indicators
are adopted, this "signal the delta, not the mode" choice is an owner-ratified pattern to preserve,
not an omission.

---

## 7. What already matches Carbon, and what will fight it

### Already matching (mostly deliberate — the prior "Carbon v12" pass)

- **IBM Plex Sans + Plex Mono, vendored and shipping** (`app/fonts/`, `next/font/local`). The
  actual brand typefaces are already in.
- **Zero border radius on chrome** — the Tailwind radius scale is zeroed globally; square is the
  default shape language. Pills/dots (`rounded-full`) are the only exception.
- **Semantic token architecture** — 618 custom properties, one place to restyle, `data-theme` dark
  switching. Same architecture Carbon themes use; friendly to the v12 DTCG rename.
- **Carbon palette values already present**: `#161616`/`#262626`/`#525252`/`#8d8d8d`/`#e0e0e0`/`#e8e8e8`
  (gray 100/90/70/50/20 + hover step), `#24a148`/`#42be65` (green 50/40), `#78a9ff` (blue 40),
  `#ff8389` (red 40), `#08bdba` (teal 40) — mostly in the dark theme and login.
- **Accessibility floor**: roving tabindex + arrows on the map grid, skip link, landmarks,
  `focus-visible` everywhere, Escape-closes, two-signal status (legend dot + label; markers carry
  shape/text, never color alone), measured contrast ratios documented in `globals.css` comments,
  reduced-motion honored. These are exactly IBM's non-negotiables, already test-pinned.
- **Motion sensibility**: Carbon's productive entrance curve verbatim in the chrome/trail
  keyframes; short one-shot, one-axis entrances; nothing bounces.
- **Pattern instincts**: buttons named for the action ("Publish", not "Submit"); danger dialogs
  with consequences spelled out and review-before-mutate on bulk operations
  (`bulk-destructive-action-safety-source`); inline notifications in the working region;
  gray-dominant surfaces with color reserved for meaning.
- **UI shell shape**: fixed left `AppRail` + top `AppTopBar` ≈ Carbon UI Shell's left nav + header.

### Will fight Carbon

1. **The brand primary is orange `#FF5715`, owner-ratified and immovable** (standing ruling; the
   family is signature `#FF5715` / hover `#E64E13` / CTA `#D23F0A`). Carbon's core rule — blue 60
   is the *only* primary action color — cannot be adopted literally. Orange also sits in Carbon's
   documented contrast-trap zone (orange 40/50 fail 3:1 as drawn marks on light surfaces);
   the app already compensates by darkening the CTA, but any re-tokenization must run the contrast
   script on the whole orange family, hover surfaces included.
2. **The type ramp**: ~250 arbitrary px sizes, heavily **below Carbon's 12px floor**
   (7.5–11.5px across markers, badges, micro-labels) and on half-pixel steps. Carbon's fixed set
   starts at `label-01` 12/16. Forcing the floor grows every seat pill — and at the tightest seat
   pitch (~0.032 normalized) the marker system already needs collision nudges, so bigger pills
   mean more collisions. This is a design problem, not a find-and-replace.
3. **The warm greige neutral ramp** (`#F7F6F2`, `#E7E1D8`, `#D8D0C5`, `#6E655A`…) is a custom
   temperature between Carbon's Gray and Warm Gray families. Swapping to a stock Carbon gray family
   changes the ratified brand feel; keeping greige means maintaining a parallel neutral ladder and
   losing Carbon's count-the-steps contrast arithmetic.
4. **Focus treatment**: 4px orange ring with 2px offset (viewer tokens) / `--admin-focus: #FF5715`
   vs Carbon's 2px inset `$focus` (blue on light, white on dark). The tests pin focus *presence*,
   not style — changeable, but it is a recently owner-retuned decision (focus-offset retune v1.52.2).
5. **Spacing granularity**: Tailwind's 4px default scale plus dozens of odd/fractional values vs
   the 8px mini-unit and the permitted-multiples rule; control heights 28/36/44px off Carbon's
   fixed-size ladder.
6. **Motion tokens** 150/200/280ms don't match Carbon's ladder (70/110/150/240/400/700), and most
   transitions ride Tailwind's default ease rather than the productive curves.
7. **Theme scoping**: five token vocabularies (`--sp`, `--admin`, `--r`, `--login`, `--ml`) with
   one binary dark switch vs Carbon's single vocabulary × four themes (White/G10/G90/G100) with a
   layering ladder. Consolidation is its own project.
8. **`@carbon/react` components would collide** with the persistent-shell contract (portal slots,
   one rail node, zero document requests pinned by tests) and with the two-map-surface split. Token
   adoption is compatible; component adoption is not, without significant surgery.

---

## Closing summary

### Maps cleanly (adopt with low design risk)

- Typefaces (already Plex), the token architecture itself, square-corner shape language.
- The neutral *dark* theme (already largely Carbon gray grades).
- Dialog patterns (`SeatMapDialogs` → Carbon modal + danger-modal rules already in spirit),
  inline notifications, form patterns in Management/Settings.
- Motion curves (entrance curve already Carbon's) and duration re-ladder.
- Type tokens for the 14px/12px mass: `text-sm`→`body-compact-01`, `text-xs`→`label-01`
  (~159 instances convert mechanically).
- Spacing tokens for everything already on 8/16/24/32/48.
- UI shell mapping: `AppRail`/`AppTopBar` → Carbon header + left-nav *styling* (not components).
- Disabled/read-only/hidden semantics: the viewer's read-only-by-architecture model and the
  admin non-admin screen already match the pattern; no disabled-content-that-needs-reading abuses found.

### No Carbon equivalent — needs designing

- **The seat-marker system**: stadium pills, office door-plates, density tiers, collision nudges,
  12 interaction intents, name/code modes. Carbon has status indicators and tags, not a spatial
  seat language. This is the flagship custom pattern; Carbon can inform its tokens (status colors,
  two-signal rule — already honored) but not replace it.
- The floor-plan raster + calibration layer (hard constraint: **no SVG floor plan**).
- `DraftTrailOverlay`, the publish pill / change-count chrome, and the whole
  "signal the delta between draft and published" language.
- `MapStatusBand` (container-query legend/toolbar hybrid).
- Ask Planner drawer (Carbon for AI is a direction, not a shipped spec — see `carbon-next`).
- Reception's 46px/600 Plex Mono extension readout (off the type ramp, and Carbon reserves Mono
  for code/specs — deliberate product choice to keep).

### Will break (or bite) if we start swapping tokens

- **Contrast anchors**: `globals.css` documents measured ratios; the a11y tests enforce floors, not
  palettes — swap freely, but re-run contrast in batch (orange family and *hover* surfaces
  especially) or regressions ship silently.
- **Sub-12px type**: any Carbon type-token sweep that enforces the 12px floor changes marker
  geometry → collision behavior → the crowding logic (`lib/seatCrowding`). Do markers last, as a
  design pass, not a token swap.
- **Two map surfaces**: `SeatMap` and `ViewerSeatFinder` must change in lockstep or the viewer and
  admin drift apart.
- **Tailwind shadow trap** (documented in `tailwind.config.ts`): `shadow-[var(--…)]` silently ships
  `box-shadow: none` in Tailwind v3 — every new shadow token needs a *named* utility.
- **`border-current/<alpha>`** is a Tailwind 3 no-op (standing trap); avoid in any restyle.
- **Owner rulings that a token pass must not re-litigate**: `#FF5715` stands; glass/luxury re-skins
  rejected; scroll-behavior contract (#427); chrome unification doctrine (`adminChrome.ts`);
  the Carbon-v12 look itself is the owner's kept direction.
- **Guardrail tests that will (correctly) trip on a careless swap**: `accessibility-source`
  (focus/keyboard/dialog semantics), `desktop-seat-marker-system-source` (calibration constants,
  no data/route crossing), `seat-creation-ui-source`, `auth-session-source` (shell contract).
  Visual values are free; those lines are not.
- **Floor-plan `next/image` must stay `unoptimized`**, and any raster re-render must bump
  `MAP_IMAGE_SRC`'s `?v=` and regenerate the blur placeholder.
