"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SEAT_SEARCH_PLACEHOLDER } from "@/lib/viewerSeatSearch";
import { findSeatIdByParam, readSeatParam, withSeatParam } from "@/lib/deepLink";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import type { DepartmentOption, Employee, SeatStatus, SeatWithEmployee, ZoneOption } from "@/lib/types";
import { STATUS_LABELS } from "@/lib/types";
import { normalizeSeat } from "@/lib/seatNormalize";
import { cx } from "@/components/ui/design-system";

import {
  MAP_IMAGE_BLUR_DATA_URL,
  MAP_IMAGE_HEIGHT,
  MAP_IMAGE_SRC,
  MAP_IMAGE_WIDTH,
  seatsToVisualSeats
} from "@/lib/mapLayoutTransform";
// Aliased: `fitMapWidth` is already this component's state for the resolved width.
import {
  MAP_ZOOM_MAX,
  MAP_ZOOM_MIN,
  MAP_ZOOM_STEP,
  clampZoom,
  fitMapWidth as computeFitMapWidth
} from "@/lib/mapViewport";
import { arrowKeyToDirection, findNearestSeatInDirection, resolveRovingSeatId } from "@/lib/seatKeyboardNav";
import { buildViewerSeatSearch, searchHandsPanelToResults, type ViewerSearchResult } from "@/lib/viewerSeatSearch";
import { buildViewerPaletteBrowse, getSeatZone, zoneKey } from "@/lib/viewerFindPalette";
import { buildPositionOptions, seatMatchesPosition } from "@/lib/positions";
import { AccountMenu } from "@/components/ui/AccountMenu";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { ActiveFilterChips, FilterPanel, type ActiveFilterChip } from "@/components/seat-map/FilterPanel";
import { FloorPlaceholder, FloorSelector, type FloorId } from "@/components/seat-map/FloorSelector";
import { NamesVisibilityToggle } from "@/components/seat-map/NamesVisibilityToggle";
import { MapWashLayer } from "@/components/seat-map/MapWashLayer";
import { MapZoomControl } from "@/components/seat-map/MapZoomControl";
import { SeatInspector } from "@/components/seat-map/SeatInspector";
import { SeatMarker } from "@/components/seat-map/SeatMarker";
import { ViewerFindPalette } from "@/components/seat-map/ViewerFindPalette";
import { MapStatusBand } from "@/components/seat-map/MapStatusBand";
import { useInspectorNudge } from "@/components/seat-map/useInspectorNudge";
import { RESTING_PILL_GEOMETRY, TEXT_TIER_PILL_GEOMETRY, clearanceFromScale, computeCodePillNudges, computeNameLabelNudges, textTierActive } from "@/lib/seatCrowding";
import { buildOfficeRoomWashes, getOfficePlateLayout } from "@/lib/officeRoomWash";
import { buildZoneWash } from "@/lib/zoneWash";

type ViewerSeatFinderProps = {
  seats: SeatWithEmployee[];
  employees: Employee[];
  departmentOptions?: DepartmentOption[];
  zoneOptions?: ZoneOption[];
  // Only admins get the Admin chrome shortcut; for viewers it is a guaranteed
  // dead end, so the server page passes their role down as a render gate.
  showAdminShortcut?: boolean;
  // Pre-formatted "last publish" date from the server page (viewer-safe copy
  // for the old PUBLISHED/READ-ONLY badge pair).
  lastPublishedLabel?: string | null;
  // Signed-in identity for the account menu (email + role + sign out).
  accountEmail?: string | null;
  accountRoleLabel?: string;
};

type ViewerPanState = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startScrollLeft: number;
  startScrollTop: number;
  moved: boolean;
} | null;

// v12 slice 4 nudge (interaction contract #1): the `panel` tier minimum width
// (tailwind.config.ts) — the float exists only there. The viewer has no
// SeatMap-style seat-centering breakpoint constant of its own to reuse.
const VIEWER_PANEL_BREAKPOINT_PX = 900;

// Deliberately a separate key from the admin map's "seat-planner:names-visible":
// the surfaces are different densities and audiences, so one preference must
// not leak into the other's default.
const VIEWER_NAMES_VISIBLE_STORAGE_KEY = "seat-planner:viewer-names-visible";

// Keys the browser translates into native scrolling of the focused viewport
// (mirrors SeatMap.tsx's VIEWPORT_NATIVE_SCROLL_KEYS, fix commit 49dc74f).
// Native scroll fights an in-flight inspector nudge the same way wheel scroll
// does, so the viewport's onKeyDown cancels the tween for these — it never
// preventDefaults, so the native scroll/navigation itself is untouched.
const VIEWPORT_NATIVE_SCROLL_KEYS: ReadonlySet<string> = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "PageUp",
  "PageDown",
  "Home",
  "End",
  " "
]);

// Result title/subtitle identity segments (person names, seat codes) are
// already formatted for display by lib/viewerSeatSearch.ts at composition
// time — that is the single formatting point; do not re-format here (both
// formatters are idempotent, but one documented formatting point avoids
// double-formatting drift). Search matching there still operates on raw
// stored values, so this is display-only.

// View-transform zoom (same rule as the admin map): scales the rendered frame
// width only — never the stored coordinates or the calibration transform.
// MAP_ZOOM_MIN/MAX/STEP are imported from lib/mapViewport, single-sourced
// with the admin map's clamp bounds.

// getSeatZone is imported from lib/viewerFindPalette, where it is tested. It
// used to be a private copy here; the palette's zone chips need the same
// fallback chain, and two copies of it would drift the moment one changed.

function getSeatDepartment(seat: SeatWithEmployee) {
  return seat.employee?.department ?? seat.department ?? "No department";
}

function uniqueVisibleOptions(values: Array<string | null | undefined>) {
  const seen = new Map<string, string>();
  values.forEach(value => {
    const trimmed = value?.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) seen.set(key, trimmed);
  });
  return Array.from(seen.values()).sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

// The People directory's collapse preference is GONE with the panel it
// described (v12 Find palette, owner answer 4): the palette has no collapsed
// state to migrate it to, values already sitting in browsers are inert, and a
// mount-time sweep would mean carrying cleanup code forever for one dead
// boolean. Do not reintroduce `seat-planner:viewer-directory-collapsed`.

// Marker focus restore for deselect paths — the details panel (which may
// hold focus) unmounts with the selection (critique action 5).
function focusViewerSeatMarker(seatId: string | null) {
  if (!seatId) return;
  window.requestAnimationFrame(() => {
    document.querySelector<HTMLButtonElement>(`[data-seat-id="${seatId}"]`)?.focus();
  });
}

export function ViewerSeatFinder({
  seats,
  employees,
  departmentOptions = [],
  zoneOptions = [],
  showAdminShortcut = false,
  lastPublishedLabel = null,
  accountEmail = null,
  accountRoleLabel = "Viewer"
}: ViewerSeatFinderProps) {
  const [search, setSearch] = useState("");
  const [searchShortcutHint, setSearchShortcutHint] = useState("");
  // The ONE Find surface (v12 contract #2). It replaced four flags that used
  // to fight over the right column — directoryOpen / directoryCollapsed /
  // mobileDirectoryOpen / resultsPanelOpen — because it replaced the four
  // surfaces those flags gated. At rest it is closed and nothing docks
  // (contract #1); the field opens it, and its two modes (browse with an
  // empty query, results with one) share the same slot instead of racing for
  // it. Session-scoped by design: there is no persisted palette preference.
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [hoverSeatId, setHoverSeatId] = useState<string | null>(null);
  const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null);
  // Roving tabindex anchor: the last keyboard-visited seat (see SeatMap for
  // the same pattern — the map is one tab stop, arrows walk between seats).
  const [rovingSeatId, setRovingSeatId] = useState<string | null>(null);
  const focusInspectorAfterSelectRef = useRef(false);
  const [activeResultId, setActiveResultId] = useState<string | null>(null);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  // Legend-footer names toggle (parity with the admin map's control). Default
  // off, hydrated from localStorage after mount so SSR and first client render
  // agree; the hydrated flag keeps the persist effect from writing "false"
  // over a stored "true" before the read has happened.
  const [showNames, setShowNames] = useState(false);
  const [namesPreferenceHydrated, setNamesPreferenceHydrated] = useState(false);
  useEffect(() => {
    try {
      setShowNames(window.localStorage.getItem(VIEWER_NAMES_VISIBLE_STORAGE_KEY) === "true");
    } catch {
      // Ignore unavailable storage; the toggle still works for the current page.
    }
    setNamesPreferenceHydrated(true);
  }, []);
  useEffect(() => {
    if (!namesPreferenceHydrated) return;
    try {
      window.localStorage.setItem(VIEWER_NAMES_VISIBLE_STORAGE_KEY, showNames ? "true" : "false");
    } catch {
      // Ignore unavailable storage; this is a local UI preference only.
    }
  }, [namesPreferenceHydrated, showNames]);
  const [floor, setFloor] = useState<FloorId>("3");
  // Status-band tiers (Option A, owner call 2026-08-17): the band renders from
  // sm (640) up, and below the panel tier it yields to the inspector bottom
  // sheet. Desktop-first defaults keep SSR and the first client render in
  // agreement; the mount effect corrects both before interaction (same
  // read-after-mount pattern as the fit-width tiers below). JS state rather
  // than hidden/sm: classes because the band and the phone-only floating zoom
  // stack carry the SAME control roles — both mounted at once would be two
  // "Zoom in" buttons in the accessibility tree.
  const [bandTier, setBandTier] = useState(true);
  const [panelTier, setPanelTier] = useState(true);
  useEffect(() => {
    function updateBandTiers() {
      setBandTier(window.matchMedia("(min-width: 640px)").matches);
      setPanelTier(window.matchMedia(`(min-width: ${VIEWER_PANEL_BREAKPOINT_PX}px)`).matches);
    }

    updateBandTiers();
    window.addEventListener("resize", updateBandTiers);
    return () => window.removeEventListener("resize", updateBandTiers);
  }, []);
  // null = fit-to-view; a number = zoom factor applied to the base frame width.
  const [zoomFactor, setZoomFactor] = useState<number | null>(null);
  const [fitMapWidth, setFitMapWidth] = useState<number | null>(null);
  // Rendered map-frame width in CSS px (= pixels per normalized x unit),
  // observed off the frame element so fit and detail zoom share one source.
  const [mapRenderedWidth, setMapRenderedWidth] = useState<number | null>(null);
  const [panning, setPanning] = useState(false);
  const [department, setDepartment] = useState("all");
  const [position, setPosition] = useState("all");
  const [zone, setZone] = useState("all");
  // Zone chip preview (v12 contract #8) — parity with the admin map. Purely a
  // display cue: it decides what the map washes, never what is filtered.
  const [hoverZone, setHoverZone] = useState<string | null>(null);
  const [status, setStatus] = useState("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const mapViewportRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<HTMLDivElement | null>(null);

  // v12 slice 4 nudge (interaction contract #1): keeps the selected seat clear
  // of the floating inspector at the panel tier. Pan/zoom/wheel/programmatic
  // scroll paths below call cancelNudge() so a user- or code-initiated
  // scroll-position change always wins over an in-flight nudge tween. The
  // resolver reads visualSeatById via closure — safe even though that const is
  // declared further down, because the hook only ever invokes it from a
  // deferred rAF callback, well after this render has finished.
  const { cancelNudge, skipNextNudge } = useInspectorNudge({
    viewportRef: mapViewportRef,
    frameRef: mapRef,
    selectedSeatId,
    inspectorHidden: inspectorCollapsed,
    panelBreakpointPx: VIEWER_PANEL_BREAKPOINT_PX,
    resolveSeatVisualX: seatId => visualSeatById.get(seatId)?.x ?? null
  });
  const panStateRef = useRef<ViewerPanState>(null);
  const filterRootRef = useRef<HTMLDivElement | null>(null);
  const filterTriggerRef = useRef<HTMLButtonElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  // The field WRAPPER, not the input: the palette aligns its left edge to the
  // field's box (contract #2), and outside-click dismissal has to treat the
  // whole field — magnifier, clear button, kbd hint — as "inside".
  const searchFieldRef = useRef<HTMLDivElement | null>(null);
  const paletteRef = useRef<HTMLDivElement | null>(null);
  // One-shot: set when Escape hands focus back to the field from inside the
  // palette, consumed by the field's onFocus. Without it the hand-back is
  // indistinguishable from a user focusing the field, so onFocus re-opened the
  // palette in the same frame Escape closed it and Esc looked inert whenever
  // focus was on a row. A ref, not state: it must be readable by the focus
  // handler that `.focus()` dispatches synchronously, before any re-render.
  const suppressPaletteReopenRef = useRef(false);

  const publishedSeats = useMemo(() => seats.map(normalizeSeat), [seats]);
  const visualSeats = useMemo(() => seatsToVisualSeats(publishedSeats), [publishedSeats]);
  const visualSeatById = useMemo(() => new Map(visualSeats.map(seat => [seat.id, seat])), [visualSeats]);
  // Pill crowding at the live rendered scale (render-layer only, parity with
  // the admin map): code pills render at one uniform size, and the crowded
  // set feeds alternating vertical token nudges that keep tight pods from
  // overlapping (hover still discloses the full code + name). The clearance
  // must track the actual frame width: a static fit-zoom clearance under-flags
  // exactly the pods that collide at any narrower scale, and they then render
  // physically overlapping pills. That used to bite at REST, because the
  // docked People directory held ~330px of the stage; the Find palette floats,
  // so the viewer rests full-bleed now and the narrow scales are the small
  // windows and the fixed-width mobile frame instead. Before first measure
  // (SSR/first paint) the helper falls back to the default fit-zoom clearance.
  //
  // PR-2 text tier: derived from the SAME live scale — labels are marks below
  // the collision threshold and 12px text at or above it, with the threshold
  // computed from the actual seat set (no hardcoded frame width; add seats
  // that tighten pitch and the tier retreats by construction). The ref
  // carries the deadband: fit mode makes the frame width CONTINUOUS under
  // window resize, so textTierActive holds an entered tier across a
  // jitter-sized slack band instead of flapping at the boundary.
  const textTierWasActiveRef = useRef(false);
  const textTier = useMemo(
    () => textTierActive(
      visualSeats,
      mapRenderedWidth ?? 0,
      (mapRenderedWidth ?? 0) * (MAP_IMAGE_HEIGHT / MAP_IMAGE_WIDTH),
      textTierWasActiveRef.current
    ),
    [mapRenderedWidth, visualSeats]
  );
  textTierWasActiveRef.current = textTier;
  // Whenever the tier is on, the nudge scorers model the text-tier footprints
  // — the pills actually on screen — instead of the resting-mark geometry.
  const seatPillGeometry = textTier ? TEXT_TIER_PILL_GEOMETRY : RESTING_PILL_GEOMETRY;
  const seatDensityClearance = useMemo(
    () => clearanceFromScale(mapRenderedWidth ?? 0, (mapRenderedWidth ?? 0) * (MAP_IMAGE_HEIGHT / MAP_IMAGE_WIDTH), seatPillGeometry.clearancePx),
    [mapRenderedWidth, seatPillGeometry]
  );
  // Pixel-aspect points for arrow-key traversal (see lib/seatKeyboardNav).
  const seatNavPoints = useMemo(
    () => visualSeats.map(seat => ({ id: seat.id, x: seat.x * MAP_IMAGE_WIDTH, y: seat.y * MAP_IMAGE_HEIGHT })),
    [visualSeats]
  );
  const mapRovingSeatId = resolveRovingSeatId(seatNavPoints, selectedSeatId ?? rovingSeatId);
  const seatById = useMemo(() => new Map(publishedSeats.map(seat => [seat.id, seat])), [publishedSeats]);
  const searchResults = useMemo(
    () => buildViewerSeatSearch({ query: search, seats: publishedSeats, employees, departmentOptions, zoneOptions }),
    [departmentOptions, employees, publishedSeats, search, zoneOptions]
  );
  const activeResult = searchResults.results.find(result => result.id === activeResultId) ?? null;
  // The palette's browse feed: zone chips with counts, the A→Z people list,
  // and the "N people · M seated" line, assembled by the tested lib module
  // from the SAME published snapshot the map reads. Computed whether or not
  // the palette is open — it is a memo over props, and gating it on
  // `paletteOpen` would only move the work into the frame that opens it.
  const paletteBrowse = useMemo(
    () => buildViewerPaletteBrowse({ seats: publishedSeats, employees, zoneOptions }),
    [employees, publishedSeats, zoneOptions]
  );

  // Keyboard activation of a seat hands focus into the details panel once the
  // selection commits; pointer interactions cancel the handoff.
  useEffect(() => {
    if (!focusInspectorAfterSelectRef.current) return;
    focusInspectorAfterSelectRef.current = false;
    if (!selectedSeatId) return;
    window.requestAnimationFrame(() => {
      document.getElementById("seat-inspector-panel")?.focus();
    });
  }, [selectedSeatId]);
  const selectedSeat = selectedSeatId ? seatById.get(selectedSeatId) ?? null : null;

  // Arrow-key roving over the palette's rows lives in ViewerFindPalette: both
  // handlers have to reach the list window's absolute indices, and the browse
  // list owns that window. They still exit ArrowUp to searchInputRef, which is
  // why the palette takes it as a prop.

  const searchActive = Boolean(searchResults.query);
  const structuredFiltersActive = department !== "all" || position !== "all" || zone !== "all" || status !== "all";
  const structuredFilterCount = [department !== "all", position !== "all", zone !== "all", status !== "all"].filter(Boolean).length;
  const filtersActive = searchActive || structuredFiltersActive;

  const seatPassesStructuredFilters = useCallback((seat: SeatWithEmployee) => {
    const departmentOk = department === "all" || getSeatDepartment(seat).toLowerCase() === department.toLowerCase();
    const positionOk = seatMatchesPosition(seat.employee?.position, position);
    // zoneKey on BOTH sides, not raw ===: the palette's chips aggregate on
    // that key and render the first spelling seen, so a chip built from an
    // active zone option could count a seat whose own `zone` differs only in
    // case or padding — and then filter that same seat out when pinned.
    const zoneOk = zone === "all" || zoneKey(getSeatZone(seat)) === zoneKey(zone);
    const statusOk = status === "all" || seat.status === (status as SeatStatus);
    return departmentOk && positionOk && zoneOk && statusOk;
  }, [department, position, status, zone]);

  const resultSeatIdSet = useMemo(() => new Set(searchResults.resultSeatIds), [searchResults.resultSeatIds]);
  const activeResultSeatIdSet = useMemo(() => new Set(activeResult?.seatIds ?? []), [activeResult]);
  // Matches = search hits (narrowed by any structured filters), or filter hits alone.
  const highlightedSeatIdSet = useMemo(() => {
    const base = activeResultSeatIdSet.size > 0 ? activeResultSeatIdSet : resultSeatIdSet;
    const matched = new Set<string>();
    publishedSeats.forEach(seat => {
      const searchOk = !searchActive || base.has(seat.id);
      if (searchOk && seatPassesStructuredFilters(seat)) matched.add(seat.id);
    });
    return matched;
  }, [activeResultSeatIdSet, publishedSeats, resultSeatIdSet, searchActive, seatPassesStructuredFilters]);

  // Named set for the nudge graphs = exactly the seats that render a
  // name/prominent TOKEN, mirroring the marker loop's props through
  // SeatMarker's logic: searchProminent = searchResult && !dimmed, and both
  // reduce to `filtersActive && highlightedSeatIdSet.has(id)` here (raw
  // search hits that an active result card or structured filter dims render
  // plain CODE pills — they must stay in the code graph and keep their
  // codeNudge, not be modelled as phantom name obstacles). The selected seat
  // is excluded: active markers never nudge, so leaving it in would occupy a
  // palette slot/clique edge it never uses (the admin map's phantom-member
  // fix). The transient palette-hover highlight is also excluded — it is
  // momentary and z-raised, and including it would re-solve both nudge
  // graphs on every list hover.
  const namedSeatIdSet = useMemo(() => {
    const set = filtersActive ? new Set(highlightedSeatIdSet) : new Set<string>();
    if (showNames) {
      // The legend toggle lights every occupied seat's name — but only where
      // SeatMarker will actually render it: namesVisible is gated on !dimmed,
      // and under active filters the non-matching seats are dimmed, so the
      // toggle adds nothing beyond the highlighted set there.
      visualSeats.forEach(seat => {
        if (seat.employee && (!filtersActive || set.has(seat.id))) set.add(seat.id);
      });
    }
    if (selectedSeatId) set.delete(selectedSeatId);
    return set;
  }, [filtersActive, highlightedSeatIdSet, selectedSeatId, showNames, visualSeats]);
  // Office room wash, published layer (parity with the admin map — the
  // 2026-07-24 publish check caught the viewer missing it entirely). Dim and
  // search-highlight sets mirror the marker loop's own predicates below; the
  // viewer has no swap/drag modes, so those wash rules never engage here.
  const officeRoomWashes = useMemo(() => {
    const dimmedSeatIds = filtersActive
      ? new Set(visualSeats.filter(seat => !highlightedSeatIdSet.has(seat.id) && seat.id !== selectedSeatId).map(seat => seat.id))
      : undefined;
    return buildOfficeRoomWashes({
      seats: visualSeats.map(seat => ({ id: seat.id, x: seat.x, y: seat.y, status: seat.status })),
      dimmedSeatIds,
      searchActiveSeatIds: filtersActive ? highlightedSeatIdSet : undefined
    });
  }, [filtersActive, highlightedSeatIdSet, selectedSeatId, visualSeats]);
  // Zone hover-wash: the hovered chip wins over the pinned zone filter, so
  // running along the chip row previews each zone without changing what is
  // filtered. Visual seats — the box must frame the markers as rendered.
  const zoneWash = useMemo(
    () => buildZoneWash(hoverZone ?? (zone !== "all" ? zone : null), visualSeats),
    [hoverZone, visualSeats, zone]
  );
  // Name-label collision nudges (render-layer only): prominent tokens plus,
  // with the legend's Show-names toggle on, every visible occupant name —
  // nudged at the same live zoom-aware clearance as the code graph (parity
  // with the admin map).
  const nameLabelNudges = useMemo(
    () => computeNameLabelNudges(visualSeats, namedSeatIdSet, seatDensityClearance),
    [namedSeatIdSet, seatDensityClearance, visualSeats]
  );
  // Code-pill nudges are computed AFTER the name nudges so the code graph
  // can dodge the rows the name pills actually occupy (named seats render
  // name/prominent tokens, not code pills).
  const codePillNudges = useMemo(
    () => computeCodePillNudges(visualSeats, seatDensityClearance, { nameNudges: nameLabelNudges, namedSeatIds: namedSeatIdSet, geometry: seatPillGeometry }),
    [nameLabelNudges, namedSeatIdSet, seatDensityClearance, seatPillGeometry, visualSeats]
  );

  const selectedResultTitle = activeResult?.title ?? selectedSeat?.label ?? null;
  // Legend counts follow the active filters — the one number row everyone
  // reads must not contradict a filtered map (2026-07-16 regrade, review 4).
  const statusCountSeats = structuredFiltersActive ? publishedSeats.filter(seatPassesStructuredFilters) : publishedSeats;
  const assignedCount = statusCountSeats.filter(seat => seat.status === "assigned").length;
  const openCount = statusCountSeats.filter(seat => seat.status === "available").length;
  const reservedCount = statusCountSeats.filter(seat => seat.status === "reserved").length;
  const departments = uniqueVisibleOptions([
    ...departmentOptions.filter(option => option.active).map(option => option.name),
    ...employees.filter(employee => employee.active).map(employee => employee.department)
  ]);
  // Positions come off the published_employees snapshot the viewer already
  // holds — same publish cadence as every other person detail here.
  const positions = buildPositionOptions(employees);
  const zones = uniqueVisibleOptions([
    ...zoneOptions.filter(option => option.active).map(option => option.name),
    ...publishedSeats.map(seat => getSeatZone(seat))
  ]);

  useEffect(() => {
    if (!activeResultId) return;
    if (!searchResults.results.some(result => result.id === activeResultId)) setActiveResultId(null);
  }, [activeResultId, searchResults.results]);

  useEffect(() => {
    if (!selectedSeatId) return;
    if (!seatById.has(selectedSeatId)) setSelectedSeatId(null);
  }, [seatById, selectedSeatId]);

  useEffect(() => {
    if (!filterOpen) return;

    function handleOutsidePointer(event: globalThis.PointerEvent) {
      if (filterRootRef.current?.contains(event.target as Node)) return;
      setFilterOpen(false);
    }

    document.addEventListener("pointerdown", handleOutsidePointer);
    return () => document.removeEventListener("pointerdown", handleOutsidePointer);
  }, [filterOpen]);

  // Outside click closes the palette (contract #2). The FIELD counts as
  // inside: a press there is how you open it, so treating it as outside would
  // make the pointerdown close what the click is about to reopen.
  useEffect(() => {
    if (!paletteOpen) return;

    function handleOutsidePointer(event: globalThis.PointerEvent) {
      const target = event.target as Node;
      if (paletteRef.current?.contains(target)) return;
      if (searchFieldRef.current?.contains(target)) return;
      setPaletteOpen(false);
    }

    document.addEventListener("pointerdown", handleOutsidePointer);
    return () => document.removeEventListener("pointerdown", handleOutsidePointer);
  }, [paletteOpen]);

  // Ctrl/⌘+K focuses the search AND opens the palette (contract #2) — the same
  // muscle memory as the admin map (critique action 6). The hint renders a
  // frame after mount so the server markup never guesses the platform.
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setSearchShortcutHint(/mac/i.test(window.navigator.platform) ? "⌘K" : "Ctrl K");
    });
    const handleSearchShortcut = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener("keydown", handleSearchShortcut);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", handleSearchShortcut);
    };
  }, []);

  // Esc peels ONE layer per press, in the order the v12 handoff specifies
  // (contract #7): floor menu → palette → query → selection → pinned zone.
  // Query moved AHEAD of selection here — under the retired design the panel
  // and the inspector fought for one column, so dismissing the selection
  // first was what gave the results room; the palette floats, so the honest
  // order is now "put back the transient thing you typed, then the thing you
  // picked". The floor menu owns its own Escape inside FloorSelector; the
  // Filter popover is this surface's other menu and stays the first layer.
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (filterOpen) {
        setFilterOpen(false);
        return;
      }
      const target = event.target;
      if (paletteOpen) {
        // Focus is about to be unmounted along with the palette if it was
        // inside one of its rows — hand it back to the field rather than
        // letting it fall to <body> (critique action 5).
        if (target instanceof Node && paletteRef.current?.contains(target)) {
          suppressPaletteReopenRef.current = true;
          window.requestAnimationFrame(() => {
            searchInputRef.current?.focus();
            // Cleared unconditionally: `.focus()` dispatches onFocus
            // synchronously, so a consumer has already run by here, and if the
            // field is gone the flag must not survive to swallow a later,
            // unrelated focus.
            suppressPaletteReopenRef.current = false;
          });
        }
        setPaletteOpen(false);
        return;
      }
      const editable = target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement;
      if (!editable && search.trim()) {
        setSearch("");
        return;
      }
      if (selectedSeatId) {
        focusViewerSeatMarker(selectedSeatId);
        setSelectedSeatId(null);
        setInspectorCollapsed(false);
        return;
      }
      if (!editable && structuredFiltersActive) {
        // clearStructuredFilters(), not three hand-written setters: this branch
        // fires when structuredFiltersActive is true, and that flag counts
        // POSITION too — so the open-coded trio left a position-only filter
        // pinned while Escape reported itself as having cleared the layer, and
        // any future facet would have inherited the same silent gap.
        clearStructuredFilters();
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [filterOpen, paletteOpen, search, selectedSeatId, structuredFiltersActive]);

  // Contain-fit for the fit view, three tiers by viewport width:
  //  - >=1024 (lg): both-dimension contain-fit (same pattern as SeatMap's
  //    overview) — the frame width follows BOTH viewport dimensions, so a
  //    squat viewport no longer leaves a dead band under the plan.
  //  - 640-1023 (sm..lg, tablet widths): width-only fit — the frame is sized
  //    to the viewport's own width, so there is no default horizontal
  //    scrollbar/dead band at tablet widths; frame height just follows the
  //    image aspect ratio.
  //  - <640: width stays null — the fixed mobile frame width (horizontal
  //    scroll by design) stays in charge.
  useEffect(() => {
    const viewport = mapViewportRef.current;
    if (!viewport) return;
    const viewportElement = viewport;

    function updateFitMapWidth() {
      if (!window.matchMedia("(min-width: 640px)").matches) {
        setFitMapWidth(null);
        return;
      }
      if (!window.matchMedia("(min-width: 1024px)").matches) {
        setFitMapWidth(Math.floor(Math.max(1, viewportElement.clientWidth - 2)));
        return;
      }
      // Height carries a marker gutter: the sheet hugs the plan's aspect ratio,
      // but markers are fixed-size and centred, so the bottom row hangs off the
      // plan and would be clipped by a scroll container with no visible bar.
      setFitMapWidth(computeFitMapWidth({
        availableWidth: Math.max(1, viewportElement.clientWidth - 2),
        availableHeight: Math.max(1, viewportElement.clientHeight - 2),
        planRatio: MAP_IMAGE_WIDTH / MAP_IMAGE_HEIGHT,
        naturalWidth: MAP_IMAGE_WIDTH
      }));
    }

    updateFitMapWidth();

    const observer = new ResizeObserver(updateFitMapWidth);
    observer.observe(viewportElement);
    window.addEventListener("resize", updateFitMapWidth);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateFitMapWidth);
    };
  }, []);

  // Live scale for pill-crowding tiers: the frame's offsetWidth is exactly the
  // span of one normalized x unit, across fit, detail zoom, and the mobile
  // fixed-width frame. Re-binds on floor change — the frame div only mounts
  // for the mapped floor.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const mapElement = map;

    function updateRenderedWidth() {
      setMapRenderedWidth(mapElement.offsetWidth || null);
    }

    updateRenderedWidth();
    const observer = new ResizeObserver(updateRenderedWidth);
    observer.observe(mapElement);
    return () => observer.disconnect();
  }, [floor]);

  const scrollMapToPoint = useCallback((x: number, y: number, behavior: ScrollBehavior = "smooth") => {
    // A programmatic center supersedes any in-flight inspector nudge.
    cancelNudge();
    const viewport = mapViewportRef.current;
    const map = mapRef.current;
    if (!viewport || !map) return;

    const clampScrollPosition = (value: number, max: number) => Math.min(Math.max(value, 0), Math.max(max, 0));
    const left = clampScrollPosition((x * map.offsetWidth) - (viewport.clientWidth / 2), viewport.scrollWidth - viewport.clientWidth);
    const top = clampScrollPosition((y * map.offsetHeight) - (viewport.clientHeight / 2), viewport.scrollHeight - viewport.clientHeight);
    viewport.scrollTo({ left, top, behavior });
  }, [cancelNudge]);

  const centerSeatInMap = useCallback((seatId: string, behavior: ScrollBehavior = "smooth") => {
    const visualSeat = visualSeatById.get(seatId);
    if (!visualSeat) return;
    window.requestAnimationFrame(() => scrollMapToPoint(visualSeat.x, visualSeat.y, behavior));
  }, [scrollMapToPoint, visualSeatById]);

  const fitSeatIdsInMap = useCallback((seatIds: string[]) => {
    const visualTargets = seatIds.map(seatId => visualSeatById.get(seatId)).filter((seat): seat is SeatWithEmployee => Boolean(seat));
    if (visualTargets.length === 0) return;
    if (visualTargets.length === 1) {
      centerSeatInMap(visualTargets[0].id);
      return;
    }

    const bounds = visualTargets.reduce(
      (current, seat) => ({
        minX: Math.min(current.minX, seat.x),
        maxX: Math.max(current.maxX, seat.x),
        minY: Math.min(current.minY, seat.y),
        maxY: Math.max(current.maxY, seat.y)
      }),
      { minX: 1, maxX: 0, minY: 1, maxY: 0 }
    );
    scrollMapToPoint((bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2);
  }, [centerSeatInMap, scrollMapToPoint, visualSeatById]);

  function applyMapZoom(nextZoom: number) {
    cancelNudge();
    setZoomFactor(clampZoom(nextZoom));
  }

  function fitMapToView() {
    cancelNudge();
    setZoomFactor(null);
    window.requestAnimationFrame(() => {
      mapViewportRef.current?.scrollTo({ left: 0, top: 0, behavior: "auto" });
    });
  }

  function isPanBlockedTarget(target: EventTarget | null) {
    return target instanceof Element && Boolean(target.closest("button, a, input, select, textarea, [data-seat-id]"));
  }

  function handleViewportPointerDown(event: PointerEvent<HTMLDivElement>) {
    cancelNudge();
    if (floor !== "3" || event.button !== 0) return;
    if (isPanBlockedTarget(event.target)) return;
    const viewport = mapViewportRef.current;
    if (!viewport) return;

    panStateRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startScrollLeft: viewport.scrollLeft,
      startScrollTop: viewport.scrollTop,
      moved: false
    };
    viewport.setPointerCapture(event.pointerId);
    setPanning(true);
  }

  function handleViewportPointerMove(event: PointerEvent<HTMLDivElement>) {
    const pan = panStateRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    const viewport = mapViewportRef.current;
    if (!viewport) return;

    const deltaX = event.clientX - pan.startClientX;
    const deltaY = event.clientY - pan.startClientY;
    if (!pan.moved && Math.abs(deltaX) + Math.abs(deltaY) > 4) pan.moved = true;
    viewport.scrollLeft = pan.startScrollLeft - deltaX;
    viewport.scrollTop = pan.startScrollTop - deltaY;
  }

  function handleViewportPointerEnd(event: PointerEvent<HTMLDivElement>) {
    const pan = panStateRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    panStateRef.current = null;
    setPanning(false);
    if (pan.moved || event.type === "pointercancel") return;
    if (isPanBlockedTarget(event.target)) return;
    // A stationary press on empty canvas clears the selection.
    setSelectedSeatId(null);
    setInspectorCollapsed(false);
  }

  function clearSearch() {
    setSearch("");
    setSelectedSeatId(null);
    setActiveResultId(null);
    setInspectorCollapsed(false);
  }

  function clearStructuredFilters() {
    setDepartment("all");
    setPosition("all");
    setZone("all");
    setStatus("all");
  }

  function clearAllConstraints() {
    clearSearch();
    clearStructuredFilters();
  }

  function updateSearch(value: string) {
    setSearch(value);
    setActiveResultId(null);
    // Typing is the fourth door onto the palette, alongside click, focus and
    // ⌘K (contract #2): a query with nowhere to show its results would be a
    // field that swallows keystrokes.
    setPaletteOpen(true);
    // INV-1 (same rule as the admin map): an active search hands the panel
    // slot to results, so matches are never invisible behind the inspector.
    // The viewer inspector is read-only, so it is never dirty.
    if (searchHandsPanelToResults(value, Boolean(selectedSeatId), false)) {
      setInspectorCollapsed(true);
    }
  }

  // Zone chips (contract #4). Pinning is the existing `zone` filter — the
  // chips are a second door onto the facet the map already washes and the
  // legend already counts, not a second copy of it — and the palette closes so
  // the pinned result is visible on the plan behind it. The hover preview is
  // released explicitly: the pointer never leaves the chip, the chip leaves
  // the pointer.
  function pinZoneFromPalette(nextZone: string) {
    setZone(nextZone);
    setHoverZone(null);
    setPaletteOpen(false);
  }

  // Identity-stable handle for the memoized SeatMarker. selectSeat is
  // re-created every render, so passing it directly would give ~2000 markers a
  // new prop whenever anything on this page changes — including palette row
  // hover, which is exactly the interaction the memo is meant to make cheap.
  // The ref keeps the closure current, so nothing goes stale.
  const latestSelectSeat = useRef(selectSeat);
  // Refreshed in an effect, not during render: writing a ref mid-render trips
  // react-hooks' "Cannot access refs during render". Effects flush before the
  // browser dispatches the next pointer event, so the handler a marker calls
  // is always the current one.
  useEffect(() => {
    latestSelectSeat.current = selectSeat;
  });
  const stableSelectSeat = useCallback((seatId: string) => {
    latestSelectSeat.current(seatId);
  }, []);

  function selectSeat(seatId: string) {
    // Finding 1 (v12 slice 4 final review): only arm the skip when the
    // selection is actually changing — reselecting the already-selected seat
    // leaves selectedSeatId unchanged, so the trigger effect's deps never
    // move to consume the flag; arming it anyway would leave it stuck and
    // silently skip a later, unrelated selection's legitimate nudge.
    const isNewSelection = selectedSeatId !== seatId;
    setSelectedSeatId(seatId);
    setActiveResultId(null);
    setInspectorCollapsed(false);
    // Picking a seat ends the finding (contract #5). Closing here as well as
    // in openResult covers the marker-click path: the palette can be open over
    // the plan while the pointer reaches a marker underneath it.
    setPaletteOpen(false);
    // This selection also queues a programmatic center below — arm the skip
    // in the same commit so the nudge trigger effect never races the
    // center's native smooth scrollTo.
    if (isNewSelection) skipNextNudge();
    centerSeatInMap(seatId);
  }

  // Deep-link (#196): same `?seat=<label>` contract as the admin map — read
  // once on mount, then mirror selection changes with a shallow replaceState.
  const seatParamAppliedRef = useRef(false);
  useEffect(() => {
    const seatId = findSeatIdByParam(publishedSeats, readSeatParam(window.location.search));
    seatParamAppliedRef.current = true;
    if (!seatId) return;
    // Deferred a frame so centerSeatInMap measures the settled layout (and the
    // selection isn't a sync setState inside the effect).
    const frame = window.requestAnimationFrame(() => selectSeat(seatId));
    return () => window.cancelAnimationFrame(frame);
    // Mount-only by design (see the admin map's twin effect).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!seatParamAppliedRef.current) return;
    const label = selectedSeatId ? (publishedSeats.find(seat => seat.id === selectedSeatId)?.label ?? null) : null;
    const next = `${window.location.pathname}${withSeatParam(window.location.search, label)}${window.location.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (next !== current) window.history.replaceState(window.history.state, "", next);
    // publishedSeats omitted: a seat's label is stable for the life of its id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSeatId]);

  // Delegated marker-layer keyboarding — same pattern as the admin map:
  // arrows rove between seats (preventDefault keeps the scroll viewport from
  // panning underneath), keyboard activation hands focus into the inspector.
  function handleMarkerLayerKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const seatId = (event.target as HTMLElement).closest<HTMLElement>("[data-seat-id]")?.dataset.seatId;
    if (!seatId) return;

    const direction = arrowKeyToDirection(event.key);
    if (direction) {
      event.preventDefault();
      event.stopPropagation();
      const nextSeatId = findNearestSeatInDirection(seatNavPoints, seatId, direction);
      if (nextSeatId) {
        setRovingSeatId(nextSeatId);
        window.requestAnimationFrame(() => {
          document.querySelector<HTMLButtonElement>(`[data-seat-id="${nextSeatId}"]`)?.focus();
        });
      }
      return;
    }

    if ((event.key === "Enter" || event.key === " ") && seatId !== selectedSeatId) {
      focusInspectorAfterSelectRef.current = true;
    }
  }

  function handleMarkerLayerFocusCapture(event: { target: EventTarget | null }) {
    const seatId = (event.target as HTMLElement | null)?.closest?.<HTMLElement>("[data-seat-id]")?.dataset.seatId;
    if (seatId) setRovingSeatId(seatId);
  }

  function openResult(result: ViewerSearchResult) {
    setActiveResultId(result.id);
    // Enter/click on a row selects, centers and closes the palette
    // (contract #5) — including the department/zone rows below, which fit
    // their whole match set into view instead of selecting one seat.
    setPaletteOpen(false);
    if (result.seatId) {
      // Finding 1: same race as selectSeat above, same "only if actually
      // changing" guard (re-opening the currently selected seat's own
      // result row must not arm a flag no future effect run will consume).
      const isNewSelection = selectedSeatId !== result.seatId;
      setSelectedSeatId(result.seatId);
      setInspectorCollapsed(false);
      if (isNewSelection) {
        skipNextNudge();
        // The row button unmounts with the palette, so focus falls to <body>
        // unless it is placed — the same drop the Escape handler above already
        // guards. Hand it to the panel this find just opened: the handoff the
        // marker's Enter path makes, and since the 2026-08-25 browse ruling
        // the sanctioned read surface. Armed only on a NEW selection for the
        // reason the nudge guard states — the trigger effect keys on
        // selectedSeatId, so arming it for an unchanged selection leaves a
        // flag no future effect run will consume.
        focusInspectorAfterSelectRef.current = true;
      } else {
        // Re-opening the already-selected seat's row: selectedSeatId never
        // moves, so that effect will not run. The panel is already mounted,
        // so focus it directly rather than arming a flag nothing will clear.
        window.requestAnimationFrame(() => {
          document.getElementById("seat-inspector-panel")?.focus();
        });
      }
      centerSeatInMap(result.seatId);
      return;
    }

    setSelectedSeatId(null);
    fitSeatIdsInMap(result.seatIds);
    // Department/zone rows open no panel, so there is nothing to hand focus
    // to — return it to the field, exactly as Escape does. The suppress flag
    // is load-bearing rather than defensive: the field's own onFocus re-opens
    // the palette, so focusing it here unguarded would reopen what this call
    // just closed.
    suppressPaletteReopenRef.current = true;
    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      suppressPaletteReopenRef.current = false;
    });
  }

  const activeFilterChips: ActiveFilterChip[] = [
    searchActive ? { id: "search", label: "Search", value: searchResults.query, removeLabel: `Remove search filter ${searchResults.query}` } : null,
    department !== "all" ? { id: "department", label: "Department", value: department, removeLabel: `Remove department filter ${department}` } : null,
    position !== "all" ? { id: "position", label: "Position", value: position, removeLabel: `Remove position filter ${position}` } : null,
    zone !== "all" ? { id: "zone", label: "Zone", value: zone, removeLabel: `Remove zone filter ${zone}` } : null,
    status !== "all" ? { id: "status", label: "Status", value: STATUS_LABELS[status as SeatStatus] ?? status, removeLabel: `Remove status filter ${STATUS_LABELS[status as SeatStatus] ?? status}` } : null
  ].filter(Boolean) as ActiveFilterChip[];

  function removeActiveFilterChip(chipId: string) {
    if (chipId === "search") {
      clearSearch();
      return;
    }
    if (chipId === "department") {
      setDepartment("all");
      return;
    }
    if (chipId === "position") {
      setPosition("all");
      return;
    }
    if (chipId === "zone") {
      setZone("all");
      return;
    }
    if (chipId === "status") setStatus("all");
  }

  const resultCountLabel = searchResults.results.length === 1 ? "1 result" : `${searchResults.results.length} results`;
  const mapAnnouncement = selectedResultTitle
    ? `${selectedResultTitle} selected on the map.`
    : searchActive
      ? `${resultCountLabel} for ${search}.`
      : `${publishedSeats.length} seats loaded.`;
  const mapCrumbLabel = floor === "2"
    ? "Not yet mapped"
    : `Office map · ${publishedSeats.length} ${publishedSeats.length === 1 ? "seat" : "seats"}`;
  const mapZoomLabel = zoomFactor === null ? "Fit" : `${Math.round(zoomFactor * 100)}%`;
  // NOTHING reserves stage width any more (contract #1/#2): the results panel,
  // the People directory, its collapse rail and the mobile PEOPLE pill are all
  // gone, and the palette that replaced them FLOATS. So the hydration
  // guarantee the old `directoryOpen` expression carried — reserve the right
  // slot in the server markup, or every load renders full-bleed and then snaps
  // ~330px narrower when the persisted preference arrives — is not merely
  // preserved but retired: there is no reserved column left to snap, at any
  // width, in any hydration state.

  // Below the panel tier (<900) the inspector renders as a full-width
  // `fixed inset-x-3 bottom-3` sheet. The status band yields to it (unmounts)
  // and comes back on dismiss — the same bottom-yield rule the floating legend
  // used before the band replaced it: the map viewport is ~520px there and a
  // 50–60vh sheet would otherwise cover the whole status row. At >=900 the
  // inspector is a side panel whose panel-tier bottom offset clears the band
  // (52px = 40px band + the 12px gutter every floating card keeps), so the
  // band keeps rendering. The palette is not part of this: it hangs off the
  // TOP of the screen under the bar and never contends for the bottom.
  const bottomSheetOwnsBottom = Boolean(selectedSeat);
  const statusBandVisible = floor === "3" && bandTier && (panelTier || !bottomSheetOwnsBottom);

  // `inspectorCollapsed` is purely the INV-1 auto-yield flag. An active query
  // owns the transient surface; once the query clears, the inspector returns
  // on its own. Keyed on the QUERY, not on the palette: the palette and the
  // seat card no longer overlap, so the palette merely being open is not a
  // reason to keep a selection hidden.
  useEffect(() => {
    if (!inspectorCollapsed || !selectedSeatId) return;
    if (searchActive) return;
    setInspectorCollapsed(false);
  }, [inspectorCollapsed, selectedSeatId, searchActive]);

  // No zoom change on select/deselect: the fit view (zoomFactor null) sizes the
  // frame to the container at lg, so the reserved column re-fits it automatically;
  // a zoomed view keeps its zoom.

  const mapViewportClassName = cx(
    // v12 slice 3: the mounted-sheet treatment (hairline border + elevation +
    // matting padding) is gone here too — same move the admin map made. The
    // plan is layer-00: it runs edge to edge and the workspace band shows
    // through around it, so there is no card edge left to draw and everything
    // that reads over the map floats as a layer-01 white card instead.
    "relative mx-auto w-full max-w-full overflow-auto overscroll-contain bg-[var(--sp-map-mat)]",
    // Below lg the viewport takes the whole screen under the 36px bar, rather
    // than the old content-driven min-h/82svh pair. That pair sized the box to
    // the plan (472px at the mobile frame width), which was fine while a
    // toolbar row and a status footer sat in flow around it and a hairline
    // border drew the sheet's edge. Slice 3 floated both and dropped the
    // border, so the leftover column showed as 192-424px of bare page below a
    // hard seam — measured 2026-08-03 at every width below lg, and the two
    // greiges differ (workspace #ECE8E0 against page #F7F6F2), so it read as
    // the page running out rather than as workspace. Filling the column keeps
    // the plan on an unbroken workspace band to the bottom of the screen, and
    // an exact height keeps this the one vertical scroll owner (#197) — the
    // job the 82svh ceiling used to do.
    // With the band in flow the viewport gives up its 40px so the column still
    // sums to the screen and stays the ONE vertical scroll owner (#197); on
    // phones (band absent) the old full-height calc stands. At lg the stage is
    // a flex column and flex-1 does the same subtraction, so the lg:h-full the
    // pre-band layout needed is gone rather than fighting the band for 40px.
    statusBandVisible ? "h-[calc(100svh-76px)]" : "h-[calc(100svh-36px)]",
    "lg:h-auto lg:min-h-0 lg:max-h-none lg:flex-1 lg:[-ms-overflow-style:none] lg:[scrollbar-width:none] lg:[&::-webkit-scrollbar]:hidden",
    // The fit view is a flex row at EVERY width so the frame's auto margins can
    // centre the plan vertically below sm too — a top-aligned plan sat under
    // the floating chip cluster (markers occluded) with the whole leftover
    // column pooled below it. Centring is by auto margin, not items-center:
    // cross-axis alignment makes overflowing top rows unreachable on short
    // landscape phones, while auto margins collapse to 0 under overflow and
    // keep the scroll origin intact.
    zoomFactor === null ? "flex sm:items-center sm:justify-center" : "",
    floor === "3" ? (panning ? "cursor-grabbing" : "cursor-grab") : "",
    "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--sp-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--sp-background)]"
  );
  const mapFrameClassName = cx(
    "relative mx-auto max-w-none",
    zoomFactor === null
      // shrink-0 at every width: the flex viewport must not squeeze the fixed
      // 1040px mobile frame down to the phone's width (177px-tall plan). The
      // auto vertical margins double as a stretch guard — a stretched frame
      // taller than its image would break the markers' percentage anchors.
      ? "my-auto w-[1040px] shrink-0 sm:w-full sm:max-w-[1911px]"
      : "[--map-detail-base:1040px] sm:[--map-detail-base:1340px] lg:[--map-detail-base:1911px]"
  );
  const mapFrameStyle = zoomFactor === null
    ? (fitMapWidth ? { width: `${fitMapWidth}px` } : undefined)
    : { width: `calc(var(--map-detail-base) * ${zoomFactor})` };
  // One stage in both states (v12 slice 3). The old fit branch pinned the
  // stage to the plan's 1911/867 aspect so the leftover column height could
  // not letterbox the plan between dead beige bands — but that fix was for a
  // MATTED sheet, where the bands read as broken card. Full-bleed, the band
  // around the plan IS the workspace surface, so the stage takes the whole
  // column and the contain-fit inside it centres the plan on that surface.
  // Removing the aspect branch cannot start a fit feedback loop: at lg the
  // stage height comes from the screen (root lg:h-screen → main flex column),
  // never from the frame width the fit effect computes.
  // Flex COLUMN at every width now: the viewport and the in-flow status band
  // stack vertically, and at lg flex-1 + min-h-0 keep the pair filling the
  // screen column exactly as the lone viewport used to.
  const mapStageClassName = "relative flex min-w-0 flex-col lg:min-h-0 lg:flex-1";

  // Type-floor Ruling 3 (2026-08-24): w-16, not w-12 — the 12px label
  // ("Reception" ≈ 56px) must fit; widen the tab, never truncate the word.
  const chromeSurfaceShortcut = "flex h-9 w-16 shrink-0 flex-col items-center justify-center gap-0.5 border-b-2 text-xs font-medium tracking-[0.02em] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--sp-brand)]";

  return (
    /* overflow-x-CLIP, not -hidden: hidden makes this div a scroll container,
       which captures the sticky header so it never pins to the viewport. */
    <div className="shell-theme flex min-h-[100svh] flex-col overflow-x-clip bg-[var(--sp-background)] text-[var(--sp-text-primary)] lg:h-screen lg:min-h-0 lg:overflow-hidden">
      <a
        href="#viewer-seat-map"
        data-chrome="dark"
        className="sp-zone-chrome sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[60] focus:border focus:border-[var(--sp-brand)] focus:bg-[var(--sp-background)] focus:px-3 focus:py-2 focus:text-[12.5px] focus:font-semibold focus:text-[var(--sp-text-primary)] focus:outline-none"
      >
        Skip to seat map
      </a>
      {/* z-50 matches the admin bar: sticky activates the z-index, which must
          outrank z-40 workspace overlays that follow in DOM order. */}
      <header className="sp-zone-chrome sticky top-0 z-50 flex h-9 shrink-0 items-center border-b border-[var(--sp-border-subtle)] bg-[var(--sp-background)] pl-3 text-[var(--sp-text-primary)]" data-chrome="dark">
        <div className="flex min-w-0 shrink-0 items-center gap-2">
          <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center">
            <Image src="/images/megeredchian-mark.png?v=ma-2026-128" alt="" width={24} height={24} unoptimized className="h-6 w-6 object-contain" />
          </span>
          {/* leading-[18px], not leading-none: truncate's overflow-hidden clips descenders (the g) at line-height 1. */}
          <div aria-hidden="true" translate="no" className="hidden min-w-0 truncate text-[12.5px] font-semibold leading-[18px] sm:block">
            Megeredchian Law <span className="font-normal text-[var(--sp-text-helper)]">· Seat Planner</span>
          </div>
        </div>

        {/* Divider tracks the bar (was 22px in a 40px bar — same 0.55 ratio). */}
        <span aria-hidden="true" className="mx-2.5 hidden h-[26px] w-px shrink-0 bg-[var(--sp-border-subtle)] lg:block" />

        {/* Filter and Search are two DISTINCT controls (was one shared 26px box
            capped at 340px for BOTH). Finding your own seat or looking up a
            person is the paramount job on this surface, so search gets its own
            field and the width; Filter keeps the pairing by sitting immediately
            to its LEFT with the dropdown anchored to itself. Both Carbon `sm` =
            Carbon `md` = 40px inside the 48px bar (owner, 2026-07-22). */}
        <div ref={filterRootRef} className="relative mr-1.5 flex h-7 shrink-0 items-stretch border border-[var(--sp-border-subtle)] bg-[var(--sp-field)] lg:mr-2">
          <button
            ref={filterTriggerRef}
            type="button"
            onClick={() => setFilterOpen(current => !current)}
            aria-expanded={filterOpen}
            aria-controls="viewer-filter-panel"
            aria-haspopup="true"
            aria-label={structuredFilterCount ? `Filter seating, ${structuredFilterCount} active` : "Filter seating"}
            className={[
              "flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 text-[12px] font-medium leading-none transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--sp-brand)]",
              structuredFilterCount > 0 || filterOpen
                ? "border-b-[var(--sp-brand)] bg-[var(--sp-background-hover)] text-[var(--sp-text-primary)]"
                : "border-b-transparent text-[var(--sp-text-helper)] hover:bg-[var(--sp-background-hover)] hover:text-[var(--sp-text-primary)]"
            ].join(" ")}
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5">
              <path d="M3 4.5h14l-5.4 6.2v4.8l-3.2-1.7v-3.1L3 4.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
            Filter
            {structuredFilterCount > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--sp-button-primary)] px-1 text-[11px] font-semibold text-white">{structuredFilterCount}</span>
            )}
            <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3 w-3 text-[var(--sp-text-helper)]">
              <path d="m5.5 8 4.5 4.5L14.5 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {/* DOM order mirrors the visual order: the menu drops directly under
              the trigger, so it must precede the search field in tab order. */}
          {filterOpen && (
            <div className="absolute -left-px top-full z-50 w-[288px] max-w-[calc(100vw-16px)]">
              <FilterPanel
                department={department}
                position={position}
                status={status}
                departments={departments}
                positions={positions}
                zone={zone}
                zones={zones}
                activeChips={activeFilterChips}
                panelId="viewer-filter-panel"
                returnFocusRef={filterTriggerRef}
                onClose={() => setFilterOpen(false)}
                onDepartmentChange={setDepartment}
                onPositionChange={setPosition}
                onZoneChange={setZone}
                onZoneHoverChange={setHoverZone}
                onStatusChange={setStatus}
                matchSummary={`${statusCountSeats.length} of ${publishedSeats.length} seats match`}
                onRemoveActiveChip={removeActiveFilterChip}
                onClearFilters={clearStructuredFilters}
              />
            </div>
          )}
        </div>

        {/* Medium cap, 340 -> 420px on lg — matching the admin bar so the two
            surfaces read as one shell. Finding your seat is still the paramount
            job here, but 480 made the field the loudest thing in the row. */}
        <div
          ref={searchFieldRef}
          role="search"
          aria-label="Viewer search"
          className={cx(
            "h-7 min-w-0 flex-1 border bg-[var(--sp-field)] lg:max-w-[420px]",
            // Open field: the 2px inset accent (both chrome themes) is what
            // ties the palette below to the field it belongs to.
            paletteOpen
              ? "border-transparent shadow-[inset_0_0_0_2px_var(--sp-brand)]"
              : "border-[var(--sp-border-subtle)]"
          )}
        >
          <label htmlFor="viewer-seat-search" className="relative flex h-full w-full min-w-0 items-center">
            <span className="sr-only">Search office seating</span>
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--sp-text-helper)]">
              <circle cx="9" cy="9" r="5.25" stroke="currentColor" strokeWidth="1.7" />
              <path d="m13.4 13.4 3.1 3.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
            <input
              id="viewer-seat-search"
              value={search}
              onChange={event => updateSearch(event.target.value)}
              onFocus={() => {
                // Escape's hand-back from a palette row lands here one frame
                // after the palette closed; it is the app returning focus, not
                // the user reaching for the field, so it must not re-open.
                if (suppressPaletteReopenRef.current) {
                  suppressPaletteReopenRef.current = false;
                  return;
                }
                setPaletteOpen(true);
              }}
              // Click as well as focus: pressing Esc leaves focus in the field,
              // so without this a second click on an already-focused field
              // could never reopen the palette (contract #2). Deliberately NOT
              // suppressed — a click is always the user asking.
              onClick={() => setPaletteOpen(true)}
              onKeyDown={event => {
                if (event.key === "Escape") {
                  // Layered dismissal (contract #7), handled here so the
                  // keystroke never reaches the global handler twice: the
                  // palette is the layer above the query, so the first Esc
                  // closes it and the second clears what was typed. Anything
                  // deeper (selection, pinned zone) bubbles. The × button
                  // keeps the full clearSearch reset.
                  //
                  // preventDefault is load-bearing on BOTH branches, not
                  // defensive: `type="search"` inputs clear themselves on
                  // Escape natively, and that clear fires an input event. Left
                  // to run it collapsed two layers into one keystroke — the
                  // first Esc closed the palette AND wiped the query, then
                  // updateSearch re-opened the palette on the way out
                  // (measured in Chromium, 2026-08-12).
                  event.preventDefault();
                  if (paletteOpen) {
                    event.stopPropagation();
                    setPaletteOpen(false);
                    return;
                  }
                  if (search.trim()) {
                    event.stopPropagation();
                    setSearch("");
                    setActiveResultId(null);
                    setInspectorCollapsed(false);
                  }
                  return;
                }
                // The palette is visually adjacent but far away in DOM order —
                // ArrowDown hops focus straight into whichever list it is
                // showing. `:not([disabled])` matters in browse mode, where
                // the first row alphabetically can be an unseated person.
                if (event.key === "ArrowDown" && paletteOpen) {
                  event.preventDefault();
                  document.querySelector<HTMLButtonElement>(
                    '[aria-label="Viewer search results"] button:not([disabled]), [aria-label="People directory"] button:not([disabled])'
                  )?.focus();
                  return;
                }
                // The palette's own legend promises "Enter opens" while focus
                // is still here, so honour it against the top result rather
                // than making the user arrow into the list first. With no
                // results the keystroke stays unclaimed.
                if (event.key === "Enter" && paletteOpen && searchActive) {
                  const [firstSearchResult] = searchResults.results;
                  if (!firstSearchResult) return;
                  event.preventDefault();
                  openResult(firstSearchResult);
                }
              }}
              ref={searchInputRef}
              // aria-controls only, deliberately no aria-expanded: ARIA 1.2
              // dropped aria-expanded from textbox/searchbox, and the valid
              // way to carry it here would be role="combobox" — which commits
              // to a listbox popup of role="option" children. The palette is a
              // list of real buttons that focus moves into, so claiming
              // combobox would describe a widget this is not.
              //
              // Gated on paletteOpen because the palette is UNMOUNTED when
              // closed: an id reference that resolves to nothing is an invalid
              // attribute value, not a harmless one (axe aria-valid-attr-value,
              // critical — caught by the e2e-auth viewer scan, which is the
              // only tier that scans this surface signed in).
              aria-controls={paletteOpen ? "viewer-find-palette" : undefined}
              type="search" name="seat-search" autoComplete="off" spellCheck={false} placeholder={SEAT_SEARCH_PLACEHOLDER}
              className="h-full w-full border-0 bg-transparent pl-8 pr-8 text-[12px] font-medium text-ellipsis text-[var(--sp-text-primary)] outline-none placeholder:text-ellipsis transition placeholder:text-[var(--sp-text-helper)] hover:bg-white/[0.06] focus:bg-white/[0.04] focus:ring-2 focus:ring-inset focus:ring-[var(--sp-brand)]"
            />
            {search.trim() ? (
              <button
                type="button"
                aria-label="Clear viewer search"
                title="Clear search"
                className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center text-[var(--sp-text-helper)] transition hover:bg-[var(--sp-background-hover)] hover:text-[var(--sp-text-primary)] active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sp-brand)]"
                onClick={clearSearch}
              >
                <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3 w-3"><path d="m6 6 8 8m0-8-8 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            ) : paletteOpen || searchShortcutHint ? (
              // Open, the field advertises the way OUT rather than the way in —
              // the shortcut that got you here is spent.
              <kbd aria-hidden="true" className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 border border-[var(--sp-border-subtle)] px-1 py-0.5 text-[10px] font-semibold text-[var(--sp-text-helper)]">{paletteOpen ? "Esc" : searchShortcutHint}</kbd>
            ) : null}
          </label>
        </div>

        <div className="ml-auto flex h-full shrink-0 items-center">
          {/* Reception is NOT admin equipment (unlike the surface tabs below):
              the front-desk directory is read-only and role-safe, so every
              signed-in user gets the shortcut (owner ruling 2026-08-05 —
              viewers have no rail, this is their entry point). */}
          {accountEmail && (
            <Link
              href="/reception"
              // prefetch off on force-dynamic targets, same rationale as
              // AppRail's prefetch={false} note: dynamic prefetches are pure
              // serverless flood and collided with in-flight navigations.
              prefetch={false}
              aria-label="Open reception directory"
              title="Reception — front-desk call routing"
              className={cx(chromeSurfaceShortcut, "border-transparent text-[var(--sp-text-helper)] hover:bg-[var(--sp-background-hover)] hover:text-[var(--sp-text-primary)]")}
            >
              <svg aria-hidden="true" viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 11V9.5a6 6 0 0 1 12 0V11" />
                <path d="M4 11h2v3.5H4.6A.6.6 0 0 1 4 13.9V11ZM16 11h-2v3.5h1.4a.6.6 0 0 0 .6-.6V11Z" />
                <path d="M16 14.5v1a2 2 0 0 1-2 2h-2.5" />
              </svg>
              Reception
            </Link>
          )}
          {/* Surface tabs are admin equipment (2026-07-16 regrade, review 2):
              non-admin staff would otherwise see one dead "tab" implying a
              missing sibling. Their chrome ends at the account chip; surface
              identity lives in the crumb and the menu's role line. */}
          {showAdminShortcut && (
            <div className="flex h-full items-center">
              <span
                aria-current="page"
                title="Viewer — published map"
                className={cx(chromeSurfaceShortcut, "border-[var(--sp-brand)] text-white")}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="8.2" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                Viewer
              </span>
              <Link
                href="/admin"
                prefetch={false}
                aria-label="Open admin surface"
                title="Admin — draft editing surface"
                className={cx(chromeSurfaceShortcut, "border-transparent text-[var(--sp-text-helper)] hover:bg-[var(--sp-background-hover)] hover:text-[var(--sp-text-primary)]")}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="9" cy="7" r="3.1" />
                  <path d="M3.5 20v-1.4a4.6 4.6 0 0 1 4.6-4.6h1.6a4.6 4.6 0 0 1 2.3.6" />
                  <path d="M14.5 18.4l2 2 4.2-4.6" />
                </svg>
                Admin
              </Link>
            </div>
          )}
          <ThemeToggle />
          {/* Account menu (identity + sign out); decorative fallback keeps
              unauthenticated prototype embeds rendering. */}
          {accountEmail ? (
            <AccountMenu email={accountEmail} roleLabel={accountRoleLabel} />
          ) : (
            <span aria-hidden="true" className="mx-2.5 flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-[var(--sp-brand)] text-[11px] font-semibold text-[var(--sp-text-on-brand)]">V</span>
          )}
        </div>
      </header>

      {/* No matting, and no reserved gutter either (v12 Find palette): the
          stage column runs to the window edges at every width now that nothing
          docks beside it. */}
      <div className="flex w-full flex-1 flex-col lg:min-h-0 lg:overflow-hidden">
        <main className="flex min-w-0 flex-1 flex-col lg:min-h-0 lg:overflow-hidden">
          {/* Inside <main>, not above the header: page content outside every
              landmark trips axe's region rule. */}
          <h1 className="sr-only">Seat Planner — office map</h1>

          <div className={mapStageClassName}>
            {/* Top-left cluster (v12 slice 3): floor, crumb, last-publish date,
                and active filter chips float over the full-bleed plan as
                layer-01 cards. Nothing above the map is in flow any more, so a
                chip arriving mid-session can no longer resize the map column
                and re-run the fit. pointer-events-none on the rail with each
                card opting itself back in keeps the gaps between cards
                draggable map. Ungated by floor on purpose — the floor pill IS
                how you leave the Floor 2 placeholder. */}
            <div className="pointer-events-none absolute left-3 top-3 z-40 flex flex-wrap items-center gap-2">
              <div className="pointer-events-auto">
                <FloorSelector floor={floor} onChange={setFloor} />
              </div>
              <span className="pointer-events-auto border border-[var(--sp-border-subtle)] bg-[var(--sp-layer-01)] px-2.5 py-1.5 text-[12px] text-[var(--sp-text-secondary)] shadow-elevation-3">{mapCrumbLabel}</span>
              {/* Viewers don't need the layer model ("Published" / "Read-only"
                  badges) — a last-publish date answers the question they have. */}
              {lastPublishedLabel && floor === "3" && (
                <span
                  title={`The map everyone sees — last updated ${lastPublishedLabel}`}
                  className="pointer-events-auto rounded-full bg-[var(--sp-layer-01)] px-2.5 py-1 text-[11px] font-semibold text-[var(--sp-text-secondary)] shadow-elevation-3 ring-1 ring-[var(--sp-border-subtle)]"
                >
                  Updated {lastPublishedLabel}
                </span>
              )}
              <ActiveFilterChips chips={activeFilterChips} onRemove={removeActiveFilterChip} onClearAll={clearAllConstraints} className="pointer-events-auto" />
            </div>
            <div
              ref={mapViewportRef}
              id="viewer-seat-map"
              tabIndex={0}
              aria-label="Office seat map. Drag to pan. Seat markers are read-only buttons."
              className={mapViewportClassName}
              onPointerDown={handleViewportPointerDown}
              onPointerMove={handleViewportPointerMove}
              onPointerUp={handleViewportPointerEnd}
              onPointerCancel={handleViewportPointerEnd}
              onWheel={cancelNudge}
              onKeyDown={event => {
                if (VIEWPORT_NATIVE_SCROLL_KEYS.has(event.key)) cancelNudge();
              }}
            >
              {floor === "2" && <FloorPlaceholder />}
              {floor === "3" && (
                <div ref={mapRef} className={mapFrameClassName} style={mapFrameStyle}>
                  <Image
                    src={MAP_IMAGE_SRC}
                    alt="Office floor plan"
                    width={MAP_IMAGE_WIDTH}
                    height={MAP_IMAGE_HEIGHT}
                    priority
                    fetchPriority="high"
                    unoptimized
                    placeholder="blur"
                    blurDataURL={MAP_IMAGE_BLUR_DATA_URL}
                    className="map-raster block h-auto w-full select-none"
                    draggable={false}
                  />

                  {/* Zone + room washes, between the floor-plan image and the
                      marker layer. One implementation shared with the admin
                      surface (MapWashLayer) — it documents the decorative /
                      pointer-inert contract both surfaces rely on. */}
                  <MapWashLayer zoneWash={zoneWash} officeRoomWashes={officeRoomWashes} />

                  <div
                    className="absolute inset-0"
                    onKeyDown={handleMarkerLayerKeyDown}
                    onFocusCapture={handleMarkerLayerFocusCapture}
                    onPointerDownCapture={() => {
                      focusInspectorAfterSelectRef.current = false;
                    }}
                  >
                    {visualSeats.map(seat => {
                      const inMatches = highlightedSeatIdSet.has(seat.id);
                      const dimmed = filtersActive && !inMatches && selectedSeatId !== seat.id;
                      const officePlateLayout = getOfficePlateLayout(seat, mapRenderedWidth ?? 0);
                      // Two independent causes light a seat up, and neither may
                      // borrow the other's announcement: resting the pointer on a
                      // people-list row is not a search result. Only the
                      // palette's BROWSE rows feed hoverSeatId, which is what
                      // keeps the second description true.
                      const seatIsSearchHit = activeResultSeatIdSet.has(seat.id);
                      const seatIsPaletteHover = paletteOpen && seat.id === hoverSeatId;

                      return (
                        <SeatMarker
                          key={seat.id}
                          seat={seat}
                          selected={seat.id === selectedSeatId}
                          dimmed={dimmed}
                          canEdit={false}
                          showNames={showNames}
                          searchResult={filtersActive && inMatches}
                          compactNameLabel
                          codeNudge={codePillNudges.get(seat.id) ?? 0}
                          nameNudge={nameLabelNudges.get(seat.id) ?? 0}
                          textTier={textTier}
                          swapMode={false}
                          moveEmployeeMode={false}
                          officePlateOffsetXPx={officePlateLayout?.offsetXPx ?? 0}
                          officePlateOffsetYPx={officePlateLayout?.offsetYPx ?? 0}
                          officePlateWidthPx={officePlateLayout?.widthPx}
                          swapSource={false}
                          swapTarget={false}
                          moveEmployeeSource={false}
                          highlighted={seatIsSearchHit || seatIsPaletteHover}
                          highlightedDescription={seatIsSearchHit ? "Highlighted search result" : "Highlighted from the people list"}
                          addSeatMode={false}
                          viewportEdge="none"
                          viewportEdgeOffsetPx={0}
                          tabIndex={seat.id === mapRovingSeatId ? 0 : -1}
                          onSelect={stableSelectSeat}
                        />
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            {/* Lives beside the marker layer now that the status footer it used
                to follow is gone. Stage-level, not inside the Floor 3 branch:
                the announcement has to survive a floor switch (it still counts
                the loaded seats on the placeholder floor). */}
            <p className="sr-only" aria-live="polite">{mapAnnouncement}</p>
            {/* Phones only (band >=640 owns zoom there — owner call
                2026-08-17): the shipped floating stack, unchanged. Flat
                bottom-3 at the panel tier is vestigial while this is
                phone-gated but harmless; the home-indicator inset is the part
                that matters — the safe area is still an obstruction (#198). */}
            {floor === "3" && !bandTier && (
              <div className="absolute right-3 z-30 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] panel:bottom-3">
                <MapZoomControl
                  label={mapZoomLabel}
                  onZoomIn={() => applyMapZoom(zoomFactor === null ? 1 : zoomFactor + MAP_ZOOM_STEP)}
                  onZoomOut={() => applyMapZoom(zoomFactor === null ? 1 - MAP_ZOOM_STEP : zoomFactor - MAP_ZOOM_STEP)}
                  onFit={fitMapToView}
                  zoomInDisabled={zoomFactor !== null && zoomFactor >= MAP_ZOOM_MAX}
                  zoomOutDisabled={zoomFactor !== null && zoomFactor <= MAP_ZOOM_MIN}
                />
              </div>
            )}
            {/* The status band (Option A): the in-flow bottom row that
                replaced the floating legend card + floating zoom stack from
                sm up. Counts still come from statusCountSeats, which follows
                the active filters — the one number row everyone reads must
                never contradict a filtered map. Gated to Floor 3 (Floor 2 is
                the placeholder, where whole-map counts would read as a bug)
                and to statusBandVisible (band tier + sheet yield above).
                Viewer-shaped: no draft entry and no data verbs; the names
                toggle stays a render-local view control only. */}
            {statusBandVisible && (
              <MapStatusBand
                ariaLabel="Seat status summary"
                totalLabel={`${statusCountSeats.length} ${statusCountSeats.length === 1 ? "seat" : "seats"}`}
                entries={[
                  { key: "assigned", label: STATUS_LABELS.assigned, dotClassName: "bg-[var(--sp-status-success-mark)]", count: assignedCount },
                  { key: "available", label: STATUS_LABELS.available, dotClassName: "bg-[var(--sp-status-neutral-mark)]", count: openCount },
                  { key: "reserved", label: STATUS_LABELS.reserved, dotClassName: "bg-[var(--sp-status-pending-mark)]", count: reservedCount }
                ]}
                summary={searchActive
                  ? `${resultCountLabel} · ${searchResults.resultSeatIds.length} mapped`
                  : structuredFiltersActive
                    // Filters got no match count while search did (2026-07-16
                    // critique, minor 8) — same status-line home for both.
                    ? `${highlightedSeatIdSet.size} of ${publishedSeats.length} seats ${highlightedSeatIdSet.size === 1 ? "matches" : "match"} filters`
                    : "Seating across people, seats, departments, and zones."}
                controls={
                  <>
                    <NamesVisibilityToggle pressed={showNames} onToggle={() => setShowNames(current => !current)} />
                    <span aria-hidden="true" className="h-5 w-px shrink-0 bg-[var(--sp-border-subtle)]" />
                    <MapZoomControl
                      orientation="horizontal"
                      label={mapZoomLabel}
                      onZoomIn={() => applyMapZoom(zoomFactor === null ? 1 : zoomFactor + MAP_ZOOM_STEP)}
                      onZoomOut={() => applyMapZoom(zoomFactor === null ? 1 - MAP_ZOOM_STEP : zoomFactor - MAP_ZOOM_STEP)}
                      onFit={fitMapToView}
                      zoomInDisabled={zoomFactor !== null && zoomFactor >= MAP_ZOOM_MAX}
                      zoomOutDisabled={zoomFactor !== null && zoomFactor <= MAP_ZOOM_MIN}
                    />
                  </>
                }
              />
            )}
          </div>
        </main>
      </div>

      {/* The ONE Find surface. It floats over the plan anchored to the field
          it belongs to, so opening it reflows nothing (contract #2), and its
          two modes share this single slot — browse with an empty query,
          results with one. It replaced four docked surfaces: the search
          results aside, the People directory aside, that directory's collapse
          rail, and the mobile PEOPLE pill that was the only way to reach the
          directory below 900px. */}
      {paletteOpen && (
        <ViewerFindPalette
          anchorRef={searchFieldRef}
          containerRef={paletteRef}
          searchInputRef={searchInputRef}
          // The user's own trimmed text, not the normalized search key: this
          // is display copy ("No results for X") and a mode switch, and both
          // want the casing that was typed.
          query={search.trim()}
          browse={paletteBrowse}
          results={searchResults.results}
          resultCountLabel={resultCountLabel}
          mappedSeatCount={searchResults.resultSeatIds.length}
          activeResultId={activeResultId}
          selectedSeatId={selectedSeatId}
          pinnedZone={zone}
          onZoneHoverChange={setHoverZone}
          onZonePin={pinZoneFromPalette}
          onRowHoverChange={setHoverSeatId}
          onOpenRow={openResult}
          onClearSearch={clearSearch}
        />
      )}

      <SeatInspector
        seat={selectedSeat}
        seats={publishedSeats}
        employees={employees}
        departmentOptions={departmentOptions}
        canEdit={false}
        // No panelBottomClassName: the viewer card is top-anchored and
        // content-height, so it never reaches the status band (the old
        // conditional panel:bottom-[52px] clearance died with the
        // full-column pin, 2026-08-20).
        collapsed={inspectorCollapsed}
        onClose={() => {
          focusViewerSeatMarker(selectedSeatId);
          setSelectedSeatId(null);
          setInspectorCollapsed(false);
        }}
      />
    </div>
  );
}
