// One writer for the map's URL state (PHASE1IA B3: view, filters, selection,
// query — ?floor= ?seat= ?q= ?names= ?dept= ?zone= ?status= ?position=).
// Phase 4 PR 3a: the viewer used to run two unordered replaceState effects
// over window.location.search (seat + floor, then the filters); with ?q= and
// ?names= joining the contract, every surface composes the whole search
// string through this module and writes it once. Pure: the caller passes the
// current search and applies the result with history.replaceState.

import {
  DEFAULT_FLOOR_PARAM_VALUE,
  withFilterParams,
  withFloorParam,
  withNamesParam,
  withQueryParam,
  withSeatParam,
  type FilterParamValues
} from "@/lib/deepLink";

export type MapUrlState = {
  floor: string;               // the current floor id; omitted from the URL at the default floor
  seatLabel: string | null;    // the selected seat's label, or null
  query: string;               // the search text; empty = absent
  namesVisible: boolean;       // true = absent (the stored preference); false = ?names=off
  filters: FilterParamValues;  // "all" = absent
};

export const MAP_URL_KEYS = ["floor", "seat", "q", "names", "dept", "zone", "status", "position"] as const;

export function composeMapSearch(currentSearch: string, state: MapUrlState): string {
  let search = withSeatParam(currentSearch, state.seatLabel);
  search = withFloorParam(search, state.floor === DEFAULT_FLOOR_PARAM_VALUE ? null : state.floor);
  search = withQueryParam(search, state.query);
  search = withNamesParam(search, state.namesVisible);
  search = withFilterParams(search, state.filters);
  return search;
}

// The full href the surface writes; unchanged input returns null so the
// caller can skip the replaceState (no history churn, no re-render).
export function nextMapHref(location: { pathname: string; search: string; hash: string }, state: MapUrlState): string | null {
  const search = composeMapSearch(location.search, state);
  const next = `${location.pathname}${search}${location.hash}`;
  const current = `${location.pathname}${location.search}${location.hash}`;
  return next === current ? null : next;
}

// The History switch (AppShell.switchMode) keeps the whole B3 set when it
// hops between / and /admin — the view, the query and the filters all travel.
export function keepMapParams(search: string): string {
  const params = new URLSearchParams(search);
  const kept = new URLSearchParams();
  for (const key of MAP_URL_KEYS) {
    const value = params.get(key);
    if (value) kept.set(key, value);
  }
  const query = kept.toString();
  return query ? `?${query}` : "";
}
