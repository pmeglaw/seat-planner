"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { computeVirtualSegments, computeVirtualWindow, type VirtualSegment, type VirtualWindow } from "@/lib/virtualizedList";

// Windowed rendering for element-scrolled single-column lists (viewer People
// directory, Results panel) — the same measured-scroll-geometry pattern
// AdminManagementPanel uses for its window-scrolled table, adapted to lists
// that own their scrollbar (`overflow-y-auto`). Geometry is measured from the
// live list so rows keep their exact current look; the math stays in
// lib/virtualizedList.ts where it is unit-tested.
//
// Keyboard contract: consumers render `segments` (spacers + rows) and stamp
// each row wrapper with an EXPLICIT role="listitem" attribute plus
// data-vindex={index} (and data-vpinned when segment.pinned). The explicit
// role is load-bearing, not just a11y garnish: row measurement queries
// [role="listitem"], and querySelectorAll never matches implicit ARIA roles —
// semantic <ul>/<li> markup would measure zero rows and silently pin the
// geometry to defaultRowHeight forever. The hook then keeps the FOCUSED row mounted even after it
// scrolls out of the window — unmounting the focused element drops focus to
// <body>, killing the container's keydown handler — and `focusRow` moves focus
// by absolute index, mounting + scrolling the target first when the window
// hasn't rendered it (held-key repeat outruns the rAF re-measure, so the next
// row is not guaranteed to be mounted).

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
  // Render these in order: spacer divs (aria-hidden) and rows by absolute index.
  segments: VirtualSegment[];
  // Focus the row at an absolute index, mounting it first if it isn't rendered.
  focusRow: (index: number) => void;
} {
  const [listElement, setListElement] = useState<HTMLElement | null>(null);
  const [geometry, setGeometry] = useState<VirtualListGeometry>({
    scrollOffset: 0,
    viewportHeight: 600,
    rowHeight: defaultRowHeight
  });
  // Focused row kept mounted across window moves. Set from focusin (any row
  // gaining focus), cleared on focusout only when focus provably moved
  // OUTSIDE the list (relatedTarget elsewhere) — an unmount-blur reports
  // relatedTarget null, and clearing on it would defeat the pin.
  const [pinnedIndex, setPinnedIndex] = useState<number | null>(null);
  const pendingFocusRef = useRef<number | null>(null);

  useEffect(() => {
    if (!listElement) return;

    let frame = 0;
    const measure = () => {
      frame = 0;
      // Pinned rows sit against a split spacer, not their real neighbors, so
      // an offsetTop stride across one would measure the spacer gap — only
      // consecutive window rows are safe to measure.
      const rows = listElement.querySelectorAll<HTMLElement>('[role="listitem"]:not([data-vpinned])');
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

  useEffect(() => {
    if (!listElement) return;

    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const row = target?.closest("[data-vindex]");
      if (!row || !listElement.contains(row)) return;
      const index = Number(row.getAttribute("data-vindex"));
      if (Number.isInteger(index)) setPinnedIndex(index);
    };
    const handleFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget instanceof Node ? event.relatedTarget : null;
      if (next && !listElement.contains(next)) setPinnedIndex(null);
    };

    listElement.addEventListener("focusin", handleFocusIn);
    listElement.addEventListener("focusout", handleFocusOut);
    return () => {
      listElement.removeEventListener("focusin", handleFocusIn);
      listElement.removeEventListener("focusout", handleFocusOut);
    };
  }, [listElement]);

  // A re-filtered list invalidates absolute indices; drop a now-out-of-range pin.
  useEffect(() => {
    setPinnedIndex(current => (current !== null && current >= itemCount ? null : current));
    if (pendingFocusRef.current !== null && pendingFocusRef.current >= itemCount) {
      pendingFocusRef.current = null;
    }
  }, [itemCount]);

  const focusRowElement = useCallback((index: number): boolean => {
    const row = listElement?.querySelector(`[data-vindex="${index}"]`);
    const focusable = row?.querySelector<HTMLElement>("button:not([disabled])");
    if (!focusable) return false;
    // Native focus scrolls the list minimally, landing the row in view.
    focusable.focus();
    return true;
  }, [listElement]);

  const focusRow = useCallback((index: number) => {
    if (!listElement || itemCount === 0) return;
    const clamped = Math.min(itemCount - 1, Math.max(0, Math.floor(index)));
    if (focusRowElement(clamped)) return;
    // Not mounted (window hasn't caught up): pin the target so the next render
    // mounts it at its true offset, then focus it post-render below.
    pendingFocusRef.current = clamped;
    setPinnedIndex(clamped);
  }, [focusRowElement, itemCount, listElement]);

  // Completes a deferred focusRow once the pinned target has rendered.
  useEffect(() => {
    const pending = pendingFocusRef.current;
    if (pending === null) return;
    if (focusRowElement(pending)) pendingFocusRef.current = null;
  });

  const virtualWindow = useMemo(() => computeVirtualWindow({
    itemCount,
    columns: 1,
    rowHeight: geometry.rowHeight,
    viewportHeight: geometry.viewportHeight,
    scrollOffset: geometry.scrollOffset,
    overscanRows
  }), [geometry, itemCount, overscanRows]);

  const segments = useMemo(() => computeVirtualSegments({
    window: virtualWindow,
    itemCount,
    rowHeight: geometry.rowHeight,
    pinnedIndex
  }), [geometry.rowHeight, itemCount, pinnedIndex, virtualWindow]);

  return { setListElement, listElement, window: virtualWindow, segments, focusRow };
}
