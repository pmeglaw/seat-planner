// Environment guard for publish_seat_map. Local dev points at the PRODUCTION
// Supabase project by default (there is no staging database), so a publish from
// `npm run dev` updates the live viewer map at seats.megeredchianlaw.com.
// requireAdmin() cannot catch this — the developer IS an admin — so
// publishSeatMapAction refuses to publish from a non-production server unless
// the database is local, or the operator opts in explicitly by setting
// SEAT_PLANNER_ALLOW_PROD_PUBLISH=true.
//
// The guard can only ever fire when NODE_ENV !== "production", which is what
// makes throwing safe for UX here: development servers do not digest-strip
// server-action error messages (docs/RISKS.md A-1), so the message reaches the
// admin's error banner intact. Draft edits stay unguarded on purpose — viewers
// never read draft, so local draft work against prod is safe by design.

export const PROD_PUBLISH_OVERRIDE_ENV = "SEAT_PLANNER_ALLOW_PROD_PUBLISH";

// The local Supabase stack (`npm run db:start`) serves on 127.0.0.1; the other
// spellings cover a hand-edited .env.local. Anything else — including an
// unset or unparseable URL — is treated as NOT local, so a misconfigured
// environment fails closed rather than silently publishing to prod.
// Note: URL.hostname keeps the brackets on IPv6 literals ("[::1]").
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "0.0.0.0"]);

export function isLocalSupabaseUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return LOCAL_HOSTNAMES.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

export type PublishEnvironmentDecision =
  | { allowed: true }
  | { allowed: false; message: string };

export function assessPublishEnvironment(input: {
  nodeEnv: string | undefined;
  supabaseUrl: string | undefined;
  /** Raw value of SEAT_PLANNER_ALLOW_PROD_PUBLISH; only the exact string "true" opts in. */
  overrideValue: string | undefined;
}): PublishEnvironmentDecision {
  if (input.nodeEnv === "production") return { allowed: true };
  if (isLocalSupabaseUrl(input.supabaseUrl)) return { allowed: true };
  if (input.overrideValue === "true") return { allowed: true };
  return {
    allowed: false,
    message:
      "Publish blocked: this development server is pointed at the production database, " +
      "and publishing would update the live map for real viewers. " +
      "Use the local stack (npm run db:start, then point .env.local at it), " +
      `or set ${PROD_PUBLISH_OVERRIDE_ENV}=true to publish to production deliberately.`
  };
}
