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
import { departmentKey } from "@/lib/departments";
import { normalizePoint } from "@/lib/seatMath";
import { canDeleteSeat, getSeatDeleteBlockReason } from "@/lib/seatProtection";
import { detectSeatZoneForPointResult, getSeatZoneDetectionFailureMessage } from "@/lib/seatZones";
import {
  MAP_IMAGE_HEIGHT,
  MAP_IMAGE_SRC,
  MAP_IMAGE_WIDTH,
  savedPointToVisualPoint,
  seatsToVisualSeats,
  visualPointToSavedPoint
} from "@/lib/mapLayoutTransform";
import { buildPublishChangeSummary, type PublishChangeItem } from "@/lib/publishSummary";
import { AskPlannerDrawer, type AskPlannerQueuedRequest } from "@/components/seat-map/AskPlannerDrawer";
import {
  FilterPanel,
  type ActiveFilterChip,
  type ResultStatusBreakdown
} from "@/components/seat-map/FilterPanel";
import { ResultsPanel, type AdminResultCard } from "@/components/seat-map/ResultsPanel";
import { SeatInspector } from "@/components/seat-map/SeatInspector";
import { SeatMarker } from "@/components/seat-map/SeatMarker";
import { Button } from "@/components/ui/Button";
import { StatusBadge, focusRingClass } from "@/components/ui/design-system";

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

type DeleteSeatConfirmState = {
  seatId: string;
  label: string;
} | null;

type InspectorGuardAction =
  | { kind: "select-seat"; seatId: string; center?: boolean; sourceLabel?: string }
  | { kind: "close-inspector" }
  | { kind: "clear-selection" }
  | { kind: "start-add-seat" }
  | { kind: "start-move-seat" }
  | { kind: "start-swap-seat" }
  | { kind: "navigate-management" };

type MapViewMode = "overview" | "detail";

const NAME_LABEL_COLLISION_X_THRESHOLD = 0.07;
const NAME_LABEL_COLLISION_Y_THRESHOLD = 0.07;
const ADMIN_NAMES_VISIBLE_STORAGE_KEY = "seat-planner:names-visible";
const DEFAULT_PUBLISHED_SEATS: SeatWithEmployee[] = [];
const INSPECTOR_FORM_ID = "seat-inspector-form";
const MAP_VIEW_MODE_OPTIONS: { value: MapViewMode; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "detail", label: "Detail" }
];
const STATUS_LABELS: Record<SeatStatus, string> = {
  available: "Available",
  assigned: "Assigned",
  reserved: "Reserved",
  unavailable: "Unavailable"
};

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

function PublishCountCard({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "warn" }) {
  return (
    <div className={["rounded-xl border p-3", tone === "warn" ? "border-[var(--admin-state-dirty-border)] bg-[var(--admin-state-dirty-bg)]" : "border-[var(--admin-state-neutral-border)] bg-[var(--admin-state-neutral-bg)]"].join(" ")}>
      <div className={["text-[11px] font-semibold", tone === "warn" ? "text-[var(--admin-state-dirty-text)]" : "text-[var(--admin-text-muted)]"].join(" ")}>{label}</div>
      <div className="mt-1 text-2xl font-semibold text-[var(--admin-text-primary)]">{value}</div>
    </div>
  );
}

function formatPublishChangeUnit(value: number) {
  return value === 1 ? "change" : "changes";
}

function PublishImpactCard({ label, value, description, tone = "default" }: { label: string; value: number; description: string; tone?: "default" | "warn" }) {
  return (
    <div className={["rounded-xl border p-3", tone === "warn" ? "border-[var(--admin-state-dirty-border)] bg-[var(--admin-state-dirty-bg)]" : "border-[var(--admin-state-neutral-border)] bg-[var(--admin-surface)]/80"].join(" ")}>
      <div className={["text-[11px] font-semibold", tone === "warn" ? "text-[var(--admin-state-dirty-text)]" : "text-[var(--admin-text-muted)]"].join(" ")}>{label}</div>
      <div className="mt-1 flex items-end gap-2">
        <span className="text-2xl font-semibold text-[var(--admin-text-primary)]">{value}</span>
        <span className="pb-1 text-xs font-bold text-[var(--admin-text-muted)]">{formatPublishChangeUnit(value)}</span>
      </div>
      <p className="mt-1 text-xs font-semibold leading-4 text-[var(--admin-text-muted)]">{description}</p>
    </div>
  );
}

function PublishChangeList({ title, items, emptyLabel }: { title: string; items: PublishChangeItem[]; emptyLabel: string }) {
  const visibleItems = items.slice(0, 5);
  const remainingCount = Math.max(items.length - visibleItems.length, 0);

  return (
    <div className="rounded-xl border border-[var(--admin-state-neutral-border)] bg-[var(--admin-surface)]/80 p-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-[var(--admin-text-primary)]">{title}</h3>
        <span className="rounded-full bg-[var(--admin-state-neutral-bg)] px-2 py-0.5 text-[11px] font-semibold text-[var(--admin-text-muted)] ring-1 ring-[var(--admin-state-neutral-border)]">{items.length}</span>
      </div>
      {items.length > 0 ? (
        <ul className="mt-2 space-y-1.5 text-xs leading-5 text-[var(--admin-text-muted)]">
          {visibleItems.map(item => (
            <li key={`${title}-${item.label}-${item.detail}`}>
              <span className="font-semibold text-[var(--admin-text-primary)]">{item.label}</span>
              {item.detail && <span> · {item.detail}</span>}
            </li>
          ))}
          {remainingCount > 0 && (
            <li className="font-bold text-[var(--admin-text-muted)]">+ {remainingCount} more</li>
          )}
        </ul>
      ) : (
        <p className="mt-2 text-xs font-semibold text-[var(--admin-text-muted)]">{emptyLabel}</p>
      )}
    </div>
  );
}

type SeatStatusLegendItem = {
  key: string;
  label: string;
  chipClass: string;
  accentClass: string;
  draftOnly?: boolean;
  badge?: boolean;
};

const SEAT_STATUS_LEGEND: SeatStatusLegendItem[] = [
  {
    key: "assigned",
    label: "Assigned",
    chipClass: "border-[var(--admin-marker-assigned-border)] bg-[var(--admin-marker-assigned-surface)]",
    accentClass: "bg-[var(--admin-marker-assigned-accent)]"
  },
  {
    key: "available",
    label: "Open",
    chipClass: "border-[var(--admin-marker-available-border)] bg-[var(--admin-marker-available-surface)]",
    accentClass: "bg-[var(--admin-marker-available-accent)]"
  },
  {
    key: "reserved",
    label: "Reserved",
    chipClass: "border-[var(--admin-marker-reserved-border)] bg-[var(--admin-marker-reserved-surface)]",
    accentClass: "bg-[var(--admin-marker-reserved-accent)]"
  },
  {
    key: "unavailable",
    label: "Unavailable",
    chipClass: "border-[var(--admin-marker-unavailable-border)] bg-[var(--admin-marker-unavailable-surface)]",
    accentClass: "bg-[var(--admin-marker-unavailable-accent)]"
  },
  {
    key: "draft-changed",
    label: "Draft change",
    chipClass: "border-[var(--admin-marker-draft-border)] bg-[var(--admin-marker-draft-surface)]",
    accentClass: "bg-[var(--admin-marker-draft-accent)]",
    draftOnly: true,
    badge: true
  }
];

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
  const [inspectorGuardAction, setInspectorGuardAction] = useState<InspectorGuardAction | null>(null);
  const [pendingInspectorSaveAction, setPendingInspectorSaveAction] = useState<InspectorGuardAction | null>(null);
  const [inspectorResetSignal, setInspectorResetSignal] = useState(0);
  const [showNames, setShowNames] = useState(false);
  const [namesPreferenceHydrated, setNamesPreferenceHydrated] = useState(false);
  const [mapViewMode, setMapViewMode] = useState<MapViewMode>("detail");
  const [overviewMapWidth, setOverviewMapWidth] = useState<number | null>(null);
  const [mapVisibleRange, setMapVisibleRange] = useState({ left: 0, right: 1, viewportWidth: 0 });
  const [swapSourceSeatId, setSwapSourceSeatId] = useState<string | null>(null);
  const [swapConfirm, setSwapConfirm] = useState<SwapConfirmState>(null);
  const [deleteSeatConfirm, setDeleteSeatConfirm] = useState<DeleteSeatConfirmState>(null);
  const [draftHistory, setDraftHistory] = useState(() => createDraftHistory());
  const [pending, startTransition] = useTransition();
  const mapViewportRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const askPlannerButtonRef = useRef<HTMLButtonElement | null>(null);

  const updateMapVisibleRange = useCallback(() => {
    const viewport = mapViewportRef.current;
    const map = mapRef.current;
    if (!viewport || !map || map.offsetWidth <= 0) return;

    const mapLeftInScrollContent = map.offsetLeft;
    const left = Math.max(0, (viewport.scrollLeft - mapLeftInScrollContent) / map.offsetWidth);
    const right = Math.min(1, (viewport.scrollLeft - mapLeftInScrollContent + viewport.clientWidth) / map.offsetWidth);

    const viewportWidth = viewport.clientWidth;

    setMapVisibleRange(current => (
      Math.abs(current.left - left) < 0.002 && Math.abs(current.right - right) < 0.002 && Math.abs(current.viewportWidth - viewportWidth) < 1
        ? current
        : { left, right, viewportWidth }
    ));
  }, []);

  const focusAskPlannerButton = useCallback(() => {
    window.setTimeout(() => askPlannerButtonRef.current?.focus(), 0);
  }, []);

  const closeAskPlannerDrawer = useCallback(() => {
    setAskPlannerOpen(false);
    focusAskPlannerButton();
  }, [focusAskPlannerButton]);

  const toggleFilterPanel = useCallback(() => {
    setAskPlannerOpen(false);
    setFilterCollapsed(current => !current);
  }, []);

  const openAskPlannerDrawer = useCallback(() => {
    setFilterCollapsed(true);
    setAskPlannerOpen(true);
  }, []);

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
    const viewport = mapViewportRef.current;
    if (!viewport) return;
    const viewportElement = viewport;

    function updateOverviewMapWidth() {
      const availableWidth = Math.max(1, viewportElement.clientWidth - 12);
      const availableHeight = Math.max(1, viewportElement.clientHeight - 12);
      const desktopOverview = window.matchMedia("(min-width: 1024px)").matches;
      const nextWidth = desktopOverview
        ? Math.min(MAP_IMAGE_WIDTH, availableWidth, availableHeight * (MAP_IMAGE_WIDTH / MAP_IMAGE_HEIGHT))
        : Math.min(MAP_IMAGE_WIDTH, availableWidth);
      setOverviewMapWidth(Math.floor(nextWidth));
    }

    updateOverviewMapWidth();

    const observer = new ResizeObserver(updateOverviewMapWidth);
    observer.observe(viewportElement);
    window.addEventListener("resize", updateOverviewMapWidth);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateOverviewMapWidth);
    };
  }, []);

  useEffect(() => {
    const viewport = mapViewportRef.current;
    if (!viewport) return;

    updateMapVisibleRange();

    const observer = new ResizeObserver(updateMapVisibleRange);
    observer.observe(viewport);
    if (mapRef.current) observer.observe(mapRef.current);
    viewport.addEventListener("scroll", updateMapVisibleRange, { passive: true });
    window.addEventListener("resize", updateMapVisibleRange);

    return () => {
      observer.disconnect();
      viewport.removeEventListener("scroll", updateMapVisibleRange);
      window.removeEventListener("resize", updateMapVisibleRange);
    };
  }, [mapViewMode, overviewMapWidth, updateMapVisibleRange]);

  useEffect(() => {
    if (mapViewMode !== "detail") return;

    const frame = window.requestAnimationFrame(() => {
      const viewport = mapViewportRef.current;
      if (!viewport) return;

      const maxLeft = Math.max(viewport.scrollWidth - viewport.clientWidth, 0);
      const maxTop = Math.max(viewport.scrollHeight - viewport.clientHeight, 0);
      viewport.scrollTo({
        left: Math.min(Math.max(maxLeft / 2, 0), maxLeft),
        top: Math.min(Math.max(maxTop / 2, 0), maxTop),
        behavior: "auto"
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [mapViewMode]);

  useEffect(() => {
    if (mapViewMode !== "overview") return;

    const frame = window.requestAnimationFrame(() => {
      mapViewportRef.current?.scrollTo({ left: 0, top: 0, behavior: "auto" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [mapViewMode, overviewMapWidth]);

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

      if (inspectorGuardAction) {
        keepEditingInspector();
        return;
      }

      if (deleteSeatConfirm) {
        setDeleteSeatConfirm(null);
        return;
      }

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

      if (!isEditableTarget(event.target) && selectedSeatId) {
        if (inspectorDirty) {
          setInspectorGuardAction({ kind: "close-inspector" });
          setPendingInspectorSaveAction(null);
          setInspectorCollapsed(false);
          setActionNotice(null);
          setActionError(null);
          return;
        }
        // Esc ladder: selected with a retained query returns to RESULTS (the panel
        // slot re-renders results); selected without a query returns to idle.
        setSelectedSeatId(null);
        setInspectorCollapsed(false);
        return;
      }

      if (!isEditableTarget(event.target) && search.trim()) {
        setSearch("");
        return;
      }

      if (!isEditableTarget(event.target) && (department !== "all" || zone !== "all" || status !== "all")) {
        setDepartment("all");
        setZone("all");
        setStatus("all");
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [addSeatMode, askPlannerOpen, closeAskPlannerDrawer, deleteSeatConfirm, department, filterCollapsed, inspectorDirty, inspectorGuardAction, moveSeatMode, publishReviewOpen, search, selectedSeatId, status, swapConfirm, swapSourceSeatId, zone]);

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
    reserved: localSeats.filter(seat => seat.status === "reserved").length,
    unavailable: localSeats.filter(seat => seat.status === "unavailable").length
  }), [localSeats]);
  const publishSummary = useMemo(() => buildPublishChangeSummary(localSeats, localPublishedSeats), [localSeats, localPublishedSeats]);
  const draftChangedSeatLabelSet = useMemo(() => new Set([
    ...publishSummary.addedSeats,
    ...publishSummary.assignmentChanges,
    ...publishSummary.vacatedSeats,
    ...publishSummary.seatMoves,
    ...publishSummary.statusChanges,
    ...publishSummary.otherChanges
  ].map(item => item.label)), [publishSummary]);
  const legendCounts: Record<string, number> = {
    assigned: stats.assigned,
    available: stats.available,
    reserved: stats.reserved,
    unavailable: stats.unavailable,
    "draft-changed": draftChangedSeatLabelSet.size
  };

  const selectedSeat = localSeats.find(seat => seat.id === selectedSeatId) ?? null;
  const swapSourceSeat = swapSourceSeatId ? localSeats.find(seat => seat.id === swapSourceSeatId) ?? null : null;
  const swapTargetSeat = swapConfirm ? localSeats.find(seat => seat.id === swapConfirm.targetSeatId) ?? null : null;
  const visualLocalSeats = useMemo(() => seatsToVisualSeats(localSeats), [localSeats]);
  const visualSeatById = useMemo(() => new Map(visualLocalSeats.map(seat => [seat.id, seat])), [visualLocalSeats]);
  const plannerHighlightedSeatIdSet = useMemo(() => new Set(plannerHighlightedSeatIds), [plannerHighlightedSeatIds]);
  const searchQuery = search.trim();
  const searchActive = Boolean(searchQuery);
  const structuredFiltersActive = department !== "all" || zone !== "all" || status !== "all";
  const activeFilterChips: ActiveFilterChip[] = [
    searchActive ? { id: "search", label: "Search", value: searchQuery, removeLabel: `Remove search filter ${searchQuery}` } : null,
    department !== "all" ? { id: "department", label: "Department", value: department, removeLabel: `Remove department filter ${department}` } : null,
    zone !== "all" ? { id: "zone", label: "Zone", value: zone, removeLabel: `Remove zone filter ${zone}` } : null,
    status !== "all" ? { id: "status", label: "Status", value: STATUS_LABELS[status as SeatStatus] ?? status, removeLabel: `Remove status filter ${STATUS_LABELS[status as SeatStatus] ?? status}` } : null
  ].filter(Boolean) as ActiveFilterChip[];
  const structuredFilterCount = [
    department !== "all",
    zone !== "all",
    status !== "all"
  ].filter(Boolean).length;
  const activeFilterCount = activeFilterChips.length;
  const filtersActive = activeFilterCount > 0;
  const matchingSeats = filtersActive ? localSeats.filter(seat => matchesFilters(seat)) : localSeats;
  const resultStatusBreakdown = useMemo<ResultStatusBreakdown>(() => ({
    available: matchingSeats.filter(seat => seat.status === "available").length,
    assigned: matchingSeats.filter(seat => seat.status === "assigned").length,
    reserved: matchingSeats.filter(seat => seat.status === "reserved").length,
    unavailable: matchingSeats.filter(seat => seat.status === "unavailable").length
  }), [matchingSeats]);
  // Merged result cards: one card per entity (F1) — an assigned seat and its occupant
  // are one card, never two rows. Unassigned people matching a text search appear as
  // disabled cards so the person is findable without fabricating a seat.
  const panelResults = useMemo<AdminResultCard[]>(() => {
    const statusRank: Record<SeatStatus, number> = { assigned: 0, available: 1, reserved: 2, unavailable: 3 };
    const seatCards = [...matchingSeats]
      .sort((a, b) => statusRank[a.status] - statusRank[b.status] || a.label.localeCompare(b.label))
      .map(seat => {
        const zoneLabel = getSeatZone(seat) || "No zone";
        if (seat.employee) {
          return {
            key: `seat-${seat.id}`,
            seatId: seat.id,
            title: `${seat.employee.full_name} — ${seat.label}`,
            subtitle: [seat.employee.department, zoneLabel, STATUS_LABELS[seat.status]].filter(Boolean).join(" · "),
            status: seat.status
          };
        }
        return {
          key: `seat-${seat.id}`,
          seatId: seat.id,
          title: seat.label,
          subtitle: [seat.status === "available" ? "Open seat" : STATUS_LABELS[seat.status], zoneLabel].join(" · "),
          status: seat.status
        };
      });
    if (!searchQuery) return seatCards.slice(0, 60);
    const needle = searchQuery.toLowerCase();
    const assignedEmployeeIds = new Set(localSeats.map(seat => seat.employee_id).filter(Boolean));
    const unassignedPeople = localEmployees
      .filter(employee => !assignedEmployeeIds.has(employee.id))
      .filter(employee => [employee.full_name, employee.position, employee.department, employee.phone_extension].filter(Boolean).join(" ").toLowerCase().includes(needle))
      .map(employee => ({
        key: `person-${employee.id}`,
        seatId: null,
        title: employee.full_name,
        subtitle: [employee.position, employee.department, "Unassigned"].filter(Boolean).join(" · "),
        status: null,
        disabled: true
      }));
    return [...seatCards, ...unassignedPeople].slice(0, 60);
  }, [localEmployees, localSeats, matchingSeats, searchQuery]);
  const selectedSeatMatchesFilters = selectedSeat ? matchesFilters(selectedSeat) : true;
  const crowdedNameSeatIdSet = useMemo(() => {
    const crowded = new Set<string>();
    const assignedSeats = visualLocalSeats.filter(seat => seat.employee);

    assignedSeats.forEach(seat => {
      const hasNearbySeat = visualLocalSeats.some(otherSeat => {
        if (otherSeat.id === seat.id) return false;
        return (
          Math.abs(otherSeat.x - seat.x) <= NAME_LABEL_COLLISION_X_THRESHOLD &&
          Math.abs(otherSeat.y - seat.y) <= NAME_LABEL_COLLISION_Y_THRESHOLD
        );
      });

      if (hasNearbySeat) crowded.add(seat.id);
    });

    return crowded;
  }, [visualLocalSeats]);
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
    const departmentOk = department === "all" || departmentKey(seatDepartment) === departmentKey(department);
    const zoneOk = zone === "all" || seatZone === zone;
    const statusOk = status === "all" || seat.status === (status as SeatStatus);

    return searchOk && departmentOk && zoneOk && statusOk;
  }

  function focusSeatMarker(seatId: string | null) {
    if (!seatId) return;
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>(`[data-seat-id="${seatId}"]`)?.focus();
    });
  }

  function applyCloseInspectorAction() {
    const seatIdToFocus = selectedSeatId;
    setSelectedSeatId(null);
    setInspectorDirty(false);
    setMoveSeatMode(false);
    setSwapSourceSeatId(null);
    setSwapConfirm(null);
    setDeleteSeatConfirm(null);
    setInspectorCollapsed(false);
    focusSeatMarker(seatIdToFocus);
  }

  function applyClearSelectionAction() {
    const seatIdToFocus = selectedSeatId;
    setSelectedSeatId(null);
    setInspectorDirty(false);
    setMoveSeatMode(false);
    setAddSeatMode(false);
    setSwapSourceSeatId(null);
    setSwapConfirm(null);
    setDeleteSeatConfirm(null);
    setInspectorCollapsed(false);
    focusSeatMarker(seatIdToFocus);
  }

  function applyStartAddSeatAction() {
    setSelectedSeatId(null);
    setInspectorDirty(false);
    setMoveSeatMode(false);
    setSwapSourceSeatId(null);
    setSwapConfirm(null);
    setAddSeatMode(true);
    setInspectorCollapsed(false);
  }

  function applyStartMoveSeatAction() {
    if (!selectedSeatId) return;
    setAddSeatMode(false);
    setSwapSourceSeatId(null);
    setSwapConfirm(null);
    setMoveSeatMode(current => !current);
  }

  function applyStartSwapSeatAction() {
    if (!selectedSeat) {
      setActionError("Select the source seat first, then choose Swap seat.");
      setActionNotice(null);
      return;
    }

    setActionError(null);
    setActionNotice(null);
    setInspectorDirty(false);
    setMoveSeatMode(false);
    setAddSeatMode(false);
    setDragState(null);
    setSwapConfirm(null);
    setSwapSourceSeatId(selectedSeat.id);
    setInspectorCollapsed(true);
  }

  function applyInspectorGuardAction(action: InspectorGuardAction) {
    if (action.kind === "select-seat") {
      commitSeatSelection(action.seatId);
      if (action.center) {
        setFilterCollapsed(true);
        queueCenterSeatInMap(action.seatId);
      }
      return;
    }

    if (action.kind === "close-inspector") {
      applyCloseInspectorAction();
      return;
    }

    if (action.kind === "clear-selection") {
      applyClearSelectionAction();
      return;
    }

    if (action.kind === "start-add-seat") {
      applyStartAddSeatAction();
      return;
    }

    if (action.kind === "start-move-seat") {
      applyStartMoveSeatAction();
      return;
    }

    if (action.kind === "start-swap-seat") {
      applyStartSwapSeatAction();
      return;
    }

    window.location.assign("/admin/management");
  }

  function requestInspectorGuard(action: InspectorGuardAction) {
    if (!inspectorDirty) {
      applyInspectorGuardAction(action);
      return true;
    }

    setInspectorGuardAction(action);
    setPendingInspectorSaveAction(null);
    setInspectorCollapsed(false);
    setActionNotice(null);
    setActionError(null);
    return false;
  }

  function requestInspectorGuardSave() {
    if (!inspectorGuardAction) return;
    setPendingInspectorSaveAction(inspectorGuardAction);
    setInspectorGuardAction(null);
    window.requestAnimationFrame(() => {
      const form = document.getElementById(INSPECTOR_FORM_ID);
      if (form instanceof HTMLFormElement) form.requestSubmit();
    });
  }

  function discardInspectorGuardEdits() {
    if (!inspectorGuardAction) return;
    const action = inspectorGuardAction;
    setInspectorGuardAction(null);
    setPendingInspectorSaveAction(null);
    setInspectorDirty(false);
    setInspectorResetSignal(current => current + 1);
    applyInspectorGuardAction(action);
  }

  function keepEditingInspector() {
    setInspectorGuardAction(null);
    setPendingInspectorSaveAction(null);
    setInspectorCollapsed(false);
  }

  function cancelPendingInspectorGuardAction() {
    setPendingInspectorSaveAction(null);
  }

  function describeInspectorGuardAction(action: InspectorGuardAction | null) {
    if (!action) return "continuing.";
    if (action.kind === "select-seat") return "opening another seat.";
    if (action.kind === "close-inspector") return "closing the inspector.";
    if (action.kind === "clear-selection") return "clearing the selection.";
    if (action.kind === "start-add-seat") return "starting Add Seat mode.";
    if (action.kind === "start-move-seat") return "starting Move Seat mode.";
    if (action.kind === "start-swap-seat") return "starting Swap Seats mode.";
    return "opening Management.";
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
    if (inspectorDirty) {
      setActionNotice(null);
      setActionError("Save or discard the selected seat edits before using Undo or Redo.");
      return;
    }

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

  function clearStructuredFilters() {
    setDepartment("all");
    setZone("all");
    setStatus("all");
  }

  function clearAllConstraints() {
    setSearch("");
    clearStructuredFilters();
  }

  function clearSearch() {
    setSearch("");
  }

  function removeActiveFilterChip(chipId: string) {
    if (chipId === "search") {
      clearSearch();
      return;
    }

    if (chipId === "department") {
      setDepartment("all");
      return;
    }

    if (chipId === "zone") {
      setZone("all");
      return;
    }

    if (chipId === "status") {
      setStatus("all");
    }
  }

  const scrollMapToPoint = useCallback((x: number, y: number) => {
    const viewport = mapViewportRef.current;
    const map = mapRef.current;
    if (!viewport || !map) return;

    const clampScrollPosition = (value: number, max: number) => Math.min(Math.max(value, 0), Math.max(max, 0));
    const left = clampScrollPosition((x * map.offsetWidth) - (viewport.clientWidth / 2), viewport.scrollWidth - viewport.clientWidth);
    const top = clampScrollPosition((y * map.offsetHeight) - (viewport.clientHeight / 2), viewport.scrollHeight - viewport.clientHeight);
    viewport.scrollTo({ left, top, behavior: "smooth" });
  }, []);

  const centerMapViewport = useCallback((behavior: ScrollBehavior = "smooth") => {
    const viewport = mapViewportRef.current;
    if (!viewport) return;

    const clampScrollPosition = (value: number, max: number) => Math.min(Math.max(value, 0), Math.max(max, 0));
    const left = clampScrollPosition((viewport.scrollWidth - viewport.clientWidth) / 2, viewport.scrollWidth - viewport.clientWidth);
    const top = clampScrollPosition((viewport.scrollHeight - viewport.clientHeight) / 2, viewport.scrollHeight - viewport.clientHeight);
    viewport.scrollTo({ left, top, behavior });
  }, []);

  function changeMapViewMode(nextMode: MapViewMode) {
    setMapViewMode(nextMode);

    if (nextMode === "detail") {
      const detailFocusSeatId = selectedSeatId ?? (filtersActive && matchingSeats.length === 1 ? matchingSeats[0].id : null);
      if (detailFocusSeatId) {
        queueCenterSeatInMap(detailFocusSeatId);
        return;
      }

      window.requestAnimationFrame(() => centerMapViewport());
      return;
    }

    if (nextMode === "overview") {
      window.requestAnimationFrame(() => {
        mapViewportRef.current?.scrollTo({ left: 0, top: 0, behavior: "auto" });
      });
    }
  }

  const centerSeatInMap = useCallback((seatId: string) => {
    const seat = localSeats.find(item => item.id === seatId);
    if (!seat) return;
    const point = savedPointToVisualPoint({ x: seat.x, y: seat.y }, seat);
    scrollMapToPoint(point.x, point.y);
  }, [localSeats, scrollMapToPoint]);

  function fitSeatsInMap(seatsToFit: SeatWithEmployee[]) {
    if (!seatsToFit.length) return;
    if (seatsToFit.length === 1) {
      const point = savedPointToVisualPoint({ x: seatsToFit[0].x, y: seatsToFit[0].y }, seatsToFit[0]);
      scrollMapToPoint(point.x, point.y);
      return;
    }

    const visualSeatsToFit = seatsToFit.map(seat => savedPointToVisualPoint({ x: seat.x, y: seat.y }, seat));
    const bounds = visualSeatsToFit.reduce(
      (current, point) => ({
        minX: Math.min(current.minX, point.x),
        maxX: Math.max(current.maxX, point.x),
        minY: Math.min(current.minY, point.y),
        maxY: Math.max(current.maxY, point.y)
      }),
      { minX: 1, maxX: 0, minY: 1, maxY: 0 }
    );

    scrollMapToPoint((bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2);
  }

  const queueCenterSeatInMap = useCallback((seatId: string) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => centerSeatInMap(seatId));
    });
  }, [centerSeatInMap]);

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

  function commitSeatSelection(seatId: string) {
    if (canEdit && swapSourceSeatId) {
      if (seatId !== swapSourceSeatId) {
        return requestSwapTarget(seatId);
      }
      setSelectedSeatId(seatId);
      setInspectorCollapsed(true);
      setActionNotice(null);
      return true;
    }

    if (selectedSeatId === seatId) {
      setMoveSeatMode(false);
      setAddSeatMode(false);
      setSwapSourceSeatId(null);
      setSwapConfirm(null);
      setInspectorCollapsed(false);
      return true;
    }

    setSelectedSeatId(seatId);
    setInspectorDirty(false);
    setMoveSeatMode(false);
    setAddSeatMode(false);
    setSwapSourceSeatId(null);
    setSwapConfirm(null);
    setInspectorCollapsed(false);
    return true;
  }

  function selectSeat(seatId: string) {
    if (selectedSeatId && selectedSeatId !== seatId && inspectorDirty) {
      return requestInspectorGuard({ kind: "select-seat", seatId });
    }

    return commitSeatSelection(seatId);
  }

  function openSeatFromResults(seatId: string, sourceLabel: string) {
    if (selectedSeatId && selectedSeatId !== seatId && inspectorDirty) {
      requestInspectorGuard({ kind: "select-seat", seatId, center: true, sourceLabel });
      return;
    }

    if (!selectSeat(seatId)) return;

    setFilterCollapsed(true);
    queueCenterSeatInMap(seatId);
  }

  function selectSeatResult(seatId: string) {
    openSeatFromResults(seatId, "seat results");
  }

  function startAddSeatMode() {
    if (selectedSeatId && inspectorDirty) {
      requestInspectorGuard({ kind: "start-add-seat" });
      return;
    }
    applyStartAddSeatAction();
  }

  function cancelAddSeatMode() {
    setAddSeatMode(false);
  }

  function beforeManagementNavigation() {
    if (!inspectorDirty) return true;
    requestInspectorGuard({ kind: "navigate-management" });
    return false;
  }

  function selectPlannerHighlightedSeat(seatId: string) {
    if (selectSeat(seatId)) {
      setAskPlannerOpen(false);
      setInspectorCollapsed(false);
    }
  }

  function explainSeatWithPlanner(seat: SeatWithEmployee) {
    if (!canEdit) return;

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
      return;
    }

    if (!skipDirtyCheck && inspectorDirty) {
      requestInspectorGuard({ kind: "start-swap-seat" });
      return;
    }

    applyStartSwapSeatAction();
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
      const visualPoint = eventToPoint(event);
      if (!visualPoint) return;

      if (seatTarget?.dataset.seatId) return;

      const targetZoneResult = detectSeatZoneForPointResult(visualPoint, visualLocalSeats);
      if (targetZoneResult.status !== "detected") {
        setActionNotice(null);
        setActionError(getSeatZoneDetectionFailureMessage(targetZoneResult) ?? "Could not detect a zone for this location.");
        return;
      }
      const targetZone = targetZoneResult.zone;

      const beforeSnapshot = captureDraftSnapshot();

      startTransition(async () => {
        try {
          const savedPoint = visualPointToSavedPoint(visualPoint, { zone: targetZone });
          setActionError(null);
          setActionNotice(null);
          const created = await createSeatAction({
            x: savedPoint.x,
            y: savedPoint.y,
            visualX: visualPoint.x,
            visualY: visualPoint.y
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
      if (selectedSeatId && inspectorDirty) {
        requestInspectorGuard({ kind: "clear-selection" });
        return;
      }
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
    const visualPoint = eventToPoint(event);
    if (!visualPoint) return;

    setLocalSeats(current => current.map(seat => {
      if (seat.id !== dragState.seatId) return seat;
      const savedPoint = visualPointToSavedPoint(visualPoint, { source: seat });
      return { ...seat, x: savedPoint.x, y: savedPoint.y };
    }));
  }

  function handleMapPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!dragState) return;
    const visualPoint = eventToPoint(event);
    const seatId = dragState.seatId;
    const beforeSnapshot = dragState.beforeSnapshot;
    setDragState(null);
    setMoveSeatMode(false);
    if (!visualPoint) {
      applyRestoredDraftPayload(beforeSnapshot);
      return;
    }

    const movedSeat = localSeats.find(seat => seat.id === seatId);
    const savedPoint = movedSeat
      ? visualPointToSavedPoint(visualPoint, { source: movedSeat })
      : visualPointToSavedPoint(visualPoint);

    startTransition(async () => {
      try {
        setActionError(null);
        setActionNotice(null);
        const updated = await moveSeatAction({ seatId, x: savedPoint.x, y: savedPoint.y });
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

    if (inspectorDirty) {
      setActionNotice(null);
      setActionError("Save or discard the selected seat edits before deleting a custom seat.");
      return;
    }

    const deleteBlockReason = getSeatDeleteBlockReason(selectedSeat);
    if (!canDeleteSeat(selectedSeat)) {
      setActionError(deleteBlockReason ?? "Select a custom seat first.");
      return;
    }

    setActionNotice(null);
    setActionError(null);
    setDeleteSeatConfirm({ seatId: selectedSeat.id, label: selectedSeat.label });
  }

  function confirmDeleteSelectedSeat() {
    if (!deleteSeatConfirm) return;

    const seatToDelete = localSeats.find(seat => seat.id === deleteSeatConfirm.seatId) ?? null;
    const deleteBlockReason = getSeatDeleteBlockReason(seatToDelete);
    if (!seatToDelete || !canDeleteSeat(seatToDelete)) {
      setDeleteSeatConfirm(null);
      setActionError(deleteBlockReason ?? "Select a custom seat first.");
      return;
    }

    if (inspectorDirty) {
      setDeleteSeatConfirm(null);
      setActionNotice(null);
      setActionError("Save or discard the selected seat edits before deleting a custom seat.");
      return;
    }

    const beforeSnapshot = captureDraftSnapshot();
    const deletedSeatLabel = seatToDelete.label;
    setDeleteSeatConfirm(null);

    startTransition(async () => {
      try {
        setActionError(null);
        setActionNotice(null);
        const result = await deleteSeatAction(seatToDelete.id);
        const afterSeats = beforeSnapshot.seats.filter(seat => seat.id !== result.seatId);
        recordDraftHistory(`Delete ${deletedSeatLabel}`, beforeSnapshot, afterSeats, beforeSnapshot.employees);
        setLocalSeats(afterSeats);
        setSelectedSeatId(null);
        setInspectorDirty(false);
        setMoveSeatMode(false);
        setSwapSourceSeatId(null);
        setSwapConfirm(null);
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
      setActionError("Publish review blocked: Save or discard the selected seat edits before publishing. The publish review only includes saved draft changes.");
      return;
    }

    setActionError(null);
    setActionNotice(null);
    setPublishReviewOpen(true);
  }

  function confirmPublishDraftMap() {
    const nextPublishedSeats = normalizeSeats(localSeats);
    setActionError(null);
    setActionNotice(null);
    startTransition(async () => {
      try {
        await publishSeatMapAction();
        setLocalPublishedSeats(nextPublishedSeats);
        setDraftHistory(clearDraftHistory());
        setPublishReviewOpen(false);
        setActionNotice("Draft map published. Undo/Redo history was cleared.");
      } catch (error) {
        setActionNotice(null);
        setActionError(error instanceof Error ? error.message : "Could not publish seat map.");
      }
    });
  }

  const namesToggleLabel = showNames ? "Hide names" : "Show names";
  const searchStatusTitle = searchActive ? `Searching “${searchQuery}”` : "Filtered results";
  const searchStatusSummary = `${matchingSeats.length} ${matchingSeats.length === 1 ? "match" : "matches"} · ${resultStatusBreakdown.assigned} assigned · ${resultStatusBreakdown.available} open`;
  const resultEmptyTitle = searchActive && structuredFiltersActive
    ? "No combined results"
    : searchActive
      ? "No search results"
      : "No filter results";
  const resultEmptyDescription = searchActive && structuredFiltersActive
    ? "No seats match this search with the selected filters. Clear the search, clear filters, or clear all to broaden the result set."
    : searchActive
      ? "No seats match this search. Clear search or try a different employee, seat, department, status, or zone."
      : "No seats match these filters. Clear filters or choose a broader department, zone, or status.";
  const selectedSeatMismatchNotice = selectedSeat && filtersActive && !selectedSeatMatchesFilters
    ? searchActive
      ? "This selected seat does not match the current search."
      : "This selected seat does not match the current filters."
    : null;
  const clearSearchContextLabel = searchActive ? "Clear search" : "Clear filters";
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
  const publishPeopleChangeCount = publishSummary.assignmentChanges.length + publishSummary.vacatedSeats.length;
  const publishSeatInventoryChangeCount = publishSummary.addedSeats.length + publishSummary.removedSeats.length;
  const publishLayoutChangeCount = publishSummary.seatMoves.length;
  const publishMetadataChangeCount = publishSummary.statusChanges.length + publishSummary.otherChanges.length;
  const publishReadinessTitle = publishSummary.hasChanges ? "Ready to publish reviewed changes" : "Draft and viewer map are in sync";
  const publishReadinessDescription = publishSummary.hasChanges
    ? "This review includes saved draft changes only. Unsaved inspector edits must be saved or discarded before this review opens."
    : "No saved draft changes are waiting. The viewer map already matches this draft.";
  const publishReadinessBadgeTone = publishSummary.hasChanges ? "draft" : "published";
  const publishReadinessBadgeLabel = publishSummary.hasChanges ? "Ready" : "No changes";
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
  const showFilterPanel = !filterCollapsed;
  // Panel slot (right): one occupant at a time — DETAIL (inspector) when a seat is
  // selected, RESULTS when search/filters are active with no selection, MAP KEY when
  // idle at the dock tier. Tiers: sheet ≤899, overlay 900–1139 (floats, no reflow),
  // dock ≥1140 with a permanently reserved gutter so the canvas never resizes (INV-6).
  const resultsPanelOpen = canEdit && filtersActive && !selectedSeat;
  const mapKeyPanelOpen = canEdit && !resultsPanelOpen && !selectedSeat;
  const desktopInspectorReserveMarginClassName = canEdit ? "dock:mr-[376px]" : "";
  // The gutter narrows the whole canvas section at the dock tier, so banners inside it
  // need no extra safe area; at the overlay tier panels intentionally float over content.
  const canvasBannerSafeAreaClassName = "";
  const mobileMapInteractionSurfaceOpen = canEdit && (
    Boolean(selectedSeat && !inspectorCollapsed) ||
    showFilterPanel ||
    askPlannerOpen ||
    publishReviewOpen ||
    Boolean(deleteSeatConfirm) ||
    Boolean(inspectorGuardAction) ||
    Boolean(swapConfirm)
  );
  const mobileMapControlsHidden = mobileMapInteractionSurfaceOpen;
  const filterPanelShellClass = [
    filterCollapsed ? "order-2" : "order-1",
    "lg:order-1",
    canEdit && filterCollapsed ? "lg:hidden" : "",
    !filterCollapsed ? "lg:min-h-0 lg:self-stretch lg:[&>aside]:h-full lg:[&>aside]:max-h-full lg:[&>aside]:top-0" : ""
  ].join(" ");
  const mapViewportClassName = [
    "relative mx-auto w-full max-w-full overscroll-contain rounded-[22px] border border-[var(--admin-border-strong)] bg-[var(--admin-surface-muted)] shadow-[var(--admin-shadow-map),inset_0_1px_0_rgba(255,255,255,0.78)] sm:rounded-[26px] lg:h-full lg:min-h-0 lg:flex-1 lg:max-h-none",
    mapViewMode === "overview"
      ? "min-h-[300px] overflow-hidden p-1.5 sm:min-h-[480px] sm:p-2 lg:flex lg:min-h-0 lg:items-center lg:justify-center"
      : "min-h-[360px] max-h-[82svh] overflow-auto sm:min-h-[520px] sm:max-h-[calc(100svh-62px)] lg:min-h-0 lg:max-h-none lg:[-ms-overflow-style:none] lg:[scrollbar-width:none] lg:[&::-webkit-scrollbar]:hidden",
    canEdit ? "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus-ring-color)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--admin-surface-muted)]" : ""
  ].join(" ");
  const mapFrameClassName = [
    "relative mx-auto max-w-none",
    mapViewMode === "overview" ? "w-full max-w-[1911px]" : "w-[1120px] sm:w-[1460px] lg:w-[1911px]",
    addSeatMode ? "cursor-crosshair" : ""
  ].join(" ");
  const mapFrameStyle = mapViewMode === "overview" && overviewMapWidth ? { width: `${overviewMapWidth}px` } : undefined;
  const activeModeBannerClassName = [
    "flex flex-col gap-2 rounded-2xl border border-[var(--admin-primary-border)] bg-[var(--admin-primary-soft)] px-3 py-2 text-xs font-semibold text-[var(--admin-primary-cta)] shadow-[0_12px_34px_rgba(166,58,18,0.14)] backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between",
    canvasBannerSafeAreaClassName
  ].filter(Boolean).join(" ");
  const mapModeOverlayShellClassName = [
    "pointer-events-none sticky left-0 top-0 z-30 h-0",
    mobileMapControlsHidden ? "hidden sm:block" : ""
  ].filter(Boolean).join(" ");
  const mapMarkerLayerClassName = [
    "absolute inset-0",
    mobileMapControlsHidden ? "hidden sm:block" : ""
  ].filter(Boolean).join(" ");
  const actionErrorBannerClassName = [
    "min-w-0 whitespace-pre-wrap break-words rounded-xl border border-[var(--admin-state-error-border)] bg-[var(--admin-state-error-bg)] px-3 py-2 text-sm font-semibold text-[var(--admin-state-error-text)]",
    canvasBannerSafeAreaClassName
  ].filter(Boolean).join(" ");
  const actionNoticeBannerClassName = [
    "flex min-w-0 flex-col gap-2 rounded-xl border border-[var(--admin-state-saved-border)] bg-[var(--admin-state-saved-bg)] px-3 py-2 text-sm font-semibold text-[var(--admin-state-saved-text)] sm:flex-row sm:items-center sm:justify-between",
    canvasBannerSafeAreaClassName
  ].filter(Boolean).join(" ");
  const resultActionButtonClassName = "inline-flex min-h-8 items-center justify-center rounded-lg border border-[var(--admin-border-strong)] bg-[var(--admin-surface)] px-3 py-1.5 text-[11px] font-semibold text-[var(--admin-text-secondary)] transition hover:border-[var(--admin-primary-border)] hover:bg-[var(--admin-primary-soft)] hover:text-[var(--admin-primary-cta)] active:scale-[0.97] active:duration-75 active:shadow-inner focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus-ring-color)] disabled:cursor-not-allowed disabled:opacity-50";
  const resultClearButtonClassName = "inline-flex min-h-8 items-center justify-center rounded-lg border border-[var(--admin-primary-border)] bg-[var(--admin-primary-soft)] px-3 py-1.5 text-[11px] font-semibold text-[var(--admin-primary-cta)] transition hover:border-[var(--admin-primary)] hover:bg-[rgba(242,110,34,0.16)] active:scale-[0.97] active:duration-75 active:shadow-inner focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus-ring-color)]";
  const visibleMapSpan = Math.max(0, mapVisibleRange.right - mapVisibleRange.left);
  const mapPixelsPerNormalizedUnit = visibleMapSpan > 0 && mapVisibleRange.viewportWidth > 0
    ? mapVisibleRange.viewportWidth / visibleMapSpan
    : 0;
  const markerEdgeBaseOffsetPx = 0;
  const markerEdgeMaxOffsetPx = 144;
  const markerEdgeThreshold = mapViewMode === "detail"
    ? Math.min(0.16, Math.max(0.06, visibleMapSpan * 0.24))
    : 0;
  const markerOutsideEdgeThreshold = mapViewMode === "detail"
    ? Math.min(0.08, Math.max(0.035, visibleMapSpan * 0.12))
    : 0;

  function getMarkerViewportPlacement(x: number): { edge: "left" | "right" | "none"; offsetPx: number } {
    if (mapViewMode !== "detail") return { edge: "none", offsetPx: 0 };

    const resolveOffset = (distancePastVisibleRange: number) => {
      if (distancePastVisibleRange <= 0 || mapPixelsPerNormalizedUnit <= 0) return markerEdgeBaseOffsetPx;
      return Math.min(markerEdgeMaxOffsetPx, Math.round(markerEdgeBaseOffsetPx + (distancePastVisibleRange * mapPixelsPerNormalizedUnit)));
    };

    if (x < mapVisibleRange.left) {
      const distancePastVisibleRange = mapVisibleRange.left - x;
      return distancePastVisibleRange <= markerOutsideEdgeThreshold
        ? { edge: "left", offsetPx: resolveOffset(distancePastVisibleRange) }
        : { edge: "none", offsetPx: 0 };
    }
    if (x - mapVisibleRange.left <= markerEdgeThreshold) return { edge: "left", offsetPx: markerEdgeBaseOffsetPx };
    if (x > mapVisibleRange.right) {
      const distancePastVisibleRange = x - mapVisibleRange.right;
      return distancePastVisibleRange <= markerOutsideEdgeThreshold
        ? { edge: "right", offsetPx: resolveOffset(distancePastVisibleRange) }
        : { edge: "none", offsetPx: 0 };
    }
    if (mapVisibleRange.right - x <= markerEdgeThreshold) return { edge: "right", offsetPx: markerEdgeBaseOffsetPx };
    return { edge: "none", offsetPx: 0 };
  }

  // Claude Design top bar: quiet text-only toolbar buttons — no borders/boxes, warm-grey,
  // subtle hover bg; active picks up the brand orange.
  const chromeToolbarBtn = "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[9px] px-2.5 text-[13px] font-medium leading-none text-[var(--admin-chrome-muted)] transition hover:bg-[var(--admin-chrome-hover)] hover:text-[var(--admin-chrome-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-primary)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[var(--admin-chrome-muted)]";
  const chromeToolbarBtnActive = "relative inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[9px] px-2.5 text-[13px] font-medium leading-none text-[var(--admin-chrome-text)] bg-[var(--admin-chrome-hover)] transition after:pointer-events-none after:absolute after:inset-x-2.5 after:bottom-1 after:h-0.5 after:rounded-full after:bg-[var(--admin-primary)] after:content-[''] hover:bg-[var(--admin-chrome-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-primary)]";

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-[var(--admin-bg)] text-[var(--admin-text-primary)] lg:h-screen lg:min-h-0 lg:overflow-hidden">
      <header className="z-40 flex h-[54px] shrink-0 items-center gap-2 border-b border-[var(--admin-chrome-border)] bg-[var(--admin-chrome-bg)] px-3 text-[var(--admin-chrome-text)] sm:gap-3 sm:px-4">
        <div className="flex min-w-0 shrink-0 items-center gap-2.5">
          <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center">
            {/* Megeredchian Law "AM" monogram: orange A apex interlocking a light M. */}
            <svg viewBox="0 0 24 24" className="h-[26px] w-[26px]" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 18.5 V8 L12 14.5 L21 8 V18.5" className="stroke-[var(--admin-chrome-text)]" strokeWidth="2.1" />
              <path d="M12 4 L7.7 13.4 M12 4 L16.3 13.4" className="stroke-[var(--admin-primary)]" strokeWidth="2.4" />
            </svg>
          </span>
          <div className="hidden min-w-0 leading-tight sm:block">
            <div className="truncate text-[13px] font-semibold text-[var(--admin-chrome-text)]">Megeredchian Law Seats</div>
            <div className="truncate text-[11px] text-[var(--admin-chrome-muted)]">{canEdit ? "Draft · Admin" : "Published · Viewer"}</div>
          </div>
        </div>

        {canEdit && (
          <nav role="group" aria-label="Admin command row" className="ml-1 flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button
              type="button"
              onClick={toggleFilterPanel}
              aria-controls="seat-map-filter-panel"
              aria-expanded={!filterCollapsed}
              aria-label={filterCollapsed ? "Open filters" : "Collapse filters"}
              className={structuredFilterCount > 0 ? chromeToolbarBtnActive : chromeToolbarBtn}
            >
              Filters
              {structuredFilterCount > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--admin-primary-cta)] px-1 text-[10px] font-semibold text-white">{structuredFilterCount}</span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setShowNames(current => !current)}
              aria-label={namesToggleLabel}
              title={namesToggleLabel}
              className={showNames ? chromeToolbarBtnActive : chromeToolbarBtn}
            >
              {namesToggleLabel}
            </button>
            <button
              type="button"
              onClick={undoDraftEdit}
              disabled={pending || inspectorDirty || !undoAvailable}
              aria-label="Undo last map change"
              title={undoTitle}
              className={chromeToolbarBtn}
            >
              Undo
            </button>
            <button
              type="button"
              onClick={redoDraftEdit}
              disabled={pending || inspectorDirty || !redoAvailable}
              aria-label="Redo last undone change"
              title={redoTitle}
              className={chromeToolbarBtn}
            >
              Redo
            </button>
            <Link
              href="/admin/management"
              onClick={event => {
                if (!beforeManagementNavigation()) event.preventDefault();
              }}
              className={chromeToolbarBtn}
            >
              Management
            </Link>
            <button
              ref={askPlannerButtonRef}
              type="button"
              aria-label={plannerHighlightedSeatIds.length > 0 ? `Open Ask Planner, ${plannerHighlightedSeatIds.length} seats highlighted` : "Open Ask Planner"}
              aria-controls="ask-planner-drawer"
              aria-expanded={askPlannerOpen}
              aria-haspopup="dialog"
              onClick={openAskPlannerDrawer}
              className={askPlannerOpen || plannerHighlightedSeatIds.length > 0 ? chromeToolbarBtnActive : chromeToolbarBtn}
            >
              Ask Planner
              {plannerHighlightedSeatIds.length > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--admin-primary-cta)] px-1 text-[10px] font-semibold text-white">{plannerHighlightedSeatIds.length}</span>
              )}
            </button>
          </nav>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          {canEdit && (
            <button
              type="button"
              onClick={() => setMapViewMode(current => (current === "detail" ? "overview" : "detail"))}
              aria-label={mapViewMode === "detail" ? "Fit map to view" : "Zoom map to actual size"}
              title={mapViewMode === "detail" ? "Fit map to view" : "Zoom map to actual size"}
              className="hidden h-8 items-center rounded-[9px] px-2 text-[12px] font-medium tabular-nums text-[var(--admin-chrome-muted)] transition hover:bg-[var(--admin-chrome-hover)] hover:text-[var(--admin-chrome-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-primary)] sm:inline-flex">
              {mapViewMode === "detail" ? "100%" : "Fit"}
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={openPublishReview}
              aria-label={`Review ${draftStatusLabel.toLowerCase()}`}
              title={draftStatusTitle}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[9px] bg-[var(--admin-surface)] px-3 text-[13px] font-semibold leading-none text-[var(--admin-text-primary)] transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-primary)]"
            >
              {publishSummary.hasChanges ? "Review changes" : "Published"}
              {publishSummary.hasChanges && <span className="h-1.5 w-1.5 rounded-full bg-[var(--admin-primary)]" aria-hidden="true" />}
            </button>
          )}
          {canEdit ? (
            <Link
              href="/admin/settings"
              aria-label="Open settings"
              title="Settings — data utilities and recovery"
              onClick={event => {
                if (!beforeManagementNavigation()) event.preventDefault();
              }}
              className={["flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--admin-primary)] text-[12px] font-semibold text-white transition hover:brightness-110", focusRingClass].join(" ")}
            >
              A
            </Link>
          ) : (
            <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--admin-primary)] text-[12px] font-semibold text-white">A</span>
          )}
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1920px] flex-1 flex-col px-2 py-2 sm:px-3 sm:py-3 lg:min-h-0 lg:overflow-hidden">
        

        <div className="flex min-w-0 flex-col overflow-hidden lg:min-h-0">
          <div role="search" aria-label="Command search" className="z-30 px-0.5 pb-2 lg:shrink-0">
            <label className="relative block w-full min-w-0">
              <span className="sr-only">Search employee, seat, job title, department, or zone</span>
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[var(--admin-text-muted)]">
                <circle cx="9" cy="9" r="5.25" stroke="currentColor" strokeWidth="1.7" />
                <path d="m13.4 13.4 3.1 3.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
              <input
                value={search}
                onChange={event => {
                  const value = event.target.value;
                  setSearch(value);
                  // INV-1: search evicts detail — typing hands the panel slot to results.
                  // Unsaved inspector edits keep the guard: eviction waits for save/discard.
                  if (value.trim() && selectedSeatId && !inspectorDirty) {
                    setSelectedSeatId(null);
                    setInspectorCollapsed(false);
                  }
                }}
                onKeyDown={event => {
                  if (event.key === "Escape" && search.trim()) {
                    event.stopPropagation();
                    clearSearch();
                  }
                }}
                placeholder="Search people, seats, departments, or zones"
                className="h-11 w-full rounded-[12px] border border-[var(--admin-border)] bg-[var(--admin-surface)] pl-11 pr-10 text-sm font-medium text-[var(--admin-text-primary)] shadow-sm outline-none transition placeholder:text-[var(--admin-text-subtle)] hover:border-[var(--admin-border-strong)] focus:border-[var(--admin-primary)] focus:ring-2 focus:ring-[color:var(--admin-primary-border)]"
              />
              {search.trim() && (
                <button
                  type="button"
                  aria-label="Clear top search"
                  title="Clear top search"
                  className={["absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-[var(--admin-text-muted)] transition hover:bg-[var(--admin-surface-muted)] hover:text-[var(--admin-text-secondary)] active:scale-90", focusRingClass].join(" ")}
                  onClick={clearSearch}
                >
                  <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5"><path d="m6 6 8 8m0-8-8 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              )}
            </label>
          </div>

      <main className={["grid grid-cols-1 gap-2 bg-[var(--admin-surface-muted)] p-2 lg:min-h-0 lg:flex-1 lg:items-stretch lg:overflow-hidden", desktopMapGridClass].join(" ")}>
        {showFilterPanel && (
          <div className={filterPanelShellClass}>
            <FilterPanel
              department={department}
              status={status}
              departments={departments}
              zone={zone}
              zones={zones}
              collapsed={filterCollapsed}
              activeChips={activeFilterChips}
              onToggle={toggleFilterPanel}
              onDepartmentChange={setDepartment}
              onZoneChange={setZone}
              onStatusChange={setStatus}
              onRemoveActiveChip={removeActiveFilterChip}
              onClearFilters={clearStructuredFilters}
              onClearAll={clearAllConstraints}
            />
          </div>
        )}

        <section aria-labelledby="admin-planning-canvas-title" className={[filterCollapsed ? "order-1" : "order-2", desktopInspectorReserveMarginClassName, "min-w-0 overflow-hidden rounded-[14px] border border-[var(--admin-border)] bg-[var(--admin-surface)]/68 p-2 lg:order-2 lg:flex lg:min-h-0 lg:flex-col lg:gap-2"].filter(Boolean).join(" ")}>
          {activeMode && (
            <div role="status" aria-live="polite" className={activeModeBannerClassName}>
              <div className="min-w-0">
                <div className="text-[10px] font-semibold text-[var(--admin-primary-cta)]">{activeMode.label} mode</div>
                <div className="mt-0.5 truncate text-sm font-bold text-[var(--admin-text-primary)]">{activeMode.message}</div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <span className="rounded-full bg-white/75 px-2 py-1 text-[10px] font-semibold text-[var(--admin-primary-cta)] ring-1 ring-[var(--admin-primary-border)]">Esc exits</span>
                <button type="button" onClick={activeMode.onExit} className="shrink-0 whitespace-nowrap rounded-full bg-white/75 px-3 py-1.5 text-[11px] font-semibold text-[var(--admin-primary-cta)] ring-1 ring-[var(--admin-primary-border)] transition hover:bg-white active:scale-[0.97] active:duration-75 active:shadow-inner focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus-ring-color)]">
                  {activeMode.exitLabel}
                </button>
              </div>
            </div>
          )}

          {actionError && (
            <div role="alert" className={actionErrorBannerClassName}>
              {actionError}
            </div>
          )}

          {actionNotice && !swapSourceSeatId && (
            <div role="status" aria-live="polite" className={actionNoticeBannerClassName}>
              <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{actionNotice}</span>
              {canEdit && undoAvailable && lastUndoLabel && !pending && !inspectorDirty && (
                <button
                  type="button"
                  onClick={undoDraftEdit}
                  className="shrink-0 self-start rounded-full border border-[var(--admin-state-saved-border)] bg-white/80 px-3 py-1 text-[11px] font-semibold text-[var(--admin-state-saved-text)] transition hover:bg-white active:scale-[0.97] active:duration-75 active:shadow-inner focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--admin-state-saved-border)] sm:self-auto"
                >
                  Undo {lastUndoLabel}
                </button>
              )}
            </div>
          )}

          <div className="min-w-0 lg:flex lg:min-h-0 lg:flex-1">
            <div
              ref={mapViewportRef}
              className={mapViewportClassName}
              tabIndex={canEdit ? 0 : undefined}
              aria-label={canEdit ? "Admin seat map viewport. Use wheel, trackpad, touch, or arrow keys to pan the map." : undefined}
            >
              <div className={mapModeOverlayShellClassName}>
                <div
                  role="group"
                  aria-label="Map view mode"
                  className="pointer-events-auto ml-2 mt-2 inline-flex rounded-xl border border-white/15 bg-[var(--admin-rail-bg)]/90 p-0.5 text-white shadow-[0_8px_18px_rgba(16,17,20,0.24),inset_0_1px_0_rgba(255,255,255,0.16)] backdrop-blur-md"
                >
                  {MAP_VIEW_MODE_OPTIONS.map(option => {
                    const active = mapViewMode === option.value;

                    return (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={active}
                        onClick={() => changeMapViewMode(option.value)}
                        className={[
                          "h-8 rounded-lg px-2.5 text-[11px] font-semibold transition active:scale-[0.97] active:duration-75",
                          focusRingClass,
                          active ? "bg-[var(--admin-primary-soft)] text-[var(--admin-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]" : "text-white/75 hover:bg-white/10 hover:text-white"
                        ].join(" ")}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
                {canEdit && (
                  <button
                    type="button"
                    aria-pressed={addSeatMode}
                    onClick={addSeatMode ? cancelAddSeatMode : startAddSeatMode}
                    className={[
                      "pointer-events-auto ml-2 mt-2 inline-flex h-9 items-center rounded-xl border border-white/15 px-3 text-[11px] font-semibold shadow-[0_8px_18px_rgba(16,17,20,0.24),inset_0_1px_0_rgba(255,255,255,0.16)] backdrop-blur-md transition active:scale-[0.97] active:duration-75",
                      focusRingClass,
                      addSeatMode
                        ? "bg-[var(--admin-primary-soft)] text-[var(--admin-primary)]"
                        : "bg-[var(--admin-rail-bg)]/90 text-white/85 hover:bg-[var(--admin-rail-bg)] hover:text-white"
                    ].join(" ")}
                  >
                    {addSeatMode ? "Exit Add Seat" : "Add seat"}
                  </button>
                )}
              </div>
              <div
                ref={mapRef}
                className={mapFrameClassName}
                style={mapFrameStyle}
                onPointerDown={handleMapPointerDown}
                onPointerMove={handleMapPointerMove}
                onPointerUp={handleMapPointerUp}
                onPointerCancel={() => {
                  setDragState(null);
                  setMoveSeatMode(false);
                }}
              >
                <Image
                  src={MAP_IMAGE_SRC}
                  alt="Office floor plan"
                  width={MAP_IMAGE_WIDTH}
                  height={MAP_IMAGE_HEIGHT}
                  priority
                  unoptimized
                  className="block h-auto w-full select-none"
                  draggable={false}
                />

                <div className={mapMarkerLayerClassName}>
                  {localSeats.map(seat => {
                    const seatMatchesFilters = matchesFilters(seat);
                    const visualSeat = visualSeatById.get(seat.id) ?? seat;
                    const viewportPlacement = getMarkerViewportPlacement(visualSeat.x);

                    return (
                      <SeatMarker
                        key={seat.id}
                        seat={visualSeat}
                        selected={seat.id === selectedSeatId}
                        dimmed={!seatMatchesFilters}
                        canEdit={canEdit}
                        showNames={showNames}
                        searchResult={Boolean(search.trim()) && seatMatchesFilters}
                        draftChanged={draftChangedSeatLabelSet.has(seat.label)}
                        compactNameLabel={crowdedNameSeatIdSet.has(seat.id)}
                        moveSeatMode={moveSeatMode}
                        swapMode={Boolean(swapSourceSeatId)}
                        swapSource={seat.id === swapSourceSeatId}
                        swapTarget={seat.id === swapConfirm?.targetSeatId}
                        highlighted={plannerHighlightedSeatIdSet.has(seat.id)}
                        dragging={dragState?.seatId === seat.id}
                        addSeatMode={addSeatMode}
                        viewportEdge={viewportPlacement.edge}
                        viewportEdgeOffsetPx={viewportPlacement.offsetPx}
                        variant="admin"
                        onSelect={selectSeat}
                        onMovePointerDown={handleMovePointerDown}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {canEdit && (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-[11px] border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 py-2 lg:mt-0">
              <div className="min-w-0">
                <h2 id="admin-planning-canvas-title" className="truncate text-sm font-semibold text-[var(--admin-text-primary)]">
                  {filtersActive ? searchStatusTitle : "Planning canvas"}
                </h2>
                <p aria-label="Seat inventory summary" className="truncate text-xs font-medium text-[var(--admin-text-muted)]">
                  {filtersActive ? searchStatusSummary : (
                    <>
                      {stats.total} seats
                      <span className="mx-1 text-[var(--admin-text-subtle)]">·</span>
                      {stats.assigned} assigned
                      <span className="mx-1 text-[var(--admin-text-subtle)]">·</span>
                      {stats.available} open
                      <span className="mx-1 text-[var(--admin-text-subtle)]">·</span>
                      {stats.reserved} reserved
                      <span className="mx-1 text-[var(--admin-text-subtle)]">·</span>
                      {stats.unavailable} unavailable
                    </>
                  )}
                </p>
              </div>
              <div className="flex min-w-0 shrink-0 items-center gap-3">
                <ul aria-label="Seat status legend" className="hidden flex-wrap items-center gap-2 text-xs font-medium text-[var(--admin-text-secondary)] md:flex dock:hidden">
                  {SEAT_STATUS_LEGEND.filter(item => !item.draftOnly || legendCounts[item.key] > 0).map(item => (
                    <li key={item.key} className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[var(--admin-border)] bg-[var(--admin-surface-muted)] px-2.5 py-1">
                      <span className={["h-2 w-2 shrink-0 rounded-full", item.accentClass].join(" ")} aria-hidden="true" />
                      {item.label}
                      <span className="text-[var(--admin-text-subtle)]" aria-hidden="true">·</span>
                      <span className="font-semibold text-[var(--admin-text-primary)]">{legendCounts[item.key]}</span>
                    </li>
                  ))}
                </ul>
                {filtersActive && (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => fitSeatsInMap(matchingSeats)}
                      disabled={!matchingSeats.length}
                      aria-label={matchingSeats.length === 0 ? "Fit matches unavailable because there are no matching seats" : `Fit ${matchingSeats.length} matches on the map`}
                      title={matchingSeats.length === 0 ? "No matching seats to fit" : "Fit active search and filter results on the map"}
                      className={resultActionButtonClassName}
                    >
                      Fit matches
                    </button>
                    <button
                      type="button"
                      onClick={searchActive && structuredFiltersActive ? clearAllConstraints : searchActive ? clearSearch : clearStructuredFilters}
                      aria-label={searchActive && structuredFiltersActive ? "Clear all active search and filters" : searchActive ? "Clear search results" : "Clear filters"}
                      className={resultClearButtonClassName}
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </main>
      </div>
      </div>

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

      {deleteSeatConfirm && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[var(--sp-color-workspace-deep)]/45 p-3 backdrop-blur-[2px] sm:z-[70] sm:items-center">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-seat-confirm-title"
            aria-describedby="delete-seat-confirm-description"
            className="w-full max-w-md rounded-2xl border border-[var(--sp-color-border-subtle)] bg-[var(--sp-color-surface)]/95 p-4 text-[var(--sp-color-text-primary)] shadow-[0_26px_80px_rgba(23,26,29,0.32)] backdrop-blur-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="delete-seat-confirm-title" className="text-base font-semibold">Delete custom seat {deleteSeatConfirm.label}?</h2>
                <p id="delete-seat-confirm-description" className="mt-1 text-sm leading-5 text-[var(--sp-color-text-muted)]">
                  Only available custom draft seats can be deleted. Original seats are protected.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDeleteSeatConfirm(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold text-[var(--sp-color-text-muted)] transition hover:bg-[var(--sp-color-graphite-soft)] hover:text-[var(--sp-color-text-secondary)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus-ring-color)]"
                aria-label="Cancel custom seat deletion"
              >
                x
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-[var(--admin-state-danger-border)] bg-[var(--admin-state-danger-bg)] p-3 text-sm font-semibold leading-5 text-[var(--admin-state-danger-text)]">
              This removes custom draft seats only. Published maps are unchanged until you publish.
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button type="button" onClick={() => setDeleteSeatConfirm(null)} disabled={pending} className="w-full">
                Cancel
              </Button>
              <Button type="button" variant="danger" onClick={confirmDeleteSelectedSeat} disabled={pending} className="w-full !border-[var(--admin-danger)] !bg-[var(--admin-danger)] !text-white hover:!border-[var(--admin-danger)] hover:!bg-[var(--admin-danger)]">
                Delete seat
              </Button>
            </div>
          </section>
        </div>
      )}

      {publishReviewOpen && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[var(--admin-rail-bg)]/48 p-3 backdrop-blur-[2px] sm:z-50 sm:items-center">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="publish-review-title"
            aria-describedby="publish-review-description"
            className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-[24px] border border-[var(--admin-border)] bg-[var(--admin-surface)] p-4 text-[var(--admin-text-primary)] shadow-[0_30px_90px_rgba(23,26,29,0.34)] backdrop-blur-2xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-[var(--admin-border)] pb-3">
              <div>
                <h2 id="publish-review-title" className="text-base font-semibold">Review draft before publishing</h2>
                <p id="publish-review-description" className="mt-1 text-sm leading-5 text-[var(--admin-text-muted)]">
                  Confirm the saved draft changes before they become visible in the read-only viewer.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActionError(null);
                  setPublishReviewOpen(false);
                }}
                disabled={pending}
                className={["flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold text-[var(--admin-text-muted)] transition hover:bg-[var(--admin-state-neutral-bg)] hover:text-[var(--admin-text-secondary)] disabled:cursor-not-allowed disabled:opacity-40", focusRingClass].join(" ")}
                aria-label="Close publish review"
              >
                x
              </button>
            </div>

            <div className="min-h-0 overflow-y-auto py-4">
              {!publishSummary.hasChanges && (
                <p className="rounded-xl border border-[var(--admin-publish-no-change-border)] bg-[var(--admin-publish-no-change-bg)] p-3 text-sm font-semibold leading-5 text-[var(--admin-publish-no-change-text)]">
                  No draft changes to publish. The saved draft already matches the currently published viewer map.
                </p>
              )}

              {publishSummary.hasChanges && (
              <>
              <div className={["rounded-xl border p-3", publishSummary.hasChanges ? "border-[var(--admin-publish-ready-border)] bg-[var(--admin-publish-ready-bg)] text-[var(--admin-publish-ready-text)]" : "border-[var(--admin-publish-no-change-border)] bg-[var(--admin-publish-no-change-bg)] text-[var(--admin-publish-no-change-text)]"].join(" ")}>
                <StatusBadge tone={publishReadinessBadgeTone} className={["!min-h-0 !px-2 !py-0.5 !text-[11px] !font-semibold !tracking-wide", publishSummary.hasChanges ? "!bg-[var(--admin-surface)]/80 !text-[var(--admin-publish-ready-text)] !ring-[var(--admin-publish-ready-border)]" : "!bg-[var(--admin-surface)]/80 !text-[var(--admin-publish-no-change-text)] !ring-[var(--admin-publish-no-change-border)]"].join(" ")}>
                  {publishReadinessBadgeLabel}
                </StatusBadge>
                <h3 className="mt-2 text-sm font-semibold text-[var(--admin-text-primary)]">{publishReadinessTitle}</h3>
                <p className="mt-1 text-sm font-semibold leading-5">{publishReadinessDescription}</p>
              </div>

              <div className="mt-3 rounded-xl border border-[var(--admin-publish-viewer-impact-border)] bg-[var(--admin-publish-viewer-impact-bg)] p-3 text-[var(--admin-publish-viewer-impact-text)]">
                <div className="text-[11px] font-semibold">Viewer impact</div>
                <p className="mt-1 text-sm font-semibold leading-5 text-[var(--admin-text-secondary)]">
                  Publishing copies the saved draft map to the read-only viewer. Until you publish, viewers keep seeing the currently published map.
                </p>
              </div>

              {actionError && !pending && (
                <div role="alert" className="mt-3 rounded-xl border border-[var(--admin-state-error-border)] bg-[var(--admin-state-error-bg)] p-3 text-sm font-semibold leading-5 text-[var(--admin-state-error-text)]">
                  <StatusBadge tone="danger" className="!min-h-0 !bg-[var(--admin-surface)]/80 !px-2 !py-0.5 !text-[11px] !font-semibold !tracking-wide !text-[var(--admin-state-error-text)] !ring-[var(--admin-state-error-border)]">Error</StatusBadge>
                  <p className="mt-2">
                    <span className="font-semibold">Publish did not complete.</span> {actionError}
                  </p>
                </div>
              )}

              {pending && (
                <div role="status" aria-live="polite" className="mt-3 rounded-xl border border-[var(--admin-state-saving-border)] bg-[var(--admin-state-saving-bg)] p-3 text-sm font-semibold leading-5 text-[var(--admin-state-saving-text)]">
                  <StatusBadge tone="pending" className="!min-h-0 !bg-[var(--admin-surface)]/80 !px-2 !py-0.5 !text-[11px] !font-semibold !tracking-wide !text-[var(--admin-state-saving-text)] !ring-[var(--admin-state-saving-border)]">Publishing</StatusBadge>
                  <p className="mt-2">Publishing reviewed draft changes. Viewer map stays unchanged until publish finishes.</p>
                </div>
              )}

              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <PublishImpactCard label="People affected" value={publishPeopleChangeCount} description="Assignments and vacated seats." tone={publishPeopleChangeCount > 0 ? "warn" : "default"} />
                <PublishImpactCard label="Seat inventory" value={publishSeatInventoryChangeCount} description="Added and removed seats." tone={publishSeatInventoryChangeCount > 0 ? "warn" : "default"} />
                <PublishImpactCard label="Layout" value={publishLayoutChangeCount} description="Moved seat positions." tone={publishLayoutChangeCount > 0 ? "warn" : "default"} />
                <PublishImpactCard label="Metadata" value={publishMetadataChangeCount} description="Status, zone, label, notes, or custom flags." tone={publishMetadataChangeCount > 0 ? "warn" : "default"} />
              </div>

              <div className="mt-2 rounded-xl border border-[var(--admin-state-neutral-border)] bg-[var(--admin-surface)]/75 p-3 text-xs font-semibold leading-5 text-[var(--admin-text-muted)]">
                <span className="font-semibold text-[var(--admin-text-primary)]">Count note:</span> Impact groups can overlap. Use Total publish changes below as the unique publish-summary total.
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                <PublishCountCard label="Added" value={publishSummary.addedSeats.length} tone={publishSummary.addedSeats.length > 0 ? "warn" : "default"} />
                <PublishCountCard label="Updated" value={publishSummary.updatedSeatCount} tone={publishSummary.updatedSeatCount > 0 ? "warn" : "default"} />
                <PublishCountCard label="Removed" value={publishSummary.removedSeats.length} tone={publishSummary.removedSeats.length > 0 ? "warn" : "default"} />
              </div>

              <div className="mt-3 rounded-xl border border-[var(--admin-state-neutral-border)] bg-[var(--admin-state-neutral-bg)] p-3 text-xs font-semibold leading-5 text-[var(--admin-text-muted)]">
                <span className="font-semibold text-[var(--admin-text-primary)]">Draft:</span> {publishSummary.draftSeatCount} seats
                <span className="mx-2 text-[var(--admin-text-subtle)]">|</span>
                <span className="font-semibold text-[var(--admin-text-primary)]">Currently published:</span> {publishSummary.publishedSeatCount} seats
                <span className="mx-2 text-[var(--admin-text-subtle)]">|</span>
                <span className="font-semibold text-[var(--admin-text-primary)]">Total publish changes:</span> {publishSummary.totalChangeCount}
              </div>

              <div className="mt-3 grid gap-2 md:grid-cols-2">
                <PublishChangeList title="Added seats" items={publishSummary.addedSeats} emptyLabel="No added seats detected." />
                <PublishChangeList title="Removed seats" items={publishSummary.removedSeats} emptyLabel="No removed seats detected." />
                <PublishChangeList title="Assignment changes" items={publishSummary.assignmentChanges} emptyLabel="No assignment changes detected." />
                <PublishChangeList title="Vacated seats" items={publishSummary.vacatedSeats} emptyLabel="No vacated seats detected." />
                <PublishChangeList title="Seat moves/layout changes" items={publishSummary.seatMoves} emptyLabel="No seat moves detected." />
                <PublishChangeList title="Status changes" items={publishSummary.statusChanges} emptyLabel="No status-only changes detected." />
                <div className="md:col-span-2">
                  <PublishChangeList title="Other draft changes" items={publishSummary.otherChanges} emptyLabel="No other draft changes detected." />
                </div>
              </div>

              <div className="mt-3 rounded-xl border border-[var(--admin-state-dirty-border)] bg-[var(--admin-state-dirty-bg)] p-3 text-sm font-semibold leading-5 text-[var(--admin-state-dirty-text)]">
                Publishing updates the viewer map and clears Undo/Redo history after success. Use Cancel if you need to review, undo, or save more draft changes first.
              </div>
              </>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 border-t border-[var(--admin-border)] pt-3">
              <Button type="button" onClick={() => {
                setActionError(null);
                setPublishReviewOpen(false);
              }} disabled={pending} className={["w-full", focusRingClass].join(" ")}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={confirmPublishDraftMap}
                disabled={pending || !publishSummary.hasChanges}
                title={publishSummary.hasChanges ? "Publish reviewed draft changes" : "No draft changes to publish"}
                className={["w-full !border-[var(--admin-primary-cta)] !bg-[var(--admin-primary-cta)] !text-white hover:!border-[var(--admin-primary-hover)] hover:!bg-[var(--admin-primary-hover)] disabled:!border-[var(--admin-state-neutral-border)] disabled:!bg-[var(--admin-state-neutral-bg)] disabled:!text-[var(--admin-text-subtle)]", focusRingClass].join(" ")}
              >
                {pending ? "Publishing..." : actionError && publishSummary.hasChanges ? "Retry publish" : publishSummary.hasChanges ? (
                  <>
                    <span className="sm:hidden">Publish changes</span>
                    <span className="hidden sm:inline">Publish reviewed changes</span>
                  </>
                ) : "No changes to publish"}
              </Button>
            </div>
          </section>
        </div>
      )}

      {mapKeyPanelOpen && (
        <aside
          aria-labelledby="admin-map-key-title"
          className="fixed bottom-3 right-3 top-[84px] z-30 hidden w-[360px] flex-col overflow-y-auto rounded-[14px] border border-[var(--admin-border)] bg-[var(--admin-surface)] p-4 shadow-[0_18px_44px_rgba(31,34,37,0.16)] dock:flex lg:top-[148px]"
        >
          <h2 id="admin-map-key-title" className="text-sm font-semibold text-[var(--admin-text-primary)]">Map key</h2>
          <p className="mt-1 text-xs font-medium text-[var(--admin-text-muted)]">
            {stats.total} seats
            <span className="mx-1 text-[var(--admin-text-subtle)]">·</span>
            {stats.assigned} assigned
            <span className="mx-1 text-[var(--admin-text-subtle)]">·</span>
            {stats.available} open
          </p>
          <ul aria-label="Seat status map key" className="mt-3 space-y-2 text-xs font-medium text-[var(--admin-text-secondary)]">
            {SEAT_STATUS_LEGEND.filter(item => !item.draftOnly || legendCounts[item.key] > 0).map(item => (
              <li key={item.key} className="flex items-center justify-between gap-2 rounded-full border border-[var(--admin-border)] bg-[var(--admin-surface-muted)] px-3 py-1.5">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className={["h-2 w-2 shrink-0 rounded-full", item.accentClass].join(" ")} aria-hidden="true" />
                  <span className="truncate">{item.label}</span>
                </span>
                <span className="shrink-0 font-semibold text-[var(--admin-text-primary)]">{legendCounts[item.key]}</span>
              </li>
            ))}
          </ul>
          <p className="mt-auto pt-3 text-[11px] font-medium leading-5 text-[var(--admin-text-subtle)]">
            Search, or select a seat, to fill this panel with results or details.
          </p>
        </aside>
      )}

      {resultsPanelOpen && (
        <ResultsPanel
          results={panelResults}
          matchCount={matchingSeats.length}
          emptyTitle={resultEmptyTitle}
          emptyDescription={resultEmptyDescription}
          searchActive={searchActive}
          structuredFiltersActive={structuredFiltersActive}
          onOpen={selectSeatResult}
          onShowOnMap={queueCenterSeatInMap}
          onClearSearch={clearSearch}
          onClearFilters={clearStructuredFilters}
          onClearAll={clearAllConstraints}
        />
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
          if (selectedSeatId && inspectorDirty) {
            requestInspectorGuard({ kind: "close-inspector" });
            return;
          }
          applyCloseInspectorAction();
        }}
        onClearSearchContext={searchActive ? clearSearch : clearStructuredFilters}
        onToggleCollapse={() => setInspectorCollapsed(current => !current)}
        onStartSwapSeat={() => startSwapSeatMode()}
        onStartMoveSeat={() => {
          if (!selectedSeatId) return;
          if (inspectorDirty) {
            requestInspectorGuard({ kind: "start-move-seat" });
            return;
          }
          applyStartMoveSeatAction();
        }}
        moveMode={moveSeatMode}
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
          if (pendingInspectorSaveAction) {
            const action = pendingInspectorSaveAction;
            setPendingInspectorSaveAction(null);
            window.requestAnimationFrame(() => applyInspectorGuardAction(action));
          }
        }}
        onError={message => {
          setActionError(message);
          if (message) setActionNotice(null);
        }}
        onDirtyChange={setInspectorDirty}
        onSubmitBlocked={cancelPendingInspectorGuardAction}
        resetSignal={inspectorResetSignal}
      />

      {inspectorGuardAction && selectedSeat && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[var(--sp-color-workspace-deep)]/45 p-3 backdrop-blur-[2px] sm:z-[60] sm:items-center">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="inspector-unsaved-title"
            aria-describedby="inspector-unsaved-description"
            className="w-full max-w-md rounded-2xl border border-[var(--sp-color-border-subtle)] bg-[var(--sp-color-surface)]/95 p-4 text-[var(--sp-color-text-primary)] shadow-[0_26px_80px_rgba(23,26,29,0.32)] backdrop-blur-2xl"
          >
            <div>
              <h2 id="inspector-unsaved-title" className="text-base font-semibold">Unsaved seat edits</h2>
              <p id="inspector-unsaved-description" className="mt-1 text-sm leading-5 text-[var(--sp-color-text-muted)]">
                Save or discard changes to {selectedSeat.label} before {describeInspectorGuardAction(inspectorGuardAction)}
              </p>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <Button type="button" onClick={keepEditingInspector} disabled={pending} className="w-full">
                Keep editing
              </Button>
              <Button type="button" variant="danger" onClick={discardInspectorGuardEdits} disabled={pending} className="w-full">
                Discard
              </Button>
              <Button type="button" variant="primary" onClick={requestInspectorGuardSave} disabled={pending} className="w-full">
                Save changes
              </Button>
            </div>
          </section>
        </div>
      )}

      {swapConfirm && swapSourceSeat && swapTargetSeat && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[var(--sp-color-workspace-deep)]/45 p-3 backdrop-blur-[2px] sm:z-50 sm:items-center">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="swap-confirm-title"
            className="w-full max-w-md rounded-2xl border border-[var(--sp-color-border-subtle)] bg-[var(--sp-color-surface)]/95 p-4 text-[var(--sp-color-text-primary)] shadow-[0_26px_80px_rgba(23,26,29,0.32)] backdrop-blur-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="swap-confirm-title" className="text-base font-semibold">Confirm seat swap</h2>
                <p className="mt-1 text-sm leading-5 text-[var(--sp-color-text-muted)]">This updates draft seats only. Viewers will not see it until publish.</p>
              </div>
              <button
                type="button"
                onClick={() => setSwapConfirm(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold text-[var(--sp-color-text-muted)] transition hover:bg-[var(--sp-color-graphite-soft)] hover:text-[var(--sp-color-text-secondary)]"
                aria-label="Cancel swap confirmation"
              >
                x
              </button>
            </div>

            <div className="mt-4 grid gap-2">
              <div className="rounded-xl border border-[var(--sp-color-border-subtle)] bg-[var(--sp-color-graphite-soft)] p-3">
                <div className="text-[11px] font-semibold text-[var(--sp-color-text-muted)]">Source</div>
                <div className="mt-1 text-sm font-semibold text-[var(--sp-color-text-primary)]">{swapSourceSeat.label}</div>
                <div className="text-sm text-[var(--sp-color-text-muted)]">{seatPersonLabel(swapSourceSeat)}</div>
              </div>
              <div className="rounded-xl border border-[var(--sp-color-border-subtle)] bg-[var(--sp-color-graphite-soft)] p-3">
                <div className="text-[11px] font-semibold text-[var(--sp-color-text-muted)]">Target</div>
                <div className="mt-1 text-sm font-semibold text-[var(--sp-color-text-primary)]">{swapTargetSeat.label}</div>
                <div className="text-sm text-[var(--sp-color-text-muted)]">{seatPersonLabel(swapTargetSeat)}</div>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-[var(--admin-publish-viewer-impact-border)] bg-[var(--admin-publish-viewer-impact-bg)] p-3 text-sm font-semibold text-[var(--admin-publish-viewer-impact-text)]">
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
