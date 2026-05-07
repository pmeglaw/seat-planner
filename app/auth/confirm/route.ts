import type { NextRequest } from "next/server";
import { completeAuthRedirect } from "@/lib/supabase/authRedirect";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return completeAuthRedirect(request);
}
