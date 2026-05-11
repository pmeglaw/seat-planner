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

test("safeNextPath accepts local paths only", () => {
  assert.equal(safeNextPath("/admin"), "/admin");
  assert.equal(safeNextPath("https://evil.example"), "/");
  assert.equal(safeNextPath("//evil.example"), "/");
  assert.equal(safeNextPath(null), "/");
});
