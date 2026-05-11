# v1.0.8 Auth Reliability Pass

## Goal

Make login more reliable for office admins who may have trouble with magic links, home browsers, Outlook link handling, or Supabase email rate limits.

## Changes

- Added password-first login tab.
- Kept magic link as a fallback tab.
- Added a forgot-password flow.
- Added `/auth/update-password` so recovery links can set a new password.
- Added safer return routing with `next` paths.
- Added friendly rate-limit messaging:
  - `Please wait 60 seconds before requesting another login link.`
- Added tests for auth message normalization and safe redirect paths.

## Supabase settings

No database migration is required for this pass.

Recommended Supabase settings:

- Authentication → Sign In / Providers → Email: enabled.
- Minimum password length: 12 characters.
- Keep magic link enabled as a fallback.
- Keep `https://seats.megeredchianlaw.com/auth/confirm` in Redirect URLs.
- Keep `http://localhost:3000/auth/confirm` in Redirect URLs for local testing.

## Admin workflow

Preferred login path:

1. Admin creates or invites a user in Supabase.
2. User sets a password via password reset/recovery if needed.
3. User logs in with email + password.
4. Magic link remains available as fallback.
