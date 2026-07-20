import test from "node:test";
import assert from "node:assert/strict";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";

// Exercises the REAL lib/authMessages.ts. safeNextPath is a genuine
// open-redirect guard, so testing a copy (as this file used to) protected
// nothing. Importing the source means a regression in the shipped guard fails
// here.
const { friendlyAuthMessage, safeNextPath } = await importTsModule("lib/authMessages.ts");

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

test("safeNextPath accepts local paths only", () => {
  assert.equal(safeNextPath("/admin"), "/admin");
  assert.equal(safeNextPath("https://evil.example"), "/");
  assert.equal(safeNextPath("//evil.example"), "/");
  assert.equal(safeNextPath("relative/path"), "/");
  assert.equal(safeNextPath(null), "/");
});
