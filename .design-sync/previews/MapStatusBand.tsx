import { MapStatusBand, NamesVisibilityToggle, MapZoomControl } from "seat-planner";
import type { ReactNode } from "react";

// The shared in-flow bottom status band — the one home for legend counts, the
// match summary, filter verbs and the right-hand control cluster. Compositions
// are the real call sites: SeatMap.tsx (admin) and ViewerSeatFinder.tsx
// (viewer). Dot classes and the action button classes are copied verbatim from
// those files, since Tailwind never scans this directory.

type Entry = { key: string; label: string; dotClassName: string; count: number };

const viewerEntries: Entry[] = [
  { key: "assigned", label: "Assigned", dotClassName: "bg-[var(--admin-status-ok)]", count: 19 },
  { key: "available", label: "Open", dotClassName: "bg-[var(--admin-status-neutral)]", count: 6 },
  { key: "reserved", label: "Reserved", dotClassName: "bg-[var(--admin-status-warn)]", count: 2 }
];

const adminEntries = (assigned: number, open: number, reserved: number, unavailable: number, draft?: number): Entry[] => [
  { key: "assigned", label: "Assigned", dotClassName: "bg-[var(--admin-marker-assigned-accent)]", count: assigned },
  { key: "available", label: "Open", dotClassName: "bg-[var(--admin-marker-available-accent)]", count: open },
  { key: "reserved", label: "Reserved", dotClassName: "bg-[var(--admin-marker-reserved-accent)]", count: reserved },
  { key: "unavailable", label: "Unavailable", dotClassName: "bg-[var(--admin-marker-unavailable-accent)]", count: unavailable },
  ...(draft === undefined ? [] : [{ key: "draft", label: "Draft changed", dotClassName: "bg-[var(--admin-primary)]", count: draft }])
];

// Verbatim from SeatMap.tsx (compiled classes).
const resultActionButtonClassName =
  "inline-flex min-h-8 items-center justify-center rounded-lg border border-[var(--admin-border-strong)] bg-[var(--admin-surface)] px-3 py-1.5 text-[11px] font-semibold text-[var(--admin-text-secondary)] transition hover:border-[var(--admin-primary-border)] hover:bg-[var(--admin-primary-soft)] hover:text-[var(--admin-primary-on-soft)] active:scale-[0.97] active:duration-75 active:shadow-inner focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus-ring-color)] disabled:cursor-not-allowed disabled:opacity-50";
const resultClearButtonClassName =
  "inline-flex min-h-8 items-center justify-center rounded-lg border border-[var(--admin-primary-border)] bg-[var(--admin-primary-soft)] px-3 py-1.5 text-[11px] font-semibold text-[var(--admin-primary-on-soft)] transition hover:border-[var(--admin-primary)] hover:bg-[rgba(242,110,34,0.16)] active:scale-[0.97] active:duration-75 active:shadow-inner focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus-ring-color)]";

const zoomCluster = (
  <MapZoomControl
    orientation="horizontal"
    label="Map zoom"
    onZoomIn={() => {}}
    onZoomOut={() => {}}
    onFit={() => {}}
  />
);

const namesOn = <NamesVisibilityToggle pressed onToggle={() => {}} />;

const controls = (
  <>
    {namesOn}
    <span aria-hidden="true" className="h-5 w-px shrink-0 bg-[var(--admin-border)]" />
    {zoomCluster}
  </>
);

// The band is a CSS size container that sits at the bottom of the map stage —
// give the cell the stage's own width so the container queries resolve the way
// they do in the app.
const Stage = ({ label, width, children }: { label: string; width: number; children: ReactNode }) => (
  <div style={{ display: "grid", gap: 4 }}>
    <div
      className="admin-theme"
      style={{
        width,
        maxWidth: "100%",
        background: "var(--admin-bg)",
        border: "1px solid #E7E1D8",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        height: 92
      }}
    >
      {children}
    </div>
    <span style={{ fontSize: 11, color: "#6b6257", fontFamily: "var(--font-mono)" }}>{label}</span>
  </div>
);

export const ViewerBand = () => (
  <Stage label="viewer — counts, prose summary, names switch + zoom" width={880}>
    <MapStatusBand
      ariaLabel="Seat status summary"
      totalLabel="27 seats"
      entries={viewerEntries}
      summary="Seating across people, seats, departments, and zones."
      controls={controls}
    />
  </Stage>
);

export const AdminBand = () => (
  <Stage label="admin — draft entry included, no filters active" width={880}>
    <MapStatusBand
      ariaLabel="Seat status legend"
      totalLabel="30 seats"
      entries={adminEntries(18, 7, 3, 2, 4)}
      controls={controls}
    />
  </Stage>
);

export const FiltersActive = () => (
  <Stage label="admin, filters active — match summary + Fit matches / Clear" width={880}>
    <MapStatusBand
      ariaLabel="Seat status legend"
      totalLabel="30 seats"
      entries={adminEntries(7, 2, 0, 0)}
      summary="9 matches · 7 assigned · 2 open"
      actions={
        <div className="flex shrink-0 items-center gap-1.5">
          <button type="button" className={resultActionButtonClassName}>Fit matches</button>
          <button type="button" className={resultClearButtonClassName}>Clear</button>
        </div>
      }
      controls={controls}
    />
  </Stage>
);

export const NarrowStage = () => (
  <Stage label="640px floor — title/total and prose drop, counts and verbs scroll" width={640}>
    <MapStatusBand
      ariaLabel="Seat status legend"
      totalLabel="30 seats"
      entries={adminEntries(7, 2, 1, 1)}
      summary="9 matches · 7 assigned · 2 open"
      actions={
        <div className="flex shrink-0 items-center gap-1.5">
          <button type="button" className={resultActionButtonClassName}>Fit matches</button>
          <button type="button" className={resultClearButtonClassName}>Clear</button>
        </div>
      }
      controls={controls}
    />
  </Stage>
);
