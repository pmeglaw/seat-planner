import { createBrowserClient } from "@supabase/ssr";
import { supabaseCookieOptions } from "@/lib/supabase/cookieOptions";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Missing Supabase environment variables.");
  }

  // This is the factory that actually writes the session cookie at sign-in
  // (via document.cookie), so it is the one that must carry Secure — setting
  // it only on the server client would leave the initial write unprotected.
  // `window` is probed defensively: this module is imported by client
  // components that Next.js also renders on the server.
  const isSecureOrigin = typeof window !== "undefined" && window.location.protocol === "https:";

  return createBrowserClient(url, anonKey, {
    cookieOptions: supabaseCookieOptions(isSecureOrigin)
  });
}
