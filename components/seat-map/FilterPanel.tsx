"use client";

import type { RefObject } from "react";
import { returnFocusAfterClose } from "@/components/ui/returnFocus";
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
  /** The button that opened the panel — Escape hands focus back to it. */
  returnFocusRef: RefObject<HTMLButtonElement | null>;
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
          className="inline-flex min-h-6 items-center border border-[var(--admin-primary-border)] bg-[var(--admin-primary-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--admin-primary-on-soft)] transition hover:bg-[rgba(241,90,36,0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--sp-focus-ring-color)]"
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
// Native <select> keeps its semantics (disclosure pattern verified adversarially) —
// only the chrome is styled: appearance-none + an inline SVG chevron (data-URI,
// stroke #9a9a9a to match --admin-chrome-muted) standing in for the native arrow.
const darkSelectClassName =
  "mt-1 w-full min-w-0 cursor-pointer appearance-none border border-white/20 bg-white/[0.06] bg-[url('data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%2012%208%22%20fill=%22none%22%3E%3Cpolyline%20points=%221,1.5%206,6.5%2011,1.5%22%20stroke=%22%239a9a9a%22%20stroke-width=%221.4%22%20stroke-linecap=%22round%22%20stroke-linejoin=%22round%22/%3E%3C/svg%3E')] bg-[length:12px_8px] bg-[position:right_8px_center] bg-no-repeat px-2.5 py-1.5 pr-8 text-sm text-[var(--admin-chrome-text)] outline-none transition hover:border-white/30 focus:border-[var(--admin-primary)] focus:ring-2 focus:ring-[color:var(--admin-primary-border)] [&>option]:bg-[var(--admin-chrome-hover)] [&>option]:text-[var(--admin-chrome-text)]";

export function FilterPanel({
  department,
  zone,
  status,
  departments,
  zones,
  activeChips,
  panelId = "seat-map-filter-panel",
  returnFocusRef,
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
          // The focused select unmounts with the panel — a bare close would
          // strand keyboard focus on <body>.
          returnFocusAfterClose(returnFocusRef);
        }
      }}
      className="w-full border border-[var(--admin-chrome-border)] bg-[var(--admin-chrome-elevated)] p-3 text-[var(--admin-chrome-text)] shadow-elevation-4"
    >
      <ActiveFilterChips chips={activeStructuredChips} onRemove={onRemoveActiveChip} onClearAll={onClearFilters} className="mb-3" />

      <div className="grid grid-cols-1 gap-2">
        <label className="block">
          <span className="text-[11px] font-medium text-[var(--admin-chrome-muted)]">Department</span>
          <select value={department} onChange={event => onDepartmentChange(event.target.value)} className={darkSelectClassName}>
            <option value="all">All departments</option>
            {departments.map(dep => (
              <option key={dep} value={dep}>{dep}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-[11px] font-medium text-[var(--admin-chrome-muted)]">Zone</span>
          <select value={zone} onChange={event => onZoneChange(event.target.value)} className={darkSelectClassName}>
            <option value="all">All zones</option>
            {zones.map(value => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-[11px] font-medium text-[var(--admin-chrome-muted)]">Status</span>
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
