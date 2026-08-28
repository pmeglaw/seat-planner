import { SeatInspector } from "seat-planner";
import type { ReactNode } from "react";

// SeatInspector is the dark right-docked seat panel (position:fixed; the
// capture viewport is at the `panel:` breakpoint, so it renders the 332px
// floating-panel layout). Each cell is a transformed habitat box that becomes
// the containing block for the fixed panel. Render-only: no save is
// submitted, so the shimmed updateSeatAction never runs.

const employee = (
  id: string,
  name: string,
  position: string,
  department: string,
  extension: string | null = "204",
  email: string | null = null
) => ({
  id,
  full_name: name,
  position,
  department,
  phone_extension: extension,
  email,
  avatar_url: null,
  active: true,
  created_at: "2026-01-05T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z"
});

const anahit = employee("e1", "Anahit Petrosyan", "Senior Paralegal", "Litigation", "204", "apetrosyan@example-firm.com");
const marcus = employee("e2", "Marcus Webb", "Associate Attorney", "Litigation", "211", "mwebb@example-firm.com");
const sona = employee("e3", "Sona Hakobyan", "Case Manager", "Intake", "218", null);
const lusine = employee("e4", "Lusine Grigoryan", "Records Clerk", "Records", null, null);
const EMPLOYEES = [anahit, marcus, sona, lusine];

const seat = (
  id: string,
  label: string,
  status: "available" | "assigned" | "reserved" | "unavailable",
  emp: ReturnType<typeof employee> | null,
  zone = "North Wing",
  notes: string | null = null,
  layer: "draft" | "published" = "draft"
) => ({
  id,
  seat_key: id,
  label,
  x: 0.42,
  y: 0.55,
  status,
  layer,
  employee_id: emp?.id ?? null,
  zone,
  department: emp?.department ?? null,
  notes,
  is_custom: false,
  created_at: "2026-01-05T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z",
  employee: emp
});

const SEATS = [
  seat("s1", "A-12", "assigned", anahit),
  seat("s2", "B-03", "assigned", marcus, "South Wing"),
  seat("s3", "C-05", "assigned", sona, "Reception"),
  seat("s4", "B-07", "available", null, "South Wing")
];

const departmentOption = (id: string, name: string) => ({
  id,
  name,
  active: true,
  created_at: "2026-01-05T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z"
});

const DEPARTMENT_OPTIONS = ["Litigation", "Intake", "Estate Planning", "Records"].map((name, index) =>
  departmentOption(`d${index + 1}`, name)
);

const noop = () => {};

const adminBase = {
  seats: SEATS,
  employees: EMPLOYEES,
  departmentOptions: DEPARTMENT_OPTIONS,
  canEdit: true,
  collapsed: false,
  onClose: noop,
  onMove: noop,
  onSwap: noop,
  onVacate: noop,
  onDeleteSeat: noop,
  onExplainSeat: noop
};

const Habitat = ({ label, children }: { label: string; children: ReactNode }) => (
  <div style={{ display: "grid", gap: 4 }}>
    <div
      className="admin-theme"
      style={{
        position: "relative",
        width: 364,
        height: 596,
        background: "var(--sp-background)",
        border: "1px solid #E7E1D8",
        transform: "translateZ(0)",
        overflow: "hidden"
      }}
    >
      {children}
    </div>
    <span style={{ fontSize: 11, color: "#6b6257", fontFamily: "var(--font-mono)" }}>{label}</span>
  </div>
);

export const AdminAssignedSeat = () => (
  <Habitat label="admin draft seat — meta row + progressive sections">
    <SeatInspector
      {...adminBase}
      seat={SEATS[0]}
      activityEntries={["Assigned Anahit Petrosyan to A-12", "Status changed to Assigned"]}
    />
  </Habitat>
);

export const AdminOpenSeat = () => (
  <Habitat label="admin open seat — assign path, swap only in Seat actions">
    <SeatInspector {...adminBase} seat={SEATS[3]} />
  </Habitat>
);

export const SearchMismatchNotice = () => (
  <Habitat label="search context mismatch — warning with clear actions">
    <SeatInspector
      {...adminBase}
      seat={SEATS[1]}
      searchMismatchNotice="This seat doesn't match your search for “Bianca Torres”."
      searchMismatchClearLabel="Clear search"
      onClearSearchContext={noop}
    />
  </Habitat>
);

export const ViewerPublishedSeat = () => (
  <Habitat label="viewer — read-only published assignment">
    <SeatInspector
      seats={SEATS.map((s) => ({ ...s, layer: "published" as const }))}
      employees={EMPLOYEES}
      departmentOptions={DEPARTMENT_OPTIONS}
      canEdit={false}
      collapsed={false}
      onClose={noop}
      seat={seat("s10", "C-02", "assigned", { ...marcus, email: "mwebb@example-firm.com" }, "Reception", null, "published")}
    />
  </Habitat>
);
