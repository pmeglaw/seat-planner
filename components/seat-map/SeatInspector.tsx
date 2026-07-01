"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { ChangeEvent, FormEvent, KeyboardEvent } from "react";
import type { DraftSnapshot } from "@/lib/draftHistory";
import type { DepartmentOption, Employee, SeatStatus, SeatWithEmployee } from "@/lib/types";
import { updateSeatAction } from "@/app/actions";
import { canDeleteSeat, getSeatDeleteBlockReason, isProtectedOriginalSeatLabel } from "@/lib/seatProtection";
import { Button } from "@/components/ui/Button";

type SeatInspectorProps = {
  seat: SeatWithEmployee | null;
  seats: SeatWithEmployee[];
  employees: Employee[];
  departmentOptions: DepartmentOption[];
  canEdit: boolean;
  collapsed: boolean;
  swapMode: boolean;
  searchMismatchNotice?: string | null;
  searchMismatchClearLabel?: string;
  onClose: () => void;
  onClearSearchContext?: () => void;
  onToggleCollapse: () => void;
  onStartSwapSeat: () => void;
  onDeleteSeat: () => void;
  onExplainSeat?: (seat: SeatWithEmployee) => void;
  onBeforeSeatUpdate: () => DraftSnapshot;
  onSeatUpdated: (seat: SeatWithEmployee, beforeSnapshot: DraftSnapshot) => void;
  onError: (message: string | null) => void;
  onDirtyChange: (dirty: boolean) => void;
  onSubmitBlocked?: () => void;
  resetSignal: number;
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

function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4">
      <path d="m5.5 5.5 9 9m0-9-9 9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
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

export function SeatInspector({
  seat,
  seats,
  employees,
  departmentOptions,
  canEdit,
  collapsed,
  swapMode,
  searchMismatchNotice = null,
  searchMismatchClearLabel = "Clear search",
  onClose,
  onClearSearchContext,
  onToggleCollapse,
  onStartSwapSeat,
  onDeleteSeat,
  onExplainSeat,
  onBeforeSeatUpdate,
  onSeatUpdated,
  onError,
  onDirtyChange,
  onSubmitBlocked,
  resetSignal
}: SeatInspectorProps) {
  const [pending, startTransition] = useTransition();
  const [localError, setLocalError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [form, setForm] = useState<SeatInspectorForm>(emptyForm);
  const [initialForm, setInitialForm] = useState<SeatInspectorForm>(emptyForm);
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
  const currentStatusLabel = effectiveStatus[0].toUpperCase() + effectiveStatus.slice(1);
  const headerStatusBadgeClass = effectiveStatus === "assigned"
    ? "bg-[var(--admin-state-clean-bg)] text-[var(--admin-state-clean-text)] ring-[var(--admin-state-clean-border)]"
    : effectiveStatus === "reserved"
      ? "bg-[var(--admin-state-dirty-bg)] text-[var(--admin-state-dirty-text)] ring-[var(--admin-state-dirty-border)]"
      : "bg-[var(--admin-state-neutral-bg)] text-[var(--admin-state-neutral-text)] ring-[var(--admin-state-neutral-border)]";
  const seatTypeLabel = isProtectedOriginalSeatLabel(selectedSeat.label)
    ? "Protected original"
    : selectedSeat.is_custom
      ? "Custom draft"
      : "Original";
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
  const assignmentIdentityLabel = employeeNameValue || (hasCurrentAssignment ? selectedSeatEmployeeName : "");
  const fieldErrorClassName = "border-[var(--admin-state-error-border)] focus:border-[var(--admin-error)] focus:ring-[var(--admin-state-error-border)]";
  const warningSurfaceClassName = "border-[var(--admin-state-dirty-border)] bg-[var(--admin-state-dirty-bg)] text-[var(--admin-state-dirty-text)]";
  const neutralPillClassName = "bg-[var(--admin-state-neutral-bg)] text-[var(--admin-state-neutral-text)] ring-[var(--admin-state-neutral-border)]";
  const successPillClassName = "bg-[var(--admin-state-clean-bg)] text-[var(--admin-state-clean-text)] ring-[var(--admin-state-clean-border)]";

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
    target.current?.focus();
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
      employeeId: employee.id,
      employeeName: employee.full_name,
      employeePosition: employee.position ?? "",
      phoneExtension: employee.phone_extension ?? "",
      department: employee.department ?? current.department,
      status: "assigned"
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
        employeeId: matchedEmployee.id,
        employeeName: matchedEmployee.full_name,
        employeePosition: matchedEmployee.position ?? "",
        phoneExtension: matchedEmployee.phone_extension ?? "",
        department: matchedEmployee.department ?? current.department,
        status: "assigned"
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
        notes: form.notes.trim() || null
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
        onDirtyChange(false);
        setSaveFeedback(input.forceMove ? `Moved to ${updated.label}` : "Saved to draft");
        onSeatUpdated(updated, beforeSnapshot);
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

  function handleCancelEditing() {
    if (isDirty) {
      resetInspectorDraftForm(initialForm);
      return;
    }

    onClose();
  }

  function handleStartSwapSeat() {
    if (pending) return;
    onStartSwapSeat();
  }

  function handleVacateSeat() {
    if (!hasCurrentAssignment || pending) return;
    setVacateConfirmOpen(true);
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
          notes: selectedSeat.notes?.trim() || null
        });
        if (!result.ok) {
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

  const fieldClassName = "mt-1 w-full rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 py-2 text-sm font-semibold text-[var(--admin-text-primary)] outline-none transition placeholder:text-[var(--admin-text-subtle)] focus:border-[var(--admin-primary)] focus:ring-4 focus:ring-[color:var(--sp-focus-ring-color)] disabled:bg-[var(--admin-state-neutral-bg)] disabled:text-[var(--admin-text-muted)]";
  const saveDisabledReason = pending
    ? "Save is unavailable while the current draft change is finishing."
    : !isDirty
      ? "No unsaved changes."
      : null;
  const deleteHelpText = selectedSeatCanDelete ? "Available custom draft seat can be deleted." : selectedSeatDeleteBlockReason ?? "Delete is unavailable for this seat.";
  const secondaryActionGridClassName = "grid-cols-1 sm:grid-cols-2";

  if (collapsed && swapMode) return null;

  if (collapsed) {
    return (
      <aside className="fixed inset-x-3 bottom-3 z-[80] sm:inset-x-auto sm:bottom-3 sm:right-3 sm:top-[84px] sm:z-40 lg:top-[148px]">
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={`View details for ${selectedSeat.label}`}
          title={`View details for ${selectedSeat.label}`}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-[var(--sp-color-border-strong)] bg-[var(--sp-color-surface)]/95 px-4 py-2 text-[var(--sp-color-text-secondary)] shadow-[0_14px_34px_rgba(23,26,29,0.18),inset_0_1px_0_rgba(255,255,255,0.92)] backdrop-blur-xl transition hover:bg-white active:scale-[0.985] active:duration-75 active:shadow-inner focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus-ring-color)] sm:min-h-full sm:w-11 sm:flex-col sm:rounded-l-2xl sm:rounded-r-xl sm:px-2 sm:py-4 sm:shadow-[-8px_0_24px_rgba(23,26,29,0.16),inset_1px_0_0_rgba(255,255,255,0.86)]"
        >
          <span className="text-[11px] font-semibold tracking-[0.04em] sm:rotate-180 sm:[writing-mode:vertical-rl]">View details</span>
          <span className="rounded-full bg-[var(--admin-primary-soft)] px-2 py-1 text-[10px] font-black text-[var(--admin-primary-cta)] ring-1 ring-[var(--admin-primary-border)] sm:mt-2 sm:rotate-180 sm:bg-transparent sm:px-0 sm:py-0 sm:text-white/55 sm:ring-0 sm:[writing-mode:vertical-rl]">{selectedSeat.label}</span>
        </button>
      </aside>
    );
  }

  return (
    <>
    <aside
      aria-label={canEdit ? "Selected draft seat inspector" : "Selected published seat details"}
      aria-labelledby="seat-inspector-title"
      className="fixed inset-x-3 bottom-3 z-[80] flex max-h-[54vh] flex-col overflow-hidden rounded-[14px] border border-[var(--sp-color-border-subtle)] bg-[var(--sp-color-surface)] shadow-[0_18px_44px_rgba(31,34,37,0.16)] sm:inset-x-auto sm:bottom-3 sm:right-3 sm:top-[84px] sm:z-40 sm:max-h-none sm:w-[360px] sm:max-w-[calc(100vw-1.5rem)] sm:rounded-[14px] xl:w-[384px] lg:top-[148px]"
    >
      <div className="sticky top-0 z-20 flex flex-col gap-2.5 border-b border-[var(--sp-color-border-subtle)] bg-[var(--sp-color-surface)] px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-medium text-[var(--sp-color-text-muted)]">{canEdit ? "Seat details" : "Published seat"}</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label={`Back to map from ${selectedSeat.label} details`}
              title="Back to map"
              className="inline-flex h-8 items-center justify-center rounded-full border border-[var(--sp-color-border-subtle)] bg-[var(--sp-color-surface)] px-3 text-[11px] font-medium text-[var(--sp-color-text-secondary)] transition hover:bg-[var(--sp-color-graphite-soft)] active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus-ring-color)] sm:hidden"
            >
              Back to map
            </button>
            <button type="button" onClick={onToggleCollapse} aria-label="Collapse inspector" title="Collapse inspector" className="hidden h-8 w-8 items-center justify-center rounded-full text-[var(--sp-color-text-muted)] transition hover:bg-[var(--sp-color-graphite-soft)] hover:text-[var(--sp-color-text-secondary)] active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus-ring-color)] sm:inline-flex"><CollapseIcon /></button>
            <button type="button" onClick={onClose} aria-label="Close inspector" title="Close" className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--sp-color-text-muted)] transition hover:bg-[var(--sp-color-graphite-soft)] hover:text-[var(--sp-color-text-secondary)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus-ring-color)]"><CloseIcon /></button>
          </div>
        </div>
        <div className="flex min-w-0 items-center gap-3">
          <span aria-hidden="true" className="inline-flex h-10 min-w-10 shrink-0 items-center justify-center rounded-[10px] bg-[var(--admin-primary-cta)] px-2 text-[13px] font-bold text-white">{selectedSeat.label}</span>
          <div className="min-w-0 flex-1">
            <h2 id="seat-inspector-title" className="truncate text-[15px] font-semibold leading-tight text-[var(--sp-color-text-primary)]">{assignmentIdentityLabel || "Open seat"}</h2>
            <p className="truncate text-xs text-[var(--sp-color-text-muted)]">{currentZone} · {seatTypeLabel}</p>
          </div>
          <span className={["shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1", headerStatusBadgeClass].join(" ")}>{currentStatusLabel}</span>
        </div>
      </div>

      {canEdit ? (
        <form id="seat-inspector-form" onSubmit={handleSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain bg-[var(--sp-color-surface)] px-4 py-4">
            {searchMismatchNotice && (
              <section className={["rounded-2xl border p-3 text-xs", warningSurfaceClassName].join(" ")}>
                <div className="font-black">{searchMismatchNotice}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-full bg-white/80 px-3 py-1.5 font-black text-[var(--admin-state-dirty-text)] ring-1 ring-[var(--admin-state-dirty-border)] transition hover:bg-white active:scale-[0.97] active:duration-75 active:shadow-inner focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--admin-state-dirty-border)]"
                  >
                    Clear selection
                  </button>
                  {onClearSearchContext && (
                    <button
                      type="button"
                      onClick={onClearSearchContext}
                      className="rounded-full bg-white/80 px-3 py-1.5 font-black text-[var(--admin-state-dirty-text)] ring-1 ring-[var(--admin-state-dirty-border)] transition hover:bg-white active:scale-[0.97] active:duration-75 active:shadow-inner focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--admin-state-dirty-border)]"
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
                className="rounded-2xl border border-[var(--admin-state-error-border)] bg-[var(--admin-state-error-bg)] p-3 text-xs text-[var(--admin-state-error-text)] outline-none focus-visible:ring-4 focus-visible:ring-[var(--admin-state-error-border)]"
              >
                <h3 id="seat-inspector-error-title" className="font-black text-[var(--admin-state-error-text)]">Review inspector fields</h3>
                <p className="mt-1 font-semibold leading-5">{localError}</p>
                {fieldErrors.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {fieldErrors.map(error => (
                      <li key={`${error.field}-${error.message}`}>
                        <button
                          type="button"
                          onClick={() => focusInspectorField(error.field)}
                          className="text-left font-black underline decoration-[var(--admin-state-error-border)] underline-offset-2 transition hover:text-[var(--admin-danger)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--admin-state-error-border)]"
                        >
                          {error.message}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {onExplainSeat && (
              <button
                type="button"
                onClick={() => onExplainSeat(selectedSeat)}
                aria-label={`Ask Planner about ${selectedSeat.label}`}
                title={`Ask Planner about ${selectedSeat.label}`}
                className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl border border-[var(--sp-color-state-planner-border)] bg-[var(--sp-color-state-planner-surface)] px-3 py-2 text-left text-xs font-black text-[var(--sp-color-state-planner)] transition hover:bg-[#E5DDD2] active:scale-[0.985] active:duration-75 active:shadow-inner focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--sp-color-state-planner-border)]"
              >
                <span>Ask Planner about this seat</span>
                <span aria-hidden="true" className="shrink-0 leading-none"><ChevronRightIcon /></span>
              </button>
            )}

            <section aria-labelledby="seat-assignment-heading" className="rounded-[12px] border border-[var(--sp-color-border-subtle)] bg-[var(--sp-color-surface-raised)] p-3">
              <h3 id="seat-assignment-heading" className="text-sm font-semibold text-[var(--sp-color-text-primary)]">{hasCurrentAssignment ? "Assignment" : "Assign this seat"}</h3>
              <p id={employeeHelpId} className="mt-0.5 text-xs leading-5 text-[var(--sp-color-text-muted)]">{hasCurrentAssignment ? "Change or clear the draft assignment below." : "Search an existing employee or type a new name."}</p>

              <label className="mt-3 block">
                <span className="text-[11px] font-medium tracking-normal text-[var(--sp-color-text-muted)]">Employee name</span>
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
                    className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-xs font-black text-[var(--sp-color-text-muted)] transition hover:bg-[var(--sp-color-graphite-soft)] hover:text-[var(--sp-color-text-secondary)] active:scale-90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus-ring-color)]"
                  >
                    <ChevronDownIcon />
                  </button>
                  {employeeComboboxOpen && (
                    <div
                      id="seat-inspector-employee-listbox"
                      role="listbox"
                      className="absolute z-50 mt-2 max-h-64 w-full overflow-auto rounded-2xl border border-[var(--sp-color-border-subtle)] bg-white/95 p-1.5 shadow-[0_18px_48px_rgba(23,26,29,0.18),inset_0_1px_0_rgba(255,255,255,0.92)] backdrop-blur-xl"
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
                            "flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left transition active:scale-[0.99] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus-ring-color)]",
                            index === activeEmployeeIndex ? "bg-[var(--admin-primary-soft)] text-[var(--admin-text-primary)]" : "text-[var(--admin-text-secondary)] hover:bg-[var(--admin-state-neutral-bg)]"
                          ].join(" ")}
                        >
                          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-black text-[var(--admin-primary-cta)] ring-1 ring-[var(--admin-primary-border)]">
                            {option.employee.full_name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join("") || "?"}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-black">{option.employee.full_name}</span>
                            <span className="block truncate text-xs text-[var(--sp-color-text-muted)]">{option.meta}</span>
                          </span>
                          <span className="shrink-0 rounded-full bg-[var(--sp-color-graphite-soft)] px-2 py-1 text-[10px] font-semibold tracking-normal text-[var(--sp-color-text-muted)] ring-1 ring-[var(--sp-color-border-subtle)]">
                            {option.assignedSeatLabel}
                          </span>
                        </button>
                      )) : (
                        <div className={["rounded-xl border border-dashed p-3 text-xs leading-5", warningSurfaceClassName].join(" ")}>
                          <div className="font-black text-[var(--admin-state-dirty-text)]">No existing employee match</div>
                          <div>Saving will create a new employee record if you keep this name.</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {fieldErrorMap.employeeName && (
                  <p id={fieldErrorId("employeeName")} className="mt-1 text-xs font-semibold text-[var(--admin-state-error-text)]">{fieldErrorMap.employeeName}</p>
                )}
                <span id={employeeStateId} className={["mt-1 inline-flex rounded-full px-2 py-1 text-[10px] font-semibold tracking-normal ring-1", employeeNameValue ? matchedEmployee ? successPillClassName : "bg-[var(--admin-state-dirty-bg)] text-[var(--admin-state-dirty-text)] ring-[var(--admin-state-dirty-border)]" : neutralPillClassName].join(" ")}>
                  {assignmentStateText}
                </span>
              </label>

              {showNewEmployeeNotice && (
                <div id="seat-inspector-new-employee-notice" role="note" className={["mt-2 rounded-xl border p-3 text-xs leading-5", warningSurfaceClassName].join(" ")}>
                  <div className="font-black text-[var(--admin-state-dirty-text)]">No existing employee match</div>
                  <p className="mt-1 font-semibold">
                    Saving will create a new employee record named <span className="font-black">{employeeNameValue}</span> and assign this draft seat. Viewers see it only after publish.
                  </p>
                </div>
              )}

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-[11px] font-medium tracking-normal text-[var(--sp-color-text-muted)]">Job Title</span>
                  <input
                    ref={employeePositionRef}
                    value={form.employeePosition}
                    onChange={event => handleTextChange("employeePosition", event)}
                    placeholder="Optional"
                    aria-invalid={Boolean(fieldErrorMap.employeePosition)}
                    aria-describedby={fieldDescribedBy("employeePosition")}
                    className={fieldClassName}
                  />
                  {fieldErrorMap.employeePosition && <p id={fieldErrorId("employeePosition")} className="mt-1 text-xs font-semibold text-[var(--admin-state-error-text)]">{fieldErrorMap.employeePosition}</p>}
                </label>

                <label className="block">
                  <span className="text-[11px] font-medium tracking-normal text-[var(--sp-color-text-muted)]">Phone Ext.</span>
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
                  {fieldErrorMap.phoneExtension && <p id={fieldErrorId("phoneExtension")} className="mt-1 text-xs font-semibold text-[var(--admin-state-error-text)]">{fieldErrorMap.phoneExtension}</p>}
                </label>
              </div>

              <label className="mt-3 block">
                <span className="text-[11px] font-medium tracking-normal text-[var(--sp-color-text-muted)]">Department</span>
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
                {fieldErrorMap.department && <p id={fieldErrorId("department")} className="mt-1 text-xs font-semibold text-[var(--admin-state-error-text)]">{fieldErrorMap.department}</p>}
              </label>
            </section>

            <section aria-labelledby="seat-metadata-heading" className="rounded-[12px] border border-[var(--sp-color-border-subtle)] bg-[var(--sp-color-surface-raised)] p-3">
              <h3 id="seat-metadata-heading" className="text-[11px] font-medium tracking-normal text-[var(--sp-color-text-muted)]">Status &amp; notes</h3>

              {!hasAssignedPerson && (
                <label className="mt-2 block">
                  <span className="text-[11px] font-medium tracking-normal text-[var(--sp-color-text-muted)]">Seat status</span>
                  <select
                    ref={statusRef}
                    value={effectiveStatus}
                    onChange={handleStatusChange}
                    aria-invalid={Boolean(fieldErrorMap.status)}
                    aria-describedby={fieldDescribedBy("status")}
                    className={fieldClassName}
                  >
                    <option value="available">Available</option>
                    <option value="reserved">Reserved</option>
                    <option value="unavailable">Unavailable</option>
                  </select>
                  {fieldErrorMap.status && <p id={fieldErrorId("status")} className="mt-1 text-xs font-semibold text-[var(--admin-state-error-text)]">{fieldErrorMap.status}</p>}
                </label>
              )}

              <label className="mt-3 block">
                <span className="text-[11px] font-medium tracking-normal text-[var(--sp-color-text-muted)]">Notes</span>
                <textarea
                  ref={notesRef}
                  value={form.notes}
                  onChange={event => handleTextChange("notes", event)}
                  placeholder="Optional seat note"
                  aria-invalid={Boolean(fieldErrorMap.notes)}
                  aria-describedby={fieldDescribedBy("notes")}
                  className={`${fieldClassName} min-h-20`}
                />
                {fieldErrorMap.notes && <p id={fieldErrorId("notes")} className="mt-1 text-xs font-semibold text-[var(--admin-state-error-text)]">{fieldErrorMap.notes}</p>}
              </label>
            </section>
          </div>

          <div className="sticky bottom-0 z-20 border-t border-[var(--sp-color-border-subtle)] bg-[var(--sp-color-surface)] px-4 py-3 shadow-[0_-12px_26px_rgba(23,26,29,0.08)] backdrop-blur-xl supports-[backdrop-filter]:bg-[var(--sp-color-surface)] sm:bg-[var(--sp-color-surface)]/95 sm:supports-[backdrop-filter]:bg-[var(--sp-color-surface)]/90">
            <div role="status" aria-live="polite" className="sr-only">
              {inspectorStateLabel}
            </div>
            <span id="seat-inspector-delete-help" className="sr-only">{deleteHelpText}</span>
            <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[minmax(6.5rem,0.8fr)_minmax(0,1.5fr)]">
              {saveDisabledReason && (
                <span id="seat-inspector-save-help" className="sr-only">
                  {saveDisabledReason}
                </span>
              )}
              <Button type="button" onClick={handleCancelEditing} aria-label={`Cancel editing ${selectedSeat.label}`} className="min-w-0 rounded-xl px-4">
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={pending || !isDirty}
                aria-label={`${primaryActionLabel} for ${selectedSeat.label}`}
                aria-describedby={saveDisabledReason ? "seat-inspector-save-help" : undefined}
                title={saveDisabledReason ?? `${primaryActionLabel} for ${selectedSeat.label}`}
                className="min-w-0 w-full whitespace-normal rounded-xl !border-[var(--admin-primary-cta)] !bg-[var(--admin-primary-cta)] !text-white hover:!border-[var(--admin-primary-hover)] hover:!bg-[var(--admin-primary-hover)] disabled:!border-[var(--admin-state-neutral-border)] disabled:!bg-[var(--admin-state-neutral-bg)] disabled:!text-[var(--admin-text-subtle)] disabled:shadow-none disabled:hover:!border-[var(--admin-state-neutral-border)] disabled:hover:!bg-[var(--admin-state-neutral-bg)]"
              >
                {primaryActionLabel}
              </Button>
            </div>
            <div className={["mt-2 grid gap-2", secondaryActionGridClassName].join(" ")}>
              <Button type="button" onClick={handleStartSwapSeat} disabled={pending} aria-label={`Start seat swap for ${selectedSeat.label}`} className="min-w-0 w-full rounded-xl">
                Swap seat
              </Button>
              {hasCurrentAssignment && (
                <Button type="button" variant="danger" onClick={handleVacateSeat} disabled={pending} aria-label={`Vacate ${selectedSeat.label}`} className="min-w-0 w-full rounded-xl !border-[var(--admin-danger)] !bg-[var(--admin-danger)] !text-white hover:!border-[var(--admin-danger)] hover:!bg-[var(--admin-danger)]">
                  Vacate
                </Button>
              )}
              <Button
                type="button"
                variant="danger"
                onClick={handleDeleteSeat}
                disabled={pending || !selectedSeatCanDelete}
                aria-label={`Delete custom seat ${selectedSeat.label}`}
                aria-describedby="seat-inspector-delete-help"
                title={deleteHelpText}
                className="min-w-0 w-full whitespace-normal rounded-xl leading-tight !border-[var(--admin-danger)] !bg-[var(--admin-danger)] !text-white hover:!border-[var(--admin-danger)] hover:!bg-[var(--admin-danger)] disabled:!border-[var(--admin-state-neutral-border)] disabled:!bg-[var(--admin-state-neutral-bg)] disabled:!text-[var(--admin-text-subtle)] disabled:shadow-none disabled:hover:!bg-[var(--admin-state-neutral-bg)]"
              >
                Delete seat
              </Button>
              {isDirty && (
                <Button type="button" onClick={handleResetEdits} disabled={pending} aria-label={`Discard edits for ${selectedSeat.label}`} className="min-w-0 w-full whitespace-normal rounded-xl">
                  Discard edits
                </Button>
              )}
            </div>
          </div>
        </form>
      ) : (
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain bg-[var(--sp-color-surface)] px-4 py-4 text-sm">
          <section className="rounded-[12px] border border-[var(--sp-color-border-subtle)] bg-[var(--sp-color-surface-raised)] p-3">
            <div className="text-[11px] font-medium tracking-normal text-[var(--sp-color-text-muted)]">Published assignment</div>
            <div className="mt-1 text-base font-semibold leading-tight text-[var(--sp-color-text-primary)]">{selectedSeat.employee?.full_name ?? "Open seat"}</div>
            {(selectedSeat.employee?.position || selectedSeat.employee?.department) && (
              <div className="mt-1 text-sm text-[var(--sp-color-text-muted)]">
                {[selectedSeat.employee?.position, selectedSeat.employee?.department].filter(Boolean).join(" · ")}
              </div>
            )}
            {selectedSeat.employee?.phone_extension && (
              <div className="mt-2 inline-flex rounded-full bg-[var(--sp-color-graphite-soft)] px-2 py-1 text-[11px] font-medium tracking-normal text-[var(--sp-color-text-muted)] ring-1 ring-[var(--sp-color-border-subtle)]">
                Ext. {selectedSeat.employee.phone_extension}
              </div>
            )}
          </section>
          {selectedSeat.notes && (
            <section className="rounded-[12px] border border-[var(--sp-color-border-subtle)] bg-[var(--sp-color-surface-raised)] p-3">
              <div className="text-[11px] font-medium tracking-normal text-[var(--sp-color-text-muted)]">Notes</div>
              <p className="mt-1 text-sm leading-5 text-[var(--sp-color-text-secondary)]">{selectedSeat.notes}</p>
            </section>
          )}
        </div>
      )}
    </aside>

    {vacateConfirmOpen && (
      <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[var(--sp-color-workspace-deep)]/45 p-3 backdrop-blur-[2px] sm:z-[70] sm:items-center">
        <section
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
                This clears {selectedSeatEmployeeName} from this draft seat.
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
            <Button type="button" variant="danger" onClick={confirmVacateSeat} disabled={pending} className="w-full !border-[var(--admin-danger)] !bg-[var(--admin-danger)] !text-white hover:!border-[var(--admin-danger)] hover:!bg-[var(--admin-danger)]">
              Vacate seat
            </Button>
          </div>
        </section>
      </div>
    )}

    {moveConflict && (
      <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[var(--sp-color-workspace-deep)]/45 p-3 backdrop-blur-[2px] sm:z-[70] sm:items-center">
        <section
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
              <h2 id="move-employee-confirm-title" className="text-base font-black">Move {moveConflict.employeeName} to {selectedSeat.label}?</h2>
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
