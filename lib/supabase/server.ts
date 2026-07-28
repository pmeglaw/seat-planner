import { cookies, headers } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { isSecureForwardedProto, supabaseCookieOptions } from "@/lib/supabase/cookieOptions";

type CookieToSet = {
  name: string;
  value: string;
  options?: CookieOptions;
};

export async function createClient() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Missing Supabase environment variables.");
  }

  // Session refreshes rewrite the cookie from the server, so the same Secure
  // attribute has to be applied here too — otherwise the first refresh would
  // quietly downgrade a cookie the browser client had set correctly.
  const cookieOptions = supabaseCookieOptions(
    isSecureForwardedProto((await headers()).get("x-forwarded-proto"))
  );

  return createServerClient(url, anonKey, {
    cookieOptions,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot always set cookies. Middleware handles refresh.
        }
      }
    }
  });
}
