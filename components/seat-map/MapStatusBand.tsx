"use client";

// The shared in-flow bottom status band (Option A, owner-picked 2026-08-17):
// the ONE home for legend counts, the match summary, filter actions, the names
// switch and the zoom cluster from the sm tier up. The viewer shipped it first
// (v1.45.0, replacing its floating MapStatusLegend card + zoom stack); the
// admin map renders the same band with its extra entries (unavailable,
// draft-changed) and filter actions. Parents own count computation
// (counts-follow-filters semantics stay pinned at the call sites by
// filter-feedback-source) and tier gating: the band renders only >=640, and
// below the panel tier it yields to the bottom sheets (each surface owns both
// decisions — this renders the row). MapStatusLegend itself stays alive for
// the .design-sync previews; no app surface mounts it any more.
import type { ReactNode } from "react";
import type { MapLegendEntry } from "@/components/seat-map/MapStatusLegend";

export function MapStatusBand({ ariaLabel, totalLabel, entries, summary, actions, controls }: {
  ariaLabel: string;
  totalLabel: string;
  entries: MapLegendEntry[];
  summary?: ReactNode;
  /** Surface-owned inline cluster after the summary (admin: Fit matches / Clear). */
  actions?: ReactNode;
  /** Surface-owned right cluster (names switch, zoom) — rendered ml-auto. */
  controls?: ReactNode;
}) {
  return (
    <div
      data-map-status-band
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
      {/* Actions stay visible at every band width (unlike the prose summary):
          Fit matches / Clear are the filtered map's verbs, not commentary. */}
      {actions ? <div className="shrink-0">{actions}</div> : null}
      <div className="ml-auto flex shrink-0 items-center gap-3 md:gap-4">{controls}</div>
    </div>
  );
}
