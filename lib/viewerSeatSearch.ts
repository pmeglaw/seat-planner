import type { DepartmentOption, Employee, SeatStatus, SeatWithEmployee, ZoneOption } from "@/lib/types";

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
  disabled?: boolean;
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

// Kept local (not imported from lib/types): tests/viewer-seat-search.test.mjs
// transpiles this module standalone, so runtime imports cannot resolve here.
const STATUS_LABELS: Record<SeatStatus, string> = {
  assigned: "Assigned",
  available: "Available",
  reserved: "Reserved",
  unavailable: "Unavailable"
};

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

function getSeatDepartment(seat: SeatWithEmployee, employeeById: Map<string, Employee>) {
  // Departments belong to people. seats.department is legacy zone data
  // (pre-007 pod names resurrected by snapshot restores) and must never be
  // displayed or aggregated as a department (audit finding E1).
  const employee = getSeatEmployee(seat, employeeById);
  return normalizeDisplayText(employee?.department) ?? "No department";
}

function getSeatPerson(seat: SeatWithEmployee, employeeById: Map<string, Employee>) {
  return getSeatEmployee(seat, employeeById);
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

  // First seat per employee in seat order, matching on either the FK or the
  // joined employee row — the Map replaces a per-employee scan of all seats.
  const assignedSeatByEmployeeId = new Map<string, SeatWithEmployee>();
  seats.forEach(seat => {
    for (const employeeId of [seat.employee_id, seat.employee?.id]) {
      if (employeeId && !assignedSeatByEmployeeId.has(employeeId)) {
        assignedSeatByEmployeeId.set(employeeId, seat);
      }
    }
  });

  activeEmployees.forEach(employee => {
    const assignedSeat = assignedSeatByEmployeeId.get(employee.id) ?? null;
    const zone = assignedSeat ? getSeatZone(assignedSeat) : null;
    if (!matchesQuery(query, [employee.full_name, employee.position, employee.department, employee.phone_extension, assignedSeat?.label, zone])) return;

    results.push({
      id: `person:${employee.id}`,
      kind: "person",
      title: employee.full_name,
      subtitle: assignedSeat ? `${assignedSeat.label} · ${zone}` : "No published seat",
      meta: [employee.position, employee.department].filter(Boolean).join(" · ") || "Active employee",
      seatId: assignedSeat?.id ?? null,
      seatIds: assignedSeat ? [assignedSeat.id] : [],
      status: assignedSeat?.status,
      disabled: !assignedSeat
    });
  });

  seats.forEach(seat => {
    const employee = getSeatPerson(seat, employeeById);
    const zone = getSeatZone(seat);
    const department = employee?.department ?? null;
    if (!matchesQuery(query, [seat.label, seat.status, zone, department, employee?.full_name, employee?.position, employee?.phone_extension])) return;

    results.push({
      id: `seat:${seat.id}`,
      kind: "seat",
      title: seat.label,
      subtitle: employee?.full_name ?? "Open seat",
      meta: `${STATUS_LABELS[seat.status]} · ${department ?? "No department"} · ${zone}`,
      seatId: seat.id,
      seatIds: [seat.id],
      status: seat.status
    });
  });

  const departmentNames = uniqueValues([
    ...departmentOptions.filter(option => option.active).map(option => option.name),
    ...activeEmployees.map(employee => employee.department)
  ]);

  departmentNames.forEach(name => {
    if (!matchesQuery(query, [name])) return;
    const departmentKey = normalizeSearchText(name);
    const departmentPeopleById = new Map<string, Employee>();
    activeEmployees.forEach(employee => {
      if (normalizeSearchText(employee.department) === departmentKey) departmentPeopleById.set(employee.id, employee);
    });
    const departmentSeats = seats.filter(seat => {
      const employee = getSeatEmployee(seat, employeeById);
      if (employee && employee.active !== false && normalizeSearchText(employee.department) === departmentKey) {
        departmentPeopleById.set(employee.id, employee);
      }
      return normalizeSearchText(getSeatDepartment(seat, employeeById)) === departmentKey;
    });

    if (departmentPeopleById.size === 0 && departmentSeats.length === 0) return;

    results.push({
      id: `department:${normalizeSearchText(name)}`,
      kind: "department",
      title: name,
      subtitle: "Department",
      meta: `${countLabel(departmentPeopleById.size, "person")} · ${countLabel(departmentSeats.length, "published seat")}`,
      seatId: departmentSeats.length === 1 ? departmentSeats[0].id : null,
      seatIds: departmentSeats.map(seat => seat.id)
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
      seatIds: zoneSeats.map(seat => seat.id)
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
