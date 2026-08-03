# v12 Slice 4 — Floating Tabbed Inspector + Seat Nudge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the seat inspector into a floating tabbed panel (prototype screenshot 02), retire the canvas SeatActionBar and the collapse rail, and pan the map out from under the panel with a ~250ms tween when a selected seat would be covered.

**Architecture:** `SeatInspector.tsx` is restructured in place (float geometry, chip row, icon action row, Overview/Notes/Activity tabs, AI entry row, pinned 48px footer CTA) and stays one component with the `canEdit` mode flag. `SeatMap.tsx` deletes the bar, wires the verbs into the inspector, drops the inspector's stage reserve, and adds the nudge; `ViewerSeatFinder.tsx` mirrors the reserve drop + nudge. Nudge math is pure in `lib/mapViewport.ts`; the animation clock is a tiny injectable helper in new `lib/animateValue.ts`. The nudge is a **hybrid**: consume horizontal scroll room first, and apply any remainder (fit view has no scroll room) as a `translate` on the map frame — both channels driven by ONE tween so easing can't diverge. Restore the translate to 0 on close/deselect.

**Tech Stack:** Next.js App Router client components, Tailwind, node:test (+ tsModuleLoader for lib, renderComponent.mjs jsdom harness for components), Playwright browser tier.

## Global Constraints

- Prototype geometry (spec): panel `top: calc(var(--admin-chrome-h) + 0.75rem)`, `right: 0.75rem`, `bottom: 0.75rem`, `width 332px`, bg `var(--admin-chrome-bg)` (#161616), border `1px rgba(255,255,255,.14)`, `shadow-elevation-4`, `panel:z-40`; sub-900 bottom sheet unchanged (`inset-x-3 bottom-3 max-h-[60vh] z-[80]`). The class string must keep `z-[80]` BEFORE `panel:z-40` in file order — `tests/accessibility-source.test.mjs` pins `/z-\[80\][\s\S]*panel:z-40/`.
- Nudge contract (#1): threshold = panel left − 24px, target = panel left − 48px, panel left = `clientWidth − 12 − 332`, duration ~250ms ease-out cubic, JS tween (never a CSS transition on scroll), cancelled by user pan/wheel/zoom, instant under `prefers-reduced-motion: reduce`. Never write seat coordinates.
- CTA ladder: footer CTA `#D23F0A` bg / white text / hover `#B83708` — via existing `--admin-primary-cta` / `--admin-primary-cta-hover` tokens. 48px tall. Labels: "Edit assignment" (occupied) / "Assign employee" (open). aria-labels stay `Edit assignment for ${label}` / `Assign an employee to ${label}` (browser tier matches the prefix `Assign an employee to`).
- Action-row aria-labels (browser tier + a11y pins depend on these exact shapes): Move → `Move ${occupantName} to another seat` (fallback `Move ${label}` when unnamed), Swap → `Swap ${label}`, Vacate → `Vacate ${label}`. Close button keeps `aria-label="Close inspector"`.
- AI-family tokens (`--admin-ai-*`) may appear in `SeatInspector.tsx` ONLY inside a dedicated `AskPlannerSeatRow` component (mirrors the AppRail `AiCell` bounding technique in `tests/accessibility-source.test.mjs:87-138`). Zero occurrences in `ViewerSeatFinder.tsx` (existing pin).
- Preserved pinned literals in `SeatInspector.tsx` (do NOT rename): `id="seat-inspector-panel"`, `id="seat-actions-heading"`, `const showCommitBar = `, `id="seat-inspector-commit-bar"`, `key={`seat-inspector-sections-${selectedSeat.id}`}`, `aria-label={`Ask Planner about ${selectedSeat.label}`}`, the move-conflict dialog's `/z-\[90\][\s\S]*sm:z-\[70\]/` ordering, the `STATUS_LABELS[effectiveStatus]` / `{STATUS_LABELS.available}` usages, the shared `CloseIcon` import (no inline ✕ glyph), the stale-draft (`STALE_DRAFT`) and force-move (`applySeatUpdated` fresh-payload) branches, and the delete gate `selectedSeat.is_custom && !isProtectedOriginalSeatLabel(selectedSeat.label)`.
- Preserved pinned literals in the parents: `const resultsPanelOpen = canEdit && filtersActive && (!selectedSeat || inspectorCollapsed)` (SeatMap:2417), `const modeCardOpen = canEdit && Boolean(activeMode) && (!selectedSeat || inspectorCollapsed)` (SeatMap:2420), both INV-1 blocks `if (searchHandsPanelToResults(value, Boolean(selectedSeatId), inspectorDirty)) {\n setInspectorCollapsed(true);` (viewer variant passes `false`), `getElementById("seat-inspector-panel")?.focus()` on BOTH surfaces, `const canvasBannerSafeAreaClassName = ""`, the canvas-section `aria-labelledby="admin-planning-canvas-title"` className literal, and no token matching `mapKeyPanelOpen|desktopInspectorReserveMarginClassName|dock:` in SeatMap.
- `lib/mapLayoutTransform.ts` and `lib/seatMath.ts` are FROZEN — never edit them. `MAP_ZOOM_MIN/MAX/STEP` values unchanged.
- Test lockstep only in the same commit as the code it pins. `npm test` (all `tests/*.test.mjs`), `npm run test:ct` (jsdom components), `npm run typecheck`, `npm run lint` must be green at the end of every task.
- Never run `npm run test:e2e:auth` locally against `.env.local` (it builds pointing at production). Full gate at Task 6 uses `test:e2e` (backend-free) only.
- Commit messages: conventional commits, end body with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Pure nudge math + animation clock (`lib/`)

**Files:**
- Modify: `lib/mapViewport.ts` (append after `boundingBoxCenter`, ~line 233)
- Create: `lib/animateValue.ts`
- Test: `tests/map-viewport.test.mjs` (append), Create: `tests/animate-value.test.mjs`

**Interfaces:**
- Consumes: existing `ViewportMetrics`, `MapMetrics`, `clampScroll` from `lib/mapViewport.ts`.
- Produces (later tasks import these EXACT names):
  - `INSPECTOR_FLOAT_WIDTH_PX = 332`, `INSPECTOR_FLOAT_MARGIN_PX = 12`, `INSPECTOR_NUDGE_THRESHOLD_PX = 24`, `INSPECTOR_NUDGE_CLEARANCE_PX = 48`
  - `type InspectorNudgePlan = { scrollDelta: number; translateDelta: number }`
  - `planInspectorNudge(input: { seatVisualX: number; map: MapMetrics; viewport: ViewportMetrics; currentTranslatePx?: number }): InspectorNudgePlan | null`
  - `animateValue(opts: { from: number; to: number; durationMs?: number; reducedMotion?: boolean; onUpdate: (value: number) => void; onDone?: () => void; raf?: (cb: (t: number) => void) => number; now?: () => number }): () => void` from `lib/animateValue.ts`

- [ ] **Step 1: Write the failing tests for `planInspectorNudge`**

Append to `tests/map-viewport.test.mjs` (add `planInspectorNudge` to the existing single destructured `importTsModule("lib/mapViewport.ts")` at the top — only names the tests actually reference, lint flags unused destructures; follow the file's flat `test()` style and its `viewport()`/`map()` fixtures — viewport is 800×600 over 1600×1200 content, map offset 0/0 size 1600×1200):

```js
// --- planInspectorNudge (v12 slice 4, interaction contract #1) ---
// Panel left on an 800px viewport = 800 - 12 - 332 = 456.
// Threshold = 456 - 24 = 432; target x = 456 - 48 = 408.

test("planInspectorNudge returns null when the seat already clears the panel", () => {
  // seatVisualX 0.25 → 0.25*1600 - 0 scroll = 400px on screen (< 432).
  assert.equal(planInspectorNudge({ seatVisualX: 0.25, map: map(), viewport: viewport() }), null);
});

test("planInspectorNudge pans via scroll when scroll room covers the delta", () => {
  // seatVisualX 0.4 → 640px on screen. delta = 640 - 408 = 232.
  // Scroll room = 1600 - 800 - 0 = 800 ≥ 232 → all scroll, no translate.
  const plan = planInspectorNudge({ seatVisualX: 0.4, map: map(), viewport: viewport() });
  assert.deepEqual(plan, { scrollDelta: 232, translateDelta: 0 });
});

test("planInspectorNudge overflows into translate when scroll room runs out", () => {
  // Fit-view shape: content no wider than the viewport → zero scroll room.
  const fitViewport = viewport({ scrollWidth: 800, scrollHeight: 600 });
  const fitMap = map({ offsetWidth: 800, offsetHeight: 600 });
  // seatVisualX 0.75 → 600px on screen. delta = 600 - 408 = 192, all translate.
  const plan = planInspectorNudge({ seatVisualX: 0.75, map: fitMap, viewport: fitViewport });
  assert.deepEqual(plan, { scrollDelta: 0, translateDelta: 192 });
});

test("planInspectorNudge splits between remaining scroll room and translate", () => {
  // 100px of scroll room left: scrollLeft 700 of max 800.
  const nearEnd = viewport({ scrollLeft: 700 });
  // seatVisualX 0.75 → 1200 - 700 = 500px on screen. delta = 500 - 408 = 92 ≤ 100 room → all scroll.
  assert.deepEqual(planInspectorNudge({ seatVisualX: 0.75, map: map(), viewport: nearEnd }), { scrollDelta: 92, translateDelta: 0 });
  // seatVisualX 0.85 → 1360 - 700 = 660. delta = 252 → 100 scroll + 152 translate.
  assert.deepEqual(planInspectorNudge({ seatVisualX: 0.85, map: map(), viewport: nearEnd }), { scrollDelta: 100, translateDelta: 152 });
});

test("planInspectorNudge accounts for an existing frame translate", () => {
  // A frame already translated -100px puts the seat 100px further left on screen.
  const fitViewport = viewport({ scrollWidth: 800, scrollHeight: 600 });
  const fitMap = map({ offsetWidth: 800, offsetHeight: 600 });
  // seatVisualX 0.75 → 600 - 100 = 500 on screen. delta = 92, all translate again.
  const plan = planInspectorNudge({ seatVisualX: 0.75, map: fitMap, viewport: fitViewport, currentTranslatePx: 100 });
  assert.deepEqual(plan, { scrollDelta: 0, translateDelta: 92 });
});

test("planInspectorNudge respects map offsetLeft (letterboxed fit view)", () => {
  // Frame centered with 94px letterbox: offsetLeft 94, width 612 in an 800 viewport.
  const fitViewport = viewport({ scrollWidth: 800, scrollHeight: 600 });
  const boxedMap = map({ offsetLeft: 94, offsetWidth: 612, offsetHeight: 600 });
  // seatVisualX 0.9 → 94 + 550.8 = 644.8 on screen. delta = 236.8 → all translate.
  const plan = planInspectorNudge({ seatVisualX: 0.9, map: boxedMap, viewport: fitViewport });
  assert.equal(plan.scrollDelta, 0);
  assert.ok(Math.abs(plan.translateDelta - 236.8) < 0.001);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/map-viewport.test.mjs`
Expected: FAIL — `planInspectorNudge` is not exported.

- [ ] **Step 3: Implement `planInspectorNudge` in `lib/mapViewport.ts`**

Append (keep the module's no-DOM rule — metrics in, numbers out):

```ts
/**
 * v12 floating-inspector geometry (interaction contract #1). The panel is a
 * fixed 332px column inset 12px from the viewport's right edge; a selected
 * seat within 24px of its left edge gets panned out to a 48px clearance.
 */
export const INSPECTOR_FLOAT_WIDTH_PX = 332;
export const INSPECTOR_FLOAT_MARGIN_PX = 12;
export const INSPECTOR_NUDGE_THRESHOLD_PX = 24;
export const INSPECTOR_NUDGE_CLEARANCE_PX = 48;

export type InspectorNudgePlan = { scrollDelta: number; translateDelta: number };

/**
 * How far to pan the map left so the selected seat clears the floating
 * inspector, split into two channels: real scroll room first, and — because
 * the scroll engine cannot overscroll a fit-view frame — any remainder as a
 * leftward translate on the map frame. One tween drives both, so this returns
 * deltas, not absolute targets. `currentTranslatePx` is the frame's existing
 * leftward translate magnitude (≥ 0); the seat's on-screen x already reflects
 * it, so it is subtracted from the visual position, and a returned
 * translateDelta ADDS to it. Returns null when the seat already clears the
 * threshold — callers must not animate at all in that case.
 */
export function planInspectorNudge({
  seatVisualX,
  map,
  viewport,
  currentTranslatePx = 0
}: {
  seatVisualX: number;
  map: MapMetrics;
  viewport: ViewportMetrics;
  currentTranslatePx?: number;
}): InspectorNudgePlan | null {
  const seatScreenX = map.offsetLeft + seatVisualX * map.offsetWidth - viewport.scrollLeft - currentTranslatePx;
  const panelLeft = viewport.clientWidth - INSPECTOR_FLOAT_MARGIN_PX - INSPECTOR_FLOAT_WIDTH_PX;
  if (seatScreenX <= panelLeft - INSPECTOR_NUDGE_THRESHOLD_PX) return null;
  const delta = seatScreenX - (panelLeft - INSPECTOR_NUDGE_CLEARANCE_PX);
  const scrollRoom = Math.max(0, viewport.scrollWidth - viewport.clientWidth - viewport.scrollLeft);
  const scrollDelta = Math.min(delta, scrollRoom);
  return { scrollDelta, translateDelta: delta - scrollDelta };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test tests/map-viewport.test.mjs`
Expected: PASS (all pre-existing tests too).

- [ ] **Step 5: Write the failing tests for `animateValue`**

Create `tests/animate-value.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";

const { animateValue } = await importTsModule("lib/animateValue.ts");

// Deterministic clock: `now` advances only when we fire the queued rAF callback.
function makeClock() {
  let time = 0;
  const queue = [];
  return {
    now: () => time,
    raf: cb => { queue.push(cb); return queue.length; },
    tick(ms) {
      time += ms;
      const cb = queue.shift();
      if (cb) cb(time);
    },
    pending: () => queue.length
  };
}

test("animateValue eases from → to and calls onDone", () => {
  const clock = makeClock();
  const seen = [];
  let done = 0;
  animateValue({ from: 0, to: 100, durationMs: 100, onUpdate: v => seen.push(v), onDone: () => { done += 1; }, raf: clock.raf, now: clock.now });
  clock.tick(50);  // t=0.5 → ease-out cubic 1-(1-0.5)^3 = 0.875
  clock.tick(50);  // t=1 → 100, done
  clock.tick(50);  // nothing queued afterwards
  assert.equal(seen.length, 2);
  assert.ok(Math.abs(seen[0] - 87.5) < 0.001);
  assert.equal(seen[1], 100);
  assert.equal(done, 1);
  assert.equal(clock.pending(), 0);
});

test("animateValue with reducedMotion jumps straight to the target", () => {
  const clock = makeClock();
  const seen = [];
  let done = 0;
  animateValue({ from: 0, to: 100, durationMs: 100, reducedMotion: true, onUpdate: v => seen.push(v), onDone: () => { done += 1; }, raf: clock.raf, now: clock.now });
  assert.deepEqual(seen, [100]);
  assert.equal(done, 1);
  assert.equal(clock.pending(), 0);
});

test("cancel stops the tween mid-flight without onDone", () => {
  const clock = makeClock();
  const seen = [];
  let done = 0;
  const cancel = animateValue({ from: 0, to: 100, durationMs: 100, onUpdate: v => seen.push(v), onDone: () => { done += 1; }, raf: clock.raf, now: clock.now });
  clock.tick(25);
  cancel();
  clock.tick(25);
  clock.tick(25);
  assert.equal(seen.length, 1);
  assert.equal(done, 0);
});

test("zero-length distance still completes exactly once", () => {
  const clock = makeClock();
  const seen = [];
  let done = 0;
  animateValue({ from: 42, to: 42, durationMs: 100, onUpdate: v => seen.push(v), onDone: () => { done += 1; }, raf: clock.raf, now: clock.now });
  clock.tick(100);
  assert.deepEqual(seen, [42]);
  assert.equal(done, 1);
});
```

- [ ] **Step 6: Run to verify failure**

Run: `node --test tests/animate-value.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 7: Create `lib/animateValue.ts`**

```ts
// Single-value rAF tween for view-transform animation (the v12 inspector
// nudge). A JS tween rather than a CSS transition is a hard requirement from
// the handoff: the nudge animates scrollLeft alongside a frame translate, and
// a CSS transform transition fights direct drag-panning. The clock (raf/now)
// is injectable so node:test can drive it deterministically.

type AnimateValueOptions = {
  from: number;
  to: number;
  durationMs?: number;
  /** prefers-reduced-motion: skip the animation, land immediately. */
  reducedMotion?: boolean;
  onUpdate: (value: number) => void;
  onDone?: () => void;
  raf?: (callback: (time: number) => void) => number;
  now?: () => number;
};

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

/** Starts the tween; returns a cancel function (safe to call repeatedly). */
export function animateValue({
  from,
  to,
  durationMs = 250,
  reducedMotion = false,
  onUpdate,
  onDone,
  raf = callback => window.requestAnimationFrame(callback),
  now = () => performance.now()
}: AnimateValueOptions): () => void {
  if (reducedMotion || durationMs <= 0) {
    onUpdate(to);
    onDone?.();
    return () => undefined;
  }
  let cancelled = false;
  const start = now();
  const step = () => {
    if (cancelled) return;
    const t = Math.min(1, (now() - start) / durationMs);
    onUpdate(from + (to - from) * easeOutCubic(t));
    if (t >= 1) {
      onDone?.();
      return;
    }
    raf(step);
  };
  raf(step);
  return () => {
    cancelled = true;
  };
}
```

- [ ] **Step 8: Run to verify pass, then the whole plain tier + coverage floors**

Run: `node --test tests/animate-value.test.mjs && npm test && npm run coverage:check`
Expected: PASS everywhere (the new lib files are inside the `lib/**` coverage scope — the tests above cover every branch except the default `raf`/`now` initializers, which c8 counts as covered on import).

- [ ] **Step 9: Commit**

```bash
git add lib/mapViewport.ts lib/animateValue.ts tests/map-viewport.test.mjs tests/animate-value.test.mjs
git commit -m "feat(map): pure inspector-nudge planner + injectable rAF tween"
```

---

### Task 2: SeatInspector restructure (float + chips + action row + tabs + AI row + footer)

**Files:**
- Modify: `components/seat-map/SeatInspector.tsx` (whole-component restructure; preserve the editor/commit-bar/dialog machinery)
- Modify: `components/seat-map/SeatMap.tsx:3748-3782` (mount only: drop 3 props), `components/seat-map/ViewerSeatFinder.tsx:1423-1438` (mount only: drop 3 props)
- Test: `tests/seat-inspector.test.mjs`, `tests/focus-handoff-source.test.mjs`, `tests/accessibility-source.test.mjs`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces (Task 3 relies on these): `SeatInspectorProps` gains OPTIONAL `onMove?: () => void; onSwap?: () => void; onVacate?: () => void` (icon action row renders only when `canEdit` AND the handler exists — hide-not-disable) and LOSES `collapsed`'s rail behavior (when `collapsed` is true the component renders `null`, nothing else), plus these props are DELETED from the type and from both parents' mounts: `pillSuppressed`, `swapMode`, `onToggleCollapse`. `startAssignmentSignal` stays for now (Task 3 removes it end-to-end). Everything else on the props type is unchanged.

- [ ] **Step 1: Update the component tests first**

In `tests/seat-inspector.test.mjs`: delete the test `"the collapse button invokes onToggleCollapse"`; remove `onToggleCollapse() {}` from `renderInspector`'s base props; add these tests (same helpers — `renderInspector`, `assignedSeat`, `makeSeat`, `byLabelPrefix`, `clickLabel`, `act`, `fireEvent`):

```js
test("admin mode shows the icon action row for an occupied seat, gated on handlers", async () => {
  let moved = 0;
  renderInspector(assignedSeat(), { canEdit: true, onMove: () => { moved += 1; }, onSwap() {}, onVacate() {} });
  assert.ok(document.querySelector('[aria-label="Move Alice Example to another seat"]'));
  assert.ok(document.querySelector(`[aria-label="Swap ${assignedSeat().label}"]`));
  assert.ok(document.querySelector(`[aria-label="Vacate ${assignedSeat().label}"]`));
  await clickLabel("Move Alice Example to another seat");
  assert.equal(moved, 1);
});

test("an open seat's action row offers Swap only (Move and Vacate hide, not disable)", () => {
  const seat = makeSeat();
  renderInspector(seat, { canEdit: true, onMove() {}, onSwap() {}, onVacate() {} });
  assert.ok(document.querySelector(`[aria-label="Swap ${seat.label}"]`));
  assert.equal(byLabelPrefix("Move "), null);
  assert.equal(byLabelPrefix("Vacate "), null);
});

test("admin tabs switch panels and reset to Overview when the seat changes", async () => {
  const first = assignedSeat();
  const { rerender } = renderInspector(first, { canEdit: true });
  const tabs = () => Array.from(document.querySelectorAll('[role="tab"]')).map(el => el.textContent);
  assert.deepEqual(tabs(), ["Overview", "Notes", "Activity"]);
  const notesTab = Array.from(document.querySelectorAll('[role="tab"]')).find(el => el.textContent === "Notes");
  await act(async () => fireEvent.click(notesTab));
  assert.equal(notesTab.getAttribute("aria-selected"), "true");
  assert.ok(document.querySelector('textarea[name="seatNote"]'));
  // New seat → tab state resets to Overview.
  const second = makeSeat({ id: "seat-2", label: "S02" });
  await act(async () => rerender(React.createElement(SeatInspector, {
    seat: second, seats: [second], employees: [], departmentOptions: [],
    canEdit: true, collapsed: false, onClose() {}
  })));
  const overviewTab = Array.from(document.querySelectorAll('[role="tab"]')).find(el => el.textContent === "Overview");
  assert.equal(overviewTab.getAttribute("aria-selected"), "true");
});

test("viewer mode renders no tabs, no action row, no footer CTA", () => {
  renderInspector(assignedSeat());
  assert.equal(document.querySelector('[role="tablist"]'), null);
  assert.equal(byLabelPrefix("Move "), null);
  assert.equal(byLabelPrefix("Vacate "), null);
  assert.equal(byLabelPrefix("Edit assignment for"), null);
  assert.equal(byLabelPrefix("Assign an employee to"), null);
});

test("collapsed renders nothing at all (the rail and pill are retired)", () => {
  renderInspector(assignedSeat(), { canEdit: true, collapsed: true });
  assert.equal(document.getElementById("seat-inspector-panel"), null);
  assert.equal(document.body.textContent.includes("VIEW DETAILS"), false);
});
```

Note: if `renderElement` does not return a `rerender`, render the second seat via a fresh `renderElement` after `cleanup()` and assert the Overview tab is selected — the reset-on-mount claim is equivalent for a keyed component; check `tests/helpers/renderComponent.mjs` first and use whichever the harness supports.

- [ ] **Step 2: Update the source-pin tests in the same commit**

`tests/focus-handoff-source.test.mjs`: delete the whole test `"inspector collapse/expand hands focus across the transition — but only for explicit toggles"` (its `focusRailAfterCollapseRef` / `focusPanelAfterExpandRef` / `collapseRailRef` targets are retired). Keep the other three tests untouched.

`tests/accessibility-source.test.mjs`, inspector test (~lines 357-440):
- DELETE the pins for `` /aria-label=\{`View details for \$\{selectedSeat\.label\}`\}/ `` and `` /aria-label=\{`Back to map from \$\{selectedSeat\.label\} details`\}/ ``.
- ADD, with a comment naming the invariant (APG tabs pattern + retirement of the rail):

```js
// v12 slice 4: the inspector is tabbed (APG tabs pattern) and close-only —
// the collapse rail/pill is retired, so no "VIEW DETAILS" affordance may return.
assert.match(inspectorSource, /role="tablist"/);
assert.match(inspectorSource, /role="tab"[\s\S]{0,200}aria-selected/);
assert.match(inspectorSource, /role="tabpanel"/);
assert.match(inspectorSource, /ArrowRight|ArrowLeft/);
assert.doesNotMatch(inspectorSource, /VIEW DETAILS/);
assert.doesNotMatch(inspectorSource, /Collapse inspector/);
```

- KEEP the `/z-\[80\][\s\S]*panel:z-40/` pin satisfied: the new class string keeps the sheet-tier `z-[80]` classes before the `panel:z-40` classes.
- In the Carbon-for-AI token test (~lines 87-138), add SeatInspector to the bounded surfaces using the existing `AiCell` technique verbatim (read that block first and mirror it):

```js
const inspectorAiStart = inspectorSource.indexOf("function AskPlannerSeatRow(");
assert.notEqual(inspectorAiStart, -1, "SeatInspector must isolate AI styling in AskPlannerSeatRow()");
const inspectorAiEnd = inspectorSource.slice(inspectorAiStart).search(/\n(?:export |function |const |let |var |class |type |interface )/);
// count occurrences of AI_TOKEN in inspectorSource and assert they all fall
// inside [inspectorAiStart, inspectorAiStart + inspectorAiEnd) — same
// counting helper the AppRail block uses.
```

- [ ] **Step 3: Restructure the component**

In `components/seat-map/SeatInspector.tsx`, keeping ALL form/editor/validation/save/dialog machinery byte-compatible (state, `runSeatAssignment`, `handleSubmit`, combobox, move-conflict dialog, `showCommitBar`, `focusPrimaryActionSoon`), make these changes:

1. **Props type:** remove `pillSuppressed`, `swapMode`, `onToggleCollapse`; add `onMove?: () => void; onSwap?: () => void; onVacate?: () => void`. Remove the now-dead destructured params and defaults.
2. **Collapsed:** replace both collapsed render branches (`if (collapsed && (swapMode || pillSuppressed)) return null;` and the whole rail `return (...)`) with a single `if (collapsed) return null;`. Delete `CollapseIcon`, `collapseRailRef`, `focusRailAfterCollapseRef`, `focusPanelAfterExpandRef`, `prevCollapsedRef`, and the collapse/expand focus-handoff effect.
3. **Aside geometry:** new className (sheet tier first, then `panel:` float — keep `z-[80]` textually before `panel:z-40`):

```tsx
className="fixed inset-x-3 bottom-3 z-[80] flex max-h-[60vh] flex-col overflow-hidden border border-white/[0.14] bg-[var(--admin-chrome-bg)] text-[var(--admin-chrome-text)] shadow-elevation-4 panel:inset-x-auto panel:bottom-3 panel:right-3 panel:top-[calc(var(--admin-chrome-h)+0.75rem)] panel:z-40 panel:max-h-none panel:w-[332px] panel:max-w-[calc(100vw-1.5rem)]"
```

(`id="seat-inspector-panel"`, `tabIndex={-1}`, both aria attributes stay.)
4. **Header:** keep avatar/name/role; the button cluster shrinks to the single ✕ (`aria-label="Close inspector"`, shared `CloseIcon`).
5. **Chip row:** keep the status pill and mono seat-code chip; ADD a zone pill after them: `<span className="min-w-0 truncate rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-[#E7E1D8] ring-1 ring-white/15">{currentZone}</span>`. Viewer's "Published seat" chip stays.
6. **Icon action row**, directly under the chip row, admin only:

```tsx
{canEdit && (onMove || onSwap || onVacate) && (
  <div role="group" aria-label={`Actions for seat ${selectedSeat.label}`} className="flex gap-px px-4 pb-3.5">
    {hasCurrentAssignment && onMove && (
      <button type="button" onClick={onMove} disabled={pending}
        aria-label={selectedSeat.employee?.full_name ? `Move ${selectedSeat.employee.full_name} to another seat` : `Move ${selectedSeat.label}`}
        className="flex flex-1 flex-col items-center gap-1 bg-[var(--admin-chrome-raised)] py-2 text-[11px] font-semibold text-[#F4F4F4] transition hover:bg-[var(--admin-chrome-raised-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-primary)] disabled:opacity-40">
        <MoveGlyph />Move
      </button>
    )}
    {onSwap && (
      <button type="button" onClick={onSwap} disabled={pending} aria-label={`Swap ${selectedSeat.label}`} className="flex flex-1 flex-col items-center gap-1 bg-[var(--admin-chrome-raised)] py-2 text-[11px] font-semibold text-[#F4F4F4] transition hover:bg-[var(--admin-chrome-raised-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-primary)] disabled:opacity-40">
        <SwapGlyph />Swap
      </button>
    )}
    {hasCurrentAssignment && onVacate && (
      <button type="button" onClick={onVacate} disabled={pending} aria-label={`Vacate ${selectedSeat.label}`}
        className="flex flex-1 flex-col items-center gap-1 bg-[#2b1a1b] py-2 text-[11px] font-semibold text-[var(--admin-chrome-danger-text)] transition hover:bg-[rgb(var(--admin-status-bad-rgb)/0.25)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-primary)] disabled:opacity-40">
        <VacateGlyph />Vacate
      </button>
    )}
  </div>
)}
```

Add the three ~15px inline SVG glyph components (1.5 stroke, `aria-hidden`, paths from the prototype lines 218-220: Move = 4-way arrows, Swap = ⇄, Vacate = person + minus).
7. **Tabs** (admin, only when `!editingAssignment`): local state `const [activeTab, setActiveTab] = useState<"overview" | "notes" | "activity">("overview")`; reset to `"overview"` inside the existing seat-change effect (the `isNewSeat` branch) and in `resetInspectorDraftForm`. Markup:

```tsx
<div role="tablist" aria-label="Seat details sections" className="mx-4 flex bg-[var(--admin-chrome-raised)]">
  {(["overview", "notes", "activity"] as const).map(tab => (
    <button key={tab} id={`seat-inspector-tab-${tab}`} type="button" role="tab"
      aria-selected={activeTab === tab} aria-controls={`seat-inspector-tabpanel-${tab}`}
      tabIndex={activeTab === tab ? 0 : -1}
      onClick={() => setActiveTab(tab)}
      onKeyDown={handleTabKeyDown}
      className={["flex-1 border-t-2 py-2 text-center text-[12px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-primary)]",
        activeTab === tab ? "border-t-[var(--admin-primary)] bg-[var(--admin-chrome-bg)] text-white" : "border-t-transparent text-[var(--admin-chrome-muted)] hover:text-white"].join(" ")}>
      {tab === "overview" ? "Overview" : tab === "notes" ? "Notes" : "Activity"}
    </button>
  ))}
</div>
```

`handleTabKeyDown`: ArrowRight/ArrowLeft cycle through the three tabs (wrap), `event.preventDefault()`, set the new tab AND `.focus()` its button (`document.getElementById(`seat-inspector-tab-${next}`)?.focus()`); Home/End jump to first/last. Each tab body renders inside `<div id={`seat-inspector-tabpanel-${tab}`} role="tabpanel" aria-labelledby={`seat-inspector-tab-${tab}`}>`, mounted only while active (form values live in `form` state, so unmounting panels loses nothing). All three tabpanels render inside the existing `key={`seat-inspector-sections-${selectedSeat.id}`}` wrapper (keep that literal).
   - **Overview panel:** Contact facts (`ContactFacts` + `buildContactRows`, occupied only), Seat facts (`FactRow` Zone / Seat type), then the existing "Seat actions" group verbatim (keep `id="seat-actions-heading"`, the open-seat Status select, the Delete seat block with its gate + help text). Replace the `<details>`-based `InspectorSection` usage with flat sections using the prototype eyebrow style (`text-[10px] font-bold tracking-[0.12em] text-[#8E8276]` headings "CONTACT" / "SEAT"); delete the now-unused `InspectorSection`, `SectionHeading`, `ChevronDownIcon` if unreferenced (the combobox keeps its own chevron — check before deleting).
   - **Notes panel:** the existing notes `<textarea name="seatNote">` label block, unchanged.
   - **Activity panel:** the existing `activityEntries` list + empty-state copy, unchanged.
8. **`focusInspectorField`:** the notes ref now lives in an unmounted panel when another tab is active. Before focusing, route: `if (field === "notes") setActiveTab("notes");` and perform the focus inside `window.requestAnimationFrame` so the panel mounts first. Remove the `closest("details")` reveal (no `<details>` remain in the form body — the editor sections are always-open).
9. **Editing state:** while `editingAssignment` is true, the action row, tablist, and tabpanels do NOT render; the editor section (`assignmentSectionRef` block with combobox + fields) renders in the scroll area exactly as today. The `startAssignmentSignal` effect stays untouched this task.
10. **AI entry row + footer** (admin only, after the scroll area, before the commit bar):
    - Extract the Ask Planner row into a component IN THIS FILE named exactly `AskPlannerSeatRow` (the a11y test binds AI tokens to it): props `{ seat, onExplainSeat }`, rendering the existing button (keep `` aria-label={`Ask Planner about ${seat.label}`} ``) restyled: row `mx-4 mb-3 flex w-auto items-center justify-between gap-3 bg-[var(--admin-chrome-raised)] px-3 py-2.5 text-[12px] font-semibold text-[#F4F4F4] …hover/focus as today…`, with a leading chip `<span className="border border-[var(--admin-ai-chrome-border)] px-1 text-[9.5px] font-bold tracking-[0.04em] text-[var(--admin-ai-chrome-text)]">AI</span>` then the label, trailing `<ChevronRightIcon />`.
    - Footer, rendered when `canEdit && !showCommitBar`:

```tsx
<div className="border-t border-white/10">
  <button type="button" onClick={startAssignmentEditing} disabled={pending} ref={primaryActionRef}
    aria-expanded={editingAssignment} aria-controls="seat-inspector-form"
    aria-label={hasCurrentAssignment ? `Edit assignment for ${selectedSeat.label}` : `Assign an employee to ${selectedSeat.label}`}
    className="h-12 w-full bg-[var(--admin-primary-cta)] text-[14px] font-semibold text-white transition hover:bg-[var(--admin-primary-cta-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white disabled:opacity-40">
    {hasCurrentAssignment ? "Edit assignment" : "Assign employee"}
  </button>
</div>
```

    Delete the two in-scroll-area CTA `Button`s this replaces (the `Assign employee` / `Edit assignment` blocks at the top of the form body). `primaryActionRef` moves onto the footer button — `focusPrimaryActionSoon()` keeps working. Remove the `rounded-[10px]` overrides everywhere in the file (flat 0 radius; chips/avatars keep `rounded-full`).
11. **Viewer branch (`canEdit` false):** header + chip row + a single scroll area with the Overview facts (Contact + Seat incl. the status tag row) — no tablist, no action row, no AI row, no footer. Delete the `InspectorSection` wrappers there too (same eyebrow style).
12. **Comment hygiene:** rewrite the "Seat actions" comment that claims the verbs "live on the canvas SeatActionBar" (they live in the icon row now; the bar dies in the next task — word it as "the icon action row above").
13. **Parents (compile-only edit):** in `SeatMap.tsx:3748-3782` and `ViewerSeatFinder.tsx:1423-1438` delete the `pillSuppressed=…`, `swapMode=…`, and `onToggleCollapse=…` lines from the two mounts. Do not touch anything else in the parents this task — `inspectorPillSuppressed` may become unused in SeatMap; if lint flags it, delete just that variable (SeatMap:2426-2427); the `inspectorDockTier`/reserve rework belongs to Task 3.

- [ ] **Step 4: Run the tiers this task touches**

Run: `npm run typecheck && npm run lint && npm run test:ct && npm test`
Expected: PASS. (`accessibility-source`, `focus-handoff-source`, `status-label-source`, `close-icon-source`, `draft-concurrency`, `seat-creation-ui-source` all green — the preserved-literals list in Global Constraints is exactly what they check.)

- [ ] **Step 5: Commit**

```bash
git add components/seat-map/SeatInspector.tsx components/seat-map/SeatMap.tsx components/seat-map/ViewerSeatFinder.tsx tests/seat-inspector.test.mjs tests/focus-handoff-source.test.mjs tests/accessibility-source.test.mjs
git commit -m "feat(inspector): floating tabbed panel — chips, icon verbs, tabs, AI row, 48px CTA footer"
```

---

### Task 3: SeatMap integration — retire SeatActionBar, wire verbs, drop the inspector reserve, auto-return

**Files:**
- Delete: `components/seat-map/SeatActionBar.tsx`
- Modify: `components/seat-map/SeatMap.tsx`, `components/seat-map/SeatInspector.tsx` (signal removal only)
- Test: `tests/accessibility-source.test.mjs`, `tests/seat-map-components.test.mjs`, `tests/browser/seat-map.spec.ts`

**Interfaces:**
- Consumes: Task 2's optional `onMove`/`onSwap`/`onVacate` props on `SeatInspector`.
- Produces: SeatMap no longer has `assignmentRequestSignal`; `SeatInspectorProps.startAssignmentSignal` is deleted end-to-end (type + destructure + ref + effect in `SeatInspector.tsx`, state + prop in `SeatMap.tsx`).

- [ ] **Step 1: Update the source pins + component tests first**

`tests/accessibility-source.test.mjs` (~158-183, viewer-isolation test): replace the `assert.match(seatMapSource, /\{canEdit && floor === "3" && \([\s\S]*<SeatActionBar/);` pin (and its comment) with pins that carry the same invariant forward — the reseat verbs are admin-gated at their new site and the viewer mount never wires them:

```js
// The reseat verbs live in the inspector's icon action row now (v12 slice 4).
// The row itself is canEdit-gated in SeatInspector; here we pin that only the
// ADMIN mount wires the verb handlers, so a viewer inspector can never grow
// Move/Swap/Vacate even if the internal gate regressed.
assert.match(seatMapSource, /<SeatInspector[\s\S]{0,2400}onVacate=\{requestVacateFromBar\}/);
assert.doesNotMatch(viewerFinderSource, /onMove=|onSwap=|onVacate=/);
assert.match(inspectorSource, /\{canEdit && \(onMove \|\| onSwap \|\| onVacate\) && \(/);
```

`tests/seat-map-components.test.mjs`: remove the `SeatActionBar` import/load lines and the whole `// --- SeatActionBar ---` block (one test).

`tests/browser/seat-map.spec.ts`: in the admin test, change `[aria-label^="Assign an employee to"]` from `.first()` to the bare locator (the name is unique now — update the comment that explained the duplicate); the `[aria-label^="Swap "]` assertion stays (it now resolves via the inspector's icon row). In the viewer test, keep `[data-seat-action-bar]` `toHaveCount(0)` but reword its comment: the attribute is gone from the codebase entirely; the assertion now guards against reintroduction.

- [ ] **Step 2: Excise the bar and rewire SeatMap**

In `components/seat-map/SeatMap.tsx`:

1. Delete the import (`:81`) and the mount block (`:3405-3418`, including its "positioned against the map stage" comment).
2. Pass the verbs to the inspector mount instead: add `onMove={() => startMoveEmployeeMode()}`, `onSwap={() => startSwapSeatMode()}`, `onVacate={requestVacateFromBar}` to the `<SeatInspector` props. (`requestVacateFromBar` keeps its name and behavior — it only opens the confirm; the a11y pin above expects this exact name. `confirmVacateFromBar`, the `vacateConfirm` dialog, `barSeatActions` all stay.)
3. Delete `requestAssignFromBar` (`:1352-1356`) and the `assignmentRequestSignal` state (`:385-388`) and prop line. In `SeatInspector.tsx`, delete the `startAssignmentSignal` prop (type + destructure + default), `startAssignmentSignalRef`, and its effect — the footer CTA calls `startAssignmentEditing` directly, no external signal remains.
4. Focus handoff (`:452-472`): delete the `seatActionBarFirstActionRef` branch and the ref declaration (`:477`); the effect body becomes the `document.getElementById("seat-inspector-panel")?.focus()` call (pinned — keep it).
5. Reserve (`:2421-2442`): delete `inspectorPillSuppressed` (if it survived Task 2) and `inspectorDockTier`; simplify to:

```tsx
// v12 slice 4: the inspector FLOATS (contract #1) — only the docking
// occupants reserve stage width now (results panel / mode card, contract #2).
const rightSlotTier: "expanded" | "none" = resultsPanelOpen || modeCardOpen ? "expanded" : "none";
const stageReservedClassName = rightSlotTier === "expanded" ? "panel:pr-[332px]" : "";
```

(`resultsPanelOpen` `:2417` and `modeCardOpen` `:2420` keep their pinned expressions verbatim. Check remaining `inspectorDockTier` references first — `bottomSheetOwnsBottom` `:2465` and the legend gate `:3372` use other flags and stay.)
6. Auto-return effect — add near the other inspector effects (~`:588`):

```tsx
// The collapse rail is retired (v12 slice 4): `inspectorCollapsed` is now
// purely the auto-yield flag. Whenever nothing owns the right region anymore
// and a seat is still selected, the inspector returns on its own — there is
// no rail left for the user to click.
useEffect(() => {
  if (!inspectorCollapsed || !selectedSeatId) return;
  if (resultsPanelOpen || modeCardOpen || askPlannerOpen || swapSourceSeatId || moveEmployeeSourceSeatId) return;
  setInspectorCollapsed(false);
}, [inspectorCollapsed, selectedSeatId, resultsPanelOpen, modeCardOpen, askPlannerOpen, swapSourceSeatId, moveEmployeeSourceSeatId]);
```

(`resultsPanelOpen`/`modeCardOpen` are derived consts declared AFTER the effects in the function body today; if so, compute the effect's guards from the same source flags inline — `(canEdit && filtersActive && …)` — or move the effect below the consts; match what typecheck/lint accept while keeping the pinned const declarations exactly where their pins expect them.)
7. Sweep: `git grep -n "SeatActionBar\|seatActionBarFirstActionRef\|assignmentRequestSignal\|requestAssignFromBar" -- ':!docs'` must return zero component hits. Delete `components/seat-map/SeatActionBar.tsx`.

- [ ] **Step 3: Run the tiers**

Run: `npm run typecheck && npm run lint && npm test && npm run test:ct`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A components/seat-map tests/accessibility-source.test.mjs tests/seat-map-components.test.mjs tests/browser/seat-map.spec.ts
git commit -m "feat(map): retire SeatActionBar — verbs move into the floating inspector"
```

---

### Task 4: Nudge hook + admin wiring (scroll + translate hybrid, one tween)

**Files:**
- Create: `components/seat-map/useInspectorNudge.ts`
- Modify: `components/seat-map/SeatMap.tsx`
- Test: covered by Task 1's pure tests + existing suites; the hook is DOM/ref glue by design — its arithmetic lives in `lib/` (already tested), so it needs no jsdom suite.

**Interfaces:**
- Consumes: `planInspectorNudge` (Task 1, from `@/lib/mapViewport`), `animateValue` (Task 1, from `@/lib/animateValue`), `savedPointToVisualPoint` (existing, per surface), `SEAT_CENTER_PANEL_BREAKPOINT_PX` (existing SeatMap module const, value 900 — the hook takes it as a parameter so the viewer can pass the same tier).
- Produces (Task 5 consumes this EXACT signature): `useInspectorNudge(options: { viewportRef: RefObject<HTMLDivElement | null>; frameRef: RefObject<HTMLDivElement | null>; selectedSeatId: string | null; inspectorHidden: boolean; panelBreakpointPx: number; resolveSeatVisualX: (seatId: string) => number | null }): { cancelNudge: () => void }` — the hook owns the trigger effect, the restore effect, and `frameRef.current.style.translate` exclusively; parents call `cancelNudge` from their pan/zoom/wheel/programmatic-scroll paths.

- [ ] **Step 1: Create the shared hook**

Create `components/seat-map/useInspectorNudge.ts`:

```tsx
"use client";

import { useCallback, useEffect, useRef } from "react";
import type { RefObject } from "react";
import { planInspectorNudge } from "@/lib/mapViewport";
import { animateValue } from "@/lib/animateValue";

/**
 * v12 slice 4 nudge (interaction contract #1), shared by both map surfaces.
 * One rAF tween drives BOTH channels — scrollLeft while there is scroll room,
 * then a leftward frame translate for the remainder (fit view has no scroll
 * room; the frame translate is the scroll-engine equivalent of the
 * prototype's free-pan overscroll). The translate is a view transform on the
 * frame element only: seat coordinates, marker styles, and the calibration
 * transform are untouched. This hook is the translate's sole owner — nothing
 * else may write `frameRef.current.style.translate`.
 */
export function useInspectorNudge({
  viewportRef,
  frameRef,
  selectedSeatId,
  inspectorHidden,
  panelBreakpointPx,
  resolveSeatVisualX
}: {
  viewportRef: RefObject<HTMLDivElement | null>;
  frameRef: RefObject<HTMLDivElement | null>;
  selectedSeatId: string | null;
  /** True while the inspector is not on screen (auto-yielded). */
  inspectorHidden: boolean;
  /** The `panel` tier minimum width — the float exists only there. */
  panelBreakpointPx: number;
  /** Selected seat's normalized VISUAL x (calibrated), or null if unknown. */
  resolveSeatVisualX: (seatId: string) => number | null;
}): { cancelNudge: () => void } {
  const nudgeCancelRef = useRef<(() => void) | null>(null);
  const frameTranslateRef = useRef(0);
  // Resolver identity churns with parent renders; the effects below re-run on
  // selection change only, reading the latest resolver through this ref.
  const resolveRef = useRef(resolveSeatVisualX);
  resolveRef.current = resolveSeatVisualX;

  const cancelNudge = useCallback(() => {
    nudgeCancelRef.current?.();
    nudgeCancelRef.current = null;
  }, []);

  const setFrameTranslate = useCallback((px: number) => {
    frameTranslateRef.current = px;
    const frame = frameRef.current;
    if (frame) frame.style.translate = px > 0 ? `${-px}px 0px` : "";
  }, [frameRef]);

  // Trigger: on selection at the panel tier, double-rAF so layout settles
  // (same discipline as the surfaces' queued centering helpers).
  useEffect(() => {
    if (!selectedSeatId || inspectorHidden) return;
    if (!window.matchMedia(`(min-width: ${panelBreakpointPx}px)`).matches) return;
    const first = requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const viewport = viewportRef.current;
        const frame = frameRef.current;
        if (!viewport || !frame) return;
        const seatVisualX = resolveRef.current(selectedSeatId);
        if (seatVisualX === null) return;
        const plan = planInspectorNudge({
          seatVisualX,
          map: frame,
          viewport,
          currentTranslatePx: frameTranslateRef.current
        });
        if (!plan) return;
        cancelNudge();
        const startScroll = viewport.scrollLeft;
        const startTranslate = frameTranslateRef.current;
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        nudgeCancelRef.current = animateValue({
          from: 0,
          to: 1,
          durationMs: 250,
          reducedMotion,
          onUpdate: t => {
            viewport.scrollLeft = startScroll + plan.scrollDelta * t;
            if (plan.translateDelta !== 0) setFrameTranslate(startTranslate + plan.translateDelta * t);
          },
          onDone: () => {
            nudgeCancelRef.current = null;
          }
        });
      });
    });
    return () => cancelAnimationFrame(first);
  }, [selectedSeatId, inspectorHidden, panelBreakpointPx, viewportRef, frameRef, cancelNudge, setFrameTranslate]);

  // Restore: the frame translate unwinds when nothing is selected anymore (or
  // the inspector auto-yielded) — the map returns to its true scroll position.
  useEffect(() => {
    const shouldRest = !selectedSeatId || inspectorHidden;
    if (!shouldRest || frameTranslateRef.current === 0) return;
    cancelNudge();
    const startTranslate = frameTranslateRef.current;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    nudgeCancelRef.current = animateValue({
      from: startTranslate,
      to: 0,
      durationMs: 200,
      reducedMotion,
      onUpdate: setFrameTranslate,
      onDone: () => {
        nudgeCancelRef.current = null;
      }
    });
  }, [selectedSeatId, inspectorHidden, cancelNudge, setFrameTranslate]);

  return { cancelNudge };
}
```

- [ ] **Step 2: Wire it into SeatMap**

1. **Mount** (near the other viewport callbacks, after `mapViewportRef`/`mapRef`/`selectedSeatId`/`inspectorCollapsed` all exist):

```tsx
const { cancelNudge } = useInspectorNudge({
  viewportRef: mapViewportRef,
  frameRef: mapRef,
  selectedSeatId,
  inspectorHidden: inspectorCollapsed,
  panelBreakpointPx: SEAT_CENTER_PANEL_BREAKPOINT_PX,
  resolveSeatVisualX: seatId => {
    const seat = localSeats.find(item => item.id === seatId);
    if (!seat) return null;
    return savedPointToVisualPoint({ x: seat.x, y: seat.y }, seat).x;
  }
});
```

2. **Cancel on user interaction:** call `cancelNudge()` at the top of the viewport's pan `pointerdown` handler, the zoom in/out/fit handlers, and `scrollMapToPoint` (a programmatic center supersedes a nudge). Find each via `git grep -n "onPointerDown\|zoomIn\|zoomOut\|fitMapToView\|scrollMapToPoint" components/seat-map/SeatMap.tsx` and add the single call at the top of each handler body. Native wheel scrolling also fights an in-flight tween (both write `scrollLeft`): add `onWheel={cancelNudge}` to the viewport element (the handler only cancels, never preventDefaults, so passive semantics are fine).
3. Add the import: `import { useInspectorNudge } from "@/components/seat-map/useInspectorNudge";`.

- [ ] **Step 3: Verify the frozen-guardrail suites specifically**

Run: `npm run typecheck && npm run lint && npm test`
Expected: PASS — pay attention to `desktop-seat-marker-system-source` and `map-calibration` (the translate is frame-level inline style; if either trips, the approach crossed a guardrail — STOP and report BLOCKED rather than loosening the test).

- [ ] **Step 4: Commit**

```bash
git add components/seat-map/SeatMap.tsx
git commit -m "feat(map): admin inspector nudge — hybrid scroll+translate tween on selection"
```

---

### Task 5: Viewer — reserve drop, auto-return, nudge

**Files:**
- Modify: `components/seat-map/ViewerSeatFinder.tsx`
- Test: `tests/accessibility-source.test.mjs` only if a pin trips (viewer INV-1 and directory pins must stay untouched — see below).

**Interfaces:**
- Consumes: same Task 1 exports as Task 4.
- Produces: nothing new.

- [ ] **Step 1: Reserve + auto-return**

In `ViewerSeatFinder.tsx`:

1. `inspectorDockTier` / `rightSlotTier` / `stageReservedClassName` (`:793-810`): remove the inspector's `"expanded"`/`"rail"` contributions; the DIRECTORY tiers stay exactly (`directoryOpen`-style flag → expanded reserve, `directoryRail`-style flag → rail reserve — the directory still docks; do not touch its hydration/preference machinery). Read the actual flag names at `:804-805` first; the invariant is: the inspector contributes nothing, the directory and results panel keep exactly their current reserves.
2. Auto-return effect (the viewer has no modes/drawer — only the results panel holds):

```tsx
// Collapse rail retired (v12 slice 4): auto-yield returns on its own.
useEffect(() => {
  if (!inspectorCollapsed || !selectedSeatId) return;
  if (resultsPanelOpen) return;
  setInspectorCollapsed(false);
}, [inspectorCollapsed, selectedSeatId, resultsPanelOpen]);
```

- [ ] **Step 2: Nudge (consume Task 4's shared hook)**

Mount `useInspectorNudge` (from `@/components/seat-map/useInspectorNudge` — signature in Task 4's Interfaces block) against the viewer's own `mapViewportRef`/`mapRef`/`selectedSeatId`, `inspectorHidden: inspectorCollapsed`, `panelBreakpointPx: 900` (the viewer uses the same `panel` tier — if it already has its own breakpoint constant for the sheet/panel split, pass that instead), and a `resolveSeatVisualX` that resolves the seat from the viewer's published seats and applies the same visual-point call the viewer's `centerSeatInMap` (`:522`) makes. Call the returned `cancelNudge()` at the top of the viewer's pan `pointerdown` handler, its zoom handlers, and its `scrollMapToPoint` (`:511-520`), and add `onWheel={cancelNudge}` to the viewer's viewport element. The viewer's inspector is read-only but floats identically — contract #1 applies to both surfaces.

- [ ] **Step 3: Run the tiers**

Run: `npm run typecheck && npm run lint && npm test && npm run test:ct`
Expected: PASS — `viewer-directory-source` and the INV-1/`--admin-ai-` viewer pins must be untouched-green.

- [ ] **Step 4: Commit**

```bash
git add components/seat-map/ViewerSeatFinder.tsx
git commit -m "feat(viewer): floating inspector — reserve drop, auto-return, nudge"
```

---

### Task 6: Docs, breadcrumb resolution, full gate

**Files:**
- Modify: `docs/DESIGN_DIRECTION.md:36`, `docs/handoff-v12-shell.md`, `components/seat-map/SeatInspector.tsx` (only if any stale comment survives)
- Test: full gate.

- [ ] **Step 1: Resolve the deferred-ruling breadcrumbs**

1. `docs/DESIGN_DIRECTION.md:36`: replace the parenthetical "(SeatActionBar's Assign retains accent + ink for now — owner call deferred to the slice-4 action-bar redesign.)" with "(Resolved in v12 slice 4: the SeatActionBar is retired; assignment CTAs live on the inspector's 48px footer in the CTA ladder — `#D23F0A` + white.)"
2. `docs/handoff-v12-shell.md`: update the SeatActionBar mentions (grep — lines have drifted from `:17`, `:35-36`, `:64`, `:165`) to past tense / retired status, and append a short "v12 slice 4 shipped" note following the file's existing slice-note format: floating tabbed inspector both surfaces, bar + collapse rail retired, nudge = scroll+translate hybrid tween, reserve now results-panel/mode-card (admin) and directory (viewer) only.
3. Sweep: `git grep -n "SeatActionBar" -- ':!docs/superpowers'` — remaining hits must be historical docs only (the 2026-07-30 spec/plan stay as history; do not edit them).

- [ ] **Step 2: Full gate**

Run: `npm run lint && npm run typecheck && npm test && npm run test:ct && npm run build && npm run test:e2e`
Expected: all green. (`test:browser` needs `PW_CHROMIUM_PATH` locally — run it if available; CI runs it in the e2e job regardless.)

- [ ] **Step 3: Commit**

```bash
git add docs/DESIGN_DIRECTION.md docs/handoff-v12-shell.md
git commit -m "docs: slice 4 shipped notes — action-bar retirement + Assign-accent ruling resolved"
```
