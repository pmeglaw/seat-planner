# Phase 4 · PR 5 pre-merge smoke — owner-ordered, eighteen steps (2026-09-06/07)

**What these show.** The owner's step list for PR 5 (Reception + the route surfaces) driven end to end in real
Chrome: the 1584 frame with the sticky readout; the search at rest (48, magnifier, placeholder, autofocus, the
platform hint, the 2px inset terracotta ring); the count and the cursor while typing; the lock with `?q=` written
through `replaceState` and the history length unchanged; the two Esc rungs (owner ruling Q-1) with the zero state
keeping the locked person and no hint; a pointer never stealing focus from the field (row, fallback row-button,
recents row, the clear ×); ⌘ K from a readout button; the clear ×; the no-extension readout with its 40px ghost
fallback rows; recents newest-first outside the live region and gone on reload; Show on map → the D1-d landing and
browser back; the three `?q=` landings; the keyboard path and the landmarks with axe at rest and locked; the 1280 and
1024 frames with Back to the list; the three theme states with the brand scan; the `/admin` 403 and the 404 cards;
the `/login` + `/my-seat` byte-compare against a same-day `main` baseline; the console and the three greps.
`results.json` carries step · theme · pass/fail · computed values · captures; the table is below.

**Result: 37/38 records pass in the final full run** (light 16/16 · dark 16/16 · system 4/4 · both 1/2); the one
FAIL is step 17's IN-RUN byte-compare, which flakes on two animated surfaces (below) — the same compare run
**standalone passes 5/5** (`step17-rerun/results.json`, twice: before and after the final run). Three product
fixes came out of the smoke (PHASE4BUILD §1.44 / §1.46): the readout hint states the current key; Reception's URL
writer passes `history.state` through and the landing reads the live `?q=` on a cache-restored tree; the map's D1-d
landing treats a person plus their own seat row as one match (`lib/viewerSeatSearch` `uniqueLandingResult`, both
landings). e2e-auth re-ran **53/53** after the last product change.

**Source.** Branch `feat/phase4-reception` at the smoke's final build (the three fixes in), `npm run build` with the
**local Docker Supabase stack's** env exported (`NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` from `supabase status` —
the same hermetic effect as re-pointing `.env.local`, which was never edited), served by `next start -p 3200`. The
rig runs `supabase db reset` + the seed before each theme pass, so every step starts from the seed. Reception is
read-only: the seeded **viewer** `e2e-viewer@example.test` drives every Reception step, the `/admin` 403 and the
404; the seeded admin `e2e-admin@example.test` signs in only for the runtime audit's admin routes inside step 17 (the
`/login` captures are that signed-in state, as in every prior PR's evidence). **No production data and no
production write**: every name, seat and extension is `supabase/seed.sql` sample data; nothing is mutated.

**Method.** `audit/pr5-smoke.mjs`: Playwright `chromium.launch({ channel: "chrome" })` (real Chrome), viewport
1920×1080 (1920×420 for the sticky proof; 1280×800 / 1024×768 for the frames), device scale 1; theme by `sp-theme`
in localStorage + reload, the system state by clearing it and emulating the OS scheme dark; computed values read
with `getComputedStyle` on the live elements inside `main` (never the loading skeleton's twin), hit tests by
`document.activeElement` and `mouse.down` / `mouse.up`; axe (`@axe-core/playwright`, WCAG 2 A/AA + 2.1 A/AA) at rest
and locked; failed responses recorded by status + path (console "Failed to load resource" lines carry no URL). Step
17 spawns the branch's `runtime-audit.mjs` and byte-compares (`cmp`) its `/login` ×3 and `/my-seat` ×2 against the
same rig's output for a `main` build (worktree, `npm ci`, Next 16.3.3) served on :3201, captured ALONE on the same
seed day.

**Step 17, the two animated surfaces.** The `main` baseline from 2026-09-06 differed from a 2026-09-07 recheck by
55 pixels in a 6×10 box at the login footer — the seed's "Published · Sep 6" digit — so the baseline was re-captured
on the 7th (alone: a concurrent smoke pass's `db reset` kills sessions mid-audit and the rig captured the login
page for `/my-seat`). Against that baseline the standalone compare is **5/5 IDENTICAL**; the in-run compare inside
the final smoke read `login-light-1920` DIFFERS (255 px, max channel Δ 2, all inside the plan thumbnail's "me" dot —
anti-aliasing) and `viewer-my-seat-dark-1920` DIFFERS (6,368 px, Δ ≤ 52, inside the sheet — `SeatSheet`'s CSS draw
choreography runs ~1.9 s and the audit captures at 800 ms). No code under `app/login/**`, `components/auth/**`,
`app/my-seat/**` or `SeatSheet.tsx` changed on the branch (`git diff main`).

## Step × theme table (final run; `results.json`)

| Step | Theme | Result | Computed values (from `results.json`) | Captures |
|---|---|---|---|---|
| 1 Frame | light | PASS | h1Font=28px/36px · headerBtns=0 · listWidth=1008 · readoutWidth=480 · gap=32 · readoutTopAfterScroll=64 · stickyPos=sticky · attrs=["light", "white"] | `01-frame-light.png`, `01-frame-sticky-light.png` |
| 2 Search at rest | light | PASS | height=48 · kbd=⌘ K · clear=0 · ring=solid 2px rgb(184, 92, 46) -2px · focus={"tag": "input", "id": "reception-main", "label": "Search the directory", "isField": true} | `02-search-rest-light.png` |
| 3 Count and typing | light | PASS | rest=12 people · typed=2 matches · cursors=1 · cursorBar=rgb(184, 92, 46) 3px 0px 0px 0px inset, rgb(224, 224, 224) 0px -1px 0px 0px inset · activedesc=reception-option-00000000-0000-0000-0000-000000000006 · preview=Daniel Garcia · hint=↵to lock · lastName=David Kim · firstName=Daniel Garcia | `03-typing-light.png` |
| 4 Lock | light | PASS | name=Daniel Garcia · lockedBar=rgb(184, 92, 46) 3px 0px 0px 0px inset, rgb(224, 224, 224) 0px -1px 0px 0px inset · url=/reception?q=Daniel+Garcia · historyBefore=4 · historyAfter=4 · hint=Escto unlock · mapHref=/?q=Daniel+Garcia · mapColor=rgb(143, 69, 33) · attrs=["light", "white"] | `04-locked-light.png` |
| 5 Esc both rungs | light | PASS | zeroCount=0 matches · emptyH3=No one matches “zz” · clearGhost=Clear search · hintsZero=0 · afterEsc1={"value": "", "locked": 1, "name": "Daniel Garcia", "hint": "Escto unlock", "url": "/reception?q=Daniel+Garcia"} · afterEsc2={"locked": 0, "waiting": true, "url": "/reception", "hints": 0} · afterEnter={"locked": 0, "url": "/reception", "value": ""} | `05-zero-locked-light.png`, `05-unlocked-light.png` |
| 6 Focus never leaves the field | light | PASS | rowOk=True · rowLocked=True · fbOk=True · fbLocked=True · recentOk=True · recentLocked=True · clearOk=True · cleared=True | `06-pointer-light.png` |
| 7 Cmd K | light | PASS | tabbed={"tag": "button", "id": "", "label": "Clear search", "isField": false} · after={"isField": true, "selStart": 0, "selEnd": 3, "value": "Kim"} | `07-cmd-k-light.png` |
| 8 Clear × | light | PASS | shown=1 · value= · gone=0 · lockedBefore=Alex Shabazian · lockedAfter=Alex Shabazian | `08-clear-x-light.png` |
| 9 No extension | light | PASS | noneText=No extension on file · noneFont=14px/20px · tileHasDash=False · fbHeading=If no answer — same department · fbCount=1 · fbHeights=[40] · fbExts=["201"] · lockedAfter=Alex Shabazian · numeral=201 | `09-no-extension-light.png` |
| 10 Recents | light | PASS | names=["David Kim", "Maria Lopez", "Alex Shabazian"] · outsideLive=True · liveInReadout=1 · afterReload=0 | `10-recents-light.png` |
| 11 Show on map | light | PASS | mapUrl=/?q=Alex+Shabazian · fieldValue=Alex Shabazian · pressed=1 · pressedName=CW01 Alex Shabazian. Assigned seat. Search result. Highlighted search result. Selected. · inspector=1 · backUrl=/reception?q=Alex+Shabazian · backLocked=1 | `11-show-on-map-light.png` |
| 12 q landing | light | PASS | unique={"locked": 1, "name": "Alex Shabazian", "url": "/reception?q=Alex+Shabazian"} · several={"cursor": 1, "cursorName": "Rachel Nguyen", "locked": 0, "value": "Records", "count": "2 matches"} · zero={"count": "0 matches", "value": "zzzz", "empty": "No one matches “zzzz”", "waiting": true} | `12-landing-201-light.png`, `12-landing-records-light.png`, `12-landing-zero-light.png` |
| 13 Keyboard path and landmarks | light | PASS | skip={"tag": "a", "id": "", "label": "Skip to content", "isField": false} · landed={"tag": "input", "id": "reception-main", "label": "Search the directory", "isField": true} · order=["Alex Shabazian201", "Show on map", "Maria Lopez202", "try{var t=localStorage.getItem('sp-theme", "Skip to content"] · listboxStops=0 · landmarks={"search": 1, "main": 1, "complementary": ["Recent lookups"]} · axeRest=[] · axeLocked=[] | `13-keyboard-light.png` |
| 14 Widths | light | PASS | w1280={"columns": 2, "readout": 480, "noScroll": true} · w1024={"columns": 1, "position": "static", "below": true, "backDisplay": "flex", "backAtTop": true, "backFirst": "Back to the list", "noScroll": true} · focusAfterBack={"tag": "input", "id": "reception-main", "label": "Search the directory", "isField": true} · fieldInView=True | `14-1280-light.png`, `14-1024-readout-light.png`, `14-1024-back-light.png` |
| 15 Themes | light | PASS | attrs=["light", "white"] · bar=rgb(184, 92, 46) 3px 0px 0px 0px inset, rgb(224, 224, 224) 0px -1px 0px 0px inset · link=rgb(143, 69, 33) · blues=[] · mainBg=rgb(255, 255, 255) | `15-theme-light.png` |
| 16 Route cards | light | PASS | cardBg=rgb(255, 255, 255) · raster=0 · h2=Admin access required · tertiaryText=Back to seat map · tertiaryColor=rgb(184, 92, 46) · after403=/ · status=404 · nfH2=This page does not exist · nfActionText=Back to the seat map · after404=/ · missingAnchors=[] | `16-admin-403-light.png`, `16-not-found-light.png` |
| 1 Frame | dark | PASS | h1Font=28px/36px · headerBtns=0 · listWidth=1008 · readoutWidth=480 · gap=32 · readoutTopAfterScroll=64 · stickyPos=sticky · attrs=["dark", "g100"] | `01-frame-dark.png`, `01-frame-sticky-dark.png` |
| 2 Search at rest | dark | PASS | height=48 · kbd=⌘ K · clear=0 · ring=solid 2px rgb(184, 92, 46) -2px · focus={"tag": "input", "id": "reception-main", "label": "Search the directory", "isField": true} | `02-search-rest-dark.png` |
| 3 Count and typing | dark | PASS | rest=12 people · typed=2 matches · cursors=1 · cursorBar=rgb(184, 92, 46) 3px 0px 0px 0px inset, rgb(57, 57, 57) 0px -1px 0px 0px inset · activedesc=reception-option-00000000-0000-0000-0000-000000000006 · preview=Daniel Garcia · hint=↵to lock · lastName=David Kim · firstName=Daniel Garcia | `03-typing-dark.png` |
| 4 Lock | dark | PASS | name=Daniel Garcia · lockedBar=rgb(184, 92, 46) 3px 0px 0px 0px inset, rgb(57, 57, 57) 0px -1px 0px 0px inset · url=/reception?q=Daniel+Garcia · historyBefore=4 · historyAfter=4 · hint=Escto unlock · mapHref=/?q=Daniel+Garcia · mapColor=rgb(232, 160, 122) · attrs=["dark", "g100"] | `04-locked-dark.png` |
| 5 Esc both rungs | dark | PASS | zeroCount=0 matches · emptyH3=No one matches “zz” · clearGhost=Clear search · hintsZero=0 · afterEsc1={"value": "", "locked": 1, "name": "Daniel Garcia", "hint": "Escto unlock", "url": "/reception?q=Daniel+Garcia"} · afterEsc2={"locked": 0, "waiting": true, "url": "/reception", "hints": 0} · afterEnter={"locked": 0, "url": "/reception", "value": ""} | `05-zero-locked-dark.png`, `05-unlocked-dark.png` |
| 6 Focus never leaves the field | dark | PASS | rowOk=True · rowLocked=True · fbOk=True · fbLocked=True · recentOk=True · recentLocked=True · clearOk=True · cleared=True | `06-pointer-dark.png` |
| 7 Cmd K | dark | PASS | tabbed={"tag": "button", "id": "", "label": "Clear search", "isField": false} · after={"isField": true, "selStart": 0, "selEnd": 3, "value": "Kim"} | `07-cmd-k-dark.png` |
| 8 Clear × | dark | PASS | shown=1 · value= · gone=0 · lockedBefore=Alex Shabazian · lockedAfter=Alex Shabazian | `08-clear-x-dark.png` |
| 9 No extension | dark | PASS | noneText=No extension on file · noneFont=14px/20px · tileHasDash=False · fbHeading=If no answer — same department · fbCount=1 · fbHeights=[40] · fbExts=["201"] · lockedAfter=Alex Shabazian · numeral=201 | `09-no-extension-dark.png` |
| 10 Recents | dark | PASS | names=["David Kim", "Maria Lopez", "Alex Shabazian"] · outsideLive=True · liveInReadout=1 · afterReload=0 | `10-recents-dark.png` |
| 11 Show on map | dark | PASS | mapUrl=/?q=Alex+Shabazian · fieldValue=Alex Shabazian · pressed=1 · pressedName=CW01 Alex Shabazian. Assigned seat. Search result. Highlighted search result. Selected. · inspector=1 · backUrl=/reception?q=Alex+Shabazian · backLocked=1 | `11-show-on-map-dark.png` |
| 12 q landing | dark | PASS | unique={"locked": 1, "name": "Alex Shabazian", "url": "/reception?q=Alex+Shabazian"} · several={"cursor": 1, "cursorName": "Rachel Nguyen", "locked": 0, "value": "Records", "count": "2 matches"} · zero={"count": "0 matches", "value": "zzzz", "empty": "No one matches “zzzz”", "waiting": true} | `12-landing-201-dark.png`, `12-landing-records-dark.png`, `12-landing-zero-dark.png` |
| 13 Keyboard path and landmarks | dark | PASS | skip={"tag": "a", "id": "", "label": "Skip to content", "isField": false} · landed={"tag": "input", "id": "reception-main", "label": "Search the directory", "isField": true} · order=["Alex Shabazian201", "Show on map", "Maria Lopez202", "try{var t=localStorage.getItem('sp-theme", "Skip to content"] · listboxStops=0 · landmarks={"search": 1, "main": 1, "complementary": ["Recent lookups"]} · axeRest=[] · axeLocked=[] | `13-keyboard-dark.png` |
| 14 Widths | dark | PASS | w1280={"columns": 2, "readout": 480, "noScroll": true} · w1024={"columns": 1, "position": "static", "below": true, "backDisplay": "flex", "backAtTop": true, "backFirst": "Back to the list", "noScroll": true} · focusAfterBack={"tag": "input", "id": "reception-main", "label": "Search the directory", "isField": true} · fieldInView=True | `14-1280-dark.png`, `14-1024-readout-dark.png`, `14-1024-back-dark.png` |
| 15 Themes | dark | PASS | attrs=["dark", "g100"] · bar=rgb(184, 92, 46) 3px 0px 0px 0px inset, rgb(57, 57, 57) 0px -1px 0px 0px inset · link=rgb(232, 160, 122) · blues=[] · mainBg=rgb(22, 22, 22) | `15-theme-dark.png` |
| 16 Route cards | dark | PASS | cardBg=rgb(57, 57, 57) · raster=0 · h2=Admin access required · tertiaryText=Back to seat map · tertiaryColor=rgb(255, 255, 255) · after403=/ · status=404 · nfH2=This page does not exist · nfActionText=Back to the seat map · after404=/ · missingAnchors=[] | `16-admin-403-dark.png`, `16-not-found-dark.png` |
| 1 Frame | system | PASS | h1Font=28px/36px · headerBtns=0 · listWidth=1008 · readoutWidth=480 · gap=32 · readoutTopAfterScroll=64 · stickyPos=sticky · attrs=[null, null] | `01-frame-system.png`, `01-frame-sticky-system.png` |
| 4 Lock | system | PASS | name=Daniel Garcia · lockedBar=rgb(184, 92, 46) 3px 0px 0px 0px inset, rgb(57, 57, 57) 0px -1px 0px 0px inset · url=/reception?q=Daniel+Garcia · historyBefore=4 · historyAfter=4 · hint=Escto unlock · mapHref=/?q=Daniel+Garcia · mapColor=rgb(232, 160, 122) · attrs=[null, null] | `04-locked-system.png` |
| 9 No extension | system | PASS | noneText=No extension on file · noneFont=14px/20px · tileHasDash=False · fbHeading=If no answer — same department · fbCount=1 · fbHeights=[40] · fbExts=["201"] · lockedAfter=Alex Shabazian · numeral=201 | `09-no-extension-system.png` |
| 15 Themes | system | PASS | attrs=[null, null] · bar=rgb(184, 92, 46) 3px 0px 0px 0px inset, rgb(57, 57, 57) 0px -1px 0px 0px inset · link=rgb(232, 160, 122) · blues=[] · mainBg=rgb(22, 22, 22) | `15-theme-system.png` |
| 17 Unchanged surfaces | both | FAIL | login-light-1920.png=DIFFERS · login-dark-1920.png=IDENTICAL · login-light-1024.png=IDENTICAL · viewer-my-seat-light-1920.png=IDENTICAL · viewer-my-seat-dark-1920.png=DIFFERS | `runtime-recheck/login-light-1920.png`, `runtime-recheck/login-dark-1920.png`, `runtime-recheck/login-light-1024.png`, `runtime-recheck/viewer-my-seat-light-1920.png`, `runtime-recheck/viewer-my-seat-dark-1920.png` |
| 18 Hygiene | both | PASS | failedResponsesTotal=68 · speedInsights404s=66 · otherFailedResponses=[] · otherConsole=[] · blueFiles=app/styles/carbon-tokens.css · shadowSp= · closeIcon= |  |

## Findings

1. **Fixed — the readout hint** (`05-zero-locked-*` now shows no hint): followed the lock, not the key (§1.44).
2. **Fixed — `?q=` and the D1-d landing** (`11-show-on-map-*`): `replaceState(null, …)` wiped the router's history
   entry; the cache-restored tree on back lost the lock; the map listed the person AND their seat, so no auto-select.
   Reception passes `history.state` through and reads the live `?q=`; `uniqueLandingResult` in both landings (§1.46).
3. **Rig — stale server** (first run 5/38): `pkill -f "next start"` misses `next-server`; the old server served the
   new `.next` (chunks 404, no hydration). Freed by listener PID; the runner does that now.
4. **Rig — blockified `inline-flex`** (step 14): a flex item's computed display is `flex`; asserted shown + 40px.
5. **Environment** — the repo's `node_modules` has Next 16.3.1, the lockfile 16.3.3 (the baseline worktree built on
   16.3.3); captures still compare byte-identical.

Unchanged observations: the route cards on white keep the PR 4 reading (card edge invisible, the tertiary's outline
is the shape); the seed's unseated people read "Floor 2" tags (the interim floor rule, deviation 10).
