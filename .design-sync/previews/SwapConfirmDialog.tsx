import { SwapConfirmDialog } from "seat-planner";

// SeatWithEmployee factories (lib/types.ts shapes) — same pattern as the
// SeatMarker preview. Admin-theme wrapper: impact banner + buttons read
// --admin-* tokens.

const employee = (id: string, name: string, position: string, department: string) => ({
  id,
  full_name: name,
  position,
  department,
  phone_extension: "204",
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
  x: 0.4,
  y: 0.55,
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

export const Default = () => (
  <div className="admin-theme" style={stage}>
    <SwapConfirmDialog
      swapSourceSeat={seat("a-12", "A-12", "North Wing", anahit)}
      swapTargetSeat={seat("b-03", "B-03", "South Wing", marcus)}
      pending={false}
      onCancel={() => {}}
      onConfirm={() => {}}
    />
  </div>
);

// Swapping into an open seat — target card and summary read "Open".
export const OpenTarget = () => (
  <div className="admin-theme" style={stage}>
    <SwapConfirmDialog
      swapSourceSeat={seat("a-12", "A-12", "North Wing", anahit)}
      swapTargetSeat={seat("a-14", "A-14", "North Wing", null)}
      pending={false}
      onCancel={() => {}}
      onConfirm={() => {}}
    />
  </div>
);
