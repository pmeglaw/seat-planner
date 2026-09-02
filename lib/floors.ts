import { findSeatIdByParam } from "@/lib/deepLink";
import { departmentKey, normalizeDepartmentName } from "@/lib/departments";
import { FLOOR_2_PLAN } from "@/lib/floorGeometry/floor2";
import type { FloorPlan } from "@/lib/floorGeometry/types";
import { DEFAULT_FLOOR, FLOOR_IDS, floorOf, isFloorId, type FloorId } from "@/lib/floorIds";
import { formatDisplayName } from "@/lib/formatName";
import { MAP_IMAGE_BLUR_DATA_URL, MAP_IMAGE_HEIGHT, MAP_IMAGE_SRC, MAP_IMAGE_WIDTH } from "@/lib/mapLayoutTransform";
import { seatMatchesPosition } from "@/lib/positions";
import { FILTER_ALL } from "@/lib/seatFilters";
import type { Employee } from "@/lib/types";

/**
 * The floor REGISTRY and every floor rule the surfaces share (multi-floor,
 * 2026-09-01). This module may import the geometry modules — nothing in lib/
 * imports it back — but the geometry modules import only the leaves
 * (lib/floorIds, lib/floorGeometry/*); tests/floors.test.mjs pins the graph.
 *
 * Owner rulings encoded here (do not re-derive elsewhere):
 *   - two floors, 3 (this plan) and 2; the garage is deliberately absent;
 *   - `mapped` has ONE home: a floor is mapped exactly when it has a plan;
 *   - a floor is LIVE when it is mapped AND a seat in the caller's layer
 *     carries it — the viewer, reception and my-seat pass published rows, the
 *     admin editor passes draft rows;
 *   - INTERIM RULE: until Floor 2 is live, every active person without a
 *     seat works on Floor 2 (owner, 2026-09-01: "everyone without a desk is
 *     on the 2nd floor"). It is an inference, not data, so it lives in exactly
 *     one function (rosterFloorForUnseated) and retires by itself the first
 *     time a floor-2 seat is published — no flag to flip, nothing to delete.
 */

export type FloorDefinition = {
  id: FloorId;
  number: number;
  /** Practice-group name — the chrome trigger label (owner call 2026-08-14). */
  name: string;
  /** "Floor 3 · Pre-Litigation" — menu options, roster headers, copy. */
  label: string;
  /** "Pre-Litigation" — the AppTopBar centre trigger only. */
  shortLabel: string;
  /** "Floor 3" — every other short mention (band title, tags, suffixes). */
  tag: string;
  sortOrder: number;
  plan: FloorPlan | null;
  /** Convenience mirror of `plan !== null` for display code. Every RULE in
   *  this module reads the plan itself (floorIsMapped), so a registry with a
   *  different plan behaves accordingly even when this mirror is stale. */
  mapped: boolean;
};

export type FloorRegistry = Record<FloorId, FloorDefinition>;

function define(seed: Omit<FloorDefinition, "mapped">): FloorDefinition {
  return { ...seed, mapped: seed.plan !== null };
}

export const FLOORS: FloorRegistry = {
  "3": define({
    id: "3",
    number: 3,
    name: "Pre-Litigation",
    label: "Floor 3 · Pre-Litigation",
    shortLabel: "Pre-Litigation",
    tag: "Floor 3",
    sortOrder: 0,
    // The shipped raster, by reference: lib/mapLayoutTransform owns the
    // constants (and their ?v= / blur regeneration contract).
    plan: { src: MAP_IMAGE_SRC, width: MAP_IMAGE_WIDTH, height: MAP_IMAGE_HEIGHT, blurDataUrl: MAP_IMAGE_BLUR_DATA_URL }
  }),
  "2": define({
    id: "2",
    number: 2,
    name: "Litigation",
    label: "Floor 2 · Litigation",
    shortLabel: "Litigation",
    tag: "Floor 2",
    sortOrder: 1,
    plan: FLOOR_2_PLAN
  })
};

export function listFloors(registry: FloorRegistry = FLOORS): FloorDefinition[] {
  return FLOOR_IDS.map(id => registry[id]).sort((left, right) => left.sortOrder - right.sortOrder);
}

export function floorLabel(id: FloorId, registry: FloorRegistry = FLOORS): string {
  return registry[id].label;
}

export function floorShortLabel(id: FloorId, registry: FloorRegistry = FLOORS): string {
  return registry[id].shortLabel;
}

export function floorTag(id: FloorId, registry: FloorRegistry = FLOORS): string {
  return registry[id].tag;
}

/** "2nd", "3rd" — for prose such as "The 2nd-floor plan is not mapped yet." */
export function floorOrdinal(id: FloorId, registry: FloorRegistry = FLOORS): string {
  const n = registry[id].number;
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th";
  return `${n}${suffix}`;
}

type FloorRow = { floor?: string | null };
type SeatRow = FloorRow & { employee_id?: string | null };

/** The one home of "mapped": a floor is mapped exactly when it has a plan. */
export function floorIsMapped(floor: FloorId, registry: FloorRegistry = FLOORS): boolean {
  return registry[floor].plan !== null;
}

/** Mapped AND a seat in the given layer carries the floor. */
export function floorIsLive(floor: FloorId, seats: readonly FloorRow[], registry: FloorRegistry = FLOORS): boolean {
  return floorIsMapped(floor, registry) && seats.some(seat => floorOf(seat) === floor);
}

/** A live floor renders its plan; anything else renders the roster. */
export function floorSurface(floor: FloorId, seats: readonly FloorRow[], registry: FloorRegistry = FLOORS): "plan" | "roster" {
  return floorIsLive(floor, seats, registry) ? "plan" : "roster";
}

// ---------------------------------------------------------------------------
// INTERIM RULE (owner, 2026-09-01) — the one home. See the module header.
// ---------------------------------------------------------------------------

/** The single floor that is not live, i.e. where every unseated person works;
 *  null when that is ambiguous (no floor live yet, or every floor live). */
export function rosterFloorForUnseated(seats: readonly FloorRow[], registry: FloorRegistry = FLOORS): FloorId | null {
  const notLive = FLOOR_IDS.filter(id => !floorIsLive(id, seats, registry));
  return notLive.length === 1 ? notLive[0] : null;
}

export function floorOfPerson(
  assignedSeat: FloorRow | null | undefined,
  seats: readonly FloorRow[],
  registry: FloorRegistry = FLOORS
): FloorId | null {
  return assignedSeat ? floorOf(assignedSeat) : rosterFloorForUnseated(seats, registry);
}

/** Active people on a floor: those seated there, plus — on the roster floor —
 *  every active person with no seat in the given layer. */
export function peopleOnFloor(
  floor: FloorId,
  seats: readonly SeatRow[],
  employees: readonly Employee[],
  registry: FloorRegistry = FLOORS
): Employee[] {
  const seatFloorByEmployee = new Map<string, FloorId>();
  for (const seat of seats) {
    if (seat.employee_id && !seatFloorByEmployee.has(seat.employee_id)) {
      seatFloorByEmployee.set(seat.employee_id, floorOf(seat));
    }
  }
  const rosterFloor = rosterFloorForUnseated(seats, registry);
  return employees.filter(employee => {
    if (employee.active === false) return false;
    const seatFloor = seatFloorByEmployee.get(employee.id);
    return seatFloor ? seatFloor === floor : rosterFloor === floor;
  });
}

// ---------------------------------------------------------------------------
// Landing
// ---------------------------------------------------------------------------

/** ?seat= / ?floor= → remembered → own seat → Floor 3. */
export function landingFloor(input: {
  urlFloor?: FloorId | null;
  storedFloor?: string | null;
  ownFloor?: FloorId | null;
}): FloorId {
  return input.urlFloor ?? (isFloorId(input.storedFloor) ? input.storedFloor : null) ?? input.ownFloor ?? DEFAULT_FLOOR;
}

/** The floor the URL asks for: a matching ?seat= wins (its floor), else a
 *  valid ?floor=, else null. */
export function urlFloorFor(
  seats: ReadonlyArray<{ id: string; label: string } & FloorRow>,
  params: { seat?: string | null; floor?: string | null }
): FloorId | null {
  const seatId = findSeatIdByParam(seats, params.seat);
  if (seatId) {
    const seat = seats.find(candidate => candidate.id === seatId);
    if (seat) return floorOf(seat);
  }
  return isFloorId(params.floor) ? params.floor : null;
}

// ---------------------------------------------------------------------------
// Roster (the surface an unmapped floor renders)
// ---------------------------------------------------------------------------

export const NO_DEPARTMENT_LABEL = "No department";

export type RosterGroup = {
  /** departmentKey, "" for people with no department. */
  key: string;
  department: string;
  people: Employee[];
};

function rosterHaystack(person: Employee): string {
  return [person.full_name, person.position, person.department, person.phone_extension, person.email]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function compareText(left: string, right: string) {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

/** Department groups A→Z (people with no department last), people A→Z by
 *  display name within; an optional query filters people first. */
export function groupRosterByDepartment(people: readonly Employee[], query = ""): RosterGroup[] {
  const needle = query.trim().toLowerCase();
  const groups = new Map<string, Employee[]>();
  for (const person of people) {
    if (needle && !rosterHaystack(person).includes(needle)) continue;
    const key = departmentKey(person.department) ?? "";
    const members = groups.get(key);
    if (members) members.push(person);
    else groups.set(key, [person]);
  }
  return [...groups.entries()]
    .map(([key, members]) => {
      const sorted = [...members].sort((left, right) =>
        compareText(formatDisplayName(left.full_name), formatDisplayName(right.full_name))
      );
      return { key, department: normalizeDepartmentName(sorted[0].department) ?? NO_DEPARTMENT_LABEL, people: sorted };
    })
    .sort((left, right) => {
      if ((left.key === "") !== (right.key === "")) return left.key === "" ? 1 : -1;
      return compareText(left.department, right.department);
    });
}

// ---------------------------------------------------------------------------
// Q5 (closed 2026-09-01): the department filter is floor-aware
// ---------------------------------------------------------------------------

/** The department and position facets applied to a PERSON — what the roster
 *  floor filters by, where zone and status (seat facts) are inert. */
export function personPassesFilters(person: Employee, filters: { department: string; position: string }): boolean {
  const departmentOk = filters.department === FILTER_ALL || departmentKey(person.department) === departmentKey(filters.department);
  return departmentOk && seatMatchesPosition(person.position, filters.position);
}

function personMatchesFilters(person: Employee, department: string, position: string): boolean {
  return personPassesFilters(person, { department, position });
}

function displayDepartment(employees: readonly Employee[], department: string): string {
  const key = departmentKey(department);
  const spelled = employees.find(employee => departmentKey(employee.department) === key);
  return normalizeDepartmentName(spelled?.department) ?? normalizeDepartmentName(department) ?? department;
}

/**
 * The filter popover's match line. On a plan floor: the seat count, and when a
 * department has no seats here but people on another floor, say so and offer
 * the switch (choosing Litigation on Floor 3 must never return an unchanged
 * map in silence). On the roster floor: a people count, filtered by
 * department and position (zone and status are inert there).
 */
export function floorDepartmentSummary(input: {
  floor: FloorId;
  department: string;
  position: string;
  floorMatchCount: number;
  floorSeatCount: number;
  seats: readonly SeatRow[];
  employees: readonly Employee[];
  registry?: FloorRegistry;
}): { text: string; switchTo: FloorId | null } {
  const { floor, department, position, floorMatchCount, floorSeatCount, seats, employees, registry = FLOORS } = input;
  const tag = registry[floor].tag;

  if (floorSurface(floor, seats, registry) === "roster") {
    const people = peopleOnFloor(floor, seats, employees, registry);
    const matched = people.filter(person => personMatchesFilters(person, department, position)).length;
    return { text: `${matched} of ${people.length} people on ${tag} match`, switchTo: null };
  }

  if (department === FILTER_ALL || floorMatchCount > 0) {
    return { text: `${floorMatchCount} of ${floorSeatCount} seats on ${tag} match`, switchTo: null };
  }

  let best: { floor: FloorId; count: number } | null = null;
  for (const other of FLOOR_IDS) {
    if (other === floor) continue;
    const count = peopleOnFloor(other, seats, employees, registry).filter(person =>
      personMatchesFilters(person, department, position)
    ).length;
    if (count > 0 && (!best || count > best.count)) best = { floor: other, count };
  }
  if (!best) return { text: `0 of ${floorSeatCount} seats on ${tag} match`, switchTo: null };

  const noun = best.count === 1 ? "person" : "people";
  const verb = best.count === 1 ? "is" : "are";
  return {
    text: `0 of ${floorSeatCount} seats on ${tag} · ${best.count} ${noun} in ${displayDepartment(employees, department)} ${verb} on ${registry[best.floor].tag}`,
    switchTo: best.floor
  };
}

// ---------------------------------------------------------------------------
// Copy helpers
// ---------------------------------------------------------------------------

/** " on Floor 2" when a seat's floor differs from the context floor, else "". */
export function floorSuffix(seat: FloorRow, contextFloor: FloorId, registry: FloorRegistry = FLOORS): string {
  const floor = floorOf(seat);
  return floor === contextFloor ? "" : ` on ${registry[floor].tag}`;
}

/** The viewer's remembered floor (second persisted viewer preference, owner
 *  ruling 2026-09-01 — supersedes the 2026-08-17 "one preference" note). */
export const VIEWER_FLOOR_STORAGE_KEY = "seat-planner:viewer-floor";
