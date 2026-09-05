"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SEAT_SEARCH_PLACEHOLDER } from "@/lib/viewerSeatSearch";
import { findSeatIdByParam, readFilterParams, readFloorParam, readNamesParam, readQueryParam, readSeatParam } from "@/lib/deepLink";
import { nextMapHref } from "@/lib/mapUrlState";
import { scopeResults, type SearchScope } from "@/lib/mapSearchScope";
import { shortcutHint } from "@/lib/platformShortcut";
import { findEmployeeByEmail, findSeatForEmployee } from "@/lib/mySeat";
import { departmentKey } from "@/lib/departments";
import { DEFAULT_FLOOR, floorOf, type FloorId } from "@/lib/floorIds";
import {
  FLOORS,
  VIEWER_FLOOR_STORAGE_KEY,
  floorDepartmentSummary,
  floorOrdinal,
  floorSurface,
  landingFloor,
  peopleOnFloor,
  rosterFloorForUnseated,
  personPassesFilters,
  urlFloorFor
} from "@/lib/floors";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent } from "react";
import Image from "next/image";
import type { DepartmentOption, Employee, SeatStatus, SeatWithEmployee, ZoneOption } from "@/lib/types";
import { STATUS_LABELS } from "@/lib/types";
import { normalizeSeat } from "@/lib/seatNormalize";
import { formatDisplayName } from "@/lib/formatName";
import { cx } from "@/components/ui/design-system";
import { returnFocusAfterClose } from "@/components/ui/returnFocus";

// MAP_IMAGE_WIDTH/HEIGHT stay the universal frame for the scale-dependent
// tiers (every floor's plan is built to the same 1911×867 framing); the
// rendered raster itself comes from the floor registry (lib/floors).
import { MAP_IMAGE_HEIGHT, MAP_IMAGE_WIDTH, seatsToVisualSeats } from "@/lib/mapLayoutTransform";
// Aliased: `fitMapWidth` is already this component's state for the resolved width.
import {
  MAP_ZOOM_MAX,
  MAP_ZOOM_MIN,
  MAP_ZOOM_STEP,
  clampZoom,
  fitMapWidth as computeFitMapWidth
} from "@/lib/mapViewport";
import { arrowKeyToDirection, edgeKeyToPosition, findNearestSeatInDirection, resolveRovingSeatId, seatAtReadingEdge } from "@/lib/seatKeyboardNav";
import { buildViewerSeatSearch, searchHandsPanelToResults, type ViewerSearchResult } from "@/lib/viewerSeatSearch";
import { buildViewerPaletteBrowse, getSeatZone, zoneKey } from "@/lib/viewerFindPalette";
import { buildPositionOptions, seatMatchesPosition } from "@/lib/positions";
import { useAppShellFilters, useAppShellLeftPanel, useAppShellState, type ShellFilterSpec } from "@/components/ui/AppShell";
import { buildViewerFilterGroups } from "@/lib/viewerFilterGroups";
import { FloorRoster, focusFloorRoster } from "@/components/seat-map/FloorRoster";
import { MapControlRow } from "@/components/seat-map/MapControlRow";
import { CanvasStatus, type CanvasNotice } from "@/components/seat-map/CanvasStatus";
import { MapZoomControl } from "@/components/seat-map/MapZoomControl";
import { SeatInspector } from "@/components/seat-map/SeatInspector";
import { SeatMarker, seatPillLabel } from "@/components/seat-map/SeatMarker";
import { ViewerFindPalette } from "@/components/seat-map/ViewerFindPalette";
import { MapStatusBand } from "@/components/seat-map/MapStatusBand";
import { RightSlot } from "@/components/seat-map/RightSlot";
import { PILL_CLEARANCE_PX, PILL_HEIGHT_PX, clearanceFromScale, computeNameLabelNudges, estimatePillWidthPx } from "@/lib/seatCrowding";

type ViewerSeatFinderProps = {
  seats: SeatWithEmployee[];
  employees: Employee[];
  departmentOptions?: DepartmentOption[];
  zoneOptions?: ZoneOption[];
  // Pre-formatted "last publish" date from the server page (viewer-safe copy
  // for the old PUBLISHED/READ-ONLY badge pair).
  lastPublishedLabel?: string | null;
  // Multi-floor (PR-2): the server's view of where to land — the floor a
  // ?seat=/?floor= asks for, and the signed-in person's own floor. The
  // remembered floor is client-only and slots in between (lib/floors
  // landingFloor) once the mount effect has read storage.
  landing?: { urlFloor: FloorId | null; ownFloor: FloorId | null };
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

// Multi-floor (PR-2): the roster region's id — the focus target when a find
// lands on an unseated person — and the plan viewport's accessible name (the
// roster floor has no map to pan, so the viewport carries none there).
const VIEWER_ROSTER_REGION_ID = "viewer-floor-roster";
const MAP_VIEWPORT_LABEL = "Office seat map. Drag to pan. Seat markers are read-only buttons.";

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
  landing
}: ViewerSeatFinderProps) {
  const [search, setSearch] = useState("");
  const [searchShortcutHint, setSearchShortcutHint] = useState<string | null>(null);
  // Focused search scope (D1-d): "This floor" lists this floor's rows, the
  // header always carries both counts.
  const [searchScope, setSearchScope] = useState<SearchScope>("floor");
  // Inline notices over the canvas (Find me: not in the published directory).
  const [canvasNotices, setCanvasNotices] = useState<CanvasNotice[]>([]);
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
  // Multi-floor (PR-2). SSR and the first client render agree on the
  // server's landing floor; the mount effect below then applies the URL and
  // the remembered floor (landingFloor's precedence: ?seat=/?floor= →
  // remembered → own seat → Floor 3) and only then lets the persist effect
  // write — the same hydrated-flag pattern as the names toggle above.
  const [floor, setFloorState] = useState<FloorId>(() =>
    landingFloor({ urlFloor: landing?.urlFloor ?? null, storedFloor: null, ownFloor: landing?.ownFloor ?? null })
  );
  const [floorPreferenceHydrated, setFloorPreferenceHydrated] = useState(false);
  // The floor most recently switched to by a user action, for the live
  // region ("Showing Floor 2 · Litigation"); cleared by the next find.
  const [announcedFloor, setAnnouncedFloor] = useState<FloorId | null>(null);
  // The person a find landed on in the roster. Held explicitly rather than
  // derived from the query results: the palette's People directory opens
  // rows with an EMPTY query, where the results feed is empty (review,
  // 2026-09-01). Cleared by a manual switch and by the next find.
  const [rosterHighlight, setRosterHighlight] = useState<{ employeeId: string; title: string } | null>(null);
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
  const [status, setStatus] = useState("all");
  const mapViewportRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<HTMLDivElement | null>(null);

  const panStateRef = useRef<ViewerPanState>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  // The field WRAPPER, not the input: the palette aligns its left edge to the
  // field's box (contract #2), and outside-click dismissal has to treat the
  // whole field — magnifier, clear button, kbd hint — as "inside".
  const searchFieldRef = useRef<HTMLDivElement | null>(null);
  const paletteRef = useRef<HTMLDivElement | null>(null);
  // The persistent shell (null in standalone harnesses): the left panel the
  // control row's "Filters · N" opens, and the person's published seat for
  // "Find me" (D1-f).
  const shellLeftPanel = useAppShellLeftPanel();
  const shellState = useAppShellState();
  // One-shot: set when Escape hands focus back to the field from inside the
  // palette, consumed by the field's onFocus. Without it the hand-back is
  // indistinguishable from a user focusing the field, so onFocus re-opened the
  // palette in the same frame Escape closed it and Esc looked inert whenever
  // focus was on a row. A ref, not state: it must be readable by the focus
  // handler that `.focus()` dispatches synchronously, before any re-render.
  const suppressPaletteReopenRef = useRef(false);

  const publishedSeats = useMemo(() => seats.map(normalizeSeat), [seats]);
  useEffect(() => {
    const urlFloor = urlFloorFor(publishedSeats, {
      seat: readSeatParam(window.location.search),
      floor: readFloorParam(window.location.search)
    });
    let storedFloor: string | null = null;
    try {
      storedFloor = window.localStorage.getItem(VIEWER_FLOOR_STORAGE_KEY);
    } catch {
      // Ignore unavailable storage; the server's landing floor stands.
    }
    setFloorState(landingFloor({ urlFloor, storedFloor, ownFloor: landing?.ownFloor ?? null }));
    setFloorPreferenceHydrated(true);
    // Mount-only by design: landing is a one-time server hint and the URL is
    // read once, like the ?seat= effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!floorPreferenceHydrated) return;
    try {
      window.localStorage.setItem(VIEWER_FLOOR_STORAGE_KEY, floor);
    } catch {
      // Ignore unavailable storage; this is a local UI preference only.
    }
  }, [floorPreferenceHydrated, floor]);
  // One canvas per floor (DECISIONS.md D1′): the plan and every render-layer
  // derivation below (nudges, tiers, washes, arrow-key points, markers) see
  // ONLY this floor's seats — `visualSeats` keeps its name and its meaning.
  // The building-wide map exists for id lookups that cross floors (centring
  // a seat a find just switched to, the inspector nudge).
  const surface = floorSurface(floor, publishedSeats);
  const floorMeta = FLOORS[floor];
  const plan = floorMeta.plan;
  const floorSeats = useMemo(() => publishedSeats.filter(seat => floorOf(seat) === floor), [floor, publishedSeats]);
  const visualSeats = useMemo(() => seatsToVisualSeats(floorSeats), [floorSeats]);
  const buildingVisualSeats = useMemo(() => seatsToVisualSeats(publishedSeats), [publishedSeats]);
  const visualSeatById = useMemo(() => new Map(buildingVisualSeats.map(seat => [seat.id, seat])), [buildingVisualSeats]);
  // The people an unmapped floor lists (lib/floors: seated there, plus — on
  // the roster floor — everyone active with no published seat).
  const rosterPeople = useMemo(
    () => (surface === "roster" ? peopleOnFloor(floor, publishedSeats, employees) : []),
    [employees, floor, publishedSeats, surface]
  );
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
  // Phase 4 PR 3b: ONE pill layer (PHASE3DS §1.16) — the text tier and the
  // pitch-gated 44px hit floor retired with the code pills; every marker
  // carries the asset's touch target and the collision graph models each
  // pill at its own estimated width.
  const seatDensityClearance = useMemo(
    () => clearanceFromScale(mapRenderedWidth ?? 0, (mapRenderedWidth ?? 0) * (MAP_IMAGE_HEIGHT / MAP_IMAGE_WIDTH), PILL_CLEARANCE_PX),
    [mapRenderedWidth]
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

  // The PERSON facets alone (department, position) — what the roster floor
  // filters by, and what decides whether a zero on this floor is the
  // department's absence or a zone/status choice.
  const seatPassesPersonFacets = useCallback((seat: SeatWithEmployee) => {
    // departmentKey on both sides (the same normalisation the facet options
    // and the roster use), not a bare toLowerCase — sweep defect 5.
    const departmentOk = department === "all" || departmentKey(getSeatDepartment(seat)) === departmentKey(department);
    return departmentOk && seatMatchesPosition(seat.employee?.position, position);
  }, [department, position]);

  const seatPassesStructuredFilters = useCallback((seat: SeatWithEmployee) => {
    const personOk = seatPassesPersonFacets(seat);
    // zoneKey on BOTH sides, not raw ===: the palette's chips aggregate on
    // that key and render the first spelling seen, so a chip built from an
    // active zone option could count a seat whose own `zone` differs only in
    // case or padding — and then filter that same seat out when pinned.
    const zoneOk = zone === "all" || zoneKey(getSeatZone(seat)) === zoneKey(zone);
    const statusOk = status === "all" || seat.status === (status as SeatStatus);
    return personOk && zoneOk && statusOk;
  }, [seatPassesPersonFacets, status, zone]);

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
  // Name-label collision nudges (render-layer only): prominent tokens plus,
  // with the legend's Show-names toggle on, every visible occupant name —
  // nudged at the same live zoom-aware clearance as the code graph (parity
  // with the admin map).
  const nameLabelNudges = useMemo(
    () => computeNameLabelNudges(visualSeats, namedSeatIdSet, seatDensityClearance, {
      widthPx: seat => seat.employee ? estimatePillWidthPx(seatPillLabel(seat)) : PILL_HEIGHT_PX,
      pixelsPerXUnit: mapRenderedWidth ?? 0
    }),
    [mapRenderedWidth, namedSeatIdSet, seatDensityClearance, visualSeats]
  );

  // "X selected on the map" is true for a selected seat (named by its result
  // card when it came from one) and for a department/zone card that fit its
  // set into view; a person card names no selection unless a seat is selected.
  const selectedResultTitle = selectedSeat
    ? activeResult?.title ?? selectedSeat.label
    : activeResult && activeResult.kind !== "person"
      ? activeResult.title
      : null;
  // Legend counts follow the active filters — the one number row everyone
  // reads must not contradict a filtered map (2026-07-16 regrade, review 4).
  const statusCountSeats = structuredFiltersActive ? floorSeats.filter(seatPassesStructuredFilters) : floorSeats;
  const floorHighlightedCount = floorSeats.filter(seat => highlightedSeatIdSet.has(seat.id)).length;
  // Q5 (closed 2026-09-01): the popover's match line is floor-aware — when a
  // department has no seats on this floor but people on the other, it says so
  // and offers the switch (lib/floors floorDepartmentSummary).
  const departmentSummary = floorDepartmentSummary({
    floor,
    department,
    position,
    floorMatchCount: statusCountSeats.length,
    floorDepartmentMatchCount: floorSeats.filter(seatPassesPersonFacets).length,
    floorSeatCount: floorSeats.length,
    seats: publishedSeats,
    employees
  });
  // On the roster floor the department and position facets filter people
  // (zone and status describe seats and are hidden there). The person a
  // find just landed on is exempt — the same rule that keeps the selected
  // seat undimmed under a filter on the plan.
  const rosterRows = useMemo(
    () => rosterPeople.filter(person => person.id === rosterHighlight?.employeeId || personPassesFilters(person, { department, position })),
    [department, position, rosterHighlight, rosterPeople]
  );
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
      setSearchShortcutHint(shortcutHint(window.navigator.platform, "K"));
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
  }, [paletteOpen, search, selectedSeatId, structuredFiltersActive]);

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
    const viewport = mapViewportRef.current;
    const map = mapRef.current;
    if (!viewport || !map) return;

    const clampScrollPosition = (value: number, max: number) => Math.min(Math.max(value, 0), Math.max(max, 0));
    const left = clampScrollPosition((x * map.offsetWidth) - (viewport.clientWidth / 2), viewport.scrollWidth - viewport.clientWidth);
    const top = clampScrollPosition((y * map.offsetHeight) - (viewport.clientHeight / 2), viewport.scrollHeight - viewport.clientHeight);
    viewport.scrollTo({ left, top, behavior });
  }, []);

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
    window.requestAnimationFrame(() => scrollMapToPoint((bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2));
  }, [centerSeatInMap, scrollMapToPoint, visualSeatById]);

  // Multi-floor: one switch path for the selector, finds, deep links and the
  // Q5 action. Selection, hover, roving anchor and zoom belong to the canvas
  // being left; the query and the structured filters span the building and
  // survive. Announced through the live region unless the caller is about to
  // announce something more specific (a selected seat, a highlighted person).
  const switchFloor = useCallback((next: FloorId, options: { announce?: boolean } = {}) => {
    if (next === floor) return;
    setFloorState(next);
    setSelectedSeatId(null);
    setInspectorCollapsed(false);
    setHoverSeatId(null);
    setRovingSeatId(null);
    setZoomFactor(null);
    if (options.announce === false) {
      setAnnouncedFloor(null);
    } else {
      // A MANUAL switch (selector, Q5 action) leaves the find behind: the
      // result card and the roster mark belong to the canvas being left,
      // and the live region must say where the user is now, not what they
      // found before.
      setActiveResultId(null);
      setRosterHighlight(null);
      setAnnouncedFloor(next);
    }
    window.requestAnimationFrame(() => {
      mapViewportRef.current?.scrollTo({ left: 0, top: 0, behavior: "auto" });
    });
  }, [floor]);
  const summarySwitchTo = departmentSummary.switchTo;
  const departmentSummaryAction = summarySwitchTo
    ? {
        label: `Show ${FLOORS[summarySwitchTo].tag}`,
        onClick: () => switchFloor(summarySwitchTo)
      }
    : undefined;

  function applyMapZoom(nextZoom: number) {
    setZoomFactor(clampZoom(nextZoom));
  }

  function fitMapToView() {
    setZoomFactor(null);
    window.requestAnimationFrame(() => {
      mapViewportRef.current?.scrollTo({ left: 0, top: 0, behavior: "auto" });
    });
  }

  function isPanBlockedTarget(target: EventTarget | null) {
    return target instanceof Element && Boolean(target.closest("button, a, input, select, textarea, [data-seat-id]"));
  }

  function handleViewportPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (surface !== "plan" || event.button !== 0) return;
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
    setAnnouncedFloor(null);
    setRosterHighlight(null);
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
    setAnnouncedFloor(null);
    setRosterHighlight(null);
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
    setPaletteOpen(false);
    // The chip unmounts with the palette, so a keyboard pin ("Enter to
    // filter", the eyebrow's own invitation) would drop focus to <body> —
    // the same fall every other close path already guards. Return it to the
    // field, exactly as openResult's department/zone rows do; the suppress
    // flag is load-bearing there and here for the same reason: the field's
    // onFocus re-opens the palette this pin just closed.
    suppressPaletteReopenRef.current = true;
    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      suppressPaletteReopenRef.current = false;
    });
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
    // A deep link or a find can name a seat on the other floor: switch first,
    // then select — the selection written below outlives the switch's clears
    // because it lands later in the same batch.
    const targetSeat = seatById.get(seatId);
    if (targetSeat && floorOf(targetSeat) !== floor) switchFloor(floorOf(targetSeat), { announce: false });
    setAnnouncedFloor(null);
    setRosterHighlight(null);
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
    centerSeatInMap(seatId);
  }

  // Deep-link (#196): same `?seat=<label>` contract as the admin map — read
  // once on mount, then mirror selection changes with a shallow replaceState.
  const seatParamAppliedRef = useRef(false);
  // ?q= (D1-d landing): the field pre-fills and the palette opens; a unique
  // match auto-selects (the effect below, once the results exist). ?names=off
  // overrides the stored preference for this load only.
  const landingQueryRef = useRef<string | null>(null);
  useEffect(() => {
    const query = readQueryParam(window.location.search);
    if (query) {
      landingQueryRef.current = query;
      setSearch(query);
      setPaletteOpen(true);
    }
    const names = readNamesParam(window.location.search);
    if (names !== null) setShowNames(names);
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

  // ONE writer for the B3 set (lib/mapUrlState): ?floor= ?seat= ?q= ?names=
  // and the four filters compose into a single replaceState once every
  // hydration read has happened — no more racing effects over
  // window.location.search. The query is written debounced so a typist does
  // not churn history state per keystroke.
  const [filtersHydrated, setFiltersHydrated] = useState(false);
  useEffect(() => {
    if (!seatParamAppliedRef.current || !floorPreferenceHydrated || !filtersHydrated || !namesPreferenceHydrated) return;
    const write = () => {
      const label = selectedSeatId ? (publishedSeats.find(seat => seat.id === selectedSeatId)?.label ?? null) : null;
      const next = nextMapHref(window.location, { floor, seatLabel: label, query: search, namesVisible: showNames, filters: { department, position, zone, status } });
      if (next) window.history.replaceState(window.history.state, "", next);
    };
    if (!search) {
      write();
      return;
    }
    const timer = window.setTimeout(write, 150);
    return () => window.clearTimeout(timer);
    // publishedSeats omitted: a seat's label is stable for the life of its id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [department, filtersHydrated, floor, floorPreferenceHydrated, namesPreferenceHydrated, position, search, selectedSeatId, showNames, status, zone]);

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
        focusViewerSeatMarker(nextSeatId);
      }
      return;
    }

    // Home / End: the reading-order edges (PHASE2UX §1M.11, parity with /admin).
    const edge = edgeKeyToPosition(event.key);
    if (edge) {
      event.preventDefault();
      event.stopPropagation();
      const edgeSeatId = seatAtReadingEdge(seatNavPoints, edge);
      if (edgeSeatId) {
        setRovingSeatId(edgeSeatId);
        focusViewerSeatMarker(edgeSeatId);
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
    setAnnouncedFloor(null);
    setRosterHighlight(null);
    // Enter/click on a row selects, centers and closes the palette
    // (contract #5) — including the department/zone rows below, which fit
    // their whole match set into view instead of selecting one seat.
    setPaletteOpen(false);
    // The find spans the building (D1′): a hit on the other floor switches
    // the canvas first. A seat's floor is authoritative; an unseated person
    // carries the floor they work on; a department/zone row carries a floor
    // only when every seat in it shares one.
    const targetSeat = result.seatId ? seatById.get(result.seatId) ?? null : null;
    const targetFloor = targetSeat ? floorOf(targetSeat) : result.floor;
    if (targetFloor && targetFloor !== floor) switchFloor(targetFloor, { announce: false });
    const openedFloor = targetFloor ?? floor;
    if (result.seatId) {
      // Finding 1: same race as selectSeat above, same "only if actually
      // changing" guard (re-opening the currently selected seat's own
      // result row must not arm a flag no future effect run will consume).
      const isNewSelection = selectedSeatId !== result.seatId;
      setSelectedSeatId(result.seatId);
      setInspectorCollapsed(false);
      if (isNewSelection) {
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
    if (result.kind === "person" && targetFloor && result.employeeId) {
      // An unseated person on the roster floor: the row is the destination.
      // The target is held explicitly (browse rows have no query result to
      // derive it from); focus lands on the roster region rather than
      // falling to <body> with the palette.
      setRosterHighlight({ employeeId: result.employeeId, title: result.title });
      setInspectorCollapsed(false);
      focusFloorRoster(VIEWER_ROSTER_REGION_ID);
      return;
    }
    fitSeatIdsInMap(result.seatIds.filter(seatId => {
      const seat = seatById.get(seatId);
      return seat ? floorOf(seat) === openedFloor : false;
    }));
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

  // --- Shell registration (redesign-v2 PR 2) --------------------------------
  // The four structured filters are URL state (PHASE1IA B3: ?dept= ?zone=
  // ?status= ?position=): read once after hydration (like ?floor=); the one
  // writer above mirrors them back.
  useEffect(() => {
    const fromUrl = readFilterParams(window.location.search);
    setDepartment(fromUrl.department);
    setPosition(fromUrl.position);
    setZone(fromUrl.zone);
    setStatus(fromUrl.status);
    setFiltersHydrated(true);
  }, []);
  // The left panel's four groups (Department · Zone · Status · Position, owner
  // ruling 2026-09-04) with per-floor counts; single-select semantics kept —
  // re-checking the checked item clears the group. The roster floor hides the
  // seat facets and says why; on the plan the floor-aware match summary (Q5)
  // rides the note so a filter never returns an unchanged map in silence.
  const filterGroups = useMemo(
    () =>
      buildViewerFilterGroups({
        surface,
        floorSeats,
        floorPeople: rosterPeople,
        departments,
        positions,
        zones,
        seatZone: getSeatZone,
        seatDepartment: getSeatDepartment,
        selected: { department, position, zone, status }
      }),
    [department, departments, floorSeats, position, positions, rosterPeople, status, surface, zone, zones]
  );
  const shellFilterSpec = useMemo<ShellFilterSpec>(() => {
    const setters: Record<string, (value: string) => void> = { department: setDepartment, position: setPosition, zone: setZone, status: setStatus };
    const values: Record<string, string> = { department, position, zone, status };
    return {
      groups: filterGroups,
      appliedCount: structuredFilterCount,
      note:
        surface === "roster"
          ? `Zone and status are seat facts — ${floorMeta.tag} has no seats yet.`
          : structuredFiltersActive && departmentSummary.text
            ? departmentSummary.text
            : undefined,
      noteAction: surface === "plan" && structuredFiltersActive ? departmentSummaryAction : undefined,
      onToggle: (groupId, itemId) => setters[groupId]?.(values[groupId] === itemId ? "all" : itemId),
      onClearGroup: groupId => setters[groupId]?.("all"),
      onClearAll: clearStructuredFilters
    };
  }, [department, departmentSummary.text, departmentSummaryAction, filterGroups, floorMeta.tag, position, status, structuredFilterCount, structuredFiltersActive, surface, zone]);
  useAppShellFilters(shellFilterSpec);

  const resultCountLabel = searchResults.results.length === 1 ? "1 result" : `${searchResults.results.length} results`;
  // D1-d scope: the palette lists this floor's rows or the whole building's;
  // both counts always travel with the header (lib/mapSearchScope).
  const scopedResults = useMemo(() => scopeResults(searchResults.results, floor, searchScope), [floor, searchResults.results, searchScope]);
  // ?q= landing, second half: a unique match opens itself once the results
  // exist (seat → inspector; unseated person → roster row); several stay a
  // list; zero shows the zero state with the query kept.
  useEffect(() => {
    const query = landingQueryRef.current;
    if (!query || search !== query || !floorPreferenceHydrated) return;
    landingQueryRef.current = null;
    if (searchResults.results.length === 1) openResult(searchResults.results[0]);
    // openResult is a render-scope function; the landing runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floorPreferenceHydrated, search, searchResults.results]);
  // The row's result count — "22 of 68 seats match" while search or filters
  // narrow the map, "68 seats" otherwise; people on the roster floor
  // (PHASE2UX §1M.3). aria-live: filter-feedback-source's guardrail.
  const controlCountText = surface === "roster"
    ? `${rosterRows.length} ${rosterRows.length === 1 ? "person" : "people"}`
    : filtersActive
      ? `${floorHighlightedCount} of ${floorSeats.length} seats match`
      : `${floorSeats.length} ${floorSeats.length === 1 ? "seat" : "seats"}`;
  // Find me (D1-f): seated → own seat selected, inspector open; unseated →
  // the roster floor with the row highlighted; not in the published
  // directory → an inline notice in the map region.
  function findMe() {
    const email = shellState?.email ?? null;
    const me = email ? findEmployeeByEmail(employees, email) : null;
    if (!me) {
      setCanvasNotices([{ id: "find-me", kind: "info", text: "Your account isn't in the published directory. Ask an admin.", onDismiss: () => setCanvasNotices([]) }]);
      return;
    }
    setCanvasNotices([]);
    const mySeat = findSeatForEmployee(publishedSeats, me.id);
    if (mySeat) {
      selectSeat(mySeat.id);
      return;
    }
    const rosterFloor = rosterFloorForUnseated(publishedSeats);
    if (!rosterFloor) return;
    if (rosterFloor !== floor) switchFloor(rosterFloor, { announce: false });
    setSelectedSeatId(null);
    setRosterHighlight({ employeeId: me.id, title: formatDisplayName(me.full_name) });
    setInspectorCollapsed(false);
    focusFloorRoster(VIEWER_ROSTER_REGION_ID);
  }
  // The roster row a find landed on (an unseated person opened from the
  // palette, in either mode) — only while that person is actually listed.
  const rosterHighlightedPersonId =
    surface === "roster" && rosterHighlight && rosterRows.some(person => person.id === rosterHighlight.employeeId)
      ? rosterHighlight.employeeId
      : null;
  // Priority: highlighted roster row → selected seat → floor switch → search
  // count → what loaded.
  const mapAnnouncement = rosterHighlightedPersonId && rosterHighlight
    ? `${rosterHighlight.title} highlighted on the ${floorMeta.label} roster.`
    : selectedResultTitle
      ? `${selectedResultTitle} selected on the map.`
      : announcedFloor
        ? `Showing ${FLOORS[announcedFloor].label}.`
        : searchActive
          ? `${resultCountLabel} for ${search}.`
          : surface === "roster"
            ? `${rosterRows.length} ${rosterRows.length === 1 ? "person" : "people"} listed on ${floorMeta.tag}.`
            : `${floorSeats.length} seats loaded on ${floorMeta.tag}.`;
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
  // Phase 4 PR 3b: the inspector is the right slot over the canvas column —
  // the band never yields to a sheet.
  const statusBandVisible = bandTier;

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
    "relative mx-auto w-full max-w-full overscroll-contain bg-[var(--sp-map-mat)]",
    // The plan scrolls in the viewport; the roster is its own scroll region
    // (focusable, so the keyboard scrolls the list it is reading).
    surface === "plan" ? "overflow-auto" : "overflow-hidden",
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
    surface === "plan" ? (panning ? "cursor-grabbing" : "cursor-grab") : "",
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
  // The 400 right slot (C9): the inspector while a seat is selected. The
  // canvas column is pushed while it is open; the band below never reflows.
  const slotOpen = Boolean(selectedSeat) && !inspectorCollapsed;
  const canvasColumnClassName = ["relative flex min-w-0 flex-col lg:min-h-0 lg:flex-1", slotOpen ? "lg:pr-[var(--sp-slot-w)]" : ""].filter(Boolean).join(" ");

  return (
    /* overflow-x-CLIP, not -hidden: hidden makes this div a scroll container,
       which captures the sticky header so it never pins to the viewport. */
    <div className="flex min-h-0 flex-1 flex-col overflow-x-clip bg-[var(--sp-background)] text-[var(--sp-text-primary)] lg:overflow-hidden">
      {/* The control row (PHASE2UX §1M.3, PR 3a): floor · search · Filters ·
          count · Find me · Names — in the page, 48px under the shell header.
          The four filter groups register with the shell's left panel
          (useAppShellFilters above); "Filters · N" is that panel's second
          door. This surface renders no header of its own. */}
      <MapControlRow
        floor={floor}
        onFloorChange={next => switchFloor(next)}
        search={{
          value: search,
          onChange: updateSearch,
          onClear: clearSearch,
          scope: searchScope,
          onScopeChange: setSearchScope,
          hint: searchShortcutHint,
          placeholder: SEAT_SEARCH_PLACEHOLDER,
          inputId: "viewer-seat-search",
          inputRef: searchInputRef,
          rootRef: searchFieldRef,
          paletteOpen,
          paletteId: paletteOpen ? "viewer-find-palette" : undefined,
          onOpenPalette: () => {
            if (suppressPaletteReopenRef.current) return;
            setPaletteOpen(true);
          },
          onClosePalette: () => setPaletteOpen(false),
          onArrowDown: () => {
            window.requestAnimationFrame(() => {
              document.querySelector<HTMLButtonElement>('[aria-label="Viewer search results"] button:not([disabled]), [aria-label="People directory"] button:not([disabled])')?.focus();
            });
          },
          onEnter: () => {
            if (scopedResults.shown.length > 0) openResult(scopedResults.shown[0]);
          },
          ariaLabel: "Viewer search"
        }}
        filters={{ appliedCount: structuredFilterCount, onOpen: () => shellLeftPanel?.open(), onClear: clearStructuredFilters, panelOpen: shellLeftPanel?.isOpen ?? false }}
        count={{ text: controlCountText, live: true }}
        onFindMe={findMe}
        names={{ pressed: showNames, hidden: surface === "roster", onToggle: () => setShowNames(current => !current) }}
      />

      {/* No matting, and no reserved gutter either (v12 Find palette): the
          stage column runs to the window edges at every width now that nothing
          docks beside it. */}
      <div className="flex w-full flex-1 flex-col lg:min-h-0 lg:overflow-hidden">
        <main className="flex min-w-0 flex-1 flex-col lg:min-h-0 lg:overflow-hidden">
          {/* Inside <main>, not above the header: page content outside every
              landmark trips axe's region rule. */}
          <h1 className="sr-only">Seat Planner — office map</h1>

          <div className={mapStageClassName}>
          <div className={canvasColumnClassName}>
            {/* Inline notices over the canvas (PHASE3DS §1.21): Find me's
                not-in-directory line lands here, in the region being read. */}
            <CanvasStatus notices={canvasNotices} />
            <div
              ref={mapViewportRef}
              id="viewer-seat-map"
              // The roster floor has no map to pan: the roster region inside
              // is the tab stop instead (Hidden, not disabled).
              tabIndex={surface === "plan" ? 0 : -1}
              aria-label={surface === "plan" ? MAP_VIEWPORT_LABEL : undefined}
              className={mapViewportClassName}
              onPointerDown={handleViewportPointerDown}
              onPointerMove={handleViewportPointerMove}
              onPointerUp={handleViewportPointerEnd}
              onPointerCancel={handleViewportPointerEnd}
            >
              {surface === "roster" && (
                <FloorRoster
                  floor={floor}
                  people={rosterRows}
                  query={search}
                  highlightedPersonId={rosterHighlightedPersonId}
                  helper={floorMeta.mapped ? "Nothing on this floor has been published yet." : `The ${floorOrdinal(floor)}-floor plan is not mapped yet.`}
                  regionId={VIEWER_ROSTER_REGION_ID}
                  onClearSearch={clearSearch}
                  totalCount={rosterPeople.length}
                  filtersActive={structuredFiltersActive}
                  onClearFilters={clearStructuredFilters}
                />
              )}
              {surface === "plan" && plan && (
                <div ref={mapRef} className={mapFrameClassName} style={mapFrameStyle}>
                  <Image
                    src={plan.src}
                    alt="Office floor plan"
                    width={plan.width}
                    height={plan.height}
                    priority
                    fetchPriority="high"
                    unoptimized
                    placeholder="blur"
                    blurDataURL={plan.blurDataUrl}
                    className="map-raster block h-auto w-full select-none"
                    draggable={false}
                  />


                  {/* AUDIT-2 §8.2 first-run moved to the roster (multi-floor
                      PR-2): a floor renders its plan only once a seat is
                      published on it, so a never-published map is the roster's
                      first-run state, which names the state and who acts. */}

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
                          nameNudge={nameLabelNudges.get(seat.id) ?? 0}
                          swapMode={false}
                          moveEmployeeMode={false}
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
                to follow is gone. Stage-level, not inside the plan branch: the
                announcement has to survive a floor switch — it is what says
                "Showing Floor 2 · Litigation". */}
            <p className="sr-only" aria-live="polite">{mapAnnouncement}</p>
            {/* Phones only (band >=640 owns zoom there — owner call
                2026-08-17): the shipped floating stack, unchanged. Flat
                bottom-3 at the panel tier is vestigial while this is
                phone-gated but harmless; the home-indicator inset is the part
                that matters — the safe area is still an obstruction (#198). */}
            {surface === "plan" && !bandTier && (
              <div className="absolute right-3 z-30 flex flex-col items-end gap-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] panel:bottom-3">
                {/* The Names toggle lives in the control row at every width
                    (PR 3a) — exactly one names control is mounted. */}
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
            </div>
            {/* The right slot (PHASE3DS §1.17): the published inspector, over
                the canvas column only — the band below stays uncovered. */}
            <RightSlot open={slotOpen}>
              {slotOpen && (
              <SeatInspector
                seat={selectedSeat}
                seats={publishedSeats}
                employees={employees}
                departmentOptions={departmentOptions}
                canEdit={false}
                collapsed={inspectorCollapsed}
                onClose={() => {
                  focusViewerSeatMarker(selectedSeatId);
                  setSelectedSeatId(null);
                  setInspectorCollapsed(false);
                }}
              />
              )}
            </RightSlot>
            {/* The status band (Option A): the in-flow bottom row that
                replaced the floating legend card + floating zoom stack from
                sm up. Counts still come from statusCountSeats, which follows
                the active filters — the one number row everyone reads must
                never contradict a filtered map. Gated to Floor 3 (Floor 2 is
                the placeholder, where whole-map counts would read as a bug)
                and to statusBandVisible (band tier + sheet yield above).
                Viewer-shaped: no draft entry and no data verbs; the names
                toggle stays a render-local view control only. */}
            {statusBandVisible && surface === "plan" && (
              <MapStatusBand
                ariaLabel="Seat status summary"
                totalLabel={`${floorMeta.tag} · ${statusCountSeats.length} ${statusCountSeats.length === 1 ? "seat" : "seats"}`}
                entries={[
                  { key: "assigned", label: STATUS_LABELS.assigned, mark: "assigned", count: assignedCount },
                  { key: "available", label: STATUS_LABELS.available, mark: "open", count: openCount },
                  { key: "reserved", label: STATUS_LABELS.reserved, mark: "reserved", count: reservedCount }
                ]}
                namesVisible={showNames}
                count={controlCountText}
                actions={filtersActive ? (
                  <button type="button" className="cds-btn cds-btn--ghost cds-btn--sm" onClick={clearAllConstraints}>
                    {searchActive && structuredFiltersActive ? "Clear all" : searchActive ? "Clear search" : "Clear filters"}
                  </button>
                ) : null}
                note={structuredFiltersActive && departmentSummary.switchTo ? departmentSummary.text : undefined}
                noteAction={structuredFiltersActive && departmentSummaryAction ? (
                  <button type="button" className="cds-btn cds-btn--ghost cds-btn--sm" onClick={departmentSummaryAction.onClick}>{departmentSummaryAction.label}</button>
                ) : null}
                controls={
                  <>
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
            {/* Roster floor: title-only band (no map to control — Hidden
                tier, not disabled); the count follows the active filters like
                the plan's does. */}
            {statusBandVisible && surface === "roster" && (
              <MapStatusBand
                ariaLabel="Floor summary"
                totalLabel={`${floorMeta.label} · ${rosterRows.length} ${rosterRows.length === 1 ? "person" : "people"}`}
                entries={[]}
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
          results={scopedResults.shown}
          resultCountLabel={resultCountLabel}
          mappedSeatCount={searchResults.resultSeatIds.length}
          activeResultId={activeResultId}
          selectedSeatId={selectedSeatId}
          pinnedZone={zone}
          onZonePin={pinZoneFromPalette}
          onRowHoverChange={setHoverSeatId}
          onOpenRow={openResult}
          onClearSearch={clearSearch}
          currentFloor={floor}
          scope={searchScope}
          scopeCounts={{ onFloor: scopedResults.onFloor, inBuilding: scopedResults.inBuilding }}
          onWiden={() => setSearchScope("building")}
        />
      )}

    </div>
  );
}
