import { MoveEmployeeConfirmDialog } from "seat-planner";

// Two real branches: plain move to an open seat (canonical) and the
// occupied-target swap offer. Admin-theme wrapper: impact banner + buttons
// read --admin-* tokens.

const employee = (id: string, name: string, position: string, department: string) => ({
  id,
  full_name: name,
  position,
  department,
  phone_extension: "212",
  email: null,
  avatar_url: null,
  active: true,
  created_at: "2026-01-05T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z"
});

const seat = (
  id: string,
  label: string,
  zone: string,
  emp: ReturnType<typeof employee> | null
) => ({
  id,
  seat_key: id,
  label,
  x: 0.62,
  y: 0.31,
  status: (emp ? "assigned" : "available") as "assigned" | "available",
  layer: "draft" as const,
  employee_id: emp?.id ?? null,
  zone,
  department: emp?.department ?? null,
  notes: null,
  is_custom: false,
  created_at: "2026-01-05T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z",
  employee: emp
});

const anahit = employee("e1", "Anahit Petrosyan", "Senior Paralegal", "Litigation");
const marcus = employee("e2", "Marcus Webb", "Associate Attorney", "Intake");

// Explicit stage: the harness story root is transformed, so the fixed overlay
// resolves against this wrapper — without a real height the backdrop collapses
// and the dialog top clips above the shot. 512 = 560 viewport minus gutters.
const stage = { position: "relative" as const, height: 512, transform: "translateZ(0)" };

// Move Marcus Webb from B-03 to the open A-14 — B-03 becomes Open.
export const Default = () => (
  <div className="admin-theme" style={stage}>
    <MoveEmployeeConfirmDialog
      offerSwap={false}
      moveEmployeeSourceSeat={seat("b-03", "B-03", "South Wing", marcus)}
      moveEmployeeTargetSeat={seat("a-14", "A-14", "North Wing", null)}
      sourceEmployeeName="Marcus Webb"
      pending={false}
      onCancel={() => {}}
      onConfirmSwap={() => {}}
      onConfirmMove={() => {}}
    />
  </div>
);

// Target already occupied by Anahit Petrosyan — the dialog offers a swap.
export const OfferSwap = () => (
  <div className="admin-theme" style={stage}>
    <MoveEmployeeConfirmDialog
      offerSwap
      moveEmployeeSourceSeat={seat("b-03", "B-03", "South Wing", marcus)}
      moveEmployeeTargetSeat={seat("a-12", "A-12", "North Wing", anahit)}
      sourceEmployeeName="Marcus Webb"
      pending={false}
      onCancel={() => {}}
      onConfirmSwap={() => {}}
      onConfirmMove={() => {}}
    />
  </div>
);
