import { MapStatusBand, NamesVisibilityToggle, MapZoomControl } from "seat-planner";
import type { ReactNode } from "react";

// The shared in-flow bottom status band — the one home for legend counts, the
// match summary, filter verbs and the right-hand control cluster. Compositions
// are the real call sites: SeatMap.tsx (admin) and ViewerSeatFinder.tsx
// (viewer). Dot classes and the action button classes are copied verbatim from
// those files, since Tailwind never scans this directory.

type Entry = { key: string; label: string; dotClassName: string; count: number };

const viewerEntries: Entry[] = [
  { key: "assigned", label: "Assigned", dotClassName: "bg-[var(--sp-status-success-mark)]", count: 19 },
  { key: "available", label: "Open", dotClassName: "bg-[var(--sp-status-neutral-mark)]", count: 6 },
  { key: "reserved", label: "Reserved", dotClassName: "bg-[var(--sp-status-pending-mark)]", count: 2 }
];

const adminEntries = (assigned: number, open: number, reserved: number, unavailable: number, draft?: number): Entry[] => [
  { key: "assigned", label: "Assigned", dotClassName: "bg-[var(--sp-legend-assigned-accent)]", count: assigned },
  { key: "available", label: "Open", dotClassName: "bg-[var(--sp-legend-available-accent)]", count: open },
  { key: "reserved", label: "Reserved", dotClassName: "bg-[var(--sp-legend-reserved-accent)]", count: reserved },
  { key: "unavailable", label: "Unavailable", dotClassName: "bg-[var(--sp-legend-unavailable-accent)]", count: unavailable },
  ...(draft === undefined ? [] : [{ key: "draft", label: "Draft changed", dotClassName: "bg-[var(--sp-brand)]", count: draft }])
];

// Verbatim from SeatMap.tsx (compiled classes).
const resultActionButtonClassName =
  "inline-flex min-h-8 items-center justify-center rounded-lg border border-[var(--sp-border-strong)] bg-[var(--sp-layer-01)] px-3 py-1.5 text-[11px] font-semibold text-[var(--sp-text-secondary)] transition hover:border-[var(--sp-brand-border)] hover:bg-[var(--sp-brand-wash)] hover:text-[var(--sp-brand-text)] active:scale-[0.97] active:duration-75 active:shadow-inner focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus)] disabled:cursor-not-allowed disabled:opacity-50";
const resultClearButtonClassName =
  "inline-flex min-h-8 items-center justify-center rounded-lg border border-[var(--sp-brand-border)] bg-[var(--sp-brand-wash)] px-3 py-1.5 text-[11px] font-semibold text-[var(--sp-brand-text)] transition hover:border-[var(--sp-brand)] hover:bg-[rgba(242,110,34,0.16)] active:scale-[0.97] active:duration-75 active:shadow-inner focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus)]";

// `label` is the zoom READOUT, not a title — SeatMap passes "Fit" in overview
// mode and "125%" etc. when zoomed. (The group already carries its own
// aria-label="Map zoom" inside the component; passing that string here printed
// it into the 36px readout slot, where it wrapped to two lines and shoved the
// fit-to-view button off the card.)
const zoomCluster = (label: string) => (
  <MapZoomControl
    orientation="horizontal"
    label={label}
    onZoomIn={() => {}}
    onZoomOut={() => {}}
    onFit={() => {}}
  />
);

const namesOn = <NamesVisibilityToggle pressed onToggle={() => {}} />;

const controls = (zoomLabel: string) => (
  <>
    {namesOn}
    <span aria-hidden="true" className="h-5 w-px shrink-0 bg-[var(--sp-border-subtle)]" />
    {zoomCluster(zoomLabel)}
  </>
);

// The band is a CSS size container that sits at the bottom of the map stage —
// give the cell the stage's own width so the container queries resolve the way
// they do in the app. Ceiling: the grid capture viewport is 900px with ~24px
// of gutter, so a stage wider than ~850 gets clipped at the card edge. That
// keeps every cell here BELOW the band's own @container tiers (900px reveals
// "Legend" + the seat total, 1140px reveals the prose summary), which is the
// docked-panel width the admin map actually runs at. The full-width band —
// Legend, total and prose all present — is covered by the SeatMap card, whose
// override gives it a 1280px viewport.
const Stage = ({ label, width, children }: { label: string; width: number; children: ReactNode }) => (
  <div style={{ display: "grid", gap: 4 }}>
    <div
      className="admin-theme"
      style={{
        width,
        maxWidth: "100%",
        background: "var(--sp-background)",
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
  <Stage label="viewer — three counts, names switch + zoom at Fit" width={840}>
    <MapStatusBand
      ariaLabel="Seat status summary"
      totalLabel="27 seats"
      entries={viewerEntries}
      summary="Seating across people, seats, departments, and zones."
      controls={controls("Fit")}
    />
  </Stage>
);

export const AdminBand = () => (
  <Stage label="admin — five counts incl. draft entry, no filters active" width={840}>
    <MapStatusBand
      ariaLabel="Seat status legend"
      totalLabel="30 seats"
      entries={adminEntries(18, 7, 3, 2, 4)}
      controls={controls("Fit")}
    />
  </Stage>
);

export const FiltersActive = () => (
  // 840px is the docked-panel width where the filtered admin row genuinely
  // overruns (source comment on MapStatusBand: ~790px of content against a
  // 640px floor), so Clear sits AT the scroll seam here. That is the band's
  // safety valve doing its job, not a clipped card — the verbs stay reachable
  // by scroll and by keyboard.
  <Stage label="admin, filters active — verbs at the scroll seam, zoomed to 125%" width={840}>
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
      controls={controls("125%")}
    />
  </Stage>
);

export const NarrowStage = () => (
  <Stage label="640px floor — counts and verbs scroll, controls never do" width={640}>
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
      controls={controls("Fit")}
    />
  </Stage>
);
