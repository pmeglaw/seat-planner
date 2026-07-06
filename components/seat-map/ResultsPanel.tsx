"use client";

import { useRef } from "react";
import type { SeatStatus } from "@/lib/types";

export type AdminResultCard = {
  key: string;
  seatId: string | null;
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
  const listRef = useRef<HTMLDivElement | null>(null);

  function moveFocus(direction: 1 | -1) {
    const list = listRef.current;
    if (!list) return;
    const items = Array.from(list.querySelectorAll<HTMLButtonElement>("button[data-result-card]"));
    if (!items.length) return;
    const activeIndex = items.findIndex(item => item === document.activeElement);
    const nextIndex = activeIndex === -1 ? 0 : Math.min(items.length - 1, Math.max(0, activeIndex + direction));
    items[nextIndex]?.focus();
  }

  function handleListKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveFocus(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveFocus(-1);
    }
  }

  const matchSummary = matchCount === 1 ? "1 match" : `${matchCount} matches`;

  return (
    <aside
      aria-labelledby="admin-results-title"
      className="fixed inset-x-3 bottom-3 z-[80] flex max-h-[50vh] flex-col overflow-hidden rounded-[14px] border border-[var(--admin-border)] bg-[var(--admin-surface)] shadow-[0_18px_44px_rgba(31,34,37,0.16)] panel:inset-x-auto panel:bottom-3 panel:right-3 panel:top-[84px] panel:z-40 panel:max-h-none panel:w-[320px] panel:max-w-[calc(100vw-1.5rem)] lg:top-[148px]"
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
          className="mx-2 mt-2 flex shrink-0 items-center justify-between gap-2 rounded-[11px] border border-[var(--admin-border)] bg-[var(--admin-paper)] px-2.5 py-2 text-left transition hover:border-[var(--admin-border-strong)] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus-ring-color)]"
        >
          <span className="min-w-0 truncate text-xs font-semibold text-[var(--admin-text-primary)]">{collapsedSeatLabel} selected</span>
          <span className="shrink-0 text-[11px] font-semibold text-[var(--admin-primary-cta)]">View details</span>
        </button>
      )}

      {results.length > 0 ? (
        <div
          ref={listRef}
          role="list"
          aria-label="Admin search results"
          onKeyDown={handleListKeyDown}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2"
        >
          {results.map(result => (
            <div role="listitem" key={result.key} className="group relative">
              <button
                type="button"
                data-result-card
                disabled={result.disabled}
                onClick={() => result.seatId && onOpen(result.seatId)}
                title={result.disabled ? "No assigned seat to open" : `Open ${result.title}`}
                className="flex w-full items-start gap-2.5 rounded-[11px] border border-transparent px-2.5 py-2 pr-[6.5rem] text-left transition hover:border-[var(--admin-border)] hover:bg-[var(--admin-paper)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus-ring-color)] disabled:cursor-not-allowed disabled:opacity-55"
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
                  <span className="block truncate text-xs font-medium text-[var(--admin-text-muted)]">{result.subtitle}</span>
                </span>
              </button>
              {result.seatId && (
                <button
                  type="button"
                  onClick={() => onShowOnMap(result.seatId as string)}
                  aria-label={`Show ${result.title} on the map`}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-[11px] font-semibold text-[var(--admin-primary-cta)] transition hover:bg-[var(--admin-primary-soft)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus-ring-color)]"
                >
                  Show on map
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="p-4">
          <div className="text-sm font-semibold text-[var(--admin-text-primary)]">{emptyTitle}</div>
          <p className="mt-1 text-xs font-medium leading-5 text-[var(--admin-text-muted)]">{emptyDescription}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {searchActive && (
              <button type="button" onClick={onClearSearch} className="rounded-lg border border-[var(--admin-border-strong)] bg-[var(--admin-surface)] px-3 py-1.5 text-[11px] font-semibold text-[var(--admin-text-secondary)] transition hover:border-[var(--admin-primary-border)] hover:text-[var(--admin-primary-cta)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus-ring-color)]">
                Clear search
              </button>
            )}
            {structuredFiltersActive && (
              <button type="button" onClick={onClearFilters} className="rounded-lg border border-[var(--admin-border-strong)] bg-[var(--admin-surface)] px-3 py-1.5 text-[11px] font-semibold text-[var(--admin-text-secondary)] transition hover:border-[var(--admin-primary-border)] hover:text-[var(--admin-primary-cta)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus-ring-color)]">
                Clear filters
              </button>
            )}
            {searchActive && structuredFiltersActive && (
              <button type="button" onClick={onClearAll} className="rounded-lg border border-[var(--admin-primary-border)] bg-[var(--admin-primary-soft)] px-3 py-1.5 text-[11px] font-semibold text-[var(--admin-primary-cta)] transition hover:border-[var(--admin-primary)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus-ring-color)]">
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
