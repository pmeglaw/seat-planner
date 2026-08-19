import { SeatMap } from "seat-planner";

// SeatMap is the /admin draft editor: standalone dark header (no AppShell in
// previews, so the fallback chrome renders), full-bleed plan with editable
// markers, publish cluster, filter/search chrome. The floor-plan raster
// (public/images/office-floor-plan.webp) is not in the preview bundle, so
// the plan area shows the workspace band instead of the drawing — markers,
// washes and chrome still render in place. Draft differs from published in
// two seats (C-06 newly assigned, B-04 newly reserved) so the pending
// publish cluster has something honest to count.

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
const james = employee("e-james", "James Harootunian", "Senior Attorney", "Litigation", "201");
const sofia = employee("e-sofia", "Sofia Reyes", "Estate Planning Attorney", "Estate Planning", "222");
const priya = employee("e-priya", "Priya Natarajan", "Records Clerk", "Records", "230");
const tom = employee("e-tom", "Tom Okafor", "Litigation Paralegal", "Litigation", "208");
const maria = employee("e-maria", "Maria Duarte", "Billing Coordinator", "Records", "226");

const employees = [anahit, marcus, elena, daniel, grace, james, sofia, priya, tom, maria];

type Emp = ReturnType<typeof employee>;

const seat = (
  layer: "draft" | "published",
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
  layer,
  employee_id: emp?.id ?? null,
  zone,
  department: emp?.department ?? null,
  notes,
  is_custom: false,
  ...TS,
  employee: emp
});

type SeatSpec = [
  string,
  string,
  number,
  number,
  "available" | "assigned" | "reserved" | "unavailable",
  string,
  Emp | null,
  (string | null)?
];

// The published floor everyone sees today. One seat per private office
// (A-03, A-05, B-01 land inside measured room rects and render as
// nameplates); the rest sit on the open floor.
const publishedSpecs: SeatSpec[] = [
  ["a03", "A-03", 0.13, 0.18, "assigned", "North Wing", tom],
  ["a05", "A-05", 0.25, 0.18, "assigned", "North Wing", james],
  ["a12", "A-12", 0.34, 0.17, "assigned", "North Wing", anahit],
  ["a14", "A-14", 0.385, 0.17, "available", "North Wing", null],
  ["b03", "B-03", 0.33, 0.44, "assigned", "North Wing", marcus],
  ["b04", "B-04", 0.375, 0.44, "available", "North Wing", null],
  ["b07", "B-07", 0.42, 0.44, "available", "North Wing", null],
  ["b01", "B-01", 0.55, 0.18, "assigned", "East Wing", sofia],
  ["b02", "B-02", 0.73, 0.32, "available", "East Wing", null],
  ["b05", "B-05", 0.775, 0.32, "unavailable", "East Wing", null, "Standing desk awaiting repair"],
  ["c01", "C-01", 0.3, 0.74, "assigned", "South Wing", daniel],
  ["c02", "C-02", 0.35, 0.74, "assigned", "South Wing", grace],
  ["c03", "C-03", 0.4, 0.74, "assigned", "South Wing", elena],
  ["c04", "C-04", 0.45, 0.74, "unavailable", "South Wing", null, "Printer alcove"],
  ["c05", "C-05", 0.5, 0.74, "assigned", "South Wing", priya],
  ["c06", "C-06", 0.55, 0.74, "available", "South Wing", null]
];

// The draft working copy: Maria seated at C-06, B-04 held for the clerkship.
const draftSpecs: SeatSpec[] = publishedSpecs.map(spec => {
  if (spec[1] === "C-06") return ["c06", "C-06", 0.55, 0.74, "assigned", "South Wing", maria];
  if (spec[1] === "B-04")
    return ["b04", "B-04", 0.375, 0.44, "reserved", "North Wing", null, "Held for the fall clerkship"];
  return spec;
});

const publishedSeats = publishedSpecs.map(([id, label, x, y, status, zone, emp, notes]) =>
  seat("published", `pub-${id}`, label, x, y, status, zone, emp, notes ?? null)
);

const draftSeats = draftSpecs.map(([id, label, x, y, status, zone, emp, notes]) =>
  seat("draft", `draft-${id}`, label, x, y, status, zone, emp, notes ?? null)
);

const option = (id: string, name: string) => ({ id, name, active: true, ...TS });

const departmentOptions = [
  option("d1", "Litigation"),
  option("d2", "Intake"),
  option("d3", "Estate Planning"),
  option("d4", "Records")
];

const zoneOptions = [option("z1", "North Wing"), option("z2", "East Wing"), option("z3", "South Wing")];

// The surface sizes itself off the screen (root `lg:h-screen`), and since
// #408 folded the legend and zoom into a bottom status band, the last row sat
// exactly on the card's bottom edge. Give the cell an explicit stage and pin
// the surface to it — same relationship the app has with the viewport.
const STAGE_CSS = `[data-ds-stage="seat-map"] > div { height: 100% !important; min-height: 0 !important; }`;

export const AdminDraftEditor = () => (
  <div className="admin-theme" style={{ height: 700, overflow: "hidden" }}>
    <style>{STAGE_CSS}</style>
    <div data-ds-stage="seat-map" style={{ height: "100%" }}>
    <SeatMap
      seats={draftSeats}
      publishedSeats={publishedSeats}
      employees={employees}
      publishedEmployees={employees}
      departmentOptions={departmentOptions}
      zoneOptions={zoneOptions}
      canEdit
    />
    </div>
  </div>
);
