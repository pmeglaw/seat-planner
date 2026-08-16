import type { CSSProperties, RefObject } from "react";
import { AppTopBar } from "seat-planner";

// Static chrome states. The left/center/right slot divs are portal targets
// that SeatMap fills at runtime — previews show them empty (the bar's own
// base composition). The skip link is sr-only until focused, so it does not
// paint. railToggleRef only receives focus on rail dismissal — an inert ref
// object is enough for a static render.

const inertRef = { current: null } as unknown as RefObject<HTMLButtonElement>;
const noopSlot = () => {};
const noopToggle = () => {};

const frame: CSSProperties = { width: "100%" };
const canvasBelow: CSSProperties = { height: 48, background: "var(--admin-bg)" };

export const ManagementSection = () => (
  <div className="admin-theme" style={frame}>
    <AppTopBar
      active="management"
      email="patrick@megeredchianlaw.com"
      roleLabel="Admin"
      skipLink={{ href: "#admin-subpage-main", label: "Skip to content" }}
      onSlotElement={noopSlot}
      railOpen={false}
      onToggleRail={noopToggle}
      railToggleRef={inertRef}
    />
    <div style={canvasBelow} />
  </div>
);

export const MapSurface = () => (
  <div className="admin-theme" style={frame}>
    <AppTopBar
      active="map"
      email="patrick@megeredchianlaw.com"
      roleLabel="Admin"
      skipLink={{ href: "#planning-canvas", label: "Skip to seat map" }}
      onSlotElement={noopSlot}
      railOpen={true}
      onToggleRail={noopToggle}
      railToggleRef={inertRef}
    />
    <div style={canvasBelow} />
  </div>
);

export const ReceptionForViewer = () => (
  <div className="admin-theme" style={frame}>
    <AppTopBar
      active="reception"
      email="anahit.petrosyan@megeredchianlaw.com"
      roleLabel="Viewer"
      skipLink={{ href: "#reception-main", label: "Skip to content" }}
      onSlotElement={noopSlot}
      railOpen={false}
      onToggleRail={noopToggle}
      railToggleRef={inertRef}
    />
    <div style={canvasBelow} />
  </div>
);
