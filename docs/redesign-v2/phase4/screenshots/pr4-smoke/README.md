# Phase 4 · PR 4 pre-merge smoke — owner-ordered, twenty steps (2026-09-05)

**What these show.** The owner's step list for PR 4 (Management + Settings) driven end to end: the frame and the line
tabs by keyboard; the sticky strip on a squat viewport; the table anatomy, the live count and search, the seat-code
link into the inspector; the 480 panel (add · edit · combobox create row · fact row · danger zone · 50/50 footer), the
one dirty-close check through Esc, the scrim and Cancel; a save and an add with the header indicator following; the
Deactivate confirmation as the narrow tearsheet over the panel (the owner's ruling) with its inertness and geometry;
the refused deactivation inline in the danger zone; the departments list (⋯ Delete, inline rename editing +
duplicate-on-blur, the "Not in list" tag + Add to list); the one-field create modal; the delete sheets; the Settings
frame, the file triggers and every guard, the CSV review ready + blocked, the restore review with the D6-e export-first
done-state, MLS02 on restore across two tabs; the 1280 / 1024 frames, the system theme, the 403 cards, the brand scan
and the console. `results.json` carries step · theme · pass/fail · computed values · captures; the step table is in
this file's tail.

**Source.** Branch `feat/phase4-pages` (PR 4) after the smoke's four fixes (PHASE4BUILD §1.39), `npm run build` with
the **local Docker Supabase stack's** env exported (`NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` from `supabase status`
— the same hermetic effect as re-pointing `.env.local`, which was never edited), served by `next start -p 3200`. The
rig itself runs `supabase db reset` + the seed before each theme and before step 20, so every step starts from the
seed. Signed in as the seeded local admin `e2e-admin@example.test`; the seeded viewer for the 403 cards. **No
production data and no production write**: every name, seat and count is `supabase/seed.sql` sample data ("Smoke
Test", "Intake & Triage", "Compliance", "Marketing" are the smoke's own throwaway rows, gone with the next reset).
Nothing is published or discarded anywhere; the restore in step 18 restores the draft to its own export.

**Method.** `audit/pr4-smoke.mjs`: Playwright `chromium.launch({ channel: "chrome" })` (real Chrome), viewport
1920×1080 (1920×420 for the pinned strip; 1280×800 / 1024×768 for the frames), device scale 1; theme set by writing
`sp-theme` to localStorage and reloading (the system state by clearing it and emulating the OS scheme); computed
values read with `getComputedStyle` on the live elements; accessible names with `exact: true` where a name is a
prefix of another; a step that crashes records a FAIL with its error and a diagnostic capture, then the rig recovers
and continues. Server-action calls are counted from the browser's `Next-Action` POSTs.

**Step table.** Filled from `results.json` below (P = pass in both themes unless a theme is named).

| Step | Theme | Result | Captures |
|---|---|---|---|
| 1 Frame | light | P | 01-frame-light.png |
| 2 Tabs by keyboard | light | P | 02-tab-focus-light.png |
| 3 Sticky strip | light | P | 03-sticky-strip-light.png |
| 4 Table anatomy | light | P | 04-row-hover-light.png, 04-edit-tooltip-hover-light.png, 04-edit-tooltip-focus-light.png |
| 5 Toolbar count and search | light | P | 05-zero-search-light.png |
| 6 Seat link | light | P | 06-seat-link-inspector-light.png |
| 7 Edit panel | light | P | 07-panel-combobox-create-light.png, 07-panel-edit-light.png |
| 8 Dirty close | light | P | 08-dirty-ask-light.png |
| 9 Save + Add | light | P | 09-saved-light.png, 09-added-light.png |
| 10 Deactivate (the ruling) | light | P | 10-sheet-over-panel-light.png, 10-deactivated-light.png |
| 12 Tearsheet geometry | light | P |  |
| 11 Deactivate refused | light | P | 11-deactivate-refused-light.png |
| 13 Departments list | light | P | 13-overflow-light.png, 13-rename-duplicate-light.png, 13-not-in-list-light.png |
| 14 Create modal | light | P | 14-create-duplicate-light.png |
| 15 Delete department + zone shape | light | P | 15-delete-department-light.png, 15-delete-zone-light.png |
| 16 Settings frame | light | P | 16-settings-light.png |
| 17 File triggers and guards | light | P | 17-guard-inline-light.png, 17-csv-review-light.png, 17-csv-blocked-light.png |
| 18 Restore review + D6-e | light | P | 18-restore-review-exported-light.png, 18-restored-light.png |
| 19 MLS02 on restore | light | P | 19-mls02-restore-light.png |
| 1 Frame | dark | P | 01-frame-dark.png |
| 2 Tabs by keyboard | dark | P | 02-tab-focus-dark.png |
| 3 Sticky strip | dark | P | 03-sticky-strip-dark.png |
| 4 Table anatomy | dark | P | 04-row-hover-dark.png, 04-edit-tooltip-hover-dark.png, 04-edit-tooltip-focus-dark.png |
| 5 Toolbar count and search | dark | P | 05-zero-search-dark.png |
| 6 Seat link | dark | P | 06-seat-link-inspector-dark.png |
| 7 Edit panel | dark | P | 07-panel-combobox-create-dark.png, 07-panel-edit-dark.png |
| 8 Dirty close | dark | P | 08-dirty-ask-dark.png |
| 9 Save + Add | dark | P | 09-saved-dark.png, 09-added-dark.png |
| 10 Deactivate (the ruling) | dark | P | 10-sheet-over-panel-dark.png, 10-deactivated-dark.png |
| 12 Tearsheet geometry | dark | P |  |
| 11 Deactivate refused | dark | P | 11-deactivate-refused-dark.png |
| 13 Departments list | dark | P | 13-overflow-dark.png, 13-rename-duplicate-dark.png, 13-not-in-list-dark.png |
| 14 Create modal | dark | P | 14-create-duplicate-dark.png |
| 15 Delete department + zone shape | dark | P | 15-delete-department-dark.png, 15-delete-zone-dark.png |
| 16 Settings frame | dark | P | 16-settings-dark.png |
| 17 File triggers and guards | dark | P | 17-guard-inline-dark.png, 17-csv-review-dark.png, 17-csv-blocked-dark.png |
| 18 Restore review + D6-e | dark | P | 18-restore-review-exported-dark.png, 18-restored-dark.png |
| 20 Width 1280 /admin/management | light | P |  |
| 20 Width 1024 /admin/management | light | P |  |
| 20 Width 1280 /admin/settings | light | P |  |
| 20 Width 1024 /admin/settings | light | P |  |
| 20 System theme /admin/management | system-dark | P | 20-management-system-dark.png |
| 20 System theme /admin/settings | system-dark | P | 20-settings-system-dark.png |
| 20 Brand check | both | P |  |
| 20 403 /admin/management | light | P | 20-management-403.png |
| 20 403 /admin/settings | light | P | 20-settings-403.png |
| 20 Console | both | P |  |

**Recorded values (from `results.json`).** Primary `rgb(184, 92, 46)`, hover `rgb(143, 69, 33)`; selected tab bar
`rgb(184, 92, 46) 0px -2px 0px 0px inset`; focus ring `solid 2px rgb(184, 92, 46)` offset −2px; links rest → row-hover
light `rgb(143, 69, 33)` → `rgb(122, 58, 28)`, dark `rgb(232, 160, 122)` → `rgb(245, 221, 209)` (the token contract;
the brief's two numbers are the rest colours). Panel 480 wide on `layer-02` — white light, `rgb(57, 57, 57)` dark (gray
80, Carbon g100's layer-02; not gray 100). Deactivate sheet at 1920×1080: top 160, bottom 490, width 720; footer
Cancel 160 min · Deactivate employee 224 min, right edge flush with the sheet; overlay `rgba(22, 22, 22, 0.5)` at z
8000 over the panel's 7001 (step 12: the bottom edge sits at content height, not the viewport bottom — Phase 3 sheet
as landed). Toolbar count after the add "13 employees · 4 assigned · 9 unassigned"; indicator "Draft — 1 change" live
after the save (the §1.39 seam). 1024: Settings column 960, sheet 992 (amendment C). Step 19's second tab moved a seat
through the inspector (Maria Lopez N03 → an open seat); the review held with the MLS02 text.

**First pass (before the four fixes):** 34/47 — steps 9 (indicator), 10 (focus left the sheet on the overlay click),
11 (generic fallback instead of the refusal) and 20's 1024 settings frame failed for the reasons in PHASE4BUILD §1.39;
4, 6, 13, 16, 17 failed on rig assertions (the collapsed border share, `isVisible` not waiting, the indicator refetch
counted as a second action, the sr-only live region before the callout, preflight's zero-width `border-style: solid`)
and were corrected in the rig. **Final pass: 47/47.**

**Step 4 re-run (2026-09-05, PHASE3DS §1.23 amendment D — `step4-amendment-d/`).** The read-only preview walk found
that the Edit tooltip never painted: the asset's cell `overflow: hidden` clipped it, and this smoke's step 4 had
asserted `visibility` / width, which a clipped box still passes — the `04-edit-tooltip-*` captures above show no
tooltip. The rig's step 4 now hit-tests (`document.elementFromPoint` at the tooltip's centre is the tooltip, lifting
its `pointer-events: none` for the call) and requires the box inside the viewport, on the first row (below) and the
last row (above, `data-tooltip-placement="above"`), hover and focus. Re-run with `SMOKE_ONLY=4` on the reseeded
stack, real Chrome 1920×1080, both themes: **4/4** (`step4-amendment-d/results.json`, captures
`04-edit-tooltip-hover-*`, `04-edit-tooltip-focus-*`, `04-edit-tooltip-last-row-*`). The e2e-auth `page-frames` spec
carries the same assertion at 1920 / 1280 / 1024 and was shown to fail (3 of 9) with the cell rule reverted.
