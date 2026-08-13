import { NO_ZONE_LABEL, zoneKey } from "@/lib/seatFilters";
import type { Employee, SeatWithEmployee, ZoneOption } from "@/lib/types";
import { buildViewerDirectory, type ViewerSearchResult } from "@/lib/viewerSeatSearch";

/**
 * The Find palette's BROWSE feed — what the palette shows with an empty query
 * (Viewer v12 handoff, interaction contract #3): a zone chip row, then the A→Z
 * people list, then the "N people · M seated" footer.
 *
 * One feed, not two panels. The retired design had the results panel and the
 * People directory as separate docked surfaces computing their halves
 * independently; the palette shows one or the other in the same slot, so the
 * browse half is assembled here and query mode keeps using
 * buildViewerSeatSearch.
 *
 * PUBLISHED DATA ONLY. `employees` must be the published_employees snapshot —
 * never the live employees table (tests/published-employee-snapshot.test.mjs
 * guards the surrounding rule). This module reads no live table itself; it is
 * the caller's contract to hand it snapshot rows.
 */

/** A seat's zone, falling back the way the viewer has always displayed it. */
export function getSeatZone(seat: Pick<SeatWithEmployee, "zone" | "department">) {
  return seat.zone ?? seat.department ?? NO_ZONE_LABEL;
}

/**
 * Chips AGGREGATE on the shared zoneKey (a zone option and a seat that disagree
 * only in case or padding are ONE zone), which is why everything that later
 * acts on a chip — the pinned filter, the map's wash — must compare on that
 * same key. Re-exported so palette consumers read the key from the module they
 * already import, while lib/seatFilters.ts stays its single definition: two
 * spellings of "the zone key" is the very drift this exists to prevent.
 */
export { zoneKey };

export type ViewerZoneChip = {
  /** Display name, in the casing the first occurrence used. */
  name: string;
  /** Published seats in this zone — the mono count the chip renders. */
  seatCount: number;
};

export type ViewerPaletteBrowse = {
  zones: ViewerZoneChip[];
  people: ViewerSearchResult[];
  totalCount: number;
  seatedCount: number;
  /** "16 people · 15 seated" — the footer line, assembled once. */
  summary: string;
};

/**
 * Zone chips with their published seat counts.
 *
 * Active zone OPTIONS come first so a configured zone still renders (with 0)
 * before anyone sits in it — the option list is the one live read the viewer is
 * allowed, and dropping an empty zone would make a freshly-created zone look
 * broken. Seat-derived zones follow, which is how a seat whose zone was never
 * registered as an option still browses.
 *
 * Matching is case-insensitive on a trimmed key, mirroring the viewer's
 * existing option de-duplication, and the first spelling seen wins so the chip
 * reads the way the option list writes it.
 */
export function buildViewerZoneChips({
  seats,
  zoneOptions = []
}: {
  seats: SeatWithEmployee[];
  zoneOptions?: ZoneOption[];
}): ViewerZoneChip[] {
  const chips = new Map<string, ViewerZoneChip>();

  const register = (rawName: string | null | undefined) => {
    const name = rawName?.trim();
    if (!name) return null;
    const key = zoneKey(name);
    const existing = chips.get(key);
    if (existing) return existing;
    const chip: ViewerZoneChip = { name, seatCount: 0 };
    chips.set(key, chip);
    return chip;
  };

  zoneOptions.filter(option => option.active).forEach(option => register(option.name));
  seats.forEach(seat => {
    const chip = register(getSeatZone(seat));
    if (chip) chip.seatCount += 1;
  });

  return Array.from(chips.values()).sort((left, right) =>
    left.name.localeCompare(right.name, undefined, { numeric: true })
  );
}

export function buildViewerPaletteBrowse({
  seats,
  employees,
  zoneOptions = []
}: {
  seats: SeatWithEmployee[];
  employees: Employee[];
  zoneOptions?: ZoneOption[];
}): ViewerPaletteBrowse {
  const directory = buildViewerDirectory({ seats, employees });

  // buildViewerDirectory preserves the order it is GIVEN — its "(alphabetical)"
  // note describes what the old panel happened to pass, not a guarantee it
  // makes. Contract #3 says the palette lists people A→Z, so sort here instead
  // of trusting every future caller to have sorted first.
  const people = [...directory.rows].sort((left, right) =>
    left.title.localeCompare(right.title, undefined, { numeric: true })
  );

  return {
    zones: buildViewerZoneChips({ seats, zoneOptions }),
    people,
    totalCount: directory.totalCount,
    seatedCount: directory.seatedCount,
    summary: `${directory.totalCount} ${directory.totalCount === 1 ? "person" : "people"} · ${directory.seatedCount} seated`
  };
}
