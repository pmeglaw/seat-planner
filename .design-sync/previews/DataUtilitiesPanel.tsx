import { DataUtilitiesPanel } from "seat-planner";

// DataUtilitiesPanel is the /admin/settings utilities surface: guidance
// banner plus the CSV and snapshot tile grids. Its dialogs open only from
// interaction (and confirm through server actions, which previews stub to
// throw), so the tile grid is the reachable story. The component does not
// self-scope .admin-theme — the settings page provides it — so the wrapper
// mirrors that here.

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
const maria = employee("e-maria", "Maria Duarte", "Billing Coordinator", "Records", "226");

const employees = [anahit, marcus, elena, maria];

type Emp = ReturnType<typeof employee>;

const seat = (
  layer: "draft" | "published",
  id: string,
  label: string,
  x: number,
  y: number,
  status: "available" | "assigned" | "reserved" | "unavailable",
  zone: string,
  emp: Emp | null
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
  notes: null,
  is_custom: false,
  ...TS,
  employee: emp
});

// Draft differs from published (C-06 newly assigned) so "Reset draft to
// published" has honest pending changes behind it.
const publishedSeats = [
  seat("published", "pub-a12", "A-12", 0.19, 0.17, "assigned", "North Wing", anahit),
  seat("published", "pub-b03", "B-03", 0.1, 0.31, "assigned", "North Wing", marcus),
  seat("published", "pub-c03", "C-03", 0.4, 0.74, "assigned", "South Wing", elena),
  seat("published", "pub-c06", "C-06", 0.55, 0.74, "available", "South Wing", null)
];

const draftSeats = [
  seat("draft", "draft-a12", "A-12", 0.19, 0.17, "assigned", "North Wing", anahit),
  seat("draft", "draft-b03", "B-03", 0.1, 0.31, "assigned", "North Wing", marcus),
  seat("draft", "draft-c03", "C-03", 0.4, 0.74, "assigned", "South Wing", elena),
  seat("draft", "draft-c06", "C-06", 0.55, 0.74, "assigned", "South Wing", maria)
];

export const UtilityTiles = () => (
  <div
    className="admin-theme"
    style={{ background: "var(--admin-bg, #F7F6F2)", padding: "24px 32px 40px" }}
  >
    <DataUtilitiesPanel seats={draftSeats} publishedSeats={publishedSeats} employees={employees} />
  </div>
);
