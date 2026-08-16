import { ResultsPanel } from "seat-planner";
import type { ReactNode } from "react";

// ResultsPanel renders position:fixed (right-docked floating panel at the
// `panel:` 900px breakpoint the capture viewport hits). Each cell is a
// transformed habitat box — the transform makes it the containing block for
// the fixed panel, so the panel docks inside the cell instead of escaping to
// the real viewport. One panel per cell.

type Card = {
  key: string;
  seatId: string | null;
  title: string;
  subtitle: string;
  status: "available" | "assigned" | "reserved" | "unavailable" | null;
  disabled?: boolean;
};

const RESULTS: Card[] = [
  { key: "r1", seatId: "s1", title: "Anahit Petrosyan · A-12", subtitle: "Senior Paralegal · Litigation", status: "assigned" },
  { key: "r2", seatId: "s2", title: "Marcus Webb · B-03", subtitle: "Associate Attorney · Litigation", status: "assigned" },
  { key: "r3", seatId: "s3", title: "Sona Hakobyan · C-05", subtitle: "Case Manager · Intake", status: "assigned" },
  { key: "r4", seatId: "s4", title: "A-14", subtitle: "Open · North Wing", status: "available" },
  { key: "r5", seatId: "s5", title: "B-08", subtitle: "Reserved · South Wing", status: "reserved" },
  { key: "r6", seatId: null, title: "Lusine Grigoryan", subtitle: "Records Clerk · No assigned seat", status: null, disabled: true }
];

const noop = () => {};

const base = {
  onOpen: noop,
  onShowOnMap: noop,
  onClearSearch: noop,
  onClearFilters: noop,
  onClearAll: noop
};

const Habitat = ({ label, height = 540, children }: { label: string; height?: number; children: ReactNode }) => (
  <div style={{ display: "grid", gap: 4 }}>
    <div
      className="admin-theme"
      style={{
        position: "relative",
        width: 352,
        height,
        background: "var(--admin-bg)",
        border: "1px solid #E7E1D8",
        transform: "translateZ(0)",
        overflow: "hidden"
      }}
    >
      {children}
    </div>
    <span style={{ fontSize: 11, color: "#6b6257", fontFamily: "var(--font-mono)" }}>{label}</span>
  </div>
);

export const MatchList = () => (
  <Habitat label="six matches — statuses, disabled unseated row, key hints">
    <ResultsPanel
      {...base}
      results={RESULTS}
      matchCount={6}
      emptyTitle="No seats match"
      emptyDescription="Try clearing the search or removing a filter."
      searchActive
      structuredFiltersActive={false}
    />
  </Habitat>
);

export const CollapsedSeatBanner = () => (
  <Habitat label="inspector collapsed behind panel — A-12 re-entry row" height={420}>
    <ResultsPanel
      {...base}
      results={RESULTS.slice(0, 3)}
      matchCount={3}
      emptyTitle="No seats match"
      emptyDescription="Try clearing the search or removing a filter."
      searchActive
      structuredFiltersActive
      collapsedSeatLabel="A-12"
      onExpandCollapsedSeat={noop}
    />
  </Habitat>
);

export const EmptyState = () => (
  <Habitat label="zero matches — clear search / filters / all" height={340}>
    <ResultsPanel
      {...base}
      results={[]}
      matchCount={0}
      emptyTitle="No seats match"
      emptyDescription="Nothing matches “Bianca” with the current filters. Clear one or both to widen the search."
      searchActive
      structuredFiltersActive
    />
  </Habitat>
);
