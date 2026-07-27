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
  MAP_ZOOM_MIN,
  MAP_ZOOM_MAX
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
  assert.equal(MAP_ZOOM_MIN, 0.6);
  assert.equal(MAP_ZOOM_MAX, 2);
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
