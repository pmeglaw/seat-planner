"use client";

import { useEffect, useRef, useState } from "react";
import { placeDeskwardChip, type ChipOffset } from "@/lib/seatChipPlacement";

// Measure the actual rendered type, including loaded fonts and browser zoom.
// Only opted-in markers install observers. The parent is the shared
// marker layer in both ViewerSeatFinder and SeatMap.
export function useDeskwardChip(enabled: boolean, x: number, y: number, mapWidth: number, direction: 1 | -1 = 1, minimumShiftPx = 0) {
  const ref = useRef<HTMLSpanElement>(null);
  const [offset, setOffset] = useState<ChipOffset | null>(null);

  useEffect(() => {
    const wrapper = ref.current;
    const layer = wrapper?.parentElement;
    const button = wrapper?.querySelector<HTMLButtonElement>("button[data-seat-id]");
    if (!enabled || !wrapper || !layer || !button) return;
    let frame = 0;
    let disposed = false;
    const measure = () => {
      frame = 0;
      const canvas = layer.getBoundingClientRect();
      const chip = button.getBoundingClientRect();
      const obstacles = Array.from(layer.querySelectorAll<HTMLButtonElement>("button[data-seat-id]"))
        .filter(other => other !== button)
        .map(other => other.getBoundingClientRect());
      const next = placeDeskwardChip(
        { x: canvas.left + x * canvas.width, y: canvas.top + y * canvas.height }, chip, canvas, obstacles, direction, minimumShiftPx
      );
      const scale = layer.clientWidth > 0 ? canvas.width / layer.clientWidth : 1;
      const resolved = next && scale > 0 ? { x: next.x / scale, y: next.y / scale } : null;
      setOffset(previous => previous?.x === resolved?.x && previous?.y === resolved?.y ? previous : resolved);
    };
    const schedule = () => {
      if (!disposed && !frame) frame = requestAnimationFrame(measure);
    };
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    resize?.observe(layer);
    layer.querySelectorAll("button[data-seat-id]").forEach(other => resize?.observe(other));
    const changes = new window.MutationObserver(schedule);
    changes.observe(layer, { subtree: true, childList: true, attributes: true, attributeFilter: ["style", "class", "aria-pressed"] });
    schedule();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resize?.disconnect();
      changes.disconnect();
    };
  }, [enabled, x, y, mapWidth, direction, minimumShiftPx]);

  return { ref, offset: enabled ? offset : null };
}
