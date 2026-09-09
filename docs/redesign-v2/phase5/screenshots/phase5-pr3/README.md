# Phase 5 PR 3 — the names-off marker becomes ● in the footprint · captures

**Source:** branch `feat/phase5-names-off-marker`, `next build` + `next start` against the local Docker Supabase
stack (fresh `db:seed`), real Chrome (Playwright `channel: "chrome"`) at 1920×1080, both themes via
`localStorage.sp-theme`. **Date:** 2026-09-09. **Method:** `audit/pr3-names-off-marker.mjs` — every geometric
claim is a hit test or a computed-style comparison; the ◇-painted claim is a pixel sample of the 3x crop
(reviewer ruling B: `.cds-touch-target::after` answers every `elementFromPoint` over the marker). The 3x crops are
CDP `Page.captureScreenshot` with `clip.scale: 3` (228×228 px for a 28px marker ± 24px), because Playwright's own
screenshot renders at the context's device scale factor whatever an emulation override says.

`results.json` — **38/38 claims, 0 skipped, both themes, `/admin` and `/`.** `results-baseline-main.json` — the
same rig on a `next build` of `main` (`c086f0a`): **7/38**, failing exactly on the block's defects (F-1 selected
edge = fill in both themes, F-3 no legend class, the quiet block carrying no ●, and a fourth — the block's
`overflow: hidden` clipped the 44px touch pseudo, so `elementFromPoint` at ±21 px hit the layer beneath). Claim 12
compares the Names-ON pill's rect and computed style against that baseline: identical.

| File | What |
|---|---|
| `01-admin-names-off-1920-{light,dark}.png` | The whole Floor 3 plan on `/admin`, Names off: ● in a footprint among ○ · lock · hatch; the band reads "● Assigned 4". |
| `05-viewer-names-off-1920-{light,dark}.png` | The same on `/` (R3). |
| `02-marker-rest-3x-{theme}-{admin,viewer}.png` | Rest: layer-02 fill, 1px icon-secondary edge, ● in the fill colour. |
| `02-marker-hover-3x-…` | Hover: layer-hover-02, the open footprint's own lift (R2). |
| `02-marker-focus-3x-…` | Keyboard focus: the 2px terracotta ring, inset. |
| `02-marker-selected-3x-…` | Selected **after a click**, so the focus ring is painted over the 2px inverse edge — the edge itself is asserted from the computed `box-shadow` (claim 5), and claim 6 proves it by keyboard. |
| `02-marker-quiet-3x-…` | Filtered out: layer-01 fill, subtle edge, the ● stepped to the quiet text colour. |
| `02-marker-draft-3x-{theme}-admin.png` | Changed in draft with Names off: the ◇ complete at the top-right, beyond the 28px box (F-2). |
| `03-legend-3x-…` | The band's legend beside it: ● Assigned, in the marker's colour (P-1, F-3). |
| `04-marker-names-on-3x-{theme}-admin.png` | The same seat with Names on — unchanged against `main` (claim 12). |
| `contrast/` | `audit/marker-contrast.mjs` (the phase5 copy of the Phase 4 rig): `summary.txt` — **69 measurements, 0 under their floor, 0 outside the ledger** — plus its per-state crops; the names-off states measure ● 18.1 / 10.5, edge on the mat 7.81 / 10.59, quiet ● 7.1 / 8.86, ◇ 5.00 / 4.91. |
| `runtime/summary.txt` | `phase4/audit/runtime-audit.mjs` (run, not edited): **0 undefined `var()`** on 6 routes × 2 themes + the system state + the viewer routes — nothing still references the retired `--sp-pill-names-off`. The console lines are the local-only Speed Insights 404s and MIME refusals PHASE4BUILD §1.46 recorded. |

Two rig notes, for the next reader: claim 7's "loud ●" reads `null` because the seed's four assigned seats all
sit in the first Zone, so the zone chip quiets every names-off pill — the step is still proven by the quiet ●
equalling the quiet text token and differing from the rest ● in claim 10. And the swap that produces the
changed-in-draft seat is a real local draft write; run against a fresh `db:seed` so the swap does not undo an
earlier one.
