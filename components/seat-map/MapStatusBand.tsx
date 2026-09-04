"use client";

// The 40px status band under the canvas (DECISIONS D1-g; PHASE3DS §1.21
// `.sp-band`; Phase 4 PR 3a): title · legend (the Phase 3 marks, following
// the Names toggle — P3-13) · count (zero included) with the filtered map's
// verbs and the cross-floor hint · zoom / fit as 32px controls. It spans the
// canvas, not the slot. Parents own count computation (counts follow every
// active constraint — filter-feedback-source pins the call sites) and tier
// gating: the band renders only from the sm tier up and yields to the
// bottom sheets below the panel tier.
//
// A roster floor has no map to summarise: with no entries the band renders
// the TITLE alone — no list, no controls seam (Hidden tier, never disabled).
// Below `lg` on /admin the note line reads "Editing needs a wider window."
// (D2, deviation 4: read-only, not disabled).
import type { ReactNode } from "react";
import { SeatMark, type SeatMarkKind } from "@/components/seat-map/SeatMark";

export type MapLegendEntry = {
  key: string;
  label: string;
  mark: SeatMarkKind;
  count: number;
};

export function MapStatusBand({ ariaLabel, totalLabel, entries, namesVisible = true, count, actions, note, noteAction, controls }: {
  ariaLabel: string;
  totalLabel: string;
  entries: MapLegendEntry[];
  /** The legend follows the Names toggle: assigned = mini pill on, ● off (P3-13). */
  namesVisible?: boolean;
  /** "68 seats" / "22 of 68 seats match" / "0 of 68 seats match" — zero included. */
  count?: string;
  /** Surface-owned verbs after the count (Clear filters, Fit matches). */
  actions?: ReactNode;
  /** The cross-floor hint or the read-only line. */
  note?: string;
  noteAction?: ReactNode;
  /** Surface-owned right cluster (zoom / fit) — absent on a roster floor. */
  controls?: ReactNode;
}) {
  const hasEntries = entries.length > 0;
  return (
    <div data-map-status-band className="sp-band">
      {/* Focusable labelled group, not a bare div: at rest the region holds
          only text, so without tabindex a keyboard user could never scroll
          clipped counts into view (axe scrollable-region-focusable — the
          e2e-auth viewer scan caught exactly this). The overflow-x-auto is
          the safety valve that makes clipping impossible at any band width. */}
      <div
        data-band-scroll-region
        role="group"
        aria-label={ariaLabel}
        tabIndex={0}
        className="flex min-w-0 flex-1 items-center gap-[var(--sp-space-05)] overflow-x-auto [scrollbar-width:thin] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--sp-focus)]"
      >
        <span className="sp-band-title">{totalLabel}</span>
        {hasEntries && (
          <ul aria-label={ariaLabel} className="sp-band-legend">
            {entries.map(entry => (
              <li key={entry.key} className="sp-seat-legend">
                <SeatMark kind={entry.mark === "assigned" && !namesVisible ? "assigned-dot" : entry.mark} />
                {entry.label} <span className="tabular-nums">{entry.count}</span>
              </li>
            ))}
          </ul>
        )}
        {count ? <span className="sp-band-count">{count}</span> : null}
        {actions ?? null}
        {note ? <span className="sp-band-note">{note}</span> : null}
        {noteAction ?? null}
      </div>
      {controls ? <span className="sp-band-zoom">{controls}</span> : null}
    </div>
  );
}
