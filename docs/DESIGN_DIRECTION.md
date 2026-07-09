# Design direction — Phase 3 (Counsel Ink)

**Status:** direction chosen and signed off by the owner on 2026-07-08 (Direction B, "Counsel Ink", picked over Direction A "Counsel Paper"). Live-code validation on the gated prototype route. Phase 4 implements; nothing in this phase touched shipped surfaces.

**Artifacts**

| Artifact | Where |
| --- | --- |
| Figma file | https://www.figma.com/design/iFa1DEChHFeSypR7spEhpM — pages: `01 · Direction A vs B` (B marked chosen) · `02 · Tokens` (58 variables mapped 1:1 to `--sp-*` names) · `03 · Marker & Inspector spec` · `04 · Screens` |
| Live-code preview | `app/concepts/map-redesign/` — gated by `SEAT_PLANNER_ENABLE_PROTOTYPES=true` (404 in prod), real 60-seat published dataset at true calibrated coordinates. **Validated 2026-07-08**: coordinates byte-identical to production calibration (W08 → 18.6719% through the west-pod transform), docked reflow / teal search + 40% dim / viewer-admin toggle / mobile sheet all exercised via Playwright; typecheck, lint, 198/198 tests green; no shipped file modified |
| Before-state baseline | `docs/design-review/after/` (captured at PR #81; deltas to main: #82 bone pills, #84 brand logo) |

---

## 1. Principles

1. **The map is the hero; chrome is the frame.** Dark warm chrome recedes; the cream floor plan glows. Nothing may cover the canvas on desktop — panels reserve layout instead of floating over seats (INV-6 extended from filters to the inspector).
2. **People pop, empty seats recede.** Two-tier marker language: occupied seats are name plates, open seats are quiet dots. Status is never color-alone (≥2 channels: hue + shape/glyph).
3. **One orange.** `#F26E22` is the single brand accent (Publish, brand moments); `#B2430F` is the action ramp. The four competing oranges collapse. Orange is never used for hierarchy — weight/size/space do that.
4. **Sentence case everywhere.** The viewer's ALL-CAPS tracked micro-labels are retired.
5. **Warm neutrals, judged states.** Every neutral shifts from cool slate to warm ink/greige. The adversarially-judged state palette (eucalyptus/ochre/brick/slate-teal, teal search) is kept verbatim.
6. **Accessibility is the only frozen guardrail.** Every text pair ≥ 4.5:1, every meaningful graphic ≥ 3:1 — measured, recorded in §5, and baked into token values rather than checked after the fact.

**Relationship to prior work:** this direction *evolves* the shipped charcoal verdict (`design-direction-verdict.md`, charcoal 31–25) rather than reversing it — the shell stays dark but warms from cool charcoal `#1F2225` to espresso `#26221E`; the verdict's transplants (teal search, brand-paper tints, copper mid-tier, marker taxonomy, status ramp) all carry forward. Direction A (light "Counsel Paper" shell) was mocked side-by-side in Figma and not selected.

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

### 2.3 Seat markers: the "Plate & Dot" system

- **Open seat:** 16px white dot with 2px `#6E747A` ring (was hardcoded `#8A9096` at 2.69:1 — failed the 3:1 graphics bar); seat code appears as a tag on hover/focus. **Custom seat:** dashed ring (a distinct visual state for the first time). **Occupied:** name plate — 7px status dot + name + code, white plate, hairline border. Names-off mode collapses plates to initials chips.
- **Selected:** 2px copper `#B8541A` ring + elevation + 1.06 scale (motion-safe), raised above neighbouring plates (plates may collide at real density — the selected one always wins z-order). **Search/filter match:** teal `#DCEDEA`/`#2F6668`; non-matches dim 40%. **Reserved:** ochre-tinted plate. **Unavailable:** muted dot + strike glyph. **Draft-changed (admin):** ochre corner tick. Admin mode states (move-origin dashed copper, target-valid eucalyptus, target-invalid brick) carry the existing 13-state taxonomy forward.
- Full specimen sheet on Figma page 03, rendered on the map-floor tone it must survive against. Hit target ≥ 40px (invisible hitbox around dots). **All marker colors move to the new `--sp-marker-*` token family** — the hardcoded hex in `SeatMarker.tsx:161-306` and the dead `--admin-marker-*` `variant="admin"` branch are both retired (see §7).
- True coordinates and the calibration transform are untouched — the preview renders through `lib/seatMath` + `lib/mapLayoutTransform` to prove it.

### 2.4 Top chrome: Counsel Ink, on both surfaces

- **56px espresso app bar** (`#26221E`, warmed from cool charcoal): brand mark + "Megeredchian Law / Seat planner · {surface}", draft chip (admin) or "Published · read-only" chip (viewer), centered ⌘K search, Undo/Redo · Management · Ask Planner (admin), **Review & publish** in brand orange `#F26E22` with ink text, avatar.
- **The viewer finally gets the app shell**: its big white title block, stat tiles, and raw-Tailwind styling are replaced by the same chrome + filter bar, freeing ~180px of vertical space for the map.
- Canvas warms to `#E7E5E1`; panels stay light ("dark shell, warm organs").

## 3. Token mapping (current → new)

Figma variables on page 02 carry this table 1:1; descriptions embed the mapping. Values below are the Phase 4 swap for `app/globals.css`.

| Token | Current | New | Note |
| --- | --- | --- | --- |
| `--sp-color-brand-ivory` | `#FFF7ED` | — | unchanged |
| `--sp-color-brand-paper` | `#F6E7D8` | — | unchanged; hover/selected tint, avatar bg |
| `--sp-color-brand-copper` | `#D46A24` | — | unchanged; decorative accent on light |
| `--sp-color-brand-accent` | `#F97316` | **`#F26E22`** | THE brand orange; Publish fill w/ ink text `#231D18` (5.58:1) |
| `--sp-color-brand-clay` | `#6F2C13` | — | unchanged (8.48:1 on paper) |
| `--sp-color-action-primary(/-hover/-pressed)` | `#B2430F/#A63A12/#93330F` | — | unchanged, proven ramp (5.67/6.49/7.72:1 w/ white) |
| `--sp-color-chrome-bg` | *(admin-only `#1F2225`)* | **`#26221E`** | NEW first-class token, both surfaces |
| `--sp-color-chrome-elevated` | *(admin-only `#262A2D`)* | **`#322C26`** | inputs/chips on chrome |
| `--sp-color-chrome-border` | — | **`#453D33`** | NEW |
| `--sp-color-chrome-text` | — | **`#F5F1EA`** | NEW (14.02:1 on chrome) |
| `--sp-color-chrome-text-muted` | — | **`#B8B0A4`** | NEW (7.36:1 on chrome) |
| `--sp-color-text-primary` | `#1F2225` | **`#201D1A`** | 16.22:1 on surface |
| `--sp-color-text-secondary` | `#44494C` | **`#4A443E`** | 9.28:1 |
| `--sp-color-text-muted` | `#6B7177` | **`#5E574E`** | fixes the recorded 4.14:1 AA failure → 6.89:1 |
| `--sp-color-text-disabled` | `#969BA1` | **`#9A948B`** | |
| `--sp-color-surface-canvas` / `map-workspace` | `#EAEBEC` | **`#E7E5E1`** | warm canvas |
| `--sp-color-surface` | `#FCFCFD` | **`#FCFBF9`** | |
| `--sp-color-surface-raised` | `#FFFFFF` | — | unchanged |
| `--sp-color-border-subtle` | `#E4E6E8` | **`#E8E4DD`** | |
| `--sp-color-border-strong` | `#D2D6DA` | **`#D5CFC5`** | |
| `--sp-color-state-*` (selected/published/draft/success/warning/danger/info/search/planner) | | — | all unchanged (judged palette) |
| `--sp-color-state-disabled` | `#DDDFE2` | **`#DDD9D2`** | warmed |
| `--sp-marker-open-ring` | *(hardcoded `#8A9096`)* | **`#6E747A`** | NEW family; 3.95:1 vs floor |
| `--sp-marker-plate-border` | *(hardcoded)* | **`#C9C3BA`** | |
| `--sp-marker-plate-code` | *(hardcoded `#6B7177`)* | **`#5E574E`** | ~7:1 on white |
| `--sp-marker-assigned` | *(hardcoded)* | **`#3F6F59`** | 5.79:1 on plate |
| `--sp-marker-reserved` | *(hardcoded)* | **`#9A6418`** | |
| `--sp-marker-unavailable` | *(hardcoded)* | **`#B6B0A7`** | + strike glyph |
| `--sp-marker-selected-ring` | *(hardcoded `#D46A24`, 2.98:1)* | **`#B8541A`** | 4.06:1 vs floor |
| `--sp-marker-search-surface/-accent/-text` | *(hardcoded)* | **`#DCEDEA` / `#2F6668` / `#1D4042`** | teal identity kept |

Unchanged scales: space 4–48, radius 6–999, durations 150/200/280ms, focus ring 4px `#C2410C`@0.9 offset 2. Shadow colors shift from slate `rgba(15,23,42,…)` to warm ink `rgba(32,29,26,…)` at equal alphas.

## 4. Per-screen notes

- **Viewer `/`** — app shell replaces the title block; filter bar (new capability); docked read-only inspector with full record; markers per §2.3; results list stays in the right rail above the dock; empty state offers "Clear filters". *(Figma page 04 + live preview)*
- **Admin `/admin`** — same shell; draft chip in bar; filter bar replaces the floating FilterPanel (ActiveFilterChips move into the bar); docked inspector replaces the floating panel — content structure of inspector v2 is kept (it already shipped); publish button elevated in brand orange. Mode card / results panel behavior unchanged. *(live preview + Figma)*
- **Management** — dark chrome header; tabs Employees/Departments/Zones/Publish history; roomier table (name, job title, dept, ext, seat, status, actions); footnote states the live-vs-snapshot rule; deletes keep the single confirm dialog. *(Figma)*
- **Settings** — dark chrome header; CSV card + amber Advanced-recovery card; list-row utilities; review-before-apply flows untouched. *(Figma)*
- **Publish review** — modal on espresso scrim: readiness chip, count cards, grouped change list (incl. people edits), viewer-impact note, Cancel / Publish to viewers. *(Figma)*
- **Login** — espresso backdrop, centered paper card, brand mark, Password/Magic-link tabs, action-primary submit. *(Figma)*
- **Ask Planner** — light right drawer, read-only chip, suggested prompts, answer card with "N seats highlighted" teal chip, input + Ask. Stays strictly read-only. *(Figma)*
- **Mobile viewer** — 52px bar + scrollable filter chips + map + non-modal bottom sheet (45% max). Preview finding: name plates crowd badly at 390px width — **mobile should default the Names toggle off** (initials chips) at < 900px. *(Figma page 04 + live preview)*
- **Key states** — empty/no-match, error banner + retry, loading skeleton (chrome persists, no layout shift). *(Figma page 04)*

## 5. Recorded contrast ratios (WCAG 2.1)

Text (AA ≥ 4.5:1): text-primary/surface **16.22** · text-primary/canvas **13.33** · text-secondary/surface **9.28** · text-muted/surface **6.89** · text-muted/canvas **5.66** · chrome-text/chrome **14.02** · chrome-text-muted/chrome **7.36** (elevated **6.42**) · publish ink-on-orange **5.58** · white/action-primary **5.67** · plate name/white **16.77** · plate code/white **~7.0** · search text/search surface **9.30** · draft-chip text **8.06** · clay/paper **8.48** · danger/surface **6.76** · active-chip cream **7.53** · Clear link on bar **6.85**.

Non-text (≥ 3:1 vs map floor `#EFEAE2`): selected ring `#B8541A` **4.06** · open ring `#6E747A` **3.95** · search accent `#2F6668` **5.44** · assigned dot on plate **5.79**.

Other a11y locks: focus ring unchanged (4px `#C2410C`@0.9, offset 2) and specified for every interactive element incl. markers (`focus-visible:ring-4`); markers stay `<button type="button">` with `aria-pressed` + contextual labels; hit targets ≥ 40px; dock non-modal (`role="complementary"`), publish dialog modal with existing semantics; Esc order unchanged; all motion `motion-reduce`-guarded. The `accessibility-source`, `bulk-destructive-action-safety-source`, `seat-creation-ui-source`, and `desktop-seat-marker-system-source` tests are untouched by this design and must stay green in Phase 4.

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
| Token value swap (§3) + new `chrome`/`marker` families | `app/globals.css` `:root` (+ surface through `tailwind.config.ts`); collapse `.admin-theme` chrome tokens into the first-class set |
| Chrome + filter bar on both surfaces | new shared shell components; `ViewerSeatFinder.tsx` header/stat block replaced; `SeatMap.tsx` toolbar restyled (aria labels/copy preserved — source tests pin them) |
| Docked inspector | `SeatInspector.tsx` layout (keep v2 content structure); canvas grid in `SeatMap.tsx`; viewer detail card replaced with dock variant |
| Markers | `SeatMarker.tsx` — new plate/dot rendering on `--sp-marker-*`; delete dead `variant="admin"` token branch; keep coordinate/`pointToStyle` logic byte-identical (pinned by test) |
| Filter bar | `FilterPanel.tsx` → bar layout; `ActiveFilterChips` reused |
| Button/Dialog consolidation (deferred Phase 2 debt) | fold `design-system.tsx` Button variants into `ui/Button.tsx` API or migrate 7 call sites; extract one shared Dialog from the 9 bespoke implementations |
| Viewer/login raw-Tailwind cleanup | restyle onto `--sp-*` tokens (~40% of surfaces aren't tokenized today) |

**Figma vs code-preview split:** Figma (pages 02–04) carries tokens/variables, marker+inspector specs, and all conventional screens (management, settings, publish review, login, Ask Planner, mobile, states). The live preview (`/concepts/map-redesign`) carries what only real data can prove: marker language at true density, docked-inspector coexistence + reflow, filter/search highlight + dim behavior, both-surface shell toggle.
