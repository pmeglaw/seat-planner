import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

// Explicit allowlist, not the old "everything except static assets" negative
// lookahead: middleware exists solely to keep the Supabase session cookie
// fresh for the auth-bearing surfaces, so it runs ONLY where a session can
// matter — the signed-in pages, login, and the auth callback routes. Notable
// exclusions, all deliberate:
//   - /api/build-id: the deploy-skew probe is unauthenticated and data-free,
//     and it fires from every open tab — auth work here was pure latency.
//   - /_next/*, images, favicon: never matched anymore by construction.
//   - /concepts/*: prototype-only pages behind their own env-flag gate.
// Server actions POST to their page's own route, so the paths below cover
// them too.
export const config = {
  matcher: ["/", "/admin/:path*", "/reception", "/login", "/auth/:path*"]
};
