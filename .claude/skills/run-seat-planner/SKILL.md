---
name: run-seat-planner
description: Run, drive, and screenshot the seat-planner app. Use when asked to start seat-planner, run the dev server, take a screenshot of the UI, drive the login page or map prototype in a browser, or verify a change in the running app.
---

Seat-planner is a Next.js (App Router) + Supabase app, auth-gated on every
real route. Start the dev server, then drive it headlessly with
`.claude/skills/run-seat-planner/driver.mjs` — a Playwright REPL/smoke script
that uses the project's own `@playwright/test` dependency (no extra install).

All paths are relative to the repo root (`~/seat-planner`).

## Prerequisites

- Node ≥ 22 (verified on v26.3.1).
- Playwright's Chromium is already installed at
  `~/Library/Caches/ms-playwright/chromium-1228` via the `@playwright/test`
  dev dependency. If missing: `npx playwright install chromium`.
- `.env.local` with real `NEXT_PUBLIC_SUPABASE_URL` /
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` (already present in this checkout).
- This is macOS: there is **no `timeout` command** — poll with a loop
  (see below).

## Setup

Deps are already installed in this checkout. From clean: `npm ci`.

## Run (agent path)

Start the dev server in the background and poll until ready (first compile
of a route takes a few seconds):

```bash
cd ~/seat-planner
npm run dev > /tmp/seat-planner-dev.log 2>&1 &
echo $! > /tmp/seat-planner-dev.pid
for i in $(seq 1 60); do curl -sf -o /dev/null http://localhost:3000/login && { echo READY; break; }; sleep 1; done
```

Stop it with `kill $(cat /tmp/seat-planner-dev.pid)` (or
`pkill -f "next dev"`) — leaving it running causes `EADDRINUSE` next time.

**Smoke mode** — one command, six checks, four screenshots, exit code 0/1:

```bash
node .claude/skills/run-seat-planner/driver.mjs --smoke
```

It verifies: `/login` renders the sign-in form; unauthenticated `/`
redirects to `/login`; bad credentials round-trip to real Supabase Auth and
surface the error alert; the seeded e2e user signs in and the published
viewer map renders; the dev-only `/concepts/map-redesign` prototype
renders. Expect `PASS` × 6.

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
| `login` | sign in as the seeded e2e viewer user, land on `/` |
| `nav <path-or-url>` | goto (relative paths resolve against `SEAT_PLANNER_URL`, default `http://localhost:3000`) |
| `wait <selector>` / `waittext <text>` | wait for element (15s) |
| `click <selector>` / `fill <selector> <value>` / `press <key>` | interact |
| `text <selector>` / `title` / `url` | inspect |
| `ss [name]` | screenshot → `output/playwright/<name>.png` (+ `latest.png`) |
| `errors` | dump console/page errors collected so far |
| `quit` | close browser, exit |

Screenshots land in `output/playwright/`; the newest is always also copied
to `output/playwright/latest.png`.

**Auth:** a seeded e2e user (`seat-planner-e2e@megeredchianlaw.com`,
**viewer** role) exists in the Supabase project; its password lives in the
gitignored `.env.local` as `SEAT_PLANNER_E2E_EMAIL` /
`SEAT_PLANNER_E2E_PASSWORD`, which the driver reads automatically (env vars
win over `.env.local`). The `login` command / smoke step signs in and lands
on the published viewer map at `/`. Missing creds don't fail the smoke —
that step prints `SKIP`.

- `/admin` is still not drivable: the user is deliberately viewer-role, so
  it's read-only against production data. To make admin flows drivable, run
  `update public.profiles set role = 'admin' where email = 'seat-planner-e2e@megeredchianlaw.com';`
  — a conscious decision, since agents could then mutate the draft layer.
- If the password is lost or the user is missing, re-seed: insert into
  `auth.users` (with `extensions.crypt(<new-password>, extensions.gen_salt('bf'))`,
  `email_confirmed_at = now()`) plus a matching `auth.identities` row
  (`provider 'email'`, `identity_data` with `sub`/`email`); the
  `on_auth_user_created` trigger creates the viewer profile automatically.
  Then update `.env.local`.

The dev-only prototype routes `/concepts/map-redesign` (Counsel Ink map
with seat markers + docked inspector) and `/concepts/component-state-board`
need no auth at all.

## Run (human path)

```bash
npm run dev   # → http://localhost:3000, sign in with a real account. Ctrl-C to stop.
```

## Test

```bash
npm test      # node --test tests/*.test.mjs — 198 tests, all pass, ~2s
```

A Playwright e2e smoke tier (`npm run test:e2e`, needs a prior
`npm run build`) also exists — see `CLAUDE.md`; not exercised by this skill.

## Gotchas

- **The login form is not a `<form>`.** The submit is a plain `onClick`
  `Button` — there is no `button[type=submit]`, and pressing Enter does not
  submit. Click `button:text-is("Sign in")` (`:text-is`, because the page
  `<h1>` is also "Sign in").
- **Filling the login form races hydration.** The Sign in button is
  `disabled` until React state holds both fields; a `fill` right after
  `domcontentloaded` sets the DOM value before `onChange` handlers attach,
  so the button never enables. The driver's `login` fills-and-polls until
  the button is enabled — do the same in any hand-rolled flow.
- **`[role=alert]` matches Next's route announcer.** Next.js keeps an
  always-present, empty `[role=alert]` on `<body>`, so a bare alert wait
  succeeds instantly with empty text. Scope to `main [role=alert]` for the
  login error message.
- **Prototype routes are dev-only.** `/concepts/*` returns 404 in a
  production build unless `SEAT_PLANNER_ENABLE_PROTOTYPES=true`; under
  `npm run dev` they just work.
- **Dev console noise to ignore:** a hydration-mismatch warning on the
  login inputs (`caret-color: transparent`) and, after the bad-credentials
  check, one `Failed to load resource: 400` — that 400 *is* Supabase
  rejecting the wrong password, i.e. expected. The dev log also warns that
  the `middleware` file convention is deprecated in favor of `proxy`;
  harmless.
- **macOS has no `timeout`.** `timeout 30 bash -c ...` fails with
  `command not found` — use the `for`-loop poll shown above.

## Troubleshooting

- **`TypeError: Failed to fetch` from `signInWithPassword` (button stuck on
  "Signing in…")**: transient network hiccup from headless Chromium to
  Supabase — seen once, passed on retry. Confirm the backend is reachable:
  `curl -H "apikey: $ANON_KEY" $SUPABASE_URL/auth/v1/health` → GoTrue JSON.
- **`locator.click: Timeout … button[type=submit]`**: you assumed a form;
  see the first gotcha.
- **`EADDRINUSE: address already in use :::3000`**: a previous dev server
  is still up — `pkill -f "next dev"` and relaunch.
