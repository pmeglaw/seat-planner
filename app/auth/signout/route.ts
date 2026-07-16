import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// POST-only on purpose: sign-out mutates auth state, so it must never fire
// from a prefetched link or a plain GET. The account menu and the login
// page's signed-in card submit a real <form method="post"> here, which keeps
// sign-out working before hydration and without JavaScript.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // 303 converts the form POST into a GET of /login after the session ends.
  return NextResponse.redirect(new URL("/login", new URL(request.url).origin), { status: 303 });
}
