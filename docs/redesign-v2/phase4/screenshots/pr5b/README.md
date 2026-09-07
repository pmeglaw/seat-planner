# Phase 4 · PR 5b captures — the map's seven confirm dialogs on the asset modal (2026-09-07)

Plan of record: `../../plans/phase4-pr5b-map-dialogs.md`. Branch `feat/phase4-map-dialogs` (v1.77.0).

**What these show.** Every confirm the map raises, on the asset `.cds-modal` through the PR 4 `CarbonModal` host
(PHASE2UX §3 "Modal (Move / Swap / Delete confirms) → asset `.cds-modal`"; PHASE3DS §1.17 amendment; owner rulings
R-1…R-3): 480 wide on `layer-02`, the heading-03 question, the body on `text-secondary`, the 64px footer bleeding 50/50 —
Cancel (secondary, gray 80 light / gray 60 dark) · the primary — and no ×. **Danger** primary (red 60, white label) on
Vacate seat, Delete seat and Discard everything; **plain** terracotta primary on Confirm swap, Move them, Swap them and
the inspector's move-conflict Move them. The inspector guard (Unsaved seat edits) is the one three-button footer —
Keep editing · Discard · Save changes at 25 / 25 / 50 (sheet amendment F). Both themes at 1920×1080, the inspector or
the mode card open behind each modal as it is in use.

## Directories

| Dir | Rig | Contents |
|---|---|---|
| `dialogs/` (20 + `results.json`) | `../../audit/pr5b-dialogs.mjs` | `01-vacate`, `01-vacate-busy-esc` (Esc pressed mid-flight — the dialog stays, "Vacating…" disabled + `aria-busy`), `01-vacate-error` (the aborted action's failure INSIDE the open dialog, focus in it, Retry vacate), `02-delete-seat`, `03-swap` (Source / Target list, floor tag slot, the ↔ summary), `04-move`, `04-move-swap-arm` ("Swap X and Y?"), `05-inspector-guard` (25/25/50), `06-move-conflict` (over the mid-edit inspector), `07-discard-draft` — each `-{light,dark}` |
| `runtime/` (34) | `../../audit/runtime-audit.mjs` | the six routes × 2 themes at 1920 + the 1024 light frame; the three document pages at 1280 both themes and in the SYSTEM state; the viewer pass (`/reception`, `/my-seat`) |

## Results on the local Docker stack (colima; branch head)

| Tier / rig | Result |
|---|---|
| `pr5b-dialogs.mjs` | **27 / 29 records pass**, both themes (final run on the R-4 head — every dialog's eyebrow asserted: Vacate seat · Delete seat · Swap seats · Move employee · Discard draft changes · the guard's `Seat CW01 · Center West`). Every dialog: `role` as ruled (six `alertdialog`, the guard `dialog`), `aria-describedby` resolving inside the dialog, bg `rgb(255, 255, 255)` light / `rgb(57, 57, 57)` dark (layer-02), width 480, radius 0, footer 64 with two 240px buttons (the guard: 120 / 120 / 240), the primary `rgb(184, 92, 46)` terracotta or `rgb(218, 30, 40)` red 60 with a `rgb(255, 255, 255)` label, overlay z 8500, no × / labelled icon close, initial focus on the first footer button, a pointer on the overlay keeps the dialog open and focus inside it. Vacate mid-flight (a 2.5 s delayed server-action route): "Vacating…" disabled + `aria-busy`, Cancel disabled, **Esc ignored**, the dialog closes when the RPC resolves. Vacate failing (an aborted route): `.cds-notification--error` inside the body — "Vacate did not complete. Could not vacate seat." — with focus in it and an enabled Retry vacate. Cancel on Delete hands focus back to the inspector's Delete seat; Esc on the guard keeps the edit. The **two FAILs are one finding, recorded apart (`06b-move-conflict-initial-focus`, below)**. Real mutations, all local and all undone: Vacate confirmed once through the delayed route (re-assigned through REST), the move confirmed so Discard could open, **Discard everything for real** (draft converged, `07b`), the custom seat R99 inserted through REST and **deleted for real** through the confirm (`08`) |
| `runtime-audit.mjs` | **0 undefined `var()`** on 6 routes × 2 themes (`/` 241 refs, `/admin` 245, `/admin/management` 224, `/admin/settings` 214, `/reception` 228, `/login` 184), the three document pages at 1280 and in the system state (attrs `null/null`), the viewer pass (`/reception` 228, `/my-seat` 178). Console errors = the Vercel Speed Insights script 404ing under a local `next start`, as every PR |
| `npm run test:e2e:auth` | **53 passed** (2.5 min) on the R-4 build, reset + reseeded, the same `:3200` server the rigs used (`reuseExistingServer`); first run (pre-R-4) **53 passed** (2.6 min) on a reset + reseeded stack (its `webServer` rebuilt the head with the local URL + anon key inline): publish flow, nav-shell, header-geometry, page-frames, accessibility, **draft-dialogs** (all seven dialogs opened + axe, the Delete X99 for real, every cancel path through the dialog's Cancel), reception-keyboard |
| contrast | `product-pairs.json: 202 pairs · surface-pairs-not-gated.json: 14 pairs` — **202/202 pass**, no token change (the danger primary's white-on-red-60 pairs gated since 3b) |

Tiers that need no stack (branch head, real Chrome for the browser tiers): unit **1449 / 1449** · ct **321 / 321**
(`dialog-error-placement` 19, `dialog-initial-focus` 2) · browser `test:browser` **26 / 26** · backend-free e2e
**36 / 36** · gate clean (lint 0 errors, typecheck, coverage 98.33 / 92.39 / 98.30) · build clean.

The owner's smoke (`../pr5b-smoke/README.md`): **22 / 22**, light then dark.

## Findings (recorded, not fixed silently)

1. **The move-conflict dialog opens with focus on its container, not on Cancel** (`06b-move-conflict-initial-focus`,
   both themes; `dialogs/06-move-conflict-*`). The dialog mounts INSIDE the rejected assignment's still-running
   transition, so its footer is disabled at mount and `useDialogFocus` falls back to the section; when the transition
   settles the buttons enable but focus stays on the (invisibly focused) section — Tab reaches Cancel. **Pre-existing,
   not a 5b regression**: the pre-5b markup used the same hook the same way (the e2e-auth spec's "interposes
   MID-SUBMIT" note). A candidate fix is a host-level effect in `CarbonModal` (busy → idle with focus on the section →
   focus the first control), outside this slice's plan; for the owner to rule. PHASE4BUILD §1.47.
2. **Found in build, fixed:** four dialogs closed on Esc while their RPC was in flight — SeatMap's window Esc listener
   had no pending guard on Vacate / Delete / Swap / Move (`01-vacate-busy-esc-*` shows the fixed behaviour);
   `seat-map-escape-source` pins the four rungs. PHASE4BUILD §1.47.
3. **Found by the captures, fixed (sheet amendment F, second rule):** the asset spaces only its `ul`, and the reset
   zeroes `<p>` margins, so Delete seat's scope line and the move-conflict's publish note ran into the description on
   the first run; `.cds-modal-body > p + p, > ul + p` take one spacing-03 step (PHASE3DS §1.24). The committed captures
   are from the rerun on the head.
4. Draft-only custom seats leave with Discard everything (`07b`): R99 — a draft-only added seat — is erased when the
   draft resets to published. Correct by definition (draft = published again); noted because a rig that inserts a
   custom seat must re-insert it after a discard.

## Provenance

Local Docker Supabase stack (`npm run db:start` + `db:seed`; `npx supabase db reset` + the seed before the e2e-auth
tier, because the rig's real discard / delete and the publish-flow spec leave state the seed does not tolerate).
Runtime: colima (Docker server 29.5.2) and Google Chrome (`channel: "chrome"` in the rigs; `PW_CHROMIUM_PATH` at
Chrome's binary for the Playwright tiers). Signed in as the seeded local admin `e2e-admin@example.test` (the seeded
viewer for the runtime audit's viewer pass). **No production data and no production write**: every name and seat is
`supabase/seed.sql` sample data; the rig refuses a non-local Supabase URL. `.env.local` was never edited: the local
stack's URL + anon key were passed inline to `next build` and `next start` (the README recipe; the e2e-auth tier does the
same). Captures: real Chrome, 1920×1080, after `document.fonts.ready` + 400–800 ms; theme by `sp-theme` in
localStorage + reload.
