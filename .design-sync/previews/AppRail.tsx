import type { CSSProperties } from "react";
import { AppRail } from "seat-planner";

// The rail is position:fixed (top offset --admin-chrome-h, bottom 0). Each
// cell wraps it in a transformed container, which becomes the fixed-position
// containing block, and zeroes --admin-chrome-h so the rail fills the frame
// (its AppTopBar normally sits in that 40px band — see the AppShell preview
// for the composed chrome). skewDetector is stubbed so no probe fetches fire.

const idleSkewDetector = { check: async () => false, isSkewed: () => false };
const noop = () => {};

const frame = (width: number): CSSProperties => ({
  position: "relative",
  transform: "translateZ(0)",
  overflow: "hidden",
  width,
  height: 400,
  background: "var(--admin-map-workspace)",
  ["--admin-chrome-h" as never]: "0px"
});

export const CollapsedAdmin = () => (
  <div className="admin-theme" style={frame(260)}>
    <AppRail active="map" open={false} onOpenChange={noop} skewDetector={idleSkewDetector} />
  </div>
);

export const ExpandedAdmin = () => (
  <div className="admin-theme" style={frame(380)}>
    <AppRail active="management" open={true} onOpenChange={noop} skewDetector={idleSkewDetector} />
  </div>
);

export const ViewerModeExpanded = () => (
  <div className="admin-theme" style={frame(380)}>
    <AppRail active="reception" railMode="viewer" open={true} onOpenChange={noop} skewDetector={idleSkewDetector} />
  </div>
);
