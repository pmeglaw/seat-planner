// Environment guard for publish_seat_map. Local dev points at the PRODUCTION
// Supabase project by default (there is no staging database), so a publish from
// a developer machine updates the live viewer map at seats.megeredchianlaw.com.
// requireAdmin() cannot catch this — the developer IS an admin — so
// publishSeatMapAction refuses unless the environment POSITIVELY proves the
// publish is safe: the database is local, or the server is the real Vercel
// production deployment (VERCEL_ENV === "production"), or the operator opts in
// explicitly with SEAT_PLANNER_ALLOW_PROD_PUBLISH=true.
//
// The guard fails CLOSED: a missing or unrecognized signal blocks, never
// permits. NODE_ENV is deliberately NOT an input — `npm run build && npm run
// start` on a developer machine runs with NODE_ENV=production, and the old
// NODE_ENV-trusting guard failed open exactly there. VERCEL_ENV is set by
// Vercel on real deployments and absent locally; the one way it leaks onto a
// developer machine is `vercel env pull --environment=production`, which is a
// deliberate act (documented residual risk, accepted 2026-08-24).
//
// Because the guard can now fire under NODE_ENV=production (a local prod
// build), where server actions digest-strip thrown error messages, the
// refusal must be RETURNED by the action (PUBLISH_BLOCKED), never thrown.
// Draft edits stay unguarded on purpose — viewers never read draft, so local
// draft work against prod is safe by design.

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
  /** Raw value of VERCEL_ENV; only the exact string "production" attests the real deployment. */
  vercelEnv: string | undefined;
  supabaseUrl: string | undefined;
  /** Raw value of SEAT_PLANNER_ALLOW_PROD_PUBLISH; only the exact string "true" opts in. */
  overrideValue: string | undefined;
}): PublishEnvironmentDecision {
  if (isLocalSupabaseUrl(input.supabaseUrl)) return { allowed: true };
  if (input.vercelEnv === "production") return { allowed: true };
  if (input.overrideValue === "true") return { allowed: true };
  return {
    allowed: false,
    message:
      "Publish blocked: this server is not the production deployment, but it is pointed at " +
      "the production database — publishing would update the live map for real viewers. " +
      "Use the local stack (npm run db:start, then point .env.local at it), " +
      `or set ${PROD_PUBLISH_OVERRIDE_ENV}=true to publish to production deliberately.`
  };
}
