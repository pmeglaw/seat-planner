"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { friendlyAuthMessage, friendlyAuthMessageFromQuery, safeNextPath } from "@/lib/authMessages";
import { assignLocation } from "@/lib/fullNavigation";
import { cx, focusRingClass } from "@/components/ui/design-system";

/**
 * Progressive auth, Carbon's login pattern (canvas options 2a/2b):
 * step 1 asks only for identity (work email + Continue), step 2 discloses the
 * password with the entered email as an editable summary row — the way back.
 *
 * The magic link appears ONLY on step 2: below the primary, behind an "or"
 * divider, and as the action inside the failed-login notification. Never on
 * step 1, and never between a field and its primary button (the pattern's
 * hierarchy rule). Owner decision, Aug 11 2026.
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
        setNotice({ text: friendlyAuthMessage(error.message), tone: "error" });
        return;
      }

      setNotice({
        text: "Check your email for the sign-in link. Use the newest email if you requested more than one link.",
        tone: "success"
      });
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
        setNotice({ text: friendlyAuthMessage(error.message), tone: "error" });
        return;
      }

      setNotice({ text: "Password reset email sent. Open the newest email to set a new password.", tone: "success" });
    } catch {
      setNotice({ text: UNREACHABLE_MESSAGE, tone: "error" });
    } finally {
      setPending(null);
    }
  }

  function editEmail() {
    setPassword("");
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

  // Fluid field (56px, label INSIDE, bottom rule, no box) — the login-only
  // exception to the app's boxed fields, per canvas 2a/2b and the
  // app/concepts/login-v12 precedent.
  //
  // Height is fixed and box-sizing is border-box (app/globals.css), so the
  // 1px → 2px rule change on focus or error cannot shift layout.
  //
  // The rule triple is specified together for a reason: --admin-field-rule
  // (#8d8d8d) on --admin-field-fill (#F4F4F4) measures 3.02:1, clearing WCAG
  // 1.4.11's 3:1 for an essential UI boundary — the single line that says
  // "this is an input" has to carry that on its own. Focus keeps --admin-primary
  // (#FF5715, the slice-1 accent ruling) and error uses --admin-error (#B3232C,
  // 4.8:1 on the fill); both double the thickness, a second non-colour cue.
  const fieldShellClass = (invalid: boolean) =>
    cx(
      "relative flex h-14 flex-col justify-center bg-[var(--admin-field-fill)] px-4 transition-colors",
      // The `color:` hint is load-bearing. `border-[var(--x)]` is type-ambiguous
      // to Tailwind v3 — it cannot tell a length from a colour inside a var() —
      // and the focus variant lost silently, leaving a 2px rule still painted
      // #8d8d8d. Measured, not assumed. Keep the explicit longhand.
      invalid
        ? "border-b-2 border-b-[color:var(--admin-error)]"
        : "border-b border-b-[color:var(--admin-field-rule)] focus-within:border-b-2 focus-within:border-b-[color:var(--admin-primary)]"
    );
  const fieldLabelClass = "text-[12px] font-normal leading-[1.3] text-[var(--admin-text-muted)]";
  // outline-none is safe only because the shell above draws the focus rule.
  const fieldInputClass =
    "w-full border-0 bg-transparent p-0 text-[15px] font-normal leading-[1.4] text-[var(--admin-text-primary)] outline-none placeholder:text-[var(--admin-text-muted)]";
  const fieldErrorClass = "mt-1.5 text-[12px] leading-[1.4] text-[var(--admin-error)]";
  const inlineLinkClass = cx(
    "text-[12.5px] font-medium text-[var(--admin-primary-cta-active)] underline underline-offset-2",
    "transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:text-[var(--admin-text-muted)] disabled:no-underline",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--sp-focus-ring-color)]"
  );
  const primaryButtonClass = cx(
    // No colour transition: hydration flips this button from disabled to
    // enabled on every load, and a 150ms tween made it fade up through a
    // washed-out orange with a barely legible label. Hover still reads fine as
    // an instant change.
    "mt-6 flex min-h-12 w-full items-center justify-between gap-3 bg-[var(--admin-primary-cta)] px-[18px] text-[15px] font-semibold leading-none text-white",
    "hover:bg-[var(--admin-primary-cta-hover)] active:bg-[var(--admin-primary-cta-active)]",
    focusRingClass,
    "disabled:cursor-not-allowed disabled:bg-[var(--sp-color-state-disabled)] disabled:text-[var(--sp-color-text-muted)]"
  );

  return (
    <div className="flex flex-1 flex-col">
      <h1 className="text-[26px] font-normal leading-[1.2] tracking-[-0.015em] text-[var(--admin-text-primary)]">
        Log in
      </h1>
      {step === "email" && (
        <p className="mt-2.5 text-[13px] text-[var(--admin-text-secondary)]">
          Use your work email to access the internal seating map.
        </p>
      )}

      {notice && (
        <div
          role={notice.tone === "error" ? "alert" : "status"}
          aria-live={notice.tone === "error" ? "assertive" : "polite"}
          className={cx(
            "mt-6 flex items-start gap-2.5 border-l-[3px] px-3.5 py-3",
            notice.tone === "error"
              ? "border-[var(--admin-error)] bg-[var(--admin-state-error-bg)]"
              : "border-[var(--admin-status-ok)] bg-[var(--admin-state-saved-bg)]"
          )}
        >
          <svg aria-hidden="true" viewBox="0 0 20 20" className="mt-px h-[15px] w-[15px] shrink-0">
            <circle cx="10" cy="10" r="8" fill={notice.tone === "error" ? "var(--admin-error)" : "var(--admin-status-ok)"} />
            {notice.tone === "error" ? (
              <path d="m7 7 6 6m0-6-6 6" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
            ) : (
              <path d="m6.5 10.2 2.4 2.4 4.6-5.2" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            )}
          </svg>
          <div className="text-[12.5px] leading-[1.5] text-[var(--admin-text-primary)]">
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
                  Email me a sign-in link instead
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
            <div className="mt-7">
              <div className={fieldShellClass(Boolean(emailError))}>
                <label htmlFor="login-email" className={fieldLabelClass}>
                  Work email
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
                    <circle cx="10" cy="10" r="8" fill="var(--admin-error)" />
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

            <label className="mt-4 flex items-center gap-[9px] text-[13px] text-[var(--admin-text-primary)]">
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
                    "peer h-[15px] w-[15px] shrink-0 appearance-none border border-[var(--admin-field-rule)] bg-white",
                    "checked:border-[var(--admin-text-primary)] checked:bg-[var(--admin-text-primary)]",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--sp-focus-ring-color)] focus-visible:ring-offset-2"
                  )}
                />
                <svg
                  aria-hidden="true"
                  viewBox="0 0 10 10"
                  className="pointer-events-none absolute hidden h-[9px] w-[9px] text-white peer-checked:block"
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
              {hydrated && (
                <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0">
                  <path d="M4 10h11m0 0-4-4m4 4-4 4" />
                </svg>
              )}
            </button>
          </>
        ) : (
          <>
            {/* The entered email becomes an editable summary row — the pattern's
                way back, without retyping. */}
            <div className="mt-7 flex min-h-10 items-center gap-2.5 border border-[var(--admin-border)] bg-[var(--admin-surface-alt)] px-3">
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="var(--admin-text-secondary)" strokeWidth="1.5" className="h-[13px] w-[13px] shrink-0">
                <rect x="3" y="5" width="14" height="10.5" />
                <path d="m3.5 5.8 6.5 5 6.5-5" />
              </svg>
              <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--admin-text-primary)]">{email.trim()}</span>
              <button type="button" onClick={editEmail} disabled={pending !== null} className={cx(inlineLinkClass, "shrink-0 text-[12px]")}>
                Edit
              </button>
            </div>

            <div className="mt-0.5">
              <div className={fieldShellClass(Boolean(passwordError))}>
                <label htmlFor="login-password" className={fieldLabelClass}>
                  Password
                </label>
                <input
                  id="login-password"
                  ref={passwordInputRef}
                  type="password"
                  value={password}
                  onChange={event => {
                    setPassword(event.target.value);
                    if (passwordError) setPasswordError(null);
                  }}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  aria-invalid={passwordError ? true : undefined}
                  aria-describedby={passwordError ? "login-password-error" : undefined}
                  className={fieldInputClass}
                />
                {passwordError && (
                  <svg aria-hidden="true" viewBox="0 0 20 20" className="absolute right-3.5 top-1/2 h-[15px] w-[15px] -translate-y-1/2">
                    <circle cx="10" cy="10" r="8" fill="var(--admin-error)" />
                    <path d="M10 5.5v5.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
                    <circle cx="10" cy="14" r="1.1" fill="#fff" />
                  </svg>
                )}
              </div>
              {passwordError && (
                <p id="login-password-error" className={fieldErrorClass}>
                  {passwordError}
                </p>
              )}
            </div>

            {/* Reset belongs to the password field, so it sits with it rather
                than competing with the buttons below. */}
            <div className="mt-2 flex justify-end">
              <button type="button" onClick={sendPasswordReset} disabled={pending !== null} className={inlineLinkClass}>
                {pending === "reset" ? "Sending reset email…" : "Forgot password?"}
              </button>
            </div>

            <button type="submit" disabled={pending !== null || !hydrated} className={primaryButtonClass}>
              {!hydrated ? "Starting up…" : pending === "password" ? "Logging in…" : "Log in"}
              {hydrated && pending !== "password" && (
                <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0">
                  <path d="M4 10h11m0 0-4-4m4 4-4 4" />
                </svg>
              )}
            </button>

            {/* The alternative login sits BELOW the primary behind a divider —
                never between the field and its primary button.

                The "or" label and the field placeholders take --admin-text-muted
                (#6E655A, 5.7:1 on white / 5.2:1 on the field fill) rather than
                the mock's #8E8276, which measures 3.75:1 and fails AA at 11px.
                tests/e2e/accessibility.spec.ts catches this — it is what the
                step-2 axe scan was added to see. */}
            <div className="mt-5 flex items-center gap-3">
              <span className="h-px flex-1 bg-[var(--admin-border)]" />
              <span className="text-[11px] text-[var(--admin-text-muted)]">or</span>
              <span className="h-px flex-1 bg-[var(--admin-border)]" />
            </div>
            <button
              type="button"
              onClick={sendMagicLink}
              disabled={pending !== null}
              className={cx(
                "mt-5 flex min-h-12 w-full items-center px-[18px] text-[15px] font-medium leading-none",
                "border border-[var(--admin-border-strong)] bg-[var(--admin-surface)] text-[var(--admin-text-primary)]",
                "transition-colors hover:bg-[var(--admin-surface-alt)] disabled:cursor-not-allowed disabled:opacity-50",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--sp-focus-ring-color)]"
              )}
            >
              Email me a sign-in link instead
            </button>
          </>
        )}
      </form>

      <span className="min-h-8 flex-1" />
      <p className="text-[12.5px] leading-[1.6] text-[var(--admin-text-muted)]">
        Need help? Accounts are provisioned by the firm — ask an office admin.
      </p>
    </div>
  );
}
