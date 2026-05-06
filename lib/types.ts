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
  avatar_url: string | null;
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
  department: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type SeatWithEmployee = Seat & {
  employee: Employee | null;
};

export type SeatCreateInput = {
  label: string;
  x: number;
  y: number;
  department?: string | null;
  notes?: string | null;
};

export type SeatUpdateInput = {
  id: string;
  label?: string;
  status?: SeatStatus;
  employee_id?: string | null;
  department?: string | null;
  notes?: string | null;
};

export type EmployeeCreateInput = {
  full_name: string;
  position?: string | null;
  department?: string | null;
};

export const SEAT_STATUSES: SeatStatus[] = [
  "available",
  "assigned",
  "reserved",
  "unavailable"
];
