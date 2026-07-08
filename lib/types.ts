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

export type UpdateSeatResult =
  | { ok: true; seat: SeatWithEmployee }
  | { ok: false; code: "EMPLOYEE_ALREADY_ASSIGNED"; message: string; currentSeatLabel: string }
  | { ok: false; code: "STALE_DRAFT"; message: string }
  | { ok: false; code: "VALIDATION"; message: string };
