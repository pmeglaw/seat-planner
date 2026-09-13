import { useRef, useState } from "react";
import { ViewerFindPalette } from "@/components/seat-map/ViewerFindPalette";
import { ManagementDensityProvider } from "@/components/admin-management/ManagementDensity";
import { AdminManagementPanel } from "@/components/admin-management/AdminManagementPanel";
import type { Employee } from "@/lib/types";
import type { ViewerSearchResult } from "@/lib/viewerSeatSearch";

const people: ViewerSearchResult[] = Array.from({ length: 220 }, (_, index) => ({
  id: `person-${index}`, kind: "person", title: `Example person ${String(index).padStart(3, "0")}`,
  subtitle: "N01 · North offices", meta: "Example department", seatId: `seat-${index}`, seatIds: [`seat-${index}`], floor: "3"
}));

export function PaletteFixture({ zoneCount = 15, anchorTop = 48 }: { zoneCount?: number; anchorTop?: number }) {
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [search, setSearch] = useState("");
  const [zone, setZone] = useState("all");
  const [open, setOpen] = useState(true);
  const [selected, setSelected] = useState("");
  return <main>
    <div ref={anchorRef} style={{ marginTop: anchorTop, marginLeft: 12, width: "min(320px, calc(100vw - 24px))" }}>
      <input type="search" ref={searchInputRef} aria-label="Search office seating" value={search} onChange={event => setSearch(event.target.value)} />
    </div>
    <output aria-label="Opened person">{selected}</output>
    {open && <ViewerFindPalette anchorRef={anchorRef} containerRef={containerRef} searchInputRef={searchInputRef}
      query={search.trim()} searchValue={search} onSearchChange={setSearch} onDismiss={() => { setOpen(false); searchInputRef.current?.focus(); }}
      browse={{ zones: Array.from({ length: zoneCount }, (_, index) => ({ name: index % 2 ? `Averylongunbrokenzonelabel${index}` : `Long zone name with several words ${index}`, seatCount: 9999 })), people, totalCount: people.length, seatedCount: people.length, summary: "220 people" }}
      results={people.filter(person => person.title.includes(search))} resultCountLabel="220 results" mappedSeatCount={220}
      activeResultId={null} selectedSeatId={null} pinnedZone={zone} onZonePin={setZone} onRowHoverChange={() => {}}
      onOpenRow={row => setSelected(row.title)} onClearSearch={() => setSearch("")} />}
  </main>;
}

const employees: Employee[] = Array.from({ length: 220 }, (_, index) => ({
  id: `example-${index}`, full_name: `Example person ${String(index).padStart(3, "0")}`, position: "Analyst", department: "Example department",
  phone_extension: String(100 + index), email: null, avatar_url: null, active: true, created_at: "2026-09-12T00:00:00Z", updated_at: "2026-09-12T00:00:00Z"
}));

export function ManagementFixture() {
  return <ManagementDensityProvider><AdminManagementPanel employees={employees} seats={[]} departmentOptions={[]} zoneOptions={[]} /></ManagementDensityProvider>;
}
