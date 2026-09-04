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
  // Default is the shipped 12px gutter; the admin map passes panel:bottom-[52px]
  // so the side panel clears its 40px status band plus the same gutter. A
  // class, not a number: it must compose with the panel: variant at build time.
  // Edit-mode only: the viewer variant is top-anchored and content-height
  // (panel:bottom-auto), so it never reaches the band and ignores this prop.
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
// Type-floor Ruling 3 (2026-08-24): eyebrows hold the 12px floor; they read
// as subordinate through weight + the muted helper token, never through size.
const eyebrowHeadingClass = "text-xs font-semibold tracking-[0.12em] text-[var(--sp-text-helper)]";

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

// Seat-action verb glyphs (v12 slice 4's icon action row, now inside the
// flat Seat management section; prototype "Seat Planner v12 Prototype.dc.html"
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

// 2026-08-19 reference-image pass: the primary CTA, Contact rows, and Delete
// gain small leading glyphs (same ~15px / 1.5-stroke family as the seat verbs
// above, all aria-hidden — the text labels carry the meaning).
function PencilGlyph() {
  return (
    <svg aria-hidden="true" width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m13.2 3.6 3.2 3.2L7 16.2l-3.8.6.6-3.8Z" />
    </svg>
  );
}

function MailGlyph() {
  return (
    <svg aria-hidden="true" width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="4.5" width="15" height="11" />
      <path d="m3 5.5 7 5.5 7-5.5" />
    </svg>
  );
}

function PhoneGlyph() {
  return (
    <svg aria-hidden="true" width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 3.5h3l1.5 3.5-2 1.5a10.5 10.5 0 0 0 5 5l1.5-2 3.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5C8.5 17.5 2.5 11.5 2.5 5A1.5 1.5 0 0 1 4 3.5Z" />
    </svg>
  );
}

function CopyGlyph() {
  return (
    <svg aria-hidden="true" width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="7" y="7" width="9.5" height="9.5" />
      <path d="M13 3.5H3.5V13" />
    </svg>
  );
}

function CheckGlyph() {
  return (
    <svg aria-hidden="true" width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m4 10.5 4 4 8-8.5" />
    </svg>
  );
}

function PinGlyph() {
  return (
    <svg aria-hidden="true" width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 17.5s-6-5.2-6-9.3a6 6 0 0 1 12 0c0 4.1-6 9.3-6 9.3Z" />
      <circle cx="10" cy="8" r="2.2" />
    </svg>
  );
}

function TrashGlyph() {
  return (
    <svg aria-hidden="true" width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 5.5h13M8 5.5V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M5.5 5.5 6.3 16a1 1 0 0 0 1 .9h5.4a1 1 0 0 0 1-.9l.8-10.5" />
      <path d="M8.3 8.5v5M11.7 8.5v5" />
    </svg>
  );
}

// Heading row used inside the progressive assignment editor — distinct from
// the InspectorSectionLabel eyebrows the flat sections use below.
function SectionHeading({ id, title }: { id?: string; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <h3 id={id} className="shrink-0 text-[12px] font-semibold text-[var(--sp-text-primary)]">{title}</h3>
      <span aria-hidden="true" className="h-px min-w-4 flex-1 bg-[var(--sp-border-subtle)]" />
    </div>
  );
}

// Flat section eyebrow (2026-08-19 Carbon handoff): a static h3 — never a
// toggle. Sections stay in the document outline and their bodies never
// unmount; hairline dividers between sections carry the grouping.
function InspectorSectionLabel({ id, title }: { id?: string; title: string }) {
  return (
    <h3 id={id} className="pb-2.5 pt-3.5 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--sp-text-helper)]">{title}</h3>
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
function ContactFacts({ rows, canEdit }: { rows: ContactFactRow[]; canEdit: boolean }) {
  const [copiedValue, setCopiedValue] = useState<string | null>(null);
  const copyResetTimerRef = useRef<number | null>(null);
  useEffect(() => () => {
    if (copyResetTimerRef.current !== null) window.clearTimeout(copyResetTimerRef.current);
  }, []);

  async function copyExtension(value: string) {
    // window.navigator explicitly: the ct harness installs jsdom on window,
    // while bare `navigator` resolves to Node's own global there.
    const clipboard = window.navigator.clipboard;
    if (!clipboard?.writeText) return; // no API → no false "Copied"
    try {
      await clipboard.writeText(value);
      setCopiedValue(value);
      if (copyResetTimerRef.current !== null) window.clearTimeout(copyResetTimerRef.current);
      copyResetTimerRef.current = window.setTimeout(() => setCopiedValue(null), 2000);
    } catch {
      // Clipboard denied/unavailable: leave the label alone rather than lie.
    }
  }

  if (rows.length === 0) {
    return (
      <p className="pb-1 text-[12.5px] leading-4 text-[var(--sp-text-helper)]">
        No contact details on file.{canEdit ? " Add them from the Management page." : ""}
      </p>
    );
  }
  return (
    <div className="space-y-2.5 pb-1">
      {rows.map(row => (
        <div key={row.label} className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <span aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--sp-text-helper)]">
              {row.label === "Email" ? <MailGlyph /> : <PhoneGlyph />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="mb-0.5 text-xs leading-none text-[var(--sp-text-helper)]">
                {row.label === "Email" ? "Email address" : "Internal extension"}
              </p>
              {row.label === "Email" ? (
                <a
                  href={`mailto:${row.value}`}
                  className="block truncate text-[13px] font-medium text-[var(--sp-link)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sp-focus)]"
                >
                  {row.value}
                </a>
              ) : (
                <p className="truncate font-mono text-[13px] font-medium text-[var(--sp-text-primary)]">{row.value}</p>
              )}
            </div>
          </div>
          {row.label === "Extension" && (
            <button
              type="button"
              onClick={() => copyExtension(row.value)}
              aria-label={`Copy extension ${row.value}`}
              title={copiedValue === row.value ? "Copied" : `Copy extension ${row.value}`}
              className="relative flex h-8 w-8 shrink-0 items-center justify-center bg-[var(--sp-background)] text-[var(--sp-link-hover)] transition after:absolute after:-inset-x-1.5 after:-inset-y-[5px] hover:bg-[var(--sp-layer-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sp-focus)]"
            >
              {copiedValue === row.value ? <CheckGlyph /> : <CopyGlyph />}
              {/* Live confirmation for screen readers (and the ct test's
                  /Copied/ anchor) — the icon swap alone is silent. */}
              <span role="status" className="sr-only">{copiedValue === row.value ? "Copied" : ""}</span>
            </button>
          )}
        </div>
      ))}
    </div>
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
      className="mx-4 mb-3 flex w-auto items-center justify-between gap-3 border border-[var(--sp-border-subtle)] border-l-4 border-l-[var(--sp-ai-accent)] bg-[var(--sp-layer-01)] px-3.5 py-3 text-left transition hover:border-[var(--sp-ai-accent)] hover:border-l-[var(--sp-ai-accent)] hover:bg-[var(--sp-ai-accent-soft)] active:scale-[0.985] active:duration-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sp-ai-accent)]"
    >
      <span className="min-w-0">
        <span className="mb-1 flex items-center gap-2 text-[var(--sp-ai-accent)]">
          <span className="border border-[var(--sp-ai-accent)] px-1 text-[9.5px] font-bold tracking-[0.04em]">AI</span>
          {/* Sanctioned eyebrow variant (owner ruling 2026-08-25): eyebrow
              metrics (semibold — uppercase + tracking already carry the
              emphasis; bold would be a third device), but the colour stays
              --sp-ai-accent from the wrapper: it marks an AI-touched surface,
              same vocabulary as the five-site "AI" badge. Contrast measured
              on the HOVER wash per the §6 rule: #8a3ffc on #f6f2ff = 4.54:1.
              Pinned in desktop-seat-marker-system-source.test.mjs. */}
          <span className="text-xs font-semibold uppercase tracking-[0.08em]">Ask Planner</span>
        </span>
        <span className="block truncate text-[13px] font-medium text-[var(--sp-text-primary)]">Ask Planner about this seat</span>
      </span>
      <span aria-hidden="true" className="shrink-0 leading-none text-[var(--sp-ai-accent)]"><ChevronRightIcon /></span>
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
  // Status chip (header meta row + published Seat section): SOFT PAIRS from
  // the --sp-editor-* families, whose light AND dark values are measured AA
  // together in globals.css — never a solid status fill with a hardcoded text
  // partner (white on the dark-theme --sp-status-success-mark #42be65 is ~2.2:1).
  // Never color-only: the label always names the status.
  const statusTagClass = effectiveStatus === "assigned"
    ? "bg-[var(--sp-editor-clean-bg)] text-[var(--sp-editor-clean-text)]"
    : effectiveStatus === "reserved"
      ? "bg-[var(--sp-editor-dirty-bg)] text-[var(--sp-editor-dirty-text)]"
      : effectiveStatus === "unavailable"
        ? "bg-[var(--sp-editor-error-bg)] text-[var(--sp-editor-error-text)]"
        : "bg-[var(--sp-editor-neutral-bg)] text-[var(--sp-editor-neutral-text)]";
  // Avatar presence dot: decorative (aria-hidden wrapper) — the chip above
  // carries the status label, so this is never the only signal.
  const avatarStatusDotClass = effectiveStatus === "assigned"
    ? "bg-[var(--sp-status-success-mark)]"
    : effectiveStatus === "reserved"
      ? "bg-[var(--sp-status-draft-mark)]"
      : effectiveStatus === "unavailable"
        ? "bg-[var(--sp-status-error-mark)]"
        : "bg-[var(--sp-status-neutral-mark)]";
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
  // Draft-impact pill: green when the seat matches the saved draft, teal
  // while edits are unsaved or saving, red when the last save failed. Soft
  // --sp-editor-* pairs — AA measured in globals.css for both themes.
  const inspectorStatePillClassName = localError
    ? "bg-[var(--sp-editor-error-bg)] text-[var(--sp-editor-error-text)]"
    : pending || isDirty
      ? "bg-[var(--sp-editor-dirty-bg)] text-[var(--sp-editor-dirty-text)]"
      : "bg-[var(--sp-editor-clean-bg)] text-[var(--sp-editor-clean-text)]";
  // Header identity reflects the SAVED occupant only — a staged, unsaved pick
  // must not flip the header, or the panel claims an assignment that doesn't
  // exist yet (the draft-impact pill carries the unsaved-state signal).
  const assignmentIdentityLabel = hasCurrentAssignment ? selectedSeatEmployeeName : "";
  const occupantInitials = buildInitials(formatDisplayName(assignmentIdentityLabel) || "Open seat") || "?";
  const occupantRoleLabel = hasCurrentAssignment
    ? [selectedSeat.employee?.position, selectedSeat.employee?.department].filter(Boolean).join(" · ") || "Employee"
    : "Unassigned";
  const fieldErrorClassName = "border-[var(--sp-status-error-mark)] focus:border-[var(--sp-status-error-mark)] focus:ring-[color-mix(in_srgb,var(--sp-status-error-mark)_40%,transparent)]";
  const warningSurfaceClassName = "border-[var(--sp-editor-dirty-border)] bg-[var(--sp-editor-dirty-bg)] text-[var(--sp-editor-dirty-text)]";
  const neutralPillClassName = "bg-[var(--sp-editor-neutral-bg)] text-[var(--sp-editor-neutral-text)] ring-[var(--sp-editor-neutral-border)]";
  const successPillClassName = "bg-[var(--sp-editor-clean-bg)] text-[var(--sp-editor-clean-text)] ring-[var(--sp-editor-clean-border)]";

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

  // [&>option] colors: native select popups ignore the control's own classes,
  // so without these Windows dark mode paints OS-colored options against the
  // panel (#200) — same pattern as FilterPanel's selectClassName. Field-01
  // treatment: --sp-field/--sp-field-border (the pair's 3:1 boundary
  // note lives in globals.css).
  const fieldClassName = "mt-1 w-full border border-[var(--sp-field-border)] bg-[var(--sp-field)] px-3 py-2 text-sm font-medium text-[var(--sp-text-primary)] outline-none transition placeholder:text-[var(--sp-text-helper)] focus:border-[var(--sp-interactive)] focus:ring-2 focus:ring-[color:var(--sp-border-interactive)] disabled:bg-[var(--sp-background)] disabled:text-[var(--sp-text-helper)] [&>option]:bg-[var(--sp-layer-01)] [&>option]:text-[var(--sp-text-primary)]";
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
      // Panel-tier height is variant-split: the admin form pins top AND bottom
      // (full column — the editor is long and the commit bar must stay put),
      // while the viewer card is top-anchored and content-height
      // (panel:bottom-auto; the base max-h-[60vh] cap stays as the overflow
      // fence) — a read-only card holding only identity + contact must not
      // stretch a full empty column (owner ruling 2026-08-20).
      className={`fixed inset-x-3 bottom-3 z-[80] flex max-h-[60vh] flex-col overflow-hidden border border-[var(--sp-border-strong)] bg-[var(--sp-layer-01)] text-[var(--sp-text-primary)] shadow-sp panel:inset-x-auto ${canEdit ? `${panelBottomClassName} panel:max-h-none` : "panel:bottom-auto"} panel:right-3 panel:top-[calc(var(--sp-chrome-height)+0.75rem)] panel:z-40 panel:w-[332px] panel:max-w-[calc(100vw-1.5rem)]`}
    >
      <div className="sticky top-0 z-20 flex flex-col gap-2.5 border-b border-[var(--sp-border-subtle)] bg-[var(--sp-layer-01)] px-4 pb-3 pt-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--sp-text-helper)]">Property Inspector</span>
          <button type="button" onClick={onClose} aria-label="Close inspector" title="Close" className="relative flex h-7 w-7 shrink-0 items-center justify-center text-[var(--sp-text-helper)] transition after:absolute after:-inset-2 hover:bg-[var(--sp-background)] hover:text-[var(--sp-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--sp-focus)]"><CloseIcon /></button>
        </div>
        <div className="flex items-start gap-2.5">
          <div className="min-w-0 flex-1">
            <h2 id="seat-inspector-title" className="truncate text-[19px] font-medium leading-6 text-[var(--sp-text-primary)]">
              {formatDisplayName(assignmentIdentityLabel) || "Open seat"}
            </h2>
            <div className="truncate text-[12.5px] leading-4 text-[var(--sp-text-helper)]">{occupantRoleLabel}</div>
          </div>
          {/* Monogram chip is a chrome-zone island (dark in both themes); the
              status dot re-enters the base zone so its ring keeps tracking the
              surrounding panel surface, exactly as before the zone model. */}
          <span aria-hidden="true" className="sp-zone-chrome relative flex h-10 w-10 shrink-0 items-center justify-center bg-[var(--sp-background)] text-[11px] font-bold text-[var(--sp-text-primary)]">
            {occupantInitials}
            <span className={["sp-zone-base absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 border-[var(--sp-layer-01)]", avatarStatusDotClass].join(" ")} />
          </span>
        </div>
        {/* Meta row: soft status chip owns state; pin + code · zone are plain trailing facts. */}
        <div className="flex min-w-0 items-center gap-2">
          <span className={["inline-flex shrink-0 items-center px-2.5 py-1 text-xs font-semibold leading-none", statusTagClass].join(" ")}>
            {currentStatusLabel}
          </span>
          <span className="flex min-w-0 items-center gap-1.5 truncate text-xs font-medium text-[var(--sp-text-secondary)]">
            <span aria-hidden="true" className="shrink-0 text-[var(--sp-button-primary)]"><PinGlyph /></span>
            <span className="font-mono">{selectedSeat.label}</span>
            <span className="text-[var(--sp-text-helper)]">·</span>
            <span className="truncate text-[var(--sp-text-helper)]">{currentZone}</span>
          </span>
        </div>
        {/* Primary CTA pinned under the header meta (2026-08-19 reference
            image; also restores the 2026-07-16 "pinned under the header"
            owner ruling verbatim). Lives in the sticky header so it can never
            scroll away or collapse; it yields to the commit bar while a save
            could be pending — same showCommitBar gate the old footer slot
            used. Identity (ref, labels, aria, disabled rule) is unchanged so
            the focus-handoff contract keeps landing here after Cancel/Save. */}
        {canEdit && !showCommitBar && (
          <button type="button" onClick={startAssignmentEditing} disabled={pending} ref={primaryActionRef}
            aria-expanded={editingAssignment} aria-controls="seat-inspector-form"
            aria-label={hasCurrentAssignment ? `Edit assignment for ${selectedSeat.label}` : `Assign an employee to ${selectedSeat.label}`}
            className="relative mt-0.5 flex h-10 w-full items-center justify-between gap-2 bg-[var(--sp-button-primary)] px-4 text-[13px] font-semibold text-white transition after:absolute after:-inset-y-0.5 after:inset-x-0 hover:bg-[var(--sp-button-primary-hover)] active:scale-[0.99] active:duration-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white disabled:opacity-40">
            <span className="flex items-center gap-2">
              <PencilGlyph />
              {hasCurrentAssignment ? "Edit assignment" : "Assign employee"}
            </span>
            <span aria-hidden="true" className="shrink-0 leading-none"><ChevronRightIcon /></span>
          </button>
        )}
      </div>

      {canEdit ? (
        <form id="seat-inspector-form" onSubmit={handleSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {/* Save-state announcements: a stable sr-only live region at the
                top of the form. */}
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
                    className="bg-[var(--sp-layer-01)] px-3 py-1.5 font-semibold text-[var(--sp-editor-dirty-text)] ring-1 ring-[var(--sp-editor-dirty-border)] transition hover:bg-[var(--sp-background)] active:scale-[0.97] active:duration-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sp-status-draft-mark)]"
                  >
                    Clear selection
                  </button>
                  {onClearSearchContext && (
                    <button
                      type="button"
                      onClick={onClearSearchContext}
                      className="bg-[var(--sp-layer-01)] px-3 py-1.5 font-semibold text-[var(--sp-editor-dirty-text)] ring-1 ring-[var(--sp-editor-dirty-border)] transition hover:bg-[var(--sp-background)] active:scale-[0.97] active:duration-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sp-status-draft-mark)]"
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
                className="mx-4 mt-3 border border-[var(--sp-editor-error-border)] bg-[var(--sp-editor-error-bg)] p-3 text-xs text-[var(--sp-editor-error-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--sp-status-error-mark)]"
              >
                <h3 id="seat-inspector-error-title" className="font-bold text-[var(--sp-editor-error-text)]">Review inspector fields</h3>
                <p className="mt-1 font-medium leading-5">{localError}</p>
                {fieldErrors.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {fieldErrors.map(error => (
                      <li key={`${error.field}-${error.message}`}>
                        <button
                          type="button"
                          onClick={() => focusInspectorField(error.field)}
                          className="text-left font-bold underline decoration-[var(--sp-editor-error-border)] underline-offset-2 transition hover:text-[var(--sp-status-error-mark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sp-status-error-mark)]"
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
                header CTA above (Assign employee / Edit assignment) opens
                this; Save/Cancel live in the commit bar. The flat sections
                hide while this is open. */}
            {editingAssignment ? (
              <div className="border-b border-[var(--sp-border-subtle)] px-4 pb-3 pt-3">
                <section ref={assignmentSectionRef} aria-labelledby="seat-assignment-heading">
                <SectionHeading id="seat-assignment-heading" title={hasCurrentAssignment ? "Assignment" : "Assign this seat"} />
                <p id={employeeHelpId} className="mt-1.5 text-xs leading-5 text-[var(--sp-text-helper)]">{hasCurrentAssignment ? "Change or clear the draft assignment below." : "Search an existing employee or type a new name."}</p>

                <label className="mt-3 block">
                  <span className="text-[12px] font-medium tracking-normal text-[var(--sp-text-helper)]">Employee name</span>
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
                      className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center text-xs text-[var(--sp-text-helper)] transition after:absolute after:-inset-2 hover:bg-[var(--sp-background)] hover:text-[var(--sp-text-primary)] active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sp-interactive)]"
                    >
                      <ChevronDownIcon />
                    </button>
                    {employeeComboboxOpen && (
                      <div
                        id="seat-inspector-employee-listbox"
                        role="listbox"
                        className="absolute z-50 mt-1 max-h-[min(16rem,40vh)] w-full overflow-auto border border-[var(--sp-border-strong)] bg-[var(--sp-layer-01)] p-1 shadow-sp"
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
                              "flex w-full items-start gap-3 px-3 py-2 text-left transition active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--sp-interactive)]",
                              index === activeEmployeeIndex ? "bg-[var(--sp-background)] text-[var(--sp-text-primary)]" : "text-[var(--sp-text-secondary)] hover:bg-[var(--sp-layer-hover)]"
                            ].join(" ")}
                          >
                            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--sp-layer-hover)] text-[11px] font-bold text-[var(--sp-link-hover)]">
                              {buildInitials(option.employee.full_name) || "?"}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold">{formatDisplayName(option.employee.full_name)}</span>
                              <span className="block truncate text-xs text-[var(--sp-text-helper)]">{option.meta}</span>
                            </span>
                            <span className="shrink-0 bg-[var(--sp-editor-neutral-bg)] px-2 py-1 font-mono text-[10px] font-semibold tracking-normal text-[var(--sp-text-secondary)] ring-1 ring-[var(--sp-editor-neutral-border)]">
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
                    <p id={fieldErrorId("employeeName")} className="mt-1 text-xs font-semibold text-[var(--sp-editor-error-text)]">{fieldErrorMap.employeeName}</p>
                  )}
                  <span id={employeeStateId} className={["mt-1 inline-flex rounded-full px-2 py-1 text-xs font-semibold tracking-normal ring-1", employeeNameValue ? matchedEmployee ? successPillClassName : "bg-[var(--sp-editor-dirty-bg)] text-[var(--sp-editor-dirty-text)] ring-[var(--sp-editor-dirty-border)]" : neutralPillClassName].join(" ")}>
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
                    <span className="text-[12px] font-medium tracking-normal text-[var(--sp-text-helper)]">Job title</span>
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
                    {fieldErrorMap.employeePosition && <p id={fieldErrorId("employeePosition")} className="mt-1 text-xs font-semibold text-[var(--sp-editor-error-text)]">{fieldErrorMap.employeePosition}</p>}
                  </label>

                  <label className="block">
                    <span className="text-[12px] font-medium tracking-normal text-[var(--sp-text-helper)]">Phone extension</span>
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
                    {fieldErrorMap.phoneExtension && <p id={fieldErrorId("phoneExtension")} className="mt-1 text-xs font-semibold text-[var(--sp-editor-error-text)]">{fieldErrorMap.phoneExtension}</p>}
                  </label>
                </div>

                <label className="mt-3 block">
                  <span className="text-[12px] font-medium tracking-normal text-[var(--sp-text-helper)]">Department</span>
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
                  {fieldErrorMap.department && <p id={fieldErrorId("department")} className="mt-1 text-xs font-semibold text-[var(--sp-editor-error-text)]">{fieldErrorMap.department}</p>}
                </label>
                </section>
              </div>
            ) : (
              <div key={`seat-inspector-sections-${selectedSeat.id}`} className="px-4 pb-2 pt-1">
                {/* Contact metadata, not "Occupant": the sticky header already
                    carries the identity (name, position · department) — this
                    section holds only the reach-them facts. Renders only when
                    someone is assigned. */}
                {hasCurrentAssignment && (
                  <div className="border-b border-[var(--sp-border-subtle)]">
                    <InspectorSectionLabel id="seat-contact-heading" title="Contact metadata" />
                    <div id="seat-inspector-contact" className="pb-3.5">
                      <ContactFacts
                        canEdit
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
                    occupant; the meta chip carries the tag), and Delete.
                    Always mounted (flat sections restore the 2026-07-16
                    "seat ops never collapse" ruling; the primary CTA and
                    commit bar stay pinned outside the scroll area). */}
                <div className="border-b border-[var(--sp-border-subtle)]">
                  <InspectorSectionLabel id="seat-actions-heading" title="Seat management" />
                  <div id="seat-inspector-actions" role="group" aria-labelledby="seat-actions-heading" className="pb-3.5">
                    {(onMove || onSwap || onVacate) && (
                      <div role="group" aria-label={`Actions for seat ${selectedSeat.label}`} className="flex divide-x divide-[var(--sp-border-subtle)] border border-[var(--sp-border-subtle)]">
                        {hasCurrentAssignment && onMove && (
                          <button type="button" onClick={onMove} disabled={pending || busy}
                            aria-label={selectedSeat.employee?.full_name ? `Move ${selectedSeat.employee.full_name} to another seat` : `Move ${selectedSeat.label}`}
                            className="flex h-[4.25rem] flex-1 flex-col items-center justify-center gap-1.5 bg-[var(--sp-layer-01)] text-xs font-semibold text-[var(--sp-text-primary)] transition hover:bg-[var(--sp-layer-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--sp-focus)] disabled:opacity-40">
                            <MoveGlyph />Move
                          </button>
                        )}
                        {onSwap && (
                          <button type="button" onClick={onSwap} disabled={pending || busy} aria-label={`Swap ${selectedSeat.label}`} className="flex h-[4.25rem] flex-1 flex-col items-center justify-center gap-1.5 bg-[var(--sp-layer-01)] text-xs font-semibold text-[var(--sp-text-primary)] transition hover:bg-[var(--sp-layer-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--sp-focus)] disabled:opacity-40">
                            <SwapGlyph />Swap
                          </button>
                        )}
                        {hasCurrentAssignment && onVacate && (
                          <button type="button" onClick={onVacate} disabled={pending || busy} aria-label={`Vacate ${selectedSeat.label}`}
                            className="flex h-[4.25rem] flex-1 flex-col items-center justify-center gap-1.5 bg-[var(--sp-layer-01)] text-xs font-semibold text-[var(--sp-text-primary)] transition hover:bg-[var(--sp-layer-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--sp-focus)] disabled:opacity-40">
                            <VacateGlyph />Vacate
                          </button>
                        )}
                      </div>
                    )}
                    {!hasAssignedPerson && (
                      <label className="mt-2 block">
                        <span className="text-[12px] font-medium tracking-normal text-[var(--sp-text-helper)]">Status</span>
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
                        {fieldErrorMap.status && <p id={fieldErrorId("status")} className="mt-1 text-xs font-semibold text-[var(--sp-editor-error-text)]">{fieldErrorMap.status}</p>}
                      </label>
                    )}
                    {/* Delete treatment: full-width OUTLINED danger button
                        with a trash glyph + visible helper line. Rendered only
                        when the seat is actually deletable (canDeleteSeat:
                        draft + custom + unassigned + available + not a
                        protected-original label) — a delete button that can
                        never fire must not appear at all, not appear disabled
                        (owner ruling 2026-08-20). Disabled covers only the
                        transient pending-save state. */}
                    {selectedSeatCanDelete && (
                      <>
                        <Button
                          type="button"
                          onClick={handleDeleteSeat}
                          disabled={pending}
                          aria-label={`Delete custom seat ${selectedSeat.label}`}
                          aria-describedby="seat-inspector-delete-help"
                          title={deleteHelpText}
                          className="mt-3 min-w-0 w-full gap-2 whitespace-normal leading-tight !border-[var(--sp-editor-danger-border)] !bg-transparent !text-[var(--sp-editor-error-text)] !shadow-none hover:!border-[var(--sp-status-error-mark)] hover:!bg-[var(--sp-editor-error-bg)] disabled:!border-[var(--sp-border-subtle)] disabled:!bg-[var(--sp-background)] disabled:!text-[var(--sp-text-helper)] disabled:hover:!bg-[var(--sp-background)]"
                        >
                          <TrashGlyph />
                          Delete seat
                        </Button>
                        <p id="seat-inspector-delete-help" className="mt-1.5 text-[12px] leading-4 text-[var(--sp-text-helper)]">{deleteHelpText}</p>
                      </>
                    )}
                  </div>
                </div>

                <div className="border-b border-[var(--sp-border-subtle)]">
                  <InspectorSectionLabel title="Workspace notes" />
                  <div id="seat-inspector-notes" className="pb-3.5">
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
                      {fieldErrorMap.notes && <p id={fieldErrorId("notes")} className="mt-1 text-xs font-semibold text-[var(--sp-editor-error-text)]">{fieldErrorMap.notes}</p>}
                    </label>
                  </div>
                </div>

                <div>
                  <InspectorSectionLabel title="Activity" />
                  <div id="seat-inspector-activity" className="pb-3.5">
                    {activityEntries.length > 0 ? (
                      <ul>
                        {activityEntries.map((entry, index) => (
                          <li key={`${entry}-${index}`} className="border-b border-[var(--sp-border-subtle)] py-1.5 text-[12px] leading-4 text-[var(--sp-text-helper)] last:border-b-0">
                            <span className="font-medium text-[var(--sp-text-secondary)]">{entry}</span>
                            <span className="ml-1.5">· this session</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[12px] leading-4 text-[var(--sp-text-helper)]">No draft edits to this seat in this session. Saved changes appear here until publish.</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Ask Planner stays the panel's last word — tertiary, after the
              scroll area; the verbs live in the Seat actions section and the
              primary CTA sits pinned in the header above. */}
          {onExplainSeat && <AskPlannerSeatRow seat={selectedSeat} onExplainSeat={onExplainSeat} />}

          {showCommitBar && (
            <div id="seat-inspector-commit-bar" className="border-t border-[var(--sp-border-subtle)] bg-[var(--sp-background)] px-4 py-3">
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
                <Button type="button" onClick={handleCancelEditing} aria-label={`Cancel editing ${selectedSeat.label}`} className="min-w-0 px-4">
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={!isDirty}
                  loading={pending}
                  aria-label={`${primaryActionLabel} for ${selectedSeat.label}`}
                  aria-describedby={saveDisabledReason ? "seat-inspector-save-help" : undefined}
                  title={saveDisabledReason ?? `${primaryActionLabel} for ${selectedSeat.label}`}
                  className="min-w-0 w-full whitespace-normal !border-[var(--sp-button-primary)] !bg-[var(--sp-button-primary)] !text-white hover:!border-[var(--sp-button-primary-hover)] hover:!bg-[var(--sp-button-primary-hover)] disabled:!border-[var(--sp-editor-neutral-border)] disabled:!bg-[var(--sp-editor-neutral-bg)] disabled:!text-[var(--sp-text-helper)] disabled:shadow-none disabled:hover:!border-[var(--sp-editor-neutral-border)] disabled:hover:!bg-[var(--sp-editor-neutral-bg)]"
                >
                  {pending ? "Saving…" : primaryActionLabel}
                </Button>
              </div>
            </div>
          )}

          {/* Facts footer (handoff): seat identity + recency, quieter than
              everything above. Display-only, carries NO controls (the
              2026-07-10 sticky ACTION footer ban is about controls) — and the
              concurrency fence keeps sending updated_at back verbatim, never
              this formatted copy. */}
          <footer id="seat-inspector-footer" className="flex items-center justify-between gap-2.5 border-t border-[var(--sp-border-subtle)] bg-[var(--sp-background)] px-4 py-2 text-xs text-[var(--sp-text-helper)]">
            <span className="min-w-0 truncate font-mono font-medium text-[var(--sp-text-secondary)]">ID: {selectedSeat.label}</span>
            {lastUpdatedLabel && <span className="min-w-0 truncate">Updated {lastUpdatedLabel}</span>}
          </footer>
        </form>
      ) : (
        // Viewer inspector: Contact only — no admin sections, seat-action
        // verbs, AI row, or footer. The data is the published assignment
        // snapshot. Status/code/zone already live in the header meta row, so
        // no Seat section repeats them (owner ruling 2026-08-20: the
        // duplicate "Assigned" row and the "Published seat" badge are gone —
        // on the viewer surface everything is published, the badge said
        // nothing).
        //
        // tabIndex: the region must stay keyboard-scrollable on its own (axe
        // scrollable-region-focusable) — unlike the admin form above, this
        // read-only branch has no focusable descendant guaranteed (an open
        // seat renders no body content), so an overflowing panel would otherwise
        // be unreachable by keyboard. Same contract as the viewer lists in
        // ViewerSeatFinder.
        <div
          role="region"
          aria-label="Published seat details"
          tabIndex={0}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--sp-focus)]"
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
            <div className="rounded-[12px] border border-[var(--sp-publish-viewer-impact-border)] bg-[var(--sp-publish-viewer-impact-bg)] p-3 text-sm font-semibold leading-5 text-[var(--sp-publish-viewer-impact-text)]">
              {PUBLISH_IMPACT_NOTE}
            </div>
          </div>

          {moveConflictError && !pending && (
            <div
              ref={moveConflictErrorRef}
              tabIndex={-1}
              role="alert"
              className="mt-4 rounded-[12px] border border-[var(--sp-editor-error-border)] bg-[var(--sp-editor-error-bg)] p-3 text-sm font-semibold leading-5 text-[var(--sp-editor-error-text)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus)]"
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
