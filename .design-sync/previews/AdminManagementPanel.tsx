import { AdminManagementPanel } from "seat-planner";

// AdminManagementPanel is the /admin/management screen: summary tiles, tab
// row, and per-tab tables. It self-scopes .admin-theme on its own <main>.
// initialTab drives which section renders, so each cell is one tab. The
// publish-history tab is left out: it loads through a server action on
// mount, which previews stub to throw.

const TS = { created_at: "2026-02-02T09:00:00Z", updated_at: "2026-08-01T12:00:00Z" };

const employee = (id: string, full_name: string, position: string, department: string, ext: string) => ({
  id,
  full_name,
  position,
  department,
  phone_extension: ext,
  email: null,
  avatar_url: null,
  active: true,
  ...TS
});

const anahit = employee("e-anahit", "Anahit Petrosyan", "Senior Paralegal", "Litigation", "204");
const marcus = employee("e-marcus", "Marcus Webb", "Associate Attorney", "Litigation", "211");
const elena = employee("e-elena", "Elena Vasquez", "Office Manager", "Records", "202");
const daniel = employee("e-daniel", "Daniel Kim", "Intake Specialist", "Intake", "218");
const grace = employee("e-grace", "Grace Lindqvist", "Receptionist", "Intake", "200");
const sofia = employee("e-sofia", "Sofia Reyes", "Estate Planning Attorney", "Estate Planning", "222");

// Six people, one of them unassigned: the directory table then finishes inside
// the 900x700 card frame (a longer roster is cut mid-row by the capture
// viewport, which reads as a broken render), and the Status column still shows
// both badge states.
const employees = [anahit, marcus, elena, daniel, grace, sofia];

type Emp = ReturnType<typeof employee>;

const seat = (
  id: string,
  label: string,
  x: number,
  y: number,
  status: "available" | "assigned" | "reserved" | "unavailable",
  zone: string,
  emp: Emp | null,
  notes: string | null = null
) => ({
  id,
  seat_key: label.toLowerCase(),
  label,
  x,
  y,
  status,
  layer: "draft" as const,
  employee_id: emp?.id ?? null,
  zone,
  department: emp?.department ?? null,
  notes,
  is_custom: false,
  ...TS,
  employee: emp
});

const seats = [
  seat("s-a03", "A-03", 0.1, 0.17, "available", "North Wing", null),
  seat("s-a05", "A-05", 0.145, 0.17, "available", "North Wing", null),
  seat("s-a12", "A-12", 0.19, 0.17, "assigned", "North Wing", anahit),
  seat("s-a14", "A-14", 0.235, 0.17, "available", "North Wing", null),
  seat("s-b03", "B-03", 0.1, 0.31, "assigned", "North Wing", marcus),
  seat("s-b04", "B-04", 0.145, 0.31, "reserved", "North Wing", null, "Held for the fall clerkship"),
  seat("s-b07", "B-07", 0.19, 0.31, "available", "North Wing", null),
  seat("s-b01", "B-01", 0.55, 0.19, "reserved", "East Wing", null, "Held for Sofia Reyes — starts Monday"),
  seat("s-b02", "B-02", 0.6, 0.19, "available", "East Wing", null),
  seat("s-b05", "B-05", 0.65, 0.19, "unavailable", "East Wing", null, "Standing desk awaiting repair"),
  seat("s-c01", "C-01", 0.3, 0.74, "assigned", "South Wing", daniel),
  seat("s-c02", "C-02", 0.35, 0.74, "assigned", "South Wing", grace),
  seat("s-c03", "C-03", 0.4, 0.74, "assigned", "South Wing", elena),
  seat("s-c04", "C-04", 0.45, 0.74, "unavailable", "South Wing", null, "Printer alcove"),
  seat("s-c05", "C-05", 0.5, 0.74, "available", "South Wing", null),
  seat("s-c06", "C-06", 0.55, 0.74, "available", "South Wing", null)
];

const option = (id: string, name: string) => ({ id, name, active: true, ...TS });

const departmentOptions = [
  option("d1", "Litigation"),
  option("d2", "Intake"),
  option("d3", "Estate Planning"),
  option("d4", "Records")
];

const zoneOptions = [option("z1", "North Wing"), option("z2", "East Wing"), option("z3", "South Wing")];

export const EmployeesTab = () => (
  <AdminManagementPanel
    employees={employees}
    seats={seats}
    departmentOptions={departmentOptions}
    zoneOptions={zoneOptions}
    initialTab="employees"
  />
);

export const DepartmentsTab = () => (
  <AdminManagementPanel
    employees={employees}
    seats={seats}
    departmentOptions={departmentOptions}
    zoneOptions={zoneOptions}
    initialTab="departments"
  />
);

export const ZonesTab = () => (
  <AdminManagementPanel
    employees={employees}
    seats={seats}
    departmentOptions={departmentOptions}
    zoneOptions={zoneOptions}
    initialTab="zones"
  />
);
