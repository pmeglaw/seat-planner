# Phase 4 · PR 5b read-only preview walk (2026-09-07)

**What these show.** The Vercel branch preview of PR 5b (#523) walked through every one of the map's seven confirm
dialogs on the asset modal, each **opened and dismissed only** — Esc, Cancel, Keep editing, the guard's Discard (a
local reset), Keep draft changes — never confirmed, at 1920×1080 light and dark. `results.json` carries step · frame ·
pass/fail · computed values · captures, plus every server-action POST the browser sent and the header indicator + the
row's Undo state before the walk and after every step (identical throughout). **21/21.**

**Preview.** https://seat-planner-git-feat-phase4-000e3d-patrick-s-projects-c7baae0c.vercel.app — Vercel deployment
`dpl_26xBakHRjYer6AL35S5rF5tvDJRg` (`seat-planner-nnpzplzf6-patrick-s-projects-c7baae0c.vercel.app`), READY at commit
**`a30dcf1`** (the PR head); the rig reads `/api/build-id` first and stops if the served commit differs (step 0). The
preview sits behind Vercel Authentication; the rig entered through a 23-hour `_vercel_share` link minted with the Vercel
MCP (expires 2026-09-08 23:02, bound to this deployment). **The owner signed in by hand in the headed Chrome window** —
no password through chat or argv; the rig waits on `/login` until the URL leaves it.

**Read-only, zero writes.** The preview reads and writes the PRODUCTION database, so the walk never presses Vacate
seat / Delete seat / Confirm swap / Move them / Swap them / Save changes / Discard everything. Delete seat opens only if
production already has an available custom seat (**it has none** among the ten open seats — step 2 N/A); Discard draft
only if the production draft already diverges (**"Draft — no changes"** — step 7 N/A); nothing was created to make
either appear. Proof: the indicator read **"Draft — no changes"** and Undo **disabled ("No map changes to undo")** at the
start and after every step in both themes; **3 server-action POSTs** in total — 1 argument-less status read on entry and
**2 × the move-conflict step's "Assign employee" submit** (one per theme), which the server answers with
`EMPLOYEE_ALREADY_ASSIGNED` as data (the double-booking offer that opens the dialog; no row changes until "Move them",
never pressed — the same shape the e2e-auth `draft-dialogs` spec relies on); zero `.cds-notification--success` notices;
no failed response other than the Speed Insights script.

**People-data mask.** The repo is public and the preview shows the live directory, so the rig injects one stylesheet
before every capture: pills, seat markers, the inspector, the palette, the roster, the header name, the mode card, the
canvas status and the modal's heading + body (they carry names) render as a soft smudge (`-webkit-text-fill-color:
transparent` + `text-shadow`). The modal's eyebrow and footer buttons carry no person and stay legible; every measured
colour and geometry is the real thing. `results.json` records seat ids and codes only, never a name; the focus
descriptors reduce any label that could carry a name to its first token.

**Method.** `../../audit/pr5b-preview-walk.mjs`: Playwright `chromium.launch({ channel: "chrome", headless: false })`,
viewport 1920×1080; theme by the Account panel's Theme radio (the real control); per dialog: role, `aria-labelledby` +
`aria-describedby` resolving inside, eyebrow text (R-4), focus on the first footer button, computed primary background
(terracotta or red 60) with a white label, hit-tests by `document.elementFromPoint` (every footer button's centre → itself;
a marker under the overlay → `div.cds-modal-overlay`), Esc / Cancel closing and returning focus to the opener (asserted
where the opener is a real button — Vacate, Delete; recorded where it was a synthetic marker click). Seats are picked from
the live canvas by accessible state (the first assigned, the second assigned, the first open).

## Findings

- **Rig-side, first run (18/21):** step 6 expected Esc after Keep editing to raise the guard again, but focus had been
  restored to the note textarea, where Esc is inert (the map's Esc ladder skips editable targets) — the guard is now
  re-raised by a marker click and Esc is asserted as Keep editing (the host's `onEscape`), the edit intact; and the writes
  record now names the move-conflict submit as the one non-status POST by design. No product change. The first run wrote
  nothing either (its record shows the same indicator + Undo before and after).
- **R-5 (recorded, not failed):** the move-conflict dialog opens with focus on its section (both themes), as on the local
  stack — parked for PR 6.
- Production has one assigned seat per zone on the walked floor; the Move step's swap arm used the second assigned seat.

## Step × frame table (`results.json`)

| Step | Frame | Result | Computed values | Captures |
|---|---|---|---|---|
| 0 deployment | both | PASS |  |  |
| 0 start | both | PASS | indicator="Draft — no changes" · undo={"disabled": true, "label": "No map changes to undo"} |  |
| theme light — Account panel → Theme | light | PASS | attr="white" |  |
| 1 Vacate | light | PASS | role="alertdialog" · eyebrow="Vacate seat" · bg="rgb(255, 255, 255)" · width=480 · firstFocused=true · hits=["button.cds-btn.cds-btn--secondary", "button.cds-btn.cds-btn--danger"] · markerHit="div.cds-modal-overlay" · esc={"how": "Escape", "closed": true, "restored": true} · cancel={"how": "Cancel", "closed": true, "restored": true} · hygiene={"indicator": "Draft — no changes", "undoDisabled": true, "successNotices": 0} · primary={"text": "Vacate seat", "bg": "rgb(218, 30, 40)", "color": "rgb(255, 255, 255)"} | `01-vacate-light.png` |
| 2 Delete seat — N/A — production has no available custom seat among the probed open seats | light | PASS |  |  |
| 3 Swap | light | PASS | role="alertdialog" · eyebrow="Swap seats" · bg="rgb(255, 255, 255)" · width=480 · firstFocused=true · hits=["button.cds-btn.cds-btn--secondary", "button.cds-btn.cds-btn--primary"] · markerHit="div.cds-modal-overlay" · cancel={"how": "Cancel", "closed": true, "restored": null} · items=2 · hygiene={"indicator": "Draft — no changes", "undoDisabled": true, "successNotices": 0} · primary={"text": "Confirm swap", "bg": "rgb(184, 92, 46)", "color": "rgb(255, 255, 255)"} | `03-swap-light.png` |
| 4 Move | light | PASS | hits=["button.cds-btn.cds-btn--secondary", "button.cds-btn.cds-btn--primary"] · markerHit="div.cds-modal-overlay" · hygiene={"indicator": "Draft — no changes", "undoDisabled": true, "successNotices": 0} | `04-move-light.png`, `04-move-swap-arm-light.png` |
| 5 Move-conflict — initial focus on the section — R-5, recorded | light | PASS | role="alertdialog" · eyebrow="Move employee" · bg="rgb(255, 255, 255)" · width=480 · firstFocused=false · hits=["button.cds-btn.cds-btn--secondary", "button.cds-btn.cds-btn--primary"] · markerHit="div.cds-modal-overlay" · cancel={"how": "Cancel", "closed": true, "restored": null} · initialFocus="section[alertdialog]:Move…" · hygiene={"indicator": "Draft — no changes", "undoDisabled": true, "successNotices": 0} · primary={"text": "Move them", "bg": "rgb(184, 92, 46)", "color": "rgb(255, 255, 255)"} | `05-move-conflict-light.png` |
| 6 Inspector guard | light | PASS | role="dialog" · eyebrow="Seat C01 · Center Desks" · bg="rgb(255, 255, 255)" · width=480 · firstFocused=true · hits=["button.cds-btn.cds-btn--secondary", "button.cds-btn.cds-btn--secondary", "button.cds-btn.cds-btn--primary"] · markerHit="div.cds-modal-overlay" · widths=[120, 120, 240] · esc={"how": "Escape", "closed": true, "restored": null} · keep={"how": "Keep editing", "closed": true, "restored": null} · discard={"how": "Discard", "closed": true, "restored": null} · postsDuring=0 · shownAfter="Seat C03" · hygiene={"indicator": "Draft — no changes", "undoDisabled": true, "successNotices": 0} · primary={"text": "Save changes", "bg": "rgb(184, 92, 46)", "color": "rgb(255, 255, 255)"} | `06-inspector-guard-light.png` |
| 7 Discard draft — N/A — the production draft has no change ("Draft — no changes"); nothing is created to make the dialog appear | light | PASS | indicator="Draft — no changes" |  |
| frame light hygiene | light | PASS |  |  |
| theme dark — Account panel → Theme | dark | PASS | attr="g100" |  |
| 1 Vacate | dark | PASS | role="alertdialog" · eyebrow="Vacate seat" · bg="rgb(57, 57, 57)" · width=480 · firstFocused=true · hits=["button.cds-btn.cds-btn--secondary", "button.cds-btn.cds-btn--danger"] · markerHit="div.cds-modal-overlay" · esc={"how": "Escape", "closed": true, "restored": true} · cancel={"how": "Cancel", "closed": true, "restored": true} · hygiene={"indicator": "Draft — no changes", "undoDisabled": true, "successNotices": 0} · primary={"text": "Vacate seat", "bg": "rgb(218, 30, 40)", "color": "rgb(255, 255, 255)"} | `01-vacate-dark.png` |
| 2 Delete seat — N/A — production has no available custom seat among the probed open seats | dark | PASS |  |  |
| 3 Swap | dark | PASS | role="alertdialog" · eyebrow="Swap seats" · bg="rgb(57, 57, 57)" · width=480 · firstFocused=true · hits=["button.cds-btn.cds-btn--secondary", "button.cds-btn.cds-btn--primary"] · markerHit="div.cds-modal-overlay" · cancel={"how": "Cancel", "closed": true, "restored": null} · items=2 · hygiene={"indicator": "Draft — no changes", "undoDisabled": true, "successNotices": 0} · primary={"text": "Confirm swap", "bg": "rgb(184, 92, 46)", "color": "rgb(255, 255, 255)"} | `03-swap-dark.png` |
| 4 Move | dark | PASS | hits=["button.cds-btn.cds-btn--secondary", "button.cds-btn.cds-btn--primary"] · markerHit="div.cds-modal-overlay" · hygiene={"indicator": "Draft — no changes", "undoDisabled": true, "successNotices": 0} | `04-move-dark.png`, `04-move-swap-arm-dark.png` |
| 5 Move-conflict — initial focus on the section — R-5, recorded | dark | PASS | role="alertdialog" · eyebrow="Move employee" · bg="rgb(57, 57, 57)" · width=480 · firstFocused=false · hits=["button.cds-btn.cds-btn--secondary", "button.cds-btn.cds-btn--primary"] · markerHit="div.cds-modal-overlay" · cancel={"how": "Cancel", "closed": true, "restored": null} · initialFocus="section[alertdialog]:Move…" · hygiene={"indicator": "Draft — no changes", "undoDisabled": true, "successNotices": 0} · primary={"text": "Move them", "bg": "rgb(184, 92, 46)", "color": "rgb(255, 255, 255)"} | `05-move-conflict-dark.png` |
| 6 Inspector guard | dark | PASS | role="dialog" · eyebrow="Seat C01 · Center Desks" · bg="rgb(57, 57, 57)" · width=480 · firstFocused=true · hits=["button.cds-btn.cds-btn--secondary", "button.cds-btn.cds-btn--secondary", "button.cds-btn.cds-btn--primary"] · markerHit="div.cds-modal-overlay" · widths=[120, 120, 240] · esc={"how": "Escape", "closed": true, "restored": null} · keep={"how": "Keep editing", "closed": true, "restored": null} · discard={"how": "Discard", "closed": true, "restored": null} · postsDuring=0 · shownAfter="Seat C03" · hygiene={"indicator": "Draft — no changes", "undoDisabled": true, "successNotices": 0} · primary={"text": "Save changes", "bg": "rgb(184, 92, 46)", "color": "rgb(255, 255, 255)"} | `06-inspector-guard-dark.png` |
| 7 Discard draft — N/A — the production draft has no change ("Draft — no changes"); nothing is created to make the dialog appear | dark | PASS | indicator="Draft — no changes" |  |
| frame dark hygiene | dark | PASS |  |  |
| indicator + Undo before/after, writes — 2 × the move-conflict's Assign employee submit (the server's refusal as data; nothing changed) | both | PASS |  |  |
