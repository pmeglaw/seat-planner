"use client";

/**
 * THROWAWAY design preview — "Counsel Ink" map redesign (Phase 3).
 *
 * Live-code validation of the map-touching redesign pieces against the real
 * published 60-seat map: the new seat-marker language, the DOCKED inspector
 * that coexists with the map (never covers it), and the filter-bar behavior.
 *
 * Pure client-side prototype: static fixture data, no server actions, no
 * Supabase. Seats render at TRUE positions via the production transform chain
 * (lib/mapLayoutTransform seatsToVisualSeats -> lib/seatMath pointToStyle),
 * imported READ-ONLY. All styling is scoped under .ink-preview so nothing
 * leaks into shipped surfaces.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { pointToStyle } from "@/lib/seatMath";
import {
  MAP_IMAGE_BLUR_DATA_URL,
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
    "ink-marker",
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
      <span className="ink-plate">
        <span className="ink-plate-dot" aria-hidden="true" />
        <span className="ink-plate-name">{displayName}</span>
        <span className="ink-plate-code">{seat.label}</span>
      </span>
    ) : (
      <span className="ink-plate ink-plate--initials">
        <span className="ink-plate-dot" aria-hidden="true" />
        <span className="ink-plate-name">{personInitials(seat.full_name ?? "")}</span>
      </span>
    );
  } else if (seat.status === "reserved") {
    content = (
      <span className="ink-plate ink-plate--reserved">
        <span className="ink-plate-dot ink-plate-dot--reserved" aria-hidden="true" />
        <span className="ink-plate-code ink-plate-code--reserved">{seat.label}</span>
        <span className="ink-plate-tagword">Reserved</span>
      </span>
    );
  } else if (seat.status === "unavailable") {
    content = (
      <>
        <span className="ink-dot ink-dot--unavailable" aria-hidden="true" />
        <span className="ink-code-tag" aria-hidden="true">
          {seat.label}
        </span>
      </>
    );
  } else {
    content = (
      <>
        <span className="ink-dot" aria-hidden="true" />
        <span className="ink-code-tag" aria-hidden="true">
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
    <aside className="ink-inspector" role="complementary" aria-label="Seat details">
      <div className="ink-insp-header">
        <span className="ink-insp-kicker">Seat {seat.label}</span>
        <button type="button" className="ink-insp-close" onClick={onClose} aria-label={`Close details for seat ${seat.label}`}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="m3.5 3.5 9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="ink-insp-body">
        <div className="ink-person">
          {occupied ? (
            <span className="ink-person-avatar" aria-hidden="true">
              {personInitials(seat.full_name ?? "")}
            </span>
          ) : (
            <span className="ink-person-avatar ink-person-avatar--open" aria-hidden="true">
              <span className="ink-person-avatar-dot" />
            </span>
          )}
          <div className="ink-person-meta">
            <div className="ink-person-name">{displayName}</div>
            <div className="ink-chiprow">
              {seat.status === "assigned" && (
                <span className="ink-chip ink-chip--assigned">
                  <span className="ink-chip-dot" aria-hidden="true" />
                  Assigned
                </span>
              )}
              {seat.status === "available" && <span className="ink-chip ink-chip--open">Open</span>}
              {seat.status === "reserved" && <span className="ink-chip ink-chip--reserved">Reserved</span>}
              {seat.status === "unavailable" && <span className="ink-chip ink-chip--unavailable">Unavailable</span>}
              {seat.is_custom && <span className="ink-chip ink-chip--custom">Custom seat</span>}
            </div>
          </div>
        </div>

        <dl className="ink-fields">
          {fieldRows.map(row => (
            <div className="ink-field" key={row.label}>
              <dt className="ink-field-label">{row.label}</dt>
              <dd
                className={[
                  "ink-field-value",
                  row.faint ? "ink-field-value--faint" : "",
                  !row.value ? "ink-field-value--empty" : ""
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
          <div className="ink-notes">
            <label className="ink-field-label" htmlFor="ink-seat-note">
              Notes
            </label>
            <input
              id="ink-seat-note"
              className="ink-notes-input"
              type="text"
              placeholder="Add a seat note"
              aria-describedby="ink-seat-note-hint"
            />
            <p id="ink-seat-note-hint" className="ink-hint">
              Preview only — notes are not saved.
            </p>
          </div>
        )}
      </div>

      {readOnly ? (
        <p className="ink-insp-readonly">Read-only viewer surface — assignments change on the admin side and appear here after publish.</p>
      ) : demoState ? (
        <p className="ink-insp-readonly">Demo state — reserve and release actions are disabled in this preview.</p>
      ) : (
        <div className="ink-insp-footer">
          {occupied ? (
            <>
              <div className="ink-actionrow">
                <button type="button" className="ink-outlinebtn">
                  Move
                </button>
                <button type="button" className="ink-outlinebtn">
                  Swap
                </button>
                <button type="button" className="ink-outlinebtn ink-outlinebtn--danger">
                  Vacate
                </button>
              </div>
              <button type="button" className="ink-primarybtn">
                Edit assignment
              </button>
            </>
          ) : (
            <button type="button" className="ink-primarybtn">
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
    <div className={["ink-preview", selectedSeat ? "is-inspector-open" : ""].filter(Boolean).join(" ")}>
      <style>{INK_PREVIEW_CSS}</style>
      <h1 className="ink-sr-only">Seat Planner map redesign preview — Counsel Ink</h1>

      <header className="ink-appbar">
        <div className="ink-brand">
          <span className="ink-brand-tile">
            <Image src="/images/megeredchian-mark.png" alt="Megeredchian Law brand mark" width={22} height={22} unoptimized />
          </span>
          <span className="ink-brand-text">
            <span className="ink-brand-name">Megeredchian Law</span>
            <span className="ink-brand-sub">Seat planner · {isViewer ? "Viewer" : "Admin"}</span>
          </span>
          {isViewer ? (
            <span className="ink-chip-draft ink-chip-draft--published">
              <span className="ink-chip-draft-dot ink-chip-draft-dot--published" aria-hidden="true" />
              Published · Read-only
            </span>
          ) : (
            <span className="ink-chip-draft">
              <span className="ink-chip-draft-dot" aria-hidden="true" />3 unpublished changes
            </span>
          )}
        </div>

        <div className="ink-search" role="search">
          <div className="ink-search-wrap">
            <span className="ink-search-icon" aria-hidden="true">
              <SearchIcon />
            </span>
            <input
              ref={searchRef}
              className="ink-search-input"
              type="text"
              value={filters.query}
              onChange={event => setFilters(prev => ({ ...prev, query: event.target.value }))}
              placeholder="Search people, seats, zones, departments"
              aria-label="Search people, seats, zones, or departments"
            />
            <kbd className="ink-kbd" aria-hidden="true">
              ⌘K
            </kbd>
          </div>
        </div>

        <div className="ink-appbar-actions">
          {!isViewer && (
            <>
              <button type="button" className="ink-iconbtn" aria-label="Undo (preview only)">
                <UndoIcon />
              </button>
              <button type="button" className="ink-iconbtn" aria-label="Redo (preview only)">
                <RedoIcon />
              </button>
              <button type="button" className="ink-ghostbtn">
                Management
              </button>
            </>
          )}
          {!isViewer && (
            <button type="button" className="ink-ghostbtn">
              Ask Planner
            </button>
          )}
          {!isViewer && (
            <button type="button" className="ink-publishbtn">
              Review &amp; publish
            </button>
          )}
          <div className="ink-seg" role="group" aria-label="Preview surface">
            <button type="button" aria-pressed={!isViewer} onClick={() => setSurface("admin")}>
              Admin
            </button>
            <button type="button" aria-pressed={isViewer} onClick={() => setSurface("viewer")}>
              Viewer
            </button>
          </div>
          <span className="ink-avatar" aria-hidden="true">
            PA
          </span>
        </div>
      </header>

      <div className="ink-filterbar">
        <div className="ink-filterbar-inner" role="toolbar" aria-label="Seat filters">
          <select
            className="ink-select"
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
            className="ink-select"
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
            className="ink-select"
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
            <span className="ink-fchip" key={chip.id}>
              {chip.label}
              <button type="button" onClick={chip.onRemove} aria-label={`Remove filter ${chip.label}`}>
                ×
              </button>
            </span>
          ))}
          {(activeChips.length > 0 || filtersActive) && (
            <button
              type="button"
              className="ink-clear"
              onClick={() => setFilters({ department: "all", zone: "all", status: "all", query: "" })}
            >
              Clear
            </button>
          )}

          <button
            type="button"
            className="ink-namesbtn"
            aria-pressed={showNames}
            onClick={() => setShowNames(current => !current)}
          >
            Names
          </button>

          <div className="ink-legend" aria-label="Seat status legend">
            <span className="ink-legend-item">
              <span className="ink-legend-dot ink-legend-dot--assigned" aria-hidden="true" />
              Assigned · {legendCounts.assigned}
            </span>
            <span className="ink-legend-item">
              <span className="ink-legend-dot ink-legend-dot--open" aria-hidden="true" />
              Open · {legendCounts.open}
            </span>
            <span className="ink-legend-item">
              <span className="ink-legend-dot ink-legend-dot--reserved" aria-hidden="true" />
              Reserved · {legendCounts.reserved}
            </span>
          </div>
        </div>
      </div>

      <div className={["ink-body", selectedSeat ? "is-open" : ""].filter(Boolean).join(" ")}>
        <div className="ink-mapcol">
          <div className="ink-demo-row">
            <span>Demo states:</span>
            <button
              type="button"
              className="ink-demo-toggle"
              aria-pressed={demoStates}
              onClick={() => setDemoStates(current => !current)}
            >
              Show reserved/unavailable examples
            </button>
            {demoStates && <span className="ink-demo-note">C02 + E06 painted reserved, N05 unavailable (preview only)</span>}
          </div>

          <div className="ink-mapcard">
            <div className="ink-mapstage">
              <Image
                src={MAP_IMAGE_SRC}
                alt="Office floor plan"
                width={MAP_IMAGE_WIDTH}
                height={MAP_IMAGE_HEIGHT}
                priority
                unoptimized
                placeholder="blur"
                blurDataURL={MAP_IMAGE_BLUR_DATA_URL}
                className="ink-mapimage"
                draggable={false}
              />
              <div className="ink-marker-layer">
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

        <div className="ink-inspector-col">
          {selectedSeat && <SeatInspectorDock seat={selectedSeat} surface={surface} onClose={() => closeInspector(true)} />}
        </div>
      </div>
    </div>
  );
}

const INK_PREVIEW_CSS = `
.ink-preview {
  /* Counsel Ink design tokens — scoped to this preview root only. */
  --ink-chrome-bg: #26221E;
  --ink-chrome-elevated: #322C26;
  --ink-chrome-border: #453D33;
  --ink-chrome-text: #F5F1EA;
  --ink-chrome-text-muted: #B8B0A4;
  --ink-filterbar-bg: #2E2823;
  --ink-brand-orange: #F26E22;
  --ink-on-orange: #231D18;
  --ink-action-primary: #B2430F;
  --ink-copper: #D46A24;
  --ink-brand-paper: #F6E7D8;
  --ink-clay: #6F2C13;
  --ink-canvas: #E7E5E1;
  --ink-surface: #FCFBF9;
  --ink-raised: #FFFFFF;
  --ink-border-subtle: #E8E4DD;
  --ink-border-strong: #D5CFC5;
  --ink-text-primary: #201D1A;
  --ink-text-secondary: #4A443E;
  --ink-text-muted: #5E574E;
  --ink-success: #3F6F59;
  --ink-warning: #9A6418;
  --ink-danger: #963D2F;
  --ink-search-accent: #2F6668;
  --ink-search-surface: #DCEDEA;
  --ink-search-text: #1D4042;
  --ink-marker-open-ring: #6E747A;
  --ink-plate-border: #C9C3BA;
  --ink-plate-text: #201D1A;
  --ink-plate-code: #5E574E;
  --ink-selected-ring: #B8541A;
  --ink-unavailable: #B6B0A7;
  --ink-dim-opacity: 0.4;
  --ink-legend-assigned: #6FA98C;
  --ink-legend-open: #8A9096;
  --ink-legend-reserved: #C98A3D;
  --ink-legend-text: #C9C2B6;
  --ink-inspector-edge: #D8D2C8;
  --ink-hairline: #ECE8E1;

  height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--ink-canvas);
  color: var(--ink-text-primary);
  font-size: 14px;
}

.ink-preview *,
.ink-preview *::before,
.ink-preview *::after {
  box-sizing: border-box;
}

.ink-preview button {
  cursor: pointer;
  font: inherit;
}

.ink-preview button:focus-visible,
.ink-preview input:focus-visible,
.ink-preview select:focus-visible {
  outline: none;
  box-shadow: 0 0 0 4px rgba(212, 106, 36, 0.55);
}

.ink-sr-only {
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

/* ---------- App bar ---------- */

.ink-appbar {
  height: 56px;
  flex: none;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 16px;
  background: var(--ink-chrome-bg);
  border-bottom: 1px solid var(--ink-chrome-border);
  color: var(--ink-chrome-text);
  position: relative;
  z-index: 60;
}

.ink-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: none;
}

.ink-brand-tile {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: #FFFFFF;
  display: grid;
  place-items: center;
  overflow: hidden;
  flex: none;
  box-shadow: inset 0 0 0 1px rgba(32, 29, 26, 0.08);
}

.ink-brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
  white-space: nowrap;
}

.ink-brand-name {
  font-size: 13px;
  font-weight: 700;
  color: var(--ink-chrome-text);
}

.ink-brand-sub {
  font-size: 11px;
  color: var(--ink-chrome-text-muted);
}

.ink-chip-draft {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  margin-left: 10px;
  padding: 0 10px;
  border-radius: 999px;
  background: #3A332C;
  color: #F0C9A8;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

.ink-chip-draft-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: #C98A3D;
  flex: none;
}

.ink-chip-draft--published {
  color: var(--ink-legend-text);
}

.ink-chip-draft-dot--published {
  background: var(--ink-legend-assigned);
}

.ink-search {
  flex: 1;
  display: flex;
  justify-content: center;
  min-width: 0;
}

.ink-search-wrap {
  position: relative;
  width: 100%;
  max-width: 400px;
  min-width: 120px;
}

.ink-search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--ink-chrome-text-muted);
  display: grid;
  place-items: center;
  pointer-events: none;
}

.ink-search-input {
  width: 100%;
  height: 34px;
  border-radius: 10px;
  background: var(--ink-chrome-elevated);
  border: 1px solid #4A4239;
  color: var(--ink-chrome-text);
  font-size: 12.5px;
  padding: 0 44px 0 30px;
}

.ink-search-input::placeholder {
  color: var(--ink-chrome-text-muted);
}

.ink-kbd {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  border: 1px solid #4A4239;
  border-radius: 5px;
  padding: 1px 5px;
  font-size: 10px;
  font-family: inherit;
  color: var(--ink-chrome-text-muted);
  background: rgba(0, 0, 0, 0.18);
  pointer-events: none;
}

.ink-appbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
}

.ink-iconbtn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  color: var(--ink-chrome-text-muted);
  background: transparent;
  border: 1px solid transparent;
}

.ink-iconbtn:hover {
  background: var(--ink-chrome-elevated);
  color: var(--ink-chrome-text);
}

.ink-ghostbtn {
  height: 32px;
  padding: 0 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--ink-chrome-text);
  background: transparent;
  border: 1px solid transparent;
  white-space: nowrap;
}

.ink-ghostbtn:hover {
  background: var(--ink-chrome-elevated);
}

.ink-publishbtn {
  height: 34px;
  padding: 0 14px;
  border-radius: 10px;
  background: var(--ink-brand-orange);
  color: var(--ink-on-orange);
  font-size: 12.5px;
  font-weight: 700;
  border: 0;
  white-space: nowrap;
}

.ink-publishbtn:hover {
  filter: brightness(1.06);
}

.ink-seg {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  background: var(--ink-chrome-elevated);
  border: 1px solid var(--ink-chrome-border);
  border-radius: 9px;
}

.ink-seg button {
  height: 26px;
  padding: 0 10px;
  border-radius: 7px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--ink-chrome-text-muted);
  background: transparent;
  border: 0;
  white-space: nowrap;
}

.ink-seg button[aria-pressed="true"] {
  background: #453D33;
  color: var(--ink-chrome-text);
}

.ink-avatar {
  width: 30px;
  height: 30px;
  border-radius: 999px;
  background: var(--ink-copper);
  color: #FFFFFF;
  display: grid;
  place-items: center;
  font-size: 11px;
  font-weight: 700;
  flex: none;
}

/* ---------- Filter bar ---------- */

.ink-filterbar {
  height: 44px;
  flex: none;
  display: flex;
  align-items: center;
  padding: 0 16px;
  background: var(--ink-filterbar-bg);
  border-bottom: 1px solid var(--ink-chrome-border);
  position: relative;
  z-index: 50;
}

.ink-filterbar-inner {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-width: 0;
}

.ink-select {
  height: 28px;
  background: var(--ink-chrome-elevated);
  color: var(--ink-chrome-text);
  border: 1px solid #4A4239;
  border-radius: 8px;
  font-size: 12px;
  padding: 0 8px;
  max-width: 180px;
}

.ink-fchip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 4px 0 10px;
  border-radius: 999px;
  background: rgba(245, 241, 234, 0.08);
  border: 1px solid #4A4239;
  color: var(--ink-chrome-text);
  font-size: 11px;
  white-space: nowrap;
}

.ink-fchip button {
  width: 18px;
  height: 18px;
  border-radius: 999px;
  border: 0;
  background: transparent;
  color: var(--ink-chrome-text-muted);
  font-size: 13px;
  line-height: 1;
  display: grid;
  place-items: center;
}

.ink-fchip button:hover {
  background: rgba(245, 241, 234, 0.14);
  color: var(--ink-chrome-text);
}

.ink-clear {
  border: 0;
  background: transparent;
  color: var(--ink-legend-text);
  font-size: 11.5px;
  text-decoration: underline;
  padding: 4px 6px;
  border-radius: 6px;
  white-space: nowrap;
}

.ink-namesbtn {
  height: 28px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid #4A4239;
  background: transparent;
  color: var(--ink-chrome-text-muted);
  font-size: 11.5px;
  font-weight: 600;
  white-space: nowrap;
}

.ink-namesbtn[aria-pressed="true"] {
  background: #453D33;
  color: var(--ink-chrome-text);
}

.ink-legend {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 14px;
  color: var(--ink-legend-text);
  font-size: 11.5px;
  white-space: nowrap;
  flex: none;
}

.ink-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.ink-legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  display: inline-block;
}

.ink-legend-dot--assigned {
  background: var(--ink-legend-assigned);
}

.ink-legend-dot--open {
  background: transparent;
  border: 1.5px solid var(--ink-legend-open);
}

.ink-legend-dot--reserved {
  background: var(--ink-legend-reserved);
}

/* ---------- Body grid: docked inspector resizes the map, never covers it ---------- */

.ink-body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr 0px;
  transition: grid-template-columns 260ms ease;
  background: var(--ink-canvas);
}

.ink-body.is-open {
  grid-template-columns: 1fr 360px;
}

.ink-mapcol {
  min-width: 0;
  overflow-y: auto;
  padding: 16px 20px 28px;
}

.ink-inspector-col {
  min-width: 0;
  overflow: hidden;
}

/* ---------- Map card ---------- */

.ink-demo-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin: 0 0 10px;
  color: var(--ink-text-secondary);
  font-size: 12px;
}

.ink-demo-toggle {
  height: 26px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid var(--ink-border-strong);
  background: var(--ink-surface);
  color: var(--ink-text-secondary);
  font-size: 11.5px;
  font-weight: 600;
}

.ink-demo-toggle[aria-pressed="true"] {
  border-color: var(--ink-warning);
  background: rgba(154, 100, 24, 0.1);
  color: var(--ink-warning);
}

.ink-demo-note {
  font-size: 11px;
  color: var(--ink-text-muted);
}

.ink-mapcard {
  background: var(--ink-surface);
  border: 1px solid var(--ink-border-subtle);
  border-radius: 16px;
  padding: 10px;
  box-shadow: 0 1px 2px rgba(32, 29, 26, 0.06), 0 18px 44px -20px rgba(32, 29, 26, 0.28);
}

.ink-mapstage {
  position: relative;
}

.ink-mapimage {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 10px;
  user-select: none;
}

.ink-marker-layer {
  position: absolute;
  inset: 0;
}

/* ---------- Seat markers ---------- */

.ink-marker {
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

.ink-marker:hover {
  z-index: 30;
}

.ink-marker.is-match {
  z-index: 20;
}

.ink-marker.is-selected {
  z-index: 40;
}

.ink-marker.is-dimmed {
  opacity: var(--ink-dim-opacity);
}

.ink-dot {
  width: 16px;
  height: 16px;
  border-radius: 999px;
  background: #FFFFFF;
  border: 2px solid var(--ink-marker-open-ring);
  box-shadow: 0 1px 3px rgba(32, 29, 26, 0.28);
  transform-origin: center;
  transition: transform 140ms ease, box-shadow 140ms ease, background-color 140ms ease, border-color 140ms ease;
}

.ink-marker.is-custom .ink-dot {
  border-style: dashed;
}

.ink-marker.is-match .ink-dot {
  background: var(--ink-search-surface);
  border-color: var(--ink-search-accent);
}

.ink-marker.is-selected .ink-dot {
  box-shadow: 0 0 0 2px var(--ink-selected-ring), 0 10px 22px rgba(32, 29, 26, 0.3);
  transform: scale(1.12);
}

.ink-dot--unavailable {
  position: relative;
  background: var(--ink-unavailable);
  border-color: var(--ink-unavailable);
}

.ink-dot--unavailable::after {
  content: "";
  position: absolute;
  left: -4px;
  right: -4px;
  top: 50%;
  height: 2px;
  margin-top: -1px;
  border-radius: 2px;
  background: rgba(32, 29, 26, 0.55);
  transform: rotate(-45deg);
}

.ink-code-tag {
  position: absolute;
  bottom: calc(100% - 8px);
  left: 50%;
  transform: translateX(-50%);
  background: var(--ink-raised);
  border: 1px solid var(--ink-plate-border);
  color: var(--ink-plate-code);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.02em;
  padding: 1px 5px;
  border-radius: 6px;
  box-shadow: 0 2px 6px rgba(32, 29, 26, 0.18);
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 120ms ease;
}

.ink-marker:hover .ink-code-tag,
.ink-marker:focus-visible .ink-code-tag {
  opacity: 1;
}

.ink-plate {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 9px 3px 7px;
  background: var(--ink-raised);
  border: 1px solid var(--ink-plate-border);
  border-radius: 999px;
  box-shadow: 0 1px 2px rgba(32, 29, 26, 0.1), 0 4px 10px rgba(32, 29, 26, 0.09);
  white-space: nowrap;
  transform-origin: center;
  transition: transform 140ms ease, box-shadow 140ms ease, background-color 140ms ease, border-color 140ms ease;
}

.ink-plate-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--ink-success);
  flex: none;
}

.ink-plate-name {
  font-size: 11px;
  font-weight: 600;
  color: var(--ink-plate-text);
  line-height: 1.2;
}

.ink-plate-code {
  font-size: 10px;
  color: var(--ink-plate-code);
  line-height: 1.2;
}

.ink-plate--initials {
  padding: 3px 8px 3px 7px;
}

.ink-plate--reserved {
  background: var(--ink-brand-paper);
  border-color: rgba(154, 100, 24, 0.55);
}

.ink-plate-dot--reserved {
  background: var(--ink-warning);
}

.ink-plate-code--reserved {
  color: var(--ink-plate-text);
  font-weight: 600;
}

.ink-plate-tagword {
  font-size: 9px;
  font-weight: 700;
  color: var(--ink-warning);
  line-height: 1.2;
}

.ink-marker.is-match .ink-plate {
  background: var(--ink-search-surface);
  border-color: var(--ink-search-accent);
}

.ink-marker.is-match .ink-plate-name,
.ink-marker.is-match .ink-plate-code,
.ink-marker.is-match .ink-plate-tagword {
  color: var(--ink-search-text);
}

.ink-marker.is-match .ink-plate-dot {
  background: var(--ink-search-accent);
}

.ink-marker.is-selected .ink-plate {
  box-shadow: 0 0 0 2px var(--ink-selected-ring), 0 12px 26px rgba(32, 29, 26, 0.3);
  transform: scale(1.06);
}

/* ---------- Docked inspector ---------- */

.ink-inspector {
  width: 360px;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--ink-raised);
  border-left: 1px solid var(--ink-inspector-edge);
}

.ink-insp-header {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 10px;
}

.ink-insp-kicker {
  font-size: 12px;
  font-weight: 500;
  color: var(--ink-text-muted);
}

.ink-insp-close {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--ink-text-muted);
  display: grid;
  place-items: center;
}

.ink-insp-close:hover {
  background: var(--ink-border-subtle);
  color: var(--ink-text-primary);
}

.ink-insp-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 16px 16px;
}

.ink-person {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 0 14px;
}

.ink-person-avatar {
  width: 44px;
  height: 44px;
  border-radius: 999px;
  background: var(--ink-brand-paper);
  color: var(--ink-clay);
  display: grid;
  place-items: center;
  font-size: 15px;
  font-weight: 700;
  flex: none;
}

.ink-person-avatar--open {
  background: var(--ink-canvas);
  border: 1px dashed var(--ink-border-strong);
}

.ink-person-avatar-dot {
  width: 14px;
  height: 14px;
  border-radius: 999px;
  background: #FFFFFF;
  border: 2px solid var(--ink-marker-open-ring);
}

.ink-person-meta {
  min-width: 0;
}

.ink-person-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--ink-text-primary);
  line-height: 1.25;
}

.ink-chiprow {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 5px;
}

.ink-chip {
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

.ink-chip-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--ink-success);
  flex: none;
}

.ink-chip--assigned {
  background: #E4EFE9;
  color: #2A4F3F;
}

.ink-chip--open {
  background: var(--ink-border-subtle);
  color: var(--ink-text-secondary);
}

.ink-chip--reserved {
  background: rgba(154, 100, 24, 0.14);
  color: var(--ink-warning);
}

.ink-chip--unavailable {
  background: var(--ink-border-subtle);
  color: var(--ink-text-muted);
}

.ink-chip--custom {
  background: transparent;
  border: 1px dashed var(--ink-plate-border);
  color: var(--ink-text-muted);
}

.ink-fields {
  margin: 0;
  border-top: 1px solid var(--ink-hairline);
}

.ink-field {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 0;
  border-bottom: 1px solid var(--ink-hairline);
}

.ink-field-label {
  font-size: 12px;
  color: var(--ink-text-muted);
  flex: none;
}

.ink-field-value {
  margin: 0;
  font-size: 13px;
  color: var(--ink-text-primary);
  text-align: right;
  min-width: 0;
  overflow-wrap: anywhere;
}

.ink-field-value--empty {
  color: var(--ink-text-muted);
}

.ink-field-value--faint {
  color: var(--ink-text-muted);
  opacity: 0.75;
  font-style: italic;
  text-decoration: underline dotted rgba(94, 87, 78, 0.5);
  text-underline-offset: 3px;
}

.ink-notes {
  margin-top: 14px;
}

.ink-notes-input {
  margin-top: 6px;
  width: 100%;
  height: 36px;
  border: 1px solid var(--ink-border-strong);
  border-radius: 10px;
  padding: 0 10px;
  font-size: 12.5px;
  color: var(--ink-text-primary);
  background: var(--ink-surface);
}

.ink-notes-input::placeholder {
  color: var(--ink-text-muted);
}

.ink-hint {
  margin: 5px 0 0;
  font-size: 10.5px;
  color: var(--ink-text-muted);
}

.ink-insp-footer {
  flex: none;
  border-top: 1px solid var(--ink-hairline);
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--ink-raised);
}

.ink-insp-readonly {
  flex: none;
  margin: 0;
  border-top: 1px solid var(--ink-hairline);
  padding: 12px 16px;
  font-size: 11.5px;
  line-height: 1.45;
  color: var(--ink-text-muted);
  background: var(--ink-raised);
}

.ink-actionrow {
  display: flex;
  gap: 8px;
}

.ink-outlinebtn {
  flex: 1;
  height: 32px;
  border-radius: 9px;
  border: 1px solid var(--ink-border-strong);
  background: var(--ink-raised);
  color: var(--ink-text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.ink-outlinebtn:hover {
  background: var(--ink-surface);
}

.ink-outlinebtn--danger {
  color: var(--ink-danger);
}

.ink-primarybtn {
  height: 38px;
  border-radius: 10px;
  border: 0;
  background: var(--ink-action-primary);
  color: #FFFFFF;
  font-size: 13px;
  font-weight: 700;
}

.ink-primarybtn:hover {
  filter: brightness(1.07);
}

/* ---------- Responsive ---------- */

@media (max-width: 1180px) {
  .ink-ghostbtn {
    display: none;
  }

  .ink-kbd {
    display: none;
  }
}

@media (max-width: 900px) {
  .ink-preview {
    height: auto;
    min-height: 100dvh;
  }

  .ink-brand-sub {
    display: none;
  }

  .ink-chip-draft {
    display: none;
  }

  .ink-filterbar {
    overflow-x: auto;
  }

  .ink-filterbar-inner {
    min-width: max-content;
  }

  .ink-legend {
    margin-left: 12px;
  }

  .ink-body {
    display: block;
  }

  .ink-mapcol {
    overflow: visible;
    padding: 12px 12px 24px;
  }

  .ink-body.is-open .ink-mapcol {
    padding-bottom: 48dvh;
  }

  .ink-inspector-col {
    overflow: visible;
  }

  /* Non-modal bottom sheet: the map keeps its own scroll space above it. */
  .ink-inspector {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    width: auto;
    height: auto;
    max-height: 45dvh;
    border-left: 0;
    border-top: 1px solid var(--ink-inspector-edge);
    border-radius: 16px 16px 0 0;
    box-shadow: 0 -14px 34px rgba(32, 29, 26, 0.22);
    z-index: 70;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ink-preview *,
  .ink-preview *::before,
  .ink-preview *::after {
    transition: none !important;
  }

  .ink-marker.is-selected .ink-dot,
  .ink-marker.is-selected .ink-plate {
    transform: none;
  }
}
`;
