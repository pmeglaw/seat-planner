"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseAssignmentCsv } from "@/lib/csv";
import type { DraftSnapshot } from "@/lib/draftHistory";
import { answerMapOperationsQuestion } from "@/lib/mapOperationsAgent";
import { resolvePublishHistoryProfiles, type PublishEventRecord } from "@/lib/publishHistory";
import { buildNextSeatLabel } from "@/lib/seatLabels";
import { canDeleteDraftSeat, getSeatDeleteBlockReason } from "@/lib/seatProtection";
import { buildSeatSwapPlan } from "@/lib/seatSwap";
import { detectSeatZoneForPointResult, getSeatZoneDetectionFailureMessage } from "@/lib/seatZones";
import { savedPointToVisualPoint, seatsToVisualSeats } from "@/lib/mapLayoutTransform";
import { assertNonEmpty, normalizeSeatStatus, validateSeatCoordinates } from "@/lib/validators";
import { SEAT_STATUSES, type AskPlannerRequest, type DepartmentOption, type Employee, type SeatStatus, type SeatWithEmployee, type ZoneOption } from "@/lib/types";

type DraftSeatRestoreRecord = Omit<SeatWithEmployee, "employee">;
type DraftEmployeeRestoreRecord = Employee;
type DraftSeatZoneSource = Pick<SeatWithEmployee, "label" | "zone" | "department" | "x" | "y">;
type SupabaseMutationError = {
  code?: string | null;
  message?: string | null;
};

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) throw new Error("You must be signed in.");

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (error || profile?.role !== "admin") {
    throw new Error("Admin permission required.");
  }

  return supabase;
}

async function getDraftSeatById(supabase: Awaited<ReturnType<typeof requireAdmin>>, seatId: string) {
  const { data, error } = await supabase
    .from("seats")
    .select("*, employee:employees(*)")
    .eq("id", seatId)
    .eq("layer", "draft")
    .single();

  if (error) throw new Error(error.message);
  return data as SeatWithEmployee;
}

async function getDraftMapPayload(supabase: Awaited<ReturnType<typeof requireAdmin>>) {
  const { data: seats, error: seatsError } = await supabase
    .from("seats")
    .select("*, employee:employees(*)")
    .eq("layer", "draft")
    .order("label");

  const { data: employees, error: employeesError } = await supabase
    .from("employees")
    .select("*")
    .eq("active", true)
    .order("full_name");

  if (seatsError || employeesError) {
    throw new Error(seatsError?.message ?? employeesError?.message ?? "Could not reload draft history state.");
  }

  return {
    seats: (seats ?? []) as SeatWithEmployee[],
    employees: (employees ?? []) as Employee[]
  };
}

export async function askPlannerAction(input: AskPlannerRequest) {
  const supabase = await requireAdmin();
  const question = typeof input?.question === "string" ? input.question : "";
  const seatId = typeof input?.seatId === "string" ? input.seatId : null;
  const { seats, employees } = await getDraftMapPayload(supabase);

  const { data: departments, error: departmentsError } = await supabase
    .from("department_options")
    .select("*")
    .eq("active", true)
    .order("name");

  const { data: zones, error: zonesError } = await supabase
    .from("zone_options")
    .select("*")
    .eq("active", true)
    .order("name");

  if (departmentsError || zonesError) {
    throw new Error(departmentsError?.message ?? zonesError?.message ?? "Could not load map options for Ask Planner.");
  }

  return answerMapOperationsQuestion({
    question,
    seatId,
    seats,
    employees,
    departmentOptions: (departments ?? []) as DepartmentOption[],
    zoneOptions: (zones ?? []) as ZoneOption[]
  });
}

function buildSeatKey(label: string) {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || `seat-${Date.now()}`;
}

function normalizeOptionalText(value?: string | null) {
  return value?.trim() || null;
}

function isUniqueLabelViolation(error: SupabaseMutationError | null) {
  const message = error?.message ?? "";
  return error?.code === "23505" || /seats_unique_label_per_layer|duplicate key/i.test(message);
}

async function getDraftSeatZoneSources(supabase: Awaited<ReturnType<typeof requireAdmin>>) {
  const { data, error } = await supabase
    .from("seats")
    .select("label,zone,department,x,y")
    .eq("layer", "draft");

  if (error) throw new Error(error.message);
  return (data ?? []) as DraftSeatZoneSource[];
}

function normalizeRestoreSeat(seat: SeatWithEmployee): DraftSeatRestoreRecord {
  if (seat.layer !== "draft") {
    throw new Error("Undo/redo can only restore draft seats.");
  }

  const id = assertNonEmpty(seat.id, "Seat id");
  const seatKey = assertNonEmpty(seat.seat_key, "Seat key");
  const label = assertNonEmpty(seat.label, "Seat label");
  const point = validateSeatCoordinates(Number(seat.x), Number(seat.y));

  if (!SEAT_STATUSES.includes(seat.status)) {
    throw new Error(`Invalid seat status '${seat.status}'.`);
  }

  return {
    id,
    seat_key: seatKey,
    label,
    x: point.x,
    y: point.y,
    status: normalizeSeatStatus(seat.status, Boolean(seat.employee_id)),
    layer: "draft",
    employee_id: seat.employee_id || null,
    zone: normalizeOptionalText(seat.zone ?? null),
    department: normalizeOptionalText(seat.department ?? null),
    notes: normalizeOptionalText(seat.notes ?? null),
    is_custom: Boolean(seat.is_custom),
    created_at: seat.created_at,
    updated_at: seat.updated_at
  };
}

function normalizeRestoreEmployee(employee: Employee): DraftEmployeeRestoreRecord {
  return {
    id: assertNonEmpty(employee.id, "Employee id"),
    full_name: assertNonEmpty(employee.full_name, "Employee name"),
    position: normalizeOptionalText(employee.position ?? null),
    department: normalizeOptionalText(employee.department ?? null),
    phone_extension: normalizeOptionalText(employee.phone_extension ?? null),
    avatar_url: normalizeOptionalText(employee.avatar_url ?? null),
    active: employee.active !== false,
    created_at: employee.created_at,
    updated_at: employee.updated_at
  };
}

async function upsertDepartmentOption(supabase: Awaited<ReturnType<typeof requireAdmin>>, name: string | null) {
  if (!name) return;
  const { error } = await supabase
    .from("department_options")
    .upsert({ name, active: true }, { onConflict: "name" });

  if (error) throw new Error(error.message);
}

async function upsertZoneOption(supabase: Awaited<ReturnType<typeof requireAdmin>>, name: string | null) {
  if (!name) return;
  const { error } = await supabase
    .from("zone_options")
    .upsert({ name, active: true }, { onConflict: "name" });

  if (error) throw new Error(error.message);
}

export async function createSeatAction(input: {
  x: number;
  y: number;
  visualX?: number;
  visualY?: number;
}) {
  const supabase = await requireAdmin();
  const point = validateSeatCoordinates(input.x, input.y);
  const visualPoint = input.visualX === undefined || input.visualY === undefined
    ? savedPointToVisualPoint(point)
    : validateSeatCoordinates(input.visualX, input.visualY);
  let draftSeats = await getDraftSeatZoneSources(supabase);
  const zoneResult = detectSeatZoneForPointResult(visualPoint, seatsToVisualSeats(draftSeats));

  if (zoneResult.status !== "detected") {
    throw new Error(getSeatZoneDetectionFailureMessage(zoneResult) ?? "Could not detect a zone for this location.");
  }

  const zone = zoneResult.zone;
  await upsertZoneOption(supabase, zone);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const label = buildNextSeatLabel(draftSeats, zone);
    const baseKey = buildSeatKey(label);
    const seatKey = `${baseKey}-${Date.now().toString(36)}-${attempt}`;

    const { data, error } = await supabase
      .from("seats")
      .insert({
        seat_key: seatKey,
        label,
        x: point.x,
        y: point.y,
        layer: "draft",
        status: "available",
        zone,
        department: null,
        is_custom: true
      })
      .select("*, employee:employees(*)")
      .single();

    if (!error) {
      revalidatePath("/admin");
      return data as SeatWithEmployee;
    }

    if (!isUniqueLabelViolation(error) || attempt === 2) {
      throw new Error(error.message);
    }

    draftSeats = await getDraftSeatZoneSources(supabase);
  }

  throw new Error("Could not create a unique seat label for this zone.");
}

export async function moveSeatAction(input: { seatId: string; x: number; y: number }) {
  const supabase = await requireAdmin();
  const point = validateSeatCoordinates(input.x, input.y);

  const { error } = await supabase
    .from("seats")
    .update({ x: point.x, y: point.y })
    .eq("id", input.seatId)
    .eq("layer", "draft");

  if (error) throw new Error(error.message);
  revalidatePath("/admin");
  return getDraftSeatById(supabase, input.seatId);
}

export async function updateSeatAction(input: {
  seatId: string;
  label: string;
  status: SeatStatus;
  employeeId?: string | null;
  employeeName?: string | null;
  employeePosition?: string | null;
  phoneExtension?: string | null;
  department?: string | null;
  zone?: string | null;
  notes?: string | null;
}) {
  const supabase = await requireAdmin();

  const label = assertNonEmpty(input.label, "Seat label");
  const employeeId = input.employeeId || null;
  const employeeName = input.employeeName?.trim() ?? "";
  const employeePosition = "employeePosition" in input ? normalizeOptionalText(input.employeePosition) : undefined;
  const phoneExtension = "phoneExtension" in input ? normalizeOptionalText(input.phoneExtension) : undefined;
  const department = normalizeOptionalText(input.department);
  const zone = normalizeOptionalText(input.zone);
  const notes = normalizeOptionalText(input.notes);

  if (!employeeId && input.status === "assigned" && !employeeName) {
    throw new Error("Assigned seats require an employee name or selected employee.");
  }

  const { error } = await supabase.rpc("update_draft_seat", {
    draft_seat_id: input.seatId,
    seat_label: label,
    requested_status: input.status,
    selected_employee_id: employeeId,
    employee_name: employeeName || null,
    employee_position: employeePosition ?? null,
    employee_position_provided: employeePosition !== undefined,
    employee_phone_extension: phoneExtension ?? null,
    employee_phone_extension_provided: phoneExtension !== undefined,
    employee_department: department,
    seat_zone: zone,
    seat_notes: notes
  });

  if (error) throw new Error(error.message);
  revalidatePath("/admin");
  return getDraftSeatById(supabase, input.seatId);
}

export async function swapSeatAssignmentsAction(input: {
  sourceSeatId: string;
  targetSeatId: string;
}) {
  const supabase = await requireAdmin();
  const sourceSeatId = assertNonEmpty(input.sourceSeatId, "Source seat");
  const targetSeatId = assertNonEmpty(input.targetSeatId, "Target seat");

  const { data: seats, error: seatsError } = await supabase
    .from("seats")
    .select("*, employee:employees(*)")
    .eq("layer", "draft")
    .in("id", [sourceSeatId, targetSeatId]);

  if (seatsError) throw new Error(seatsError.message);

  const draftSeats = (seats ?? []) as SeatWithEmployee[];
  const sourceSeat = draftSeats.find(seat => seat.id === sourceSeatId);
  const targetSeat = draftSeats.find(seat => seat.id === targetSeatId);

  if (!sourceSeat || !targetSeat) {
    throw new Error("Both seats must exist on the draft map before swapping.");
  }

  const originalSourceSeat = sourceSeat;
  const originalTargetSeat = targetSeat;
  const plan = buildSeatSwapPlan(sourceSeat, targetSeat);

  const { error } = await supabase.rpc("swap_draft_seat_assignments", {
    source_draft_seat_id: originalSourceSeat.id,
    target_draft_seat_id: originalTargetSeat.id
  });

  if (error) throw new Error(error.message);

  revalidatePath("/admin");
  return {
    ...(await getDraftMapPayload(supabase)),
    summary: plan.summary
  };
}

export async function createEmployeeAction(input: {
  fullName: string;
  position?: string | null;
  department?: string | null;
  phoneExtension?: string | null;
}) {
  const supabase = await requireAdmin();
  const fullName = assertNonEmpty(input.fullName, "Employee name");
  const department = normalizeOptionalText(input.department);

  await upsertDepartmentOption(supabase, department);

  const { data, error } = await supabase
    .from("employees")
    .insert({
      full_name: fullName,
      position: input.position?.trim() || null,
      department,
      phone_extension: normalizeOptionalText(input.phoneExtension),
      avatar_url: null,
      active: true
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/admin");
  return data as Employee;
}

export async function updateEmployeeAction(input: {
  employeeId: string;
  fullName: string;
  position?: string | null;
  department?: string | null;
  phoneExtension?: string | null;
}) {
  const supabase = await requireAdmin();
  const fullName = assertNonEmpty(input.fullName, "Employee name");
  const department = normalizeOptionalText(input.department);

  await upsertDepartmentOption(supabase, department);

  const { data, error } = await supabase
    .from("employees")
    .update({
      full_name: fullName,
      position: input.position?.trim() || null,
      department,
      phone_extension: normalizeOptionalText(input.phoneExtension),
      active: true
    })
    .eq("id", input.employeeId)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/");
  revalidatePath("/admin");
  return data as Employee;
}

export async function deleteEmployeeAction(employeeId: string) {
  const supabase = await requireAdmin();

  const { data: publishedSeat, error: publishedError } = await supabase
    .from("seats")
    .select("label")
    .eq("layer", "published")
    .eq("employee_id", employeeId)
    .maybeSingle();

  if (publishedError) throw new Error(publishedError.message);
  if (publishedSeat) {
    throw new Error(`This employee is still on the published map at ${publishedSeat.label}. Remove them from draft and publish before deleting.`);
  }

  const { error: unassignError } = await supabase
    .from("seats")
    .update({ employee_id: null, status: "available" })
    .eq("layer", "draft")
    .eq("employee_id", employeeId);

  if (unassignError) throw new Error(unassignError.message);

  const { error } = await supabase
    .from("employees")
    .update({ active: false })
    .eq("id", employeeId);

  if (error) throw new Error(error.message);
  revalidatePath("/admin");
  return { employeeId };
}

export async function createDepartmentAction(name: string) {
  const supabase = await requireAdmin();
  const cleanName = assertNonEmpty(name, "Department name");

  const { data, error } = await supabase
    .from("department_options")
    .upsert({ name: cleanName, active: true }, { onConflict: "name" })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/admin");
  return data as DepartmentOption;
}

export async function renameDepartmentAction(input: { from: string; to: string }) {
  const supabase = await requireAdmin();
  const from = assertNonEmpty(input.from, "Department to rename");
  const to = assertNonEmpty(input.to, "New department name");

  const { error: optionError } = await supabase
    .from("department_options")
    .upsert({ name: to, active: true }, { onConflict: "name" });

  if (optionError) throw new Error(optionError.message);

  const { error } = await supabase
    .from("employees")
    .update({ department: to })
    .eq("department", from);

  if (error) throw new Error(error.message);

  await supabase
    .from("department_options")
    .update({ active: false })
    .eq("name", from);

  revalidatePath("/");
  revalidatePath("/admin");
  return { from, to };
}

export async function deleteDepartmentAction(department: string) {
  const supabase = await requireAdmin();
  const target = assertNonEmpty(department, "Department");

  const { error } = await supabase
    .from("employees")
    .update({ department: null })
    .eq("department", target);

  if (error) throw new Error(error.message);

  await supabase
    .from("department_options")
    .update({ active: false })
    .eq("name", target);

  revalidatePath("/");
  revalidatePath("/admin");
  return { department: target };
}

export async function createZoneAction(name: string) {
  const supabase = await requireAdmin();
  const cleanName = assertNonEmpty(name, "Zone name");

  const { data, error } = await supabase
    .from("zone_options")
    .upsert({ name: cleanName, active: true }, { onConflict: "name" })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/admin");
  return data as ZoneOption;
}

export async function renameZoneAction(input: { from: string; to: string }) {
  const supabase = await requireAdmin();
  const from = assertNonEmpty(input.from, "Zone to rename");
  const to = assertNonEmpty(input.to, "New zone name");

  const { error: optionError } = await supabase
    .from("zone_options")
    .upsert({ name: to, active: true }, { onConflict: "name" });

  if (optionError) throw new Error(optionError.message);

  const { error } = await supabase
    .from("seats")
    .update({ zone: to })
    .eq("layer", "draft")
    .eq("zone", from);

  if (error) throw new Error(error.message);

  await supabase
    .from("zone_options")
    .update({ active: false })
    .eq("name", from);

  revalidatePath("/admin");
  return { from, to };
}

export async function deleteZoneAction(zone: string) {
  const supabase = await requireAdmin();
  const target = assertNonEmpty(zone, "Zone");

  const { error } = await supabase
    .from("seats")
    .update({ zone: null })
    .eq("layer", "draft")
    .eq("zone", target);

  if (error) throw new Error(error.message);

  await supabase
    .from("zone_options")
    .update({ active: false })
    .eq("name", target);

  revalidatePath("/admin");
  return { zone: target };
}

export async function deleteSeatAction(seatId: string) {
  const supabase = await requireAdmin();

  const { data: seat, error: seatError } = await supabase
    .from("seats")
    .select("id,label,layer,is_custom,employee_id,status")
    .eq("id", seatId)
    .single();

  if (seatError) throw new Error(seatError.message);

  if (!canDeleteDraftSeat(seat)) {
    throw new Error(getSeatDeleteBlockReason(seat) ?? "Only available custom draft seats can be deleted.");
  }

  const { data: deletedRows, error } = await supabase
    .from("seats")
    .delete()
    .eq("id", seatId)
    .eq("layer", "draft")
    .eq("is_custom", true)
    .is("employee_id", null)
    .eq("status", "available")
    .select("id");

  if (error) throw new Error(error.message);
  if ((deletedRows ?? []).length !== 1) {
    throw new Error("Seat is no longer eligible for deletion.");
  }

  revalidatePath("/admin");
  return { seatId };
}

export async function importAssignmentsCsvAction(csvText: string) {
  const supabase = await requireAdmin();
  const parsed = parseAssignmentCsv(csvText);
  if (parsed.issues.length > 0) {
    throw new Error(parsed.issues.map(issue => `Row ${issue.row}: ${issue.message}`).join("\n"));
  }

  const { error: importError } = await supabase.rpc("import_assignments_csv", {
    assignment_rows: parsed.rows.map((row, index) => ({
      ...row,
      row_number: index + 2
    }))
  });

  if (importError) throw new Error(importError.message);

  const { data: updatedSeats, error: updatedSeatsError } = await supabase
    .from("seats")
    .select("*, employee:employees(*)")
    .eq("layer", "draft")
    .order("label");

  const { data: updatedEmployees, error: updatedEmployeesError } = await supabase
    .from("employees")
    .select("*")
    .eq("active", true)
    .order("full_name");

  if (updatedSeatsError || updatedEmployeesError) {
    throw new Error(updatedSeatsError?.message ?? updatedEmployeesError?.message ?? "Could not reload imported data.");
  }

  revalidatePath("/admin");
  return {
    seats: (updatedSeats ?? []) as SeatWithEmployee[],
    employees: (updatedEmployees ?? []) as Employee[],
    count: parsed.rows.length
  };
}

export async function restoreDraftSnapshotAction(snapshot: DraftSnapshot) {
  const supabase = await requireAdmin();
  const seatsToRestore = (snapshot.seats ?? []).map(normalizeRestoreSeat);
  const employeesToRestore = (snapshot.employees ?? []).map(normalizeRestoreEmployee);

  if (seatsToRestore.length === 0) {
    throw new Error("Cannot restore an empty draft map snapshot.");
  }

  const labelKeys = new Set<string>();
  for (const seat of seatsToRestore) {
    const labelKey = seat.label.trim().toLowerCase();
    if (labelKeys.has(labelKey)) {
      throw new Error(`Cannot restore duplicate draft seat label '${seat.label}'.`);
    }
    labelKeys.add(labelKey);
  }

  const employeeIds = new Set(seatsToRestore.map(seat => seat.employee_id).filter((id): id is string => Boolean(id)));
  const employeeSnapshotById = new Map(employeesToRestore.map(employee => [employee.id, employee]));

  for (const employee of employeesToRestore) {
    await upsertDepartmentOption(supabase, employee.department);
    const { error } = await supabase
      .from("employees")
      .upsert({
        id: employee.id,
        full_name: employee.full_name,
        position: employee.position,
        department: employee.department,
        phone_extension: employee.phone_extension,
        avatar_url: employee.avatar_url,
        active: employee.active
      }, { onConflict: "id" });

    if (error) throw new Error(error.message);
  }

  const zoneNames = new Set(seatsToRestore.map(seat => seat.zone ?? seat.department ?? null).filter((name): name is string => Boolean(name)));
  for (const zoneName of zoneNames) {
    await upsertZoneOption(supabase, zoneName);
  }

  if (employeeIds.size > 0) {
    const ids = Array.from(employeeIds);
    const { data: existingEmployees, error } = await supabase
      .from("employees")
      .select("id")
      .in("id", ids);

    if (error) throw new Error(error.message);

    const existingIds = new Set((existingEmployees ?? []).map(employee => employee.id as string));
    const missingIds = ids.filter(id => !existingIds.has(id) && !employeeSnapshotById.has(id));
    if (missingIds.length > 0) {
      throw new Error("Cannot restore draft history because an assigned employee record is missing.");
    }
  }

  const { data: currentSeats, error: currentSeatsError } = await supabase
    .from("seats")
    .select("id,label,layer,is_custom,employee_id,status")
    .eq("layer", "draft");

  if (currentSeatsError) throw new Error(currentSeatsError.message);

  const currentById = new Map((currentSeats ?? []).map(seat => [seat.id as string, seat]));
  const snapshotIds = new Set(seatsToRestore.map(seat => seat.id));
  const seatsMissingFromSnapshot = (currentSeats ?? []).filter(seat => !snapshotIds.has(seat.id as string));
  const missingProtectedSeats = seatsMissingFromSnapshot
    .filter(seat => !canDeleteDraftSeat(seat))
    .map(seat => seat.label as string);

  if (missingProtectedSeats.length > 0) {
    throw new Error(`Cannot restore draft history because protected or occupied seats are missing from the snapshot: ${missingProtectedSeats.join(", ")}.`);
  }

  const { error: clearAssignmentsError } = await supabase
    .from("seats")
    .update({ employee_id: null, status: "available" })
    .eq("layer", "draft")
    .eq("status", "assigned");

  if (clearAssignmentsError) throw new Error(clearAssignmentsError.message);

  const customSeatIdsToDelete = seatsMissingFromSnapshot
    .filter(seat => canDeleteDraftSeat(seat))
    .map(seat => seat.id as string);

  if (customSeatIdsToDelete.length > 0) {
    const { error: deleteError } = await supabase
      .from("seats")
      .delete()
      .eq("layer", "draft")
      .eq("is_custom", true)
      .is("employee_id", null)
      .eq("status", "available")
      .in("id", customSeatIdsToDelete);

    if (deleteError) throw new Error(deleteError.message);
  }

  for (const seat of seatsToRestore) {
    const patch = {
      seat_key: seat.seat_key,
      label: seat.label,
      x: seat.x,
      y: seat.y,
      status: seat.status,
      employee_id: seat.employee_id,
      zone: seat.zone,
      department: seat.department,
      notes: seat.notes,
      is_custom: seat.is_custom
    };

    if (currentById.has(seat.id)) {
      const { error } = await supabase
        .from("seats")
        .update(patch)
        .eq("id", seat.id)
        .eq("layer", "draft");

      if (error) throw new Error(error.message);
      continue;
    }

    if (!seat.is_custom) {
      throw new Error(`Cannot restore protected original seat ${seat.label} because it no longer exists.`);
    }

    const { error } = await supabase
      .from("seats")
      .insert({
        id: seat.id,
        ...patch,
        layer: "draft"
      });

    if (error) throw new Error(error.message);
  }

  revalidatePath("/admin");
  return getDraftMapPayload(supabase);
}

export async function getPublishHistoryAction(limit = 10) {
  const supabase = await requireAdmin();
  const requestedLimit = Number.isFinite(limit) ? Math.trunc(limit) : 10;
  const pageSize = Math.min(Math.max(requestedLimit, 1), 25);

  const { data, error } = await supabase
    .from("publish_events")
    .select("created_at,seat_count,published_by")
    .order("created_at", { ascending: false })
    .limit(pageSize);

  if (error) throw new Error(error.message);

  const events = ((data ?? []) as Array<{
    created_at: string;
    seat_count: number | string | null;
    published_by: string | null;
  }>).map(record => {
    const seatCount = Number(record.seat_count ?? 0);

    return {
      created_at: record.created_at,
      seat_count: Number.isFinite(seatCount) ? seatCount : 0,
      published_by: record.published_by
    };
  }) satisfies PublishEventRecord[];

  const publisherIds = Array.from(new Set(events.map(event => event.published_by).filter((id): id is string => Boolean(id))));
  if (publisherIds.length === 0) return resolvePublishHistoryProfiles(events, []);

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id,email")
    .in("id", publisherIds);

  if (profilesError) throw new Error(profilesError.message);

  return resolvePublishHistoryProfiles(events, (profiles ?? []) as Array<{ id: string; email: string | null }>);
}

export async function publishSeatMapAction() {
  const supabase = await requireAdmin();

  const { error } = await supabase.rpc("publish_seat_map");

  if (error) throw new Error(error.message);
  revalidatePath("/");
  revalidatePath("/admin");
  return { ok: true };
}
