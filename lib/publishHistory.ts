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
  { key: "employee_edits", singular: "employee edit", plural: "employee edits" }
];

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
  if (typeof summary !== "object" || summary === null || Array.isArray(summary)) return null;

  const record = summary as Record<string, unknown>;

  const validEntries = CHANGE_SUMMARY_BUCKETS.map(bucket => {
    const raw = record[bucket.key];
    const value = typeof raw === "number" && Number.isFinite(raw) && raw >= 0 ? raw : undefined;
    return { ...bucket, value };
  }).filter((entry): entry is { key: string; singular: string; plural: string; value: number } => entry.value !== undefined);

  if (validEntries.length === 0) return null;

  const total = validEntries.reduce((sum, entry) => sum + entry.value, 0);
  if (total === 0) return "No changes recorded";

  return validEntries
    .filter(entry => entry.value > 0)
    .map(entry => `${entry.value} ${entry.value === 1 ? entry.singular : entry.plural}`)
    .join(" · ");
}
