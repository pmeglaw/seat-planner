import { departmentKey } from "@/lib/departments";
import { seatMatchesPosition } from "@/lib/positions";
import type { SeatStatus, SeatWithEmployee } from "@/lib/types";

// The seat-map filter predicate and the derived facts about which filters are
// active. Pure: no React, no DOM, no server calls — a seat and a criteria
// object in, a boolean or a count out.
//
// It lives here because the map, the legend, the result list and the filter
// chips must all agree on "is this seat filtered out?". They previously each
// derived that from their own inline expression, and the legend contradicting a
// filtered map was a real reported bug (2026-07-16 regrade, review 4). One
// predicate makes that class of disagreement unrepresentable rather than
// merely fixed.

/** Sentinel a structured filter carries when it is not constraining anything. */
export const FILTER_ALL = "all";

export type SeatFilterCriteria = {
  /** Free-text query; matched case-insensitively against the seat's haystack. */
  search: string;
  department: string;
  position: string;
  zone: string;
  status: string;
};

/** The four non-search filters, in the order the UI presents them. */
export const STRUCTURED_FILTER_KEYS = ["department", "position", "zone", "status"] as const;

export type StructuredFilterKey = (typeof STRUCTURED_FILTER_KEYS)[number];

/**
 * A seat's zone for filtering purposes.
 *
 * Falls back to department because seats predating zones carry their grouping
 * there; without the fallback those seats vanish from every zone filter.
 */
export function seatZoneValue(seat: SeatWithEmployee): string {
  return seat.zone ?? seat.department ?? "";
}

/**
 * The comparison key for a zone name: trimmed and lowercased.
 *
 * The zone counterpart of `departmentKey`, and it exists for the same reason —
 * a seat's stored spelling and the option list's spelling drift, and an exact
 * compare turns that drift into seats silently missing from a filter. Every
 * consumer that groups, counts, filters or washes by zone compares on THIS key,
 * so a chip can never count a seat that its own pin then excludes.
 */
export function zoneKey(zone: string | null | undefined): string {
  return (zone ?? "").trim().toLowerCase();
}

/**
 * The text a free-text search matches against.
 *
 * Includes the occupant's details, so searching a person's name finds their
 * seat — the single most common thing anyone does with this map. Empty fields
 * are dropped before joining so a missing extension can't make two unrelated
 * values adjacent and produce a phantom substring match.
 */
export function seatSearchHaystack(seat: SeatWithEmployee): string {
  return [
    seat.label,
    seat.status,
    seatZoneValue(seat),
    seat.employee?.full_name,
    seat.employee?.position,
    seat.employee?.department,
    seat.employee?.phone_extension
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/** Whether a seat survives every active filter. Filters are ANDed. */
export function seatMatchesFilters(seat: SeatWithEmployee, criteria: SeatFilterCriteria): boolean {
  const needle = criteria.search.trim().toLowerCase();

  const searchOk = !needle || seatSearchHaystack(seat).includes(needle);
  // Compared through departmentKey so casing and spacing drift between the
  // stored value and the option list cannot silently hide a seat.
  const departmentOk =
    criteria.department === FILTER_ALL ||
    departmentKey(seat.employee?.department ?? "") === departmentKey(criteria.department);
  const positionOk = seatMatchesPosition(seat.employee?.position, criteria.position);
  // Through zoneKey for the same reason department goes through departmentKey
  // — and because the zone wash matches on that key too, so the previewed box
  // and the filtered set cannot disagree.
  const zoneOk = criteria.zone === FILTER_ALL || zoneKey(seatZoneValue(seat)) === zoneKey(criteria.zone);
  const statusOk = criteria.status === FILTER_ALL || seat.status === (criteria.status as SeatStatus);

  return searchOk && departmentOk && positionOk && zoneOk && statusOk;
}

/** Which structured filters are currently constraining the map. */
export function activeStructuredFilters(criteria: SeatFilterCriteria): StructuredFilterKey[] {
  return STRUCTURED_FILTER_KEYS.filter(key => criteria[key] !== FILTER_ALL);
}

export function structuredFilterCount(criteria: SeatFilterCriteria): number {
  return activeStructuredFilters(criteria).length;
}

export function hasStructuredFilters(criteria: SeatFilterCriteria): boolean {
  return activeStructuredFilters(criteria).length > 0;
}

/**
 * Whether anything at all is narrowing the map — search or structured.
 *
 * This is the one that matters: the legend and the result list each used to
 * derive it separately (one by spelling out five comparisons, the other by
 * counting chips). They agreed only by coincidence, and a sixth filter added
 * to one and not the other would have made the legend contradict the map
 * again. Both now ask this.
 */
export function hasActiveConstraints(criteria: SeatFilterCriteria): boolean {
  return criteria.search.trim() !== "" || hasStructuredFilters(criteria);
}

/** Criteria with the structured filters reset, leaving any search intact. */
export function clearedStructuredFilters(criteria: SeatFilterCriteria): SeatFilterCriteria {
  return { ...criteria, department: FILTER_ALL, position: FILTER_ALL, zone: FILTER_ALL, status: FILTER_ALL };
}

/** Criteria with everything reset, search included. */
export function clearedFilters(criteria: SeatFilterCriteria): SeatFilterCriteria {
  return { ...clearedStructuredFilters(criteria), search: "" };
}
