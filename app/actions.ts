"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { parseAssignmentCsv } from "@/lib/csv";
import { isStaleDraftErrorCode, type DraftSeatExpectation, type EmployeeExpectation } from "@/lib/draftConcurrency";
import { applyFixedWindow, type RateLimitWindow } from "@/lib/rateLimit";
import type { DraftSnapshot } from "@/lib/draftHistory";
import { answerMapOperationsQuestion } from "@/lib/mapOperationsAgent";
import { assessPublishEnvironment } from "@/lib/publishGuard";
import { resolvePublishHistoryProfiles, type PublishEventRecord } from "@/lib/publishHistory";
import { buildPublishChangeSummary } from "@/lib/publishSummary";
import { buildNextSeatLabel } from "@/lib/seatLabels";
import { canDeleteDraftSeat, getSeatDeleteBlockReason } from "@/lib/seatProtection";
import { buildSeatSwapPlan, type SeatSwapPlan } from "@/lib/seatSwap";
import { floorIsMapped, floorLabel } from "@/lib/floors";
import { detectSeatZoneForPointResult, getSeatZoneDetectionFailureMessage } from "@/lib/seatZones";
import { savedPointToVisualPoint, seatsToVisualSeats } from "@/lib/mapLayoutTransform";
import {
  MAX_AVATAR_URL_LENGTH,
  MAX_EMAIL_LENGTH,
  MAX_EMPLOYEE_NAME_LENGTH,
  MAX_EMPLOYEE_TEXT_LENGTH,
  MAX_OPTION_NAME_LENGTH,
  MAX_PHONE_EXTENSION_LENGTH,
  MAX_SEAT_KEY_LENGTH,
  MAX_SEAT_LABEL_LENGTH,
  MAX_SEAT_NOTES_LENGTH,
  parseEmployeeInput,
  parseFloorId,
  parseOptionalMultilineText,
  parseOptionalText,
  parseRequiredText,
  parseSeatTextInput,
  parseUuid
} from "@/lib/schemas";
import { assertNonEmpty, normalizeSeatStatus, validateSeatCoordinates } from "@/lib/validators";
import { SEAT_STATUSES, type AskPlannerRequest, type AskPlannerResponse, type DepartmentOption, type Employee, type SeatStatus, type SeatWithEmployee, type UpdateSeatResult, type ZoneOption } from "@/lib/types";

type DraftSeatRestoreRecord = Omit<SeatWithEmployee, "employee">;
type DraftEmployeeRestoreRecord = Employee;
type DraftSeatZoneSource = Pick<SeatWithEmployee, "label" | "zone" | "department" | "x" | "y" | "floor">;
type SupabaseMutationError = {
  code?: string | null;
  message?: string | null;
};

async function requireAdminContext() {
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

  return { supabase, user };
}

// Most actions only need the client; callers that also need the authed user
// (e.g. askPlannerAction's per-admin rate-limit key) use requireAdminContext
// directly instead of paying a second auth.getUser() network round-trip.
async function requireAdmin() {
  return (await requireAdminContext()).supabase;
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

async function getDraftMapPayload(
  supabase: Awaited<ReturnType<typeof requireAdmin>>,
  fallbackErrorMessage = "Could not reload draft history state."
) {
  // Paged: an unbounded select is silently truncated at the project row cap,
  // and this payload is what undo/redo and CSV import hand back to the client
  // as the new draft state — a short read here would look like data loss.
  try {
    const seats = await fetchAllRows<SeatWithEmployee>(
      (from, to) =>
        supabase
          .from("seats")
          .select("*, employee:employees(*)", { count: "exact" })
          .eq("layer", "draft")
          .order("label")
          .range(from, to),
      { label: "draft seats" }
    );

    const employees = await fetchAllRows<Employee>(
      (from, to) =>
        supabase
          .from("employees")
          .select("*", { count: "exact" })
          .eq("active", true)
          .order("full_name")
          .order("id")
          .range(from, to),
      { label: "employees" }
    );

    return { seats, employees };
  } catch (error) {
    // Preserve the caller-supplied fallback wording for empty/unknown failures,
    // which the drawer and inspector surface verbatim.
    throw new Error(error instanceof Error && error.message ? error.message : fallbackErrorMessage);
  }
}

export type AskPlannerActionError = {
  error: string;
  /**
   * Structured discriminant for app-imposed outcomes (mirrors the
   * STALE_DRAFT pattern): the drawer dispatches on this, never on message
   * text — rewording the copy must not change which branch handles it.
   */
  code?: "RATE_LIMITED";
};

export type AskPlannerActionResult = AskPlannerResponse | AskPlannerActionError;

// Ask Planner throttle: per-admin fixed window, in-memory per server instance
// (resets on redeploy — a friendly cost/abuse brake on the OpenAI-backed
// action, not a security boundary; requireAdmin is the gate). Kept outside
// askPlannerAction so the read-only source guardrail extraction is unchanged.
const ASK_PLANNER_RATE_LIMIT = { limit: 10, windowMs: 60_000 };
const askPlannerRateWindows = new Map<string, RateLimitWindow>();

export async function askPlannerAction(input: AskPlannerRequest): Promise<AskPlannerActionResult> {
  // The admin gate stays outside the try so auth failures still hard-fail
  // (the read-only guarantee and admin gate must never degrade to a soft
  // error). requireAdminContext also hands back the authed user, so the rate
  // limiter keys on it without a second auth round-trip.
  const { supabase, user } = await requireAdminContext();

  const decision = applyFixedWindow(askPlannerRateWindows, user.id, Date.now(), ASK_PLANNER_RATE_LIMIT);
  if (!decision.allowed) {
    const retrySeconds = Math.max(1, Math.ceil(decision.retryAfterMs / 1000));
    // code, not message text, is the drawer's dispatch key — the copy here is
    // free to change.
    return { code: "RATE_LIMITED", error: `Ask Planner is rate limited for your account. Try again in about ${retrySeconds} seconds.` };
  }

  try {
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

    return await answerMapOperationsQuestion({
      question,
      seatId,
      seats,
      employees,
      departmentOptions: (departments ?? []) as DepartmentOption[],
      zoneOptions: (zones ?? []) as ZoneOption[]
    });
  } catch (error) {
    // Route pre-flight/config problems (missing OPENAI_API_KEY), OpenAI failures
    // (rate-limit, timeout, auth, model access) and lookup errors through the
    // normal 200 result channel as a structured error instead of throwing a 500.
    // The drawer maps the message text to a friendly title via friendlyDrawerError,
    // so the exact wording is preserved here.
    const message = error instanceof Error ? error.message : "Ask Planner could not answer.";
    return { error: message };
  }
}

function buildSeatKey(label: string) {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || `seat-${Date.now()}`;
}

// Snapshot restore and the seat normalizers below run over client-held JSON, and
// they already signalled a malformed snapshot by throwing (restoreDraftSnapshotAction
// has no validation-failure arm — a snapshot the app itself built cannot fail
// these, so a failure means tampering or corruption). These wrappers keep that
// contract while adding the bounds from lib/schemas.ts (S-01).
function boundedRequired(value: unknown, field: string, maxLength: number) {
  const parsed = parseRequiredText(value, field, maxLength);
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.value;
}

function boundedOptional(value: unknown, field: string, maxLength: number, multiline = false) {
  const parsed = multiline
    ? parseOptionalMultilineText(value, field, maxLength)
    : parseOptionalText(value, field, maxLength);
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.value;
}

// Snapshots exported before seats.floor existed carry no floor; absent means
// Floor 3 (the column default), anything else must be a registered floor —
// the same rule the restore RPC applies on its side (20260901120200).
function boundedFloor(value: unknown) {
  const parsed = parseFloorId(value);
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.value;
}

function isUniqueLabelViolation(error: SupabaseMutationError | null) {
  const message = error?.message ?? "";
  return error?.code === "23505" || /seats_unique_label_per_layer|duplicate key/i.test(message);
}

async function getDraftSeatZoneSources(supabase: Awaited<ReturnType<typeof requireAdmin>>) {
  // Paged for the same reason as the map reads, and it matters more here than
  // it looks: these rows are the reference set for detecting which zone a new
  // seat falls into, and for generating its next label. A truncated read would
  // put a seat in the wrong zone or reuse a label that already exists.
  // .order("label") makes the LIMIT/OFFSET paging deterministic: labels are
  // unique per layer (seats_unique_label_per_layer), so this is a total
  // order — without one, Postgres can return rows in a different order
  // across page requests and silently skip/duplicate a row at a page
  // boundary.
  return fetchAllRows<DraftSeatZoneSource>(
    (from, to) =>
      supabase
        .from("seats")
        // floor rides along (multi-floor PR-3): zone detection looks only at
        // the target floor's seats, and a row without the column would read
        // as Floor 3 by default.
        .select("label,zone,department,x,y,floor", { count: "exact" })
        .eq("layer", "draft")
        .order("label")
        .range(from, to),
    { label: "draft seats" }
  );
}

function normalizeRestoreSeat(seat: SeatWithEmployee): DraftSeatRestoreRecord {
  if (seat.layer !== "draft") {
    throw new Error("Undo/redo can only restore draft seats.");
  }

  const id = assertNonEmpty(seat.id, "Seat id");
  const seatKey = boundedRequired(seat.seat_key, "Seat key", MAX_SEAT_KEY_LENGTH);
  const label = boundedRequired(seat.label, "Seat label", MAX_SEAT_LABEL_LENGTH);
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
    zone: boundedOptional(seat.zone ?? null, "Zone", MAX_OPTION_NAME_LENGTH),
    department: boundedOptional(seat.department ?? null, "Department", MAX_OPTION_NAME_LENGTH),
    notes: boundedOptional(seat.notes ?? null, "Notes", MAX_SEAT_NOTES_LENGTH, true),
    is_custom: Boolean(seat.is_custom),
    floor: boundedFloor(seat.floor),
    created_at: seat.created_at,
    updated_at: seat.updated_at
  };
}

function normalizeRestoreEmployee(employee: Employee): DraftEmployeeRestoreRecord {
  return {
    id: assertNonEmpty(employee.id, "Employee id"),
    full_name: boundedRequired(employee.full_name, "Employee name", MAX_EMPLOYEE_NAME_LENGTH),
    position: boundedOptional(employee.position ?? null, "Position", MAX_EMPLOYEE_TEXT_LENGTH),
    department: boundedOptional(employee.department ?? null, "Department", MAX_EMPLOYEE_TEXT_LENGTH),
    phone_extension: boundedOptional(employee.phone_extension ?? null, "Phone extension", MAX_PHONE_EXTENSION_LENGTH),
    // Carried for type completeness; the restore RPC only writes the columns
    // it names, so snapshot restores never touch stored emails. Length-bounded
    // rather than format-checked for that reason: this value is never written,
    // and an old row with an odd address must not make Undo throw.
    email: boundedOptional(employee.email ?? null, "Email", MAX_EMAIL_LENGTH),
    avatar_url: boundedOptional(employee.avatar_url ?? null, "Avatar URL", MAX_AVATAR_URL_LENGTH),
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

export type CreateSeatResult =
  | { ok: true; seat: SeatWithEmployee }
  | { ok: false; message: string };

// Expected failures are RETURNED, not thrown (F-ERR-1, AUDIT-2): production
// digest-strips thrown Server Action messages, so the zone-detection and
// label-collision text below only reaches the admin as a returned value.
export async function createSeatAction(input: {
  x: number;
  y: number;
  visualX?: number;
  visualY?: number;
  /** The canvas floor the admin clicked on (multi-floor PR-3); absent means
   *  Floor 3, the column default. Only a MAPPED floor can take a seat — the
   *  editor never offers Add seat on an unmapped one, and the server holds
   *  the same line so a stale client cannot place a marker on a plan that
   *  does not exist. */
  floor?: string | null;
}): Promise<CreateSeatResult> {
  const supabase = await requireAdmin();
  const floorResult = parseFloorId(input.floor);
  if (!floorResult.ok) return { ok: false, message: floorResult.message };
  const floor = floorResult.value;
  if (!floorIsMapped(floor)) {
    return { ok: false, message: `${floorLabel(floor)} has no plan to place a seat on yet.` };
  }
  const point = validateSeatCoordinates(input.x, input.y);
  const visualPoint = input.visualX === undefined || input.visualY === undefined
    ? savedPointToVisualPoint(point, { ...point, floor })
    : validateSeatCoordinates(input.visualX, input.visualY);
  let draftSeats = await getDraftSeatZoneSources(supabase);
  const zoneResult = detectSeatZoneForPointResult(visualPoint, seatsToVisualSeats(draftSeats), floor);

  if (zoneResult.status !== "detected") {
    return { ok: false, message: getSeatZoneDetectionFailureMessage(zoneResult) ?? "Could not detect a zone for this location." };
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
        is_custom: true,
        floor
      })
      .select("*, employee:employees(*)")
      .single();

    if (!error) {
      revalidatePath("/admin");
      return { ok: true, seat: data as SeatWithEmployee };
    }

    if (!isUniqueLabelViolation(error) || attempt === 2) {
      return { ok: false, message: error.message };
    }

    draftSeats = await getDraftSeatZoneSources(supabase);
  }

  return { ok: false, message: "Could not create a unique seat label for this zone." };
}

// Expected/validation failures are RETURNED (not thrown). A thrown error inside a
// production Server Action is replaced by Next.js with a generic "Server Components
// render … digest" message, which hid the real, user-friendly text the
// update_draft_seat RPC already produces (e.g. "That employee is already assigned
// to W11."). Returning the message preserves it for the inspector to display.
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
  forceMove?: boolean;
  /** Concurrency fence: the seat's updated_at as the client rendered it. */
  expectedUpdatedAt?: string | null;
}): Promise<UpdateSeatResult> {
  const supabase = await requireAdmin();

  // S-05: ids get the same boundary parse the employee actions apply, so a
  // malformed one fails here with a field-level message instead of as a
  // Postgres uuid cast error inside the RPC.
  const seatId = parseUuid(input.seatId, "Seat id");
  if (!seatId.ok) return { ok: false, code: "VALIDATION", message: seatId.message };

  // S-01: these fields reach `employees` (full_name, position, phone_extension,
  // department) through the RPC, so they get the same bounds the employee
  // actions apply. parseSeatTextInput preserves the absent-vs-null distinction
  // the *_provided flags below depend on.
  const parsed = parseSeatTextInput(input);
  if (!parsed.ok) return { ok: false, code: "VALIDATION", message: parsed.message };

  const { label, employeeName, department, zone, notes } = parsed.value;
  const employeePosition = parsed.value.employeePosition;
  const phoneExtension = parsed.value.phoneExtension;

  let employeeId: string | null = null;
  if (input.employeeId) {
    const parsedEmployeeId = parseUuid(input.employeeId, "Employee id");
    if (!parsedEmployeeId.ok) return { ok: false, code: "VALIDATION", message: parsedEmployeeId.message };
    employeeId = parsedEmployeeId.value;
  }

  if (!employeeId && input.status === "assigned" && !employeeName) {
    return { ok: false, code: "VALIDATION", message: "Assigned seats require an employee name or selected employee." };
  }

  const { error } = await supabase.rpc("update_draft_seat", {
    draft_seat_id: seatId.value,
    seat_label: label,
    requested_status: input.status,
    selected_employee_id: employeeId,
    employee_name: employeeName,
    employee_position: employeePosition ?? null,
    employee_position_provided: employeePosition !== undefined,
    employee_phone_extension: phoneExtension ?? null,
    employee_phone_extension_provided: phoneExtension !== undefined,
    employee_department: department,
    seat_zone: zone,
    seat_notes: notes,
    force_move: input.forceMove ?? false,
    expected_updated_at: input.expectedUpdatedAt ?? null
  });

  if (error) {
    return mapUpdateSeatError(error);
  }

  revalidatePath("/admin");
  const seat = await getDraftSeatById(supabase, seatId.value);
  // Fresh full payload alongside the single seat — see UpdateSeatResult's
  // comment: a force_move also vacates another draft seat server-side, and a
  // caller reconstructing that seat from its own stale copy bakes a stale
  // updated_at into local state that fails the next Undo's concurrency fence.
  return { ok: true, seat, ...(await getDraftMapPayload(supabase)) };
}

function mapUpdateSeatError(error: SupabaseMutationError): UpdateSeatResult {
  const message = error.message?.trim() || "Could not update the seat.";
  // SQLSTATE 'MLS02' (STALE_DRAFT_SQLSTATE in lib/draftConcurrency) is the
  // draft-concurrency fence: the seat changed in another admin session after
  // this client rendered it. Literal code so tests can eval this helper
  // standalone, matching the MLS01 handling below.
  if (error.code === "MLS02") {
    return { ok: false, code: "STALE_DRAFT", message };
  }
  // SQLSTATE 23514 is any CHECK violation, and these tables carry two kinds: the
  // length bounds from 20260810120000 (named *_length) and the non-blank /
  // coordinate-range checks from 001_initial_schema. Only the first kind is a
  // "too long" problem — telling an admin to shorten a value that is actually
  // empty or out of range sends them the wrong way. Either way the raw
  // 'violates check constraint "…"' text Postgres produces never reaches the
  // inspector; lib/schemas.ts is what should have caught this first with a
  // field-level message.
  if (error.code === "23514") {
    const isLengthBound = /check constraint "[^"]*_length"/.test(message);
    return {
      ok: false,
      code: "VALIDATION",
      message: isLengthBound
        ? "One of those values is too long to save. Shorten it and try again."
        : "One of those values is not valid. Check the seat details and try again."
    };
  }
  // The RPC guards double-booking with a friendly message and (once the Phase 2
  // migration lands) the custom SQLSTATE 'MLS01'. Match either so the conflict is
  // recognised whether or not that migration has been applied yet.
  const isAlreadyAssigned = error.code === "MLS01" || /already assigned to/i.test(message);
  if (isAlreadyAssigned) {
    const currentSeatLabel = message.match(/already assigned to\s+(.+?)\.?\s*$/i)?.[1] ?? "another seat";
    return { ok: false, code: "EMPLOYEE_ALREADY_ASSIGNED", message, currentSeatLabel };
  }
  return { ok: false, code: "VALIDATION", message };
}

export type SwapSeatAssignmentsResult =
  | { ok: true; seats: SeatWithEmployee[]; employees: Employee[]; summary: SeatSwapPlan["summary"] }
  | { ok: false; code: "STALE_DRAFT"; message: string };

export async function swapSeatAssignmentsAction(input: {
  sourceSeatId: string;
  targetSeatId: string;
  /** Concurrency fence: each seat's updated_at as the client rendered the review dialog. */
  sourceExpectedUpdatedAt?: string | null;
  targetExpectedUpdatedAt?: string | null;
}): Promise<SwapSeatAssignmentsResult> {
  const supabase = await requireAdmin();
  // S-05: uuid-parse both ids at the boundary. Thrown (not returned) because
  // the result union has no VALIDATION arm and the ids come from rendered
  // draft rows, not typed input — an invalid one here is a programming error,
  // exactly what the assertNonEmpty this replaces also threw for.
  const parsedSourceSeatId = parseUuid(input.sourceSeatId, "Source seat id");
  if (!parsedSourceSeatId.ok) throw new Error(parsedSourceSeatId.message);
  const parsedTargetSeatId = parseUuid(input.targetSeatId, "Target seat id");
  if (!parsedTargetSeatId.ok) throw new Error(parsedTargetSeatId.message);
  const sourceSeatId = parsedSourceSeatId.value;
  const targetSeatId = parsedTargetSeatId.value;

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
    target_draft_seat_id: originalTargetSeat.id,
    source_expected_updated_at: input.sourceExpectedUpdatedAt ?? null,
    target_expected_updated_at: input.targetExpectedUpdatedAt ?? null
  });

  if (error) {
    // Returned (not thrown) so the fence message survives production's digest
    // stripping and the client can offer a reload instead of a dead-end error.
    if (isStaleDraftErrorCode((error as SupabaseMutationError).code)) {
      return { ok: false, code: "STALE_DRAFT", message: error.message };
    }
    throw new Error(error.message);
  }

  revalidatePath("/admin");
  return {
    ok: true,
    ...(await getDraftMapPayload(supabase)),
    summary: plan.summary
  };
}

/**
 * Shared rejection shape for every action that parses caller input. Validation
 * failures are RETURNED rather than thrown for the reason recorded on
 * mapUpdateSeatError — production reduces a thrown error to a digest, so the
 * message never reaches the admin who typed the value.
 */
export type ActionValidationFailure = { ok: false; code: "VALIDATION"; message: string };

export type EmployeeMutationResult = { ok: true; employee: Employee } | ActionValidationFailure;
export type EmployeeDeleteResult = { ok: true; employeeId: string } | ActionValidationFailure;
export type DepartmentMutationResult = { ok: true; department: DepartmentOption } | ActionValidationFailure;
export type DepartmentDeleteResult = { ok: true; department: string } | ActionValidationFailure;
export type ZoneMutationResult = { ok: true; zone: ZoneOption } | ActionValidationFailure;
export type ZoneDeleteResult = { ok: true; zone: string } | ActionValidationFailure;
export type OptionRenameResult = { ok: true; from: string; to: string } | ActionValidationFailure;

export async function createEmployeeAction(input: {
  fullName: string;
  position?: string | null;
  department?: string | null;
  phoneExtension?: string | null;
  email?: string | null;
}): Promise<EmployeeMutationResult> {
  const supabase = await requireAdmin();

  // Parse before the first write. The parameter type above is erased at build
  // time, so an action invoked over the wire receives whatever the caller sent;
  // lib/schemas.ts is the only length/format bound these columns have. The
  // failure is returned rather than thrown for the reason recorded on
  // mapUpdateSeatError — production strips a thrown message to a digest.
  const parsed = parseEmployeeInput(input);
  if (!parsed.ok) return { ok: false, code: "VALIDATION", message: parsed.message };

  const { fullName, position, department, phoneExtension, email } = parsed.value;

  await upsertDepartmentOption(supabase, department);

  const { data, error } = await supabase
    .from("employees")
    .insert({
      full_name: fullName,
      position,
      department,
      phone_extension: phoneExtension,
      email: email ?? null,
      avatar_url: null,
      active: true
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/admin");
  return { ok: true, employee: data as Employee };
}

export async function updateEmployeeAction(input: {
  employeeId: string;
  fullName: string;
  position?: string | null;
  department?: string | null;
  phoneExtension?: string | null;
  email?: string | null;
}): Promise<EmployeeMutationResult> {
  const supabase = await requireAdmin();

  const employeeId = parseUuid(input.employeeId, "Employee id");
  if (!employeeId.ok) return { ok: false, code: "VALIDATION", message: employeeId.message };

  const parsed = parseEmployeeInput(input);
  if (!parsed.ok) return { ok: false, code: "VALIDATION", message: parsed.message };

  const { fullName, position, department, phoneExtension, email } = parsed.value;

  await upsertDepartmentOption(supabase, department);

  const { data, error } = await supabase
    .from("employees")
    .update({
      full_name: fullName,
      position,
      department,
      phone_extension: phoneExtension,
      // Only write email when the caller sends the field, so existing callers
      // that predate the column can never null out a stored address. The parser
      // preserves that absent-vs-null distinction; see parseEmployeeInput.
      ...(email !== undefined ? { email } : {}),
      active: true
    })
    .eq("id", employeeId.value)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/");
  revalidatePath("/admin");
  return { ok: true, employee: data as Employee };
}

export async function deleteEmployeeAction(targetEmployeeId: string): Promise<EmployeeDeleteResult> {
  const supabase = await requireAdmin();

  const parsed = parseUuid(targetEmployeeId, "Employee id");
  if (!parsed.ok) return { ok: false, code: "VALIDATION", message: parsed.message };
  const employeeId = parsed.value;

  const { error } = await supabase.rpc("deactivate_employee", {
    employee_to_deactivate: employeeId
  });

  if (error) throw new Error(error.message);
  revalidatePath("/admin");
  return { ok: true, employeeId };
}

export async function createDepartmentAction(name: string): Promise<DepartmentMutationResult> {
  const supabase = await requireAdmin();

  const parsed = parseRequiredText(name, "Department name", MAX_OPTION_NAME_LENGTH);
  if (!parsed.ok) return { ok: false, code: "VALIDATION", message: parsed.message };

  const { data, error } = await supabase
    .from("department_options")
    .upsert({ name: parsed.value, active: true }, { onConflict: "name" })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  // The viewer's filter chips read live department_options (the documented
  // snapshot exception), so option mutations must bust "/" too.
  revalidatePath("/");
  revalidatePath("/admin");
  return { ok: true, department: data as DepartmentOption };
}

export async function renameDepartmentAction(input: { from: string; to: string }): Promise<OptionRenameResult> {
  const supabase = await requireAdmin();

  const parsedFrom = parseRequiredText(input.from, "Department to rename", MAX_OPTION_NAME_LENGTH);
  if (!parsedFrom.ok) return { ok: false, code: "VALIDATION", message: parsedFrom.message };
  const parsedTo = parseRequiredText(input.to, "New department name", MAX_OPTION_NAME_LENGTH);
  if (!parsedTo.ok) return { ok: false, code: "VALIDATION", message: parsedTo.message };

  const from = parsedFrom.value;
  const to = parsedTo.value;

  const { error } = await supabase.rpc("rename_department", {
    department_from: from,
    department_to: to
  });

  if (error) throw new Error(error.message);
  revalidatePath("/");
  revalidatePath("/admin");
  return { ok: true, from, to };
}

export async function deleteDepartmentAction(department: string): Promise<DepartmentDeleteResult> {
  const supabase = await requireAdmin();

  const parsed = parseRequiredText(department, "Department", MAX_OPTION_NAME_LENGTH);
  if (!parsed.ok) return { ok: false, code: "VALIDATION", message: parsed.message };
  const target = parsed.value;

  const { error } = await supabase.rpc("delete_department", {
    department_name: target
  });

  if (error) throw new Error(error.message);
  revalidatePath("/");
  revalidatePath("/admin");
  return { ok: true, department: target };
}

export async function createZoneAction(name: string): Promise<ZoneMutationResult> {
  const supabase = await requireAdmin();

  const parsed = parseRequiredText(name, "Zone name", MAX_OPTION_NAME_LENGTH);
  if (!parsed.ok) return { ok: false, code: "VALIDATION", message: parsed.message };

  const { data, error } = await supabase
    .from("zone_options")
    .upsert({ name: parsed.value, active: true }, { onConflict: "name" })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  // Viewer chips also read live zone_options — same rule as departments.
  revalidatePath("/");
  revalidatePath("/admin");
  return { ok: true, zone: data as ZoneOption };
}

export async function renameZoneAction(input: { from: string; to: string }): Promise<OptionRenameResult> {
  const supabase = await requireAdmin();

  const parsedFrom = parseRequiredText(input.from, "Zone to rename", MAX_OPTION_NAME_LENGTH);
  if (!parsedFrom.ok) return { ok: false, code: "VALIDATION", message: parsedFrom.message };
  const parsedTo = parseRequiredText(input.to, "New zone name", MAX_OPTION_NAME_LENGTH);
  if (!parsedTo.ok) return { ok: false, code: "VALIDATION", message: parsedTo.message };

  const from = parsedFrom.value;
  const to = parsedTo.value;

  const { error } = await supabase.rpc("rename_zone", {
    zone_from: from,
    zone_to: to
  });

  if (error) throw new Error(error.message);
  revalidatePath("/");
  revalidatePath("/admin");
  return { ok: true, from, to };
}

export async function deleteZoneAction(zone: string): Promise<ZoneDeleteResult> {
  const supabase = await requireAdmin();

  const parsed = parseRequiredText(zone, "Zone", MAX_OPTION_NAME_LENGTH);
  if (!parsed.ok) return { ok: false, code: "VALIDATION", message: parsed.message };
  const target = parsed.value;

  const { error } = await supabase.rpc("delete_zone", {
    zone_name: target
  });

  if (error) throw new Error(error.message);
  revalidatePath("/");
  revalidatePath("/admin");
  return { ok: true, zone: target };
}

export type DeleteSeatResult =
  | { ok: true; seatId: string }
  | { ok: false; message: string };

// Expected failures are RETURNED, not thrown (F-ERR-1, AUDIT-2) — the
// protection reason ("Only available custom draft seats…") must survive
// production's digest stripping.
export async function deleteSeatAction(seatId: string): Promise<DeleteSeatResult> {
  const supabase = await requireAdmin();

  // S-05: same boundary parse as the swap action (the id comes from a
  // rendered draft row); the failure is returned like every other one here.
  const parsedSeatId = parseUuid(seatId, "Seat id");
  if (!parsedSeatId.ok) return { ok: false, message: parsedSeatId.message };
  seatId = parsedSeatId.value;

  const { data: seat, error: seatError } = await supabase
    .from("seats")
    .select("id,label,layer,is_custom,employee_id,status")
    .eq("id", seatId)
    .single();

  if (seatError) return { ok: false, message: seatError.message };

  if (!canDeleteDraftSeat(seat)) {
    return { ok: false, message: getSeatDeleteBlockReason(seat) ?? "Only available custom draft seats can be deleted." };
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

  if (error) return { ok: false, message: error.message };
  if ((deletedRows ?? []).length !== 1) {
    return { ok: false, message: "Seat is no longer eligible for deletion." };
  }

  revalidatePath("/admin");
  return { ok: true, seatId };
}

export type ImportAssignmentsCsvResult =
  | { ok: true; seats: SeatWithEmployee[]; employees: Employee[]; count: number }
  | { ok: false; code: "STALE_DRAFT"; message: string };

export async function importAssignmentsCsvAction(
  csvText: string,
  /**
   * Concurrency fence: exact (id, updated_at) of every draft seat the client
   * held when the CSV was parsed for review (lib/draftConcurrency
   * listDraftSeatExpectations — timestamps verbatim, never through Date). The
   * RPC rejects with STALE_DRAFT if ANY draft seat differs — not just
   * CSV-targeted ones, because assigning an employee also vacates their other
   * draft seat — so an import confirmed against stale data cannot silently
   * overwrite another admin's edits (20260806120000).
   */
  expectedSeats?: DraftSeatExpectation[],
  /**
   * Employee-directory fence: exact (id, updated_at) of every ACTIVE employee
   * as the client held it at parse time (lib/draftConcurrency
   * listActiveEmployeeExpectations). The import overwrites matched employee
   * rows, so people data is reviewed state too; the RPC rejects with
   * STALE_DRAFT if the active directory advanced since (20260806140000,
   * issue #328).
   */
  expectedEmployees?: EmployeeExpectation[]
): Promise<ImportAssignmentsCsvResult> {
  const supabase = await requireAdmin();
  const parsed = parseAssignmentCsv(csvText);
  if (parsed.issues.length > 0) {
    throw new Error(parsed.issues.map(issue => `Row ${issue.row}: ${issue.message}`).join("\n"));
  }

  const { error: importError } = await supabase.rpc("import_assignments_csv", {
    assignment_rows: parsed.rows.map((row, index) => ({
      ...row,
      row_number: index + 2
    })),
    expected_seats: expectedSeats ?? null,
    expected_employees: expectedEmployees ?? null
  });

  if (importError) {
    // Returned (not thrown) so the fence message survives production's digest
    // stripping and the client can reload instead of showing a dead-end error.
    if (isStaleDraftErrorCode((importError as SupabaseMutationError).code)) {
      return { ok: false, code: "STALE_DRAFT", message: importError.message };
    }
    throw new Error(importError.message);
  }

  const { seats, employees } = await getDraftMapPayload(supabase, "Could not reload imported data.");

  revalidatePath("/admin");
  return { ok: true, seats, employees, count: parsed.rows.length };
}

export type RestoreDraftSnapshotResult =
  | { ok: true; seats: SeatWithEmployee[]; employees: Employee[] }
  | { ok: false; code: "STALE_DRAFT"; message: string };

export async function restoreDraftSnapshotAction(
  snapshot: DraftSnapshot,
  /**
   * Concurrency fence: exact (id, updated_at) of every draft seat the client
   * currently holds (NOT of the snapshot being restored). The RPC rejects with
   * STALE_DRAFT if any row differs, so a stale undo/restore cannot silently
   * revert another admin's edits.
   */
  expectedDraftSeats?: DraftSeatExpectation[]
): Promise<RestoreDraftSnapshotResult> {
  const supabase = await requireAdmin();
  if (!snapshot || !Array.isArray(snapshot.seats) || !Array.isArray(snapshot.employees)) {
    throw new Error("Draft snapshot must include seats and employees arrays.");
  }

  const seatsToRestore = snapshot.seats.map(normalizeRestoreSeat);
  const employeesToRestore = snapshot.employees.map(normalizeRestoreEmployee);

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

  const { error } = await supabase.rpc("restore_draft_snapshot", {
    snapshot_seats: seatsToRestore,
    snapshot_employees: employeesToRestore,
    expected_draft_seats: expectedDraftSeats ?? null
  });

  if (error) {
    // Returned (not thrown) so the fence message survives production's digest
    // stripping and the client can reload instead of showing a dead-end error.
    if (isStaleDraftErrorCode((error as SupabaseMutationError).code)) {
      return { ok: false, code: "STALE_DRAFT", message: error.message };
    }
    throw new Error(error.message);
  }

  revalidatePath("/admin");
  return { ok: true, ...(await getDraftMapPayload(supabase)) };
}

export async function resetDraftToPublishedAction(
  /**
   * Concurrency fence: exact (id, updated_at) of every draft seat the client
   * currently holds. The RPC rejects with STALE_DRAFT if any row differs, so
   * a stale reset cannot silently discard another admin's newer edits.
   */
  expectedDraftSeats?: DraftSeatExpectation[]
): Promise<RestoreDraftSnapshotResult> {
  const supabase = await requireAdmin();

  const { error } = await supabase.rpc("reset_draft_seats_to_published", {
    expected_draft_seats: expectedDraftSeats ?? null
  });

  if (error) {
    if (isStaleDraftErrorCode((error as SupabaseMutationError).code)) {
      return { ok: false, code: "STALE_DRAFT", message: error.message };
    }
    throw new Error(error.message);
  }

  revalidatePath("/admin");
  return { ok: true, ...(await getDraftMapPayload(supabase)) };
}

// Shell mode indicator on admin sub-pages (redesign-v2 PR 2, PHASE2UX §1.5
// / D2 "the count travels"): /admin/management and /admin/settings load no
// seat data, so the persistent shell asks for the draft's pending change
// count once per mount there. On /admin SeatMap pushes its live count into
// the shell instead and this is never called. The ONE sanctioned new server
// action of the redesign (owner ruling 2026-09-04): read-only, admin-only
// (the draft layer is never exposed to viewers — the viewer shell never
// calls it), no RPC, no migration, no revalidatePath. Same six paged reads
// as app/(shell)/admin/page.tsx so the count matches the publish review's
// exactly (buildPublishChangeSummary, live employees vs the snapshot).
export async function getDraftStatusAction(): Promise<{ changeCount: number; lastEditAt: string | null; publishedAt: string | null }> {
  const supabase = await requireAdmin();
  const [draftSeats, publishedSeats, employees, publishedEmployees] = await Promise.all([
    fetchAllRows<SeatWithEmployee>(
      (from, to) =>
        supabase
          .from("seats")
          .select("*, employee:employees(*)", { count: "exact" })
          .eq("layer", "draft")
          .order("label")
          .range(from, to),
      { label: "draft seats" }
    ),
    fetchAllRows<SeatWithEmployee>(
      (from, to) =>
        supabase
          .from("seats")
          .select("*, employee:employees(*)", { count: "exact" })
          .eq("layer", "published")
          .order("label")
          .range(from, to),
      { label: "published seats" }
    ),
    fetchAllRows<Employee>(
      (from, to) =>
        supabase
          .from("employees")
          .select("*", { count: "exact" })
          .eq("active", true)
          .order("full_name")
          .order("id")
          .range(from, to),
      { label: "employees" }
    ),
    fetchAllRows<Employee>(
      (from, to) =>
        supabase
          .from("published_employees")
          .select("*", { count: "exact" })
          .order("full_name")
          .order("id")
          .range(from, to),
      { label: "published employees" }
    )
  ]);
  const summary = buildPublishChangeSummary(draftSeats, publishedSeats, { employees, publishedEmployees });
  const latest = (rows: SeatWithEmployee[]) =>
    rows.reduce<string | null>((max, seat) => (seat.updated_at && (!max || seat.updated_at > max) ? seat.updated_at : max), null);
  return { changeCount: summary.totalChangeCount, lastEditAt: latest(draftSeats), publishedAt: latest(publishedSeats) };
}

export async function getPublishHistoryAction(limit = 10) {
  const supabase = await requireAdmin();
  const requestedLimit = Number.isFinite(limit) ? Math.trunc(limit) : 10;
  const pageSize = Math.min(Math.max(requestedLimit, 1), 25);

  const { data, error } = await supabase
    .from("publish_events")
    .select("created_at,seat_count,published_by,change_summary")
    .order("created_at", { ascending: false })
    .limit(pageSize);

  if (error) throw new Error(error.message);

  const events = ((data ?? []) as Array<{
    created_at: string;
    seat_count: number | string | null;
    published_by: string | null;
    change_summary?: unknown;
  }>).map(record => {
    const seatCount = Number(record.seat_count ?? 0);

    return {
      created_at: record.created_at,
      seat_count: Number.isFinite(seatCount) ? seatCount : 0,
      published_by: record.published_by,
      change_summary: record.change_summary ?? null
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

export type PublishSeatMapResult =
  | { ok: true }
  | { ok: false; code: "STALE_DRAFT"; message: string }
  | { ok: false; code: "PUBLISH_BLOCKED"; message: string };

export async function publishSeatMapAction(
  /**
   * Concurrency fence: exact (id, updated_at) of every draft seat as the
   * publish review rendered it (timestamps verbatim, never through Date). The
   * RPC rejects with STALE_DRAFT if the draft advanced since, so a publish
   * cannot ship changes the reviewing admin never saw.
   */
  expectedDraftSeats?: DraftSeatExpectation[],
  /**
   * Employee-directory fence: exact (id, updated_at) of every ACTIVE employee
   * as the review rendered it (lib/draftConcurrency
   * listActiveEmployeeExpectations). Publish replaces the published_employees
   * snapshot from the live active directory in the same transaction, so people
   * edits are part of the reviewed state too; the RPC rejects with STALE_DRAFT
   * if the active directory advanced since (20260806121000).
   */
  expectedEmployees?: EmployeeExpectation[]
): Promise<PublishSeatMapResult> {
  const supabase = await requireAdmin();

  // Fail-closed environment guard (lib/publishGuard.ts): publish is allowed
  // only when the database is local, the server is the real Vercel production
  // deployment, or the operator opted in explicitly. Returned, not thrown:
  // the guard can fire under NODE_ENV=production (a local `npm run start`),
  // where thrown server-action messages are digest-stripped — returning keeps
  // the refusal readable in the admin's error banner.
  const environment = assessPublishEnvironment({
    vercelEnv: process.env.VERCEL_ENV,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    overrideValue: process.env.SEAT_PLANNER_ALLOW_PROD_PUBLISH
  });
  if (!environment.allowed) {
    return { ok: false, code: "PUBLISH_BLOCKED", message: environment.message };
  }

  const { error } = await supabase.rpc("publish_seat_map", {
    expected_draft_seats: expectedDraftSeats ?? null,
    expected_employees: expectedEmployees ?? null
  });

  if (error) {
    // Returned (not thrown) so the fence message survives production's digest
    // stripping and the client can reload instead of showing a dead-end error.
    if (isStaleDraftErrorCode((error as SupabaseMutationError).code)) {
      return { ok: false, code: "STALE_DRAFT", message: error.message };
    }
    throw new Error(error.message);
  }
  revalidatePath("/");
  revalidatePath("/admin");
  return { ok: true };
}
