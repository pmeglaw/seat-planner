# Phase 4 · PR 5 read-only preview walk (2026-09-07)

**What these show.** The Vercel branch preview of PR 5 (#522) walked end to end without a single write: Reception at
rest, typing, locked, the two Esc rungs (the zero state keeping the person, no hint), the `?q=201` landing, Show on
map → the viewer's D1-d landing and browser back, `/admin`, a 404 URL, the 1024 fold with Back to the list — at
1920×1080 light and dark and at 1280×800 light. `results.json` carries step · frame · pass/fail · computed values ·
captures, plus every server-action POST the browser sent (4, all with the empty argument list `[]` — the shell's
status read per route load) and the header indicator before and after (identical). **29/29.**

**Preview.** https://seat-planner-git-feat-phase4-ec704a-patrick-s-projects-c7baae0c.vercel.app — Vercel
deployment `dpl_HaDH3dsHFCVqYsgEqTh1KidZqEbb` (`seat-planner-pmis4g9cw-patrick-s-projects-c7baae0c.vercel.app`),
READY at commit **`68e8b03`** (branch `feat/phase4-reception`; the PR head `d595210` and the docs commits after it
change no code). The preview sits behind Vercel Authentication; the rig entered through a 23-hour `_vercel_share`
link minted with the Vercel MCP (expires 2026-09-08 16:37, bound to this deployment). **Read-only, zero writes:**
the preview reads the PRODUCTION database; Reception is read-only by construction and the walk never presses Save /
Publish / Discard / Restore / Import / Delete; the map is only landed on.

**Account.** The repo's e2e fixture account `seat-planner-e2e@megeredchianlaw.com`, whose password the owner reset
for this walk and passed out of band (a rig argument, never written). The owner flipped its `profiles.role` to
**admin** for the sign-in, so step 8 records the admin map on `/admin` rather than the 403 card; the 403 card is
proven on the local stack (smoke step 16, e2e-auth `accessibility.spec.ts`) and its no-session sibling — the 404 —
here. The live directory has **no person without an extension** (step 5 skipped) and **201 is not a unique match**
(step 6: the query is kept, no lock — the landing's several-match branch; the unique-match branch is proven by
step 7's `?q=<name>` landing on the map and on the local stack).

**People-data mask.** The repo is public and the preview shows the live directory, so the rig injects one stylesheet
before every capture: the rows' name / meta / extension cells, the readout's name, role, numeral, fallback rows and
recents, the zero-state heading, the map's search field, palette, pills, seat markers, the inspector and the header
name render as a soft smudge (`-webkit-text-fill-color: transparent` + `text-shadow`). Text fill only — seat codes,
counts, the Floor tag, the hints, headings and every measured colour and geometry are the real thing. `results.json`
never records a name (only whether a person with / without an extension existed and the extension's digit count).

**Method.** `../../audit/pr5-preview-walk.mjs`: Playwright `chromium.launch({ channel: "chrome" })` (real Chrome),
viewport 1920×1080 / 1280×800 / 1024×768, device scale 1; theme by `sp-theme` in localStorage + reload; computed
values with `getComputedStyle` on the live elements inside `main`; hit tests by `document.activeElement`;
`history.length` read before and after a lock; failed responses recorded by status + path.

## Step × frame table (`results.json`)

| Step | Frame | Result | Computed values | Captures |
|---|---|---|---|---|
| 1 Reception at rest | light | PASS | theme=white · headerBtns=0 · listWidth=1008 · readoutWidth=480 · gap=32 · ring=solid 2px rgb(184, 92, 46) -2px · kbd=⌘ K · count=98 people · blues=[] · noScroll=True | `01-rest-light.png` |
| 2 Typing | light | PASS | count=1 match · cursors=1 · bar=rgb(184, 92, 46) 3px 0px 0px 0px inset, rgb(224, 224, 224) 0px -1px 0px 0px inset · activedescMatches=True · hint=↵to lock | `02-typing-light.png` |
| 3 Lock | light | PASS | locked=1 · bar=rgb(184, 92, 46) 3px 0px 0px 0px inset, rgb(224, 224, 224) 0px -1px 0px 0px inset · urlHasQ=True · historyBefore=5 · historyAfter=5 · hint=Escto unlock · mapColor=rgb(143, 69, 33) · mapHrefHasQ=True · numeralDigits=3 | `03-locked-light.png` |
| 4 Esc rungs | light | PASS | zero={"count": "0 matches", "empty": 1, "readoutKeepsPerson": true, "hints": 0} · rung1={"value": "", "locked": 1, "urlHasQ": true, "hints": 1} · rung2={"locked": 0, "waiting": true, "url": "/reception"} | `04-zero-light.png`, `04-unlocked-light.png` |
| 5 No extension — skipped: none in the directory | light | PASS |  |  |
| 6 ?q=201 landing — 201 is not a unique match in the live directory — query kept | light | PASS | locked=0 · urlRewritten=False · count=0 matches | `06-landing-201-light.png` |
| 7 Show on map | light | PASS | fieldFilled=True · pressed=1 · inspector=1 · palette=0 · backUrlHasQ=True · backLocked=1 | `07-show-on-map-light.png` |
| 8 /admin — the admin map: this account holds the admin role in production — the 403 card is verified on the local stack (smoke step 16, e2e-auth) | light | PASS | is403=False · isMap=True · raster=1 | `08-admin-light.png` |
| 9 404 | light | PASS | status=404 · h2=This page does not exist · bg=rgb(255, 255, 255) · action=/ · theme=white | `09-not-found-light.png` |
| 10 1024 fold | light | PASS | columns=1 · position=static · backHeight=40 · focusAfterBack={"tag": "input", "id": "reception-main", "label": "Search the directory"} | `10-1024-readout-light.png` |
| frame light hygiene | light | PASS | newActionPosts=2 · consoleErrors=12 |  |
| 1 Reception at rest | dark | PASS | theme=g100 · headerBtns=0 · listWidth=1008 · readoutWidth=480 · gap=32 · ring=solid 2px rgb(184, 92, 46) -2px · kbd=⌘ K · count=98 people · blues=[] · noScroll=True | `01-rest-dark.png` |
| 2 Typing | dark | PASS | count=1 match · cursors=1 · bar=rgb(184, 92, 46) 3px 0px 0px 0px inset, rgb(57, 57, 57) 0px -1px 0px 0px inset · activedescMatches=True · hint=↵to lock | `02-typing-dark.png` |
| 3 Lock | dark | PASS | locked=1 · bar=rgb(184, 92, 46) 3px 0px 0px 0px inset, rgb(57, 57, 57) 0px -1px 0px 0px inset · urlHasQ=True · historyBefore=11 · historyAfter=11 · hint=Escto unlock · mapColor=rgb(232, 160, 122) · mapHrefHasQ=True · numeralDigits=3 | `03-locked-dark.png` |
| 4 Esc rungs | dark | PASS | zero={"count": "0 matches", "empty": 1, "readoutKeepsPerson": true, "hints": 0} · rung1={"value": "", "locked": 1, "urlHasQ": true, "hints": 1} · rung2={"locked": 0, "waiting": true, "url": "/reception"} | `04-zero-dark.png`, `04-unlocked-dark.png` |
| 5 No extension — skipped: none in the directory | dark | PASS |  |  |
| 6 ?q=201 landing — 201 is not a unique match in the live directory — query kept | dark | PASS | locked=0 · urlRewritten=False · count=0 matches | `06-landing-201-dark.png` |
| 7 Show on map | dark | PASS | fieldFilled=True · pressed=1 · inspector=1 · palette=0 · backUrlHasQ=True · backLocked=1 | `07-show-on-map-dark.png` |
| 8 /admin — the admin map: this account holds the admin role in production — the 403 card is verified on the local stack (smoke step 16, e2e-auth) | dark | PASS | is403=False · isMap=True · raster=1 | `08-admin-dark.png` |
| 9 404 | dark | PASS | status=404 · h2=This page does not exist · bg=rgb(57, 57, 57) · action=/ · theme=g100 | `09-not-found-dark.png` |
| frame dark hygiene | dark | PASS | newActionPosts=2 · consoleErrors=10 |  |
| 1 Reception at rest | 1280-light | PASS | theme=white · headerBtns=0 · listWidth=704 · readoutWidth=480 · gap=32 · ring=solid 2px rgb(184, 92, 46) -2px · kbd=⌘ K · count=98 people · blues=[] · noScroll=True | `01-rest-1280-light.png` |
| 2 Typing | 1280-light | PASS | count=1 match · cursors=1 · bar=rgb(184, 92, 46) 3px 0px 0px 0px inset, rgb(224, 224, 224) 0px -1px 0px 0px inset · activedescMatches=True · hint=↵to lock | `02-typing-1280-light.png` |
| 3 Lock | 1280-light | PASS | locked=1 · bar=rgb(184, 92, 46) 3px 0px 0px 0px inset, rgb(224, 224, 224) 0px -1px 0px 0px inset · urlHasQ=True · historyBefore=16 · historyAfter=16 · hint=Escto unlock · mapColor=rgb(143, 69, 33) · mapHrefHasQ=True · numeralDigits=3 | `03-locked-1280-light.png` |
| 4 Esc rungs | 1280-light | PASS | zero={"count": "0 matches", "empty": 1, "readoutKeepsPerson": true, "hints": 0} · rung1={"value": "", "locked": 1, "urlHasQ": true, "hints": 1} · rung2={"locked": 0, "waiting": true, "url": "/reception"} | `04-zero-1280-light.png`, `04-unlocked-1280-light.png` |
| 5 No extension — skipped: none in the directory | 1280-light | PASS |  |  |
| 6 ?q=201 landing — 201 is not a unique match in the live directory — query kept | 1280-light | PASS | locked=0 · urlRewritten=False · count=0 matches | `06-landing-201-1280-light.png` |
| frame 1280-light hygiene | 1280-light | PASS | newActionPosts=0 · consoleErrors=4 |  |
| indicator before/after + writes | both | PASS | indicatorAtStart=Published · Aug 31, 2026 · indicatorAtEnd=Published · Aug 31, 2026 · actionPosts=4 · nonEmptyActionBodies=0 · otherFailedResponses=[] · peopleCount=98 |  |

Action POSTs: 4 all bodies `[]`: True

## Findings

- None against the record. The computed values match the smoke's: theme attrs `white` / `g100`; the row bar and the
  focus ring `rgb(184, 92, 46)`; links `rgb(143, 69, 33)` light / `rgb(232, 160, 122)` dark; zero IBM blue on any
  element; `history.length` unchanged across a lock; the 404 card white / `rgb(57, 57, 57)` with the terracotta /
  white tertiary.
- Rig-side, fixed during the walk: the zero-state check read `aria-selected` on the (empty) filtered list instead of
  the readout; the 1024 step assumed `?q=201` locks (it does not on the live directory) — it clears the kept query
  and locks a person with an extension instead; the first mask missed the map's search field — the run was
  discarded and re-captured with the wider mask.
