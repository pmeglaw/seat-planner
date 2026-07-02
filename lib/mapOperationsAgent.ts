import type {
  AskPlannerConfidence,
  AskPlannerHighlight,
  AskPlannerResponse,
  AskPlannerStatus,
  DepartmentOption,
  Employee,
  SeatWithEmployee,
  ZoneOption
} from "./types";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
export const ASK_PLANNER_DEFAULT_MODEL = "gpt-5.5";
const MAX_QUESTION_LENGTH = 800;
const MAX_TOOL_ITERATIONS = 5;
const MAX_TOOL_RESULT_ITEMS = 30;
const MAX_HIGHLIGHTS = 20;
const MAX_WARNINGS = 6;
const MAX_FOLLOW_UPS = 5;
const OPENAI_TIMEOUT_MS = 22000;
const BROAD_OPEN_NO_HIGHLIGHT_WARNING =
  "No seats highlighted for this broad answer. Ask for a specific zone, department, or smaller group to highlight seats.";
const MISSING_EXPLAIN_SEAT_MESSAGE =
  "Ask Planner could not find that seat in saved draft data. Select a current draft seat or ask about another seat.";
const STRUCTURED_REFUSAL_WARNING =
  "The model returned a structured refusal instead of the Ask Planner response schema.";

const WRITE_ACTION_PATTERN = /\b(publish|move|assign|vacate|delete|remove|clear|import|restore|swap|update|edit|create|add)\b/i;
const BROAD_OPEN_QUESTION_PATTERNS = [
  /^(which|what) (seats|desks) (are )?(currently )?(open|available)$/,
  /^(which|what) (open|available) (seats|desks)( are there)?$/,
  /^(show|list|find) (all )?(open|available) (seats|desks)$/,
  /^(show|list|find) (all )?(seats|desks) (that are )?(currently )?(open|available)$/
];
const EXPLAIN_SEAT_QUESTION_PATTERN = /^(?:explain|describe|summarize) (?:this )?(?:seat|desk)\s+(.+)$/i;

type MapOperationsData = {
  seats: SeatWithEmployee[];
  employees: Employee[];
  departmentOptions?: DepartmentOption[];
  zoneOptions?: ZoneOption[];
};

export type MapOperationsContext = {
  seats: SeatWithEmployee[];
  employees: Employee[];
  departmentOptions: DepartmentOption[];
  zoneOptions: ZoneOption[];
  generatedAt: string;
};

type PlannerToolName =
  | "get_map_summary"
  | "search_seats"
  | "list_people"
  | "get_zone_department_breakdown"
  | "get_map_health";

type PlannerIssue = {
  severity: "info" | "warning" | "critical";
  code: string;
  message: string;
  seatIds: string[];
  employeeIds: string[];
};

type OpenAIOutputItem = {
  type?: string;
  name?: string;
  call_id?: string;
  arguments?: string;
  refusal?: string;
  content?: Array<{
    type?: string;
    text?: string;
    refusal?: string;
  }>;
};

type OpenAIUsagePayload = {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  input_tokens_details?: {
    cached_tokens?: number;
  };
  output_tokens_details?: {
    reasoning_tokens?: number;
  };
};

type OpenAIResponsePayload = {
  id?: string;
  status?: string;
  incomplete_details?: {
    reason?: string | null;
  } | null;
  output?: OpenAIOutputItem[];
  output_text?: string;
  usage?: OpenAIUsagePayload | null;
};

type OpenAIErrorPayload = {
  error?: {
    message?: string;
    code?: string;
    type?: string;
    param?: string;
  };
};

type OpenAIResponseBody = {
  model: string;
  instructions?: string;
  input: string | Array<Record<string, unknown>>;
  previous_response_id?: string;
  tools: Array<Record<string, unknown>>;
  tool_choice: "auto";
  text: {
    format: Record<string, unknown>;
  };
  max_output_tokens: number;
};

type OpenAIFailureDiagnostic = {
  status?: number;
  statusText?: string;
  errorType?: string;
  errorCode?: string;
  errorParam?: string;
  errorMessage?: string;
  model: string;
  requestId?: string;
};

type OpenAICompletionDiagnostic = {
  responseId?: string;
  model: string;
  responseStatus?: string;
  incompleteReason?: string;
  requestId?: string;
  durationMs: number;
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
  outputItemCount?: number;
  toolCallCount?: number;
};

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(Math.trunc(value), min), max);
}

function cleanText(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function cleanDiagnosticField(value: unknown, maxLength = 180) {
  if (typeof value !== "string") return undefined;
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, maxLength) : undefined;
}

function cleanDiagnosticNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : undefined;
}

export function sanitizeOpenAIDiagnosticMessage(value: unknown) {
  const cleaned = cleanDiagnosticField(value, 500);
  if (!cleaned) return undefined;

  return cleaned
    .replace(/\bAuthorization\s*:\s*Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "[redacted-authorization]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[redacted-api-key]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]")
    .replace(/\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g, "[redacted-phone]");
}

export function resolveAskPlannerModel(env: Record<string, string | undefined> = process.env) {
  return env.OPENAI_MODEL?.trim() || ASK_PLANNER_DEFAULT_MODEL;
}

function normalizeKey(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function getSeatZone(seat: SeatWithEmployee) {
  return seat.zone ?? seat.department ?? null;
}

function getSeatZoneLabel(seat: SeatWithEmployee) {
  return getSeatZone(seat) || "Unzoned";
}

function getSeatDepartment(seat: SeatWithEmployee) {
  // seats.department is legacy zone data — never a person's department (E1).
  return seat.employee?.department ?? null;
}

function hasEmployee(seat: SeatWithEmployee) {
  return Boolean(seat.employee_id || seat.employee);
}

function seatSearchText(seat: SeatWithEmployee) {
  return [
    seat.label,
    seat.seat_key,
    seat.status,
    getSeatZone(seat),
    getSeatDepartment(seat),
    seat.employee?.full_name,
    seat.employee?.position,
    seat.employee?.department
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function employeeSearchText(employee: Employee, assignedSeat: SeatWithEmployee | null) {
  return [
    employee.full_name,
    employee.position,
    employee.department,
    assignedSeat?.label,
    assignedSeat ? getSeatZone(assignedSeat) : null
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function normalizeSeat(seat: SeatWithEmployee): SeatWithEmployee {
  return {
    ...seat,
    x: Number(seat.x),
    y: Number(seat.y),
    zone: seat.zone ?? seat.department ?? null,
    is_custom: Boolean(seat.is_custom)
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parseArgs(args: unknown) {
  if (isRecord(args)) return args;
  return {};
}

function stringArg(args: Record<string, unknown>, key: string) {
  return typeof args[key] === "string" ? args[key].trim() : "";
}

function nullableBooleanArg(args: Record<string, unknown>, key: string) {
  return typeof args[key] === "boolean" ? args[key] : null;
}

function limitArg(args: Record<string, unknown>, defaultLimit = 12) {
  return clamp(typeof args.limit === "number" ? args.limit : defaultLimit, 1, MAX_TOOL_RESULT_ITEMS);
}

function formatSeat(seat: SeatWithEmployee) {
  return {
    id: seat.id,
    label: seat.label,
    status: seat.status,
    zone: getSeatZone(seat),
    department: getSeatDepartment(seat),
    employeeName: seat.employee?.full_name ?? null,
    employeePosition: seat.employee?.position ?? null,
    isCustom: Boolean(seat.is_custom),
    x: seat.x,
    y: seat.y
  };
}

function statusCounts(seats: SeatWithEmployee[]) {
  return {
    total: seats.length,
    assigned: seats.filter(seat => seat.status === "assigned").length,
    available: seats.filter(seat => seat.status === "available").length,
    reserved: seats.filter(seat => seat.status === "reserved").length,
    unavailable: seats.filter(seat => seat.status === "unavailable").length,
    occupied: seats.filter(hasEmployee).length,
    custom: seats.filter(seat => Boolean(seat.is_custom)).length
  };
}

function sortByName<T extends { name: string }>(items: T[]) {
  return items.sort((left, right) => left.name.localeCompare(right.name));
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return count === 1 ? singular : plural;
}

function squaredDistance(left: SeatWithEmployee, right: SeatWithEmployee) {
  return (left.x - right.x) ** 2 + (left.y - right.y) ** 2;
}

function assignedSeatByEmployeeId(seats: SeatWithEmployee[]) {
  const assignments = new Map<string, SeatWithEmployee[]>();
  seats.forEach(seat => {
    if (!seat.employee_id) return;
    const current = assignments.get(seat.employee_id) ?? [];
    current.push(seat);
    assignments.set(seat.employee_id, current);
  });
  return assignments;
}

export function createMapOperationsContext(data: MapOperationsData): MapOperationsContext {
  return {
    seats: data.seats.map(normalizeSeat).sort((left, right) => left.label.localeCompare(right.label)),
    employees: data.employees.filter(employee => employee.active !== false).sort((left, right) => left.full_name.localeCompare(right.full_name)),
    departmentOptions: [...(data.departmentOptions ?? [])].sort((left, right) => left.name.localeCompare(right.name)),
    zoneOptions: [...(data.zoneOptions ?? [])].sort((left, right) => left.name.localeCompare(right.name)),
    generatedAt: new Date().toISOString()
  };
}

export function getMapSummary(context: MapOperationsContext) {
  const assignments = assignedSeatByEmployeeId(context.seats);
  const unassignedEmployees = context.employees.filter(employee => !assignments.has(employee.id));
  const zoneNames = new Set<string>();
  context.zoneOptions.filter(zone => zone.active).forEach(zone => zoneNames.add(zone.name));
  context.seats.forEach(seat => zoneNames.add(getSeatZoneLabel(seat)));

  // Case-insensitive department rows: managed options first (their spelling
  // wins), then employee variants fold into the same row instead of forking
  // into duplicates (E1 — counts must match the employee list).
  const departmentRows = new Map<string, string>();
  function departmentRowName(value: string | null | undefined) {
    const display = (value ?? "").trim() || "No department";
    const key = normalizeKey(display);
    const existing = departmentRows.get(key);
    if (existing) return existing;
    departmentRows.set(key, display);
    return display;
  }
  context.departmentOptions.filter(department => department.active).forEach(department => departmentRowName(department.name));
  context.employees.forEach(employee => departmentRowName(employee.department));
  const departmentNames = new Set<string>(departmentRows.values());

  return {
    generatedAt: context.generatedAt,
    totals: {
      ...statusCounts(context.seats),
      activeEmployees: context.employees.length,
      assignedEmployees: context.employees.length - unassignedEmployees.length,
      unassignedActiveEmployees: unassignedEmployees.length
    },
    byZone: sortByName(Array.from(zoneNames).map(name => ({
      name,
      ...statusCounts(context.seats.filter(seat => getSeatZoneLabel(seat) === name))
    }))),
    byDepartment: sortByName(Array.from(departmentNames).map(name => {
      const employees = context.employees.filter(employee => normalizeKey(employee.department || "No department") === normalizeKey(name));
      const employeeIds = new Set(employees.map(employee => employee.id));
      const assignedSeats = context.seats.filter(seat => seat.employee_id && employeeIds.has(seat.employee_id));
      return {
        name,
        activeEmployees: employees.length,
        assignedSeats: assignedSeats.length,
        unassignedEmployees: employees.filter(employee => !assignments.has(employee.id)).length
      };
    }))
  };
}

export function searchSeats(context: MapOperationsContext, rawArgs: unknown) {
  const args = parseArgs(rawArgs);
  const query = stringArg(args, "query").toLowerCase();
  const status = stringArg(args, "status");
  const zone = normalizeKey(stringArg(args, "zone"));
  const department = normalizeKey(stringArg(args, "department"));
  const occupied = nullableBooleanArg(args, "occupied");
  const customOnly = nullableBooleanArg(args, "customOnly");
  const limit = limitArg(args, 12);

  const matches = context.seats.filter(seat => {
    if (query && !seatSearchText(seat).includes(query)) return false;
    if (status && status !== "all" && seat.status !== status) return false;
    if (zone && zone !== "all" && normalizeKey(getSeatZone(seat)) !== zone) return false;
    if (department && department !== "all" && normalizeKey(getSeatDepartment(seat)) !== department) return false;
    if (occupied !== null && hasEmployee(seat) !== occupied) return false;
    if (customOnly !== null && Boolean(seat.is_custom) !== customOnly) return false;
    return true;
  });

  return {
    count: matches.length,
    returned: Math.min(matches.length, limit),
    truncated: matches.length > limit,
    seats: matches.slice(0, limit).map(formatSeat)
  };
}

export function listPeople(context: MapOperationsContext, rawArgs: unknown) {
  const args = parseArgs(rawArgs);
  const query = stringArg(args, "query").toLowerCase();
  const department = normalizeKey(stringArg(args, "department"));
  const assignment = stringArg(args, "assignment") || "all";
  const limit = limitArg(args, 12);
  const assignments = assignedSeatByEmployeeId(context.seats);

  const matches = context.employees.filter(employee => {
    const assignedSeat = assignments.get(employee.id)?.[0] ?? null;
    if (query && !employeeSearchText(employee, assignedSeat).includes(query)) return false;
    if (department && department !== "all" && normalizeKey(employee.department) !== department) return false;
    if (assignment === "assigned" && !assignedSeat) return false;
    if (assignment === "unassigned" && assignedSeat) return false;
    return true;
  });

  return {
    count: matches.length,
    returned: Math.min(matches.length, limit),
    truncated: matches.length > limit,
    people: matches.slice(0, limit).map(employee => {
      const assignedSeats = assignments.get(employee.id) ?? [];
      const assignedSeat = assignedSeats[0] ?? null;
      return {
        id: employee.id,
        fullName: employee.full_name,
        position: employee.position,
        department: employee.department,
        assignedSeat: assignedSeat ? {
          id: assignedSeat.id,
          label: assignedSeat.label,
          zone: getSeatZone(assignedSeat),
          status: assignedSeat.status
        } : null,
        assignmentCount: assignedSeats.length
      };
    })
  };
}

export function getZoneDepartmentBreakdown(context: MapOperationsContext) {
  const zones = new Map<string, SeatWithEmployee[]>();
  context.seats.forEach(seat => {
    const zone = getSeatZoneLabel(seat);
    const seats = zones.get(zone) ?? [];
    seats.push(seat);
    zones.set(zone, seats);
  });

  return {
    zones: sortByName(Array.from(zones.entries()).map(([name, seats]) => {
      const departments = new Map<string, SeatWithEmployee[]>();
      const departmentLabels = new Map<string, string>();
      seats.forEach(seat => {
        const department = seat.employee?.department?.trim() || "Open or no department";
        const key = normalizeKey(department);
        const label = departmentLabels.get(key) ?? department;
        departmentLabels.set(key, label);
        const departmentSeats = departments.get(label) ?? [];
        departmentSeats.push(seat);
        departments.set(label, departmentSeats);
      });

      return {
        name,
        ...statusCounts(seats),
        departments: sortByName(Array.from(departments.entries()).map(([departmentName, departmentSeats]) => ({
          name: departmentName,
          ...statusCounts(departmentSeats)
        })))
      };
    }))
  };
}

function addIssue(issues: PlannerIssue[], issue: PlannerIssue) {
  issues.push({
    ...issue,
    seatIds: issue.seatIds.slice(0, MAX_HIGHLIGHTS),
    employeeIds: issue.employeeIds.slice(0, MAX_HIGHLIGHTS)
  });
}

export function getMapHealth(context: MapOperationsContext) {
  const issues: PlannerIssue[] = [];
  const assignments = assignedSeatByEmployeeId(context.seats);

  const assignedWithoutEmployee = context.seats.filter(seat => seat.status === "assigned" && !seat.employee_id);
  if (assignedWithoutEmployee.length > 0) {
    addIssue(issues, {
      severity: "critical",
      code: "assigned_status_without_employee",
      message: `${assignedWithoutEmployee.length} seat${assignedWithoutEmployee.length === 1 ? "" : "s"} have assigned status but no employee.`,
      seatIds: assignedWithoutEmployee.map(seat => seat.id),
      employeeIds: []
    });
  }

  const occupiedWithNonAssignedStatus = context.seats.filter(seat => seat.employee_id && seat.status !== "assigned");
  if (occupiedWithNonAssignedStatus.length > 0) {
    addIssue(issues, {
      severity: "critical",
      code: "employee_with_non_assigned_status",
      message: `${occupiedWithNonAssignedStatus.length} occupied seat${occupiedWithNonAssignedStatus.length === 1 ? "" : "s"} are not marked assigned.`,
      seatIds: occupiedWithNonAssignedStatus.map(seat => seat.id),
      employeeIds: occupiedWithNonAssignedStatus.map(seat => seat.employee_id).filter((id): id is string => Boolean(id))
    });
  }

  const missingEmployeeRecords = context.seats.filter(seat => seat.employee_id && !seat.employee);
  if (missingEmployeeRecords.length > 0) {
    addIssue(issues, {
      severity: "critical",
      code: "missing_employee_record",
      message: `${missingEmployeeRecords.length} seat${missingEmployeeRecords.length === 1 ? "" : "s"} reference an employee record that was not loaded.`,
      seatIds: missingEmployeeRecords.map(seat => seat.id),
      employeeIds: missingEmployeeRecords.map(seat => seat.employee_id).filter((id): id is string => Boolean(id))
    });
  }

  const duplicateAssignments = Array.from(assignments.entries()).filter(([, seats]) => seats.length > 1);
  duplicateAssignments.forEach(([employeeId, seats]) => {
    addIssue(issues, {
      severity: "critical",
      code: "employee_assigned_to_multiple_seats",
      message: `${seats[0]?.employee?.full_name ?? "An employee"} is assigned to ${seats.length} seats.`,
      seatIds: seats.map(seat => seat.id),
      employeeIds: [employeeId]
    });
  });

  const seatsMissingZone = context.seats.filter(seat => !getSeatZone(seat));
  if (seatsMissingZone.length > 0) {
    addIssue(issues, {
      severity: "warning",
      code: "missing_zone",
      message: `${seatsMissingZone.length} seat${seatsMissingZone.length === 1 ? "" : "s"} have no zone.`,
      seatIds: seatsMissingZone.map(seat => seat.id),
      employeeIds: []
    });
  }

  const outOfBoundsSeats = context.seats.filter(seat => seat.x < 0 || seat.x > 1 || seat.y < 0 || seat.y > 1);
  if (outOfBoundsSeats.length > 0) {
    addIssue(issues, {
      severity: "critical",
      code: "out_of_bounds_coordinates",
      message: `${outOfBoundsSeats.length} seat marker${outOfBoundsSeats.length === 1 ? "" : "s"} have coordinates outside the floor plan.`,
      seatIds: outOfBoundsSeats.map(seat => seat.id),
      employeeIds: []
    });
  }

  const labels = new Map<string, SeatWithEmployee[]>();
  context.seats.forEach(seat => {
    const key = normalizeKey(seat.label);
    const current = labels.get(key) ?? [];
    current.push(seat);
    labels.set(key, current);
  });
  Array.from(labels.values()).filter(seats => seats.length > 1).forEach(seats => {
    addIssue(issues, {
      severity: "critical",
      code: "duplicate_seat_label",
      message: `Seat label ${seats[0]?.label ?? "unknown"} appears ${seats.length} times.`,
      seatIds: seats.map(seat => seat.id),
      employeeIds: []
    });
  });

  const employeeNames = new Map<string, Employee[]>();
  context.employees.forEach(employee => {
    const key = normalizeKey(employee.full_name);
    const current = employeeNames.get(key) ?? [];
    current.push(employee);
    employeeNames.set(key, current);
  });
  Array.from(employeeNames.values()).filter(employees => employees.length > 1).forEach(employees => {
    addIssue(issues, {
      severity: "warning",
      code: "duplicate_employee_name",
      message: `Employee name ${employees[0]?.full_name ?? "unknown"} appears ${employees.length} times.`,
      seatIds: [],
      employeeIds: employees.map(employee => employee.id)
    });
  });

  const unassignedEmployees = context.employees.filter(employee => !assignments.has(employee.id));
  if (unassignedEmployees.length > 0) {
    addIssue(issues, {
      severity: "info",
      code: "unassigned_active_employees",
      message: `${unassignedEmployees.length} active employee${unassignedEmployees.length === 1 ? "" : "s"} are not assigned to a draft seat.`,
      seatIds: [],
      employeeIds: unassignedEmployees.map(employee => employee.id)
    });
  }

  return {
    issueCount: issues.length,
    criticalCount: issues.filter(issue => issue.severity === "critical").length,
    warningCount: issues.filter(issue => issue.severity === "warning").length,
    infoCount: issues.filter(issue => issue.severity === "info").length,
    issues: issues.slice(0, MAX_TOOL_RESULT_ITEMS)
  };
}

export function runReadOnlyPlannerTool(context: MapOperationsContext, name: string, args: unknown) {
  switch (name as PlannerToolName) {
    case "get_map_summary":
      return getMapSummary(context);
    case "search_seats":
      return searchSeats(context, args);
    case "list_people":
      return listPeople(context, args);
    case "get_zone_department_breakdown":
      return getZoneDepartmentBreakdown(context);
    case "get_map_health":
      return getMapHealth(context);
    default:
      return { error: `Unknown read-only tool: ${name}` };
  }
}

function safeStringArray(value: unknown, limit: number) {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => cleanText(item))
    .filter(Boolean)
    .slice(0, limit);
}

function normalizeStatusValue(value: unknown): AskPlannerStatus {
  return value === "refused" || value === "needs_clarification" || value === "answered" ? value : "answered";
}

function normalizeConfidenceValue(value: unknown): AskPlannerConfidence {
  return value === "low" || value === "medium" || value === "high" ? value : "medium";
}

export function validateAskPlannerResponse(value: unknown, seats: SeatWithEmployee[]): AskPlannerResponse {
  const source = isRecord(value) ? value : {};
  const seatById = new Map(seats.map(seat => [seat.id, seat]));
  const highlights: AskPlannerHighlight[] = [];

  if (Array.isArray(source.highlights)) {
    for (const highlight of source.highlights) {
      if (!isRecord(highlight)) continue;
      const seatId = cleanText(highlight.seatId);
      const seat = seatById.get(seatId);
      if (!seat) continue;
      if (highlights.some(item => item.seatId === seatId)) continue;
      highlights.push({
        seatId,
        label: seat.label,
        reason: cleanText(highlight.reason, "Relevant to the answer.").slice(0, 220)
      });
      if (highlights.length >= MAX_HIGHLIGHTS) break;
    }
  }

  return {
    status: normalizeStatusValue(source.status),
    answer: cleanText(source.answer, "Ask Planner could not produce an answer.").slice(0, 4000),
    summary: cleanText(source.summary).slice(0, 600),
    confidence: normalizeConfidenceValue(source.confidence),
    highlights,
    warnings: safeStringArray(source.warnings, MAX_WARNINGS),
    followUps: safeStringArray(source.followUps, MAX_FOLLOW_UPS)
  };
}

function normalizeQuestionForIntent(question: string) {
  return question
    .toLowerCase()
    .replace(/[''`]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isBroadOpenSeatQuestion(question: string) {
  const normalized = normalizeQuestionForIntent(question);
  return BROAD_OPEN_QUESTION_PATTERNS.some(pattern => pattern.test(normalized));
}

function availableDraftSeats(context: MapOperationsContext) {
  return context.seats.filter(seat => seat.status === "available" && !hasEmployee(seat));
}

function openSeatZoneCounts(openSeats: SeatWithEmployee[]) {
  const counts = new Map<string, number>();
  openSeats.forEach(seat => {
    const zone = getSeatZoneLabel(seat);
    counts.set(zone, (counts.get(zone) ?? 0) + 1);
  });
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
}

function broadOpenFollowUps(context: MapOperationsContext, zoneCounts: Array<{ name: string; count: number }>) {
  const names = new Set<string>();
  zoneCounts.forEach(zone => {
    if (zone.name !== "Unzoned") names.add(zone.name);
  });
  context.zoneOptions.filter(zone => zone.active).forEach(zone => names.add(zone.name));
  return Array.from(names)
    .slice(0, MAX_FOLLOW_UPS)
    .map(zone => `Open seats in ${zone}`);
}

export function buildBroadOpenSeatsResponse(context: MapOperationsContext): AskPlannerResponse {
  const openSeats = availableDraftSeats(context);
  const zoneCounts = openSeatZoneCounts(openSeats);
  const count = openSeats.length;
  const zoneCount = zoneCounts.length;
  const zoneSummary = zoneCounts.length > 0
    ? ` By zone: ${zoneCounts.map(zone => `${zone.name} (${zone.count})`).join(", ")}.`
    : "";

  return {
    status: "answered",
    answer: count > 0
      ? `I found ${count} open ${pluralize(count, "seat")} in the saved draft map.${zoneSummary}`
      : "I found no open seats in the saved draft map.",
    summary: count > 0
      ? `${count} open ${pluralize(count, "seat")} across ${zoneCount} ${pluralize(zoneCount, "zone")}.`
      : "No open seats found in saved draft data.",
    confidence: "high",
    highlights: [],
    warnings: [BROAD_OPEN_NO_HIGHLIGHT_WARNING],
    followUps: broadOpenFollowUps(context, zoneCounts)
  };
}

function cleanExplainSeatTarget(question: string) {
  const normalized = question.trim().replace(/[?.!]+$/g, "").trim();
  const match = normalized.match(EXPLAIN_SEAT_QUESTION_PATTERN);
  return match?.[1]?.trim() || "";
}

export function isExplainSeatQuestion(question: string) {
  return Boolean(cleanExplainSeatTarget(question));
}

function findSeatToExplain(context: MapOperationsContext, question: string, seatId?: string | null) {
  const cleanSeatId = cleanText(seatId);
  if (cleanSeatId) {
    const byId = context.seats.find(seat => seat.id === cleanSeatId);
    if (byId) return byId;
  }

  const target = normalizeKey(cleanExplainSeatTarget(question));
  if (!target) return null;

  return context.seats.find(seat => normalizeKey(seat.label) === target || normalizeKey(seat.seat_key) === target) ?? null;
}

function nearbySeatsInSameZone(context: MapOperationsContext, seat: SeatWithEmployee) {
  const zone = getSeatZone(seat);
  if (!zone) return [];

  return context.seats
    .filter(candidate => candidate.id !== seat.id && normalizeKey(getSeatZone(candidate)) === normalizeKey(zone))
    .sort((left, right) => squaredDistance(seat, left) - squaredDistance(seat, right) || left.label.localeCompare(right.label))
    .slice(0, 4);
}

function buildSeatAssignmentDescription(seat: SeatWithEmployee) {
  if (!seat.employee) return "Assignment: Open seat.";

  const details = [
    seat.employee.full_name,
    seat.employee.position,
    seat.employee.department
  ].filter(Boolean);
  return `Assignment: ${details.join(" / ")}.`;
}

export function buildExplainSeatResponse(context: MapOperationsContext, question: string, seatId?: string | null): AskPlannerResponse {
  const seat = findSeatToExplain(context, question, seatId);
  if (!seat) {
    throw new Error(MISSING_EXPLAIN_SEAT_MESSAGE);
  }

  const zone = getSeatZoneLabel(seat);
  const health = getMapHealth(context);
  const seatIssues = health.issues.filter(issue => issue.seatIds.includes(seat.id));
  const nearbySeats = nearbySeatsInSameZone(context, seat);
  const nearbySummary = nearbySeats.length > 0
    ? `Nearby on the map in ${zone}: ${nearbySeats.map(candidate => `${candidate.label} (${candidate.status})`).join(", ")}.`
    : `No nearby same-zone seats were found in saved draft data.`;
  const issueSummary = seatIssues.length > 0
    ? `Map health warnings for this seat: ${seatIssues.map(issue => issue.message).join(" ")}`
    : "No map-health warnings were found for this seat.";
  const statusSummary = seat.status === "available" && !hasEmployee(seat)
    ? "Availability: open."
    : `Status: ${seat.status}.`;

  return {
    status: "answered",
    answer: [
      `Seat ${seat.label} has draft seat ID ${seat.id}.`,
      `Location: ${zone}.`,
      statusSummary,
      `Type: ${seat.is_custom ? "custom" : "original"} draft seat.`,
      buildSeatAssignmentDescription(seat),
      nearbySummary,
      issueSummary
    ].join("\n"),
    summary: `${seat.label} is a ${seat.status} seat in ${zone}.`,
    confidence: "high",
    highlights: [{
      seatId: seat.id,
      label: seat.label,
      reason: "Selected seat explained by Ask Planner."
    }],
    warnings: seatIssues.map(issue => issue.message).slice(0, MAX_WARNINGS),
    followUps: [
      zone !== "Unzoned" ? `Open seats in ${zone}` : "",
      "What looks unhealthy?",
      zone !== "Unzoned" ? `Explain nearby seats in ${zone}` : ""
    ].filter(Boolean).slice(0, MAX_FOLLOW_UPS)
  };
}

function buildReadOnlyTools() {
  return [
    {
      type: "function",
      name: "get_map_summary",
      description: "Return high-level draft map counts by seat status, zone, and department.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false
      },
      strict: true
    },
    {
      type: "function",
      name: "search_seats",
      description: "Search draft seats by label, zone, status, department, person, or occupancy. Returns only matching draft seats.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Optional text to match against seat labels, people, zones, departments, or status." },
          status: { type: "string", enum: ["all", "available", "assigned", "reserved", "unavailable"] },
          zone: { type: "string" },
          department: { type: "string" },
          occupied: { type: ["boolean", "null"] },
          customOnly: { type: ["boolean", "null"] },
          limit: { type: "number" }
        },
        required: ["query", "status", "zone", "department", "occupied", "customOnly", "limit"],
        additionalProperties: false
      },
      strict: true
    },
    {
      type: "function",
      name: "list_people",
      description: "List active employees and their draft seat assignment state.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          department: { type: "string" },
          assignment: { type: "string", enum: ["all", "assigned", "unassigned"] },
          limit: { type: "number" }
        },
        required: ["query", "department", "assignment", "limit"],
        additionalProperties: false
      },
      strict: true
    },
    {
      type: "function",
      name: "get_zone_department_breakdown",
      description: "Return draft seat counts grouped by zone and the departments represented in each zone.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false
      },
      strict: true
    },
    {
      type: "function",
      name: "get_map_health",
      description: "Return deterministic read-only map health checks for inconsistent statuses, duplicate assignments, missing zones, duplicate names, and unassigned active employees.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false
      },
      strict: true
    }
  ];
}

function buildResponseSchema() {
  return {
    type: "json_schema",
    name: "ask_planner_response",
    strict: true,
    schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["answered", "refused", "needs_clarification"] },
        answer: { type: "string" },
        summary: { type: "string" },
        confidence: { type: "string", enum: ["low", "medium", "high"] },
        highlights: {
          type: "array",
          items: {
            type: "object",
            properties: {
              seatId: { type: "string" },
              label: { type: "string" },
              reason: { type: "string" }
            },
            required: ["seatId", "label", "reason"],
            additionalProperties: false
          }
        },
        warnings: {
          type: "array",
          items: { type: "string" }
        },
        followUps: {
          type: "array",
          items: { type: "string" }
        }
      },
      required: ["status", "answer", "summary", "confidence", "highlights", "warnings", "followUps"],
      additionalProperties: false
    }
  };
}

function buildInstructions(context: MapOperationsContext) {
  const summary = getMapSummary(context).totals;

  return [
    "You are Ask Planner, a read-only map operations agent for an office seat-planning admin.",
    "You can answer questions about draft seats, assignments, zones, departments, and map health.",
    "Use only the supplied read-only tools and their outputs for factual claims about the map.",
    "Never publish, move seats, assign employees, vacate seats, delete seats, import data, restore data, or change anything.",
    "If the user asks for a write action, refuse that action and offer read-only findings or next steps an admin can review manually.",
    "Highlight only seats that directly support the answer. Use draft seat IDs exactly as returned by tools.",
    "For broad answers that would highlight many seats, set highlights to an empty array, explain that broad answers may not highlight seats in warnings, and suggest narrower follow-ups by zone, department, or group.",
    "Your final answer must be one JSON object matching the response schema. Do not wrap it in Markdown, code fences, or prose outside the JSON object.",
    "Keep answers concise and operational. Mention uncertainty in warnings when data is missing or capped.",
    `Current persisted draft snapshot totals: ${summary.total} seats, ${summary.assigned} assigned, ${summary.available} available, ${summary.reserved} reserved, ${summary.unavailable} unavailable, ${summary.activeEmployees} active employees.`
  ].join("\n");
}

function buildInput(question: string) {
  return [
    `Admin question: ${question}`,
    WRITE_ACTION_PATTERN.test(question)
      ? "The question may request a write action. If so, refuse to perform it and answer only with read-only information."
      : "Answer with read-only map information."
  ].join("\n");
}

function openAIErrorPayload(value: unknown): OpenAIErrorPayload {
  return isRecord(value) ? value as OpenAIErrorPayload : {};
}

export function buildOpenAIFailureDiagnostic(input: {
  status?: number;
  statusText?: string;
  payload?: unknown;
  model: string;
  requestId?: string | null;
  thrown?: unknown;
}): OpenAIFailureDiagnostic {
  const payload = openAIErrorPayload(input.payload);
  const error = payload.error ?? {};
  const thrownMessage = input.thrown instanceof Error ? input.thrown.message : undefined;

  return {
    status: input.status,
    statusText: cleanDiagnosticField(input.statusText),
    errorType: cleanDiagnosticField(error.type),
    errorCode: cleanDiagnosticField(error.code),
    errorParam: cleanDiagnosticField(error.param),
    errorMessage: sanitizeOpenAIDiagnosticMessage(error.message ?? thrownMessage),
    model: cleanDiagnosticField(input.model, 120) ?? "[unknown]",
    requestId: cleanDiagnosticField(input.requestId, 160)
  };
}

export function buildOpenAICompletionDiagnostic(input: {
  model: string;
  response: OpenAIResponsePayload;
  requestId?: string | null;
  durationMs: number;
}): OpenAICompletionDiagnostic {
  const usage: OpenAIUsagePayload = input.response.usage ?? {};
  const outputItems = input.response.output ?? [];

  return {
    responseId: cleanDiagnosticField(input.response.id, 160),
    model: cleanDiagnosticField(input.model, 120) ?? "[unknown]",
    responseStatus: cleanDiagnosticField(input.response.status, 80),
    incompleteReason: cleanDiagnosticField(input.response.incomplete_details?.reason, 120),
    requestId: cleanDiagnosticField(input.requestId, 160),
    durationMs: cleanDiagnosticNumber(input.durationMs) ?? 0,
    inputTokens: cleanDiagnosticNumber(usage.input_tokens),
    cachedInputTokens: cleanDiagnosticNumber(usage.input_tokens_details?.cached_tokens),
    outputTokens: cleanDiagnosticNumber(usage.output_tokens),
    reasoningTokens: cleanDiagnosticNumber(usage.output_tokens_details?.reasoning_tokens),
    totalTokens: cleanDiagnosticNumber(usage.total_tokens),
    outputItemCount: outputItems.length,
    toolCallCount: outputItems.filter(item => item.type === "function_call").length
  };
}

function logOpenAIRequestFailure(input: Parameters<typeof buildOpenAIFailureDiagnostic>[0]) {
  console.warn("[AskPlanner/OpenAI] request failed", buildOpenAIFailureDiagnostic(input));
}

function logOpenAIRequestSuccess(input: Parameters<typeof buildOpenAICompletionDiagnostic>[0]) {
  console.info("[AskPlanner/OpenAI] request completed", buildOpenAICompletionDiagnostic(input));
}

function isModelUnavailableOrUnauthorized(status: number, payload: OpenAIErrorPayload) {
  const error = payload.error ?? {};
  const code = (error.code ?? "").toLowerCase();
  const type = (error.type ?? "").toLowerCase();
  const param = (error.param ?? "").toLowerCase();
  const message = (error.message ?? "").toLowerCase();
  const modelMentioned = param === "model" || code.includes("model") || type.includes("model") || message.includes("model");
  const accessMentioned = /(not found|not exist|unavailable|unsupported|does not have access|permission|unauthorized|not authorized|forbidden|invalid model)/.test(message);

  return status === 404 || status === 403 || (modelMentioned && accessMentioned);
}

export function formatOpenAIAdminError(status: number, payload: unknown, model: string) {
  const parsedPayload = openAIErrorPayload(payload);

  if (isModelUnavailableOrUnauthorized(status, parsedPayload)) {
    return `Ask Planner cannot use the configured OpenAI model "${model}". Check OPENAI_MODEL or your OpenAI project model access.`;
  }

  if (status === 401) {
    return "Ask Planner could not authenticate with OpenAI. Check OPENAI_API_KEY.";
  }

  if (status === 429) {
    return "Ask Planner is temporarily rate limited by OpenAI. Try again shortly.";
  }

  return "Ask Planner could not reach OpenAI. Try again shortly.";
}

function openAIRequestId(response: Response) {
  return response.headers.get("x-request-id") ??
    response.headers.get("openai-request-id") ??
    response.headers.get("request-id");
}

async function createOpenAIResponse(apiKey: string, body: OpenAIResponseBody): Promise<OpenAIResponsePayload> {
  const controller = new AbortController();
  const timeout = windowlessSetTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    if (!response.ok) {
      let errorPayload: unknown = null;
      try {
        errorPayload = await response.json();
      } catch {
        errorPayload = null;
      }
      const requestId = openAIRequestId(response);
      logOpenAIRequestFailure({
        status: response.status,
        statusText: response.statusText,
        payload: errorPayload,
        model: body.model,
        requestId
      });
      throw new Error(formatOpenAIAdminError(response.status, errorPayload, body.model));
    }

    const responsePayload = await response.json() as OpenAIResponsePayload;
    logOpenAIRequestSuccess({
      model: body.model,
      response: responsePayload,
      requestId: openAIRequestId(response),
      durationMs: Date.now() - startedAt
    });
    return responsePayload;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      logOpenAIRequestFailure({ model: body.model, thrown: error });
      throw new Error("Ask Planner took too long to answer. Try a narrower question.");
    }
    if (error instanceof Error && error.message.startsWith("Ask Planner")) throw error;
    logOpenAIRequestFailure({ model: body.model, thrown: error });
    throw new Error("Ask Planner could not reach OpenAI. Try again shortly.");
  } finally {
    clearTimeout(timeout);
  }
}

function windowlessSetTimeout(callback: () => void, ms: number) {
  return setTimeout(callback, ms);
}

type PlannerToolCall = {
  name: string;
  callId: string;
  argumentsText: string;
};

type PlannerToolExecutor = (context: MapOperationsContext, name: string, args: unknown) => unknown;

function extractToolCalls(response: OpenAIResponsePayload): PlannerToolCall[] {
  return (response.output ?? [])
    .filter(item => item.type === "function_call" && item.call_id)
    .map(item => ({
      name: cleanText(item.name, "unknown_tool"),
      callId: String(item.call_id),
      argumentsText: typeof item.arguments === "string" ? item.arguments : "{}"
    }));
}

function parseToolArguments(argumentsText: string) {
  try {
    const parsed = JSON.parse(argumentsText) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function buildFunctionCallOutput(
  context: MapOperationsContext,
  toolCall: PlannerToolCall,
  executeTool: PlannerToolExecutor = runReadOnlyPlannerTool
) {
  let result: unknown;

  try {
    result = executeTool(context, toolCall.name, parseToolArguments(toolCall.argumentsText));
  } catch {
    result = {
      error: "Read-only tool failed. Ask Planner can continue with other available read-only data."
    };
  }

  return {
    type: "function_call_output",
    call_id: toolCall.callId,
    output: JSON.stringify(result)
  };
}

export function buildFunctionCallOutputs(
  context: MapOperationsContext,
  toolCalls: PlannerToolCall[],
  executeTool: PlannerToolExecutor = runReadOnlyPlannerTool
) {
  return toolCalls.map(toolCall => buildFunctionCallOutput(context, toolCall, executeTool));
}

function extractOutputText(response: OpenAIResponsePayload) {
  if (typeof response.output_text === "string" && response.output_text.trim()) return response.output_text.trim();

  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if ((content.type === "output_text" || content.type === "text") && typeof content.text === "string") {
        return content.text.trim();
      }
    }
  }

  return "";
}

function extractStructuredRefusal(response: OpenAIResponsePayload) {
  for (const item of response.output ?? []) {
    if (typeof item.refusal === "string" && item.refusal.trim()) return item.refusal.trim();

    for (const content of item.content ?? []) {
      if (content.type === "refusal" && typeof content.refusal === "string" && content.refusal.trim()) {
        return content.refusal.trim();
      }
    }
  }

  return "";
}

function buildStructuredRefusalResponse(): AskPlannerResponse {
  return {
    status: "refused",
    answer: "Ask Planner cannot answer that request. It can only provide read-only findings from saved draft map data.",
    summary: "Request refused.",
    confidence: "high",
    highlights: [],
    warnings: [STRUCTURED_REFUSAL_WARNING],
    followUps: ["Which seats are open?", "What looks unhealthy?"]
  };
}

function assertOpenAIResponseComplete(response: OpenAIResponsePayload) {
  if (!response.status || response.status === "completed") return;

  const reason = response.incomplete_details?.reason ?? "";
  if (response.status === "incomplete" && reason === "max_output_tokens") {
    throw new Error("Ask Planner ran out of response tokens before finishing. Try a narrower question.");
  }

  if (response.status === "incomplete") {
    throw new Error("Ask Planner did not finish the response. Try a narrower question.");
  }

  throw new Error("Ask Planner could not complete the OpenAI response. Try again shortly.");
}

function parsePlannerJson(text: string) {
  const candidates = [
    text,
    extractFencedJson(text),
    extractEmbeddedJsonObject(text)
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as unknown;
    } catch {
      // Try the next safe wrapper shape.
    }
  }

  throw new Error("Ask Planner returned an unreadable response. Try rephrasing the question.");
}

function extractFencedJson(text: string) {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return match?.[1]?.trim() || null;
}

function extractEmbeddedJsonObject(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  return text.slice(start, end + 1).trim();
}

export async function answerMapOperationsQuestion(input: MapOperationsData & { question: string; seatId?: string | null }): Promise<AskPlannerResponse> {
  const question = input.question.trim();
  if (!question) {
    throw new Error("Ask Planner needs a question.");
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    throw new Error(`Ask Planner questions are limited to ${MAX_QUESTION_LENGTH} characters.`);
  }

  const context = createMapOperationsContext(input);
  if (input.seatId || isExplainSeatQuestion(question)) {
    return buildExplainSeatResponse(context, question, input.seatId);
  }
  if (isBroadOpenSeatQuestion(question)) {
    return buildBroadOpenSeatsResponse(context);
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Ask Planner is not configured for this environment. Add OPENAI_API_KEY as a server-side environment variable and redeploy.");
  }

  const model = resolveAskPlannerModel();
  const tools = buildReadOnlyTools();
  const text = { format: buildResponseSchema() };
  const instructions = buildInstructions(context);
  let request: OpenAIResponseBody = {
    model,
    instructions,
    input: buildInput(question),
    tools,
    tool_choice: "auto",
    text,
    max_output_tokens: 1600
  };

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
    const response = await createOpenAIResponse(apiKey, request);
    assertOpenAIResponseComplete(response);
    if (extractStructuredRefusal(response)) {
      return buildStructuredRefusalResponse();
    }

    const toolCalls = extractToolCalls(response);

    if (toolCalls.length === 0) {
      const outputText = extractOutputText(response);
      if (!outputText) throw new Error("Ask Planner returned an empty response. Try rephrasing the question.");
      return validateAskPlannerResponse(parsePlannerJson(outputText), context.seats);
    }

    if (!response.id) {
      throw new Error("Ask Planner could not continue a tool response. Try again.");
    }

    request = {
      model,
      instructions,
      previous_response_id: response.id,
      input: buildFunctionCallOutputs(context, toolCalls),
      tools,
      tool_choice: "auto",
      text,
      max_output_tokens: 1600
    };
  }

  throw new Error("Ask Planner needed too many read-only lookups. Try a narrower question.");
}
