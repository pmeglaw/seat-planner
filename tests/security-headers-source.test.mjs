import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

// Regression guards for two security fixes that are invisible from the app's
// behaviour: nothing in the UI changes if these silently disappear, and no
// other test would fail. Both were real findings in the 2026-07-28 audit.
//
//   1. The response headers (CSP, X-Frame-Options, …). Production shipped with
//      exactly one of them for months before anyone noticed.
//   2. The `Secure` attribute on the Supabase session cookie, which was absent
//      in production on an https-only origin.
//
// Deleting the headers() block or the cookieOptions argument leaves the build
// green, the tests green and the app working — so these assertions are the
// only thing standing between a refactor and a silent regression.

const nextConfig = readFileSync(new URL("../next.config.js", import.meta.url), "utf8");
const cookieOptions = readFileSync(new URL("../lib/supabase/cookieOptions.ts", import.meta.url), "utf8");
const browserClient = readFileSync(new URL("../lib/supabase/client.ts", import.meta.url), "utf8");
const serverClient = readFileSync(new URL("../lib/supabase/server.ts", import.meta.url), "utf8");
const middlewareClient = readFileSync(new URL("../lib/supabase/middleware.ts", import.meta.url), "utf8");

// Negative assertions must ignore comments. Each of these files EXPLAINS why it
// avoids includeSubDomains / nextUrl.protocol, so a naive doesNotMatch over the
// raw text fails on the very comment that documents the decision.
function withoutComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

test("every security response header is still declared", () => {
  for (const header of [
    "X-Frame-Options",
    "X-Content-Type-Options",
    "Referrer-Policy",
    "Permissions-Policy",
    "Strict-Transport-Security",
    "Content-Security-Policy"
  ]) {
    assert.match(
      nextConfig,
      new RegExp(`"${header}"`),
      `${header} is no longer sent. Production shipped without it once already.`
    );
  }
});

test("the headers are applied to every route, not a subset", () => {
  assert.match(nextConfig, /async headers\(\)/);
  assert.match(nextConfig, /source: "\/:path\*"/);
});

test("header values keep the properties they were chosen for", () => {
  assert.match(nextConfig, /"X-Frame-Options", value: "DENY"/);
  assert.match(nextConfig, /"X-Content-Type-Options", value: "nosniff"/);
  assert.match(nextConfig, /frame-ancestors 'none'/);
  assert.match(nextConfig, /base-uri 'self'/);
  assert.match(nextConfig, /form-action 'self'/);
  assert.match(nextConfig, /object-src 'none'/);
});

test("HSTS stays scoped to this host", () => {
  // includeSubDomains and preload reach every *.megeredchianlaw.com host and are
  // effectively irreversible, so they are the domain owner's call — not something
  // a per-app config should acquire by accident. This matches what Vercel already
  // sends, so the header neither weakens nor widens production.
  assert.match(nextConfig, /"Strict-Transport-Security", value: "max-age=63072000"/);
  assert.doesNotMatch(withoutComments(nextConfig), /includeSubDomains/);
  assert.doesNotMatch(withoutComments(nextConfig), /preload/);
});

test("CSP is enforced in production only, so dev keeps HMR", () => {
  // The dev server needs eval and a websocket this policy forbids; applying it
  // to `next dev` breaks fast refresh while protecting nobody.
  assert.match(nextConfig, /process\.env\.NODE_ENV === "production"[\s\S]{0,120}Content-Security-Policy/);
});

test("connect-src is derived from the configured Supabase URL", () => {
  // Hardcoding an origin here breaks either local development or production,
  // depending on which one the author had in mind that day.
  assert.match(nextConfig, /NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(nextConfig, /connect-src 'self' \$\{supabaseOrigin\(\)\}/);
});

test("the framework version header stays suppressed", () => {
  assert.match(nextConfig, /poweredByHeader: false/);
});

test("the session cookie is marked Secure, conditionally", () => {
  assert.match(cookieOptions, /secure: isSecureOrigin/);
  assert.match(cookieOptions, /sameSite: "lax"/);
  // Hardcoding `secure: true` is the trap: a Secure cookie is silently
  // discarded on a plain-http origin, so local dev and any http-served
  // `next start` would fail to hold a session with no error anywhere.
  assert.doesNotMatch(cookieOptions, /secure: true/);
});

test("all three Supabase clients apply the cookie options", () => {
  // The browser client is the one that actually writes the cookie at sign-in
  // via document.cookie; the other two rewrite it on refresh. Missing any one
  // of them lets a refresh quietly downgrade a correctly-set cookie.
  for (const [name, source] of [
    ["browser client", browserClient],
    ["server client", serverClient],
    ["middleware client", middlewareClient]
  ]) {
    assert.match(source, /supabaseCookieOptions\(/, `${name} no longer applies the hardened cookie options.`);
    assert.match(source, /cookieOptions/, `${name} no longer passes cookieOptions to the Supabase factory.`);
  }
});

test("server-side secure detection reads the forwarded scheme", () => {
  // Vercel terminates TLS at the edge, so the request's own protocol is http
  // even for an https visitor — reading it would mark every production cookie
  // insecure, which is the exact bug this replaced.
  assert.match(cookieOptions, /forwardedProto/);
  assert.match(serverClient, /x-forwarded-proto/);
  assert.match(middlewareClient, /x-forwarded-proto/);
  assert.doesNotMatch(withoutComments(middlewareClient), /nextUrl\.protocol/);
});

test("the middleware anonymous-skip matches the documented Supabase cookie name", () => {
  // The nav-lag fix skips the auth step for requests carrying no Supabase
  // cookie. That skip keys on the `sb-` prefix of the default
  // `sb-<project>-auth-token` cookie cookieOptions.ts documents. If the
  // cookie is ever renamed (a custom storageKey), this guard would silently
  // skip session refresh for EVERY user — sessions would just expire mid-use
  // — so pin the two files' shared assumption to each other.
  assert.match(cookieOptions, /sb-<project>-auth-token/);
  assert.match(middlewareClient, /startsWith\("sb-"\)/);
});
