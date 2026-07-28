import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSecureForwardedProto, supabaseCookieOptions } from "@/lib/supabase/cookieOptions";

type CookieToSet = {
  name: string;
  value: string;
  options?: CookieOptions;
};

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

  await supabase.auth.getUser();

  return response;
}
