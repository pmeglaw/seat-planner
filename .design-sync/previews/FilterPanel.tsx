import { FilterPanel } from "seat-planner";
import { createRef } from "react";
import type { ReactNode } from "react";

// Compact dark filter menu anchored under the chrome bar's Filter button —
// content only, the caller's wrapper owns positioning and width. Cells size
// it like its in-app popover slot (~320px) over the map canvas.

const returnFocusRef = createRef<HTMLButtonElement>();
const noop = () => {};

const DEPARTMENTS = ["Litigation", "Intake", "Estate Planning", "Records"];
const POSITIONS = ["Associate Attorney", "Case Manager", "Legal Assistant", "Receptionist", "Senior Paralegal"];
const ZONES = ["North Wing", "South Wing", "Reception", "Records Annex"];

const Cell = ({ label, children }: { label: string; children: ReactNode }) => (
  <div style={{ display: "grid", gap: 4 }}>
    <div
      className="admin-theme"
      style={{
        width: 344,
        background: "var(--admin-bg)",
        border: "1px solid #E7E1D8",
        padding: 12
      }}
    >
      {children}
    </div>
    <span style={{ fontSize: 11, color: "#6b6257", fontFamily: "var(--font-mono)" }}>{label}</span>
  </div>
);

export const DefaultOpen = () => (
  <Cell label="fresh open — no facets, zone hover preview wired">
    <FilterPanel
      department="all"
      position="all"
      zone="all"
      status="all"
      departments={DEPARTMENTS}
      positions={POSITIONS}
      zones={ZONES}
      activeChips={[]}
      returnFocusRef={returnFocusRef}
      onClose={noop}
      onDepartmentChange={noop}
      onPositionChange={noop}
      onZoneChange={noop}
      onZoneHoverChange={() => {}}
      onStatusChange={noop}
      onRemoveActiveChip={noop}
      onClearFilters={noop}
      matchSummary="42 of 42 seats match"
    />
  </Cell>
);

export const FilteredWithChips = () => (
  <Cell label="three facets pinned — chips + Clear all + live count">
    <FilterPanel
      department="Litigation"
      position="all"
      zone="North Wing"
      status="assigned"
      departments={DEPARTMENTS}
      positions={POSITIONS}
      zones={ZONES}
      activeChips={[
        { id: "department", label: "Department", value: "Litigation", removeLabel: "Remove department filter Litigation" },
        { id: "zone", label: "Zone", value: "North Wing", removeLabel: "Remove zone filter North Wing" },
        { id: "status", label: "Status", value: "Assigned", removeLabel: "Remove status filter Assigned" }
      ]}
      returnFocusRef={returnFocusRef}
      onClose={noop}
      onDepartmentChange={noop}
      onPositionChange={noop}
      onZoneChange={noop}
      onStatusChange={noop}
      onRemoveActiveChip={noop}
      onClearFilters={noop}
      matchSummary="9 of 42 seats match"
    />
  </Cell>
);

export const SearchChipHidden = () => (
  <Cell label="search chip filtered out — one facet, no Clear all">
    <FilterPanel
      department="all"
      position="Case Manager"
      zone="all"
      status="all"
      departments={DEPARTMENTS}
      positions={POSITIONS}
      zones={ZONES}
      activeChips={[
        { id: "search", label: "Search", value: "Sona", removeLabel: "Remove search filter Sona" },
        { id: "position", label: "Position", value: "Case Manager", removeLabel: "Remove position filter Case Manager" }
      ]}
      returnFocusRef={returnFocusRef}
      onClose={noop}
      onDepartmentChange={noop}
      onPositionChange={noop}
      onZoneChange={noop}
      onStatusChange={noop}
      onRemoveActiveChip={noop}
      onClearFilters={noop}
      matchSummary="4 of 42 seats match"
    />
  </Cell>
);
