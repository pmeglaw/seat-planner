# Phase 5 PR 4 — Reception's locked row gets its own surface (+ the band→tail gap)

Captures and hit-test results from `docs/redesign-v2/phase5/audit/pr4-reception-locked-row.mjs`, run 2026-09-10 on
branch `feat/phase5-reception-locked-row` (build of `5373ebc` — the O4 brand override, amendment K, the rig) against
the LOCAL Docker Supabase stack (`npm run db:start` + `db:seed`, seeded viewer `e2e-viewer@example.test`), real Chrome
via Playwright `channel: "chrome"`, 3x crops through CDP `Page.captureScreenshot` clip scale. Never production.

```
node docs/redesign-v2/phase5/audit/pr4-reception-locked-row.mjs http://localhost:3300 docs/redesign-v2/phase5/screenshots/phase5-pr4 e2e-viewer@example.test <seeded password> --baseline docs/redesign-v2/phase5/screenshots/phase5-pr4/results-main.json
```

**84/84 claims pass** (`results.json`). `results-main.json` is the same rig on a `next build` of `main` (`d9d52ee`),
built in a second worktree (reviewer ruling C) and served on :3301 — 38/82 there, the colour and gap claims failing
by design: locked = header (rgb 224/224 light, 57/57 dark), band→tail 16.00. Its 1920 `measurements` are the
baseline for claim 5 (the band's box and the tile's box are pixel-identical: 416×260 at 1272,182 in both themes).

Matrix: 480 / 640 / 800 / 1024 / 1920 × light / dark, row 1 locked (row 2 locked first so "Recent lookups" exists).

| file | what |
|---|---|
| `01-header-locked-hover-3x-<w>-<theme>.png` | 3x crop, count header + locked row 1 + hovered row 2 — the three surfaces (claim 1) |
| `01-locked-row1-<w>-<theme>.png` | 1x viewport, row 1 locked, row 2 hovered |
| `02-locked-and-cursor-3x-<w>-<theme>.png` | 3x crop, the locked row and the keyboard-cursor row while both exist (claim 4) |
| `03-readout-1920-<theme>.png` | 1x, the wide readout column after amendment K — 24 band→tail and tail→recents (claim 5) |
| `04-locked-under-band-<w>-<theme>.png` | 1x below the 1055 fold — the locked row under the pinned band, hit-tested (claim 6) |
| `contrast/summary.txt` | the checker's lines for the Reception / tab-bar pairs and the `212/212 pass` summary |

Claims per width × theme: (1) locked row `background-color` is the ruled value and header / locked / hovered are three
distinct values; (2) hovering the locked row changes nothing (R2); (3) the 3px bar is rgb(184, 92, 46) light /
rgb(232, 160, 122) dark (R5); (4) with the cursor on another row, cursor = hover surface, lock = hit surface, the
cursor's bar is the same colour; (5, 1920) band→tail and tail→recents measure 24, band + tile boxes equal main's;
(6, < 1056) `elementFromPoint` at the locked row's left-centre resolves to the row.
