"use client";

import { useEffect, useMemo, useState } from "react";
import { computeVirtualWindow, type VirtualWindow } from "@/lib/virtualizedList";

// Windowed rendering for element-scrolled single-column lists (viewer People
// directory, Results panel) — the same measured-scroll-geometry pattern
// AdminManagementPanel uses for its window-scrolled table, adapted to lists
// that own their scrollbar (`overflow-y-auto`). Geometry is measured from the
// live list so rows keep their exact current look; the math stays in
// lib/virtualizedList.ts where it is unit-tested.

type VirtualListGeometry = {
  scrollOffset: number;
  viewportHeight: number;
  rowHeight: number;
};

export function useVirtualListWindow(
  itemCount: number,
  {
    defaultRowHeight,
    overscanRows = 4
  }: {
    // Used until the first row renders and can be measured.
    defaultRowHeight: number;
    overscanRows?: number;
  }
): {
  // Attach to the scrolling list element (callback ref, so a conditionally
  // rendered list re-binds its listeners whenever it (re)mounts).
  setListElement: (element: HTMLElement | null) => void;
  listElement: HTMLElement | null;
  window: VirtualWindow;
} {
  const [listElement, setListElement] = useState<HTMLElement | null>(null);
  const [geometry, setGeometry] = useState<VirtualListGeometry>({
    scrollOffset: 0,
    viewportHeight: 600,
    rowHeight: defaultRowHeight
  });

  useEffect(() => {
    if (!listElement) return;

    let frame = 0;
    const measure = () => {
      frame = 0;
      const rows = listElement.querySelectorAll<HTMLElement>('[role="listitem"]');
      // Stride between consecutive rows captures inter-row gaps (space-y-*);
      // a single row falls back to its own height, none to the default.
      const rowHeight = rows.length >= 2
        ? Math.max(1, rows[1].offsetTop - rows[0].offsetTop)
        : rows[0]?.offsetHeight || defaultRowHeight;
      // Quantize to row steps so scrolling only re-renders when the window moves.
      const scrollOffset = Math.floor(listElement.scrollTop / rowHeight) * rowHeight;
      const viewportHeight = listElement.clientHeight;
      setGeometry(current => (
        current.scrollOffset === scrollOffset
          && current.viewportHeight === viewportHeight
          && current.rowHeight === rowHeight
          ? current
          : { scrollOffset, viewportHeight, rowHeight }
      ));
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };

    schedule();
    listElement.addEventListener("scroll", schedule, { passive: true });
    const observer = new ResizeObserver(schedule);
    observer.observe(listElement);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      listElement.removeEventListener("scroll", schedule);
      observer.disconnect();
    };
  }, [defaultRowHeight, itemCount, listElement]);

  const virtualWindow = useMemo(() => computeVirtualWindow({
    itemCount,
    columns: 1,
    rowHeight: geometry.rowHeight,
    viewportHeight: geometry.viewportHeight,
    scrollOffset: geometry.scrollOffset,
    overscanRows
  }), [geometry, itemCount, overscanRows]);

  return { setListElement, listElement, window: virtualWindow };
}
