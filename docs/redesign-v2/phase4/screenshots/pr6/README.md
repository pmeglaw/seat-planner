# Phase 4 · PR 6 captures — the close-out (2026-09-08)

Plan of record: `../../plans/phase4-pr6-closeout.md`. Branch `feat/phase4-closeout` (v2.0.0 on merge). Every capture
is sample data from `supabase/seed.sql` on the local Docker stack — no production name, no production write.

**What these show.** The finished system after the close-out rows landed: the modal host's busy ⇄ idle focus seam
(row 7) on the map's confirms, the Management create modal and the dirty-close ask; the dark raster lightbox unchanged
after its rules moved to `globals.css` (row 9); the Ask Planner popover's Help link opening the shell's Help panel
(row 3) — and the six routes × two themes + the 1280 / 1024 frames + the system state + the viewer pass the runtime
audit reads on every PR. No token change, no sheet change (row 1 ruled B; contrast 202 / 202 with the generator's JSON
unchanged).

## Directories

| Dir | Rig | Contents |
|---|---|---|
| `runtime/` (34) | `../../audit/runtime-audit.mjs` | the six routes × 2 themes at 1920 + the 1024 light frame; the three document pages at 1280 both themes and in the SYSTEM state; the viewer pass (`/reception`, `/my-seat`). `admin-dark-1920.png` / `home-dark-1920.png` are the row-9 proof: the raster inverted by the lightbox chain now in `globals.css`, markers above it unfiltered |
| `dialogs/` (20 + `results.json`) | `../../audit/pr5b-dialogs.mjs` | the seven confirms, both themes — `06-move-conflict` now records focus on **Cancel** after the busy mount settles (row 7; `06b-move-conflict-initial-focus` PASS in both themes) |
| `pr4-smoke/` (69 + `results.json`) | `../../audit/pr4-smoke.mjs` | the owner's twenty-step Management + Settings smoke, whole (a step assumes the tab its predecessor opened): steps 8 (dirty close) and 14 (create modal) are the two other `CarbonModal` consumer families for row 7 |

## Results on the local Docker stack (colima; branch head, reset + reseeded before each rig)

| Tier / rig | Result |
|---|---|
| `runtime-audit.mjs` | **0 undefined `var()`** on `/`, `/admin`, `/admin/management`, `/admin/settings`, `/reception`, `/login` × light / dark; the three document pages at 1280 and in the system state (`attrs=/`, expected null/null); the viewer pass; console = the Vercel Speed Insights script 404ing under a local `next start`, as every PR |
| `pr5b-dialogs.mjs` | **29 / 29 records pass**, both themes — every geometric and role claim of PR 5b holds; `06b` (initial focus after a busy mount) passes: the host's busy → idle refocus lands on the first control (row 7). Real mutations on the stack: one vacate through the delayed route, one move + Discard everything, custom seat R99 inserted through REST and deleted through the confirm |
| `pr4-smoke.mjs` | **47 / 47 records pass**, light + dark, on the patched rig (the rig-side finding below), reset + reseeded per theme by the rig itself — steps 8 (dirty close: Esc / scrim / Cancel ask, Keep editing focus, Discard) and 14 (create modal: duplicate helper, disabled primary, Compliance added, Esc clean) are the row-7 evidence on the other two `CarbonModal` consumer families; step 12 records the narrow sheet at top 160 / bottom 490 (row 1 → B, DECISIONS §6 no. 18) |
| `npm run test:e2e:auth` | **53 passed** (2.5 min) — on a reset + reseeded stack, the same `:3200` server the rigs used |
| Contrast | `product-pairs.json: 202 pairs · surface-pairs-not-gated.json: 14 pairs` — `202/202 pass`; **no token change** |
| Unit / ct / gate / build / e2e / browser | 1457 · 326 · clean (lint 0 errors, typecheck, coverage 98.34 / 92.40 / 98.30) · clean · 36 · 26 |

## Rig-side finding (fixed in the rig, no product change)

The first whole-smoke run failed steps 13–15 (both themes): step 13 filled the department combobox before the panel's
row-open rAF had landed focus on Name, so the focus snapped back and the Escape meant for the list opened the
dirty-close ask (PHASE4BUILD §1.48). Step 13 now waits the 300 ms step 8's `openEdit` already waited. The first run's
captures were discarded; the run recorded below is on the patched rig, reset + reseeded.

## Provenance

Local Docker Supabase stack (`npm run db:start`; `npx supabase db reset` — which applied the new
`20260908120000_deactivate_employee_sqlstate.sql`, confirmed by `MLS03` in `pg_proc` — + `npm run db:seed` before each
rig and before the e2e-auth tier). Runtime: colima (Docker server 29.5.2) and Google Chrome (`channel: "chrome"` in the
rigs; `PW_CHROMIUM_PATH` at Chrome's binary for the Playwright tiers). Signed in as the seeded local admin
`e2e-admin@example.test` (the seeded viewer for the viewer pass). `.env.local` was never edited: the local stack's URL +
anon key were passed inline to `next build` and `next start -p 3200` (the README recipe). Captures: real Chrome,
1920×1080, after `document.fonts.ready` + 400–800 ms; theme by `sp-theme` in localStorage + reload.
