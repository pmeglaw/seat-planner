"use client";

import { useEffect } from "react";
import type { FloorId } from "@/lib/floorIds";
import { FLOORS, groupRosterByDepartment } from "@/lib/floors";
import { formatDisplayName } from "@/lib/formatName";
import type { Employee } from "@/lib/types";

/**
 * The surface an UNMAPPED floor renders in place of a plan (multi-floor PR-2,
 * DECISIONS.md D1′): every active person who works there, grouped by
 * department, A→Z within. Both map surfaces mount it — the viewer from the
 * published snapshot, the admin editor (PR-3) from its live working set — and
 * it reads no table itself.
 *
 * Rows are STATIC list items (deviation 9): every fact the seat inspector
 * would show is already on the row, so there is nothing to open and nothing
 * to make inert — Carbon's rule that content which must be read is never
 * rendered inoperable holds by construction. The region is the keyboard tab stop so
 * the list stays scrollable (axe scrollable-region-focusable); a find that
 * lands here marks the person's row (`aria-current`) and focuses the region.
 * The only controls are the two zero-state ways out: "Clear search" when a
 * query matches no one, "Clear filters" when a structured filter hid everyone
 * (never the first-run copy — the map IS published then).
 */

// Same eyebrow as the palette's group headers (ViewerFindPalette) — one
// department-header voice across the two viewer lists.
const eyebrowClassName = "text-xs font-semibold uppercase tracking-[0.12em] text-[var(--sp-text-helper)]";

// The zero-state buttons, the palette's own Clear search recipe: ≈30px
// content-sized, so the 44px reach comes from the 7px vertical hit
// expansion (only a <p> sits above; pinned in touch-target-source).
const clearButtonClassName =
  "relative mt-3 border border-[var(--sp-border-subtle)] bg-[var(--sp-layer-01)] px-3 py-1.5 text-xs font-semibold text-[var(--sp-text-secondary)] transition after:absolute after:-inset-y-[7px] after:inset-x-0 hover:border-[var(--sp-brand-border)] hover:text-[var(--sp-button-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sp-focus)]";

export const DEFAULT_FLOOR_ROSTER_REGION_ID = "floor-roster";

/** Hands keyboard focus to the roster region (deferred a frame so a find
 *  that just switched floors has mounted it). */
export function focusFloorRoster(regionId: string = DEFAULT_FLOOR_ROSTER_REGION_ID) {
  window.requestAnimationFrame(() => {
    document.getElementById(regionId)?.focus();
  });
}

export type FloorRosterProps = {
  floor: FloorId;
  /** Active people on this floor, already narrowed by any structured filters. */
  people: Employee[];
  /** The live search query — rows filter in place and the count is published. */
  query: string;
  highlightedPersonId?: string | null;
  /** One line under the heading saying why this is a list ("The 2nd-floor plan is not mapped yet."). */
  helper: string;
  regionId?: string;
  onClearSearch?: () => void;
  /** Everyone on the floor before the caller's structured filters narrowed
   *  `people` — the heading always states the floor's real count. */
  totalCount?: number;
  filtersActive?: boolean;
  onClearFilters?: () => void;
  /** Extra top padding on the sticky header, in px — the viewer floats its
   *  floor/crumb chip cluster over the stage's top-left corner, which is where
   *  this header sits, so the caller passes the cluster's measured height. */
  headerInsetPx?: number;
};

export function FloorRoster({
  floor,
  people,
  query,
  highlightedPersonId = null,
  helper,
  regionId = DEFAULT_FLOOR_ROSTER_REGION_ID,
  onClearSearch,
  totalCount,
  filtersActive = false,
  onClearFilters,
  headerInsetPx = 0
}: FloorRosterProps) {
  const label = FLOORS[floor].label;
  const trimmedQuery = query.trim();
  const groups = groupRosterByDepartment(people, trimmedQuery);
  const matchCount = groups.reduce((count, group) => count + group.people.length, 0);
  const total = totalCount ?? people.length;
  const peopleLabel = `${total} ${total === 1 ? "person" : "people"}`;
  const filtersNarrowed = filtersActive && people.length !== total;

  // A find that lands on a person scrolls their row into the middle of the
  // region. Guarded: jsdom (the ct tier) has no scrollIntoView.
  useEffect(() => {
    if (!highlightedPersonId) return;
    const row = document.getElementById(`${regionId}-person-${highlightedPersonId}`);
    row?.scrollIntoView?.({ block: "center" });
  }, [highlightedPersonId, regionId]);

  return (
    <section
      role="region"
      id={regionId}
      tabIndex={0}
      aria-label={`${label} roster`}
      className="h-full w-full overflow-y-auto overscroll-contain bg-[var(--sp-layer-01)] text-left [scrollbar-width:thin] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--sp-focus)]"
    >
      <div
        className="sticky top-0 z-10 border-b border-[var(--sp-border-subtle)] bg-[var(--sp-layer-01)] px-4 py-3"
        style={headerInsetPx > 0 ? { paddingTop: headerInsetPx } : undefined}
      >
        <h2 className="text-sm font-semibold text-[var(--sp-text-primary)]">
          {label} — {peopleLabel}
        </h2>
        <p className="mt-0.5 text-xs text-[var(--sp-text-helper)]">{helper}</p>
        {/* Search count, zero included (Carbon: never a silent search); a
            structured filter publishes its count the same way. */}
        {trimmedQuery ? (
          <p aria-live="polite" className="mt-1 text-xs font-medium tabular-nums text-[var(--sp-text-secondary)]">
            {matchCount} of {people.length} people match “{trimmedQuery}”
          </p>
        ) : filtersNarrowed ? (
          <p aria-live="polite" className="mt-1 text-xs font-medium tabular-nums text-[var(--sp-text-secondary)]">
            {people.length} of {total} people match the active filters
          </p>
        ) : null}
      </div>

      {total === 0 && !trimmedQuery ? (
        <div role="status" className="p-4">
          <div className="text-sm font-semibold text-[var(--sp-text-primary)]">No one is listed on {label} yet</div>
          <p className="mt-1 text-xs font-medium leading-5 text-[var(--sp-text-helper)]">
            People appear here after an admin publishes the seat map.
          </p>
        </div>
      ) : people.length === 0 && !trimmedQuery ? (
        /* A structured filter hid everyone: the map IS published, the
           emptiness is the filter — say so and offer the way out. */
        <div role="status" aria-live="polite" className="p-4">
          <div className="text-sm font-semibold text-[var(--sp-text-primary)]">No one on {label} matches the active filters</div>
          <p className="mt-1 text-xs font-medium leading-5 text-[var(--sp-text-helper)]">
            Department and position narrow this list; zone and status apply on mapped floors.
          </p>
          {onClearFilters ? (
            <button type="button" onClick={() => onClearFilters()} className={clearButtonClassName}>
              Clear filters
            </button>
          ) : null}
        </div>
      ) : matchCount === 0 ? (
        <div role="status" aria-live="polite" className="p-4">
          <div className="text-sm font-semibold text-[var(--sp-text-primary)]">
            No results for “{trimmedQuery}” on {label}
          </div>
          <p className="mt-1 text-xs font-medium leading-5 text-[var(--sp-text-helper)]">
            No one on this floor matches by name, position, department, extension or email.
          </p>
          {onClearSearch ? (
            <button type="button" onClick={() => onClearSearch()} className={clearButtonClassName}>
              Clear search
            </button>
          ) : null}
        </div>
      ) : (
        <ul role="list" aria-label={`People on ${label}`} className="pb-4">
          {groups.map(group => (
            <li key={group.key || "no-department"} data-roster-group={group.department} className="pt-3">
              <div className="flex items-baseline gap-2 px-4 pb-1">
                <span className={eyebrowClassName}>{group.department}</span>
                <span className="text-xs font-medium tabular-nums text-[var(--sp-text-helper)]">· {group.people.length}</span>
              </div>
              <ul role="list">
                {group.people.map(person => {
                  const highlighted = person.id === highlightedPersonId;
                  return (
                    <li
                      key={person.id}
                      id={`${regionId}-person-${person.id}`}
                      role="listitem"
                      data-roster-row={person.id}
                      aria-current={highlighted ? "true" : undefined}
                      // Dense zone: one 40px line from md up (name | position ·
                      // extension | email), stacked below. No hover or focus
                      // styling — the row is not a control. The highlighted
                      // row carries two signals: the brand wash and a 4px
                      // left accent bar (button-primary: ≈4.0:1 on the wash,
                      // 3.4:1 in dark — a 1px 40% brand ring measured 1.6:1
                      // and failed the 3:1 graphic floor, 2026-09-01).
                      className={[
                        "grid min-h-10 grid-cols-1 gap-x-4 gap-y-0.5 border-t border-[var(--sp-border-subtle)] py-2 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)] md:items-center md:py-0",
                        highlighted
                          ? "border-l-4 border-l-[var(--sp-button-primary)] bg-[var(--sp-brand-subtle)] pl-3 pr-4"
                          : "px-4"
                      ].join(" ")}
                    >
                      <span className="truncate text-[13px] font-semibold leading-5 text-[var(--sp-text-primary)]">
                        {formatDisplayName(person.full_name)}
                      </span>
                      <span className="truncate text-xs font-medium leading-5 text-[var(--sp-text-secondary)]">
                        {[person.position, person.phone_extension ? `ext. ${person.phone_extension}` : null].filter(Boolean).join(" · ") || "—"}
                      </span>
                      <span className="truncate text-xs leading-5 text-[var(--sp-text-helper)] md:text-right">
                        {person.email ?? ""}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
