"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { ChangeEvent, FormEvent, KeyboardEvent, ReactNode } from "react";
import type { DraftSnapshot } from "@/lib/draftHistory";
import type { DepartmentOption, Employee, SeatStatus, SeatWithEmployee } from "@/lib/types";
import { STATUS_LABELS } from "@/lib/types";
import { updateSeatAction } from "@/app/actions";
import { canDeleteSeat, getSeatDeleteBlockReason, isProtectedOriginalSeatLabel } from "@/lib/seatProtection";
import { buildOccupantRows, employeeAssignmentFields, type OccupantFactRow } from "@/lib/employeeAssignment";
import { formatDisplayName, formatSeatCode } from "@/lib/formatName";
import { buildInitials } from "@/lib/validators";
import { adminDangerButtonClassName, Button } from "@/components/ui/Button";
import { CloseIcon } from "@/components/ui/CloseIcon";
import { useDialogFocus } from "@/components/ui/useDialogFocus";

type SeatInspectorProps = {
  seat: SeatWithEmployee | null;
  seats: SeatWithEmployee[];
  employees: Employee[];
  departmentOptions: DepartmentOption[];
  canEdit: boolean;
  collapsed: boolean;
  // While the results panel occupies the slot it hosts the collapsed-seat row,
  // so the standalone pill stays hidden instead of overlapping the panel.
  pillSuppressed?: boolean;
  swapMode: boolean;
  searchMismatchNotice?: string | null;
  searchMismatchClearLabel?: string;
  onClose: () => void;
  onClearSearchContext?: () => void;
  onToggleCollapse: () => void;
  // Edit callbacks are optional so the read-only viewer can render the same
  // inspector without wiring any draft machinery (canEdit=false never calls them).
  onStartSwapSeat?: () => void;
  onStartMoveSeat?: () => void;
  moveMode?: boolean;
  // True when the seat sits away from its published position — enables the
  // Seat section's "Reset position" escape hatch for mis-dragged markers.
  canResetPosition?: boolean;
  onResetPosition?: () => void;
  onDeleteSeat?: () => void;
  onExplainSeat?: (seat: SeatWithEmployee) => void;
  onBeforeSeatUpdate?: () => DraftSnapshot;
  onSeatUpdated?: (seat: SeatWithEmployee, beforeSnapshot: DraftSnapshot) => void;
  onError?: (message: string | null) => void;
  // The draft-concurrency fence fired: the seat changed in another admin
  // session. The parent owns recovery (reload draft, reset history).
  onStaleDraft?: (message: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onSubmitBlocked?: () => void;
  resetSignal?: number;
  // Session-local edit log for the selected seat (admin Activity section).
  // Read-only labels derived from the parent's undo history — no server data.
  activityEntries?: string[];
};

type SeatInspectorForm = {
  label: string;
  employeeId: string;
  employeeName: string;
  employeePosition: string;
  phoneExtension: string;
  department: string;
  zone: string;
  status: SeatStatus;
  notes: string;
};

type SeatInspectorField = "employeeName" | "employeePosition" | "phoneExtension" | "department" | "status" | "notes";

type FieldError = {
  field: SeatInspectorField;
  message: string;
};

// Stable defaults for the optional edit callbacks (the viewer omits them).
// These MUST be module-level constants: inline `= () => {}` defaults mint a
// new identity per render, which cascades through effect deps into a setState loop.
const noopCallback = () => undefined;
const emptyDraftSnapshot = (): DraftSnapshot => ({ seats: [], employees: [] });

const emptyForm: SeatInspectorForm = {
  label: "",
  employeeId: "",
  employeeName: "",
  employeePosition: "",
  phoneExtension: "",
  department: "",
  zone: "",
  status: "available",
  notes: ""
};

function formFromSeat(seat: SeatWithEmployee): SeatInspectorForm {
  return {
    label: seat.label,
    employeeId: seat.employee_id ?? "",
    employeeName: seat.employee?.full_name ?? "",
    employeePosition: seat.employee?.position ?? "",
    phoneExtension: seat.employee?.phone_extension ?? "",
    department: seat.employee?.department ?? "",
    zone: seat.zone ?? seat.department ?? "",
    status: seat.status,
    notes: seat.notes ?? ""
  };
}

function formSnapshot(form: SeatInspectorForm) {
  return JSON.stringify(form);
}

function formsEqual(left: SeatInspectorForm, right: SeatInspectorForm) {
  return Object.keys(emptyForm).every(key => {
    const formKey = key as keyof SeatInspectorForm;
    return left[formKey] === right[formKey];
  });
}

function CollapseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4">
      <path d="M5 10h10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4">
      <path d="m5.5 8 4.5 4.5L14.5 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4">
      <path d="m8 5.5 4.5 4.5L8 14.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Shell inspector (redesign spec §6): dark #161616 panel, seamless with the
// top bar. Sections are native collapsible <details> groups split by hairline
// dividers, with key/value fact rows (mono values) inside.
function SectionHeading({ id, title }: { id?: string; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <h3 id={id} className="shrink-0 text-[12px] font-semibold text-[#e4e4e4]">{title}</h3>
      <span aria-hidden="true" className="h-px min-w-4 flex-1 bg-white/10" />
    </div>
  );
}

function FactRow({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2.5 border-b border-white/5 py-1.5 last:border-b-0">
      <dt className="shrink-0 text-[12.5px] text-[var(--admin-chrome-muted)]">{label}</dt>
      <dd className={["min-w-0 truncate text-right text-[12.5px] font-medium text-[#eeeeee]", mono ? "font-mono" : ""].filter(Boolean).join(" ")}>{value}</dd>
    </div>
  );
}

// Occupant facts hide fields with nothing on file instead of rendering "—"
// dash rows (2026-07-16 critique carryover) — an absent row reads as "nothing
// recorded"; a column of dashes reads as broken. When NOTHING is on file, one
// quiet line says so, and admins get pointed at Management (where profiles
// are completed).
function OccupantFacts({ rows, canEdit }: { rows: OccupantFactRow[]; canEdit: boolean }) {
  if (rows.length === 0) {
    return (
      <p className="py-1.5 text-[12.5px] leading-4 text-[var(--admin-chrome-muted)]">
        No contact details on file.{canEdit ? " Add them from the Management page." : ""}
      </p>
    );
  }
  return (
    <dl>
      {rows.map(row =>
        row.label === "Department"
          ? <FactRow key={row.label} label={row.label} value={row.value} mono={false} />
          : <FactRow key={row.label} label={row.label} value={row.value} />
      )}
    </dl>
  );
}

function InspectorSection({
  title,
  headingId,
  defaultOpen = false,
  children
}: {
  title: ReactNode;
  headingId?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    // Hover/active affordance (owner ask, 2026-07-16): hovering a section
    // header steps the row surface up and brightens the label; the OPEN
    // section carries a primary-orange left rail plus a warm title glow so
    // "which section am I in" reads at a glance on the dark panel.
    <details open={defaultOpen} className="group border-b border-l-2 border-white/10 border-l-transparent transition-colors open:border-l-[var(--admin-primary)]">
      <summary
        className="flex cursor-pointer select-none list-none items-center px-4 py-2.5 text-[12px] font-medium text-[#e4e4e4] transition-colors hover:bg-[#262626] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-primary)] [&::-webkit-details-marker]:hidden"
      >
        <span id={headingId} className="transition group-open:text-white group-open:[text-shadow:0_0_10px_rgba(241,90,36,0.45)]">{title}</span>
        <svg aria-hidden="true" viewBox="0 0 20 20" className="ml-auto h-3.5 w-3.5 text-[var(--admin-chrome-muted)] transition-transform duration-150 group-hover:text-[#f4f4f4] group-open:rotate-90 group-open:text-[var(--admin-primary)]">
          <path d="m8 5.5 4.5 4.5L8 14.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <div className="px-4 pb-3">{children}</div>
    </details>
  );
}

export function SeatInspector({
  seat,
  seats,
  employees,
  departmentOptions,
  canEdit,
  collapsed,
  pillSuppressed = false,
  swapMode,
  searchMismatchNotice = null,
  searchMismatchClearLabel = "Clear search",
  onClose,
  onClearSearchContext,
  onToggleCollapse,
  onStartSwapSeat = noopCallback,
  onStartMoveSeat = noopCallback,
  moveMode = false,
  canResetPosition = false,
  onResetPosition = noopCallback,
  onDeleteSeat = noopCallback,
  onExplainSeat,
  onBeforeSeatUpdate = emptyDraftSnapshot,
  onSeatUpdated = noopCallback,
  onError = noopCallback,
  onStaleDraft = noopCallback,
  onDirtyChange = noopCallback,
  onSubmitBlocked,
  resetSignal = 0,
  activityEntries = []
}: SeatInspectorProps) {
  const [pending, startTransition] = useTransition();
  const [localError, setLocalError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [form, setForm] = useState<SeatInspectorForm>(emptyForm);
  const [initialForm, setInitialForm] = useState<SeatInspectorForm>(emptyForm);
  // Figma resting inspector is compact facts + notes + actions; the full
  // assignment editor reveals progressively behind Assign/Change assignment.
  const [editingAssignment, setEditingAssignment] = useState(false);
  const [employeeComboboxOpen, setEmployeeComboboxOpen] = useState(false);
  const [activeEmployeeIndex, setActiveEmployeeIndex] = useState(0);
  const [vacateConfirmOpen, setVacateConfirmOpen] = useState(false);
  const [moveConflict, setMoveConflict] = useState<{
    employeeName: string;
    currentSeatLabel: string;
    input: Parameters<typeof updateSeatAction>[0];
    beforeSnapshot: DraftSnapshot;
  } | null>(null);
  const activeSeatIdRef = useRef<string | null>(null);
  const activeSeatSnapshotRef = useRef(formSnapshot(emptyForm));
  const resetSignalRef = useRef(resetSignal);
  const errorSummaryRef = useRef<HTMLDivElement | null>(null);
  const primaryActionRef = useRef<HTMLButtonElement | null>(null);
  const collapseRailRef = useRef<HTMLButtonElement | null>(null);
  // Explicit collapse/expand toggles request a focus handoff; the search
  // auto-collapse (INV-1) sets no flag, so typing never loses focus.
  const focusRailAfterCollapseRef = useRef(false);
  const focusPanelAfterExpandRef = useRef(false);
  const prevCollapsedRef = useRef(collapsed);
  const assignmentSectionRef = useRef<HTMLElement | null>(null);
  const vacateDialogFocusRef = useDialogFocus<HTMLElement>();
  const moveConflictDialogFocusRef = useDialogFocus<HTMLElement>();
  const employeeInputRef = useRef<HTMLInputElement | null>(null);
  const employeePositionRef = useRef<HTMLInputElement | null>(null);
  const phoneExtensionRef = useRef<HTMLInputElement | null>(null);
  const departmentRef = useRef<HTMLSelectElement | null>(null);
  const statusRef = useRef<HTMLSelectElement | null>(null);
  const notesRef = useRef<HTMLTextAreaElement | null>(null);

  const sortedEmployees = useMemo(
    () => [...employees].filter(employee => employee.active).sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [employees]
  );

  const employeeOptions = useMemo(() => sortedEmployees.map(employee => {
    const assignedSeat = seats.find(item => item.employee_id === employee.id) ?? null;
    const phoneExtension = employee.phone_extension ? `Ext. ${employee.phone_extension}` : null;
    const metaParts = [employee.department, employee.position, phoneExtension].filter(Boolean);
    return {
      employee,
      assignedSeatLabel: assignedSeat?.label ?? "Unassigned",
      meta: metaParts.join(" · ") || "No department or title",
      searchable: [employee.full_name, employee.department, employee.position, employee.phone_extension, assignedSeat?.label]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
    };
  }), [seats, sortedEmployees]);

  const filteredEmployeeOptions = useMemo(() => {
    const needle = form.employeeName.trim().toLowerCase();
    if (!needle) return employeeOptions.slice(0, 8);
    return employeeOptions
      .filter(option => option.searchable.includes(needle))
      .slice(0, 8);
  }, [employeeOptions, form.employeeName]);

  const departments = useMemo(() => {
    const values = new Set<string>();
    departmentOptions.filter(item => item.active).forEach(item => values.add(item.name));
    sortedEmployees.forEach(employee => {
      if (employee.department) values.add(employee.department);
    });
    if (form.department) values.add(form.department);
    return Array.from(values).sort();
  }, [departmentOptions, sortedEmployees, form.department]);

  const isDirty = useMemo(() => !formsEqual(form, initialForm), [form, initialForm]);
  const hasAssignedPerson = Boolean(form.employeeId || form.employeeName.trim());
  const effectiveStatus: SeatStatus = hasAssignedPerson ? "assigned" : form.status === "assigned" ? "available" : form.status;
  const matchedEmployee = useMemo(() => {
    const cleanName = form.employeeName.trim().toLowerCase();
    if (!cleanName) return null;
    return sortedEmployees.find(employee => employee.full_name.trim().toLowerCase() === cleanName) ?? null;
  }, [form.employeeName, sortedEmployees]);

  useEffect(() => {
    setActiveEmployeeIndex(current => Math.min(Math.max(current, 0), Math.max(filteredEmployeeOptions.length - 1, 0)));
  }, [filteredEmployeeOptions.length]);

  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  const resetInspectorDraftForm = useCallback((nextForm: SeatInspectorForm) => {
    activeSeatSnapshotRef.current = formSnapshot(nextForm);
    setForm(nextForm);
    setInitialForm(nextForm);
    setLocalError(null);
    setFieldErrors([]);
    setSaveFeedback(null);
    setEditingAssignment(false);
    setEmployeeComboboxOpen(false);
    setActiveEmployeeIndex(0);
    setVacateConfirmOpen(false);
    setMoveConflict(null);
    onError(null);
    onDirtyChange(false);
  }, [onDirtyChange, onError]);

  useEffect(() => {
    if (!seat) {
      activeSeatIdRef.current = null;
      activeSeatSnapshotRef.current = formSnapshot(emptyForm);
      setForm(emptyForm);
      setInitialForm(emptyForm);
      setLocalError(null);
      setFieldErrors([]);
      setSaveFeedback(null);
      setEditingAssignment(false);
      setEmployeeComboboxOpen(false);
      setActiveEmployeeIndex(0);
      setVacateConfirmOpen(false);
      setMoveConflict(null);
      onDirtyChange(false);
      return;
    }

    const nextForm = formFromSeat(seat);
    const nextSnapshot = formSnapshot(nextForm);
    const isNewSeat = activeSeatIdRef.current !== seat.id;

    if (isNewSeat || (!isDirty && activeSeatSnapshotRef.current !== nextSnapshot)) {
      activeSeatIdRef.current = seat.id;
      resetInspectorDraftForm(nextForm);
    }
  }, [seat, isDirty, onDirtyChange, resetInspectorDraftForm]);

  useEffect(() => {
    if (resetSignalRef.current === resetSignal) return;
    resetSignalRef.current = resetSignal;
    if (!seat) return;

    activeSeatIdRef.current = seat.id;
    resetInspectorDraftForm(formFromSeat(seat));
  }, [resetSignal, seat, resetInspectorDraftForm]);

  // Hand focus across explicit collapse/expand transitions — the clicked
  // toggle unmounts with its panel (2026-07-16 critique, action 5).
  useEffect(() => {
    if (prevCollapsedRef.current === collapsed) return;
    prevCollapsedRef.current = collapsed;
    if (collapsed && focusRailAfterCollapseRef.current) {
      focusRailAfterCollapseRef.current = false;
      window.requestAnimationFrame(() => collapseRailRef.current?.focus());
    } else if (!collapsed && focusPanelAfterExpandRef.current) {
      focusPanelAfterExpandRef.current = false;
      window.requestAnimationFrame(() => document.getElementById("seat-inspector-panel")?.focus());
    }
  }, [collapsed]);

  if (!seat) return null;

  const selectedSeat = seat;
  const selectedSeatEmployeeName = selectedSeat.employee?.full_name ?? "this employee";
  const hasCurrentAssignment = Boolean(selectedSeat.employee_id);
  const selectedSeatCanDelete = canDeleteSeat(selectedSeat);
  const selectedSeatDeleteBlockReason = getSeatDeleteBlockReason(selectedSeat);
  const employeeNameValue = form.employeeName.trim();
  const assignmentStateText = employeeNameValue
    ? matchedEmployee
      ? "Matched existing employee"
      : "Create new employee on save"
    : "No employee assigned";
  const primaryActionLabel = hasCurrentAssignment
    ? "Save draft changes"
    : hasAssignedPerson
      ? "Assign employee"
      : "Save draft changes";
  const showNewEmployeeNotice = Boolean(employeeNameValue && !matchedEmployee);
  const employeeHelpId = "seat-inspector-employee-help";
  const employeeStateId = "seat-inspector-employee-state";
  const newEmployeeNoticeId = showNewEmployeeNotice ? "seat-inspector-new-employee-notice" : null;

  const currentZone = selectedSeat.zone ?? selectedSeat.department ?? "Unzoned";
  const currentStatusLabel = STATUS_LABELS[effectiveStatus];
  // Header status chip on the dark panel: neutral pill, the status carries the
  // shell status hue on the dot only (never color-only — the label names it).
  const headerStatusDotClass = effectiveStatus === "assigned"
    ? "bg-[var(--admin-status-ok)]"
    : effectiveStatus === "reserved"
      ? "bg-[var(--admin-status-warn)]"
      : effectiveStatus === "unavailable"
        ? "bg-[var(--admin-status-bad)]"
        : "bg-[#8d8d8d]";
  const seatTypeLabel = isProtectedOriginalSeatLabel(selectedSeat.label)
    ? "Protected original"
    : selectedSeat.is_custom
      ? "Custom draft"
      : "Original";
  // Solid status tag (Seat section): shell status hue + AA text partner
  // (#161616 on #24a148 ≈ 4.8:1, on #f1c21b ≈ 12:1; white on #da1e28 = 5.0:1).
  const statusTagClass = effectiveStatus === "assigned"
    ? "bg-[var(--admin-status-ok)] text-[#161616]"
    : effectiveStatus === "reserved"
      ? "bg-[var(--admin-status-warn)] text-[#161616]"
      : effectiveStatus === "unavailable"
        ? "bg-[var(--admin-status-bad)] text-white"
        : "bg-[#8d8d8d] text-[#161616]";
  const fieldErrorMap = fieldErrors.reduce<Partial<Record<SeatInspectorField, string>>>((current, error) => {
    current[error.field] = error.message;
    return current;
  }, {});
  const inspectorStateLabel = pending
    ? "Saving draft..."
    : localError
      ? "Error"
      : isDirty
        ? "Unsaved changes"
        : saveFeedback ?? "No unsaved changes";
  // Figma draft-impact pill: green when the seat matches the saved draft,
  // amber while edits are unsaved or saving, red when the last save failed.
  // Dark-panel state colors (measured on #161616): #f1c21b ≈ 10.4:1,
  // #ff8389 ≈ 7.9:1, #42be65 ≈ 7.3:1 — all clear AA for small text.
  const inspectorStatePillClassName = localError
    ? "bg-[#da1e28]/15 text-[#ff8389]"
    : pending || isDirty
      ? "bg-[#f1c21b]/10 text-[#f1c21b]"
      : "bg-[#24a148]/15 text-[#42be65]";
  // Header identity reflects the SAVED occupant only — a staged, unsaved pick
  // must not flip the header, or the panel claims an assignment that doesn't
  // exist yet (the draft-impact pill carries the unsaved-state signal).
  const assignmentIdentityLabel = hasCurrentAssignment ? selectedSeatEmployeeName : "";
  const occupantInitials = buildInitials(formatDisplayName(assignmentIdentityLabel) || "Open seat") || "?";
  const occupantRoleLabel = hasCurrentAssignment
    ? [selectedSeat.employee?.position, selectedSeat.employee?.department].filter(Boolean).join(" · ") || "Employee"
    : "Unassigned";
  // Footer action buttons override the shared Button's variants with the dark
  // inspector surfaces (spec §6 — the panel wears the chrome, not the canvas).
  const footerNeutralButtonClass =
    "!border-white/20 !bg-[#262626] !text-[#f4f4f4] hover:!border-white/30 hover:!bg-[#333333] hover:!text-white disabled:!border-white/10 disabled:!bg-[#1f1f1f] disabled:!text-[#8d8d8d]";
  const footerDangerButtonClass =
    "!border-transparent !bg-[#da1e28]/15 !text-[#ff8389] hover:!border-[#da1e28] hover:!bg-[#da1e28] hover:!text-white disabled:!border-transparent disabled:!bg-[#1f1f1f] disabled:!text-[#8d8d8d]";
  const fieldErrorClassName = "border-[#da1e28] focus:border-[#da1e28] focus:ring-[#da1e28]/40";
  const warningSurfaceClassName = "border-[#f1c21b]/40 bg-[#f1c21b]/10 text-[#f1c21b]";
  const neutralPillClassName = "bg-white/10 text-[#c6c6c6] ring-white/15";
  const successPillClassName = "bg-[#24a148]/15 text-[#42be65] ring-[#24a148]/40";

  function fieldErrorId(field: SeatInspectorField) {
    return `seat-inspector-${field}-error`;
  }

  function fieldDescribedBy(field: SeatInspectorField, extraId?: string) {
    return [extraId, fieldErrorMap[field] ? fieldErrorId(field) : null].filter(Boolean).join(" ") || undefined;
  }

  const employeeNameDescribedBy = fieldDescribedBy("employeeName", [employeeHelpId, employeeStateId, newEmployeeNoticeId].filter(Boolean).join(" "));

  function clearFieldError(field: SeatInspectorField) {
    setFieldErrors(current => current.filter(error => error.field !== field));
    if (localError) {
      setLocalError(null);
      onError(null);
    }
    setSaveFeedback(null);
  }

  function focusInspectorField(field: SeatInspectorField) {
    const target = {
      employeeName: employeeInputRef,
      employeePosition: employeePositionRef,
      phoneExtension: phoneExtensionRef,
      department: departmentRef,
      status: statusRef,
      notes: notesRef
    }[field];
    const element = target.current;
    if (!element) return;
    // Fields may sit inside a collapsed <details> section — reveal before focusing.
    const parentDetails = element.closest("details");
    if (parentDetails && !parentDetails.open) parentDetails.open = true;
    element.focus();
  }

  function focusErrorSummary() {
    window.requestAnimationFrame(() => errorSummaryRef.current?.focus());
  }

  function validateFormFields() {
    const errors: FieldError[] = [];
    const employeeName = form.employeeName.trim();
    const hasAssignmentDetails = Boolean(form.employeePosition.trim() || form.phoneExtension.trim() || form.department.trim());

    if (!employeeName && hasAssignmentDetails) {
      errors.push({
        field: "employeeName",
        message: "Add an employee name before saving assignment details."
      });
    }

    return errors;
  }

  function fieldErrorFromServerMessage(message: string): FieldError[] {
    if (/employee/i.test(message)) return [{ field: "employeeName", message }];
    return [];
  }

  function updateField<K extends keyof SeatInspectorForm>(field: K, value: SeatInspectorForm[K]) {
    if (field === "employeePosition" || field === "phoneExtension" || field === "department" || field === "status" || field === "notes") {
      clearFieldError(field);
    } else {
      setSaveFeedback(null);
    }
    setForm(current => ({ ...current, [field]: value }));
  }

  function findEmployeeByName(name: string) {
    const cleanName = name.trim().toLowerCase();
    if (!cleanName) return null;
    return sortedEmployees.find(employee => employee.full_name.trim().toLowerCase() === cleanName) ?? null;
  }

  function selectEmployee(employee: Employee) {
    clearFieldError("employeeName");
    setForm(current => ({
      ...current,
      ...employeeAssignmentFields(employee)
    }));
    setEmployeeComboboxOpen(false);
    setActiveEmployeeIndex(0);
  }

  function handleEmployeeNameChange(event: ChangeEvent<HTMLInputElement>) {
    const employeeName = event.target.value;
    const matchedEmployee = findEmployeeByName(employeeName);
    clearFieldError("employeeName");
    setEmployeeComboboxOpen(true);
    setActiveEmployeeIndex(0);

    setForm(current => {
      const nextStatus: SeatStatus = employeeName.trim()
        ? "assigned"
        : current.status === "reserved" || current.status === "unavailable"
          ? current.status
          : "available";

      if (!matchedEmployee) {
        return {
          ...current,
          employeeId: "",
          employeeName,
          employeePosition: "",
          phoneExtension: "",
          status: nextStatus
        };
      }

      return {
        ...current,
        ...employeeAssignmentFields(matchedEmployee)
      };
    });
  }

  function handleEmployeeNameKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setEmployeeComboboxOpen(true);
      setActiveEmployeeIndex(current => Math.min(current + 1, Math.max(filteredEmployeeOptions.length - 1, 0)));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setEmployeeComboboxOpen(true);
      setActiveEmployeeIndex(current => Math.max(current - 1, 0));
      return;
    }

    if (event.key === "Enter" && employeeComboboxOpen && filteredEmployeeOptions[activeEmployeeIndex]) {
      event.preventDefault();
      selectEmployee(filteredEmployeeOptions[activeEmployeeIndex].employee);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setEmployeeComboboxOpen(false);
    }
  }

  function handleTextChange(
    field: keyof Omit<SeatInspectorForm, "status" | "employeeId" | "employeeName" | "zone" | "label">,
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) {
    updateField(field, event.target.value);
  }

  function handleDepartmentChange(event: ChangeEvent<HTMLSelectElement>) {
    updateField("department", event.target.value);
  }

  function handleStatusChange(event: ChangeEvent<HTMLSelectElement>) {
    updateField("status", event.target.value as SeatStatus);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const employeeName = form.employeeName.trim();
    const matchedEmployee = findEmployeeByName(employeeName);
    const employeeId = matchedEmployee?.id ?? (form.employeeId || null);
    const nextStatus: SeatStatus = employeeId || employeeName
      ? "assigned"
      : form.status === "reserved" || form.status === "unavailable"
        ? form.status
        : "available";

    const validationErrors = validateFormFields();
    if (validationErrors.length) {
      const message = "Fix the highlighted inspector fields before saving.";
      setFieldErrors(validationErrors);
      setLocalError(message);
      setSaveFeedback(null);
      onError(message);
      onSubmitBlocked?.();
      focusErrorSummary();
      return;
    }

    if (nextStatus === "assigned" && !employeeId && !employeeName) {
      const message = "Assigned seats require an employee name.";
      setLocalError(message);
      setFieldErrors([{ field: "employeeName", message }]);
      setSaveFeedback(null);
      onError(message);
      onSubmitBlocked?.();
      focusErrorSummary();
      return;
    }

    const beforeSnapshot = onBeforeSeatUpdate();

    runSeatAssignment(
      {
        seatId: selectedSeat.id,
        label: form.label,
        status: nextStatus,
        employeeId,
        employeeName: employeeName || null,
        employeePosition: form.employeePosition.trim() || null,
        phoneExtension: form.phoneExtension.trim() || null,
        department: form.department.trim() || null,
        zone: selectedSeat.zone ?? selectedSeat.department ?? null,
        notes: form.notes.trim() || null,
        expectedUpdatedAt: selectedSeat.updated_at
      },
      beforeSnapshot
    );
  }

  // Shared assignment runner so the initial save and the "Move them?" confirm reuse
  // one success/failure path. Expected failures arrive as data (not a thrown digest);
  // a double-booking conflict becomes an offer to move rather than an error banner.
  function runSeatAssignment(input: Parameters<typeof updateSeatAction>[0], beforeSnapshot: DraftSnapshot) {
    startTransition(async () => {
      try {
        setLocalError(null);
        setFieldErrors([]);
        setSaveFeedback(null);
        onError(null);
        const result = await updateSeatAction(input);
        if (!result.ok) {
          if (result.code === "STALE_DRAFT") {
            // Another admin changed this seat after we rendered it; the parent
            // reloads the draft and resets undo history.
            setEditingAssignment(false);
            onDirtyChange(false);
            onStaleDraft(result.message);
            return;
          }
          if (result.code === "EMPLOYEE_ALREADY_ASSIGNED") {
            // Not a field problem and not yet an error — offer to move the person.
            setMoveConflict({
              employeeName: input.employeeName?.trim() || "this employee",
              currentSeatLabel: result.currentSeatLabel,
              input,
              beforeSnapshot
            });
            return;
          }
          setLocalError(result.message);
          setFieldErrors(fieldErrorFromServerMessage(result.message));
          setSaveFeedback(null);
          onError(result.message);
          onSubmitBlocked?.();
          focusErrorSummary();
          return;
        }
        const updated = result.seat;
        const nextForm = formFromSeat(updated);
        activeSeatSnapshotRef.current = formSnapshot(nextForm);
        setForm(nextForm);
        setInitialForm(nextForm);
        setEditingAssignment(false);
        onDirtyChange(false);
        setSaveFeedback(input.forceMove ? `Moved to ${updated.label}` : "Saved to draft");
        onSeatUpdated(updated, beforeSnapshot);
        focusPrimaryActionSoon();
      } catch (error) {
        // Only genuinely unexpected failures (network/auth) reach here now.
        const message = error instanceof Error ? error.message : "Could not update assignment.";
        const serverFieldErrors = fieldErrorFromServerMessage(message);
        setLocalError(message);
        setFieldErrors(serverFieldErrors);
        setSaveFeedback(null);
        onError(message);
        onSubmitBlocked?.();
        focusErrorSummary();
      }
    });
  }

  function confirmMoveEmployee() {
    if (!moveConflict || pending) return;
    const { input, beforeSnapshot } = moveConflict;
    setMoveConflict(null);
    // Re-run the exact same assignment; force_move vacates the old seat atomically.
    runSeatAssignment({ ...input, forceMove: true }, beforeSnapshot);
  }

  function handleResetEdits() {
    resetInspectorDraftForm(initialForm);
  }

  // After Cancel or a successful save the commit bar (and the button the
  // keyboard user just activated) unmounts — hand focus to the pinned
  // primary action that re-renders in its place (critique action 5).
  function focusPrimaryActionSoon() {
    window.requestAnimationFrame(() => primaryActionRef.current?.focus());
  }

  function handleCancelEditing() {
    if (isDirty) {
      resetInspectorDraftForm(initialForm);
      focusPrimaryActionSoon();
      return;
    }

    if (editingAssignment) {
      setEditingAssignment(false);
      focusPrimaryActionSoon();
      return;
    }

    onClose();
  }

  function startAssignmentEditing() {
    if (pending) return;
    setEditingAssignment(true);
    window.requestAnimationFrame(() => {
      // Scroll the whole form to the top of the panel before focusing: plain
      // input focus only scrolls "nearest", which at short viewports leaves
      // the input at the fold and drops the combobox list below it.
      assignmentSectionRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
      employeeInputRef.current?.focus({ preventScroll: true });
    });
  }

  function handleStartSwapSeat() {
    if (pending) return;
    onStartSwapSeat();
  }

  function handleStartMoveSeat() {
    if (pending) return;
    onStartMoveSeat();
  }

  function handleVacateSeat() {
    if (!hasCurrentAssignment || pending) return;
    // 3b T1: vacate is a draft-only seat op — it runs immediately with the
    // toast + Undo as the safety net (the publish review is the real gate).
    // The dialog only guards unsaved inspector edits, which Undo can't restore.
    if (isDirty) {
      setVacateConfirmOpen(true);
      return;
    }
    confirmVacateSeat();
  }

  function confirmVacateSeat() {
    if (!hasCurrentAssignment || pending) return;

    const beforeSnapshot = onBeforeSeatUpdate();
    setVacateConfirmOpen(false);

    startTransition(async () => {
      try {
        setLocalError(null);
        setFieldErrors([]);
        setSaveFeedback(null);
        onError(null);
        const result = await updateSeatAction({
          seatId: selectedSeat.id,
          label: selectedSeat.label,
          status: "available",
          employeeId: null,
          employeeName: null,
          employeePosition: null,
          department: null,
          zone: selectedSeat.zone ?? selectedSeat.department ?? null,
          notes: selectedSeat.notes?.trim() || null,
          expectedUpdatedAt: selectedSeat.updated_at
        });
        if (!result.ok) {
          if (result.code === "STALE_DRAFT") {
            onDirtyChange(false);
            onStaleDraft(result.message);
            return;
          }
          setLocalError(result.message);
          setSaveFeedback(null);
          onError(result.message);
          focusErrorSummary();
          return;
        }
        const updated = result.seat;
        const nextForm = formFromSeat(updated);
        activeSeatSnapshotRef.current = formSnapshot(nextForm);
        setForm(nextForm);
        setInitialForm(nextForm);
        onDirtyChange(false);
        setSaveFeedback("Saved to draft");
        onSeatUpdated(updated, beforeSnapshot);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not vacate seat.";
        setLocalError(message);
        setSaveFeedback(null);
        onError(message);
        focusErrorSummary();
      }
    });
  }

  function handleDeleteSeat() {
    if (!selectedSeatCanDelete || pending) return;
    onDeleteSeat();
  }

  const fieldClassName = "mt-1 w-full border border-white/20 bg-white/[0.06] px-3 py-2 text-sm font-medium text-[#f4f4f4] outline-none transition placeholder:text-[#8d8d8d] focus:border-[var(--admin-primary)] focus:ring-2 focus:ring-[color:var(--admin-primary-border)] disabled:bg-white/[0.03] disabled:text-[#8d8d8d]";
  const saveDisabledReason = pending
    ? "Save is unavailable while the current draft change is finishing."
    : !isDirty
      ? "No unsaved changes."
      : null;
  const deleteHelpText = selectedSeatCanDelete ? "Available custom draft seat can be deleted." : selectedSeatDeleteBlockReason ?? "Delete is unavailable for this seat.";
  // The commit bar is chrome, not content: it renders OUTSIDE the scroll area
  // whenever a save could be pending, so no collapse or scroll state can ever
  // hide Save/Cancel or the dirty indicator (2026-07-16 reorg). Visible saved
  // confirmation lives in the parent's toast; the sr-only region announces it.
  const showCommitBar = canEdit && (editingAssignment || isDirty || pending || Boolean(localError));

  if (collapsed && (swapMode || pillSuppressed)) return null;

  if (collapsed) {
    // Collapsed = the thin 44px dark rail on the right edge (spec §6); below
    // the panel tier it stays a bottom pill so it never covers the map.
    return (
      <aside className="fixed inset-x-3 bottom-3 z-[80] panel:inset-x-auto panel:bottom-0 panel:right-0 panel:top-10 panel:z-40">
        <button
          ref={collapseRailRef}
          type="button"
          onClick={() => {
            focusPanelAfterExpandRef.current = true;
            onToggleCollapse();
          }}
          aria-label={`View details for ${selectedSeat.label}`}
          title={`View details for ${selectedSeat.label}`}
          className="flex min-h-12 w-full items-center justify-center gap-2 border border-white/10 bg-[var(--admin-chrome-bg)] px-4 py-2 text-[#c6c6c6] shadow-elevation-3 transition hover:bg-[#1f1f1f] hover:text-white active:scale-[0.985] active:duration-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-primary)] panel:h-full panel:min-h-full panel:w-11 panel:flex-col panel:border-0 panel:border-l panel:border-white/10 panel:px-2 panel:py-4 panel:shadow-none"
        >
          <span className="text-[10px] font-medium tracking-[0.14em] panel:rotate-180 panel:[writing-mode:vertical-rl]">VIEW DETAILS</span>
          <span className="rounded-full bg-[var(--admin-primary-soft)] px-2 py-1 text-[10px] font-bold text-[var(--admin-primary)] ring-1 ring-[var(--admin-primary-border)] panel:mt-2 panel:rotate-180 panel:bg-transparent panel:px-0 panel:py-0 panel:font-mono panel:text-white/60 panel:ring-0 panel:[writing-mode:vertical-rl]">{selectedSeat.label}</span>
        </button>
      </aside>
    );
  }

  return (
    <>
    <aside
      id="seat-inspector-panel"
      tabIndex={-1}
      aria-label={canEdit ? "Selected draft seat inspector" : "Selected published seat details"}
      aria-labelledby="seat-inspector-title"
      className="fixed inset-x-3 bottom-3 z-[80] flex max-h-[60vh] flex-col overflow-hidden border border-white/10 bg-[var(--admin-chrome-bg)] text-[#f4f4f4] shadow-elevation-4 panel:inset-x-auto panel:bottom-0 panel:right-0 panel:top-10 panel:z-40 panel:max-h-none panel:w-[320px] panel:max-w-[calc(100vw-1.5rem)] panel:border-0 panel:border-l panel:border-white/10 panel:shadow-none"
    >
      <div className="sticky top-0 z-20 flex flex-col gap-2.5 border-b border-white/10 bg-[var(--admin-chrome-bg)] px-4 pb-3 pt-3.5">
        <div className="flex items-start gap-2.5">
          <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,#F15A24,#8a3a1a)] text-[11px] font-bold text-white">
            {occupantInitials}
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="seat-inspector-title" className="truncate text-[15.5px] font-semibold leading-6 text-white">
              {formatDisplayName(assignmentIdentityLabel) || "Open seat"}
            </h2>
            <div className="truncate text-[12px] leading-4 text-[var(--admin-chrome-muted)]">{occupantRoleLabel}</div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => {
                focusRailAfterCollapseRef.current = true;
                onToggleCollapse();
              }}
              aria-label={`Back to map from ${selectedSeat.label} details`}
              title="Back to map"
              className="inline-flex h-7 items-center justify-center border border-white/15 px-2.5 text-[11px] font-medium text-[#c6c6c6] transition hover:bg-[#262626] hover:text-white active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-primary)] panel:hidden"
            >
              Back to map
            </button>
            <button type="button" onClick={() => { focusRailAfterCollapseRef.current = true; onToggleCollapse(); }} aria-label="Collapse inspector" title="Collapse inspector" className="hidden h-7 w-7 items-center justify-center text-[#9a9a9a] transition hover:bg-[#262626] hover:text-white active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-primary)] panel:inline-flex"><CollapseIcon /></button>
            <button type="button" onClick={onClose} aria-label="Close inspector" title="Close" className="flex h-7 w-7 items-center justify-center text-[#9a9a9a] transition hover:bg-[#262626] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-primary)]"><CloseIcon /></button>
          </div>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-[#e0e0e0] ring-1 ring-white/15">
            <span aria-hidden="true" className={["h-2 w-2 rounded-full", headerStatusDotClass].join(" ")} />
            {currentStatusLabel}
          </span>
          <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 font-mono text-[11px] font-medium text-[#e0e0e0] ring-1 ring-white/15">{selectedSeat.label}</span>
          {!canEdit && (
            <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-[var(--admin-chrome-muted)] ring-1 ring-white/15">Published seat</span>
          )}
        </div>
      </div>

      {canEdit ? (
        <form id="seat-inspector-form" onSubmit={handleSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {/* Save-state announcements sit outside the collapsible sections:
                content inside a closed <details> is display:none and never read. */}
            <div role="status" aria-live="polite" className="sr-only">
              {inspectorStateLabel}
            </div>
            {searchMismatchNotice && (
              <section className={["mx-4 mt-3 border p-3 text-xs", warningSurfaceClassName].join(" ")}>
                <div className="font-semibold">{searchMismatchNotice}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="bg-white/10 px-3 py-1.5 font-semibold text-[#f1c21b] ring-1 ring-[#f1c21b]/40 transition hover:bg-white/15 active:scale-[0.97] active:duration-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f1c21b]"
                  >
                    Clear selection
                  </button>
                  {onClearSearchContext && (
                    <button
                      type="button"
                      onClick={onClearSearchContext}
                      className="bg-white/10 px-3 py-1.5 font-semibold text-[#f1c21b] ring-1 ring-[#f1c21b]/40 transition hover:bg-white/15 active:scale-[0.97] active:duration-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f1c21b]"
                    >
                      {searchMismatchClearLabel}
                    </button>
                  )}
                </div>
              </section>
            )}

            {localError && (
              <section
                ref={errorSummaryRef}
                tabIndex={-1}
                role="alert"
                aria-labelledby="seat-inspector-error-title"
                className="mx-4 mt-3 border border-[#da1e28]/40 bg-[#da1e28]/10 p-3 text-xs text-[#ff8389] outline-none focus-visible:ring-2 focus-visible:ring-[#da1e28]"
              >
                <h3 id="seat-inspector-error-title" className="font-bold text-[#ff8389]">Review inspector fields</h3>
                <p className="mt-1 font-medium leading-5">{localError}</p>
                {fieldErrors.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {fieldErrors.map(error => (
                      <li key={`${error.field}-${error.message}`}>
                        <button
                          type="button"
                          onClick={() => focusInspectorField(error.field)}
                          className="text-left font-bold underline decoration-[#da1e28]/60 underline-offset-2 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#da1e28]"
                        >
                          {error.message}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {/* Primary assignment action — pinned above the fact sections so
                the most likely task for THIS seat can never be scrolled away
                or collapsed (2026-07-16 reorg). The editor opens here, directly
                under the identity it edits; Save/Cancel live in the commit bar. */}
            <div className="border-b border-white/10 px-4 pb-3 pt-3">
              {!editingAssignment && !hasCurrentAssignment && (
                <Button
                  type="button"
                  variant="primary"
                  onClick={startAssignmentEditing}
                  disabled={pending}
                  aria-expanded={editingAssignment}
                  aria-controls="seat-inspector-form"
                  ref={primaryActionRef}
                  aria-label={`Assign an employee to ${selectedSeat.label}`}
                  className="min-w-0 w-full rounded-[10px] !border-[var(--admin-primary-cta)] !bg-[var(--admin-primary-cta)] !text-white hover:!border-[var(--admin-primary-cta-hover)] hover:!bg-[var(--admin-primary-cta-hover)]"
                >
                  Assign employee
                </Button>
              )}
              {!editingAssignment && hasCurrentAssignment && (
                <Button
                  type="button"
                  onClick={startAssignmentEditing}
                  disabled={pending}
                  aria-expanded={editingAssignment}
                  aria-controls="seat-inspector-form"
                  ref={primaryActionRef}
                  aria-label={`Change assignment for ${selectedSeat.label}`}
                  className={`min-w-0 w-full rounded-[10px] ${footerNeutralButtonClass}`}
                >
                  Change assignment
                </Button>
              )}
              {editingAssignment && (
              <section ref={assignmentSectionRef} aria-labelledby="seat-assignment-heading">
              <SectionHeading id="seat-assignment-heading" title={hasCurrentAssignment ? "Assignment" : "Assign this seat"} />
              <p id={employeeHelpId} className="mt-1.5 text-xs leading-5 text-[var(--admin-chrome-muted)]">{hasCurrentAssignment ? "Change or clear the draft assignment below." : "Search an existing employee or type a new name."}</p>

              <label className="mt-3 block">
                <span className="text-[12px] font-medium tracking-normal text-[var(--admin-chrome-muted)]">Employee name</span>
                <div className="relative">
                  <input
                    ref={employeeInputRef}
                    value={form.employeeName}
                    onChange={handleEmployeeNameChange}
                    onFocus={() => setEmployeeComboboxOpen(true)}
                    onBlur={() => window.setTimeout(() => setEmployeeComboboxOpen(false), 120)}
                    onKeyDown={handleEmployeeNameKeyDown}
                    placeholder="Search or enter employee name"
                    role="combobox"
                    aria-expanded={employeeComboboxOpen}
                    aria-controls="seat-inspector-employee-listbox"
                    aria-autocomplete="list"
                    aria-activedescendant={employeeComboboxOpen && filteredEmployeeOptions[activeEmployeeIndex] ? `seat-inspector-employee-option-${filteredEmployeeOptions[activeEmployeeIndex].employee.id}` : undefined}
                    aria-invalid={Boolean(fieldErrorMap.employeeName)}
                    aria-describedby={employeeNameDescribedBy}
                    className={`${fieldClassName} pr-10 ${fieldErrorMap.employeeName ? fieldErrorClassName : ""}`}
                  />
                  <button
                    type="button"
                    aria-label="Show employee options"
                    title="Show employee options"
                    onMouseDown={event => event.preventDefault()}
                    onClick={() => {
                      setEmployeeComboboxOpen(current => !current);
                      employeeInputRef.current?.focus();
                    }}
                    className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center text-xs text-[var(--admin-chrome-muted)] transition hover:bg-white/10 hover:text-white active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-primary)]"
                  >
                    <ChevronDownIcon />
                  </button>
                  {employeeComboboxOpen && (
                    <div
                      id="seat-inspector-employee-listbox"
                      role="listbox"
                      className="absolute z-50 mt-1 max-h-[min(16rem,40vh)] w-full overflow-auto border border-white/15 bg-[#262626] p-1 shadow-elevation-3"
                    >
                      {filteredEmployeeOptions.length > 0 ? filteredEmployeeOptions.map((option, index) => (
                        <button
                          key={option.employee.id}
                          id={`seat-inspector-employee-option-${option.employee.id}`}
                          type="button"
                          role="option"
                          aria-selected={form.employeeId === option.employee.id}
                          onMouseDown={event => event.preventDefault()}
                          onMouseEnter={() => setActiveEmployeeIndex(index)}
                          onClick={() => selectEmployee(option.employee)}
                          className={[
                            "flex w-full items-start gap-3 px-3 py-2 text-left transition active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-primary)]",
                            index === activeEmployeeIndex ? "bg-white/10 text-white" : "text-[#d4d4d4] hover:bg-white/5"
                          ].join(" ")}
                        >
                          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-bold text-[var(--admin-primary-cta)]">
                            {buildInitials(option.employee.full_name) || "?"}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">{formatDisplayName(option.employee.full_name)}</span>
                            <span className="block truncate text-xs text-[var(--admin-chrome-muted)]">{option.meta}</span>
                          </span>
                          <span className="shrink-0 rounded-full bg-white/10 px-2 py-1 font-mono text-[10px] font-semibold tracking-normal text-[#c6c6c6] ring-1 ring-white/15">
                            {option.assignedSeatLabel}
                          </span>
                        </button>
                      )) : (
                        <div className={["border border-dashed p-3 text-xs leading-5", warningSurfaceClassName].join(" ")}>
                          <div className="font-bold">No existing employee match</div>
                          <div>Saving will create a new employee record if you keep this name.</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {fieldErrorMap.employeeName && (
                  <p id={fieldErrorId("employeeName")} className="mt-1 text-xs font-semibold text-[#ff8389]">{fieldErrorMap.employeeName}</p>
                )}
                <span id={employeeStateId} className={["mt-1 inline-flex rounded-full px-2 py-1 text-[10px] font-semibold tracking-normal ring-1", employeeNameValue ? matchedEmployee ? successPillClassName : "bg-[var(--admin-state-dirty-bg)] text-[var(--admin-state-dirty-text)] ring-[var(--admin-state-dirty-border)]" : neutralPillClassName].join(" ")}>
                  {assignmentStateText}
                </span>
              </label>

              {showNewEmployeeNotice && (
                <div id="seat-inspector-new-employee-notice" role="note" className={["mt-2 border p-3 text-xs leading-5", warningSurfaceClassName].join(" ")}>
                  <div className="font-bold">No existing employee match</div>
                  <p className="mt-1 font-medium">
                    Saving will create a new employee record named <span className="font-bold">{employeeNameValue}</span> and assign this draft seat. Viewers see it only after publish.
                  </p>
                </div>
              )}

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-[12px] font-medium tracking-normal text-[var(--admin-chrome-muted)]">Job Title</span>
                  <input
                    ref={employeePositionRef}
                    value={form.employeePosition}
                    onChange={event => handleTextChange("employeePosition", event)}
                    placeholder="Optional"
                    aria-invalid={Boolean(fieldErrorMap.employeePosition)}
                    aria-describedby={fieldDescribedBy("employeePosition")}
                    className={fieldClassName}
                  />
                  {fieldErrorMap.employeePosition && <p id={fieldErrorId("employeePosition")} className="mt-1 text-xs font-semibold text-[#ff8389]">{fieldErrorMap.employeePosition}</p>}
                </label>

                <label className="block">
                  <span className="text-[12px] font-medium tracking-normal text-[var(--admin-chrome-muted)]">Phone Ext.</span>
                  <input
                    ref={phoneExtensionRef}
                    value={form.phoneExtension}
                    onChange={event => handleTextChange("phoneExtension", event)}
                    placeholder="Optional"
                    className={fieldClassName}
                    inputMode="numeric"
                    aria-invalid={Boolean(fieldErrorMap.phoneExtension)}
                    aria-describedby={fieldDescribedBy("phoneExtension")}
                  />
                  {fieldErrorMap.phoneExtension && <p id={fieldErrorId("phoneExtension")} className="mt-1 text-xs font-semibold text-[#ff8389]">{fieldErrorMap.phoneExtension}</p>}
                </label>
              </div>

              <label className="mt-3 block">
                <span className="text-[12px] font-medium tracking-normal text-[var(--admin-chrome-muted)]">Department</span>
                <select
                  ref={departmentRef}
                  value={form.department}
                  onChange={handleDepartmentChange}
                  aria-invalid={Boolean(fieldErrorMap.department)}
                  aria-describedby={fieldDescribedBy("department")}
                  className={fieldClassName}
                >
                  <option value="">No department</option>
                  {departments.map(department => (
                    <option key={department} value={department}>{department}</option>
                  ))}
                </select>
                {fieldErrorMap.department && <p id={fieldErrorId("department")} className="mt-1 text-xs font-semibold text-[#ff8389]">{fieldErrorMap.department}</p>}
              </label>
              </section>
              )}
            </div>

            <div key={`seat-inspector-sections-${selectedSeat.id}`}>
              {hasCurrentAssignment && (
              <InspectorSection title="Occupant" headingId="seat-occupant-heading" defaultOpen>
                <OccupantFacts
                  canEdit
                  rows={buildOccupantRows({
                    department: form.department.trim() || selectedSeat.employee?.department,
                    email: (matchedEmployee ?? selectedSeat.employee)?.email,
                    extension: form.phoneExtension
                  })}
                />
              </InspectorSection>
              )}

            <InspectorSection title="Seat" headingId="seat-details-heading" defaultOpen>
              <dl>
                <FactRow label="Code" value={selectedSeat.label} />
                <FactRow label="Zone" value={currentZone} mono={false} />
                <FactRow label="Seat type" value={seatTypeLabel} mono={false} />
                {hasAssignedPerson && (
                  <div className="flex items-center justify-between gap-2.5 py-1.5">
                    <dt className="shrink-0 text-[12.5px] text-[var(--admin-chrome-muted)]">Status</dt>
                    <dd><span className={["inline-block px-2 py-0.5 text-[10px] font-semibold", statusTagClass].join(" ")}>{currentStatusLabel}</span></dd>
                  </div>
                )}
              </dl>
              {/* Status has ONE home (spec §6). Occupied seats derive "assigned"
                  from the occupant, so the dropdown only offers the open-seat
                  statuses and yields to a read-only tag while someone sits here. */}
              {!hasAssignedPerson && (
                <label className="mt-1 block">
                  <span className="text-[12px] font-medium tracking-normal text-[var(--admin-chrome-muted)]">Status</span>
                  <select
                    ref={statusRef}
                    value={effectiveStatus}
                    onChange={handleStatusChange}
                    aria-invalid={Boolean(fieldErrorMap.status)}
                    aria-describedby={fieldDescribedBy("status")}
                    className={fieldClassName}
                  >
                    <option value="available">{STATUS_LABELS.available}</option>
                    <option value="reserved">{STATUS_LABELS.reserved}</option>
                    <option value="unavailable">{STATUS_LABELS.unavailable}</option>
                  </select>
                  {fieldErrorMap.status && <p id={fieldErrorId("status")} className="mt-1 text-xs font-semibold text-[#ff8389]">{fieldErrorMap.status}</p>}
                </label>
              )}
            </InspectorSection>

            <InspectorSection title="Notes" headingId="seat-notes-heading">
              <label className="block">
                <span className="sr-only">Seat note</span>
                <textarea
                  ref={notesRef}
                  value={form.notes}
                  onChange={event => handleTextChange("notes", event)}
                  placeholder="Add a seat note"
                  aria-invalid={Boolean(fieldErrorMap.notes)}
                  aria-describedby={fieldDescribedBy("notes")}
                  className={`${fieldClassName} min-h-20`}
                />
                {fieldErrorMap.notes && <p id={fieldErrorId("notes")} className="mt-1 text-xs font-semibold text-[#ff8389]">{fieldErrorMap.notes}</p>}
              </label>
            </InspectorSection>

            <InspectorSection title="Activity" headingId="seat-activity-heading">
              {activityEntries.length > 0 ? (
                <ul>
                  {activityEntries.map((entry, index) => (
                    <li key={`${entry}-${index}`} className="border-b border-white/5 py-1.5 text-[12px] leading-4 text-[var(--admin-chrome-muted)] last:border-b-0">
                      <span className="font-medium text-[#d4d4d4]">{entry}</span>
                      <span className="ml-1.5">· this session</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[12px] leading-4 text-[var(--admin-chrome-muted)]">No draft edits to this seat in this session. Saved changes appear here until publish.</p>
              )}
            </InspectorSection>
            </div>

            {/* Seat actions — static end-of-panel group (owner call 2026-07-16:
                seat operations read last, like a record card). Never collapsible,
                so Move/Swap/Vacate can't vanish the way the old Actions section
                could. Move stays for open seats too — it is the only way to
                reposition a (custom) seat marker on the map. */}
            <div role="group" aria-labelledby="seat-actions-heading" className="px-4 pb-4 pt-3">
              <div className="flex items-center gap-2">
                <h3 id="seat-actions-heading" className="shrink-0 text-[12px] font-semibold text-[#e4e4e4]">Seat actions</h3>
                <span aria-hidden="true" className="h-px min-w-4 flex-1 bg-white/10" />
              </div>
              <div className="mt-2.5 flex min-w-0 gap-2">
                <Button type="button" onClick={handleStartMoveSeat} disabled={pending} aria-pressed={moveMode} aria-label={moveMode ? `Exit move mode for ${selectedSeat.label}` : `Move seat ${selectedSeat.label} on the map`} className={`min-w-0 flex-1 rounded-[10px] ${footerNeutralButtonClass}`}>
                  {moveMode ? "Exit move" : "Move"}
                </Button>
                <Button type="button" onClick={handleStartSwapSeat} disabled={pending} aria-label={`Swap seat ${selectedSeat.label} with another draft seat`} className={`min-w-0 flex-1 rounded-[10px] ${footerNeutralButtonClass}`}>
                  Swap
                </Button>
                {hasCurrentAssignment && (
                  <Button type="button" onClick={handleVacateSeat} disabled={pending} aria-label={`Vacate ${selectedSeat.label}`} className={`min-w-0 flex-1 rounded-[10px] ${footerDangerButtonClass}`}>
                    Vacate
                  </Button>
                )}
              </div>
              {/* 3b INV-4: move-mode microcopy lives in the occupant (the inspector). */}
              {moveMode && (
                /* Neutral guidance, not an alert: the danger register is
                   reserved for destructive actions (2026-07-16 critique,
                   minor 7). Block style mirrors the Ask Planner drawer's
                   dark-surface info card. */
                <p role="status" className="mt-2 border border-[var(--admin-chrome-border)] bg-[var(--admin-chrome-field)] px-3 py-2 text-[12px] font-medium leading-4 text-[#c6c6c6]">
                  Drag the seat marker to its new spot. Esc exits move.
                </p>
              )}
              {canResetPosition && (
                <Button
                  type="button"
                  onClick={onResetPosition}
                  disabled={pending}
                  aria-label={`Reset ${selectedSeat.label} to its published position`}
                  title="Move this seat marker back to where it sits on the published map"
                  className={`mt-2 min-w-0 w-full whitespace-normal rounded-[10px] leading-tight ${footerNeutralButtonClass}`}
                >
                  Reset position to published
                </Button>
              )}
              {/* Figma delete treatment: full-width low-emphasis button + visible
                  helper line. Rendered only for custom draft seats — protected
                  originals can never be deleted, so they carry no dead button;
                  the Seat type fact explains their protection instead. */}
              {selectedSeat.is_custom && (
                <>
                  <Button
                    type="button"
                    onClick={handleDeleteSeat}
                    disabled={pending || !selectedSeatCanDelete}
                    aria-label={`Delete custom seat ${selectedSeat.label}`}
                    aria-describedby="seat-inspector-delete-help"
                    title={deleteHelpText}
                    className="mt-2 min-w-0 w-full whitespace-normal rounded-[10px] leading-tight !border-transparent !bg-[#262626] !text-[#ff8389] !shadow-none hover:!border-transparent hover:!bg-[#da1e28]/20 disabled:!border-transparent disabled:!bg-[#1f1f1f] disabled:!text-[#8d8d8d] disabled:hover:!bg-[#1f1f1f]"
                  >
                    Delete seat
                  </Button>
                  <p id="seat-inspector-delete-help" className="mt-1.5 text-[12px] leading-4 text-[var(--admin-chrome-muted)]">{deleteHelpText}</p>
                </>
              )}
              {onExplainSeat && (
                <button
                  type="button"
                  onClick={() => onExplainSeat(selectedSeat)}
                  aria-label={`Ask Planner about ${selectedSeat.label}`}
                  title={`Ask Planner about ${selectedSeat.label}`}
                  className="mt-2 flex w-full cursor-pointer items-center justify-between gap-3 border border-white/15 bg-white/[0.06] px-3 py-2 text-left text-xs font-semibold text-[#d4d4d4] transition hover:bg-white/[0.10] hover:text-white active:scale-[0.985] active:duration-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-primary)]"
                >
                  <span>Ask Planner about this seat</span>
                  <span aria-hidden="true" className="shrink-0 leading-none"><ChevronRightIcon /></span>
                </button>
              )}
            </div>
          </div>

          {showCommitBar && (
            <div id="seat-inspector-commit-bar" className="border-t border-white/10 bg-[#1c1c1c] px-4 py-3">
              {/* Draft-impact pill (announced via the sr-only live region at the top of the form). */}
              <div aria-hidden="true" className={["flex items-center gap-2 px-3 py-2 text-xs font-medium", inspectorStatePillClassName].join(" ")}>
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
                <span className="min-w-0 truncate">{inspectorStateLabel}</span>
              </div>
              <div className="mt-2 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[minmax(6.5rem,0.8fr)_minmax(0,1.5fr)]">
                {saveDisabledReason && (
                  <span id="seat-inspector-save-help" className="sr-only">
                    {saveDisabledReason}
                  </span>
                )}
                <Button type="button" onClick={handleCancelEditing} aria-label={`Cancel editing ${selectedSeat.label}`} className={`min-w-0 rounded-[10px] px-4 ${footerNeutralButtonClass}`}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={pending || !isDirty}
                  aria-label={`${primaryActionLabel} for ${selectedSeat.label}`}
                  aria-describedby={saveDisabledReason ? "seat-inspector-save-help" : undefined}
                  title={saveDisabledReason ?? `${primaryActionLabel} for ${selectedSeat.label}`}
                  className="min-w-0 w-full whitespace-normal rounded-[10px] !border-[var(--admin-primary-cta)] !bg-[var(--admin-primary-cta)] !text-white hover:!border-[var(--admin-primary-cta-hover)] hover:!bg-[var(--admin-primary-cta-hover)] disabled:!border-[var(--admin-state-neutral-border)] disabled:!bg-[var(--admin-state-neutral-bg)] disabled:!text-[var(--admin-text-subtle)] disabled:shadow-none disabled:hover:!border-[var(--admin-state-neutral-border)] disabled:hover:!bg-[var(--admin-state-neutral-bg)]"
                >
                  {primaryActionLabel}
                </Button>
              </div>
            </div>
          )}
        </form>
      ) : (
        // Viewer inspector (spec §7): Occupant + Seat only — no Actions, Notes,
        // or Activity. The data is the published assignment snapshot.
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div key={`seat-inspector-sections-${selectedSeat.id}`}>
            {hasCurrentAssignment && (
            <InspectorSection title="Occupant" headingId="published-assignment-heading" defaultOpen>
              <p className="sr-only">Published assignment</p>
              <OccupantFacts
                canEdit={false}
                rows={buildOccupantRows({
                  department: selectedSeat.employee?.department,
                  email: selectedSeat.employee?.email,
                  extension: selectedSeat.employee?.phone_extension
                })}
              />
            </InspectorSection>
            )}
            <InspectorSection title="Seat" headingId="published-details-heading" defaultOpen>
              <dl>
                <FactRow label="Code" value={selectedSeat.label} />
                <FactRow label="Zone" value={currentZone} mono={false} />
                <div className="flex items-center justify-between gap-2.5 py-1.5">
                  <dt className="shrink-0 text-[12.5px] text-[var(--admin-chrome-muted)]">Status</dt>
                  <dd><span className={["inline-block px-2 py-0.5 text-[10px] font-semibold", statusTagClass].join(" ")}>{currentStatusLabel}</span></dd>
                </div>
              </dl>
            </InspectorSection>
          </div>
        </div>
      )}
    </aside>

    {vacateConfirmOpen && (
      <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[var(--sp-color-workspace-deep)]/45 p-3 backdrop-blur-[2px] sm:z-[70] sm:items-center">
        <section
          ref={vacateDialogFocusRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="vacate-seat-confirm-title"
          aria-describedby="vacate-seat-confirm-description"
          onKeyDown={event => {
            if (event.key === "Escape") {
              event.stopPropagation();
              setVacateConfirmOpen(false);
            }
          }}
          className="w-full max-w-md rounded-2xl border border-[var(--sp-color-border-subtle)] bg-[var(--sp-color-surface)]/95 p-4 text-[var(--sp-color-text-primary)] shadow-[0_26px_80px_rgba(23,26,29,0.32)] backdrop-blur-2xl"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="vacate-seat-confirm-title" className="text-base font-black">Vacate {selectedSeat.label}?</h2>
              <p id="vacate-seat-confirm-description" className="mt-1 text-sm leading-5 text-[var(--sp-color-text-muted)]">
                This clears {formatDisplayName(selectedSeatEmployeeName)} from this draft seat.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setVacateConfirmOpen(false)}
              className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-black text-[var(--sp-color-text-muted)] transition hover:bg-[var(--sp-color-graphite-soft)] hover:text-[var(--sp-color-text-secondary)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus-ring-color)]"
              aria-label="Cancel vacating seat"
            >
              <CloseIcon />
            </button>
          </div>

          <div className="mt-4 grid gap-2">
            {isDirty && (
              <div className="rounded-xl border border-[var(--admin-state-dirty-border)] bg-[var(--admin-state-dirty-bg)] p-3 text-sm font-semibold leading-5 text-[var(--admin-state-dirty-text)]">
                Any unsaved inspector edits will be discarded.
              </div>
            )}
            <div className="rounded-xl border border-[var(--admin-publish-viewer-impact-border)] bg-[var(--admin-publish-viewer-impact-bg)] p-3 text-sm font-semibold leading-5 text-[var(--admin-publish-viewer-impact-text)]">
              The published viewer map will not change until the draft is published.
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button type="button" onClick={() => setVacateConfirmOpen(false)} disabled={pending} className="w-full">
              Cancel
            </Button>
            <Button type="button" variant="danger" onClick={confirmVacateSeat} disabled={pending} className={`w-full ${adminDangerButtonClassName}`}>
              Vacate seat
            </Button>
          </div>
        </section>
      </div>
    )}

    {moveConflict && (
      <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[var(--sp-color-workspace-deep)]/45 p-3 backdrop-blur-[2px] sm:z-[70] sm:items-center">
        <section
          ref={moveConflictDialogFocusRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="move-employee-confirm-title"
          aria-describedby="move-employee-confirm-description"
          onKeyDown={event => {
            if (event.key === "Escape") {
              event.stopPropagation();
              setMoveConflict(null);
            }
          }}
          className="w-full max-w-md rounded-2xl border border-[var(--sp-color-border-subtle)] bg-[var(--sp-color-surface)]/95 p-4 text-[var(--sp-color-text-primary)] shadow-[0_26px_80px_rgba(23,26,29,0.32)] backdrop-blur-2xl"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="move-employee-confirm-title" className="text-base font-black">Move {formatDisplayName(moveConflict.employeeName)} to {formatSeatCode(selectedSeat.label)}?</h2>
              <p id="move-employee-confirm-description" className="mt-1 text-sm leading-5 text-[var(--sp-color-text-muted)]">
                They currently sit at {moveConflict.currentSeatLabel}. Moving frees {moveConflict.currentSeatLabel} (it becomes Open).
              </p>
            </div>
            <button
              type="button"
              onClick={() => setMoveConflict(null)}
              className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-black text-[var(--sp-color-text-muted)] transition hover:bg-[var(--sp-color-graphite-soft)] hover:text-[var(--sp-color-text-secondary)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus-ring-color)]"
              aria-label="Cancel moving employee"
            >
              <CloseIcon />
            </button>
          </div>

          <div className="mt-4 grid gap-2">
            <div className="rounded-xl border border-[var(--admin-publish-viewer-impact-border)] bg-[var(--admin-publish-viewer-impact-bg)] p-3 text-sm font-semibold leading-5 text-[var(--admin-publish-viewer-impact-text)]">
              Viewers won&apos;t see this until you publish the draft.
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button type="button" onClick={() => setMoveConflict(null)} disabled={pending} className="w-full">
              Cancel
            </Button>
            <Button type="button" variant="primary" onClick={confirmMoveEmployee} disabled={pending} className="w-full">
              Move them
            </Button>
          </div>
        </section>
      </div>
    )}
    </>
  );
}
