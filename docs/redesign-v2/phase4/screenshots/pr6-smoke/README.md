# Phase 4 · PR 6 — the reviewer's smoke (2026-09-08)

The reviewer's own hand-off: six steps no rig reaches, run after the Dependabot merge (`next` 16.3.3 → **16.3.4**,
`@supabase/supabase-js` 2.112.3 → **2.115.0**) on a freshly installed lockfile, then re-run on the head that carries
the **F-8 fix** (sheet amendment G). Rig: `../../audit/pr6-smoke.mjs`. Branch state and the run recipe:
`../../plans/phase4-pr6-handoff.md`; the plan of record is `../../plans/phase4-pr6-closeout.md`.

Every capture is sample data from `supabase/seed.sql` on the local Docker stack — no production name, no production
write. Every geometric claim is a hit-test (`document.elementFromPoint`), never a visibility check.

## Why these six

The Docker evidence recorded in `../pr6/README.md` was taken **before** the bump. It does not carry across it: row 2's
refusal rides on the `@supabase/supabase-js` error object exposing the guard's SQLSTATE as `.code`
(`lib/actionRefusals.ts`), and a client that changed that shape would turn every refusal into a thrown error — or, in
the other direction, every transport failure back into a refusal (finding F-2). So the four rigs were re-run whole on
the merged head, and these six steps cover the surfaces the rigs never touch.

| Step | Row | What it proves |
|---|---|---|
| `01-refusal` | 2 | Deactivating a seeded person who holds a **published** seat: the panel's danger zone shows the guard's own written reason (`…still on the published map at <seat>.`) with the seat link, the directory row survives, `employees.active` is still true. The reason text **is** the proof the action returned rather than threw — a thrown error is digest-stripped in a production build and could never carry the seat label |
| `02-transport-not-refusal` | 2 | The negative arm, the point of F-2: with the server action's POST aborted as a transport failure, the danger zone must **not** render a refusal — it shows the generic `Could not deactivate employee.` arm, and nothing is deactivated |
| `03-help-link` | 3 | `/admin` → Ask Planner → the explainability popover → "How Ask Planner works": the shell's Help panel opens, focus lands on the panel's own heading (`ShellPanels`' rule), Esc closes it, and the drawer is still open with its typed state intact |
| `04-raster` | 9 | Dark `/` and `/admin`: the raster's computed filter is the chain now in `globals.css`, and the capture is block-compared against `../pr6/runtime/{home,admin}-dark-1920.png`. The light dim rule is read on the same element — the two `.map-raster*` rules live together now and must not fight |
| `05-below-900` | 4 | At **820×900** on `/admin`, zoomed so the viewport can travel, a seat selected **from the palette**: the slot overlays from the right of the canvas column and the achieved scroll is the 0.5 anchor, **not** the retired 0.28 sheet anchor |
| `05b-band-slot-push` | — | **The F-8 fix under assertion** (sheet amendment G): with the slot open the band takes the slot's push, so its zoom control hit-tests to itself and its right edge clears the slot — 1920×1080 and 820×900, open and closed, both themes |
| `05c-…-carried` | 4 | The viewer's own 900 palette rule. It does **not** span as its code intends; the owner ruled that **carried** (F-9), so the step pins the carried measurement — a change here means the carried finding moved |
| `06-publish` + `06b-brand` | — | The regression sweep: one **real** publish on the local stack (the flow that must never break), then the brand checklist from the `brand-system` skill in both themes |

## Results

**17 / 17 records pass** on the fixed head. Console: 124 errors, of which 122 are the local Speed Insights 404 every
run has and **2 are step 02's own aborted actions** (`TypeError: Failed to fetch` — the transport failure it forces on
purpose).

| Step | Theme | Result |
|---|---|---|
| `01-refusal` | light · dark | **PASS** — the danger zone reads "Couldn't deactivate Alex Shabazian. **This employee is still on the published map at CW01. Remove them from draft and publish before deleting.**" with "Open CW01 on the map" → `/admin?seat=CW01` (hit-tested to the `<a>`); the directory row survives, `employees.active` stays `true`, the draft seat keeps its holder, no new console error |
| `02-transport-not-refusal` | light · dark | **PASS** — with the action's POST aborted, the same zone reads "Couldn't deactivate Alex Shabazian. **Could not deactivate employee.**" — the generic arm, no "published map" sentence, nothing deactivated. F-2 holds against 2.115.0 |
| `03-help-link` | light · dark | **PASS** — the popover's "How Ask Planner works" (hit-tested) opens `#shell-panel-help`; focus lands on `h2#shell-panel-help-title` ("Help"); Esc closes it; `#ask-planner-drawer` is still open and `#ask-planner-question` still holds the typed text |
| `04-raster` | light · dark | **PASS** — `/` and `/admin` read `none` (light) / `invert(0.93) hue-rotate(180deg) saturate(0.45) contrast(0.95)` (dark); the drawer open with no highlight does not dim. The **live** dim was measured on a real Ask Planner answer in both themes: `saturate(0.8)` light, `…saturate(0.36)…` dark. Dark vs the committed `../pr6/runtime/*-dark-1920.png` over the raster's own box: max 16×16 block delta **1.93** (`/`) and **2.61** (`/admin`) of 255, mean 0.04 — unchanged |
| `05-below-900` | light · dark | **PASS** — 820×900, zoomed 3 steps so the viewport can travel (maxTop 230 · maxLeft 1370): the slot is 400 wide flush to the canvas column's right edge, the palette row hit-tests to a `<button>`, the inspector opens on C01, and the achieved scroll is **202 / 560 = the 0.5 ideal exactly**, with the marker centre (410, 526) **on** the viewport centre. The retired 0.28 sheet anchor would have scrolled to 230 |
| `05b-band-slot-push` | light · dark | **PASS** — see the F-8 table below |
| `05c-viewer-palette-900-carried` | light · dark | **PASS as carried** — 880 → 560 wide at x 12 (the below-900 branch fires, `.sp-palette`'s width wins), 1200 → 560 anchored at x 240, 390 → **182px clipped**. F-9, ruled carried |
| `06-publish` | light | **PASS** — one real publish: "Publish 1 change" → the review reads "Draft 60 seats · Published 60 seats · Total changes 1" → after confirming, `publish_events` 0 → **1**, published `N03` is `employee_id: null · status: available`, and the toolbar no longer offers a publish |
| `06b-brand` | light · dark | **PASS** — primary `rgb(184, 92, 46)`, hover `rgb(143, 69, 33)`, focus ring `solid 2px rgb(184, 92, 46) -2px`, links `rgb(143, 69, 33)` light / `rgb(232, 160, 122)` dark, current-section bar carries the terracotta |

Repo-side checks run beside the rig: `mapIcons` **0** · `grep -c panel tailwind.config.ts` **0** ·
`grep -rnE '\bpanel:[a-z][a-z0-9-]*' app components --include=*.tsx` **0** (the loose `panel:` grep returns 6 — row 3's
`(panel: ShellPanelId)` annotations) · `SEAT_CENTER_PANEL_BREAKPOINT_PX` **0** · `components/ui/Button.tsx` **gone** ·
`0f62fe` only in the vendored `carbon-tokens.css` (17 hits) · `sp-components.css` and `carbon-components.css`
**byte-identical** to the Phase 3 copies (amendment G landed in both) · the bridge's only `--cds-*` are
`--cds-font-sans` / `--cds-font-mono`.

## F-8 — fixed in this PR (owner ruling 2026-09-08)

`.sp-slot-host` is `position: absolute; top / right / bottom: 0` against the map **stage**, which holds the band as
well as the map viewport, so an open slot painted over the band's right 400px. PHASE2UX §1M.2 had already ruled the
opposite — "the band spans the canvas, not the slot" — so this is a **conformance defect, not a deviation**. Built as
**sheet amendment G**, byte-identical in both sheet copies:
`.sp-band[data-slot-open] { padding-right: calc(var(--sp-slot-w) + var(--sp-space-03)) }`, with `MapStatusBand` taking
a `slotOpen` prop that `SeatMap` feeds from the same `slotOwner` state the canvas column's `pr-[var(--sp-slot-w)]`
push already uses. No token change. Recorded in PHASE3DS §1.21 (cross-referenced from §1.17) and PHASE4BUILD §1.48.

| | before the fix | after (step `05b`) |
|---|---|---|
| 1920×1080, slot **closed** | Zoom-in centre (1896, 1060), hit = the button; band padding-right 8px | unchanged |
| 1920×1080, slot **open** | Zoom-in centre (1896, 1060) → hit `div.sp-slot-body` (`inBand: false`) — unreachable | centre **(1496, 1060)**, hit **`inBand: true · inSlot: false`**, padding-right **408px**, right edge **8px clear** of the slot at x 1520 |
| 820×900, slot **open** | Zoom-in → `div.sp-slot-body` | centre **(396, 880)**, hit in the band, **8px clear** of the slot |

Why it was worth fixing inside the close-out: at 1920 the result count clipped mid-word and the zoom − / Fit / +
group was unreachable — and D2-b keeps **Reset zoom** only on that control, so the loss landed exactly while a seat
was being edited. Guards added with the fix: this step, the e2e-auth `page-frames` "Map band under an open slot"
block (1920×1080 and 820×900, hit-tested, plus the clearance measurement), and the real-browser tier's
`data-slot-open` assertions (that harness ships no CSS, so it pins the key, not the paint).

## F-9 — carried, not fixed (owner ruling 2026-09-08)

`computeFrame` returns `width: null` below 900 and the element takes `right-3`, meaning to stretch from left 12 to the
viewport's right inset — but `.sp-palette { width: var(--sp-palette-w) }` (560, Phase 3 sheet) sets a width, and an
element with `left` + `right` + `width` uses `left + width`. Measured: **880 → 560 wide**, right 572 (the sheet class
IS applied); 1200 → 560 anchored (the ≥ 900 branch, correct); **390 → 182px off-screen**, clipped, the row's trailing
cell unreachable. The 900 rule itself is intact; row 4 retired only `ViewerSeatFinder`'s own constant, as ruled.
Phone-width only and off the 1920 hardware target, so it is **carried** in DECISIONS §7 beside the 400 % zoom reflow.
Step `05c` pins that carried measurement rather than the intent: if it starts failing, the finding moved.

## Captures

34 PNGs. `01-refusal-*` / `02-transport-*` (the two arms, both themes) · `03-help-open-*` and
`03-help-closed-drawer-intact-*` · `04-raster-{home,admin}-*`, `04-raster-admin-ask-open-*`, `04-raster-live-dim-*` ·
`05-slot-820-*`, `05-viewer-palette-1200-*` · `05b-band-{at820,at1920}-slot-{closed,open}-*` (the F-8 evidence, all
four states × both themes) · `05c-viewer-palette-390-*` · `06-publish-review` / `06-publish-done` · `06b-brand-*`.

## Provenance

Local Docker Supabase stack (`npm run db:start`; `npx supabase db reset` + `npm run db:seed` before the run — the
reset is what applies `20260908120000_deactivate_employee_sqlstate.sql`, confirmed by `MLS03` in `pg_proc`). Node 24,
`npm install` against the bumped lockfile before anything ran (`@supabase/supabase-js` 2.115.0, `next` 16.3.4 in
`node_modules`). Real Google Chrome (`channel: "chrome"`), 1920×1080 (steps 05 / 05b also at 820×900), captures after
`document.fonts.ready` + 400 ms; theme by `sp-theme` in `localStorage` + reload. Signed in as the seeded local admin
`e2e-admin@example.test`. `.env.local` was never edited — the local stack's URL + anon key were passed inline to
`next build` and `next start -p 3200`.

**State the run leaves behind:** step 06 publishes for real, so the local stack ends with the published layer advanced
by one vacated seat. Reset and reseed before the next rig.
