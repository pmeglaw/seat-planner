// Floating layer-01 legend card shared by the admin map and the viewer.
// Parents own count computation (counts-follow-filters semantics are pinned
// at the call sites by filter-feedback-source) and pass labels sourced from
// STATUS_LABELS. Positioning is the parent's job; this renders the card only.
import type { ReactNode } from "react";

export type MapLegendEntry = {
  key: string;
  label: string;
  dotClassName: string;
  count: number;
};

export function MapStatusLegend({ ariaLabel, totalLabel, entries, summary, actions }: {
  ariaLabel: string;
  totalLabel: string;
  entries: MapLegendEntry[];
  summary?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="pointer-events-auto flex max-w-[min(56vw,620px)] flex-wrap items-center gap-x-3.5 gap-y-2 border border-[var(--admin-border)] bg-white px-3.5 py-2 shadow-elevation-3">
      <span className="text-[12px] font-semibold text-[var(--sp-color-text-primary)]">{totalLabel}</span>
      <ul aria-label={ariaLabel} className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
        {entries.map(entry => (
          <li key={entry.key} className="flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--sp-color-text-secondary)]">
            <span aria-hidden="true" className={`h-[7px] w-[7px] rounded-full ${entry.dotClassName}`} />
            {entry.label}
            <span className="font-semibold text-[var(--sp-color-text-primary)]">{entry.count}</span>
          </li>
        ))}
      </ul>
      {summary ? <span className="text-[11.5px] text-[var(--sp-color-text-secondary)]">{summary}</span> : null}
      {actions}
    </div>
  );
}
