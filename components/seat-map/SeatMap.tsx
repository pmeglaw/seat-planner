"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { PointerEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import type { DepartmentOption, Employee, SeatStatus, SeatWithEmployee, ZoneOption } from "@/lib/types";
import { createSeatAction, deleteSeatAction, moveSeatAction, publishSeatMapAction } from "@/app/actions";
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
  const [pending, startTransition] = useTransition();
  const mapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setLocalSeats(normalizeSeats(seats)), [seats]);
  useEffect(() => setLocalEmployees(employees), [employees]);
  useEffect(() => setLocalDepartmentOptions(departmentOptions), [departmentOptions]);
  useEffect(() => setLocalZoneOptions(zoneOptions), [zoneOptions]);
  useEffect(() => {
    if (!selectedSeatId) setInspectorCollapsed(false);
  }, [selectedSeatId]);

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

      startTransition(async () => {
        try {
          setActionError(null);
          const targetZone = addSeatZone === "all" ? null : addSeatZone;
          const created = await createSeatAction({
            label: buildNextSeatLabel(localSeats, targetZone),
            x: point.x,
            y: point.y,
            zone: targetZone
          });
          setLocalSeats(current => replaceSeat(current, created));
          setSelectedSeatId(created.id);
          setInspectorDirty(false);
          setAddSeatMode(false);
          setMoveSeatMode(false);
        } catch (error) {
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
    setDragState({ seatId, pointerId: event.pointerId });
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
    setDragState(null);
    setMoveSeatMode(false);
    if (!point) return;

    startTransition(async () => {
      try {
        setActionError(null);
        const updated = await moveSeatAction({ seatId, x: point.x, y: point.y });
        setLocalSeats(current => replaceSeat(current, updated));
      } catch (error) {
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

    startTransition(async () => {
      try {
        setActionError(null);
        const result = await deleteSeatAction(selectedSeat.id);
        setLocalSeats(current => current.filter(seat => seat.id !== result.seatId));
        setSelectedSeatId(null);
        setInspectorDirty(false);
        setMoveSeatMode(false);
        setAdvancedOpen(false);
      } catch (error) {
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
        `Total seats: ${stats.total}`,
        `Assigned seats: ${stats.assigned}`,
        `Available seats: ${stats.available}`,
        `Reserved seats: ${stats.reserved}`,
        `Unavailable seats: ${unavailable}`,
        "",
        "This will update what viewers see."
      ].join("\n")
    );
    if (!confirmed) return;

    startTransition(async () => {
      try {
        setActionError(null);
        await publishSeatMapAction();
        setAdvancedOpen(false);
      } catch (error) {
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
        />

        <section className="min-w-0 space-y-2">
          <div className="flex min-h-[42px] flex-col gap-2 rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-white backdrop-blur sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-bold leading-tight">{canEdit ? "Draft seat map" : "Published seat map"}</div>
              <div className="text-[11px] leading-tight text-white/60">{toolbarMessage}</div>
            </div>
          </div>

          {actionError && (
            <div className="whitespace-pre-wrap rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
              {actionError}
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
        onCsvImported={payload => {
          setActionError(null);
          setLocalSeats(normalizeSeats(payload.seats));
          setLocalEmployees(payload.employees);
          setSelectedSeatId(null);
          setInspectorDirty(false);
          setMoveSeatMode(false);
        }}
        onError={setActionError}
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
        onSeatUpdated={seat => {
          setActionError(null);
          setInspectorDirty(false);
          setLocalSeats(current => replaceSeat(current, seat));
          setLocalEmployees(current => replaceEmployee(current, seat));
        }}
        onError={setActionError}
        onDirtyChange={setInspectorDirty}
      />
    </div>
  );
}
