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
import {
  MAP_IMAGE_HEIGHT,
  MAP_IMAGE_SRC,
  MAP_IMAGE_WIDTH,
  savedPointToVisualPoint,
  seatsToVisualSeats,
  visualPointToSavedPoint
} from "@/lib/mapLayoutTransform";
import { buildPublishChangeSummary, type PublishChangeItem } from "@/lib/publishSummary";
import { AdvancedDrawer } from "@/components/seat-map/AdvancedDrawer";
import { AskPlannerDrawer, type AskPlannerQueuedRequest } from "@/components/seat-map/AskPlannerDrawer";
import {
  ActiveFilterChips,
  FilterPanel,
  SeatResultsList,
  type ActiveFilterChip,
  type ResultStatusBreakdown,
  type SeatResultItem
} from "@/components/seat-map/FilterPanel";
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
    <div className={["rounded-xl border p-3", tone === "warn" ? "border-[var(--sp-color-state-draft-border)] bg-[var(--sp-color-state-draft-surface)]" : "border-[var(--sp-color-border-subtle)] bg-[var(--sp-color-graphite-soft)]"].join(" ")}>
      <div className={["text-[11px] font-black uppercase tracking-wide", tone === "warn" ? "text-[#6D4712]" : "text-[var(--sp-color-text-muted)]"].join(" ")}>{label}</div>
      <div className="mt-1 text-2xl font-black text-[var(--sp-color-text-primary)]">{value}</div>
    </div>
  );
}

function formatPublishChangeUnit(value: number) {
  return value === 1 ? "change" : "changes";
}

function PublishImpactCard({ label, value, description, tone = "default" }: { label: string; value: number; description: string; tone?: "default" | "warn" }) {
  return (
    <div className={["rounded-xl border p-3", tone === "warn" ? "border-[var(--sp-color-state-draft-border)] bg-[var(--sp-color-state-draft-surface)]" : "border-[var(--sp-color-border-subtle)] bg-white/80"].join(" ")}>
      <div className={["text-[11px] font-black uppercase tracking-wide", tone === "warn" ? "text-[#6D4712]" : "text-[var(--sp-color-text-muted)]"].join(" ")}>{label}</div>
      <div className="mt-1 flex items-end gap-2">
        <span className="text-2xl font-black text-[var(--sp-color-text-primary)]">{value}</span>
        <span className="pb-1 text-xs font-bold text-[var(--sp-color-text-muted)]">{formatPublishChangeUnit(value)}</span>
      </div>
      <p className="mt-1 text-xs font-semibold leading-4 text-[var(--sp-color-text-muted)]">{description}</p>
    </div>
  );
}

function PublishChangeList({ title, items, emptyLabel }: { title: string; items: PublishChangeItem[]; emptyLabel: string }) {
  const visibleItems = items.slice(0, 5);
  const remainingCount = Math.max(items.length - visibleItems.length, 0);

  return (
    <div className="rounded-xl border border-[var(--sp-color-border-subtle)] bg-white/80 p-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-black text-[var(--sp-color-text-primary)]">{title}</h3>
        <span className="rounded-full bg-[var(--sp-color-graphite-soft)] px-2 py-0.5 text-[11px] font-black text-[var(--sp-color-text-muted)] ring-1 ring-[var(--sp-color-border-subtle)]">{items.length}</span>
      </div>
      {items.length > 0 ? (
        <ul className="mt-2 space-y-1.5 text-xs leading-5 text-[var(--sp-color-text-muted)]">
          {visibleItems.map(item => (
            <li key={`${title}-${item.label}-${item.detail}`}>
              <span className="font-black text-[var(--sp-color-text-primary)]">{item.label}</span>
              {item.detail && <span> · {item.detail}</span>}
            </li>
          ))}
          {remainingCount > 0 && (
            <li className="font-bold text-[var(--sp-color-text-muted)]">+ {remainingCount} more</li>
          )}
        </ul>
      ) : (
        <p className="mt-2 text-xs font-semibold text-[var(--sp-color-text-muted)]">{emptyLabel}</p>
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
  const [resultRailCollapsed, setResultRailCollapsed] = useState(false);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [inspectorDirty, setInspectorDirty] = useState(false);
  const [inspectorGuardAction, setInspectorGuardAction] = useState<InspectorGuardAction | null>(null);
  const [pendingInspectorSaveAction, setPendingInspectorSaveAction] = useState<InspectorGuardAction | null>(null);
  const [searchSelectionNotice, setSearchSelectionNotice] = useState<string | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
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
  const mapToolsButtonRef = useRef<HTMLButtonElement | null>(null);
  const mapToolsMobileButtonRef = useRef<HTMLButtonElement | null>(null);
  const askPlannerButtonRef = useRef<HTMLButtonElement | null>(null);
  const autoSelectedSearchKeyRef = useRef<string | null>(null);

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

  const focusMapToolsButton = useCallback(() => {
    window.setTimeout(() => {
      const visibleTrigger = [mapToolsButtonRef.current, mapToolsMobileButtonRef.current]
        .find(button => button && button.offsetParent !== null);
      (visibleTrigger ?? mapToolsButtonRef.current ?? mapToolsMobileButtonRef.current)?.focus();
    }, 0);
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

  const toggleFilterPanel = useCallback(() => {
    setAdvancedOpen(false);
    setAskPlannerOpen(false);
    setResultRailCollapsed(false);
    setFilterCollapsed(current => !current);
  }, []);

  const openAdvancedDrawer = useCallback(() => {
    setFilterCollapsed(true);
    setResultRailCollapsed(true);
    setAskPlannerOpen(false);
    setAdvancedOpen(true);
  }, []);

  const openAskPlannerDrawer = useCallback(() => {
    setFilterCollapsed(true);
    setResultRailCollapsed(true);
    setAdvancedOpen(false);
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

      if (!isEditableTarget(event.target) && selectedSeatId) {
        if (inspectorDirty) {
          setInspectorGuardAction({ kind: "close-inspector" });
          setPendingInspectorSaveAction(null);
          setInspectorCollapsed(false);
          setActionNotice(null);
          setActionError(null);
          return;
        }
        setSelectedSeatId(null);
        setInspectorCollapsed(false);
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [addSeatMode, advancedOpen, askPlannerOpen, closeAdvancedDrawer, closeAskPlannerDrawer, deleteSeatConfirm, filterCollapsed, inspectorDirty, inspectorGuardAction, moveSeatMode, publishReviewOpen, selectedSeatId, swapConfirm, swapSourceSeatId]);

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
  const activeStructuredFilterChips = activeFilterChips.filter(chip => chip.id !== "search");
  const filtersActive = activeFilterCount > 0;
  const matchingSeats = filtersActive ? localSeats.filter(seat => matchesFilters(seat)) : localSeats;
  const singleResultSeat = filtersActive && matchingSeats.length === 1 ? matchingSeats[0] : null;
  const resultStatusBreakdown = useMemo<ResultStatusBreakdown>(() => ({
    available: matchingSeats.filter(seat => seat.status === "available").length,
    assigned: matchingSeats.filter(seat => seat.status === "assigned").length,
    reserved: matchingSeats.filter(seat => seat.status === "reserved").length,
    unavailable: matchingSeats.filter(seat => seat.status === "unavailable").length
  }), [matchingSeats]);
  const seatResults = useMemo<SeatResultItem[]>(() => matchingSeats.map(seat => ({
    id: seat.id,
    label: seat.label,
    person: seat.employee?.full_name ?? "Open seat",
    department: seat.employee?.department ?? seat.department ?? "No department",
    status: seat.status,
    zone: getSeatZone(seat) || "No zone",
    selected: seat.id === selectedSeatId
  })), [matchingSeats, selectedSeatId]);
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
    const departmentOk = department === "all" || seatDepartment === department;
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
    setSearchSelectionNotice(null);
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
    setSearchSelectionNotice(null);
    focusSeatMarker(seatIdToFocus);
  }

  function applyStartAddSeatAction() {
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

  function applyStartMoveSeatAction() {
    if (!selectedSeatId) return;
    setAddSeatMode(false);
    setSwapSourceSeatId(null);
    setSwapConfirm(null);
    setMoveSeatMode(current => !current);
    setAdvancedOpen(false);
  }

  function applyStartSwapSeatAction() {
    if (!selectedSeat) {
      setActionError("Select the source seat first, then choose Swap seat.");
      setActionNotice(null);
      setAdvancedOpen(false);
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
    setAdvancedOpen(false);
    setInspectorCollapsed(true);
  }

  function applyInspectorGuardAction(action: InspectorGuardAction) {
    if (action.kind === "select-seat") {
      commitSeatSelection(action.seatId);
      if (action.center) {
        setFilterCollapsed(true);
        queueCenterSeatInMap(action.seatId);
      }
      if (action.sourceLabel) {
        const seat = localSeats.find(item => item.id === action.seatId);
        if (seat) setSearchSelectionNotice(`Opened ${seat.label} from ${action.sourceLabel}.`);
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

  function clearStructuredFilters() {
    setDepartment("all");
    setZone("all");
    setStatus("all");
    setSearchSelectionNotice(null);
    setResultRailCollapsed(false);
  }

  function clearAllConstraints() {
    setSearch("");
    autoSelectedSearchKeyRef.current = null;
    clearStructuredFilters();
  }

  function clearSearch() {
    setSearch("");
    autoSelectedSearchKeyRef.current = null;
    setSearchSelectionNotice(null);
    setResultRailCollapsed(false);
  }

  function removeActiveFilterChip(chipId: string) {
    if (chipId === "search") {
      clearSearch();
      return;
    }

    if (chipId === "department") {
      setDepartment("all");
      setSearchSelectionNotice(null);
      return;
    }

    if (chipId === "zone") {
      setZone("all");
      setSearchSelectionNotice(null);
      return;
    }

    if (chipId === "status") {
      setStatus("all");
      setSearchSelectionNotice(null);
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
    setResultRailCollapsed(true);
    queueCenterSeatInMap(seatId);

    const seat = localSeats.find(item => item.id === seatId);
    if (seat) setSearchSelectionNotice(`Opened ${seat.label} from ${sourceLabel}.`);
  }

  function selectEmployeeSeat(seatId: string) {
    openSeatFromResults(seatId, "search result");
  }

  function selectSeatResult(seatId: string) {
    openSeatFromResults(seatId, "seat results");
  }

  useEffect(() => {
    if (!canEdit || !searchActive || !singleResultSeat) {
      if (!searchActive) autoSelectedSearchKeyRef.current = null;
      return;
    }

    const autoSelectKey = `${searchQuery}::${singleResultSeat.id}`;
    if (autoSelectedSearchKeyRef.current === autoSelectKey) return;
    const changingSelectedSeat = selectedSeatId !== singleResultSeat.id;
    if (selectedSeatId && changingSelectedSeat && inspectorDirty) return;

    autoSelectedSearchKeyRef.current = autoSelectKey;
    setSelectedSeatId(singleResultSeat.id);
    if (changingSelectedSeat) setInspectorDirty(false);
    setMoveSeatMode(false);
    setAddSeatMode(false);
    setSwapSourceSeatId(null);
    setSwapConfirm(null);
    setInspectorCollapsed(false);
    setFilterCollapsed(true);
    setResultRailCollapsed(true);
    setSearchSelectionNotice(`Auto-selected ${singleResultSeat.label} for "${searchQuery}".`);
    queueCenterSeatInMap(singleResultSeat.id);
  }, [canEdit, inspectorDirty, queueCenterSeatInMap, searchActive, searchQuery, selectedSeatId, singleResultSeat]);

  useEffect(() => {
    if (!canEdit || !searchActive || matchingSeats.length <= 1 || !selectedSeatId || selectedSeatMatchesFilters || inspectorDirty) return;
    setInspectorCollapsed(true);
  }, [canEdit, inspectorDirty, matchingSeats.length, searchActive, selectedSeatId, selectedSeatMatchesFilters]);

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

  function clearSelection() {
    if (selectedSeatId && inspectorDirty) {
      requestInspectorGuard({ kind: "clear-selection" });
      return;
    }
    applyClearSelectionAction();
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
      setActionError("Publish review blocked: Save or discard the selected seat edits before publishing. The publish review only includes saved draft changes.");
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
    setActionError(null);
    setActionNotice(null);
    startTransition(async () => {
      try {
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
  const mapResultContextLabel = searchActive && structuredFiltersActive
    ? "the current search and filters"
    : searchActive
      ? "the current search"
      : "the current filters";
  const resultStatusSummary = `${resultStatusBreakdown.assigned} assigned · ${resultStatusBreakdown.available} open · ${resultStatusBreakdown.reserved} reserved · ${resultStatusBreakdown.unavailable} unavailable`;
  const singleResultPerson = singleResultSeat?.employee?.full_name ?? "Open seat";
  const singleResultMeta = singleResultSeat
    ? `${STATUS_LABELS[singleResultSeat.status]} · ${getSeatZone(singleResultSeat) || "No zone"}`
    : "";
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
  const selectedResultIsVisible = Boolean(selectedSeat && filtersActive && selectedSeatMatchesFilters);
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
  const draftStatusHeadline = publishSummary.hasChanges ? "Draft has unpublished changes" : "Draft matches published";
  const draftStatusDescription = publishSummary.hasChanges
    ? `${draftChangeBreakdown || `${publishSummary.totalChangeCount} total changes`}. Review before publishing to viewers.`
    : "Viewer map already matches this saved draft.";
  const draftStatusActionLabel = publishSummary.hasChanges ? "Review publish" : "Review status";
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
  const planningStateLabel = activeMode
    ? `${activeMode.label} mode active`
    : filtersActive
      ? `${matchingSeats.length} draft seat${matchingSeats.length === 1 ? "" : "s"} match current search and filters`
      : selectedSeat
        ? `${selectedSeat.label} selected for planning`
        : "Ready to search, select, or adjust the draft map";
  const desktopMapGridClass = filterCollapsed ? "lg:grid-cols-[minmax(0,1fr)]" : "lg:grid-cols-[288px_minmax(0,1fr)]";
  const showFilterPanel = !filterCollapsed;
  const desktopInspectorOpen = canEdit && Boolean(selectedSeat && !inspectorCollapsed);
  const mobileMapInteractionSurfaceOpen = canEdit && (
    Boolean(selectedSeat && !inspectorCollapsed) ||
    showFilterPanel ||
    advancedOpen ||
    askPlannerOpen ||
    publishReviewOpen ||
    Boolean(deleteSeatConfirm) ||
    Boolean(inspectorGuardAction) ||
    Boolean(swapConfirm)
  );
  const mobileMapControlsHidden = mobileMapInteractionSurfaceOpen;
  const showSearchNoQueryHint = canEdit && searchFocused && !searchActive && !selectedSeatId && filterCollapsed && !advancedOpen && !askPlannerOpen;
  const filterPanelShellClass = [
    filterCollapsed ? "order-2" : "order-1",
    "lg:order-1",
    canEdit && filterCollapsed ? "lg:hidden" : "",
    !filterCollapsed ? "lg:min-h-0 lg:self-stretch lg:[&>aside]:h-full lg:[&>aside]:max-h-full lg:[&>aside]:top-0" : ""
  ].join(" ");
  const mapViewportClassName = [
    "relative mx-auto w-full max-w-full overscroll-contain rounded-[22px] border border-[var(--sp-color-border-strong)] bg-[var(--sp-color-map-workspace)] shadow-[0_18px_46px_rgba(23,26,29,0.16),inset_0_1px_0_rgba(255,255,255,0.78)] sm:rounded-[26px] lg:h-full lg:min-h-0 lg:flex-1 lg:max-h-none",
    mapViewMode === "overview"
      ? "min-h-[300px] overflow-hidden p-1.5 sm:min-h-[480px] sm:p-2 lg:flex lg:min-h-0 lg:items-center lg:justify-center"
      : "min-h-[360px] max-h-[82svh] overflow-auto sm:min-h-[520px] sm:max-h-[calc(100svh-62px)] lg:min-h-0 lg:max-h-none lg:[-ms-overflow-style:none] lg:[scrollbar-width:none] lg:[&::-webkit-scrollbar]:hidden",
    canEdit ? "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus-ring-color)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--sp-color-map-workspace)]" : ""
  ].join(" ");
  const mapFrameClassName = [
    "relative mx-auto max-w-none",
    mapViewMode === "overview" ? "w-full max-w-[1911px]" : "w-[1120px] sm:w-[1460px] lg:w-[1911px]",
    addSeatMode ? "cursor-crosshair" : ""
  ].join(" ");
  const mapFrameStyle = mapViewMode === "overview" && overviewMapWidth ? { width: `${overviewMapWidth}px` } : undefined;
  const resultSummaryShellClass = [
    "flex flex-col gap-2 border px-3 text-xs font-semibold transition lg:flex-row lg:items-center lg:justify-between",
    singleResultSeat
      ? "rounded-xl border-[var(--sp-color-state-search-border)] bg-[var(--sp-color-state-search-surface)] py-1.5 text-[#244E50] shadow-[0_8px_22px_rgba(23,26,29,0.08)]"
      : selectedResultIsVisible
      ? "rounded-xl border-[var(--sp-color-border-subtle)] bg-[var(--sp-color-graphite-soft)] text-[var(--sp-color-text-muted)] shadow-none"
      : "rounded-2xl border-[var(--sp-color-border-subtle)] bg-[var(--sp-color-surface-raised)]/90 py-2 text-[var(--sp-color-text-muted)] shadow-[0_12px_34px_rgba(23,26,29,0.10)] backdrop-blur-xl",
    desktopInspectorOpen ? "lg:mr-[23.5rem]" : ""
  ].filter(Boolean).join(" ");
  const singleResultOverlayShellClassName = [
    "pointer-events-none sticky left-0 right-0 top-12 z-30 flex h-0 w-full justify-center px-2 sm:top-2 sm:justify-end",
    mobileMapControlsHidden ? "hidden sm:flex" : "",
    desktopInspectorOpen ? "lg:pr-[23.5rem]" : ""
  ].filter(Boolean).join(" ");
  const singleResultOverlayClassName = [
    "pointer-events-auto flex w-[min(100%,22rem)] flex-col gap-2 rounded-xl border border-[var(--sp-color-state-search-border)] bg-[var(--sp-color-state-search-surface)]/95 px-2.5 py-2 text-xs font-semibold text-[#244E50] shadow-[0_14px_34px_rgba(23,26,29,0.18)] backdrop-blur-md sm:w-auto sm:min-w-[28rem] sm:max-w-[min(46rem,calc(100vw-11rem))] sm:flex-row sm:items-center sm:justify-between",
    desktopInspectorOpen ? "lg:min-w-0 lg:max-w-[min(36rem,calc(100vw-29rem))]" : ""
  ].filter(Boolean).join(" ");
  const mapModeOverlayShellClassName = [
    "pointer-events-none sticky left-0 top-0 z-30 h-0",
    mobileMapControlsHidden ? "hidden sm:block" : ""
  ].filter(Boolean).join(" ");
  const mapMarkerLayerClassName = [
    "absolute inset-0",
    mobileMapControlsHidden ? "hidden sm:block" : ""
  ].filter(Boolean).join(" ");
  const desktopResultRailClassName = [
    "hidden lg:block",
    desktopInspectorOpen ? "lg:mr-[23.5rem]" : ""
  ].filter(Boolean).join(" ");
  const resultActionButtonClassName = "inline-flex min-h-8 items-center justify-center rounded-lg border border-[var(--sp-color-border-strong)] bg-[var(--sp-color-surface-raised)] px-3 py-1.5 text-[11px] font-black text-[var(--sp-color-text-secondary)] transition hover:border-[var(--sp-color-brand-copper)] hover:bg-[var(--sp-color-brand-paper)] hover:text-[var(--sp-color-brand-clay)] active:scale-[0.97] active:duration-75 active:shadow-inner focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus-ring-color)] disabled:cursor-not-allowed disabled:opacity-50";
  const resultClearButtonClassName = "inline-flex min-h-8 items-center justify-center rounded-lg border border-[var(--sp-color-state-selected-border)] bg-[var(--sp-color-brand-paper)] px-3 py-1.5 text-[11px] font-black text-[var(--sp-color-brand-clay)] transition hover:bg-[#F3D1B9] active:scale-[0.97] active:duration-75 active:shadow-inner focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus-ring-color)]";
  const singleResultSummary = singleResultSeat ? (
    <>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="shrink-0 rounded-lg bg-[var(--sp-color-workspace)] px-2 py-1 text-[11px] font-black text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]">
          {singleResultSeat.label}
        </span>
        <span className="min-w-0 flex-1 truncate font-black text-[var(--sp-color-text-primary)]" aria-live="polite">
          {searchSelectionNotice ?? `${singleResultPerson} matches ${mapResultContextLabel}.`}
        </span>
        <span className="hidden shrink-0 truncate text-[11px] font-bold text-[#3E6F72] sm:inline">
          {singleResultMeta}
        </span>
      </div>
      <div className="flex shrink-0 flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => selectSeatResult(singleResultSeat.id)}
          className={resultActionButtonClassName}
        >
          Select
        </button>
        <button
          type="button"
          onClick={() => fitSeatsInMap([singleResultSeat])}
          aria-label="Fit one result on the map"
          title="Center the matching seat on the map"
          className={resultActionButtonClassName}
        >
          Fit result
        </button>
        <button
          type="button"
          onClick={searchActive && structuredFiltersActive ? clearAllConstraints : searchActive ? clearSearch : clearStructuredFilters}
          aria-label={searchActive && structuredFiltersActive ? "Clear all active search and filters" : searchActive ? "Clear search results" : "Clear filters"}
          className={resultClearButtonClassName}
        >
          {searchActive && structuredFiltersActive ? "Clear all" : searchActive ? "Clear search" : "Clear filters"}
        </button>
      </div>
    </>
  ) : null;
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

  return (
    <div className="min-h-screen overflow-x-hidden bg-[var(--sp-color-workspace-deep)] px-2 py-2 text-[var(--sp-color-text-primary)] sm:px-3 sm:py-3 lg:flex lg:h-screen lg:min-h-0 lg:flex-col lg:overflow-hidden">
      <div className="mx-auto flex w-full max-w-[1920px] flex-1 flex-col overflow-hidden rounded-[30px] border border-white/10 bg-[var(--sp-color-canvas)] shadow-[0_34px_110px_rgba(0,0,0,0.42)] lg:min-h-0">
        <header className="z-30 border-b border-[var(--sp-color-border-subtle)] bg-[var(--sp-color-surface)]/95 px-3 py-3 text-[var(--sp-color-text-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.88)] sm:px-4 lg:shrink-0">
          <div className="flex flex-col gap-2.5">
            <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-[minmax(240px,0.78fr)_minmax(300px,0.9fr)_minmax(460px,1.55fr)] lg:items-stretch">
              <section aria-label="Admin planning workspace" className="min-w-0 overflow-hidden rounded-[22px] border border-white/10 bg-[var(--sp-color-workspace)] px-3.5 py-3 text-white shadow-[0_18px_42px_rgba(23,26,29,0.18),inset_0_1px_0_rgba(255,255,255,0.12)]">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <h1 className="truncate text-lg font-black leading-tight tracking-normal">Office Seat Planner</h1>
                  <span className={["shrink-0 rounded-lg px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ring-1", canEdit ? "bg-[var(--sp-color-brand-ivory)] text-[var(--sp-color-brand-clay)] ring-white/20" : "bg-[var(--sp-color-state-published-surface)] text-[#284C3B] ring-white/20"].join(" ")}>
                    {canEdit ? "Draft" : "Published"}
                  </span>
                </div>
                <p className="mt-1 truncate text-[10px] font-bold uppercase leading-tight tracking-[0.18em] text-[var(--sp-color-brand-paper)]">{canEdit ? "Admin planning workspace" : "Viewer workspace"}</p>
                <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] font-black text-white/85">
                  <span className="rounded-full bg-white/10 px-2 py-1 ring-1 ring-white/15">{stats.total} seats</span>
                  <span className="rounded-full bg-[var(--sp-color-state-published-surface)] px-2 py-1 text-[#284C3B] ring-1 ring-white/20">{stats.assigned} assigned</span>
                  <span className="rounded-full bg-[var(--sp-color-surface)] px-2 py-1 text-[var(--sp-color-text-secondary)] ring-1 ring-white/20">{stats.available} open</span>
                </div>
              </section>

              {canEdit ? (
                <button
                  type="button"
                  onClick={openPublishReview}
                  aria-label={`Review ${draftStatusLabel.toLowerCase()}`}
                  title={draftStatusTitle}
                  className={["group flex min-w-0 flex-col items-start rounded-[22px] border px-3.5 py-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] transition hover:bg-[var(--sp-color-surface-raised)] active:scale-[0.99] active:duration-75 active:shadow-inner focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus-ring-color)]", publishSummary.hasChanges ? "border-[var(--sp-color-state-draft-border)] bg-[var(--sp-color-state-draft-surface)] text-[#6D4712]" : "border-[var(--sp-color-state-published-border)] bg-[var(--sp-color-state-published-surface)] text-[#284C3B]"].join(" ")}
                >
                  <span className="text-[10px] font-black uppercase tracking-[0.16em] opacity-70">Draft publication status</span>
                  <span className="mt-1 flex max-w-full items-center gap-2 text-sm font-black leading-tight">
                    <span className="min-w-0 truncate">{draftStatusHeadline}</span>
                    <span className={["shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ring-1", publishSummary.hasChanges ? "bg-white/75 text-[#6D4712] ring-[var(--sp-color-state-draft-border)]" : "bg-white/75 text-[#284C3B] ring-[var(--sp-color-state-published-border)]"].join(" ")}>
                      {draftStatusActionLabel}
                    </span>
                  </span>
                  <span className="mt-1 max-w-full truncate text-xs font-semibold opacity-75">{draftStatusDescription}</span>
                  <span className="sr-only">{draftStatusLabel}</span>
                </button>
              ) : (
                <section aria-label="Published status" className="rounded-[22px] border border-[var(--sp-color-state-published-border)] bg-[var(--sp-color-state-published-surface)] px-3.5 py-3 text-[#284C3B]">
                  <div className="text-[10px] font-black uppercase tracking-[0.16em] opacity-70">Published status</div>
                  <div className="mt-1 text-sm font-black">Published map</div>
                  <p className="mt-1 truncate text-xs font-semibold opacity-75">Read-only seating shown to viewers.</p>
                </section>
              )}

              <div role="group" aria-label="Primary workspace controls" className="flex min-w-0 flex-wrap items-center gap-2 rounded-[22px] border border-[var(--sp-color-border-subtle)] bg-[var(--sp-color-surface-raised)]/90 p-2 shadow-[0_12px_34px_rgba(23,26,29,0.08),inset_0_1px_0_rgba(255,255,255,0.92)] lg:content-start">
                <div className="flex min-w-0 flex-[1_1_100%] items-center justify-between gap-3 px-1">
                  <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--sp-color-brand-clay)]">Command search</span>
                  <span className="truncate text-[11px] font-bold text-[var(--sp-color-text-muted)]">{planningStateLabel}</span>
                </div>
                <label className="relative min-w-0 flex-[1_1_100%] sm:flex-1">
                  <span className="sr-only">Search employee, seat, job title, department, or zone</span>
                  <input
                    value={search}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setSearchFocused(false)}
                    onChange={event => {
                      setSearch(event.target.value);
                      setSearchSelectionNotice(null);
                      setResultRailCollapsed(false);
                    }}
                    placeholder="Search employee, seat, job title, department, or zone"
                    className="h-11 w-full rounded-[16px] border border-[var(--sp-color-border-strong)] bg-[var(--sp-color-surface)] px-4 pr-10 text-sm font-semibold text-[var(--sp-color-text-primary)] shadow-[0_8px_18px_rgba(23,26,29,0.07),inset_0_1px_0_rgba(255,255,255,0.92)] outline-none transition placeholder:text-[var(--sp-color-stone-muted)] focus:border-[var(--sp-color-brand-copper)] focus:bg-white focus:ring-4 focus:ring-[color:var(--sp-focus-ring-color)]"
                  />
                  {search.trim() && (
                    <button
                      type="button"
                      aria-label="Clear top search"
                      title="Clear top search"
                      className={[
                        "absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-xs font-black text-[var(--sp-color-text-muted)] transition hover:bg-[var(--sp-color-graphite-soft)] hover:text-[var(--sp-color-text-secondary)] active:scale-90",
                        focusRingClass
                      ].join(" ")}
                      onClick={clearSearch}
                    >
                      x
                    </button>
                  )}
                </label>
                <button
                  type="button"
                  onClick={toggleFilterPanel}
                  aria-controls="seat-map-filter-panel"
                  aria-expanded={!filterCollapsed}
                  aria-label={filterCollapsed ? "Open filters" : "Collapse filters"}
                  title={filterCollapsed ? "Open filters" : "Collapse filters"}
                  className={["inline-flex h-11 shrink-0 items-center gap-2 rounded-[16px] border px-3 text-xs font-black shadow-sm transition hover:bg-white active:scale-[0.97] active:duration-75 active:shadow-inner", focusRingClass, structuredFilterCount ? "border-[var(--sp-color-state-selected-border)] bg-[var(--sp-color-brand-paper)] text-[var(--sp-color-brand-clay)]" : "border-[var(--sp-color-border-subtle)] bg-[var(--sp-color-graphite-soft)] text-[var(--sp-color-text-secondary)]"].join(" ")}
                >
                  Filters
                  {structuredFilterCount > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--sp-color-action-primary)] px-1.5 text-[10px] font-black text-white">
                      {structuredFilterCount}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShowNames(current => !current)}
                  aria-label={namesToggleLabel}
                  title={namesToggleLabel}
                  className={[
                    "inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-[16px] border px-3 text-xs font-black shadow-sm transition active:scale-[0.97] active:duration-75 active:shadow-inner",
                    focusRingClass,
                    showNames ? "border-[var(--sp-color-workspace)] bg-[var(--sp-color-workspace)] text-white hover:bg-[var(--sp-color-workspace-deep)]" : "border-[var(--sp-color-border-subtle)] bg-[var(--sp-color-graphite-soft)] text-[var(--sp-color-text-secondary)] hover:bg-white"
                  ].join(" ")}
                >
                  <NamesIcon />
                  <span className="hidden sm:inline">{namesToggleLabel}</span>
                </button>
                {canEdit && (
                  <Button
                    ref={mapToolsMobileButtonRef}
                    variant="secondary"
                    aria-label="Map tools"
                    aria-controls="advanced-drawer"
                    aria-expanded={advancedOpen}
                    aria-haspopup="dialog"
                    title="Map tools"
                    className="h-11 min-h-11 rounded-[16px] px-3 py-1 text-xs shadow-sm sm:hidden"
                    onClick={openAdvancedDrawer}
                  >
                    Tools
                  </Button>
                )}
              </div>
            </div>

            {canEdit && (
              <div role="group" aria-label="Secondary admin actions" className="hidden min-w-0 flex-wrap items-center justify-between gap-2 rounded-[22px] border border-[var(--sp-color-border-subtle)] bg-[var(--sp-color-graphite-soft)]/80 p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.84)] sm:flex">
                <div role="group" aria-label="Planning map actions" className="flex min-w-0 items-center gap-1.5 rounded-[16px] bg-[var(--sp-color-surface-raised)]/80 px-1.5 py-1">
                  <span className="hidden shrink-0 px-1 text-[10px] font-black uppercase tracking-[0.16em] text-[var(--sp-color-text-muted)] md:inline">Plan</span>
                  <Button
                    ref={mapToolsButtonRef}
                    variant="secondary"
                    aria-label="Map tools"
                    aria-controls="advanced-drawer"
                    aria-expanded={advancedOpen}
                    aria-haspopup="dialog"
                    title="Map tools"
                    className="h-9 min-h-9 rounded-xl border-[var(--sp-color-border-strong)] px-3 py-1 text-xs shadow-sm"
                    onClick={openAdvancedDrawer}
                  >
                    <span className="min-[1200px]:hidden">Tools</span>
                    <span className="hidden min-[1200px]:inline">Map tools</span>
                  </Button>
                </div>

                <div role="group" aria-label="Draft history controls" className="flex min-w-0 items-center gap-1.5 rounded-[16px] bg-[var(--sp-color-surface-raised)]/80 px-1.5 py-1">
                  <span className="hidden shrink-0 px-1 text-[10px] font-black uppercase tracking-[0.16em] text-[var(--sp-color-text-muted)] md:inline">History</span>
                  <button
                    type="button"
                    className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-[var(--sp-color-border-subtle)] bg-[var(--sp-color-graphite-soft)] px-2.5 text-xs font-black text-[var(--sp-color-text-secondary)] shadow-sm transition hover:bg-white active:scale-[0.97] active:duration-75 active:shadow-inner focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus-ring-color)] disabled:cursor-not-allowed disabled:border-[var(--sp-color-border-subtle)] disabled:bg-[var(--sp-color-stone)] disabled:text-[var(--sp-color-text-disabled)] disabled:shadow-none"
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
                    className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-[var(--sp-color-border-subtle)] bg-[var(--sp-color-graphite-soft)] px-2.5 text-xs font-black text-[var(--sp-color-text-secondary)] shadow-sm transition hover:bg-white active:scale-[0.97] active:duration-75 active:shadow-inner focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus-ring-color)] disabled:cursor-not-allowed disabled:border-[var(--sp-color-border-subtle)] disabled:bg-[var(--sp-color-stone)] disabled:text-[var(--sp-color-text-disabled)] disabled:shadow-none"
                    disabled={pending || inspectorDirty || !redoAvailable}
                    aria-label="Redo last undone change"
                    title={redoTitle}
                    onClick={redoDraftEdit}
                  >
                    <RedoIcon />
                    <span className="hidden xl:inline">Redo</span>
                  </button>
                </div>

                <div role="group" aria-label="Admin support actions" className="flex min-w-0 items-center gap-1.5 rounded-[16px] bg-[var(--sp-color-surface-raised)]/80 px-1.5 py-1">
                  <span className="hidden shrink-0 px-1 text-[10px] font-black uppercase tracking-[0.16em] text-[var(--sp-color-text-muted)] md:inline">Support</span>
                  <Link
                    href="/admin/management"
                    onClick={event => {
                      if (!beforeManagementNavigation()) event.preventDefault();
                    }}
                    className="hidden min-h-9 items-center justify-center rounded-xl border border-[var(--sp-color-border-subtle)] bg-[var(--sp-color-graphite-soft)] px-3 text-xs font-semibold text-[var(--sp-color-text-secondary)] shadow-sm transition hover:border-[var(--sp-color-brand-copper)] hover:bg-[var(--sp-color-brand-paper)] hover:text-[var(--sp-color-brand-clay)] active:scale-[0.97] active:duration-75 active:shadow-inner focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sp-color-brand-copper)] sm:inline-flex"
                  >
                    <span className="min-[1280px]:hidden">Manage</span>
                    <span className="hidden min-[1280px]:inline">Management</span>
                  </Link>
                  <Button
                    ref={askPlannerButtonRef}
                    variant="secondary"
                    aria-label={plannerHighlightedSeatIds.length > 0 ? `Open Ask Planner, ${plannerHighlightedSeatIds.length} seats highlighted` : "Open Ask Planner"}
                    aria-controls="ask-planner-drawer"
                    aria-expanded={askPlannerOpen}
                    aria-haspopup="dialog"
                    className={[
                      "min-h-9 rounded-xl border-[var(--sp-color-border-strong)] px-3 py-1 text-xs shadow-sm",
                      plannerHighlightedSeatIds.length > 0 ? "border-[var(--sp-color-state-planner-border)] bg-[var(--sp-color-state-planner-surface)] text-[var(--sp-color-state-planner)] hover:bg-[#E5DDD2]" : ""
                    ].join(" ")}
                    onClick={openAskPlannerDrawer}
                  >
                    <span className="min-[1360px]:hidden">Ask</span>
                    <span className="hidden min-[1360px]:inline">Ask Planner</span>
                    {plannerHighlightedSeatIds.length > 0 && (
                      <span className="ml-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--sp-color-state-planner)] px-1.5 text-[10px] font-black text-white">
                        {plannerHighlightedSeatIds.length}
                      </span>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </header>

      <main className={["grid grid-cols-1 gap-2 bg-[var(--sp-color-map-workspace)] p-2 lg:min-h-0 lg:flex-1 lg:items-stretch lg:overflow-hidden", desktopMapGridClass].join(" ")}>
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
              activeChips={activeFilterChips}
              seatResults={seatResults}
              resultStatusBreakdown={resultStatusBreakdown}
              resultEmptyTitle={resultEmptyTitle}
              resultEmptyDescription={resultEmptyDescription}
              showSeatResults={canEdit && filtersActive && !singleResultSeat}
              onToggle={toggleFilterPanel}
              onEmployeeSelect={selectEmployeeSeat}
              onSeatResultSelect={selectSeatResult}
              onDepartmentChange={setDepartment}
              onZoneChange={setZone}
              onStatusChange={setStatus}
              onRemoveActiveChip={removeActiveFilterChip}
              onClearSearch={clearSearch}
              onClearFilters={clearStructuredFilters}
              onClearAll={clearAllConstraints}
            />
          </div>
        )}

        <section aria-labelledby="admin-planning-canvas-title" className={[filterCollapsed ? "order-1" : "order-2", "min-w-0 overflow-hidden rounded-[24px] border border-white/45 bg-[var(--sp-color-surface)]/55 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] lg:order-2 lg:flex lg:min-h-0 lg:flex-col lg:gap-2"].join(" ")}>
          {canEdit && (
            <div className="flex flex-col gap-2 rounded-[20px] border border-[var(--sp-color-border-subtle)] bg-[var(--sp-color-surface-raised)]/80 px-3 py-2 text-[var(--sp-color-text-secondary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h2 id="admin-planning-canvas-title" className="text-xs font-black uppercase tracking-[0.16em] text-[var(--sp-color-brand-clay)]">Planning canvas</h2>
                <p className="mt-0.5 truncate text-sm font-black text-[var(--sp-color-text-primary)]">{planningStateLabel}</p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-1.5 text-[10px] font-black uppercase tracking-wide">
                <StatusBadge tone="draft" className="!min-h-0 !px-2 !py-1 !text-[10px] !font-black !tracking-wide">Draft map</StatusBadge>
                <StatusBadge tone="info" className="!min-h-0 !px-2 !py-1 !text-[10px] !font-black !tracking-wide">Spatial confirmation</StatusBadge>
              </div>
            </div>
          )}

          {showSearchNoQueryHint && (
            <div className="rounded-2xl border border-[var(--sp-color-border-subtle)] bg-[var(--sp-color-surface-raised)]/80 px-3 py-2 text-xs font-semibold text-[var(--sp-color-text-muted)] shadow-none" role="status" aria-live="polite">
              <div className="font-black text-[var(--sp-color-text-primary)]">Search the draft map</div>
              <div className="mt-0.5 leading-5">Try a person, seat ID, job title, department, status, or zone. Search results stay draft-only in this admin workspace.</div>
            </div>
          )}

          {canEdit && (filtersActive || searchSelectionNotice) && !singleResultSeat && (
            <div className={resultSummaryShellClass}>
              <div className="min-w-0">
                {searchSelectionNotice && (
                  <div className="truncate font-black text-[var(--sp-color-brand-clay)]">{searchSelectionNotice}</div>
                )}
                {filtersActive && (
                  <>
                    <div className={searchSelectionNotice ? "mt-0.5 truncate text-[11px] text-[var(--sp-color-text-muted)]" : "truncate font-black text-[var(--sp-color-text-secondary)]"}>
                      {mapResultSummary} {mapResultVerb} {mapResultContextLabel}.
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-[var(--sp-color-text-muted)]">{resultStatusSummary}</div>
                    {activeStructuredFilterChips.length > 0 && (
                      <ActiveFilterChips chips={activeStructuredFilterChips} onRemove={removeActiveFilterChip} onClearAll={clearStructuredFilters} className={selectedResultIsVisible ? "mt-1.5" : "mt-2"} />
                    )}
                  </>
                )}
              </div>
              {filtersActive && (
                <div className={["flex shrink-0 flex-wrap", selectedResultIsVisible ? "gap-1.5" : "gap-2"].join(" ")}>
                  <button
                    type="button"
                    onClick={() => fitSeatsInMap(matchingSeats)}
                    disabled={!matchingSeats.length}
                    aria-label={matchingSeats.length === 0 ? "Fit results unavailable because there are no matching seats" : `Fit ${matchingSeats.length} results on the map`}
                    title={matchingSeats.length === 0 ? "No matching seats to fit" : "Fit active search and filter results on the map"}
                    className={resultActionButtonClassName}
                  >
                    Fit results
                  </button>
                  <button
                    type="button"
                    onClick={() => setResultRailCollapsed(current => !current)}
                    aria-expanded={!resultRailCollapsed}
                    aria-controls="seat-results-rail"
                    className={["hidden lg:inline-flex", resultActionButtonClassName].join(" ")}
                  >
                    {resultRailCollapsed ? "Show results" : "Hide results"}
                  </button>
                  <button
                    type="button"
                    onClick={searchActive && structuredFiltersActive ? clearAllConstraints : searchActive ? clearSearch : clearStructuredFilters}
                    aria-label={searchActive && structuredFiltersActive ? "Clear all active search and filters" : searchActive ? "Clear search results" : "Clear filters"}
                    className={resultClearButtonClassName}
                  >
                    {searchActive && structuredFiltersActive ? "Clear all" : searchActive ? "Clear search" : "Clear filters"}
                  </button>
                </div>
              )}
            </div>
          )}

          {canEdit && filtersActive && !singleResultSeat && !resultRailCollapsed && (
            <SeatResultsList
              id="mobile-seat-results-tray"
              titleId="mobile-seat-results-tray-title"
              results={seatResults}
              statusBreakdown={resultStatusBreakdown}
              emptyTitle={resultEmptyTitle}
              emptyDescription={resultEmptyDescription}
              searchActive={searchActive}
              filtersActive={structuredFiltersActive}
              onSelect={selectSeatResult}
              onClearSearch={clearSearch}
              onClearFilters={clearStructuredFilters}
              onClearAll={clearAllConstraints}
              onClose={() => setResultRailCollapsed(true)}
              density="rail"
              className="lg:hidden"
            />
          )}

          {canEdit && filtersActive && !singleResultSeat && !resultRailCollapsed && (
            <SeatResultsList
              id="seat-results-rail"
              titleId="seat-results-rail-title"
              results={seatResults}
              statusBreakdown={resultStatusBreakdown}
              emptyTitle={resultEmptyTitle}
              emptyDescription={resultEmptyDescription}
              searchActive={searchActive}
              filtersActive={structuredFiltersActive}
              onSelect={selectSeatResult}
              onClearSearch={clearSearch}
              onClearFilters={clearStructuredFilters}
              onClearAll={clearAllConstraints}
              density="rail"
              className={desktopResultRailClassName}
            />
          )}

          {activeMode && (
            <div role="status" aria-live="polite" className="flex flex-col gap-2 rounded-2xl border border-[var(--sp-color-state-selected-border)] bg-[var(--sp-color-brand-paper)]/90 px-3 py-2 text-xs font-semibold text-[var(--sp-color-brand-clay)] shadow-[0_12px_34px_rgba(194,65,12,0.14)] backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-wide text-[var(--sp-color-action-primary)]">{activeMode.label} mode</div>
                <div className="mt-0.5 truncate text-sm font-bold text-[var(--sp-color-text-primary)]">{activeMode.message}</div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <span className="rounded-full bg-white/75 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-[var(--sp-color-brand-clay)] ring-1 ring-[var(--sp-color-state-selected-border)]">Esc exits</span>
                <button type="button" onClick={activeMode.onExit} className="shrink-0 whitespace-nowrap rounded-full bg-white/75 px-3 py-1.5 text-[11px] font-black text-[var(--sp-color-brand-clay)] ring-1 ring-[var(--sp-color-state-selected-border)] transition hover:bg-white active:scale-[0.97] active:duration-75 active:shadow-inner focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus-ring-color)]">
                  {activeMode.exitLabel}
                </button>
              </div>
            </div>
          )}

          {actionError && (
            <div role="alert" className="whitespace-pre-wrap rounded-xl border border-[var(--sp-color-state-danger-border)] bg-[var(--sp-color-state-danger-surface)] px-3 py-2 text-sm font-semibold text-[#7E2F24]">
              {actionError}
            </div>
          )}

          {actionNotice && !swapSourceSeatId && (
            <div role="status" aria-live="polite" className="flex flex-col gap-2 rounded-xl border border-[var(--sp-color-state-success-border)] bg-[var(--sp-color-state-success-surface)] px-3 py-2 text-sm font-semibold text-[#284C3B] sm:flex-row sm:items-center sm:justify-between">
              <span>{actionNotice}</span>
              {canEdit && undoAvailable && lastUndoLabel && !pending && !inspectorDirty && (
                <button
                  type="button"
                  onClick={undoDraftEdit}
                  className="shrink-0 self-start rounded-full border border-[var(--sp-color-state-success-border)] bg-white/80 px-3 py-1 text-[11px] font-black text-[#284C3B] transition hover:bg-white active:scale-[0.97] active:duration-75 active:shadow-inner focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--sp-color-state-success-border)] sm:self-auto"
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
              {canEdit && singleResultSummary && (
                <div className={singleResultOverlayShellClassName} aria-label="Single search result">
                  <div className={singleResultOverlayClassName}>
                    {singleResultSummary}
                  </div>
                </div>
              )}
              <div className={mapModeOverlayShellClassName}>
                <div
                  role="group"
                  aria-label="Map view mode"
                  className="pointer-events-auto ml-2 mt-2 inline-flex rounded-xl border border-white/15 bg-[var(--sp-color-workspace)]/90 p-0.5 text-white shadow-[0_8px_18px_rgba(23,26,29,0.24),inset_0_1px_0_rgba(255,255,255,0.16)] backdrop-blur-md"
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
                          "h-8 rounded-lg px-2.5 text-[11px] font-black transition active:scale-[0.97] active:duration-75",
                          focusRingClass,
                          active ? "bg-[var(--sp-color-brand-ivory)] text-[var(--sp-color-brand-clay)] shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]" : "text-white/75 hover:bg-white/10 hover:text-white"
                        ].join(" ")}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
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
      </div>

      <AdvancedDrawer
        open={advancedOpen}
        seats={localSeats}
        employees={localEmployees}
        selectedSeat={selectedSeat}
        addSeatMode={addSeatMode}
        moveSeatMode={moveSeatMode}
        swapSeatMode={Boolean(swapSourceSeatId)}
        pending={pending}
        undoAvailable={!pending && !inspectorDirty && undoAvailable}
        redoAvailable={!pending && !inspectorDirty && redoAvailable}
        undoTitle={undoTitle}
        redoTitle={redoTitle}
        askPlannerHighlightCount={plannerHighlightedSeatIds.length}
        onClose={closeAdvancedDrawer}
        onUndo={undoDraftEdit}
        onRedo={redoDraftEdit}
        onOpenAskPlanner={openAskPlannerDrawer}
        onStartAddSeat={startAddSeatMode}
        onCancelAddSeat={cancelAddSeatMode}
        onStartSwapSeat={() => startSwapSeatMode()}
        onCancelSwapSeat={cancelSwapSeatMode}
        onToggleMoveSeat={() => {
          if (!selectedSeatId) return;
          if (inspectorDirty) {
            requestInspectorGuard({ kind: "start-move-seat" });
            return;
          }
          applyStartMoveSeatAction();
        }}
        onBeforeManagementNavigation={beforeManagementNavigation}
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
                <h2 id="delete-seat-confirm-title" className="text-base font-black">Delete custom seat {deleteSeatConfirm.label}?</h2>
                <p id="delete-seat-confirm-description" className="mt-1 text-sm leading-5 text-[var(--sp-color-text-muted)]">
                  Only available custom draft seats can be deleted. Original seats are protected.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDeleteSeatConfirm(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-black text-[var(--sp-color-text-muted)] transition hover:bg-[var(--sp-color-graphite-soft)] hover:text-[var(--sp-color-text-secondary)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus-ring-color)]"
                aria-label="Cancel custom seat deletion"
              >
                x
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-[var(--sp-color-state-selected-border)] bg-[var(--sp-color-brand-paper)] p-3 text-sm font-semibold leading-5 text-[var(--sp-color-brand-clay)]">
              This removes custom draft seats only. Published maps are unchanged until you publish.
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button type="button" onClick={() => setDeleteSeatConfirm(null)} disabled={pending} className="w-full">
                Cancel
              </Button>
              <Button type="button" variant="danger" onClick={confirmDeleteSelectedSeat} disabled={pending} className="w-full">
                Delete seat
              </Button>
            </div>
          </section>
        </div>
      )}

      {publishReviewOpen && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[var(--sp-color-workspace-deep)]/48 p-3 backdrop-blur-[2px] sm:z-50 sm:items-center">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="publish-review-title"
            aria-describedby="publish-review-description"
            className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-[24px] border border-[var(--sp-color-border-subtle)] bg-[var(--sp-color-surface)] p-4 text-[var(--sp-color-text-primary)] shadow-[0_30px_90px_rgba(23,26,29,0.34)] backdrop-blur-2xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-[var(--sp-color-border-subtle)] pb-3">
              <div>
                <h2 id="publish-review-title" className="text-base font-black">Review draft before publishing</h2>
                <p id="publish-review-description" className="mt-1 text-sm leading-5 text-[var(--sp-color-text-muted)]">
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
                className={["flex h-8 w-8 items-center justify-center rounded-full text-sm font-black text-[var(--sp-color-text-muted)] transition hover:bg-[var(--sp-color-graphite-soft)] hover:text-[var(--sp-color-text-secondary)] disabled:cursor-not-allowed disabled:opacity-40", focusRingClass].join(" ")}
                aria-label="Close publish review"
              >
                x
              </button>
            </div>

            <div className="min-h-0 overflow-y-auto py-4">
              <div className={["rounded-xl border p-3", publishSummary.hasChanges ? "border-[var(--sp-color-state-draft-border)] bg-[var(--sp-color-state-draft-surface)]" : "border-[var(--sp-color-state-published-border)] bg-[var(--sp-color-state-published-surface)]"].join(" ")}>
                <StatusBadge tone={publishReadinessBadgeTone} className="!min-h-0 !px-2 !py-0.5 !text-[11px] !font-black !tracking-wide">
                  {publishReadinessBadgeLabel}
                </StatusBadge>
                <h3 className="mt-2 text-sm font-black text-[var(--sp-color-text-primary)]">{publishReadinessTitle}</h3>
                <p className="mt-1 text-sm font-semibold leading-5 text-[var(--sp-color-text-secondary)]">{publishReadinessDescription}</p>
              </div>

              <div className="mt-3 rounded-xl border border-[var(--sp-color-state-info-border)] bg-[var(--sp-color-state-info-surface)] p-3">
                <div className="text-[11px] font-black uppercase tracking-wide text-[#244E50]">Viewer impact</div>
                <p className="mt-1 text-sm font-semibold leading-5 text-[var(--sp-color-text-secondary)]">
                  Publishing copies the saved draft map to the read-only viewer. Until you publish, viewers keep seeing the currently published map.
                </p>
              </div>

              {actionError && !pending && (
                <div role="alert" className="mt-3 rounded-xl border border-[var(--sp-color-state-danger-border)] bg-[var(--sp-color-state-danger-surface)] p-3 text-sm font-semibold leading-5 text-[#7E2F24]">
                  <StatusBadge tone="danger" className="!min-h-0 !px-2 !py-0.5 !text-[11px] !font-black !tracking-wide">Error</StatusBadge>
                  <p className="mt-2">
                    <span className="font-black">Publish did not complete.</span> {actionError}
                  </p>
                </div>
              )}

              {pending && (
                <div role="status" aria-live="polite" className="mt-3 rounded-xl border border-[var(--sp-color-state-info-border)] bg-[var(--sp-color-state-info-surface)] p-3 text-sm font-semibold leading-5 text-[#244E50]">
                  <StatusBadge tone="pending" className="!min-h-0 !px-2 !py-0.5 !text-[11px] !font-black !tracking-wide">Publishing</StatusBadge>
                  <p className="mt-2">Publishing reviewed draft changes. Viewer map stays unchanged until publish finishes.</p>
                </div>
              )}

              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <PublishImpactCard label="People affected" value={publishPeopleChangeCount} description="Assignments and vacated seats." tone={publishPeopleChangeCount > 0 ? "warn" : "default"} />
                <PublishImpactCard label="Seat inventory" value={publishSeatInventoryChangeCount} description="Added and removed seats." tone={publishSeatInventoryChangeCount > 0 ? "warn" : "default"} />
                <PublishImpactCard label="Layout" value={publishLayoutChangeCount} description="Moved seat positions." tone={publishLayoutChangeCount > 0 ? "warn" : "default"} />
                <PublishImpactCard label="Metadata" value={publishMetadataChangeCount} description="Status, zone, label, notes, or custom flags." tone={publishMetadataChangeCount > 0 ? "warn" : "default"} />
              </div>

              <div className="mt-2 rounded-xl border border-[var(--sp-color-border-subtle)] bg-white/75 p-3 text-xs font-semibold leading-5 text-[var(--sp-color-text-muted)]">
                <span className="font-black text-[var(--sp-color-text-primary)]">Count note:</span> Impact groups can overlap. Use Total publish changes below as the unique publish-summary total.
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                <PublishCountCard label="Added" value={publishSummary.addedSeats.length} tone={publishSummary.addedSeats.length > 0 ? "warn" : "default"} />
                <PublishCountCard label="Updated" value={publishSummary.updatedSeatCount} tone={publishSummary.updatedSeatCount > 0 ? "warn" : "default"} />
                <PublishCountCard label="Removed" value={publishSummary.removedSeats.length} tone={publishSummary.removedSeats.length > 0 ? "warn" : "default"} />
              </div>

              <div className="mt-3 rounded-xl border border-[var(--sp-color-border-subtle)] bg-[var(--sp-color-graphite-soft)] p-3 text-xs font-semibold leading-5 text-[var(--sp-color-text-muted)]">
                <span className="font-black text-[var(--sp-color-text-primary)]">Draft:</span> {publishSummary.draftSeatCount} seats
                <span className="mx-2 text-[var(--sp-color-stone-muted)]">|</span>
                <span className="font-black text-[var(--sp-color-text-primary)]">Currently published:</span> {publishSummary.publishedSeatCount} seats
                <span className="mx-2 text-[var(--sp-color-stone-muted)]">|</span>
                <span className="font-black text-[var(--sp-color-text-primary)]">Total publish changes:</span> {publishSummary.totalChangeCount}
              </div>

              {!publishSummary.hasChanges && (
                <div className="mt-3 rounded-xl border border-[var(--sp-color-state-success-border)] bg-[var(--sp-color-state-success-surface)] p-3 text-sm font-semibold text-[#284C3B]">
                  No draft changes to publish. The saved draft already matches the currently published viewer map.
                </div>
              )}

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

              <div className="mt-3 rounded-xl border border-[var(--sp-color-state-selected-border)] bg-[var(--sp-color-brand-paper)] p-3 text-sm font-semibold leading-5 text-[var(--sp-color-brand-clay)]">
                Publishing updates the viewer map and clears Undo/Redo history after success. Use Cancel if you need to review, undo, or save more draft changes first.
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 border-t border-[var(--sp-color-border-subtle)] pt-3">
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
                className={["w-full", focusRingClass].join(" ")}
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
              <h2 id="inspector-unsaved-title" className="text-base font-black">Unsaved seat edits</h2>
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
                <h2 id="swap-confirm-title" className="text-base font-black">Confirm seat swap</h2>
                <p className="mt-1 text-sm leading-5 text-[var(--sp-color-text-muted)]">This updates draft seats only. Viewers will not see it until publish.</p>
              </div>
              <button
                type="button"
                onClick={() => setSwapConfirm(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-black text-[var(--sp-color-text-muted)] transition hover:bg-[var(--sp-color-graphite-soft)] hover:text-[var(--sp-color-text-secondary)]"
                aria-label="Cancel swap confirmation"
              >
                x
              </button>
            </div>

            <div className="mt-4 grid gap-2">
              <div className="rounded-xl border border-[var(--sp-color-border-subtle)] bg-[var(--sp-color-graphite-soft)] p-3">
                <div className="text-[11px] font-black uppercase tracking-wide text-[var(--sp-color-text-muted)]">Source</div>
                <div className="mt-1 text-sm font-black text-[var(--sp-color-text-primary)]">{swapSourceSeat.label}</div>
                <div className="text-sm text-[var(--sp-color-text-muted)]">{seatPersonLabel(swapSourceSeat)}</div>
              </div>
              <div className="rounded-xl border border-[var(--sp-color-border-subtle)] bg-[var(--sp-color-graphite-soft)] p-3">
                <div className="text-[11px] font-black uppercase tracking-wide text-[var(--sp-color-text-muted)]">Target</div>
                <div className="mt-1 text-sm font-black text-[var(--sp-color-text-primary)]">{swapTargetSeat.label}</div>
                <div className="text-sm text-[var(--sp-color-text-muted)]">{seatPersonLabel(swapTargetSeat)}</div>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-[var(--sp-color-state-selected-border)] bg-[var(--sp-color-brand-paper)] p-3 text-sm font-semibold text-[var(--sp-color-brand-clay)]">
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
