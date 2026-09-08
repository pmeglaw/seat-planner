export type PublishEventRecord = {
  created_at: string;
  seat_count: number;
  published_by: string | null;
  change_summary?: unknown;
};

export type PublishHistoryEvent = PublishEventRecord & {
  published_by_email: string | null;
};

type PublishEventProfile = {
  id: string;
  email: string | null;
};

export function resolvePublishHistoryProfiles(
  events: PublishEventRecord[],
  profiles: PublishEventProfile[]
): PublishHistoryEvent[] {
  const emailByProfileId = new Map(
    profiles
      .filter(profile => profile.email)
      .map(profile => [profile.id, profile.email as string])
  );

  return events.map(event => ({
    ...event,
    published_by_email: event.published_by ? emailByProfileId.get(event.published_by) ?? null : null
  }));
}

export function getPublishHistoryActor(event: PublishHistoryEvent) {
  return event.published_by_email ?? event.published_by ?? "Unknown admin";
}

export function getLatestPublishEvent(events: PublishHistoryEvent[]) {
  return events[0] ?? null;
}

// Fixed display order, each with its singular/plural unit label.
const CHANGE_SUMMARY_BUCKETS: Array<{ key: string; singular: string; plural: string }> = [
  { key: "seats_added", singular: "seat added", plural: "seats added" },
  { key: "seats_removed", singular: "seat removed", plural: "seats removed" },
  { key: "assignments_changed", singular: "assignment changed", plural: "assignments changed" },
  { key: "seats_moved", singular: "seat moved", plural: "seats moved" },
  { key: "status_changes", singular: "status change", plural: "status changes" },
  { key: "seat_detail_changes", singular: "seat detail change", plural: "seat detail changes" },
  { key: "employee_edits", singular: "employee edit", plural: "employee edits" },
  { key: "employees_added", singular: "person added", plural: "people added" },
  { key: "employees_removed", singular: "person removed", plural: "people removed" }
];

type ValidBucketEntry = { key: string; singular: string; plural: string; value: number };

/**
 * The recognized, well-formed buckets of a `change_summary`, or null when the
 * summary is missing/malformed (including an object carrying none of the nine
 * keys). Shared by the sentence and the count so the table's "—" appears in
 * exactly the cases the sentence is null — one definition of "unreadable".
 */
function validBucketEntries(summary: unknown): ValidBucketEntry[] | null {
  if (typeof summary !== "object" || summary === null || Array.isArray(summary)) return null;

  const record = summary as Record<string, unknown>;

  const entries = CHANGE_SUMMARY_BUCKETS.map(bucket => {
    const raw = record[bucket.key];
    const value = typeof raw === "number" && Number.isFinite(raw) && raw >= 0 ? raw : undefined;
    return { ...bucket, value };
  }).filter((entry): entry is ValidBucketEntry => entry.value !== undefined);

  return entries.length === 0 ? null : entries;
}

/**
 * Formats publish_events.change_summary (jsonb) into a short human-readable line,
 * e.g. "2 assignments changed · 1 employee edit".
 *
 * `change_summary` arrives from supabase-js as an already-parsed object (jsonb
 * decodes to a JS object, not a string) — so a JSON string here is treated as
 * an invalid shape (returns null) rather than re-parsed. This keeps the
 * formatter honest about what the DB actually sends and avoids silently
 * accepting malformed/legacy data shaped differently than expected.
 *
 * Returns null when the summary is missing/malformed (including an object
 * with none of the recognized keys) so callers can render a neutral "—".
 * Returns "No changes recorded" when the summary is a valid, well-formed
 * object whose recognized counts are all zero.
 */
export function formatPublishChangeSummary(summary: unknown): string | null {
  const validEntries = validBucketEntries(summary);
  if (validEntries === null) return null;

  const total = validEntries.reduce((sum, entry) => sum + entry.value, 0);
  if (total === 0) return "No changes recorded";

  return validEntries
    .filter(entry => entry.value > 0)
    .map(entry => `${entry.value} ${entry.value === 1 ? entry.singular : entry.plural}`)
    .join(" · ");
}

// ---------------------------------------------------------------------------
// The publish log (Phase 5 PR 1) — the record surface on Management, as
// distinct from the History panel's ten-newest glance (DECISIONS D0-a
// amendment, 2026-09-08). The panel formats a sentence; the table also needs a
// magnitude that survives the cell's ellipsis, a sort across the WHOLE log and
// a page slice. All four are pure so the tab holds no arithmetic.
//
// Why the whole log lives on the client: PostgREST can order by a column, and
// even by one JSON key, but not by a SUM of the nine buckets — that needs a
// generated column, view or RPC, i.e. a migration. The Changes sort is only
// worth having if it ranks every publish, so the sort happens here.
// ---------------------------------------------------------------------------

/** Total recognized changes in a publish, or null when the summary is
 *  unreadable — the same cases `formatPublishChangeSummary` returns null for,
 *  so the table's Changes cell reads "—" exactly when its sentence would. */
export function publishChangeTotal(summary: unknown): number | null {
  const entries = validBucketEntries(summary);
  if (entries === null) return null;
  return entries.reduce((sum, entry) => sum + entry.value, 0);
}

/** The Published-by column's display string. `published_by` may be a real id
 *  whose profile row did not resolve (the §1.4 "partial" state), and naming a
 *  raw uuid at a person is worse than naming the role. */
export function publishLogActorLabel(event: PublishHistoryEvent): string {
  return event.published_by_email ?? "an admin";
}

export type PublishLogSortKey = "when" | "who" | "changes";
export type PublishLogSortDirection = "asc" | "desc";

function publishedAtMs(event: PublishHistoryEvent): number {
  const ms = Date.parse(event.created_at);
  return Number.isNaN(ms) ? 0 : ms;
}

/**
 * Sorts the whole log. Ties fall back to newest-first, so a re-sort never
 * shuffles rows that the chosen column cannot tell apart.
 *
 * "—" rows sort LAST in both directions: an unreadable summary is unknown, not
 * small, and letting it lead an ascending sort would answer "the quietest
 * publishes" with "the ones we cannot read".
 */
export function sortPublishEvents(
  events: readonly PublishHistoryEvent[],
  key: PublishLogSortKey,
  direction: PublishLogSortDirection
): PublishHistoryEvent[] {
  const sign = direction === "asc" ? 1 : -1;

  return [...events].sort((a, b) => {
    if (key === "changes") {
      const left = publishChangeTotal(a.change_summary);
      const right = publishChangeTotal(b.change_summary);
      if (left === null || right === null) {
        if (left === right) return publishedAtMs(b) - publishedAtMs(a);
        return left === null ? 1 : -1;
      }
      if (left !== right) return (left - right) * sign;
      return publishedAtMs(b) - publishedAtMs(a);
    }

    if (key === "who") {
      const cmp = publishLogActorLabel(a).localeCompare(publishLogActorLabel(b), undefined, { sensitivity: "base" });
      if (cmp !== 0) return cmp * sign;
      return publishedAtMs(b) - publishedAtMs(a);
    }

    return (publishedAtMs(a) - publishedAtMs(b)) * sign;
  });
}

export type PublishLogPage<Row> = {
  rows: Row[];
  /** The requested page, clamped into range — a page-size change that strands
   *  the reader past the end lands them on the last page, never on nothing. */
  page: number;
  pageCount: number;
  /** Carbon's advanced-pagination range, e.g. "1–25 of 42". */
  rangeLabel: string;
};

export function publishLogPageSlice<Row>(
  rows: readonly Row[],
  page: number,
  pageSize: number
): PublishLogPage<Row> {
  const size = Math.max(1, Math.trunc(pageSize));
  const pageCount = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(Math.max(Math.trunc(page) || 1, 1), pageCount);
  const from = (current - 1) * size;
  const slice = rows.slice(from, from + size);

  return {
    rows: slice,
    page: current,
    pageCount,
    rangeLabel: rows.length === 0 ? "0 of 0" : `${from + 1}–${from + slice.length} of ${rows.length}`
  };
}

/** The toolbar's aria-live count. Always published, zero included (SKILL.md:
 *  "Always publish the number of results, zero included"). */
export function publishLogCountLine(total: number, mostRecentLabel: string | null): string {
  if (total <= 0) return "No publishes yet";
  const publishes = `${total.toLocaleString()} publish${total === 1 ? "" : "es"}`;
  return mostRecentLabel ? `${publishes} · most recent ${mostRecentLabel}` : publishes;
}
