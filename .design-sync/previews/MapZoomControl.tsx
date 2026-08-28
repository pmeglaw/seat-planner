import { MapZoomControl } from "seat-planner";
import type { ReactNode } from "react";

// Bottom-right map zoom cluster. The label is the live zoom readout
// (SeatMap passes "Fit" in overview mode, "125%" etc. when zoomed).

const noop = () => {};

const Cell = ({ label, children }: { label: string; children: ReactNode }) => (
  <div style={{ display: "grid", gap: 4 }}>
    <div
      className="admin-theme"
      style={{
        display: "flex",
        alignItems: "flex-start",
        width: 140,
        minHeight: 160,
        background: "var(--sp-background)",
        border: "1px solid #E7E1D8",
        padding: 16
      }}
    >
      {children}
    </div>
    <span style={{ fontSize: 11, color: "#6b6257", fontFamily: "var(--font-mono)" }}>{label}</span>
  </div>
);

export const FitToView = () => (
  <Cell label="overview — Fit label">
    <MapZoomControl label="Fit" onZoomIn={noop} onZoomOut={noop} onFit={noop} zoomOutDisabled />
  </Cell>
);

export const ZoomedIn = () => (
  <Cell label="zoomed to 125%">
    <MapZoomControl label="125%" onZoomIn={noop} onZoomOut={noop} onFit={noop} />
  </Cell>
);

export const MaxZoom = () => (
  <Cell label="ceiling — zoom in disabled">
    <MapZoomControl label="200%" onZoomIn={noop} onZoomOut={noop} onFit={noop} zoomInDisabled />
  </Cell>
);
