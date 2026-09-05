"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { clientActionErrorMessage } from "@/lib/clientActionError";
import type { DepartmentOption, Employee, SeatWithEmployee, ZoneOption } from "@/lib/types";
import {
  formatPublishChangeSummary,
  getLatestPublishEvent,
  getPublishHistoryActor,
  type PublishHistoryEvent
} from "@/lib/publishHistory";
import {
  createDepartmentAction,
  createEmployeeAction,
  createZoneAction,
  deleteDepartmentAction,
  deleteEmployeeAction,
  deleteZoneAction,
  getPublishHistoryAction,
  renameDepartmentAction,
  renameZoneAction,
  updateEmployeeAction
} from "@/app/actions";
import Link from "next/link";
import { buildDepartmentRoster, departmentKey } from "@/lib/departments";
import { withSeatParam, withTabParam } from "@/lib/deepLink";
import { computeVirtualSegments, computeVirtualWindow } from "@/lib/virtualizedList";
import { formatDisplayName } from "@/lib/formatName";
import { buildInitials } from "@/lib/validators";
import { Button } from "@/components/ui/Button";
import { CloseIcon } from "@/components/ui/CloseIcon";
import { useDialogFocus } from "@/components/ui/useDialogFocus";

type EmployeeSortKey = "name" | "department" | "position" | "extension" | "seat" | "status";
type SortDirection = "asc" | "desc";

type EmployeeForm = {
  fullName: string;
  position: string;
  department: string;
  phoneExtension: string;
  email: string;
};

type AdminManagementPanelProps = {
  employees: Employee[];
  seats: SeatWithEmployee[];
  departmentOptions: DepartmentOption[];
  zoneOptions: ZoneOption[];
  /* Deep-link target from ?tab= (e.g. the map's "View publish history" link);
     tabs are otherwise client state only, so without this the link always
     landed on Employees. */
  initialTab?: ManagementTab;
};

type ManagementTab = "employees" | "departments" | "zones" | "publishHistory";

type PublishHistoryState = {
  status: "idle" | "loading" | "loaded" | "error";
  events: PublishHistoryEvent[];
  error: string | null;
};

type ManagementConfirmState =
  | { kind: "employee"; employee: Employee; assignedSeatLabel: string }
  | { kind: "department"; name: string; affectedCount: number }
  | { kind: "zone"; name: string; affectedCount: number };

const managementTabs: Array<{ id: ManagementTab; label: string }> = [
  { id: "employees", label: "Employees" },
  { id: "departments", label: "Departments" },
  { id: "zones", label: "Zones" },
  { id: "publishHistory", label: "Publish History" }
];

const employeeColumns: Array<{ key: EmployeeSortKey; label: string }> = [
  { key: "name", label: "Name" },
  { key: "department", label: "Department" },
  { key: "position", label: "Position" },
  { key: "extension", label: "Extension" },
  { key: "seat", label: "Seat" },
  { key: "status", label: "Status" }
];

const emptyEmployeeForm: EmployeeForm = {
  fullName: "",
  position: "",
  department: "",
  phoneExtension: "",
  email: ""
};

function formFromEmployee(employee: Employee): EmployeeForm {
  return {
    fullName: employee.full_name,
    position: employee.position ?? "",
    department: employee.department ?? "",
    phoneExtension: employee.phone_extension ?? "",
    email: employee.email ?? ""
  };
}

function getSeatZone(seat: SeatWithEmployee) {
  return seat.zone ?? seat.department ?? "";
}

function getInitials(name: string) {
  return buildInitials(name) || "?";
}

function formatPublishDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "Unknown date";

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function countSeatsByZone(seats: SeatWithEmployee[]) {
  const counts = new Map<string, number>();
  seats.forEach(seat => {
    const zone = getSeatZone(seat).trim();
    if (!zone) return;
    counts.set(zone, (counts.get(zone) ?? 0) + 1);
  });
  return counts;
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`;
}

function upsertOptionByIdOrName<T extends { id: string; name: string }>(current: T[], next: T): T[] {
  const exists = current.some(option => option.id === next.id || option.name === next.name);
  if (!exists) return [...current, next].sort((a, b) => a.name.localeCompare(b.name));
  return current.map(option => (option.id === next.id || option.name === next.name ? next : option));
}

// Drawn on the house 20-viewBox grid at the 16px stroke tier (1.7) so the
// delete affordance matches the hand-drawn icon family (critique action 8).
function TrashIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M3.5 5.5h13" />
      <path d="M7.5 5.5V4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.5" />
      <path d="M15.5 5.5 14.7 15a1.6 1.6 0 0 1-1.6 1.5H6.9A1.6 1.6 0 0 1 5.3 15l-.8-9.5" />
      <path d="M8.4 8.5v5" />
      <path d="M11.6 8.5v5" />
    </svg>
  );
}

// v12 stat tiles carry the same "opens elsewhere" arrow the Settings tiles use,
// drawn on the house 20-viewBox grid at the 12px stroke tier (1.6).
function TileArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="absolute right-2.5 top-2.5 h-3 w-3 text-[var(--sp-status-neutral-mark)]">
      <path d="M6 14 14 6M8 6h6v6" />
    </svg>
  );
}

export function AdminManagementPanel({
  employees,
  seats,
  departmentOptions,
  zoneOptions,
  initialTab
}: AdminManagementPanelProps) {
  const managementConfirmDialogFocusRef = useDialogFocus<HTMLElement>();
  // v12 (#13): the directory card is full-width, so the add/edit form that used
  // to sit in a right-hand aside is now one dialog both entry points open.
  const [employeeDialogOpen, setEmployeeDialogOpen] = useState(false);
  // Dialog-local save error (PR-4 F-INT-4): the page-level `error` banner is
  // occluded by the open dialog's scrim, so save failures render inline here.
  const [employeeDialogError, setEmployeeDialogError] = useState<string | null>(null);
  const employeeDialogFocusRef = useDialogFocus<HTMLElement>();
  const employeeDialogErrorRef = useRef<HTMLDivElement | null>(null);
  const employeeSaveButtonRef = useRef<HTMLButtonElement | null>(null);
  const [localEmployees, setLocalEmployees] = useState(employees);
  const [localDepartmentOptions, setLocalDepartmentOptions] = useState(departmentOptions);
  const [localZoneOptions, setLocalZoneOptions] = useState(zoneOptions);
  const [localSeats, setLocalSeats] = useState(seats);
  const [activeTab, setActiveTab] = useState<ManagementTab>(initialTab ?? "employees");
  // Deep-link (#196): the page already READS ?tab= (initialTab); mirror tab
  // switches back with a shallow replaceState so the URL stays shareable.
  // Idempotent at mount (the URL already matches initialTab).
  useEffect(() => {
    const next = `${window.location.pathname}${withTabParam(window.location.search, activeTab, "employees")}${window.location.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (next !== current) window.history.replaceState(window.history.state, "", next);
  }, [activeTab]);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<EmployeeSortKey>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [employeeForm, setEmployeeForm] = useState<EmployeeForm>(emptyEmployeeForm);
  const [newDepartmentName, setNewDepartmentName] = useState("");
  const [editingDepartment, setEditingDepartment] = useState("");
  const [departmentDraft, setDepartmentDraft] = useState("");
  const [newZoneName, setNewZoneName] = useState("");
  const [editingZone, setEditingZone] = useState("");
  const [zoneDraft, setZoneDraft] = useState("");
  const [publishHistoryState, setPublishHistoryState] = useState<PublishHistoryState>({
    status: "idle",
    events: [],
    error: null
  });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [managementConfirm, setManagementConfirm] = useState<ManagementConfirmState | null>(null);
  const [pending, startTransition] = useTransition();
  // PR-5 (§8.1): the transition's `pending` is one shared flag, but several
  // confirming controls are on screen at once — this names WHICH one is in
  // flight so only the pressed control shows the spinner + participle. Set
  // synchronously in the click handler, cleared when the transition settles.
  const [busyOp, setBusyOp] = useState<string | null>(null);
  function runManagementOp(op: string, work: () => Promise<void>) {
    setBusyOp(op);
    startTransition(async () => {
      try {
        await work();
      } finally {
        setBusyOp(null);
      }
    });
  }

  const activeEmployees = useMemo(
    () => [...localEmployees].filter(employee => employee.active).sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [localEmployees]
  );

  // One roster for both tabs (E1): options ∪ employee departments, keyed
  // case-insensitively so counts can never disagree with the employee list.
  const departmentRoster = useMemo(
    () => buildDepartmentRoster(activeEmployees, localDepartmentOptions),
    [activeEmployees, localDepartmentOptions]
  );
  const departmentNames = useMemo(() => departmentRoster.map(row => row.name), [departmentRoster]);

  const zoneNames = useMemo(() => {
    const values = new Set<string>();
    localZoneOptions.filter(option => option.active).forEach(option => values.add(option.name));
    localSeats.forEach(seat => {
      const zone = getSeatZone(seat);
      if (zone) values.add(zone);
    });
    return Array.from(values).sort();
  }, [localSeats, localZoneOptions]);

  const zoneCounts = useMemo(() => countSeatsByZone(localSeats), [localSeats]);

  // Scale readiness: one seat-label index instead of scanning every seat per
  // employee (the directory must survive 500/1,000/5,000 employees).
  const seatLabelByEmployeeId = useMemo(() => {
    const labels = new Map<string, string>();
    localSeats.forEach(seat => {
      if (seat.employee_id) labels.set(seat.employee_id, seat.label);
    });
    return labels;
  }, [localSeats]);

  const filteredEmployees = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return activeEmployees.filter(employee => {
      const assignment = seatLabelByEmployeeId.get(employee.id) ?? "Unassigned";
      const haystack = [employee.full_name, employee.position, employee.department, employee.phone_extension, assignment].filter(Boolean).join(" ").toLowerCase();
      return !needle || haystack.includes(needle);
    });
  }, [activeEmployees, seatLabelByEmployeeId, search]);

  const sortedEmployees = useMemo(() => {
    const direction = sortDirection === "asc" ? 1 : -1;
    const valueFor = (employee: Employee): string => {
      switch (sortKey) {
        case "department":
          return employee.department ?? "";
        case "position":
          return employee.position ?? "";
        case "extension":
          return employee.phone_extension ?? "";
        case "seat":
          return seatLabelByEmployeeId.get(employee.id) ?? "";
        case "status":
          return seatLabelByEmployeeId.has(employee.id) ? "Assigned" : "Unassigned";
        case "name":
        default:
          return employee.full_name;
      }
    };
    return [...filteredEmployees].sort((a, b) => {
      const primary = valueFor(a).localeCompare(valueFor(b), undefined, { numeric: true, sensitivity: "base" }) * direction;
      if (primary !== 0) return primary;
      // Stable tie-break by name so equal keys keep a deterministic order.
      return a.full_name.localeCompare(b.full_name);
    });
  }, [filteredEmployees, seatLabelByEmployeeId, sortKey, sortDirection]);

  function toggleSort(key: EmployeeSortKey) {
    if (sortKey === key) {
      setSortDirection(current => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  }

  const selectedEmployee = activeEmployees.find(employee => employee.id === selectedEmployeeId) ?? null;
  const selectedEmployeeSeatLabel = selectedEmployee ? seatLabelByEmployeeId.get(selectedEmployee.id) ?? "Unassigned" : "Unassigned";
  const assignedEmployees = activeEmployees.filter(employee => seatLabelByEmployeeId.has(employee.id)).length;
  const unassignedEmployees = activeEmployees.length - assignedEmployees;
  const latestPublish = getLatestPublishEvent(publishHistoryState.events);
  const managementSummaryCards = [
    { label: "Draft seats", value: localSeats.length },
    { label: "Active employees", value: activeEmployees.length },
    { label: "Assigned", value: assignedEmployees },
    { label: "Unassigned", value: unassignedEmployees },
    { label: "Active zones", value: zoneNames.length }
  ];
  const fieldClassName = "w-full border border-[var(--sp-border-subtle)] bg-[var(--sp-layer-01)] px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--sp-button-primary)] focus:ring-2 focus:ring-[color:var(--sp-focus)]";

  // Virtualized directory (Figma page 10, Scalability): only the employee rows
  // near the viewport render; padding preserves the page scroll height. Geometry
  // is measured from the live table so the rows keep their exact current look.
  const employeeGridRef = useRef<HTMLTableSectionElement | null>(null);
  const employeeNameInputRef = useRef<HTMLInputElement | null>(null);
  const [employeeGridGeometry, setEmployeeGridGeometry] = useState({
    scrollOffset: 0,
    viewportHeight: 1080,
    columns: 1,
    rowHeight: 52
  });
  // Focused row kept mounted across window moves, pinned by EMPLOYEE ID (not
  // index) so a re-sort/reorder follows the person, not the position — an
  // index-based pin would silently point at whichever row now sits there.
  // Set from focusin (any row gaining focus), cleared on focusout only when
  // focus provably moved OUTSIDE the tbody (relatedTarget elsewhere) — an
  // unmount-blur reports relatedTarget null, and clearing on it would defeat
  // the pin.
  const [pinnedEmployeeId, setPinnedEmployeeId] = useState<string | null>(null);

  useEffect(() => {
    if (activeTab !== "employees") return;

    let frame = 0;
    const measure = () => {
      frame = 0;
      const grid = employeeGridRef.current;
      if (!grid) return;
      // Single-column table: one employee per row.
      const columns = 1;
      // Pinned rows sit against a split spacer, not their real neighbors, so
      // measuring one reads the gap, not the row.
      const firstRow = grid.querySelector<HTMLElement>("[data-directory-row]:not([data-vpinned])");
      // Fall back to the default before the first row renders — and on a
      // zero-height measurement (hidden table, no layout): dividing by it
      // below would NaN the scroll offset and blank the whole window.
      const rowHeight = firstRow && firstRow.offsetHeight > 0 ? firstRow.offsetHeight : 52;
      // Quantize to row steps so scrolling only re-renders when the window moves.
      const rawOffset = Math.max(0, -grid.getBoundingClientRect().top);
      const scrollOffset = Math.floor(rawOffset / rowHeight) * rowHeight;
      const viewportHeight = window.innerHeight;
      setEmployeeGridGeometry(current => (
        current.scrollOffset === scrollOffset
          && current.viewportHeight === viewportHeight
          && current.columns === columns
          && current.rowHeight === rowHeight
          ? current
          : { scrollOffset, viewportHeight, columns, rowHeight }
      ));
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [activeTab, sortedEmployees.length]);

  const employeeWindow = useMemo(() => computeVirtualWindow({
    itemCount: sortedEmployees.length,
    columns: employeeGridGeometry.columns,
    rowHeight: employeeGridGeometry.rowHeight,
    viewportHeight: employeeGridGeometry.viewportHeight,
    scrollOffset: employeeGridGeometry.scrollOffset,
    overscanRows: 4
  }), [sortedEmployees.length, employeeGridGeometry]);
  // Derive the pinned row's current absolute index from its stable id every
  // render, so a re-sort/reorder (same or different count) still finds the
  // pinned employee at its new position instead of stranding the pin on a
  // stale index.
  const pinnedEmployeeIndex = useMemo(() => {
    if (!pinnedEmployeeId) return null;
    const index = sortedEmployees.findIndex(employee => employee.id === pinnedEmployeeId);
    return index === -1 ? null : index;
  }, [pinnedEmployeeId, sortedEmployees]);
  const employeeSegments = useMemo(() => computeVirtualSegments({
    window: employeeWindow,
    itemCount: sortedEmployees.length,
    rowHeight: employeeGridGeometry.rowHeight,
    pinnedIndex: pinnedEmployeeIndex
  }), [employeeWindow, sortedEmployees.length, employeeGridGeometry.rowHeight, pinnedEmployeeIndex]);

  // Keyboard focus on the name link or kebab button must survive the window
  // moving out from under it (scroll/resize) — an unmount-blur would
  // otherwise drop focus to <body> and restart Tab from the top of the page.
  useEffect(() => {
    if (activeTab !== "employees") return;
    const grid = employeeGridRef.current;
    if (!grid) return;

    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const row = target?.closest("[data-vindex]");
      if (!row || !grid.contains(row)) return;
      // Read the id from the DOM attribute, not from sortedEmployees[index] —
      // this handler's closure can go stale, but the attribute cannot.
      const employeeId = row.getAttribute("data-employee-id");
      if (employeeId) setPinnedEmployeeId(employeeId);
    };
    const handleFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget instanceof Node ? event.relatedTarget : null;
      if (next && !grid.contains(next)) setPinnedEmployeeId(null);
    };

    grid.addEventListener("focusin", handleFocusIn);
    grid.addEventListener("focusout", handleFocusOut);
    return () => {
      grid.removeEventListener("focusin", handleFocusIn);
      grid.removeEventListener("focusout", handleFocusOut);
    };
    // sortedEmployees.length is load-bearing, not incidental: the table only
    // renders when sortedEmployees.length !== 0 (empty-search branch below),
    // so the tbody unmounts/remounts across that boundary and this effect
    // must re-run to re-attach the listeners to the new node.
  }, [activeTab, sortedEmployees.length]);

  // A departed employee (deactivated/deleted) invalidates the pin; a
  // same-count reorder must also be able to clear it, so this depends on
  // sortedEmployees identity, not just its length.
  useEffect(() => {
    setPinnedEmployeeId(current => (
      current !== null && !sortedEmployees.some(employee => employee.id === current) ? null : current
    ));
  }, [sortedEmployees]);

  const loadPublishHistory = useCallback(async () => {
    setPublishHistoryState(current => ({
      ...current,
      status: "loading",
      error: null
    }));

    try {
      const events = await getPublishHistoryAction();
      setPublishHistoryState({
        status: "loaded",
        events,
        error: null
      });
    } catch (errorValue) {
      setPublishHistoryState(current => ({
        ...current,
        status: "error",
        error: clientActionErrorMessage(errorValue, "Could not load publish history.")
      }));
    }
  }, []);

  useEffect(() => {
    if (activeTab !== "publishHistory" || publishHistoryState.status !== "idle") return;
    void loadPublishHistory();
  }, [activeTab, loadPublishHistory, publishHistoryState.status]);

  function showSuccess(nextMessage: string) {
    setError(null);
    setMessage(nextMessage);
  }

  // PR-4 (F-INT-4 / F-FRM-1): a save error must render INSIDE the open
  // employee dialog — the page banner sits under the dialog's blurred scrim,
  // so routing it there made the dialog look like it did nothing. The page
  // banner keeps serving every non-dialog surface (renames, option creates,
  // the closed-confirm deactivate path).
  function dialogErrorMessage(errorValue: unknown, fallback: string) {
    if (typeof errorValue === "string" && errorValue.trim()) return errorValue;
    return clientActionErrorMessage(errorValue, fallback);
  }

  function showEmployeeDialogError(errorValue: unknown, fallback: string) {
    setEmployeeDialogError(dialogErrorMessage(errorValue, fallback));
    // Ruling: focus moves to the notification so the failure is the next
    // thing a keyboard or screen-reader admin meets.
    window.requestAnimationFrame(() => employeeDialogErrorRef.current?.focus());
  }

  function showError(errorValue: unknown, fallback: string) {
    setMessage(null);
    // A plain string is a message an action *returned* (the validation path in
    // lib/schemas.ts) rather than threw, so it is already admin-facing and must
    // not be swallowed by the generic fallback.
    if (typeof errorValue === "string" && errorValue.trim()) {
      setError(errorValue);
      return;
    }
    setError(clientActionErrorMessage(errorValue, fallback));
  }

  function openAddEmployee() {
    setSelectedEmployeeId("");
    setEmployeeForm(emptyEmployeeForm);
    setMessage(null);
    setError(null);
    setEmployeeDialogError(null);
    setEmployeeDialogOpen(true);
    window.requestAnimationFrame(() => employeeNameInputRef.current?.focus());
  }

  function closeEmployeeDialog() {
    setEmployeeDialogOpen(false);
    setEmployeeDialogError(null);
  }

  function editEmployee(employee: Employee) {
    setSelectedEmployeeId(employee.id);
    setEmployeeForm(formFromEmployee(employee));
    setActiveTab("employees");
    setMessage(null);
    setError(null);
    setEmployeeDialogError(null);
    setEmployeeDialogOpen(true);
    // Hand focus to the form the row just populated (critique action 8).
    window.requestAnimationFrame(() => employeeNameInputRef.current?.focus());
  }

  function saveEmployee() {
    runManagementOp("employee-save", async () => {
      try {
        setError(null);
        setEmployeeDialogError(null);
        const payload = {
          fullName: employeeForm.fullName,
          position: employeeForm.position,
          department: employeeForm.department,
          phoneExtension: employeeForm.phoneExtension,
          email: employeeForm.email
        };
        const result = selectedEmployee
          ? await updateEmployeeAction({ employeeId: selectedEmployee.id, ...payload })
          : await createEmployeeAction(payload);

        // Validation failures come back rather than throwing, so the field-level
        // message survives production's digest stripping — surface it and stop.
        // Inside the still-open dialog (PR-4): the dialog stays open, values
        // stay put, and Save re-enables for a retry.
        if (!result.ok) {
          showEmployeeDialogError(result.message, "Could not save employee.");
          return;
        }

        const employee = result.employee;

        setLocalEmployees(current => {
          const exists = current.some(item => item.id === employee.id);
          if (!exists) return [...current, employee].sort((a, b) => a.full_name.localeCompare(b.full_name));
          return current.map(item => (item.id === employee.id ? employee : item));
        });
        setSelectedEmployeeId(employee.id);
        setEmployeeForm(formFromEmployee(employee));
        // Close on success so the confirmation banner behind the dialog is the
        // thing the admin sees next.
        setEmployeeDialogOpen(false);
        showSuccess(`${formatDisplayName(employee.full_name)} saved.`);
      } catch (errorValue) {
        showEmployeeDialogError(errorValue, "Could not save employee.");
      }
    });
  }

  function deleteEmployee() {
    if (!selectedEmployee) return;

    setMessage(null);
    setError(null);
    // One dialog at a time: hand the focus trap to the confirmation.
    setEmployeeDialogOpen(false);
    setManagementConfirm({ kind: "employee", employee: selectedEmployee, assignedSeatLabel: selectedEmployeeSeatLabel });
  }

  function createDepartment() {
    runManagementOp("dept-create", async () => {
      try {
        setError(null);
        const result = await createDepartmentAction(newDepartmentName);
        if (!result.ok) {
          showError(result.message, "Could not add department.");
          return;
        }
        const department = result.department;
        setLocalDepartmentOptions(current => upsertOptionByIdOrName(current, department));
        setNewDepartmentName("");
        showSuccess(`Department ${department.name} added.`);
      } catch (errorValue) {
        showError(errorValue, "Could not add department.");
      }
    });
  }

  function adoptDepartment(name: string) {
    runManagementOp(`adopt-department:${name}`, async () => {
      try {
        setError(null);
        const result = await createDepartmentAction(name);
        if (!result.ok) {
          showError(result.message, "Could not add department to the managed list.");
          return;
        }
        const department = result.department;
        setLocalDepartmentOptions(current => upsertOptionByIdOrName(current, department));
        showSuccess(`Department ${department.name} added to the managed list.`);
      } catch (errorValue) {
        showError(errorValue, "Could not add department to the managed list.");
      }
    });
  }

  function beginDepartmentRename(name: string) {
    setEditingDepartment(name);
    setDepartmentDraft(name);
    setMessage(null);
    setError(null);
  }

  function renameDepartment() {
    if (!editingDepartment) return;
    runManagementOp("dept-rename", async () => {
      try {
        setError(null);
        const result = await renameDepartmentAction({ from: editingDepartment, to: departmentDraft });
        if (!result.ok) {
          showError(result.message, "Could not rename department.");
          return;
        }
        setLocalDepartmentOptions(current => [
          ...current.map(option => (option.name === result.from ? { ...option, active: false } : option)),
          { id: result.to, name: result.to, active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
        ]);
        setLocalEmployees(current => current.map(employee => (
          departmentKey(employee.department) === departmentKey(result.from) ? { ...employee, department: result.to } : employee
        )));
        setEditingDepartment("");
        setDepartmentDraft("");
        showSuccess(`Department renamed to ${result.to}.`);
      } catch (errorValue) {
        showError(errorValue, "Could not rename department.");
      }
    });
  }

  function deleteDepartment(name: string) {
    const count = departmentRoster.find(row => row.key === departmentKey(name))?.employeeCount ?? 0;
    setMessage(null);
    setError(null);
    setManagementConfirm({ kind: "department", name, affectedCount: count });
  }

  function createZone() {
    runManagementOp("zone-create", async () => {
      try {
        setError(null);
        const result = await createZoneAction(newZoneName);
        if (!result.ok) {
          showError(result.message, "Could not add zone.");
          return;
        }
        const zone = result.zone;
        setLocalZoneOptions(current => upsertOptionByIdOrName(current, zone));
        setNewZoneName("");
        showSuccess(`Zone ${zone.name} added.`);
      } catch (errorValue) {
        showError(errorValue, "Could not add zone.");
      }
    });
  }

  function beginZoneRename(name: string) {
    setEditingZone(name);
    setZoneDraft(name);
    setMessage(null);
    setError(null);
  }

  function renameZone() {
    if (!editingZone) return;
    runManagementOp("zone-rename", async () => {
      try {
        setError(null);
        const result = await renameZoneAction({ from: editingZone, to: zoneDraft });
        if (!result.ok) {
          showError(result.message, "Could not rename zone.");
          return;
        }
        setLocalZoneOptions(current => [
          ...current.map(option => (option.name === result.from ? { ...option, active: false } : option)),
          { id: result.to, name: result.to, active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
        ]);
        setLocalSeats(current => current.map(seat => (
          getSeatZone(seat) === result.from ? { ...seat, zone: result.to } : seat
        )));
        setEditingZone("");
        setZoneDraft("");
        showSuccess(`Zone renamed to ${result.to}.`);
      } catch (errorValue) {
        showError(errorValue, "Could not rename zone.");
      }
    });
  }

  function deleteZone(name: string) {
    const count = zoneCounts.get(name) ?? 0;
    setMessage(null);
    setError(null);
    setManagementConfirm({ kind: "zone", name, affectedCount: count });
  }

  function closeManagementConfirm() {
    setManagementConfirm(null);
  }

  function confirmManagementDestructiveAction() {
    if (!managementConfirm) return;
    const action = managementConfirm;
    // Keep the confirm dialog mounted (buttons disabled on `pending`) until
    // the action settles — closing it up front left the table interactive
    // during the round-trip, so opening another employee's edit dialog then
    // had its form clobbered by this handler's reset below. Same pattern as
    // DataUtilitiesPanel's review dialogs.

    runManagementOp("management-confirm", async () => {
      try {
        setError(null);

        if (action.kind === "employee") {
          const result = await deleteEmployeeAction(action.employee.id);
          if (!result.ok) {
            showError(result.message, "Could not deactivate employee.");
            return;
          }
          setLocalEmployees(current => current.filter(employee => employee.id !== action.employee.id));
          setLocalSeats(current => current.map(seat => (
            seat.employee_id === action.employee.id ? { ...seat, employee_id: null, employee: null, status: "available" } : seat
          )));
          setSelectedEmployeeId("");
          setEmployeeForm(emptyEmployeeForm);
          showSuccess(`${formatDisplayName(action.employee.full_name)} deactivated.`);
          return;
        }

        if (action.kind === "department") {
          const result = await deleteDepartmentAction(action.name);
          if (!result.ok) {
            showError(result.message, "Could not delete department.");
            return;
          }
          setLocalDepartmentOptions(current => current.map(option => (option.name === action.name ? { ...option, active: false } : option)));
          setLocalEmployees(current => current.map(employee => (
            employee.department === action.name ? { ...employee, department: null } : employee
          )));
          showSuccess(`Department ${action.name} deleted.`);
          return;
        }

        const zoneResult = await deleteZoneAction(action.name);
        if (!zoneResult.ok) {
          showError(zoneResult.message, "Could not delete zone.");
          return;
        }
        setLocalZoneOptions(current => current.map(option => (option.name === action.name ? { ...option, active: false } : option)));
        setLocalSeats(current => current.map(seat => (
          getSeatZone(seat) === action.name ? { ...seat, zone: null } : seat
        )));
        showSuccess(`Zone ${action.name} deleted.`);
      } catch (errorValue) {
        showError(
          errorValue,
          action.kind === "employee"
            ? "Could not deactivate employee."
            : action.kind === "department"
              ? "Could not delete department."
              : "Could not delete zone."
        );
      } finally {
        setManagementConfirm(null);
      }
    });
  }

  return (
    <main className="flex-1 bg-[var(--sp-background)] px-4 pb-12 pt-6 text-[var(--sp-text-primary)] sm:px-8">
      <div className="mx-auto max-w-[1240px] space-y-4">
        <header className="pb-1">
          <h1 className="text-[22px] font-semibold leading-tight text-[var(--sp-text-primary)]">Management</h1>
          <p className="mt-1 max-w-2xl text-[13px] leading-5 text-[var(--sp-text-helper)]">
            People, departments, zones, and publish history.
          </p>
        </header>

        {/* PR-5 (§8.1): the surface's shared in-flight region — always
            mounted (a region that mounts WITH its content is not reliably
            announced), sr-only sibling of the visible outcome banner below,
            which keeps owning outcomes. */}
        <div role="status" aria-live="polite" className="sr-only">
          {pending ? "Working…" : ""}
        </div>

        {(message || error) && (
          <div
            role={error ? "alert" : "status"}
            aria-live={error ? "assertive" : "polite"}
            className={["border px-4 py-3 text-sm font-semibold", error ? "border-[var(--sp-status-error-mark)] bg-[var(--sp-status-error-surface)] text-[var(--sp-status-error-text)]" : "border-[var(--sp-status-neutral-mark)] bg-[var(--sp-status-neutral-surface)] text-[var(--sp-status-neutral-text)]"].join(" ")}
          >
            {error ?? message}
          </div>
        )}

        {/* Hairline tile grid: the 1px gaps over a stone background draw the
            rules, so the tiles themselves stay borderless. */}
        <section className="grid gap-px border border-[var(--sp-border-subtle)] bg-[var(--sp-border-subtle)] [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))]">
          {managementSummaryCards.map(card => (
            <div key={card.label} className="relative bg-[var(--sp-layer-01)] p-4">
              <div className="text-2xl font-semibold leading-none text-[var(--sp-text-primary)]">{card.value.toLocaleString()}</div>
              <div className="mt-2 text-xs text-[var(--sp-text-helper)]">{card.label}</div>
              <TileArrowIcon />
            </div>
          ))}
        </section>

        <div>
          <nav aria-label="Management sections" className="flex">
            {managementTabs.map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={[
                  "px-4 py-[9px] text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--sp-interactive)]",
                  activeTab === tab.id
                    ? "border border-b-2 border-[var(--sp-border-subtle)] border-b-[var(--sp-button-primary)] bg-[var(--sp-layer-01)] font-semibold text-[var(--sp-text-primary)]"
                    : "border-b border-[var(--sp-border-subtle)] text-[var(--sp-text-secondary)] hover:bg-[var(--sp-background)] hover:text-[var(--sp-text-primary)]"
                ].join(" ")}
                aria-current={activeTab === tab.id ? "page" : undefined}
              >
                {tab.label}
              </button>
            ))}
            <span aria-hidden="true" className="flex-1 border-b border-[var(--sp-border-subtle)]" />
          </nav>

        {activeTab === "employees" && (
          <section className="border border-t-0 border-[var(--sp-border-subtle)] bg-[var(--sp-layer-01)]">
            <h2 className="sr-only">Employees</h2>
            {/* 44px toolbar: the search is bare inline chrome (its own border
                would fight the card edge it sits inside) and the CTA fills the
                strip's full height. */}
            <div className="flex h-11 items-stretch border-b border-[var(--sp-border-subtle)]">
              <label className="relative flex min-w-0 flex-1 items-center">
                <span className="sr-only">Search employees</span>
                <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="pointer-events-none absolute left-4 h-3.5 w-3.5 text-[var(--sp-status-neutral-mark)]">
                  <circle cx="9" cy="9" r="5.25" stroke="currentColor" strokeWidth="1.7" />
                  <path d="m13.4 13.4 3.1 3.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                </svg>
                <input
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder="Search employees…"
                  className="h-full w-full min-w-0 border-0 bg-transparent pl-10 pr-4 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--sp-focus)]"
                />
              </label>
              <button
                type="button"
                onClick={openAddEmployee}
                disabled={pending}
                /* White, not text-inverse: #F7F6F2 on #D23F0A is 4.35:1 and axe
                   fails it. The CTA ladder is specified as white (4.71:1). */
                className="shrink-0 bg-[var(--sp-button-primary)] px-[18px] text-[13.5px] font-semibold text-white transition-colors hover:bg-[var(--sp-button-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white"
              >
                Add employee ＋
              </button>
            </div>
              {sortedEmployees.length === 0 ? (
                activeEmployees.length === 0 ? (
                  /* AUDIT-2 §8.2 first-run: an empty DIRECTORY is not a failed
                     search — name the real state and the next step. */
                  <div className="p-6 text-sm text-[var(--sp-text-secondary)]">
                    <div className="font-semibold text-[var(--sp-text-primary)]">No employees yet</div>
                    <p className="mt-1">Start with &ldquo;Add employee&rdquo; above, or bring the whole directory in at once with a CSV import in Settings.</p>
                  </div>
                ) : (
                  <div className="p-6 text-sm text-[var(--sp-text-secondary)]">
                    <div className="font-semibold text-[var(--sp-text-primary)]">No employees match this search</div>
                    <p className="mt-1">Try a different name, department, position, or seat label.</p>
                  </div>
                )
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] border-collapse text-left text-[13px]">
                    <thead>
                      <tr className="border-b border-[var(--sp-border-subtle)] bg-[var(--sp-table-header)] text-xs text-[var(--sp-text-secondary)]">
                        {employeeColumns.map(column => {
                          const isSorted = sortKey === column.key;
                          return (
                            <th
                              key={column.key}
                              scope="col"
                              aria-sort={isSorted ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
                              className="px-3 py-[9px] font-semibold first:pl-4"
                            >
                              <button
                                type="button"
                                onClick={() => toggleSort(column.key)}
                                className="relative inline-flex items-center gap-1 outline-none after:absolute after:-inset-y-2 after:inset-x-0 hover:text-[var(--sp-text-primary)] focus-visible:ring-2 focus-visible:ring-[color:var(--sp-focus)]"
                              >
                                <span>{column.label}</span>
                                <span aria-hidden="true" className={isSorted ? "text-[var(--sp-text-primary)]" : "text-transparent"}>
                                  <svg viewBox="0 0 20 20" fill="none" className={["h-3 w-3 transition-transform", isSorted && sortDirection === "desc" ? "rotate-180" : ""].join(" ")}>
                                    <path d="m5.5 12 4.5-4.5L14.5 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                </span>
                              </button>
                            </th>
                          );
                        })}
                        <th scope="col" className="w-10 px-2 py-[9px]">
                          <span className="sr-only">Row actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody ref={employeeGridRef}>
                      {employeeSegments.map((segment, segmentIndex) => {
                        if (segment.kind === "spacer") {
                          return segment.height > 0 ? (
                            <tr key={`spacer-${segmentIndex}`} aria-hidden="true">
                              <td colSpan={employeeColumns.length + 1} style={{ height: segment.height, padding: 0 }} />
                            </tr>
                          ) : null;
                        }
                        const employee = sortedEmployees[segment.index];
                        if (!employee) return null;
                        const seatLabel = seatLabelByEmployeeId.get(employee.id) ?? "";
                        const isAssigned = seatLabelByEmployeeId.has(employee.id);
                        const isSelected = selectedEmployeeId === employee.id;
                        const displayName = formatDisplayName(employee.full_name);
                        // Background lives on the cells (not the <tr>) so it paints
                        // reliably under border-collapse in every browser.
                        const cellClass = ["px-3 py-2 align-middle transition-colors", isSelected ? "bg-[var(--sp-layer-hover)]" : "group-hover/row:bg-[var(--sp-background)]"].join(" ");
                        return (
                          <tr
                            key={employee.id}
                            data-directory-row
                            data-vindex={segment.index}
                            data-vpinned={segment.pinned ? "" : undefined}
                            data-employee-id={employee.id}
                            aria-selected={isSelected}
                            onClick={() => editEmployee(employee)}
                            /* The row is a mouse shortcut only. It used to be a
                               tab stop too, which put THREE stops on every
                               employee — the row, the name link, the kebab —
                               and the row stop announced the whole row while
                               offering nothing the other two don't. Keyboard
                               users reach the map through the name link and the
                               form through the kebab (v12 slice 9). */
                            className="group/row cursor-pointer border-b border-[var(--sp-table-row-border)] transition last:border-b-0"
                          >
                            <td className={[cellClass, "pl-4"].join(" ")}>
                              <div className="flex items-center gap-2.5">
                                <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--sp-layer-hover)] text-xs font-bold text-[var(--sp-text-primary)]">{getInitials(employee.full_name)}</span>
                                {/* Contract #13: the name is the map affordance —
                                    a real link so it is shareable and middle-clickable.
                                    Unseated people have nothing to show, so they stay text. */}
                                {isAssigned ? (
                                  <Link
                                    href={`/admin${withSeatParam("", seatLabel)}`}
                                    // prefetch off — see AppRail's note.
                                    prefetch={false}
                                    onClick={event => event.stopPropagation()}
                                    className="relative truncate font-semibold text-[var(--sp-text-primary)] underline-offset-2 after:absolute after:-inset-y-3 after:inset-x-0 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--sp-focus)]"
                                  >
                                    {displayName}
                                  </Link>
                                ) : (
                                  <span className="truncate font-semibold text-[var(--sp-text-primary)]">{displayName}</span>
                                )}
                              </div>
                            </td>
                            <td className={[cellClass, "text-[12.5px] text-[var(--sp-text-secondary)]"].join(" ")}>{employee.department || "—"}</td>
                            <td className={[cellClass, "text-[12.5px] text-[var(--sp-text-secondary)]"].join(" ")}>{employee.position || "—"}</td>
                            <td className={[cellClass, "text-[12.5px] text-[var(--sp-text-secondary)]"].join(" ")}>{employee.phone_extension || "—"}</td>
                            <td className={[cellClass, "font-mono text-xs font-semibold text-[var(--sp-text-primary)]"].join(" ")}>{seatLabel || "—"}</td>
                            <td className={cellClass}>
                              {/* Assigned mirrors the map legend's green chip — the
                                  orange-soft family reads as a warning here. */}
                              <span className={["inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium", isAssigned ? "border-[var(--sp-status-success-mark)] bg-[var(--sp-status-success-surface)] text-[var(--sp-status-success-text)]" : "border-[var(--sp-border-subtle)] bg-[var(--sp-background)] text-[var(--sp-text-secondary)]"].join(" ")}>
                                <span aria-hidden="true" className={["h-1.5 w-1.5 shrink-0 rounded-full", isAssigned ? "bg-[var(--sp-status-success-mark)]" : "bg-[var(--sp-status-neutral-mark)]"].join(" ")} />
                                {isAssigned ? "Assigned" : "Unassigned"}
                              </span>
                            </td>
                            <td className={[cellClass, "px-2 text-right"].join(" ")}>
                              <button
                                type="button"
                                onClick={event => {
                                  event.stopPropagation();
                                  editEmployee(employee);
                                }}
                                aria-label={`Edit ${displayName}`}
                                className="relative inline-flex h-7 w-7 items-center justify-center text-[var(--sp-status-neutral-mark)] transition-colors after:absolute after:-inset-2 hover:bg-[var(--sp-background)] hover:text-[var(--sp-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--sp-focus)]"
                              >
                                <span aria-hidden="true" className="text-base leading-none">⋮</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            <p aria-live="polite" className="border-t border-[var(--sp-border-subtle)] px-4 py-[9px] text-xs text-[var(--sp-text-helper)]">
              {pluralize(sortedEmployees.length, "employee")} of {activeEmployees.length.toLocaleString()} shown — click a name to show them on the map
            </p>

          </section>
        )}

        {activeTab === "departments" && (
          <section className="border border-t-0 border-[var(--sp-border-subtle)] bg-[var(--sp-layer-01)] p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[var(--sp-text-primary)]">Departments</h2>
                <p className="text-sm text-[var(--sp-text-secondary)]">Employee departments are separate from physical seating zones.</p>
              </div>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <input value={newDepartmentName} onChange={event => setNewDepartmentName(event.target.value)} placeholder="New department" className="min-w-0 border border-[var(--sp-border-subtle)] bg-[var(--sp-layer-01)] px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--sp-button-primary)] focus:ring-2 focus:ring-[color:var(--sp-focus)]" />
                <Button type="button" variant="primary" onClick={createDepartment} disabled={pending || !newDepartmentName.trim()} loading={pending && busyOp === "dept-create"}>{pending && busyOp === "dept-create" ? "Adding…" : "Add"}</Button>
              </div>
            </div>
            <div className="mt-4 divide-y divide-[var(--sp-border-subtle)] border border-[var(--sp-border-subtle)]">
              {departmentRoster.map(row => (
                <div key={row.key} className="group flex flex-col gap-3 p-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-[var(--sp-text-primary)]">{row.name}</span>
                      {!row.managed && (
                        <span className="rounded-full bg-[var(--sp-status-draft-surface)] px-2 py-0.5 text-xs font-medium text-[var(--sp-status-draft-text)]">Not in managed list</span>
                      )}
                    </div>
                    <div className="text-xs text-[var(--sp-text-secondary)]">{row.employeeCount.toLocaleString()} employee{row.employeeCount === 1 ? "" : "s"}</div>
                  </div>
                  {editingDepartment === row.name ? (
                    <div className="flex flex-1 flex-col gap-2 md:max-w-md md:flex-row">
                      <input value={departmentDraft} onChange={event => setDepartmentDraft(event.target.value)} className={fieldClassName} />
                      <Button type="button" onClick={renameDepartment} disabled={pending || !departmentDraft.trim()} loading={pending && busyOp === "dept-rename"}>{pending && busyOp === "dept-rename" ? "Renaming…" : "Save"}</Button>
                      <Button type="button" onClick={() => setEditingDepartment("")} disabled={pending}>Cancel</Button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      {!row.managed && (
                        <Button type="button" onClick={() => adoptDepartment(row.name)} disabled={pending} loading={pending && busyOp === `adopt-department:${row.name}`}>{pending && busyOp === `adopt-department:${row.name}` ? "Adding…" : "Add to list"}</Button>
                      )}
                      <Button type="button" onClick={() => beginDepartmentRename(row.name)} disabled={pending}>Rename</Button>
                      <button
                        type="button"
                        onClick={() => deleteDepartment(row.name)}
                        disabled={pending}
                        aria-label={`Delete ${row.name}`}
                        className="relative inline-flex h-8 w-8 items-center justify-center text-[var(--sp-text-helper)] opacity-0 outline-none transition after:absolute after:-inset-y-1.5 after:-left-1 after:-right-2 hover:bg-[var(--sp-status-error-surface)] hover:text-[var(--sp-status-error-text)] focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-[var(--sp-status-error-mark)] disabled:cursor-not-allowed disabled:opacity-30 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {departmentNames.length === 0 && (
                <div className="p-5 text-sm text-[var(--sp-text-secondary)]">
                  <div className="font-semibold text-[var(--sp-text-primary)]">No departments yet</div>
                  <p className="mt-1">Add a department to keep employee records easier to scan.</p>
                </div>
              )}
            </div>
          </section>
        )}

        {activeTab === "zones" && (
          <section className="border border-t-0 border-[var(--sp-border-subtle)] bg-[var(--sp-layer-01)] p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[var(--sp-text-primary)]">Zones</h2>
                <p className="text-sm text-[var(--sp-text-secondary)]">Zones are physical map areas used for filtering and custom-seat label prefixes.</p>
              </div>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <input value={newZoneName} onChange={event => setNewZoneName(event.target.value)} placeholder="New zone" className="min-w-0 border border-[var(--sp-border-subtle)] bg-[var(--sp-layer-01)] px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--sp-button-primary)] focus:ring-2 focus:ring-[color:var(--sp-focus)]" />
                <Button type="button" variant="primary" onClick={createZone} disabled={pending || !newZoneName.trim()} loading={pending && busyOp === "zone-create"}>{pending && busyOp === "zone-create" ? "Adding…" : "Add"}</Button>
              </div>
            </div>
            <div className="mt-4 divide-y divide-[var(--sp-border-subtle)] border border-[var(--sp-border-subtle)]">
              {zoneNames.map(name => (
                <div key={name} className="group flex flex-col gap-3 p-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-[var(--sp-text-primary)]">{name}</div>
                    <div className="text-xs text-[var(--sp-text-secondary)]">{(zoneCounts.get(name) ?? 0).toLocaleString()} draft seat{(zoneCounts.get(name) ?? 0) === 1 ? "" : "s"}</div>
                  </div>
                  {editingZone === name ? (
                    <div className="flex flex-1 flex-col gap-2 md:max-w-md md:flex-row">
                      <input value={zoneDraft} onChange={event => setZoneDraft(event.target.value)} className={fieldClassName} />
                      <Button type="button" onClick={renameZone} disabled={pending || !zoneDraft.trim()} loading={pending && busyOp === "zone-rename"}>{pending && busyOp === "zone-rename" ? "Renaming…" : "Save"}</Button>
                      <Button type="button" onClick={() => setEditingZone("")} disabled={pending}>Cancel</Button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button type="button" onClick={() => beginZoneRename(name)} disabled={pending}>Rename</Button>
                      <button
                        type="button"
                        onClick={() => deleteZone(name)}
                        disabled={pending}
                        aria-label={`Delete ${name}`}
                        className="relative inline-flex h-8 w-8 items-center justify-center text-[var(--sp-text-helper)] opacity-0 outline-none transition after:absolute after:-inset-y-1.5 after:-left-1 after:-right-2 hover:bg-[var(--sp-status-error-surface)] hover:text-[var(--sp-status-error-text)] focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-[var(--sp-status-error-mark)] disabled:cursor-not-allowed disabled:opacity-30 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {zoneNames.length === 0 && (
                <div className="p-5 text-sm text-[var(--sp-text-secondary)]">
                  <div className="font-semibold text-[var(--sp-text-primary)]">No zones yet</div>
                  <p className="mt-1">Add a zone to organize map filters and custom-seat labels.</p>
                </div>
              )}
            </div>
          </section>
        )}

        {activeTab === "publishHistory" && (
          <section className="border border-t-0 border-[var(--sp-border-subtle)] bg-[var(--sp-layer-01)] p-4 sm:p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="max-w-2xl">
                <h2 className="text-lg font-semibold text-[var(--sp-text-primary)]">Publish History</h2>
                <p className="text-sm leading-6 text-[var(--sp-text-secondary)]">
                  Recent completed publishes from the draft map, including published seat count and admin identity when the profile can be resolved.
                </p>
              </div>
              <Button type="button" onClick={loadPublishHistory} disabled={publishHistoryState.status === "loading"}>
                {publishHistoryState.status === "loading" ? "Loading…" : "Refresh history"}
              </Button>
            </div>

            {publishHistoryState.status === "loading" && (
              <>
                <div className="mt-4 border border-[var(--sp-border-subtle)] bg-[var(--sp-background)] p-4">
                  <div className="h-3 w-24 motion-safe:animate-pulse rounded bg-[var(--sp-border-subtle)]" />
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div className="h-14 motion-safe:animate-pulse bg-[var(--sp-layer-01)]" />
                    <div className="h-14 motion-safe:animate-pulse bg-[var(--sp-layer-01)]" />
                    <div className="h-14 motion-safe:animate-pulse bg-[var(--sp-layer-01)]" />
                  </div>
                </div>
                <div className="mt-4 divide-y divide-[var(--sp-border-subtle)] border border-[var(--sp-border-subtle)]">
                  {[0, 1, 2].map(item => (
                    <div key={item} className="grid gap-3 p-3 md:grid-cols-[minmax(0,1.4fr)_120px_minmax(0,1fr)_minmax(0,1.2fr)_80px]">
                      <div className="h-5 motion-safe:animate-pulse rounded bg-[var(--sp-background)]" />
                      <div className="h-5 motion-safe:animate-pulse rounded bg-[var(--sp-background)]" />
                      <div className="h-5 motion-safe:animate-pulse rounded bg-[var(--sp-background)]" />
                      <div className="h-5 motion-safe:animate-pulse rounded bg-[var(--sp-background)]" />
                      <div className="h-5 motion-safe:animate-pulse rounded bg-[var(--sp-background)]" />
                    </div>
                  ))}
                </div>
              </>
            )}

            {publishHistoryState.status === "error" && (
              <div className="mt-4 flex flex-col gap-3 border border-[var(--sp-status-error-mark)] bg-[var(--sp-status-error-surface)] p-4 text-sm text-[var(--sp-status-error-text)] md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="font-semibold">Could not load publish history.</div>
                  <div className="mt-1 whitespace-pre-wrap">{publishHistoryState.error}</div>
                </div>
                <Button type="button" variant="danger" onClick={loadPublishHistory}>
                  Retry
                </Button>
              </div>
            )}

            {publishHistoryState.status === "loaded" && publishHistoryState.events.length === 0 && (
              <div className="mt-4 border border-dashed border-[var(--sp-border-subtle)] bg-[var(--sp-background)] p-6">
                <h3 className="text-sm font-semibold text-[var(--sp-text-primary)]">No publish events yet</h3>
                <p className="mt-1 max-w-xl text-sm leading-6 text-[var(--sp-text-secondary)]">
                  Published maps will appear here after the first successful publish audit event is written.
                </p>
              </div>
            )}

            {publishHistoryState.status === "loaded" && publishHistoryState.events.length > 0 && (
              <>
                {latestPublish && (
                  <div className="mt-4 border border-[var(--sp-border-subtle)] bg-[var(--sp-layer-01)] p-4 shadow-sp">
                    <div className="flex items-center gap-2">
                      <div className="text-xs font-semibold tracking-normal text-[var(--sp-text-secondary)]">Latest publish</div>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--sp-status-success-surface)] px-2 py-0.5 text-xs font-medium text-[var(--sp-status-success-mark)] ring-1 ring-[color-mix(in_srgb,var(--sp-status-success-mark)_30%,transparent)]">
                        <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
                        Latest
                      </span>
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                      <div>
                        <div className="text-xs font-medium tracking-normal text-[var(--sp-text-helper)]">Created</div>
                        <div className="mt-1 text-sm font-semibold text-[var(--sp-text-primary)]">{formatPublishDate(latestPublish.created_at)}</div>
                      </div>
                      <div>
                        <div className="text-xs font-medium tracking-normal text-[var(--sp-text-helper)]">Seat count</div>
                        <div className="mt-1 text-sm font-semibold text-[var(--sp-text-primary)]">{latestPublish.seat_count.toLocaleString()}</div>
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-medium tracking-normal text-[var(--sp-text-helper)]">Published by</div>
                        <div className="mt-1 truncate text-sm font-semibold text-[var(--sp-text-primary)]" title={latestPublish.published_by ?? undefined}>
                          {getPublishHistoryActor(latestPublish)}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 border-t border-[var(--sp-border-subtle)] pt-3">
                      <div className="text-xs font-medium tracking-normal text-[var(--sp-text-helper)]">Changes</div>
                      <div className="mt-1 text-sm text-[var(--sp-text-secondary)]">
                        {formatPublishChangeSummary(latestPublish.change_summary) ?? "—"}
                      </div>
                    </div>
                  </div>
                )}

                <div className="mt-4 overflow-hidden border border-[var(--sp-border-subtle)]">
                  <div className="hidden grid-cols-[minmax(0,1.4fr)_120px_minmax(0,1fr)_minmax(0,1.2fr)_80px] bg-[var(--sp-background)] px-3 py-2 text-xs font-semibold tracking-normal text-[var(--sp-text-secondary)] md:grid">
                    <div>Created at</div>
                    <div>Seat count</div>
                    <div>Published by</div>
                    <div>Changes</div>
                    <div>State</div>
                  </div>
                  <div className="divide-y divide-[var(--sp-border-subtle)]">
                    {publishHistoryState.events.map((event, index) => (
                      <div
                        key={`${event.created_at}-${event.published_by ?? "unknown"}-${index}`}
                        className="grid gap-3 p-3 text-sm md:grid-cols-[minmax(0,1.4fr)_120px_minmax(0,1fr)_minmax(0,1.2fr)_80px] md:items-center"
                      >
                        <div>
                          <div className="text-xs font-semibold tracking-normal text-[var(--sp-text-secondary)] md:hidden">Created at</div>
                          <div className="font-semibold text-[var(--sp-text-primary)]">{formatPublishDate(event.created_at)}</div>
                        </div>
                        <div>
                          <div className="text-xs font-semibold tracking-normal text-[var(--sp-text-secondary)] md:hidden">Seat count</div>
                          <div className="font-semibold text-[var(--sp-text-primary)]">{event.seat_count.toLocaleString()}</div>
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold tracking-normal text-[var(--sp-text-secondary)] md:hidden">Published by</div>
                          <div className="truncate font-semibold text-[var(--sp-text-secondary)]" title={event.published_by ?? undefined}>
                            {getPublishHistoryActor(event)}
                          </div>
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold tracking-normal text-[var(--sp-text-secondary)] md:hidden">Changes</div>
                          <div className="text-[var(--sp-text-secondary)]">
                            {formatPublishChangeSummary(event.change_summary) ?? "—"}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs font-semibold tracking-normal text-[var(--sp-text-secondary)] md:hidden">State</div>
                          {index === 0 ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--sp-status-success-surface)] px-2 py-1 text-xs font-semibold tracking-normal text-[var(--sp-status-success-mark)] ring-1 ring-[color-mix(in_srgb,var(--sp-status-success-mark)_30%,transparent)]">
                              <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
                              Latest
                            </span>
                          ) : (
                            <span className="text-xs font-semibold text-[var(--sp-text-helper)]">Previous</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </section>
        )}

        </div>

        <datalist id="management-department-options">
          {departmentNames.map(name => <option key={name} value={name} />)}
        </datalist>
      </div>

      {employeeDialogOpen && (
        <div className="fixed inset-0 z-[65] flex items-end justify-center bg-[color-mix(in_srgb,var(--sp-overlay)_45%,transparent)] p-3 backdrop-blur-[2px] sm:items-center">
          <section
            ref={employeeDialogFocusRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="management-employee-title"
            aria-describedby="management-employee-description"
            onKeyDown={event => {
              if (event.key === "Escape" && !pending) {
                event.stopPropagation();
                closeEmployeeDialog();
              }
            }}
            className="max-h-[90vh] w-full max-w-[560px] overflow-y-auto overscroll-contain border border-[var(--sp-border-subtle)] bg-[var(--sp-layer-01)] p-4 text-[var(--sp-text-primary)] shadow-sp"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="management-employee-title" className="text-base font-semibold">{selectedEmployee ? "Edit employee" : "Add employee"}</h2>
                <p id="management-employee-description" className="mt-1 text-sm leading-5 text-[var(--sp-text-secondary)]">
                  Changes update the employee directory and draft seat references.
                </p>
              </div>
              <button
                type="button"
                onClick={closeEmployeeDialog}
                disabled={pending}
                className="relative flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold text-[var(--sp-text-helper)] transition after:absolute after:-inset-1.5 hover:bg-[var(--sp-background)] hover:text-[var(--sp-text-primary)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus)]"
                aria-label="Close employee form"
              >
                <CloseIcon />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="text-xs font-medium tracking-normal text-[var(--sp-text-secondary)]">Name</span>
                <input ref={employeeNameInputRef} value={employeeForm.fullName} onChange={event => setEmployeeForm(current => ({ ...current, fullName: event.target.value }))} className={fieldClassName} />
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-medium tracking-normal text-[var(--sp-text-secondary)]">Position</span>
                  <input value={employeeForm.position} onChange={event => setEmployeeForm(current => ({ ...current, position: event.target.value }))} className={fieldClassName} />
                </label>
                <label className="block">
                  <span className="text-xs font-medium tracking-normal text-[var(--sp-text-secondary)]">Phone Ext.</span>
                  <input type="tel" value={employeeForm.phoneExtension} onChange={event => setEmployeeForm(current => ({ ...current, phoneExtension: event.target.value }))} className={fieldClassName} inputMode="numeric" />
                </label>
              </div>
              <label className="block">
                <span className="text-xs font-medium tracking-normal text-[var(--sp-text-secondary)]">Email</span>
                <input type="email" spellCheck={false} value={employeeForm.email} onChange={event => setEmployeeForm(current => ({ ...current, email: event.target.value }))} placeholder="Optional" className={fieldClassName} inputMode="email" autoComplete="off" />
              </label>
              <label className="block">
                <span className="text-xs font-medium tracking-normal text-[var(--sp-text-secondary)]">Department</span>
                <input list="management-department-options" value={employeeForm.department} onChange={event => setEmployeeForm(current => ({ ...current, department: event.target.value }))} className={fieldClassName} />
              </label>
            </div>
            {selectedEmployee && (
              <div className="mt-4 border border-[var(--sp-status-draft-mark)] bg-[var(--sp-status-draft-surface)] p-3 text-xs leading-5 text-[var(--sp-status-draft-text)]">
                <div className="font-semibold tracking-normal">Deactivation impact</div>
                <div className="mt-1">
                  Current draft seat: <span className="font-bold">{selectedEmployeeSeatLabel}</span>.
                  {selectedEmployeeSeatLabel === "Unassigned"
                    ? " Deactivation removes this employee from the active directory."
                    : " Deactivation clears this draft assignment. The published map everyone sees won't change until you publish again."}
                </div>
              </div>
            )}
            {/* PR-4 (F-INT-4): the save error lives HERE, above the button
                row — never on the page banner the scrim occludes. Icon + text
                (two signals), role="alert", focused on arrival; dismissing
                hands focus back to the submit button. */}
            {employeeDialogError && (
              <div
                ref={employeeDialogErrorRef}
                tabIndex={-1}
                role="alert"
                className="mt-4 flex items-start gap-2.5 border border-[var(--sp-status-error-mark)] bg-[var(--sp-status-error-surface)] px-3 py-2.5 text-sm font-semibold leading-5 text-[var(--sp-status-error-text)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus)]"
              >
                <svg aria-hidden="true" viewBox="0 0 20 20" className="mt-0.5 h-[15px] w-[15px] shrink-0">
                  <circle cx="10" cy="10" r="8" fill="currentColor" />
                  <path d="m7 7 6 6m0-6-6 6" stroke="var(--sp-status-error-surface)" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                <span className="min-w-0 flex-1">{employeeDialogError}</span>
                <button
                  type="button"
                  onClick={() => {
                    setEmployeeDialogError(null);
                    employeeSaveButtonRef.current?.focus();
                  }}
                  aria-label="Dismiss save error"
                  className="relative flex h-8 w-8 shrink-0 items-center justify-center text-[var(--sp-status-error-text)] transition after:absolute after:-inset-1.5 hover:bg-[var(--sp-status-error-mark)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus)]"
                >
                  <CloseIcon />
                </button>
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button ref={employeeSaveButtonRef} type="button" variant="primary" onClick={saveEmployee} disabled={pending || !employeeForm.fullName.trim()} loading={pending && busyOp === "employee-save"}>
                {pending && busyOp === "employee-save"
                  ? selectedEmployee ? "Saving…" : "Adding…"
                  : selectedEmployee ? "Save employee" : "Add employee"}
              </Button>
              <Button type="button" onClick={closeEmployeeDialog} disabled={pending}>Cancel</Button>
              {selectedEmployee && <Button type="button" variant="danger" onClick={deleteEmployee} disabled={pending}>Deactivate</Button>}
            </div>
          </section>
        </div>
      )}

      {managementConfirm && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-[color-mix(in_srgb,var(--sp-overlay)_45%,transparent)] p-3 backdrop-blur-[2px] sm:items-center">
          <section
            ref={managementConfirmDialogFocusRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="management-confirm-title"
            aria-describedby="management-confirm-description"
            onKeyDown={event => {
              if (event.key === "Escape" && !pending) {
                event.stopPropagation();
                closeManagementConfirm();
              }
            }}
            className="w-full max-w-lg overscroll-contain border border-[var(--sp-border-subtle)] bg-[var(--sp-layer-01)] p-4 text-[var(--sp-text-primary)] shadow-sp"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="management-confirm-title" className="text-base font-semibold">
                  {managementConfirm.kind === "employee"
                    ? `Deactivate ${formatDisplayName(managementConfirm.employee.full_name)}?`
                    : managementConfirm.kind === "department"
                      ? `Delete department “${managementConfirm.name}”?`
                      : `Delete zone “${managementConfirm.name}”?`}
                </h2>
                <p id="management-confirm-description" className="mt-1 text-sm leading-5 text-[var(--sp-text-secondary)]">
                  Review the exact management impact before applying this cleanup.
                </p>
              </div>
              <button
                type="button"
                onClick={closeManagementConfirm}
                disabled={pending}
                className="relative flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold text-[var(--sp-text-helper)] transition after:absolute after:-inset-1.5 hover:bg-[var(--sp-background)] hover:text-[var(--sp-text-primary)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus)]"
                aria-label="Cancel management confirmation"
              >
                <CloseIcon />
              </button>
            </div>

            <div className="mt-4 grid gap-2">
              {managementConfirm.kind === "employee" && (
                <div className="border border-[var(--sp-status-draft-mark)] bg-[var(--sp-status-draft-surface)] p-3 text-sm leading-5 text-[var(--sp-status-draft-text)]">
                  <div className="font-semibold tracking-normal">Deactivation impact</div>
                  <div className="mt-1">
                    Current draft seat: <span className="font-bold">{managementConfirm.assignedSeatLabel}</span>.
                    {managementConfirm.assignedSeatLabel === "Unassigned"
                      ? " This removes the employee from the active directory."
                      : " This clears that draft assignment and keeps the employee inactive."}
                  </div>
                </div>
              )}

              {managementConfirm.kind === "department" && (
                <div className="border border-[var(--sp-status-draft-mark)] bg-[var(--sp-status-draft-surface)] p-3 text-sm leading-5 text-[var(--sp-status-draft-text)]">
                  <div className="font-semibold tracking-normal">Department delete impact</div>
                  <div className="mt-1">
                    Clears this department from <span className="font-bold">{pluralize(managementConfirm.affectedCount, "active employee")}</span>. Employee records remain active and physical seat zones are unchanged.
                  </div>
                </div>
              )}

              {managementConfirm.kind === "zone" && (
                <div className="border border-[var(--sp-status-draft-mark)] bg-[var(--sp-status-draft-surface)] p-3 text-sm leading-5 text-[var(--sp-status-draft-text)]">
                  <div className="font-semibold tracking-normal">Zone delete impact</div>
                  <div className="mt-1">
                    Clears this physical zone from <span className="font-bold">{pluralize(managementConfirm.affectedCount, "draft seat")}</span>. Seat markers and employees remain in place.
                  </div>
                </div>
              )}

              <div className="border border-[var(--sp-status-success-mark)] bg-[var(--sp-status-success-surface)] p-3 text-sm font-semibold leading-5 text-[var(--sp-status-success-text)]">
                {managementConfirm.kind === "employee"
                  ? "The published map everyone sees won't change until you publish again. Publish draft changes when ready."
                  : managementConfirm.kind === "department"
                    ? "This changes employee metadata. Viewers keep seeing current people details until you publish. Seat assignments are unchanged."
                    : "This updates draft zone metadata only. The published viewer map is unchanged until publish."}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button type="button" onClick={closeManagementConfirm} disabled={pending} className="w-full">
                Cancel
              </Button>
              <Button type="button" variant="danger" onClick={confirmManagementDestructiveAction} loading={pending && busyOp === "management-confirm"} disabled={pending} className="w-full">
                {pending && busyOp === "management-confirm"
                  ? managementConfirm.kind === "employee" ? "Deactivating…" : "Deleting…"
                  : managementConfirm.kind === "employee"
                    ? "Deactivate employee"
                    : managementConfirm.kind === "department"
                      ? "Delete department"
                      : "Delete zone"}
              </Button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
