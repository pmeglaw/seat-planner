// Deep-link query params (#196): `?seat=<label>` on the map surfaces and
// `?tab=<tab>` on Management. Pure helpers so SeatMap, ViewerSeatFinder, and
// AdminManagementPanel share one contract; components apply the results with
// history.replaceState (a shallow URL write — no router navigation, so no
// server refetch and no history spam per selection).

export const SEAT_PARAM = "seat";
export const TAB_PARAM = "tab";

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

// The default tab stays paramless so the bare /admin/management URL remains
// canonical (and existing ?tab= reads keep working unchanged).
export function withTabParam(search: string, tab: string, defaultTab: string): string {
  const params = new URLSearchParams(search);
  if (tab === defaultTab) params.delete(TAB_PARAM);
  else params.set(TAB_PARAM, tab);
  return serialize(params);
}
