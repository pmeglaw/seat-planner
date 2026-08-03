# v12 Slice 4 — Floating tabbed inspector + seat nudge (design)

**Date:** 2026-08-03 · **Owner approval:** design + 2 decisions approved in session (see Decisions)
**Source spec:** `docs/design_handoff_carbon_v12/README.md` (structural move #3, interaction contracts #1/#10, implementation-order slice 4) + `Seat Planner v12 Prototype.dc.html` lines 200–271 (implementation target) + `screenshots/02-prototype.png`.

## Scope

The seat inspector becomes a floating layer-01 column over the full-bleed map: dark card with header, chip row, icon action row, Overview/Notes/Activity tabs, AI entry row, and a pinned 48px footer CTA. The map stops reserving width for it; when a selected seat would sit under the panel, the map pans left with a ~250ms ease-out tween (the "nudge"). The canvas `SeatActionBar` and the inspector collapse rail are retired. Admin (`SeatMap.tsx`) and viewer (`ViewerSeatFinder.tsx`) both change; `SeatInspector.tsx` stays one shared component with the `canEdit` mode flag (contract #10 — not a fork).

**Not this slice:** publish diff table (5), zone chips + hover-wash (6), Ask Planner drawer AI treatment (7). People/results and Ask Planner panels keep their dock-reflow behavior exactly (contract #2 — the float/dock hybrid is deliberate).

## Decisions (owner-approved 2026-08-03)

1. **`SeatActionBar` retired.** Move/Swap/Vacate live in the inspector's icon action row; Assign/Edit assignment is the 48px `#D23F0A` footer CTA. This reverses the 2026-07-30 "verbs on canvas" call with the owner's explicit approval — the old rationale (verbs must survive collapse because the docked panel hid the map) no longer applies once the panel floats and the nudge keeps the seat visible. This also resolves the deferred Assign-accent ruling (`DESIGN_DIRECTION.md:36`): the accent+ink Assign pairing retires with the bar; assignment CTAs use the CTA ladder (`#D23F0A` bg / white text / hover `#B83708`).
2. **Collapse rail retired.** No 44px "VIEW DETAILS" rail, no "Collapse inspector" button, no mobile pill. The inspector is close-only (✕). `inspectorCollapsed` survives internally as the auto-yield flag: while the results panel, a mode card, or the Ask Planner drawer owns the right region the inspector renders nothing (selection preserved; the results panel keeps hosting its collapsed-seat row), and when the region frees the inspector auto-returns.

**Deliberate deviation from the prototype:** its `assignMode` (a flat "unseated people" pick list) is NOT adopted. The footer CTA opens the existing progressive assignment editor — searchable combobox, create-new-employee path, job title/extension/department fields, force-move conflict dialog, stale-draft (`MLS02`) recovery — all unchanged. The prototype sketch drops required functionality.

## Inspector structure (`SeatInspector.tsx`)

Geometry at the `panel` (≥900px) tier — floating, per prototype line 202:

- `position: fixed`, `top: calc(var(--admin-chrome-h) + 0.75rem)`, `right: 0.75rem`, `bottom: 0.75rem`, `width: 332px` (cap `max-w-[calc(100vw-1.5rem)]`), `bg #161616` (`--admin-chrome-bg`), border 1px `rgba(255,255,255,.14)`, `shadow-elevation-4` (named utility — `shadow-[var(...)]` stays banned), z-40 (below banners/undo toast at z-50; sheets/dialogs stay above).
- Sub-900 keeps the bottom-sheet tier exactly (fixed `inset-x-3 bottom-3`, `max-h-[60vh]`, z-[80]) with the same new content structure inside.

Content, top to bottom:

1. **Header:** 36px round avatar (existing gradient/initials), name 15px/600 white, role line 12px muted, ✕ close — the only dismiss control. Identity still reflects the SAVED occupant only (unsaved picks never flip the header).
2. **Chip row:** status pill (dot + label, existing hue mapping) · seat-code chip (square corners, mono, `bg white/10`) · zone pill. Viewer additionally keeps its "Published seat" chip.
3. **Icon action row** (`canEdit` only): 1px-gap equal cells on `#262626` (`--admin-chrome-raised`), icon (~15px, 1.5 stroke, repo glyph style) above an 11px/600 label. Occupied seat → Move / Swap / Vacate (Vacate cell `#2b1a1b` bg, `#ff8389` text, hover `rgba(179,35,44,.25)`). Open seat → Swap only (hide-not-disable; Move is occupant-centric and Assign lives in the footer). Handlers are the parent's existing `onMove`/`onSwap`/`onVacate` contracts moved from `SeatActionBar` props onto `SeatInspector` props — SeatMap keeps owning move/swap modes and the always-confirm vacate dialog.
4. **Tabs** (`canEdit` only): Overview / Notes / Activity. APG tabs pattern — `role="tablist"`/`tab`/`tabpanel`, `aria-selected`, roving tabindex with Left/Right arrows; active tab carries the 2px `#FF5715` top edge per prototype. Tab state resets to Overview when the selected seat changes.
   - **Overview:** Contact facts (existing `buildContactRows`, hidden-when-empty rule intact) + Seat facts (Zone, Seat type) + the open-seat Status select + Delete seat (custom, non-protected only — `seatProtection` gates untouched).
   - **Notes:** the existing notes textarea (same form field, same dirty tracking).
   - **Activity:** the existing session-local `activityEntries` list and empty-state copy.
5. **AI entry row** (`canEdit` only, admin surface): the existing "Ask Planner about this seat" button restyled per prototype line 264 — leading bordered "AI" chip using the `--admin-ai-*` dark-family tokens (`#78a9ff` text/border), `#262626` row, trailing ›.
6. **Footer** (`canEdit` only): pinned 48px full-width CTA — "Edit assignment" (occupied) / "Assign employee" (open) — `#D23F0A` bg, white 14px/600 text, hover `#B83708` (`--admin-primary-cta*` tokens). Opens the progressive editor in the body scroll area (tabs hide while editing); while editing/dirty/pending/error the existing commit bar (Cancel / Save draft changes + state pill) replaces the footer — `showCommitBar` logic unchanged.

**Viewer mode (`canEdit=false`, contract #10):** header + chip row + Overview content only. No action row, no tabs, no AI row, no footer. Same float geometry.

**Removed states:** the collapsed rail render branch, the mobile "VIEW DETAILS" pill, the `Back to map`/`Collapse inspector` buttons, and the `rounded-[10px]` button overrides (flat 0 radius per token spec — "inspector's rounded-10px buttons are retired").

## Map geometry + nudge (`SeatMap.tsx`, `ViewerSeatFinder.tsx`, `lib/mapViewport.ts`)

**Reserve removal.** The inspector no longer contributes to `stageReservedClassName` on either surface: the `"expanded"` reserve remains for the results panel and mode card (they dock — contract #2), and the `"rail"` 56px tier is deleted with the rail. The viewer directory panel's reserved-gutter tiers and hydration guardrails are untouched.

**Nudge (contract #1).** On selection at ≥900px, if the selected seat's visual x in viewport px is beyond `panelLeft − 24`, animate `scrollLeft` so the seat lands at `panelLeft − 48`, ~250ms ease-out, where `panelLeft = viewportWidth − 12 − 332`. Vertical position is left alone at this tier. Below 900px the existing center-above-sheet behavior stays.

- **Overscroll room:** the scroll engine cannot pan past its content, so at fit view there is no room to nudge. While the inspector is open at the panel tier, the scroll CONTENT gets right padding equal to `332 + 24`px — this only extends the scrollable range (no rescale, no refit, no reflow) and is removed on close (the browser clamps `scrollLeft` back automatically). This is the scroll-engine equivalent of the prototype's free-translate overscroll.
- **Tween:** a small rAF tween helper (ease-out cubic, ~250ms) — a CSS transition is ruled out by the handoff ("fights drag-panning"). Any user pan / wheel / zoom / new scroll command cancels an in-flight tween. `prefers-reduced-motion: reduce` jumps instantly.
- **Purity:** target math lives in `lib/mapViewport.ts` as pure exported helpers + constants (clearance 48, threshold 24, overscroll amount), unit-tested in `tests/map-viewport.test.mjs`. Pan/zoom/nudge remain view transforms only — seat coordinates are never written (do-not-touch #4), and `lib/mapLayoutTransform.ts` / `lib/seatMath.ts` stay frozen.

**Keyboard flow.** Enter on a marker (and the guard-action/select paths) focuses the inspector panel (`#seat-inspector-panel`, existing tabIndex=-1 idiom) instead of the retired bar's first action. Escape ordering and roving-tabindex marker navigation are unchanged.

**Auto-yield.** `resultsPanelOpen` / mode card / Ask Planner still suppress the inspector (render nothing, selection kept). When the suppressor clears and a seat is still selected, the inspector returns. The INV-1 search auto-collapse mechanic keeps working through the same flag; only its rail/pill UI is gone.

## Do-not-touch (unchanged guardrails)

`lib/mapLayoutTransform.ts` + `lib/seatMath.ts` frozen; marker anchor/`pointToStyle`; draft/published isolation and all draft-concurrency fencing; `updateSeatAction` flow incl. force-move + `MLS02`; vacate always-confirms; `seatProtection` delete gates; viewer read-only isolation (no edit affordances at `canEdit=false`); skip links; filter-panel-before-search DOM order; publish single-control contract; no `dock:` tokens; viewer-directory hydration pins; zoom contract #15 constants.

## Test lockstep plan

- **Update:** `tests/accessibility-source.test.mjs` — retire the SeatActionBar pins (including the `floor === "3"` mount literal and firstActionRef handoff pins) and pin the replacements: icon-action-row `canEdit` gate, tablist/tab/tabpanel semantics, inspector focus handoff, viewer Overview-only. `tests/seat-inspector.test.mjs` (jsdom) — tabs render/switch/arrow-keys/reset-on-seat-change, footer CTA opens the editor, commit bar replaces footer, viewer renders no tabs/actions/footer. `tests/map-viewport.test.mjs` — nudge target math (threshold, clearance, no-op when clear), overscroll amount.
- **Extend:** tween helper unit test (progress curve endpoints, cancel).
- **Must stay green untouched:** `desktop-seat-marker-system-source`, `map-calibration`, `seat-creation-ui-source` (delete/creation anchors), `viewer-directory-source`, `filter-feedback-source`, `pill-crowding-scale`, `draft-concurrency`, `rpc-execution`, browser + e2e tiers.

## Verification

Full gate (`lint`, `typecheck`, `npm test`, `build`, `test:e2e`) + `chrome-pixel-capture` diff against `screenshots/02-prototype.png` at 1440×900 + owner visual pass in the owner's Chrome session (established method — no role flip). Watch specifically for: nudge fighting drag-pan (tween must cancel), overscroll padding leaking into fit-width math or marker edge-pinning (`mapVisibleRange`), banner/toast stacking vs the z-40 panel, sheet-tier regressions below 900px, and Enter-on-marker focus landing.
