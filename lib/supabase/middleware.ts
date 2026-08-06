import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { JWK } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { isSecureForwardedProto, supabaseCookieOptions } from "@/lib/supabase/cookieOptions";

type CookieToSet = {
  name: string;
  value: string;
  options?: CookieOptions;
};

// The middleware's whole job is keeping the session cookie fresh; it is NOT a
// security layer (server actions re-check requireAdmin(), RLS enforces in the
// database — CLAUDE.md). Two consequences drive the shape below:
//
// 1. No per-request auth-server round-trip. getClaims() verifies the JWT
//    LOCALLY (WebCrypto against the project's JWKS) when the token is valid,
//    and only touches the network to refresh an expired session — unlike the
//    getUser() call this replaced, which phoned the Supabase auth server on
//    every matched request. The JWKS itself is memoized per runtime instance
//    (below) so steady-state requests do zero fetches. Legacy HS256 projects
//    can't verify locally; getClaims falls back to getUser internally, which
//    the timeout still bounds.
//
// 2. A hard time budget. Production logs (2026-07-24..30) show middleware
//    hitting Vercel's 25s no-response kill when the auth call hung — which
//    took the whole request (and the page behind it) down. The race below
//    fails OPEN after AUTH_STEP_TIMEOUT_MS: the request proceeds with the
//    cookies it already has, pages still enforce auth themselves, and an
//    expired session simply lands on the login redirect instead of a dead
//    tab.
const AUTH_STEP_TIMEOUT_MS = 5_000;

// Module-scope JWKS memo: middleware builds a NEW Supabase client per request
// (it must — cookies are request-bound), so the client's own JWKS cache never
// survives to the next request. This one does (per warm runtime instance).
// A miss or fetch failure degrades to getClaims' internal fallbacks, never to
// an error — and failures back off too (the attempt stamp below), so a JWKS
// outage costs at most one outbound fetch per retry window per instance
// instead of quietly restoring the per-request fetch this memo exists to
// remove. The short failure window keeps recovery fast once the endpoint
// heals.
const JWKS_TTL_MS = 10 * 60_000;
const JWKS_FAILURE_RETRY_MS = 60_000;
let cachedJwks: { keys: JWK[] } | null = null;
let cachedJwksAt = 0;
let lastJwksAttemptAt = 0;

async function fetchProjectJwks(supabaseUrl: string): Promise<{ keys: JWK[] } | undefined> {
  const now = Date.now();
  if (cachedJwks && now - cachedJwksAt < JWKS_TTL_MS) return cachedJwks;
  if (now - lastJwksAttemptAt < JWKS_FAILURE_RETRY_MS) return cachedJwks ?? undefined;
  lastJwksAttemptAt = now;
  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/.well-known/jwks.json`);
    if (!response.ok) return cachedJwks ?? undefined;
    const body = (await response.json()) as { keys?: JWK[] };
    if (!Array.isArray(body?.keys)) return cachedJwks ?? undefined;
    cachedJwks = { keys: body.keys };
    cachedJwksAt = Date.now();
    return cachedJwks;
  } catch {
    return cachedJwks ?? undefined;
  }
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return response;
  }

  // This runs on every matched request and is where the session refresh
  // actually rewrites the cookie, so it carries the same Secure attribute.
  // The scheme comes from x-forwarded-proto, not request.nextUrl.protocol:
  // Vercel terminates TLS at the edge, so nextUrl is http even for an https
  // visitor and would mark every production cookie insecure.
  const cookieOptions = supabaseCookieOptions(
    isSecureForwardedProto(request.headers.get("x-forwarded-proto"))
  );

  const supabase = createServerClient(url, anonKey, {
    cookieOptions,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[], headers: Record<string, string> = {}) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
        Object.entries(headers).forEach(([key, value]) => {
          response.headers.set(key, value);
        });
      }
    }
  });

  // Skip the auth step entirely for requests that carry no Supabase cookies —
  // an anonymous document fetch has nothing to validate OR refresh, and the
  // pages' own guards handle the login redirect.
  const hasAuthCookie = request.cookies.getAll().some(cookie => cookie.name.startsWith("sb-"));
  if (!hasAuthCookie) {
    return response;
  }

  // Fail open: an auth hiccup must never take the request down — the pages
  // and server actions re-check auth themselves (layers 1–2). The catch is
  // attached to the auth promise ITSELF, not to the race: when the timeout
  // wins, the auth step is still pending, and a rejection landing after that
  // point would otherwise have no handler and surface as a platform
  // unhandled-rejection event — the exact hang-then-fail case the timeout
  // exists for. The timer is cleared in both outcomes so a fast auth step
  // doesn't leave a 5s timer keeping the invocation alive.
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const authStep = (async () => {
    const jwks = await fetchProjectJwks(url);
    // Valid token → local verify, no network. Expired token → getClaims
    // refreshes the session, which rewrites the cookie via setAll above.
    await supabase.auth.getClaims(undefined, jwks ? { jwks } : undefined);
  })().catch(() => {});
  await Promise.race([
    authStep,
    new Promise<void>(resolve => {
      timeoutId = setTimeout(resolve, AUTH_STEP_TIMEOUT_MS);
    })
  ]);
  if (timeoutId !== undefined) clearTimeout(timeoutId);

  return response;
}
