"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseAssignmentCsv } from "@/lib/csv";
import type { DraftSnapshot } from "@/lib/draftHistory";
import { resolvePublishHistoryProfiles, type PublishEventRecord } from "@/lib/publishHistory";
import { assertNonEmpty, normalizeSeatStatus, validateSeatCoordinates } from "@/lib/validators";
import { SEAT_STATUSES, type DepartmentOption, type Employee, type SeatStatus, type SeatWithEmployee, type ZoneOption } from "@/lib/types";

type CsvDraftSeat = {
  id: string;
  label: string;
  employee_id: string | null;
};

type CsvEmployeeRecord = {
  id: string;
  full_name: string;
};

type DraftSeatRestoreRecord = Omit<SeatWithEmployee, "employee">;
type DraftEmployeeRestoreRecord = Employee;

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

function normalizeEmployeeNameKey(value: string) {
  return value.trim().toLowerCase();
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
  label: string;
  x: number;
  y: number;
  zone?: string | null;
  department?: string | null;
}) {
  const supabase = await requireAdmin();
  const label = assertNonEmpty(input.label, "Seat label");
  const point = validateSeatCoordinates(input.x, input.y);
  const baseKey = buildSeatKey(label);
  const seatKey = `${baseKey}-${Date.now().toString(36)}`;
  const zone = normalizeOptionalText(input.zone ?? input.department);

  const { data: duplicateSeat, error: duplicateSeatError } = await supabase
    .from("seats")
    .select("id")
    .eq("layer", "draft")
    .ilike("label", label)
    .maybeSingle();

  if (duplicateSeatError) throw new Error(duplicateSeatError.message);
  if (duplicateSeat) throw new Error(`Seat label ${label} already exists.`);

  await upsertZoneOption(supabase, zone);

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

  if (error) throw new Error(error.message);
  revalidatePath("/admin");
  return data as SeatWithEmployee;
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
  department?: string | null;
  zone?: string | null;
  notes?: string | null;
}) {
  const supabase = await requireAdmin();

  const label = assertNonEmpty(input.label, "Seat label");
  let employeeId = input.employeeId || null;
  const employeeName = input.employeeName?.trim() ?? "";
  const employeePosition = input.employeePosition?.trim() ?? "";
  const department = normalizeOptionalText(input.department);
  const zone = normalizeOptionalText(input.zone);

  if (!employeeId && input.status === "assigned" && !employeeName) {
    throw new Error("Assigned seats require an employee name or selected employee.");
  }

  const { data: duplicateLabel, error: duplicateLabelError } = await supabase
    .from("seats")
    .select("id,label")
    .eq("layer", "draft")
    .ilike("label", label)
    .neq("id", input.seatId)
    .maybeSingle();

  if (duplicateLabelError) throw new Error(duplicateLabelError.message);
  if (duplicateLabel) throw new Error(`Seat label ${label} already exists.`);

  if (employeeId) {
    const { data: duplicate, error: duplicateError } = await supabase
      .from("seats")
      .select("id,label")
      .eq("layer", "draft")
      .eq("employee_id", employeeId)
      .neq("id", input.seatId)
      .maybeSingle();

    if (duplicateError) throw new Error(duplicateError.message);
    if (duplicate) throw new Error(`That employee is already assigned to ${duplicate.label}.`);
  }

  if (!employeeId && employeeName) {
    const { data: existingEmployee, error: findError } = await supabase
      .from("employees")
      .select("id")
      .ilike("full_name", employeeName)
      .maybeSingle();

    if (findError) throw new Error(findError.message);

    if (existingEmployee?.id) {
      employeeId = existingEmployee.id;
    } else {
      await upsertDepartmentOption(supabase, department);
      const { data: employee, error: employeeError } = await supabase
        .from("employees")
        .insert({
          full_name: employeeName,
          position: employeePosition || null,
          department,
          avatar_url: null,
          active: true
        })
        .select("id")
        .single();

      if (employeeError) throw new Error(employeeError.message);
      employeeId = employee.id;
    }
  }

  if (employeeId) {
    const { data: duplicate, error: duplicateError } = await supabase
      .from("seats")
      .select("id,label")
      .eq("layer", "draft")
      .eq("employee_id", employeeId)
      .neq("id", input.seatId)
      .maybeSingle();

    if (duplicateError) throw new Error(duplicateError.message);
    if (duplicate) throw new Error(`That employee is already assigned to ${duplicate.label}.`);
  }

  if (employeeId) {
    await upsertDepartmentOption(supabase, department);
    const patch: Record<string, string | null | boolean> = { active: true };
    if (employeeName) patch.full_name = employeeName;
    patch.position = employeePosition || null;
    patch.department = department;

    const { error: employeeError } = await supabase
      .from("employees")
      .update(patch)
      .eq("id", employeeId);

    if (employeeError) throw new Error(employeeError.message);
  }

  await upsertZoneOption(supabase, zone);
  const status = normalizeSeatStatus(input.status, Boolean(employeeId));

  const { error } = await supabase
    .from("seats")
    .update({
      label,
      status,
      employee_id: employeeId,
      zone,
      notes: input.notes?.trim() || null
    })
    .eq("id", input.seatId)
    .eq("layer", "draft");

  if (error) throw new Error(error.message);
  revalidatePath("/admin");
  return getDraftSeatById(supabase, input.seatId);
}

export async function createEmployeeAction(input: {
  fullName: string;
  position?: string | null;
  department?: string | null;
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
    .select("id,label,layer,is_custom")
    .eq("id", seatId)
    .eq("layer", "draft")
    .single();

  if (seatError) throw new Error(seatError.message);

  if (!seat?.is_custom) {
    throw new Error(`${seat?.label ?? "This seat"} is an original seat and cannot be deleted.`);
  }

  const { error } = await supabase
    .from("seats")
    .delete()
    .eq("id", seatId)
    .eq("layer", "draft")
    .eq("is_custom", true);

  if (error) throw new Error(error.message);
  revalidatePath("/admin");
  return { seatId };
}

export async function importAssignmentsCsvAction(csvText: string) {
  const supabase = await requireAdmin();
  const parsed = parseAssignmentCsv(csvText);
  const issues = [...parsed.issues];

  const { data: seats, error: seatsError } = await supabase
    .from("seats")
    .select("id,label,employee_id")
    .eq("layer", "draft");

  if (seatsError) throw new Error(seatsError.message);

  const { data: employees, error: employeesError } = await supabase
    .from("employees")
    .select("id,full_name");

  if (employeesError) throw new Error(employeesError.message);

  const seatByLabel = new Map((seats ?? []).map(seat => [String(seat.label).trim().toLowerCase(), seat as CsvDraftSeat]));
  const employeesByName = new Map<string, CsvEmployeeRecord[]>();

  (employees ?? []).forEach(employee => {
    const key = normalizeEmployeeNameKey(String(employee.full_name ?? ""));
    if (!key) return;
    const matches = employeesByName.get(key) ?? [];
    matches.push(employee as CsvEmployeeRecord);
    employeesByName.set(key, matches);
  });

  parsed.rows.forEach((row, index) => {
    if (row.seat_label && !seatByLabel.has(row.seat_label.trim().toLowerCase())) {
      issues.push({ row: index + 2, message: `Unknown seat label '${row.seat_label}'.` });
    }

    const employeeName = row.employee_name.trim();
    if (employeeName && (employeesByName.get(normalizeEmployeeNameKey(employeeName))?.length ?? 0) > 1) {
      issues.push({ row: index + 2, message: `Employee name '${employeeName}' matches multiple records. Rename or clean up duplicates before importing.` });
    }
  });

  if (issues.length > 0) {
    throw new Error(issues.map(issue => `Row ${issue.row}: ${issue.message}`).join("\n"));
  }

  const employeeByName = new Map<string, CsvEmployeeRecord>();
  employeesByName.forEach((matches, key) => {
    if (matches.length === 1) employeeByName.set(key, matches[0]);
  });

  const seatUpdates: Array<{
    seatId: string;
    employeeId: string | null;
    status: SeatStatus;
    zone: string | null;
    notes: string | null;
  }> = [];

  for (const row of parsed.rows) {
    const seat = seatByLabel.get(row.seat_label.trim().toLowerCase());
    if (!seat) continue;

    const department = normalizeOptionalText(row.department);
    const zone = normalizeOptionalText(row.zone);
    const notes = normalizeOptionalText(row.notes);
    let employeeId: string | null = null;

    if (row.employee_name.trim()) {
      const employeeName = row.employee_name.trim();
      const employeeKey = normalizeEmployeeNameKey(employeeName);
      const existingEmployee = employeeByName.get(employeeKey);

      await upsertDepartmentOption(supabase, department);
      if (existingEmployee?.id) {
        employeeId = existingEmployee.id;
        const { error: employeeUpdateError } = await supabase
          .from("employees")
          .update({
            full_name: employeeName,
            position: normalizeOptionalText(row.position),
            department,
            active: true
          })
          .eq("id", employeeId);

        if (employeeUpdateError) throw new Error(employeeUpdateError.message);
      } else {
        const { data: newEmployee, error: employeeCreateError } = await supabase
          .from("employees")
          .insert({
            full_name: employeeName,
            position: normalizeOptionalText(row.position),
            department,
            active: true
          })
          .select("id")
          .single();

        if (employeeCreateError) throw new Error(employeeCreateError.message);
        employeeId = newEmployee.id;
        employeeByName.set(employeeKey, { id: newEmployee.id, full_name: employeeName });
      }
    }

    await upsertZoneOption(supabase, zone);
    const status = normalizeSeatStatus(row.status || (employeeId ? "assigned" : "available"), Boolean(employeeId));

    seatUpdates.push({
      seatId: seat.id,
      employeeId,
      status,
      zone,
      notes
    });
  }

  for (const update of seatUpdates) {
    if (update.employeeId) {
      const { error: clearOldAssignmentError } = await supabase
        .from("seats")
        .update({ employee_id: null, status: "available" })
        .eq("layer", "draft")
        .eq("employee_id", update.employeeId)
        .neq("id", update.seatId);

      if (clearOldAssignmentError) throw new Error(clearOldAssignmentError.message);
    }

    const { error: seatUpdateError } = await supabase
      .from("seats")
      .update({
        employee_id: update.employeeId,
        status: update.status,
        zone: update.zone,
        notes: update.notes
      })
      .eq("id", update.seatId)
      .eq("layer", "draft");

    if (seatUpdateError) throw new Error(seatUpdateError.message);
  }

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
    .select("id,label,is_custom")
    .eq("layer", "draft");

  if (currentSeatsError) throw new Error(currentSeatsError.message);

  const currentById = new Map((currentSeats ?? []).map(seat => [seat.id as string, seat]));
  const snapshotIds = new Set(seatsToRestore.map(seat => seat.id));
  const missingProtectedSeats = (currentSeats ?? [])
    .filter(seat => !seat.is_custom && !snapshotIds.has(seat.id as string))
    .map(seat => seat.label as string);

  if (missingProtectedSeats.length > 0) {
    throw new Error(`Cannot restore draft history because protected original seats are missing from the snapshot: ${missingProtectedSeats.join(", ")}.`);
  }

  const { error: clearAssignmentsError } = await supabase
    .from("seats")
    .update({ employee_id: null, status: "available" })
    .eq("layer", "draft")
    .eq("status", "assigned");

  if (clearAssignmentsError) throw new Error(clearAssignmentsError.message);

  const customSeatIdsToDelete = (currentSeats ?? [])
    .filter(seat => seat.is_custom && !snapshotIds.has(seat.id as string))
    .map(seat => seat.id as string);

  if (customSeatIdsToDelete.length > 0) {
    const { error: deleteError } = await supabase
      .from("seats")
      .delete()
      .eq("layer", "draft")
      .eq("is_custom", true)
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
