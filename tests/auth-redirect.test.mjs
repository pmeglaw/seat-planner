import assert from "node:assert/strict";
import test from "node:test";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";

// Behavior tests for lib/supabase/authRedirect.ts — the shared PKCE/OTP
// callback handler behind app/auth/confirm and app/auth/callback. Pins the
// outcomes that decide whether a magic link or recovery link signs the user in,
// bounces to /login with a readable error, or (via the real safeNextPath) gets
// its open-redirect payload neutralized.

const STUBS = {
  "next/server": `
    export const NextResponse = {
      redirect(url) {
        return { kind: "redirect", url: url instanceof URL ? url.href : String(url) };
      }
    };
  `,
  "@/lib/supabase/server": `
    export async function createClient() {
      return globalThis.__authRedirectClient;
    }
  `
};

const { completeAuthRedirect } = await importTsModule("lib/supabase/authRedirect.ts", { stubs: STUBS });

function fakeAuthClient({ exchangeError = null, verifyError = null } = {}) {
  const calls = { exchange: [], verify: [] };
  globalThis.__authRedirectClient = {
    calls,
    auth: {
      async exchangeCodeForSession(code) {
        calls.exchange.push(code);
        return { error: exchangeError };
      },
      async verifyOtp(payload) {
        calls.verify.push(payload);
        return { error: verifyError };
      }
    }
  };
  return globalThis.__authRedirectClient;
}

const ORIGIN = "https://seats.example.test";

function request(query) {
  return { url: `${ORIGIN}/auth/confirm?${query}` };
}

test("provider error short-circuits to /login before any Supabase call", async () => {
  const client = fakeAuthClient();

  const response = await completeAuthRedirect(request("error=access_denied&code=abc"));

  assert.equal(response.url, `${ORIGIN}/login?error=access_denied`);
  assert.equal(client.calls.exchange.length, 0);
  assert.equal(client.calls.verify.length, 0);
});

test("error_description is preferred over the bare error code", async () => {
  fakeAuthClient();

  const response = await completeAuthRedirect(request("error=server_error&error_description=Link%20expired"));

  assert.equal(response.url, `${ORIGIN}/login?error=Link%20expired`);
});

test("PKCE code exchange success lands on the sanitized next path", async () => {
  const client = fakeAuthClient();

  const response = await completeAuthRedirect(request("code=pkce-123&next=/admin"));

  assert.deepEqual(client.calls.exchange, ["pkce-123"]);
  assert.equal(response.url, `${ORIGIN}/admin`);
});

test("PKCE code exchange failure reports the Supabase error on /login", async () => {
  fakeAuthClient({ exchangeError: { message: "code expired" } });

  const response = await completeAuthRedirect(request("code=pkce-123&next=/admin"));

  assert.equal(response.url, `${ORIGIN}/login?error=code%20expired`);
});

test("an off-origin next payload is neutralized to /", async () => {
  fakeAuthClient();

  const response = await completeAuthRedirect(request("code=ok&next=//evil.example"));

  assert.equal(response.url, `${ORIGIN}/`);
});

test("token_hash verification succeeds for each allowed OTP type", async () => {
  for (const type of ["signup", "invite", "magiclink", "recovery", "email_change", "email"]) {
    const client = fakeAuthClient();
    const response = await completeAuthRedirect(request(`token_hash=th-1&type=${type}`));
    assert.deepEqual(client.calls.verify, [{ token_hash: "th-1", type }], `type ${type} must verify`);
    assert.equal(response.url, `${ORIGIN}/`);
  }
});

test("a token_hash with a disallowed type is never sent to verifyOtp", async () => {
  const client = fakeAuthClient();

  const response = await completeAuthRedirect(request("token_hash=th-1&type=sms"));

  assert.equal(client.calls.verify.length, 0);
  assert.match(response.url, /\/login\?error=/);
});

test("token_hash verification failure reports the Supabase error on /login", async () => {
  fakeAuthClient({ verifyError: { message: "otp invalid" } });

  const response = await completeAuthRedirect(request("token_hash=th-1&type=magiclink"));

  assert.equal(response.url, `${ORIGIN}/login?error=otp%20invalid`);
});

test("a link with neither code nor token_hash points at the email template misconfiguration", async () => {
  fakeAuthClient();

  const response = await completeAuthRedirect(request("next=/admin"));

  const url = new URL(response.url);
  assert.equal(url.pathname, "/login");
  assert.match(url.searchParams.get("error"), /Magic link is missing an auth code or token hash/);
});
