# v12 Slice 3 — Full-Bleed Map + Floating Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The floor plan becomes layer-00 (edge-to-edge below the 36px bar, right of the 48px rail) on both admin and viewer surfaces; the matted map card, width cap, and docked status strip are deleted; floor pill, crumb+chips, add-seat, legend, and zoom float as layer-01 white cards; zoom adopts contract #15 (±0.25, clamp 0.5–2.5).

**Architecture:** Chrome-strip on the existing engine. Zoom/pan stays width-scaling + native scroll; panel reflow stays fixed-overlays + reserved right padding (`stageReservedClassName`). No transform engine, no reflow changes. Spec: `docs/superpowers/specs/2026-08-03-v12-slice3-full-bleed-map-design.md`. Visual targets: `docs/design_handoff_carbon_v12/screenshots/01-prototype.png` (admin), `08-prototype.png` (viewer) at 1440×900.

**Tech Stack:** Next.js App Router, Tailwind (semantic `--admin-*` / `--sp-*` tokens in `app/globals.css`), plain-Node tests (`npm test`), jsdom component tier (see `test-tiers` skill before touching those), source-pin tests.

## Global Constraints

- **Frozen files:** `lib/mapLayoutTransform.ts`, `lib/seatMath.ts` — do not touch (calibration fixture is irreproducible).
- **Pinned shapes that must survive verbatim** (grep the named test before editing near them): `pointToStyle` + `viewportPlacement.offsetPx` wiring (`desktop-seat-marker-system-source`); add-seat toggle `aria-pressed={addSeatMode}` before `{addSeatMode ? "Exit add seat" : "Add seat"}` with `onClick={addSeatMode ? cancelAddSeatMode : startAddSeatMode}` (`seat-creation-ui-source`); `{mapCrumbLabel}</span>` immediately followed by `<ActiveFilterChips` (`filter-feedback-source`); `canEdit && floor === "3" && (…<SeatActionBar` literal; skip-link ids `#planning-canvas` / `#viewer-seat-map`; `<header className="sticky top-0 ` (trailing space) on both surfaces; `overflow-x-clip` on both map roots; `const canvasBannerSafeAreaClassName = ""`; the `mobileMapControlsHidden` variable chain; exactly 2× `name="seat-search"` / `type="search"` / `placeholder={SEAT_SEARCH_PLACEHOLDER}` and exactly 1× `onClick={openPublishReview}` in SeatMap.tsx; filter-panel JSX index before command-search index; no token containing `dock:` in SeatMap.tsx; no `shadow-[var(`-form classes anywhere.
- **Guardrail-file edits:** `tests/accessibility-source.test.mjs` edits are allowed ONLY for the pins this plan names, and each edit must keep the underlying a11y invariant enforced (relocate, never delete semantics).
- **Shadows:** floating cards use `shadow-elevation-3` (`0 6px 16px rgba(22,22,22,.14)` — already the prototype value).
- **Card recipe:** `border border-[var(--admin-border)] bg-white shadow-elevation-3` + radius 0 (default), z-40 tier, 32px buttons.
- Commit after every task; run `npm test` before every commit.

---

### Task 1: Zoom contract #15 constants, single-sourced

**Files:**
- Modify: `lib/mapViewport.ts` (constants near top, `MAP_ZOOM_MIN`/`MAP_ZOOM_MAX` at ~L37–38)
- Modify: `tests/map-viewport.test.mjs`
- Modify: `components/seat-map/SeatMap.tsx` (`const MAP_ZOOM_STEP = 0.2` at ~L170)
- Modify: `components/seat-map/ViewerSeatFinder.tsx` (locals at ~L77–79, inline clamp at ~L543)

**Interfaces:**
- Produces: `MAP_ZOOM_MIN = 0.5`, `MAP_ZOOM_MAX = 2.5`, `MAP_ZOOM_STEP = 0.25` all exported from `lib/mapViewport.ts`; `clampZoom` unchanged in shape (rounds to whole percentage points, non-finite → 1).

- [ ] **Step 1: Update the lib test to the new spec values**

In `tests/map-viewport.test.mjs`: change every assertion using `0.6`/`2` as the clamp bounds to `0.5`/`2.5`, and add:

```js
import { MAP_ZOOM_STEP } from "../lib/mapViewport.ts"; // match the file's existing import style

test("zoom step matches v12 contract #15", () => {
  assert.equal(MAP_ZOOM_STEP, 0.25);
});
test("clampZoom holds the v12 bounds", () => {
  assert.equal(clampZoom(0.4), 0.5);
  assert.equal(clampZoom(3), 2.5);
  assert.equal(clampZoom(1.25), 1.25);
});
```

Keep the existing whole-percent-rounding and NaN→1 assertions untouched.

- [ ] **Step 2: Run to verify failure** — `npm test 2>&1 | grep -A3 map-viewport` → FAIL (constants still 0.6/2, `MAP_ZOOM_STEP` not exported).

- [ ] **Step 3: Change `lib/mapViewport.ts`**

```ts
export const MAP_ZOOM_MIN = 0.5;
export const MAP_ZOOM_MAX = 2.5;
/** v12 contract #15: one zoom click = 25 percentage points. */
export const MAP_ZOOM_STEP = 0.25;
```

- [ ] **Step 4: Point both components at the lib**
  - `SeatMap.tsx`: delete the local `const MAP_ZOOM_STEP = 0.2;` and add `MAP_ZOOM_STEP` to the existing `lib/mapViewport` import.
  - `ViewerSeatFinder.tsx`: delete the local `MAP_ZOOM_MIN` / `MAP_ZOOM_MAX` / `MAP_ZOOM_STEP` declarations (~L77–79) and the inline clamp expression (~L543, the `Math.round(...*100)/100` + min/max form) — import `MAP_ZOOM_MIN, MAP_ZOOM_MAX, MAP_ZOOM_STEP, clampZoom` from `@/lib/mapViewport` and call `clampZoom(next)` where the inline math was. Behavior identical by construction (same formula).

- [ ] **Step 5: Full suite green** — `npm test` → all pass (640+ baseline).
- [ ] **Step 6: Commit** — `git commit -m "feat(map): v12 zoom contract — step 0.25, clamp 0.5–2.5, single-sourced in lib/mapViewport"`

---

### Task 2: `MapStatusLegend` shared floating legend component

**Files:**
- Create: `components/seat-map/MapStatusLegend.tsx`
- Create: `tests/map-status-legend.test.mjs` (jsdom tier — **invoke the `test-tiers` skill first**; copy the harness pattern from `tests/seat-map-components.test.mjs`)

**Interfaces:**
- Produces (consumed by Tasks 3 & 5):

```tsx
export type MapLegendEntry = {
  key: string;          // status key, e.g. "assigned"
  label: string;        // MUST come from STATUS_LABELS at the call site
  dotClassName: string; // bg-* class for the 7px dot (reuse each surface's current dot classes)
  count: number;
};

export function MapStatusLegend(props: {
  ariaLabel: string;        // "Seat status legend" (admin) / "Seat status summary" (viewer) — literals stay at call sites (pinned there)
  totalLabel: string;       // e.g. "90 seats"
  entries: MapLegendEntry[];
  summary?: React.ReactNode; // match/status sentence
  actions?: React.ReactNode; // admin Fit matches / Clear buttons when filters active
}): React.JSX.Element;
```

- [ ] **Step 1: Write the failing jsdom test**

```js
// tests/map-status-legend.test.mjs — harness boilerplate copied from seat-map-components.test.mjs
test("legend renders total, entries from given labels, and dot counts", () => {
  const { container } = renderComponent(MapStatusLegend, {
    ariaLabel: "Seat status legend",
    totalLabel: "90 seats",
    entries: [
      { key: "assigned", label: "Assigned", dotClassName: "bg-x", count: 60 },
      { key: "available", label: "Open", dotClassName: "bg-y", count: 27 },
    ],
  });
  const list = container.querySelector('ul[aria-label="Seat status legend"]');
  assert.ok(list);
  assert.match(container.textContent, /90 seats/);
  assert.match(container.textContent, /Assigned/);
  assert.match(container.textContent, /60/);
});
test("summary and actions slots render when provided", () => {
  const { container } = renderComponent(MapStatusLegend, {
    ariaLabel: "Seat status summary", totalLabel: "5 seats", entries: [],
    summary: "3 of 5 seats match", actions: null,
  });
  assert.match(container.textContent, /3 of 5 seats match/);
});
```

- [ ] **Step 2: Run to verify failure** — `npm test 2>&1 | grep -A3 map-status-legend` → FAIL (module missing).

- [ ] **Step 3: Implement**

```tsx
// components/seat-map/MapStatusLegend.tsx
// Floating layer-01 legend card shared by the admin map and the viewer.
// Parents own count computation (counts-follow-filters semantics are pinned
// at the call sites by filter-feedback-source) and pass labels sourced from
// STATUS_LABELS. Positioning is the parent's job; this renders the card only.
import type { ReactNode } from "react";

export type MapLegendEntry = {
  key: string;
  label: string;
  dotClassName: string;
  count: number;
};

export function MapStatusLegend({ ariaLabel, totalLabel, entries, summary, actions }: {
  ariaLabel: string;
  totalLabel: string;
  entries: MapLegendEntry[];
  summary?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="pointer-events-auto flex max-w-[min(56vw,620px)] flex-wrap items-center gap-x-3.5 gap-y-2 border border-[var(--admin-border)] bg-white px-3.5 py-2 shadow-elevation-3">
      <span className="text-[12px] font-semibold text-[var(--sp-color-text-primary)]">{totalLabel}</span>
      <ul aria-label={ariaLabel} className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
        {entries.map(entry => (
          <li key={entry.key} className="flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--sp-color-text-secondary)]">
            <span aria-hidden="true" className={`h-[7px] w-[7px] rounded-full ${entry.dotClassName}`} />
            {entry.label}
            <span className="font-semibold text-[var(--sp-color-text-primary)]">{entry.count}</span>
          </li>
        ))}
      </ul>
      {summary ? <span className="text-[11.5px] text-[var(--sp-color-text-secondary)]">{summary}</span> : null}
      {actions}
    </div>
  );
}
```

Adjust the two text-token names to whatever `app/globals.css` actually defines for light-surface primary/secondary text (grep `--sp-color-text`) — do not invent tokens.

- [ ] **Step 4: Run to verify pass** — `npm test 2>&1 | grep -A3 map-status-legend` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(map): MapStatusLegend floating legend card (shared admin/viewer)"`

---

### Task 3: Admin full-bleed — strip matting, workspace token, floating legend, status strip delete, overlay banners

**Files:**
- Modify: `app/globals.css` (admin token block near `--admin-bg`, ~L207; contrast-notes comment)
- Modify: `components/seat-map/SeatMap.tsx`
- Modify: `tests/accessibility-source.test.mjs` (ONLY the pins named below)

**Interfaces:**
- Consumes: `MapStatusLegend`, `MapLegendEntry` from Task 2.
- Produces: full-bleed admin stage that Task 4 floats its top clusters over; `#admin-planning-canvas-title` still resolvable.

- [ ] **Step 1: Add the workspace token**

In `app/globals.css`, next to `--admin-bg`:

```css
/* v12 layer-00 workspace: the band behind the full-bleed floor plan raster.
   Decorative only (no text sits directly on it). */
--admin-map-workspace: #ECE8E0;
```

- [ ] **Step 2: Update the accessibility-source pins FIRST (TDD for source tests)**

In `tests/accessibility-source.test.mjs`, make exactly these edits and no others in this task:
1. The literal canvas-section pin `aria-labelledby="admin-planning-canvas-title" className={[filterCollapsed ? "order-1" : "order-2", "min-w-0 overflow-hidden` — keep it (the class prefix survives; we strip only later classes in the array). Verify after Step 3 that it still matches; if your final class array broke the literal, restore the `min-w-0 overflow-hidden` prefix in the source rather than editing this pin.
2. The `aria-label="Seat status legend"` existence pin — keep; the literal stays in SeatMap.tsx as the `ariaLabel` prop value.
3. Add a new pin in the same style as neighbors: SeatMap.tsx contains `<MapStatusLegend` (Task 5 extends the same pin to ViewerSeatFinder.tsx).

Run `npm test 2>&1 | grep -B2 -A5 accessibility` → the new `<MapStatusLegend` pin FAILS (not mounted yet); everything else passes.

- [ ] **Step 3: Strip the in-flow chrome in `SeatMap.tsx`**

All anchors are current-code quotes; find by string, not line number.
1. Width-cap wrapper (`"mx-auto flex w-full max-w-[1920px] flex-1 flex-col px-2 py-2 sm:px-3 sm:py-3 lg:min-h-0 lg:overflow-hidden"`) → `"flex w-full flex-1 flex-col lg:min-h-0 lg:overflow-hidden"` — keep `stageReservedClassName` in the same array.
2. `<main>` class `"grid grid-cols-1 gap-2 p-2 lg:min-h-0 lg:flex-1 lg:items-stretch lg:overflow-hidden"` → drop `gap-2 p-2`.
3. Canvas section: drop `p-0.5`, keep the `min-w-0 overflow-hidden relative` prefix and everything else.
4. `mapViewportClassName` (built ~L2485): remove `border border-[var(--admin-border)] shadow-elevation-2` and the overview matting `p-1.5 sm:p-2`; change `bg-[var(--sp-color-canvas)]` → `bg-[var(--admin-map-workspace)]`; keep `relative mx-auto w-full max-w-full overscroll-contain`, the overview/detail branching, cursor classes, and focus ring. Change the sm detail cap `sm:max-h-[calc(100svh-300px)]` → `sm:max-h-[calc(100svh-88px)]` (36px bar + mobile search row; verify visually in Task 6 and adjust the constant if the row measures differently).
5. Overview fit effect (~L698–730): the `-12` insets compensated for the deleted matting — change the inset subtraction to **16** (the prototype's breathing margin: `vw−…−16`).
6. Delete the whole bottom status strip block (the `canEdit`-gated `<div className="mt-2 flex flex-wrap … border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 py-2">` after the map stage, ~L3401–3458) — after harvesting from it: the `h2` (Step 4), the legend `<ul>` + `SEAT_STATUS_LEGEND`/`legendCounts` usage (Step 5), and the `filtersActive` Fit-matches/Clear buttons (Step 5).

- [ ] **Step 4: Re-home the canvas title**

Inside the canvas section, first child:

```tsx
<h2 id="admin-planning-canvas-title" className="sr-only">
  {searchStatusTitle ?? "Planning canvas"}
</h2>
```

(Reuse the exact title expression the deleted strip used — copy it verbatim from the old `h2` before deleting.)

- [ ] **Step 5: Mount the floating legend (bottom-left, against the map stage)**

Inside the map-stage `div` (the `relative` wrapper that already positions MapZoomControl `absolute bottom-3 right-3 z-30`), add as a sibling of the zoom wrapper:

```tsx
<div className={["absolute bottom-3 left-3 z-30 hidden md:block"].join(" ")}>
  <MapStatusLegend
    ariaLabel="Seat status legend"
    totalLabel={`${stats.total} ${stats.total === 1 ? "seat" : "seats"}`}
    entries={SEAT_STATUS_LEGEND
      .filter(item => !item.draftOnly || legendCounts[item.key] > 0)
      .map(item => ({ key: item.key, label: item.label, dotClassName: item.dotClassName, count: legendCounts[item.key] }))}
    summary={/* the seat-inventory/match sentence the strip rendered — copy its JSX expression */ undefined}
    actions={filtersActive ? (/* the exact Fit matches + Clear buttons JSX harvested from the strip */ null) : null}
  />
</div>
```

Notes: `SEAT_STATUS_LEGEND` item field for the dot may be named differently (`className`/`dotClass`) — read the type at ~L254 and map accordingly. Keep `legendCounts` and its source expression (`legendFiltersActive ? localSeats.filter(matchesFilters) : localSeats`) byte-identical — `filter-feedback-source` pins the identifiers. The old legend `<ul>`'s `hidden … md:flex` visibility becomes the wrapper's `hidden md:block`.

- [ ] **Step 6: Banners become overlays**

Wrap the existing stale-draft / session-expired / action-error alert stack (currently in-flow at the top of the canvas section) in:

```tsx
<div className="pointer-events-none absolute inset-x-3 top-3 z-40 flex flex-col gap-2">
  {/* existing alert elements unchanged, each gets pointer-events-auto */}
</div>
```

Do not touch the `actionNotice` toast (already an overlay) or `canvasBannerSafeAreaClassName` (pinned as `""`).

- [ ] **Step 7: Green** — `npm test` → all pass, including the new SeatMap `<MapStatusLegend` pin.
- [ ] **Step 8: Build sanity** — `npm run build` passes (visual verification is Task 6; build+tests are not visual verification).
- [ ] **Step 9: Commit** — `git commit -m "feat(map): full-bleed admin canvas — matting and status strip out, floating legend + overlay banners in"`

---

### Task 4: Admin floating top clusters — floor pill restyle, crumb+chips, add-seat, map kebab delete

**Files:**
- Modify: `components/seat-map/SeatMap.tsx` (the in-flow row `"flex flex-wrap items-center gap-x-3 gap-y-2 px-0.5 pb-2 lg:pb-0"` ~L3136–3259)
- Modify: `components/seat-map/FloorSelector.tsx` (classes only — zero behavior/aria changes)
- Modify: `tests/accessibility-source.test.mjs` (map-kebab pins only)

**Interfaces:**
- Consumes: full-bleed stage from Task 3.
- Produces: the admin map's final slice-3 chrome; Task 5 mirrors the cluster pattern on the viewer.

- [ ] **Step 1: Update accessibility-source FIRST — remove the map-kebab pins**

Delete from `tests/accessibility-source.test.mjs` exactly: the assertions on `id="seat-map-overflow-menu"`, its `role="menu"`/menuitem "Fit map to view" / "Zoom to 100%" items, its Tab-close/Arrow-key regexes, and `mapMenuButtonRef` in the focus-restore pin list (keep `chromeMenuButtonRef` and `filterTriggerRef`/`returnFocusRef` pins). Do NOT touch the header-kebab ("More tools") or FloorSelector menu pins. Run the file's tests → still pass (deleting pins can't fail; this step exists so the next step's source edit doesn't trip them).

- [ ] **Step 2: Move the row's contents into two floating clusters**

Replace the in-flow row with, inside the map-stage relative wrapper (siblings of the legend/zoom wrappers):

```tsx
{/* top-left: floor + crumb + active filter chips */}
<div className="pointer-events-none absolute left-3 top-3 z-40 flex flex-wrap items-center gap-2">
  <div className="pointer-events-auto"><FloorSelector floor={floor} onChange={setFloor} /></div>
  <span className="pointer-events-auto border border-[var(--admin-border)] bg-white px-2.5 py-1.5 text-[12px] text-[var(--sp-color-text-secondary)] shadow-elevation-3">{mapCrumbLabel}</span>
  <ActiveFilterChips … /* keep the exact existing props; MUST stay immediately after the crumb span — filter-feedback-source pins the adjacency */ />
</div>
{/* top-right: add seat (admin only; slides with the reserved-padding geometry automatically because the stage shrinks) */}
<div className="pointer-events-none absolute right-3 top-3 z-40">
  {/* the existing Add seat <button> JSX moved verbatim — aria-pressed={addSeatMode} BEFORE the
      {addSeatMode ? "Exit add seat" : "Add seat"} ternary, onClick ternary unchanged (seat-creation-ui-source pin);
      restyle classes to: pointer-events-auto flex h-8 items-center gap-1.5 border border-[var(--admin-border)]
      bg-white px-3 text-[12.5px] font-semibold shadow-elevation-3 hover:bg-[var(--sp-color-canvas)] */}
</div>
```

Preserve: `floor === "2"` still renders `FloorPlaceholder` in the viewport (unchanged); the mobile visibility of these controls matches today's (the old row was always visible — keep the clusters visible on mobile; if they collide with the mobile search row, gate with the existing `mobileMapControlsHidden` variable, never a new one).

- [ ] **Step 3: Delete the map kebab** — remove the `seat-map-overflow-menu` trigger button, menu, its open/close state, and `mapMenuButtonRef`. Its two actions live on: fit → MapZoomControl's fit button (`fitMapToView`), zoom-to-100% → verify the header kebab already has a reset-zoom item calling the same handler; if its handler differs, point the header item at `() => applyMapZoom(1)` — do not lose the capability.

- [ ] **Step 4: FloorSelector white-card restyle (classes only)**
  - Trigger: `border --admin-border` stays; `bg-[var(--admin-surface)]` → `bg-white`; add `shadow-elevation-3`; hover `bg-[var(--admin-surface-alt)]` → `hover:bg-[var(--sp-color-canvas)]`; text/py/px/focus-ring classes unchanged.
  - Menu: `bg-[var(--admin-surface)]` → `bg-white`; keep `shadow-elevation-3`, `min-w-[230px]`, item classes, SOON badge, and every aria/keyboard behavior byte-identical (`menuitemradio` pattern is pinned; ct test asserts `[aria-label^="Change floor"]`).
  - Verify the trigger/menu text tokens still hit ≥4.5:1 on white (they are `#161616`-family — fine; do not change token values).

- [ ] **Step 5: Green** — `npm test` → all pass. Specifically confirm `filter-feedback-source` (crumb/chips adjacency) and `seat-creation-ui-source` (add-seat shape) pass untouched.
- [ ] **Step 6: Commit** — `git commit -m "feat(map): float admin floor pill, crumb+chips, add seat; retire the map overflow kebab"`

---

### Task 5: Viewer full-bleed + floating cluster + shared legend

**Files:**
- Modify: `components/seat-map/ViewerSeatFinder.tsx`
- Modify: `tests/accessibility-source.test.mjs` (extend the `<MapStatusLegend` pin to ViewerSeatFinder.tsx)

**Interfaces:**
- Consumes: `MapStatusLegend` (Task 2), zoom imports (Task 1), the cluster pattern from Task 4.

- [ ] **Step 1: Strip matting** (anchors are current-code quotes):
  1. Stage wrapper `"mx-auto flex w-full max-w-[1920px] flex-1 flex-col px-2 py-2 sm:px-3 sm:py-3"` → `"flex w-full flex-1 flex-col"`; keep `stageReservedClassName` (the viewer-directory hydration guardrail depends on the reserve mechanism — do not touch `directoryOpen`, `useSyncExternalStore`, or the tier expressions).
  2. Viewport classes: remove `border border-[var(--admin-border)] shadow-elevation-2`, change `bg-[var(--sp-color-canvas)]` → `bg-[var(--admin-map-workspace)]`, remove the `sm:max-h-[calc(100svh-62px)]` cap (root is `lg:h-screen`; below lg keep `min-h-[360px] sm:min-h-[520px] max-h-[82svh]`).
  3. Fit lock: remove the `lg:aspect-[1911/867]` overview branch — stage becomes `relative min-w-0 lg:flex lg:min-h-0 lg:flex-1` in both states. The three-tier fit effect (ResizeObserver → `fitMapWidth`) needs no change; it measures the viewport element, which is now the full bleed. Verify no fit feedback loop at lg (height is screen-determined, so the loop precondition is gone); if width oscillates on resize, re-add the aspect branch and stop — flag for review instead of improvising.
- [ ] **Step 2: Float the toolbar row** — move FloorSelector + `"Office map · N seats"` crumb + "Updated {lastPublishedLabel}" pill + `ActiveFilterChips` into a top-left cluster identical in structure to Task 4 Step 2 (crumb span then chips, adjacency preserved; "Updated" pill keeps its current classes plus the card recipe). Delete the old in-flow row.
- [ ] **Step 3: Replace the status-strip footer** — delete the in-flow footer (`"mt-2 border … px-3 py-2"` ~L1161–1184) and mount bottom-left, sibling of the zoom wrapper:

```tsx
<div className="absolute bottom-3 left-3 z-30 hidden md:block">
  <MapStatusLegend
    ariaLabel="Seat status summary"
    totalLabel={`${statusCountSeats.length} ${statusCountSeats.length === 1 ? "seat" : "seats"}`}
    entries={/* the viewer's current Assigned/Open/Reserved pill data mapped to MapLegendEntry — reuse its exact count expressions and dot classes */}
    summary={/* the current match/status sentence expression, verbatim */}
  />
</div>
```

Keep the sr-only aria-live announcement element (currently adjacent to the footer) — move it next to the marker layer, do not delete. Keep the `statusCountSeats`/`publishedSeats` identifier expressions byte-identical (pinned).

- [ ] **Step 4: Zoom-stack collision check** — the directory/results panels are `fixed right-3 bottom-3` at ≥900px and the zoom stack is `absolute bottom-3 right-3` in the stage; the reserve padding keeps the stage clear of them, so no overlap — but verify with the panel open at 900–1000px widths in Task 6. If they collide, the fix is raising the zoom wrapper's `right` offset when the right slot is occupied, mirroring how `stageReservedClassName` is computed (prototype behavior: the control slides).
- [ ] **Step 5: Green** — `npm test`; `viewer-directory-source`, `viewer-keyboard-parity-source`, `filter-feedback-source` must pass untouched.
- [ ] **Step 6: Commit** — `git commit -m "feat(viewer): full-bleed viewer map — matting and footer out, floating cluster + shared legend in"`

---

### Task 6: Full gate + visual verification + fix wave

**Files:** whatever the fixes need (expect: small class corrections, the sm height constant, zoom-offset tweaks).

- [ ] **Step 1: Full gate** — `npm run lint && npm run typecheck && npm test && npm run build && npm run coverage:check`, then `npm run test:e2e` (needs the fresh build) and `npm run test:browser` + `npm run test:ct` (harness details: `test-tiers` skill).
- [ ] **Step 2: Visual verification (REQUIRED — tests are not visual verification):** invoke the `run-seat-planner` skill; capture admin map (default, seat selected, filters active, panel open) and viewer (default, directory open, search active) at 1440×900 via the `chrome-pixel-capture` skill; diff against `screenshots/01-prototype.png` / `08-prototype.png`. Check the named hazards: bottom-row marker overhang not clipped (fitMapWidth 24px gutter still effective), seat-centering not landing under fixed panels, zoom stack vs directory panel at 900–1000px, banner overlay not covering the floor pill, mobile 390px stacked layout intact.
- [ ] **Step 3: Fix wave** — correct what the captures show; re-run `npm test` after each fix; commit fixes as `fix(map): …` commits.
- [ ] **Step 4: Final commit + notes** — update `docs/handoff-v12-shell.md` (or the docs file slices 1–2 used) with a one-paragraph slice-3 shipped note. Commit `docs: v12 slice-3 shipped notes`.

**Owner-run afterward (not automatable):** role-flip visual check of the admin surface per the standing procedure, then PR + merge on green CI.
