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

## Database target and authorization

Default to local Supabase for routine UI testing: start Docker, run `npm run db:start` and `npm run db:seed`, and configure the local URL and anon key using `README.md`. Verify the effective database target before any write; never print credentials.

If connected to production, draft edits, assignments, directory changes, and role changes affect shared office data and require explicit authorization. Viewers not seeing a draft does not make those writes harmless. Publishing changes the live viewer map and requires production-deployment authorization. Preserve the publish guard; do not bypass it for testing.

## Prerequisites

- Match Node to `package.json` engines. Install dependencies with `npm ci`.
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

It verifies: `/login` renders the single-surface log-in form (email and
password together); unauthenticated `/` redirects to `/login`; bad credentials
round-trip to real Supabase Auth and surface the error alert; the seeded e2e user signs in and the published viewer map renders; the
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

For local admin checks, use the locally seeded admin account documented in `README.md`. For authorized production inspection, verify the account role first. Any temporary production role change needs explicit authorization, a recorded original role, and restoration afterward. Stay read-only unless the task authorizes the specific writes. A status pill is not evidence that no database mutation occurred.

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

- **Log in is one surface** (owner decision 2026-08-15; the earlier two-step
  disclosure is retired). Email, password, and the **Log in** primary render
  together: fill both fields, click once. The form `<h2>` is also "Log in", so
  target the button with `button:text-is("Log in")` rather than a substring
  match.
- **The primary is disabled until hydration.** It server-renders as
  "Starting up…" and only becomes an enabled "Log in" once React mounts
  (#282), so a `fill` + `click` right after `domcontentloaded` finds a dead
  control — and before that fix, a click in that window ran the browser's native
  GET and silently reloaded the page, discarding what had been typed (inputs
  are name-less, so even that GET serializes no credential).
  Playwright's `click()` auto-waits for enabled, which is exactly this fence, so
  the driver just clicks; only a hand-rolled `dispatchEvent` needs its own poll.
- **The alternatives sit below the primary.** "Email me a magic link" (behind
  the "or" divider) and "Forgot password?" (right of the password hint) are on
  the same surface, always visible.
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
`AGENTS.md` and the `test-tiers` skill — deliberately not duplicated here, since
a hardcoded pass-count in this file went stale by more than 2x.
