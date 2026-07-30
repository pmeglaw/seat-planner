export type UserRole = "admin" | "viewer";
export type SeatStatus = "available" | "assigned" | "reserved" | "unavailable";
export type SeatLayer = "draft" | "published";

export type Profile = {
  id: string;
  email: string;
  role: UserRole;
  created_at: string;
};

export type Employee = {
  id: string;
  full_name: string;
  position: string | null;
  department: string | null;
  phone_extension: string | null;
  email: string | null;
  avatar_url: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type DepartmentOption = {
  id: string;
  name: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type ZoneOption = {
  id: string;
  name: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type Seat = {
  id: string;
  seat_key: string;
  label: string;
  x: number;
  y: number;
  status: SeatStatus;
  layer: SeatLayer;
  employee_id: string | null;
  zone?: string | null;
  department: string | null;
  notes: string | null;
  is_custom?: boolean | null;
  created_at: string;
  updated_at: string;
};

export type SeatWithEmployee = Seat & {
  employee: Employee | null;
};

export type SeatCreateInput = {
  x: number;
  y: number;
  notes?: string | null;
};

export type SeatUpdateInput = {
  id: string;
  label?: string;
  status?: SeatStatus;
  employee_id?: string | null;
  zone?: string | null;
  department?: string | null;
  notes?: string | null;
};

export type EmployeeCreateInput = {
  full_name: string;
  position?: string | null;
  department?: string | null;
  phone_extension?: string | null;
};

export type CsvAssignmentRow = {
  seat_label: string;
  employee_name: string;
  employee_email: string;
  position: string;
  department: string;
  zone: string;
  status: string;
  notes: string;
};

export type AskPlannerRequest = {
  question: string;
  seatId?: string | null;
};

export type AskPlannerStatus = "answered" | "refused" | "needs_clarification";
export type AskPlannerConfidence = "low" | "medium" | "high";

export type AskPlannerHighlight = {
  seatId: string;
  label: string;
  reason: string;
};

export type AskPlannerResponse = {
  status: AskPlannerStatus;
  answer: string;
  summary: string;
  confidence: AskPlannerConfidence;
  highlights: AskPlannerHighlight[];
  warnings: string[];
  followUps: string[];
};

export const SEAT_STATUSES: SeatStatus[] = [
  "available",
  "assigned",
  "reserved",
  "unavailable"
];

// "available" reads as "Open" everywhere a person sees it (legend, chips,
// filters, tooltips) — one name per status, this map is the only place it is
// spelled (2026-07-16 critique, action 3).
export const STATUS_LABELS: Record<SeatStatus, string> = {
  available: "Open",
  assigned: "Assigned",
  reserved: "Reserved",
  unavailable: "Unavailable"
};

// The ok branch also carries the fresh full draft payload (same helper
// swapSeatAssignmentsAction uses) — not just the one seat the caller asked to
// update. A force_move vacates the mover's OTHER draft seat server-side, which
// bumps that row's updated_at via the touch_seats_updated_at trigger; a caller
// that only had `seat` could only reconstruct that other seat by spreading its
// own stale pre-mutation copy, baking a stale timestamp into local state that
// fails the next Undo's per-row concurrency fence (MLS02). Ingest `seats`/
// `employees` wholesale instead, exactly like swap already does.
export type UpdateSeatResult =
  | { ok: true; seat: SeatWithEmployee; seats: SeatWithEmployee[]; employees: Employee[] }
  | { ok: false; code: "EMPLOYEE_ALREADY_ASSIGNED"; message: string; currentSeatLabel: string }
  | { ok: false; code: "STALE_DRAFT"; message: string }
  | { ok: false; code: "VALIDATION"; message: string };
