"use client";

// Floating layer-01 legend card shared by the admin map and the viewer.
// Canvas-chrome redesign (2026-08-13): a vertical card with a collapsible
// body — the header (title + total) stays visible collapsed, and the body
// (entries, summary, actions, footer) unmounts so a collapsed legend leaves
// the a11y tree clean. Parents own count computation (counts-follow-filters
// semantics are pinned at the call sites by filter-feedback-source) and pass
// labels sourced from STATUS_LABELS. Positioning is the parent's job; this
// renders the card only.
import { useState } from "react";
import type { ReactNode } from "react";

export type MapLegendEntry = {
  key: string;
  label: string;
  dotClassName: string;
  count: number;
};

export function MapStatusLegend({ ariaLabel, totalLabel, entries, summary, actions, footer }: {
  ariaLabel: string;
  totalLabel: string;
  entries: MapLegendEntry[];
  summary?: ReactNode;
  actions?: ReactNode;
  /** Surface-owned controls row (e.g. the admin map's Show occupant names toggle). */
  footer?: ReactNode;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="pointer-events-auto w-[188px] border border-[var(--admin-border)] bg-white shadow-elevation-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(current => !current)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-[var(--sp-color-canvas)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-focus)]"
      >
        <span className="text-[12px] font-semibold text-[var(--sp-color-text-primary)]">Legend</span>
        <span className="ml-auto text-[11.5px] font-semibold tabular-nums text-[var(--sp-color-text-secondary)]">{totalLabel}</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className={["h-3 w-3 shrink-0 text-[var(--sp-color-text-secondary)] transition-transform", open ? "" : "-rotate-180"].join(" ")}
        >
          <path d="m5.5 12 4.5-4.5L14.5 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="border-t border-[var(--admin-border)] px-3 py-2">
          <ul aria-label={ariaLabel} className="flex flex-col gap-1.5">
            {entries.map(entry => (
              <li key={entry.key} className="flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--sp-color-text-secondary)]">
                <span aria-hidden="true" className={`h-[7px] w-[7px] shrink-0 rounded-full ${entry.dotClassName}`} />
                <span className="min-w-0 truncate">{entry.label}</span>
                <span className="ml-auto font-semibold tabular-nums text-[var(--sp-color-text-primary)]">{entry.count}</span>
              </li>
            ))}
          </ul>
          {summary ? <p className="mt-2 text-[11.5px] leading-snug text-[var(--sp-color-text-secondary)]">{summary}</p> : null}
          {actions ? <div className="mt-2">{actions}</div> : null}
          {footer ? <div className="mt-2 border-t border-[var(--admin-border)] pt-2">{footer}</div> : null}
        </div>
      )}
    </div>
  );
}
