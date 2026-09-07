# Phase 4 · PR 5b pre-merge smoke — the seven confirm dialogs on the asset modal (2026-09-07)

Owner-ordered smoke (reviewer hand-off 2026-09-07), driven by `../../audit/pr5b-smoke.mjs` on the local Docker stack in
real Chrome at 1920×1080 — the full run in **light, then dark**. Every geometric claim is a hit-test
(`document.elementFromPoint`), never a visibility check; colours, outlines and gaps are computed values. Branch
`feat/phase4-map-dialogs` at the R-4 head (eyebrows on all seven).

## Results — 22 / 22 records pass (11 steps × 2 themes)

| Step | Light | Dark | What was measured |
|---|---|---|---|
| 01 Vacate | PASS | PASS | `alertdialog`, `aria-labelledby` + `aria-describedby` resolve inside, eyebrow **Vacate seat**, heading "Vacate CW01?"; focus on Cancel with the computed outline `solid 2px, offset -2px, rgb(184, 92, 46)`; hit-tests: Cancel's centre → Cancel, Vacate seat's centre → that button, the inspector's Edit assignment / Vacate and a canvas marker → `div.cds-modal-overlay`; Tab → Vacate seat, Tab → Cancel (trap); Esc → closed, focus back on the inspector's `Vacate CW01` |
| 01b Vacate mid-flight | PASS | PASS | a 2.5 s delayed server-action route: Cancel disabled, primary "Vacating…" `aria-busy="true"`, Esc ignored (dialog still open), a pointer on the overlay changes nothing (open; focus unchanged); resolves → closed, the marker reads "Open seat. Draft changed." (◇), the row `available` / no employee; Undo via the row's Undo re-assigns. **Finding (recorded, not failed):** mid-flight focus sits on `<body>` — Chrome drops focus from the clicked primary when it disables; Tab re-anchors through the trap. Pre-existing (the old `Button` disabled while loading too) |
| 01c Vacate error | PASS | PASS | an aborted route: `.cds-notification--error` inside the body, "Vacate did not complete. Could not vacate seat.", focus in it, Retry vacate enabled; Cancel closes with the row unchanged |
| 02 Delete seat | PASS | PASS | R99 inserted through REST; eyebrow **Delete seat**, danger primary; the gap between the two body paragraphs **8px** (`margin-top: 8px`, amendment F); Cancel → focus on the inspector's `Delete custom seat R99`; reopen → Delete seat for real → marker gone, row gone |
| 03 Swap | PASS | PASS | the mode card owns the slot (hit at its title → `.sp-mode-card-title`); eyebrow **Swap seats**; the Source / Target list and the ↔ summary; overlay mousedown keeps the dialog open and focus inside; after Cancel: the mode card is still armed, focus on `<body>` (recorded, not asserted — the opener was a synthetic marker click, which does not focus the marker) |
| 04 Move | PASS | PASS | open target → "Move Alex Shabazian to CW02?" (eyebrow **Move employee**, plain primary Move them) → Cancel; assigned target → "Swap Alex Shabazian and Maria Lopez?" (Swap them) → Cancel. Cross-floor `.cds-tag`: **N/A — the seed has no other-floor seat** |
| 05 Move-conflict | PASS | PASS | the combobox picks Maria Lopez (seated at N03) → Assign employee → "Move Maria Lopez to CW02?" (eyebrow **Move employee**). Initial focus: **the section** (R-5 — recorded, not failed); Tab → Cancel; Esc closes. Reopen → Move them for real → CW02 = Maria, N03 freed; Undo restores |
| 06 Inspector guard | PASS | PASS | dirty the note → another marker → `role="dialog"`, eyebrow **Seat CW01 · Center West**, footer **120 / 120 / 240**, focus on Keep editing (the same 2px inset terracotta outline); Esc → the note still there. Reopen → Discard → the inspector shows CW02, **0 server-action POSTs**. Dirty again → the header's Management link (the shell veto) → the guard → Save changes → the note saved (REST) and the vetoed navigation continued to `/admin/management` |
| 07 Discard draft | PASS | PASS | with the saved note as the one change: `alertdialog`, eyebrow **Discard draft changes**, danger "Discard everything", focus on Keep draft changes; Esc → closed. Reopen → Discard everything for real → indicator **"Draft — no changes"**, Publish disabled with `aria-describedby` → "No changes to publish" beside it (hit → `span.sp-control-reason`), the note gone |
| 08 Stacking | PASS | PASS | Vacate open, a marker under the overlay hovered: its `.sp-tooltip` stays `display: none`; the hit at the marker, at the slot's eyebrow and at the control row's search field → `div.cds-modal-overlay` |
| 09 Brand line | PASS | PASS | every primary this theme: `rgb(184, 92, 46)` on Swap / Move / move-conflict / guard, `rgb(218, 30, 40)` on Vacate / Delete / Discard, labels `rgb(255, 255, 255)`; `grep -rli 0f62fe app components lib` → `app/styles/carbon-tokens.css` only |

Dark: modal bg `rgb(57, 57, 57)` on every dialog; every step repeated with the same outcome. Failed responses: 42 × the
Vercel Speed Insights script 404 under a local `next start`, nothing else. Console: 86 Speed Insights lines + 2 × "Failed
to fetch" — the rig's own aborted route in 01c (one per theme).

## Rig-side fixes (three, first run → final)

1. A delayed `route.continue()` must land before the route is removed — Playwright auto-continues unrouted requests and a
   late continue throws "Route is already handled"; the held promises are awaited before `unroute`.
2. The row's Undo is located inside the `Map controls` toolbar: after a mutation a canvas notice also offers an Undo
   action, and the bare role query hit two buttons.
3. Step 01b's mid-flight pointer claim reads "the pointer changes nothing" (open + focus unchanged) rather than "focus is
   inside": the clicked primary has already dropped focus to `<body>` when it disabled — the finding above.

No product change was needed by the smoke.

## Provenance

Local Docker Supabase stack, reset + reseeded before the run (`npx supabase db reset` + `npm run db:seed`); the build
served on :3200 with the local URL + anon key passed inline (`.env.local` never edited). Signed in as the seeded local admin
`e2e-admin@example.test`; every name and seat is `supabase/seed.sql` sample data. **No production data and no production
write** — the rig refuses a non-local Supabase URL. Real local mutations, all undone by the run: one delayed vacate
(undone through the row), R99 inserted through REST and deleted through the confirm, one force-move (undone through the
row), one saved note (erased by Discard everything). Captures: real Chrome (`channel: "chrome"`), 1920×1080, after
`document.fonts.ready` + 400 ms; theme by `sp-theme` in localStorage + reload. `results.json` carries every computed value.
