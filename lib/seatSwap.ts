import type { SeatStatus, SeatWithEmployee } from "@/lib/types";

export type SeatSwapSeat = Pick<SeatWithEmployee, "id" | "label" | "status" | "employee_id" | "employee">;

export type SeatSwapPatch = {
  seatId: string;
  employeeId: string | null;
  status: SeatStatus;
};

export type SeatSwapSummary = {
  sourceSeatLabel: string;
  targetSeatLabel: string;
  sourceEmployeeName: string | null;
  targetEmployeeName: string | null;
  sourceNextEmployeeName: string | null;
  targetNextEmployeeName: string | null;
};

export type SeatSwapPlan = {
  sourcePatch: SeatSwapPatch;
  targetPatch: SeatSwapPatch;
  summary: SeatSwapSummary;
};

function emptySeatStatus(seat: SeatSwapSeat): SeatStatus {
  if (seat.employee_id) return "available";
  return seat.status === "reserved" || seat.status === "unavailable" ? seat.status : "available";
}

function statusForAssignment(employeeId: string | null, fallbackStatus: SeatStatus): SeatStatus {
  return employeeId ? "assigned" : fallbackStatus;
}

function employeeName(seat: SeatSwapSeat) {
  return seat.employee?.full_name ?? null;
}

export function buildSeatSwapPlan(sourceSeat: SeatSwapSeat, targetSeat: SeatSwapSeat): SeatSwapPlan {
  if (sourceSeat.id === targetSeat.id) {
    throw new Error("Choose a different target seat to complete the swap.");
  }

  if (!sourceSeat.employee_id && !targetSeat.employee_id) {
    throw new Error("Swap requires at least one assigned seat.");
  }

  const sourceNextEmployeeId = targetSeat.employee_id ?? null;
  const targetNextEmployeeId = sourceSeat.employee_id ?? null;

  return {
    sourcePatch: {
      seatId: sourceSeat.id,
      employeeId: sourceNextEmployeeId,
      status: statusForAssignment(sourceNextEmployeeId, emptySeatStatus(targetSeat))
    },
    targetPatch: {
      seatId: targetSeat.id,
      employeeId: targetNextEmployeeId,
      status: statusForAssignment(targetNextEmployeeId, emptySeatStatus(sourceSeat))
    },
    summary: {
      sourceSeatLabel: sourceSeat.label,
      targetSeatLabel: targetSeat.label,
      sourceEmployeeName: employeeName(sourceSeat),
      targetEmployeeName: employeeName(targetSeat),
      sourceNextEmployeeName: employeeName(targetSeat),
      targetNextEmployeeName: employeeName(sourceSeat)
    }
  };
}
