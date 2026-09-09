# Phase 5 PR 3 — read-only preview walk · captures

**Source:** the Vercel preview of #527 at head `6efe9d6`,
`https://seat-planner-git-feat-phase5-a5adc2-patrick-s-projects-c7baae0c.vercel.app` (behind Vercel Authentication;
reached through a 23h share link, the owner signed in by hand). **Date:** 2026-09-09. **Method:** the owner's real
Chrome on Windows (the dual-27" frame), window maximised on the 1920×1080 second monitor — the viewport measures
**1864×927** because Chrome's vertical tab strip takes the left 56px and the "Claude started debugging" infobar the
top 58px; the beacon-calibrated `CopyFromScreen` pipeline (`chrome-pixel-capture` skill) crops the page from its own
viewport origin, so every file is true pixels of the page and nothing else. State was arranged through the
claude-in-chrome extension (real clicks, real key presses, synthetic hover), and every claim below was read from
computed style in the page before its capture. **Production database behind the preview — nothing that writes was
touched:** no Publish, Discard, Assign, Swap confirm or inspector Save; the Names toggle and the theme are
per-browser preferences and were restored (System, Names off) at the end. The `-3x-` files are the 1x crop
upsampled 3× nearest-neighbour as a reading aid; the 1x pixels are the evidence.

| Step | Result | Capture | What was read |
|---|---|---|---|
| 1 `/admin`, Names off, Fit, light | **PASS** | `01-admin-names-off-light.png` | 58 of 58 assigned seats are 28×28 footprints carrying ● with no text; 10 open seats keep ○; band reads "Assigned 58"; legend ● and marker ● both `rgb(22, 22, 22)`; fill `rgb(255, 255, 255)`, 1px `rgb(82, 82, 82)` inset edge |
| 2 hover | **PASS** | `02-admin-hover-C01-3x-light.png` | C01 `:hover` true, fill `rgb(232, 232, 232)` (layer-hover-02), seat-code tooltip shown; cursor moved to the mat → `:hover` false, fill back to white |
| 3 click → inspector → focus in the body | **PASS** | `03-admin-selected-C01-3x-light.png`, `03-admin-selected-inspector-light.png` | inspector open, `data-state="selected"`; after a click on the inspector heading `document.activeElement` is `aside#seat-inspector-panel`, the marker's `box-shadow` is `rgb(22, 22, 22) 0px 0px 0px 2px inset` and `outline-style: none` — the 2px border-inverse edge alone (F-1 eye proof); "Close inspector" cleared the selection and the edge returned to 1px |
| 4 keyboard | **PASS** | `04-admin-keyboard-selected-C02-3x-light.png` | click on the mat, one Tab → C01 (the roving stop); ArrowRight → C02 with the 2px `rgb(184, 92, 46)` focus ring; Enter → inspector open, C02 `box-shadow` 2px `rgb(22, 22, 22)` inset; Esc → inspector closed, selection cleared, focus back on C02 |
| 5 rail + one Zone filter | **PASS** | `05-admin-zone-filter-quiet-light.png`, `05-admin-quiet-vs-loud-3x-light.png` | Zone "Center Desks": 53 filtered-out assigned seats on `rgb(244, 244, 244)` with a 1px `rgb(198, 198, 198)` edge and the ● at `rgb(82, 82, 82)`; the 5 matches stay white with the ● at `rgb(22, 22, 22)`; Clear all → 0 quiet pills, `?zone=` gone |
| 6 ◇ with Names off | **N/A** | — | the draft is clean ("Draft — no changes", no `data-draft-changed` marker); no draft change was created to test it |
| 7 Names on vs production | **PASS** | `07-admin-names-on-C01-3x-light.png` | C01 pill on the preview and on `seats.megeredchianlaw.com/admin` in the same browser, same theme: text "Tsov P.", fill `rgb(255, 255, 255)`, colour `rgb(22, 22, 22)`, `box-shadow` `rgb(82, 82, 82) 0px 0px 0px 1px inset`, font `12px / 16px plexSans…`, letter-spacing `0.32px`, padding `0px 8px`, height `28px`, width `54.81px` — identical on both |
| 8 `/` viewer, Names off | **PASS** | `08-viewer-names-off-light.png`, `08-viewer-selected-C01-3x-light.png` | same footprint + ● (58 / 10, legend ● = marker ● `rgb(22, 22, 22)`); hover lifts to `rgb(232, 232, 232)`; click selects with the 2px inset edge and opens the read-only seat sheet; Esc clears |
| 9 dark via the Account panel, repeat 1 and 3 | **PASS** | `09-admin-names-off-dark.png`, `09-admin-selected-C01-3x-dark.png`, `09-admin-selected-inspector-dark.png` | Dark radio → `data-carbon-theme="g100"`; 58 of 58 ●, 10 ○, legend ● = marker ● `rgb(244, 244, 244)`, fill `rgb(57, 57, 57)`, 1px `rgb(198, 198, 198)` edge; selected with focus in the inspector: `box-shadow` `rgb(244, 244, 244) 0px 0px 0px 2px inset`, `outline: none`; Close cleared it |

**8 PASS · 0 FAIL · 1 N/A (9 steps).**

Two things worth a line for the next walker. Production's `/admin`, read for step 7 with Names off before the toggle,
still paints the shipped block (`background rgb(22, 22, 22)`, `box-shadow: none`, `color: rgba(0, 0, 0, 0)`) under a
legend that says ● — F-3 in one frame. And the skill's `capture-settled.ps1` never settles on this app: its gate wants
RGB 22 directly under the beacon, and the infobar's shadow dims the beacon itself to (197, 0, 197), under the
script's 200 threshold; the walk used a variant that locates the beacon at a 150 threshold and checks it twice 400ms
apart instead (`scratchpad/cap.ps1`, not committed — the skill's own script is the place to fold that in).
