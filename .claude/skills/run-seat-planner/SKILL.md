---
name: run-seat-planner
description: Run, drive, and screenshot the seat-planner app. Use when asked to start seat-planner, run the dev server, take a screenshot of the UI, drive the login page or map prototype in a browser, or verify a change in the running app.
---

Seat-planner is a Next.js (App Router) + Supabase app, auth-gated on every real
route. Start the dev server, then drive it headlessly with
`.claude/skills/run-seat-planner/driver.mjs` — a Playwright REPL/smoke script
that uses the project's own `@playwright/test` dependency (no extra install).

Paths below are relative to the repo root. Commands are verified on **Windows**;
the dev-server start/stop block is the only platform-specific part.

> ## ⚠️ Local dev writes to PRODUCTION
>
> `.env.local` points `NEXT_PUBLIC_SUPABASE_URL` at the **production** Supabase
> project, and it is the only project that exists — there is no dev or staging
> database. Verified 2026-07-22.
>
> - **Draft-layer edits are safe.** Viewers never read `layer = 'draft'`, so
>   seat edits, moves and assignments stay invisible until published.
> - **Publishing is not.** `publish_seat_map()` copies draft over published, and
>   the live map at `seats.megeredchianlaw.com` updates for 100+ viewers.
>   Treat any local publish as a production deploy: get the owner's explicit
>   go-ahead, record the target row's full baseline first, and restore it after.
>
> Any doc or note claiming a local "draft → edit → publish cycle without
> touching prod data" is false — there is no non-production database.

## Prerequisites

- Node ≥ 22. Deps installed (`npm ci` from clean).
- Playwright's Chromium ships with the `@playwright/test` dev dependency
  (browsers under `%LOCALAPPDATA%\ms-playwright` on Windows,
  `~/Library/Caches/ms-playwright` on macOS). If missing:
  `npx playwright install chromium`.
- `.env.local` with real `NEXT_PUBLIC_SUPABASE_URL` /
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` (already present in this checkout).

## Run (agent path)

Start the dev server in the background, then poll until ready — the first
compile of a route takes a few seconds:

```bash
npm run dev          # via the Bash tool's run_in_background, NOT a trailing &
for i in $(seq 1 60); do curl -sf -o /dev/null http://localhost:3000/login && { echo READY; break; }; sleep 1; done
```

**Stop it by port owner.** `pkill -f "next dev"` is a **silent no-op on
Windows** — it exits 0 while the server keeps running, so the next `curl`
returns READY from the *stale* server and you "verify" code that is no longer
built. That is the single most expensive trap in this file.

```powershell
$p = (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue).OwningProcess
if ($p) { taskkill /PID $p /F }
```

If a start ever prints `Port 3000 is in use by process <PID>`, an older server
survived — kill that PID before trusting anything you see.

**Smoke mode** — one command, six checks, four screenshots, exit code 0/1:

```bash
node .claude/skills/run-seat-planner/driver.mjs --smoke
```

It verifies: `/login` renders the sign-in form; unauthenticated `/` redirects to
`/login`; bad credentials round-trip to real Supabase Auth and surface the error
alert; the seeded e2e user signs in and the published viewer map renders; the
dev-only `/concepts/map-redesign` prototype renders. Expect `PASS` × 6.

**REPL mode** — pipe commands on stdin for ad-hoc driving:

```bash
node .claude/skills/run-seat-planner/driver.mjs <<'EOF'
nav /concepts/map-redesign
waittext Mike
click button:has-text("Mike")
ss seat-inspector
errors
quit
EOF
```

| command | what it does |
|---|---|
| `login` | sign in as the seeded e2e user, land on `/` |
| `nav <path-or-url>` | goto (relative paths resolve against `SEAT_PLANNER_URL`, default `http://localhost:3000`) |
| `wait <selector>` / `waittext <text>` | wait for element (15s) |
| `click <selector>` / `fill <selector> <value>` / `press <key>` | interact |
| `text <selector>` / `title` / `url` / `eval <expr>` | inspect |
| `viewport <w> <h>` / `selectopt <selector> <value>` | resize · pick a `<select>` option |
| `ss [name]` | screenshot → `output/playwright/<name>.png` (+ `latest.png`) |
| `errors` | dump console/page errors collected so far |
| `quit` | close browser, exit |

**Argument parsing is inconsistent between commands** — this bites:

- `click` / `wait` take the **whole** line as the selector, so spaces are fine
  (`click aside button:has-text("Save draft changes")`).
- `fill` splits on the **first space**: everything before it is the selector, so
  the selector may not contain spaces. Use `input[placeholder^="Search"]`, not
  `[role="search"] input`.
- `selectopt` pops the **last** token as the value, so values containing spaces
  are unreachable — pick a single-word option or set it another way.

Screenshots land in `output/playwright/` (gitignored); the newest is also copied
to `latest.png`.

## Auth

A seeded e2e user (`seat-planner-e2e@megeredchianlaw.com`) exists in the
Supabase project; its password lives in the gitignored `.env.local` as
`SEAT_PLANNER_E2E_EMAIL` / `SEAT_PLANNER_E2E_PASSWORD`, which the driver reads
automatically (env vars win over `.env.local`). Missing creds don't fail the
smoke — that step prints `SKIP`.

The user is **viewer**-role by default, so `/admin*` renders "Admin access
required" rather than the editor. Admin surfaces become drivable by flipping the
role — a deliberate, owner-approved step, because an agent can then mutate the
production draft layer:

```sql
update public.profiles set role = 'admin' where email = 'seat-planner-e2e@megeredchianlaw.com';
-- and afterwards, always:
update public.profiles set role = 'viewer' where email = 'seat-planner-e2e@megeredchianlaw.com';
```

While elevated, stay read-only unless the task says otherwise: menus, toggles
and screenshots are fine; undo/redo, publish and seat edits write to prod. The
top bar's green **Published** pill staying put is good evidence nothing changed.

If the password is lost or the user is missing, re-seed: insert into
`auth.users` (with `extensions.crypt(<new-password>, extensions.gen_salt('bf'))`,
`email_confirmed_at = now()`) plus a matching `auth.identities` row (`provider
'email'`, `identity_data` with `sub`/`email`); the `on_auth_user_created`
trigger creates the viewer profile automatically. Then update `.env.local`.

The prototype routes `/concepts/map-redesign` and `/concepts/component-state-board`
need no auth at all.

## Run (human path)

`npm run dev` → http://localhost:3000, sign in with a real account, Ctrl-C to stop.

## Gotchas

- **The login form is a real `<form onSubmit>`.** The submit is
  `button[type=submit]` and Enter submits. Still target it with
  `button:text-is("Sign in")` rather than a substring match — the page `<h1>` is
  also "Sign in". (This bullet used to claim the opposite; the form was
  converted before 2026-07-28.)
- **The submit button is disabled until hydration.** It server-renders as
  "Starting up…" and only becomes an enabled "Sign in" once React mounts (#282),
  so a `fill` + `click` right after `domcontentloaded` finds a dead control —
  and before that fix, a click in that window ran the browser's native GET and
  silently reloaded the page, discarding what had been typed. The driver's
  `login` fills-and-polls until the button is enabled; do the same in any
  hand-rolled flow.
- **`[role=alert]` matches Next's route announcer.** Next keeps an
  always-present, empty `[role=alert]` on `<body>`, so a bare alert wait
  succeeds instantly with empty text. Scope to `main [role=alert]`.
- **The UI can lag the database.** After clicking Publish, the pill was still
  reading "Publish 1 / 1 unpublished change" although the RPC had already
  committed. Confirm outcomes by querying the database, never from the pill —
  believing it and retrying will publish twice.
- **Chained interactions need a beat.** Save draft → click the pill →
  `wait [role="dialog"]` in one fast sequence times out: the pill is still in
  status mode when clicked, so it opens the status popover instead of the
  review. Re-navigate, or wait for its `aria-label` to flip, before clicking.
- **Prototype routes are dev-only.** `/concepts/*` 404s in a production build
  unless `SEAT_PLANNER_ENABLE_PROTOTYPES=true` is set at **build** time; under
  `npm run dev` they just work.
- **Console noise to ignore:** a hydration-mismatch warning on the search/login
  inputs (`caret-color: transparent`, injected by a browser extension — not in
  our source); after the bad-credentials check, one `Failed to load resource:
  400`, which *is* Supabase rejecting the wrong password. (The `middleware`
  file-convention deprecation warning is gone — the root file is `proxy.ts`
  now; if you see that warning again, a stray `middleware.ts` came back.)
- **`npm run dev` reports failure when it succeeded.** Under
  `run_in_background` the task is flagged exit 1 while the server runs fine.
  Trust the curl poll and the log's `- Local:` line, not the task status.

## Troubleshooting

- **`TypeError: Failed to fetch` from `signInWithPassword`** (button stuck on
  "Signing in…"): transient network hiccup from headless Chromium to Supabase —
  passed on retry. Confirm the backend:
  `curl -H "apikey: $ANON_KEY" $SUPABASE_URL/auth/v1/health` → GoTrue JSON.
- **`EADDRINUSE: address already in use :::3000`** — a previous dev server is
  still up. Kill it by port owner (above); `pkill` will not do it.
- **Stale CSS / unstyled page** after a long session: stop the server,
  delete `.next`, restart, hard-refresh.

Test tiers (`npm test`, `test:ct`, `test:browser`, `test:e2e`) are documented in
`CLAUDE.md` and the `test-tiers` skill — deliberately not duplicated here, since
a hardcoded pass-count in this file went stale by more than 2x.
