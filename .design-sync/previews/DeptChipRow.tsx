import { DeptChipRow } from "seat-planner";
import type { ReactNode } from "react";

// Quick department filter chips floating on the map canvas. Counts come from
// the parent (faceted, filter-aware); "all" means the facet is clear.

const DEPARTMENTS = ["Litigation", "Intake", "Estate Planning", "Records"];
const COUNTS: Record<string, number> = {
  Litigation: 18,
  Intake: 9,
  "Estate Planning": 6,
  Records: 4,
  "Workers' Compensation": 7,
  Administration: 3
};

const Cell = ({ label, width = 520, children }: { label: string; width?: number; children: ReactNode }) => (
  <div style={{ display: "grid", gap: 4 }}>
    <div
      className="admin-theme"
      style={{
        width,
        minHeight: 64,
        background: "var(--admin-bg)",
        border: "1px solid #E7E1D8",
        padding: 16
      }}
    >
      {children}
    </div>
    <span style={{ fontSize: 11, color: "#6b6257", fontFamily: "var(--font-mono)" }}>{label}</span>
  </div>
);

export const AllDepartments = () => (
  <Cell label="facet clear — every chip neutral">
    <DeptChipRow departments={DEPARTMENTS} counts={COUNTS} activeDepartment="all" onSelectDepartment={() => {}} />
  </Cell>
);

export const LitigationPinned = () => (
  <Cell label="Litigation active (click again clears)">
    <DeptChipRow departments={DEPARTMENTS} counts={COUNTS} activeDepartment="Litigation" onSelectDepartment={() => {}} />
  </Cell>
);

export const CrowdedRowWraps = () => (
  <Cell label="six departments — wraps, long name truncates" width={430}>
    <DeptChipRow
      departments={[...DEPARTMENTS, "Workers' Compensation", "Administration"]}
      counts={COUNTS}
      activeDepartment="all"
      onSelectDepartment={() => {}}
    />
  </Cell>
);
