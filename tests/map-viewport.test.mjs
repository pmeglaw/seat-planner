import assert from "node:assert/strict";
import test from "node:test";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";

const {
  clampScroll,
  scrollTargetForPoint,
  centerScrollTarget,
  clampZoom,
  zoomAnchorFromViewport,
  scrollTargetForZoomAnchor,
  panScrollTarget,
  hasPassedPanThreshold,
  boundingBoxCenter,
  fitMapWidth,
  planInspectorNudge,
  MAP_ZOOM_MIN,
  MAP_ZOOM_MAX,
  MAP_ZOOM_STEP,
  MAP_MARKER_EDGE_GUTTER_PX
} = await importTsModule("lib/mapViewport.ts");

// A viewport showing 800x600 of a 1600x1200 scrollable area, scrolled to origin.
function viewport(overrides = {}) {
  return {
    scrollLeft: 0,
    scrollTop: 0,
    clientWidth: 800,
    clientHeight: 600,
    scrollWidth: 1600,
    scrollHeight: 1200,
    ...overrides
  };
}

function map(overrides = {}) {
  return { offsetLeft: 0, offsetTop: 0, offsetWidth: 1600, offsetHeight: 1200, ...overrides };
}

test("clampScroll keeps offsets inside the scrollable range", () => {
  assert.equal(clampScroll(120, 800), 120);
  assert.equal(clampScroll(-50, 800), 0);
  assert.equal(clampScroll(9000, 800), 800);
});

test("clampScroll returns 0 when the viewport is larger than its content", () => {
  // scrollWidth - clientWidth goes negative here. Without the lower clamp this
  // returns a negative offset, which the browser snaps to 0 — the symptom reads
  // as broken centering rather than as a map smaller than its frame.
  assert.equal(clampScroll(40, -200), 0);
  assert.equal(clampScroll(-40, -200), 0);
});

test("scrollTargetForPoint centers a normalized point by default", () => {
  // Point at the middle of a 1600x1200 map: 800 - 800/2 = 400 across,
  // 600 - 600/2 = 300 down.
  assert.deepEqual(scrollTargetForPoint({ x: 0.5, y: 0.5 }, map(), viewport()), { left: 400, top: 300 });
});

test("scrollTargetForPoint lifts the point when given a smaller vertical anchor", () => {
  // The bottom-sheet case: a 0.28 anchor should land the seat higher up the
  // viewport than centering would, leaving room for the sheet below it.
  const centered = scrollTargetForPoint({ x: 0.5, y: 0.5 }, map(), viewport());
  const lifted = scrollTargetForPoint({ x: 0.5, y: 0.5 }, map(), viewport(), 0.28);

  assert.equal(lifted.left, centered.left, "horizontal is unaffected by the vertical anchor");
  assert.ok(lifted.top > centered.top, "a smaller anchor scrolls further down, lifting the seat up the screen");
  assert.equal(lifted.top, 600 - 600 * 0.28);
});

test("scrollTargetForPoint clamps at the edges instead of overscrolling", () => {
  assert.deepEqual(scrollTargetForPoint({ x: 0, y: 0 }, map(), viewport()), { left: 0, top: 0 });
  assert.deepEqual(scrollTargetForPoint({ x: 1, y: 1 }, map(), viewport()), { left: 800, top: 600 });
});

test("centerScrollTarget centers the scrollable area", () => {
  assert.deepEqual(centerScrollTarget(viewport()), { left: 400, top: 300 });
});

test("centerScrollTarget stays at the origin when nothing overflows", () => {
  assert.deepEqual(
    centerScrollTarget(viewport({ scrollWidth: 800, scrollHeight: 600 })),
    { left: 0, top: 0 }
  );
});

test("clampZoom holds the configured range", () => {
  assert.equal(clampZoom(1.25), 1.25);
  assert.equal(clampZoom(0.1), MAP_ZOOM_MIN);
  assert.equal(clampZoom(99), MAP_ZOOM_MAX);
  assert.equal(MAP_ZOOM_MIN, 0.5);
  assert.equal(MAP_ZOOM_MAX, 2.5);
});

test("zoom step matches v12 contract #15", () => {
  assert.equal(MAP_ZOOM_STEP, 0.25);
});
test("clampZoom holds the v12 bounds", () => {
  assert.equal(clampZoom(0.4), 0.5);
  assert.equal(clampZoom(3), 2.5);
  assert.equal(clampZoom(1.25), 1.25);
});

test("clampZoom rounds to whole percentage points so repeated steps cannot drift", () => {
  assert.equal(clampZoom(1.0000000000000002), 1);
  assert.equal(clampZoom(1.234), 1.23);
  // A value that would otherwise accumulate float error across many steps.
  assert.equal(clampZoom(0.1 + 0.2 + 0.7), 1);
});

test("clampZoom falls back to 1 for non-finite input", () => {
  assert.equal(clampZoom(Number.NaN), 1);
  assert.equal(clampZoom(Number.POSITIVE_INFINITY), 1);
});

test("zoomAnchorFromViewport reports the normalized point under the viewport center", () => {
  const anchor = zoomAnchorFromViewport(viewport({ scrollLeft: 400, scrollTop: 300 }), map());
  assert.deepEqual(anchor, { x: 0.5, y: 0.5 });
});

test("zoomAnchorFromViewport clamps to the map instead of reporting off-map anchors", () => {
  const anchor = zoomAnchorFromViewport(viewport({ scrollLeft: 99999, scrollTop: 99999 }), map());
  assert.deepEqual(anchor, { x: 1, y: 1 });
});

test("zoomAnchorFromViewport returns null before the map has layout", () => {
  // Pre-paint or display:none. Returning 0,0 here would silently anchor the
  // restore to the top-left corner of the map after every such zoom.
  assert.equal(zoomAnchorFromViewport(viewport(), map({ offsetWidth: 0 })), null);
  assert.equal(zoomAnchorFromViewport(viewport(), map({ offsetHeight: 0 })), null);
});

test("scrollTargetForZoomAnchor restores a captured anchor to the center", () => {
  assert.deepEqual(scrollTargetForZoomAnchor({ x: 0.5, y: 0.5 }, map(), viewport()), { left: 400, top: 300 });
});

test("scrollTargetForZoomAnchor accounts for a map offset inside the viewport", () => {
  // After a zoom the frame can sit inset; ignoring offsetLeft/Top drifts the
  // restore by exactly that inset.
  const offset = scrollTargetForZoomAnchor({ x: 0.5, y: 0.5 }, map({ offsetLeft: 60, offsetTop: 40 }), viewport());
  assert.deepEqual(offset, { left: 460, top: 340 });
});

test("panScrollTarget moves the content opposite the pointer", () => {
  // Dragging right (+deltaX) must scroll left, or the map moves the wrong way.
  assert.deepEqual(panScrollTarget({ scrollLeft: 500, scrollTop: 400 }, 30, -20), { left: 470, top: 420 });
});

test("panScrollTarget is deliberately unclamped", () => {
  // Assigned straight to scrollLeft/scrollTop, which the browser clamps itself.
  // Clamping twice makes a pan past the edge feel like it sticks early.
  assert.deepEqual(panScrollTarget({ scrollLeft: 0, scrollTop: 0 }, 100, 100), { left: -100, top: -100 });
});

test("hasPassedPanThreshold distinguishes a shaky press from a drag", () => {
  assert.equal(hasPassedPanThreshold(0, 0), false);
  assert.equal(hasPassedPanThreshold(2, 2), false, "exactly at the threshold is still a click");
  assert.equal(hasPassedPanThreshold(3, 2), true);
  assert.equal(hasPassedPanThreshold(-5, 0), true, "direction does not matter");
});

test("boundingBoxCenter centers the box, not the crowd", () => {
  // Three seats clustered left and one far right: the mean would sit near the
  // cluster and push the outlier off screen. The box center keeps all four in.
  const points = [
    { x: 0.1, y: 0.2 },
    { x: 0.12, y: 0.22 },
    { x: 0.14, y: 0.18 },
    { x: 0.9, y: 0.8 }
  ];
  const center = boundingBoxCenter(points);

  // Midpoint of [0.1, 0.9] and [0.18, 0.8].
  assert.deepEqual(center, { x: 0.5, y: 0.49 });

  // The mean sits ~0.19 further left, near the three-seat cluster — far enough
  // that the lone right-hand seat would fall outside a viewport centered there.
  const meanX = points.reduce((total, point) => total + point.x, 0) / points.length;
  assert.ok(center.x - meanX > 0.15, "the box center must not collapse toward the denser cluster");
});

test("boundingBoxCenter handles a single point and an empty list", () => {
  assert.deepEqual(boundingBoxCenter([{ x: 0.3, y: 0.7 }]), { x: 0.3, y: 0.7 });
  assert.equal(boundingBoxCenter([]), null);
});

// Fit view sizes the plan to its own aspect ratio, so the sheet ends up exactly
// as tall as the plan. Seat markers do not scale with it: SeatMarker's pill is
// the constant 28px footprint centred on its coordinate, so the bottom row
// hangs a fixed 14px below the plan (the pre-Phase-3 pill hung ~19px). At a 1920 window that overhang is 1.5% of a 711px-tall plan and lands
// inside the sheet's rounding slack; at 1024 it is 3.6% of a 305px plan and
// spills out of an overflow-auto container whose scrollbar is hidden at lg —
// content clipped with nothing on screen saying it is clipped. Measured
// 2026-07-28: scrollHeight 316 vs clientHeight 307, with "S01 Alex M." and
// "S02 Edith T." losing their bottom edge and part of the title line.
//
// The reserve comes out of the column HEIGHT, which fit view leaves unused
// (431px spare at 1024x800), never out of the plan's width.
const PLAN_RATIO = 3822 / 1734;

test("fitMapWidth lets width win when the column is the binding dimension", () => {
  // Tall, narrow column: height could carry a far wider plan, so the gutter is
  // free and the plan keeps every available pixel of width.
  assert.equal(fitMapWidth({ availableWidth: 600, availableHeight: 4000, planRatio: PLAN_RATIO }), 600);
});

test("fitMapWidth reserves the marker gutter before height becomes width", () => {
  // The measured 1024x800 case. Without a reserve this returns 676 — a plan
  // exactly as tall as the sheet, which is precisely what clips the bottom row.
  const width = fitMapWidth({ availableWidth: 678, availableHeight: 307, planRatio: PLAN_RATIO });

  assert.ok(width < Math.floor(307 * PLAN_RATIO), "the gutter has to cost width when height binds");
  assert.equal(width, Math.floor((307 - MAP_MARKER_EDGE_GUTTER_PX) * PLAN_RATIO));
});

test("fitMapWidth clears the marker overhang at every measured window size", () => {
  // Half a 34px resting pill plus its 2px dot is 19px of overhang; fit view
  // centres the plan, so the gutter splits evenly and only half must clear.
  for (const [availableWidth, availableHeight] of [[678, 307], [1082, 495], [1562, 713]]) {
    const width = fitMapWidth({ availableWidth, availableHeight, planRatio: PLAN_RATIO });
    const slackBelowPlan = (availableHeight - width / PLAN_RATIO) / 2;
    assert.ok(slackBelowPlan >= 9, `${availableWidth}x${availableHeight}: only ${slackBelowPlan.toFixed(1)}px below the plan`);
  }
});

test("fitMapWidth never upscales the plan past its natural width", () => {
  assert.equal(fitMapWidth({ availableWidth: 99_999, availableHeight: 99_999, planRatio: PLAN_RATIO, naturalWidth: 1911 }), 1911);
});

test("fitMapWidth still yields a renderable width when the column collapses", () => {
  // Mid-resize a container can report less height than the gutter itself.
  const width = fitMapWidth({ availableWidth: 500, availableHeight: 4, planRatio: PLAN_RATIO });

  assert.ok(width >= 1, "a zero or negative width would blank the map");
  assert.ok(Number.isInteger(width), "a subpixel frame width shifts every marker off the plan");
});

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
