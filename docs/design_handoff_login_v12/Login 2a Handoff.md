# Handoff: Login step 1 — canvas option 2a

**For:** Claude Code, implementing in `pmeglaw/seat-planner` (main)
**Reference:** `Viewer v12 Redesign.dc.html` option 2a (as owner-edited) · Carbon login pattern (carbondesignsystem.com/patterns/login-pattern) · fluid-field precedent `app/concepts/login-v12/LoginV12Preview.tsx`
**Scope:** step 1 of progressive auth only. Step 2 (password) is option 2b / handoff §Login #2; errors are 2c.

## What 2a is

Split-screen. Left: brand column, full remaining width, `#161616`. Right: fixed **400px** white form column. The screen's only decision is *identity*: work email + **Continue**. **No alternate logins on this step** (owner edit, Aug 11): the magic link is offered on step 2 and inside the failed-login notification — step 1 stays single-purpose.

## Layout spec (from the mock, 1240×700 reference frame)

**Left column** — flex column, padding `56px 56px 44px`:
- Brand mark 40×40 (`/images/megeredchian-mark.png?v=ma-2026`), top
- Wordmark pushed to bottom (`margin-top:auto`): "Megeredchian Law / Seat Planner", 44px / 1.08, weight 400, letter-spacing −.025em, `#FFFFFF`
- Tagline 18px below: 14.5px / 1.6, `#B8AEA2` (existing copy verbatim), max-width 300px
- Footer 34px below: IBM Plex Mono 12px, `#8E8276` — "seats.megeredchianlaw.com · internal use only"

**Right column** — 400px, white, flex column, padding `44px 40px`:
1. Title: **"Log in"** — 26px / 1.2, weight 400, letter-spacing −.015em, `#161616`. (Carbon prescribes "Log in" over "Sign in" — update e2e text matchers in `tests/e2e-auth/auth-helpers.ts`.)
2. Sub (10px below): 13px `#55504A` — "Use your work email to access the internal seating map."
3. **Fluid email field** (28px below): 56px tall, fill `#F4F4F4`, no box; label inside top — 12px `#6E655A` "Work email"; value 15px `#161616`. Bottom rule: 1px `#8d8d8d` resting → 2px `#FF5715` focused → 2px `#B3232C` error (fixed height + border-box so the rule change never shifts layout — same trick as the shipped form).
4. **Remember checkbox** (16px below): 15×15 square, flat 0 radius — unchecked `#fff` + 1px `#8d8d8d`; checked `#161616` fill + white check. Label 13px `#161616`: "Remember my work email on this device."
5. **Continue** (24px below): 48px, full width, `#D23F0A` bg / white, 15px semibold, label left + → arrow right; hover `#B83708`, pressed `#9E2F06`.
6. Spacer, then help line pinned to bottom: 12.5px `#6E655A` — "Need help? Accounts are provisioned by the firm — ask an office admin." (No create-account link, ever.)

## Behavior contracts

1. **Continue** validates format only, client-side: empty → "Email is required"; malformed → "Enter a valid email address" (inline, 12px `#B3232C`, below the field; clears when fixed). It must **not** reveal whether the account exists — routing to step 2 happens for any well-formed email.
2. **Remember email**: on Continue with the box checked, persist the email (localStorage, email string only — never the password); prefill + pre-check on the next visit. Unchecking clears the stored value. Use the repo's storage-key + same-tab-event pattern from `ViewerSeatFinder.tsx`.
3. **Enter** in the field submits Continue.
4. Keep the shipped form's guards verbatim: name-less inputs (a pre-hydration native GET must never serialize credentials), the hydration-disabled submit ("Starting up…"), `safeNextPath`/`?next=` handling, and the already-signed-in card branch in `app/login/page.tsx`.
5. Landmarks + tab order per the pattern: the form region is its own landmark; tab = email → checkbox → Continue.

## Repo map

| Piece | Lands in |
| --- | --- |
| Split layout, brand column, footer, title copy | `app/login/page.tsx` |
| Step state machine (email → password), fluid field, checkbox, Continue | `components/auth/LoginForm.tsx` |
| Remember-email persistence | `LoginForm.tsx` (localStorage helpers, viewer-pref pattern) |
| Error copy mapping | `lib/authMessages.ts` (client strings above are literals, not auth-API mappings) |
| Test updates | `tests/login-form.test.mjs`, `tests/e2e-auth/auth-helpers.ts` (flow becomes: fill email → Continue → fill password → "Log in") |

## Do not touch

- `shouldCreateUser: false` on magic links (step 2 concern, but the shared helper stays locked)
- Floor-plan `preload` in `app/login/page.tsx`
- Auth callback routes and `assignLocation` post-login redirect
- AA floors: every pairing above is measured in `app/globals.css` comments — re-check if any value moves

## Open questions

1. Storage key name for remember-email (`seat-planner:login-email`?) — and should it also skip straight to step 2 on revisit?
2. Wordmark weight 400 at 44px is the concept's type ramp; the shipped page uses 600 at 34px — confirm the lighter display cut before it ships.
