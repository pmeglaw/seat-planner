"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { ChangeEvent, FormEvent, KeyboardEvent, ReactNode } from "react";
import { clientActionErrorMessage } from "@/lib/clientActionError";
import type { DraftSnapshot } from "@/lib/draftHistory";
import type { DepartmentOption, Employee, SeatStatus, SeatWithEmployee } from "@/lib/types";
import { STATUS_LABELS } from "@/lib/types";
import { updateSeatAction } from "@/app/actions";
import { canDeleteSeat, getSeatDeleteBlockReason } from "@/lib/seatProtection";
import { PUBLISH_IMPACT_NOTE } from "@/lib/copy";
import { buildContactRows, employeeAssignmentFields, type ContactFactRow } from "@/lib/employeeAssignment";
import { formatDisplayName, formatSeatCode } from "@/lib/formatName";
import { Button } from "@/components/ui/Button";
import { SeatMark, seatMarkKindFor } from "@/components/seat-map/SeatMark";
import { CheckIcon, CopyIcon } from "@/components/seat-map/mapIcons";
import { NotificationGlyph } from "@/components/seat-map/CanvasStatus";
import { withQueryParam, withSeatParam } from "@/lib/deepLink";
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
  // "Changed in draft" (P3-14): from the publish diff (lib/draftChanges), the
  // same set that badges the pill — the inspector says it in text so the ◇ is
  // never the only carrier.
  draftChanged?: boolean;
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

// Flat sections (2026-08-19 Carbon handoff, owner-approved): Contact metadata /
// Seat management / Workspace notes / Activity render always-mounted with
// hairline dividers — the 2026-08-18 progressive disclosure is retired.

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

// Display-only timestamp for the footer facts (reference image: "Last
// updated"). The draft-concurrency fence still passes seat.updated_at back to
// the server VERBATIM — never this parsed/formatted copy (the header comment
// in lib/draftConcurrency.ts explains why re-parsing through Date is banned
// on that path). The formatter is module-level because Intl.DateTimeFormat
// construction is expensive and this runs on every inspector render.
const seatTimestampFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
function formatSeatTimestamp(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return seatTimestampFormat.format(date);
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

// Copy-link glyph (specimen #i-link): the seat's `?seat=` and the person's
// `?q=` share links (D1-e), an icon button with the tier-C tooltip.
function LinkGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6.5 9.5a3 3 0 0 0 4.2 0l2-2a3 3 0 0 0-4.2-4.2l-1 1" />
      <path d="M9.5 6.5a3 3 0 0 0-4.2 0l-2 2a3 3 0 0 0 4.2 4.2l1-1" />
    </svg>
  );
}

// Flat section eyebrow (2026-08-19 Carbon handoff): a static h3 — never a
// toggle. Sections stay in the document outline and their bodies never
// unmount; hairline dividers between sections carry the grouping.
function InspectorSectionLabel({ id, title }: { id?: string; title: string }) {
  return (
    <h3 id={id} className="sp-slot-section mt-2">{title}</h3>
  );
}

// Contact facts hide fields with nothing on file instead of rendering "—"
// dash rows (2026-07-16 critique carryover) — an absent row reads as "nothing
// recorded"; a column of dashes reads as broken. When NOTHING is on file, one
// quiet line says so, and admins get pointed at Management (where profiles
// are completed).
//
// Handoff treatment: email is a mailto link, the extension carries a copy
// affordance with an inline "Copied" confirmation (no toast system — the
// label flip is the feedback). Both variants get these: they read, never edit.
function ContactFacts({ rows, canEdit, personName }: { rows: ContactFactRow[]; canEdit: boolean; personName?: string }) {
  const [copiedValue, setCopiedValue] = useState<string | null>(null);
  const copyResetTimerRef = useRef<number | null>(null);
  useEffect(() => () => {
    if (copyResetTimerRef.current !== null) window.clearTimeout(copyResetTimerRef.current);
  }, []);

  async function copyText(key: string, value: string) {
    // window.navigator explicitly: the ct harness installs jsdom on window,
    // while bare `navigator` resolves to Node's own global there.
    const clipboard = window.navigator.clipboard;
    if (!clipboard?.writeText) return; // no API → no false "Copied"
    try {
      await clipboard.writeText(value);
      setCopiedValue(key);
      if (copyResetTimerRef.current !== null) window.clearTimeout(copyResetTimerRef.current);
      copyResetTimerRef.current = window.setTimeout(() => setCopiedValue(null), 2000);
    } catch {
      // Clipboard denied/unavailable: leave the label alone rather than lie.
    }
  }
  // Copy link for the person (D1-e): a share URL that lands on them (`?q=`).
  const personLink = personName ? `${typeof window === "undefined" ? "" : window.location.origin}/${withQueryParam("", personName)}` : null;

  return (
    <>
      {rows.length === 0 && (
        <p className="cds-helper pb-1">
          No contact details on file.{canEdit ? " Add them from the Management page." : ""}
        </p>
      )}
      <dl className="m-0">
        {rows.map(row => (
          <div key={row.label} className="sp-contact-row">
            <dt>{row.label}</dt>
            <dd>
              {row.label === "Email" ? (
                <a href={`mailto:${row.value}`} className="text-[var(--sp-link)] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--sp-focus)]">
                  {row.value}
                </a>
              ) : row.value}
            </dd>
            {row.label === "Extension" ? (
              <span className="sp-has-tooltip">
                <button
                  type="button"
                  onClick={() => void copyText(`extension:${row.value}`, row.value)}
                  aria-label={`Copy extension ${row.value}`}
                  data-done={copiedValue === `extension:${row.value}` ? "Copied" : undefined}
                  className="cds-btn cds-btn--icon cds-touch-target"
                >
                  {copiedValue === `extension:${row.value}` ? <CheckIcon /> : <CopyIcon />}
                  {/* Live confirmation for screen readers (and the ct test's
                      /Copied/ anchor) — the icon swap alone is silent. */}
                  <span role="status" className="sr-only">{copiedValue === `extension:${row.value}` ? "Copied" : ""}</span>
                </button>
                <span className="sp-tooltip" role="tooltip">Copy extension</span>
              </span>
            ) : <span />}
          </div>
        ))}
        {personLink && (
          <div className="sp-contact-row">
            <dt>Link</dt>
            <dd className="sp-person-role m-0">Link to this person</dd>
            <span className="sp-has-tooltip">
              <button
                type="button"
                onClick={() => void copyText("person-link", personLink)}
                aria-label="Copy link to this person"
                data-done={copiedValue === "person-link" ? "Copied" : undefined}
                className="cds-btn cds-btn--icon cds-touch-target"
              >
                {copiedValue === "person-link" ? <CheckIcon /> : <LinkGlyph />}
                <span role="status" className="sr-only">{copiedValue === "person-link" ? "Copied" : ""}</span>
              </button>
              <span className="sp-tooltip" role="tooltip">Copy link to this person</span>
            </span>
          </div>
        )}
      </dl>
    </>
  );
}

// AI entry row (PHASE3DS §1.18, P3-7): the `.sp-ai-label` is the ONLY AI
// styling on this surface — a contact-row-shaped button whose hover steps
// the label text (the hover-surface rule, §7 item 2) through the one AI token
// this file may consume. Factored into its own component so the AI token
// stays provably confined here — the accessibility-source guardrail counts
// every occurrence of that token in this file and asserts they all fall
// inside this function. The prop is named `seat` per that contract; it is
// aliased to `selectedSeat` locally so the aria-label text stays
// byte-identical to this row's pre-extraction form.
function AskPlannerSeatRow({ seat: selectedSeat, onExplainSeat }: { seat: SeatWithEmployee; onExplainSeat: (seat: SeatWithEmployee) => void }) {
  return (
    <button
      type="button"
      onClick={() => onExplainSeat(selectedSeat)}
      aria-label={`Ask Planner about ${selectedSeat.label}`}
      className="sp-contact-row mt-4 w-full grid-cols-[auto_1fr_auto] text-left hover:[&_.sp-ai-label]:text-[var(--sp-ai-label-text-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--sp-focus)]"
    >
      <span className="sp-ai-label" aria-hidden="true">AI</span>
      <span className="min-w-0 truncate">Ask Planner about this seat</span>
      <span aria-hidden="true" className="text-[var(--sp-icon-secondary)]"><ChevronRightIcon /></span>
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
  draftChanged = false,
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
  const [moveConflict, setMoveConflict] = useState<{
    employeeName: string;
    currentSeatLabel: string;
    input: Parameters<typeof updateSeatAction>[0];
    beforeSnapshot: DraftSnapshot;
  } | null>(null);
  // PR-5 (§8.1): the move-conflict dialog holds open through the force_move
  // round-trip, so its failure renders in-dialog (PR-4 recipe) — never on the
  // inspector's error summary under the scrim.
  const [moveConflictError, setMoveConflictError] = useState<string | null>(null);
  const moveConflictErrorRef = useRef<HTMLDivElement | null>(null);
  // Copy link (D1-e): the seat's share URL (`?seat=`); in-place "Copied" for 2s.
  const [copiedLink, setCopiedLink] = useState<"seat" | null>(null);
  useEffect(() => {
    if (!copiedLink) return;
    const timer = window.setTimeout(() => setCopiedLink(null), 2000);
    return () => window.clearTimeout(timer);
  }, [copiedLink]);
  const activeSeatIdRef = useRef<string | null>(null);
  const activeSeatSnapshotRef = useRef(formSnapshot(emptyForm));
  const resetSignalRef = useRef(resetSignal);
  const errorSummaryRef = useRef<HTMLDivElement | null>(null);
  const primaryActionRef = useRef<HTMLButtonElement | null>(null);
  const pendingPrimaryFocusRef = useRef(false);
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

  // Consumes the focus intent from focusPrimaryActionSoon() on the first
  // commit that actually has the primary CTA mounted. Commit-driven rather
  // than a rAF because on the save path the CTA cannot mount until the
  // transition commit flips `pending` false (showCommitBar depends on it) —
  // under load that lands later than any single frame, so a lone rAF found
  // primaryActionRef null, no-opped, and focus fell to <body> when the
  // commit bar unmounted (SI-01).
  useEffect(() => {
    if (pendingPrimaryFocusRef.current && primaryActionRef.current) {
      pendingPrimaryFocusRef.current = false;
      primaryActionRef.current.focus();
    }
  });

  const resetInspectorDraftForm = useCallback((nextForm: SeatInspectorForm) => {
    // A seat switch or external reset invalidates any queued focus handoff.
    pendingPrimaryFocusRef.current = false;
    activeSeatSnapshotRef.current = formSnapshot(nextForm);
    setForm(nextForm);
    setInitialForm(nextForm);
    setLocalError(null);
    setFieldErrors([]);
    setSaveFeedback(null);
    setEditingAssignment(false);
    setEmployeeComboboxOpen(false);
    setActiveEmployeeIndex(0);
    setMoveConflict(null);
    setMoveConflictError(null);
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
      setMoveConflictError(null);
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
  const lastUpdatedLabel = formatSeatTimestamp(selectedSeat.updated_at);
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
  // Header identity reflects the SAVED occupant only — a staged, unsaved pick
  // must not flip the header, or the panel claims an assignment that doesn't
  // exist yet (the draft-impact pill carries the unsaved-state signal).
  const assignmentIdentityLabel = hasCurrentAssignment ? selectedSeatEmployeeName : "";
  const occupantRoleLabel = hasCurrentAssignment
    ? [selectedSeat.employee?.position, selectedSeat.employee?.department].filter(Boolean).join(" · ") || "Employee"
    : "Unassigned";
  async function copyLink(kind: "seat") {
    const href = `${window.location.origin}${window.location.pathname}${withSeatParam("", selectedSeat.label)}`;
    try {
      await window.navigator.clipboard.writeText(href);
      setCopiedLink(kind);
    } catch {
      // Clipboard unavailable (insecure context / permissions): nothing to undo.
    }
  }

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
    // Every field is always mounted (flat sections); the rAF keeps focus off
    // the current event turn so summary-entry clicks settle first.
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
    // A force_move run is the move-conflict dialog's confirm (its only caller
    // here): the dialog stays open through the flight, so failures route to
    // its in-dialog alert instead of the error summary under the scrim (PR-5).
    const fromMoveConflictDialog = Boolean(input.forceMove);
    function showMoveConflictError(message: string) {
      setMoveConflictError(message);
      window.requestAnimationFrame(() => moveConflictErrorRef.current?.focus());
    }
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
            setMoveConflict(null);
            setMoveConflictError(null);
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
          if (fromMoveConflictDialog) {
            showMoveConflictError(result.message);
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
        setMoveConflict(null);
        setMoveConflictError(null);
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
        const message = clientActionErrorMessage(error, "Could not update assignment.");
        if (fromMoveConflictDialog) {
          showMoveConflictError(message);
          return;
        }
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
    // PR-5 (§8.1): the dialog holds open through the round-trip — success and
    // stale close it inside runSeatAssignment, failure renders in-dialog.
    setMoveConflictError(null);
    // Re-run the exact same assignment; force_move vacates the old seat atomically.
    runSeatAssignment({ ...input, forceMove: true }, beforeSnapshot);
  }

  function handleResetEdits() {
    resetInspectorDraftForm(initialForm);
  }

  // After Cancel or a successful save the commit bar (and the button the
  // keyboard user just activated) unmounts — hand focus to the pinned
  // primary action that re-renders in the header (critique action 5). Sets
  // an intent consumed by the commit-driven effect above the early return;
  // the CTA may not exist yet when this is called (see that effect).
  function focusPrimaryActionSoon() {
    pendingPrimaryFocusRef.current = true;
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

  const legendKind = seatMarkKindFor(effectiveStatus);
  const eyebrow = `Seat ${formatSeatCode(selectedSeat.label)} · ${currentZone}`;

  return (
    <>
    <aside
      id="seat-inspector-panel"
      tabIndex={-1}
      aria-label={canEdit ? "Selected draft seat inspector" : "Selected published seat details"}
      aria-labelledby="seat-inspector-title"
      // The 400px right slot (PHASE3DS §1.17, D2-a): RightSlot's host owns
      // presence and the slide; this aside is the slot itself — header ·
      // scrolling body · commit bar (64, bleeds). No z-index of its own: the
      // host stacks above the canvas, the shell's panels float above it.
      className="sp-slot max-w-full"
      data-draft-changed={draftChanged || undefined}
    >
      <div className="sp-slot-header">
        <div className="min-w-0">
          <div className="sp-slot-eyebrow">{eyebrow}</div>
          {/* Header identity reflects the SAVED occupant only — a staged,
              unsaved pick must not flip the header. */}
          <h2 id="seat-inspector-title" className="sp-slot-title">
            {formatDisplayName(assignmentIdentityLabel) || "Open seat"}
          </h2>
        </div>
        <div className="sp-slot-actions">
          <span className="sp-has-tooltip">
            <button
              type="button"
              className="cds-btn cds-btn--icon cds-btn--md cds-touch-target"
              aria-label="Copy link to this seat"
              data-done={copiedLink === "seat" ? "Copied" : undefined}
              onClick={() => void copyLink("seat")}
            >
              {copiedLink === "seat" ? <CheckIcon /> : <LinkGlyph />}
              <span role="status" className="sr-only">{copiedLink === "seat" ? "Copied" : ""}</span>
            </button>
            <span className="sp-tooltip" role="tooltip">Copy link to this seat</span>
          </span>
          <button type="button" onClick={onClose} aria-label="Close inspector" className="cds-btn cds-btn--icon cds-btn--md cds-touch-target"><CloseIcon /></button>
        </div>
      </div>

      {canEdit ? (
        <form id="seat-inspector-form" onSubmit={handleSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="sp-slot-body">
            {/* Save-state announcements: a stable sr-only live region at the
                top of the form. */}
            <div role="status" aria-live="polite" className="sr-only">
              {inspectorStateLabel}
            </div>
            {/* Legend row (the mark IS the status signal) + the draft note from
                the publish diff (P3-14) — the text is the third signal. */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
              <span className="sp-seat-legend"><SeatMark kind={legendKind} />{currentStatusLabel}</span>
              {draftChanged && <span className="sp-draft-note"><SeatMark kind="draft-badge" />Changed in draft</span>}
            </div>
            {hasCurrentAssignment && <div className="sp-person-role mt-3">{occupantRoleLabel}</div>}

            {searchMismatchNotice && (
              <div className="cds-notification cds-notification--info mt-3" role="status">
                <NotificationGlyph kind="info" />
                <div className="cds-notification-text">
                  <strong>{searchMismatchNotice}</strong>
                  <p>
                    <button type="button" className="cds-btn cds-btn--ghost cds-btn--sm" onClick={onClose}>Clear selection</button>
                    {onClearSearchContext && (
                      <button type="button" className="cds-btn cds-btn--ghost cds-btn--sm" onClick={onClearSearchContext}>{searchMismatchClearLabel}</button>
                    )}
                  </p>
                </div>
              </div>
            )}

            {localError && (
              <section
                ref={errorSummaryRef}
                tabIndex={-1}
                role="alert"
                aria-labelledby="seat-inspector-error-title"
                className="cds-notification cds-notification--error mt-3 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--sp-focus)]"
              >
                <NotificationGlyph kind="error" />
                <div className="cds-notification-text">
                  <strong id="seat-inspector-error-title">Couldn&apos;t save this seat</strong>
                  <p>{localError}</p>
                  {fieldErrors.length > 0 && (
                    <ul className="mt-1 list-none p-0">
                      {fieldErrors.map(error => (
                        <li key={`${error.field}-${error.message}`}>
                          <button type="button" className="cds-btn cds-btn--ghost cds-btn--sm" onClick={() => focusInspectorField(error.field)}>
                            {error.message}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            )}

            {/* The one primary of this container while nothing is being
                edited: opens the assignment form below (progressive
                disclosure kept; the commit bar takes over while a save could
                be pending). Identity (ref, labels, aria, disabled rule) is
                unchanged so the focus-handoff contract keeps landing here. */}
            {!showCommitBar && (
              <button type="button" onClick={startAssignmentEditing} disabled={pending} ref={primaryActionRef}
                aria-expanded={editingAssignment} aria-controls="seat-inspector-form"
                aria-label={hasCurrentAssignment ? `Edit assignment for ${selectedSeat.label}` : `Assign an employee to ${selectedSeat.label}`}
                className="cds-btn cds-btn--primary cds-btn--md mt-4 w-full justify-between">
                {hasCurrentAssignment ? "Edit assignment" : "Assign employee"}
                <ChevronRightIcon />
              </button>
            )}

            {/* Editor for the progressive assignment flow: the CTA above
                opens this; Save / Cancel live in the commit bar. The flat
                sections hide while this is open. */}
            {editingAssignment ? (
              <section ref={assignmentSectionRef} aria-labelledby="seat-assignment-heading" className="mt-4">
                <h3 id="seat-assignment-heading" className="sp-slot-section">{hasCurrentAssignment ? "Assignment" : "Assign this seat"}</h3>
                <p id={employeeHelpId} className="cds-helper mb-3">{hasCurrentAssignment ? "Change or clear the draft assignment below." : "Search an existing employee or type a new name."}</p>

                <div className="cds-form">
                  <div className="cds-form-item" data-invalid={fieldErrorMap.employeeName ? "" : undefined}>
                    <label htmlFor="seat-inspector-employee-name">Employee name</label>
                    <div className="sp-combobox" data-open={employeeComboboxOpen || undefined}>
                      <input
                        id="seat-inspector-employee-name"
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
                        className="cds-text-input"
                      />
                      <button
                        type="button"
                        aria-label="Show employee options"
                        onMouseDown={event => event.preventDefault()}
                        onClick={() => {
                          setEmployeeComboboxOpen(current => !current);
                          employeeInputRef.current?.focus();
                        }}
                        className="cds-btn cds-btn--icon cds-btn--sm absolute right-1 top-1"
                      >
                        <ChevronDownIcon />
                      </button>
                      {employeeComboboxOpen && (
                        <ul id="seat-inspector-employee-listbox" role="listbox" className="sp-listbox">
                          {filteredEmployeeOptions.length > 0 ? filteredEmployeeOptions.map((option, index) => (
                            <li
                              key={option.employee.id}
                              id={`seat-inspector-employee-option-${option.employee.id}`}
                              role="option"
                              aria-selected={form.employeeId === option.employee.id}
                              data-state={index === activeEmployeeIndex ? "hover" : undefined}
                              onMouseDown={event => event.preventDefault()}
                              onMouseEnter={() => setActiveEmployeeIndex(index)}
                              onClick={() => selectEmployee(option.employee)}
                            >
                              <span className="min-w-0 truncate">{formatDisplayName(option.employee.full_name)}</span>
                              <span className="sp-listbox-meta">{option.assignedSeatLabel}</span>
                            </li>
                          )) : (
                            <li role="option" aria-selected="true" className="sp-listbox-create" onMouseDown={event => event.preventDefault()} onClick={() => setEmployeeComboboxOpen(false)}>
                              Create “{employeeNameValue}”<span className="sp-listbox-meta">new employee</span>
                            </li>
                          )}
                        </ul>
                      )}
                    </div>
                    {fieldErrorMap.employeeName && (
                      <div id={fieldErrorId("employeeName")} className="cds-helper">{fieldErrorMap.employeeName}</div>
                    )}
                    <div className="sp-create-note">
                      <span id={employeeStateId} className={employeeNameValue && !matchedEmployee ? "cds-tag" : "cds-helper"}>
                        {assignmentStateText}
                      </span>
                      {showNewEmployeeNotice && (
                        <span id="seat-inspector-new-employee-notice" role="note" className="cds-helper">
                          No existing employee matches. Saving creates “{employeeNameValue}” and assigns this draft seat. Viewers see it only after publish.
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="cds-form-item" data-invalid={fieldErrorMap.employeePosition ? "" : undefined}>
                    <label htmlFor="seat-inspector-employee-position">Job title <span className="cds-optional">(optional)</span></label>
                    <input
                      id="seat-inspector-employee-position"
                      ref={employeePositionRef}
                      name="employeePosition"
                      autoComplete="off"
                      value={form.employeePosition}
                      onChange={event => handleTextChange("employeePosition", event)}
                      placeholder="e.g. Case Manager"
                      aria-invalid={Boolean(fieldErrorMap.employeePosition)}
                      aria-describedby={fieldDescribedBy("employeePosition")}
                      className="cds-text-input"
                    />
                    {fieldErrorMap.employeePosition && <div id={fieldErrorId("employeePosition")} className="cds-helper">{fieldErrorMap.employeePosition}</div>}
                  </div>

                  <div className="cds-form-item" data-invalid={fieldErrorMap.phoneExtension ? "" : undefined}>
                    <label htmlFor="seat-inspector-phone-extension">Phone extension <span className="cds-optional">(optional)</span></label>
                    <input
                      id="seat-inspector-phone-extension"
                      ref={phoneExtensionRef}
                      name="phoneExtension"
                      type="tel"
                      autoComplete="off"
                      value={form.phoneExtension}
                      onChange={event => handleTextChange("phoneExtension", event)}
                      placeholder="e.g. 202"
                      className="cds-text-input"
                      inputMode="numeric"
                      aria-invalid={Boolean(fieldErrorMap.phoneExtension)}
                      aria-describedby={fieldDescribedBy("phoneExtension")}
                    />
                    {fieldErrorMap.phoneExtension && <div id={fieldErrorId("phoneExtension")} className="cds-helper">{fieldErrorMap.phoneExtension}</div>}
                  </div>

                  <div className="cds-form-item" data-invalid={fieldErrorMap.department ? "" : undefined}>
                    <label htmlFor="seat-inspector-department">Department</label>
                    <select
                      id="seat-inspector-department"
                      ref={departmentRef}
                      value={form.department}
                      onChange={handleDepartmentChange}
                      aria-invalid={Boolean(fieldErrorMap.department)}
                      aria-describedby={fieldDescribedBy("department")}
                      className="cds-select"
                    >
                      <option value="">No department</option>
                      {departments.map(department => (
                        <option key={department} value={department}>{department}</option>
                      ))}
                    </select>
                    {fieldErrorMap.department && <div id={fieldErrorId("department")} className="cds-helper">{fieldErrorMap.department}</div>}
                  </div>
                </div>
              </section>
            ) : (
              <div key={`seat-inspector-sections-${selectedSeat.id}`}>
                {/* Contact metadata, not "Occupant": the header already carries
                    the identity (name, position · department) — this section
                    holds only the reach-them facts. Renders only when someone
                    is assigned. */}
                {hasCurrentAssignment && (
                  <div>
                    <InspectorSectionLabel id="seat-contact-heading" title="Contact metadata" />
                    <div id="seat-inspector-contact">
                      <ContactFacts
                        canEdit
                        personName={selectedSeatEmployeeName}
                        rows={buildContactRows({
                          email: (matchedEmployee ?? selectedSeat.employee)?.email,
                          extension: form.phoneExtension
                        })}
                      />
                    </div>
                  </div>
                )}

                {/* Seat management — the reseat verbs (Move / Swap / Vacate,
                    hide-not-disable on their handlers), the Status control for
                    OPEN seats (occupied seats derive "assigned" from the
                    occupant; the legend row carries the label), and Delete.
                    Always mounted (flat sections: "seat ops never collapse"). */}
                <div>
                  <InspectorSectionLabel id="seat-actions-heading" title="Actions" />
                  <div id="seat-inspector-actions" role="group" aria-labelledby="seat-actions-heading">
                    {(onMove || onSwap || onVacate) && (
                      <div role="group" aria-label={`Actions for seat ${selectedSeat.label}`} className="sp-actions">
                        {hasCurrentAssignment && onMove && (
                          <button type="button" onClick={onMove} disabled={pending || busy} className="cds-btn cds-btn--ghost"
                            aria-label={selectedSeat.employee?.full_name ? `Move ${selectedSeat.employee.full_name} to another seat` : `Move ${selectedSeat.label}`}>
                            Move
                          </button>
                        )}
                        {onSwap && (
                          <button type="button" onClick={onSwap} disabled={pending || busy} aria-label={`Swap ${selectedSeat.label}`} className="cds-btn cds-btn--ghost">
                            Swap
                          </button>
                        )}
                        {hasCurrentAssignment && onVacate && (
                          <button type="button" onClick={onVacate} disabled={pending || busy} aria-label={`Vacate ${selectedSeat.label}`} className="cds-btn cds-btn--ghost">
                            Vacate
                          </button>
                        )}
                      </div>
                    )}
                    {!hasAssignedPerson && (
                      <div className="cds-form-item mt-3" data-invalid={fieldErrorMap.status ? "" : undefined}>
                        <label htmlFor="seat-inspector-status">Status</label>
                        <select
                          id="seat-inspector-status"
                          ref={statusRef}
                          value={effectiveStatus}
                          onChange={handleStatusChange}
                          aria-invalid={Boolean(fieldErrorMap.status)}
                          aria-describedby={fieldDescribedBy("status")}
                          className="cds-select"
                        >
                          <option value="available">{STATUS_LABELS.available}</option>
                          <option value="reserved">{STATUS_LABELS.reserved}</option>
                          <option value="unavailable">{STATUS_LABELS.unavailable}</option>
                        </select>
                        {fieldErrorMap.status && <div id={fieldErrorId("status")} className="cds-helper">{fieldErrorMap.status}</div>}
                      </div>
                    )}
                    {/* Delete = the danger ghost (P3-8), shown only for a
                        deletable custom draft seat — a delete that can never
                        fire is Hidden, never disabled (owner ruling 2026-08-20;
                        the seatProtection rule). The reason is helper text
                        outside the button either way. */}
                    {selectedSeatCanDelete ? (
                      <>
                        <div className="sp-actions mt-4">
                          <button
                            type="button"
                            onClick={handleDeleteSeat}
                            disabled={pending}
                            aria-label={`Delete custom seat ${selectedSeat.label}`}
                            aria-describedby="seat-inspector-delete-help"
                            className="cds-btn cds-btn--danger-ghost"
                          >
                            Delete seat
                          </button>
                        </div>
                        <p id="seat-inspector-delete-help" className="sp-block-reason">{deleteHelpText}</p>
                      </>
                    ) : (
                      <p id="seat-inspector-delete-help" className="sp-block-reason mt-4">Delete seat: {selectedSeatDeleteBlockReason ?? "unavailable for this seat."}</p>
                    )}
                  </div>
                </div>

                <div>
                  <InspectorSectionLabel id="seat-notes-heading" title="Workspace notes" />
                  <div id="seat-inspector-notes">
                    <div className="cds-form-item" data-invalid={fieldErrorMap.notes ? "" : undefined}>
                      <label htmlFor="seat-inspector-note">Seat note <span className="cds-optional">(optional)</span></label>
                      <textarea
                        id="seat-inspector-note"
                        ref={notesRef}
                        name="seatNote"
                        value={form.notes}
                        onChange={event => handleTextChange("notes", event)}
                        placeholder="Add a seat note…"
                        aria-invalid={Boolean(fieldErrorMap.notes)}
                        aria-describedby={fieldDescribedBy("notes")}
                        className="sp-textarea"
                      />
                      {fieldErrorMap.notes && <div id={fieldErrorId("notes")} className="cds-helper">{fieldErrorMap.notes}</div>}
                    </div>
                  </div>
                </div>

                <div>
                  <InspectorSectionLabel id="seat-activity-heading" title="Activity" />
                  <div id="seat-inspector-activity">
                    {activityEntries.length > 0 ? (
                      <ul className="m-0 list-none p-0">
                        {activityEntries.map((entry, index) => (
                          <li key={`${entry}-${index}`} className="sp-contact-row grid-cols-[1fr_auto]">
                            <span className="text-[var(--sp-text-secondary)]">{entry}</span>
                            <span className="cds-helper">this session</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="cds-helper">No draft edits to this seat in this session. Saved changes appear here until publish.</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Ask Planner stays the panel's last word — after the sections;
                the verbs live in Actions and the primary sits above. */}
            {onExplainSeat && <AskPlannerSeatRow seat={selectedSeat} onExplainSeat={onExplainSeat} />}

            {/* Facts footer: seat identity + recency, quieter than everything
                above. Display-only — the concurrency fence keeps sending
                updated_at back verbatim, never this formatted copy. */}
            <footer id="seat-inspector-footer" className="sp-field-counter mt-4">
              <span className="min-w-0 truncate">ID: {selectedSeat.label}</span>
              {lastUpdatedLabel && <span className="min-w-0 truncate">Updated {lastUpdatedLabel}</span>}
            </footer>
          </div>

          {/* Saved confirmation, inline in the region (never a toast): the
              success kind of the one notification component. */}
          {saveFeedback && !isDirty && !pending && !localError && (
            <div className="cds-notification cds-notification--success mx-5 mb-3" role="status">
              <NotificationGlyph kind="success" />
              <div className="cds-notification-text"><strong>{saveFeedback}</strong></div>
            </div>
          )}

          {/* The commit bar is chrome, not content: OUTSIDE the scroll area
              whenever a save could be pending, so no scroll state can hide
              Save / Cancel. Its primary is this container's own. */}
          {showCommitBar && (
            <div id="seat-inspector-commit-bar" className="sp-commit-bar">
              {saveDisabledReason && (
                <span id="seat-inspector-save-help" className="sr-only">
                  {saveDisabledReason}
                </span>
              )}
              <button type="button" onClick={handleCancelEditing} aria-label={`Cancel editing ${selectedSeat.label}`} className="cds-btn cds-btn--ghost" disabled={pending}>
                Cancel
              </button>
              <button
                type="submit"
                disabled={!isDirty || pending}
                aria-busy={pending || undefined}
                aria-label={`${primaryActionLabel} for ${selectedSeat.label}`}
                aria-describedby={saveDisabledReason ? "seat-inspector-save-help" : undefined}
                title={saveDisabledReason ?? `${primaryActionLabel} for ${selectedSeat.label}`}
                className="cds-btn cds-btn--primary"
              >
                {pending ? "Saving…" : primaryActionLabel}
              </button>
            </div>
          )}
        </form>
      ) : (
        // Viewer inspector: Contact only — no admin sections, seat-action
        // verbs, AI row, or footer. The data is the published assignment
        // snapshot. tabIndex: the region must stay keyboard-scrollable on its
        // own (axe scrollable-region-focusable) — this read-only branch has
        // no focusable descendant guaranteed (an open seat renders no body
        // content), so an overflowing panel would otherwise be unreachable.
        <div
          role="region"
          aria-label="Published seat details"
          tabIndex={0}
          className="sp-slot-body focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--sp-focus)]"
        >
          <div key={`seat-inspector-sections-${selectedSeat.id}`}>
            <span className="sp-seat-legend"><SeatMark kind={legendKind} />{currentStatusLabel}</span>
            {hasCurrentAssignment && (
              <section aria-labelledby="published-contact-heading" className="mt-3">
                <h3 id="published-contact-heading" className="sp-slot-section">CONTACT</h3>
                <p className="sr-only">Published assignment</p>
                <div className="sp-person-role">{occupantRoleLabel}</div>
                <ContactFacts
                  canEdit={false}
                  personName={selectedSeatEmployeeName}
                  rows={buildContactRows({
                    email: selectedSeat.employee?.email,
                    extension: selectedSeat.employee?.phone_extension
                  })}
                />
              </section>
            )}
          </div>
        </div>
      )}
    </aside>

    {/* The vacate confirm moved to SeatMap with the verb itself — the canvas
        bar raises it, and it confirms EVERY time rather than only on unsaved
        edits, because a transient surface earns less trust than this panel. */}

    {moveConflict && (
      <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[color-mix(in_srgb,var(--sp-overlay)_45%,transparent)] p-3 backdrop-blur-[2px] sm:z-[70] sm:items-center">
        <section
          ref={moveConflictDialogFocusRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="move-employee-confirm-title"
          aria-describedby="move-employee-confirm-description"
          onKeyDown={event => {
            if (event.key === "Escape" && !pending) {
              event.stopPropagation();
              setMoveConflict(null);
              setMoveConflictError(null);
            }
          }}
          className="w-full max-w-md rounded-[16px] border border-[var(--sp-border-subtle)] bg-[color-mix(in_srgb,var(--sp-layer-01)_95%,transparent)] p-4 text-[var(--sp-text-primary)] shadow-[0_26px_80px_rgba(23,26,29,0.32)] backdrop-blur-2xl"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="move-employee-confirm-title" className="text-base font-black">Move {formatDisplayName(moveConflict.employeeName)} to {formatSeatCode(selectedSeat.label)}?</h2>
              <p id="move-employee-confirm-description" className="mt-1 text-sm leading-5 text-[var(--sp-text-helper)]">
                They currently sit at {formatSeatCode(moveConflict.currentSeatLabel)}. Moving frees {formatSeatCode(moveConflict.currentSeatLabel)} (it becomes Open).
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setMoveConflict(null);
                setMoveConflictError(null);
              }}
              disabled={pending}
              className="relative flex h-8 w-8 items-center justify-center rounded-full text-sm font-black text-[var(--sp-text-helper)] transition after:absolute after:-inset-1.5 hover:bg-[var(--sp-layer-accent)] hover:text-[var(--sp-text-secondary)] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus)]"
              aria-label="Cancel moving employee"
            >
              <CloseIcon />
            </button>
          </div>

          <div className="mt-4 grid gap-2">
            <div className="rounded-[12px] border border-[var(--sp-status-warning-mark)] bg-[var(--sp-status-warning-surface)] p-3 text-sm font-semibold leading-5 text-[var(--sp-status-warning-text)]">
              {PUBLISH_IMPACT_NOTE}
            </div>
          </div>

          {moveConflictError && !pending && (
            <div
              ref={moveConflictErrorRef}
              tabIndex={-1}
              role="alert"
              className="mt-4 rounded-[12px] border border-[var(--sp-status-error-mark)] bg-[var(--sp-status-error-surface)] p-3 text-sm font-semibold leading-5 text-[var(--sp-status-error-text)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus)]"
            >
              <span className="font-semibold">Move did not complete.</span> {moveConflictError}
            </div>
          )}

          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button
              type="button"
              onClick={() => {
                setMoveConflict(null);
                setMoveConflictError(null);
              }}
              disabled={pending}
              className="w-full"
            >
              Cancel
            </Button>
            <Button type="button" variant="primary" onClick={confirmMoveEmployee} loading={pending} className="w-full">
              {pending ? "Moving…" : moveConflictError ? "Retry move" : "Move them"}
            </Button>
          </div>
        </section>
      </div>
    )}
    </>
  );
}
