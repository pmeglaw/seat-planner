import { NamesVisibilityToggle } from "seat-planner";
import type { ReactNode } from "react";

// The one "Show occupant names" switch both map surfaces share (admin SeatMap
// status band and kebab, viewer band). The track is always visible so the
// state reads in BOTH positions — that is the whole point of the control.

const Cell = ({ label, children }: { label: string; children: ReactNode }) => (
  <div style={{ display: "grid", gap: 4 }}>
    <div
      className="admin-theme"
      style={{
        display: "flex",
        width: 232,
        background: "var(--admin-surface)",
        border: "1px solid #E7E1D8",
        padding: "10px 12px"
      }}
    >
      {children}
    </div>
    <span style={{ fontSize: 11, color: "#6b6257", fontFamily: "var(--font-mono)" }}>{label}</span>
  </div>
);

export const On = () => (
  <Cell label="on — names drawn on the map">
    <NamesVisibilityToggle pressed onToggle={() => {}} />
  </Cell>
);

export const Off = () => (
  <Cell label="off — markers only">
    <NamesVisibilityToggle pressed={false} onToggle={() => {}} />
  </Cell>
);
