import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";

// S-03: supabase/config.toml governs the LOCAL stack (`supabase start`, the
// e2e-auth job's disposable database) and any preview branch — nothing in CI
// pushes it to the hosted project, so it is not what protects production. That
// is exactly why it matters: a local stack that self-provisions accounts and
// accepts 6-character passwords is not the system the authenticated tests claim
// to be exercising. These assertions keep the two in agreement.
//
// The hosted project's own values are dashboard state, not repo state. Verified
// against the live GoTrue settings endpoint on 2026-08-10: `disable_signup` is
// true there. `minimum_password_length` is not exposed by that endpoint and has
// to be confirmed in the dashboard by hand.
const config = await readFile(new URL("../supabase/config.toml", import.meta.url), "utf8");
const updatePasswordForm = await readFile(
  new URL("../components/auth/UpdatePasswordForm.tsx", import.meta.url),
  "utf8"
);
const { MIN_PASSWORD_LENGTH } = await importTsModule("lib/authMessages.ts");

// Reads a top-level key from the [auth] section, ignoring the commented-out
// documentation lines the Supabase CLI template is full of.
function authSetting(key) {
  const match = config.match(new RegExp(`^${key}\\s*=\\s*(\\S+)`, "m"));
  assert.ok(match, `${key} should be set in supabase/config.toml`);
  return match[1];
}

// handle_new_user() (001_initial_schema.sql) turns ANY new auth.users row into a
// working viewer profile. That is the right behaviour for an admin-provisioned
// account and the wrong one for a self-service signup, and the trigger cannot
// tell the two apart — so signup is what has to stay off. The app agrees:
// magic-link sign-in passes shouldCreateUser: false precisely so it can never
// mint an account.
test("the local stack does not let anyone sign themselves up", () => {
  assert.equal(authSetting("enable_signup"), "false");
  assert.equal(authSetting("enable_anonymous_sign_ins"), "false");
  assert.equal(authSetting("enable_manual_linking"), "false");
});

// The client-side check is browser-only: anything calling supabase.auth.updateUser
// directly bypasses it, and GoTrue's own minimum is the only bound that always
// applies. Keeping the two numbers equal means the local stack rejects exactly
// what the form rejects, instead of quietly accepting a 6-character password.
test("GoTrue's password minimum matches the one the form enforces", () => {
  assert.equal(Number(authSetting("minimum_password_length")), MIN_PASSWORD_LENGTH);
});

test("the password form enforces the shared constant, not its own number", () => {
  assert.match(updatePasswordForm, /MIN_PASSWORD_LENGTH/, "the form should use the shared constant");
  assert.match(
    updatePasswordForm,
    /password\.length < MIN_PASSWORD_LENGTH/,
    "the length check should read the constant"
  );
  assert.doesNotMatch(
    updatePasswordForm,
    /password\.length < \d+/,
    "a bare number here can drift from supabase/config.toml without anything failing"
  );
});
