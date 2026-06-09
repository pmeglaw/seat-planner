"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
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
import { createSeatAction, deleteSeatAction, moveSeatAction, publishSeatMapAction, restoreDraftSnapshotAction, swapSeatAssignmentsAction } from "@/app/actions";
import { normalizePoint } from "@/lib/seatMath";
import { canDeleteSeat, getSeatDeleteBlockReason } from "@/lib/seatProtection";
import { detectSeatZoneForPointResult, getSeatZoneDetectionFailureMessage } from "@/lib/seatZones";
import { buildPublishChangeSummary, type PublishChangeItem } from "@/lib/publishSummary";
import { AdvancedDrawer } from "@/components/seat-map/AdvancedDrawer";
import { AskPlannerDrawer, type AskPlannerQueuedRequest } from "@/components/seat-map/AskPlannerDrawer";
import { FilterPanel } from "@/components/seat-map/FilterPanel";
import { SeatInspector } from "@/components/seat-map/SeatInspector";
import { SeatMarker } from "@/components/seat-map/SeatMarker";
import { Button } from "@/components/ui/Button";

type SeatMapProps = {
  seats: SeatWithEmployee[];
  publishedSeats?: SeatWithEmployee[];
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

type SwapConfirmState = {
  sourceSeatId: string;
  targetSeatId: string;
} | null;

const NAME_LABEL_COLLISION_X_THRESHOLD = 0.07;
const NAME_LABEL_COLLISION_Y_THRESHOLD = 0.07;
const DIRECT_SEAT_CLICK_RADIUS = 0.018;
const ADMIN_NAMES_VISIBLE_STORAGE_KEY = "seat-planner:names-visible";
const DEFAULT_PUBLISHED_SEATS: SeatWithEmployee[] = [];

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

function UndoIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4">
      <path d="M7.2 5.2 4 8.4l3.2 3.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.6 8.4h7.1a4.2 4.2 0 1 1-2.9 7.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4">
      <path d="m12.8 5.2 3.2 3.2-3.2 3.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15.4 8.4H8.3a4.2 4.2 0 1 0 2.9 7.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function NamesIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4">
      <path d="M2.7 10s2.6-4.4 7.3-4.4S17.3 10 17.3 10s-2.6 4.4-7.3 4.4S2.7 10 2.7 10Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="10" cy="10" r="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function PublishCountCard({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "warn" }) {
  return (
    <div className={["rounded-xl border p-3", tone === "warn" ? "border-orange-200 bg-orange-50/80" : "border-slate-200 bg-slate-50/80"].join(" ")}>
      <div className={["text-[11px] font-black uppercase tracking-wide", tone === "warn" ? "text-orange-700" : "text-slate-500"].join(" ")}>{label}</div>
      <div className="mt-1 text-2xl font-black text-slate-950">{value}</div>
    </div>
  );
}

function PublishChangeList({ title, items, emptyLabel }: { title: string; items: PublishChangeItem[]; emptyLabel: string }) {
  const visibleItems = items.slice(0, 5);
  const remainingCount = Math.max(items.length - visibleItems.length, 0);

  return (
    <div className="rounded-xl border border-slate-200 bg-white/80 p-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-black text-slate-950">{title}</h3>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-600">{items.length}</span>
      </div>
      {items.length > 0 ? (
        <ul className="mt-2 space-y-1.5 text-xs leading-5 text-slate-600">
          {visibleItems.map(item => (
            <li key={`${title}-${item.label}-${item.detail}`}>
              <span className="font-black text-slate-900">{item.label}</span>
              {item.detail && <span> · {item.detail}</span>}
            </li>
          ))}
          {remainingCount > 0 && (
            <li className="font-bold text-slate-500">+ {remainingCount} more</li>
          )}
        </ul>
      ) : (
        <p className="mt-2 text-xs font-semibold text-slate-500">{emptyLabel}</p>
      )}
    </div>
  );
}


export function SeatMap({
  seats,
  publishedSeats = DEFAULT_PUBLISHED_SEATS,
  employees,
  departmentOptions = [],
  zoneOptions = [],
  canEdit
}: SeatMapProps) {
  const [localSeats, setLocalSeats] = useState(() => normalizeSeats(seats));
  const [localPublishedSeats, setLocalPublishedSeats] = useState(() => normalizeSeats(publishedSeats));
  const [localEmployees, setLocalEmployees] = useState(employees);
  const [localDepartmentOptions, setLocalDepartmentOptions] = useState(departmentOptions);
  const [localZoneOptions, setLocalZoneOptions] = useState(zoneOptions);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null);
  const [moveSeatMode, setMoveSeatMode] = useState(false);
  const [addSeatMode, setAddSeatMode] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [publishReviewOpen, setPublishReviewOpen] = useState(false);
  const [askPlannerOpen, setAskPlannerOpen] = useState(false);
  const [askPlannerQueuedRequest, setAskPlannerQueuedRequest] = useState<AskPlannerQueuedRequest | null>(null);
  const [plannerHighlightedSeatIds, setPlannerHighlightedSeatIds] = useState<string[]>([]);
  const [dragState, setDragState] = useState<DragState>(null);
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("all");
  const [zone, setZone] = useState("all");
  const [status, setStatus] = useState("all");
  const [filterCollapsed, setFilterCollapsed] = useState(true);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [inspectorDirty, setInspectorDirty] = useState(false);
  const [searchSelectionNotice, setSearchSelectionNotice] = useState<string | null>(null);
  const [showNames, setShowNames] = useState(false);
  const [namesPreferenceHydrated, setNamesPreferenceHydrated] = useState(false);
  const [swapSourceSeatId, setSwapSourceSeatId] = useState<string | null>(null);
  const [swapConfirm, setSwapConfirm] = useState<SwapConfirmState>(null);
  const [draftHistory, setDraftHistory] = useState(() => createDraftHistory());
  const [pending, startTransition] = useTransition();
  const mapViewportRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapToolsButtonRef = useRef<HTMLButtonElement | null>(null);
  const askPlannerButtonRef = useRef<HTMLButtonElement | null>(null);

  const focusMapToolsButton = useCallback(() => {
    window.setTimeout(() => mapToolsButtonRef.current?.focus(), 0);
  }, []);

  const focusAskPlannerButton = useCallback(() => {
    window.setTimeout(() => askPlannerButtonRef.current?.focus(), 0);
  }, []);

  const closeAdvancedDrawer = useCallback(() => {
    setAdvancedOpen(false);
    focusMapToolsButton();
  }, [focusMapToolsButton]);

  const closeAskPlannerDrawer = useCallback(() => {
    setAskPlannerOpen(false);
    focusAskPlannerButton();
  }, [focusAskPlannerButton]);

  useEffect(() => setLocalSeats(normalizeSeats(seats)), [seats]);
  useEffect(() => setLocalPublishedSeats(normalizeSeats(publishedSeats)), [publishedSeats]);
  useEffect(() => setLocalEmployees(employees), [employees]);
  useEffect(() => setLocalDepartmentOptions(departmentOptions), [departmentOptions]);
  useEffect(() => setLocalZoneOptions(zoneOptions), [zoneOptions]);
  useEffect(() => {
    if (!canEdit) {
      setNamesPreferenceHydrated(true);
      return;
    }

    try {
      setShowNames(window.localStorage.getItem(ADMIN_NAMES_VISIBLE_STORAGE_KEY) === "true");
    } catch {
      // Ignore unavailable storage; the toggle still works for the current page.
    }

    setNamesPreferenceHydrated(true);
  }, [canEdit]);
  useEffect(() => {
    if (!canEdit || !namesPreferenceHydrated) return;

    try {
      window.localStorage.setItem(ADMIN_NAMES_VISIBLE_STORAGE_KEY, showNames ? "true" : "false");
    } catch {
      // Ignore unavailable storage; this is a local UI preference only.
    }
  }, [canEdit, namesPreferenceHydrated, showNames]);
  useEffect(() => {
    if (!selectedSeatId) setInspectorCollapsed(false);
  }, [selectedSeatId]);

  useEffect(() => {
    setPlannerHighlightedSeatIds(current => {
      const seatIds = new Set(localSeats.map(seat => seat.id));
      const next = current.filter(seatId => seatIds.has(seatId));
      return next.length === current.length ? current : next;
    });
  }, [localSeats]);

  useEffect(() => {
    function isEditableTarget(target: EventTarget | null) {
      return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;

      if (publishReviewOpen) {
        setPublishReviewOpen(false);
        return;
      }

      if (swapConfirm) {
        setSwapConfirm(null);
        return;
      }

      if (askPlannerOpen) {
        closeAskPlannerDrawer();
        return;
      }

      if (advancedOpen) {
        closeAdvancedDrawer();
        return;
      }

      if (addSeatMode || moveSeatMode || swapSourceSeatId) {
        setAddSeatMode(false);
        setMoveSeatMode(false);
        setSwapSourceSeatId(null);
        setDragState(null);
        setActionNotice("Draft map mode canceled.");
        return;
      }

      if (!filterCollapsed && !isEditableTarget(event.target)) {
        setFilterCollapsed(true);
        return;
      }

      if (!isEditableTarget(event.target) && selectedSeatId && !inspectorDirty) {
        setSelectedSeatId(null);
        setInspectorCollapsed(false);
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [addSeatMode, advancedOpen, askPlannerOpen, closeAdvancedDrawer, closeAskPlannerDrawer, filterCollapsed, inspectorDirty, moveSeatMode, publishReviewOpen, selectedSeatId, swapConfirm, swapSourceSeatId]);

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

  const stats = useMemo(() => ({
    total: localSeats.length,
    assigned: localSeats.filter(seat => seat.status === "assigned").length,
    available: localSeats.filter(seat => seat.status === "available").length,
    reserved: localSeats.filter(seat => seat.status === "reserved").length
  }), [localSeats]);
  const publishSummary = useMemo(() => buildPublishChangeSummary(localSeats, localPublishedSeats), [localSeats, localPublishedSeats]);

  const employeeResults = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return localEmployees
      .map(employee => {
        const assignedSeat = localSeats.find(seat => seat.employee_id === employee.id) ?? null;
        const phoneExtension = employee.phone_extension ? `Ext. ${employee.phone_extension}` : null;
        const metaParts = [employee.position, employee.department, phoneExtension, assignedSeat ? assignedSeat.label : "Unassigned"].filter(Boolean);
        return {
          id: employee.id,
          name: employee.full_name,
          meta: metaParts.join(" · ") || "No details",
          initials: getInitials(employee.full_name),
          seatId: assignedSeat?.id ?? null,
          seatLabel: assignedSeat?.label ?? null,
          searchable: [employee.full_name, employee.position, employee.department, employee.phone_extension, assignedSeat?.label, assignedSeat ? getSeatZone(assignedSeat) : ""].filter(Boolean).join(" ").toLowerCase()
        };
      })
      .filter(result => !needle || result.searchable.includes(needle))
      .slice(0, 30);
  }, [localEmployees, localSeats, search]);

  const selectedSeat = localSeats.find(seat => seat.id === selectedSeatId) ?? null;
  const swapSourceSeat = swapSourceSeatId ? localSeats.find(seat => seat.id === swapSourceSeatId) ?? null : null;
  const swapTargetSeat = swapConfirm ? localSeats.find(seat => seat.id === swapConfirm.targetSeatId) ?? null : null;
  const plannerHighlightedSeatIdSet = useMemo(() => new Set(plannerHighlightedSeatIds), [plannerHighlightedSeatIds]);
  const activeFilterCount = [
    search.trim(),
    department !== "all" ? department : "",
    zone !== "all" ? zone : "",
    status !== "all" ? status : ""
  ].filter(Boolean).length;
  const filtersActive = activeFilterCount > 0;
  const matchingSeats = filtersActive ? localSeats.filter(seat => matchesFilters(seat)) : localSeats;
  const selectedSeatMatchesFilters = selectedSeat ? matchesFilters(selectedSeat) : true;
  const crowdedNameSeatIdSet = useMemo(() => {
    const crowded = new Set<string>();
    const assignedSeats = localSeats.filter(seat => seat.employee);

    assignedSeats.forEach(seat => {
      const hasNearbySeat = localSeats.some(otherSeat => {
        if (otherSeat.id === seat.id) return false;
        return (
          Math.abs(otherSeat.x - seat.x) <= NAME_LABEL_COLLISION_X_THRESHOLD &&
          Math.abs(otherSeat.y - seat.y) <= NAME_LABEL_COLLISION_Y_THRESHOLD
        );
      });

      if (hasNearbySeat) crowded.add(seat.id);
    });

    return crowded;
  }, [localSeats]);
  const undoAvailable = canUndoDraftHistory(draftHistory);
  const redoAvailable = canRedoDraftHistory(draftHistory);
  const lastUndoLabel = draftHistory.undoStack.at(-1)?.label ?? null;
  const nextRedoLabel = draftHistory.redoStack.at(-1)?.label ?? null;

  function eventToPoint(event: Pick<PointerEvent<HTMLElement>, "clientX" | "clientY">) {
    const rect = mapRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return normalizePoint({
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height
    });
  }

  function isDirectSeatMarkerClick(point: { x: number; y: number }, seatId: string) {
    const seat = localSeats.find(item => item.id === seatId);
    if (!seat) return false;
    return ((point.x - seat.x) ** 2) + ((point.y - seat.y) ** 2) <= DIRECT_SEAT_CLICK_RADIUS ** 2;
  }

  function matchesFilters(seat: SeatWithEmployee) {
    const needle = search.trim().toLowerCase();
    const haystack = [
      seat.label,
      seat.status,
      getSeatZone(seat),
      seat.employee?.full_name,
      seat.employee?.position,
      seat.employee?.department,
      seat.employee?.phone_extension
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
    setSwapSourceSeatId(null);
    setSwapConfirm(null);
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

  function restoreHistorySnapshot(snapshot: DraftSnapshot, nextHistory: typeof draftHistory, actionLabel: string, notice: string, selectRestoredSeatLabel?: string) {
    if (inspectorDirty && !canDiscardInspectorChanges()) return;

    startTransition(async () => {
      try {
        setActionError(null);
        setActionNotice(null);
        const restored = await restoreDraftSnapshotAction(snapshot);
        applyRestoredDraftPayload(restored);
        if (selectRestoredSeatLabel) {
          const restoredSeat = restored.seats.find(seat => seat.label === selectRestoredSeatLabel);
          if (restoredSeat) {
            setSelectedSeatId(restoredSeat.id);
            setInspectorCollapsed(false);
          }
        }
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
    const addSeatLabel = result.entry.label.match(/^Add (.+)$/)?.[1];
    restoreHistorySnapshot(result.snapshot, result.history, "Redo", `Redid ${result.entry.label}.`, addSeatLabel);
  }

  function clearFilters() {
    setSearch("");
    setDepartment("all");
    setZone("all");
    setStatus("all");
    setSearchSelectionNotice(null);
  }

  function clearSearch() {
    setSearch("");
    setSearchSelectionNotice(null);
  }

  function clampScrollPosition(value: number, max: number) {
    return Math.min(Math.max(value, 0), Math.max(max, 0));
  }

  function scrollMapToPoint(x: number, y: number) {
    const viewport = mapViewportRef.current;
    const map = mapRef.current;
    if (!viewport || !map) return;

    const left = clampScrollPosition((x * map.offsetWidth) - (viewport.clientWidth / 2), viewport.scrollWidth - viewport.clientWidth);
    const top = clampScrollPosition((y * map.offsetHeight) - (viewport.clientHeight / 2), viewport.scrollHeight - viewport.clientHeight);
    viewport.scrollTo({ left, top, behavior: "smooth" });
  }

  function centerSeatInMap(seatId: string) {
    const seat = localSeats.find(item => item.id === seatId);
    if (!seat) return;
    scrollMapToPoint(seat.x, seat.y);
  }

  function fitSeatsInMap(seatsToFit: SeatWithEmployee[]) {
    if (!seatsToFit.length) return;
    if (seatsToFit.length === 1) {
      scrollMapToPoint(seatsToFit[0].x, seatsToFit[0].y);
      return;
    }

    const bounds = seatsToFit.reduce(
      (current, seat) => ({
        minX: Math.min(current.minX, seat.x),
        maxX: Math.max(current.maxX, seat.x),
        minY: Math.min(current.minY, seat.y),
        maxY: Math.max(current.maxY, seat.y)
      }),
      { minX: 1, maxX: 0, minY: 1, maxY: 0 }
    );

    scrollMapToPoint((bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2);
  }

  function queueCenterSeatInMap(seatId: string) {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => centerSeatInMap(seatId));
    });
  }

  function seatPersonLabel(seat: SeatWithEmployee | null) {
    return seat?.employee?.full_name ?? "Open";
  }

  function buildSwapSummary(sourceSeat: SeatWithEmployee, targetSeat: SeatWithEmployee) {
    return `${sourceSeat.label} (${seatPersonLabel(sourceSeat)}) <-> ${targetSeat.label} (${seatPersonLabel(targetSeat)})`;
  }

  function requestSwapTarget(targetSeatId: string) {
    if (!swapSourceSeatId) return false;
    const sourceSeat = localSeats.find(seat => seat.id === swapSourceSeatId) ?? null;
    const targetSeat = localSeats.find(seat => seat.id === targetSeatId) ?? null;

    if (!sourceSeat || !targetSeat) {
      setActionError("Could not find both seats for swapping.");
      return false;
    }

    if (sourceSeat.id === targetSeat.id) {
      setActionNotice("Choose a different target seat to complete the swap.");
      return true;
    }

    if (!sourceSeat.employee_id && !targetSeat.employee_id) {
      setActionError("Swap requires at least one assigned seat.");
      return false;
    }

    setActionError(null);
    setActionNotice(null);
    setSwapConfirm({ sourceSeatId: sourceSeat.id, targetSeatId: targetSeat.id });
    return true;
  }

  function selectSeat(seatId: string) {
    if (canEdit && swapSourceSeatId) {
      if (seatId !== swapSourceSeatId) {
        return requestSwapTarget(seatId);
      }
      setSelectedSeatId(seatId);
      setInspectorCollapsed(true);
      setActionNotice(null);
      setSearchSelectionNotice(null);
      return true;
    }

    if (selectedSeatId === seatId) {
      setMoveSeatMode(false);
      setAddSeatMode(false);
      setSwapSourceSeatId(null);
      setSwapConfirm(null);
      setInspectorCollapsed(false);
      setSearchSelectionNotice(null);
      return true;
    }

    if (selectedSeatId && !canDiscardInspectorChanges()) return false;
    setSelectedSeatId(seatId);
    setInspectorDirty(false);
    setMoveSeatMode(false);
    setAddSeatMode(false);
    setSwapSourceSeatId(null);
    setSwapConfirm(null);
    setInspectorCollapsed(false);
    setSearchSelectionNotice(null);
    return true;
  }

  function selectEmployeeSeat(seatId: string) {
    if (!selectSeat(seatId)) return;

    setFilterCollapsed(true);
    queueCenterSeatInMap(seatId);

    const seat = localSeats.find(item => item.id === seatId);
    if (seat) setSearchSelectionNotice(`Opened ${seat.label} from search result.`);
  }

  function startAddSeatMode() {
    if (selectedSeatId && !canDiscardInspectorChanges()) return;
    setSelectedSeatId(null);
    setInspectorDirty(false);
    setMoveSeatMode(false);
    setSwapSourceSeatId(null);
    setSwapConfirm(null);
    setAddSeatMode(true);
    setAdvancedOpen(false);
    setInspectorCollapsed(false);
    setSearchSelectionNotice(null);
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
    setSwapSourceSeatId(null);
    setSwapConfirm(null);
    setInspectorCollapsed(false);
    setSearchSelectionNotice(null);
  }

  function selectPlannerHighlightedSeat(seatId: string) {
    if (selectSeat(seatId)) {
      setAskPlannerOpen(false);
      setInspectorCollapsed(false);
    }
  }

  function explainSeatWithPlanner(seat: SeatWithEmployee) {
    if (!canEdit) return;

    setAdvancedOpen(false);
    setAskPlannerOpen(true);
    setAskPlannerQueuedRequest(current => ({
      id: (current?.id ?? 0) + 1,
      question: `Explain seat ${seat.label}`,
      seatId: seat.id
    }));
  }

  function startSwapSeatMode(skipDirtyCheck = false) {
    if (!canEdit) return;

    if (!selectedSeat) {
      setActionError("Select the source seat first, then choose Swap seat.");
      setActionNotice(null);
      setAdvancedOpen(false);
      return;
    }

    if (!skipDirtyCheck && inspectorDirty && !canDiscardInspectorChanges()) return;

    setActionError(null);
    setActionNotice(null);
    setInspectorDirty(false);
    setMoveSeatMode(false);
    setAddSeatMode(false);
    setDragState(null);
    setSwapConfirm(null);
    setSwapSourceSeatId(selectedSeat.id);
    setAdvancedOpen(false);
    setInspectorCollapsed(true);
  }

  function cancelSwapSeatMode() {
    setSwapSourceSeatId(null);
    setSwapConfirm(null);
    setInspectorCollapsed(false);
    setActionNotice("Swap mode canceled.");
  }

  function confirmSwapSeats() {
    if (!swapConfirm) return;
    const sourceSeat = localSeats.find(seat => seat.id === swapConfirm.sourceSeatId) ?? null;
    const targetSeat = localSeats.find(seat => seat.id === swapConfirm.targetSeatId) ?? null;

    if (!sourceSeat || !targetSeat) {
      setActionError("Could not find both seats for swapping.");
      setSwapConfirm(null);
      return;
    }

    const beforeSnapshot = captureDraftSnapshot();
    const swapLabel = `Swap ${sourceSeat.label} and ${targetSeat.label}`;

    startTransition(async () => {
      try {
        setActionError(null);
        setActionNotice(null);
        const payload = await swapSeatAssignmentsAction({
          sourceSeatId: sourceSeat.id,
          targetSeatId: targetSeat.id
        });
        const afterSeats = normalizeSeats(payload.seats);
        recordDraftHistory(swapLabel, beforeSnapshot, afterSeats, payload.employees);
        setLocalSeats(afterSeats);
        setLocalEmployees(payload.employees);
        setSelectedSeatId(targetSeat.id);
        setInspectorDirty(false);
        setMoveSeatMode(false);
        setAddSeatMode(false);
        setSwapSourceSeatId(null);
        setSwapConfirm(null);
        setInspectorCollapsed(false);
        setAdvancedOpen(false);
        setActionNotice(`Swapped ${buildSwapSummary(sourceSeat, targetSeat)}.`);
      } catch (error) {
        setActionNotice(null);
        setActionError(error instanceof Error ? error.message : "Could not swap seats.");
      }
    });
  }

  function handleMapPointerDown(event: PointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    const seatTarget = target.closest<HTMLElement>("[data-seat-id]");

    if (canEdit && addSeatMode) {
      const point = eventToPoint(event);
      if (!point) return;

      const targetSeatId = seatTarget?.dataset.seatId;
      if (targetSeatId && isDirectSeatMarkerClick(point, targetSeatId)) return;

      const targetZoneResult = detectSeatZoneForPointResult(point, localSeats);
      if (targetZoneResult.status !== "detected") {
        setActionNotice(null);
        setActionError(getSeatZoneDetectionFailureMessage(targetZoneResult) ?? "Could not detect a zone for this location.");
        return;
      }
      const targetZone = targetZoneResult.zone;

      const beforeSnapshot = captureDraftSnapshot();

      startTransition(async () => {
        try {
          setActionError(null);
          setActionNotice(null);
          const created = await createSeatAction({
            x: point.x,
            y: point.y
          });
          const afterSeats = replaceSeat(beforeSnapshot.seats, created);
          recordDraftHistory(`Add ${created.label}`, beforeSnapshot, afterSeats, beforeSnapshot.employees);
          setLocalSeats(afterSeats);
          setSelectedSeatId(created.id);
          setInspectorDirty(false);
          setAddSeatMode(false);
          setMoveSeatMode(false);
          setInspectorCollapsed(false);
          setActionNotice(`Added ${created.label} to ${created.zone ?? created.department ?? targetZone}.`);
        } catch (error) {
          setActionNotice(null);
          setActionError(error instanceof Error ? error.message : "Could not create seat.");
        }
      });
      return;
    }

    if (seatTarget) return;

    if (swapSourceSeatId) {
      setActionNotice(null);
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
      setActionError(getSeatDeleteBlockReason(selectedSeat));
      return;
    }

    if (inspectorDirty && !canDiscardInspectorChanges()) return;

    const deleteBlockReason = getSeatDeleteBlockReason(selectedSeat);
    if (!canDeleteSeat(selectedSeat)) {
      setActionError(deleteBlockReason ?? "Select a custom seat first.");
      return;
    }

    const confirmed = window.confirm([
      `Delete custom seat ${selectedSeat.label}?`,
      "",
      "Only available custom draft seats can be deleted. Original seats are protected.",
      "This removes custom draft seats only. Published maps are unchanged until you publish."
    ].join("\n"));
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
        setSwapSourceSeatId(null);
        setSwapConfirm(null);
        setAdvancedOpen(false);
        setActionNotice(`Deleted custom seat ${deletedSeatLabel}. Undo is available until publish.`);
      } catch (error) {
        setActionNotice(null);
        setActionError(error instanceof Error ? error.message : "Could not delete custom seat.");
      }
    });
  }

  function openPublishReview() {
    if (inspectorDirty) {
      setActionNotice(null);
      setActionError("Save or discard the selected seat edits before publishing. The publish review only includes saved draft changes.");
      setAdvancedOpen(false);
      return;
    }

    setActionError(null);
    setActionNotice(null);
    setAdvancedOpen(false);
    setPublishReviewOpen(true);
  }

  function confirmPublishDraftMap() {
    const nextPublishedSeats = normalizeSeats(localSeats);
    startTransition(async () => {
      try {
        setActionError(null);
        setActionNotice(null);
        await publishSeatMapAction();
        setLocalPublishedSeats(nextPublishedSeats);
        setDraftHistory(clearDraftHistory());
        setAdvancedOpen(false);
        setPublishReviewOpen(false);
        setActionNotice("Draft map published. Undo/Redo history was cleared.");
      } catch (error) {
        setActionNotice(null);
        setActionError(error instanceof Error ? error.message : "Could not publish seat map.");
      }
    });
  }

  const namesToggleLabel = showNames ? "Hide names" : "Show names";
  const mapResultSummary = matchingSeats.length === 1 ? "1 map result" : `${matchingSeats.length} map results`;
  const mapResultVerb = matchingSeats.length === 1 ? "matches" : "match";
  const mapResultContextLabel = search.trim() ? "the current search and filters" : "the current filters";
  const selectedSeatMismatchNotice = selectedSeat && filtersActive && !selectedSeatMatchesFilters
    ? search.trim()
      ? "This selected seat does not match the current search."
      : "This selected seat does not match the current filters."
    : null;
  const clearSearchContextLabel = search.trim() ? "Clear search" : "Clear filters";
  const undoTitle = pending
    ? "Wait for the current map change to finish"
    : inspectorDirty
      ? "Save or cancel inspector edits before undoing"
      : undoAvailable
        ? lastUndoLabel
          ? `Undo ${lastUndoLabel}`
          : "Undo last map change"
        : "No map changes to undo";
  const redoTitle = pending
    ? "Wait for the current map change to finish"
    : inspectorDirty
      ? "Save or cancel inspector edits before redoing"
      : redoAvailable
        ? nextRedoLabel
          ? `Redo ${nextRedoLabel}`
          : "Redo last undone change"
        : "No undone map changes to redo";
  const draftChangeBreakdown = [
    publishSummary.addedSeats.length ? `${publishSummary.addedSeats.length} added` : null,
    publishSummary.updatedSeatCount ? `${publishSummary.updatedSeatCount} updated` : null,
    publishSummary.removedSeats.length ? `${publishSummary.removedSeats.length} removed` : null
  ].filter(Boolean).join(", ");
  const draftStatusLabel = publishSummary.hasChanges ? `Draft changes: ${publishSummary.totalChangeCount}` : "Draft matches published";
  const draftStatusTitle = publishSummary.hasChanges
    ? `Review draft changes: ${draftChangeBreakdown || `${publishSummary.totalChangeCount} total`}`
    : "Draft and published maps currently match";
  const activeMode = addSeatMode
    ? {
      label: "Add Seat",
      message: "Click inside a seating zone to place an automatically numbered custom marker.",
      exitLabel: "Exit Add Seat",
      onExit: cancelAddSeatMode
    }
    : moveSeatMode
      ? {
        label: "Move Seat",
        message: selectedSeat ? `Drag ${selectedSeat.label} to reposition it on the draft map.` : "Select a seat before moving it.",
        exitLabel: "Exit Move Seat",
        onExit: () => {
          setMoveSeatMode(false);
          setDragState(null);
        }
      }
      : swapSourceSeat
        ? {
          label: "Swap Seats",
          message: `${swapSourceSeat.label} is the source. Select a target seat to review the swap.`,
          exitLabel: "Exit Swap Seats",
          onExit: cancelSwapSeatMode
        }
        : null;
  const desktopMapGridClass = filterCollapsed ? "lg:grid-cols-[minmax(0,1fr)]" : "lg:grid-cols-[288px_minmax(0,1fr)]";
  const showFilterPanel = !filterCollapsed || canEdit;
  const filterPanelShellClass = [
    filterCollapsed ? "order-2" : "order-1",
    "lg:order-1",
    canEdit && filterCollapsed ? "lg:hidden" : "",
    !filterCollapsed ? "lg:min-h-0 lg:self-stretch lg:[&>aside]:h-full lg:[&>aside]:max-h-full lg:[&>aside]:top-0" : ""
  ].join(" ");

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#eef2f7] lg:flex lg:h-screen lg:min-h-0 lg:flex-col lg:overflow-hidden">
      <header className="sticky top-0 z-30 border-b border-white/70 bg-white/80 px-3 py-2 text-slate-950 shadow-[0_10px_34px_rgba(15,23,42,0.07)] backdrop-blur-2xl sm:px-4 lg:shrink-0">
        <div className="grid grid-cols-[minmax(0,1fr)] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(190px,260px)_minmax(260px,1fr)_auto]">
          <div className="min-w-0">
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <h1 className="truncate text-[15px] font-black leading-tight">Office Seat Planner</h1>
                <span className={["shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ring-1", canEdit ? "bg-orange-50/80 text-brand-dark ring-orange-200" : "bg-emerald-50/80 text-emerald-700 ring-emerald-200"].join(" ")}>
                  {canEdit ? "Draft" : "Published"}
                </span>
                {canEdit && (
                  <button
                    type="button"
                    onClick={openPublishReview}
                    aria-label={`Review ${draftStatusLabel.toLowerCase()}`}
                    title={draftStatusTitle}
                    className={["inline-flex min-w-0 max-w-[min(100%,13rem)] items-center overflow-hidden rounded-full px-2 py-0.5 text-[10px] font-black ring-1 transition hover:bg-white active:scale-[0.97] active:duration-75 active:shadow-inner focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-100 sm:max-w-[18rem]", publishSummary.hasChanges ? "bg-amber-50/90 text-amber-800 ring-amber-200" : "bg-emerald-50/80 text-emerald-700 ring-emerald-200"].join(" ")}
                  >
                    <span className="min-w-0 truncate">{draftStatusLabel}</span>
                    {publishSummary.hasChanges && draftChangeBreakdown && (
                      <span className="hidden shrink-0 min-[1280px]:inline"> · {draftChangeBreakdown}</span>
                    )}
                  </button>
                )}
              </div>
              <p className="truncate text-[11px] leading-tight text-slate-500">{canEdit ? "Admin map" : "Viewer map"}</p>
            </div>
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-1 lg:flex-nowrap">
            <label className="relative min-w-0 flex-[1_1_100%] sm:flex-1">
              <span className="sr-only">Search employee, seat, job title, department, or zone</span>
              <input
                value={search}
                onChange={event => {
                  setSearch(event.target.value);
                  setSearchSelectionNotice(null);
                }}
                placeholder="Search employee, seat, job title, department, or zone"
                className="h-9 w-full rounded-full border border-white/70 bg-white/75 px-4 pr-10 text-sm text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_8px_24px_rgba(15,23,42,0.06)] outline-none backdrop-blur-xl transition placeholder:text-slate-400 focus:border-orange-200 focus:bg-white focus:ring-4 focus:ring-orange-100"
              />
              {search.trim() && (
                <button
                  type="button"
                  aria-label="Clear search"
                  title="Clear search"
                  className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-xs font-black text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 active:scale-90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-100"
                  onClick={clearSearch}
                >
                  x
                </button>
              )}
            </label>
            <button
              type="button"
              onClick={() => setFilterCollapsed(current => !current)}
              aria-controls="seat-map-filter-panel"
              aria-expanded={!filterCollapsed}
              aria-label={filterCollapsed ? "Open filters" : "Collapse filters"}
              title={filterCollapsed ? "Open filters" : "Collapse filters"}
              className={["inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3 text-xs font-black shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_8px_24px_rgba(15,23,42,0.08)] backdrop-blur-xl transition hover:bg-white active:scale-[0.97] active:duration-75 active:shadow-inner focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-100", activeFilterCount ? "border-orange-200 bg-orange-50/80 text-brand-dark" : "border-white/70 bg-white/70 text-slate-700"].join(" ")}
            >
              Filters
              {activeFilterCount > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[10px] font-black text-white">
                  {activeFilterCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setShowNames(current => !current)}
              aria-label={namesToggleLabel}
              title={namesToggleLabel}
              className={[
                "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full border px-2.5 text-xs font-black shadow-sm backdrop-blur-xl transition active:scale-[0.97] active:duration-75 active:shadow-inner focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-100",
                showNames ? "border-slate-300 bg-slate-900/90 text-white hover:bg-slate-800" : "border-white/70 bg-white/70 text-slate-700 hover:bg-white"
              ].join(" ")}
            >
              <NamesIcon />
              <span className="hidden sm:inline">{namesToggleLabel}</span>
            </button>
            {canEdit && (
              <Button
                ref={mapToolsButtonRef}
                variant="secondary"
                aria-label="Map tools"
                aria-controls="advanced-drawer"
                aria-expanded={advancedOpen}
                aria-haspopup="dialog"
                title="Map tools"
                className="h-9 min-h-9 rounded-full px-3 py-1 text-xs shadow-sm"
                onClick={() => {
                  setAskPlannerOpen(false);
                  setAdvancedOpen(true);
                }}
              >
                Map tools
              </Button>
            )}
          </div>

          <div className="hidden min-w-0 flex-wrap items-center justify-end gap-2 sm:col-start-2 sm:row-start-1 sm:flex lg:col-auto lg:row-auto">
            {canEdit && (
              <>
                <button
                  type="button"
                  className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full border border-white/70 bg-white/70 px-2.5 text-xs font-black text-slate-700 shadow-sm backdrop-blur-xl transition hover:bg-white active:scale-[0.97] active:duration-75 active:shadow-inner focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100/70 disabled:text-slate-400 disabled:shadow-none"
                  disabled={pending || inspectorDirty || !undoAvailable}
                  aria-label="Undo last map change"
                  title={undoTitle}
                  onClick={undoDraftEdit}
                >
                  <UndoIcon />
                  <span className="hidden xl:inline">Undo</span>
                </button>
                <button
                  type="button"
                  className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full border border-white/70 bg-white/70 px-2.5 text-xs font-black text-slate-700 shadow-sm backdrop-blur-xl transition hover:bg-white active:scale-[0.97] active:duration-75 active:shadow-inner focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100/70 disabled:text-slate-400 disabled:shadow-none"
                  disabled={pending || inspectorDirty || !redoAvailable}
                  aria-label="Redo last undone change"
                  title={redoTitle}
                  onClick={redoDraftEdit}
                >
                  <RedoIcon />
                  <span className="hidden xl:inline">Redo</span>
                </button>
                <Link
                  href="/admin/management"
                  className="hidden min-h-8 items-center justify-center rounded-full border border-white/70 bg-white/70 px-3 text-xs font-semibold text-slate-700 shadow-sm backdrop-blur-xl transition hover:bg-white active:scale-[0.97] active:duration-75 active:shadow-inner focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:inline-flex"
                >
                  Management
                </Link>
                <Button
                  ref={askPlannerButtonRef}
                  variant="secondary"
                  aria-label={plannerHighlightedSeatIds.length > 0 ? `Open Ask Planner, ${plannerHighlightedSeatIds.length} seats highlighted` : "Open Ask Planner"}
                  aria-controls="ask-planner-drawer"
                  aria-expanded={askPlannerOpen}
                  aria-haspopup="dialog"
                  className={[
                    "min-h-8 rounded-full px-3 py-1 text-xs shadow-sm",
                    plannerHighlightedSeatIds.length > 0 ? "border-cyan-200 bg-cyan-50 text-cyan-900 hover:bg-cyan-100" : ""
                  ].join(" ")}
                  onClick={() => {
                    setAdvancedOpen(false);
                    setAskPlannerOpen(true);
                  }}
                >
                  <span className="min-[1360px]:hidden">Ask</span>
                  <span className="hidden min-[1360px]:inline">Ask Planner</span>
                  {plannerHighlightedSeatIds.length > 0 && (
                    <span className="ml-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-cyan-600 px-1.5 text-[10px] font-black text-white">
                      {plannerHighlightedSeatIds.length}
                    </span>
                  )}
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className={["grid grid-cols-1 gap-3 p-2 sm:p-4 lg:min-h-0 lg:flex-1 lg:items-stretch lg:overflow-hidden", desktopMapGridClass].join(" ")}>
        {showFilterPanel && (
          <div className={filterPanelShellClass}>
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
              selectedSeatId={selectedSeatId}
              onToggle={() => setFilterCollapsed(current => !current)}
              onEmployeeSelect={selectEmployeeSeat}
              onDepartmentChange={setDepartment}
              onZoneChange={setZone}
              onStatusChange={setStatus}
              onClearFilters={clearFilters}
            />
          </div>
        )}

        <section className={[filterCollapsed ? "order-1" : "order-2", "min-w-0 space-y-2 lg:order-2 lg:flex lg:min-h-0 lg:flex-col lg:space-y-0 lg:gap-2"].join(" ")}>
          {(filtersActive || searchSelectionNotice) && (
            <div className="flex flex-col gap-2 rounded-2xl border border-white/70 bg-white/80 px-3 py-2 text-xs font-semibold text-slate-600 shadow-[0_12px_34px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                {searchSelectionNotice && (
                  <div className="truncate font-black text-brand-dark">{searchSelectionNotice}</div>
                )}
                {filtersActive && (
                  <div className={searchSelectionNotice ? "mt-0.5 truncate text-[11px] text-slate-500" : "truncate font-black text-slate-700"}>
                    {mapResultSummary} {mapResultVerb} {mapResultContextLabel}.
                  </div>
                )}
              </div>
              {filtersActive && (
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => fitSeatsInMap(matchingSeats)}
                    disabled={!matchingSeats.length}
                    aria-label={matchingSeats.length === 1 ? "Fit one result on the map" : `Fit ${matchingSeats.length} results on the map`}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-black text-slate-700 transition hover:border-orange-200 hover:bg-orange-50 active:scale-[0.97] active:duration-75 active:shadow-inner focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Fit results
                  </button>
                  {search.trim() && (
                    <button
                      type="button"
                      onClick={clearSearch}
                      aria-label="Clear search"
                      className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-[11px] font-black text-brand-dark transition hover:bg-orange-100 active:scale-[0.97] active:duration-75 active:shadow-inner focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-100"
                    >
                      Clear search
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {activeMode && (
            <div role="status" aria-live="polite" className="flex flex-col gap-2 rounded-2xl border border-orange-200 bg-white/85 px-3 py-2 text-xs font-semibold text-brand-dark shadow-[0_12px_34px_rgba(194,65,12,0.12)] backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-wide text-orange-700">{activeMode.label} mode</div>
                <div className="mt-0.5 truncate text-sm font-bold text-slate-900">{activeMode.message}</div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <span className="rounded-full bg-orange-50 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-brand-dark ring-1 ring-orange-100">Esc exits</span>
                <button type="button" onClick={activeMode.onExit} className="shrink-0 whitespace-nowrap rounded-full bg-orange-50 px-3 py-1.5 text-[11px] font-black text-brand-dark ring-1 ring-orange-100 transition hover:bg-orange-100 active:scale-[0.97] active:duration-75 active:shadow-inner focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-100">
                  {activeMode.exitLabel}
                </button>
              </div>
            </div>
          )}

          {actionError && (
            <div role="alert" className="whitespace-pre-wrap rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
              {actionError}
            </div>
          )}

          {actionNotice && !swapSourceSeatId && (
            <div role="status" aria-live="polite" className="flex flex-col gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 sm:flex-row sm:items-center sm:justify-between">
              <span>{actionNotice}</span>
              {canEdit && undoAvailable && lastUndoLabel && !pending && !inspectorDirty && (
                <button
                  type="button"
                  onClick={undoDraftEdit}
                  className="shrink-0 self-start rounded-full border border-emerald-200 bg-white/80 px-3 py-1 text-[11px] font-black text-emerald-800 transition hover:bg-white active:scale-[0.97] active:duration-75 active:shadow-inner focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-100 sm:self-auto"
                >
                  Undo {lastUndoLabel}
                </button>
              )}
            </div>
          )}

          <div className="min-w-0 rounded-[18px] border border-white/70 bg-white/75 p-1.5 shadow-[0_26px_80px_rgba(15,23,42,0.16),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-xl lg:flex lg:min-h-0 lg:flex-1">
            <div
              ref={mapViewportRef}
              className={["relative mx-auto max-h-[72vh] w-full max-w-full overflow-auto overscroll-contain rounded-2xl border border-slate-200/80 bg-[#f6f4f1] sm:max-h-[calc(100vh-92px)] lg:min-h-0 lg:flex-1 lg:max-h-none lg:[-ms-overflow-style:none] lg:[scrollbar-width:none] lg:[&::-webkit-scrollbar]:hidden", canEdit ? "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-200" : ""].join(" ")}
              tabIndex={canEdit ? 0 : undefined}
              aria-label={canEdit ? "Admin seat map viewport. Use wheel, trackpad, touch, or arrow keys to pan the map." : undefined}
            >
              <div
                ref={mapRef}
                className={["relative mx-auto w-[960px] max-w-none lg:w-full lg:max-w-[1561px]", addSeatMode ? "cursor-crosshair" : ""].join(" ")}
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
                  {localSeats.map(seat => {
                    const seatMatchesFilters = matchesFilters(seat);

                    return (
                      <SeatMarker
                        key={seat.id}
                        seat={seat}
                        selected={seat.id === selectedSeatId}
                        dimmed={!seatMatchesFilters}
                        canEdit={canEdit}
                        showNames={showNames}
                        searchResult={Boolean(search.trim()) && seatMatchesFilters}
                        compactNameLabel={crowdedNameSeatIdSet.has(seat.id)}
                        moveSeatMode={moveSeatMode}
                        swapMode={Boolean(swapSourceSeatId)}
                        swapSource={seat.id === swapSourceSeatId}
                        swapTarget={seat.id === swapConfirm?.targetSeatId}
                        highlighted={plannerHighlightedSeatIdSet.has(seat.id)}
                        dragging={dragState?.seatId === seat.id}
                        addSeatMode={addSeatMode}
                        onSelect={selectSeat}
                        onMovePointerDown={handleMovePointerDown}
                      />
                    );
                  })}
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
        selectedSeat={selectedSeat}
        addSeatMode={addSeatMode}
        moveSeatMode={moveSeatMode}
        swapSeatMode={Boolean(swapSourceSeatId)}
        pending={pending}
        onClose={closeAdvancedDrawer}
        onStartAddSeat={startAddSeatMode}
        onCancelAddSeat={cancelAddSeatMode}
        onStartSwapSeat={() => startSwapSeatMode()}
        onCancelSwapSeat={cancelSwapSeatMode}
        onPublish={openPublishReview}
        onToggleMoveSeat={() => {
          if (!selectedSeatId) return;
          setAddSeatMode(false);
          setSwapSourceSeatId(null);
          setSwapConfirm(null);
          setMoveSeatMode(current => !current);
          setAdvancedOpen(false);
        }}
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
        onJsonImported={async (snapshot, beforeSnapshot) => {
          setActionError(null);
          setActionNotice(null);
          const restored = await restoreDraftSnapshotAction(snapshot);
          const afterSeats = normalizeSeats(restored.seats);
          recordDraftHistory("Import JSON backup", beforeSnapshot, afterSeats, restored.employees);
          setLocalSeats(afterSeats);
          setLocalEmployees(restored.employees);
          setSelectedSeatId(null);
          setInspectorDirty(false);
          setMoveSeatMode(false);
          setAddSeatMode(false);
          setSwapSourceSeatId(null);
          setSwapConfirm(null);
          closeAdvancedDrawer();
          setActionNotice("Imported JSON backup into the draft map.");
        }}
        onError={message => {
          setActionError(message);
          if (message) setActionNotice(null);
        }}
      />

      {canEdit && (
        <AskPlannerDrawer
          open={askPlannerOpen}
          draftDirty={inspectorDirty}
          zones={zones}
          queuedRequest={askPlannerQueuedRequest}
          highlightedSeatIds={plannerHighlightedSeatIds}
          onClose={closeAskPlannerDrawer}
          onHighlightSeats={setPlannerHighlightedSeatIds}
          onClearHighlights={() => setPlannerHighlightedSeatIds([])}
          onSelectSeat={selectPlannerHighlightedSeat}
        />
      )}

      {publishReviewOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/35 p-3 backdrop-blur-[2px] sm:items-center">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="publish-review-title"
            aria-describedby="publish-review-description"
            className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/70 bg-white/95 p-4 text-slate-950 shadow-[0_26px_80px_rgba(15,23,42,0.28)] backdrop-blur-2xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h2 id="publish-review-title" className="text-base font-black">Review draft before publishing</h2>
                <p id="publish-review-description" className="mt-1 text-sm leading-5 text-slate-500">
                  You are about to publish draft changes. Viewers will see the current draft map after this completes.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPublishReviewOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-black text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close publish review"
              >
                x
              </button>
            </div>

            <div className="min-h-0 overflow-y-auto py-4">
              <div className="grid grid-cols-3 gap-2">
                <PublishCountCard label="Added" value={publishSummary.addedSeats.length} tone={publishSummary.addedSeats.length > 0 ? "warn" : "default"} />
                <PublishCountCard label="Updated" value={publishSummary.updatedSeatCount} tone={publishSummary.updatedSeatCount > 0 ? "warn" : "default"} />
                <PublishCountCard label="Removed" value={publishSummary.removedSeats.length} tone={publishSummary.removedSeats.length > 0 ? "warn" : "default"} />
              </div>

              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-xs font-semibold leading-5 text-slate-600">
                <span className="font-black text-slate-900">Draft:</span> {publishSummary.draftSeatCount} seats
                <span className="mx-2 text-slate-300">|</span>
                <span className="font-black text-slate-900">Currently published:</span> {publishSummary.publishedSeatCount} seats
                <span className="mx-2 text-slate-300">|</span>
                <span className="font-black text-slate-900">Total publish changes:</span> {publishSummary.totalChangeCount}
              </div>

              {!publishSummary.hasChanges && (
                <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
                  No draft changes to publish. The saved draft already matches the currently published viewer map.
                </div>
              )}

              <div className="mt-3 grid gap-2 md:grid-cols-2">
                <PublishChangeList title="Added seats" items={publishSummary.addedSeats} emptyLabel="No added seats detected." />
                <PublishChangeList title="Removed custom draft seats" items={publishSummary.removedSeats} emptyLabel="No removed seats detected." />
                <PublishChangeList title="Assignment changes" items={publishSummary.assignmentChanges} emptyLabel="No assignment changes detected." />
                <PublishChangeList title="Vacated seats" items={publishSummary.vacatedSeats} emptyLabel="No vacated seats detected." />
                <PublishChangeList title="Seat moves/layout changes" items={publishSummary.seatMoves} emptyLabel="No seat moves detected." />
                <PublishChangeList title="Status changes" items={publishSummary.statusChanges} emptyLabel="No status-only changes detected." />
                <div className="md:col-span-2">
                  <PublishChangeList title="Other draft changes" items={publishSummary.otherChanges} emptyLabel="No other draft changes detected." />
                </div>
              </div>

              <div className="mt-3 rounded-xl border border-orange-200 bg-orange-50/70 p-3 text-sm font-semibold leading-5 text-brand-dark">
                Publishing updates the viewer map and clears Undo/Redo history. Use Cancel if you need to review, undo, or save more draft changes first.
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
              <Button type="button" onClick={() => setPublishReviewOpen(false)} disabled={pending} className="w-full">
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={confirmPublishDraftMap}
                disabled={pending || !publishSummary.hasChanges}
                title={publishSummary.hasChanges ? "Publish reviewed draft changes" : "No draft changes to publish"}
                className="w-full"
              >
                {publishSummary.hasChanges ? "Publish changes" : "No changes to publish"}
              </Button>
            </div>
          </section>
        </div>
      )}

      <SeatInspector
        seat={selectedSeat}
        seats={localSeats}
        employees={localEmployees}
        departmentOptions={localDepartmentOptions}
        canEdit={canEdit}
        collapsed={inspectorCollapsed}
        swapMode={Boolean(swapSourceSeatId)}
        searchMismatchNotice={selectedSeatMismatchNotice}
        searchMismatchClearLabel={clearSearchContextLabel}
        onClose={() => {
          if (selectedSeatId && !canDiscardInspectorChanges()) return;
          setSelectedSeatId(null);
          setInspectorDirty(false);
          setMoveSeatMode(false);
          setSwapSourceSeatId(null);
          setSwapConfirm(null);
          setInspectorCollapsed(false);
          setSearchSelectionNotice(null);
        }}
        onClearSearchContext={search.trim() ? clearSearch : clearFilters}
        onToggleCollapse={() => setInspectorCollapsed(current => !current)}
        onStartSwapSeat={() => startSwapSeatMode(true)}
        onDeleteSeat={deleteSelectedSeat}
        onExplainSeat={explainSeatWithPlanner}
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

      {swapConfirm && swapSourceSeat && swapTargetSeat && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/30 p-3 backdrop-blur-[2px] sm:items-center">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="swap-confirm-title"
            className="w-full max-w-md rounded-2xl border border-white/70 bg-white/95 p-4 text-slate-950 shadow-[0_26px_80px_rgba(15,23,42,0.28)] backdrop-blur-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="swap-confirm-title" className="text-base font-black">Confirm seat swap</h2>
                <p className="mt-1 text-sm leading-5 text-slate-500">This updates draft seats only. Viewers will not see it until publish.</p>
              </div>
              <button
                type="button"
                onClick={() => setSwapConfirm(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-black text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Cancel swap confirmation"
              >
                x
              </button>
            </div>

            <div className="mt-4 grid gap-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">Source</div>
                <div className="mt-1 text-sm font-black text-slate-950">{swapSourceSeat.label}</div>
                <div className="text-sm text-slate-500">{seatPersonLabel(swapSourceSeat)}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">Target</div>
                <div className="mt-1 text-sm font-black text-slate-950">{swapTargetSeat.label}</div>
                <div className="text-sm text-slate-500">{seatPersonLabel(swapTargetSeat)}</div>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-orange-200 bg-orange-50/70 p-3 text-sm font-semibold text-brand-dark">
              {buildSwapSummary(swapSourceSeat, swapTargetSeat)}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button type="button" onClick={() => setSwapConfirm(null)} disabled={pending} className="w-full">
                Cancel
              </Button>
              <Button type="button" variant="primary" onClick={confirmSwapSeats} disabled={pending} className="w-full">
                Confirm swap
              </Button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
