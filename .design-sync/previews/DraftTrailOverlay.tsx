import { DraftTrailOverlay } from "seat-planner";
import type { ReactNode } from "react";

// DraftTrailOverlay draws the animated copper route between the two seats of
// a pending swap/move. It renders into a fixed 0 0 1000 H viewBox that
// shares the map frame's box, so each cell is a relative frame at the plan's
// ~2.2:1 aspect (svg preserveAspectRatio="none" fills it), wrapped in
// .admin-theme so --sp-trail resolves. The small anchor dots are
// cell scaffolding standing in for the seat markers the trail runs between.
const Anchor = ({ x, y }: { x: number; y: number }) => (
  <span
    aria-hidden="true"
    style={{
      position: "absolute",
      left: `${x * 100}%`,
      top: `${y * 100}%`,
      width: 14,
      height: 14,
      transform: "translate(-50%, -50%)",
      borderRadius: "50%",
      background: "#FFFFFF",
      border: "2px solid var(--sp-status-success-mark, #1D6E41)",
      zIndex: 10
    }}
  />
);

const Frame = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="admin-theme" style={{ display: "grid", gap: 6 }}>
    <div
      style={{
        position: "relative",
        width: 640,
        height: 290,
        maxWidth: "100%",
        background: "var(--sp-map-mat, #ECE8E0)",
        border: "1px solid #E7E1D8"
      }}
    >
      {children}
    </div>
    <span style={{ fontSize: 11, color: "#6b6257", fontFamily: "var(--font-mono)" }}>{label}</span>
  </div>
);

// Visual (calibration-transformed) coordinates in [0,1] — the same points
// the markers anchor to.
const seatA12 = { id: "seat-a12", x: 0.24, y: 0.34 };
const seatC04 = { id: "seat-c04", x: 0.68, y: 0.66 };
const seatB01 = { id: "seat-b01", x: 0.18, y: 0.72 };
const seatB07 = { id: "seat-b07", x: 0.82, y: 0.26 };
const seatN13 = { id: "seat-n13", x: 0.42, y: 0.4 };
const seatN14 = { id: "seat-n14", x: 0.56, y: 0.46 };

export const SwapTrail = () => (
  <Frame label="swap pending — A-12 ⇄ C-04 (two mirrored arcs, arrowhead each)">
    <DraftTrailOverlay kind="swap" sourceSeat={seatA12} targetSeat={seatC04} />
    <Anchor x={seatA12.x} y={seatA12.y} />
    <Anchor x={seatC04.x} y={seatC04.y} />
  </Frame>
);

export const MoveTrail = () => (
  <Frame label="move pending — B-01 → B-07 (single route, dashed origin ring)">
    <DraftTrailOverlay kind="move" sourceSeat={seatB01} targetSeat={seatB07} />
    <Anchor x={seatB01.x} y={seatB01.y} />
    <Anchor x={seatB07.x} y={seatB07.y} />
  </Frame>
);

export const ShortHopSwap = () => (
  <Frame label="adjacent-seat swap — N13 ⇄ N14 (loop cap keeps the bow tight)">
    <DraftTrailOverlay kind="swap" sourceSeat={seatN13} targetSeat={seatN14} />
    <Anchor x={seatN13.x} y={seatN13.y} />
    <Anchor x={seatN14.x} y={seatN14.y} />
  </Frame>
);
