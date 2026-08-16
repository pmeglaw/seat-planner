import { SeatMarker } from "seat-planner";
import type { ReactNode } from "react";

// SeatMarker positions itself absolutely, centered on its parent (the map
// layer normally anchors it at seat.x/y). Each cell below is its own
// relative anchor so one marker state renders per cell.

const employee = (id: string, name: string, position: string, department: string) => ({
  id,
  full_name: name,
  position,
  department,
  phone_extension: "204",
  email: null,
  avatar_url: null,
  active: true,
  created_at: "2026-01-05T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z"
});

const seat = (
  id: string,
  label: string,
  status: "available" | "assigned" | "reserved" | "unavailable",
  emp: ReturnType<typeof employee> | null
) => ({
  id,
  seat_key: id,
  label,
  x: 0.5,
  y: 0.5,
  status,
  layer: "draft" as const,
  employee_id: emp?.id ?? null,
  zone: "North Wing",
  department: emp?.department ?? null,
  notes: null,
  is_custom: false,
  created_at: "2026-01-05T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z",
  employee: emp
});

const base = {
  selected: false,
  dimmed: false,
  canEdit: false,
  showNames: true,
  searchResult: false,
  compactNameLabel: false,
  swapMode: false,
  swapSource: false,
  swapTarget: false,
  moveEmployeeMode: false,
  moveEmployeeSource: false,
  highlighted: false,
  addSeatMode: false,
  viewportEdge: "none" as const,
  viewportEdgeOffsetPx: 0,
  onSelect: () => {}
};

const Cell = ({ label, children }: { label: string; children: ReactNode }) => (
  <div style={{ display: "grid", gap: 4, justifyItems: "center" }}>
    <div
      style={{
        position: "relative",
        width: 130,
        height: 96,
        background: "var(--sp-color-brand-paper, #F4EFE7)",
        border: "1px solid #E7E1D8"
      }}
    >
      {children}
    </div>
    <span style={{ fontSize: 11, color: "#6b6257", fontFamily: "var(--font-mono)" }}>{label}</span>
  </div>
);

const anahit = employee("e1", "Anahit Petrosyan", "Senior Paralegal", "Litigation");
const marcus = employee("e2", "Marcus Webb", "Associate Attorney", "Intake");

export const CoreStates = () => (
  <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
    <Cell label="assigned">
      <SeatMarker {...base} seat={seat("s1", "A-12", "assigned", anahit)} />
    </Cell>
    <Cell label="available">
      <SeatMarker {...base} seat={seat("s2", "A-13", "available", null)} />
    </Cell>
    <Cell label="reserved">
      <SeatMarker {...base} seat={seat("s3", "A-14", "reserved", null)} />
    </Cell>
    <Cell label="unavailable">
      <SeatMarker {...base} seat={seat("s4", "A-15", "unavailable", null)} />
    </Cell>
  </div>
);

export const SelectionAndEditing = () => (
  <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
    <Cell label="selected">
      <SeatMarker {...base} selected canEdit seat={seat("s5", "B-01", "assigned", marcus)} />
    </Cell>
    <Cell label="draft changed">
      <SeatMarker {...base} canEdit draftChanged seat={seat("s6", "B-02", "assigned", anahit)} />
    </Cell>
    <Cell label="dimmed">
      <SeatMarker {...base} dimmed seat={seat("s7", "B-03", "assigned", marcus)} />
    </Cell>
    <Cell label="search result">
      <SeatMarker {...base} searchResult seat={seat("s8", "B-04", "assigned", anahit)} />
    </Cell>
  </div>
);

export const SwapAndHighlight = () => (
  <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
    <Cell label="swap source">
      <SeatMarker {...base} swapMode swapSource canEdit seat={seat("s9", "C-01", "assigned", anahit)} />
    </Cell>
    <Cell label="swap target">
      <SeatMarker {...base} swapMode swapTarget canEdit seat={seat("s10", "C-02", "assigned", marcus)} />
    </Cell>
    <Cell label="AI highlighted">
      <SeatMarker
        {...base}
        highlighted
        highlightedDescription="Closest open seat to the copy room"
        seat={seat("s11", "C-03", "available", null)}
      />
    </Cell>
    <Cell label="viewer variant">
      <SeatMarker {...base} variant="viewer" seat={seat("s12", "C-04", "assigned", marcus)} />
    </Cell>
  </div>
);
