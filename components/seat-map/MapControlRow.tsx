"use client";

// The map's 48px control row (PHASE2UX §1M.3, DECISIONS D2-b, PHASE3DS §1.14
// `.sp-control-row`; Phase 4 PR 3a). One row, both modes, above canvas and
// slot so it never reflows when the slot opens. Left to right: floor menu ·
// search · "Filters · N" + Clear (Hidden at 0) · result count (aria-live) ·
// Find me · [divider · Undo · Redo · Add seat · Ask Planner · Publish N
// changes (the row's ONE primary) · ⋯ Discard] · Names. Publish is present
// and DISABLED when nothing is publishable, with the reason stated beside it
// (aria-describedby) — never only a tooltip. Add seat and Names are Hidden
// (absent, never disabled) on a roster floor.
//
// This replaces the provisional tenant row under the header (PR 2 seam,
// PHASE4BUILD §1.8): the bar tenants SeatMap used to portal into it and the
// viewer's search field now live here, in the page, 48px under the header.

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { FloorId } from "@/lib/floorIds";
import { FloorMenuButton } from "@/components/seat-map/FloorMenuButton";
import { MapSearch, type MapSearchProps } from "@/components/seat-map/MapSearch";
import { NamesVisibilityToggle } from "@/components/seat-map/NamesVisibilityToggle";
import { CloseIcon, MoreIcon, PlusIcon, RedoIcon, UndoIcon } from "@/components/seat-map/mapIcons";

export type MapControlRowDraft = {
  undo: { label: string; disabled: boolean; busy?: boolean; onClick: () => void };
  redo: { label: string; disabled: boolean; busy?: boolean; onClick: () => void };
  addSeat: { active: boolean; hidden: boolean; onToggle: () => void };
  askPlanner: { count: number; open: boolean; onOpen: () => void; controlsId?: string };
  publish: { count: number; onOpen: () => void };
  discard: { disabled: boolean; onOpen: () => void };
};

export type MapControlRowProps = {
  floor: FloorId;
  onFloorChange: (next: FloorId) => void;
  floorMeta?: Partial<Record<FloorId, string>>;
  search: MapSearchProps;
  /** null = no filter control at all; appliedCount 0 = Hidden (nothing to clear). */
  filters: { appliedCount: number; onOpen: () => void; onClear: () => void; panelOpen: boolean } | null;
  count: { text: string; live: boolean };
  onFindMe: () => void;
  draft?: MapControlRowDraft;
  /** The Ask Planner trigger's ref (focus returns here when the drawer closes). Top-level on purpose:
   *  a ref nested inside the draft config makes the compiler lint treat the whole object as a ref. */
  askPlannerAnchor?: React.RefObject<HTMLButtonElement | null>;
  names: { pressed: boolean; hidden: boolean; onToggle: () => void } | null;
  /** Rare extra content after Names (the surface's sr-only live regions ride along). */
  children?: ReactNode;
};

export function MapControlRow({ floor, onFloorChange, floorMeta, search, filters, count, onFindMe, draft, askPlannerAnchor, names, children }: MapControlRowProps) {
  const reasonId = useId();
  return (
    <div className="sp-control-row shrink-0" role="toolbar" aria-label="Map controls">
      <FloorMenuButton floor={floor} onChange={onFloorChange} meta={floorMeta} />
      <MapSearch {...search} />
      {filters && filters.appliedCount > 0 ? (
        <span className="sp-filters">
          <button
            type="button"
            className="cds-btn cds-btn--tertiary cds-btn--md"
            aria-expanded={filters.panelOpen}
            aria-controls="shell-left-panel"
            onClick={filters.onOpen}
          >
            Filters · {filters.appliedCount}
          </button>
          <button type="button" className="cds-btn cds-btn--icon cds-btn--md" aria-label="Clear filters" onClick={filters.onClear}>
            <CloseIcon />
          </button>
        </span>
      ) : null}
      {/* The live match summary — filter-feedback-source's guardrail: the
          count follows every active constraint and announces politely. */}
      <span className="sp-control-count" aria-live={count.live ? "polite" : undefined} aria-atomic="true">{count.text}</span>
      <button type="button" className="cds-btn cds-btn--ghost cds-btn--md" onClick={onFindMe}>Find me</button>
      {draft ? (
        <>
          <span className="sp-control-divider" role="separator" aria-orientation="vertical" />
          <IconWithTooltip label={draft.undo.label} disabled={draft.undo.disabled} busy={draft.undo.busy} onClick={draft.undo.onClick}><UndoIcon /></IconWithTooltip>
          <IconWithTooltip label={draft.redo.label} disabled={draft.redo.disabled} busy={draft.redo.busy} onClick={draft.redo.onClick}><RedoIcon /></IconWithTooltip>
          {!draft.addSeat.hidden && (
            <button
              type="button"
              className="cds-btn cds-btn--ghost cds-btn--md"
              aria-pressed={draft.addSeat.active}
              data-state={draft.addSeat.active ? "pressed" : undefined}
              onClick={draft.addSeat.onToggle}
            >
              {draft.addSeat.active ? null : <PlusIcon style={{ position: "static", width: 16, height: 16 }} />}
              {draft.addSeat.active ? "Exit add seat" : "Add seat"}
            </button>
          )}
          <button
            ref={askPlannerAnchor}
            type="button"
            className="cds-btn cds-btn--tertiary cds-btn--md"
            data-count={draft.askPlanner.count > 0 ? draft.askPlanner.count : undefined}
            aria-expanded={draft.askPlanner.open}
            aria-controls={draft.askPlanner.controlsId}
            aria-label={draft.askPlanner.count > 0 ? `Open Ask Planner AI, ${draft.askPlanner.count} seats highlighted` : "Open Ask Planner AI"}
            onClick={draft.askPlanner.onOpen}
          >
            Ask Planner
          </button>
          <button
            type="button"
            className="cds-btn cds-btn--primary cds-btn--md"
            style={{ minWidth: 176 }}
            disabled={draft.publish.count === 0}
            aria-describedby={draft.publish.count === 0 ? reasonId : undefined}
            onClick={draft.publish.onOpen}
          >
            {draft.publish.count === 0 ? "Publish" : `Publish ${draft.publish.count} ${draft.publish.count === 1 ? "change" : "changes"}`}
          </button>
          {draft.publish.count === 0 && <span className="sp-control-reason" id={reasonId}>No changes to publish</span>}
          <OverflowMenu disabled={draft.discard.disabled} onDiscard={draft.discard.onOpen} />
        </>
      ) : null}
      {names && !names.hidden ? <NamesVisibilityToggle pressed={names.pressed} onToggle={names.onToggle} /> : null}
      {children}
    </div>
  );
}

// Undo / Redo: icon buttons whose tooltip carries the shortcut the label
// promises ("Undo move Sarah Reyes · Ctrl Z") — the tier-C tooltip on hover
// and focus, aria-label = the same text.
// While the draft history round-trips, the glyph gives way to a spinner and
// the button says aria-busy (PR-5 §8.1: every mutating flow shows its
// present-participle state on the confirming control); the name stays.
function IconWithTooltip({ label, disabled, busy = false, onClick, children }: { label: string; disabled: boolean; busy?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <span className="sp-has-tooltip">
      <button type="button" className="cds-btn cds-btn--icon cds-btn--md" aria-label={label} aria-busy={busy ? "true" : undefined} disabled={disabled} onClick={onClick}>
        {busy ? (
          <span aria-hidden="true" className="block h-4 w-4 rounded-full border-2 border-current border-t-transparent motion-safe:animate-spin" />
        ) : (
          children
        )}
      </button>
      <span className="sp-tooltip" role="tooltip">{label}</span>
    </span>
  );
}

// ⋯ holds Discard draft changes ONLY (D2-b): danger, disabled when nothing
// is discardable. Reset zoom lives on the band's zoom control, Show names
// is the row's toggle — neither belongs in a menu of document actions.
function OverflowMenu({ disabled, onDiscard }: { disabled: boolean; onDiscard: () => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuId = useId();
  useEffect(() => {
    if (!open) return;
    function handleOutsidePointer(event: PointerEvent) {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", handleOutsidePointer);
    return () => document.removeEventListener("pointerdown", handleOutsidePointer);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    window.requestAnimationFrame(() => rootRef.current?.querySelector<HTMLButtonElement>("[role='menuitem']")?.focus());
  }, [open]);
  return (
    <span ref={rootRef} className="cds-overflow" data-open={open ? "" : undefined}>
      {/* Same tier-C tooltip as the row's other icon-only buttons (Undo / Redo / Clear):
          the ⋯ had an accessible name but no tooltip — PR 3a pre-merge smoke, step 12.
          The menu is a sibling of this wrapper, so focus inside the open menu never
          shows the tooltip; `.cds-overflow[data-open] .sp-tooltip` hides it on hover. */}
      <span className="sp-has-tooltip">
        <button
          ref={triggerRef}
          type="button"
          className="cds-btn cds-btn--icon cds-btn--md"
          aria-label="More actions"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          onClick={() => setOpen(value => !value)}
        >
          <MoreIcon />
        </button>
        <span className="sp-tooltip" role="tooltip">
          More actions
        </span>
      </span>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="More actions"
          className="cds-overflow-menu"
          onKeyDown={event => {
            if (event.key === "Escape") {
              event.stopPropagation();
              setOpen(false);
              triggerRef.current?.focus();
            }
          }}
        >
          <button
            type="button"
            role="menuitem"
            className="cds-danger"
            disabled={disabled}
            onClick={() => {
              setOpen(false);
              onDiscard();
            }}
          >
            Discard draft changes
          </button>
        </div>
      )}
    </span>
  );
}
