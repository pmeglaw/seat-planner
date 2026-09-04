// Shell mode indicator + History panel status derivation (redesign-v2 PR 2,
// PHASE2UX §1.5 / PHASE3DS §1.3). Pure: the shell hands in what it knows —
// the route, the last publish time, and the admin draft status (live from
// SeatMap, fetched once on sub-pages, or an error) — and gets back one
// discriminated status plus the exact strings the header and the History
// panel render. Copy lives here, not in the components, so the specimen
// strings (docs/redesign-v2/phase3/specimens/01-shell.html) stay pinned by
// tests/shell-mode.test.mjs rather than by a jsdom render.
//
// Date format = the app's existing publish-date formatter (PHASE2UX §1.2 row
// 4): en-US short month in the office timezone, the same shape app/page.tsx
// has rendered since the viewer's "Published" line existed. The timezone is
// FIXED on purpose: the indicator is server-rendered by the shell layout and
// hydrated on the client, and a locale/zone-dependent format would produce a
// hydration mismatch for any visitor outside the office zone.

export type DraftStatus = { changeCount: number; lastEditAt: string | null };

export type ShellModeStatus =
  | { kind: "loading" }
  | { kind: "error" }
  /** Never published — any route (D0-a: viewers and admins both see it). */
  | { kind: "unpublished" }
  /** `/` and `/reception` (and a viewer anywhere): what everyone sees. */
  | { kind: "published"; publishedAt: string }
  /** `/admin*` for an admin: the draft, with its pending change count. */
  | { kind: "draft"; publishedAt: string; changeCount: number; lastEditAt: string | null };

export type ShellRouteMode = "published" | "draft";

/** `/admin` and everything below it edit the draft; every other route reads
 *  the published layer. The indicator is STATUS, so a viewer on /admin still
 *  reads published (PHASE2UX §1.4: "a viewer never sees Draft") — callers
 *  pass `isAdmin` to modeStatusFor for that. */
export function routeModeFor(pathname: string): ShellRouteMode {
  return pathname === "/admin" || pathname.startsWith("/admin/") ? "draft" : "published";
}

const OFFICE_TIME_ZONE = "America/Los_Angeles";

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: OFFICE_TIME_ZONE
});

const DATE_TIME_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: OFFICE_TIME_ZONE
});

/** "Sep 2, 2026" — the viewer's existing publish-date shape. `withTime`
 *  adds the clock ("Sep 2, 2026, 2:12 PM") for the History panel's fact line
 *  and event rows. Invalid input renders as an empty string rather than
 *  throwing: a malformed timestamp must never take the header down. */
export function formatPublishDate(iso: string, options: { withTime?: boolean } = {}): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return (options.withTime ? DATE_TIME_FORMAT : DATE_FORMAT).format(date);
}

export function modeStatusFor(args: {
  pathname: string;
  isAdmin: boolean;
  publishedAt: string | null;
  /** null = not known yet (loading); "error" = the fetch failed. Ignored on
   *  published routes and for viewers. */
  draft: DraftStatus | null | "error";
}): ShellModeStatus {
  const { pathname, isAdmin, publishedAt, draft } = args;
  if (isAdmin && routeModeFor(pathname) === "draft") {
    if (draft === "error") return { kind: "error" };
    if (draft === null) return { kind: "loading" };
    if (!publishedAt) return { kind: "unpublished" };
    return { kind: "draft", publishedAt, changeCount: draft.changeCount, lastEditAt: draft.lastEditAt };
  }
  if (!publishedAt) return { kind: "unpublished" };
  return { kind: "published", publishedAt };
}

/** The header text. `compact` is the below-1056 form (D0-e: mark + count,
 *  never dropped): "Published" / "Draft · 4". Full: "Published · Sep 2, 2026"
 *  / "Draft — 4 changes" / "Draft — no changes" / "Not yet published" /
 *  "Publish state unavailable". */
export function modeIndicatorText(status: ShellModeStatus, options: { compact: boolean }): string {
  switch (status.kind) {
    case "loading":
      return "";
    case "error":
      return options.compact ? "Unavailable" : "Publish state unavailable";
    case "unpublished":
      return "Not yet published";
    case "published":
      return options.compact ? "Published" : `Published · ${formatPublishDate(status.publishedAt)}`;
    case "draft":
      if (options.compact) return `Draft · ${status.changeCount}`;
      return status.changeCount === 0 ? "Draft — no changes" : `Draft — ${status.changeCount} ${status.changeCount === 1 ? "change" : "changes"}`;
  }
}

/** The History panel's status line under the mode switch (PHASE2UX §1.5). */
export function historyStatusLine(status: ShellModeStatus, now: Date): string {
  switch (status.kind) {
    case "loading":
      return "";
    case "error":
      return "Publish state unavailable";
    case "unpublished":
      return "Nothing published yet";
    case "published":
      return "Showing what everyone sees";
    case "draft": {
      if (status.changeCount === 0) return "Draft matches the published map";
      const changes = `${status.changeCount} unpublished ${status.changeCount === 1 ? "change" : "changes"}`;
      return status.lastEditAt ? `${changes} · last edit ${relativeMinutes(status.lastEditAt, now)}` : changes;
    }
  }
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now" (< 1 min) · "2 min ago" (< 1 h) · "3 h ago" (< 24 h) · the
 *  formatted date after that. A future or unparseable timestamp reads as
 *  "just now" — clock skew between the browser and the database must not
 *  produce "-3 min ago". */
export function relativeMinutes(iso: string, now: Date): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "just now";
  const elapsed = now.getTime() - then;
  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} min ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)} h ago`;
  return formatPublishDate(iso);
}
