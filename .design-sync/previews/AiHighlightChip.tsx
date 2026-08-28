import { AiHighlightChip } from "seat-planner";
import type { ReactNode } from "react";

// Floating "AI · N seats highlighted · Clear" chip. In the app it floats over
// the map canvas while Ask Planner highlights are live, so each cell is an
// admin-theme canvas swatch. seatCount <= 0 renders null — not previewed.

const Cell = ({ label, children }: { label: string; children: ReactNode }) => (
  <div style={{ display: "grid", gap: 4 }}>
    <div
      className="admin-theme"
      style={{
        display: "flex",
        alignItems: "flex-start",
        width: 300,
        minHeight: 72,
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

export const MultipleSeatsHighlighted = () => (
  <Cell label="Ask Planner highlighted 4 seats">
    <AiHighlightChip seatCount={4} onClear={() => {}} />
  </Cell>
);

export const SingleSeatHighlighted = () => (
  <Cell label="single match — singular copy">
    <AiHighlightChip seatCount={1} onClear={() => {}} />
  </Cell>
);
