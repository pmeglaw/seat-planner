import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/authMessages";

const allowedOtpTypes = new Set(["signup", "invite", "magiclink", "recovery", "email_change", "email"]);

function redirectToLogin(origin: string, message: string) {
  return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(message)}`, origin));
}

export async function completeAuthRedirect(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const error = requestUrl.searchParams.get("error_description") ?? requestUrl.searchParams.get("error");
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");
  const next = safeNextPath(requestUrl.searchParams.get("next"));

  if (error) return redirectToLogin(requestUrl.origin, error);

  const supabase = await createClient();

  if (code) {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (!exchangeError) return NextResponse.redirect(new URL(next, requestUrl.origin));
    return redirectToLogin(requestUrl.origin, exchangeError.message);
  }

  if (tokenHash && type && allowedOtpTypes.has(type)) {
    const { error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as EmailOtpType
    });
    if (!verifyError) return NextResponse.redirect(new URL(next, requestUrl.origin));
    return redirectToLogin(requestUrl.origin, verifyError.message);
  }

  return redirectToLogin(
    requestUrl.origin,
    "Magic link is missing an auth code or token hash. Check the Supabase Magic Link email template."
  );
}
