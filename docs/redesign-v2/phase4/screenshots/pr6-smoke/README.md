# Phase 4 · PR 6 — the reviewer's smoke (2026-09-08)

The reviewer's own hand-off: six steps no rig reaches, run after the Dependabot merge (`next` 16.3.3 → **16.3.4**,
`@supabase/supabase-js` 2.112.3 → **2.115.0**) on a freshly installed lockfile. Rig: `../../audit/pr6-smoke.mjs`.
Branch state and the run recipe: `../../plans/phase4-pr6-handoff.md`; the plan of record is
`../../plans/phase4-pr6-closeout.md`.

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
| `05-below-900` · `05b` · `05c` | 4 | At **820×900** on `/admin`, a seat selected **from the palette**: the slot overlays from the right of the canvas column and the achieved scroll is the 0.5 anchor, not the retired 0.28 sheet anchor (`05`). The reviewer's two other claims at this width each became their own record, because neither holds: whether the band is unobstructed under an open slot (`05b`) and whether the viewer's own 900 palette rule spans as its code intends (`05c`) — both **pre-existing**, see Findings |
| `06-publish` + `06b-brand` | — | The regression sweep: one **real** publish on the local stack (the flow that must never break), then the brand checklist from the `brand-system` skill in both themes |

## Results

**13 / 17 records pass.** The four failures are two findings, each recorded in both themes — both **pre-existing**,
neither in this PR's diff (see "Findings" below). Console: 124 errors, of which 122 are the local Speed Insights 404
every run has and **2 are step 02's own aborted actions** (`TypeError: Failed to fetch` — the transport failure it
forces on purpose).

| Step | Theme | Result |
|---|---|---|
| `01-refusal` | light · dark | **PASS** — the danger zone reads "Couldn't deactivate Alex Shabazian. **This employee is still on the published map at CW01. Remove them from draft and publish before deleting.**" with "Open CW01 on the map" → `/admin?seat=CW01` (hit-tested to the `<a>`); the directory row survives, `employees.active` stays `true`, the draft seat keeps its holder, no new console error. The guard's sentence carries the seat label, so the action **returned** it |
| `02-transport-not-refusal` | light · dark | **PASS** — with the action's POST aborted, the same zone reads "Couldn't deactivate Alex Shabazian. **Could not deactivate employee.**" — the generic arm, no "published map" sentence, nothing deactivated. F-2 holds against 2.115.0 |
| `03-help-link` | light · dark | **PASS** — the popover's "How Ask Planner works" (hit-tested) opens `#shell-panel-help`; focus lands on `h2#shell-panel-help-title` ("Help"); Esc closes it; `#ask-planner-drawer` is still open and `#ask-planner-question` still holds the typed text |
| `04-raster` | light · dark | **PASS** — `/` and `/admin` read `none` (light) / `invert(0.93) hue-rotate(180deg) saturate(0.45) contrast(0.95)` (dark); the drawer open with no highlight does not dim. The **live** dim was measured on a real Ask Planner answer in both themes (1 highlighted seat): `saturate(0.8)` light, `…saturate(0.36)…` dark. Dark vs the committed `../pr6/runtime/*-dark-1920.png` over the raster's own box: max 16×16 block delta **1.93** (`/`) and **2.61** (`/admin`) of 255, mean 0.04 — unchanged |
| `05-below-900` | light · dark | **PASS** — 820×900, zoomed 3 steps so the viewport can travel (maxTop 230 · maxLeft 1370): the slot is 400 wide flush to the canvas column's right edge (x 420, column 0–820), the palette row hit-tests to a `<button>`, the inspector opens on C01, and the achieved scroll is **202 / 560 = the 0.5 ideal exactly**, with the marker centre (410, 526) **on** the viewport centre (410, 526). The retired 0.28 sheet anchor would have scrolled to 230 |
| `05b-band-under-slot` | light · dark | **FAIL — finding 1** (below) |
| `05c-viewer-palette-900` | light · dark | **FAIL — finding 2** (below) |
| `06-publish` | light | **PASS** — one real publish: "Publish 1 change" → the review reads "Draft 60 seats · Published 60 seats · Total changes 1" → after confirming, `publish_events` 0 → **1**, published `N03` is `employee_id: null · status: available` (the draft change), and the toolbar no longer offers a publish |
| `06b-brand` | light · dark | **PASS** — primary `rgb(184, 92, 46)`, hover `rgb(143, 69, 33)`, focus ring `solid 2px rgb(184, 92, 46) -2px`, links `rgb(143, 69, 33)` light / `rgb(232, 160, 122)` dark, current-section bar carries the terracotta |

Repo-side checks run beside the rig (all as the plan expects): `mapIcons` **0** · `grep -c panel tailwind.config.ts` **0** ·
`grep -rnE '\bpanel:[a-z][a-z0-9-]*' app components --include=*.tsx` **0** (the loose `panel:` grep returns 6 — row 3's
`(panel: ShellPanelId)` annotations) · `SEAT_CENTER_PANEL_BREAKPOINT_PX` **0** · `components/ui/Button.tsx` **gone** ·
`0f62fe` only in the vendored `carbon-tokens.css` (17 hits) · `sp-components.css` and `carbon-components.css`
**byte-identical** to the Phase 3 copies · the bridge's only `--cds-*` are `--cds-font-sans` / `--cds-font-mono`.

## Findings — both pre-existing, for the owner to rule

Neither is in this PR's diff (`git diff main...HEAD` touches neither `sp-components.css` nor `ViewerFindPalette.tsx`
nor `RightSlot.tsx`), and neither blocks the close-out. They are recorded here because the smoke is what found them.

**1. The right slot covers the status band's right end** (`05b`). `.sp-slot-host` is
`position: absolute; top: 0; right: 0; bottom: 0` and its containing block is the **map stage**
(`div.relative.flex.min-w-0.flex-col`, rect 0,96 1920×984) — which holds the map viewport **and** the band. So the
open slot spans the band's row over its right 400px. Hit-testing the band's own "Zoom in" button at its centre
(1896, 1060) returns `div.sp-slot-body` with the slot open and the button itself with it closed; the same at 820×900.
The canvas column's `lg:pr-[var(--sp-slot-w)]` pushes the column's content, but the band is the column's **sibling**
inside the stage, so it keeps full width and runs under the slot. `RightSlot.tsx`'s header says "the control row above
and the status band below never reflow, and the slot never covers the band" — the first half holds, the second does
not. Visible in the committed `../pr3b/admin-slot-inspector-light-1920.png`: where the closed state shows
"60 seats − Fit +", the open state shows blank panel. `tests/browser/seat-map.spec.ts` asserts the DOM relationship
(host inside the column, band its sibling below), which is true and does not constrain the painted boxes.
**Effect:** while any right-slot surface is open (inspector, mode card, Ask Planner), the band's seat count and its
−/Fit/+ zoom controls are neither visible nor clickable at the owner's 1920×1080 target.

**2. The below-900 palette sheet never spans** (`05c`). `computeFrame` returns `width: null` below 900 and the element
takes `right-3`, meaning to stretch from left 12 to the viewport's right inset — but `.sp-palette { width:
var(--sp-palette-w) }` (560, Phase 3 sheet) sets a width, and an element with `left` + `right` + `width` uses
`left + width`. Measured: 880 → x 12, **w 560**, right 572 (the sheet class IS applied); 1200 → x 240, w 560 (the
anchored branch, correct); **390 → w 560, right 572, 182px off-screen**, clipped (the row's trailing cell — the seat
code / count / Floor tag — unreachable). The 900 rule itself is intact; row 4 retired only `ViewerSeatFinder`'s own
constant, as ruled. Against `ViewerFindPalette.tsx`:46–49, which documents the sheet as full-width so phone users
keep zone browsing (owner answer 3).

## Captures

30 PNGs. `01-refusal-*` / `02-transport-*` (the two arms, both themes) · `03-help-open-*` and
`03-help-closed-drawer-intact-*` · `04-raster-{home,admin}-*`, `04-raster-admin-ask-open-*`, `04-raster-live-dim-*` ·
`05-slot-820-*`, `05-viewer-palette-1200-*` · `05b-band-{at820,at1920}-slot-open-*` · `05c-viewer-palette-390-*` ·
`06-publish-review` / `06-publish-done` · `06b-brand-*`.

## Provenance

Local Docker Supabase stack (`npm run db:start`; `npx supabase db reset` + `npm run db:seed` before the run — the
reset is what applies `20260908120000_deactivate_employee_sqlstate.sql`, confirmed by `MLS03` in `pg_proc`). Node 24,
`npm install` against the bumped lockfile before anything ran (`@supabase/supabase-js` 2.115.0, `next` 16.3.4 in
`node_modules`). Real Google Chrome (`channel: "chrome"`), 1920×1080 (step 05 at 820×900), captures after
`document.fonts.ready` + 400 ms; theme by `sp-theme` in `localStorage` + reload. Signed in as the seeded local admin
`e2e-admin@example.test`. `.env.local` was never edited — the local stack's URL + anon key were passed inline to
`next build` and `next start -p 3200`.

**State the run leaves behind:** step 06 publishes for real, so the local stack ends with the published layer advanced
by one vacated seat. Reset and reseed before the next rig.
