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
  activeChips: ActiveFilterChip[];
  panelId?: string;
  onClose: () => void;
  onDepartmentChange: (value: string) => void;
  onZoneChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onRemoveActiveChip: (chipId: string) => void;
  onClearFilters: () => void;
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
        <span key={chip.id} className="inline-flex max-w-full items-center gap-1 bg-[var(--admin-surface)] py-0.5 pl-2 pr-1 text-[11px] font-semibold text-[var(--admin-text-secondary)] ring-1 ring-[var(--admin-primary-border)]">
          <span className="shrink-0 text-[var(--admin-text-muted)]">{chip.label}</span>
          <span className="min-w-0 truncate text-[var(--admin-primary-cta)]">{chip.value}</span>
          <button
            type="button"
            onClick={() => onRemove(chip.id)}
            aria-label={chip.removeLabel}
            title={chip.removeLabel}
            className="ml-0.5 flex h-6 w-6 shrink-0 items-center justify-center text-[10px] font-semibold text-[var(--admin-text-subtle)] transition hover:bg-[var(--admin-state-neutral-bg)] hover:text-[var(--admin-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--sp-focus-ring-color)]"
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3 w-3"><path d="m6 6 8 8m0-8-8 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </span>
      ))}
      {chips.length > 1 && (
        <button
          type="button"
          onClick={onClearAll}
          className="inline-flex min-h-6 items-center border border-[var(--admin-primary-border)] bg-[var(--admin-primary-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--admin-primary-cta)] transition hover:bg-[rgba(241,90,36,0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--sp-focus-ring-color)]"
        >
          Clear all
        </button>
      )}
    </div>
  );
}

// Prototype `.fmenu`: a compact dark menu anchored to the Filter button in the
// chrome bar. Content only — the caller's wrapper owns positioning (absolute
// or fixed under the button), so admin and viewer share ONE filter presentation.
const darkSelectClassName =
  "mt-1 w-full min-w-0 cursor-pointer border border-white/20 bg-white/[0.06] px-2.5 py-1.5 text-sm text-[#f4f4f4] outline-none transition hover:border-white/30 focus:border-[var(--admin-primary)] focus:ring-2 focus:ring-[color:var(--admin-primary-border)] [&>option]:bg-[#262626] [&>option]:text-[#f4f4f4]";

export function FilterPanel({
  department,
  zone,
  status,
  departments,
  zones,
  activeChips,
  panelId = "seat-map-filter-panel",
  onClose,
  onDepartmentChange,
  onZoneChange,
  onStatusChange,
  onRemoveActiveChip,
  onClearFilters
}: FilterPanelProps) {
  const activeStructuredChips = activeChips.filter(chip => chip.id !== "search");

  return (
    // The trigger button already says "Filter", so the menu carries no repeated
    // heading (prototype .fmenu) — just chips + the three facet selects.
    <div
      id={panelId}
      role="group"
      aria-label="Filter options"
      onKeyDown={event => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
      className="w-full border border-white/15 bg-[#1f1f1f] p-3 text-[#f4f4f4] shadow-[var(--admin-elevation-4-shadow)]"
    >
      <ActiveFilterChips chips={activeStructuredChips} onRemove={onRemoveActiveChip} onClearAll={onClearFilters} className="mb-3" />

      <div className="grid grid-cols-1 gap-2">
        <label className="block">
          <span className="text-[11px] font-medium text-[#9a9a9a]">Department</span>
          <select value={department} onChange={event => onDepartmentChange(event.target.value)} className={darkSelectClassName}>
            <option value="all">All departments</option>
            {departments.map(dep => (
              <option key={dep} value={dep}>{dep}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-[11px] font-medium text-[#9a9a9a]">Zone</span>
          <select value={zone} onChange={event => onZoneChange(event.target.value)} className={darkSelectClassName}>
            <option value="all">All zones</option>
            {zones.map(value => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-[11px] font-medium text-[#9a9a9a]">Status</span>
          <select value={status} onChange={event => onStatusChange(event.target.value)} className={darkSelectClassName}>
            <option value="all">All statuses</option>
            <option value="available">Available</option>
            <option value="assigned">Assigned</option>
            <option value="reserved">Reserved</option>
            <option value="unavailable">Unavailable</option>
          </select>
        </label>
      </div>
    </div>
  );
}
