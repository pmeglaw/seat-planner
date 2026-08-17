"use client";

// The viewer's in-flow bottom status band (Option A, owner-picked 2026-08-17):
// the ONE home for legend counts, the match summary, the names switch and the
// zoom cluster from the sm tier up. It replaced the viewer's floating
// MapStatusLegend card + floating zoom stack; the admin map keeps its floating
// legend. Parents own count computation (counts-follow-filters semantics stay
// pinned at the call site by filter-feedback-source) and tier gating: the band
// renders only >=640, and below the panel tier it yields to the inspector
// bottom sheet (ViewerSeatFinder owns both decisions — this renders the row).
import type { ReactNode } from "react";
import type { MapLegendEntry } from "@/components/seat-map/MapStatusLegend";

export function ViewerStatusBand({ ariaLabel, totalLabel, entries, summary, controls }: {
  ariaLabel: string;
  totalLabel: string;
  entries: MapLegendEntry[];
  summary?: ReactNode;
  /** Surface-owned right cluster (names switch, zoom) — rendered ml-auto. */
  controls?: ReactNode;
}) {
  return (
    <div
      data-viewer-status-band
      className="relative z-30 flex h-10 shrink-0 items-center gap-2.5 border-t border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 md:gap-3"
    >
      {/* Title + total yield below md: the sm..md band (640-767px) cannot fit
          the full row — measured ~710px against a 640px floor, and the shell's
          overflow-x-clip would silently cut the RIGHT cluster (the controls),
          not this label. The counts list itself is never hidden. */}
      <span className="hidden shrink-0 text-[12px] font-semibold text-[var(--sp-color-text-primary)] md:block">Legend</span>
      <span className="hidden shrink-0 text-[11.5px] font-semibold tabular-nums text-[var(--sp-color-text-secondary)] md:block">{totalLabel}</span>
      <span aria-hidden="true" className="hidden h-5 w-px shrink-0 bg-[var(--admin-border)] md:block" />
      <ul aria-label={ariaLabel} className="flex shrink-0 items-center gap-2.5 md:gap-3.5">
        {entries.map(entry => (
          <li key={entry.key} className="flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--sp-color-text-secondary)]">
            <span aria-hidden="true" className={`h-[7px] w-[7px] shrink-0 rounded-full ${entry.dotClassName}`} />
            <span>{entry.label}</span>
            <span className="tabular-nums text-[var(--sp-color-text-primary)]">{entry.count}</span>
          </li>
        ))}
      </ul>
      {summary ? (
        <>
          <span aria-hidden="true" className="hidden h-5 w-px shrink-0 bg-[var(--admin-border)] lg:block" />
          {/* Truncating min-w-0 paragraph, hidden below lg: at tablet widths the
              counts + controls own the row and prose would force overflow. */}
          <p className="hidden min-w-0 truncate text-[11.5px] text-[var(--sp-color-text-secondary)] lg:block">{summary}</p>
        </>
      ) : null}
      <div className="ml-auto flex shrink-0 items-center gap-3 md:gap-4">{controls}</div>
    </div>
  );
}
