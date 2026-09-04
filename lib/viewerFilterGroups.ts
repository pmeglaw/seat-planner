import { departmentKey } from "@/lib/departments";
import { positionKey } from "@/lib/positions";
import { STATUS_LABELS, type Employee, type SeatStatus, type SeatWithEmployee } from "@/lib/types";
import { zoneKey } from "@/lib/seatFilters";

// The viewer's four filter groups for the shell's left panel (PHASE2UX §1.3,
// Position kept as the fourth group by owner ruling 2026-09-04): Department ·
// Zone · Status · Position, each item with the count of what it would show
// on THIS floor — seats on a mapped floor, people on the roster floor — and
// its checked state. Counts are per option, independent of the other groups
// (availability, not the intersection), and include zero. Pure so the shape
// is tested without a DOM; ViewerSeatFinder feeds it and registers the
// result through useAppShellFilters.

export type FilterGroupItem = { id: string; label: string; count: number; checked: boolean };
export type FilterGroup = { id: "department" | "zone" | "status" | "position"; label: string; items: FilterGroupItem[]; state: "ready"; hidden?: boolean };

export type ViewerFilterSelection = { department: string; position: string; zone: string; status: string };

const STATUS_ORDER: SeatStatus[] = ["assigned", "available", "reserved", "unavailable"];

export function buildViewerFilterGroups(input: {
  surface: "plan" | "roster";
  /** Seats on the current floor (plan surface). */
  floorSeats: readonly SeatWithEmployee[];
  /** People on the current floor (roster surface). */
  floorPeople: readonly Employee[];
  departments: readonly string[];
  positions: readonly string[];
  zones: readonly string[];
  seatZone: (seat: SeatWithEmployee) => string;
  seatDepartment: (seat: SeatWithEmployee) => string;
  selected: ViewerFilterSelection;
}): FilterGroup[] {
  const { surface, floorSeats, floorPeople, departments, positions, zones, seatZone, seatDepartment, selected } = input;
  const onRoster = surface === "roster";

  const departmentCount = (name: string) =>
    onRoster
      ? floorPeople.filter(person => departmentKey(person.department ?? "") === departmentKey(name)).length
      : floorSeats.filter(seat => departmentKey(seatDepartment(seat)) === departmentKey(name)).length;
  const positionCount = (name: string) =>
    onRoster
      ? floorPeople.filter(person => positionKey(person.position) === positionKey(name)).length
      : floorSeats.filter(seat => positionKey(seat.employee?.position) === positionKey(name)).length;
  const zoneCount = (name: string) => floorSeats.filter(seat => zoneKey(seatZone(seat)) === zoneKey(name)).length;
  const statusCount = (status: SeatStatus) => floorSeats.filter(seat => seat.status === status).length;

  const item = (id: string, label: string, count: number, current: string): FilterGroupItem => ({ id, label, count, checked: current === id });

  const positionItems = positions.map(name => item(name, name, positionCount(name), selected.position));

  return [
    { id: "department", label: "Department", state: "ready", items: departments.map(name => item(name, name, departmentCount(name), selected.department)) },
    { id: "zone", label: "Zone", state: "ready", hidden: onRoster, items: zones.map(name => item(name, name, zoneCount(name), selected.zone)) },
    {
      id: "status",
      label: "Status",
      state: "ready",
      hidden: onRoster,
      items: STATUS_ORDER.map(status => item(status, STATUS_LABELS[status], statusCount(status), selected.status))
    },
    // Position stays on the roster floor (people have positions) but hides
    // there when nobody listed carries one (owner ruling 2026-09-04).
    { id: "position", label: "Position", state: "ready", hidden: onRoster && positionItems.every(entry => entry.count === 0), items: positionItems }
  ];
}
