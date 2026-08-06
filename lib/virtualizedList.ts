// Windowed rendering math for long directory grids (Figma page 10, Scalability:
// the Management directory must survive 500/1,000/5,000 employees). Pure module:
// callers supply scroll geometry, it returns the slice of items to render plus
// the padding that preserves the total scroll height. Grid-aware — items flow
// into `columns` per row, and the window always starts/ends on row boundaries.

export type VirtualWindowInput = {
  itemCount: number;
  // Grid columns at the current breakpoint (>= 1).
  columns: number;
  // Row height including the row gap, in px (> 0).
  rowHeight: number;
  // Visible height of the scrolling viewport, in px.
  viewportHeight: number;
  // How far the list top has scrolled above the viewport top (>= 0).
  scrollOffset: number;
  overscanRows?: number;
};

export type VirtualWindow = {
  startIndex: number;
  // Exclusive.
  endIndex: number;
  topPadding: number;
  bottomPadding: number;
};

// One renderable piece of a windowed single-column list: either a spacer div
// standing in for off-window rows, or a real row identified by its absolute
// index into the full items array. `pinned` marks a row rendered OUTSIDE the
// scroll window purely to keep the browser's focus alive — unmounting the
// focused element silently drops focus to <body>, which kills the list's
// keyboard handler (arrow keys stop working and Tab restarts from the top of
// the page). Pinned rows must be excluded from row-height measurement: they
// are not adjacent to their rendered neighbors, so an offsetTop stride across
// one measures the gap, not the row.
export type VirtualSegment =
  | { kind: "spacer"; height: number }
  | { kind: "row"; index: number; pinned: boolean };

export type VirtualSegmentsInput = {
  window: VirtualWindow;
  itemCount: number;
  rowHeight: number;
  // Absolute index of the focused row to keep mounted, or null. Out-of-range
  // values are ignored; an in-window value renders as a normal window row.
  pinnedIndex: number | null;
};

// Expand a VirtualWindow into render segments, keeping the focused row mounted
// even when it has scrolled out of the window. Spacers are split around the
// pinned row so every row still sits at its true scroll offset and the total
// list height is preserved (spacer heights + one rowHeight per rendered row
// always sum to itemCount * rowHeight). Single-column only — the two consumers
// (viewer People directory, admin Results panel) are 1-column lists.
export function computeVirtualSegments(input: VirtualSegmentsInput): VirtualSegment[] {
  const { window: win, itemCount, pinnedIndex } = input;
  const rowHeight = Math.max(1, input.rowHeight);
  const segments: VirtualSegment[] = [];
  const pushSpacer = (height: number) => {
    if (height > 0) segments.push({ kind: "spacer", height });
  };

  const pinnedAbove = pinnedIndex !== null && pinnedIndex >= 0 && pinnedIndex < win.startIndex;
  const pinnedBelow = pinnedIndex !== null && pinnedIndex >= win.endIndex && pinnedIndex < itemCount;

  if (pinnedAbove) {
    pushSpacer(pinnedIndex * rowHeight);
    segments.push({ kind: "row", index: pinnedIndex, pinned: true });
    pushSpacer((win.startIndex - pinnedIndex - 1) * rowHeight);
  } else {
    pushSpacer(win.topPadding);
  }

  for (let index = win.startIndex; index < win.endIndex; index++) {
    segments.push({ kind: "row", index, pinned: false });
  }

  if (pinnedBelow) {
    pushSpacer((pinnedIndex - win.endIndex) * rowHeight);
    segments.push({ kind: "row", index: pinnedIndex, pinned: true });
    pushSpacer((itemCount - pinnedIndex - 1) * rowHeight);
  } else {
    pushSpacer(win.bottomPadding);
  }

  return segments;
}

export type StepFocusInput = {
  itemCount: number;
  // Absolute index of the currently focused row, or null when focus sits on
  // the list container itself (freshly tabbed in).
  currentIndex: number | null;
  direction: 1 | -1;
  // Rows that cannot take focus (disabled buttons) are skipped, judged from
  // the DATA, not the DOM — windowing means most rows are not rendered.
  isDisabled?: (index: number) => boolean;
  // Where ArrowDown starts when nothing is focused yet: the first row the
  // user can see (the window start), not absolute row 0, so tabbing into a
  // scrolled list doesn't yank it back to the top.
  fallbackIndex?: number;
};

// Absolute-index arrow-key navigation for windowed lists. Walking the RENDERED
// buttons instead (querySelectorAll + findIndex) breaks under windowing: the
// first rendered row of a scrolled window reads as index 0, so ArrowUp
// mid-list falsely reports "top of list" (and warped viewer focus into the
// search input — the regression this replaces). Returns the next focusable
// absolute index, or null when there is nothing further in that direction —
// callers decide what null means (viewer: ArrowUp exits to the search input;
// admin: no-op).
export function stepFocusIndex(input: StepFocusInput): number | null {
  const itemCount = Math.max(0, Math.floor(input.itemCount));
  if (itemCount === 0) return null;
  const isDisabled = input.isDisabled ?? (() => false);

  const current = input.currentIndex;
  if (current === null || !Number.isInteger(current) || current < 0 || current >= itemCount) {
    // Nothing focused: ArrowUp leaves the list, ArrowDown enters it at the
    // first focusable row from the fallback (scanning back up if the window
    // has scrolled past every enabled row).
    if (input.direction === -1) return null;
    const start = Math.min(itemCount - 1, Math.max(0, Math.floor(input.fallbackIndex ?? 0)));
    for (let index = start; index < itemCount; index++) {
      if (!isDisabled(index)) return index;
    }
    for (let index = start - 1; index >= 0; index--) {
      if (!isDisabled(index)) return index;
    }
    return null;
  }

  for (let index = current + input.direction; index >= 0 && index < itemCount; index += input.direction) {
    if (!isDisabled(index)) return index;
  }
  return null;
}

export function computeVirtualWindow(input: VirtualWindowInput): VirtualWindow {
  const columns = Math.max(1, Math.floor(input.columns));
  const rowHeight = Math.max(1, input.rowHeight);
  const overscanRows = Math.max(0, input.overscanRows ?? 3);
  const itemCount = Math.max(0, Math.floor(input.itemCount));

  if (itemCount === 0) {
    return { startIndex: 0, endIndex: 0, topPadding: 0, bottomPadding: 0 };
  }

  const totalRows = Math.ceil(itemCount / columns);
  const firstVisibleRow = Math.floor(Math.max(0, input.scrollOffset) / rowHeight);
  // +1 covers the partially visible row at the bottom edge.
  const visibleRowCount = Math.ceil(Math.max(0, input.viewportHeight) / rowHeight) + 1;
  const startRow = Math.max(0, Math.min(totalRows, firstVisibleRow - overscanRows));
  const endRow = Math.max(startRow, Math.min(totalRows, firstVisibleRow + visibleRowCount + overscanRows));

  return {
    // The last row may be partial, so a fully-scrolled-past window clamps here.
    startIndex: Math.min(itemCount, startRow * columns),
    endIndex: Math.min(itemCount, endRow * columns),
    topPadding: startRow * rowHeight,
    bottomPadding: Math.max(0, (totalRows - endRow) * rowHeight)
  };
}
