# Phase 5 PR 2 — capture provenance

**What:** Reception's **narrow frame** — below the 1055 fold the readout splits by job: the band (name,
extension, seat line) pins under the search, the tail (fallbacks, Show on map) and Recent lookups follow the
list. Owner ruling **R1** / **R2** (2026-09-08), sheet **amendment I**, DECISIONS **D3-f**.
**When:** 2026-09-08.
**Branch / head:** `feat/phase5-reception-narrow`, captured after the two sheet constants were measured on the
live band (see *The measurements that set the sheet* below).
**How:** `node docs/redesign-v2/phase5/audit/pr2-reception-narrow.mjs http://localhost:3300 <thisDir> e2e-viewer@example.test <seeded password>`
— headless Chromium via the repo's own Playwright, real sign-in as the seeded local **viewer** (Reception is
read-only for every signed-in role, so the viewer is the honest session for it).
**Where from:** the **local Docker Supabase stack** (`npm run db:start` + `node scripts/seed-local-db.mjs`),
with `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` passed inline to `next build` / `next start`
on port 3300. `.env.local` was never edited. **Nothing here touched production** — no production read, no
production write, and no production data appears in any image.

## The data in these images is synthetic

Every name, extension and seat in these captures comes from `supabase/seed.sql` on the disposable local stack.
The account signed in is `e2e-viewer@example.test`. **No firm data and no real extension is shown** — which
matters more than usual here, because the whole subject of the capture is a phone extension rendered at 42px.

## What was captured

| Prefix | State | Frames |
|---|---|---|
| `01-waiting-*` | first run — the band holding "Waiting for a call" (§1R.6) | 480 / 640 / 800 / 1024 × light + dark |
| `02-locked-scrolled-*` | a person locked **and the list scrolled to its end** — the case the slice exists for | 480 / 640 / 800 / 1024 × light + dark |
| `03-no-extension-*` | "No extension on file" in the band, never a dash (§1R.4 item 4) | 480 / 640 / 800 / 1024 × light + dark |
| `04-wide-1920-*` | the ≥1056 frame, unchanged: readout 480, gutter 32, list 1008 | 1920 × light + dark |

`results.json` carries all **148 assertions (148/148)** and the per-frame measurements.

## Every geometric claim is a hit test

The precedent is PR 4's amendment D, where a tooltip passed a visibility assertion **while it was clipped**.
`toBeVisible()` would pass for a numeral sitting underneath the pinned band too, so the rig asks
`document.elementFromPoint` whether the band's own box is what is actually painted at those coordinates, and
checks all four corners against the viewport. The decisive capture is `02-locked-scrolled-*`: the list is
scrolled to its **end** before the numeral is hit-tested, because the failure this slice fixes only appears
once the list has been scrolled.

## The measurements that set the sheet

Both constants in amendment I were read off the live band, not estimated — and one of them contradicted the
hand-off, which is why it was measured:

- **The name block wraps under the numeral at 420 and below, not at ~560 as §4.2 predicted.** The numeral is
  only 87–101px wide, so on a 224px basis the two sit side by side across the whole of R2's 480–1055 range
  (at 480: 101 + 32 + 224 = 357 in a 416 frame). The wrap is therefore not a designed reflow inside R2's range
  at all — it is the safety valve that keeps DECISIONS §2's 320 floor working.
- **The band is 232px tall wrapped (320) and a flat 170px side by side (460 up).** The tile column dominates,
  so a name wrapping to two lines inside its own block costs nothing — measured against injected worst-case
  name, role and seat-line text as well as the seed's own longest. Hence `scroll-margin-top: 232px`, which
  keeps the ↑ cursor from parking under the pinned band.

Measured at 320 / 360 / 390 / 420 / 460 / 480: **no horizontal scroll and nothing off-edge at any of them.**

## Two rig findings, fixed in the rig

Both first-run failures were the rig's, not the product's, and are recorded because each is an easy trap to
repeat:

- **"The band stays pinned" was asserted as "the band does not move".** Pinning is precisely the band moving
  up to its sticky offset and stopping. The assertion now checks that it *moved* and landed at 48 in viewport
  coordinates — which is the same number in both scroll models: below 1024 the document scrolls and the band's
  own `top` is the 48 header, while at 1024 the pane scrolls, the band's `top` is 0, and the pane starts 48
  down under the fixed header.
- **The tail-order claim ran on whichever person happened to be locked.** Whether a lock has same-department
  colleagues is a property of the seed's departments, not of the layout, so a person who is simply the only
  extension in their department read as an O-2 regression. The rig now locks a person who *has* fallbacks
  before asserting the order.

## Console

The only console errors under `next start` are the Speed Insights script 404 and its MIME-type refusal —
the same local-only noise PHASE4BUILD §1.46 recorded for the PR 5 smoke. Nothing else.
