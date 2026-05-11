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

  if (normalized.includes("user not found") || normalized.includes("signup disabled")) {
    return "This email is not set up yet. Ask an admin to create the user first.";
  }

  if (normalized.includes("expired") || normalized.includes("token")) {
    return "This sign-in link has expired. Request a new link and use the newest email.";
  }

  return message || "Something went wrong. Please try again.";
}

export function safeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}
