import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next 16 renamed the root `middleware.ts` convention to `proxy.ts` (the old
// name still runs, but boots with a deprecation warning). Only the file and
// export name changed — matcher semantics, the edge-ish runtime, and the
// request/response contract are identical, and this file's job is unchanged:
// keep the Supabase session cookie fresh. It is still NOT a security layer;
// server actions (`requireAdmin()`) and Postgres RLS enforce access.
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

// Explicit allowlist, not the old "everything except static assets" negative
// lookahead: this file exists solely to keep the Supabase session cookie
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
