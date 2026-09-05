"use client";

// Employees index (PHASE2UX §1G.3; PHASE3DS §1.23, block 21) on the asset
// `.cds-table`: toolbar (search 320 with a clear ×, the live count — zero
// included), 40 header with `.cds-sort` buttons + aria-sort, 32 rows:
// Name · Department · Position · Extension (right, tabular) · Seat (code-02
// link to the map through withSeatParam, colour steps on the ROW's hover —
// P3-7) · Status (SeatMark ● / ○ + label, never colour alone) · ONE row action:
// a ghost Edit icon button with the tier-C tooltip (no kebab — a kebab holding
// one item is a tell). Rows are NOT tab stops (two per row: the seat link and
// Edit); the row click is a mouse shortcut. Virtualised as shipped: only the
// windowed slice renders, spacer rows preserve the scroll height, and the
// focused row is pinned by employee id so a re-sort follows the person.
//
// Scroll source: the shell's content pane is the scroll container at lg
// (the document below lg), so the scroll listener is capture-phase on the
// window — a bubbling `scroll` never leaves the pane. PHASE4BUILD §1.37.

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Employee } from "@/lib/types";
import { withSeatParam } from "@/lib/deepLink";
import { computeVirtualSegments, computeVirtualWindow } from "@/lib/virtualizedList";
import { formatDisplayName } from "@/lib/formatName";
import { toolbarCount } from "@/lib/managementCounts";
import { SeatMark } from "@/components/seat-map/SeatMark";
import { ChevronIcon, SearchIcon } from "@/components/seat-map/mapIcons";
import { CloseIcon } from "@/components/ui/CloseIcon";

export type EmployeeSortKey = "name" | "department" | "position" | "extension" | "seat" | "status";
export type SortDirection = "asc" | "desc";

const employeeColumns: Array<{ key: EmployeeSortKey; label: string; className?: string }> = [
  { key: "name", label: "Name" },
  { key: "department", label: "Department" },
  { key: "position", label: "Position" },
  { key: "extension", label: "Extension", className: "sp-col-ext" },
  { key: "seat", label: "Seat", className: "sp-col-seat" },
  { key: "status", label: "Status" }
];

const EditIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <path d="M11.5 2.5l2 2L6 12H4v-2z" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" />
    <path d="M3 14h10" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
  </svg>
);

export function EmployeesTable({
  sortedEmployees,
  totalActive,
  assignedCount,
  search,
  onSearchChange,
  sortKey,
  sortDirection,
  onToggleSort,
  seatLabelByEmployeeId,
  selectedEmployeeId,
  onEdit
}: {
  sortedEmployees: Employee[];
  totalActive: number;
  assignedCount: number;
  search: string;
  onSearchChange: (value: string) => void;
  sortKey: EmployeeSortKey;
  sortDirection: SortDirection;
  onToggleSort: (key: EmployeeSortKey) => void;
  seatLabelByEmployeeId: Map<string, string>;
  selectedEmployeeId: string;
  onEdit: (employee: Employee) => void;
}) {
  const searching = search.trim().length > 0;
  const countText = toolbarCount({ total: totalActive, assigned: assignedCount, matching: sortedEmployees.length, searching });

  // Virtualized directory (Figma page 10, Scalability): only the employee rows
  // near the viewport render; padding preserves the scroll height. Geometry
  // is measured from the live table so the rows keep their exact look.
  const employeeGridRef = useRef<HTMLTableSectionElement | null>(null);
  const [employeeGridGeometry, setEmployeeGridGeometry] = useState({
    scrollOffset: 0,
    viewportHeight: 1080,
    columns: 1,
    rowHeight: 32
  });
  // Focused row kept mounted across window moves, pinned by EMPLOYEE ID (not
  // index) so a re-sort/reorder follows the person, not the position.
  const [pinnedEmployeeId, setPinnedEmployeeId] = useState<string | null>(null);

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const grid = employeeGridRef.current;
      if (!grid) return;
      const columns = 1;
      // Pinned rows sit against a split spacer, not their real neighbors, so
      // measuring one reads the gap, not the row.
      const firstRow = grid.querySelector<HTMLElement>("[data-directory-row]:not([data-vpinned])");
      // Fall back to the row height before the first row renders — and on a
      // zero-height measurement (hidden table, no layout): dividing by it
      // would NaN the scroll offset and blank the whole window.
      const rowHeight = firstRow && firstRow.offsetHeight > 0 ? firstRow.offsetHeight : 32;
      // Quantize to row steps so scrolling only re-renders when the window moves.
      const rawOffset = Math.max(0, -grid.getBoundingClientRect().top);
      const scrollOffset = Math.floor(rawOffset / rowHeight) * rowHeight;
      const viewportHeight = window.innerHeight;
      setEmployeeGridGeometry(current => (
        current.scrollOffset === scrollOffset
          && current.viewportHeight === viewportHeight
          && current.columns === columns
          && current.rowHeight === rowHeight
          ? current
          : { scrollOffset, viewportHeight, columns, rowHeight }
      ));
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };

    measure();
    // Capture phase: `scroll` does not bubble, and at lg the scroll container
    // is the shell's content pane, not the document.
    window.addEventListener("scroll", schedule, { passive: true, capture: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
    };
  }, [sortedEmployees.length]);

  const employeeWindow = useMemo(() => computeVirtualWindow({
    itemCount: sortedEmployees.length,
    columns: employeeGridGeometry.columns,
    rowHeight: employeeGridGeometry.rowHeight,
    viewportHeight: employeeGridGeometry.viewportHeight,
    scrollOffset: employeeGridGeometry.scrollOffset,
    overscanRows: 4
  }), [sortedEmployees.length, employeeGridGeometry]);
  // Derive the pinned row's current absolute index from its stable id every
  // render, so a re-sort/reorder still finds the pinned employee at its new
  // position instead of stranding the pin on a stale index.
  const pinnedEmployeeIndex = useMemo(() => {
    if (!pinnedEmployeeId) return null;
    const index = sortedEmployees.findIndex(employee => employee.id === pinnedEmployeeId);
    return index === -1 ? null : index;
  }, [pinnedEmployeeId, sortedEmployees]);
  const employeeSegments = useMemo(() => computeVirtualSegments({
    window: employeeWindow,
    itemCount: sortedEmployees.length,
    rowHeight: employeeGridGeometry.rowHeight,
    pinnedIndex: pinnedEmployeeIndex
  }), [employeeWindow, sortedEmployees.length, employeeGridGeometry.rowHeight, pinnedEmployeeIndex]);

  // Keyboard focus on the seat link or the Edit button must survive the
  // window moving out from under it (scroll/resize) — an unmount-blur would
  // otherwise drop focus to <body> and restart Tab from the top of the page.
  useEffect(() => {
    const grid = employeeGridRef.current;
    if (!grid) return;

    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const row = target?.closest("[data-vindex]");
      if (!row || !grid.contains(row)) return;
      // Read the id from the DOM attribute, not from sortedEmployees[index] —
      // this handler's closure can go stale, but the attribute cannot.
      const employeeId = row.getAttribute("data-employee-id");
      if (employeeId) setPinnedEmployeeId(employeeId);
    };
    const handleFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget instanceof Node ? event.relatedTarget : null;
      if (next && !grid.contains(next)) setPinnedEmployeeId(null);
    };

    grid.addEventListener("focusin", handleFocusIn);
    grid.addEventListener("focusout", handleFocusOut);
    return () => {
      grid.removeEventListener("focusin", handleFocusIn);
      grid.removeEventListener("focusout", handleFocusOut);
    };
    // sortedEmployees.length is load-bearing: the tbody only renders when the
    // list is non-empty, so it unmounts/remounts across that boundary and this
    // effect must re-run to re-attach the listeners to the new node.
  }, [sortedEmployees.length]);

  // A departed employee (deactivated) or a re-sort that no longer holds the
  // pinned id resolves to `pinnedEmployeeIndex === null` above — the stale id
  // is harmless until the next focusin replaces it, so no effect is needed.

  return (
    <div className="sp-table">
      <div className="cds-table-container">
        <div className="cds-toolbar sp-toolbar" role="search">
          <div className="cds-toolbar-search">
            <SearchIcon />
            <input
              type="search"
              name="employee-search"
              value={search}
              onChange={event => onSearchChange(event.target.value)}
              placeholder="Search employees…"
              aria-label="Search employees"
              autoComplete="off"
            />
            {searching && (
              <button type="button" className="sp-search-clear cds-btn cds-btn--icon" aria-label="Clear search" onClick={() => onSearchChange("")}>
                <CloseIcon />
              </button>
            )}
          </div>
          <span className="cds-toolbar-count" aria-live="polite">{countText}</span>
        </div>

        {sortedEmployees.length === 0 ? (
          totalActive === 0 ? (
            /* First-run: an empty DIRECTORY is not a failed search — name the
               real state and the next step (the header primary + Settings). */
            <div className="cds-empty">
              <h3>No employees yet</h3>
              <p>Start with Add employee, or bring the whole directory in at once with a CSV import in Settings.</p>
              <div className="cds-empty-actions">
                <Link href="/admin/settings" className="cds-btn cds-btn--tertiary cds-btn--md">Open Settings</Link>
              </div>
            </div>
          ) : (
            <div className="cds-empty">
              <h3>No employees match this search</h3>
              <p>Try a different name, department, position, or seat label.</p>
              <div className="cds-empty-actions">
                <button type="button" className="cds-btn cds-btn--ghost cds-btn--md" onClick={() => onSearchChange("")}>Clear search</button>
              </div>
            </div>
          )
        ) : (
          <div className="sp-table-scroll">
            <table className="cds-table">
              <thead>
                <tr>
                  {employeeColumns.map(column => {
                    const isSorted = sortKey === column.key;
                    return (
                      <th
                        key={column.key}
                        scope="col"
                        className={column.className}
                        aria-sort={isSorted ? (sortDirection === "asc" ? "ascending" : "descending") : undefined}
                      >
                        <button type="button" className="cds-sort" onClick={() => onToggleSort(column.key)}>
                          {column.label}
                          <ChevronIcon />
                        </button>
                      </th>
                    );
                  })}
                  <th scope="col" className="cds-col-actions">
                    <span className="cds-visually-hidden">Row actions</span>
                  </th>
                </tr>
              </thead>
              <tbody ref={employeeGridRef}>
                {employeeSegments.map((segment, segmentIndex) => {
                  if (segment.kind === "spacer") {
                    return segment.height > 0 ? (
                      <tr key={`spacer-${segmentIndex}`} aria-hidden="true">
                        <td colSpan={employeeColumns.length + 1} style={{ height: segment.height, padding: 0 }} />
                      </tr>
                    ) : null;
                  }
                  const employee = sortedEmployees[segment.index];
                  if (!employee) return null;
                  const seatLabel = seatLabelByEmployeeId.get(employee.id) ?? "";
                  const isAssigned = seatLabelByEmployeeId.has(employee.id);
                  const isSelected = selectedEmployeeId === employee.id;
                  const displayName = formatDisplayName(employee.full_name);
                  return (
                    <tr
                      key={employee.id}
                      data-directory-row
                      data-vindex={segment.index}
                      data-vpinned={segment.pinned ? "" : undefined}
                      data-employee-id={employee.id}
                      aria-selected={isSelected}
                      onClick={() => onEdit(employee)}
                      /* The row is a mouse shortcut only, never a tab stop: the
                         keyboard path is the seat link and the Edit button
                         (two stops per row, PHASE2UX §1G.3). */
                      className="cursor-pointer"
                    >
                      <td title={displayName}>{displayName}</td>
                      <td className="cds-col-muted" title={employee.department ?? undefined}>{employee.department || "—"}</td>
                      <td className="cds-col-muted" title={employee.position ?? undefined}>{employee.position || "—"}</td>
                      <td className="sp-col-ext">{employee.phone_extension || "—"}</td>
                      <td className="sp-col-seat">
                        {/* Contract #13: the seat code is the map affordance — a real
                            link so it is shareable and middle-clickable. Unseated
                            people have nothing to show, so the cell stays empty. */}
                        {isAssigned ? (
                          <Link
                            href={`/admin${withSeatParam("", seatLabel)}`}
                            prefetch={false}
                            onClick={event => event.stopPropagation()}
                            className="sp-seat-link"
                            translate="no"
                          >
                            {seatLabel}
                          </Link>
                        ) : (
                          <span className="cds-col-muted">—</span>
                        )}
                      </td>
                      <td>
                        <span className="sp-seat-legend">
                          <SeatMark kind={isAssigned ? "assigned-dot" : "open"} className={isAssigned ? "sp-seat-mark--assigned" : undefined} />
                          {isAssigned ? "Assigned" : "Unassigned"}
                        </span>
                      </td>
                      <td className="cds-col-actions">
                        {/* The last row's tooltip would leave `.sp-table-scroll` (a clipping box),
                            so it flips above the button — PHASE3DS §1.23 amendment D. */}
                        <span
                          className="sp-has-tooltip"
                          data-tooltip-placement={segment.index === sortedEmployees.length - 1 ? "above" : undefined}
                        >
                          <button
                            type="button"
                            className="cds-btn cds-btn--ghost cds-btn--icon"
                            onClick={event => {
                              event.stopPropagation();
                              onEdit(employee);
                            }}
                            aria-label={`Edit ${displayName}`}
                          >
                            <EditIcon />
                          </button>
                          <span className="sp-tooltip" role="tooltip">Edit</span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
