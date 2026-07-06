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
