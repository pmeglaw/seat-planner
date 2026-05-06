"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertNonEmpty, normalizeSeatStatus, validateSeatCoordinates } from "@/lib/validators";
import type { SeatStatus, SeatWithEmployee } from "@/lib/types";

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

function buildSeatKey(label: string) {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || `seat-${Date.now()}`;
}

export async function createSeatAction(input: {
  label: string;
  x: number;
  y: number;
  department?: string | null;
}) {
  const supabase = await requireAdmin();
  const label = assertNonEmpty(input.label, "Seat label");
  const point = validateSeatCoordinates(input.x, input.y);
  const baseKey = buildSeatKey(label);
  const seatKey = `${baseKey}-${Date.now().toString(36)}`;

  const { data, error } = await supabase
    .from("seats")
    .insert({
      seat_key: seatKey,
      label,
      x: point.x,
      y: point.y,
      layer: "draft",
      status: "available",
      department: input.department ?? null
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
  notes?: string | null;
}) {
  const supabase = await requireAdmin();

  const label = assertNonEmpty(input.label, "Seat label");
  let employeeId = input.employeeId || null;
  const employeeName = input.employeeName?.trim() ?? "";
  const employeePosition = input.employeePosition?.trim() ?? "";
  const department = input.department?.trim() || null;

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
      const { data: employee, error: employeeError } = await supabase
        .from("employees")
        .insert({
          full_name: employeeName,
          position: employeePosition || null,
          department,
          avatar_url: null
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

  if (employeeId && (employeeName || employeePosition || department)) {
    const patch: Record<string, string | null> = {};
    if (employeeName) patch.full_name = employeeName;
    if (employeePosition || employeeName) patch.position = employeePosition || null;
    if (department) patch.department = department;

    if (Object.keys(patch).length) {
      const { error: employeeError } = await supabase
        .from("employees")
        .update(patch)
        .eq("id", employeeId);

      if (employeeError) throw new Error(employeeError.message);
    }
  }

  const status = normalizeSeatStatus(input.status, Boolean(employeeId));

  const { error } = await supabase
    .from("seats")
    .update({
      label,
      status,
      employee_id: employeeId,
      department,
      notes: input.notes?.trim() || null
    })
    .eq("id", input.seatId)
    .eq("layer", "draft");

  if (error) throw new Error(error.message);
  revalidatePath("/admin");
  return getDraftSeatById(supabase, input.seatId);
}

export async function deleteSeatAction(seatId: string) {
  const supabase = await requireAdmin();

  const { error } = await supabase
    .from("seats")
    .delete()
    .eq("id", seatId)
    .eq("layer", "draft");

  if (error) throw new Error(error.message);
  revalidatePath("/admin");
  return { seatId };
}

export async function publishSeatMapAction() {
  const supabase = await requireAdmin();

  const { error } = await supabase.rpc("publish_seat_map");

  if (error) throw new Error(error.message);
  revalidatePath("/");
  revalidatePath("/admin");
  return { ok: true };
}
