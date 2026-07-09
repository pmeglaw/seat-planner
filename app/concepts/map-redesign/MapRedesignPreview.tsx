"use client";

/**
 * THROWAWAY design preview — "Ember Studio" map redesign (Phase 3.5).
 *
 * Owner-requested palette revision of the Phase 3 preview: same structure
 * (Plate & Dot markers, docked inspector, filter bar), re-skinned from the
 * rejected light "Counsel Ink" theme to the dark Ember Studio theme (dark
 * chrome, one orange ramp, the light floor raster framed gallery-style).
 * Live-code validation against the real published 60-seat map.
 *
 * Pure client-side prototype: static fixture data, no server actions, no
 * Supabase. Seats render at TRUE positions via the production transform chain
 * (lib/mapLayoutTransform seatsToVisualSeats -> lib/seatMath pointToStyle),
 * imported READ-ONLY. All styling is scoped under .ember-preview so nothing
 * leaks into shipped surfaces.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { pointToStyle } from "@/lib/seatMath";
import {
  MAP_IMAGE_HEIGHT,
  MAP_IMAGE_SRC,
  MAP_IMAGE_WIDTH,
  seatsToVisualSeats
} from "@/lib/mapLayoutTransform";
import { FIXTURE_SEATS, FIXTURE_ZONES, type FixtureSeat, type FixtureSeatStatus } from "./fixtureSeats";

type Surface = "admin" | "viewer";

const DEMO_RESERVED_LABELS = ["C02", "E06"];
const DEMO_UNAVAILABLE_LABELS = ["N05"];

const STATUS_LABELS: Record<FixtureSeatStatus, string> = {
  available: "Open",
  assigned: "Assigned",
  reserved: "Reserved",
  unavailable: "Unavailable"
};

const STATUS_ORDER: FixtureSeatStatus[] = ["available", "assigned", "reserved", "unavailable"];

function formatPersonName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/(^|[\s\-'.])[a-z0-9]/g, match => match.toUpperCase());
}

function personInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? "")
    .join("");
}

type FilterState = {
  department: string;
  zone: string;
  status: string;
  query: string;
};

function seatMatchesFilters(seat: FixtureSeat, filters: FilterState): boolean {
  if (filters.department !== "all" && seat.emp_department !== filters.department) return false;
  if (filters.zone !== "all" && seat.zone !== filters.zone) return false;
  if (filters.status !== "all" && seat.status !== filters.status) return false;
  const query = filters.query.trim().toLowerCase();
  if (query) {
    const haystack = [seat.label, seat.full_name ?? "", seat.zone, seat.emp_department ?? ""]
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(query)) return false;
  }
  return true;
}

function UndoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M7.5 4.5 3.5 8.5l4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.5 8.5h8.25a4.25 4.25 0 0 1 0 8.5H9.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M12.5 4.5l4 4-4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16.5 8.5H8.25a4.25 4.25 0 0 0 0 8.5h2.25" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="m13.5 13.5 3.25 3.25" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

type SeatMarkerButtonProps = {
  seat: FixtureSeat;
  positionStyle: React.CSSProperties;
  selected: boolean;
  matched: boolean;
  dimmed: boolean;
  showNames: boolean;
  onSelect: (seatKey: string) => void;
};

function SeatMarkerButton({ seat, positionStyle, selected, matched, dimmed, showNames, onSelect }: SeatMarkerButtonProps) {
  const displayName = seat.full_name ? formatPersonName(seat.full_name) : "Open seat";
  const occupied = Boolean(seat.full_name);
  const statusLabel = STATUS_LABELS[seat.status];
  const className = [
    "ember-marker",
    selected ? "is-selected" : "",
    matched ? "is-match" : "",
    dimmed && !selected ? "is-dimmed" : "",
    seat.is_custom ? "is-custom" : ""
  ]
    .filter(Boolean)
    .join(" ");

  let content: React.ReactNode;
  if (occupied) {
    content = showNames ? (
      <span className="ember-plate">
        <span className="ember-plate-dot" aria-hidden="true" />
        <span className="ember-plate-name">{displayName}</span>
        <span className="ember-plate-code">{seat.label}</span>
      </span>
    ) : (
      <span className="ember-plate ember-plate--initials">
        <span className="ember-plate-dot" aria-hidden="true" />
        <span className="ember-plate-name">{personInitials(seat.full_name ?? "")}</span>
      </span>
    );
  } else if (seat.status === "reserved") {
    content = (
      <span className="ember-plate ember-plate--reserved">
        <span className="ember-plate-dot ember-plate-dot--reserved" aria-hidden="true" />
        <span className="ember-plate-code ember-plate-code--reserved">{seat.label}</span>
        <span className="ember-plate-tagword">Reserved</span>
      </span>
    );
  } else if (seat.status === "unavailable") {
    content = (
      <>
        <span className="ember-dot ember-dot--unavailable" aria-hidden="true" />
        <span className="ember-code-tag" aria-hidden="true">
          {seat.label}
        </span>
      </>
    );
  } else {
    content = (
      <>
        <span className="ember-dot" aria-hidden="true" />
        <span className="ember-code-tag" aria-hidden="true">
          {seat.label}
        </span>
      </>
    );
  }

  return (
    <button
      type="button"
      className={className}
      style={positionStyle}
      data-seat-key={seat.seat_key}
      aria-pressed={selected}
      aria-label={`Seat ${seat.label} · ${displayName} · ${statusLabel} · ${seat.zone}`}
      title={`${seat.label} · ${displayName} · ${statusLabel}`}
      onClick={() => onSelect(seat.seat_key)}
    >
      {content}
    </button>
  );
}

type InspectorProps = {
  seat: FixtureSeat;
  surface: Surface;
  onClose: () => void;
};

function SeatInspectorDock({ seat, surface, onClose }: InspectorProps) {
  const occupied = Boolean(seat.full_name);
  const displayName = seat.full_name ? formatPersonName(seat.full_name) : "Open seat";
  const readOnly = surface === "viewer";
  const demoState = seat.status === "reserved" || seat.status === "unavailable";

  const fieldRows: Array<{ label: string; value: string | null; faint?: boolean }> = occupied
    ? [
        { label: "Job title", value: seat.position },
        { label: "Department", value: seat.emp_department },
        { label: "Email", value: "Not in directory", faint: true },
        { label: "Extension", value: seat.phone_extension },
        { label: "Zone", value: seat.zone },
        { label: "Seat", value: seat.label }
      ]
    : [
        { label: "Zone", value: seat.zone },
        { label: "Seat", value: seat.label }
      ];

  return (
    <aside className="ember-inspector" role="complementary" aria-label="Seat details">
      <div className="ember-insp-header">
        <span className="ember-insp-kicker">Seat {seat.label}</span>
        <button type="button" className="ember-insp-close" onClick={onClose} aria-label={`Close details for seat ${seat.label}`}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="m3.5 3.5 9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="ember-insp-body">
        <div className="ember-person">
          {occupied ? (
            <span className="ember-person-avatar" aria-hidden="true">
              {personInitials(seat.full_name ?? "")}
            </span>
          ) : (
            <span className="ember-person-avatar ember-person-avatar--open" aria-hidden="true">
              <span className="ember-person-avatar-dot" />
            </span>
          )}
          <div className="ember-person-meta">
            <div className="ember-person-name">{displayName}</div>
            <div className="ember-chiprow">
              {seat.status === "assigned" && (
                <span className="ember-chip ember-chip--assigned">
                  <span className="ember-chip-dot" aria-hidden="true" />
                  Assigned
                </span>
              )}
              {seat.status === "available" && <span className="ember-chip ember-chip--open">Open</span>}
              {seat.status === "reserved" && <span className="ember-chip ember-chip--reserved">Reserved</span>}
              {seat.status === "unavailable" && <span className="ember-chip ember-chip--unavailable">Unavailable</span>}
              {seat.is_custom && <span className="ember-chip ember-chip--custom">Custom seat</span>}
            </div>
          </div>
        </div>

        <dl className="ember-fields">
          {fieldRows.map(row => (
            <div className="ember-field" key={row.label}>
              <dt className="ember-field-label">{row.label}</dt>
              <dd
                className={[
                  "ember-field-value",
                  row.faint ? "ember-field-value--faint" : "",
                  !row.value ? "ember-field-value--empty" : ""
                ]
                  .filter(Boolean)
                  .join(" ")}
                title={row.faint ? "Data gap: this person has no email in the employee directory yet" : undefined}
              >
                {row.value ?? "—"}
              </dd>
            </div>
          ))}
        </dl>

        {!readOnly && (
          <div className="ember-notes">
            <label className="ember-field-label" htmlFor="ember-seat-note">
              Notes
            </label>
            <input
              id="ember-seat-note"
              className="ember-notes-input"
              type="text"
              placeholder="Add a seat note"
              aria-describedby="ember-seat-note-hint"
            />
            <p id="ember-seat-note-hint" className="ember-hint">
              Preview only — notes are not saved.
            </p>
          </div>
        )}
      </div>

      {readOnly ? (
        <p className="ember-insp-readonly">Read-only viewer surface — assignments change on the admin side and appear here after publish.</p>
      ) : demoState ? (
        <p className="ember-insp-readonly">Demo state — reserve and release actions are disabled in this preview.</p>
      ) : (
        <div className="ember-insp-footer">
          {occupied ? (
            <>
              <div className="ember-actionrow">
                <button type="button" className="ember-outlinebtn">
                  Move
                </button>
                <button type="button" className="ember-outlinebtn">
                  Swap
                </button>
                <button type="button" className="ember-outlinebtn ember-outlinebtn--danger">
                  Vacate
                </button>
              </div>
              <button type="button" className="ember-primarybtn">
                Change assignment
              </button>
            </>
          ) : (
            <button type="button" className="ember-primarybtn">
              Assign employee
            </button>
          )}
        </div>
      )}
    </aside>
  );
}

export function MapRedesignPreview() {
  const [surface, setSurface] = useState<Surface>("admin");
  const [filters, setFilters] = useState<FilterState>({ department: "all", zone: "all", status: "all", query: "" });
  const [showNames, setShowNames] = useState(true);
  const [demoStates, setDemoStates] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const selectedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    selectedKeyRef.current = selectedKey;
  }, [selectedKey]);

  const effectiveSeats = useMemo<FixtureSeat[]>(() => {
    if (!demoStates) return FIXTURE_SEATS;
    return FIXTURE_SEATS.map(seat => {
      if (DEMO_RESERVED_LABELS.includes(seat.label) && seat.status === "available") {
        return { ...seat, status: "reserved" as const };
      }
      if (DEMO_UNAVAILABLE_LABELS.includes(seat.label) && seat.status === "available") {
        return { ...seat, status: "unavailable" as const };
      }
      return seat;
    });
  }, [demoStates]);

  // Production call chain, replicated exactly: saved normalized coordinates go
  // through the per-area calibration transform (seatsToVisualSeats), and the
  // resulting visual point becomes a CSS percent position via pointToStyle.
  const visualPointByKey = useMemo(() => {
    const points = new Map<string, { x: number; y: number }>();
    for (const visualSeat of seatsToVisualSeats(FIXTURE_SEATS)) {
      points.set(visualSeat.seat_key, { x: visualSeat.x, y: visualSeat.y });
    }
    return points;
  }, []);

  const departmentOptions = useMemo(() => {
    const departments = new Set<string>();
    for (const seat of FIXTURE_SEATS) {
      if (seat.emp_department) departments.add(seat.emp_department);
    }
    return [...departments].sort((a, b) => a.localeCompare(b));
  }, []);

  const statusOptions = useMemo(() => {
    const present = new Set(effectiveSeats.map(seat => seat.status));
    return STATUS_ORDER.filter(status => present.has(status));
  }, [effectiveSeats]);

  const filtersActive =
    filters.query.trim() !== "" || filters.department !== "all" || filters.zone !== "all" || filters.status !== "all";

  const matchedKeys = useMemo(() => {
    if (!filtersActive) return null;
    return new Set(effectiveSeats.filter(seat => seatMatchesFilters(seat, filters)).map(seat => seat.seat_key));
  }, [effectiveSeats, filters, filtersActive]);

  const legendCounts = useMemo(() => {
    const scope = matchedKeys ? effectiveSeats.filter(seat => matchedKeys.has(seat.seat_key)) : effectiveSeats;
    return {
      assigned: scope.filter(seat => seat.status === "assigned").length,
      open: scope.filter(seat => seat.status === "available").length,
      reserved: scope.filter(seat => seat.status === "reserved").length
    };
  }, [effectiveSeats, matchedKeys]);

  const selectedSeat = selectedKey ? effectiveSeats.find(seat => seat.seat_key === selectedKey) ?? null : null;

  function closeInspector(returnFocus: boolean) {
    const key = selectedKeyRef.current;
    setSelectedKey(null);
    if (returnFocus && key && typeof document !== "undefined") {
      requestAnimationFrame(() => {
        document.querySelector<HTMLButtonElement>(`[data-seat-key="${key}"]`)?.focus();
      });
    }
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && selectedKeyRef.current) {
        event.preventDefault();
        const key = selectedKeyRef.current;
        setSelectedKey(null);
        requestAnimationFrame(() => {
          document.querySelector<HTMLButtonElement>(`[data-seat-key="${key}"]`)?.focus();
        });
        return;
      }

      const target = event.target as HTMLElement | null;
      const inEditable =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);
      const slashFocus = event.key === "/" && !inEditable && !event.metaKey && !event.ctrlKey && !event.altKey;
      const cmdKFocus = event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey);
      if (slashFocus || cmdKFocus) {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function handleSelectSeat(seatKey: string) {
    setSelectedKey(current => (current === seatKey ? null : seatKey));
  }

  const activeChips: Array<{ id: string; label: string; onRemove: () => void }> = [];
  if (filters.department !== "all") {
    activeChips.push({
      id: "department",
      label: `Department: ${filters.department}`,
      onRemove: () => setFilters(prev => ({ ...prev, department: "all" }))
    });
  }
  if (filters.zone !== "all") {
    activeChips.push({
      id: "zone",
      label: `Zone: ${filters.zone}`,
      onRemove: () => setFilters(prev => ({ ...prev, zone: "all" }))
    });
  }
  if (filters.status !== "all") {
    activeChips.push({
      id: "status",
      label: `Status: ${STATUS_LABELS[filters.status as FixtureSeatStatus] ?? filters.status}`,
      onRemove: () => setFilters(prev => ({ ...prev, status: "all" }))
    });
  }
  if (filters.query.trim() !== "") {
    activeChips.push({
      id: "query",
      label: `Search: “${filters.query.trim()}”`,
      onRemove: () => setFilters(prev => ({ ...prev, query: "" }))
    });
  }

  const isViewer = surface === "viewer";

  return (
    <div className={["ember-preview", selectedSeat ? "is-inspector-open" : ""].filter(Boolean).join(" ")}>
      <style>{EMBER_PREVIEW_CSS}</style>
      <h1 className="ember-sr-only">Seat Planner map redesign preview — Ember Studio</h1>

      <header className="ember-appbar">
        <div className="ember-brand">
          <span className="ember-brand-tile">
            <Image src="/images/megeredchian-mark.png" alt="Megeredchian Law brand mark" width={22} height={22} unoptimized />
          </span>
          <span className="ember-brand-text">
            <span className="ember-brand-name">Megeredchian Law</span>
            <span className="ember-brand-sub">Seat planner · {isViewer ? "Viewer" : "Admin"}</span>
          </span>
          {isViewer ? (
            <span className="ember-chip-draft ember-chip-draft--published">
              <span className="ember-chip-draft-dot ember-chip-draft-dot--published" aria-hidden="true" />
              Published · Read-only
            </span>
          ) : (
            <span className="ember-chip-draft">
              <span className="ember-chip-draft-dot" aria-hidden="true" />3 unpublished changes
            </span>
          )}
        </div>

        <div className="ember-search" role="search">
          <div className="ember-search-wrap">
            <span className="ember-search-icon" aria-hidden="true">
              <SearchIcon />
            </span>
            <input
              ref={searchRef}
              className="ember-search-input"
              type="text"
              value={filters.query}
              onChange={event => setFilters(prev => ({ ...prev, query: event.target.value }))}
              placeholder="Search people, seats, zones, departments"
              aria-label="Search people, seats, zones, or departments"
            />
            <kbd className="ember-kbd" aria-hidden="true">
              ⌘K
            </kbd>
          </div>
        </div>

        <div className="ember-appbar-actions">
          {!isViewer && (
            <>
              <button type="button" className="ember-iconbtn" aria-label="Undo (preview only)">
                <UndoIcon />
              </button>
              <button type="button" className="ember-iconbtn" aria-label="Redo (preview only)">
                <RedoIcon />
              </button>
              <button type="button" className="ember-ghostbtn">
                Management
              </button>
            </>
          )}
          {!isViewer && (
            <button type="button" className="ember-ghostbtn">
              Ask Planner
            </button>
          )}
          {!isViewer && (
            <button type="button" className="ember-publishbtn">
              Review &amp; publish
            </button>
          )}
          <div className="ember-seg" role="group" aria-label="Preview surface">
            <button type="button" aria-pressed={!isViewer} onClick={() => setSurface("admin")}>
              Admin
            </button>
            <button type="button" aria-pressed={isViewer} onClick={() => setSurface("viewer")}>
              Viewer
            </button>
          </div>
          <span className="ember-avatar" aria-hidden="true">
            PA
          </span>
        </div>
      </header>

      <div className="ember-filterbar">
        <div className="ember-filterbar-inner" role="toolbar" aria-label="Seat filters">
          <select
            className="ember-select"
            aria-label="Filter by department"
            value={filters.department}
            onChange={event => setFilters(prev => ({ ...prev, department: event.target.value }))}
          >
            <option value="all">Department · All</option>
            {departmentOptions.map(department => (
              <option key={department} value={department}>
                {department}
              </option>
            ))}
          </select>
          <select
            className="ember-select"
            aria-label="Filter by zone"
            value={filters.zone}
            onChange={event => setFilters(prev => ({ ...prev, zone: event.target.value }))}
          >
            <option value="all">Zone · All</option>
            {FIXTURE_ZONES.map(zone => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
          <select
            className="ember-select"
            aria-label="Filter by status"
            value={filters.status}
            onChange={event => setFilters(prev => ({ ...prev, status: event.target.value }))}
          >
            <option value="all">Status · All</option>
            {statusOptions.map(status => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>

          {activeChips.map(chip => (
            <span className="ember-fchip" key={chip.id}>
              {chip.label}
              <button type="button" onClick={chip.onRemove} aria-label={`Remove filter ${chip.label}`}>
                ×
              </button>
            </span>
          ))}
          {(activeChips.length > 0 || filtersActive) && (
            <button
              type="button"
              className="ember-clear"
              onClick={() => setFilters({ department: "all", zone: "all", status: "all", query: "" })}
            >
              Clear
            </button>
          )}

          <button
            type="button"
            className="ember-namesbtn"
            aria-pressed={showNames}
            onClick={() => setShowNames(current => !current)}
          >
            Names
          </button>

          <div className="ember-legend" aria-label="Seat status legend">
            <span className="ember-legend-item">
              <span className="ember-legend-dot ember-legend-dot--assigned" aria-hidden="true" />
              Assigned · {legendCounts.assigned}
            </span>
            <span className="ember-legend-item">
              <span className="ember-legend-dot ember-legend-dot--open" aria-hidden="true" />
              Open · {legendCounts.open}
            </span>
            <span className="ember-legend-item">
              <span className="ember-legend-dot ember-legend-dot--reserved" aria-hidden="true" />
              Reserved · {legendCounts.reserved}
            </span>
          </div>
        </div>
      </div>

      <div className={["ember-body", selectedSeat ? "is-open" : ""].filter(Boolean).join(" ")}>
        <div className="ember-mapcol">
          <div className="ember-demo-row">
            <span>Demo states:</span>
            <button
              type="button"
              className="ember-demo-toggle"
              aria-pressed={demoStates}
              onClick={() => setDemoStates(current => !current)}
            >
              Show reserved/unavailable examples
            </button>
            {demoStates && <span className="ember-demo-note">C02 + E06 painted reserved, N05 unavailable (preview only)</span>}
          </div>

          <div className="ember-mapcard">
            <div className="ember-mapstage">
              <Image
                src={MAP_IMAGE_SRC}
                alt="Office floor plan"
                width={MAP_IMAGE_WIDTH}
                height={MAP_IMAGE_HEIGHT}
                priority
                unoptimized
                className="ember-mapimage"
                draggable={false}
              />
              <div className="ember-marker-layer">
                {effectiveSeats.map(seat => {
                  const point = visualPointByKey.get(seat.seat_key) ?? { x: seat.x, y: seat.y };
                  const matched = matchedKeys ? matchedKeys.has(seat.seat_key) : false;
                  const dimmed = matchedKeys ? !matchedKeys.has(seat.seat_key) : false;
                  return (
                    <SeatMarkerButton
                      key={seat.seat_key}
                      seat={seat}
                      positionStyle={pointToStyle(point)}
                      selected={selectedKey === seat.seat_key}
                      matched={matched}
                      dimmed={dimmed}
                      showNames={showNames}
                      onSelect={handleSelectSeat}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="ember-inspector-col">
          {selectedSeat && <SeatInspectorDock seat={selectedSeat} surface={surface} onClose={() => closeInspector(true)} />}
        </div>
      </div>
    </div>
  );
}

const EMBER_PREVIEW_CSS = `
.ember-preview {
  /* Ember Studio design tokens — scoped to this preview root only.
     Dark chrome frames the light floor raster (gallery style); one orange ramp;
     every value below is contrast-measured against the surface it appears on
     (see docs/DESIGN_DIRECTION.md §5 — measured on the REAL floor pixels at the
     60 calibrated seat positions, not an assumed flat floor tone). */
  --ember-canvas: #090A0C;
  --ember-chrome-bg: #111316;
  --ember-panel: #181B20;
  --ember-raised: #22262D;
  --ember-elevated: #303641;
  --ember-border-subtle: #303641;
  --ember-border-strong: #48515E;
  --ember-hairline: rgba(255, 255, 255, 0.08);
  --ember-chrome-border: rgba(255, 255, 255, 0.08);

  --ember-text-primary: #F8FAFC;
  --ember-text-secondary: #E8E6E3;
  --ember-text-muted: #A7ADB5;
  --ember-text-disabled: #6B7280;

  /* One orange. Ink is the LOCKED text color for every orange fill:
     5.85:1 on accent, 7.04:1 on hover, 4.54:1 on pressed (all AA). */
  --ember-accent: #F45B2A;
  --ember-accent-hover: #FF7138;
  --ember-accent-pressed: #D94A1F;
  --ember-accent-deep: #A93818;
  --ember-ink: #140D04;
  --ember-accent-tint: rgba(244, 91, 42, 0.16);
  --ember-accent-glow: rgba(244, 91, 42, 0.35);
  --ember-on-tint: #FFB694;

  /* State families on dark chrome: 16% base tint + light text (all >= 5.8:1). */
  --ember-success-text: #8FD0AE;
  --ember-success-tint: rgba(63, 111, 89, 0.16);
  --ember-warning-text: #EFB868;
  --ember-warning-tint: rgba(180, 83, 9, 0.16);
  --ember-danger-text: #F0A896;
  --ember-info-text: #8CCBCE;

  /* Marker system — two-layer marks on the light floor (light casing + dark
     core so every floor patch, L 0.23–0.81 measured, sees >= 3:1 from one layer).
     Assigned plates are NEUTRAL DARK with an orange status dot — owner call
     2026-07-09 after the 60/60 full-occupancy study (full-orange plates drown
     the map); the dark fill alone clears every measured patch (min 4.02:1). */
  --ember-marker-open-ring: #3E4650;
  --ember-marker-unavailable-ring: #6B7280;
  --ember-plate-fill: #22262D;
  --ember-plate-border: #48515E;
  --ember-plate-name: #F8FAFC;
  --ember-plate-code: #A7ADB5;
  --ember-plate-dot: #F45B2A;
  --ember-reserved-tint: #FBEED3;
  --ember-reserved-accent: #7A4E00;
  --ember-match-tint: #DCEDEA;
  --ember-match-accent: #1D4042;
  --ember-selected-ring: #140D04;
  --ember-focus-rust: #542D12;
  --ember-dim-opacity: 0.4;

  --ember-legend-assigned: #F45B2A;
  --ember-legend-open: #A7ADB5;
  --ember-legend-reserved: #EFB868;
  --ember-legend-text: #A7ADB5;

  --ember-focus-ring: rgba(255, 113, 56, 0.9);

  height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--ember-canvas);
  color: var(--ember-text-primary);
  font-size: 14px;
  color-scheme: dark;
  scrollbar-color: var(--ember-border-strong) transparent;
}

.ember-preview *,
.ember-preview *::before,
.ember-preview *::after {
  box-sizing: border-box;
}

.ember-preview button {
  cursor: pointer;
  font: inherit;
}

.ember-preview button:focus-visible,
.ember-preview input:focus-visible,
.ember-preview select:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--ember-canvas), 0 0 0 6px var(--ember-focus-ring);
}

.ember-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* ---------- App bar (glass over the dark canvas only — never over the map) ---------- */

.ember-appbar {
  height: 56px;
  flex: none;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 16px;
  background: rgba(17, 19, 22, 0.72);
  -webkit-backdrop-filter: blur(20px);
  backdrop-filter: blur(20px);
  border-bottom: 1px solid var(--ember-chrome-border);
  color: var(--ember-text-primary);
  position: relative;
  z-index: 60;
}

.ember-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: none;
}

.ember-brand-tile {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: #FFFFFF;
  display: grid;
  place-items: center;
  overflow: hidden;
  flex: none;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.14), 0 2px 6px rgba(0, 0, 0, 0.5);
}

.ember-brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
  white-space: nowrap;
}

.ember-brand-name {
  font-size: 13px;
  font-weight: 700;
  color: var(--ember-text-primary);
}

.ember-brand-sub {
  font-size: 11px;
  color: var(--ember-text-muted);
}

.ember-chip-draft {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  margin-left: 10px;
  padding: 0 10px;
  border-radius: 999px;
  background: var(--ember-warning-tint);
  color: var(--ember-warning-text);
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

.ember-chip-draft-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--ember-warning-text);
  flex: none;
}

.ember-chip-draft--published {
  background: var(--ember-success-tint);
  color: var(--ember-success-text);
}

.ember-chip-draft-dot--published {
  background: var(--ember-success-text);
}

.ember-search {
  flex: 1;
  display: flex;
  justify-content: center;
  min-width: 0;
}

.ember-search-wrap {
  position: relative;
  width: 100%;
  max-width: 400px;
  min-width: 120px;
}

.ember-search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--ember-text-muted);
  display: grid;
  place-items: center;
  pointer-events: none;
}

.ember-search-input {
  width: 100%;
  height: 34px;
  border-radius: 10px;
  background: var(--ember-raised);
  border: 1px solid var(--ember-border-strong);
  color: var(--ember-text-primary);
  font-size: 12.5px;
  padding: 0 44px 0 30px;
}

.ember-search-input::placeholder {
  color: var(--ember-text-muted);
}

.ember-kbd {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 5px;
  padding: 1px 5px;
  font-size: 10px;
  font-family: inherit;
  color: var(--ember-text-muted);
  background: rgba(0, 0, 0, 0.25);
  pointer-events: none;
}

.ember-appbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
}

.ember-iconbtn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  color: var(--ember-text-muted);
  background: transparent;
  border: 1px solid transparent;
}

.ember-iconbtn:hover {
  background: var(--ember-elevated);
  color: var(--ember-text-primary);
}

.ember-ghostbtn {
  height: 32px;
  padding: 0 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--ember-text-primary);
  background: transparent;
  border: 1px solid transparent;
  white-space: nowrap;
}

.ember-ghostbtn:hover {
  background: var(--ember-elevated);
}

.ember-publishbtn {
  height: 34px;
  padding: 0 14px;
  border-radius: 10px;
  background: var(--ember-accent);
  color: var(--ember-ink);
  font-size: 12.5px;
  font-weight: 800;
  border: 0;
  white-space: nowrap;
}

.ember-publishbtn:hover {
  background: var(--ember-accent-hover);
}

.ember-publishbtn:active {
  background: var(--ember-accent-pressed);
}

.ember-seg {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 9px;
}

.ember-seg button {
  height: 26px;
  padding: 0 10px;
  border-radius: 7px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--ember-text-muted);
  background: transparent;
  border: 0;
  white-space: nowrap;
}

.ember-seg button[aria-pressed="true"] {
  background: var(--ember-elevated);
  color: var(--ember-text-primary);
}

.ember-avatar {
  width: 30px;
  height: 30px;
  border-radius: 999px;
  background: var(--ember-accent-tint);
  color: var(--ember-on-tint);
  display: grid;
  place-items: center;
  font-size: 11px;
  font-weight: 700;
  flex: none;
}

/* ---------- Filter bar ---------- */

.ember-filterbar {
  height: 44px;
  flex: none;
  display: flex;
  align-items: center;
  padding: 0 16px;
  background: var(--ember-chrome-bg);
  border-bottom: 1px solid var(--ember-chrome-border);
  position: relative;
  z-index: 50;
}

.ember-filterbar-inner {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-width: 0;
}

.ember-select {
  height: 28px;
  background: var(--ember-raised);
  color: var(--ember-text-primary);
  border: 1px solid var(--ember-border-strong);
  border-radius: 8px;
  font-size: 12px;
  padding: 0 8px;
  max-width: 180px;
}

.ember-fchip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 4px 0 10px;
  border-radius: 999px;
  background: rgba(248, 250, 252, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.14);
  color: var(--ember-text-primary);
  font-size: 11px;
  white-space: nowrap;
}

.ember-fchip button {
  width: 18px;
  height: 18px;
  border-radius: 999px;
  border: 0;
  background: transparent;
  color: var(--ember-text-muted);
  font-size: 13px;
  line-height: 1;
  display: grid;
  place-items: center;
}

.ember-fchip button:hover {
  background: rgba(248, 250, 252, 0.14);
  color: var(--ember-text-primary);
}

.ember-clear {
  border: 0;
  background: transparent;
  color: var(--ember-text-muted);
  font-size: 11.5px;
  text-decoration: underline;
  padding: 4px 6px;
  border-radius: 6px;
  white-space: nowrap;
}

.ember-clear:hover {
  color: var(--ember-text-primary);
}

.ember-namesbtn {
  height: 28px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: transparent;
  color: var(--ember-text-muted);
  font-size: 11.5px;
  font-weight: 600;
  white-space: nowrap;
}

.ember-namesbtn[aria-pressed="true"] {
  background: var(--ember-elevated);
  color: var(--ember-text-primary);
}

.ember-legend {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 14px;
  color: var(--ember-legend-text);
  font-size: 11.5px;
  white-space: nowrap;
  flex: none;
}

.ember-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.ember-legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  display: inline-block;
}

.ember-legend-dot--assigned {
  background: var(--ember-legend-assigned);
}

.ember-legend-dot--open {
  background: transparent;
  border: 1.5px solid var(--ember-legend-open);
}

.ember-legend-dot--reserved {
  background: var(--ember-legend-reserved);
}

/* ---------- Body grid: docked inspector resizes the map, never covers it ---------- */

.ember-body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr 0px;
  transition: grid-template-columns 260ms ease;
  background: var(--ember-canvas);
}

.ember-body.is-open {
  grid-template-columns: 1fr 360px;
}

.ember-mapcol {
  min-width: 0;
  overflow-y: auto;
  padding: 16px 20px 28px;
}

.ember-inspector-col {
  min-width: 0;
  overflow: hidden;
}

/* ---------- Map card: dark mat, lit artwork ---------- */

.ember-demo-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin: 0 0 10px;
  color: var(--ember-text-secondary);
  font-size: 12px;
}

.ember-demo-toggle {
  height: 26px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid var(--ember-border-strong);
  background: var(--ember-panel);
  color: var(--ember-text-secondary);
  font-size: 11.5px;
  font-weight: 600;
}

.ember-demo-toggle[aria-pressed="true"] {
  border-color: rgba(239, 184, 104, 0.5);
  background: var(--ember-warning-tint);
  color: var(--ember-warning-text);
}

.ember-demo-note {
  font-size: 11px;
  color: var(--ember-text-muted);
}

.ember-mapcard {
  background: var(--ember-panel);
  border: 1px solid var(--ember-border-subtle);
  border-radius: 16px;
  padding: 10px;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.04), 0 2px 6px rgba(0, 0, 0, 0.5), 0 28px 80px -24px rgba(0, 0, 0, 0.85);
}

.ember-mapstage {
  position: relative;
}

.ember-mapimage {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 10px;
  user-select: none;
}

.ember-marker-layer {
  position: absolute;
  inset: 0;
}

/* ---------- Seat markers: two-layer marks on the light floor ---------- */

.ember-marker {
  position: absolute;
  transform: translate(-50%, -50%);
  width: 40px;
  height: 40px;
  min-width: 40px;
  min-height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  z-index: 10;
}

.ember-marker:hover {
  z-index: 30;
}

.ember-marker.is-match {
  z-index: 20;
}

.ember-marker.is-selected {
  z-index: 40;
}

.ember-marker.is-dimmed {
  opacity: var(--ember-dim-opacity);
}

/* Markers sit on the light raster: keyboard focus uses the white-casing +
   rust double ring (>= 3:1 on every measured floor patch), not the chrome ring. */
.ember-marker:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px #FFFFFF, 0 0 0 5px var(--ember-focus-rust);
}

.ember-dot {
  width: 16px;
  height: 16px;
  border-radius: 999px;
  background: #FFFFFF;
  border: 2px solid var(--ember-marker-open-ring);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.45);
  transform-origin: center;
  transition: transform 140ms ease, box-shadow 140ms ease, background-color 140ms ease, border-color 140ms ease;
}

.ember-marker.is-custom .ember-dot {
  border-style: dashed;
}

.ember-marker.is-match .ember-dot {
  background: var(--ember-match-tint);
  border-color: var(--ember-match-accent);
}

.ember-marker.is-selected .ember-dot {
  box-shadow: 0 0 0 2px var(--ember-selected-ring), 0 0 0 7px var(--ember-accent-glow), 0 10px 22px rgba(0, 0, 0, 0.4);
  transform: scale(1.12);
}

.ember-dot--unavailable {
  position: relative;
  background: #FFFFFF;
  border-color: var(--ember-marker-unavailable-ring);
}

.ember-dot--unavailable::after {
  content: "";
  position: absolute;
  left: -4px;
  right: -4px;
  top: 50%;
  height: 2px;
  margin-top: -1px;
  border-radius: 2px;
  background: var(--ember-ink);
  transform: rotate(-45deg);
}

.ember-code-tag {
  position: absolute;
  bottom: calc(100% - 8px);
  left: 50%;
  transform: translateX(-50%);
  background: var(--ember-raised);
  border: 1px solid rgba(255, 255, 255, 0.16);
  color: var(--ember-text-primary);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.02em;
  padding: 1px 5px;
  border-radius: 6px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 120ms ease;
}

.ember-marker:hover .ember-code-tag,
.ember-marker:focus-visible .ember-code-tag {
  opacity: 1;
}

.ember-plate {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 9px 3px 7px;
  background: var(--ember-plate-fill);
  border: 1.5px solid var(--ember-plate-border);
  border-radius: 999px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.35), 0 4px 10px rgba(0, 0, 0, 0.28);
  white-space: nowrap;
  transform-origin: center;
  transition: transform 140ms ease, box-shadow 140ms ease, background-color 140ms ease, border-color 140ms ease;
}

.ember-plate-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--ember-plate-dot);
  flex: none;
}

.ember-plate-name {
  font-size: 11px;
  font-weight: 700;
  color: var(--ember-plate-name);
  line-height: 1.2;
}

.ember-plate-code {
  font-size: 10px;
  font-weight: 400;
  color: var(--ember-plate-code);
  line-height: 1.2;
}

.ember-plate--initials {
  padding: 3px 8px 3px 7px;
}

.ember-plate--reserved {
  background: var(--ember-reserved-tint);
  border-color: var(--ember-reserved-accent);
}

.ember-plate-dot--reserved {
  background: var(--ember-reserved-accent);
}

.ember-plate-code--reserved {
  color: var(--ember-reserved-accent);
  font-weight: 600;
}

.ember-plate-tagword {
  font-size: 9px;
  font-weight: 700;
  color: var(--ember-reserved-accent);
  line-height: 1.2;
}

.ember-marker.is-match .ember-plate {
  background: var(--ember-match-tint);
  border-color: var(--ember-match-accent);
}

.ember-marker.is-match .ember-plate-name,
.ember-marker.is-match .ember-plate-code,
.ember-marker.is-match .ember-plate-tagword {
  color: var(--ember-match-accent);
}

.ember-marker.is-match .ember-plate-dot {
  background: var(--ember-match-accent);
}

/* Selected = ember glow + counter-ring: white with a fine ink edge on the dark
   assigned plate (white vs plate 15.18:1, ink edge vs floor >= 9.11:1); plain
   ink ring on light marks — see the reserved/match exception below. */
.ember-marker.is-selected .ember-plate {
  box-shadow: 0 0 0 2px #FFFFFF, 0 0 0 3px rgba(20, 13, 4, 0.85), 0 0 0 8px var(--ember-accent-glow), 0 12px 26px rgba(0, 0, 0, 0.45);
  transform: scale(1.06);
}

.ember-marker.is-selected .ember-plate--reserved,
.ember-marker.is-match.is-selected .ember-plate {
  box-shadow: 0 0 0 2px var(--ember-selected-ring), 0 0 0 7px var(--ember-accent-glow), 0 12px 26px rgba(0, 0, 0, 0.45);
}

/* ---------- Docked inspector ---------- */

.ember-inspector {
  width: 360px;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--ember-panel);
  border-left: 1px solid var(--ember-border-subtle);
}

.ember-insp-header {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 10px;
}

.ember-insp-kicker {
  font-size: 12px;
  font-weight: 500;
  color: var(--ember-text-muted);
}

.ember-insp-close {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--ember-text-muted);
  display: grid;
  place-items: center;
}

.ember-insp-close:hover {
  background: var(--ember-elevated);
  color: var(--ember-text-primary);
}

.ember-insp-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 16px 16px;
}

.ember-person {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 0 14px;
}

.ember-person-avatar {
  width: 44px;
  height: 44px;
  border-radius: 999px;
  background: var(--ember-accent-tint);
  color: var(--ember-on-tint);
  display: grid;
  place-items: center;
  font-size: 15px;
  font-weight: 700;
  flex: none;
}

.ember-person-avatar--open {
  background: var(--ember-raised);
  border: 1px dashed var(--ember-border-strong);
}

.ember-person-avatar-dot {
  width: 14px;
  height: 14px;
  border-radius: 999px;
  background: #FFFFFF;
  border: 2px solid var(--ember-marker-open-ring);
}

.ember-person-meta {
  min-width: 0;
}

.ember-person-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--ember-text-primary);
  line-height: 1.25;
}

.ember-chiprow {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 5px;
}

.ember-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 20px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 600;
  border: 1px solid transparent;
}

.ember-chip-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--ember-accent);
  flex: none;
}

.ember-chip--assigned {
  background: var(--ember-accent-tint);
  color: var(--ember-on-tint);
}

.ember-chip--open {
  background: var(--ember-elevated);
  color: var(--ember-text-secondary);
}

.ember-chip--reserved {
  background: var(--ember-warning-tint);
  color: var(--ember-warning-text);
}

.ember-chip--unavailable {
  background: var(--ember-elevated);
  color: var(--ember-text-muted);
}

.ember-chip--custom {
  background: transparent;
  border: 1px dashed var(--ember-border-strong);
  color: var(--ember-text-muted);
}

.ember-fields {
  margin: 0;
  border-top: 1px solid var(--ember-hairline);
}

.ember-field {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 0;
  border-bottom: 1px solid var(--ember-hairline);
}

.ember-field-label {
  font-size: 12px;
  color: var(--ember-text-muted);
  flex: none;
}

.ember-field-value {
  margin: 0;
  font-size: 13px;
  color: var(--ember-text-primary);
  text-align: right;
  min-width: 0;
  overflow-wrap: anywhere;
}

.ember-field-value--empty {
  color: var(--ember-text-muted);
}

.ember-field-value--faint {
  color: var(--ember-text-muted);
  font-style: italic;
  text-decoration: underline dotted rgba(167, 173, 181, 0.5);
  text-underline-offset: 3px;
}

.ember-notes {
  margin-top: 14px;
}

.ember-notes-input {
  margin-top: 6px;
  width: 100%;
  height: 36px;
  border: 1px solid var(--ember-border-strong);
  border-radius: 10px;
  padding: 0 10px;
  font-size: 12.5px;
  color: var(--ember-text-primary);
  background: var(--ember-raised);
}

.ember-notes-input::placeholder {
  color: var(--ember-text-muted);
}

.ember-hint {
  margin: 5px 0 0;
  font-size: 10.5px;
  color: var(--ember-text-muted);
}

.ember-insp-footer {
  flex: none;
  border-top: 1px solid var(--ember-hairline);
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--ember-panel);
}

.ember-insp-readonly {
  flex: none;
  margin: 0;
  border-top: 1px solid var(--ember-hairline);
  padding: 12px 16px;
  font-size: 11.5px;
  line-height: 1.45;
  color: var(--ember-text-muted);
  background: var(--ember-panel);
}

.ember-actionrow {
  display: flex;
  gap: 8px;
}

.ember-outlinebtn {
  flex: 1;
  height: 32px;
  border-radius: 9px;
  border: 1px solid var(--ember-border-strong);
  background: transparent;
  color: var(--ember-text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.ember-outlinebtn:hover {
  background: var(--ember-raised);
}

.ember-outlinebtn--danger {
  color: var(--ember-danger-text);
}

.ember-primarybtn {
  height: 38px;
  border-radius: 10px;
  border: 0;
  background: var(--ember-accent);
  color: var(--ember-ink);
  font-size: 13px;
  font-weight: 800;
}

.ember-primarybtn:hover {
  background: var(--ember-accent-hover);
}

.ember-primarybtn:active {
  background: var(--ember-accent-pressed);
}

/* ---------- Responsive ---------- */

@media (max-width: 1180px) {
  .ember-ghostbtn {
    display: none;
  }

  .ember-kbd {
    display: none;
  }
}

@media (max-width: 900px) {
  .ember-preview {
    height: auto;
    min-height: 100dvh;
  }

  /* Preview-only bar diet: the Phase 4 mobile bar is its own design (52px +
     scrollable chips); here we just keep the palette demo from overflowing. */
  .ember-brand-text {
    display: none;
  }

  .ember-iconbtn {
    display: none;
  }

  .ember-chip-draft {
    display: none;
  }

  .ember-filterbar {
    overflow-x: auto;
  }

  .ember-filterbar-inner {
    min-width: max-content;
  }

  .ember-legend {
    margin-left: 12px;
  }

  .ember-body {
    display: block;
  }

  .ember-mapcol {
    overflow: visible;
    padding: 12px 12px 24px;
  }

  .ember-body.is-open .ember-mapcol {
    padding-bottom: 48dvh;
  }

  .ember-inspector-col {
    overflow: visible;
  }

  /* Non-modal bottom sheet: the map keeps its own scroll space above it. */
  .ember-inspector {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    width: auto;
    height: auto;
    max-height: 45dvh;
    border-left: 0;
    border-top: 1px solid var(--ember-border-strong);
    border-radius: 16px 16px 0 0;
    box-shadow: 0 -14px 34px rgba(0, 0, 0, 0.6);
    z-index: 70;
  }
}

@media (max-width: 640px) {
  .ember-publishbtn {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ember-preview *,
  .ember-preview *::before,
  .ember-preview *::after {
    transition: none !important;
  }

  .ember-marker.is-selected .ember-dot,
  .ember-marker.is-selected .ember-plate {
    transform: none;
  }
}
`;
