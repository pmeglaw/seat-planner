import assert from "node:assert/strict";
import test from "node:test";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";

const { supabaseCookieOptions, isSecureForwardedProto } = await importTsModule("lib/supabase/cookieOptions.ts");

// The auth cookie carries ~13 months of session validity; these attributes are
// what keep it off plain http in production while still persisting on local
// http dev (a hardcoded Secure would make the browser silently drop it).

test("supabaseCookieOptions: Secure tracks the origin, sameSite/path are fixed", () => {
  assert.deepEqual(supabaseCookieOptions(true), { secure: true, sameSite: "lax", path: "/" });
  assert.deepEqual(supabaseCookieOptions(false), { secure: false, sameSite: "lax", path: "/" });
});

test("isSecureForwardedProto: absent header means local http, never Secure", () => {
  assert.equal(isSecureForwardedProto(null), false);
  assert.equal(isSecureForwardedProto(undefined), false);
  assert.equal(isSecureForwardedProto(""), false);
});

test("isSecureForwardedProto: https in any casing or padding is secure", () => {
  assert.equal(isSecureForwardedProto("https"), true);
  assert.equal(isSecureForwardedProto("HTTPS"), true);
  assert.equal(isSecureForwardedProto("  https  "), true);
});

test("isSecureForwardedProto: chained proxies — only the client-facing (first) scheme counts", () => {
  assert.equal(isSecureForwardedProto("https,http"), true);
  assert.equal(isSecureForwardedProto("https, http"), true);
  assert.equal(isSecureForwardedProto("http,https"), false);
});

test("isSecureForwardedProto: plain http and junk values are not secure", () => {
  assert.equal(isSecureForwardedProto("http"), false);
  assert.equal(isSecureForwardedProto("wss"), false);
  assert.equal(isSecureForwardedProto("https-ish"), false);
});
