"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
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
  onSubmitBlocked
}: SeatInspectorProps) {
  const [pending, startTransition] = useTransition();
  const [localError, setLocalError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [form, setForm] = useState<SeatInspectorForm>(emptyForm);
  const [initialForm, setInitialForm] = useState<SeatInspectorForm>(emptyForm);
  const [employeeComboboxOpen, setEmployeeComboboxOpen] = useState(false);
  const [activeEmployeeIndex, setActiveEmployeeIndex] = useState(0);
  const activeSeatIdRef = useRef<string | null>(null);
  const activeSeatSnapshotRef = useRef(formSnapshot(emptyForm));
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
      onDirtyChange(false);
      return;
    }

    const nextForm = formFromSeat(seat);
    const nextSnapshot = formSnapshot(nextForm);
    const isNewSeat = activeSeatIdRef.current !== seat.id;

    if (isNewSeat || (!isDirty && activeSeatSnapshotRef.current !== nextSnapshot)) {
      activeSeatIdRef.current = seat.id;
      activeSeatSnapshotRef.current = nextSnapshot;
      setForm(nextForm);
      setInitialForm(nextForm);
      setLocalError(null);
      setFieldErrors([]);
      setSaveFeedback(null);
      setEmployeeComboboxOpen(false);
      setActiveEmployeeIndex(0);
      onError(null);
      onDirtyChange(false);
    }
  }, [seat, isDirty, onDirtyChange, onError]);

  if (!seat) return null;

  const selectedSeat = seat;
  const selectedSeatEmployeeName = selectedSeat.employee?.full_name ?? "this employee";
  const inspectorSubtitle = selectedSeat.employee?.full_name ? `Assigned to ${selectedSeat.employee.full_name}` : "Open seat";
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

  const currentZone = selectedSeat.zone ?? selectedSeat.department ?? "Unzoned";
  const currentStatusLabel = effectiveStatus[0].toUpperCase() + effectiveStatus.slice(1);
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
    ? "Saving"
    : localError
      ? "Error"
      : isDirty
        ? "Unsaved changes"
        : saveFeedback ?? "No unsaved changes";
  const inspectorStateClassName = localError
    ? "bg-rose-50 text-rose-700 ring-rose-200"
    : pending
      ? "bg-sky-50 text-sky-700 ring-sky-200"
      : isDirty
        ? "bg-amber-50 text-amber-700 ring-amber-200"
        : saveFeedback
          ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
          : "bg-slate-100 text-slate-600 ring-slate-200";

  function fieldErrorId(field: SeatInspectorField) {
    return `seat-inspector-${field}-error`;
  }

  function fieldDescribedBy(field: SeatInspectorField, extraId?: string) {
    return [extraId, fieldErrorMap[field] ? fieldErrorId(field) : null].filter(Boolean).join(" ") || undefined;
  }

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

    startTransition(async () => {
      try {
        setLocalError(null);
        setFieldErrors([]);
        setSaveFeedback(null);
        onError(null);
        const updated = await updateSeatAction({
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
        });
        const nextForm = formFromSeat(updated);
        activeSeatSnapshotRef.current = formSnapshot(nextForm);
        setForm(nextForm);
        setInitialForm(nextForm);
        onDirtyChange(false);
        setSaveFeedback("Saved to draft");
        onSeatUpdated(updated, beforeSnapshot);
      } catch (error) {
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

  function handleResetEdits() {
    setForm(initialForm);
    setLocalError(null);
    setFieldErrors([]);
    setSaveFeedback(null);
    onError(null);
    onDirtyChange(false);
  }

  function handleStartSwapSeat() {
    if (pending) return;
    onStartSwapSeat();
  }

  function handleVacateSeat() {
    if (!hasCurrentAssignment || pending) return;

    const confirmed = window.confirm(
      [
        `Vacate ${selectedSeat.label}?`,
        "",
        `This clears ${selectedSeatEmployeeName} from this draft seat.`,
        ...(isDirty ? ["Any unsaved inspector edits will be discarded."] : []),
        "The published viewer map will not change until the draft is published."
      ].join("\n")
    );

    if (!confirmed) return;

    const beforeSnapshot = onBeforeSeatUpdate();

    startTransition(async () => {
      try {
        setLocalError(null);
        setFieldErrors([]);
        setSaveFeedback(null);
        onError(null);
        const updated = await updateSeatAction({
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

  const fieldClassName = "mt-1 w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-4 focus:ring-orange-100 disabled:bg-slate-50 disabled:text-slate-500";
  const iconButtonClassName = "inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/70 bg-white/80 text-sm font-black text-slate-600 shadow-sm transition hover:bg-white active:scale-95 active:duration-75 active:shadow-inner focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-100";
  const saveDisabledReason = pending
    ? "Save is unavailable while the current draft change is finishing."
    : !isDirty
      ? "No unsaved changes."
      : null;
  const deleteHelpText = selectedSeatCanDelete ? "Available custom draft seat can be deleted." : selectedSeatDeleteBlockReason ?? "Delete is unavailable for this seat.";
  const vacateHelpText = hasCurrentAssignment ? "Assigned seat can be vacated without deleting the marker." : "No employee is assigned, so Vacate is not needed.";
  const capabilityRowClassName = "flex items-start justify-between gap-3 rounded-lg bg-white/70 px-2.5 py-2 ring-1 ring-slate-100";

  if (collapsed && swapMode) return null;

  if (collapsed) {
    return (
      <aside className="fixed inset-x-3 bottom-3 z-40 sm:inset-x-auto sm:bottom-auto sm:right-3 sm:top-[70px]">
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={`View details for ${selectedSeat.label}`}
          title={`View details for ${selectedSeat.label}`}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-white/70 bg-white/90 px-4 py-2 text-slate-700 shadow-[0_14px_40px_rgba(15,23,42,0.14),inset_0_1px_0_rgba(255,255,255,0.92)] backdrop-blur-xl transition hover:bg-white active:scale-[0.985] active:duration-75 active:shadow-inner focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-100 sm:min-h-[168px] sm:w-[46px] sm:flex-col sm:px-2 sm:py-4"
        >
          <span className="text-[11px] font-extrabold uppercase tracking-[0.18em] sm:rotate-180 sm:[writing-mode:vertical-rl]">View details</span>
          <span className="rounded-full bg-orange-50 px-2 py-1 text-[10px] font-black text-brand-dark ring-1 ring-orange-100 sm:mt-2 sm:rotate-180 sm:bg-transparent sm:px-0 sm:py-0 sm:text-slate-400 sm:ring-0 sm:[writing-mode:vertical-rl]">{selectedSeat.label}</span>
        </button>
      </aside>
    );
  }

  return (
    <aside
      aria-label={canEdit ? "Selected draft seat inspector" : "Selected published seat details"}
      aria-labelledby="seat-inspector-title"
      className="fixed inset-x-3 bottom-3 z-40 flex max-h-[62vh] flex-col overflow-hidden rounded-2xl border border-white/70 bg-white/95 shadow-[0_26px_80px_rgba(15,23,42,0.22),inset_0_1px_0_rgba(255,255,255,0.94)] backdrop-blur-2xl supports-[backdrop-filter]:bg-white/90 sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-[70px] sm:max-h-[calc(100vh-84px)] sm:w-[350px] sm:max-w-[calc(100vw-2rem)]"
    >
      <div className="sticky top-0 z-20 flex items-start justify-between gap-3 border-b border-slate-100 bg-white/95 px-4 py-4 backdrop-blur-xl supports-[backdrop-filter]:bg-white/90">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 id="seat-inspector-title" className="text-xl font-black leading-none text-slate-950">{selectedSeat.label}</h2>
            {canEdit && (
              <span aria-live="polite" className={["rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-wide ring-1", inspectorStateClassName].join(" ")}>
                {inspectorStateLabel}
              </span>
            )}
            {swapMode && <span className="rounded-full bg-sky-50 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-sky-700 ring-1 ring-sky-200">Swap</span>}
          </div>
          <p className="mt-1 truncate text-xs font-semibold text-slate-500">{inspectorSubtitle}</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={`Back to map from ${selectedSeat.label} details`}
            title="Back to map"
            className="inline-flex h-8 items-center justify-center rounded-full border border-orange-100 bg-orange-50 px-3 text-[11px] font-black text-brand-dark shadow-sm transition hover:bg-orange-100 active:scale-95 active:duration-75 active:shadow-inner focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-100 sm:hidden"
          >
            Back to map
          </button>
          <button type="button" onClick={onToggleCollapse} aria-label="Collapse inspector" title="Collapse inspector" className="hidden h-8 w-8 items-center justify-center rounded-full border border-white/70 bg-white/80 text-sm font-black text-slate-600 shadow-sm transition hover:bg-white active:scale-95 active:duration-75 active:shadow-inner focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-100 sm:inline-flex">-</button>
          <button type="button" onClick={onClose} aria-label="Close inspector" title="Close" className={iconButtonClassName}>x</button>
        </div>
      </div>

      {canEdit ? (
        <form id="seat-inspector-form" onSubmit={handleSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-3">
            {searchMismatchNotice && (
              <section className="rounded-2xl border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-900">
                <div className="font-black">{searchMismatchNotice}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-full bg-white/80 px-3 py-1.5 font-black text-amber-950 ring-1 ring-amber-200 transition hover:bg-white active:scale-[0.97] active:duration-75 active:shadow-inner focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-100"
                  >
                    Clear selection
                  </button>
                  {onClearSearchContext && (
                    <button
                      type="button"
                      onClick={onClearSearchContext}
                      className="rounded-full bg-white/80 px-3 py-1.5 font-black text-amber-950 ring-1 ring-amber-200 transition hover:bg-white active:scale-[0.97] active:duration-75 active:shadow-inner focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-100"
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
                className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 outline-none focus-visible:ring-4 focus-visible:ring-rose-100"
              >
                <h3 id="seat-inspector-error-title" className="font-black text-rose-900">Review inspector fields</h3>
                <p className="mt-1 font-semibold leading-5">{localError}</p>
                {fieldErrors.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {fieldErrors.map(error => (
                      <li key={`${error.field}-${error.message}`}>
                        <button
                          type="button"
                          onClick={() => focusInspectorField(error.field)}
                          className="text-left font-black underline decoration-rose-300 underline-offset-2 transition hover:text-rose-950 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-100"
                        >
                          {error.message}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            <section aria-labelledby="seat-summary-heading" className="rounded-2xl border border-slate-200 bg-white/60 p-3">
              <h3 id="seat-summary-heading" className="text-[11px] font-black uppercase tracking-wide text-slate-500">Seat Summary</h3>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl bg-slate-50 px-2.5 py-2 ring-1 ring-slate-100">
                  <div className="font-black uppercase tracking-wide text-slate-400">Zone</div>
                  <div className="mt-0.5 truncate font-bold text-slate-800">{currentZone}</div>
                </div>
                <div className="rounded-xl bg-slate-50 px-2.5 py-2 ring-1 ring-slate-100">
                  <div className="font-black uppercase tracking-wide text-slate-400">Status</div>
                  <div className="mt-0.5 truncate font-bold text-slate-800">{currentStatusLabel}</div>
                </div>
                <div className="rounded-xl bg-slate-50 px-2.5 py-2 ring-1 ring-slate-100">
                  <div className="font-black uppercase tracking-wide text-slate-400">Seat Type</div>
                  <div className="mt-0.5 truncate font-bold text-slate-800">{seatTypeLabel}</div>
                </div>
                <div className="rounded-xl bg-slate-50 px-2.5 py-2 ring-1 ring-slate-100">
                  <div className="font-black uppercase tracking-wide text-slate-400">Assignment</div>
                  <div className="mt-0.5 truncate font-bold text-slate-800">{employeeNameValue || (hasCurrentAssignment ? selectedSeatEmployeeName : "Open seat")}</div>
                </div>
              </div>
            </section>

            {onExplainSeat && (
              <button
                type="button"
                onClick={() => onExplainSeat(selectedSeat)}
                aria-label={`Ask Planner about ${selectedSeat.label}`}
                title={`Ask Planner about ${selectedSeat.label}`}
                className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl border border-cyan-200 bg-cyan-50/70 px-3 py-2 text-left text-xs font-black text-cyan-900 transition hover:bg-cyan-100/80 active:scale-[0.985] active:duration-75 active:shadow-inner focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-100"
              >
                <span>Ask Planner about this seat</span>
                <span aria-hidden="true" className="shrink-0 text-sm leading-none">&gt;</span>
              </button>
            )}

            <section aria-labelledby="seat-assignment-heading" className="rounded-2xl border border-slate-200 bg-white/60 p-3">
              <h3 id="seat-assignment-heading" className="text-[11px] font-black uppercase tracking-wide text-slate-500">Assignment</h3>
              <p className="mt-1 text-xs font-semibold text-slate-500">{hasCurrentAssignment ? "Draft assignment" : "Ready to assign"}</p>

              <label className="mt-3 block">
                <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Employee name</span>
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
                    aria-describedby={fieldDescribedBy("employeeName")}
                    className={`${fieldClassName} pr-10 ${fieldErrorMap.employeeName ? "border-rose-300 focus:border-rose-400 focus:ring-rose-100" : ""}`}
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
                    className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-xs font-black text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 active:scale-90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-100"
                  >
                    v
                  </button>
                  {employeeComboboxOpen && (
                    <div
                      id="seat-inspector-employee-listbox"
                      role="listbox"
                      className="absolute z-50 mt-2 max-h-64 w-full overflow-auto rounded-2xl border border-white/70 bg-white/95 p-1.5 shadow-[0_18px_48px_rgba(15,23,42,0.18),inset_0_1px_0_rgba(255,255,255,0.92)] backdrop-blur-xl"
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
                            "flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left transition active:scale-[0.99] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-100",
                            index === activeEmployeeIndex ? "bg-orange-50 text-slate-950" : "text-slate-800 hover:bg-slate-50"
                          ].join(" ")}
                        >
                          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-black text-brand-dark ring-1 ring-orange-100">
                            {option.employee.full_name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join("") || "?"}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-black">{option.employee.full_name}</span>
                            <span className="block truncate text-xs text-slate-500">{option.meta}</span>
                          </span>
                          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-slate-500">
                            {option.assignedSeatLabel}
                          </span>
                        </button>
                      )) : (
                        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-500">
                          <div className="font-black text-slate-700">No existing employee match</div>
                          <div>Create new employee on save.</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {fieldErrorMap.employeeName && (
                  <p id={fieldErrorId("employeeName")} className="mt-1 text-xs font-semibold text-rose-700">{fieldErrorMap.employeeName}</p>
                )}
                <span className={["mt-1 inline-flex rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-wide", employeeNameValue ? "bg-orange-50 text-brand-dark ring-1 ring-orange-100" : "bg-slate-100 text-slate-500"].join(" ")}>
                  {assignmentStateText}
                </span>
              </label>

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Job Title</span>
                  <input
                    ref={employeePositionRef}
                    value={form.employeePosition}
                    onChange={event => handleTextChange("employeePosition", event)}
                    placeholder="Optional"
                    aria-invalid={Boolean(fieldErrorMap.employeePosition)}
                    aria-describedby={fieldDescribedBy("employeePosition")}
                    className={fieldClassName}
                  />
                  {fieldErrorMap.employeePosition && <p id={fieldErrorId("employeePosition")} className="mt-1 text-xs font-semibold text-rose-700">{fieldErrorMap.employeePosition}</p>}
                </label>

                <label className="block">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Phone Ext.</span>
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
                  {fieldErrorMap.phoneExtension && <p id={fieldErrorId("phoneExtension")} className="mt-1 text-xs font-semibold text-rose-700">{fieldErrorMap.phoneExtension}</p>}
                </label>
              </div>

              <label className="mt-3 block">
                <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Department</span>
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
                {fieldErrorMap.department && <p id={fieldErrorId("department")} className="mt-1 text-xs font-semibold text-rose-700">{fieldErrorMap.department}</p>}
              </label>
            </section>

            <section aria-labelledby="seat-metadata-heading" className="rounded-2xl border border-slate-200 bg-white/60 p-3">
              <h3 id="seat-metadata-heading" className="text-[11px] font-black uppercase tracking-wide text-slate-500">Seat Metadata</h3>
              <div className="mt-2 rounded-xl bg-slate-50 px-2.5 py-2 text-xs ring-1 ring-slate-100">
                <div className="font-black uppercase tracking-wide text-slate-400">Detected zone</div>
                <div className="mt-0.5 font-bold text-slate-800">{currentZone}</div>
              </div>

              {!hasAssignedPerson && (
                <label className="mt-3 block">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Seat status</span>
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
                  {fieldErrorMap.status && <p id={fieldErrorId("status")} className="mt-1 text-xs font-semibold text-rose-700">{fieldErrorMap.status}</p>}
                </label>
              )}

              <label className="mt-3 block">
                <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Notes</span>
                <textarea
                  ref={notesRef}
                  value={form.notes}
                  onChange={event => handleTextChange("notes", event)}
                  placeholder="Optional seat note"
                  aria-invalid={Boolean(fieldErrorMap.notes)}
                  aria-describedby={fieldDescribedBy("notes")}
                  className={`${fieldClassName} min-h-20`}
                />
                {fieldErrorMap.notes && <p id={fieldErrorId("notes")} className="mt-1 text-xs font-semibold text-rose-700">{fieldErrorMap.notes}</p>}
              </label>
            </section>
          </div>

          <div className="sticky bottom-0 z-20 border-t border-slate-100 bg-white/95 px-4 py-3 shadow-[0_-16px_36px_rgba(15,23,42,0.08)] backdrop-blur-xl supports-[backdrop-filter]:bg-white/90">
            <section aria-label={`Available actions for ${selectedSeat.label}`} className="mb-2 rounded-xl border border-slate-200 bg-slate-50/80 p-2 text-xs text-slate-600">
              <h3 className="mb-1 text-[10px] font-black uppercase tracking-wide text-slate-500">Actions / Rules</h3>
              <div className="grid gap-1.5">
                <div className={capabilityRowClassName}>
                  <div className="min-w-0">
                    <div className="font-black text-slate-900">Delete</div>
                    <div id="seat-inspector-delete-help" className="mt-0.5 leading-4">{deleteHelpText}</div>
                  </div>
                  <span className={["shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ring-1", selectedSeatCanDelete ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-slate-100 text-slate-500 ring-slate-200"].join(" ")}>
                    {selectedSeatCanDelete ? "Allowed" : "Blocked"}
                  </span>
                </div>
                <div className={capabilityRowClassName}>
                  <div className="min-w-0">
                    <div className="font-black text-slate-900">Vacate</div>
                    <div className="mt-0.5 leading-4">{vacateHelpText}</div>
                  </div>
                  <span className={["shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ring-1", hasCurrentAssignment ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-slate-100 text-slate-500 ring-slate-200"].join(" ")}>
                    {hasCurrentAssignment ? "Allowed" : "Not needed"}
                  </span>
                </div>
              </div>
            </section>
            <div role="status" aria-live="polite" className={["mb-2 rounded-xl px-3 py-2 text-xs font-black ring-1", inspectorStateClassName].join(" ")}>
              {inspectorStateLabel}
            </div>
            <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2">
              {saveDisabledReason && (
                <span id="seat-inspector-save-help" className="sr-only">
                  {saveDisabledReason}
                </span>
              )}
              <Button type="button" onClick={onClose} aria-label={`Cancel editing ${selectedSeat.label}`} className="rounded-xl px-4">
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={pending || !isDirty}
                aria-label={`${primaryActionLabel} for ${selectedSeat.label}`}
                aria-describedby={saveDisabledReason ? "seat-inspector-save-help" : undefined}
                title={saveDisabledReason ?? `${primaryActionLabel} for ${selectedSeat.label}`}
                className="w-full rounded-xl disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none disabled:hover:border-slate-200 disabled:hover:bg-slate-100"
              >
                {primaryActionLabel}
              </Button>
            </div>
            <div className={["mt-2 grid gap-2", hasCurrentAssignment || isDirty ? "grid-cols-2" : "grid-cols-1"].join(" ")}>
              <Button type="button" onClick={handleStartSwapSeat} disabled={pending} aria-label={`Start seat swap for ${selectedSeat.label}`} className="w-full rounded-xl">
                Swap seat
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={handleDeleteSeat}
                disabled={pending || !selectedSeatCanDelete}
                aria-label={`Delete custom seat ${selectedSeat.label}`}
                aria-describedby="seat-inspector-delete-help"
                title={deleteHelpText}
                className="w-full whitespace-normal rounded-xl leading-tight disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none disabled:hover:bg-slate-100"
              >
                Delete seat
              </Button>
              {hasCurrentAssignment && (
                <Button type="button" variant="danger" onClick={handleVacateSeat} disabled={pending} aria-label={`Vacate ${selectedSeat.label}`} className="w-full rounded-xl">
                  Vacate
                </Button>
              )}
              {isDirty && (
                <Button type="button" onClick={handleResetEdits} disabled={pending} aria-label={`Discard edits for ${selectedSeat.label}`} className="w-full rounded-xl">
                  Discard edits
                </Button>
              )}
            </div>
          </div>
        </form>
      ) : (
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-3 text-sm">
          <section className="rounded-2xl border border-slate-200 bg-white/60 p-3">
            <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">Assignment</div>
            <div className="mt-1 text-lg font-black leading-tight text-slate-950">{selectedSeat.employee?.full_name ?? "Open seat"}</div>
            {(selectedSeat.employee?.position || selectedSeat.employee?.department) && (
              <div className="mt-1 text-sm text-slate-500">
                {[selectedSeat.employee?.position, selectedSeat.employee?.department].filter(Boolean).join(" · ")}
              </div>
            )}
            {selectedSeat.employee?.phone_extension && (
              <div className="mt-2 inline-flex rounded-full bg-white/80 px-2 py-1 text-[11px] font-black uppercase tracking-wide text-slate-500 ring-1 ring-slate-200">
                Ext. {selectedSeat.employee.phone_extension}
              </div>
            )}
          </section>
          {selectedSeat.notes && (
            <section className="rounded-2xl border border-slate-200 bg-white/60 p-3">
              <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">Notes</div>
              <p className="mt-1 text-sm leading-5 text-slate-600">{selectedSeat.notes}</p>
            </section>
          )}
        </div>
      )}
    </aside>
  );
}
