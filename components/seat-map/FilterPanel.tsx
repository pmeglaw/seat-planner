"use client";

import type { SeatStatus } from "@/lib/types";

export type ActiveFilterChip = {
  id: string;
  label: string;
  value: string;
  removeLabel: string;
};

export type ResultStatusBreakdown = Record<SeatStatus, number>;

type FilterPanelProps = {
  department: string;
  zone: string;
  status: string;
  departments: string[];
  zones: string[];
  collapsed: boolean;
  activeChips: ActiveFilterChip[];
  onToggle: () => void;
  onDepartmentChange: (value: string) => void;
  onZoneChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onRemoveActiveChip: (chipId: string) => void;
  onClearFilters: () => void;
  onClearAll: () => void;
};

export function ActiveFilterChips({
  chips,
  onRemove,
  onClearAll,
  className = ""
}: {
  chips: ActiveFilterChip[];
  onRemove: (chipId: string) => void;
  onClearAll: () => void;
  className?: string;
}) {
  if (!chips.length) return null;

  return (
    <div aria-label="Active filters" className={["flex flex-wrap items-center gap-1.5", className].filter(Boolean).join(" ")}>
      {chips.map(chip => (
        <span key={chip.id} className="inline-flex max-w-full items-center gap-1 rounded-full bg-[var(--admin-surface)] py-0.5 pl-2 pr-1 text-[11px] font-semibold text-[var(--admin-text-secondary)] ring-1 ring-[var(--admin-border)]">
          <span className="shrink-0 text-[var(--admin-text-muted)]">{chip.label}</span>
          <span className="min-w-0 truncate text-[var(--admin-text-primary)]">{chip.value}</span>
          <button
            type="button"
            onClick={() => onRemove(chip.id)}
            aria-label={chip.removeLabel}
            title={chip.removeLabel}
            className="ml-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-[var(--admin-text-subtle)] transition hover:bg-[var(--admin-state-neutral-bg)] hover:text-[var(--admin-text-secondary)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus-ring-color)]"
          >
            x
          </button>
        </span>
      ))}
      {chips.length > 1 && (
        <button
          type="button"
          onClick={onClearAll}
          className="inline-flex min-h-6 items-center rounded-full border border-[var(--admin-primary-border)] bg-[var(--admin-primary-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--admin-primary-cta)] transition hover:bg-[rgba(242,110,34,0.16)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus-ring-color)]"
        >
          Clear all
        </button>
      )}
    </div>
  );
}

export function FilterPanel({
  department,
  zone,
  status,
  departments,
  zones,
  collapsed,
  activeChips,
  onToggle,
  onDepartmentChange,
  onZoneChange,
  onStatusChange,
  onRemoveActiveChip,
  onClearFilters,
  onClearAll
}: FilterPanelProps) {
  const activeStructuredChips = activeChips.filter(chip => chip.id !== "search");
  const constraintsActive = activeChips.length > 0;
  const structuredFilterCount = [department !== "all", zone !== "all", status !== "all"].filter(Boolean).length;

  if (collapsed) {
    return (
      <aside className="self-start lg:sticky lg:top-[62px]">
        <button
          type="button"
          onClick={onToggle}
          aria-controls="seat-map-filter-panel"
          aria-expanded={false}
          aria-label={structuredFilterCount ? `Open filters, ${structuredFilterCount} active` : "Open filters"}
          title={structuredFilterCount ? `${structuredFilterCount} active filters` : "Open filters"}
          className="relative flex min-h-11 w-full items-center justify-center rounded-full border border-[var(--admin-border)] bg-[var(--admin-surface)] px-4 py-2 text-[var(--admin-text-secondary)] shadow-[var(--admin-shadow-panel)] transition hover:bg-[var(--admin-surface-alt)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus-ring-color)] lg:min-h-[164px] lg:w-[48px] lg:flex-col lg:px-2 lg:py-4"
        >
          {structuredFilterCount > 0 && (
            <span className="absolute right-2 top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--admin-primary-cta)] px-1.5 text-[10px] font-semibold text-white ring-2 ring-[var(--admin-surface)] lg:right-auto lg:top-3">
              {structuredFilterCount}
            </span>
          )}
          <span className="text-[11px] font-semibold tracking-wide lg:rotate-180 lg:[writing-mode:vertical-rl]">Filters</span>
          <span className="ml-2 text-[10px] text-[var(--admin-text-subtle)] lg:ml-0 lg:mt-2 lg:rotate-180 lg:[writing-mode:vertical-rl]">
            {structuredFilterCount ? "Active" : "Refine"}
          </span>
        </button>
      </aside>
    );
  }

  return (
    <aside id="seat-map-filter-panel" aria-labelledby="seat-map-filter-title" className="relative z-[70] max-h-[55vh] w-full self-start overflow-auto overscroll-contain border border-[var(--admin-border)] bg-[var(--admin-surface)] p-3 shadow-[var(--admin-shadow-panel)] motion-safe:animate-[sp-panel-in_200ms_ease-out] sm:max-h-[62vh] lg:sticky lg:top-[62px] lg:z-auto lg:max-h-[calc(100vh-78px)] lg:w-[288px]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="seat-map-filter-title" className="text-sm font-semibold text-[var(--admin-text-primary)]">Filters</h2>
        <div className="flex items-center gap-1">
          {constraintsActive && (
            <button type="button" onClick={onClearAll} aria-label="Clear all active search and filters" className="inline-flex min-h-6 items-center rounded-md px-2 py-1 text-[11px] font-medium text-[var(--admin-primary-cta)] hover:bg-[var(--admin-primary-soft)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus-ring-color)]">
              Clear all
            </button>
          )}
          <button type="button" onClick={onToggle} aria-controls="seat-map-filter-panel" aria-expanded={true} aria-label="Collapse filters" className="inline-flex min-h-6 items-center rounded-md px-2 py-1 text-[11px] font-medium text-[var(--admin-text-muted)] hover:bg-[var(--admin-state-neutral-bg)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus-ring-color)]">
            Collapse
          </button>
        </div>
      </div>

      <ActiveFilterChips chips={activeStructuredChips} onRemove={onRemoveActiveChip} onClearAll={onClearFilters} className="mb-3" />

      <div className="grid grid-cols-1 gap-2">
        <label className="block">
          <span className="text-[11px] font-medium text-[var(--admin-text-muted)]">Department</span>
          <select
            value={department}
            onChange={event => onDepartmentChange(event.target.value)}
            className="mt-1 w-full min-w-0 cursor-pointer rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 py-2 text-sm text-[var(--admin-text-primary)] outline-none transition-colors hover:border-[var(--admin-border-strong)] focus:border-[var(--admin-primary)] focus:ring-2 focus:ring-[color:var(--admin-primary-border)]"
          >
            <option value="all">All departments</option>
            {departments.map(dep => (
              <option key={dep} value={dep}>{dep}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-[11px] font-medium text-[var(--admin-text-muted)]">Zone</span>
          <select
            value={zone}
            onChange={event => onZoneChange(event.target.value)}
            className="mt-1 w-full min-w-0 cursor-pointer rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 py-2 text-sm text-[var(--admin-text-primary)] outline-none transition-colors hover:border-[var(--admin-border-strong)] focus:border-[var(--admin-primary)] focus:ring-2 focus:ring-[color:var(--admin-primary-border)]"
          >
            <option value="all">All zones</option>
            {zones.map(value => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-[11px] font-medium text-[var(--admin-text-muted)]">Status</span>
          <select
            value={status}
            onChange={event => onStatusChange(event.target.value)}
            className="mt-1 w-full min-w-0 cursor-pointer rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 py-2 text-sm text-[var(--admin-text-primary)] outline-none transition-colors hover:border-[var(--admin-border-strong)] focus:border-[var(--admin-primary)] focus:ring-2 focus:ring-[color:var(--admin-primary-border)]"
          >
            <option value="all">All statuses</option>
            <option value="available">Available</option>
            <option value="assigned">Assigned</option>
            <option value="reserved">Reserved</option>
            <option value="unavailable">Unavailable</option>
          </select>
        </label>
      </div>

    </aside>
  );
}
