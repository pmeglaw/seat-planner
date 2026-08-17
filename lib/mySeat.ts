import { MAP_ASPECT_RATIO } from "@/lib/mapLayoutTransform";
import type { Employee, SeatWithEmployee } from "@/lib/types";

// Pure helpers behind the viewer "My seat" sheet (/my-seat): match the
// signed-in user to the published directory by email, find their seat, pick
// the neighbors worth naming, and frame the desk cluster for the drawing.
// The page passes seats already run through seatsToVisualSeats, so every
// coordinate here is a visual [0,1] pair; these helpers never re-calibrate.

export const NEIGHBOR_COUNT = 4;

function normalizeEmail(email: string | null | undefined): string | null {
  const trimmed = email?.trim().toLowerCase() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

export function findEmployeeByEmail(employees: Employee[], email: string | null | undefined): Employee | null {
  const wanted = normalizeEmail(email);
  if (!wanted) return null;
  return employees.find(candidate => normalizeEmail(candidate.email) === wanted) ?? null;
}

export function findSeatForEmployee(seats: SeatWithEmployee[], employeeId: string): SeatWithEmployee | null {
  return seats.find(seat => seat.employee_id === employeeId) ?? null;
}

// Normalized y spans the full image height while x spans a much wider image,
// so equal normalized deltas are unequal physical distances — scale dx by the
// map aspect ratio to rank by (approximate) physical proximity.
function physicalDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = (a.x - b.x) * MAP_ASPECT_RATIO;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

/** Nearest occupied seats to mine — same zone first, then the rest, each
 *  group ordered by physical distance (label as a deterministic tie-break). */
export function pickNeighbors(
  seats: SeatWithEmployee[],
  mySeat: SeatWithEmployee,
  count: number = NEIGHBOR_COUNT
): SeatWithEmployee[] {
  const compare = (a: SeatWithEmployee, b: SeatWithEmployee) => {
    const byDistance = physicalDistance(a, mySeat) - physicalDistance(b, mySeat);
    return byDistance !== 0 ? byDistance : a.label.localeCompare(b.label);
  };
  const candidates = seats.filter(seat => seat.id !== mySeat.id && seat.employee_id && seat.employee);
  const sameZone = candidates.filter(seat => seat.zone != null && seat.zone === mySeat.zone).sort(compare);
  const otherZones = candidates.filter(seat => !(seat.zone != null && seat.zone === mySeat.zone)).sort(compare);
  return [...sameZone, ...otherZones].slice(0, count);
}

export type ClusterFrame = { minX: number; minY: number; width: number; height: number };

const FRAME_PADDING = 0.35; // fraction of the larger span added per side
const MIN_SPAN = 0.06; // floor so a lone seat still gets a drawable box

/** Padded bounding box (clamped to [0,1]) around the desk cluster, used as
 *  the drawing's source window when projecting seats into the sheet. */
export function frameCluster(points: Array<{ x: number; y: number }>): ClusterFrame {
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY, MIN_SPAN);
  const pad = span * FRAME_PADDING;
  const left = Math.max(0, minX - pad);
  const top = Math.max(0, minY - pad);
  const right = Math.min(1, maxX + pad);
  const bottom = Math.min(1, maxY + pad);
  return { minX: left, minY: top, width: right - left, height: bottom - top };
}
