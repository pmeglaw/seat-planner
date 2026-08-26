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
function contentSecurityPolicy(extraDirectives = []) {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    // Fonts are vendored (app/fonts/, next/font/local — #371), so no external font origin.
    "font-src 'self'",
    // data: for the map's blur-up placeholder, blob: for CSV/JSON export URLs.
    "img-src 'self' data: blob:",
    `connect-src 'self' ${supabaseOrigin()}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    ...extraDirectives
  ].join("; ");
}

// PROTOTYPE-ONLY header override, scoped to exactly one path.
//
// /concepts/music-visualizer needs two things the app-wide posture denies, and
// rightly denies: microphone access, and a blob: media source for playing a
// locally-picked audio file. Both are widened HERE and only here — the global
// `securityHeaders` above are untouched, so every real surface still sends
// `microphone=()` and a CSP with no media-src. tests/music-visualizer-source
// pins that scoping.
//
// Exposure is small by construction: without SEAT_PLANNER_ENABLE_PROTOTYPES=true
// at BUILD time the page's notFound() fires during prerender, so production
// serves the not-found body and none of the visualizer's code reaches the
// browser (the response status stays 200 — same as the other /concepts routes).
// The microphone also still requires the browser's own permission prompt.
// Delete this entry (and the Microphone button) if the prototype is retired.
const MUSIC_VISUALIZER_PATH = "/concepts/music-visualizer";

const musicVisualizerHeaders = [
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Content-Security-Policy", value: contentSecurityPolicy(["media-src 'self' blob:"]) }]
    : [])
];

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
  // Isolate the browsing context group. Safe at the strict value because the
  // app opens no popups (no window.open / target=_blank anywhere) and auth is
  // redirect-based (Supabase PKCE callbacks) — no flow depends on
  // window.opener. LH-01 from the 2026-08-17 Lighthouse pass.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
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
    // instead of re-running auth + queries on every rail click.
    //
    // Freshness scope — be precise, because none of these mechanisms crosses
    // browsers: revalidatePath purges the router cache of the tab that ran
    // the action, router.refresh() runs in the tab that hit the stale-draft
    // fence, and OTHER users' browsers keep their own in-memory cache for up
    // to these 120 seconds. That cross-browser staleness is an accepted
    // product tradeoff: reads between browsers were never live (they always
    // waited for the next document load or navigation), and the MLS02
    // concurrency fence rejects writes from genuinely stale drafts regardless
    // of what was displayed — so the window costs at most two minutes of
    // display lag on revisited routes, never data integrity.
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
        // Must match MAP_IMAGE_SRC in lib/mapLayoutTransform.ts exactly —
        // tests/map-image-pin-source.test.mjs fails when they drift. Inert
        // while every <Image> is `unoptimized`, but a stale pin 400s the
        // floor plan the moment optimization is turned back on.
        pathname: "/images/office-floor-plan.webp",
        search: "?v=map-v2-cool-2x-3822x1734"
      }
    ]
  },
  async headers() {
    // Order matters: the catch-all lands first and the prototype override
    // second, so its Permissions-Policy / CSP replace the app-wide values on
    // that single path rather than being replaced by them.
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: MUSIC_VISUALIZER_PATH, headers: musicVisualizerHeaders }
    ];
  }
};

module.exports = nextConfig;
