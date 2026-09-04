"use client";

import { useEffect, useState } from "react";
import { withQueryParam } from "@/lib/deepLink";
import { CopyIcon } from "@/components/seat-map/mapIcons";
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

// The zero-state buttons, the palette's own Clear search recipe: ≈30px
// content-sized, so the 44px reach comes from the 7px vertical hit
// expansion (only a <p> sits above; pinned in touch-target-source).

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
  // Copy link (D1-e): a share URL that lands on this person (`?q=<name>`,
  // D1-d landing rule) — an icon button on a static row is not a disclosure
  // (deviation 9 holds). The done-state is in place, 2s, and announced.
  const [copiedId, setCopiedId] = useState<string | null>(null);
  useEffect(() => {
    if (!copiedId) return;
    const timer = window.setTimeout(() => setCopiedId(null), 2000);
    return () => window.clearTimeout(timer);
  }, [copiedId]);
  const copyLinkFor = async (person: Employee) => {
    const href = `${window.location.origin}${window.location.pathname}${withQueryParam("", person.full_name)}`;
    try {
      await window.navigator.clipboard.writeText(href);
      setCopiedId(person.id);
    } catch {
      // Clipboard unavailable (insecure context / permissions): nothing to undo.
    }
  };
  const copiedPerson = copiedId ? people.find(person => person.id === copiedId) ?? null : null;

  return (
    <section
      role="region"
      id={regionId}
      tabIndex={0}
      aria-label={`${label} roster`}
      className="sp-roster h-full w-full overflow-y-auto overscroll-contain bg-[var(--sp-layer-01)] text-left [scrollbar-width:thin] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--sp-focus)]"
    >
      <div
        className="sticky top-0 z-10 bg-[var(--sp-layer-01)]"
        style={headerInsetPx > 0 ? { paddingTop: headerInsetPx } : undefined}
      >
        <h2>
          {label} — {peopleLabel}
        </h2>
        <p className="sp-roster-helper">{helper}</p>
        {/* Search count, zero included (Carbon: never a silent search); a
            structured filter publishes its count the same way. */}
        {trimmedQuery ? (
          <p aria-live="polite" className="sp-roster-helper tabular-nums">
            {matchCount} of {people.length} people match “{trimmedQuery}”
          </p>
        ) : filtersNarrowed ? (
          <p aria-live="polite" className="sp-roster-helper tabular-nums">
            {people.length} of {total} people match the active filters
          </p>
        ) : null}
      </div>
      <span aria-live="polite" aria-atomic="true" className="sr-only">
        {copiedPerson ? `Link copied for ${formatDisplayName(copiedPerson.full_name)}.` : ""}
      </span>

      {total === 0 && !trimmedQuery ? (
        <div role="status" className="cds-empty">
          <h3>No one is listed on {label} yet</h3>
          <p>People appear here after an admin publishes the seat map.</p>
        </div>
      ) : people.length === 0 && !trimmedQuery ? (
        /* A structured filter hid everyone: the map IS published, the
           emptiness is the filter — say so and offer the way out. */
        <div role="status" aria-live="polite" className="cds-empty">
          <h3>No one on {label} matches the active filters</h3>
          <p>Department and position narrow this list; zone and status apply on mapped floors.</p>
          {onClearFilters ? (
            <div className="cds-empty-actions">
              <button type="button" className="cds-btn cds-btn--ghost cds-btn--sm" onClick={() => onClearFilters()}>Clear filters</button>
            </div>
          ) : null}
        </div>
      ) : matchCount === 0 ? (
        <div role="status" aria-live="polite" className="cds-empty">
          <h3>No results for “{trimmedQuery}” on {label}</h3>
          <p>No one on this floor matches by name, position, department, extension or email.</p>
          {onClearSearch ? (
            <div className="cds-empty-actions">
              <button type="button" className="cds-btn cds-btn--ghost cds-btn--sm" onClick={() => onClearSearch()}>Clear search</button>
            </div>
          ) : null}
        </div>
      ) : (
        <ul role="list" aria-label={`People on ${label}`} className="sp-roster-list">
          {groups.map(group => (
            <li key={group.key || "no-department"} data-roster-group={group.department}>
              <div className="sp-roster-group">
                {group.department}
                <span className="sp-roster-count">{group.people.length}</span>
              </div>
              <ul role="list" className="sp-roster-list">
                {group.people.map(person => {
                  const highlighted = person.id === highlightedPersonId;
                  return (
                    <li
                      key={person.id}
                      id={`${regionId}-person-${person.id}`}
                      role="listitem"
                      data-roster-row={person.id}
                      data-highlight={highlighted ? "" : undefined}
                      aria-current={highlighted ? "true" : undefined}
                      // 40px STATIC row: name · position · ext · email + the
                      // copy-link icon button (PHASE3DS §1.20). No hover on the
                      // row — it is not a control; hover lives on the button.
                      // The highlighted row (a ?q= landing) takes the search
                      // surface + the 3px mark through [data-highlight].
                      className="sp-roster-row"
                    >
                      <span>{formatDisplayName(person.full_name)}</span>
                      <span className="sp-roster-meta">
                        {[person.position, person.phone_extension ? `ext. ${person.phone_extension}` : null].filter(Boolean).join(" · ") || "—"}
                      </span>
                      <span className="sp-roster-meta">{person.email ?? ""}</span>
                      <span className="sp-has-tooltip">
                        <button
                          type="button"
                          className="cds-btn cds-btn--icon cds-btn--sm"
                          aria-label={`Copy link for ${formatDisplayName(person.full_name)}`}
                          data-done={copiedId === person.id ? "Copied" : undefined}
                          onClick={() => void copyLinkFor(person)}
                        >
                          <CopyIcon />
                        </button>
                        <span className="sp-tooltip" role="tooltip">Copy link</span>
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
