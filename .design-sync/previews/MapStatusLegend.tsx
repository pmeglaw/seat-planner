import { MapStatusLegend } from "seat-planner";
import type { ReactNode } from "react";

// Floating legend card shared by the admin map and the viewer. Entries,
// summary, actions, and footer come from the parent; dot classes below are
// the exact accent classes SeatMap's SEAT_STATUS_LEGEND passes.

type LegendEntry = { key: string; label: string; dotClassName: string; count: number };

const entries = (assigned: number, open: number, reserved: number, unavailable: number): LegendEntry[] => [
  { key: "assigned", label: "Assigned", dotClassName: "bg-[var(--admin-marker-assigned-accent)]", count: assigned },
  { key: "available", label: "Open", dotClassName: "bg-[var(--admin-marker-available-accent)]", count: open },
  { key: "reserved", label: "Reserved", dotClassName: "bg-[var(--admin-marker-reserved-accent)]", count: reserved },
  { key: "unavailable", label: "Unavailable", dotClassName: "bg-[var(--admin-marker-unavailable-accent)]", count: unavailable }
];

// Verbatim from SeatMap.tsx (compiled classes): the filtered-state action pair
// and the admin "Show occupant names" footer toggle.
const resultActionButtonClassName =
  "inline-flex min-h-8 items-center justify-center rounded-lg border border-[var(--admin-border-strong)] bg-[var(--admin-surface)] px-3 py-1.5 text-[11px] font-semibold text-[var(--admin-text-secondary)] transition hover:border-[var(--admin-primary-border)] hover:bg-[var(--admin-primary-soft)] hover:text-[var(--admin-primary-on-soft)] active:scale-[0.97] active:duration-75 active:shadow-inner focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus-ring-color)] disabled:cursor-not-allowed disabled:opacity-50";
const resultClearButtonClassName =
  "inline-flex min-h-8 items-center justify-center rounded-lg border border-[var(--admin-primary-border)] bg-[var(--admin-primary-soft)] px-3 py-1.5 text-[11px] font-semibold text-[var(--admin-primary-on-soft)] transition hover:border-[var(--admin-primary)] hover:bg-[rgba(242,110,34,0.16)] active:scale-[0.97] active:duration-75 active:shadow-inner focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus-ring-color)]";

const ShowNamesToggle = () => (
  <button
    type="button"
    aria-pressed
    className="flex w-full items-center text-[11.5px] font-semibold text-[var(--sp-color-text-secondary)] transition hover:text-[var(--admin-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)]"
  >
    Show occupant names
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="ml-auto h-3.5 w-3.5 text-[var(--admin-status-ok)]">
      <path d="m4.5 10.5 3.5 3.5 7.5-8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </button>
);

const Cell = ({ label, children }: { label: string; children: ReactNode }) => (
  <div style={{ display: "grid", gap: 4 }}>
    <div
      className="admin-theme"
      style={{
        display: "flex",
        alignItems: "flex-start",
        width: 240,
        background: "var(--admin-bg)",
        border: "1px solid #E7E1D8",
        padding: 16
      }}
    >
      {children}
    </div>
    <span style={{ fontSize: 11, color: "#6b6257", fontFamily: "var(--font-mono)" }}>{label}</span>
  </div>
);

export const AdminLegend = () => (
  <Cell label="admin — counts + names toggle footer">
    <MapStatusLegend
      ariaLabel="Seat status legend"
      totalLabel="30 seats"
      entries={entries(18, 7, 3, 2)}
      footer={<ShowNamesToggle />}
    />
  </Cell>
);

export const FilteredWithActions = () => (
  <Cell label="filters active — summary + fit/clear actions">
    <MapStatusLegend
      ariaLabel="Seat status legend"
      totalLabel="30 seats"
      entries={entries(7, 2, 0, 0)}
      summary="9 matches · 7 assigned · 2 open"
      actions={
        <div className="flex shrink-0 items-center gap-1.5">
          <button type="button" className={resultActionButtonClassName}>Fit matches</button>
          <button type="button" className={resultClearButtonClassName}>Clear</button>
        </div>
      }
      footer={<ShowNamesToggle />}
    />
  </Cell>
);

export const ViewerLegend = () => (
  <Cell label="viewer — published counts only">
    <MapStatusLegend ariaLabel="Seat status legend" totalLabel="28 seats" entries={entries(19, 6, 2, 1)} />
  </Cell>
);
