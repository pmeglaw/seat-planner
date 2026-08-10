const GENERIC_AUTH_MESSAGE = "Something went wrong. Please try again.";

/**
 * Shortest password the app accepts, enforced in the browser by
 * UpdatePasswordForm and independently by GoTrue via
 * `minimum_password_length` in supabase/config.toml — the browser check is
 * bypassable by anything calling supabase.auth.updateUser directly, so the two
 * have to agree. tests/auth-config-source.test.mjs fails if they drift.
 */
export const MIN_PASSWORD_LENGTH = 12;

// Returns our own copy for a recognized failure, or null when the text matches
// nothing we know. Split out so the two callers can differ on ONE point: what
// to do with text we don't recognize.
function classifyAuthMessage(message: string): string | null {
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

  return null;
}

// For an error the browser just got back from Supabase: unrecognized text is
// echoed, because it is the only clue the user (or a support screenshot) has
// about a failure we have not mapped yet.
export function friendlyAuthMessage(message: string) {
  return classifyAuthMessage(message) ?? (message || GENERIC_AUTH_MESSAGE);
}

// For `?error=` on /login: same mapping, but unrecognized text is DROPPED, not
// echoed. The query param is writable by anyone who can get a link clicked, and
// it lands in a role="alert" banner styled as the app's own error voice — so
// echoing it hands an attacker a page that says whatever they wrote ("Call
// 555-0100 to restore access"). Mapped messages are ours; the rest is theirs.
export function friendlyAuthMessageFromQuery(message: string | null) {
  if (!message) return GENERIC_AUTH_MESSAGE;
  return classifyAuthMessage(message) ?? GENERIC_AUTH_MESSAGE;
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
