"use client";

// Management → Publish history: the RECORD of every publish (Phase 5 PR 1;
// the dated D0-a / D5 amendments, 2026-09-08). D0-a gave "publish events" one
// home and bundled two jobs into it. Orientation — which mode am I in, what is
// unpublished, when did this last go live — stays in the History panel,
// unchanged by this slice. The record — what went out over months, who
// published it, which publish moved the west pod — is a scanning task on a
// data set, and a 320px panel serves it badly: D0-g's own spec caps the list
// at 25, makes the rows static, and splits date from person onto two lines
// because together they "would wrap unevenly at any panel width".
//
// Built on the asset `.cds-table` through `.sp-table` (PHASE3DS §1.23: 40
// header, 32 rows) plus `.sp-log` (sheet amendment H) for the four column
// widths, `.cds-toolbar` for the live count and the asset's advanced
// `.cds-pagination`. No drill-in: a per-publish seat diff needs a container
// and a stored diff the schema does not keep.
//
// The whole log is held here and sorted here (owner ruling R3): the Changes
// column is a sum of nine jsonb buckets, which PostgREST cannot ORDER BY
// without a generated column or RPC — a migration, out of scope — and a
// Changes sort that only ranks the visible page cannot answer "find the large
// publishes", which is the only reason to have it.
//
// Fetched on mount, not in the page's server render: this tab mounts only when
// it is opened, so an admin who came for Employees pays nothing for the log.
// That is also where the in-tab loading and error states come from; the
// History panel is the shipped precedent for both.

import { useCallback, useEffect, useState } from "react";
import { getPublishLogAction } from "@/app/actions";
import { formatPublishDate } from "@/lib/shellMode";
import {
  formatPublishChangeSummary,
  publishChangeTotal,
  publishLogActorLabel,
  publishLogCountLine,
  publishLogPageSlice,
  sortPublishEvents,
  type PublishHistoryEvent,
  type PublishLogSortDirection,
  type PublishLogSortKey
} from "@/lib/publishHistory";
import { NotificationGlyph } from "@/components/seat-map/CanvasStatus";
import { ChevronIcon, ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";

type LogLoad =
  | { state: "loading" }
  | { state: "error" }
  | { state: "ready"; events: PublishHistoryEvent[] };

const PAGE_SIZES = [10, 25, 50] as const;
const DEFAULT_PAGE_SIZE = 25;

// The three sortable columns, then the sentence — which is not sortable,
// because alphabetising "3 seats moved · 1 employee edit" means nothing.
const SORTABLE_COLUMNS: Array<{ key: PublishLogSortKey; label: string; className: string; initial: PublishLogSortDirection }> = [
  { key: "when", label: "Published", className: "sp-col-when", initial: "desc" },
  { key: "who", label: "Published by", className: "sp-col-who", initial: "asc" },
  // Descending first: the reason this column exists is to surface the big
  // publishes, so one click must not answer with the smallest.
  { key: "changes", label: "Changes", className: "sp-col-count", initial: "desc" }
];

const COLUMN_LABELS = [...SORTABLE_COLUMNS.map(column => column.label), "What changed"];

export function PublishLogTable() {
  const [load, setLoad] = useState<LogLoad>({ state: "loading" });
  const [sortKey, setSortKey] = useState<PublishLogSortKey>("when");
  const [sortDirection, setSortDirection] = useState<PublishLogSortDirection>("desc");
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [page, setPage] = useState(1);

  const fetchLog = useCallback(async () => {
    setLoad({ state: "loading" });
    try {
      setLoad({ state: "ready", events: await getPublishLogAction() });
    } catch {
      setLoad({ state: "error" });
    }
  }, []);

  useEffect(() => {
    void fetchLog();
  }, [fetchLog]);

  function toggleSort(key: PublishLogSortKey) {
    const column = SORTABLE_COLUMNS.find(entry => entry.key === key);
    if (key === sortKey) setSortDirection(current => (current === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDirection(column?.initial ?? "desc");
    }
    // A re-sort changes what "page 2" means, so the reader goes back to the top
    // of the new order rather than to an arbitrary slice of it.
    setPage(1);
  }

  if (load.state === "loading" || load.state === "error") {
    return (
      <div className="sp-table sp-log">
        <div className="cds-table-container">
          <div className="cds-toolbar sp-toolbar">
            <span className="cds-toolbar-count" aria-live="polite">
              {load.state === "loading" ? "Loading publish history…" : "Publish history unavailable"}
            </span>
          </div>

          {load.state === "error" ? (
            // Task-generated failure, in the region the reader is working in
            // (patterns: inline, not a toast). The tab strip and the rest of
            // Management keep working — only this table is missing.
            <div className="cds-notification cds-notification--error" role="alert">
              <NotificationGlyph kind="error" />
              <div className="cds-notification-text">
                <strong>Publish history couldn&apos;t load</strong>
                <p>The rest of Management still works. The published map is unaffected.</p>
              </div>
              <button type="button" className="cds-btn cds-btn--ghost" onClick={() => void fetchLog()}>
                Retry
              </button>
            </div>
          ) : (
            // Skeleton rows under REAL column headers, so the frame does not
            // jump when the data lands (§1G.5, matching the route skeleton).
            <div className="sp-table-scroll" aria-busy="true">
              <table className="cds-table">
                <thead>
                  <tr>
                    {SORTABLE_COLUMNS.map(column => (
                      <th key={column.key} scope="col" className={column.className}>
                        <span className="cds-th-static">{column.label}</span>
                      </th>
                    ))}
                    <th scope="col">
                      <span className="cds-th-static">What changed</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[0, 1, 2, 3].map(row => (
                    <tr key={row} className="cds-skeleton-row">
                      {COLUMN_LABELS.map(label => (
                        <td key={label} />
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  const sorted = sortPublishEvents(load.events, sortKey, sortDirection);
  const slice = publishLogPageSlice(sorted, page, pageSize);
  // Newest-first regardless of the chosen sort — "most recent" is a fact about
  // the log, not about the current ordering.
  const mostRecent = sortPublishEvents(load.events, "when", "desc")[0] ?? null;
  const countText = publishLogCountLine(
    load.events.length,
    mostRecent ? formatPublishDate(mostRecent.created_at, { withTime: true }) : null
  );

  return (
    <div className="sp-table sp-log">
      <div className="cds-table-container">
        <div className="cds-toolbar sp-toolbar">
          <span className="cds-toolbar-count" aria-live="polite">{countText}</span>
        </div>

        {load.events.length === 0 ? (
          // Not a failed search — there is no search here. Name the real state
          // and where the next step lives (Publish is on the map: one primary
          // per surface, and this page header has none at all).
          <div className="cds-empty">
            <h3>Nothing published yet</h3>
            <p>Your first publish appears here. Publishing happens on the seat map, from the draft.</p>
          </div>
        ) : (
          <>
            <div className="sp-table-scroll">
              <table className="cds-table">
                <thead>
                  <tr>
                    {SORTABLE_COLUMNS.map(column => {
                      const isSorted = sortKey === column.key;
                      return (
                        <th
                          key={column.key}
                          scope="col"
                          className={column.className}
                          aria-sort={isSorted ? (sortDirection === "asc" ? "ascending" : "descending") : undefined}
                        >
                          <button type="button" className="cds-sort" onClick={() => toggleSort(column.key)}>
                            {column.label}
                            <ChevronIcon />
                          </button>
                        </th>
                      );
                    })}
                    <th scope="col">
                      <span className="cds-th-static">What changed</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {slice.rows.map((event, index) => {
                    const total = publishChangeTotal(event.change_summary);
                    // seat_count is the map SIZE at publish, never a delta —
                    // so it appears only inside a sentence that names it, on
                    // the one kind of row that carries no summary. There is no
                    // Seats column, and this number is never read as one.
                    const summary =
                      formatPublishChangeSummary(event.change_summary) ?? `Initial publish · ${event.seat_count} seats`;
                    return (
                      <tr key={`${event.created_at}-${index}`}>
                        <td className="sp-col-when">{formatPublishDate(event.created_at, { withTime: true })}</td>
                        <td className="sp-col-who" title={publishLogActorLabel(event)}>
                          {publishLogActorLabel(event)}
                        </td>
                        {/* "—" when the summary is unreadable: unknown, not zero. */}
                        <td className="sp-col-count">{total === null ? "—" : total.toLocaleString()}</td>
                        <td title={summary}>{summary}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="cds-pagination">
              <div className="cds-pagination-left">
                <div className="cds-select-wrap">
                  <label className="cds-visually-hidden" htmlFor="publish-log-page-size">
                    Publishes per page
                  </label>
                  <select
                    id="publish-log-page-size"
                    value={pageSize}
                    onChange={event => {
                      setPageSize(Number(event.target.value));
                      setPage(1);
                    }}
                  >
                    {PAGE_SIZES.map(size => (
                      <option key={size} value={size}>
                        {size} per page
                      </option>
                    ))}
                  </select>
                  <ChevronIcon />
                </div>
              </div>
              <div className="cds-pagination-right">
                <span className="cds-range">{slice.rangeLabel}</span>
                <button
                  type="button"
                  className="cds-btn cds-btn--icon"
                  aria-label="Previous page"
                  disabled={slice.page <= 1}
                  onClick={() => setPage(slice.page - 1)}
                >
                  <ChevronLeftIcon />
                </button>
                <button
                  type="button"
                  className="cds-btn cds-btn--icon"
                  aria-label="Next page"
                  disabled={slice.page >= slice.pageCount}
                  onClick={() => setPage(slice.page + 1)}
                >
                  <ChevronRightIcon />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
