# Phase 4 · PR 5 captures — Reception + route surfaces (2026-09-06)

Plan of record: `../../plans/phase4-pr5-reception.md`. Branch `feat/phase4-reception`.

**What these show.** Reception on the Phase 3 `.sp-recep` family (PHASE2UX §1R; PHASE3DS §1.29; sheet amendment E for
the 1024 fold): the 1584 page frame with title + subtitle and no action; the 48px search with the leading glyph, the
platform hint (`⌘ K` on this Mac) and the clear × once typed; the 32px count header; 48px rows with name + meta, the
seat code as plain code text, the Floor 2 tag where the floor differs, the extension right-aligned (dash via the empty
cell); the cursor row (hover surface + terracotta bar) while typing and the locked row (selected surface + bar) after ↵;
the sticky 480 readout — name, the tile with the `heading-06` Light numeral and the ↵ / Esc hint, the D3′ seat line,
"No extension on file", the same-department fallback rows, Show on map, Recent lookups; the zero state keeping the
last locked person; the `?q=201` landing; the 1280 frame; the 1024 one-column frame with the ruled static readout and
"Back to the list". Plus the route cards: the `/admin` 403 (a viewer), the 404, and — no database needed — the global
boundary. Both themes at 1920.

## Directories

| Dir | Rig | Contents |
|---|---|---|
| `runtime/` (34) | `../../audit/runtime-audit.mjs` | the six routes × 2 themes at 1920 + the 1024 light frame; the three document pages (`/admin/management`, `/admin/settings`, **`/reception`**) at 1280 both themes and in the SYSTEM state (light / dark by emulated scheme, attrs `null/null`); the **viewer pass**: `viewer-reception-*`, `viewer-my-seat-*` at 1920 both themes |
| `states/` (83) | `../../audit/page-states.mjs` | the PR 4 Management / Settings states (re-captured, unchanged rig section) + the **Reception section** (viewer): `reception-rest`, `-typing` ("sha"), `-locked`, `-recents` (after three lookups), `-no-extension` (Victor Chen), `-zero` ("zzzz"), `-landing-q201`, each `-{light,dark}-1920`; `reception-light-1280`; `reception-light-1024-readout` (scrolled to the readout, Back to the list); `admin-403-{light,dark}-1920`; `not-found-{light,dark}-1920` |
| `route-cards/` (4) | `capture-route-cards.mjs` (session scratch, bundled Chromium) | `not-found-*` (dummy env, no database) and `global-error-*` (a temporary env-gated throw in the root layout, reverted before the commit) |

## Results on the local Docker stack (colima; branch head)

| Tier / rig | Result |
|---|---|
| `runtime-audit.mjs` | **0 undefined `var()`** on 6 routes × 2 themes (`/` 241 refs, `/admin` 245, `/admin/management` 224, `/admin/settings` 214, `/reception` 228, `/login` 184), the three document pages at 1280 and in the system state (attrs `null/null`), the viewer pass (`/reception` 228, `/my-seat` 178). Console errors = the Vercel Speed Insights script 404ing under a local `next start`, as every PR |
| `page-states.mjs` | 83 captures, both themes; the strip pinned at y=48; nothing mutated |
| **`/login` + `/my-seat` byte-compare** | `main` (1f43bb8 — v1.75.0 plus two docs / skills commits, no app code) built in a worktree and served on :3201, the SAME rig, seed and fonts-ready wait: `login-light-1920`, `login-dark-1920`, `login-light-1024`, `viewer-my-seat-light-1920`, `viewer-my-seat-dark-1920` — **all five IDENTICAL** (`cmp`). D4 and deviation 12 confirmed unchanged |
| `npm run test:e2e:auth` | **53 passed** (2.5 min) on a reset + reseeded stack: publish flow, nav-shell, header-geometry (+ `/reception` viewer), page-frames (+ the Reception block at 1920 / 1280 / 1024), accessibility (+ Reception rest / locked, the `/admin` 403), draft dialogs, the new `reception-keyboard.spec.ts` (4). The first full run had 4 Reception failures, both test-side (below); after the fix the two specs were re-run alone (16/16) and the tier re-run in full |
| contrast | `product-pairs.json: 202 pairs · surface-pairs-not-gated.json: 14 pairs` — **202/202 pass**, no token change |
| the two environment-only tests, unsandboxed with real Chrome | `backup-script-safety` **5/5**; `tests/e2e/axe-helpers.spec.ts` **5 passed** (the earlier failures were the sandbox and the headless-shell binary respectively) |

Tiers that need no stack (branch head): unit 1445 · 1443 pass (the 2 "fails" are the sandbox-only backup test — 5/5
outside it — see above) · ct 318/318 (`reception-screen` 34) · gate clean (lint 0 errors, typecheck, coverage
98.33 / 92.35 / 98.29) · build clean · backend-free e2e 34 pass (+ the 2 helper self-tests that pass on real Chrome).

## Findings (recorded, not fixed silently)

1. **Zero state with a lock — the tile hint reads "Esc to unlock"** (`states/reception-zero-light-1920.png`,
   `-dark-`): with "zzzz" typed and Alex locked, the readout keeps the person (correct, §1R.6) but the tile's hint
   promises "Esc to unlock", while Esc will first CLEAR the typed query (ruling Q-1's first rung) and only a second
   Esc unlocks. The hint follows the lock, not the query. A wording call for the owner: hide the hint while a query
   is typed, or read "Esc to clear"; no change made.
2. **Test-side, fixed in the specs:** (a) the skip-link step — autofocus parks focus in the field and `blur()` leaves
   Chrome's sequential-focus starting point there, so Tab reached the next control instead of the header's skip link;
   the specs now focus `<body>` first. (b) At 1024 the `.sp-recep` locator hit two grids — the loading skeleton's
   (still on screen) and the streamed page's inside React's hidden pre-swap container, whose computed
   `grid-template-columns` is the specified two-track value; the specs now measure `main .sp-recep` once visible.
   Product behaviour was correct in both cases (the 1024 frame IS one column: `page-frames` 1024 passed on the first
   run).
3. The route cards on the white page: the card's edge disappears (white on white) and the tertiary's outline is the
   visible shape — the PR 4 observation (PHASE4BUILD §1.37), unchanged.
4. `global-error` needed a mount effect to follow the stored theme (PHASE4BUILD §1.42) — found by the first capture.

**Not drivable on any tier by design (ct-only):** the partial state (seats failed alone), the empty directory, the
loading skeleton, the Reception error boundary, the root boundary (`app/error.tsx`) — the plan's item 7.

## Provenance

Local Docker Supabase stack (`npm run db:start` + `db:seed`; `npx supabase db reset` + the seed between the rigs and
the tier and before the final tier run, because the publish-flow spec leaves a published layer the seed does not
tolerate). Runtime: colima (`brew install colima docker docker-compose`, `colima start --cpu 4 --memory 8`, Docker
server 29.5.2) and Google Chrome (`brew install --cask google-chrome`) installed on 2026-09-06 with the owner's
go-ahead. Signed in as the seeded local admin `e2e-admin@example.test` (the seeded viewer `e2e-viewer@example.test`
for Reception, `/my-seat` and the 403 / 404). **No production data and no production write**: every name, seat and
extension is `supabase/seed.sql` sample data; Reception is read-only and nothing the rigs open is confirmed.
`.env.local` was never edited: the local stack's URL + anon key were passed to `next build` and `next start` (the
README recipe; the e2e-auth tier does the same). Captures: real Chrome (`channel: "chrome"`), 1920×1080 (1280×800 /
1024×768 for the frames), after `document.fonts.ready` + 500–800 ms; theme by `sp-theme` in localStorage + reload.
