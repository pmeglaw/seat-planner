// Deep-link query params (#196): `?seat=<label>` on the map surfaces and
// `?tab=<tab>` on Management. Pure helpers so SeatMap, ViewerSeatFinder, and
// AdminManagementPanel share one contract; components apply the results with
// history.replaceState (a shallow URL write — no router navigation, so no
// server refetch and no history spam per selection).

export const SEAT_PARAM = "seat";
export const TAB_PARAM = "tab";
// `?floor=<id>` on the map surfaces (multi-floor PR-2). Read raw here —
// callers sanitize through lib/floorIds isFloorId — so this module stays
// free of the registry. Landing precedence (?seat= → ?floor= → remembered →
// own seat → Floor 3) lives in lib/floors landingFloor.
export const FLOOR_PARAM = "floor";

type SeatLike = { id: string; label: string };

// Seat labels are unique per layer and human-shareable ("W08"), so they are
// the param value rather than row ids, matched case-insensitively.
export function findSeatIdByParam(seats: readonly SeatLike[], param: string | null | undefined): string | null {
  const wanted = param?.trim().toLowerCase();
  if (!wanted) return null;
  return seats.find(seat => seat.label.toLowerCase() === wanted)?.id ?? null;
}

export function readSeatParam(search: string): string | null {
  return new URLSearchParams(search).get(SEAT_PARAM);
}

function serialize(params: URLSearchParams): string {
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function withSeatParam(search: string, label: string | null): string {
  const params = new URLSearchParams(search);
  if (label) params.set(SEAT_PARAM, label);
  else params.delete(SEAT_PARAM);
  return serialize(params);
}

export function readFloorParam(search: string): string | null {
  return new URLSearchParams(search).get(FLOOR_PARAM);
}

// Callers pass null for the default floor so the bare URL stays canonical —
// the same rule withTabParam applies to the default tab.
export function withFloorParam(search: string, floor: string | null): string {
  const params = new URLSearchParams(search);
  if (floor) params.set(FLOOR_PARAM, floor);
  else params.delete(FLOOR_PARAM);
  return serialize(params);
}

// ?q=<text> on / and /admin (PHASE1IA B3; DECISIONS D1-d landing rule; Phase 4
// PR 3a): the search text is shareable. Empty or whitespace = absent. The
// landing behaviour (field pre-filled, palette open, a unique match
// auto-selects) lives in the surfaces; this module only carries the string.
export const QUERY_PARAM = "q";

export function readQueryParam(search: string): string {
  return new URLSearchParams(search).get(QUERY_PARAM)?.trim() ?? "";
}

export function withQueryParam(search: string, query: string): string {
  const params = new URLSearchParams(search);
  const value = query.trim();
  if (value) params.set(QUERY_PARAM, value);
  else params.delete(QUERY_PARAM);
  return serialize(params);
}

// ?names=on (B3): the names-on-markers toggle is shareable in its ON state
// only — off is the default on both surfaces (a remembered preference), so
// the bare URL stays canonical and a shared link never forces names OFF for
// someone who turned them on. readNamesParam returns null when the URL says
// nothing (the stored preference stands); "off" is still honoured on read.
export const NAMES_PARAM = "names";

export function readNamesParam(search: string): boolean | null {
  const value = new URLSearchParams(search).get(NAMES_PARAM)?.trim().toLowerCase();
  if (value === "on") return true;
  if (value === "off") return false;
  return null;
}

export function withNamesParam(search: string, namesVisible: boolean): string {
  const params = new URLSearchParams(search);
  if (namesVisible) params.set(NAMES_PARAM, "on");
  else params.delete(NAMES_PARAM);
  return serialize(params);
}

// The registry's default floor as the URL sees it; lib/floors owns the
// registry, this module only needs the one value the bare URL implies.
export const DEFAULT_FLOOR_PARAM_VALUE = "3";

// The default tab stays paramless so the bare /admin/management URL remains
// canonical (and existing ?tab= reads keep working unchanged).
export function withTabParam(search: string, tab: string, defaultTab: string): string {
  const params = new URLSearchParams(search);
  if (tab === defaultTab) params.delete(TAB_PARAM);
  else params.set(TAB_PARAM, tab);
  return serialize(params);
}

// ?dept= / ?zone= / ?status= / ?position= on the viewer (PHASE1IA B3, the
// filter-panel URL state; ?position= joined by owner ruling 2026-09-04). The
// four structured filters of the left panel are shareable, one param each,
// "all" = absent so the bare URL stays canonical. Read raw; the viewer
// matches values against its option lists the same way it matches a typed
// facet (departmentKey / zoneKey), so an unknown value simply filters to
// nothing and the count says so.
export const FILTER_PARAMS = { department: "dept", position: "position", zone: "zone", status: "status" } as const;

export type FilterParamValues = Record<keyof typeof FILTER_PARAMS, string>;

export function readFilterParams(search: string): FilterParamValues {
  const params = new URLSearchParams(search);
  const read = (key: keyof typeof FILTER_PARAMS) => {
    const value = params.get(FILTER_PARAMS[key])?.trim();
    return value ? value : "all";
  };
  return { department: read("department"), position: read("position"), zone: read("zone"), status: read("status") };
}

export function withFilterParams(search: string, values: FilterParamValues): string {
  const params = new URLSearchParams(search);
  for (const key of Object.keys(FILTER_PARAMS) as Array<keyof typeof FILTER_PARAMS>) {
    const value = values[key];
    if (value && value !== "all") params.set(FILTER_PARAMS[key], value);
    else params.delete(FILTER_PARAMS[key]);
  }
  return serialize(params);
}
