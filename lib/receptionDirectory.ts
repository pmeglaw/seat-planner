import { floorOfPerson } from "@/lib/floors";
import { floorOf, type FloorId } from "@/lib/floorIds";
import type { Employee, Seat } from "@/lib/types";
import { formatDisplayName, formatSeatCode } from "@/lib/formatName";

// Reception front-desk directory (handoff: reception view). Pure helpers so
// the ranking/recents contracts are testable without a DOM. The roster is
// built from PUBLISHED data only — the caller (app/reception/page.tsx) reads
// published_employees + layer='published' seats, mirroring app/page.tsx.
// Reception is read-only and must never see the draft layer.

export type ReceptionPerson = {
  id: string;
  name: string;
  position: string | null;
  department: string | null;
  extension: string | null;
  seatLabel: string | null;
  zone: string | null;
  /** The seat's floor, or the floor an unseated person works on (lib/floors
   *  floorOfPerson); null only when no floor is live yet. */
  floor: FloorId | null;
};

/**
 * Roster = every active person in the published snapshot, seated or not
 * (contract #7: never hide someone for lacking a seat). Seat join reverses
 * the seats→employee FK; if someone somehow holds two published seats the
 * lowest label wins, which keeps the readout deterministic.
 *
 * Names and seat codes are display-formatted HERE (lib/formatName, the same
 * helpers every other surface renders through), so legacy ALL-CAPS records
 * don't shout at the front desk and lowercase-entered seat labels read
 * canonically. Both transforms are case-only, and contract #1 matching
 * lowercases everything, so search behavior is unchanged.
 */
export function buildReceptionDirectory(
  employees: Pick<Employee, "id" | "full_name" | "position" | "department" | "phone_extension">[],
  seats: (Pick<Seat, "label" | "employee_id" | "zone"> & { floor?: string | null })[]
): ReceptionPerson[] {
  const seatByEmployee = new Map<string, { label: string; zone: string | null; floor: FloorId }>();
  for (const seat of [...seats].sort((a, b) => a.label.localeCompare(b.label))) {
    if (!seat.employee_id || seatByEmployee.has(seat.employee_id)) continue;
    seatByEmployee.set(seat.employee_id, { label: formatSeatCode(seat.label), zone: seat.zone ?? null, floor: floorOf(seat) });
  }
  return employees
    .map(employee => {
      const seat = seatByEmployee.get(employee.id) ?? null;
      return {
        id: employee.id,
        name: formatDisplayName(employee.full_name),
        position: employee.position,
        department: employee.department,
        extension: employee.phone_extension,
        seatLabel: seat?.label ?? null,
        zone: seat?.zone ?? null,
        floor: seat ? seat.floor : floorOfPerson(null, seats)
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function haystack(person: ReceptionPerson): string {
  return [person.name, person.position, person.department, person.seatLabel, person.extension]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/**
 * Contract #1: case-insensitive substring over one concatenated haystack
 * (name, position, department, seat code, extension). Ranking: name-prefix →
 * name-contains → any-other-field; ties alphabetical. Empty query returns the
 * full (already alphabetical) directory.
 */
export function searchReceptionDirectory(people: ReceptionPerson[], query: string): ReceptionPerson[] {
  const q = query.trim().toLowerCase();
  if (!q) return people;
  const ranked: { person: ReceptionPerson; rank: number }[] = [];
  for (const person of people) {
    const name = person.name.toLowerCase();
    if (name.startsWith(q)) ranked.push({ person, rank: 0 });
    else if (name.includes(q)) ranked.push({ person, rank: 1 });
    else if (haystack(person).includes(q)) ranked.push({ person, rank: 2 });
  }
  // Input order is alphabetical and sort() is stable, so rank alone suffices.
  return ranked.sort((a, b) => a.rank - b.rank).map(entry => entry.person);
}

/** Contract #4: dedupe-to-front, store max 5. Display-side trimming (max 4,
 *  current selection excluded) stays in the component. */
export function pushRecentLookup(recents: string[], id: string, max = 5): string[] {
  return [id, ...recents.filter(existing => existing !== id)].slice(0, max);
}

/**
 * Same-department fallback (detail card): up to `max` colleagues from the
 * person's department who have an extension to transfer to, alphabetical.
 */
export function sameDepartmentFallback(
  people: ReceptionPerson[],
  person: ReceptionPerson,
  max = 3
): ReceptionPerson[] {
  if (!person.department) return [];
  return people
    .filter(
      candidate =>
        candidate.id !== person.id && candidate.department === person.department && Boolean(candidate.extension)
    )
    // Explicit sort: buildReceptionDirectory output is already alphabetical,
    // but the cap below must never depend on the caller's ordering.
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, max);
}
