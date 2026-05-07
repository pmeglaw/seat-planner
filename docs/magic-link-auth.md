# Magic Link Auth

This app uses `@supabase/ssr`, which uses the PKCE auth flow for browser sign-in.
The app supports both Supabase PKCE `code` redirects and `token_hash` email
template links.

## Supabase dashboard settings

In Supabase Auth URL Configuration, allow the app origins/routes you use:

- `http://localhost:3000/**`
- `http://localhost:3001/**` if you run local dev on port 3001
- your production URL, for example `https://your-domain.com/**`

In Auth > Email Templates > Magic Link, use a token-hash link for server-side
auth:

```html
<h2>Magic Link</h2>
<p>Follow this link to log in:</p>
<p>
  <a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email&next=/">
    Log In
  </a>
</p>
```

Do not point the email directly at `/auth/callback?next=/` without either
`{{ .ConfirmationURL }}` or `{{ .TokenHash }}`. A bare callback URL has no code
or token for the app to exchange, so the app cannot create a session.

## App routes

- `/auth/confirm` is the primary route for new magic-link emails.
- `/auth/callback` remains supported for older links and OAuth/PKCE callbacks.
