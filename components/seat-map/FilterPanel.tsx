"use client";

import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { returnFocusAfterClose } from "@/components/ui/returnFocus";
import type { SeatStatus } from "@/lib/types";
import { STATUS_LABELS } from "@/lib/types";

export type ActiveFilterChip = {
  id: string;
  label: string;
  value: string;
  removeLabel: string;
};

export type ResultStatusBreakdown = Record<SeatStatus, number>;

type FilterPanelProps = {
  department: string;
  position: string;
  zone: string;
  status: string;
  departments: string[];
  positions: string[];
  zones: string[];
  activeChips: ActiveFilterChip[];
  panelId?: string;
  /** The button that opened the panel — Escape hands focus back to it. */
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onDepartmentChange: (value: string) => void;
  onPositionChange: (value: string) => void;
  onZoneChange: (value: string) => void;
  /**
   * Hover/focus preview for the zone chips (v12 contract #8). Optional: a
   * caller with no map to wash simply omits it and the chips stay a plain
   * filter control.
   */
  onZoneHoverChange?: (zone: string | null) => void;
  onStatusChange: (value: string) => void;
  onRemoveActiveChip: (chipId: string) => void;
  onClearFilters: () => void;
  // Live "N of M seats match" line rendered inside the popover.
  matchSummary?: string;
  /**
   * Multi-floor PR-2 (Q5): when the summary says a department's people are
   * on the OTHER floor, this is the "Show Floor 2" action beside it — the
   * filter never returns an unchanged map in silence.
   */
  matchSummaryAction?: { label: string; onClick: () => void };
  /**
   * Multi-floor PR-2: zone and status describe SEATS. On a roster floor
   * (no map) they would be inert, so the caller passes false and the panel
   * hides them (Hidden tier, never disabled) and says why.
   */
  seatFacetsApply?: boolean;
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

  // sp-zone-base: these chips render both floating over the map AND inside
  // the dark chrome-zone filter popover — the re-entry class pins the base
  // surface/text roles so the zone can't flip them (they were light in the
  // popover before the zone model, and stay light).
  return (
    <div aria-label="Active filters" className={["sp-zone-base flex flex-wrap items-center gap-1.5", className].filter(Boolean).join(" ")}>
      {chips.map(chip => (
        <span key={chip.id} className="inline-flex max-w-full items-center gap-1 bg-[var(--sp-layer-01)] py-0.5 pl-2 pr-1 text-xs font-semibold text-[var(--sp-text-secondary)] ring-1 ring-[var(--sp-border-interactive)]">
          <span className="shrink-0 text-[var(--sp-text-helper)]">{chip.label}</span>
          <span className="min-w-0 truncate text-[var(--sp-button-primary)]">{chip.value}</span>
          <button
            type="button"
            onClick={() => onRemove(chip.id)}
            aria-label={chip.removeLabel}
            title={chip.removeLabel}
            className="relative ml-0.5 flex h-6 w-6 shrink-0 items-center justify-center text-[var(--sp-text-helper)] transition after:absolute after:-inset-x-2.5 after:-inset-y-[3px] hover:bg-[var(--sp-editor-neutral-bg)] hover:text-[var(--sp-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--sp-focus)]"
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3 w-3"><path d="m6 6 8 8m0-8-8 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </span>
      ))}
      {chips.length > 1 && (
        <button
          type="button"
          onClick={onClearAll}
          className="relative inline-flex min-h-6 items-center border border-[var(--sp-border-interactive)] bg-[var(--sp-layer-hover)] px-2.5 py-1 text-xs font-semibold text-[var(--sp-link-hover)] transition after:absolute after:-inset-y-[3px] after:inset-x-0 hover:bg-[color-mix(in_srgb,var(--sp-interactive)_16%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--sp-focus)]"
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
// stroke #B8AEA2 to match --sp-text-helper) standing in for the native arrow.
// relative z-[1]: each facet label carries a hit-expansion ::after that would
// otherwise paint over its own select and swallow the click that opens the
// native picker — the control rides above the pseudo (PR-2 / F-SP-4).
const darkSelectClassName =
  "relative z-[1] mt-1 w-full min-w-0 cursor-pointer appearance-none border border-white/20 bg-white/[0.06] bg-[url('data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%2012%208%22%20fill=%22none%22%3E%3Cpolyline%20points=%221,1.5%206,6.5%2011,1.5%22%20stroke=%22%239a9a9a%22%20stroke-width=%221.4%22%20stroke-linecap=%22round%22%20stroke-linejoin=%22round%22/%3E%3C/svg%3E')] bg-[length:12px_8px] bg-[position:right_8px_center] bg-no-repeat px-2.5 py-1.5 pr-8 text-sm text-[var(--sp-text-primary)] outline-none transition hover:border-white/30 focus:border-[var(--sp-interactive)] focus:ring-2 focus:ring-[color:var(--sp-border-interactive)] [&>option]:bg-[var(--sp-background-hover)] [&>option]:text-[var(--sp-text-primary)]";

export function FilterPanel({
  department,
  position,
  zone,
  status,
  departments,
  positions,
  zones,
  activeChips,
  panelId = "seat-map-filter-panel",
  returnFocusRef,
  onClose,
  onDepartmentChange,
  onPositionChange,
  onZoneChange,
  onZoneHoverChange,
  onStatusChange,
  onRemoveActiveChip,
  onClearFilters,
  matchSummary,
  matchSummaryAction,
  seatFacetsApply = true
}: FilterPanelProps) {
  const activeStructuredChips = activeChips.filter(chip => chip.id !== "search");
  // "All zones" clears the facet and previews nothing — only real zones wash.
  const zoneChoices = [{ value: "all", label: "All zones" }, ...zones.map(value => ({ value, label: value }))];

  // Closing the panel while a chip is hovered or focused unmounts it without
  // ever firing mouseleave/blur, which would strand the preview wash on the
  // map. One unmount cleanup covers every close path (Escape, outside click,
  // trigger toggle).
  const zoneHoverRef = useRef(onZoneHoverChange);
  useEffect(() => {
    zoneHoverRef.current = onZoneHoverChange;
  }, [onZoneHoverChange]);
  useEffect(() => () => zoneHoverRef.current?.(null), []);

  return (
    // The trigger button already says "Filter", so the menu carries no repeated
    // heading (prototype .fmenu) — just chips + the four facet selects.
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
      className="w-full border border-[var(--sp-border-subtle)] bg-[var(--sp-layer-01)] p-3 text-[var(--sp-text-primary)] shadow-sp"
    >
      <ActiveFilterChips chips={activeStructuredChips} onRemove={onRemoveActiveChip} onClearAll={onClearFilters} className="mb-3" />

      <div className="grid grid-cols-1 gap-2">
        <label className="relative block after:absolute after:-inset-y-1 after:inset-x-0">
          <span className="text-xs font-medium text-[var(--sp-text-helper)]">Department</span>
          <select value={department} onChange={event => onDepartmentChange(event.target.value)} className={darkSelectClassName}>
            <option value="all">All departments</option>
            {departments.map(dep => (
              <option key={dep} value={dep}>{dep}</option>
            ))}
          </select>
        </label>

        {/* Position sits beside Department because both describe the PERSON;
            Zone and Status below describe the SEAT. Grouping them this way is
            what makes "show me every Case Manager, then look at their zones"
            readable as one motion. */}
        <label className="relative block after:absolute after:-inset-y-1 after:inset-x-0">
          <span className="text-xs font-medium text-[var(--sp-text-helper)]">Position</span>
          <select value={position} onChange={event => onPositionChange(event.target.value)} className={darkSelectClassName}>
            <option value="all">All positions</option>
            {positions.map(value => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>

        {/* Zone is a chip list, not a select (v12 contract #8): the chips
            preview their zone on the map on hover AND on keyboard focus, so
            the preview is not a pointer-only affordance. aria-pressed carries
            the pinned state — the chips toggle a filter, they are not tabs. */}
        {!seatFacetsApply && (
          <p className="text-xs font-medium text-[var(--sp-text-helper)]">Zone and status filters apply on mapped floors.</p>
        )}
        {seatFacetsApply && (
        <div role="group" aria-label="Zone" onMouseLeave={() => onZoneHoverChange?.(null)}>
          <span className="text-xs font-medium text-[var(--sp-text-helper)]">
            Zone{onZoneHoverChange ? " — hover to preview on the map" : ""}
          </span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {zoneChoices.map(choice => {
              const active = zone === choice.value;
              const previewZone = choice.value === "all" ? null : choice.value;
              return (
                <button
                  key={choice.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onZoneChange(active && choice.value !== "all" ? "all" : choice.value)}
                  onMouseEnter={() => onZoneHoverChange?.(previewZone)}
                  onMouseLeave={() => onZoneHoverChange?.(null)}
                  onFocus={() => onZoneHoverChange?.(previewZone)}
                  onBlur={() => onZoneHoverChange?.(null)}
                  className={[
                    "relative max-w-full truncate rounded-full border px-2.5 py-1 text-xs font-semibold transition after:absolute after:-inset-x-[3px] after:-inset-y-[3px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--sp-focus)]",
                    active
                      ? "border-[var(--sp-interactive)] bg-[color-mix(in_srgb,var(--sp-interactive)_15%,transparent)] text-[var(--sp-interactive)]"
                      : "border-white/20 bg-white/[0.06] text-[var(--sp-text-primary)] hover:border-[var(--sp-interactive)]"
                  ].join(" ")}
                >
                  {choice.label}
                </button>
              );
            })}
          </div>
        </div>
        )}

        {seatFacetsApply && (
        <label className="relative block after:absolute after:-inset-y-1 after:inset-x-0">
          <span className="text-xs font-medium text-[var(--sp-text-helper)]">Status</span>
          <select value={status} onChange={event => onStatusChange(event.target.value)} className={darkSelectClassName}>
            <option value="all">All statuses</option>
            <option value="available">{STATUS_LABELS.available}</option>
            <option value="assigned">{STATUS_LABELS.assigned}</option>
            <option value="reserved">{STATUS_LABELS.reserved}</option>
            <option value="unavailable">{STATUS_LABELS.unavailable}</option>
          </select>
        </label>
        )}
      </div>
      {/* Commit informed: the live match count sits inside the popover so
          changing a select shows its effect before the panel closes
          (2026-07-16 regrade, review 4). */}
      {matchSummary && (
        <p aria-live="polite" className="mt-3 border-t border-white/10 pt-2.5 text-xs font-medium text-[var(--sp-text-helper)]">
          {matchSummary}
        </p>
      )}
      {/* Shape of the chips' Clear all (sp-zone-base re-entry) on an OPAQUE
          layer-01 ground: the zone class re-enters the surface tokens, not
          the translucent brand wash, so brand text over the wash on the dark
          popover measured ~2:1 (2026-09-01 harness drive). layer-01 + brand
          text is 7.4:1 light / 7.1:1 dark; the hover wash (brand-subtle)
          keeps 6.2:1 in both. Its OWN literal with a 10px vertical expansion
          (24 + 20 = 44): the button stands alone under the summary line, so
          the chips' adjacency-capped ruling does not describe it. */}
      {matchSummaryAction && (
        <div className="sp-zone-base mt-2 flex">
          <button
            type="button"
            onClick={matchSummaryAction.onClick}
            className="relative inline-flex items-center min-h-6 border border-[var(--sp-border-interactive)] bg-[var(--sp-layer-01)] px-2.5 py-1 text-xs font-semibold text-[var(--sp-link-hover)] transition after:absolute after:-inset-y-2.5 after:inset-x-0 hover:bg-[var(--sp-layer-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--sp-focus)]"
          >
            {matchSummaryAction.label}
          </button>
        </div>
      )}
    </div>
  );
}
