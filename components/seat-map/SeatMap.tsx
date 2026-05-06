"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { PointerEvent } from "react";
import Image from "next/image";
import type { Employee, SeatStatus, SeatWithEmployee } from "@/lib/types";
import { createSeatAction, moveSeatAction, publishSeatMapAction } from "@/app/actions";
import { normalizePoint } from "@/lib/seatMath";
import { AdvancedDrawer } from "@/components/seat-map/AdvancedDrawer";
import { FilterPanel } from "@/components/seat-map/FilterPanel";
import { SeatInspector } from "@/components/seat-map/SeatInspector";
import { SeatMarker } from "@/components/seat-map/SeatMarker";
import { Button } from "@/components/ui/Button";

type SeatMapProps = {
  seats: SeatWithEmployee[];
  employees: Employee[];
  canEdit: boolean;
};

type DragState = {
  seatId: string;
  pointerId: number;
} | null;

function replaceSeat(seats: SeatWithEmployee[], nextSeat: SeatWithEmployee) {
  const exists = seats.some(seat => seat.id === nextSeat.id);
  if (!exists) return [...seats, nextSeat].sort((a, b) => a.label.localeCompare(b.label));
  return seats.map(seat => (seat.id === nextSeat.id ? nextSeat : seat));
}

function removeSeat(seats: SeatWithEmployee[], seatId: string) {
  return seats.filter(seat => seat.id !== seatId);
}

function replaceEmployee(employees: Employee[], seat: SeatWithEmployee) {
  const nextEmployee = seat.employee;
  if (!nextEmployee) return employees;
  const exists = employees.some(employee => employee.id === nextEmployee.id);
  if (!exists) return [...employees, nextEmployee].sort((a, b) => a.full_name.localeCompare(b.full_name));
  return employees.map(employee => (employee.id === nextEmployee.id ? nextEmployee : employee));
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map(part => part[0]?.toUpperCase()).join("") || "?";
}

export function SeatMap({ seats, employees, canEdit }: SeatMapProps) {
  const [localSeats, setLocalSeats] = useState(seats);
  const [localEmployees, setLocalEmployees] = useState(employees);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null);
  const [moveSeatMode, setMoveSeatMode] = useState(false);
  const [addSeatMode, setAddSeatMode] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [dragState, setDragState] = useState<DragState>(null);
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("all");
  const [status, setStatus] = useState("all");
  const [filterCollapsed, setFilterCollapsed] = useState(false);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [showNames, setShowNames] = useState(true);
  const [pending, startTransition] = useTransition();
  const mapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setLocalSeats(seats), [seats]);
  useEffect(() => setLocalEmployees(employees), [employees]);
  useEffect(() => {
    if (!selectedSeatId) setInspectorCollapsed(false);
  }, [selectedSeatId]);

  const departments = useMemo(() => {
    const values = new Set<string>();
    localEmployees.forEach(emp => {
      if (emp.department) values.add(emp.department);
    });
    localSeats.forEach(seat => {
      if (seat.department) values.add(seat.department);
    });
    return Array.from(values).sort();
  }, [localEmployees, localSeats]);

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
          searchable: [employee.full_name, employee.position, employee.department, assignedSeat?.label].filter(Boolean).join(" " ).toLowerCase()
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
      seat.department,
      seat.employee?.full_name,
      seat.employee?.position,
      seat.employee?.department
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    const seatDepartment = seat.department ?? seat.employee?.department ?? "";
    const searchOk = !needle || haystack.includes(needle);
    const departmentOk = department === "all" || seatDepartment === department;
    const statusOk = status === "all" || seat.status === (status as SeatStatus);

    return searchOk && departmentOk && statusOk;
  }

  function selectSeat(seatId: string) {
    setSelectedSeatId(seatId);
    setMoveSeatMode(false);
    setAddSeatMode(false);
    setInspectorCollapsed(false);
  }

  function selectEmployeeSeat(seatId: string) {
    selectSeat(seatId);
    setFilterCollapsed(true);
  }

  function startAddSeatMode() {
    setSelectedSeatId(null);
    setMoveSeatMode(false);
    setAddSeatMode(true);
    setAdvancedOpen(false);
    setInspectorCollapsed(false);
  }

  function cancelAddSeatMode() {
    setAddSeatMode(false);
  }

  function clearSelection() {
    setSelectedSeatId(null);
    setMoveSeatMode(false);
    setAddSeatMode(false);
    setInspectorCollapsed(false);
  }

  function handleMapPointerDown(event: PointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (!target.closest("[data-seat-id]")) {
      if (canEdit && addSeatMode) {
        const point = eventToPoint(event);
        if (!point) return;

        startTransition(async () => {
          try {
            setActionError(null);
            const nextNumber = localSeats.length + 101;
            const created = await createSeatAction({
              label: `Desk ${nextNumber}`,
              x: point.x,
              y: point.y
            });
            setLocalSeats(current => replaceSeat(current, created));
            setSelectedSeatId(created.id);
            setAddSeatMode(false);
            setMoveSeatMode(false);
          } catch (error) {
            setActionError(error instanceof Error ? error.message : "Could not create seat.");
          }
        });
      } else if (!dragState) {
        setSelectedSeatId(null);
        setMoveSeatMode(false);
      }
      return;
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

  function publishDraftMap() {
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
      : "Marker movement is locked unless Move Seat is enabled.";

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 flex min-h-[50px] items-center justify-between border-b border-white/10 bg-slate-950/50 px-4 py-2 text-white backdrop-blur">
        <div>
          <h1 className="text-[15px] font-bold">Office Seat Planner</h1>
          <p className="text-[11px] text-white/60">{canEdit ? "Admin draft view" : "Published viewer view"}</p>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <Button variant="ghost" className="min-h-8 px-3 text-xs" onClick={() => setAdvancedOpen(true)}>
              Advanced
            </Button>
          )}
        </div>
      </header>

      <main className={`grid ${filterCollapsed ? "grid-cols-[46px_minmax(0,1fr)]" : "grid-cols-[256px_minmax(0,1fr)]"} gap-3 p-2.5`}>
        <FilterPanel
          search={search}
          department={department}
          status={status}
          departments={departments}
          collapsed={filterCollapsed}
          stats={stats}
          employeeResults={employeeResults}
          onToggle={() => setFilterCollapsed(current => !current)}
          onEmployeeSelect={selectEmployeeSeat}
          onSearchChange={setSearch}
          onDepartmentChange={setDepartment}
          onStatusChange={setStatus}
        />

        <section className="min-w-0 space-y-2">
          <div className="flex min-h-[42px] items-center justify-between rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-white backdrop-blur">
            <div>
              <div className="text-sm font-bold leading-tight">{canEdit ? "Draft seat map" : "Published seat map"}</div>
              <div className="text-[11px] leading-tight text-white/60">{toolbarMessage}</div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                className="min-h-8 px-3 text-xs"
                onClick={() => setShowNames(current => !current)}
              >
                {showNames ? "Hide Names" : "Show Names"}
              </Button>
              <Button className="min-h-8 px-3 text-xs" onClick={clearSelection}>Clear Selection</Button>
            </div>
          </div>

          {actionError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
              {actionError}
            </div>
          )}

          <div className="rounded-[22px] border border-white/80 bg-white p-2 shadow-soft">
            <div className="relative mx-auto max-h-[calc(100vh-112px)] overflow-auto rounded-[15px] border border-slate-200 bg-[#f6f4f1]">
              <div
                ref={mapRef}
                className={["relative mx-auto w-full max-w-[1561px]", addSeatMode ? "cursor-crosshair" : ""].join(" ")}
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
        addSeatMode={addSeatMode}
        pending={pending}
        onClose={() => setAdvancedOpen(false)}
        onStartAddSeat={startAddSeatMode}
        onCancelAddSeat={cancelAddSeatMode}
        onPublish={publishDraftMap}
      />

      <SeatInspector
        seat={selectedSeat}
        employees={localEmployees}
        canEdit={canEdit}
        moveSeatMode={moveSeatMode}
        collapsed={inspectorCollapsed}
        onClose={() => {
          setSelectedSeatId(null);
          setMoveSeatMode(false);
          setInspectorCollapsed(false);
        }}
        onToggleCollapse={() => setInspectorCollapsed(current => !current)}
        onToggleMoveMode={() => {
          if (!selectedSeatId) return;
          setAddSeatMode(false);
          setMoveSeatMode(current => !current);
        }}
        onSeatUpdated={seat => {
          setActionError(null);
          setLocalSeats(current => replaceSeat(current, seat));
          setLocalEmployees(current => replaceEmployee(current, seat));
        }}
        onError={setActionError}
        onSeatDeleted={seatId => {
          setLocalSeats(current => removeSeat(current, seatId));
          setSelectedSeatId(null);
          setMoveSeatMode(false);
          setInspectorCollapsed(false);
        }}
      />
    </div>
  );
}
