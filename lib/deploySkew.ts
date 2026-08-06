// Deploy-skew detection for open tabs (2026-08-05 prod incident).
//
// Merging to main auto-deploys and flips the seats.megeredchianlaw.com alias
// while admin tabs are open. A rail click from the old bundle then fetches an
// RSC payload built by the NEW deployment; the App Router detects the build
// mismatch and abandons the soft navigation for a full document reload — which
// reads as "the click did nothing, then the whole page loaded seconds later"
// (amplified by cold serverless starts at this app's tiny traffic volume).
// Vercel's Skew Protection would pin the tab to its deployment, but it is a
// Pro feature; this module is the plan-free equivalent: detect the flip and
// let AppRail make the NEXT navigation a deliberate full document load.
//
// CLIENT_BUILD_ID is inlined into the client bundle at build time (next.config
// wires NEXT_PUBLIC_BUILD_ID from Vercel's VERCEL_GIT_COMMIT_SHA). The API
// route app/api/build-id/route.ts returns the same constant — but served by
// whatever deployment is currently live. Equal ids: same deployment. Different
// ids: this tab is stale. Locally both sides fall back to "dev", which
// compares equal, so dev and self-hosted builds can never false-positive.

export const BUILD_ID_ENDPOINT = "/api/build-id";

// The typeof guard is for non-Next bundles of this module (the browser test
// harness esbuilds SeatMap → AppRail → here into a bare-browser IIFE where
// `process` doesn't exist, and a bare reference throws at module eval). Next
// itself still inlines the exact `process.env.NEXT_PUBLIC_BUILD_ID` text, so
// production behavior is unchanged.
export const CLIENT_BUILD_ID =
  (typeof process !== "undefined" ? process.env.NEXT_PUBLIC_BUILD_ID : undefined) ?? "dev";

export function isBuildSkewed(
  clientId: string | null | undefined,
  serverId: string | null | undefined
): boolean {
  // A missing side means the probe (or the env wiring) failed, not that the
  // deployment changed — never report skew on absent evidence, because the
  // consequence is a state-destroying full reload on the user's next click.
  // Deliberately a boolean, not a match/skewed/unknown union: nothing ever
  // distinguished "match" from "unknown" (both mean "leave the rail soft"),
  // and an exported three-state invited callers to build on a distinction the
  // module never acts on.
  if (!clientId || !serverId) return false;
  return clientId !== serverId;
}

type SkewDetectorOptions = {
  clientBuildId: string;
  fetchServerBuildId: () => Promise<string | null | undefined>;
  /** Injectable clock for tests. Defaults to Date.now. */
  now?: () => number;
  /** Minimum ms between server probes. */
  minCheckIntervalMs?: number;
};

export type SkewDetector = {
  /** Probe (throttled); resolves to the current skew state. Never rejects. */
  check: () => Promise<boolean>;
  isSkewed: () => boolean;
};

export function createSkewDetector({
  clientBuildId,
  fetchServerBuildId,
  now = Date.now,
  minCheckIntervalMs = 60_000
}: SkewDetectorOptions): SkewDetector {
  // Sticky by design: a deployment flip is one-way for this tab — only a full
  // document load (which replaces the bundle) un-skews it, and that load
  // discards this module instance anyway.
  let skewed = false;
  let lastProbeAt: number | null = null;
  let inFlight: Promise<boolean> | null = null;

  async function probe(): Promise<boolean> {
    try {
      const serverId = await fetchServerBuildId();
      if (isBuildSkewed(clientBuildId, serverId)) skewed = true;
    } catch {
      // Offline / transient failure: no evidence, no skew (see isBuildSkewed).
    }
    return skewed;
  }

  return {
    check() {
      if (skewed) return Promise.resolve(true);
      if (inFlight) return inFlight;
      const t = now();
      if (lastProbeAt !== null && t - lastProbeAt < minCheckIntervalMs) {
        return Promise.resolve(skewed);
      }
      lastProbeAt = t;
      inFlight = probe().finally(() => {
        inFlight = null;
      });
      return inFlight;
    },
    isSkewed: () => skewed
  };
}

async function fetchLiveBuildId(): Promise<string | null> {
  const response = await fetch(BUILD_ID_ENDPOINT, { cache: "no-store" });
  if (!response.ok) return null;
  const payload: unknown = await response.json();
  const buildId = (payload as { buildId?: unknown })?.buildId;
  return typeof buildId === "string" ? buildId : null;
}

// Module-level singleton on purpose: each admin page mounts its own AppRail,
// but soft navigations keep the JS realm — so the sticky skew flag and the
// probe throttle must outlive any one rail instance.
export const deploySkewMonitor: SkewDetector = createSkewDetector({
  clientBuildId: CLIENT_BUILD_ID,
  fetchServerBuildId: fetchLiveBuildId
});
