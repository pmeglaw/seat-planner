"use client";

// Canvas-chrome redesign (2026-08-13): quick department filter chips floating
// on the map canvas next to the Filters trigger. Presentational — the parent
// computes the counts (departmentChipCounts in lib/seatFilters, faceted and
// filter-aware so a chip number never contradicts the map) and owns the
// department facet state. The one behavior this component owns is the
// single-toggle rule: clicking the active chip clears the facet back to "all".
import { FILTER_ALL } from "@/lib/seatFilters";

type DeptChipRowProps = {
  departments: string[];
  counts: Record<string, number>;
  /** The active department facet value, or "all" when the facet is clear. */
  activeDepartment: string;
  onSelectDepartment: (department: string) => void;
};

export function DeptChipRow({ departments, counts, activeDepartment, onSelectDepartment }: DeptChipRowProps) {
  if (!departments.length) return null;

  return (
    <div role="group" aria-label="Department filters" className="flex flex-wrap items-center gap-1.5">
      {departments.map(department => {
        const active = department === activeDepartment;
        return (
          <button
            key={department}
            type="button"
            aria-pressed={active}
            onClick={() => onSelectDepartment(active ? FILTER_ALL : department)}
            className={[
              "flex h-8 items-center gap-1.5 border px-2.5 text-[12px] font-semibold shadow-elevation-3 transition active:scale-[0.97] active:duration-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)]",
              active
                ? "border-[var(--admin-primary)] bg-[var(--admin-primary-soft)] text-[var(--admin-primary-on-soft)]"
                : "border-[var(--sp-border-subtle)] bg-[var(--sp-layer-01)] text-[var(--sp-text-secondary)] hover:bg-[var(--sp-background)] hover:text-[var(--sp-text-primary)]"
            ].join(" ")}
          >
            <span className="max-w-[16ch] truncate">{department}</span>
            <span className={["tabular-nums", active ? "text-[var(--admin-primary-on-soft)]" : "text-[var(--sp-text-helper)]"].join(" ")}>
              {counts[department] ?? 0}
            </span>
          </button>
        );
      })}
    </div>
  );
}
