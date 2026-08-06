# Handoff: Seat Planner — Carbon v12 Redesign

**For:** Claude Code, implementing in `pmeglaw/seat-planner` (main)
**From:** Design exploration, July 30 2026 · Owner: Patrick

## Overview

A redesign of the Seat Planner on a *predicted* IBM Carbon v12 — conservative scope: only mechanisms IBM has committed via `enable-v12-*` feature flags and the published `@carbon/upgrade` codemods (Layer model, Menu subsystem, tile default icons, reduced label spacing, xs/sm density, `slug → decorator` AI label), plus the Carbon-for-AI treatment for Ask Planner. The firm's orange stays as the white-label accent (Carbon blue swapped out, as today); **Carbon's AI blue-light treatment is reserved exclusively for AI presence**. Evidence and sources: `Carbon v12 Brief.dc.html`.

Three structural moves define the redesign, all combined in the interactive prototype:
1. **Left rail** (Carbon UI Shell): Map · People · Management · Settings, with Ask Planner (AI) + Viewer toggle + account pinned at the bottom. Click the hamburger to expand (48 → 208px overlay); rail item click collapses it.
2. **Full-bleed map** (Layer model): the floor plan is layer-00, edge-to-edge; every control floats on layer-01 cards. The matted map card, dead gray bands, and docked status strip are gone.
3. **Tabbed floating inspector** (density + flat buttons): accordions → contained tabs (Overview / Notes / Activity), icon action row (Move/Swap/Vacate), pinned 48px primary footer, AI entry row.

## About the design files

The `.dc.html` files are **design references built in HTML** — they show intended look and behavior; they are **not production code to copy**. The task is to recreate them in the existing stack (Next.js App Router + Tailwind + the current bespoke components), following the repo's own conventions (`CLAUDE.md`, `AGENTS.md`). **Do not install `@carbon/react`** — the repo deliberately borrows Carbon's visual language without adopting the library.

The HTML files may not render standalone outside their original workspace; the `screenshots/` folder is the authoritative offline visual reference.

## Fidelity

**High-fidelity.** Colors, type, spacing, and interaction behavior are final and mostly reuse the repo's existing `--sp-*` / `--admin-*` tokens. Recreate pixel-perfectly. The few NEW values are listed under Design tokens.

## Files in this bundle

| File | What it is |
| --- | --- |
| `Seat Planner v12 Prototype.dc.html` | **The implementation target.** Interactive: all screens + behaviors |
| `Carbon v12 Redesign.dc.html` | Static exploration canvas (options 1a–1h + Publish alternatives 2a–2f) |
| `Current UI.dc.html` | Recreation of today's app — the baseline diff |
| `Carbon v12 Brief.dc.html` | The v12 prediction evidence + source links |
| `shared/seats.js` | Seat data: seed coords + calibration transforms + demo roster |
| `screenshots/` | One capture per screen/state (index below) |

## Screenshot index

| # | State |
| --- | --- |
| 01 | Admin map, default (full-bleed, floating controls, rail collapsed) |
| 02 | Seat C05 selected — floating tabbed inspector |
| 03 | After Vacate — draft badge on seat, Draft chip + Publish appear in bar |
| 04 | Publish review modal — per-seat diff table (Published now → After publish) |
| 05 | Zone filter chips + zone hover-wash on the map (North Pod) |
| 06 | Ask Planner — Carbon-for-AI drawer, answered state, AI-highlighted seats |
| 07 | People panel (map reflows — see Interaction contracts #2) |
| 08 | Viewer mode — read-only, edit chrome stripped |
| 09 | Management — stat tiles + DataTable ("Admin mode" toast is transient) |
| 10 | Settings — clickable tiles with v12 default icons |
| 11 | Login |

## Repo map — where each change lands

| Design piece | Implement in |
| --- | --- |
| Tokens (new AI family, tile hover) | `app/globals.css` (+ surface via `tailwind.config.ts`) |
| Left rail shell | NEW component (e.g. `components/ui/AppRail.tsx`); replaces nav duties of `AdminShellBar.tsx` and the map header's Management link |
| Top bar (xs 24px fields, Ask Planner AI tool, conditional Publish) | `components/seat-map/SeatMap.tsx` (map header) + `components/ui/AdminShellBar.tsx` (sub-pages) |
| Full-bleed map + floating floor/legend/zoom/add-seat | `components/seat-map/SeatMap.tsx`, `components/seat-map/ViewerSeatFinder.tsx`, `MapZoomControl.tsx`, `FloorSelector.tsx` |
| Floating tabbed inspector + under-panel nudge | `components/seat-map/SeatInspector.tsx` (+ nudge in `SeatMap.tsx` viewport logic, `lib/mapViewport.ts`) |
| Zone chips + hover-wash | `components/seat-map/FilterPanel.tsx` + wash overlay in `SeatMap.tsx`/`ViewerSeatFinder.tsx`; zone rects from `lib/seatZones.ts` (prototype derives bounding boxes from seat coords) |
| Publish diff table | Publish review in `SeatMap.tsx` + `lib/publishSummary.ts` (before→after occupant per changed seat) |
| Ask Planner AI treatment | `components/seat-map/AskPlannerDrawer.tsx`; AI seat aura in `SeatMarker.tsx` **planner-highlight state only** — see Do-not-touch |
| Management DataTable + tiles | `components/admin-management/AdminManagementPanel.tsx` |
| Settings tiles | `components/admin-settings/DataUtilitiesPanel.tsx` |
| Login field style | `components/auth/LoginForm.tsx`, `app/login/page.tsx` |

## ⚠ Do-not-touch list (repo guardrails — pinned by tests)

1. **`SeatMarker` anchor + calibration are frozen**: `pointToStyle({x,y})` and `lib/mapLayoutTransform.ts` constants must keep placing markers at true coordinates (`tests/desktop-seat-marker-system-source.test.mjs`). The pills' *look* is owner-locked too — this redesign intentionally changes **nothing** about the pills except the planner-highlight (AI) state.
2. **Viewer isolation**: Ask Planner is admin-only; `ViewerSeatFinder.tsx` must contain zero references (`tests/accessibility-source.test.mjs` enforces). If a guard test fails, the crossing is the bug — never loosen the test.
3. **Draft/published two-layer model**, three-layer admin security, RPC transaction safety, migration-by-merge: unchanged.
4. **Pan/zoom + the inspector nudge are view transforms only** — never write to seat coordinates.
5. AA contrast floors: body text ≥ 4.5:1, graphics ≥ 3:1. White text never sits on `#FF5715` (3.17:1) or `#F1C21B`.

## Design tokens

Existing repo tokens carry almost everything: chrome `#161616` / `#262626` / borders `rgba(255,255,255,.10)` / muted `#B8AEA2`; light surfaces `#F7F6F2` / `#FFFFFF` / borders `#E7E1D8`; text `#161616` / `#55504A` / `#6E655A`; status `#1D6E41` / `#F1C21B→#8A6116` / `#B3232C`; brand `#FF5715` (indicator-only), CTA ladder `#D23F0A` / hover `#B83708` / pressed `#9E2F06`; monogram `#FC672A`. Type: IBM Plex Sans + IBM Plex Mono.

**New (AI family — light):** border `#4589ff`, text `#0043ce`, aura `linear-gradient(180deg, rgba(69,137,255,.12→.14), transparent)`, ring `rgba(69,137,255,.45)` + `rgba(69,137,255,.18)`.
**New (AI family — dark):** text/border `#78a9ff`, panel border `rgba(120,169,255,.35)`, top glow `linear-gradient(180deg, rgba(69,137,255,.10), transparent 140px)`, row fill `rgba(69,137,255,.08)`.
**Owner decision (option 2a):** Publish button = `#D23F0A` bg + white label + white count badge (`#161616` text). The old bright-orange + ink Publish is retired; `#FF5715` remains for active underline, selected seat ring, search highlight, focus.
**Shape:** chrome/controls flat 0 radius (inspector's rounded-10px buttons are retired); pills/chips/badges keep `border-radius:999px`; office plates 8px.
**Density:** bar 36px; bar fields xs 24px; floating buttons 32px; table rows 40px; inspector footer buttons 48px.

## Interaction contracts (acceptance criteria)

1. **Seat select → floating inspector.** Map does NOT reflow or rescale. If the selected seat's screen-x would sit under the panel (panel left edge − 24px), pan the map left by exactly enough to clear it (target: panel left − 48px), animated ~250ms ease-out (JS tween — a CSS transform transition fights drag-panning). Drag-panning itself is direct, no easing.
2. **People and Ask Planner panels reflow the map** (map area shrinks by panel width, 344px / 424px; refit on open/close and window resize; contain-fit against width AND height). Inspector floats; these dock. This hybrid is deliberate — do not unify.
3. **Rail**: click hamburger toggles 48↔208px; expansion overlays content; item click or outside click collapses. Active item: `#262626` bg + inset 3px `#FF5715` left edge. Rail persists on Management/Settings; Login is full-screen without it.
4. **Publish visibility**: Publish button + "Draft · N changes" chip render ONLY when effective draft changes > 0, and only on the map screen.
5. **Publish diff**: review modal lists per-seat rows — seat code (mono) · occupant now → after · change tag (Assigned green / Vacated red / Reassigned amber) + summary chips. Diff is computed against the published baseline: a seat returned to its original occupant drops out of the diff, the count, and the map's D badges. (In the real app, diff draft layer vs published layer — `lib/publishSummary.ts` already knows how.)
6. **Draft marks**: changed seats get the amber tint + 14px "D" badge (existing draft-changed treatment).
7. **Search/filter highlight**: matches get the orange search treatment (`#D23F0A` border / `#FBEAE1` fill / `#9E2F06` text + ring); non-matches dim to 35%. Live "N of M match" count in the bar.
8. **Zone chips + hover-wash**: Filter panel's zone facet is a chip list. Hovering a chip previews that zone on the map — `rgba(255,87,21,.09)` fill, `rgba(210,63,10,.55)` 1.5px border, `#D23F0A` name flag "Zone · N seats"; clicking pins the filter (wash persists). Wash sits under markers, `pointer-events:none`. Use `lib/seatZones.ts` rects (or seat bounding boxes + ~2.2%/4.2% padding).
9. **Ask Planner (Carbon for AI)**: drawer carries the AI label chip next to the title; answers render on the luminous AI layer (top glow gradient + `#78a9ff` border); an explainability popover (AI ▾ toggle) states data sources, read-only nature, and confidence — this is *required* by Carbon-for-AI, not decoration. AI-highlighted seats get the blue aura ring + mini AI chip; all other seats dim to 40% and the raster desaturates slightly. A floating "AI · N seats highlighted · Clear" chip appears top-left. **AI blue is never used for anything non-AI.**
10. **Viewer mode**: read-only — no undo/kebab/Publish/draft chip/AI tool, inspector shows Overview only (no actions/tabs/footer), "VIEWER · READ-ONLY" chip in bar. Same components, mode flag — not a fork.
11. **Names toggle** (kebab Menu): shows occupant short names ("First L.") inline in pills at rest.
12. **Kebab = Menu subsystem**: checkmark toggle item, shortcut hint, divider, danger item ("Discard draft changes" restores baseline).
13. **Management**: stat tiles show live counts and carry the v12 default tile icon (↗ top-right); toolbar-integrated search (live filter) + primary "Add employee +" (opens modal — replaces the old side form); row click jumps to the map with that seat selected+nudged; unassigned people listed with gray tag.
14. **Settings**: rows → clickable tiles with default icons (download ⭳ / open ↗ bottom-right); warning inline notification (amber left border); danger tile red family.
15. **Zoom/fit**: fit = scale 1 + centered; zoom steps ±0.25, clamp 0.5–2.5; % readout in mono.
16. **Toasts**: bottom-center, `#161616`, 3px `#FF5715` left border, ~2.6s.

## State management (maps to existing app state)

`screen` (map/management/settings) · `panel` (none/inspector/people/ai) · `sel` seat · inspector `tab` · `mode` admin/viewer · `search`, `fZone`, `fStatus`, `hoverZone` · `showNames` · `zoom/panX/panY` · draft baseline map (label → original occupant) + undo stack · `publishOpen` · AI state (idle/thinking/answered + highlighted set). Most already exist in `SeatMap.tsx`; the new pieces are `screen` (routing already covers it), `hoverZone`, and the baseline-diff derivation.

## Assets

- `public/images/office-floor-plan.webp` — existing repo raster (unchanged, still protected)
- `public/images/megeredchian-mark.png` — existing brand mark
- Icons: inline SVG, 1.5–1.8 stroke, from the repo's existing glyph style — no icon library added

## Suggested implementation order (branch per slice, tests green between)

1. Tokens: AI family + Publish→`#D23F0A` swap (`globals.css`, update contrast comments)
2. Rail shell + top-bar density (xs fields, conditional Publish, AI tool)
3. Full-bleed map + floating controls (admin, then viewer)
4. Inspector: floating + tabs + nudge
5. Publish diff view
6. Zone chips + hover-wash
7. Ask Planner AI treatment (drawer + marker planner-highlight re-style)
8. Management, Settings, Login
9. A11y pass: focus rings, keyboard nav parity, contrast re-measure

## Verification loop

After each slice, screenshot the running app (the repo's `chrome-pixel-capture` skill / Playwright harness) and diff against `screenshots/NN-*.png` at 1440×900. Behavior QA per slice against the Interaction contracts above. Full gate: `npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e` — plus the guardrail source tests untouched.

## Open questions for the owner (ask, don't guess)

1. Does the rail replace the Viewer/Admin surface shortcuts everywhere, or keep the top-bar shortcuts on sub-pages too?
2. Publish 2a (`#D23F0A`) is decided for the button — should the active-tab underline stay `#FF5715` (as designed) or follow?
3. Floor selector: keep Floor 2 "SOON" scaffolding in the floating pill (designed but not in the prototype's selector)?
4. Management "Add employee" modal contents — reuse the existing side-form fields verbatim?
