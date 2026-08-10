import test from "node:test";
import assert from "node:assert/strict";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";

// Exercises the REAL lib/authMessages.ts. safeNextPath is a genuine
// open-redirect guard, so testing a copy (as this file used to) protected
// nothing. Importing the source means a regression in the shipped guard fails
// here.
const { friendlyAuthMessage, friendlyAuthMessageFromQuery, safeNextPath } =
  await importTsModule("lib/authMessages.ts");

test("auth message maps rate limit errors to friendly guidance", () => {
  assert.equal(
    friendlyAuthMessage("Email rate limit exceeded"),
    "Please wait 60 seconds before requesting another login link."
  );
});

test("auth message maps invalid credentials", () => {
  assert.equal(
    friendlyAuthMessage("Invalid login credentials"),
    "Email or password is incorrect. Try again or use the magic-link fallback."
  );
});

test("auth message maps weak-password errors", () => {
  assert.equal(
    friendlyAuthMessage("Password should be at least 8 characters"),
    "Use a stronger password before continuing."
  );
});

test("auth message maps otp-signup-refused to admin-provisioning guidance", () => {
  // GoTrue returns this when signInWithOtp runs with shouldCreateUser: false
  // for an email that has no account.
  assert.equal(
    friendlyAuthMessage("Signups not allowed for otp"),
    "This email is not set up yet. Ask an admin to create the user first."
  );
});

test("auth message maps expired links to a refresh hint", () => {
  assert.equal(
    friendlyAuthMessage("Token has expired or is invalid"),
    "This sign-in link has expired. Request a new link and use the newest email."
  );
});

test("auth message falls back to the raw message, then a generic default", () => {
  assert.equal(friendlyAuthMessage("Some unmapped error"), "Some unmapped error");
  assert.equal(friendlyAuthMessage(""), "Something went wrong. Please try again.");
});

// friendlyAuthMessage's raw-message fallback is right for a Supabase SDK error
// the browser just received, and wrong for `?error=` on /login: anyone can put
// text in that query param, and the banner it lands in is a trusted-looking
// error surface (S-02). The query-sourced variant maps or says nothing.
test("query auth message maps the same known errors as the SDK variant", () => {
  assert.equal(
    friendlyAuthMessageFromQuery("Invalid login credentials"),
    "Email or password is incorrect. Try again or use the magic-link fallback."
  );
  assert.equal(
    friendlyAuthMessageFromQuery("Token has expired or is invalid"),
    "This sign-in link has expired. Request a new link and use the newest email."
  );
});

test("query auth message never echoes unmapped text back into the banner", () => {
  assert.equal(
    friendlyAuthMessageFromQuery("Your account is suspended. Call 555-0100 to restore access."),
    "Something went wrong. Please try again."
  );
  assert.equal(friendlyAuthMessageFromQuery(""), "Something went wrong. Please try again.");
  assert.equal(friendlyAuthMessageFromQuery(null), "Something went wrong. Please try again.");
});

test("safeNextPath accepts local paths only", () => {
  assert.equal(safeNextPath("/admin"), "/admin");
  assert.equal(safeNextPath("https://evil.example"), "/");
  assert.equal(safeNextPath("//evil.example"), "/");
  assert.equal(safeNextPath("relative/path"), "/");
  assert.equal(safeNextPath(null), "/");
  // Positive: querystrings and hashes on local paths keep working unchanged.
  assert.equal(safeNextPath("/admin?tab=people#top"), "/admin?tab=people#top");
  // WHATWG-strip bypasses: a control character anywhere must reject.
  assert.equal(safeNextPath("/\t//evil.example"), "/");
  assert.equal(safeNextPath("/\n//evil.example"), "/");
  assert.equal(safeNextPath("/\r//evil.example"), "/");
  // Backslash is "/" to the URL parser in special schemes.
  assert.equal(safeNextPath("/\\evil.example"), "/");
  assert.equal(safeNextPath("/\\\\evil.example"), "/");
  // A literal percent-encoded sequence is data, not structure — still a safe local path.
  assert.equal(safeNextPath("/%09/notes"), "/%09/notes");
});
