import test from "node:test";
import assert from "node:assert/strict";

function friendlyAuthMessage(message) {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("rate") ||
    normalized.includes("too many") ||
    normalized.includes("429") ||
    normalized.includes("email rate limit") ||
    normalized.includes("security purposes")
  ) {
    return "Please wait 60 seconds before requesting another login link.";
  }

  if (
    normalized.includes("invalid login credentials") ||
    normalized.includes("invalid credentials") ||
    normalized.includes("email not confirmed") ||
    normalized.includes("invalid email or password")
  ) {
    return "Email or password is incorrect. Try again or use the magic-link fallback.";
  }

  if (
    normalized.includes("user not found") ||
    normalized.includes("signup disabled") ||
    normalized.includes("signups not allowed")
  ) {
    return "This email is not set up yet. Ask an admin to create the user first.";
  }

  return message || "Something went wrong. Please try again.";
}

function safeNextPath(value) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

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

test("auth message maps otp-signup-refused to admin-provisioning guidance", () => {
  // GoTrue returns this when signInWithOtp runs with shouldCreateUser: false
  // for an email that has no account.
  assert.equal(
    friendlyAuthMessage("Signups not allowed for otp"),
    "This email is not set up yet. Ask an admin to create the user first."
  );
});

test("safeNextPath accepts local paths only", () => {
  assert.equal(safeNextPath("/admin"), "/admin");
  assert.equal(safeNextPath("https://evil.example"), "/");
  assert.equal(safeNextPath("//evil.example"), "/");
  assert.equal(safeNextPath(null), "/");
});
