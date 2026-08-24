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
 * Single-surface login — the design 1e reference layout verbatim
 * (design_handoff_login_1e/README.md): email over password as one flush
 * fluid-field stack, the primary beneath, and the magic link behind an "or"
 * divider BELOW the primary (the hierarchy rule: never between a field and
 * its primary button).
 *
 * Supersedes the Aug 11 2026 two-step ruling — owner decision 2026-08-15:
 * progressive disclosure was judged UX overhead ("complicating things if
 * they don't need to be"). Every security property of the two-step form is
 * retained; only the disclosure choreography is gone:
 *
 * - Inputs are NAME-LESS and the primary ships disabled pre-hydration, so a
 *   pre-hydration native GET submit has nothing to serialize into the URL —
 *   the two remaining layers of the old three-layer guard (the third, the
 *   password field's absence from step-1 HTML, was the choreography itself).
 * - No account-existence oracle: email validation is FORMAT-only, GoTrue
 *   answers unknown-email and wrong-password with the same error, and the
 *   magic-link / reset buttons return one neutral notice either way.
 * - Magic links never self-provision (shouldCreateUser: false); a password
 *   never reaches storage (Remember keeps the email alone).
 */

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

// Format only, and deliberately loose. The submit-time check can never become
// an account oracle: it looks at SHAPE, not existence, and the auth call it
// gates answers unknown-email and wrong-password with one identical error.
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
// account-existence oracle. The footer's "contact the office administrator"
// line carries the provisioning guidance.
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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  // Purely visual (the 1e eye toggle).
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

  useEffect(() => {
    setHydrated(true);
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");
    const next = safeNextPath(params.get("next"));
    setNextPath(next);

    // Returning visitor: prefill and re-check. Arriving at /login must not
    // steal focus from the page, so nothing is focused on mount.
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

  function redirectAfterLogin() {
    // Full document load, deliberately not router.push + router.refresh — the
    // session cookie just changed, and that pair raced two client transitions
    // that could wedge the router on the destination's loading skeleton.
    // Rationale lives with assignLocation (lib/fullNavigation.ts).
    assignLocation(nextPath);
  }

  async function signInWithPassword() {
    const trimmed = email.trim();

    // Submit-time validation, one field at a time so focus lands on the first
    // problem. Format only — see EMAIL_PATTERN.
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

    if (!password.trim()) {
      setPasswordError("Password is required");
      passwordInputRef.current?.focus();
      return;
    }

    // The remembered email persists at the moment of a real sign-in attempt —
    // the same "user has committed to this address" point Continue used to be.
    writeRememberedEmail(remember ? trimmed : null);
    setEmailError(null);
    setPasswordError(null);
    setPending("password");
    setNotice(null);

    // Stays true past the redirect so the primary is not re-enabled underneath
    // a document load that has already been handed to the browser.
    let redirecting = false;
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: trimmed,
        password
      });

      if (error) {
        // Password cleared, and the notification carries the magic link as its
        // action. Focus goes to the password field — the cleared password is
        // what needs retyping, and the email field is one Shift-Tab away.
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

  // Once hydrated, submit stays enabled and validates on submit so Enter works
  // everywhere and an empty click explains itself instead of hitting a silently
  // dead button.
  //
  // Before hydration there is no onSubmit yet, so a click ran the browser's
  // native submit: a GET back to /login that reloaded the page and threw away
  // whatever had been typed, with no message (UX-01, #276). Holding the button
  // disabled for that window keeps the input, and the "Starting up…" label keeps
  // the disabled state from being the silently dead button above — it says why.
  // With the password on this surface, the name-less inputs below are the
  // second layer of that guard: even a native GET serializes nothing.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    void signInWithPassword();
  }

  // Fluid field (Carbon fluid text input; design 1e): 56px, label INSIDE, a
  // bottom rule and no box — the email and password fields stack flush, the
  // email field's subtle rule doubling as the divider between them.
  //
  // Height is fixed and box-sizing is border-box (app/globals.css), so the
  // 1px → 2px rule change on focus or error cannot shift layout.
  //
  // Rest rules split by position (the 1.4.11 note): the STACK's bottom edge —
  // the password field — keeps --sp-border-strong (#8d8d8d, 3.02:1 on the
  // fill), the single line that says "this is an input". The email field's
  // rest rule is the handoff's --sp-border-subtle #e0e0e0: an internal
  // DIVIDER between two flush fills, never the stack's sole boundary. Focus
  // doubles the rule in the 1e copper, error in --sp-status-danger-mark — the thickness
  // change is the second, non-colour cue.
  const fieldShellClass = (invalid: boolean, options?: { withTrailing?: boolean; restRule?: "subtle" | "strong" }) =>
    cx(
      // transition-[background-color], NOT transition-colors: the bottom rule
      // IS the focus indicator here, and a colour tween would delay it 150ms.
      // Only the hover fill eases.
      "relative flex h-14 bg-[var(--sp-field)] px-4 transition-[background-color] hover:bg-[var(--sp-field-hover)]",
      options?.withTrailing ? "items-center gap-1" : "flex-col justify-center",
      // The `color:` hint is load-bearing. a bare var() inside a `border-` arbitrary value is type-ambiguous
      // to Tailwind v3 — it cannot tell a length from a colour inside a var() —
      // and the focus variant lost silently, leaving a 2px rule still painted
      // #8d8d8d. Measured, not assumed. Keep the explicit longhand.
      invalid
        ? "border-b-2 border-b-[color:var(--sp-status-danger-mark)]"
        : cx(
            options?.restRule === "subtle"
              ? "border-b border-b-[color:var(--sp-border-subtle)]"
              : "border-b border-b-[color:var(--sp-border-strong)]",
            // has-[input:focus], NOT focus-within: the password shell also
            // contains the eye toggle, and focus-within would paint the
            // field's focus rule while the BUTTON has keyboard focus — two
            // indicators, one pointing at the wrong control. The rule tracks
            // the input alone; the toggle keeps its own inset ring.
            "has-[input:focus]:border-b-2 has-[input:focus]:border-b-[color:var(--sp-button-primary)]"
          )
    );
  const fieldLabelClass = "block text-xs font-normal leading-[1.3] text-[var(--sp-text-secondary)]";
  // outline-none is safe only because the shell above draws the focus rule.
  const fieldInputClass =
    "mt-1 w-full border-0 bg-transparent p-0 text-[13.5px] font-normal leading-[1.4] text-[var(--sp-text-primary)] caret-[var(--sp-button-primary)] outline-none placeholder:text-[var(--sp-text-placeholder)]";
  const fieldErrorClass = "mt-1.5 text-[12px] leading-[1.4] text-[var(--sp-status-danger-text)]";
  // 1e links are plain copper (no resting underline, per the reference);
  // hover restores the underline so the affordance survives.
  //
  // TWO colour roles, deliberately: --sp-link (#B85207) is background-only —
  // it measures 4.49:1 on the field fill and 4.50:1 on the error tint, so a
  // link that sits ON a fill (the notification's recovery action) takes
  // --sp-link-on-field (#9F4605, 5.70:1 on both). The e2e axe scan flagged
  // the split's absence at 4.49:1.
  // Split base + colour rather than stacking a second text-[...] utility:
  // two same-specificity arbitrary utilities resolve by stylesheet order,
  // not class-list order, so an "override" can silently lose.
  const inlineLinkBaseClass = cx(
    "text-[12px] font-medium underline-offset-2 hover:underline",
    "disabled:cursor-not-allowed disabled:text-[var(--sp-text-helper)] disabled:no-underline",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--sp-focus)]"
  );
  const inlineLinkClass = cx(inlineLinkBaseClass, "text-[var(--sp-link)]");
  const onFieldLinkClass = cx(inlineLinkBaseClass, "text-[var(--sp-link-on-field)]");
  const primaryButtonClass = cx(
    // No colour transition: hydration flips this button from disabled to
    // enabled on every load, and a 150ms tween made it fade up through a
    // washed-out orange with a barely legible label. Hover still reads fine as
    // an instant change.
    // Carbon button anatomy (1e): 48px, sharp corners, label left + glyph
    // right on a space-between row.
    "mt-6 flex h-12 w-full items-center justify-between gap-3 bg-[var(--sp-button-primary)] px-4 text-[13.5px] font-medium leading-none text-white",
    "hover:bg-[var(--sp-button-primary-hover)] active:bg-[var(--sp-button-primary-hover)]",
    focusRingClass,
    // Disabled controls are exempt from contrast requirements; the quiet
    // field-grey pair works on both themes.
    "disabled:cursor-not-allowed disabled:bg-[var(--sp-field)] disabled:text-[var(--sp-text-helper)]"
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
      <h2 className="text-[28px] font-normal leading-[1.25] text-[var(--sp-text-primary)]">Log in</h2>
      <p className="mt-2 text-[12.5px] leading-[1.5] text-[var(--sp-text-secondary)]">
        Use your firm email. Viewers see the published map; admins can edit the draft.
      </p>

      {notice && (
        <div
          role={notice.tone === "error" ? "alert" : "status"}
          aria-live={notice.tone === "error" ? "assertive" : "polite"}
          className={cx(
            "mt-6 flex items-start gap-2.5 border-l-[3px] px-3.5 py-3",
            notice.tone === "error"
              ? "border-[var(--sp-status-danger-mark)] bg-[var(--sp-status-danger-surface)]"
              : "border-[var(--sp-status-success-mark)] bg-[var(--sp-status-success-surface)]"
          )}
        >
          <svg aria-hidden="true" viewBox="0 0 20 20" className="mt-px h-[15px] w-[15px] shrink-0">
            <circle cx="10" cy="10" r="8" fill={notice.tone === "error" ? "var(--sp-status-danger-mark)" : "var(--sp-status-success-mark)"} />
            {notice.tone === "error" ? (
              <path d="m7 7 6 6m0-6-6 6" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
            ) : (
              <path d="m6.5 10.2 2.4 2.4 4.6-5.2" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            )}
          </svg>
          <div className="text-[12.5px] leading-[1.5] text-[var(--sp-text-primary)]">
            <span className="font-semibold">{notice.text}</span>
            {notice.offerMagicLink && (
              <>
                <br />
                <button
                  type="button"
                  onClick={sendMagicLink}
                  disabled={pending !== null}
                  className={cx(onFieldLinkClass, "mt-1.5 font-semibold")}
                >
                  Email me a magic link instead
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Inputs are deliberately name-less: a pre-hydration native submit must
          not serialize the password into the URL (GET form default). With one
          surface this guard is structural, not stylistic — the password field
          IS in the server HTML now, so name-lessness plus the disabled
          pre-hydration primary are what keep that window inert. */}
      <form onSubmit={handleSubmit} noValidate aria-label="Log in">
        <div className="mt-6">
          <div className={fieldShellClass(Boolean(emailError), { restRule: "subtle" })}>
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
                <circle cx="10" cy="10" r="8" fill="var(--sp-status-danger-mark)" />
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

        <div>
          <div className={fieldShellClass(Boolean(passwordError), { withTrailing: true })}>
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
                <circle cx="10" cy="10" r="8" fill="var(--sp-status-danger-mark)" />
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
                "grid h-8 w-8 flex-none place-items-center text-[var(--sp-text-secondary)] transition-colors hover:bg-[var(--sp-field-hover)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--sp-focus)]"
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

        {/* Meta row (1e): the policy hint anchors left, reset stays with the
            password field on the right rather than competing with the buttons
            below. The hint interpolates MIN_PASSWORD_LENGTH so it can never
            drift from the enforced minimum. */}
        <div className="mt-2 flex items-baseline justify-between gap-3 text-xs">
          <span className="text-[var(--sp-text-helper)]">
            Passwords are at least {MIN_PASSWORD_LENGTH} characters.
          </span>
          <button
            type="button"
            onClick={sendPasswordReset}
            disabled={pending !== null}
            className={cx(inlineLinkClass, "shrink-0 text-xs font-normal")}
          >
            {pending === "reset" ? "Sending reset email…" : "Forgot password?"}
          </button>
        </div>

        <label className="mt-4 flex items-center gap-[9px] text-[12.5px] text-[var(--sp-text-secondary)]">
          <span className="relative inline-flex h-[15px] w-[15px] shrink-0 items-center justify-center">
            <input
              type="checkbox"
              checked={remember}
              onChange={event => {
                setRemember(event.target.checked);
                // Unchecking clears the stored value immediately rather than
                // waiting for a sign-in the user may never attempt.
                if (!event.target.checked) writeRememberedEmail(null);
              }}
              className={cx(
                "peer h-[15px] w-[15px] shrink-0 appearance-none border border-[var(--sp-border-strong)] bg-transparent",
                "checked:border-[var(--sp-text-primary)] checked:bg-[var(--sp-text-primary)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--sp-focus)] focus-visible:ring-offset-2"
              )}
            />
            {/* The glyph paints in --sp-background so it stays legible on the
                ink fill in light AND the ivory fill in dark. */}
            <svg
              aria-hidden="true"
              viewBox="0 0 10 10"
              className="pointer-events-none absolute hidden h-[9px] w-[9px] text-[var(--sp-background)] peer-checked:block"
            >
              <path d="M1.5 5.5 4 8l4.5-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          Remember my work email on this device
        </label>

        {/* Not the shared Button primitive, and the label is a DIRECT text
            child on purpose. Button centres its content, and wrapping the
            label in a span to get the label-left / arrow-right split made
            `button:text-is("Log in")` stop matching — Playwright's text
            engine binds to the smallest element containing the text, so the
            span captured it and every authenticated e2e test lost its
            sign-in step (tests/e2e-auth/auth-helpers.ts). */}
        <button type="submit" disabled={pending !== null || !hydrated} className={primaryButtonClass}>
          {!hydrated ? "Starting up…" : pending === "password" ? "Logging in…" : "Log in"}
          {hydrated && (pending === "password" ? primarySpinner : primaryArrowIcon)}
        </button>

        {/* The alternative login sits BELOW the primary behind a divider —
            never between a field and its primary button (the hierarchy rule
            survives the two-step retirement). */}
        <div className="mt-[22px] flex items-center gap-3">
          <span className="h-px flex-1 bg-[var(--sp-border-subtle)]" />
          <span className="text-xs text-[var(--sp-text-helper)]">or</span>
          <span className="h-px flex-1 bg-[var(--sp-border-subtle)]" />
        </div>
        <button
          type="button"
          onClick={sendMagicLink}
          disabled={pending !== null}
          className={cx(
            "mt-[22px] flex h-12 w-full items-center justify-between gap-2.5 border border-[var(--sp-border-strong)] bg-transparent px-4 text-[13px] leading-none text-[var(--sp-text-primary)]",
            "transition-colors hover:bg-[var(--sp-field-hover)] disabled:cursor-not-allowed disabled:opacity-50",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--sp-focus)]"
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
      </form>

      {/* The reference marks the administrator phrase in link colour without a
          destination (there is no admin-contact route), so it stays a styled
          span — colouring it as a live control would lie to pointer users. */}
      <p className="mt-[22px] text-xs leading-[1.5] text-[var(--sp-text-helper)]">
        Trouble signing in? <span className="text-[var(--sp-link)]">Contact the office administrator</span> —
        accounts are provisioned by the firm.
      </p>
    </div>
  );
}
