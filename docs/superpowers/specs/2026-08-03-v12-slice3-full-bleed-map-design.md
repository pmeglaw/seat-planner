# v12 Slice 3 — Full-bleed map + floating controls (design)

**Date:** 2026-08-03 · **Owner approval:** design + 4 decisions approved in session (see Decisions)
**Source spec:** `docs/design_handoff_carbon_v12/README.md` (structural move #2, implementation-order slice 3) + `Seat Planner v12 Prototype.dc.html` (implementation target) + `screenshots/01-prototype.png` (admin), `08-prototype.png` (viewer).

## Scope

The floor plan becomes layer-00: edge-to-edge from the 36px chrome bar to the viewport bottom, from the 48px rail to the right edge. The matted map card, width cap, dead bands, and docked status strip are removed. Floor pill, crumb chip, filter chips, add-seat, legend, and zoom float as layer-01 cards. Admin (`SeatMap.tsx`) first, then viewer (`ViewerSeatFinder.tsx`).

**Not this slice:** floating inspector + nudge (slice 4), publish diff (5), zone chips + hover-wash (6), Ask Planner AI treatment (7). Panel dock/reflow mechanics stay exactly as they are today.

## Approach (decided)

Keep the existing scroll-based zoom/pan engine — width-scaling frame + native scroll, `mapVisibleRange` edge-pinned markers, crowding nudges, `lib/mapViewport` scroll-target math — and the existing fixed-panels + reserved-right-padding reflow. Full-bleed is a chrome-strip around the viewport, not an engine rebuild. The prototype's `translate+scale` transform engine was considered and rejected: it rewires test-pinned machinery with no user-visible gain.

## Floating-card recipe (all layer-01 controls)

White card: `#FFFFFF` bg, 1px `#E7E1D8` border, shadow `0 6px 16px rgba(22,22,22,.14)`, border-radius 0, z-40, no backdrop blur. Floating buttons 32px tall. Shadows via named utilities only (`shadow-[var(...)]` is banned by `elevation-shadow-tokens-source`); if no existing named utility matches, add one in `tailwind.config.ts`.

Positions (desktop, from the prototype; the rail gutter is `pl-12` on the root, so offsets inside the content area are 12px):

- **Top-left cluster** (12px below bar, 12px from map edge): floor pill (`padding 7px 11px`, 12.5px/600) + crumb chip (12px, `#6E655A`) + ActiveFilterChips. Crumb and chips stay DOM-adjacent (`filter-feedback-source` pins `{mapCrumbLabel}</span>` immediately followed by `<ActiveFilterChips`).
- **Top-right** (admin only): Add seat, 32px tall, `＋ Add seat`, slides left when a right panel reserves space (rides the existing reserved-padding geometry).
- **Bottom-left:** legend card (`padding 8px 14px`, wrap, `max-width min(56vw,620px)`): "N seats" (12px/600) + 7px status dots with 11.5px/600 labels + admin-only draft count in `#D23F0A`.
- **Bottom-right:** zoom stack (unchanged position `bottom-3 right-3`): mono readout + 32×32 `+` / `−` / fit.

## Admin changes (`SeatMap.tsx`)

1. **Strip in-flow chrome:** `max-w-[1920px]` wrapper padding/cap, `main` and section paddings, map-card border/`shadow-elevation-2`/matting padding, and the entire bottom status strip. Keep `overflow-x-clip`, the sticky header, the `lg` height chain (`lg:h-screen` root → `lg:flex-1 lg:min-h-0` — documented fit-loop hazard), and `stageReservedClassName` reflow padding.
2. **Viewport** fills header→bottom; workspace background `#ECE8E0` behind the raster (new token, e.g. `--admin-map-workspace`). Overview contain-fit keeps the existing ResizeObserver, insets re-derived for zero matting; the `sm` detail `max-h-[calc(100svh-300px)]` budget is re-derived for the removed chrome.
3. **Accessible name:** the status strip owned `h2#admin-planning-canvas-title`, which the canvas section's `aria-labelledby` points at. Re-home it as an sr-only heading inside the section — the id and the labelling relationship survive.
4. **Legend:** new shared `components/seat-map/MapStatusLegend.tsx` used by both surfaces. Parents keep computing counts (counts-follow-filters semantics pinned by `filter-feedback-source`); labels derive from `STATUS_LABELS`; card keeps `aria-label="Seat status legend"`. "Fit matches" / "Clear" move into this card when filters are active.
5. **Floor selector:** same component + `menuitemradio` keyboard semantics + **Floor 2 "SOON" entry kept** (owner ruling 2026-07-31); restyled to the white card recipe (trigger and menu).
6. **Add seat:** floating card; the pinned toggle shape is preserved verbatim (`aria-pressed={addSeatMode}` before the `{addSeatMode ? "Exit add seat" : "Add seat"}` ternary, `onClick={addSeatMode ? cancelAddSeatMode : startAddSeatMode}`), including the `mobileMapControlsHidden` chain.
7. **Zoom constants (contract #15):** step ±0.25, clamp 0.5–2.5, fit = contain + centered. `MAP_ZOOM_STEP` moves into `lib/mapViewport.ts` next to MIN/MAX; `ViewerSeatFinder`'s local re-declarations and inline clamp are deleted in favor of imports. `tests/map-viewport.test.mjs` updated to the new spec values.
8. **Map kebab deleted** (`seat-map-overflow-menu`, "Fit map to view" / "Zoom to 100%"): redundant with the zoom stack's fit button and the header kebab's reset-zoom; the prototype has no floating kebab. Its `accessibility-source` pins are updated in lockstep (the APG menu invariant continues to be enforced on the header kebab and floor menu).
9. **Banners:** stale-draft / session-expired / action-error alerts become overlays at the canvas top (no map push-down); roles/aria and the success-toast overlay unchanged.

## Viewer changes (`ViewerSeatFinder.tsx`)

Same strip-and-float: stage matting + `max-w` cap + mounted-sheet card classes removed (including the `sm:max-h-[calc(100svh-62px)]` magic height), `lg:aspect-[1911/867]` fit lock reworked to viewport-fill contain-fit, top-left floating cluster = floor pill + "Office map · N seats" crumb + "Updated {date}" pill + chips, shared `MapStatusLegend` bottom-left, zoom constants via `lib/mapViewport` imports. Directory/results/inspector panel mechanics, the reserved-gutter tiers, and the hydration guardrail (`viewer-directory-source`: first paint reserves the slot, `useSyncExternalStore` wiring) are untouched.

## Decisions (owner-approved 2026-08-03)

1. Approach A (chrome-strip on existing engine) — approved.
2. Legend **keeps the Unavailable row** the prototype omits — real seats carry the status; hiding it would make counts lie.
3. Floating map kebab **deleted** as redundant.
4. Zoom readout shows **"Fit"** at fit (not "100%") — fit width varies with window size; it is not a fixed zoom base.

Further deliberate deviation: mobile keeps the current stacked layout (the prototype is a 1440×900 desktop reference); mobile changes are limited to the removed matting.

## Do-not-touch (unchanged guardrails)

`lib/mapLayoutTransform.ts` and `lib/seatMath.ts` frozen (calibration fixture irreproducible); `pointToStyle` + true-coordinate snap + `viewportPlacement.offsetPx` wiring; viewer read-only isolation (`canEdit` gates incl. the `floor === "3"` SeatActionBar mount literal); skip links (`#planning-canvas` / `#viewer-seat-map`); roving tabindex; Escape ordering; filter-panel-before-search DOM order; sticky header literals; publish single-control contract; no token containing `dock:` in `SeatMap.tsx`; crowding clearance stays derived from live rendered scale (`clearanceFromScale(mapPixelsPerNormalizedUnit…)` identifiers); no cluster pills at fit view.

## Test lockstep plan

- **Update:** `accessibility-source` (canvas-section className pin, map-kebab menu section, banner-related pins as needed), `map-viewport` (0.5/2.5/0.25 + step export), `filter-feedback-source` only if the crumb/chips markup shifts inside the preserved adjacency.
- **Extend:** component test for `MapStatusLegend` (aria-label, STATUS_LABELS sourcing, draft count admin-only); source pin that both surfaces mount it.
- **Must stay green untouched:** desktop-seat-marker-system, map-calibration, seat-creation-ui, seat-clusters, viewer-directory, pill-crowding-scale, status-label, elevation-shadow-tokens, app-rail, browser + e2e tiers (the "More tools" header kebab flow survives; the deleted map kebab has no browser-tier selectors — verify before merge).

## Verification

Full gate (`lint`, `typecheck`, `npm test`, `build`, `test:e2e`) + `chrome-pixel-capture` screenshots diffed against `screenshots/01-prototype.png` (admin) and `08-prototype.png` (viewer) at 1440×900 + owner-run role-flip visual check for the admin surface (standing procedure). Watch specifically for: bottom-row marker overhang clipping (the `fitMapWidth` 24px gutter contract must keep applying), seat-centering targets landing under fixed panels, and zoom-stack collision with the viewer directory panel.
