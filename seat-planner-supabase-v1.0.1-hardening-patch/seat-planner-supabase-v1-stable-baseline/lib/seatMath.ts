import type { CSSProperties } from "react";

export type NormalizedPoint = {
  x: number;
  y: number;
};

export function clamp(value: number, min = 0, max = 1): number {
  if (Number.isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export function normalizePoint(point: NormalizedPoint): NormalizedPoint {
  return {
    x: roundCoordinate(clamp(point.x)),
    y: roundCoordinate(clamp(point.y))
  };
}

export function roundCoordinate(value: number): number {
  return Number(clamp(value).toFixed(6));
}

export function coordinateToPercent(value: number): string {
  return `${roundCoordinate(value) * 100}%`;
}

export function pointToStyle(point: NormalizedPoint): CSSProperties {
  return {
    left: coordinateToPercent(point.x),
    top: coordinateToPercent(point.y)
  };
}

export function clientPointToNormalized(
  clientX: number,
  clientY: number,
  bounds: DOMRect
): NormalizedPoint {
  return normalizePoint({
    x: (clientX - bounds.left) / bounds.width,
    y: (clientY - bounds.top) / bounds.height
  });
}

export function hasMoved(
  start: { clientX: number; clientY: number },
  current: { clientX: number; clientY: number },
  thresholdPx = 3
): boolean {
  return (
    Math.abs(current.clientX - start.clientX) +
      Math.abs(current.clientY - start.clientY) >
    thresholdPx
  );
}
