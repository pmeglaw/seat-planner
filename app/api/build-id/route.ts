import { CLIENT_BUILD_ID } from "@/lib/deploySkew";

// Deploy-skew probe target (see lib/deploySkew.ts). Returns the build id this
// deployment was compiled with; the client compares it against the id inlined
// in its own bundle to learn the prod alias has moved on. Deliberately
// unauthenticated and data-free: it must answer before/without a session
// (login tab open across a deploy) and reveals only a commit sha.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { buildId: CLIENT_BUILD_ID },
    { headers: { "cache-control": "no-store" } }
  );
}
