# Phase 5 PR 5 — dark edges captures

Output of `phase5/audit/pr5-dark-edges.mjs` (real Chrome, local Docker stack, admin fixture, 1920 — the left-nav claim
at 1024 with the panel open). Dark-theme 3x crops of the five consumers PR 4's reviewer measured, each read as a computed
style before the crop: `01-nav-current`, `02-floor-menu`, `03-palette-row`, `04-tab`, `05-ai-label-hover` (+ `results.json`).
Every bar / edge is `rgb(232, 160, 122)` in dark and `rgb(184, 92, 46)` in light; the primary fill, focus ring and
`--cds-interactive` read `rgb(184, 92, 46)` in both. The rig needs Docker and a Chrome channel; it is run on the owner's
machine, and this directory is filled from that run.
