import Image from "next/image";

/**
 * PROTOTYPE ONLY — the predicted Carbon v12 sign-in screen (§06 of
 * "Carbon v12 — the prediction", 29 Jul 2026). It is the one screen with no
 * shell, so it shows the shape language on its own.
 *
 * STATIC ON PURPOSE. The source renders its field values as spans, not inputs,
 * and this keeps that: there is no <form>, no <input>, no submit handler and no
 * auth call anywhere in this file. It is a picture of a sign-in screen. The
 * controls are divs rather than buttons so assistive tech is never told
 * something is actionable when it is not — the real, working page is
 * app/login/page.tsx.
 *
 * FAITHFUL TO §06: the 520px frame · dark left column at 56/56/44 padding with
 * the mark at 40px and the wordmark at 400 44px/1.08, -.025em · 400px white
 * right column at 44/40 · fluid fields (label INSIDE the field, bottom rule
 * only, no box) at 56px with 2px gaps · the resting field showing a 1px rule
 * and the focused field a 2px brand rule · 48px stacked buttons, left-aligned
 * labels, arrow pushed right · helper line pinned to the bottom.
 *
 * TWO DELIBERATE DEVIATIONS, both surfaced in the notes rendered below:
 *
 * 1. CONTRAST. The source puts the footer line at #6f6f6f on #161616, roughly
 *    3.3:1 — below AA for body text. This uses --admin-chrome-disabled
 *    (#8E8276, ~4.6:1 on the chrome background per app/globals.css) instead.
 *    Everything else in the source already clears AA.
 *
 * 2. NO FIELD-UNDERLINE TOKEN EXISTS. The source's resting rule is #8d8d8d and
 *    the repo's greige ramp has no equivalent — border-strong (#D8D0C5) is far
 *    too faint to read as an input, and the text tokens are the wrong role. It
 *    borrows --admin-status-neutral (#8E8276), the closest greige twin. That
 *    gap is itself an argument for §03's proposed color.border.strong.
 *
 * Colours otherwise map to the repo's tokens per the owner's palette call, so
 * #161616, #ffffff, #FF5715 and #D23F0A are exact and the greige neutrals read
 * slightly warmer than the source's IBM ramp.
 */

const FIELD_SHELL = "flex h-14 flex-col justify-center bg-[var(--admin-surface-alt)] px-4";
const FIELD_LABEL = "text-[12px] font-normal leading-[1.3] text-[var(--admin-text-muted)]";
const FIELD_VALUE = "text-[15px] font-normal leading-[1.4] text-[var(--admin-text-primary)]";
const ACTION_SHELL = "flex min-h-12 items-center px-[18px] text-[15px] leading-none";

function Note({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-w-[280px] flex-1 bg-[var(--admin-surface)] p-4">
      <div className="text-[13px] font-semibold leading-[1.3] text-[var(--admin-text-primary)]">{title}</div>
      <p className="mt-2 text-[13px] font-normal leading-[1.6] text-[var(--admin-text-secondary)]">{children}</p>
    </div>
  );
}

export function LoginV12Preview() {
  return (
    <div className="admin-theme min-h-screen bg-[var(--admin-bg)] p-6 text-[var(--admin-text-primary)]">
      <h1 className="text-lg font-semibold">Login in v12 — Carbon prediction §06 mock</h1>
      <p className="mt-1 max-w-[74ch] text-sm leading-6 text-[var(--admin-text-secondary)]">
        Fluid fields: the label lives inside the field, there is a bottom rule and no box, and the brand mark sits at
        display scale against the inverse background. This is a static picture — no form, no inputs, nothing to submit.
        The working page is <span className="font-mono text-[13px]">/login</span>.
      </p>

      <div className="mt-4 flex h-[520px] w-full items-stretch overflow-hidden">
        {/* Left — inverse background, brand at display scale. */}
        <div className="flex min-w-0 flex-1 flex-col bg-[var(--admin-chrome-bg)] px-14 pb-11 pt-14">
          <Image
            src="/images/megeredchian-mark.png?v=ma-2026-128"
            alt=""
            width={40}
            height={40}
            unoptimized
            className="h-10 w-10 object-contain"
          />
          <h2 className="mt-auto text-[44px] font-normal leading-[1.08] tracking-[-0.025em] text-white">
            Megeredchian&nbsp;Law
            <br />
            Seat Planner
          </h2>
          <p className="mt-[18px] max-w-[300px] text-[14.5px] font-normal leading-[1.6] text-[var(--admin-chrome-muted)]">
            The internal seating map — who sits where, across every floor we occupy.
          </p>
          {/* Contrast fix vs the source (#6f6f6f is ≈3.3:1 on #161616). */}
          <div className="mt-[34px] font-mono text-[12px] font-normal leading-none text-[var(--admin-chrome-disabled)]">
            seats.megeredchianlaw.com · internal use only
          </div>
        </div>

        {/* Right — the 400px sign-in column. */}
        <div className="flex w-[400px] shrink-0 flex-col bg-[var(--admin-surface)] px-10 py-11">
          <h3 className="text-[26px] font-normal leading-[1.2] tracking-[-0.015em] text-[var(--admin-text-primary)]">
            Sign in
          </h3>

          <div className="mt-7 flex flex-col gap-[2px]">
            {/* Resting: 1px rule. */}
            <div className={`${FIELD_SHELL} border-b border-[var(--admin-status-neutral)]`}>
              <span className={FIELD_LABEL}>Work email</span>
              <span className={FIELD_VALUE}>e.marchetti@megeredchianlaw.com</span>
            </div>
            {/* Focused: 2px brand rule. Both states are shown at once so the
                fluid pattern is legible without interaction. */}
            <div className={`${FIELD_SHELL} border-b-2 border-[var(--admin-primary)]`}>
              <span className={FIELD_LABEL}>Password</span>
              <span className={`${FIELD_VALUE} font-mono tracking-[0.12em]`}>••••••••••••</span>
            </div>
          </div>

          {/* Divs, not buttons — this is a picture, and nothing here acts. */}
          <div className={`${ACTION_SHELL} mt-6 bg-[var(--admin-primary-cta)] font-semibold text-white`}>
            Sign in
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" className="ml-auto" aria-hidden="true">
              <path d="M4 10h11m0 0-4-4m4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className={`${ACTION_SHELL} mt-[2px] border border-[var(--admin-border-strong)] font-medium text-[var(--admin-text-primary)]`}>
            Email me a sign-in link
          </div>

          <span className="flex-1" />

          <p className="text-[12.5px] font-normal leading-[1.6] text-[var(--admin-text-muted)]">
            Access is limited to firm accounts. Ask an admin if your role needs to change.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-[1px] bg-[var(--admin-border)]">
        <Note title="Two deviations from the source">
          The footer line moves off #6f6f6f, which is about 3.3:1 on #161616 and fails AA for body text, onto
          --admin-chrome-disabled (~4.6:1). And the resting field rule borrows --admin-status-neutral because the repo
          has no field-underline token at all — border-strong is far too faint to read as an input. That gap is an
          argument for the DTCG rename in §03, which proposes exactly such a token.
        </Note>
        <Note title="What this asks of the shipped page">
          The real /login is a single dark column. This splits it: brand and purpose on the inverse background, the form
          on white at a fixed 400px. It also drops boxed inputs for fluid fields, which is a bigger change than it looks
          — every other field in the app is currently a bordered box.
        </Note>
        <Note title="Not decided here">
          The prediction&apos;s other sections conflict with choices already made — a 400px floating right panel against
          the 288px docked inspector, a contextual floating action bar against the inspector&apos;s fixed row, and 40px
          fields against the chrome staying its original size. None of that is touched by this screen.
        </Note>
      </div>
    </div>
  );
}
