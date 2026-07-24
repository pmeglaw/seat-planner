export function friendlyAuthMessage(message: string) {
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

  if (normalized.includes("password should be at least") || normalized.includes("weak password")) {
    return "Use a stronger password before continuing.";
  }

  if (
    normalized.includes("user not found") ||
    normalized.includes("signup disabled") ||
    normalized.includes("signups not allowed")
  ) {
    return "This email is not set up yet. Ask an admin to create the user first.";
  }

  if (normalized.includes("expired") || normalized.includes("token")) {
    return "This sign-in link has expired. Request a new link and use the newest email.";
  }

  return message || "Something went wrong. Please try again.";
}

export function safeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  // The consumer re-parses this via `new URL(value, origin)`. The WHATWG
  // parser strips ASCII tab/newline/carriage-return anywhere in the input and
  // treats "\\" as "/" in special schemes, so a value like "/<TAB>//evil.example"
  // clears the prefix checks above and still resolves protocol-relative to a
  // foreign origin. Reject every C0 control, DEL, and backslash outright.
  if (/[\u0000-\u001F\u007F\\]/.test(value)) return "/";
  // Belt and suspenders: confirm the value stays same-origin under that parser.
  // The sentinel origin is arbitrary; only the origin equality matters.
  try {
    if (new URL(value, "https://sentinel.invalid").origin !== "https://sentinel.invalid") return "/";
  } catch {
    return "/";
  }
  return value;
}
