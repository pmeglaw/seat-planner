# Phase 4 · PR 6 — the F-8 walk on PRODUCTION (2026-09-08)

The read-only walk that PR 6's preview could not carry. A migration PR gets its own Supabase **branch database** and
`[db.seed]` is disabled on purpose, so the preview had no accounts to sign in with (hand-off §6). The owner ruled the
F-8 check onto production, immediately after the merge — this is that run.

Rig: `../../audit/pr6-preview-walk.mjs` (production form: the base URL passed twice, since production needs no share
link). Target: `https://seats.megeredchianlaw.com` on the merge SHA — `/api/build-id` returned
`0caedc6e5813257838426b0bff5428868f7cfd8e`. Real Chrome, headed, 1920 × 1080, light then dark, the owner signing in by
hand. **14 / 14 records pass.**

## What it proves

| Step | Both themes |
|---|---|
| `1 band closed` | The band spans the full canvas; its Zoom-in sits at **(1896, 1060)** with `padding-right: 8px` and hit-tests to itself |
| `2 band under an open slot` | With the inspector open the band takes the slot's push: Zoom-in at **(1496, 1060)**, `padding-right: 408px`, right edge **8px clear** of the slot at x 1520, hit-test `inBand: true · inSlot: false`. The count reads "68 seats", unclipped — this is the defect's exact site |
| `3 zoom clickable under the slot` | Pressed for real while the inspector is open: zoom in took the plan **1504 → 1911**, Fit returned it to **1504**, with **zero** new action POSTs (zoom is client-side view state) |
| `4 dismissed` | Closing the inspector returns the band to full width; the indicator is unchanged from the baseline |

## Zero writes, proven rather than asserted

Production is the live database, so the walk opens and dismisses only — it never opens a confirm, never presses a
primary, never edits a field, never Publishes or Discards.

- Draft indicator: **"Draft — no changes"** at entry and after every step.
- Undo: **disabled**, "No map changes to undo", at entry and after every step.
- Success notices on the canvas: **0**.
- Server-action POSTs for the whole session: **1** — the shell's argument-less status read on entry, status 200.

## Captures

10 PNGs, both themes: `01-band-closed-*`, `02-band-slot-open-*` (the F-8 evidence), `03-zoomed-under-slot-*`,
`04-fit-under-slot-*`, `05-dismissed-*`. People data is masked — pills, the inspector, the palette and the header name
render as a soft smudge (text fill only, so every measured colour and geometry is the real thing); `results.json`
records no name.

Recorded against PHASE4BUILD §1.48 ("the moved F-8 obligation is DISCHARGED").
