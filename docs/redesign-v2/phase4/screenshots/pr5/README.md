# Phase 4 · PR 5 captures — Reception + route surfaces (2026-09-06)

Plan of record: `../../plans/phase4-pr5-reception.md`. Branch `feat/phase4-reception`.

## What is here

`route-cards/` — the two route surfaces that need **no database**, captured on this build with Playwright's bundled
Chromium (1920×1080, both themes, after `document.fonts.ready` + 800 ms; theme seeded through an init script so the
boot script derives `data-theme` / `data-carbon-theme` before paint):

| Capture | What it shows | Read from the page |
|---|---|---|
| `not-found-{light,dark}-1920.png` | the 404 (`/no-such-page-pr5`, status 404) on `.sp-route-card` — copy as shipped, the one tertiary "Back to the seat map" (its primary verb), no glyph | card `rgb(255,255,255)` / `rgb(57,57,57)` (layer-02 light / dark), 640 wide; tertiary `rgb(184,92,46)` light (#B85C2E), white dark (Carbon's g100 tertiary); 0 page errors |
| `global-error-{light,dark}-1920.png` | `app/global-error.tsx` (a temporary env-gated throw in the root layout — `PR5_GLOBAL_ERROR_CAPTURE=1` — reverted before the commit; status 500), the route card with the `ErrorGlyph`, "The app could not start", Try again (tertiary), the digest line, the footer line | attrs `light/white` and `dark/g100` — the SECOND run: the first found both themes light because a script inserted through `dangerouslySetInnerHTML` never executes on the client-rendered boundary, so a mount effect now replays the stored choice (PHASE4BUILD §1.42) |

On the white page the card's edge disappears (white on white) and the tertiary's outline is the visible shape — the
PR 4 observation on the 403 cards (PHASE4BUILD §1.37), unchanged.

## What is NOT here, and why (the Docker-stack evidence is outstanding)

The build box for this session has **no Docker runtime** (no Docker Desktop, OrbStack or colima; no `docker` binary)
and **no Google Chrome** (the rigs launch `channel: "chrome"`), so everything the plan puts on the local Docker
Supabase stack could not run here:

- `npm run test:e2e:auth` (publish flow, nav-shell, header-geometry incl. `/reception`, page-frames incl. the Reception
  block, accessibility incl. Reception rest / locked + the `/admin` 403, the new `reception-keyboard.spec.ts`);
- `audit/runtime-audit.mjs` (0-undefined-`var()` audit; `/reception` at 1280 + the system state; the viewer pass for
  `/reception` + `/my-seat`) and `audit/page-states.mjs` (the Reception section: rest · typing · locked · recents ·
  no-extension · zero · `?q=201` landing · 1280 · 1024 with Back to the list; the `/admin` 403; the 404 both themes);
- the `main` (v1.75.0) baseline run of the same rig for the `/login` + `/my-seat` byte-compare (D4, deviation 12).

These run unchanged once a Docker runtime is on the box (`npm run db:start` + `db:seed`, the tier's own build with
the local env, the two rigs with the seeded admin + viewer accounts — never against production). Until then the
Reception states are **ct-covered** (`tests/reception-screen.test.mjs`, 34 tests) and the specs are written but
unexecuted; the reviewer's smoke on the Vercel preview is the first real-browser look at Reception.

**Not drivable on any tier by design (ct-only):** the partial state (seats failed alone), the empty directory, the
loading skeleton, the Reception error boundary, the root boundary (`app/error.tsx`) — named in the plan's item 7.

## Tiers that did run on this box (branch head)

| Tier | Result |
|---|---|
| `npm test` (unit + source + db) | 1445 tests · 1443 pass · **2 fail, environment-only**: `backup-script-safety` ("a failed dump never echoes…") — the sandbox blocks the script's `mkdir` outside the repo; passes 5/5 outside the sandbox. The touch-target pin for the old `/admin` 403 link left with the card (`touch-target-source`) |
| `npm run test:ct` | 318 / 318 (`reception-screen` 34) |
| `npm run gate` | lint 0 errors (80 pre-existing warnings) · typecheck clean · coverage lines 98.33 / branches 92.35 / funcs 98.29 — floors 90 / 80 / 95 met (the one failing test in `coverage:check` is the sandbox-only backup test above) |
| `npm run build` | clean (`global-error.tsx` with its stylesheet + font imports compiles; `/reception`, `/my-seat` ƒ; `/_not-found` ○). Note: under the session sandbox the Turbopack build hangs before writing anything — build outside it |
| `npm run test:e2e` (backend-free, Playwright Chromium headless shell) | 34 passed · **2 failed, environment-only**: `tests/e2e/axe-helpers.spec.ts` › `waitForColorSettle` timing self-tests (`elapsed ≥ 300` on a synthetic `page.setContent` page — no app code); the same two fail on the full Chromium build; the tier's own assertions on the app all pass |
| Contrast (`generate-pairs.mjs` + `check_contrast.py`) | `product-pairs.json: 202 pairs · surface-pairs-not-gated.json: 14 pairs` — **202/202 pass**, no token change |
| Skill fingerprint | `f997ee525800e755` (PHASE3DS §0 recipe) |

## Provenance

Sample data only — the seeded local directory (`supabase/seed.sql`) is the fixture for every spec; no production
name, seat or count appears anywhere in this directory. `.env.local` was never edited: the route-card captures used a
dummy Supabase env on `next start -p 3101`, and no request reached any database (the 404 is static; the global boundary
throws before the layout reads anything).
