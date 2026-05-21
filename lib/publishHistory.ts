export type PublishEventRecord = {
  created_at: string;
  seat_count: number;
  published_by: string | null;
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
