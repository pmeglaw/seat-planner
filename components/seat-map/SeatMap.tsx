"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { PointerEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  canRedoDraftHistory,
  canUndoDraftHistory,
  clearDraftHistory,
  createDraftHistory,
  createDraftSnapshot,
  pushDraftHistory,
  redoDraftHistory,
  undoDraftHistory,
  type DraftSnapshot
} from "@/lib/draftHistory";
import type { DepartmentOption, Employee, SeatStatus, SeatWithEmployee, ZoneOption } from "@/lib/types";
import { createSeatAction, deleteSeatAction, moveSeatAction, publishSeatMapAction, restoreDraftSnapshotAction } from "@/app/actions";
import { normalizePoint } from "@/lib/seatMath";
import { buildNextSeatLabel } from "@/lib/seatLabels";
import { AdvancedDrawer } from "@/components/seat-map/AdvancedDrawer";
import { FilterPanel } from "@/components/seat-map/FilterPanel";
import { SeatInspector } from "@/components/seat-map/SeatInspector";
import { SeatMarker } from "@/components/seat-map/SeatMarker";
import { Button } from "@/components/ui/Button";

type SeatMapProps = {
  seats: SeatWithEmployee[];
  employees: Employee[];
  departmentOptions?: DepartmentOption[];
  zoneOptions?: ZoneOption[];
  canEdit: boolean;
};

type DragState = {
  seatId: string;
  pointerId: number;
  beforeSnapshot: DraftSnapshot;
} | null;

function normalizeSeat(seat: SeatWithEmployee): SeatWithEmployee {
  return {
    ...seat,
    x: Number(seat.x),
    y: Number(seat.y),
    zone: seat.zone ?? seat.department ?? null,
    is_custom: Boolean(seat.is_custom)
  };
}

function normalizeSeats(seats: SeatWithEmployee[]) {
  return seats.map(normalizeSeat);
}

function replaceSeat(seats: SeatWithEmployee[], nextSeat: SeatWithEmployee) {
  const normalizedSeat = normalizeSeat(nextSeat);
  const exists = seats.some(seat => seat.id === nextSeat.id);
  if (!exists) return [...seats, normalizedSeat].sort((a, b) => a.label.localeCompare(b.label));
  return seats.map(seat => (seat.id === nextSeat.id ? normalizedSeat : seat));
}

function replaceEmployee(employees: Employee[], seat: SeatWithEmployee) {
  const nextEmployee = seat.employee;
  if (!nextEmployee) return employees;
  const exists = employees.some(employee => employee.id === nextEmployee.id);
  if (!exists) return [...employees, nextEmployee].sort((a, b) => a.full_name.localeCompare(b.full_name));
  return employees.map(employee => (employee.id === nextEmployee.id ? nextEmployee : employee));
}

function getSeatZone(seat: SeatWithEmployee) {
  return seat.zone ?? seat.department ?? "";
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map(part => part[0]?.toUpperCase()).join("") || "?";
}


export function SeatMap({
  seats,
  employees,
  departmentOptions = [],
  zoneOptions = [],
  canEdit
}: SeatMapProps) {
  const [localSeats, setLocalSeats] = useState(() => normalizeSeats(seats));
  const [localEmployees, setLocalEmployees] = useState(employees);
  const [localDepartmentOptions, setLocalDepartmentOptions] = useState(departmentOptions);
  const [localZoneOptions, setLocalZoneOptions] = useState(zoneOptions);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null);
  const [moveSeatMode, setMoveSeatMode] = useState(false);
  const [addSeatMode, setAddSeatMode] = useState(false);
  const [addSeatZone, setAddSeatZone] = useState("all");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [dragState, setDragState] = useState<DragState>(null);
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("all");
  const [zone, setZone] = useState("all");
  const [status, setStatus] = useState("all");
  const [filterCollapsed, setFilterCollapsed] = useState(false);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [inspectorDirty, setInspectorDirty] = useState(false);
  const [showNames, setShowNames] = useState(true);
  const [draftHistory, setDraftHistory] = useState(() => createDraftHistory());
  const [pending, startTransition] = useTransition();
  const mapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setLocalSeats(normalizeSeats(seats)), [seats]);
  useEffect(() => setLocalEmployees(employees), [employees]);
  useEffect(() => setLocalDepartmentOptions(departmentOptions), [departmentOptions]);
  useEffect(() => setLocalZoneOptions(zoneOptions), [zoneOptions]);
  useEffect(() => {
    if (!selectedSeatId) setInspectorCollapsed(false);
  }, [selectedSeatId]);

  useEffect(() => {
    function isEditableTarget(target: EventTarget | null) {
      return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;

      if (advancedOpen) {
        setAdvancedOpen(false);
        return;
      }

      if (addSeatMode || moveSeatMode) {
        setAddSeatMode(false);
        setMoveSeatMode(false);
        setDragState(null);
        setActionNotice("Draft map mode canceled.");
        return;
      }

      if (!isEditableTarget(event.target) && selectedSeatId && !inspectorDirty) {
        setSelectedSeatId(null);
        setInspectorCollapsed(false);
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [addSeatMode, advancedOpen, inspectorDirty, moveSeatMode, selectedSeatId]);

  const departments = useMemo(() => {
    const values = new Set<string>();
    localDepartmentOptions.filter(item => item.active).forEach(item => values.add(item.name));
    localEmployees.forEach(emp => {
      if (emp.department) values.add(emp.department);
    });
    return Array.from(values).sort();
  }, [localDepartmentOptions, localEmployees]);

  const zones = useMemo(() => {
    const values = new Set<string>();
    localZoneOptions.filter(item => item.active).forEach(item => values.add(item.name));
    localSeats.forEach(seat => {
      const seatZone = getSeatZone(seat);
      if (seatZone) values.add(seatZone);
    });
    return Array.from(values).sort();
  }, [localSeats, localZoneOptions]);

  useEffect(() => {
    if (addSeatZone !== "all" && !zones.includes(addSeatZone)) {
      setAddSeatZone("all");
    }
  }, [addSeatZone, zones]);

  const stats = useMemo(() => ({
    total: localSeats.length,
    assigned: localSeats.filter(seat => seat.status === "assigned").length,
    available: localSeats.filter(seat => seat.status === "available").length,
    reserved: localSeats.filter(seat => seat.status === "reserved").length
  }), [localSeats]);

  const employeeResults = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return localEmployees
      .map(employee => {
        const assignedSeat = localSeats.find(seat => seat.employee_id === employee.id) ?? null;
        const metaParts = [employee.position, employee.department, assignedSeat ? assignedSeat.label : "Unassigned"].filter(Boolean);
        return {
          id: employee.id,
          name: employee.full_name,
          meta: metaParts.join(" · ") || "No details",
          initials: getInitials(employee.full_name),
          seatId: assignedSeat?.id ?? null,
          seatLabel: assignedSeat?.label ?? null,
          searchable: [employee.full_name, employee.position, employee.department, assignedSeat?.label, assignedSeat ? getSeatZone(assignedSeat) : ""].filter(Boolean).join(" ").toLowerCase()
        };
      })
      .filter(result => !needle || result.searchable.includes(needle))
      .slice(0, 30);
  }, [localEmployees, localSeats, search]);

  const selectedSeat = localSeats.find(seat => seat.id === selectedSeatId) ?? null;
  const undoAvailable = canUndoDraftHistory(draftHistory);
  const redoAvailable = canRedoDraftHistory(draftHistory);
  const nextUndoLabel = draftHistory.undoStack.at(-1)?.label ?? null;
  const nextRedoLabel = draftHistory.redoStack.at(-1)?.label ?? null;
  const historyStatusMessage = inspectorDirty
    ? "Save or discard inspector edits before undo/redo."
    : nextUndoLabel
      ? `Undo next: ${nextUndoLabel}`
      : nextRedoLabel
        ? `Redo available: ${nextRedoLabel}`
        : "No draft edits to undo. Draft history clears after publish.";

  function eventToPoint(event: Pick<PointerEvent<HTMLElement>, "clientX" | "clientY">) {
    const rect = mapRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return normalizePoint({
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height
    });
  }

  function matchesFilters(seat: SeatWithEmployee) {
    const needle = search.trim().toLowerCase();
    const haystack = [
      seat.label,
      seat.status,
      getSeatZone(seat),
      seat.employee?.full_name,
      seat.employee?.position,
      seat.employee?.department
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    const seatDepartment = seat.employee?.department ?? "";
    const seatZone = getSeatZone(seat);
    const searchOk = !needle || haystack.includes(needle);
    const departmentOk = department === "all" || seatDepartment === department;
    const zoneOk = zone === "all" || seatZone === zone;
    const statusOk = status === "all" || seat.status === (status as SeatStatus);

    return searchOk && departmentOk && zoneOk && statusOk;
  }

  function canDiscardInspectorChanges() {
    if (!inspectorDirty) return true;
    return window.confirm("You have unsaved seat edits. Discard them?");
  }

  function captureDraftSnapshot() {
    return createDraftSnapshot(localSeats, localEmployees);
  }

  function applyRestoredDraftPayload(payload: { seats: SeatWithEmployee[]; employees: Employee[] }) {
    const restoredSeats = normalizeSeats(payload.seats);
    setLocalSeats(restoredSeats);
    setLocalEmployees(payload.employees);
    setSelectedSeatId(current => (current && restoredSeats.some(seat => seat.id === current) ? current : null));
    setInspectorDirty(false);
    setMoveSeatMode(false);
    setAddSeatMode(false);
    setDragState(null);
  }

  function recordDraftHistory(label: string, before: DraftSnapshot, afterSeats: SeatWithEmployee[], afterEmployees: Employee[]) {
    const after = createDraftSnapshot(afterSeats, afterEmployees);
    setDraftHistory(current => pushDraftHistory(current, { label, before, after }));
  }

  function describeSeatUpdate(before: DraftSnapshot, updated: SeatWithEmployee) {
    const previous = before.seats.find(seat => seat.id === updated.id);
    if (!previous) return `Update ${updated.label}`;
    if (previous.employee_id && !updated.employee_id) return `Vacate ${updated.label}`;
    if (!previous.employee_id && updated.employee_id) return `Assign ${updated.label}`;
    if (previous.employee_id !== updated.employee_id) return `Change assignment ${updated.label}`;
    if (previous.status !== updated.status) return `Change status ${updated.label}`;
    return `Update ${updated.label}`;
  }

  function restoreHistorySnapshot(snapshot: DraftSnapshot, nextHistory: typeof draftHistory, actionLabel: string, notice: string) {
    if (inspectorDirty && !canDiscardInspectorChanges()) return;

    startTransition(async () => {
      try {
        setActionError(null);
        setActionNotice(null);
        const restored = await restoreDraftSnapshotAction(snapshot);
        applyRestoredDraftPayload(restored);
        setDraftHistory(nextHistory);
        setActionNotice(notice);
        setAdvancedOpen(false);
      } catch (error) {
        setActionNotice(null);
        setActionError(error instanceof Error ? error.message : `Could not ${actionLabel.toLowerCase()} draft edit.`);
      }
    });
  }

  function undoDraftEdit() {
    const result = undoDraftHistory(draftHistory);
    if (!result) return;
    restoreHistorySnapshot(result.snapshot, result.history, "Undo", `Undid ${result.entry.label}.`);
  }

  function redoDraftEdit() {
    const result = redoDraftHistory(draftHistory);
    if (!result) return;
    restoreHistorySnapshot(result.snapshot, result.history, "Redo", `Redid ${result.entry.label}.`);
  }

  function clearFilters() {
    setSearch("");
    setDepartment("all");
    setZone("all");
    setStatus("all");
  }

  function selectSeat(seatId: string) {
    if (selectedSeatId === seatId) {
      setMoveSeatMode(false);
      setAddSeatMode(false);
      setInspectorCollapsed(false);
      return true;
    }

    if (selectedSeatId && !canDiscardInspectorChanges()) return false;
    setSelectedSeatId(seatId);
    setInspectorDirty(false);
    setMoveSeatMode(false);
    setAddSeatMode(false);
    setInspectorCollapsed(false);
    return true;
  }

  function selectEmployeeSeat(seatId: string) {
    if (selectSeat(seatId)) setFilterCollapsed(true);
  }

  function startAddSeatMode() {
    if (selectedSeatId && !canDiscardInspectorChanges()) return;
    setSelectedSeatId(null);
    setInspectorDirty(false);
    setMoveSeatMode(false);
    setAddSeatMode(true);
    setAdvancedOpen(false);
    setInspectorCollapsed(false);
  }

  function cancelAddSeatMode() {
    setAddSeatMode(false);
  }

  function clearSelection() {
    if (selectedSeatId && !canDiscardInspectorChanges()) return;
    setSelectedSeatId(null);
    setInspectorDirty(false);
    setMoveSeatMode(false);
    setAddSeatMode(false);
    setInspectorCollapsed(false);
  }

  function handleMapPointerDown(event: PointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("[data-seat-id]")) return;

    if (canEdit && addSeatMode) {
      const point = eventToPoint(event);
      if (!point) return;
      const beforeSnapshot = captureDraftSnapshot();

      startTransition(async () => {
        try {
          setActionError(null);
          setActionNotice(null);
          const targetZone = addSeatZone === "all" ? null : addSeatZone;
          const created = await createSeatAction({
            label: buildNextSeatLabel(localSeats, targetZone),
            x: point.x,
            y: point.y,
            zone: targetZone
          });
          const afterSeats = replaceSeat(beforeSnapshot.seats, created);
          recordDraftHistory(`Add ${created.label}`, beforeSnapshot, afterSeats, beforeSnapshot.employees);
          setLocalSeats(afterSeats);
          setSelectedSeatId(created.id);
          setInspectorDirty(false);
          setAddSeatMode(false);
          setMoveSeatMode(false);
          setActionNotice(`Added custom seat ${created.label}.`);
        } catch (error) {
          setActionNotice(null);
          setActionError(error instanceof Error ? error.message : "Could not create seat.");
        }
      });
      return;
    }

    if (!dragState) {
      if (selectedSeatId && !canDiscardInspectorChanges()) return;
      setSelectedSeatId(null);
      setInspectorDirty(false);
      setMoveSeatMode(false);
    }
  }

  function handleMovePointerDown(event: PointerEvent<HTMLButtonElement>, seatId: string) {
    if (!canEdit || !moveSeatMode || selectedSeatId !== seatId) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragState({ seatId, pointerId: event.pointerId, beforeSnapshot: captureDraftSnapshot() });
  }

  function handleMapPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!dragState) return;
    const point = eventToPoint(event);
    if (!point) return;

    setLocalSeats(current => current.map(seat => (seat.id === dragState.seatId ? { ...seat, x: point.x, y: point.y } : seat)));
  }

  function handleMapPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!dragState) return;
    const point = eventToPoint(event);
    const seatId = dragState.seatId;
    const beforeSnapshot = dragState.beforeSnapshot;
    setDragState(null);
    setMoveSeatMode(false);
    if (!point) {
      applyRestoredDraftPayload(beforeSnapshot);
      return;
    }

    startTransition(async () => {
      try {
        setActionError(null);
        setActionNotice(null);
        const updated = await moveSeatAction({ seatId, x: point.x, y: point.y });
        const afterSeats = replaceSeat(beforeSnapshot.seats, updated);
        recordDraftHistory(`Move ${updated.label}`, beforeSnapshot, afterSeats, beforeSnapshot.employees);
        setLocalSeats(afterSeats);
        setActionNotice(`Moved ${updated.label}.`);
      } catch (error) {
        applyRestoredDraftPayload(beforeSnapshot);
        setActionNotice(null);
        setActionError(error instanceof Error ? error.message : "Could not move seat.");
      }
    });
  }

  function deleteSelectedSeat() {
    if (!selectedSeat) {
      setActionError("Select a custom seat first.");
      return;
    }

    if (!selectedSeat.is_custom) {
      setActionError(`${selectedSeat.label} is an original seat and cannot be deleted.`);
      return;
    }

    const confirmed = window.confirm(`Delete custom seat ${selectedSeat.label}? This removes it from the draft map. Publish the draft to update the viewer map.`);
    if (!confirmed) return;
    const beforeSnapshot = captureDraftSnapshot();
    const deletedSeatLabel = selectedSeat.label;

    startTransition(async () => {
      try {
        setActionError(null);
        setActionNotice(null);
        const result = await deleteSeatAction(selectedSeat.id);
        const afterSeats = beforeSnapshot.seats.filter(seat => seat.id !== result.seatId);
        recordDraftHistory(`Delete ${deletedSeatLabel}`, beforeSnapshot, afterSeats, beforeSnapshot.employees);
        setLocalSeats(afterSeats);
        setSelectedSeatId(null);
        setInspectorDirty(false);
        setMoveSeatMode(false);
        setAdvancedOpen(false);
        setActionNotice(`Deleted custom seat ${deletedSeatLabel}. Undo is available until publish.`);
      } catch (error) {
        setActionNotice(null);
        setActionError(error instanceof Error ? error.message : "Could not delete custom seat.");
      }
    });
  }

  function publishDraftMap() {
    const unavailable = localSeats.filter(seat => seat.status === "unavailable").length;
    const confirmed = window.confirm(
      [
        "Publish draft map to the viewer-facing seat map?",
        "",
        "Viewers will see the current draft after this completes.",
        "Undo/Redo history will be cleared after publish.",
        "",
        `Total seats: ${stats.total}`,
        `Assigned seats: ${stats.assigned}`,
        `Available seats: ${stats.available}`,
        `Reserved seats: ${stats.reserved}`,
        `Unavailable seats: ${unavailable}`,
        "",
        "Use Cancel if you need to review or undo more draft changes first."
      ].join("\n")
    );
    if (!confirmed) return;

    startTransition(async () => {
      try {
        setActionError(null);
        setActionNotice(null);
        await publishSeatMapAction();
        setDraftHistory(clearDraftHistory());
        setAdvancedOpen(false);
        setActionNotice("Draft map published. Undo/Redo history was cleared.");
      } catch (error) {
        setActionNotice(null);
        setActionError(error instanceof Error ? error.message : "Could not publish seat map.");
      }
    });
  }

  const toolbarMessage = addSeatMode
    ? "Add Seat mode is active. Click an empty point on the map to place a marker."
    : moveSeatMode
      ? "Move Seat mode is active. Drag the selected marker to reposition it."
      : "Select a seat to assign or update employee details.";

  return (
    <div className="min-h-screen overflow-x-hidden">
      <header className="sticky top-0 z-30 flex min-h-[50px] items-center justify-between border-b border-white/10 bg-slate-950/50 px-4 py-2 text-white backdrop-blur">
        <div>
          <h1 className="text-[15px] font-bold">Office Seat Planner</h1>
          <p className="text-[11px] text-white/60">{canEdit ? "Admin draft view" : "Published viewer view"}</p>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <>
              <Link
                href="/admin/management"
                className="inline-flex min-h-8 items-center justify-center rounded-md border border-white/15 bg-white/10 px-3 text-xs font-semibold text-white transition hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
              >
                Management
              </Link>
              <Button variant="ghost" className="min-h-8 px-3 text-xs" onClick={() => setAdvancedOpen(true)}>
                Advanced
              </Button>
            </>
          )}
        </div>
      </header>

      <main className={["grid grid-cols-1 gap-3 p-2.5", filterCollapsed ? "lg:grid-cols-[46px_minmax(0,1fr)]" : "lg:grid-cols-[256px_minmax(0,1fr)]"].join(" ")}>
        <FilterPanel
          search={search}
          department={department}
          status={status}
          departments={departments}
          zone={zone}
          zones={zones}
          collapsed={filterCollapsed}
          stats={stats}
          employeeResults={employeeResults}
          onToggle={() => setFilterCollapsed(current => !current)}
          onEmployeeSelect={selectEmployeeSeat}
          onSearchChange={setSearch}
          onDepartmentChange={setDepartment}
          onZoneChange={setZone}
          onStatusChange={setStatus}
          onClearFilters={clearFilters}
        />

        <section className="min-w-0 space-y-2">
          <div className="flex min-h-[42px] flex-col gap-2 rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-white backdrop-blur sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-bold leading-tight">{canEdit ? "Draft seat map" : "Published seat map"}</div>
              <div className="text-[11px] leading-tight text-white/60">{toolbarMessage}</div>
            </div>
            {canEdit && (
              <div className="flex flex-col gap-1 sm:items-end">
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    className="min-h-8 px-3 text-xs"
                    disabled={pending || inspectorDirty || !undoAvailable}
                    aria-label={nextUndoLabel ? `Undo ${nextUndoLabel}` : "Undo draft edit"}
                    title={nextUndoLabel ? `Undo ${nextUndoLabel}` : "No draft edits to undo"}
                    onClick={undoDraftEdit}
                  >
                    Undo
                  </Button>
                  <Button
                    type="button"
                    className="min-h-8 px-3 text-xs"
                    disabled={pending || inspectorDirty || !redoAvailable}
                    aria-label={nextRedoLabel ? `Redo ${nextRedoLabel}` : "Redo draft edit"}
                    title={nextRedoLabel ? `Redo ${nextRedoLabel}` : "No draft edits to redo"}
                    onClick={redoDraftEdit}
                  >
                    Redo
                  </Button>
                </div>
                <div className="max-w-[260px] text-right text-[11px] leading-tight text-white/55">{historyStatusMessage}</div>
              </div>
            )}
          </div>

          {actionError && (
            <div role="alert" className="whitespace-pre-wrap rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
              {actionError}
            </div>
          )}

          {actionNotice && (
            <div role="status" aria-live="polite" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
              {actionNotice}
            </div>
          )}

          <div className="min-w-0 rounded-[22px] border border-white/80 bg-white p-2 shadow-soft">
            <div className="relative mx-auto max-h-[calc(100vh-112px)] w-full max-w-full overflow-auto overscroll-contain rounded-[15px] border border-slate-200 bg-[#f6f4f1]">
              <div
                ref={mapRef}
                className={["relative mx-auto w-[900px] max-w-none lg:w-full lg:max-w-[1561px]", addSeatMode ? "cursor-crosshair" : ""].join(" ")}
                onPointerDown={handleMapPointerDown}
                onPointerMove={handleMapPointerMove}
                onPointerUp={handleMapPointerUp}
                onPointerCancel={() => {
                  setDragState(null);
                  setMoveSeatMode(false);
                }}
              >
                <Image
                  src="/images/office-floor-plan.png"
                  alt="Office floor plan"
                  width={1561}
                  height={1008}
                  priority
                  className="block h-auto w-full select-none"
                  draggable={false}
                />

                <div className="absolute inset-0">
                  {localSeats.map(seat => (
                    <SeatMarker
                      key={seat.id}
                      seat={seat}
                      selected={seat.id === selectedSeatId}
                      dimmed={!matchesFilters(seat)}
                      canEdit={canEdit}
                      showNames={showNames}
                      moveSeatMode={moveSeatMode}
                      dragging={dragState?.seatId === seat.id}
                      onSelect={selectSeat}
                      onMovePointerDown={handleMovePointerDown}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <AdvancedDrawer
        open={advancedOpen}
        seats={localSeats}
        employees={localEmployees}
        zoneOptions={localZoneOptions}
        selectedSeat={selectedSeat}
        addSeatMode={addSeatMode}
        addSeatZone={addSeatZone}
        moveSeatMode={moveSeatMode}
        pending={pending}
        showNames={showNames}
        onClose={() => setAdvancedOpen(false)}
        onStartAddSeat={startAddSeatMode}
        onCancelAddSeat={cancelAddSeatMode}
        onAddSeatZoneChange={setAddSeatZone}
        onPublish={publishDraftMap}
        onToggleMoveSeat={() => {
          if (!selectedSeatId) return;
          setAddSeatMode(false);
          setMoveSeatMode(current => !current);
          setAdvancedOpen(false);
        }}
        onToggleShowNames={() => setShowNames(current => !current)}
        onClearSelection={clearSelection}
        onDeleteSelectedSeat={deleteSelectedSeat}
        onBeforeCsvImport={captureDraftSnapshot}
        onCsvImported={(payload, beforeSnapshot) => {
          setActionError(null);
          setActionNotice(null);
          const afterSeats = normalizeSeats(payload.seats);
          recordDraftHistory(`Import ${payload.count} CSV row${payload.count === 1 ? "" : "s"}`, beforeSnapshot, afterSeats, payload.employees);
          setLocalSeats(afterSeats);
          setLocalEmployees(payload.employees);
          setSelectedSeatId(null);
          setInspectorDirty(false);
          setMoveSeatMode(false);
          setActionNotice(`Imported ${payload.count} CSV row${payload.count === 1 ? "" : "s"} into the draft map.`);
        }}
        onError={message => {
          setActionError(message);
          if (message) setActionNotice(null);
        }}
      />

      <SeatInspector
        seat={selectedSeat}
        employees={localEmployees}
        departmentOptions={localDepartmentOptions}
        canEdit={canEdit}
        collapsed={inspectorCollapsed}
        onClose={() => {
          if (selectedSeatId && !canDiscardInspectorChanges()) return;
          setSelectedSeatId(null);
          setInspectorDirty(false);
          setMoveSeatMode(false);
          setInspectorCollapsed(false);
        }}
        onToggleCollapse={() => setInspectorCollapsed(current => !current)}
        onBeforeSeatUpdate={captureDraftSnapshot}
        onSeatUpdated={(seat, beforeSnapshot) => {
          setActionError(null);
          setActionNotice(null);
          setInspectorDirty(false);
          const afterSeats = replaceSeat(beforeSnapshot.seats, seat);
          const afterEmployees = replaceEmployee(beforeSnapshot.employees, seat);
          recordDraftHistory(describeSeatUpdate(beforeSnapshot, seat), beforeSnapshot, afterSeats, afterEmployees);
          setLocalSeats(afterSeats);
          setLocalEmployees(afterEmployees);
          setActionNotice(`Saved changes to ${seat.label}.`);
        }}
        onError={message => {
          setActionError(message);
          if (message) setActionNotice(null);
        }}
        onDirtyChange={setInspectorDirty}
      />
    </div>
  );
}
