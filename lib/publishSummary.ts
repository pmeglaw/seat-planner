import type { Employee, SeatWithEmployee } from "@/lib/types";

export type PublishChangeItem = {
  label: string;
  detail: string;
};

/**
 * Live vs published employee directory, for the people half of the publish
 * gate: `employees` is the draft-side working set and `publishedEmployees` is
 * the viewer-facing snapshot replaced at publish time. Without this diff an
 * employee rename would never surface in the review (both sides of the seat
 * diff join the same live employee row) and could never be published.
 */
export type PublishEmployeeInputs = {
  employees: Employee[];
  publishedEmployees: Employee[];
};

export type PublishChangeSummary = {
  draftSeatCount: number;
  publishedSeatCount: number;
  addedSeats: PublishChangeItem[];
  removedSeats: PublishChangeItem[];
  assignmentChanges: PublishChangeItem[];
  vacatedSeats: PublishChangeItem[];
  statusChanges: PublishChangeItem[];
  otherChanges: PublishChangeItem[];
  employeeDetailChanges: PublishChangeItem[];
  updatedSeatCount: number;
  totalChangeCount: number;
  hasChanges: boolean;
};

const COORDINATE_EPSILON = 0.0005;

function normalizeKey(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function getPublishSeatKey(seat: SeatWithEmployee) {
  return normalizeKey(seat.seat_key) || normalizeKey(seat.label);
}

function getSeatZone(seat: SeatWithEmployee) {
  return seat.zone ?? seat.department ?? null;
}

function getSeatPersonLabel(seat: SeatWithEmployee) {
  if (seat.employee?.full_name) return seat.employee.full_name;
  if (seat.employee_id) return `Employee ${seat.employee_id}`;
  return "Open";
}

function getSeatDetail(seat: SeatWithEmployee) {
  const person = getSeatPersonLabel(seat);
  const parts = [
    getSeatZone(seat),
    person !== "Open" ? person : null,
    seat.status !== "available" ? seat.status : null
  ].filter(part => part && part !== "Open");
  return parts.join(" · ") || "Open seat";
}

function normalizeText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function textChanged(a: string | null | undefined, b: string | null | undefined) {
  return normalizeText(a) !== normalizeText(b);
}

function formatCoordinate(value: number) {
  return `${Math.round(Number(value) * 1000) / 10}%`;
}

function formatPoint(seat: SeatWithEmployee) {
  return `${formatCoordinate(Number(seat.x))}, ${formatCoordinate(Number(seat.y))}`;
}

function hasSeatMoved(draftSeat: SeatWithEmployee, publishedSeat: SeatWithEmployee) {
  return (
    Math.abs(Number(draftSeat.x) - Number(publishedSeat.x)) > COORDINATE_EPSILON ||
    Math.abs(Number(draftSeat.y) - Number(publishedSeat.y)) > COORDINATE_EPSILON
  );
}

function buildOtherChangeDetail(draftSeat: SeatWithEmployee, publishedSeat: SeatWithEmployee) {
  const changes: string[] = [];

  if (textChanged(publishedSeat.label, draftSeat.label)) changes.push(`Label ${publishedSeat.label} -> ${draftSeat.label}`);
  if (textChanged(getSeatZone(publishedSeat), getSeatZone(draftSeat))) changes.push(`Zone ${getSeatZone(publishedSeat) ?? "None"} -> ${getSeatZone(draftSeat) ?? "None"}`);
  if (textChanged(publishedSeat.department, draftSeat.department)) changes.push(`Department ${publishedSeat.department ?? "None"} -> ${draftSeat.department ?? "None"}`);
  if (textChanged(publishedSeat.notes, draftSeat.notes)) changes.push("Notes changed");
  if (Boolean(publishedSeat.is_custom) !== Boolean(draftSeat.is_custom)) changes.push(`Custom flag ${Boolean(publishedSeat.is_custom) ? "yes" : "no"} -> ${Boolean(draftSeat.is_custom) ? "yes" : "no"}`);

  return changes.join("; ");
}

function sortItems(items: PublishChangeItem[]) {
  return items.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
}

function buildSeatMap(seats: SeatWithEmployee[]) {
  const seatMap = new Map<string, SeatWithEmployee>();
  seats.forEach(seat => {
    const key = getPublishSeatKey(seat);
    if (key) seatMap.set(key, seat);
  });
  return seatMap;
}

function describeEmployeeDetailChange(published: Employee, live: Employee) {
  const changes: string[] = [];

  if (textChanged(published.full_name, live.full_name)) changes.push(`Name ${published.full_name} -> ${live.full_name}`);
  if (textChanged(published.position, live.position)) changes.push(`Title ${published.position ?? "None"} -> ${live.position ?? "None"}`);
  if (textChanged(published.department, live.department)) changes.push(`Department ${published.department ?? "None"} -> ${live.department ?? "None"}`);
  if (textChanged(published.phone_extension, live.phone_extension)) changes.push(`Ext. ${published.phone_extension ?? "None"} -> ${live.phone_extension ?? "None"}`);
  if (textChanged(published.email, live.email)) changes.push(`Email ${published.email ?? "None"} -> ${live.email ?? "None"}`);

  return changes.join("; ");
}

function buildEmployeeDetailChanges(inputs: PublishEmployeeInputs | undefined): PublishChangeItem[] {
  if (!inputs) return [];

  const liveActive = inputs.employees.filter(employee => employee.active);
  const publishedById = new Map(inputs.publishedEmployees.map(employee => [employee.id, employee]));
  const liveIds = new Set(liveActive.map(employee => employee.id));
  const items: PublishChangeItem[] = [];

  liveActive.forEach(live => {
    const published = publishedById.get(live.id);
    if (!published) {
      items.push({ label: live.full_name, detail: "New in the viewer directory" });
      return;
    }

    const detail = describeEmployeeDetailChange(published, live);
    if (detail) items.push({ label: live.full_name, detail });
  });

  inputs.publishedEmployees.forEach(published => {
    if (!liveIds.has(published.id)) {
      items.push({ label: published.full_name, detail: "Removed from the viewer directory" });
    }
  });

  return items;
}

export function buildPublishChangeSummary(
  draftSeats: SeatWithEmployee[],
  publishedSeats: SeatWithEmployee[],
  employeeInputs?: PublishEmployeeInputs
): PublishChangeSummary {
  const draftByKey = buildSeatMap(draftSeats);
  const publishedByKey = buildSeatMap(publishedSeats);
  const addedSeats: PublishChangeItem[] = [];
  const removedSeats: PublishChangeItem[] = [];
  const assignmentChanges: PublishChangeItem[] = [];
  const vacatedSeats: PublishChangeItem[] = [];
  const statusChanges: PublishChangeItem[] = [];
  const otherChanges: PublishChangeItem[] = [];
  const updatedSeatKeys = new Set<string>();

  draftByKey.forEach((draftSeat, key) => {
    const publishedSeat = publishedByKey.get(key);
    if (!publishedSeat) {
      addedSeats.push({ label: draftSeat.label, detail: getSeatDetail(draftSeat) });
      return;
    }

    const employeeChanged = normalizeText(publishedSeat.employee_id) !== normalizeText(draftSeat.employee_id);
    if (employeeChanged) {
      updatedSeatKeys.add(key);
      if (publishedSeat.employee_id && !draftSeat.employee_id) {
        vacatedSeats.push({ label: draftSeat.label, detail: `${getSeatPersonLabel(publishedSeat)} -> Open` });
      } else {
        assignmentChanges.push({ label: draftSeat.label, detail: `${getSeatPersonLabel(publishedSeat)} -> ${getSeatPersonLabel(draftSeat)}` });
      }
    }

    if (hasSeatMoved(draftSeat, publishedSeat)) {
      // The geometry-move UI is retired (2026-07-30), but snapshot restore and
      // legacy JSON snapshots can still shift coordinates — surface the drift
      // rather than silently publishing it.
      updatedSeatKeys.add(key);
      otherChanges.push({ label: draftSeat.label, detail: `position ${formatPoint(publishedSeat)} -> ${formatPoint(draftSeat)}` });
    }

    if (!employeeChanged && publishedSeat.status !== draftSeat.status) {
      updatedSeatKeys.add(key);
      statusChanges.push({ label: draftSeat.label, detail: `${publishedSeat.status} -> ${draftSeat.status}` });
    }

    const otherDetail = buildOtherChangeDetail(draftSeat, publishedSeat);
    if (otherDetail) {
      updatedSeatKeys.add(key);
      otherChanges.push({ label: draftSeat.label, detail: otherDetail });
    }
  });

  publishedByKey.forEach((publishedSeat, key) => {
    if (!draftByKey.has(key)) {
      removedSeats.push({ label: publishedSeat.label, detail: getSeatDetail(publishedSeat) });
    }
  });

  const employeeDetailChanges = buildEmployeeDetailChanges(employeeInputs);
  const updatedSeatCount = updatedSeatKeys.size;
  const totalChangeCount = addedSeats.length + updatedSeatCount + removedSeats.length + employeeDetailChanges.length;

  return {
    draftSeatCount: draftSeats.length,
    publishedSeatCount: publishedSeats.length,
    addedSeats: sortItems(addedSeats),
    removedSeats: sortItems(removedSeats),
    assignmentChanges: sortItems(assignmentChanges),
    vacatedSeats: sortItems(vacatedSeats),
    statusChanges: sortItems(statusChanges),
    otherChanges: sortItems(otherChanges),
    employeeDetailChanges: sortItems(employeeDetailChanges),
    updatedSeatCount,
    totalChangeCount,
    hasChanges: totalChangeCount > 0
  };
}
