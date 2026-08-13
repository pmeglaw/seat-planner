# Plan 019: Close the account-existence oracle on the login page's magic-link and reset paths

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 985660a..HEAD -- components/auth/LoginForm.tsx lib/authMessages.ts tests/login-form.test.mjs tests/auth-messages.test.mjs CLAUDE.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW-MED (user-visible copy change on an owner-designed surface — see Maintenance notes)
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `985660a`, 2026-08-13

## Why this matters

The two-step login (#372) was explicitly designed so step 1 never reveals
whether an account exists — "every well-formed address advances to step 2
(no account-existence oracle)" per `CLAUDE.md` and the comment at
`components/auth/LoginForm.tsx:49-51`. But step 2 gives the answer away: the
"Email me a sign-in link instead" button calls `signInWithOtp` with
`shouldCreateUser: false`, and GoTrue's refusal for a nonexistent account is
mapped to the distinct message "This email is not set up yet. Ask an admin to
create the user first." — while an existing account gets "Check your email
for the sign-in link." An unauthenticated visitor (or script) can therefore
test any address for membership: enter it, click the magic-link button, read
which of two responses comes back. The password-reset button has the same
shape. This yields a validated employee/target list for phishing or
password-spray with zero authentication. The fix makes both paths return one
neutral response regardless of account existence, which also makes the
repo's own no-oracle claim true.

## Current state

- `components/auth/LoginForm.tsx` — the two-step login form ("use client").
  Three relevant sites:
  - `sendMagicLink()` at lines 211–248. The error branch (lines 234–237)
    surfaces the oracle:

```tsx
      if (error) {
        setNotice({ text: friendlyAuthMessage(error.message), tone: "error" });
        return;
      }

      setNotice({
        text: "Check your email for the sign-in link. Use the newest email if you requested more than one link.",
        tone: "success"
      });
```

  - `sendPasswordReset()` at lines 250–277 — identical shape
    (`friendlyAuthMessage(error.message)` on error at line 267, distinct
    success copy at line 271).
  - The magic-link button is reachable two ways: the step-2 secondary button
    (lines 561–573) and the failed-password notification's inline action
    (lines 379–391, gated by `notice.offerMagicLink`). Both call the same
    `sendMagicLink`, so fixing the function fixes both entry points.
  - The static footer at lines 579–581 already reads "Need help? Accounts
    are provisioned by the firm — ask an office admin." — the
    provisioning guidance survives this change without the oracle.

- `lib/authMessages.ts` — auth copy module. `classifyAuthMessage` (shared
  core) contains the mapping that produces the oracle string at lines 41–47:

```ts
  if (
    normalized.includes("user not found") ||
    normalized.includes("signup disabled") ||
    normalized.includes("signups not allowed")
  ) {
    return "This email is not set up yet. Ask an admin to create the user first.";
  }
```

  This mapping must STAY (see Scope — it serves the `?error=` query path,
  which is not an enumeration surface), but LoginForm must stop letting it
  reach an unauthenticated probe. The module exposes `friendlyAuthMessage`
  (SDK errors) and `friendlyAuthMessageFromQuery` (`?error=` param); both
  wrap `classifyAuthMessage`.

- `tests/login-form.test.mjs` — 29 jsdom mounting tests for the form. The
  harness stubs `supabase.auth.signInWithOtp` (lines 47–50); tests drive it
  with `results.otp` resolutions. Model new tests on the existing OTP tests
  in this file.
- `tests/auth-messages.test.mjs` — the mapping is pinned at lines 33–40
  ("auth message maps otp-signup-refused to admin-provisioning guidance").
  That test stays passing (the mapping survives); only its role changes —
  update its comment per Step 4.
- `CLAUDE.md` — the security-boundary section claims the no-oracle property
  ("every well-formed address advances to step 2 (no account-existence
  oracle)").

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install (if needed) | `npm install` | exit 0 (NOT `npm ci` — EPERMs on this box) |
| Login form tests | `node --test tests/login-form.test.mjs` | all pass |
| Auth message tests | `node --test tests/auth-messages.test.mjs` | all pass |
| Typecheck | `npm run typecheck` | exit 0 |
| Full suite | `npm test` | ~600+ pass / 0 fail |
| Lint | `npm run lint` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `components/auth/LoginForm.tsx`
- `lib/authMessages.ts` (one added exported helper; no mapping removal)
- `tests/login-form.test.mjs`
- `tests/auth-messages.test.mjs` (comment + one new test only)
- `CLAUDE.md` (one clause)

**Out of scope** (do NOT touch, even though they look related):
- The `classifyAuthMessage` mapping itself. `friendlyAuthMessageFromQuery`
  feeds the `/login?error=` banner — the arrival path for a clicked email
  link (e.g. a magic link for a since-deactivated account). The visitor
  there has already proven email access, so "not set up yet" guidance is
  helpful, not an oracle. Removing the mapping would degrade that path.
- Step-1 behavior. "Every well-formed address advances to step 2" is an
  owner decision (#372); nothing here touches `EMAIL_PATTERN` or the step
  transition. The existing step-1 no-oracle test must keep passing.
- `app/auth/*` callback routes, `lib/supabase/authRedirect.ts`.
- The GoTrue timing difference (refusal returns faster than a real send).
  Accepted residual — not fixable client-side; do not add artificial delays.

## Git workflow

- Branch: `advisor/019-magic-link-account-oracle`
- Conventional commits (e.g. `fix(login): one neutral response on the magic-link and reset paths`)
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add an account-absence classifier to `lib/authMessages.ts`

Export a small predicate next to the existing helpers, reusing the same
normalization the module already applies (lowercasing — match how
`classifyAuthMessage` normalizes):

```ts
/**
 * True when a GoTrue error means "no such account" — the class of failure
 * the login page must NOT distinguish from success, or the magic-link /
 * reset buttons become an account-existence oracle for unauthenticated
 * visitors. The ?error= query path deliberately still maps these to
 * admin-provisioning guidance: arriving there requires a clicked email
 * link, which already proves email access.
 */
export function isAccountAbsenceError(rawMessage: string): boolean {
  const normalized = rawMessage.toLowerCase();
  return (
    normalized.includes("user not found") ||
    normalized.includes("signup disabled") ||
    normalized.includes("signups not allowed")
  );
}
```

Keep the three substrings byte-identical to the ones in
`classifyAuthMessage` lines 41–47 (they are the pinned GoTrue shapes). If
the module structure suggests it, the mapping branch and this predicate may
share one substring-list constant — acceptable, as long as both public
behaviors are unchanged.

**Verify**: `npm run typecheck` → exit 0.

### Step 2: Neutralize the magic-link path in `LoginForm.tsx`

In `sendMagicLink()`, make the account-absence outcome byte-identical to the
success outcome. Define the shared notice once (module scope, near
`UNREACHABLE_MESSAGE`):

```tsx
// One response for "sent" and "no such account": the magic-link button is
// reachable pre-auth, so distinguishing the two would hand any visitor an
// account-existence oracle (the thing step 1 was built to avoid). The
// footer's "ask an office admin" line carries the provisioning guidance.
const MAGIC_LINK_NEUTRAL_NOTICE = {
  text: "If that address has an account, the sign-in link is on its way. Use the newest email if you requested more than one link.",
  tone: "success"
} as const;
```

Then in the handler:

```tsx
      if (error) {
        if (isAccountAbsenceError(error.message)) {
          setNotice(MAGIC_LINK_NEUTRAL_NOTICE);
        } else {
          setNotice({ text: friendlyAuthMessage(error.message), tone: "error" });
        }
        return;
      }

      setNotice(MAGIC_LINK_NEUTRAL_NOTICE);
```

Import `isAccountAbsenceError` from `@/lib/authMessages`. Note the success
branch changes too — both outcomes must render the SAME object. Other error
classes (rate limit, network) keep their real messages: they don't
distinguish existence.

**Verify**: `node --test tests/login-form.test.mjs` → the suite may have a
failing test if any existing test pins the old "Check your email" copy —
update that test's expected string to the neutral copy in the same commit.
All pass afterward.

### Step 3: Neutralize the password-reset path the same way

Same transformation in `sendPasswordReset()` with its own constant:

```tsx
const RESET_NEUTRAL_NOTICE = {
  text: "If that address has an account, a password reset email is on its way. Open the newest email to set a new password.",
  tone: "success"
} as const;
```

Error branch: `isAccountAbsenceError` → neutral notice; otherwise unchanged.
Success branch: neutral notice.

**Verify**: `node --test tests/login-form.test.mjs` → all pass (after
updating any test pinning the old reset success copy).

### Step 4: Pin the property with tests

In `tests/login-form.test.mjs`, add (modeled on the existing OTP tests):

1. `"magic-link refusal for an unknown account renders the same notice as success"` —
   drive `sendMagicLink` twice against the stub: once resolving
   `{ error: null }`, once resolving
   `{ error: { message: "Signups not allowed for otp" } }`. Assert the
   rendered notice text is IDENTICAL in both runs, and that the tone/status
   role is identical (both should render as the success/status treatment,
   not `role="alert"`).
2. Same pair for the reset path with
   `{ error: { message: "User not found" } }`.
3. `"magic-link failures that are not absence still explain themselves"` —
   resolve `{ error: { message: "Email rate limit exceeded" } }`, assert
   the notice is the rate-limit message (`friendlyAuthMessage` mapping), not
   the neutral copy — the neutralization must not swallow real errors.

In `tests/auth-messages.test.mjs`: keep the existing mapping test passing;
update its comment to say the mapping now serves the `?error=` arrival path
(the login page's live buttons neutralize this class via
`isAccountAbsenceError`). Add one test for `isAccountAbsenceError`: true for
the three pinned shapes (any casing), false for
`"Invalid login credentials"` and `"Email rate limit exceeded"`.

**Verify**: `node --test tests/login-form.test.mjs tests/auth-messages.test.mjs` → all pass, including the new tests. Then
temporarily revert Step 2 (restore the plain `friendlyAuthMessage` error
branch), rerun, confirm new test 1 FAILS. Re-apply.

### Step 5: Make the documented claim true

In `CLAUDE.md`, the login paragraph currently claims "every well-formed
address advances to step 2 (no account-existence oracle)". Extend the
parenthetical so it covers the whole flow, e.g.:
"(no account-existence oracle — step 2's magic-link and reset buttons return
one neutral response whether or not the account exists)". Keep the edit to
that clause; CLAUDE.md is otherwise out of scope.

**Verify**: `git diff CLAUDE.md` shows only that clause changed.

### Step 6: Full gate

**Verify**: `npm test` → 0 fail. `npm run typecheck` → exit 0.
`npm run lint` → exit 0.

## Test plan

Covered in Step 4. Structural pattern: existing OTP tests in
`tests/login-form.test.mjs` (stubbed `signInWithOtp` via the harness's
`makeSupabase`, notice text asserted from the rendered DOM). The
byte-identical assertion between the two outcomes is the core regression
net; the non-absence-error test guards against over-neutralizing.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `node --test tests/login-form.test.mjs tests/auth-messages.test.mjs` exits 0, including the 4+ new tests
- [ ] `grep -n "isAccountAbsenceError" components/auth/LoginForm.tsx` shows imports/uses in both `sendMagicLink` and `sendPasswordReset`
- [ ] `grep -n "This email is not set up yet" lib/authMessages.ts` still returns the mapping (NOT removed)
- [ ] `npm test` exits 0; `npm run typecheck` exits 0; `npm run lint` exits 0
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts in "Current state" don't match the live code (drift).
- Any existing login-form test asserts the "not set up yet" string is shown
  by the LIVE magic-link button and updating it would delete coverage of a
  different property — report which property before weakening any test.
- You find a third pre-auth surface that calls `friendlyAuthMessage` on an
  absence-class error (beyond `sendMagicLink` / `sendPasswordReset`) — the
  plan's inventory is then incomplete; report it rather than extending scope
  silently.
- GoTrue's stubbed shapes don't match: if the codebase has moved to
  different error-detection (e.g. error codes instead of message
  substrings), the predicate must follow that mechanism — report first.

## Maintenance notes

- **Owner-visible copy change**: the success copy on both buttons changes
  from a confident "Check your email…" to the conditional "If that address
  has an account…". This is the standard anti-enumeration pattern, but the
  owner has strong opinions on login copy (#372 rulings recorded in
  CLAUDE.md) — flag the new strings in the PR description for sign-off.
  The admin-provisioning guidance is not lost: the footer line and the
  `?error=` path both keep it.
- Timing residual: GoTrue answers absence-refusals faster than real sends.
  Accepted; revisit only if the rate limiter story changes.
- If Supabase later adds error CODES to these responses, migrate
  `isAccountAbsenceError` from substrings to codes and keep the tests.
- Reviewer: confirm both notice objects are truly shared constants — two
  hand-typed near-identical strings will drift back into an oracle.
