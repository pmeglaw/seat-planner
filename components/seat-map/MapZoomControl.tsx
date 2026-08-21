"use client";

// Bottom-right map zoom cluster (redesign spec §4). Zoom is a presentation
// transform on the map container only — it never writes to or recomputes
// stored seat coordinates or the calibration transform.
//
// Two orientations, one behavior: "vertical" is the floating stack (admin map
// at every width; viewer phones), "horizontal" is the row the viewer's status
// band embeds from the sm tier up. Group role, labels and disabled semantics
// are identical in both — orientation only changes layout classes.
type MapZoomControlProps = {
  label: string;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  zoomInDisabled?: boolean;
  zoomOutDisabled?: boolean;
  orientation?: "vertical" | "horizontal";
};

const zoomButtonBaseClass =
  "flex items-center justify-center bg-[var(--sp-layer-01)] text-[15px] leading-none text-[var(--sp-text-primary)] transition hover:bg-[var(--sp-background)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-focus)] disabled:cursor-not-allowed disabled:text-[var(--sp-text-helper)] disabled:hover:bg-[var(--sp-layer-01)]";

export function MapZoomControl({
  label,
  onZoomIn,
  onZoomOut,
  onFit,
  zoomInDisabled = false,
  zoomOutDisabled = false,
  orientation = "vertical"
}: MapZoomControlProps) {
  const horizontal = orientation === "horizontal";
  const zoomButtonClass = horizontal
    ? `${zoomButtonBaseClass} h-7 w-7 border-r border-[var(--sp-border-subtle)] last:border-r-0`
    : `${zoomButtonBaseClass} h-8 w-8 border-b border-[var(--sp-border-subtle)] last:border-b-0`;

  return (
    <div
      role="group"
      aria-label="Map zoom"
      className={horizontal
        // In-band row: flat border, no elevation — the band is layer-00 chrome.
        ? "pointer-events-auto flex items-center border border-[var(--sp-border-subtle)] bg-[var(--sp-layer-01)]"
        : "pointer-events-auto flex flex-col border border-[var(--sp-border-subtle)] bg-[var(--sp-layer-01)] shadow-elevation-2"}
    >
      <span
        aria-live="polite"
        className={horizontal
          ? "min-w-[36px] border-r border-[var(--sp-border-subtle)] px-2 py-1 text-center font-mono text-[10.5px] tabular-nums text-[var(--sp-text-secondary)]"
          : "border-b border-[var(--sp-border-subtle)] px-1 py-1 text-center font-mono text-[10.5px] tabular-nums text-[var(--sp-text-secondary)]"}
      >
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
