"use client";

// Prototype-only skin: the frozen two-step progressive-login flow
// (components/auth/LoginForm.tsx) rendered in the Ethereal Glass language.
// STATIC ON PURPOSE — no auth, no network, no Supabase import. Password
// submit always "fails" (mock demo state); the magic-link ghost actions do
// nothing beyond their own pressed-state animation. Visual vocabulary is
// copied from app/concepts/admin-v13/AdminV13.tsx wherever a matching class
// exists — concepts never import from each other, so this is a deliberate
// duplication.
import localFont from "next/font/local";
import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";

const geist = localFont({
  src: "../fonts/geist-latin-wght-normal.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--font-login13-grotesk",
  display: "swap"
});

const EASE = "cubic-bezier(0.32,0.72,0,1)";

// Format only, and deliberately loose — matches the frozen ruling: every
// well-formed address advances to step 2, so this can never become an
// account-existence oracle.
const EMAIL_PATTERN = /.+@.+\..+/;

const GLASS = {
  pageClass: "bg-[#050505] text-white",
  backdrop: (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className="absolute -top-40 left-1/4 h-[34rem] w-[34rem] rounded-full bg-[radial-gradient(circle_at_center,rgba(255,122,31,0.22),transparent_65%)]" />
      <div className="absolute bottom-0 right-0 h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(circle_at_center,rgba(255,122,31,0.10),transparent_65%)]" />
    </div>
  ),
  eyebrowClass:
    "inline-flex items-center rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-white/70",
  headingClass: "text-4xl font-semibold tracking-tight text-white md:text-5xl",
  shellClass: "rounded-[2rem] bg-white/5 p-1.5 ring-1 ring-white/10",
  coreClass:
    "relative overflow-hidden rounded-[calc(2rem-0.375rem)] bg-[#0b0b0d] shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)]",
  fieldLabelClass: "text-[11px] font-medium uppercase tracking-[0.18em] text-white/50",
  // Adapted from viewer-v13 GLASS.fieldClass: adds an `invalid` switch (a
  // brighter neutral rule, not a new colour — the inline hint text carries
  // the meaning, not the border alone) and a colour transition.
  fieldClass: (invalid: boolean) =>
    `w-full rounded-2xl border px-4 py-3 text-white placeholder:text-white/30 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#FF7A1F] ${
      invalid ? "border-white/40 bg-white/5" : "border-white/10 bg-white/5"
    }`,
  // Button-in-button pill (design-sampler's CTA recipe) carrying admin-v13's
  // primary colour + focus ring.
  buttonPrimaryClass:
    "group flex w-full items-center justify-between gap-3 rounded-full bg-[#FF7A1F] py-3 pl-6 pr-2 text-sm font-semibold text-black outline-none transition-transform active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[#FF7A1F] focus-visible:ring-offset-2 focus-visible:ring-offset-black",
  buttonPrimaryIconClass:
    "flex h-8 w-8 items-center justify-center rounded-full bg-black/10 transition-transform group-hover:-translate-y-[1px] group-hover:translate-x-1 group-hover:scale-105",
  buttonGhostClass:
    "inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-5 py-2 text-sm font-medium text-white/70 outline-none transition-transform hover:text-white active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[#FF7A1F]"
};

// Compact ghost, sized for the step-2 email summary row (not part of the
// copied AdminV13 vocabulary — the summary row is login-specific).
const editButtonClass =
  "shrink-0 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-white/70 outline-none transition-transform hover:text-white active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[#FF7A1F]";

const forgotPasswordLinkClass =
  "rounded-sm text-xs font-medium text-white/60 underline underline-offset-2 outline-none transition-colors hover:text-white active:opacity-70 focus-visible:ring-2 focus-visible:ring-[#FF7A1F]";

const magicLinkInlineClass =
  "rounded-sm font-semibold text-[#FF7A1F] underline underline-offset-2 outline-none transition-colors hover:text-[#ffb694] active:opacity-70 focus-visible:ring-2 focus-visible:ring-[#FF7A1F]";

function ArrowUpRight() {
  // Ultra-light inline stroke — no icon library. Copied verbatim from
  // app/concepts/design-sampler/DesignSampler.tsx.
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1">
      <path d="M4 12 12 4M6 4h6v6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AlertGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="mt-0.5 h-4 w-4 shrink-0 text-[#FF7A1F]" fill="none" stroke="currentColor" strokeWidth="1.3">
      <circle cx="10" cy="10" r="8" />
      <path d="M10 6.5v4" strokeLinecap="round" />
      <circle cx="10" cy="13.2" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

// Reveal-on-mount with a reduced-motion guard. Reduced motion (or no
// IntersectionObserver) => content is simply visible; no translation, no
// blur. Copied verbatim from app/concepts/admin-v13/AdminV13.tsx — concepts
// never import from each other, so this is a deliberate duplication. This is
// the file's one known react-hooks/set-state-in-effect warning.
function useReveal() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<"pending" | "revealed" | "static">("pending");

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (
      typeof IntersectionObserver === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setState("static");
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setState("revealed");
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return { ref, state };
}

// Parameterised on top of useReveal so every mount-in animation on this page
// — the card entry (defaults: 800ms / 4rem, the verbatim AdminV13 recipe)
// and the step choreography (500ms / smaller offsets, per this task's
// brief) — shares the one hook above instead of duplicating its
// setState-in-effect body.
function Reveal({
  delayMs = 0,
  durationMs = 800,
  distance = "4rem",
  className,
  children
}: {
  delayMs?: number;
  durationMs?: number;
  distance?: string;
  className?: string;
  children: ReactNode;
}) {
  const { ref, state } = useReveal();
  const hidden = state === "pending";
  const style: CSSProperties =
    state === "static"
      ? {}
      : {
          transition: `transform ${durationMs}ms ${EASE} ${delayMs}ms, opacity ${durationMs}ms ${EASE} ${delayMs}ms`,
          transform: hidden ? `translateY(${distance})` : "translateY(0)",
          opacity: hidden ? 0 : 1
        };
  return (
    <div ref={ref} className={className} style={style}>
      {children}
    </div>
  );
}

export function LoginV13() {
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [errorVisible, setErrorVisible] = useState(false);

  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);
  // Compares against the PREVIOUS step rather than a "have I run yet" flag —
  // StrictMode double-invokes effects in dev, so a first-run flag is already
  // spent on the second invocation and the email field would grab focus on
  // load. Same pattern as components/auth/LoginForm.tsx.
  const previousStepRef = useRef<1 | 2 | null>(null);

  useEffect(() => {
    const previous = previousStepRef.current;
    previousStepRef.current = step;
    if (previous === null || previous === step) return;
    if (step === 2) passwordInputRef.current?.focus();
    else emailInputRef.current?.focus();
  }, [step]);

  function handleStep1Submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = email.trim();
    if (!EMAIL_PATTERN.test(trimmed)) {
      setEmailError("Enter a valid email address");
      return;
    }
    setEmailError(null);
    setStep(2);
  }

  function handleStep2Submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Mock semantics: every password submit "fails" — this is a static skin,
    // not a working login. Focus stays on the password field, inside the
    // form; the alert announces itself via role="alert" and is never handed
    // focus directly.
    setPassword("");
    setErrorVisible(true);
    passwordInputRef.current?.focus();
  }

  function handleEdit() {
    setErrorVisible(false);
    setPassword("");
    setEmailError(null);
    setStep(1);
  }

  return (
    <div
      className={`${geist.variable} relative flex min-h-[100dvh] items-center justify-center overflow-hidden ${GLASS.pageClass} px-4 py-16`}
      style={{ fontFamily: "var(--font-login13-grotesk)" }}
    >
      {GLASS.backdrop}

      <Reveal className="relative w-full max-w-md">
        <div className={GLASS.shellClass}>
          <div className={`${GLASS.coreClass} flex flex-col gap-8 p-8 md:p-10`}>
            <div className="flex flex-col items-center gap-4 text-center">
              <span className={GLASS.eyebrowClass}>SEAT PLANNER</span>
              <h1 className={GLASS.headingClass}>Log in.</h1>
            </div>

            {step === 1 ? (
              <form
                onSubmit={handleStep1Submit}
                noValidate
                aria-label="Log in, step 1 of 2"
                className="flex flex-col gap-6"
              >
                <Reveal durationMs={500} distance="0.75rem">
                  <div className="flex flex-col gap-2">
                    <label htmlFor="login13-email" className={GLASS.fieldLabelClass}>
                      Work email
                    </label>
                    <input
                      id="login13-email"
                      ref={emailInputRef}
                      type="email"
                      value={email}
                      onChange={(event) => {
                        setEmail(event.target.value);
                        if (emailError) setEmailError(null);
                      }}
                      placeholder="you@megeredchianlaw.com"
                      autoComplete="email"
                      aria-invalid={emailError ? true : undefined}
                      aria-describedby={emailError ? "login13-email-error" : undefined}
                      className={GLASS.fieldClass(Boolean(emailError))}
                      style={{ transition: `box-shadow 300ms ${EASE}, border-color 300ms ${EASE}` }}
                    />
                    {emailError ? (
                      <p id="login13-email-error" className="text-xs text-white/60">
                        {emailError}
                      </p>
                    ) : null}
                  </div>
                </Reveal>

                <Reveal durationMs={500} distance="0.75rem" delayMs={70}>
                  <button type="submit" className={GLASS.buttonPrimaryClass}>
                    Continue
                    <span className={GLASS.buttonPrimaryIconClass}>
                      <ArrowUpRight />
                    </span>
                  </button>
                </Reveal>
              </form>
            ) : (
              <div className="flex flex-col gap-6">
                {errorVisible ? (
                  <Reveal durationMs={500} distance="0.5rem">
                    <div
                      role="alert"
                      className="flex items-start gap-3 rounded-2xl border border-[#FF7A1F]/30 bg-[#FF7A1F]/5 px-4 py-3.5 text-sm text-white/80"
                    >
                      <AlertGlyph />
                      <p>
                        That password didn&apos;t match. Try again, or{" "}
                        <button type="button" className={magicLinkInlineClass}>
                          email me a sign-in link.
                        </button>
                      </p>
                    </div>
                  </Reveal>
                ) : null}

                <form
                  onSubmit={handleStep2Submit}
                  noValidate
                  aria-label="Log in, step 2 of 2"
                  className="flex flex-col gap-4"
                >
                  <Reveal durationMs={500} distance="0.75rem">
                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                      <span className="min-w-0 flex-1 truncate text-sm text-white/80">{email.trim()}</span>
                      <button type="button" onClick={handleEdit} className={editButtonClass}>
                        Edit
                      </button>
                    </div>
                  </Reveal>

                  <Reveal durationMs={500} distance="0.75rem" delayMs={60}>
                    <div className="flex flex-col gap-2">
                      <label htmlFor="login13-password" className={GLASS.fieldLabelClass}>
                        Password
                      </label>
                      <input
                        id="login13-password"
                        ref={passwordInputRef}
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="Enter your password"
                        autoComplete="current-password"
                        className={GLASS.fieldClass(false)}
                        style={{ transition: `box-shadow 300ms ${EASE}, border-color 300ms ${EASE}` }}
                      />
                    </div>
                  </Reveal>

                  <Reveal durationMs={500} distance="0.75rem" delayMs={120}>
                    <div className="flex flex-col gap-5">
                      <button type="submit" className={`${GLASS.buttonPrimaryClass} mt-2`}>
                        Log in
                        <span className={GLASS.buttonPrimaryIconClass}>
                          <ArrowUpRight />
                        </span>
                      </button>

                      <div aria-hidden="true" className="flex items-center gap-3">
                        <span className="h-px flex-1 bg-white/10" />
                        <span className="text-[11px] uppercase tracking-[0.18em] text-white/40">or</span>
                        <span className="h-px flex-1 bg-white/10" />
                      </div>

                      <button type="button" className={`${GLASS.buttonGhostClass} w-full`}>
                        Email me a sign-in link instead
                      </button>

                      <button type="button" className={`${forgotPasswordLinkClass} self-center`}>
                        Forgot password?
                      </button>
                    </div>
                  </Reveal>
                </form>
              </div>
            )}
          </div>
        </div>
      </Reveal>
    </div>
  );
}
