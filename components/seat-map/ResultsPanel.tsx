"use client";

import type { SeatStatus } from "@/lib/types";
import { formatDisplayName } from "@/lib/formatName";
import { stepFocusIndex } from "@/lib/virtualizedList";
import { useVirtualListWindow } from "@/components/seat-map/useVirtualListWindow";

export type AdminResultCard = {
  key: string;
  seatId: string | null;
  // Callers must pre-format this (formatDisplayName for names, formatSeatCode
  // for seat codes) — rendered verbatim here so mixed name+code titles don't
  // get re-title-cased as a single "shouting" word (e.g. "CW01" -> "Cw01").
  title: string;
  subtitle: string;
  status: SeatStatus | null;
  disabled?: boolean;
};

const STATUS_DOT_CLASS: Record<SeatStatus, string> = {
  assigned: "bg-[var(--admin-marker-assigned-accent)]",
  available: "bg-[var(--admin-marker-available-accent)]",
  reserved: "bg-[var(--admin-marker-reserved-accent)]",
  unavailable: "bg-[var(--admin-marker-unavailable-accent)]"
};

type ResultsPanelProps = {
  results: AdminResultCard[];
  matchCount: number;
  emptyTitle: string;
  emptyDescription: string;
  searchActive: boolean;
  structuredFiltersActive: boolean;
  onOpen: (seatId: string) => void;
  onShowOnMap: (seatId: string) => void;
  onClearSearch: () => void;
  onClearFilters: () => void;
  onClearAll: () => void;
  // Set while the inspector is auto-collapsed to its pill behind this panel: the
  // selected seat stays reachable from a row here instead of an overlapping pill.
  collapsedSeatLabel?: string | null;
  onExpandCollapsedSeat?: () => void;
};

export function ResultsPanel({
  results,
  matchCount,
  emptyTitle,
  emptyDescription,
  searchActive,
  structuredFiltersActive,
  onOpen,
  onShowOnMap,
  onClearSearch,
  onClearFilters,
  onClearAll,
  collapsedSeatLabel = null,
  onExpandCollapsedSeat
}: ResultsPanelProps) {
  // Windowed rendering (the Management directory's computeVirtualWindow math
  // via the shared hook): the hook's segments render only rows near the
  // viewport plus the focused row (pinned so scrolling never unmounts it and
  // drops focus to <body>), with spacers preserving the scrollbar. Keyboard
  // roving moves by ABSOLUTE index (stepFocusIndex) — walking the rendered
  // slice reads a mid-window row as "first" once the list has scrolled.
  const { setListElement, listElement, window: resultsWindow, segments, focusRow } = useVirtualListWindow(results.length, { defaultRowHeight: 54 });

  function handleListKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const direction = event.key === "ArrowDown" ? 1 : -1;
    const activeRow = document.activeElement instanceof HTMLElement ? document.activeElement.closest("[data-vindex]") : null;
    const rawIndex = activeRow && listElement?.contains(activeRow) ? Number(activeRow.getAttribute("data-vindex")) : NaN;
    const target = stepFocusIndex({
      itemCount: results.length,
      currentIndex: Number.isInteger(rawIndex) ? rawIndex : null,
      direction,
      isDisabled: index => Boolean(results[index]?.disabled),
      fallbackIndex: resultsWindow.startIndex
    });
    if (target !== null) focusRow(target);
  }

  const matchSummary = matchCount === 1 ? "1 match" : `${matchCount} matches`;

  return (
    <aside
      aria-labelledby="admin-results-title"
      className="fixed inset-x-3 bottom-3 z-[80] flex max-h-[50vh] flex-col overflow-hidden border border-[var(--admin-border)] bg-[var(--admin-surface)] shadow-elevation-3 panel:inset-x-auto panel:bottom-3 panel:right-3 panel:top-[calc(var(--admin-chrome-h)_+_12px)] panel:z-40 panel:max-h-none panel:w-[320px] panel:max-w-[calc(100vw-1.5rem)]"
    >
      <div className="flex items-center justify-between gap-2 border-b border-[var(--admin-border)] px-4 py-3">
        <h2 id="admin-results-title" className="text-sm font-semibold text-[var(--admin-text-primary)]">Results</h2>
        <span aria-live="polite" className="text-xs font-medium text-[var(--admin-text-muted)]">{matchSummary}</span>
      </div>

      {collapsedSeatLabel && onExpandCollapsedSeat && (
        <button
          type="button"
          onClick={onExpandCollapsedSeat}
          aria-label={`View details for ${collapsedSeatLabel}`}
          title={`View details for ${collapsedSeatLabel}`}
          className="mx-2 mt-2 flex shrink-0 items-center justify-between gap-2 border border-[var(--admin-border)] bg-[var(--admin-paper)] px-2.5 py-2 text-left transition hover:border-[var(--admin-border-strong)] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus)]"
        >
          <span className="min-w-0 truncate text-xs font-semibold text-[var(--admin-text-primary)]">{collapsedSeatLabel} selected</span>
          <span className="shrink-0 text-[11px] font-semibold text-[var(--admin-primary-on-soft)]">View details</span>
        </button>
      )}

      {results.length > 0 ? (
        <div
          ref={setListElement}
          role="list"
          aria-label="Admin search results"
          onKeyDown={handleListKeyDown}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2"
        >
          {segments.map((segment, segmentPosition) => {
            if (segment.kind === "spacer") {
              return <div aria-hidden="true" key={`spacer-${segmentPosition}`} style={{ height: segment.height }} />;
            }
            const result = results[segment.index];
            if (!result) return null;
            return (
            <div
              role="listitem"
              key={result.key}
              data-vindex={segment.index}
              data-vpinned={segment.pinned ? "" : undefined}
              className="group flex items-stretch gap-1 border border-transparent transition hover:border-[var(--admin-border)] hover:bg-[var(--admin-paper)]"
            >
              <button
                type="button"
                data-result-card
                disabled={result.disabled}
                onClick={() => result.seatId && onOpen(result.seatId)}
                title={result.disabled ? "No assigned seat to open" : `Open ${result.title}`}
                className="flex min-w-0 flex-1 items-start gap-2.5 px-2.5 py-2 text-left transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus)] disabled:cursor-not-allowed disabled:opacity-55"
              >
                <span
                  className={[
                    "mt-1 h-2.5 w-2.5 shrink-0 rounded-full",
                    result.status ? STATUS_DOT_CLASS[result.status] : "bg-[var(--admin-border-strong)]"
                  ].join(" ")}
                  aria-hidden="true"
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-[var(--admin-text-primary)]">{result.title}</span>
                  <span className="block truncate text-xs font-medium text-[var(--admin-text-muted)]">{formatDisplayName(result.subtitle)}</span>
                </span>
              </button>
              {result.seatId && (
                <button
                  type="button"
                  onClick={() => onShowOnMap(result.seatId as string)}
                  aria-label={`Show ${result.title} on the map`}
                  title={`Show ${result.title} on the map`}
                  className="my-1 mr-1 flex shrink-0 items-center self-center whitespace-nowrap rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-2.5 py-1 text-[11px] font-semibold text-[var(--admin-primary-cta)] transition hover:border-[var(--admin-primary-border)] hover:bg-[var(--admin-primary-soft)] hover:text-[var(--admin-primary-on-soft)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus)]"
                >
                  Show on map
                </button>
              )}
            </div>
            );
          })}
        </div>
      ) : (
        <div className="p-4">
          <div className="text-sm font-semibold text-[var(--admin-text-primary)]">{emptyTitle}</div>
          <p className="mt-1 text-xs font-medium leading-5 text-[var(--admin-text-muted)]">{emptyDescription}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {searchActive && (
              <button type="button" onClick={onClearSearch} className="rounded-lg border border-[var(--admin-border-strong)] bg-[var(--admin-surface)] px-3 py-1.5 text-[11px] font-semibold text-[var(--admin-text-secondary)] transition hover:border-[var(--admin-primary-border)] hover:text-[var(--admin-primary-cta)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus)]">
                Clear search
              </button>
            )}
            {structuredFiltersActive && (
              <button type="button" onClick={onClearFilters} className="rounded-lg border border-[var(--admin-border-strong)] bg-[var(--admin-surface)] px-3 py-1.5 text-[11px] font-semibold text-[var(--admin-text-secondary)] transition hover:border-[var(--admin-primary-border)] hover:text-[var(--admin-primary-cta)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus)]">
                Clear filters
              </button>
            )}
            {searchActive && structuredFiltersActive && (
              <button type="button" onClick={onClearAll} className="rounded-lg border border-[var(--admin-primary-border)] bg-[var(--admin-primary-soft)] px-3 py-1.5 text-[11px] font-semibold text-[var(--admin-primary-on-soft)] transition hover:border-[var(--admin-primary)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus)]">
                Clear all
              </button>
            )}
          </div>
        </div>
      )}

      <div className="border-t border-[var(--admin-border)] px-4 py-2 text-[11px] font-medium text-[var(--admin-text-subtle)]">
        ↑↓ to move · Enter opens · Esc clears
      </div>
    </aside>
  );
}
