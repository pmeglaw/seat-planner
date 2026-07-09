# Design direction — Phase 3.5 (Ember Studio)

**Status:** owner-requested palette revision dated **2026-07-09**. The Phase 3 palette ("Counsel Ink", the light cream/ivory theme signed off 2026-07-08) was **rejected by the owner**; the direction is now **"Ember Studio" — a dark UI with Ember orange `#F45B2A` as the single primary brand**. Everything structural from Phase 3 stands unchanged: the docked inspector (§2.1), the filter bar (§2.2), the Plate & Dot marker system (§2.3), the chrome layout (§2.4), and the flagged behavior items (§6). Only the color system changed, and it was re-validated live on the gated prototype route on 2026-07-09. **Awaiting owner sign-off on the dark look before Phase 4 implements; nothing in this phase touched shipped surfaces.**

**Artifacts**

| Artifact | Where |
| --- | --- |
| Figma file | https://www.figma.com/design/iFa1DEChHFeSypR7spEhpM — structure still authoritative (marker/inspector anatomy on page 03, screens on page 04); the page 02 token *values* carry Counsel Ink and are **superseded by §3 of this doc**. Re-skinning the Figma pages is Phase 4 work if wanted. |
| Live-code preview | `app/concepts/map-redesign/` — gated by `SEAT_PLANNER_ENABLE_PROTOTYPES=true` (404 in prod; the gate was re-confirmed live: a production build without the flag prerenders the route as 404). Real 60-seat published dataset at true calibrated coordinates through the production `seatsToVisualSeats` → `pointToStyle` chain. **Re-validated on Ember 2026-07-09**: docked reflow, teal search + 40% dim, filters + chips, demo reserved/unavailable states, names-off initials, keyboard focus ring on markers, viewer/admin toggle, mobile sheet; typecheck, lint, 198/198 tests green; no shipped file modified. |
| Validation screenshots | `docs/design-review/ember/` — desktop admin (default, inspector, search, filters, demo states, names off, marker focus), viewer (desktop + inspector), mobile (admin, sheet, viewer), and 2× marker close-ups on the real floor |
| Before-state baseline | `docs/design-review/after/` (captured at PR #81; deltas to main: #82 bone pills, #84 brand logo) |

---

## 1. Principles

1. **The map is the hero; chrome is the frame — gallery style.** The floor plan is a fixed light raster; the app around it goes dark (`#090A0C` canvas, `#111316` chrome), so the map reads as lit artwork in a dark room. Nothing may cover the canvas on desktop — panels reserve layout instead of floating over seats (INV-6 extended from filters to the inspector). Glass chrome never floats over the map (measured: muted text on glass-over-floor is 3.62:1 — fails).
2. **People pop, empty seats recede.** Two-tier marker language: occupied seats are name plates, open seats are quiet dots. Status is never color-alone (≥2 channels: hue + shape/glyph).
3. **One orange.** `#F45B2A` is THE brand orange — Publish, assigned seats, brand moments — with a single ramp: `#FF7138` hover, `#D94A1F` pressed, `#A93818` deep (borders/halos on light contexts). **Ink `#140D04` is the locked text color on every orange fill** (5.85:1 rest / 7.04 hover / 4.54 pressed; white fails at 3.29). Orange is never used for hierarchy — weight/size/space do that.
4. **Sentence case everywhere.** The viewer's ALL-CAPS tracked micro-labels are retired.
5. **Cool dark neutrals; floor-measured states.** Every neutral is a cool slate-dark (`#181B20` panels → `#48515E` strong borders); the warm ivory/paper family is retired. On-floor state colors are **re-derived against the real floor pixels** (see §5's two-layer rule), not assumed tones; dark-chrome state chips pair a 16% base tint with light state text. The teal search identity carries forward, ring deepened to `#1D4042` for the floor.
6. **Accessibility is the only frozen guardrail.** Every text pair ≥ 4.5:1, every meaningful graphic ≥ 3:1 — measured, recorded in §5, and baked into token values rather than checked after the fact.

**Relationship to prior work:** Ember Studio returns the shell to a **cool** dark — deeper than the shipped charcoal (`#1F2225` → `#090A0C`/`#111316`) — reversing Counsel Ink's warm-espresso move while keeping every Phase 3 structural decision (docked inspector, filter bar, Plate & Dot, both-surface shell). The judged teal search identity survives (deepened on-floor); the four-orange collapse survives with a new anchor (`#F45B2A` replaces `#F26E22`); Counsel Ink's ivory/paper/copper/clay family is retired. This is an owner-requested revision: the cream direction was rejected 2026-07-09 in favor of the owner's Ember Studio spec, whose values were then verified and adjusted by measurement (§5).

## 2. The four priority problems — solutions

### 2.1 Inspector: docked, complete, never covers the map

- **Desktop ≥ 1140px:** selecting a seat opens a **360px right dock that reserves layout** — the canvas grid gains a column and the map resizes beside it (animated, `motion-reduce` guarded). The floating `fixed right-3 top-[84px]` overlay is retired on both surfaces. 900–1139px: dock narrows to 320px. **< 900px:** non-modal bottom sheet, max 45% height; the map auto-pans the selected seat into the visible strip (fixes the "sheet hides the selected seat" critique).
- **Complete person record** (viewer and admin): avatar + name, status chip, custom-seat chip, then **Job title · Department · Email · Extension · Zone · Seat**, with em-dash for missing values. Notes and Move/Swap/Vacate/Change-assignment are admin-only. Viewer variant is the same anatomy, read-only — replacing today's sparse bottom-of-rail card that omitted extension and title.
- **Email is a data-model gap** — see §6. The row ships as "Not in directory" until the flagged column lands.
- Semantics: dock is `role="complementary"`, no focus trap; Esc closes; markers keep `aria-pressed`.

### 2.2 Filter: a persistent filter bar, shared with search

- The floating left-rail panel (native selects in a mostly-empty slab, covering the map) is replaced by a **44px filter bar directly under the app bar**: Department / Zone / Status dropdown-chips + **removable active-filter chips** + Clear, with the live legend + counts right-aligned (`Assigned · 6  Open · 54  Reserved · 0`), which double as status filters.
- Filtering and search share one highlight pipeline: matches go teal, non-matches dim to 40%.
- **The viewer gets real filters for the first time** (today it only has quick chips that seed the search box). Mobile: the bar becomes a horizontally scrollable chip row.

### 2.3 Seat markers: the "Plate & Dot" system (Ember values)

- **Open seat:** 16px **white dot with 2px `#3E4650` slate ring** — the white casing + dark ring pair is what clears 3:1 on every measured floor patch (§5); seat code appears as a tag on hover/focus (dark `#22262D` chip, light text). **Custom seat:** dashed ring (a distinct visual state). **Occupied (assigned):** name plate in **brand orange `#F45B2A` with 1.5px `#A93818` border and ink `#140D04` text + status dot** (ink text 5.85:1; border 3.04:1 worst-case vs the floor). Names-off mode collapses plates to initials chips (same anatomy).
- **Selected:** **2px ink `#140D04` ring + `rgba(244,91,42,.35)` ember glow** + elevation + 1.06 scale (motion-safe), raised above neighbouring plates (plates collide at real density — the selected one always wins z-order; verified live at W08/W09). The ink ring is the measured replacement for the spec's `#FF7138` ring, which hit 1.00:1 on the worst floor patch; it clears ≥5.11:1 on every seat and ≥5.85:1 on every plate fill, while the glow keeps the moment orange. **Search/filter match:** teal `#DCEDEA` tint + `#1D4042` ring/text; non-matches dim 40%. **Reserved:** cream `#FBEED3` plate with `#7A4E00` border/dot/tagword (spec's `#F59E0B` measured 1.01:1 on the floor — rejected). **Unavailable:** white dot + `#6B7280` muted ring + **ink strike glyph** (the strike doubles as the dark contrast layer). **Draft-changed (admin):** ink corner tick (shape + position channel; final geometry in Phase 4). Admin mode states carry the 13-state taxonomy forward on the same two-layer rule — target-valid pairs a light tint with floor-safe green `#166534`, target-invalid a neutral plate with brick `#963D2F` accent, move-origin a dashed ring.
- Full specimen close-ups on the real floor: `docs/design-review/ember/marker-closeup*.png`. Hit target ≥ 40px (invisible hitbox around dots; note: at 390px width the 40px hitboxes of adjacent pod seats overlap — one more reason mobile defaults names off, §4). **All marker colors move to the `--sp-marker-*` token family** — the hardcoded hex in `SeatMarker.tsx` and the dead `--admin-marker-*` `variant="admin"` branch are both retired (see §7).
- True coordinates and the calibration transform are untouched — the preview renders through `lib/seatMath` + `lib/mapLayoutTransform` to prove it.

### 2.4 Top chrome: Ember glass, on both surfaces

- **56px glass app bar** — `rgba(17,19,22,.72)` + `blur(20px)` over the dark canvas only, hairline `rgba(255,255,255,.08)` bottom border: brand mark on its white tile + "Megeredchian Law / Seat planner · {surface}", draft chip (amber tint, `#EFB868` text) or "Published · read-only" chip (green tint, `#8FD0AE`), centered ⌘K search (raised `#22262D` field), Undo/Redo · Management · Ask Planner (admin), **Review & publish** in `#F45B2A` with **ink text** (hover `#FF7138`, pressed `#D94A1F`), avatar (orange tint + `#FFB694`).
- **The viewer finally gets the app shell**: its big white title block, stat tiles, and raw-Tailwind styling are replaced by the same chrome + filter bar, freeing ~180px of vertical space for the map.
- Canvas goes near-black `#090A0C`; panels go dark `#181B20`; the map sits on a dark panel mat with a deep shadow — **dark shell, dark organs, lit map** (replaces Counsel Ink's "dark shell, warm organs"). Cards may use glass `rgba(24,27,32,.85)` over the canvas; never over the floor image.

## 3. Token mapping (current → new)

Values below are the Phase 4 swap for `app/globals.css`. (The Figma page 02 variables still carry the superseded Counsel Ink values.)

| Token | Current | New | Note |
| --- | --- | --- | --- |
| `--sp-color-brand-ivory` | `#FFF7ED` | **retire** | cream family gone; light-on-dark tints take over |
| `--sp-color-brand-paper` | `#F6E7D8` | **retire** | hover/selected tints become `rgba(244,91,42,.10–.16)` or elevated `#303641` |
| `--sp-color-brand-copper` | `#D46A24` | **retire** | collapses into the one ramp; light-context accents use `#A93818` |
| `--sp-color-brand-clay` | `#6F2C13` | **retire** | |
| `--sp-color-brand-accent` | `#F97316` | **`#F45B2A`** | THE brand orange; ink text `#140D04` (5.85:1) |
| *(brand hover — new)* | — | **`#FF7138`** | ink 7.04:1 |
| `--sp-color-action-primary` | `#B2430F` | **`#F45B2A`** | the action ramp IS the brand ramp now; ink text, not white |
| `--sp-color-action-primary-hover` | `#A63A12` | **`#FF7138`** | |
| `--sp-color-action-primary-pressed` | `#93330F` | **`#D94A1F`** | ink 4.54:1 — the binding constraint that locked the ink value |
| *(brand deep — new)* | — | **`#A93818`** | plate borders, halos on light contexts (3.04:1 worst-case vs floor) |
| *(brand ink — new)* | — | **`#140D04`** | LOCKED text on any orange fill; `#1A1206` failed pressed at 4.37 |
| `--sp-color-chrome-bg` | *(admin `#1F2225`)* | **`#111316`** | first-class, both surfaces; glass `rgba(17,19,22,.72)` + `blur(20px)` |
| `--sp-color-chrome-elevated` | *(admin `#262A2D`)* | **`#22262D`** | inputs/chips on chrome |
| `--sp-color-chrome-border` | — | **`rgba(255,255,255,.08)`** | hairline |
| `--sp-color-chrome-text` | — | **`#F8FAFC`** | 17.78:1 on chrome |
| `--sp-color-chrome-text-muted` | — | **`#A7ADB5`** | 8.23:1 on chrome |
| `--sp-color-text-primary` | `#1F2225` | **`#F8FAFC`** | 16.50:1 on panel |
| `--sp-color-text-secondary` | `#44494C` | **`#E8E6E3`** | 13.86:1 |
| `--sp-color-text-muted` | `#6B7177` | **`#A7ADB5`** | 7.64:1 panel · 5.37:1 elevated — AA everywhere it appears |
| `--sp-color-text-disabled` | `#969BA1` | **`#6B7280`** | 3.57:1 on panel — non-essential only, never on elevated |
| `--sp-color-surface-canvas` / `map-workspace` | `#EAEBEC` | **`#090A0C`** | the dark room |
| `--sp-color-surface` | `#FCFCFD` | **`#181B20`** | panels, inspector, map mat |
| `--sp-color-surface-raised` | `#FFFFFF` | **`#22262D`** | cards, inputs |
| *(surface elevated/hover — new)* | — | **`#303641`** | hover fills, active seg, neutral chips |
| `--sp-color-border-subtle` | `#E4E6E8` | **`#303641`** | |
| `--sp-color-border-strong` | `#D2D6DA` | **`#48515E`** | |
| `--sp-color-state-selected` family | `#C2410C` + paper tints | **ink ring `#140D04` + glow `rgba(244,91,42,.35)`** on markers; **`rgba(244,91,42,.16)` + `#FFB694`** on chips | selection stays orange via the glow/tint, contrast via ink |
| `--sp-color-state-published/success` | `#3F6F59` + light tints | **base kept; dark-UI text `#8FD0AE` on 16% tint** | 9.15/7.41/6.11:1 on chrome/raised/elevated tints |
| `--sp-color-state-draft/warning` | `#9A6418` + light tints | **base `#B45309`; dark-UI text `#EFB868` on 16% tint** | 9.10/7.43/6.06:1 |
| `--sp-color-state-danger` | `#963D2F` + light tints | **base kept; dark-UI text `#F0A896` on 16% tint** | 8.63/7.07/5.86:1; outline-button danger text 7.77:1 on raised |
| `--sp-color-state-info/search` | `#2F6668` / `#DCEDEA` | **base kept; dark-UI text `#8CCBCE`; on-floor ring/text deepen to `#1D4042`** | tint `#DCEDEA` stays; 9.30:1 match text |
| `--sp-color-state-disabled` | `#DDDFE2` | **`#303641`** | inert dark fill + `#6B7280` text |
| `--sp-marker-open-ring` | *(planned `#6E747A`)* | **`#3E4650`** | + white casing; FULL two-layer coverage, best-layer min 3.18:1 |
| *(marker plate fill — new)* | *(white plates)* | **`#F45B2A`** | assigned plates are the brand statement |
| `--sp-marker-plate-border` | *(planned `#C9C3BA`)* | **`#A93818`** | 3.04:1 worst measured plate footprint (@N01) |
| `--sp-marker-plate-text` / `-code` | *(planned `#201D1A`/`#5E574E`)* | **`#140D04`** both | 5.85:1 on the fill; weight differentiates name vs code |
| `--sp-marker-assigned` (status dot) | *(planned `#3F6F59`)* | **`#140D04`** | ink dot on orange; green leaves the marker family |
| `--sp-marker-reserved` | *(planned `#9A6418`)* | **`#7A4E00` on `#FBEED3` tint** | 6.26:1 text; 3.40:1 worst plate footprint |
| `--sp-marker-unavailable` | *(planned `#B6B0A7`)* | **white dot + `#6B7280` ring + ink strike** | strike is the dark layer; FULL coverage |
| `--sp-marker-selected-ring` | *(planned `#B8541A`)* | **`#140D04`** + `rgba(244,91,42,.35)` glow | min 5.11:1 vs floor; 5.85–19.28:1 vs every fill |
| `--sp-marker-search-surface/-accent/-text` | *(planned `#DCEDEA`/`#2F6668`/`#1D4042`)* | **`#DCEDEA` / `#1D4042` / `#1D4042`** | ring deepened for FULL floor coverage (spec `#2F6668` left a covered-gap risk) |
| *(marker focus — new)* | *(chrome ring reused)* | **double ring `#FFFFFF` + `#542D12`** | markers sit on the floor where the orange ring fails (see §5); FULL coverage, min 3.52:1 |
| focus ring (chrome) | `rgb(194 65 12 / .9)` | **`rgba(255,113,56,.9)`** | 4px, offset 2 unchanged; 4.44–7.23:1 on all dark surfaces |
| *(department accents — new)* | — | dark-UI: Legal `#F45B2A` · Ops `#3B82F6` · Finance `#22C55E` · HR `#A855F7` · IT `#06B6D4` (graphics ≥3.84:1 on raised); floor-safe: `#A93818` / `#1D4ED8` / `#166534` / `#7E22CE` / `#155E75` (min 3.04–3.43:1) | orange stays the identity, not every data point; raw values are chip/graphic accents, never text |

Unchanged scales: space 4–48, radius 6–999, durations 150/200/280ms, focus ring width 4px / offset 2. Shadow colors shift from slate `rgba(15,23,42,…)` to plain black at higher alphas (`rgba(0,0,0,.28–.85)`) — on a dark ground, shadows need depth, not tint. Glass: toolbar `rgba(17,19,22,.72)` + `blur(20px)`, cards `rgba(24,27,32,.85)` — canvas-floating only.

## 4. Per-screen notes

- **Viewer `/`** — app shell replaces the title block; filter bar (new capability); docked read-only inspector with full record; markers per §2.3; results list stays in the right rail above the dock; empty state offers "Clear filters". *(Ember re-validated live 2026-07-09)*
- **Admin `/admin`** — same shell; amber draft chip in bar; filter bar replaces the floating FilterPanel (ActiveFilterChips move into the bar); docked inspector replaces the floating panel — content structure of inspector v2 is kept; publish button elevated in brand orange with ink text. Mode card / results panel behavior unchanged. *(Ember re-validated live 2026-07-09)*
- **Management** — dark chrome header; tabs Employees/Departments/Zones/Publish history; roomier table (name, job title, dept, ext, seat, status, actions) on dark panels; footnote states the live-vs-snapshot rule; deletes keep the single confirm dialog. *(Figma structure; Ember values via §3)*
- **Settings** — dark chrome header; CSV card + amber Advanced-recovery card on dark panels; list-row utilities; review-before-apply flows untouched. *(Figma structure; Ember values via §3)*
- **Publish review** — modal on a near-black scrim: readiness chip, count cards, grouped change list (incl. people edits), viewer-impact note, Cancel / Publish to viewers (orange + ink). *(Figma structure; Ember values via §3)*
- **Login** — near-black backdrop, centered dark panel card, brand mark, Password/Magic-link tabs, orange submit with ink text. *(Figma structure; Ember values via §3)*
- **Ask Planner** — dark right drawer, read-only chip, suggested prompts, answer card with "N seats highlighted" teal chip, input + Ask. Stays strictly read-only. *(Figma structure; Ember values via §3)*
- **Mobile viewer** — 52px bar + scrollable filter chips + map + non-modal bottom sheet (45% max). Preview findings re-confirmed on Ember: name plates crowd badly at 390px width AND the 40px hitboxes of adjacent pod seats overlap — **mobile defaults the Names toggle off** (initials chips) at < 900px. *(Ember re-validated live 2026-07-09)*
- **Key states** — empty/no-match, error banner + retry, loading skeleton (chrome persists, no layout shift). *(Figma page 04)*

## 5. Recorded contrast ratios (WCAG 2.1) — measured 2026-07-09

**How the floor was measured.** The two Ember calls could not be judged against an assumed flat floor tone. The real raster (`public/images/office-floor-plan.png`, 1911×867) was sampled at each of the 60 calibrated marker positions (through the production transform chain): global mean `#DAD7D6`; **seat-local footprint means range L 0.23 (NE04, a gray patch) to L 0.81 (C05, near-white)**. Consequence: *no single mid-tone color can clear 3:1 at every seat* — the spec-as-given values measured, worst case: assigned fill alone **1.56**, selected ring `#FF7138` **1.00**, reserved `#F59E0B` **1.01**. The system therefore uses **two-layer marks**: a light casing (covers dark patches) + a dark core (covers light patches), each pair either in FULL analytic coverage (no floor luminance can defeat both layers) or measured-pass at all 60 footprints.

**Call #1 — text on orange (resolved).** White on `#F45B2A` = **3.29** (fails AA). Locked ink **`#140D04`**: on accent **5.85** · on hover `#FF7138` **7.04** · on pressed `#D94A1F` **4.54** — AA on the whole ramp. (`#1A1206` was rejected: 4.37 on pressed.)

**Call #2 — markers on the real floor (resolved; worst-seat numbers).** Open dot (white + `#3E4650` ring): FULL coverage, best-layer min **3.18** (@CW06), ring vs own fill **9.56**. Match dot/plate (`#DCEDEA` + `#1D4042`): FULL, min **3.12** (@NE04); match text on tint **9.30**. Selected (ink ring): min **5.11** vs floor (@NE04); vs white dot **19.28**, vs assigned fill **5.85**, vs reserved tint **16.78**, vs match tint **15.93**; glow decorative. Marker focus (white + `#542D12`): FULL, min **3.52**; ring pair internal **11.92**. Unavailable (white dot + ink strike): FULL; strike vs fill **15.26**; `#6B7280` ring is the hue cue. Assigned plate (`#F45B2A` + `#A93818` border): border min **3.04** (@N01) — every measured plate footprint passes; the analytic gap (patch L 0.06–0.44) contains no seat; ink name text **5.85** and the elevation shadow are further channels. Reserved plate (`#FBEED3` + `#7A4E00`): min **3.40** (@N01); text on tint **6.26**. Department floor-safe accents: mins **3.04–3.43** (@N01).

**Text on dark surfaces (AA ≥ 4.5).** primary `#F8FAFC`: canvas **18.93** · chrome **17.78** · panel **16.50** · raised **14.51** · elevated **11.60**. secondary `#E8E6E3`: panel **13.86** · raised **12.19** · elevated **9.75**. muted `#A7ADB5`: canvas **8.76** · chrome **8.23** · panel **7.64** · raised **6.71** · elevated **5.37**. disabled `#6B7280`: panel **3.57** — *non-essential only*. Orange as text `#F45B2A`: panel **5.24** · raised **4.61**. State-chip text on 16% tints (chrome/raised/elevated): success `#8FD0AE` **9.15/7.41/6.11** · warning `#EFB868` **9.10/7.43/6.06** · danger `#F0A896` **8.63/7.07/5.86** · info `#8CCBCE` **9.13/7.45/6.06**. Danger outline-button text on raised **7.77**. Avatar `#FFB694` on orange tint **7.13**.

**Components & graphics (≥ 3).** Publish fill vs chrome **5.65**. Legend dots on chrome: assigned **5.65** · open ring **8.23** · reserved **10.39**. Chrome focus ring `#FF7138`: elevated **4.44** · raised **5.55** · panel **6.31** · canvas **7.23**. Glass `rgba(17,19,22,.72)` over canvas → primary **18.18**, muted **8.41**; the same glass over the lightest floor patch → primary **7.82**, muted **3.62** — hence the rule: **glass floats over the canvas only; muted text never rides map-floating glass**.

Other a11y locks: focus ring stays 4px/offset-2, retuned to `rgba(255,113,56,.9)` on chrome and to the white+`#542D12` double ring on markers, specified for every interactive element incl. markers (`focus-visible`); markers stay `<button type="button">` with `aria-pressed` + contextual labels; hit targets ≥ 40px; dock non-modal (`role="complementary"`), publish dialog modal with existing semantics; Esc order unchanged; all motion `motion-reduce`-guarded. The `accessibility-source`, `bulk-destructive-action-safety-source`, `seat-creation-ui-source`, and `desktop-seat-marker-system-source` tests are untouched by this revision and stay green (198/198 on 2026-07-09).

## 6. Flagged behavior-changing items (the only behavior changes Phase 4 may make)

1. **`employees.email` column** *(owner-approved 2026-07-08)* — the inspector displays Email; no such field exists (`profiles.email` is auth-only). Add nullable `employees.email` + `published_employees.email` via the publish RPC in a migration, surface in Management + CSV (`CsvAssignmentRow.employee_email` already parses). Until then the row renders "Not in directory".
2. **Viewer gains filters** — new capability (dept/zone/status), read path unchanged (published layer only).
3. **Inspector docking changes canvas geometry** — map re-fits on open/close (view-state only, no data change).
4. **Mobile sheet auto-pan** — the previously deferred behavioral item is now in scope for Phase 4.
5. **Open-seat code labels move to hover/focus tags** — codes are no longer permanently visible on open seats at detail zoom (names toggle already exists for plates).

Everything else is restyle-only: no data-model, security, coordinate, or operation-semantics changes.

## 7. Phase 4 implementation map (visual decision → token/component change)

| Change | Where |
| --- | --- |
| Token value swap (§3) + new `chrome`/`marker` families | `app/globals.css` `:root` (+ surface through `tailwind.config.ts`); collapse `.admin-theme` chrome tokens into the first-class set; retire the ivory/paper/copper/clay brand tokens |
| Chrome + filter bar on both surfaces | new shared shell components; `ViewerSeatFinder.tsx` header/stat block replaced; `SeatMap.tsx` toolbar restyled (aria labels/copy preserved — source tests pin them) |
| Docked inspector | `SeatInspector.tsx` layout (keep v2 content structure); canvas grid in `SeatMap.tsx`; viewer detail card replaced with dock variant |
| Markers | `SeatMarker.tsx` — new plate/dot rendering on `--sp-marker-*`; delete dead `variant="admin"` token branch; keep coordinate/`pointToStyle` logic byte-identical (pinned by test) |
| Filter bar | `FilterPanel.tsx` → bar layout; `ActiveFilterChips` reused |
| Button/Dialog consolidation (deferred Phase 2 debt) | fold `design-system.tsx` Button variants into `ui/Button.tsx` API or migrate 7 call sites; extract one shared Dialog from the 9 bespoke implementations |
| Viewer/login raw-Tailwind cleanup | restyle onto `--sp-*` tokens (~40% of surfaces aren't tokenized today) |

**Figma vs code-preview split:** Figma (pages 02–04) carries the structural specs (tokens/variables *names and mapping*, marker+inspector anatomy, and all conventional screens — management, settings, publish review, login, Ask Planner, mobile, states); its color values are Counsel Ink and are superseded by §3. The live preview (`/concepts/map-redesign`) carries what only real data can prove: marker language at true density **on the real floor pixels**, docked-inspector coexistence + reflow, filter/search highlight + dim behavior, both-surface shell toggle — all re-validated on Ember 2026-07-09.
