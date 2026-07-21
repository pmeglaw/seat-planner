import { normalizePoint, type NormalizedPoint } from "@/lib/seatMath";
import type { SeatWithEmployee } from "@/lib/types";

export const MAP_IMAGE_WIDTH = 3822;
export const MAP_IMAGE_HEIGHT = 1734;
export const MAP_ASPECT_RATIO = MAP_IMAGE_WIDTH / MAP_IMAGE_HEIGHT;
// 2x asset (issue #121, owner-approved AI upscale 2026-07-14): the shipped
// webp is a Real-ESRGAN x4plus upscale of the repo's original cool-palette png
// (public/images/office-floor-plan.png, 1911x867 — still the canonical master),
// supersampled 4x then downscaled to exactly 2x. Full-frame scale only: same
// framing, so normalized coordinates and calibration are untouched. The map's
// DISPLAY caps stay 1911px (SeatMap/ViewerSeatFinder max-w / --map-detail-base),
// which is what makes 200% zoom hit these pixels 1:1 instead of stretching.
export const MAP_IMAGE_SRC = "/images/office-floor-plan.webp?v=map-v2-cool-2x-3822x1734";
// 24px-wide preview of the same render, shown while the full image streams in.
// Regenerate whenever the shipped asset's pixels change (output/make2x.mjs pattern).
export const MAP_IMAGE_BLUR_DATA_URL =
  "data:image/webp;base64,UklGRk4CAABXRUJQVlA4WAoAAAAgAAAAFwAACgAASUNDUMgBAAAAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADZWUDggYAAAALADAJ0BKhgACwA+7WKpTamlo6IwCAEwHYlnAABcY4HwTuoh5SxQAP7rHGwqKqLTIktldm+PPeJbBhu2dhji2KNaLmeFPma9BfaSGpyjjazhmvSiMNxTusJpnL3q6LkAAA==";

type SeatCalibrationSource = Pick<SeatWithEmployee, "x" | "y"> &
  Partial<Pick<SeatWithEmployee, "label" | "zone" | "department">>;

type Bounds = {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
};

type LinearTransform = {
  xScale: number;
  xOffset: number;
  yScale: number;
  yOffset: number;
};

type CalibrationArea = {
  id: string;
  zones: string[];
  labelPrefixes: string[];
  savedBounds: Bounds;
  visualBounds: Bounds;
  transform: LinearTransform;
};

const DEFAULT_PREVIEW_TRANSFORM: LinearTransform = {
  xScale: 0.92,
  xOffset: 0.05,
  yScale: 1.04,
  yOffset: 0.016
};

// Per-area saved→visual calibration, fit so each seat's visual point lands on the
// CHAIR CENTRE in the render. 2026-07-20 chair re-fit (fix/floor-plan-chair-
// calibration): north / west / center-west (both sub-areas) / center-desks were
// placing pills ~10–17px ABOVE their chairs (verified against the real floor plan,
// then least-squares re-fit to detected chair centres). east / northeast / southeast
// were already chair-aligned and are left untouched.
const CALIBRATION_AREAS: CalibrationArea[] = [
  {
    id: "north-pod",
    zones: ["north pod"],
    labelPrefixes: ["N"],
    savedBounds: { xMin: 0.25, xMax: 0.5, yMin: 0.03, yMax: 0.26 },
    visualBounds: { xMin: 0.3, xMax: 0.51, yMin: 0.05, yMax: 0.25 },
    transform: { xScale: 0.821622, xOffset: 0.099048, yScale: 1.003477, yOffset: 0.023857 }
  },
  {
    // The render's NE desk quads aren't linearly spaced against the saved grid,
    // so each quad gets its own fit (chair-center measured, residual ≤ 2px).
    id: "northeast-pod-left",
    zones: ["northeast pod"],
    labelPrefixes: ["NE"],
    savedBounds: { xMin: 0.72, xMax: 0.849, yMin: 0.03, yMax: 0.2 },
    visualBounds: { xMin: 0.68, xMax: 0.81, yMin: 0.04, yMax: 0.22 },
    transform: { xScale: 0.944658, xOffset: 0.002919, yScale: 1.044793, yOffset: 0.010215 }
  },
  {
    id: "northeast-pod-right",
    zones: ["northeast pod"],
    labelPrefixes: ["NE"],
    savedBounds: { xMin: 0.849, xMax: 0.97, yMin: 0.03, yMax: 0.2 },
    visualBounds: { xMin: 0.8, xMax: 0.94, yMin: 0.04, yMax: 0.22 },
    transform: { xScale: 1.146341, xOffset: -0.175684, yScale: 1.020304, yOffset: 0.012247 }
  },
  {
    id: "west-pod",
    zones: ["west pod"],
    labelPrefixes: ["W"],
    savedBounds: { xMin: 0.04, xMax: 0.23, yMin: 0.34, yMax: 0.78 },
    visualBounds: { xMin: 0.11, xMax: 0.26, yMin: 0.38, yMax: 0.82 },
    transform: { xScale: 0.880795, xOffset: 0.076535, yScale: 1.052002, yOffset: 0.020189 }
  },
  {
    id: "center-west-upper",
    zones: ["center west"],
    labelPrefixes: ["CW"],
    savedBounds: { xMin: 0.27, xMax: 0.37, yMin: 0.33, yMax: 0.5 },
    visualBounds: { xMin: 0.31, xMax: 0.4, yMin: 0.35, yMax: 0.54 },
    transform: { xScale: 0.836374, xOffset: 0.089418, yScale: 1.089163, yOffset: -0.008517 }
  },
  {
    id: "center-west-lower",
    zones: ["center west"],
    labelPrefixes: ["CW"],
    savedBounds: { xMin: 0.28, xMax: 0.36, yMin: 0.5, yMax: 0.76 },
    visualBounds: { xMin: 0.32, xMax: 0.39, yMin: 0.55, yMax: 0.81 },
    transform: { xScale: 0.828036, xOffset: 0.086902, yScale: 1.180036, yOffset: -0.060352 }
  },
  {
    id: "center-desks",
    zones: ["center desks"],
    labelPrefixes: ["C"],
    savedBounds: { xMin: 0.39, xMax: 0.62, yMin: 0.49, yMax: 0.73 },
    visualBounds: { xMin: 0.42, xMax: 0.61, yMin: 0.55, yMax: 0.78 },
    transform: { xScale: 0.872516, xOffset: 0.072945, yScale: 1.091846, yOffset: 0.009857 }
  },
  {
    id: "east-pod",
    zones: ["east pod"],
    labelPrefixes: ["E"],
    savedBounds: { xMin: 0.55, xMax: 0.8, yMin: 0.34, yMax: 0.5 },
    visualBounds: { xMin: 0.56, xMax: 0.77, yMin: 0.38, yMax: 0.52 },
    transform: { xScale: 0.867223, xOffset: 0.075999, yScale: 1.108807, yOffset: -0.010603 }
  },
  {
    id: "southeast-office-upper",
    zones: ["southeast office"],
    labelPrefixes: ["SE"],
    savedBounds: { xMin: 0.86, xMax: 0.95, yMin: 0.52, yMax: 0.59 },
    visualBounds: { xMin: 0.81, xMax: 0.89, yMin: 0.56, yMax: 0.64 },
    transform: { xScale: 0.84886, xOffset: 0.080006, yScale: 1.04, yOffset: 0.021498 }
  },
  {
    id: "southeast-office-lower",
    zones: ["southeast office"],
    labelPrefixes: ["SE"],
    savedBounds: { xMin: 0.88, xMax: 0.96, yMin: 0.59, yMax: 0.66 },
    visualBounds: { xMin: 0.83, xMax: 0.9, yMin: 0.64, yMax: 0.73 },
    transform: { xScale: 0.835824, xOffset: 0.094817, yScale: 1.243613, yOffset: -0.093395 }
  }
];

function normalizeText(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function getZoneName(source?: Partial<Pick<SeatWithEmployee, "zone" | "department">>) {
  return normalizeText(source?.zone ?? source?.department);
}

function getLabelPrefix(source?: { label?: string | null }) {
  return source?.label?.trim().toUpperCase().match(/^[A-Z]+/)?.[0] ?? "";
}

function pointInsideBounds(point: NormalizedPoint, bounds: Bounds, pad = 0) {
  return (
    point.x >= bounds.xMin - pad &&
    point.x <= bounds.xMax + pad &&
    point.y >= bounds.yMin - pad &&
    point.y <= bounds.yMax + pad
  );
}

function areaMatchesSource(area: CalibrationArea, source?: SeatCalibrationSource) {
  if (!source) return false;

  const zone = getZoneName(source);
  const labelPrefix = getLabelPrefix(source);
  const zoneMatches = zone ? area.zones.includes(zone) : false;
  const labelMatches = labelPrefix ? area.labelPrefixes.includes(labelPrefix) : false;

  return (zoneMatches || labelMatches) && pointInsideBounds(source, area.savedBounds, 0.015);
}

function squaredDistanceToBounds(point: NormalizedPoint, bounds: Bounds) {
  const dx = point.x < bounds.xMin ? bounds.xMin - point.x : point.x > bounds.xMax ? point.x - bounds.xMax : 0;
  const dy = point.y < bounds.yMin ? bounds.yMin - point.y : point.y > bounds.yMax ? point.y - bounds.yMax : 0;
  return dx * dx + dy * dy;
}

function areaAffinity(area: CalibrationArea, source?: SeatCalibrationSource | { zone?: string | null; label?: string | null }) {
  const zone = getZoneName(source);
  const labelPrefix = getLabelPrefix(source);
  if (zone && area.zones.includes(zone)) return 2;
  if (labelPrefix && area.labelPrefixes.includes(labelPrefix)) return 1;
  return 0;
}

function getSavedCalibrationArea(source?: SeatCalibrationSource) {
  if (!source) return null;

  const exactArea = CALIBRATION_AREAS.find(area => areaMatchesSource(area, source));
  if (exactArea) return exactArea;

  const point = source ? normalizePoint({ x: source.x, y: source.y }) : { x: 0.5, y: 0.5 };
  return [...CALIBRATION_AREAS].sort((left, right) => {
    const affinityDelta = areaAffinity(right, source) - areaAffinity(left, source);
    if (affinityDelta !== 0) return affinityDelta;
    return squaredDistanceToBounds(point, left.savedBounds) - squaredDistanceToBounds(point, right.savedBounds);
  })[0] ?? null;
}

function getVisualCalibrationArea(
  point: NormalizedPoint,
  context?: { zone?: string | null; label?: string | null; source?: SeatCalibrationSource }
) {
  if (context?.source) return getSavedCalibrationArea(context.source);
  if (!context?.zone && !context?.label) return null;

  const matchingAreas = CALIBRATION_AREAS.filter(area => {
    const affinity = areaAffinity(area, context);
    return affinity > 0 && pointInsideBounds(point, area.visualBounds, 0.015);
  });

  if (matchingAreas.length > 0) {
    return matchingAreas.sort((left, right) => {
      return squaredDistanceToBounds(point, left.visualBounds) - squaredDistanceToBounds(point, right.visualBounds);
    })[0];
  }

  return [...CALIBRATION_AREAS].sort((left, right) => {
    const affinityDelta = areaAffinity(right, context) - areaAffinity(left, context);
    if (affinityDelta !== 0) return affinityDelta;
    return squaredDistanceToBounds(point, left.visualBounds) - squaredDistanceToBounds(point, right.visualBounds);
  })[0] ?? null;
}

function applyTransform(point: NormalizedPoint, transform: LinearTransform) {
  return normalizePoint({
    x: point.x * transform.xScale + transform.xOffset,
    y: point.y * transform.yScale + transform.yOffset
  });
}

function applyInverseTransform(point: NormalizedPoint, transform: LinearTransform) {
  return normalizePoint({
    x: (point.x - transform.xOffset) / transform.xScale,
    y: (point.y - transform.yOffset) / transform.yScale
  });
}

export function savedPointToVisualPoint(point: NormalizedPoint, source?: SeatCalibrationSource) {
  const area = getSavedCalibrationArea(source);
  return applyTransform(point, area?.transform ?? DEFAULT_PREVIEW_TRANSFORM);
}

export function visualPointToSavedPoint(
  point: NormalizedPoint,
  context?: { zone?: string | null; label?: string | null; source?: SeatCalibrationSource }
) {
  const area = getVisualCalibrationArea(point, context);
  return applyInverseTransform(point, area?.transform ?? DEFAULT_PREVIEW_TRANSFORM);
}

export function seatToVisualSeat<T extends SeatCalibrationSource>(seat: T): T {
  const visualPoint = savedPointToVisualPoint({ x: seat.x, y: seat.y }, seat);
  return {
    ...seat,
    x: visualPoint.x,
    y: visualPoint.y
  };
}

export function seatsToVisualSeats<T extends SeatCalibrationSource>(seats: T[]): T[] {
  return seats.map(seatToVisualSeat);
}
