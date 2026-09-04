"use client";

import type { SeatStatus } from "@/lib/types";
import { formatDisplayName } from "@/lib/formatName";
import { stepFocusIndex } from "@/lib/virtualizedList";
import { useVirtualListWindow } from "@/components/seat-map/useVirtualListWindow";

export type AdminResultCard = {
  key: string;
  seatId: string | null;
  /** A person card (no seat): the roster row the card opens (multi-floor
   *  PR-3 — an unseated person is findable AND openable; the canvas switches
   *  to the floor they work on and marks their row). */
  employeeId?: string | null;
  // Callers must pre-format this (formatDisplayName for names, formatSeatCode
  // for seat codes) — rendered verbatim here so mixed name+code titles don't
  // get re-title-cased as a single "shouting" word (e.g. "CW01" -> "Cw01").
  title: string;
  subtitle: string;
  status: SeatStatus | null;
  /** "Floor 2" when the card lives on a floor other than the canvas floor —
   *  the search spans the building, so the row says where it will take you. */
  floorTag?: string | null;
  disabled?: boolean;
};

const STATUS_DOT_CLASS: Record<SeatStatus, string> = {
  assigned: "bg-[var(--sp-legend-assigned-accent)]",
  available: "bg-[var(--sp-legend-available-accent)]",
  reserved: "bg-[var(--sp-legend-reserved-accent)]",
  unavailable: "bg-[var(--sp-legend-unavailable-accent)]"
};

type ResultsPanelProps = {
  results: AdminResultCard[];
  matchCount: number;
  emptyTitle: string;
  emptyDescription: string;
  searchActive: boolean;
  structuredFiltersActive: boolean;
  onOpen: (seatId: string) => void;
  /** Opens a person card (employeeId set, seatId null). */
  onOpenPerson?: (employeeId: string) => void;
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
  onOpenPerson,
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
      className="fixed inset-x-3 bottom-3 z-[80] flex max-h-[50vh] flex-col overflow-hidden border border-[var(--sp-border-subtle)] bg-[var(--sp-layer-01)] shadow-sp panel:inset-x-auto panel:bottom-3 panel:right-3 panel:top-[calc(var(--sp-chrome-height)_+_12px)] panel:z-40 panel:max-h-none panel:w-[320px] panel:max-w-[calc(100vw-1.5rem)]"
    >
      <div className="flex items-center justify-between gap-2 border-b border-[var(--sp-border-subtle)] px-4 py-3">
        <h2 id="admin-results-title" className="text-sm font-semibold text-[var(--sp-text-primary)]">Results</h2>
        <span aria-live="polite" className="text-xs font-medium text-[var(--sp-text-helper)]">{matchSummary}</span>
      </div>

      {collapsedSeatLabel && onExpandCollapsedSeat && (
        <button
          type="button"
          onClick={onExpandCollapsedSeat}
          aria-label={`View details for ${collapsedSeatLabel}`}
          title={`View details for ${collapsedSeatLabel}`}
          className="relative mx-2 mt-2 flex shrink-0 items-center justify-between gap-2 border border-[var(--sp-border-subtle)] bg-[var(--sp-layer-hover)] px-2.5 py-2 text-left transition after:absolute after:-inset-y-1.5 after:inset-x-0 hover:border-[var(--sp-border-strong)] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus)]"
        >
          <span className="min-w-0 truncate text-xs font-semibold text-[var(--sp-text-primary)]">{collapsedSeatLabel} selected</span>
          <span className="shrink-0 text-xs font-semibold text-[var(--sp-link)]">View details</span>
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
              className="group flex items-stretch gap-1 border border-transparent transition hover:border-[var(--sp-border-subtle)] hover:bg-[var(--sp-layer-hover)]"
            >
              <button
                type="button"
                data-result-card
                disabled={result.disabled}
                onClick={() => {
                  if (result.seatId) onOpen(result.seatId);
                  else if (result.employeeId && onOpenPerson) onOpenPerson(result.employeeId);
                }}
                title={result.disabled ? "No assigned seat to open" : `Open ${result.title}`}
                className="flex min-w-0 flex-1 items-start gap-2.5 px-2.5 py-2 text-left transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus)] disabled:cursor-not-allowed disabled:opacity-55"
              >
                <span
                  className={[
                    "mt-1 h-2.5 w-2.5 shrink-0 rounded-full",
                    result.status ? STATUS_DOT_CLASS[result.status] : "bg-[var(--sp-border-strong)]"
                  ].join(" ")}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-[var(--sp-text-primary)]">{result.title}</span>
                  <span className="block truncate text-xs font-medium text-[var(--sp-text-helper)]">{formatDisplayName(result.subtitle)}</span>
                </span>
                {result.floorTag && (
                  <span className="mt-0.5 shrink-0 rounded-full border border-[var(--sp-border-subtle)] px-1.5 py-0.5 text-xs font-semibold text-[var(--sp-text-helper)]">
                    {result.floorTag}
                  </span>
                )}
              </button>
              {result.seatId && (
                <button
                  type="button"
                  onClick={() => onShowOnMap(result.seatId as string)}
                  aria-label={`Show ${result.title} on the map`}
                  title={`Show ${result.title} on the map`}
                  className="relative my-1 mr-1 flex shrink-0 items-center self-center whitespace-nowrap rounded-lg border border-[var(--sp-border-subtle)] bg-[var(--sp-layer-01)] px-2.5 py-1 text-xs font-semibold text-[var(--sp-link)] transition after:absolute after:-inset-y-2.5 after:inset-x-0 hover:border-[var(--sp-border-interactive)] hover:bg-[var(--sp-layer-hover)] hover:text-[var(--sp-link-hover)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus)]"
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
          <div className="text-sm font-semibold text-[var(--sp-text-primary)]">{emptyTitle}</div>
          <p className="mt-1 text-xs font-medium leading-5 text-[var(--sp-text-helper)]">{emptyDescription}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {searchActive && (
              <button type="button" onClick={onClearSearch} className="relative rounded-lg border border-[var(--sp-border-strong)] bg-[var(--sp-layer-01)] px-3 py-1.5 text-xs font-semibold text-[var(--sp-text-secondary)] transition after:absolute after:-inset-y-2 after:inset-x-0 hover:border-[var(--sp-border-interactive)] hover:text-[var(--sp-link)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus)]">
                Clear search
              </button>
            )}
            {structuredFiltersActive && (
              <button type="button" onClick={onClearFilters} className="relative rounded-lg border border-[var(--sp-border-strong)] bg-[var(--sp-layer-01)] px-3 py-1.5 text-xs font-semibold text-[var(--sp-text-secondary)] transition after:absolute after:-inset-y-2 after:inset-x-0 hover:border-[var(--sp-border-interactive)] hover:text-[var(--sp-link)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus)]">
                Clear filters
              </button>
            )}
            {searchActive && structuredFiltersActive && (
              <button type="button" onClick={onClearAll} className="relative rounded-lg border border-[var(--sp-border-interactive)] bg-[var(--sp-layer-hover)] px-3 py-1.5 text-xs font-semibold text-[var(--sp-link-hover)] transition after:absolute after:-inset-y-2 after:inset-x-0 hover:border-[var(--sp-interactive)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus)]">
                Clear all
              </button>
            )}
          </div>
        </div>
      )}

      <div className="border-t border-[var(--sp-border-subtle)] px-4 py-2 text-xs font-medium text-[var(--sp-text-helper)]">
        ↑↓ to move · Enter opens · Esc clears
      </div>
    </aside>
  );
}
