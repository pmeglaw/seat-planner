// Supabase is the only cross-origin the browser talks to, so connect-src is
// derived from the same env var the clients use rather than hardcoded — that
// keeps the local stack (http://127.0.0.1:54321) and production working from
// one definition. Falling back to the wildcard means a missing or malformed
// env var degrades to a working-but-looser policy instead of a broken page.
function supabaseOrigin() {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return "https://*.supabase.co";
  try {
    return new URL(raw).origin;
  } catch {
    return "https://*.supabase.co";
  }
}

// 'unsafe-inline' in script-src is required by the App Router: Next.js streams
// the RSC payload through inline self.__next_f.push(...) scripts with no nonce
// unless one is threaded through a proxy on every request. The directive is
// kept anyway — frame-ancestors, base-uri, form-action, object-src and
// connect-src all still constrain real attack paths that X-Frame-Options alone
// does not cover. Tightening script-src to a nonce is a separate change.
function contentSecurityPolicy() {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    // next/font/google self-hosts at build time, so no external font origin.
    "font-src 'self'",
    // data: for the map's blur-up placeholder, blob: for CSV/JSON export URLs.
    "img-src 'self' data: blob:",
    `connect-src 'self' ${supabaseOrigin()}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'"
  ].join("; ");
}

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // Matches the header Vercel already serves on the custom domain, so this
  // neither weakens nor widens what production does today. Deliberately no
  // includeSubDomains and no preload: both extend beyond this app (every
  // *.megeredchianlaw.com host, and an effectively irreversible preload-list
  // entry) and are the domain owner's call once the subdomain inventory is
  // confirmed HTTPS-only — not something a per-app config should assume.
  { key: "Strict-Transport-Security", value: "max-age=63072000" },
  // Enforced in production only. The dev server needs eval and a websocket for
  // HMR, which this policy forbids — applying it to `next dev` breaks fast
  // refresh without protecting anything users are exposed to.
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Content-Security-Policy", value: contentSecurityPolicy() }]
    : [])
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: __dirname,
  experimental: {
    // Client Router Cache for the force-dynamic sections: a section visited in
    // the last 2 minutes re-renders instantly from the cached RSC payload
    // instead of re-running auth + queries on every rail click. Freshness is
    // preserved where it matters: every mutating server action calls
    // revalidatePath (purging this cache), SeatMap's stale-draft recovery
    // calls router.refresh(), and the MLS02 concurrency fence rejects writes
    // from genuinely stale drafts regardless of what was displayed.
    staleTimes: { dynamic: 120 }
  },
  // Deploy-skew detection (lib/deploySkew.ts): bake the deployment's commit
  // sha into both bundles at build time. Vercel exposes VERCEL_GIT_COMMIT_SHA
  // during builds; locally it is absent and both sides fall back to "dev",
  // which compares equal — skew can never trigger outside Vercel.
  env: {
    NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev"
  },
  // Production currently advertises `X-Powered-By: Next.js`. Suppress it:
  // naming the framework and its presence tells an attacker where to aim
  // version-specific probes and buys nothing in return.
  poweredByHeader: false,
  images: {
    localPatterns: [
      {
        pathname: "/images/office-floor-plan.webp",
        search: "?v=map-v2-warm-1911x867"
      }
    ]
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  }
};

module.exports = nextConfig;
