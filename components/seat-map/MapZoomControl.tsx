"use client";

// The map's zoom cluster. Zoom is a presentation transform on the map
// container only — it never writes to or recomputes stored seat coordinates
// or the calibration transform.
//
// Two orientations, one behaviour: "horizontal" is the band's 32px cluster
// (PHASE3DS §1.21: − · Fit · +, the asset's small icon / ghost buttons —
// Reset zoom lives here, never in an overflow menu, D2-b); "vertical" is the
// phone-only floating stack below the band tier. Group role, names and
// disabled semantics are identical in both.
import { FitIcon, MinusIcon, PlusIcon } from "@/components/seat-map/mapIcons";

type MapZoomControlProps = {
  label: string;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  zoomInDisabled?: boolean;
  zoomOutDisabled?: boolean;
  orientation?: "vertical" | "horizontal";
};

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
  return (
    <div
      role="group"
      aria-label="Map zoom"
      className={horizontal
        ? "flex items-center"
        : "pointer-events-auto flex flex-col bg-[var(--sp-layer-01)] shadow-[inset_0_0_0_1px_var(--sp-border-subtle)]"}
    >
      {/* The zoom level is announced, not shown — the band has no room for a
          readout and Fit is the reset (owner: reset zoom stays on the canvas). */}
      <span aria-live="polite" className="sr-only">{label}</span>
      <button type="button" onClick={onZoomOut} disabled={zoomOutDisabled} aria-label="Zoom out" className="cds-btn cds-btn--icon cds-btn--sm">
        <MinusIcon />
      </button>
      <button type="button" onClick={onFit} aria-label="Fit map to view" className="cds-btn cds-btn--ghost cds-btn--sm">
        {horizontal ? "Fit" : <FitIcon />}
      </button>
      <button type="button" onClick={onZoomIn} disabled={zoomInDisabled} aria-label="Zoom in" className="cds-btn cds-btn--icon cds-btn--sm">
        <PlusIcon />
      </button>
    </div>
  );
}
