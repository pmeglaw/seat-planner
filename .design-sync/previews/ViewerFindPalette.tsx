import { ViewerFindPalette } from "seat-planner";
import type { ReactNode } from "react";

// ViewerFindPalette position:fixed's itself under the chrome search field it
// is anchored to. Previews contain that: each cell wraps it in a frame with
// a CSS transform (which makes the frame the containing block for fixed
// descendants) and hands it a never-attached anchor ref, so the palette
// renders at its deterministic fallback offset (left 12 / top 42) inside
// the frame instead of escaping to the page viewport. Width then
// shrink-wraps to content instead of the anchored 560px — geometry note,
// not a defect. .shell-theme provides the --admin-* token set the viewer
// surfaces share.

const nullAnchor = { current: null };
const nullInput = { current: null };
const containerA = { current: null };
const containerB = { current: null };
const containerC = { current: null };

const noop = () => {};

const Frame = ({ label, height, children }: { label: string; height: number; children: ReactNode }) => (
  <div className="shell-theme" style={{ display: "grid", gap: 6 }}>
    <div
      style={{
        position: "relative",
        width: 620,
        height,
        maxWidth: "100%",
        overflow: "hidden",
        background: "var(--admin-map-workspace, #ECE8E0)",
        border: "1px solid #E7E1D8",
        transform: "translateZ(0)"
      }}
    >
      {children}
    </div>
    <span style={{ fontSize: 11, color: "#6b6257", fontFamily: "var(--font-mono)" }}>{label}</span>
  </div>
);

const personRow = (
  id: string,
  title: string,
  subtitle: string,
  meta: string,
  seatId: string | null,
  disabled = false
) => ({
  id,
  kind: "person" as const,
  title,
  subtitle,
  meta,
  seatId,
  seatIds: seatId ? [seatId] : [],
  disabled
});

const browse = {
  zones: [
    { name: "North Wing", seatCount: 7 },
    { name: "East Wing", seatCount: 3 },
    { name: "South Wing", seatCount: 6 }
  ],
  // 7 rows so the footer legend stays inside the 700px capture viewport.
  people: [
    personRow("b-anahit", "Anahit Petrosyan", "A-12 · North Wing", "Senior Paralegal · Litigation", "s-a12"),
    personRow("b-daniel", "Daniel Kim", "C-01 · South Wing", "Intake Specialist · Intake", "s-c01"),
    personRow("b-elena", "Elena Vasquez", "C-03 · South Wing", "Office Manager · Records", "s-c03"),
    personRow("b-grace", "Grace Lindqvist", "C-02 · South Wing", "Receptionist · Intake", "s-c02"),
    personRow("b-james", "James Harootunian", "A-05 · North Wing", "Senior Attorney · Litigation", "s-a05"),
    personRow("b-marcus", "Marcus Webb", "B-03 · North Wing", "Associate Attorney · Litigation", "s-b03"),
    personRow("b-maria", "Maria Duarte", "No seat yet", "Billing Coordinator · Records", null, true)
  ],
  totalCount: 7,
  seatedCount: 6,
  summary: "7 people · 6 seated"
};

const emptyBrowse = { zones: [], people: [], totalCount: 0, seatedCount: 0, summary: "0 people · 0 seated" };

const northResults = [
  personRow("r-anahit", "Anahit Petrosyan", "A-12 · North Wing", "Senior Paralegal · Litigation", "s-a12"),
  personRow("r-marcus", "Marcus Webb", "B-03 · North Wing", "Associate Attorney · Litigation", "s-b03"),
  {
    id: "r-seat-a14",
    kind: "seat" as const,
    title: "A-14",
    subtitle: "Open seat",
    meta: "North Wing · by the copy room",
    seatId: "s-a14",
    seatIds: ["s-a14"],
    status: "available" as const
  },
  {
    id: "r-zone-north",
    kind: "zone" as const,
    title: "North Wing",
    subtitle: "7 seats · 5 assigned",
    meta: "A and B rows along the north windows",
    seatId: null,
    seatIds: ["s-a03", "s-a05", "s-a12", "s-a14", "s-b03", "s-b04", "s-b07"]
  }
];

export const BrowseMode = () => (
  <Frame label="empty query — zone chips (South Wing pinned) + A→Z people feed" height={620}>
    <ViewerFindPalette
      anchorRef={nullAnchor}
      containerRef={containerA}
      searchInputRef={nullInput}
      query=""
      browse={browse}
      results={[]}
      resultCountLabel="0 results"
      mappedSeatCount={0}
      activeResultId={null}
      selectedSeatId={null}
      pinnedZone="South Wing"
      onZoneHoverChange={noop}
      onZonePin={noop}
      onRowHoverChange={noop}
      onOpenRow={noop}
      onClearSearch={noop}
    />
  </Frame>
);

export const SearchResults = () => (
  <Frame label='query "north" — mixed person/seat/zone rows, first row active' height={480}>
    <ViewerFindPalette
      anchorRef={nullAnchor}
      containerRef={containerB}
      searchInputRef={nullInput}
      query="north"
      browse={emptyBrowse}
      results={northResults}
      resultCountLabel="4 results"
      mappedSeatCount={8}
      activeResultId="r-anahit"
      selectedSeatId="s-a12"
      pinnedZone="all"
      onZoneHoverChange={noop}
      onZonePin={noop}
      onRowHoverChange={noop}
      onOpenRow={noop}
      onClearSearch={noop}
    />
  </Frame>
);

export const NoResults = () => (
  <Frame label='query "harutyunyan" — empty state with clear-search action' height={300}>
    <ViewerFindPalette
      anchorRef={nullAnchor}
      containerRef={containerC}
      searchInputRef={nullInput}
      query="harutyunyan"
      browse={emptyBrowse}
      results={[]}
      resultCountLabel="0 results"
      mappedSeatCount={0}
      activeResultId={null}
      selectedSeatId={null}
      pinnedZone="all"
      onZoneHoverChange={noop}
      onZonePin={noop}
      onRowHoverChange={noop}
      onOpenRow={noop}
      onClearSearch={noop}
    />
  </Frame>
);
