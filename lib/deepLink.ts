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

// The default tab stays paramless so the bare /admin/management URL remains
// canonical (and existing ?tab= reads keep working unchanged).
export function withTabParam(search: string, tab: string, defaultTab: string): string {
  const params = new URLSearchParams(search);
  if (tab === defaultTab) params.delete(TAB_PARAM);
  else params.set(TAB_PARAM, tab);
  return serialize(params);
}
