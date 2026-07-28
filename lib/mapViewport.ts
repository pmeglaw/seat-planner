// Pure viewport geometry for the seat map: zoom clamping, scroll targets, pan
// offsets, and the centroid the "fit these seats" path aims at.
//
// This is view-transform math only. It never reads or writes a seat coordinate,
// never touches the calibration transform in lib/mapLayoutTransform.ts, and has
// no notion of draft vs published — callers hand it numbers that came from the
// DOM and it hands back numbers to scroll to. Zooming and panning are
// presentation-only by design (spec §9); nothing here can move a seat.
//
// Why it takes metric objects rather than elements: keeping the DOM out means
// every branch is reachable from a plain unit test, which is the whole reason
// this logic left SeatMap.tsx — it had no coverage there and it is exactly the
// kind of arithmetic where an off-by-one hides for months. The caller performs
// the actual scrollTo; these functions only decide where.

/** The subset of a scroll container's metrics this module needs. */
export type ViewportMetrics = {
  scrollLeft: number;
  scrollTop: number;
  clientWidth: number;
  clientHeight: number;
  scrollWidth: number;
  scrollHeight: number;
};

/** The subset of the rendered map frame's metrics this module needs. */
export type MapMetrics = {
  offsetLeft: number;
  offsetTop: number;
  offsetWidth: number;
  offsetHeight: number;
};

export type ScrollTarget = { left: number; top: number };
export type NormalizedPoint = { x: number; y: number };

export const MAP_ZOOM_MIN = 0.6;
export const MAP_ZOOM_MAX = 2;

/** Pan is only treated as a drag once the pointer clears this many pixels. */
export const PAN_DRAG_THRESHOLD_PX = 4;

/**
 * Vertical room the fit view holds back for seat markers that overhang the plan.
 *
 * Markers do not scale with the map: SeatMarker's resting pill is min-h-[34px]
 * and centres on its coordinate via -translate-y-1/2, so the bottom row always
 * hangs ~17px below the plan's edge, plus 2px for the occupied dot. Fit view
 * sizes the sheet to the plan's own aspect ratio, so without a reserve the sheet
 * is exactly as tall as the plan and that overhang has nowhere to go — it spills
 * out of an overflow-auto container whose scrollbar is hidden at lg, clipping
 * content with nothing on screen admitting it is clipped. On a 1920 window the
 * overhang is 1.5% of a 711px plan and hides inside rounding slack; at 1024 it
 * is 3.6% of a 305px plan and two seats lose their bottom edge (measured
 * 2026-07-28: scrollHeight 316 against clientHeight 307).
 *
 * 24px splits to 12px above and below once the plan is centred — clear of the
 * 19px worst case for a resting pill. It is deliberately NOT sized for the 46px
 * selected pill: covering that would cost ~12% of the plan's width to reserve
 * room only one transient marker ever uses.
 */
export const MAP_MARKER_EDGE_GUTTER_PX = 24;

export type FitMapWidthInput = {
  /** Usable width of the scroll container, borders already deducted. */
  availableWidth: number;
  /** Usable height of the scroll container, borders already deducted. */
  availableHeight: number;
  /** The plan's own width/height ratio. */
  planRatio: number;
  /** Upper bound so the plan is never upscaled past its shipped pixels. */
  naturalWidth?: number;
  markerGutterPx?: number;
};

/**
 * Width to render the map frame at so the whole plan — and the markers hanging
 * off its edges — fit inside the container.
 *
 * The gutter is charged against HEIGHT, never width, because height is the only
 * dimension where it can cost anything: a column with height to spare gives up
 * nothing at all. That also keeps the reserve away from the plan whenever the
 * layout is width-bound, which is the common case on wide monitors.
 *
 * Callers pass the ratio rather than this module importing the map constants —
 * lib/mapLayoutTransform.ts owns those, and this module stays clear of it.
 */
export function fitMapWidth({
  availableWidth,
  availableHeight,
  planRatio,
  naturalWidth = Number.POSITIVE_INFINITY,
  markerGutterPx = MAP_MARKER_EDGE_GUTTER_PX
}: FitMapWidthInput): number {
  // Mid-resize a container can report less height than the gutter itself;
  // clamping here keeps the map renderable instead of blanking it.
  const usableHeight = Math.max(1, availableHeight - markerGutterPx);
  return Math.max(1, Math.floor(Math.min(naturalWidth, availableWidth, usableHeight * planRatio)));
}

/**
 * Keep a scroll offset inside [0, max].
 *
 * `max` is routinely negative — a viewport larger than its content has
 * `scrollWidth - clientWidth < 0` — so the lower clamp has to win. Returning a
 * negative offset makes the browser silently snap to 0, which reads as "the
 * centering code is off" rather than "the map is smaller than the frame".
 */
export function clampScroll(value: number, max: number): number {
  return Math.max(0, Math.min(value, Math.max(0, max)));
}

function horizontalMax(viewport: ViewportMetrics) {
  return viewport.scrollWidth - viewport.clientWidth;
}

function verticalMax(viewport: ViewportMetrics) {
  return viewport.scrollHeight - viewport.clientHeight;
}

/**
 * Scroll target that puts a normalized map point under a chosen vertical anchor.
 *
 * `verticalAnchor` is a fraction of viewport height: 0.5 centers the point,
 * while a smaller value lifts it toward the top — which is how a seat stays
 * visible above the inspector when it renders as a bottom sheet on narrow
 * screens. Horizontal is always centered; nothing overlays the map sideways.
 */
export function scrollTargetForPoint(
  point: NormalizedPoint,
  map: MapMetrics,
  viewport: ViewportMetrics,
  verticalAnchor = 0.5
): ScrollTarget {
  return {
    left: clampScroll(point.x * map.offsetWidth - viewport.clientWidth / 2, horizontalMax(viewport)),
    top: clampScroll(point.y * map.offsetHeight - viewport.clientHeight * verticalAnchor, verticalMax(viewport))
  };
}

/** Scroll target that centers the scrollable area in its viewport. */
export function centerScrollTarget(viewport: ViewportMetrics): ScrollTarget {
  return {
    left: clampScroll(horizontalMax(viewport) / 2, horizontalMax(viewport)),
    top: clampScroll(verticalMax(viewport) / 2, verticalMax(viewport))
  };
}

/**
 * Clamp a requested zoom into range, rounded to whole percentage points.
 *
 * The rounding matters: repeated fractional steps accumulate float drift, and a
 * zoom of 1.0000000000000002 is not equal to 1, so "am I at default zoom?"
 * checks start failing for no visible reason.
 */
export function clampZoom(nextZoom: number): number {
  if (!Number.isFinite(nextZoom)) return 1;
  return Math.min(MAP_ZOOM_MAX, Math.max(MAP_ZOOM_MIN, Math.round(nextZoom * 100) / 100));
}

/**
 * The normalized map point currently at the viewport's center.
 *
 * Captured before a zoom so the same point can be restored afterwards —
 * otherwise zooming walks the map away from whatever the user was looking at.
 * Returns null when the map has no layout yet (pre-paint, or display:none), so
 * the caller can skip the restore rather than anchor to a bogus 0,0.
 */
export function zoomAnchorFromViewport(viewport: ViewportMetrics, map: MapMetrics): NormalizedPoint | null {
  if (map.offsetWidth <= 0 || map.offsetHeight <= 0) return null;
  return {
    x: Math.min(1, Math.max(0, (viewport.scrollLeft + viewport.clientWidth / 2 - map.offsetLeft) / map.offsetWidth)),
    y: Math.min(1, Math.max(0, (viewport.scrollTop + viewport.clientHeight / 2 - map.offsetTop) / map.offsetHeight))
  };
}

/**
 * Scroll target that restores a previously captured zoom anchor to the center.
 *
 * Unlike scrollTargetForPoint this accounts for the map's offset within the
 * viewport, because after a zoom the frame may no longer start at the origin.
 */
export function scrollTargetForZoomAnchor(
  anchor: NormalizedPoint,
  map: MapMetrics,
  viewport: ViewportMetrics
): ScrollTarget {
  return {
    left: clampScroll(map.offsetLeft + anchor.x * map.offsetWidth - viewport.clientWidth / 2, horizontalMax(viewport)),
    top: clampScroll(map.offsetTop + anchor.y * map.offsetHeight - viewport.clientHeight / 2, verticalMax(viewport))
  };
}

/**
 * Scroll offsets for a pan in progress.
 *
 * Deliberately unclamped: this is assigned to scrollLeft/scrollTop directly,
 * and the browser clamps on assignment. Clamping here as well would make a pan
 * that runs past the edge feel like it sticks before the content ends.
 */
export function panScrollTarget(
  start: { scrollLeft: number; scrollTop: number },
  deltaX: number,
  deltaY: number
): ScrollTarget {
  return { left: start.scrollLeft - deltaX, top: start.scrollTop - deltaY };
}

/**
 * Whether a pointer has moved far enough to count as a pan rather than a click.
 *
 * Below the threshold the gesture falls through to click-to-deselect, so this
 * is what stops a slightly shaky press from silently eating the click.
 */
export function hasPassedPanThreshold(deltaX: number, deltaY: number): boolean {
  return Math.abs(deltaX) + Math.abs(deltaY) > PAN_DRAG_THRESHOLD_PX;
}

/**
 * Center of the bounding box around a set of normalized points.
 *
 * The bounding-box center, NOT the mean: the mean drifts toward whichever
 * cluster holds more seats, which would push a lone outlying seat off screen
 * when "fit these seats" is meant to bring all of them into view.
 */
export function boundingBoxCenter(points: readonly NormalizedPoint[]): NormalizedPoint | null {
  if (points.length === 0) return null;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }

  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}
