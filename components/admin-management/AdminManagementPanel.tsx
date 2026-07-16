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
import { buildDepartmentRoster, departmentKey } from "@/lib/departments";
import { computeVirtualWindow } from "@/lib/virtualizedList";
import { formatDisplayName } from "@/lib/formatName";
import { buildInitials } from "@/lib/validators";
import { Button } from "@/components/ui/Button";
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

function TrashIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

export function AdminManagementPanel({
  employees,
  seats,
  departmentOptions,
  zoneOptions
}: AdminManagementPanelProps) {
  const managementConfirmDialogFocusRef = useDialogFocus<HTMLElement>();
  const [localEmployees, setLocalEmployees] = useState(employees);
  const [localDepartmentOptions, setLocalDepartmentOptions] = useState(departmentOptions);
  const [localZoneOptions, setLocalZoneOptions] = useState(zoneOptions);
  const [localSeats, setLocalSeats] = useState(seats);
  const [activeTab, setActiveTab] = useState<ManagementTab>("employees");
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
    { label: "Assigned employees", value: assignedEmployees },
    { label: "Unassigned employees", value: unassignedEmployees },
    { label: "Active zones", value: zoneNames.length }
  ];
  const fieldClassName = "w-full border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--admin-primary-cta)] focus:ring-2 focus:ring-[color:var(--sp-focus-ring-color)]";

  // Virtualized directory (Figma page 10, Scalability): only the employee rows
  // near the viewport render; padding preserves the page scroll height. Geometry
  // is measured from the live table so the rows keep their exact current look.
  const employeeGridRef = useRef<HTMLTableSectionElement | null>(null);
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
    setError(errorValue instanceof Error ? errorValue.message : fallback);
  }

  function startNewEmployee() {
    setSelectedEmployeeId("");
    setEmployeeForm(emptyEmployeeForm);
    setMessage(null);
    setError(null);
  }

  function editEmployee(employee: Employee) {
    setSelectedEmployeeId(employee.id);
    setEmployeeForm(formFromEmployee(employee));
    setActiveTab("employees");
    setMessage(null);
    setError(null);
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
        const employee = selectedEmployee
          ? await updateEmployeeAction({ employeeId: selectedEmployee.id, ...payload })
          : await createEmployeeAction(payload);

        setLocalEmployees(current => {
          const exists = current.some(item => item.id === employee.id);
          if (!exists) return [...current, employee].sort((a, b) => a.full_name.localeCompare(b.full_name));
          return current.map(item => (item.id === employee.id ? employee : item));
        });
        setSelectedEmployeeId(employee.id);
        setEmployeeForm(formFromEmployee(employee));
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
    setManagementConfirm({ kind: "employee", employee: selectedEmployee, assignedSeatLabel: selectedEmployeeSeatLabel });
  }

  function createDepartment() {
    startTransition(async () => {
      try {
        setError(null);
        const department = await createDepartmentAction(newDepartmentName);
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
        const department = await createDepartmentAction(name);
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
        const zone = await createZoneAction(newZoneName);
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
          await deleteEmployeeAction(action.employee.id);
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
          await deleteDepartmentAction(action.name);
          setLocalDepartmentOptions(current => current.map(option => (option.name === action.name ? { ...option, active: false } : option)));
          setLocalEmployees(current => current.map(employee => (
            employee.department === action.name ? { ...employee, department: null } : employee
          )));
          showSuccess(`Department ${action.name} deleted.`);
          return;
        }

        await deleteZoneAction(action.name);
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
    <main className="admin-theme flex-1 bg-[var(--admin-bg)] px-3 py-5 text-[var(--admin-text-primary)] sm:px-6 sm:py-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <header className="border-b border-[var(--admin-border)] pb-4">
          <h1 className="text-xl font-semibold text-[var(--admin-text-primary)]">Management</h1>
          <p className="mt-1 max-w-2xl text-sm leading-5 text-[var(--admin-text-muted)]">
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

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {managementSummaryCards.map(card => (
            <div key={card.label} className="border border-[var(--admin-border)] bg-[var(--admin-surface)] p-4 shadow-elevation-2">
              <div className="text-2xl font-semibold text-[var(--admin-text-primary)]">{card.value}</div>
              <div className="mt-1 text-xs font-medium tracking-normal text-[var(--admin-text-secondary)]">{card.label}</div>
            </div>
          ))}
        </section>

        <nav aria-label="Management sections" className="flex flex-wrap border-b border-[var(--admin-border)]">
          {managementTabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={[
                "-mb-px border-b-2 px-4 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-primary)]",
                activeTab === tab.id
                  ? "border-[var(--admin-primary)] font-semibold text-[var(--admin-text-primary)]"
                  : "border-transparent font-medium text-[var(--admin-text-secondary)] hover:border-[var(--admin-border)] hover:bg-[var(--admin-surface-alt)] hover:text-[var(--admin-text-primary)]"
              ].join(" ")}
              aria-current={activeTab === tab.id ? "page" : undefined}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {activeTab === "employees" && (
          <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
            <div className="border border-[var(--admin-border)] bg-[var(--admin-surface)] p-4 shadow-elevation-2">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-[var(--admin-text-primary)]">Employees</h2>
                  <p className="text-sm text-[var(--admin-text-secondary)]">Search, edit, and deactivate employees. Seat placement happens on the map.</p>
                </div>
                <input
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder="Search employees..."
                  className="w-full border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--admin-primary-cta)] focus:ring-2 focus:ring-[color:var(--sp-focus-ring-color)] md:w-80"
                />
              </div>
              <p aria-live="polite" className="mt-3 text-xs font-medium text-[var(--admin-text-secondary)]">
                {pluralize(sortedEmployees.length, "employee")} of {activeEmployees.length.toLocaleString()} shown
              </p>
              {sortedEmployees.length === 0 ? (
                <div className="mt-2 border border-dashed border-[var(--admin-border)] bg-[var(--admin-surface-alt)] p-5 text-sm text-[var(--admin-text-secondary)]">
                  <div className="font-semibold text-[var(--admin-text-primary)]">No employees match this search</div>
                  <p className="mt-1">Try a different name, department, position, or seat label.</p>
                </div>
              ) : (
                <div className="mt-2 overflow-x-auto border border-[var(--admin-border)]">
                  <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-[var(--admin-border-subtle,var(--admin-border))] bg-[var(--admin-surface-alt)] text-xs font-medium tracking-normal text-[var(--admin-text-secondary)]">
                        {employeeColumns.map(column => {
                          const isSorted = sortKey === column.key;
                          return (
                            <th
                              key={column.key}
                              scope="col"
                              aria-sort={isSorted ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
                              className="px-3 py-2 font-medium"
                            >
                              <button
                                type="button"
                                onClick={() => toggleSort(column.key)}
                                className="inline-flex items-center gap-1 outline-none hover:text-[var(--admin-text-primary)] focus-visible:ring-2 focus-visible:ring-[color:var(--sp-focus-ring-color)]"
                              >
                                <span>{column.label}</span>
                                <span aria-hidden="true" className={isSorted ? "text-[var(--admin-text-primary)]" : "text-transparent"}>
                                  {isSorted ? (sortDirection === "asc" ? "▲" : "▼") : "▲"}
                                </span>
                              </button>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody ref={employeeGridRef}>
                      {employeeWindow.topPadding > 0 && (
                        <tr aria-hidden="true">
                          <td colSpan={employeeColumns.length} style={{ height: employeeWindow.topPadding, padding: 0 }} />
                        </tr>
                      )}
                      {visibleEmployees.map(employee => {
                        const seatLabel = seatLabelByEmployeeId.get(employee.id) ?? "Unassigned";
                        const isAssigned = seatLabelByEmployeeId.has(employee.id);
                        const isSelected = selectedEmployeeId === employee.id;
                        // Background lives on the cells (not the <tr>) so it paints
                        // reliably under border-collapse in every browser.
                        const cellBg = isSelected ? "bg-[var(--admin-primary-soft)]" : "group-hover/row:bg-[var(--admin-surface-alt)]";
                        return (
                          <tr
                            key={employee.id}
                            data-directory-row
                            aria-selected={isSelected}
                            onClick={() => editEmployee(employee)}
                            tabIndex={0}
                            onKeyDown={event => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                editEmployee(employee);
                              }
                            }}
                            className="group/row cursor-pointer border-b border-[var(--admin-border-subtle,var(--admin-border))] outline-none transition last:border-b-0 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--sp-focus-ring-color)]"
                          >
                            <td className={["px-3 py-2 transition-colors", cellBg, isSelected ? "border-l-2 border-l-[var(--admin-primary-border)]" : "border-l-2 border-l-transparent"].join(" ")}>
                              <div className="flex items-center gap-3">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--admin-primary-soft)] text-xs font-semibold text-[var(--admin-primary-on-soft)]">{getInitials(employee.full_name)}</div>
                                <span className="truncate font-semibold text-[var(--admin-text-primary)]">{formatDisplayName(employee.full_name)}</span>
                              </div>
                            </td>
                            <td className={["px-3 py-2 transition-colors text-[var(--admin-text-secondary)]", cellBg].join(" ")}>{employee.department || "—"}</td>
                            <td className={["px-3 py-2 transition-colors text-[var(--admin-text-secondary)]", cellBg].join(" ")}>{employee.position || "—"}</td>
                            <td className={["px-3 py-2 transition-colors text-[var(--admin-text-secondary)]", cellBg].join(" ")}>{employee.phone_extension || "—"}</td>
                            <td className={["px-3 py-2 transition-colors font-medium text-[var(--admin-text-primary)]", cellBg].join(" ")}>{seatLabel}</td>
                            <td className={["px-3 py-2 transition-colors", cellBg].join(" ")}>
                              {/* Assigned mirrors the map legend's green chip — the
                                  orange-soft family reads as a warning here. */}
                              <span className={["inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium", isAssigned ? "bg-[var(--admin-success-soft)] text-[var(--admin-success)] ring-1 ring-[var(--admin-success)]/30" : "bg-[var(--admin-surface-alt)] text-[var(--admin-text-secondary)]"].join(" ")}>
                                {isAssigned && <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />}
                                {isAssigned ? "Assigned" : "Active"}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                      {employeeWindow.bottomPadding > 0 && (
                        <tr aria-hidden="true">
                          <td colSpan={employeeColumns.length} style={{ height: employeeWindow.bottomPadding, padding: 0 }} />
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <aside className="border border-[var(--admin-border)] bg-[var(--admin-surface)] p-4 shadow-elevation-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-[var(--admin-text-primary)]">{selectedEmployee ? "Edit employee" : "Add employee"}</h2>
                  <p className="text-sm text-[var(--admin-text-secondary)]">Changes update the employee directory and draft seat references.</p>
                </div>
                <Button type="button" onClick={startNewEmployee} disabled={pending}>New</Button>
              </div>

              <div className="mt-4 space-y-3">
                <label className="block">
                  <span className="text-xs font-medium tracking-normal text-[var(--admin-text-secondary)]">Name</span>
                  <input value={employeeForm.fullName} onChange={event => setEmployeeForm(current => ({ ...current, fullName: event.target.value }))} className={fieldClassName} />
                </label>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-xs font-medium tracking-normal text-[var(--admin-text-secondary)]">Position</span>
                    <input value={employeeForm.position} onChange={event => setEmployeeForm(current => ({ ...current, position: event.target.value }))} className={fieldClassName} />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium tracking-normal text-[var(--admin-text-secondary)]">Phone Ext.</span>
                    <input value={employeeForm.phoneExtension} onChange={event => setEmployeeForm(current => ({ ...current, phoneExtension: event.target.value }))} className={fieldClassName} inputMode="numeric" />
                  </label>
                </div>
                <label className="block">
                  <span className="text-xs font-medium tracking-normal text-[var(--admin-text-secondary)]">Email</span>
                  <input type="email" value={employeeForm.email} onChange={event => setEmployeeForm(current => ({ ...current, email: event.target.value }))} placeholder="Optional" className={fieldClassName} inputMode="email" autoComplete="off" />
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
                {selectedEmployee && <Button type="button" variant="danger" onClick={deleteEmployee} disabled={pending}>Deactivate</Button>}
              </div>
            </aside>
          </section>
        )}

        {activeTab === "departments" && (
          <section className="border border-[var(--admin-border)] bg-[var(--admin-surface)] p-4 shadow-elevation-2">
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
                    <div className="text-xs text-[var(--admin-text-secondary)]">{row.employeeCount} employee{row.employeeCount === 1 ? "" : "s"}</div>
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
                        className="inline-flex h-8 w-8 items-center justify-center text-[var(--admin-text-muted)] opacity-0 outline-none transition hover:bg-[var(--admin-state-error-bg)] hover:text-[var(--admin-state-error-text)] focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-[var(--admin-error)] disabled:cursor-not-allowed disabled:opacity-30 group-hover:opacity-100 group-focus-within:opacity-100"
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
          <section className="border border-[var(--admin-border)] bg-[var(--admin-surface)] p-4 shadow-elevation-2">
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
                    <div className="text-xs text-[var(--admin-text-secondary)]">{zoneCounts.get(name) ?? 0} draft seat{(zoneCounts.get(name) ?? 0) === 1 ? "" : "s"}</div>
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
                        className="inline-flex h-8 w-8 items-center justify-center text-[var(--admin-text-muted)] opacity-0 outline-none transition hover:bg-[var(--admin-state-error-bg)] hover:text-[var(--admin-state-error-text)] focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-[var(--admin-error)] disabled:cursor-not-allowed disabled:opacity-30 group-hover:opacity-100 group-focus-within:opacity-100"
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
          <section className="border border-[var(--admin-border)] bg-[var(--admin-surface)] p-4 shadow-elevation-2 sm:p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="max-w-2xl">
                <h2 className="text-lg font-semibold text-[var(--admin-text-primary)]">Publish History</h2>
                <p className="text-sm leading-6 text-[var(--admin-text-secondary)]">
                  Recent completed publishes from the draft map, including published seat count and admin identity when the profile can be resolved.
                </p>
              </div>
              <Button type="button" onClick={loadPublishHistory} disabled={publishHistoryState.status === "loading"}>
                {publishHistoryState.status === "loading" ? "Loading" : "Refresh history"}
              </Button>
            </div>

            {publishHistoryState.status === "loading" && (
              <>
                <div className="mt-4 border border-[var(--admin-border)] bg-[var(--admin-surface-alt)] p-4">
                  <div className="h-3 w-24 animate-pulse rounded bg-[var(--admin-border)]" />
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div className="h-14 animate-pulse bg-[var(--admin-surface)]" />
                    <div className="h-14 animate-pulse bg-[var(--admin-surface)]" />
                    <div className="h-14 animate-pulse bg-[var(--admin-surface)]" />
                  </div>
                </div>
                <div className="mt-4 divide-y divide-[var(--admin-border-subtle,var(--admin-border))] border border-[var(--admin-border)]">
                  {[0, 1, 2].map(item => (
                    <div key={item} className="grid gap-3 p-3 md:grid-cols-[minmax(0,1.4fr)_120px_minmax(0,1fr)_minmax(0,1.2fr)_80px]">
                      <div className="h-5 animate-pulse rounded bg-[var(--admin-surface-alt)]" />
                      <div className="h-5 animate-pulse rounded bg-[var(--admin-surface-alt)]" />
                      <div className="h-5 animate-pulse rounded bg-[var(--admin-surface-alt)]" />
                      <div className="h-5 animate-pulse rounded bg-[var(--admin-surface-alt)]" />
                      <div className="h-5 animate-pulse rounded bg-[var(--admin-surface-alt)]" />
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
                      <div className="text-[11px] font-semibold tracking-normal text-[var(--admin-text-secondary)]">Latest Publish</div>
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
                        <div className="text-xs font-medium tracking-normal text-[var(--admin-text-muted)]">Seat Count</div>
                        <div className="mt-1 text-sm font-semibold text-[var(--admin-text-primary)]">{latestPublish.seat_count.toLocaleString()}</div>
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-medium tracking-normal text-[var(--admin-text-muted)]">Published By</div>
                        <div className="mt-1 break-all text-sm font-semibold text-[var(--admin-text-primary)]" title={latestPublish.published_by ?? undefined}>
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
                    <div>Created At</div>
                    <div>Seat Count</div>
                    <div>Published By</div>
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
                          <div className="text-[11px] font-semibold tracking-normal text-[var(--admin-text-secondary)] md:hidden">Created At</div>
                          <div className="font-semibold text-[var(--admin-text-primary)]">{formatPublishDate(event.created_at)}</div>
                        </div>
                        <div>
                          <div className="text-[11px] font-semibold tracking-normal text-[var(--admin-text-secondary)] md:hidden">Seat Count</div>
                          <div className="font-semibold text-[var(--admin-text-primary)]">{event.seat_count.toLocaleString()}</div>
                        </div>
                        <div className="min-w-0">
                          <div className="text-[11px] font-semibold tracking-normal text-[var(--admin-text-secondary)] md:hidden">Published By</div>
                          <div className="break-all font-semibold text-[var(--admin-text-secondary)]" title={event.published_by ?? undefined}>
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

        <datalist id="management-department-options">
          {departmentNames.map(name => <option key={name} value={name} />)}
        </datalist>
      </div>

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
            className="w-full max-w-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] p-4 text-[var(--admin-text-primary)] shadow-panel"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="management-confirm-title" className="text-base font-semibold">
                  {managementConfirm.kind === "employee"
                    ? `Deactivate ${formatDisplayName(managementConfirm.employee.full_name)}?`
                    : managementConfirm.kind === "department"
                      ? `Delete department "${managementConfirm.name}"?`
                      : `Delete zone "${managementConfirm.name}"?`}
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
                x
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
