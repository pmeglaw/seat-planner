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
    // The band is a CSS SIZE CONTAINER: its optional pieces (title/total,
    // summary — .map-status-band-* in globals.css) key on the band's own
    // width, never the viewport's. Viewport media queries cannot see that a
    // docked results panel took 332px of the stage, so md:/lg: tiers clipped
    // the controls exactly there (CodeRabbit on #408, confirmed by measure:
    // a filtered admin row is ~790px against a 640px floor).
    <div
      data-map-status-band
      className="relative z-30 flex h-10 shrink-0 items-center border-t border-[var(--admin-border)] bg-[var(--admin-surface)] [container-type:inline-size]"
    >
      {/* Everything informational scrolls; the controls never do. The
          overflow-x-auto is the safety valve that makes clipping impossible
          at ANY band width — the counts and the filter verbs stay reachable
          by scroll and by keyboard (focus auto-scrolls into view) even in the
          worst case (five entries + actions in a 640px stage). The summary
          truncates instead of scrolling: prose is the one piece that may
          shorten, verbs and counts are not. */}
      {/* Focusable labelled group, not a bare div: at rest the region holds
          only text, so without tabindex a keyboard user could never scroll
          clipped counts into view (axe scrollable-region-focusable, serious —
          the e2e-auth viewer scan caught exactly this). Focused, the region
          scrolls natively with the arrow keys; the ul inside keeps its own
          list semantics and shares the accessible name by design. */}
      <div
        data-band-scroll-region
        role="group"
        aria-label={ariaLabel}
        tabIndex={0}
        className="flex min-w-0 flex-1 items-center gap-2.5 overflow-x-auto px-3 [scrollbar-width:thin] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-focus)] md:gap-3"
      >
        <span className="map-status-band-wide shrink-0 text-[12px] font-semibold text-[var(--sp-color-text-primary)]">Legend</span>
        <span className="map-status-band-wide shrink-0 text-[11.5px] font-semibold tabular-nums text-[var(--sp-color-text-secondary)]">{totalLabel}</span>
        <span aria-hidden="true" className="map-status-band-wide h-5 w-px shrink-0 bg-[var(--admin-border)]" />
        <ul aria-label={ariaLabel} className="flex shrink-0 items-center gap-2.5 md:gap-3.5">
          {entries.map(entry => (
            <li key={entry.key} className="flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--sp-color-text-secondary)]">
              <span aria-hidden="true" className={`h-[7px] w-[7px] shrink-0 rounded-full ${entry.dotClassName}`} />
              <span className="whitespace-nowrap">{entry.label}</span>
              <span className="tabular-nums text-[var(--sp-color-text-primary)]">{entry.count}</span>
            </li>
          ))}
        </ul>
        {summary ? (
          <>
            <span aria-hidden="true" className="map-status-band-widest h-5 w-px shrink-0 bg-[var(--admin-border)]" />
            <p className="map-status-band-widest min-w-0 truncate text-[11.5px] text-[var(--sp-color-text-secondary)]">{summary}</p>
          </>
        ) : null}
        {/* Actions stay present at every band width (unlike the prose
            summary): Fit matches / Clear are the filtered map's verbs. */}
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      {/* border-l draws the seam the scroll boundary otherwise lacks — under
          overflow, clipped content butts straight against these controls. */}
      <div className="flex shrink-0 items-center gap-3 border-l border-[var(--admin-border)] pl-3 pr-3 md:gap-4">{controls}</div>
    </div>
  );
}
