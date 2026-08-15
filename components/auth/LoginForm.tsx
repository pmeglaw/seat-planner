"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  MIN_PASSWORD_LENGTH,
  friendlyAuthMessage,
  friendlyAuthMessageFromQuery,
  isAccountAbsenceError,
  safeNextPath
} from "@/lib/authMessages";
import { assignLocation } from "@/lib/fullNavigation";
import { cx, focusRingClass } from "@/components/ui/design-system";

/**
 * Progressive auth, Carbon's login pattern (canvas options 2a/2b): step 1 asks
 * only for identity (work email + Continue), step 2 discloses the password
 * with the entered email as an editable summary row — the way back.
 *
 * The magic link appears ONLY on step 2: below the primary, behind an "or"
 * divider, and as the action inside the failed-login notification. Never on
 * step 1, and never between a field and its primary button (the pattern's
 * hierarchy rule). Owner decision, Aug 11 2026.
 *
 * Visuals are design 1e (design_handoff_login_1e/README.md, Carbon v12
 * direction): fluid fields, copper accent, 48px sharp buttons — restyled onto
 * the two-step flow above, which the handoff explicitly leaves in place
 * ("mode toggle may remain as currently implemented"). Step 2 renders the
 * summary row as a filled fluid field so the stack reads as the reference's
 * email-over-password pair. Tokens are --login-* (app/globals.css).
 */
type Step = "email" | "password";

// Same shape as the viewer's directory pref (ViewerSeatFinder.tsx): one
// namespaced key, every access wrapped because storage throws outright in
// Safari private mode. EMAIL ONLY — a password never reaches storage.
//
// No same-tab pref event here: that mechanism exists in the viewer because two
// components share one pref inside a document. This page has a single reader,
// so an event would be a listener-less broadcast.
const REMEMBERED_EMAIL_STORAGE_KEY = "seat-planner:login-email";

function readRememberedEmail() {
  try {
    return window.localStorage.getItem(REMEMBERED_EMAIL_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeRememberedEmail(email: string | null) {
  try {
    if (email) window.localStorage.setItem(REMEMBERED_EMAIL_STORAGE_KEY, email);
    else window.localStorage.removeItem(REMEMBERED_EMAIL_STORAGE_KEY);
  } catch {
    // A browser that refuses storage still gets a working login; the checkbox
    // simply does not persist.
  }
}

// Format only, and deliberately loose. Step 1 must not decide whether an
// account exists — every well-formed address advances to step 2, so this check
// can never become an account oracle.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type PendingAction = "password" | "link" | "reset" | null;

// Any auth call can REJECT rather than resolve with an error: createClient()
// throws on missing env, and fetch rejects outright on a network failure —
// which the run-seat-planner skill has seen in the wild ("Failed to fetch" from
// signInWithPassword). Every handler therefore clears its pending flag in a
// finally, or the control it disabled stays dead for the rest of the session.
const UNREACHABLE_MESSAGE = "Could not reach the sign-in service. Check your connection and try again.";

// One response for "sent" and "no such account": the magic-link button is
// reachable pre-auth, so distinguishing the two would hand any visitor an
// account-existence oracle (the thing step 1 was built to avoid). The
// footer's "contact the office administrator" line carries the provisioning
// guidance.
const MAGIC_LINK_NEUTRAL_NOTICE = {
  text: "If that address has an account, the sign-in link is on its way. Use the newest email if you requested more than one link.",
  tone: "success"
} as const;

// Same rationale as MAGIC_LINK_NEUTRAL_NOTICE, for the password-reset button.
const RESET_NEUTRAL_NOTICE = {
  text: "If that address has an account, a password reset email is on its way. Open the newest email to set a new password.",
  tone: "success"
} as const;

type Notice = {
  text: string;
  tone: "error" | "success";
  // Failed password attempts offer recovery where the failure happened
  // (Carbon inline-notification action slot).
  offerMagicLink?: boolean;
};

export function LoginForm() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  // Purely visual (the 1e eye toggle) — reset alongside the password when the
  // user goes back to step 1, so a fresh disclosure always starts masked.
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [nextPath, setNextPath] = useState("/");
  // WHICH action is in flight, not merely that one is. A single boolean made
  // the primary announce "Logging in…" while the user was waiting on a magic
  // link, because both handlers shared the flag.
  const [pending, setPending] = useState<PendingAction>(null);
  // False through SSR and the first client render, true once effects run — the
  // only reliable "React is listening now" signal. Drives the submit button's
  // pre-hydration state; see the note above handleSubmit.
  const [hydrated, setHydrated] = useState(false);
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);
  const previousStep = useRef<Step | null>(null);

  useEffect(() => {
    setHydrated(true);
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");
    const next = safeNextPath(params.get("next"));
    setNextPath(next);

    // Returning visitor: prefill and re-check, but still land on step 1. The
    // owner's ruling — skipping to step 2 would hide the wrong-account escape
    // and make first paint depend on storage state.
    const remembered = readRememberedEmail();
    if (remembered) {
      setEmail(remembered);
      setRemember(true);
    }

    // No decodeURIComponent here: URLSearchParams has already percent-decoded
    // the value, and decoding it a second time threw URIError on any surviving
    // "%" — from this effect, which takes the whole login page down (S-02).
    // friendlyAuthMessageFromQuery, not friendlyAuthMessage: this text is
    // attacker-writable and must not reach the banner unmapped.
    if (error) setNotice({ text: friendlyAuthMessageFromQuery(error), tone: "error" });
  }, []);

  // Focus follows the disclosure — forward to the password, back to the email.
  // Never on mount: arriving at /login must not steal focus from the page.
  //
  // Compares against the PREVIOUS step rather than a "have I run yet" flag.
  // StrictMode double-invokes effects in dev, so a first-run flag is already
  // spent on the second invocation and the email field grabbed focus on load
  // (visible as a focused orange rule on a page nobody had touched).
  useEffect(() => {
    const previous = previousStep.current;
    previousStep.current = step;
    if (previous === null || previous === step) return;
    if (step === "password") passwordInputRef.current?.focus();
    else emailInputRef.current?.focus();
  }, [step]);

  function redirectAfterLogin() {
    // Full document load, deliberately not router.push + router.refresh — the
    // session cookie just changed, and that pair raced two client transitions
    // that could wedge the router on the destination's loading skeleton.
    // Rationale lives with assignLocation (lib/fullNavigation.ts).
    assignLocation(nextPath);
  }

  // Step 1. Format validation only; routing to step 2 is unconditional for a
  // well-formed address so the form never confirms that an account exists.
  function continueToPassword() {
    const trimmed = email.trim();

    if (!trimmed) {
      setEmailError("Email is required");
      emailInputRef.current?.focus();
      return;
    }

    if (!EMAIL_PATTERN.test(trimmed)) {
      setEmailError("Enter a valid email address");
      emailInputRef.current?.focus();
      return;
    }

    writeRememberedEmail(remember ? trimmed : null);
    setEmailError(null);
    setNotice(null);
    setStep("password");
  }

  async function signInWithPassword() {
    if (!password.trim()) {
      setPasswordError("Password is required");
      passwordInputRef.current?.focus();
      return;
    }

    setPasswordError(null);
    setPending("password");
    setNotice(null);

    // Stays true past the redirect so the primary is not re-enabled underneath
    // a document load that has already been handed to the browser.
    let redirecting = false;
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      });

      if (error) {
        // Password cleared, and the notification carries the magic link as its
        // action. Focus goes to the password field rather than the email the
        // pattern's single-step drawing names: on step 2 the email is a summary
        // row, not a field, and the cleared password is what needs retyping —
        // the way back to the email stays one tab away on Edit.
        setNotice({ text: friendlyAuthMessage(error.message), tone: "error", offerMagicLink: true });
        setPassword("");
        passwordInputRef.current?.focus();
        return;
      }

      redirecting = true;
      setNotice({ text: "Signed in. Redirecting…", tone: "success" });
      redirectAfterLogin();
    } catch {
      // Not friendlyAuthMessage: a rejection carries a transport message
      // ("Failed to fetch"), not an auth one, and echoing it says nothing a
      // user can act on.
      setNotice({ text: UNREACHABLE_MESSAGE, tone: "error", offerMagicLink: true });
    } finally {
      if (!redirecting) setPending(null);
    }
  }

  // The alternative login, never a mode: one click sends the link instead of
  // switch-then-submit. It carries its own email guard because it is reachable
  // from the notification action as well as the button.
  async function sendMagicLink() {
    const trimmed = email.trim();
    if (!trimmed) {
      setNotice({ text: "Enter your work email to receive a sign-in link.", tone: "error" });
      emailInputRef.current?.focus();
      return;
    }

    setPending("link");
    setNotice(null);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: {
          // Never mint a new auth user from the login page — magic links are for
          // existing accounts only. Admins provision accounts.
          shouldCreateUser: false,
          emailRedirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent(nextPath)}`
        }
      });

      if (error) {
        if (isAccountAbsenceError(error.message)) {
          setNotice(MAGIC_LINK_NEUTRAL_NOTICE);
        } else {
          setNotice({ text: friendlyAuthMessage(error.message), tone: "error" });
        }
        return;
      }

      setNotice(MAGIC_LINK_NEUTRAL_NOTICE);
    } catch {
      setNotice({ text: UNREACHABLE_MESSAGE, tone: "error" });
    } finally {
      setPending(null);
    }
  }

  async function sendPasswordReset() {
    const trimmed = email.trim();
    if (!trimmed) {
      setNotice({ text: "Enter your work email first, then request a password reset.", tone: "error" });
      return;
    }

    setPending("reset");
    setNotice(null);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent("/auth/update-password")}`
      });

      if (error) {
        if (isAccountAbsenceError(error.message)) {
          setNotice(RESET_NEUTRAL_NOTICE);
        } else {
          setNotice({ text: friendlyAuthMessage(error.message), tone: "error" });
        }
        return;
      }

      setNotice(RESET_NEUTRAL_NOTICE);
    } catch {
      setNotice({ text: UNREACHABLE_MESSAGE, tone: "error" });
    } finally {
      setPending(null);
    }
  }

  function editEmail() {
    setPassword("");
    setShowPassword(false);
    setPasswordError(null);
    setNotice(null);
    setStep("email");
  }

  // Once hydrated, submit stays enabled and validates on submit so Enter works
  // everywhere and an empty click explains itself instead of hitting a silently
  // dead button.
  //
  // Before hydration there is no onSubmit yet, so a click ran the browser's
  // native submit: a GET back to /login that reloaded the page and threw away
  // whatever had been typed, with no message (UX-01, #276). Holding the button
  // disabled for that window keeps the input, and the "Starting up…" label keeps
  // the disabled state from being the silently dead button above — it says why.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (step === "email") continueToPassword();
    else void signInWithPassword();
  }

  // Fluid field (Carbon fluid text input; design 1e): 56px, label INSIDE, a
  // bottom rule and no box — stacked flush on step 2 so the summary row's
  // subtle rule reads as the divider between the email and password fields.
  //
  // Height is fixed and box-sizing is border-box (app/globals.css), so the
  // 1px → 2px rule change on focus or error cannot shift layout.
  //
  // The resting rule keeps --login-border-strong (#8d8d8d — 3.02:1 on the
  // #f4f4f4 fill, clearing WCAG 1.4.11's 3:1 for an essential UI boundary):
  // the handoff's #e0e0e0 is an internal DIVIDER between two flush fields
  // (the summary row uses it), never a field's sole boundary. Focus doubles
  // the rule in the 1e copper --login-accent, error in --login-error — the
  // thickness change is the second, non-colour cue.
  const fieldShellClass = (invalid: boolean, withTrailing = false) =>
    cx(
      // transition-[background-color], NOT transition-colors: the bottom rule
      // IS the focus indicator here, and a colour tween would delay it 150ms.
      // Only the hover fill eases.
      "relative flex h-14 bg-[var(--login-field)] px-4 transition-[background-color] hover:bg-[var(--login-field-hover)]",
      withTrailing ? "items-center gap-1" : "flex-col justify-center",
      // The `color:` hint is load-bearing. `border-[var(--x)]` is type-ambiguous
      // to Tailwind v3 — it cannot tell a length from a colour inside a var() —
      // and the focus variant lost silently, leaving a 2px rule still painted
      // #8d8d8d. Measured, not assumed. Keep the explicit longhand.
      invalid
        ? "border-b-2 border-b-[color:var(--login-error)]"
        : "border-b border-b-[color:var(--login-border-strong)] focus-within:border-b-2 focus-within:border-b-[color:var(--login-accent)]"
    );
  const fieldLabelClass = "block text-[11px] font-normal leading-[1.3] text-[var(--login-text-secondary)]";
  // outline-none is safe only because the shell above draws the focus rule.
  const fieldInputClass =
    "mt-1 w-full border-0 bg-transparent p-0 text-[13.5px] font-normal leading-[1.4] text-[var(--login-text-primary)] caret-[var(--login-accent)] outline-none placeholder:text-[var(--login-placeholder)]";
  const fieldErrorClass = "mt-1.5 text-[12px] leading-[1.4] text-[var(--login-error-text)]";
  // 1e links are plain copper (no resting underline, per the reference);
  // hover restores the underline so the affordance survives.
  const inlineLinkClass = cx(
    "text-[12px] font-medium text-[var(--login-link)] underline-offset-2 hover:underline",
    "disabled:cursor-not-allowed disabled:text-[var(--login-text-tertiary)] disabled:no-underline",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--sp-focus-ring-color)]"
  );
  const primaryButtonClass = cx(
    // No colour transition: hydration flips this button from disabled to
    // enabled on every load, and a 150ms tween made it fade up through a
    // washed-out orange with a barely legible label. Hover still reads fine as
    // an instant change.
    // Carbon button anatomy (1e): 48px, sharp corners, label left + glyph
    // right on a space-between row.
    "mt-6 flex h-12 w-full items-center justify-between gap-3 bg-[var(--login-accent)] px-4 text-[13.5px] font-medium leading-none text-white",
    "hover:bg-[var(--login-accent-hover)] active:bg-[var(--login-accent-hover)]",
    focusRingClass,
    // Disabled controls are exempt from contrast requirements; the quiet
    // field-grey pair works on both themes.
    "disabled:cursor-not-allowed disabled:bg-[var(--login-field)] disabled:text-[var(--login-text-tertiary)]"
  );
  const primaryArrowIcon = (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5 shrink-0"
    >
      <path d="M4 10h11m0 0-4-4m4 4-4 4" />
    </svg>
  );
  // The app's existing loading spinner treatment (design-system Button),
  // swapped into the arrow slot while the password sign-in is in flight.
  const primarySpinner = (
    <span
      aria-hidden="true"
      className="h-3.5 w-3.5 shrink-0 rounded-full border-2 border-current border-t-transparent motion-safe:animate-spin"
    />
  );

  return (
    <div className="flex flex-col">
      <h2 className="text-[28px] font-normal leading-[1.25] text-[var(--login-text-primary)]">Log in</h2>
      <p className="mt-2 text-[12.5px] leading-[1.5] text-[var(--login-text-secondary)]">
        Use your firm email. Viewers see the published map; admins can edit the draft.
      </p>

      {notice && (
        <div
          role={notice.tone === "error" ? "alert" : "status"}
          aria-live={notice.tone === "error" ? "assertive" : "polite"}
          className={cx(
            "mt-6 flex items-start gap-2.5 border-l-[3px] px-3.5 py-3",
            notice.tone === "error"
              ? "border-[var(--login-error)] bg-[var(--login-notice-error-bg)]"
              : "border-[var(--login-success)] bg-[var(--login-notice-success-bg)]"
          )}
        >
          <svg aria-hidden="true" viewBox="0 0 20 20" className="mt-px h-[15px] w-[15px] shrink-0">
            <circle cx="10" cy="10" r="8" fill={notice.tone === "error" ? "var(--login-error)" : "var(--login-success)"} />
            {notice.tone === "error" ? (
              <path d="m7 7 6 6m0-6-6 6" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
            ) : (
              <path d="m6.5 10.2 2.4 2.4 4.6-5.2" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            )}
          </svg>
          <div className="text-[12.5px] leading-[1.5] text-[var(--login-text-primary)]">
            <span className="font-semibold">{notice.text}</span>
            {notice.offerMagicLink && (
              <>
                <br />
                <button
                  type="button"
                  onClick={sendMagicLink}
                  disabled={pending !== null}
                  className={cx(inlineLinkClass, "mt-1.5 font-semibold")}
                >
                  Email me a magic link instead
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Inputs are deliberately name-less: a pre-hydration native submit must
          not serialize the password into the URL (GET form default). */}
      <form onSubmit={handleSubmit} noValidate aria-label="Log in">
        {step === "email" ? (
          <>
            <div className="mt-6">
              <div className={fieldShellClass(Boolean(emailError))}>
                <label htmlFor="login-email" className={fieldLabelClass}>
                  Email
                </label>
                <input
                  id="login-email"
                  ref={emailInputRef}
                  type="email"
                  spellCheck={false}
                  value={email}
                  onChange={event => {
                    setEmail(event.target.value);
                    if (emailError) setEmailError(null);
                  }}
                  placeholder="you@megeredchianlaw.com"
                  autoComplete="email"
                  aria-invalid={emailError ? true : undefined}
                  aria-describedby={emailError ? "login-email-error" : undefined}
                  className={fieldInputClass}
                />
                {emailError && (
                  <svg aria-hidden="true" viewBox="0 0 20 20" className="absolute right-3.5 top-1/2 h-[15px] w-[15px] -translate-y-1/2">
                    <circle cx="10" cy="10" r="8" fill="var(--login-error)" />
                    <path d="M10 5.5v5.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
                    <circle cx="10" cy="14" r="1.1" fill="#fff" />
                  </svg>
                )}
              </div>
              {emailError && (
                <p id="login-email-error" className={fieldErrorClass}>
                  {emailError}
                </p>
              )}
            </div>

            <label className="mt-4 flex items-center gap-[9px] text-[12.5px] text-[var(--login-text-secondary)]">
              <span className="relative inline-flex h-[15px] w-[15px] shrink-0 items-center justify-center">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={event => {
                    setRemember(event.target.checked);
                    // Unchecking clears the stored value immediately rather than
                    // waiting for a Continue the user may never press.
                    if (!event.target.checked) writeRememberedEmail(null);
                  }}
                  className={cx(
                    "peer h-[15px] w-[15px] shrink-0 appearance-none border border-[var(--login-border-strong)] bg-transparent",
                    "checked:border-[var(--login-text-primary)] checked:bg-[var(--login-text-primary)]",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--sp-focus-ring-color)] focus-visible:ring-offset-2"
                  )}
                />
                {/* The glyph paints in --login-bg so it stays legible on the
                    ink fill in light AND the ivory fill in dark. */}
                <svg
                  aria-hidden="true"
                  viewBox="0 0 10 10"
                  className="pointer-events-none absolute hidden h-[9px] w-[9px] text-[var(--login-bg)] peer-checked:block"
                >
                  <path d="M1.5 5.5 4 8l4.5-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              Remember my work email on this device
            </label>

            {/* Not the shared Button primitive, and the label is a DIRECT text
                child on purpose. Button centres its content, and wrapping the
                label in a span to get the label-left / arrow-right split made
                `button:text-is("Continue")` stop matching — Playwright's text
                engine binds to the smallest element containing the text, so the
                span captured it and every authenticated e2e test lost its
                sign-in step (tests/e2e-auth/auth-helpers.ts). */}
            <button type="submit" disabled={pending !== null || !hydrated} className={primaryButtonClass}>
              {!hydrated ? "Starting up…" : "Continue"}
              {hydrated && primaryArrowIcon}
            </button>
          </>
        ) : (
          <>
            {/* The entered email becomes an editable summary row — the pattern's
                way back, without retyping — dressed as the reference's filled
                fluid email field, its subtle bottom rule doubling as the
                divider above the password field. */}
            <div className="mt-6 flex h-14 items-center gap-3 border-b border-b-[color:var(--login-border-subtle)] bg-[var(--login-field)] px-4">
              <span className="min-w-0 flex-1">
                <span className={fieldLabelClass}>Email</span>
                <span className="mt-1 block truncate text-[13.5px] leading-[1.4] text-[var(--login-text-primary)]">
                  {email.trim()}
                </span>
              </span>
              <button type="button" onClick={editEmail} disabled={pending !== null} className={cx(inlineLinkClass, "shrink-0")}>
                Edit
              </button>
            </div>

            <div>
              <div className={fieldShellClass(Boolean(passwordError), true)}>
                <span className="flex min-w-0 flex-1 flex-col justify-center">
                  <label htmlFor="login-password" className={fieldLabelClass}>
                    Password
                  </label>
                  <input
                    id="login-password"
                    ref={passwordInputRef}
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={event => {
                      setPassword(event.target.value);
                      if (passwordError) setPasswordError(null);
                    }}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    aria-invalid={passwordError ? true : undefined}
                    aria-describedby={passwordError ? "login-password-error" : undefined}
                    className={cx(fieldInputClass, !showPassword && "tracking-[2px]")}
                  />
                </span>
                {passwordError && (
                  <svg aria-hidden="true" viewBox="0 0 20 20" className="h-[15px] w-[15px] shrink-0">
                    <circle cx="10" cy="10" r="8" fill="var(--login-error)" />
                    <path d="M10 5.5v5.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
                    <circle cx="10" cy="14" r="1.1" fill="#fff" />
                  </svg>
                )}
                <button
                  type="button"
                  onClick={() => setShowPassword(value => !value)}
                  aria-label="Show password"
                  aria-pressed={showPassword}
                  className={cx(
                    "grid h-8 w-8 flex-none place-items-center text-[var(--login-text-secondary)] transition-colors hover:bg-[var(--login-field-hover)]",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--sp-focus-ring-color)]"
                  )}
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="h-[15px] w-[15px]"
                  >
                    <path d="M2.5 10s3-5 7.5-5 7.5 5 7.5 5-3 5-7.5 5-7.5-5-7.5-5z" />
                    <circle cx="10" cy="10" r="2.2" />
                    {showPassword && <path d="m4.5 15.5 11-11" strokeLinecap="round" />}
                  </svg>
                </button>
              </div>
              {passwordError && (
                <p id="login-password-error" className={fieldErrorClass}>
                  {passwordError}
                </p>
              )}
            </div>

            {/* Meta row (1e): the policy hint anchors left, reset stays with
                the password field on the right rather than competing with the
                buttons below. The hint interpolates MIN_PASSWORD_LENGTH so it
                can never drift from the enforced minimum. */}
            <div className="mt-2 flex items-baseline justify-between gap-3 text-[11px]">
              <span className="text-[var(--login-text-tertiary)]">
                Passwords are at least {MIN_PASSWORD_LENGTH} characters.
              </span>
              <button
                type="button"
                onClick={sendPasswordReset}
                disabled={pending !== null}
                className={cx(inlineLinkClass, "shrink-0 text-[11px] font-normal")}
              >
                {pending === "reset" ? "Sending reset email…" : "Forgot password?"}
              </button>
            </div>

            <button type="submit" disabled={pending !== null || !hydrated} className={primaryButtonClass}>
              {!hydrated ? "Starting up…" : pending === "password" ? "Logging in…" : "Log in"}
              {hydrated && (pending === "password" ? primarySpinner : primaryArrowIcon)}
            </button>

            {/* The alternative login sits BELOW the primary behind a divider —
                never between the field and its primary button. */}
            <div className="mt-[22px] flex items-center gap-3">
              <span className="h-px flex-1 bg-[var(--login-border-subtle)]" />
              <span className="text-[11px] text-[var(--login-text-tertiary)]">or</span>
              <span className="h-px flex-1 bg-[var(--login-border-subtle)]" />
            </div>
            <button
              type="button"
              onClick={sendMagicLink}
              disabled={pending !== null}
              className={cx(
                "mt-[22px] flex h-12 w-full items-center justify-between gap-2.5 border border-[var(--login-border-strong)] bg-transparent px-4 text-[13px] leading-none text-[var(--login-text-primary)]",
                "transition-colors hover:bg-[var(--login-field-hover)] disabled:cursor-not-allowed disabled:opacity-50",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--sp-focus-ring-color)]"
              )}
            >
              Email me a magic link
              <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="h-3.5 w-3.5 shrink-0"
              >
                <rect x="2.5" y="4.5" width="15" height="11" />
                <path d="m3 5.5 7 5.5 7-5.5" />
              </svg>
            </button>
          </>
        )}
      </form>

      {/* The reference marks the administrator phrase in link colour without a
          destination (there is no admin-contact route), so it stays a styled
          span — colouring it as a live control would lie to pointer users. */}
      <p className="mt-[22px] text-[11px] leading-[1.5] text-[var(--login-text-tertiary)]">
        Trouble signing in? <span className="text-[var(--login-link)]">Contact the office administrator</span> —
        accounts are provisioned by the firm.
      </p>
    </div>
  );
}
