"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { ChangeEvent, FormEvent, KeyboardEvent } from "react";
import type { DraftSnapshot } from "@/lib/draftHistory";
import type { DepartmentOption, Employee, SeatStatus, SeatWithEmployee } from "@/lib/types";
import { STATUS_LABELS } from "@/lib/types";
import { updateSeatAction } from "@/app/actions";
import { canDeleteSeat, getSeatDeleteBlockReason, isProtectedOriginalSeatLabel } from "@/lib/seatProtection";
import { PUBLISH_IMPACT_NOTE } from "@/lib/copy";
import { buildContactRows, employeeAssignmentFields, type ContactFactRow } from "@/lib/employeeAssignment";
import { formatDisplayName, formatSeatCode } from "@/lib/formatName";
import { buildInitials } from "@/lib/validators";
import { Button } from "@/components/ui/Button";
import { CloseIcon } from "@/components/ui/CloseIcon";
import { useDialogFocus } from "@/components/ui/useDialogFocus";

type SeatInspectorProps = {
  seat: SeatWithEmployee | null;
  seats: SeatWithEmployee[];
  employees: Employee[];
  departmentOptions: DepartmentOption[];
  canEdit: boolean;
  collapsed: boolean;
  searchMismatchNotice?: string | null;
  searchMismatchClearLabel?: string;
  // Panel-tier bottom offset only (the below-panel sheet always sits bottom-3).
  // Default is the shipped 12px gutter; the viewer passes panel:bottom-[52px]
  // so the side panel clears its 40px status band plus the same gutter. A
  // class, not a number: it must compose with the panel: variant at build time.
  panelBottomClassName?: string;
  onClose: () => void;
  onClearSearchContext?: () => void;
  // Seat-verb handlers (hide-not-disable): each verb renders inside the Seat
  // actions section only when canEdit AND the matching handler is supplied.
  // SeatMap keeps owning move/swap modes and the always-confirm vacate dialog.
  onMove?: () => void;
  onSwap?: () => void;
  onVacate?: () => void;
  // Finding 2 (v12 slice 4 final review): the retired canvas action bar
  // disabled its verbs on `mutationInFlight || barSeatActions.pending` — a
  // mutation started elsewhere (e.g. the vacate confirm dialog) still had to
  // block Move/Swap/Vacate here. `pending` alone only covers a mutation this
  // inspector instance itself started (its own save/assign transition), so
  // the parent passes its own in-flight signal through this prop. Viewer
  // never passes it (read-only, no Seat actions verbs rendered anyway).
  busy?: boolean;
  // Edit callbacks are optional so the read-only viewer can render the same
  // inspector without wiring any draft machinery (canEdit=false never calls them).
  onDeleteSeat?: () => void;
  onExplainSeat?: (seat: SeatWithEmployee) => void;
  onBeforeSeatUpdate?: () => DraftSnapshot;
  // `freshDraftPayload` is only ever passed for a force_move commit — it also
  // vacates the mover's OTHER draft seat server-side, so the parent needs the
  // fresh full draft state (not just this seat) to reconcile it without
  // baking a stale updated_at into local state. See SeatMap.tsx's
  // applySeatUpdated for the full rationale.
  onSeatUpdated?: (seat: SeatWithEmployee, beforeSnapshot: DraftSnapshot, freshDraftPayload?: { seats: SeatWithEmployee[]; employees: Employee[] }) => void;
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

// Shared eyebrow-heading style for the CONTACT/SEAT section labels (admin and
// published variants), factored so the four headings can't drift apart.
const eyebrowHeadingClass = "text-[10px] font-bold tracking-[0.12em] text-[var(--admin-chrome-label)]";

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

// Progressive-disclosure sections (2026-08-18 spec): independent multi-open,
// never an accordion. Contact defaults open (it only renders when someone is
// assigned); Actions / Notes / Activity default collapsed. Module-level so the
// reset path has a stable identity to restore.
type InspectorSectionKey = "contact" | "actions" | "notes" | "activity";
const DEFAULT_OPEN_SECTIONS: Record<InspectorSectionKey, boolean> = {
  contact: true,
  actions: false,
  notes: false,
  activity: false
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

// Seat-action verb glyphs (v12 slice 4's icon action row, now inside the
// Seat actions disclosure; prototype "Seat Planner v12 Prototype.dc.html"
// lines 218-220): ~15px, 1.5 stroke, aria-hidden.
function MoveGlyph() {
  return (
    <svg aria-hidden="true" width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M10 3v14M3 10h14" strokeLinecap="round" />
      <path d="m7.5 5.5 2.5-2.5 2.5 2.5M7.5 14.5l2.5 2.5 2.5-2.5M5.5 7.5 3 10l2.5 2.5M14.5 7.5 17 10l-2.5 2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SwapGlyph() {
  return (
    <svg aria-hidden="true" width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h11l-3-3M16 13H5l3 3" />
    </svg>
  );
}

function VacateGlyph() {
  return (
    <svg aria-hidden="true" width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="8" cy="7" r="2.8" />
      <path d="M3.5 16.5v-1a4 4 0 0 1 4-4h1.5" />
      <path d="M12.5 13.5h5" />
    </svg>
  );
}

// Heading row used inside the progressive assignment editor. The <details>-
// based section styling this used to share with is retired (v12 slice 4);
// the disclosure sections use DisclosureSectionHeader below — this flat
// eyebrow style now belongs to the assignment editor alone.
function SectionHeading({ id, title }: { id?: string; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <h3 id={id} className="shrink-0 text-[12px] font-semibold text-[var(--admin-chrome-heading)]">{title}</h3>
      <span aria-hidden="true" className="h-px min-w-4 flex-1 bg-white/10" />
    </div>
  );
}

function FactRow({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2.5 border-b border-white/5 py-1.5 last:border-b-0">
      <dt className="shrink-0 text-[12.5px] text-[var(--admin-chrome-muted)]">{label}</dt>
      <dd className={["min-w-0 truncate text-right text-[12.5px] font-medium text-[var(--admin-chrome-value-text)]", mono ? "font-mono" : ""].filter(Boolean).join(" ")}>{value}</dd>
    </div>
  );
}

// Disclosure header for the progressive sections: the heading wraps the
// toggle button (APG disclosure pattern) so section titles stay in the
// document outline while the whole row is one keyboard target. Collapsed
// bodies unmount (same contract the retired tabs had for inactive panels).
function DisclosureSectionHeader({ id, bodyId, title, open, onToggle }: { id?: string; bodyId: string; title: string; open: boolean; onToggle: () => void }) {
  return (
    <h3 id={id}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={onToggle}
        className="flex w-full items-center justify-between py-2.5 text-left text-[13px] font-semibold text-[var(--admin-chrome-heading)] transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-primary)]"
      >
        {title}
        {open ? <ChevronDownIcon /> : <ChevronRightIcon />}
      </button>
    </h3>
  );
}

// Contact facts hide fields with nothing on file instead of rendering "—"
// dash rows (2026-07-16 critique carryover) — an absent row reads as "nothing
// recorded"; a column of dashes reads as broken. When NOTHING is on file, one
// quiet line says so, and admins get pointed at Management (where profiles
// are completed).
function ContactFacts({ rows, canEdit }: { rows: ContactFactRow[]; canEdit: boolean }) {
  if (rows.length === 0) {
    return (
      <p className="py-1.5 text-[12.5px] leading-4 text-[var(--admin-chrome-muted)]">
        No contact details on file.{canEdit ? " Add them from the Management page." : ""}
      </p>
    );
  }
  return (
    <dl>
      {rows.map(row => (
        <FactRow key={row.label} label={row.label} value={row.value} />
      ))}
    </dl>
  );
}

// AI entry row (v12 slice 4, prototype "Seat Planner v12 Prototype.dc.html"
// line 264-265): factored into its own component so the AI-blue chrome token
// stays provably confined here — the accessibility-source guardrail counts
// every occurrence of that token in this file and asserts they all fall
// inside this function (the same technique AppRail's AiCell() uses for the
// rail's AI nav item). The prop is named `seat` per that contract; it is
// aliased to `selectedSeat` locally so the aria-label/title text stays
// byte-identical to this row's pre-extraction form.
function AskPlannerSeatRow({ seat: selectedSeat, onExplainSeat }: { seat: SeatWithEmployee; onExplainSeat: (seat: SeatWithEmployee) => void }) {
  return (
    <button
      type="button"
      onClick={() => onExplainSeat(selectedSeat)}
      aria-label={`Ask Planner about ${selectedSeat.label}`}
      title={`Ask Planner about ${selectedSeat.label}`}
      className="mx-4 mb-3 flex w-auto items-center justify-between gap-3 bg-[var(--admin-chrome-raised)] px-3 py-2.5 text-left text-[12px] font-semibold text-[var(--admin-chrome-action-text)] transition hover:bg-white/[0.10] hover:text-white active:scale-[0.985] active:duration-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-primary)]"
    >
      <span className="flex items-center gap-2">
        <span className="border border-[var(--admin-ai-chrome-border)] px-1 text-[9.5px] font-bold tracking-[0.04em] text-[var(--admin-ai-chrome-text)]">AI</span>
        Ask Planner about this seat
      </span>
      <span aria-hidden="true" className="shrink-0 leading-none"><ChevronRightIcon /></span>
    </button>
  );
}

export function SeatInspector({
  seat,
  seats,
  employees,
  departmentOptions,
  canEdit,
  collapsed,
  searchMismatchNotice = null,
  searchMismatchClearLabel = "Clear search",
  panelBottomClassName = "panel:bottom-3",
  onClose,
  onClearSearchContext,
  onMove,
  onSwap,
  onVacate,
  busy = false,
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
  // assignment editor reveals progressively behind Assign/Edit assignment.
  const [editingAssignment, setEditingAssignment] = useState(false);
  const [employeeComboboxOpen, setEmployeeComboboxOpen] = useState(false);
  const [activeEmployeeIndex, setActiveEmployeeIndex] = useState(0);
  // Progressive sections (2026-08-18): open/closed per section. Resets to
  // DEFAULT_OPEN_SECTIONS whenever the seat changes or the draft form resets —
  // see resetInspectorDraftForm, which every reset path (seat change,
  // resetSignal, Cancel-discard) funnels through.
  const [openSections, setOpenSections] = useState<Record<InspectorSectionKey, boolean>>(DEFAULT_OPEN_SECTIONS);
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
  const assignmentSectionRef = useRef<HTMLElement | null>(null);
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
    setOpenSections(DEFAULT_OPEN_SECTIONS);
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
  const currentStatusLabel = STATUS_LABELS[effectiveStatus];
  // Header status chip on the dark panel: neutral pill, the status carries the
  // shell status hue on the dot only (never color-only — the label names it).
  const headerStatusDotClass = effectiveStatus === "assigned"
    ? "bg-[var(--admin-status-ok)]"
    : effectiveStatus === "reserved"
      ? "bg-[var(--admin-status-warn)]"
      : effectiveStatus === "unavailable"
        ? "bg-[var(--admin-status-bad)]"
        : "bg-[var(--admin-status-neutral)]";
  // Solid status tag (Seat section): shell status hue + AA text partner,
  // measured against the 2026-07-23 harmonized tokens: white on #1D6E41 ≈
  // 6.2:1, #161616 on #f1c21b ≈ 10.6:1, white on #B3232C ≈ 6.5:1, #161616 on
  // #8E8276 ≈ 4.9:1. Re-measure all four arms whenever these tokens move —
  // the assigned arm shipped a 2.89:1 fail when the green darkened untested.
  const statusTagClass = effectiveStatus === "assigned"
    ? "bg-[var(--admin-status-ok)] text-white"
    : effectiveStatus === "reserved"
      ? "bg-[var(--admin-status-warn)] text-[var(--sp-color-text-primary)]"
      : effectiveStatus === "unavailable"
        ? "bg-[var(--admin-status-bad)] text-white"
        : "bg-[var(--admin-status-neutral)] text-[var(--sp-color-text-primary)]";
  const fieldErrorMap = fieldErrors.reduce<Partial<Record<SeatInspectorField, string>>>((current, error) => {
    current[error.field] = error.message;
    return current;
  }, {});
  const inspectorStateLabel = pending
    ? "Saving draft…"
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
    ? "bg-[rgb(var(--admin-status-bad-rgb)/0.15)] text-[var(--admin-chrome-danger-text)]"
    : pending || isDirty
      ? "bg-[rgb(var(--admin-status-warn-rgb)/0.10)] text-[var(--admin-status-warn)]"
      : "bg-[rgb(var(--admin-status-ok-rgb)/0.15)] text-[var(--admin-chrome-success-text)]";
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
    "!border-white/20 !bg-[var(--admin-chrome-raised)] !text-[var(--admin-chrome-text)] hover:!border-white/30 hover:!bg-[var(--admin-chrome-raised-hover)] hover:!text-white disabled:!border-white/10 disabled:!bg-[var(--admin-chrome-elevated)] disabled:!text-[var(--admin-chrome-disabled)]";
  const fieldErrorClassName = "border-[var(--admin-status-bad)] focus:border-[var(--admin-status-bad)] focus:ring-[rgb(var(--admin-status-bad-rgb)/0.40)]";
  const warningSurfaceClassName = "border-[rgb(var(--admin-status-warn-rgb)/0.40)] bg-[rgb(var(--admin-status-warn-rgb)/0.10)] text-[var(--admin-status-warn)]";
  const neutralPillClassName = "bg-white/10 text-[var(--admin-chrome-text-soft)] ring-white/15";
  const successPillClassName = "bg-[rgb(var(--admin-status-ok-rgb)/0.15)] text-[var(--admin-chrome-success-text)] ring-[rgb(var(--admin-status-ok-rgb)/0.40)]";

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
    // The notes field lives in the Notes section body, which is only mounted
    // while the section is open — open it first, then focus on the next frame
    // so the target has mounted. rAF is harmless for the always-mounted
    // editor fields too.
    if (field === "notes") setOpenSections(current => ({ ...current, notes: true }));
    window.requestAnimationFrame(() => target.current?.focus());
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
    // The notes bounds messages lead with the field name ("Notes must be
    // 1000 characters or fewer.", lib/schemas.ts); routing them here makes
    // the notes error row and its auto-open focus branch reachable.
    if (/^notes\b/i.test(message)) return [{ field: "notes", message }];
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
        // force_move vacated another seat server-side; hand the parent the
        // fresh draft payload it needs to reconcile that seat's bumped
        // updated_at instead of reconstructing it from a stale local copy.
        onSeatUpdated(updated, beforeSnapshot, input.forceMove ? { seats: result.seats, employees: result.employees } : undefined);
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

  function handleDeleteSeat() {
    if (!selectedSeatCanDelete || pending) return;
    onDeleteSeat();
  }

  function toggleSection(key: InspectorSectionKey) {
    setOpenSections(current => ({ ...current, [key]: !current[key] }));
  }

  // [&>option] colors: native select popups ignore the control's own classes,
  // so without these Windows dark mode paints OS-colored options against the
  // dark panel (#200) — same pattern as FilterPanel's selectClassName.
  const fieldClassName = "mt-1 w-full border border-white/20 bg-white/[0.06] px-3 py-2 text-sm font-medium text-[var(--admin-chrome-text)] outline-none transition placeholder:text-[var(--admin-chrome-disabled)] focus:border-[var(--admin-primary)] focus:ring-2 focus:ring-[color:var(--admin-primary-border)] disabled:bg-white/[0.03] disabled:text-[var(--admin-chrome-disabled)] [&>option]:bg-[var(--admin-chrome-hover)] [&>option]:text-[var(--admin-chrome-text)]";
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

  if (collapsed) return null;

  return (
    <>
    <aside
      id="seat-inspector-panel"
      tabIndex={-1}
      aria-label={canEdit ? "Selected draft seat inspector" : "Selected published seat details"}
      aria-labelledby="seat-inspector-title"
      className={`fixed inset-x-3 bottom-3 z-[80] flex max-h-[60vh] flex-col overflow-hidden border border-white/[0.14] bg-[var(--admin-chrome-bg)] text-[var(--admin-chrome-text)] shadow-elevation-4 panel:inset-x-auto ${panelBottomClassName} panel:right-3 panel:top-[calc(var(--admin-chrome-h)+0.75rem)] panel:z-40 panel:max-h-none panel:w-[332px] panel:max-w-[calc(100vw-1.5rem)]`}
    >
      <div className="sticky top-0 z-20 flex flex-col gap-2.5 border-b border-white/10 bg-[var(--admin-chrome-bg)] px-4 pb-3 pt-3.5">
        <div className="flex items-start gap-2.5">
          <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[image:var(--admin-avatar-gradient)] text-[11px] font-bold text-white">
            {occupantInitials}
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="seat-inspector-title" className="truncate text-[15.5px] font-semibold leading-6 text-white">
              {formatDisplayName(assignmentIdentityLabel) || "Open seat"}
            </h2>
            <div className="truncate text-[12px] leading-4 text-[var(--admin-chrome-muted)]">{occupantRoleLabel}</div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button type="button" onClick={onClose} aria-label="Close inspector" title="Close" className="flex h-7 w-7 items-center justify-center text-[var(--admin-chrome-muted)] transition hover:bg-[var(--admin-chrome-hover)] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-primary)]"><CloseIcon /></button>
          </div>
        </div>
        {/* Variant C meta: status pill owns state; code + zone are plain trailing facts. */}
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-[var(--admin-chrome-heading)] ring-1 ring-white/15">
            <span aria-hidden="true" className={["h-2 w-2 rounded-full", headerStatusDotClass].join(" ")} />
            {currentStatusLabel}
          </span>
          <span className="min-w-0 truncate text-[11px] font-medium text-[var(--admin-chrome-heading)]">
            <span className="font-mono">{selectedSeat.label}</span>
            <span className="text-[var(--admin-chrome-muted)]"> · </span>
            <span className="text-[var(--admin-chrome-muted)]">{currentZone}</span>
          </span>
          {!canEdit && (
            <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-[var(--admin-chrome-muted)] ring-1 ring-white/15">Published seat</span>
          )}
        </div>
      </div>

      {canEdit ? (
        <form id="seat-inspector-form" onSubmit={handleSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {/* Save-state announcements sit outside the disclosure bodies:
                content inside a collapsed (unmounted) section is never read
                by assistive tech. */}
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
                    className="bg-white/10 px-3 py-1.5 font-semibold text-[var(--admin-status-warn)] ring-1 ring-[rgb(var(--admin-status-warn-rgb)/0.40)] transition hover:bg-white/15 active:scale-[0.97] active:duration-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-status-warn)]"
                  >
                    Clear selection
                  </button>
                  {onClearSearchContext && (
                    <button
                      type="button"
                      onClick={onClearSearchContext}
                      className="bg-white/10 px-3 py-1.5 font-semibold text-[var(--admin-status-warn)] ring-1 ring-[rgb(var(--admin-status-warn-rgb)/0.40)] transition hover:bg-white/15 active:scale-[0.97] active:duration-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-status-warn)]"
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
                className="mx-4 mt-3 border border-[rgb(var(--admin-status-bad-rgb)/0.40)] bg-[rgb(var(--admin-status-bad-rgb)/0.10)] p-3 text-xs text-[var(--admin-chrome-danger-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-status-bad)]"
              >
                <h3 id="seat-inspector-error-title" className="font-bold text-[var(--admin-chrome-danger-text)]">Review inspector fields</h3>
                <p className="mt-1 font-medium leading-5">{localError}</p>
                {fieldErrors.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {fieldErrors.map(error => (
                      <li key={`${error.field}-${error.message}`}>
                        <button
                          type="button"
                          onClick={() => focusInspectorField(error.field)}
                          className="text-left font-bold underline decoration-[rgb(var(--admin-status-bad-rgb)/0.60)] underline-offset-2 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-status-bad)]"
                        >
                          {error.message}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {/* Editor for the progressive assignment flow (v12 slice 4): the
                footer CTA below (Assign employee / Edit assignment) opens
                this; Save/Cancel live in the commit bar. The disclosure
                sections hide while this is open. */}
            {editingAssignment ? (
              <div className="border-b border-white/10 px-4 pb-3 pt-3">
                <section ref={assignmentSectionRef} aria-labelledby="seat-assignment-heading">
                <SectionHeading id="seat-assignment-heading" title={hasCurrentAssignment ? "Assignment" : "Assign this seat"} />
                <p id={employeeHelpId} className="mt-1.5 text-xs leading-5 text-[var(--admin-chrome-muted)]">{hasCurrentAssignment ? "Change or clear the draft assignment below." : "Search an existing employee or type a new name."}</p>

                <label className="mt-3 block">
                  <span className="text-[12px] font-medium tracking-normal text-[var(--admin-chrome-muted)]">Employee name</span>
                  <div className="relative">
                    <input
                      ref={employeeInputRef}
                      name="employeeName"
                      autoComplete="off"
                      spellCheck={false}
                      value={form.employeeName}
                      onChange={handleEmployeeNameChange}
                      onFocus={() => setEmployeeComboboxOpen(true)}
                      onBlur={() => window.setTimeout(() => setEmployeeComboboxOpen(false), 120)}
                      onKeyDown={handleEmployeeNameKeyDown}
                      placeholder="Search or enter employee name…"
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
                        className="absolute z-50 mt-1 max-h-[min(16rem,40vh)] w-full overflow-auto border border-white/15 bg-[var(--admin-chrome-raised)] p-1 shadow-elevation-3"
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
                              index === activeEmployeeIndex ? "bg-white/10 text-white" : "text-[var(--admin-chrome-text-soft)] hover:bg-white/5"
                            ].join(" ")}
                          >
                            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-bold text-[var(--admin-primary-cta)]">
                              {buildInitials(option.employee.full_name) || "?"}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold">{formatDisplayName(option.employee.full_name)}</span>
                              <span className="block truncate text-xs text-[var(--admin-chrome-muted)]">{option.meta}</span>
                            </span>
                            <span className="shrink-0 rounded-full bg-white/10 px-2 py-1 font-mono text-[10px] font-semibold tracking-normal text-[var(--admin-chrome-text-soft)] ring-1 ring-white/15">
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
                    <p id={fieldErrorId("employeeName")} className="mt-1 text-xs font-semibold text-[var(--admin-chrome-danger-text)]">{fieldErrorMap.employeeName}</p>
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
                    <span className="text-[12px] font-medium tracking-normal text-[var(--admin-chrome-muted)]">Job title</span>
                    <input
                      ref={employeePositionRef}
                      name="employeePosition"
                      autoComplete="off"
                      value={form.employeePosition}
                      onChange={event => handleTextChange("employeePosition", event)}
                      placeholder="e.g. Case Manager…"
                      aria-invalid={Boolean(fieldErrorMap.employeePosition)}
                      aria-describedby={fieldDescribedBy("employeePosition")}
                      className={fieldClassName}
                    />
                    {fieldErrorMap.employeePosition && <p id={fieldErrorId("employeePosition")} className="mt-1 text-xs font-semibold text-[var(--admin-chrome-danger-text)]">{fieldErrorMap.employeePosition}</p>}
                  </label>

                  <label className="block">
                    <span className="text-[12px] font-medium tracking-normal text-[var(--admin-chrome-muted)]">Phone extension</span>
                    <input
                      ref={phoneExtensionRef}
                      name="phoneExtension"
                      type="tel"
                      autoComplete="off"
                      value={form.phoneExtension}
                      onChange={event => handleTextChange("phoneExtension", event)}
                      placeholder="e.g. 202…"
                      className={fieldClassName}
                      inputMode="numeric"
                      aria-invalid={Boolean(fieldErrorMap.phoneExtension)}
                      aria-describedby={fieldDescribedBy("phoneExtension")}
                    />
                    {fieldErrorMap.phoneExtension && <p id={fieldErrorId("phoneExtension")} className="mt-1 text-xs font-semibold text-[var(--admin-chrome-danger-text)]">{fieldErrorMap.phoneExtension}</p>}
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
                  {fieldErrorMap.department && <p id={fieldErrorId("department")} className="mt-1 text-xs font-semibold text-[var(--admin-chrome-danger-text)]">{fieldErrorMap.department}</p>}
                </label>
                </section>
              </div>
            ) : (
              <div key={`seat-inspector-sections-${selectedSeat.id}`} className="px-4 pb-2 pt-1">
                {/* Contact, not "Occupant": the sticky header already carries
                    the identity (name, position · department) — this section
                    holds only the reach-them facts. Renders only when someone
                    is assigned. */}
                {hasCurrentAssignment && (
                  <div className="border-b border-white/5">
                    <DisclosureSectionHeader id="seat-contact-heading" bodyId="seat-inspector-contact" title="Contact" open={openSections.contact} onToggle={() => toggleSection("contact")} />
                    {openSections.contact && (
                      <div id="seat-inspector-contact" className="pb-3">
                        <ContactFacts
                          canEdit
                          rows={buildContactRows({
                            email: (matchedEmployee ?? selectedSeat.employee)?.email,
                            extension: form.phoneExtension
                          })}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Seat actions — the reseat verbs (Move / Swap / Vacate,
                    hide-not-disable on their handlers), the Status control for
                    OPEN seats (occupied seats derive "assigned" from the
                    occupant; the meta pill carries the tag), and Delete.
                    Collapsible per the 2026-08-18 owner spec (supersedes the
                    2026-07-16 "actions never collapse" ruling for these verbs;
                    the primary CTA and commit bar stay pinned outside). */}
                <div className="border-b border-white/5">
                  <DisclosureSectionHeader id="seat-actions-heading" bodyId="seat-inspector-actions" title="Seat actions" open={openSections.actions} onToggle={() => toggleSection("actions")} />
                  {openSections.actions && (
                    <div id="seat-inspector-actions" role="group" aria-labelledby="seat-actions-heading" className="pb-3">
                      {(onMove || onSwap || onVacate) && (
                        <div role="group" aria-label={`Actions for seat ${selectedSeat.label}`} className="flex gap-px">
                          {hasCurrentAssignment && onMove && (
                            <button type="button" onClick={onMove} disabled={pending || busy}
                              aria-label={selectedSeat.employee?.full_name ? `Move ${selectedSeat.employee.full_name} to another seat` : `Move ${selectedSeat.label}`}
                              className="flex flex-1 flex-col items-center gap-1 bg-[var(--admin-chrome-raised)] py-2 text-[11px] font-semibold text-[var(--admin-chrome-action-text)] transition hover:bg-[var(--admin-chrome-raised-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-primary)] disabled:opacity-40">
                              <MoveGlyph />Move
                            </button>
                          )}
                          {onSwap && (
                            <button type="button" onClick={onSwap} disabled={pending || busy} aria-label={`Swap ${selectedSeat.label}`} className="flex flex-1 flex-col items-center gap-1 bg-[var(--admin-chrome-raised)] py-2 text-[11px] font-semibold text-[var(--admin-chrome-action-text)] transition hover:bg-[var(--admin-chrome-raised-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-primary)] disabled:opacity-40">
                              <SwapGlyph />Swap
                            </button>
                          )}
                          {hasCurrentAssignment && onVacate && (
                            <button type="button" onClick={onVacate} disabled={pending || busy} aria-label={`Vacate ${selectedSeat.label}`}
                              className="flex flex-1 flex-col items-center gap-1 bg-[var(--admin-chrome-danger-raised)] py-2 text-[11px] font-semibold text-[var(--admin-chrome-danger-text)] transition hover:bg-[rgb(var(--admin-status-bad-rgb)/0.25)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-primary)] disabled:opacity-40">
                              <VacateGlyph />Vacate
                            </button>
                          )}
                        </div>
                      )}
                      {!hasAssignedPerson && (
                        <label className="mt-2 block">
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
                          {fieldErrorMap.status && <p id={fieldErrorId("status")} className="mt-1 text-xs font-semibold text-[var(--admin-chrome-danger-text)]">{fieldErrorMap.status}</p>}
                        </label>
                      )}
                      {/* Figma delete treatment: full-width low-emphasis button +
                          visible helper line. Rendered only for deletable-class
                          seats: custom AND not a protected-original label — the
                          label guard makes the gate immune to is_custom data
                          drift on original seats. */}
                      {selectedSeat.is_custom && !isProtectedOriginalSeatLabel(selectedSeat.label) && (
                        <>
                          <Button
                            type="button"
                            onClick={handleDeleteSeat}
                            disabled={pending || !selectedSeatCanDelete}
                            aria-label={`Delete custom seat ${selectedSeat.label}`}
                            aria-describedby="seat-inspector-delete-help"
                            title={deleteHelpText}
                            className="mt-2 min-w-0 w-full whitespace-normal leading-tight !border-transparent !bg-[var(--admin-chrome-raised)] !text-[var(--admin-chrome-danger-text)] !shadow-none hover:!border-transparent hover:!bg-[rgb(var(--admin-status-bad-rgb)/0.20)] disabled:!border-transparent disabled:!bg-[var(--admin-chrome-elevated)] disabled:!text-[var(--admin-chrome-disabled)] disabled:hover:!bg-[var(--admin-chrome-elevated)]"
                          >
                            Delete seat
                          </Button>
                          <p id="seat-inspector-delete-help" className="mt-1.5 text-[12px] leading-4 text-[var(--admin-chrome-muted)]">{deleteHelpText}</p>
                        </>
                      )}
                    </div>
                  )}
                </div>

                <div className="border-b border-white/5">
                  <DisclosureSectionHeader bodyId="seat-inspector-notes" title="Notes" open={openSections.notes} onToggle={() => toggleSection("notes")} />
                  {openSections.notes && (
                    <div id="seat-inspector-notes" className="pb-3">
                      <label className="block">
                        <span className="sr-only">Seat note</span>
                        <textarea
                          ref={notesRef}
                          name="seatNote"
                          value={form.notes}
                          onChange={event => handleTextChange("notes", event)}
                          placeholder="Add a seat note…"
                          aria-invalid={Boolean(fieldErrorMap.notes)}
                          aria-describedby={fieldDescribedBy("notes")}
                          className={`${fieldClassName} min-h-20`}
                        />
                        {fieldErrorMap.notes && <p id={fieldErrorId("notes")} className="mt-1 text-xs font-semibold text-[var(--admin-chrome-danger-text)]">{fieldErrorMap.notes}</p>}
                      </label>
                    </div>
                  )}
                </div>

                <div>
                  <DisclosureSectionHeader bodyId="seat-inspector-activity" title="Activity" open={openSections.activity} onToggle={() => toggleSection("activity")} />
                  {openSections.activity && (
                    <div id="seat-inspector-activity" className="pb-3">
                      {activityEntries.length > 0 ? (
                        <ul>
                          {activityEntries.map((entry, index) => (
                            <li key={`${entry}-${index}`} className="border-b border-white/5 py-1.5 text-[12px] leading-4 text-[var(--admin-chrome-muted)] last:border-b-0">
                              <span className="font-medium text-[var(--admin-chrome-text-soft)]">{entry}</span>
                              <span className="ml-1.5">· this session</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-[12px] leading-4 text-[var(--admin-chrome-muted)]">No draft edits to this seat in this session. Saved changes appear here until publish.</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Ask Planner stays the panel's last word — tertiary, after the
              scroll area; the verbs live in the action zone above. */}
          {onExplainSeat && <AskPlannerSeatRow seat={selectedSeat} onExplainSeat={onExplainSeat} />}

          {canEdit && !showCommitBar && (
            <div className="border-t border-white/10">
              <button type="button" onClick={startAssignmentEditing} disabled={pending} ref={primaryActionRef}
                aria-expanded={editingAssignment} aria-controls="seat-inspector-form"
                aria-label={hasCurrentAssignment ? `Edit assignment for ${selectedSeat.label}` : `Assign an employee to ${selectedSeat.label}`}
                className="h-12 w-full bg-[var(--admin-primary-cta)] text-[14px] font-semibold text-white transition hover:bg-[var(--admin-primary-cta-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white disabled:opacity-40">
                {hasCurrentAssignment ? "Edit assignment" : "Assign employee"}
              </button>
            </div>
          )}

          {showCommitBar && (
            <div id="seat-inspector-commit-bar" className="border-t border-white/10 bg-[var(--admin-chrome-commit-bg)] px-4 py-3">
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
                <Button type="button" onClick={handleCancelEditing} aria-label={`Cancel editing ${selectedSeat.label}`} className={`min-w-0 px-4 ${footerNeutralButtonClass}`}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={pending || !isDirty}
                  aria-label={`${primaryActionLabel} for ${selectedSeat.label}`}
                  aria-describedby={saveDisabledReason ? "seat-inspector-save-help" : undefined}
                  title={saveDisabledReason ?? `${primaryActionLabel} for ${selectedSeat.label}`}
                  className="min-w-0 w-full whitespace-normal !border-[var(--admin-primary-cta)] !bg-[var(--admin-primary-cta)] !text-white hover:!border-[var(--admin-primary-cta-hover)] hover:!bg-[var(--admin-primary-cta-hover)] disabled:!border-[var(--admin-state-neutral-border)] disabled:!bg-[var(--admin-state-neutral-bg)] disabled:!text-[var(--admin-text-subtle)] disabled:shadow-none disabled:hover:!border-[var(--admin-state-neutral-border)] disabled:hover:!bg-[var(--admin-state-neutral-bg)]"
                >
                  {primaryActionLabel}
                </Button>
              </div>
            </div>
          )}
        </form>
      ) : (
        // Viewer inspector: Contact + Seat only — no disclosure sections,
        // seat-action verbs, AI row, or footer. The data is the
        // published assignment snapshot.
        //
        // tabIndex: the region must stay keyboard-scrollable on its own (axe
        // scrollable-region-focusable) — unlike the admin form above, this
        // read-only branch has no focusable descendant guaranteed (an open
        // seat renders facts only), so an overflowing panel would otherwise
        // be unreachable by keyboard. Same contract as the viewer lists in
        // ViewerSeatFinder.
        <div
          role="region"
          aria-label="Published seat details"
          tabIndex={0}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-focus)]"
        >
          <div key={`seat-inspector-sections-${selectedSeat.id}`} className="px-4 pb-4 pt-3.5">
            {hasCurrentAssignment && (
              <section aria-labelledby="published-contact-heading">
                <h3 id="published-contact-heading" className={eyebrowHeadingClass}>CONTACT</h3>
                <p className="sr-only">Published assignment</p>
                <ContactFacts
                  canEdit={false}
                  rows={buildContactRows({
                    email: selectedSeat.employee?.email,
                    extension: selectedSeat.employee?.phone_extension
                  })}
                />
              </section>
            )}
            <section aria-labelledby="published-details-heading" className={hasCurrentAssignment ? "mt-3" : ""}>
              <h3 id="published-details-heading" className={eyebrowHeadingClass}>SEAT</h3>
              <dl>
                <div className="flex items-center justify-between gap-2.5 py-1.5">
                  <dt className="shrink-0 text-[12.5px] text-[var(--admin-chrome-muted)]">Status</dt>
                  <dd><span className={["inline-block px-2 py-0.5 text-[10px] font-semibold", statusTagClass].join(" ")}>{currentStatusLabel}</span></dd>
                </div>
              </dl>
            </section>
          </div>
        </div>
      )}
    </aside>

    {/* The vacate confirm moved to SeatMap with the verb itself — the canvas
        bar raises it, and it confirms EVERY time rather than only on unsaved
        edits, because a transient surface earns less trust than this panel. */}

    {moveConflict && (
      <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[rgb(var(--sp-color-workspace-deep-rgb)/0.45)] p-3 backdrop-blur-[2px] sm:z-[70] sm:items-center">
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
          className="w-full max-w-md rounded-2xl border border-[var(--sp-color-border-subtle)] bg-[rgb(var(--sp-color-surface-rgb)/0.95)] p-4 text-[var(--sp-color-text-primary)] shadow-[0_26px_80px_rgba(23,26,29,0.32)] backdrop-blur-2xl"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="move-employee-confirm-title" className="text-base font-black">Move {formatDisplayName(moveConflict.employeeName)} to {formatSeatCode(selectedSeat.label)}?</h2>
              <p id="move-employee-confirm-description" className="mt-1 text-sm leading-5 text-[var(--sp-color-text-muted)]">
                They currently sit at {formatSeatCode(moveConflict.currentSeatLabel)}. Moving frees {formatSeatCode(moveConflict.currentSeatLabel)} (it becomes Open).
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
              {PUBLISH_IMPACT_NOTE}
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
