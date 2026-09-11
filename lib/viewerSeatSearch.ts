import { departmentRowKey, normalizeDepartmentName, seatDepartmentValue } from "@/lib/departments";
import { floorOf, type FloorId } from "@/lib/floorIds";
import { FLOORS, NO_DEPARTMENT_LABEL, floorOfPerson } from "@/lib/floors";
import type { DepartmentOption, Employee, SeatStatus, SeatWithEmployee, ZoneOption } from "@/lib/types";

// One placeholder for every seat-search input (admin chrome, admin canvas
// row, viewer): three diverging copies each claimed a different scope. Kept
// short enough for the narrowest chrome input — longer copy ellipsized
// exactly the tail it advertised. Each input's sr-label carries the full
// field enumeration (all four result kinds below).
export const SEAT_SEARCH_PLACEHOLDER = "Search people or seats…";

export type ViewerSearchResultKind = "person" | "seat" | "department" | "zone";

export type ViewerSearchResult = {
  id: string;
  kind: ViewerSearchResultKind;
  title: string;
  subtitle: string;
  meta: string;
  seatId: string | null;
  seatIds: string[];
  status?: SeatStatus;
  /** The floor this result lives on: a seat's floor, the floor an unseated
   *  person works on, or the one floor a department/zone's seats share. Null
   *  when the row spans floors or no floor is live (multi-floor PR-2). */
  floor: FloorId | null;
  /** Person rows only — lets a surface open an unseated person on their floor
   *  (contract #9, amended 2026-09-01: listed, honest, and openable). */
  employeeId?: string;
};

export type ViewerSeatSearchResult = {
  query: string;
  results: ViewerSearchResult[];
  resultSeatIds: string[];
  kindCounts: Record<ViewerSearchResultKind, number>;
};

type ViewerSeatSearchInput = {
  query: string;
  seats: SeatWithEmployee[];
  employees: Employee[];
  departmentOptions?: DepartmentOption[];
  zoneOptions?: ZoneOption[];
};

const MAX_RESULTS = 36;
const KIND_ORDER: Record<ViewerSearchResultKind, number> = {
  person: 10,
  seat: 20,
  department: 30,
  zone: 40
};

// A deliberate local mirror of lib/types' STATUS_LABELS, pinned to agree by
// tests/status-label-source.test.mjs. Not a loader limitation: the test
// loader resolves runtime `@/` imports (this module already imports
// lib/floors and lib/departments through it).
const STATUS_LABELS: Record<SeatStatus, string> = {
  assigned: "Assigned",
  available: "Open",
  reserved: "Reserved",
  unavailable: "Unavailable"
};

// Display-only formatting for the identity segments composed into result
// title/subtitle strings below (seat codes, person names). Mirrors
// lib/formatName.ts's formatDisplayName/formatSeatCode byte-for-byte — a
// deliberate local mirror that predates the test loader's runtime `@/`
// import resolution (see STATUS_LABELS above). Both are exercised by
// tests/format-name.test.mjs against the canonical copy; keep these two in
// sync if that file's formatting rules change.
//
// CRITICAL: these must only touch human-visible composed strings (title/
// subtitle). Search matching always operates on the raw stored values via
// matchesQuery/normalizeSearchText — department matching additionally sees
// the normalized spelling (lib/departments, the value the row displays) so a
// query typed either way hits, but the raw value is never replaced — and no
// match input is ever run through these formatters.
function formatDisplayNameLocal(name: string | null | undefined): string {
  if (!name) return "";
  const trimmed = name.trim();
  if (!trimmed) return "";
  if (/[a-z]/.test(trimmed)) return trimmed;
  return trimmed
    .split(/(\s+)/)
    .map(segment =>
      /\s/.test(segment)
        ? segment
        : segment.toLowerCase().replace(/(^|[’'\-])([a-z])/g, (_match, boundary, letter) => boundary + letter.toUpperCase())
    )
    .join("");
}

function formatSeatCodeLocal(label: string | null | undefined): string {
  if (!label) return "";
  return label.trim().toUpperCase();
}

function normalizeSearchText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function normalizeDisplayText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function matchesQuery(query: string, values: Array<string | null | undefined>) {
  if (!query) return false;
  return values.some(value => normalizeSearchText(value).includes(query));
}

function sortText(left: string, right: string) {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

function getSeatZone(seat: SeatWithEmployee) {
  return normalizeDisplayText(seat.zone ?? seat.department) ?? "No zone";
}

function getSeatEmployee(seat: SeatWithEmployee, employeeById: Map<string, Employee>) {
  if (seat.employee) return seat.employee;
  if (seat.employee_id) return employeeById.get(seat.employee_id) ?? null;
  return null;
}

// The palette accepts seats whose employee join is unresolved (employee null,
// employee_id set — pinned by tests/viewer-seat-search.test.mjs), so the
// occupant is resolved through the directory first. The department rule
// itself is NOT re-derived here: lib/departments' seatDepartmentValue (the
// occupant's department, normalized, never seats.department — audit finding
// E1) is the one definition the chip counts, the filter predicate and this
// palette share, so a row and its chip agree to the character (review
// 2026-09-10, C3).
function withOccupant(seat: SeatWithEmployee, employeeById: Map<string, Employee>): SeatWithEmployee {
  const employee = getSeatEmployee(seat, employeeById);
  return employee === seat.employee ? seat : { ...seat, employee };
}

function uniqueValues(values: Array<string | null | undefined>) {
  const seen = new Map<string, string>();
  values.forEach(value => {
    const display = normalizeDisplayText(value);
    if (!display) return;
    const key = normalizeSearchText(display);
    if (!seen.has(key)) seen.set(key, display);
  });
  return Array.from(seen.values()).sort(sortText);
}

function countLabel(count: number, noun: string) {
  if (noun === "person") return `${count} ${count === 1 ? "person" : "people"}`;
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function resultScore(query: string, result: ViewerSearchResult) {
  const exactTitle = normalizeSearchText(result.title) === query;
  const exactSeat = result.seatId && normalizeSearchText(result.title).startsWith(query);
  return KIND_ORDER[result.kind] - (exactTitle ? 6 : 0) - (exactSeat ? 3 : 0);
}

// INV-1 (owner-revised, admin map; extended to the viewer by the 2026-07-16
// critique, fix 5): an active search keystroke hands the panel slot to
// results — the inspector auto-collapses to its pill/rail (selection
// retained; expand to return) so results are never invisible behind it.
// Unsaved inspector edits stay put: no collapse until save/discard (the
// viewer's inspector is read-only, so it passes false). ONE home for the
// rule — both maps call this instead of re-deriving it inline.
export function searchHandsPanelToResults(nextQuery: string, hasSelection: boolean, inspectorDirty: boolean): boolean {
  return Boolean(normalizeSearchText(nextQuery)) && hasSelection && !inspectorDirty;
}

// First seat per employee in seat order, matching on either the FK or the
// joined employee row — shared by search and the idle People directory.
function mapAssignedSeats(seats: SeatWithEmployee[]) {
  const assignedSeatByEmployeeId = new Map<string, SeatWithEmployee>();
  seats.forEach(seat => {
    for (const employeeId of [seat.employee_id, seat.employee?.id]) {
      if (employeeId && !assignedSeatByEmployeeId.has(employeeId)) {
        assignedSeatByEmployeeId.set(employeeId, seat);
      }
    }
  });
  return assignedSeatByEmployeeId;
}

// Person-row builder shared by search results and the People directory — one
// shape, one formatting point, so the two lists can never drift. An unseated
// person is placed on the floor that is not live yet (lib/floors, the interim
// rule) and the subtitle names it; with no such floor the row stays honest
// with "No assigned seat".
function buildPersonRow(employee: Employee, assignedSeat: SeatWithEmployee | null, seats: SeatWithEmployee[]): ViewerSearchResult {
  const zone = assignedSeat ? getSeatZone(assignedSeat) : null;
  const floor = floorOfPerson(assignedSeat, seats);
  return {
    id: `person:${employee.id}`,
    kind: "person",
    title: formatDisplayNameLocal(employee.full_name),
    subtitle: assignedSeat
      ? `${formatSeatCodeLocal(assignedSeat.label)} · ${zone}`
      : floor
        ? FLOORS[floor].label
        : "No assigned seat",
    meta: [employee.position, employee.department].filter(Boolean).join(" · ") || "Active employee",
    seatId: assignedSeat?.id ?? null,
    seatIds: assignedSeat ? [assignedSeat.id] : [],
    status: assignedSeat?.status,
    floor,
    employeeId: employee.id
  };
}

// The one floor a set of seats shares, or null when they span floors (or the
// set is empty) — department and zone rows use it.
function singleFloor(seats: SeatWithEmployee[]): FloorId | null {
  const floors = new Set(seats.map(seat => floorOf(seat)));
  return floors.size === 1 ? [...floors][0] : null;
}

export type ViewerDirectory = {
  rows: ViewerSearchResult[];
  totalCount: number;
  seatedCount: number;
};

/**
 * The viewer's idle People directory (2026-07-16 regrade, review 5): every
 * active person from the published snapshot, in the given (alphabetical)
 * order, as the same person rows search produces. Consumers must pass the
 * published_employees snapshot — never the live employees table.
 */
export function buildViewerDirectory({ seats, employees }: { seats: SeatWithEmployee[]; employees: Employee[] }): ViewerDirectory {
  const assignedSeatByEmployeeId = mapAssignedSeats(seats);
  const rows = employees
    .filter(employee => employee.active)
    .map(employee => buildPersonRow(employee, assignedSeatByEmployeeId.get(employee.id) ?? null, seats));
  return {
    rows,
    totalCount: rows.length,
    seatedCount: rows.filter(row => row.seatId !== null).length
  };
}

export function buildViewerSeatSearch({
  query: rawQuery,
  seats,
  employees,
  departmentOptions = [],
  zoneOptions = []
}: ViewerSeatSearchInput): ViewerSeatSearchResult {
  const query = normalizeSearchText(rawQuery);
  const employeeById = new Map(employees.map(employee => [employee.id, employee]));
  const activeEmployees = employees.filter(employee => employee.active);
  const results: ViewerSearchResult[] = [];

  if (!query) {
    return {
      query: "",
      results: [],
      resultSeatIds: [],
      kindCounts: { person: 0, seat: 0, department: 0, zone: 0 }
    };
  }

  const assignedSeatByEmployeeId = mapAssignedSeats(seats);

  const nameMatchedSeatIds = new Set<string>();
  activeEmployees.forEach(employee => {
    const assignedSeat = assignedSeatByEmployeeId.get(employee.id) ?? null;
    const zone = assignedSeat ? getSeatZone(assignedSeat) : null;
    if (!matchesQuery(query, [employee.full_name, employee.position, employee.department, normalizeDepartmentName(employee.department), employee.phone_extension, assignedSeat?.label, zone])) return;

    results.push(buildPersonRow(employee, assignedSeat, seats));
    if (assignedSeat && matchesQuery(query, [employee.full_name])) nameMatchedSeatIds.add(assignedSeat.id);
  });

  seats.forEach(seat => {
    const occupied = withOccupant(seat, employeeById);
    const employee = occupied.employee;
    const zone = getSeatZone(seat);
    if (!matchesQuery(query, [seat.label, seat.status, zone, employee?.department, seatDepartmentValue(occupied), employee?.full_name, employee?.position, employee?.phone_extension])) return;

    // Phase 5, 2026-09-11 (D1-d): a name hit already carries its assigned
    // seat. Keep a separate seat row only when the seat itself also matches.
    // Match by seat identity, never by display name; other assignments and
    // distinct people with the same name must remain reachable.
    if (nameMatchedSeatIds.has(seat.id) && !matchesQuery(query, [seat.label, seat.status, zone, employee?.department, seatDepartmentValue(occupied)])) return;

    results.push({
      id: `seat:${seat.id}`,
      kind: "seat",
      title: formatSeatCodeLocal(seat.label),
      subtitle: employee?.full_name ? formatDisplayNameLocal(employee.full_name) : "Open seat",
      meta: `${STATUS_LABELS[seat.status]} · ${seatDepartmentValue(occupied) ?? NO_DEPARTMENT_LABEL} · ${zone}`,
      seatId: seat.id,
      seatIds: [seat.id],
      status: seat.status,
      floor: floorOf(seat)
    });
  });

  // Department rows are named and compared through lib/departments: one row
  // per departmentRowKey, titled with the first normalized spelling (a managed
  // option's when one exists — options come first), and every membership test
  // below IS departmentRowKey — so a spelling that differs only by case or
  // inner whitespace folds into the row its chip counts it under (review
  // 2026-09-10, C3). The key reserves "" for "No department": a managed option
  // or employee string literally spelled that way lands in the reserved row,
  // titled NO_DEPARTMENT_LABEL, whose members are everyone the chip counts
  // under that name — the people with no department too, and for seats the
  // open ones (their seat-row meta already reads "No department") — instead
  // of only the literal spelling (follow-up A). Blank values still create no
  // row on their own. Every RAW spelling that folded into a row is kept and
  // matched alongside the title, so a query typed with the stored inner
  // whitespace still finds the row, as it finds the person and seat rows.
  const departmentRows = new Map<string, { title: string; spellings: string[] }>();
  [
    ...departmentOptions.filter(option => option.active).map(option => option.name),
    ...activeEmployees.map(employee => employee.department)
  ].forEach(raw => {
    const title = normalizeDepartmentName(raw);
    if (!raw || !title) return;
    const key = departmentRowKey(raw);
    const row = departmentRows.get(key);
    if (row) row.spellings.push(raw);
    else departmentRows.set(key, { title: key ? title : NO_DEPARTMENT_LABEL, spellings: [raw] });
  });

  Array.from(departmentRows.entries()).sort(([, left], [, right]) => sortText(left.title, right.title)).forEach(([key, { title, spellings }]) => {
    if (!matchesQuery(query, [title, ...spellings])) return;
    const departmentPeopleById = new Map<string, Employee>();
    activeEmployees.forEach(employee => {
      if (departmentRowKey(employee.department) === key) departmentPeopleById.set(employee.id, employee);
    });
    const departmentSeats = seats.filter(seat => {
      const occupied = withOccupant(seat, employeeById);
      const employee = occupied.employee;
      if (employee && employee.active !== false && departmentRowKey(employee.department) === key) {
        departmentPeopleById.set(employee.id, employee);
      }
      return departmentRowKey(seatDepartmentValue(occupied)) === key;
    });

    if (departmentPeopleById.size === 0 && departmentSeats.length === 0) return;

    results.push({
      id: `department:${normalizeSearchText(title)}`,
      kind: "department",
      title,
      subtitle: "Department",
      meta: `${countLabel(departmentPeopleById.size, "person")} · ${countLabel(departmentSeats.length, "seat")}`,
      seatId: departmentSeats.length === 1 ? departmentSeats[0].id : null,
      seatIds: departmentSeats.map(seat => seat.id),
      floor: singleFloor(departmentSeats)
    });
  });

  const zoneNames = uniqueValues([
    ...zoneOptions.filter(option => option.active).map(option => option.name),
    ...seats.map(seat => getSeatZone(seat))
  ]);

  zoneNames.forEach(name => {
    if (!matchesQuery(query, [name])) return;
    const zoneSeats = seats.filter(seat => normalizeSearchText(getSeatZone(seat)) === normalizeSearchText(name));
    const assignedCount = zoneSeats.filter(seat => seat.status === "assigned").length;
    const openCount = zoneSeats.filter(seat => seat.status === "available").length;

    results.push({
      id: `zone:${normalizeSearchText(name)}`,
      kind: "zone",
      title: name,
      subtitle: "Zone",
      meta: `${countLabel(zoneSeats.length, "seat")} · ${assignedCount} assigned · ${openCount} open`,
      seatId: zoneSeats.length === 1 ? zoneSeats[0].id : null,
      seatIds: zoneSeats.map(seat => seat.id),
      floor: singleFloor(zoneSeats)
    });
  });

  const sortedResults = results
    .sort((left, right) => resultScore(query, left) - resultScore(query, right) || sortText(left.title, right.title))
    .slice(0, MAX_RESULTS);
  const resultSeatIds = Array.from(new Set(sortedResults.flatMap(result => result.seatIds)));
  const kindCounts = sortedResults.reduce<Record<ViewerSearchResultKind, number>>(
    (counts, result) => {
      counts[result.kind] += 1;
      return counts;
    },
    { person: 0, seat: 0, department: 0, zone: 0 }
  );

  return { query, results: sortedResults, resultSeatIds, kindCounts };
}

/**
 * The `?q=` landing's "unique match" (DECISIONS D1-d): the one result when the
 * palette holds exactly one — or the one PERSON when every other result is
 * that person's own seat. Name-only duplicates are now collapsed before
 * rendering; direct seat / shared-field queries can still return both rows.
 * Anything else stays a list.
 */
export function uniqueLandingResult(results: ViewerSearchResult[]): ViewerSearchResult | null {
  if (results.length === 1) return results[0];
  const people = results.filter(result => result.kind === "person");
  if (people.length !== 1) return null;
  const person = people[0];
  if (!person.seatId) return null;
  const others = results.filter(result => result !== person);
  return others.every(result => result.kind === "seat" && result.seatId === person.seatId) ? person : null;
}
