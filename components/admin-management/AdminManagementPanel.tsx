"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
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
import { computeVirtualWindow } from "@/lib/virtualizedList";
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
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="absolute right-2.5 top-2.5 h-3 w-3 text-[var(--admin-status-neutral)]">
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
  const employeeDialogFocusRef = useDialogFocus<HTMLElement>();
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
  const fieldClassName = "w-full border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--admin-primary-cta)] focus:ring-2 focus:ring-[color:var(--sp-focus-ring-color)]";

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

  useEffect(() => {
    if (activeTab !== "employees") return;

    let frame = 0;
    const measure = () => {
      frame = 0;
      const grid = employeeGridRef.current;
      if (!grid) return;
      // Single-column table: one employee per row.
      const columns = 1;
      const firstRow = grid.querySelector<HTMLElement>("[data-directory-row]");
      // Fall back to the default before the first row renders.
      const rowHeight = firstRow ? firstRow.offsetHeight : 52;
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
  const visibleEmployees = useMemo(
    () => sortedEmployees.slice(employeeWindow.startIndex, employeeWindow.endIndex),
    [sortedEmployees, employeeWindow]
  );

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
        error: errorValue instanceof Error ? errorValue.message : "Could not load publish history."
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

  function showError(errorValue: unknown, fallback: string) {
    setMessage(null);
    // A plain string is a message an action *returned* (the validation path in
    // lib/schemas.ts) rather than threw, so it is already admin-facing and must
    // not be swallowed by the generic fallback.
    if (typeof errorValue === "string" && errorValue.trim()) {
      setError(errorValue);
      return;
    }
    setError(errorValue instanceof Error ? errorValue.message : fallback);
  }

  function openAddEmployee() {
    setSelectedEmployeeId("");
    setEmployeeForm(emptyEmployeeForm);
    setMessage(null);
    setError(null);
    setEmployeeDialogOpen(true);
    window.requestAnimationFrame(() => employeeNameInputRef.current?.focus());
  }

  function closeEmployeeDialog() {
    setEmployeeDialogOpen(false);
  }

  function editEmployee(employee: Employee) {
    setSelectedEmployeeId(employee.id);
    setEmployeeForm(formFromEmployee(employee));
    setActiveTab("employees");
    setMessage(null);
    setError(null);
    setEmployeeDialogOpen(true);
    // Hand focus to the form the row just populated (critique action 8).
    window.requestAnimationFrame(() => employeeNameInputRef.current?.focus());
  }

  function saveEmployee() {
    startTransition(async () => {
      try {
        setError(null);
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
        if (!result.ok) {
          showError(result.message, "Could not save employee.");
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
        showError(errorValue, "Could not save employee.");
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
    startTransition(async () => {
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
    startTransition(async () => {
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
    startTransition(async () => {
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
    startTransition(async () => {
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
    startTransition(async () => {
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
    setManagementConfirm(null);

    startTransition(async () => {
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
      }
    });
  }

  return (
    <main className="admin-theme flex-1 bg-[var(--admin-bg)] px-4 pb-12 pt-6 text-[var(--admin-text-primary)] sm:px-8">
      <div className="mx-auto max-w-[1240px] space-y-4">
        <header className="pb-1">
          <h1 className="text-[22px] font-semibold leading-tight text-[var(--admin-text-primary)]">Management</h1>
          <p className="mt-1 max-w-2xl text-[13px] leading-5 text-[var(--admin-text-muted)]">
            People, departments, zones, and publish history.
          </p>
        </header>

        {(message || error) && (
          <div
            role={error ? "alert" : "status"}
            aria-live={error ? "assertive" : "polite"}
            className={["border px-4 py-3 text-sm font-semibold", error ? "border-[var(--admin-state-error-border)] bg-[var(--admin-state-error-bg)] text-[var(--admin-state-error-text)]" : "border-[var(--admin-state-clean-border)] bg-[var(--admin-state-clean-bg)] text-[var(--admin-state-clean-text)]"].join(" ")}
          >
            {error ?? message}
          </div>
        )}

        {/* Hairline tile grid: the 1px gaps over a stone background draw the
            rules, so the tiles themselves stay borderless. */}
        <section className="grid gap-px border border-[var(--admin-border)] bg-[var(--admin-border)] [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))]">
          {managementSummaryCards.map(card => (
            <div key={card.label} className="relative bg-[var(--admin-surface)] p-4">
              <div className="text-2xl font-semibold leading-none text-[var(--admin-text-primary)]">{card.value.toLocaleString()}</div>
              <div className="mt-2 text-xs text-[var(--admin-text-muted)]">{card.label}</div>
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
                  "px-4 py-[9px] text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-primary)]",
                  activeTab === tab.id
                    ? "border border-b-2 border-[var(--admin-border)] border-b-[var(--admin-primary-cta)] bg-[var(--admin-surface)] font-semibold text-[var(--admin-text-primary)]"
                    : "border-b border-[var(--admin-border)] text-[var(--admin-text-secondary)] hover:bg-[var(--admin-surface-alt)] hover:text-[var(--admin-text-primary)]"
                ].join(" ")}
                aria-current={activeTab === tab.id ? "page" : undefined}
              >
                {tab.label}
              </button>
            ))}
            <span aria-hidden="true" className="flex-1 border-b border-[var(--admin-border)]" />
          </nav>

        {activeTab === "employees" && (
          <section className="border border-t-0 border-[var(--admin-border)] bg-[var(--admin-surface)]">
            <h2 className="sr-only">Employees</h2>
            {/* 44px toolbar: the search is bare inline chrome (its own border
                would fight the card edge it sits inside) and the CTA fills the
                strip's full height. */}
            <div className="flex h-11 items-stretch border-b border-[var(--admin-border)]">
              <label className="relative flex min-w-0 flex-1 items-center">
                <span className="sr-only">Search employees</span>
                <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="pointer-events-none absolute left-4 h-3.5 w-3.5 text-[var(--admin-status-neutral)]">
                  <circle cx="9" cy="9" r="5.25" stroke="currentColor" strokeWidth="1.7" />
                  <path d="m13.4 13.4 3.1 3.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                </svg>
                <input
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder="Search employees…"
                  className="h-full w-full min-w-0 border-0 bg-transparent pl-10 pr-4 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--sp-focus-ring-color)]"
                />
              </label>
              <button
                type="button"
                onClick={openAddEmployee}
                disabled={pending}
                /* White, not text-inverse: #F7F6F2 on #D23F0A is 4.35:1 and axe
                   fails it. The CTA ladder is specified as white (4.71:1). */
                className="shrink-0 bg-[var(--admin-primary-cta)] px-[18px] text-[13.5px] font-semibold text-white transition-colors hover:bg-[var(--admin-primary-cta-hover)] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white"
              >
                Add employee ＋
              </button>
            </div>
              {sortedEmployees.length === 0 ? (
                <div className="p-6 text-sm text-[var(--admin-text-secondary)]">
                  <div className="font-semibold text-[var(--admin-text-primary)]">No employees match this search</div>
                  <p className="mt-1">Try a different name, department, position, or seat label.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] border-collapse text-left text-[13px]">
                    <thead>
                      <tr className="border-b border-[var(--admin-border)] bg-[var(--admin-table-header-bg)] text-xs text-[var(--admin-text-secondary)]">
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
                                className="inline-flex items-center gap-1 outline-none hover:text-[var(--admin-text-primary)] focus-visible:ring-2 focus-visible:ring-[color:var(--sp-focus-ring-color)]"
                              >
                                <span>{column.label}</span>
                                <span aria-hidden="true" className={isSorted ? "text-[var(--admin-text-primary)]" : "text-transparent"}>
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
                      {employeeWindow.topPadding > 0 && (
                        <tr aria-hidden="true">
                          <td colSpan={employeeColumns.length + 1} style={{ height: employeeWindow.topPadding, padding: 0 }} />
                        </tr>
                      )}
                      {visibleEmployees.map(employee => {
                        const seatLabel = seatLabelByEmployeeId.get(employee.id) ?? "";
                        const isAssigned = seatLabelByEmployeeId.has(employee.id);
                        const isSelected = selectedEmployeeId === employee.id;
                        const displayName = formatDisplayName(employee.full_name);
                        // Background lives on the cells (not the <tr>) so it paints
                        // reliably under border-collapse in every browser.
                        const cellClass = ["px-3 py-2 align-middle transition-colors", isSelected ? "bg-[var(--admin-primary-soft)]" : "group-hover/row:bg-[var(--admin-surface-alt)]"].join(" ");
                        return (
                          <tr
                            key={employee.id}
                            data-directory-row
                            aria-selected={isSelected}
                            onClick={() => editEmployee(employee)}
                            /* The row is a mouse shortcut only. It used to be a
                               tab stop too, which put THREE stops on every
                               employee — the row, the name link, the kebab —
                               and the row stop announced the whole row while
                               offering nothing the other two don't. Keyboard
                               users reach the map through the name link and the
                               form through the kebab (v12 slice 9). */
                            className="group/row cursor-pointer border-b border-[var(--admin-table-row-border)] transition last:border-b-0"
                          >
                            <td className={[cellClass, "pl-4"].join(" ")}>
                              <div className="flex items-center gap-2.5">
                                <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--admin-paper)] text-[9px] font-bold text-[var(--admin-primary-on-soft)]">{getInitials(employee.full_name)}</span>
                                {/* Contract #13: the name is the map affordance —
                                    a real link so it is shareable and middle-clickable.
                                    Unseated people have nothing to show, so they stay text. */}
                                {isAssigned ? (
                                  <Link
                                    href={`/admin${withSeatParam("", seatLabel)}`}
                                    onClick={event => event.stopPropagation()}
                                    className="truncate font-semibold text-[var(--admin-text-primary)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--sp-focus-ring-color)]"
                                  >
                                    {displayName}
                                  </Link>
                                ) : (
                                  <span className="truncate font-semibold text-[var(--admin-text-primary)]">{displayName}</span>
                                )}
                              </div>
                            </td>
                            <td className={[cellClass, "text-[12.5px] text-[var(--admin-text-secondary)]"].join(" ")}>{employee.department || "—"}</td>
                            <td className={[cellClass, "text-[12.5px] text-[var(--admin-text-secondary)]"].join(" ")}>{employee.position || "—"}</td>
                            <td className={[cellClass, "text-[12.5px] text-[var(--admin-text-secondary)]"].join(" ")}>{employee.phone_extension || "—"}</td>
                            <td className={[cellClass, "font-mono text-xs font-semibold text-[var(--admin-text-primary)]"].join(" ")}>{seatLabel || "—"}</td>
                            <td className={cellClass}>
                              {/* Assigned mirrors the map legend's green chip — the
                                  orange-soft family reads as a warning here. */}
                              <span className={["inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium", isAssigned ? "border-[var(--sp-color-state-success-border)] bg-[var(--admin-success-soft)] text-[var(--sp-color-state-success-on-soft)]" : "border-[var(--admin-border)] bg-[var(--admin-surface-alt)] text-[var(--admin-text-secondary)]"].join(" ")}>
                                <span aria-hidden="true" className={["h-1.5 w-1.5 shrink-0 rounded-full", isAssigned ? "bg-[var(--admin-success)]" : "bg-[var(--admin-status-neutral)]"].join(" ")} />
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
                                className="inline-flex h-7 w-7 items-center justify-center text-[var(--admin-status-neutral)] transition-colors hover:bg-[var(--admin-surface-alt)] hover:text-[var(--admin-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--sp-focus-ring-color)]"
                              >
                                <span aria-hidden="true" className="text-base leading-none">⋮</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {employeeWindow.bottomPadding > 0 && (
                        <tr aria-hidden="true">
                          <td colSpan={employeeColumns.length + 1} style={{ height: employeeWindow.bottomPadding, padding: 0 }} />
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            <p aria-live="polite" className="border-t border-[var(--admin-border)] px-4 py-[9px] text-xs text-[var(--admin-text-muted)]">
              {pluralize(sortedEmployees.length, "employee")} of {activeEmployees.length.toLocaleString()} shown — click a name to show them on the map
            </p>

          </section>
        )}

        {activeTab === "departments" && (
          <section className="border border-t-0 border-[var(--admin-border)] bg-[var(--admin-surface)] p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[var(--admin-text-primary)]">Departments</h2>
                <p className="text-sm text-[var(--admin-text-secondary)]">Employee departments are separate from physical seating zones.</p>
              </div>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <input value={newDepartmentName} onChange={event => setNewDepartmentName(event.target.value)} placeholder="New department" className="min-w-0 border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--admin-primary-cta)] focus:ring-2 focus:ring-[color:var(--sp-focus-ring-color)]" />
                <Button type="button" variant="primary" onClick={createDepartment} disabled={pending || !newDepartmentName.trim()}>Add</Button>
              </div>
            </div>
            <div className="mt-4 divide-y divide-[var(--admin-border-subtle,var(--admin-border))] border border-[var(--admin-border)]">
              {departmentRoster.map(row => (
                <div key={row.key} className="group flex flex-col gap-3 p-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-[var(--admin-text-primary)]">{row.name}</span>
                      {!row.managed && (
                        <span className="rounded-full bg-[var(--admin-state-dirty-bg)] px-2 py-0.5 text-[11px] font-medium text-[var(--admin-state-dirty-text)]">Not in managed list</span>
                      )}
                    </div>
                    <div className="text-xs text-[var(--admin-text-secondary)]">{row.employeeCount.toLocaleString()} employee{row.employeeCount === 1 ? "" : "s"}</div>
                  </div>
                  {editingDepartment === row.name ? (
                    <div className="flex flex-1 flex-col gap-2 md:max-w-md md:flex-row">
                      <input value={departmentDraft} onChange={event => setDepartmentDraft(event.target.value)} className={fieldClassName} />
                      <Button type="button" onClick={renameDepartment} disabled={pending || !departmentDraft.trim()}>Save</Button>
                      <Button type="button" onClick={() => setEditingDepartment("")} disabled={pending}>Cancel</Button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      {!row.managed && (
                        <Button type="button" onClick={() => adoptDepartment(row.name)} disabled={pending}>Add to list</Button>
                      )}
                      <Button type="button" onClick={() => beginDepartmentRename(row.name)} disabled={pending}>Rename</Button>
                      <button
                        type="button"
                        onClick={() => deleteDepartment(row.name)}
                        disabled={pending}
                        aria-label={`Delete ${row.name}`}
                        className="inline-flex h-8 w-8 items-center justify-center text-[var(--admin-text-muted)] opacity-0 outline-none transition hover:bg-[var(--admin-state-error-bg)] hover:text-[var(--admin-state-error-text)] focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-[var(--admin-error)] disabled:cursor-not-allowed disabled:opacity-30 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {departmentNames.length === 0 && (
                <div className="p-5 text-sm text-[var(--admin-text-secondary)]">
                  <div className="font-semibold text-[var(--admin-text-primary)]">No departments yet</div>
                  <p className="mt-1">Add a department to keep employee records easier to scan.</p>
                </div>
              )}
            </div>
          </section>
        )}

        {activeTab === "zones" && (
          <section className="border border-t-0 border-[var(--admin-border)] bg-[var(--admin-surface)] p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[var(--admin-text-primary)]">Zones</h2>
                <p className="text-sm text-[var(--admin-text-secondary)]">Zones are physical map areas used for filtering and custom-seat label prefixes.</p>
              </div>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <input value={newZoneName} onChange={event => setNewZoneName(event.target.value)} placeholder="New zone" className="min-w-0 border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--admin-primary-cta)] focus:ring-2 focus:ring-[color:var(--sp-focus-ring-color)]" />
                <Button type="button" variant="primary" onClick={createZone} disabled={pending || !newZoneName.trim()}>Add</Button>
              </div>
            </div>
            <div className="mt-4 divide-y divide-[var(--admin-border-subtle,var(--admin-border))] border border-[var(--admin-border)]">
              {zoneNames.map(name => (
                <div key={name} className="group flex flex-col gap-3 p-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-[var(--admin-text-primary)]">{name}</div>
                    <div className="text-xs text-[var(--admin-text-secondary)]">{(zoneCounts.get(name) ?? 0).toLocaleString()} draft seat{(zoneCounts.get(name) ?? 0) === 1 ? "" : "s"}</div>
                  </div>
                  {editingZone === name ? (
                    <div className="flex flex-1 flex-col gap-2 md:max-w-md md:flex-row">
                      <input value={zoneDraft} onChange={event => setZoneDraft(event.target.value)} className={fieldClassName} />
                      <Button type="button" onClick={renameZone} disabled={pending || !zoneDraft.trim()}>Save</Button>
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
                        className="inline-flex h-8 w-8 items-center justify-center text-[var(--admin-text-muted)] opacity-0 outline-none transition hover:bg-[var(--admin-state-error-bg)] hover:text-[var(--admin-state-error-text)] focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-[var(--admin-error)] disabled:cursor-not-allowed disabled:opacity-30 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {zoneNames.length === 0 && (
                <div className="p-5 text-sm text-[var(--admin-text-secondary)]">
                  <div className="font-semibold text-[var(--admin-text-primary)]">No zones yet</div>
                  <p className="mt-1">Add a zone to organize map filters and custom-seat labels.</p>
                </div>
              )}
            </div>
          </section>
        )}

        {activeTab === "publishHistory" && (
          <section className="border border-t-0 border-[var(--admin-border)] bg-[var(--admin-surface)] p-4 sm:p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="max-w-2xl">
                <h2 className="text-lg font-semibold text-[var(--admin-text-primary)]">Publish History</h2>
                <p className="text-sm leading-6 text-[var(--admin-text-secondary)]">
                  Recent completed publishes from the draft map, including published seat count and admin identity when the profile can be resolved.
                </p>
              </div>
              <Button type="button" onClick={loadPublishHistory} disabled={publishHistoryState.status === "loading"}>
                {publishHistoryState.status === "loading" ? "Loading…" : "Refresh history"}
              </Button>
            </div>

            {publishHistoryState.status === "loading" && (
              <>
                <div className="mt-4 border border-[var(--admin-border)] bg-[var(--admin-surface-alt)] p-4">
                  <div className="h-3 w-24 motion-safe:animate-pulse rounded bg-[var(--admin-border)]" />
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div className="h-14 motion-safe:animate-pulse bg-[var(--admin-surface)]" />
                    <div className="h-14 motion-safe:animate-pulse bg-[var(--admin-surface)]" />
                    <div className="h-14 motion-safe:animate-pulse bg-[var(--admin-surface)]" />
                  </div>
                </div>
                <div className="mt-4 divide-y divide-[var(--admin-border-subtle,var(--admin-border))] border border-[var(--admin-border)]">
                  {[0, 1, 2].map(item => (
                    <div key={item} className="grid gap-3 p-3 md:grid-cols-[minmax(0,1.4fr)_120px_minmax(0,1fr)_minmax(0,1.2fr)_80px]">
                      <div className="h-5 motion-safe:animate-pulse rounded bg-[var(--admin-surface-alt)]" />
                      <div className="h-5 motion-safe:animate-pulse rounded bg-[var(--admin-surface-alt)]" />
                      <div className="h-5 motion-safe:animate-pulse rounded bg-[var(--admin-surface-alt)]" />
                      <div className="h-5 motion-safe:animate-pulse rounded bg-[var(--admin-surface-alt)]" />
                      <div className="h-5 motion-safe:animate-pulse rounded bg-[var(--admin-surface-alt)]" />
                    </div>
                  ))}
                </div>
              </>
            )}

            {publishHistoryState.status === "error" && (
              <div className="mt-4 flex flex-col gap-3 border border-[var(--admin-state-error-border)] bg-[var(--admin-state-error-bg)] p-4 text-sm text-[var(--admin-state-error-text)] md:flex-row md:items-center md:justify-between">
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
              <div className="mt-4 border border-dashed border-[var(--admin-border)] bg-[var(--admin-surface-alt)] p-6">
                <h3 className="text-sm font-semibold text-[var(--admin-text-primary)]">No publish events yet</h3>
                <p className="mt-1 max-w-xl text-sm leading-6 text-[var(--admin-text-secondary)]">
                  Published maps will appear here after the first successful publish audit event is written.
                </p>
              </div>
            )}

            {publishHistoryState.status === "loaded" && publishHistoryState.events.length > 0 && (
              <>
                {latestPublish && (
                  <div className="mt-4 border border-[var(--admin-border)] bg-[var(--admin-surface)] p-4 shadow-elevation-2">
                    <div className="flex items-center gap-2">
                      <div className="text-[11px] font-semibold tracking-normal text-[var(--admin-text-secondary)]">Latest publish</div>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--admin-success-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--admin-success)] ring-1 ring-[var(--admin-success)]/30">
                        <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
                        Latest
                      </span>
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                      <div>
                        <div className="text-xs font-medium tracking-normal text-[var(--admin-text-muted)]">Created</div>
                        <div className="mt-1 text-sm font-semibold text-[var(--admin-text-primary)]">{formatPublishDate(latestPublish.created_at)}</div>
                      </div>
                      <div>
                        <div className="text-xs font-medium tracking-normal text-[var(--admin-text-muted)]">Seat count</div>
                        <div className="mt-1 text-sm font-semibold text-[var(--admin-text-primary)]">{latestPublish.seat_count.toLocaleString()}</div>
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-medium tracking-normal text-[var(--admin-text-muted)]">Published by</div>
                        <div className="mt-1 truncate text-sm font-semibold text-[var(--admin-text-primary)]" title={latestPublish.published_by ?? undefined}>
                          {getPublishHistoryActor(latestPublish)}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 border-t border-[var(--admin-border-subtle,var(--admin-border))] pt-3">
                      <div className="text-xs font-medium tracking-normal text-[var(--admin-text-muted)]">Changes</div>
                      <div className="mt-1 text-sm text-[var(--admin-text-secondary)]">
                        {formatPublishChangeSummary(latestPublish.change_summary) ?? "—"}
                      </div>
                    </div>
                  </div>
                )}

                <div className="mt-4 overflow-hidden border border-[var(--admin-border)]">
                  <div className="hidden grid-cols-[minmax(0,1.4fr)_120px_minmax(0,1fr)_minmax(0,1.2fr)_80px] bg-[var(--admin-surface-alt)] px-3 py-2 text-xs font-semibold tracking-normal text-[var(--admin-text-secondary)] md:grid">
                    <div>Created at</div>
                    <div>Seat count</div>
                    <div>Published by</div>
                    <div>Changes</div>
                    <div>State</div>
                  </div>
                  <div className="divide-y divide-[var(--admin-border-subtle,var(--admin-border))]">
                    {publishHistoryState.events.map((event, index) => (
                      <div
                        key={`${event.created_at}-${event.published_by ?? "unknown"}-${index}`}
                        className="grid gap-3 p-3 text-sm md:grid-cols-[minmax(0,1.4fr)_120px_minmax(0,1fr)_minmax(0,1.2fr)_80px] md:items-center"
                      >
                        <div>
                          <div className="text-[11px] font-semibold tracking-normal text-[var(--admin-text-secondary)] md:hidden">Created at</div>
                          <div className="font-semibold text-[var(--admin-text-primary)]">{formatPublishDate(event.created_at)}</div>
                        </div>
                        <div>
                          <div className="text-[11px] font-semibold tracking-normal text-[var(--admin-text-secondary)] md:hidden">Seat count</div>
                          <div className="font-semibold text-[var(--admin-text-primary)]">{event.seat_count.toLocaleString()}</div>
                        </div>
                        <div className="min-w-0">
                          <div className="text-[11px] font-semibold tracking-normal text-[var(--admin-text-secondary)] md:hidden">Published by</div>
                          <div className="truncate font-semibold text-[var(--admin-text-secondary)]" title={event.published_by ?? undefined}>
                            {getPublishHistoryActor(event)}
                          </div>
                        </div>
                        <div className="min-w-0">
                          <div className="text-[11px] font-semibold tracking-normal text-[var(--admin-text-secondary)] md:hidden">Changes</div>
                          <div className="text-[var(--admin-text-secondary)]">
                            {formatPublishChangeSummary(event.change_summary) ?? "—"}
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] font-semibold tracking-normal text-[var(--admin-text-secondary)] md:hidden">State</div>
                          {index === 0 ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--admin-success-soft)] px-2 py-1 text-[11px] font-semibold tracking-normal text-[var(--admin-success)] ring-1 ring-[var(--admin-success)]/30">
                              <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
                              Latest
                            </span>
                          ) : (
                            <span className="text-xs font-semibold text-[var(--admin-text-muted)]">Previous</span>
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
        <div className="fixed inset-0 z-[65] flex items-end justify-center bg-[var(--admin-chrome-bg)]/45 p-3 backdrop-blur-[2px] sm:items-center">
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
            className="max-h-[90vh] w-full max-w-[560px] overflow-y-auto overscroll-contain border border-[var(--admin-border)] bg-[var(--admin-surface)] p-4 text-[var(--admin-text-primary)] shadow-panel"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="management-employee-title" className="text-base font-semibold">{selectedEmployee ? "Edit employee" : "Add employee"}</h2>
                <p id="management-employee-description" className="mt-1 text-sm leading-5 text-[var(--admin-text-secondary)]">
                  Changes update the employee directory and draft seat references.
                </p>
              </div>
              <button
                type="button"
                onClick={closeEmployeeDialog}
                disabled={pending}
                className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold text-[var(--admin-text-muted)] transition hover:bg-[var(--admin-surface-alt)] hover:text-[var(--admin-text-primary)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus-ring-color)]"
                aria-label="Close employee form"
              >
                <CloseIcon />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="text-xs font-medium tracking-normal text-[var(--admin-text-secondary)]">Name</span>
                <input ref={employeeNameInputRef} value={employeeForm.fullName} onChange={event => setEmployeeForm(current => ({ ...current, fullName: event.target.value }))} className={fieldClassName} />
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-medium tracking-normal text-[var(--admin-text-secondary)]">Position</span>
                  <input value={employeeForm.position} onChange={event => setEmployeeForm(current => ({ ...current, position: event.target.value }))} className={fieldClassName} />
                </label>
                <label className="block">
                  <span className="text-xs font-medium tracking-normal text-[var(--admin-text-secondary)]">Phone Ext.</span>
                  <input type="tel" value={employeeForm.phoneExtension} onChange={event => setEmployeeForm(current => ({ ...current, phoneExtension: event.target.value }))} className={fieldClassName} inputMode="numeric" />
                </label>
              </div>
              <label className="block">
                <span className="text-xs font-medium tracking-normal text-[var(--admin-text-secondary)]">Email</span>
                <input type="email" spellCheck={false} value={employeeForm.email} onChange={event => setEmployeeForm(current => ({ ...current, email: event.target.value }))} placeholder="Optional" className={fieldClassName} inputMode="email" autoComplete="off" />
              </label>
              <label className="block">
                <span className="text-xs font-medium tracking-normal text-[var(--admin-text-secondary)]">Department</span>
                <input list="management-department-options" value={employeeForm.department} onChange={event => setEmployeeForm(current => ({ ...current, department: event.target.value }))} className={fieldClassName} />
              </label>
            </div>
            {selectedEmployee && (
              <div className="mt-4 border border-[var(--admin-state-dirty-border)] bg-[var(--admin-state-dirty-bg)] p-3 text-xs leading-5 text-[var(--admin-state-dirty-text)]">
                <div className="font-semibold tracking-normal">Deactivation impact</div>
                <div className="mt-1">
                  Current draft seat: <span className="font-bold">{selectedEmployeeSeatLabel}</span>.
                  {selectedEmployeeSeatLabel === "Unassigned"
                    ? " Deactivation removes this employee from the active directory."
                    : " Deactivation clears this draft assignment. The published map everyone sees won't change until you publish again."}
                </div>
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" variant="primary" onClick={saveEmployee} disabled={pending || !employeeForm.fullName.trim()}>{selectedEmployee ? "Save employee" : "Add employee"}</Button>
              <Button type="button" onClick={closeEmployeeDialog} disabled={pending}>Cancel</Button>
              {selectedEmployee && <Button type="button" variant="danger" onClick={deleteEmployee} disabled={pending}>Deactivate</Button>}
            </div>
          </section>
        </div>
      )}

      {managementConfirm && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-[var(--admin-chrome-bg)]/45 p-3 backdrop-blur-[2px] sm:items-center">
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
            className="w-full max-w-lg overscroll-contain border border-[var(--admin-border)] bg-[var(--admin-surface)] p-4 text-[var(--admin-text-primary)] shadow-panel"
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
                <p id="management-confirm-description" className="mt-1 text-sm leading-5 text-[var(--admin-text-secondary)]">
                  Review the exact management impact before applying this cleanup.
                </p>
              </div>
              <button
                type="button"
                onClick={closeManagementConfirm}
                disabled={pending}
                className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold text-[var(--admin-text-muted)] transition hover:bg-[var(--admin-surface-alt)] hover:text-[var(--admin-text-primary)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus-ring-color)]"
                aria-label="Cancel management confirmation"
              >
                <CloseIcon />
              </button>
            </div>

            <div className="mt-4 grid gap-2">
              {managementConfirm.kind === "employee" && (
                <div className="border border-[var(--admin-state-dirty-border)] bg-[var(--admin-state-dirty-bg)] p-3 text-sm leading-5 text-[var(--admin-state-dirty-text)]">
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
                <div className="border border-[var(--admin-state-dirty-border)] bg-[var(--admin-state-dirty-bg)] p-3 text-sm leading-5 text-[var(--admin-state-dirty-text)]">
                  <div className="font-semibold tracking-normal">Department delete impact</div>
                  <div className="mt-1">
                    Clears this department from <span className="font-bold">{pluralize(managementConfirm.affectedCount, "active employee")}</span>. Employee records remain active and physical seat zones are unchanged.
                  </div>
                </div>
              )}

              {managementConfirm.kind === "zone" && (
                <div className="border border-[var(--admin-state-dirty-border)] bg-[var(--admin-state-dirty-bg)] p-3 text-sm leading-5 text-[var(--admin-state-dirty-text)]">
                  <div className="font-semibold tracking-normal">Zone delete impact</div>
                  <div className="mt-1">
                    Clears this physical zone from <span className="font-bold">{pluralize(managementConfirm.affectedCount, "draft seat")}</span>. Seat markers and employees remain in place.
                  </div>
                </div>
              )}

              <div className="border border-[var(--admin-publish-ready-border)] bg-[var(--admin-publish-ready-bg)] p-3 text-sm font-semibold leading-5 text-[var(--admin-publish-ready-text)]">
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
              <Button type="button" variant="danger" onClick={confirmManagementDestructiveAction} disabled={pending} className="w-full">
                {managementConfirm.kind === "employee"
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
