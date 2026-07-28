import type { CookieOptions } from "@supabase/ssr";

// Shared attributes for the Supabase auth cookie (`sb-<project>-auth-token`).
//
// Production was verified serving this cookie with secure=false on an
// HTTPS-only origin, so the session token — access AND refresh, ~13 months of
// validity — was eligible to travel over plain http. That is what this module
// closes.
//
// httpOnly is deliberately absent, and cannot be added here. The cookie is
// written by the BROWSER client through document.cookie, never by a Set-Cookie
// response header (confirmed on production: the only Set-Cookie in a full
// sign-in flow was Cloudflare's own __cf_bm). document.cookie physically
// cannot set httpOnly. Making the refresh token server-only is a real
// auth-flow change, tracked separately.

// `secure` MUST stay conditional. A cookie marked Secure is silently DISCARDED
// by the browser on a plain-http origin — no console error, no network error,
// the session simply never persists, so sign-in appears to succeed and then
// immediately fails. Hardcoding `true` therefore breaks `npm run dev` and any
// http-served `next start` in a way that is genuinely hard to diagnose.
export function supabaseCookieOptions(isSecureOrigin: boolean): CookieOptions {
  return {
    secure: isSecureOrigin,
    sameSite: "lax",
    path: "/"
  };
}

// Server-side origin check. Vercel terminates TLS at the edge and forwards the
// original scheme in x-forwarded-proto, so the request's own protocol is http
// even for an https visitor — reading nextUrl.protocol would mark every
// production cookie insecure.
//
// When the header is absent we return false (do not set Secure) rather than
// falling back to NODE_ENV. Absence means no TLS-terminating proxy, i.e. local
// http. Guessing "production => secure" would brick a locally served
// production build; guessing wrong in that direction costs a working login,
// whereas guessing wrong in this direction merely preserves today's behaviour.
export function isSecureForwardedProto(forwardedProto: string | null | undefined): boolean {
  if (!forwardedProto) return false;
  // The header is a comma-separated list when several proxies are chained;
  // the client-facing scheme is the first entry. Destructured with a default
  // rather than indexed-and-asserted: this tree has zero non-null assertions
  // and that is worth keeping.
  const [clientFacingScheme = ""] = forwardedProto.split(",");
  return clientFacingScheme.trim().toLowerCase() === "https";
}
