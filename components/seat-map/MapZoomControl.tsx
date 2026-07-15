"use client";

// Bottom-right map zoom cluster (redesign spec §4). Zoom is a presentation
// transform on the map container only — it never writes to or recomputes
// stored seat coordinates or the calibration transform.
type MapZoomControlProps = {
  label: string;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  zoomInDisabled?: boolean;
  zoomOutDisabled?: boolean;
};

const zoomButtonClass =
  "flex h-8 w-8 items-center justify-center border-b border-[var(--admin-border)] bg-[var(--admin-surface)] text-[15px] leading-none text-[var(--admin-text-primary)] transition last:border-b-0 hover:bg-[var(--admin-surface-alt)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-focus)] disabled:cursor-not-allowed disabled:text-[var(--admin-text-subtle)] disabled:hover:bg-[var(--admin-surface)]";

export function MapZoomControl({
  label,
  onZoomIn,
  onZoomOut,
  onFit,
  zoomInDisabled = false,
  zoomOutDisabled = false
}: MapZoomControlProps) {
  return (
    <div
      role="group"
      aria-label="Map zoom"
      className="pointer-events-auto flex flex-col border border-[var(--admin-border)] bg-[var(--admin-surface)] shadow-elevation-2"
    >
      <span aria-live="polite" className="border-b border-[var(--admin-border)] px-1 py-1 text-center font-mono text-[10.5px] tabular-nums text-[var(--admin-text-secondary)]">
        {label}
      </span>
      <button type="button" onClick={onZoomIn} disabled={zoomInDisabled} aria-label="Zoom in" title="Zoom in" className={zoomButtonClass}>
        +
      </button>
      <button type="button" onClick={onZoomOut} disabled={zoomOutDisabled} aria-label="Zoom out" title="Zoom out" className={zoomButtonClass}>
        −
      </button>
      <button type="button" onClick={onFit} aria-label="Fit map to view" title="Fit to view" className={zoomButtonClass}>
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5">
          <path d="M7 3.5H3.5V7M13 3.5h3.5V7M7 16.5H3.5V13M13 16.5h3.5V13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}
