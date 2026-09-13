import type { SeatWithEmployee } from "@/lib/types";

export type ChipRect = { left: number; top: number; width: number; height: number };
export type ChipOffset = { x: number; y: number };

// Owner-approved, floor-specific presentation correction (2026-09-13).
// These chair anchors stay intact; only their full-name chips may move toward
// the desktop. Other seats retain the existing presentation and nudge policy.
export function usesDeskwardChip(seat: Pick<SeatWithEmployee, "floor" | "label" | "zone">): boolean {
  if (seat.floor !== "3") return false;
  const zone = seat.zone?.trim().toLowerCase();
  return (zone === "west pod" && (seat.label === "W02" || seat.label === "W05")) ||
    (zone === "northeast pod" && (seat.label === "NE02" || seat.label === "NE03" || seat.label === "NE07"));
}

// All inputs are measured screen pixels. Search rightward on the chair row
// first; if that gap cannot hold the full name, try one chip-height above or
// below it. Never shrink text, move another marker, or chase an unbounded gap.
export function placeDeskwardChip(
  anchor: ChipOffset,
  chip: Pick<ChipRect, "width" | "height">,
  canvas: ChipRect,
  obstacles: readonly ChipRect[],
  direction: 1 | -1 = 1
): ChipOffset | null {
  // NE02 faces the opposite desktop. Reflect the geometry so the same
  // bounded search clears NE03 by moving left, without changing its anchor.
  if (direction === -1) {
    const reflected = placeDeskwardChip(
      { x: -anchor.x, y: anchor.y }, chip,
      { left: -canvas.left - canvas.width, top: canvas.top, width: canvas.width, height: canvas.height },
      obstacles.map(rect => ({ left: -rect.left - rect.width, top: rect.top, width: rect.width, height: rect.height }))
    );
    return reflected ? { x: -reflected.x, y: reflected.y } : null;
  }
  if (![anchor.x, anchor.y, chip.width, chip.height, canvas.left, canvas.top, canvas.width, canvas.height].every(Number.isFinite) ||
    chip.width <= 0 || chip.height <= 0 || canvas.width <= 0 || canvas.height <= 0) return null;
  const gap = 2;
  const halfWidth = chip.width / 2;
  const halfHeight = chip.height / 2;
  const maxX = Math.min(anchor.x + canvas.width * 0.04, canvas.left + canvas.width - halfWidth);
  const sorted = obstacles.filter(rect =>
    [rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) && rect.width > 0 && rect.height > 0
  ).sort((a, b) => a.left - b.left);

  // One extra pixel absorbs fractional layout rounding between the percentage
  // anchor and a neighbour's DOMRect (otherwise a nominal 2px gap can test as
  // 1.996px and incorrectly reject the entire row after a resize).
  for (const dy of [0, -chip.height - gap - 1, chip.height + gap + 1]) {
    const y = anchor.y + dy;
    if (y - halfHeight < canvas.top || y + halfHeight > canvas.top + canvas.height) continue;
    let x = Math.max(anchor.x + (dy === 0 ? 0 : canvas.width * 0.01), canvas.left + halfWidth);
    for (const rect of sorted) {
      if (y + halfHeight + gap <= rect.top || y - halfHeight - gap >= rect.top + rect.height) continue;
      if (x + halfWidth + gap <= rect.left || x - halfWidth - gap >= rect.left + rect.width) continue;
      x = rect.left + rect.width + gap + halfWidth;
    }
    if (x <= maxX) return { x: x - anchor.x, y: dy };
  }
  return null;
}
