# Shell redesign v2 — decision document

**Branch:** `redesign-v2` (from `main` @ 8f925db) · **Date:** 2026-08-31 · **Status:** for owner review, nothing built

Method: decisions derived from the `ibm-design-language` skill (design-system v1.3.0) plus the shipped
code and measured production data. Every ruling below traces to a named rule in that skill or to a
measured number in §2/§3 — not to precedent.

**Frame (owner, 2026-08-31):** the app adapts at **every viewport, 320px and up**, while **1920×1080
remains the width the design is optimized for**. Design and measure at the hardware every user
actually has; adapt downward from it.

---

## 1. Scope and exclusions

**In scope:** four screens — map (`/`), admin (`/admin`), reception (`/reception`), login (`/login`)
— plus the shell configuration that spans them.

**Deliberately excluded, per your instruction:**

- The published mockup and the decisions behind it. Not read.
- The audit arc through PR-5 (`docs/design-system/AUDIT*.md`, `PLAN.md`, and the prior ruling
  documents beside them). Not read.
- `docs/design-system/shell-reference.html`. **This file exists on exactly one branch — `docs/redesign`
  — the same branch as the excluded mockup work.** You ruled it out rather than have me cross that
  boundary, and on 2026-08-31 you closed the question rather than reopening it: **the skill-derived
  direction is the target** (Q1, resolved). So the exclusion is permanent, not provisional. Nothing in
  this document is checked against that reference and nothing will be; every visual ruling here traces
  to the `ibm-design-language` skill, the shipped code, or a measured number. The practical
  consequence for the build: the visual starting point is Carbon v12 as the skill describes it plus
  the shipped `--sp-*` token vocabulary, with no external comp to reconcile against.

`/admin/management`, `/admin/settings` and `/my-seat` get no entry of their own; they inherit the
shell decision (D0).

**Sources actually read:** the skill's `SKILL.md`, `references/ui-shell.md`, `references/senior-workflow.md`,
`references/composition.md`, `references/status-and-dataviz.md`, `references/tokens.md`; the shipped
source for all four surfaces and the shell components; and read-only production queries, re-run in
full on 2026-08-31 after the owner's assignment pass (§3).

---

## 2. The frame — 1920 primary, adaptive to 320

> **Amended 2026-09-02 (D0-e):** "adaptive to 320" is a *floor* — nothing breaks at any width — not a
> mandate to design and test every screen at five breakpoints. Design and test at 1920 with one deliberate
> narrow fallback. The measurements below stand; the per-breakpoint design obligations they implied do not.

### 2.1 The breakpoint contract

The Carbon 2x Grid ladder is taken as given (`tokens.md`), with one addition at the top where the
published grid ends:

| Breakpoint | Width | Columns | Margin | Gutter | Role here |
|---|---|---|---|---|---|
| sm | 320px | 4 | 0 | 32px | Reflow floor; phone |
| md | 672px | 8 | 16px | 32px | Tablet portrait |
| lg | 1056px | 16 | 16px | 32px | **The hinge — every layout switches here** |
| xlg | 1312px | 16 | 16px | 32px | Small desktop |
| max | 1584px | 16 | 24px | 32px | End of the published grid |
| — | **1920px** | 16, fluid | 24px | 32px | **Primary target — ruled in D0** |

**`lg` (1056px) is the one hinge.** Every screen below changes layout at exactly that width and
nowhere else. `ui-shell.md` argues this as performance, not aesthetics: inconsistency between screens
costs re-orientation ("transitional volatility"), and users experience an inconsistent product as
slower even when it isn't. One shared hinge is cheaper to learn than four bespoke ones.

**One measured exception, recorded in §3.2: the *label* layer has no hinge.** Marker pitch falls from
50.9px at 1920 to 18.7px at 640, and the name layer fails at the **primary target** rather than at any
breakpoint. That is a density budget carried at every width, not a second layout switch — `lg` remains
the one layout hinge *of this design*.

**But the shipped app already hinges at 640, and the pitch does not fall monotonically** (§2.4,
driven 2026-09-01). Below a 640px media query `ViewerSeatFinder` stops fitting the plan and pans a
1040px canvas, so pitch **recovers** to 30.5px at 320 rather than continuing down to the 9.4px this
paragraph used to claim. Three of the app's boundaries — 640 (fit/band/names toggle), 900
(`VIEWER_PANEL_BREAKPOINT_PX`), 1024 (`lg` in Tailwind) — sit at none of the Carbon widths tabled
above, and 1056 is not among them. Adopting `lg` as the single hinge is therefore a **move**, not a
description: it means relocating three existing boundaries, and the build has to budget for that.

**320 is an obligation, not a nicety — and the app does not currently meet it.** WCAG 1.4.10 Reflow
has to hold at 320px-equivalent, which a user at 400% browser zoom on their own 1920 monitor produces
exactly. Measured at 320: the header's content is **472px wide in a 320px viewport**, and the shell
wrapper carries `overflow-x: clip`, so the surplus cannot be scrolled to. **Admin, the theme toggle
and the account avatar are all off-edge**, and focusing the avatar by keyboard succeeds while leaving
it out of view (`document.activeElement` is set; `scrollX` stays 0) — a focus that lands on something
the user cannot see, which is SC 2.4.11 as well as 1.4.10. The map's own two-dimensional pan is a
different matter and is likely exempt (1.4.10 excepts content that requires a two-dimensional layout,
and names maps as the example); the **chrome** has no such exemption. Fixing this is D0's job.

### 2.2 Above the grid: the 1920 primary target

A 1920 viewport is **336px past `max`**. That gap is ruled in D0 rather than drifted into.
(`tokens.md` does mention 1920×1080, but only as a *video artboard* with a 7.5px mini unit — that is
not the UI grid and is not applied here.)

### 2.3 The height budget at the primary target

**Measured 2026-09-01, not estimated** (Playwright driving the real installed Chrome, maximized on
the owner's 1920×1080 display). An earlier version of this section estimated 92–126px of browser
chrome and budgeted against ≈950px. Both numbers were wrong, and the conclusion drawn from them was
wrong in a more interesting way.

| | Measured |
|---|---|
| Screen | 1920 × 1080 |
| Windows taskbar | 48px |
| Chrome's own chrome (tab strip + address bar) | **143px** — the estimate said 92–126 |
| **Viewport** | **1920 × 889** — the estimate said ≈950 |
| A bookmarks bar, if shown, costs a further | ~34px |

**The plan never reaches its 1911px display cap at this viewport — height binds first.** That is the
correction the old table missed: the plan is aspect-locked at 2.204:1, so when height is the
constraint it renders *narrower*, and the whole plan stays visible. It does not overflow, and there is
nothing to scroll.

Predicted from that viewport, assuming only a 48px header, the plan would render 1854 × 841. **The
running app was then driven at exactly 1920 × 889 and measured** (2026-09-01, Playwright + the seeded
viewer account). It is more conservative than the arithmetic, and the arithmetic was never the point:

| | Predicted | **Measured in the running app** |
|---|---|---|
| Header | 48px (assumed) | **36px** — the viewer renders its own, not the shell's |
| Plan renders at | 1854 × 841 | **1734 × 787**, top 49, bottom 836 |
| Below the fold | none | **none** — `scrollHeight === clientHeight`, nothing clipped |
| Min axis gap between markers | 54.5px | **50.9px** |
| Status strip | hypothetical | **already ships** — bottom 862–878 |

**Reading — Q2 was dissolved twice over.** A persistent bottom strip and a wholly-visible floor plan
do not conflict, and the argument never needed making: the strip *already exists* (it reads "Assigned
58 · Open 10 · Reserved 0"), the plan already fits above it, and nothing is below the fold. The old
"misses by about 5px" was an artefact of assuming the plan renders at its 1911px cap. It never does
here — the app fits it to the space it has, exactly as an aspect-locked canvas should.

**The one thing the measurement contradicts is a claim of ours, not the app's.** §2.4 says the 44px
touch floor is *met* at 1920. That is true of the **geometry** — the measured 50.9px gap has room for
it — but the shipped marker's hit area is **32 × 32**, so the app does not currently take that room.
That is an implementation gap to close in the build, not a constraint to design around, and it is the
kind of thing only running the app reveals.

### 2.4 Where the plan stops fitting — and where the hinge actually is

**Driven, not computed** (2026-09-01, Playwright against the running app, seeded viewer account,
viewport height held at the measured 889px so width is the only variable). Every rung the arithmetic
described, it described to within a pixel. One rung it described did not exist.

| Viewport width | Plan rendered | Min axis gap | <44px apart | <24px apart | Chrome above the plan |
|---|---|---|---|---|---|
| 1920 | 1734 × 787 | 50.9px | 0 of 68 | 0 of 68 | 49px |
| 1584 (max) | 1582 × 718 | 46.5px | 0 of 68 | 0 of 68 | 84px |
| 1312 (xlg) | 1310 × 594 | 38.5px | 32 of 68 | 0 of 68 | 145px |
| **1056 (lg)** | 1054 × 478 | 31.0px | 50 of 68 | 0 of 68 | 203px |
| 1024 | 1022 × 464 | 30.0px | 51 of 68 | 0 of 68 | 211px |
| 672 (md) | 670 × 304 | 19.7px | 60 of 68 | **41 of 68** | 291px |
| **640** | 638 × 290 | **18.7px** | 60 of 68 | **48 of 68** | **298px** |
| **639** | **1040 × 472, pans 401px** | **30.5px** | 51 of 68 | **0 of 68** | 227px |
| 320 (sm) | **1040 × 472, pans 720px** | **30.5px** | 51 of 68 | **0 of 68** | 227px |

**The arithmetic was right at every rung from 640 up** — 719/717.7, 595/594.3, 479/478.2, 305/304,
and the pitches match to the decimal. **It was wrong at 320, and wrong about a behaviour rather than a
number.** `ViewerSeatFinder` stops fitting the plan below a 640px media query and hands the map to a
**pannable 1040px canvas** instead (`updateFitMapWidth` returns `null`; the scroller reports 720px of
horizontal travel at 320). There is no 145px strip. There never was one — the row modelled a product
the app does not ship.

**So the shipped hinge is 640, not `lg`, and it is the app's own.** Five things flip between 640 and
639, all at once: fit-to-width becomes a pan canvas, the status band disappears, the **occupant-names
toggle disappears entirely**, the min axis gap jumps 18.7 → 30.5px, and markers closer than 24px go
from **48 of 68 to none**.

**`md` is the worst rung in the product, and `sm` is better than `md`.** Conformance against WCAG
2.5.8 fails only in the 640–1023 fit-to-width band and *recovers* below it. The 24px count is 0 at
`lg` and above, **41 of 68 at `md`, 48 of 68 at 640 — and 0 again at 639 and below**. The document's
claim that a tappable layer is "geometrically impossible at `md` and below at any marker size" is
half right: impossible in one band of the ladder (640–1023), and comfortably possible underneath it.

**And the chrome above the plan grows faster than the plan shrinks.** 49px at 1920, 145px at `xlg`,
203px at `lg`, 298px at 640 — where **the chrome standing above the map is taller than the map**
(290px). The floor selector, the "Office map · 68 seats" chip and the "Updated" chip wrap into three
stacked rows and push the plan into the lower half of the screen, with dead mat above and below it.

**Touch targets: met at 1920 and `max`, deviated below — recorded in §6.** An earlier draft of this
section argued that markers are "pointer-scale" below `max` and that the 44px floor belongs to the
header's controls. Both were wrong, and the correction changes the reasoning rather than the boundary.

`SKILL.md` states it flat, under Non-negotiables and with no viewport or input qualifier:
**"Touch targets 44px. A 16px icon gets padding to reach it; the icon does not grow."** It is a
**hit-area** rule, not a drawn-size rule — the skill ships `.cds-touch-target`, an out-of-flow 44×44
overlay centred on a mark of any size, and `--cds-touch-target-min` sits in the unconditional `:root`
block of a token file that is otherwise breakpoint-aware. So "the marker is small" is not an argument
the system accepts; a small mark inside a padded 44px target is its stated shape of compliance. Nor
can the header own the rule: `ui-shell.md` puts header utilities at **48×48**, which is stricter than
44 and therefore cannot relocate the floor away from anything else.

**The binding number is pitch, not marker size.** Two square 44px hit regions overlap only when they
are within 44px on *both* axes, so the governing distance is the larger of `dx` and `dy`:

| Viewport | Governing axis gap | 44px hit regions that overlap |
|---|---|---|
| 1920 | **50.9px measured** | **none** |
| 1584 (max) | 46.5px | **none** |
| 1312 (xlg) | 38.5px | 22 pairs across 32 markers |
| 1056 (lg) | 31.0px | 44 pairs across 50 markers |
| 672 (md) | 19.7px | 116 pairs across 60 markers |
| 640 | 18.7px | 118 pairs across 60 markers |
| 639 and below | 30.5px | 45 pairs across 51 markers |

Every row is now measured off the running app rather than computed. **The app ships a 32 × 32 hit
area at every rung** — verified at all nine widths — so the two rows that have the room for a 44px
target do not currently take it.

At every width the tightest pair is essentially axis-aligned (`NE02`/`NE03`, `dx=56 dy=1` at 1920), so
the square-target and circular-target results are identical and **we meet the floor at 1920 and at
`max` outright** — by giving each marker a hit region larger than its drawn mark, which is the skill's
own mechanism. At `xlg` and below, 44px regions necessarily overlap their neighbours: the floor is
geometrically unreachable rather than merely inconvenient, and the deviation is deliberate.
Compensating paths there are the roving-tabindex keyboard traversal, search, and the inspector — none
of which help a touch user, which is exactly why it is recorded as a deviation and not explained away.
**Would change if** the plan gains pitch — a re-render, fewer desks, or a zoom layer — such that the
governing gap clears 44px at `xlg`.

---

## 3. Measured data (production, read-only)

**Re-measured 2026-09-01**, after the owner's second assignment pass and publish (`publish_events`
row 44, 01:23 UTC). The 2026-08-31 morning snapshot is kept in the right-hand column so the movement
is visible. **These are the numbers to build against.**

**Read the whole section knowing this: the plan is the 3rd floor, and the firm occupies two.**
Litigation is on the 2nd (owner, 2026-09-01), and the rule the owner states is absolute —
**everyone without a seat is on the 2nd floor.** That single fact reorganises this section: the
"unseated" are not a backlog, they are a different floor.

| Fact | Now | Snapshot it replaces |
|---|---|---|
| Published seats / draft seats | 68 / 68 — **identical**, nothing unpublished | 68 / 68 |
| Seats assigned | **58** | 15 |
| Seats available | **10** | 53 |
| Seats reserved / unavailable | **0 / 0** | 0 / 0 |
| Active employees | **98** (101 rows, 3 inactive) | 101 |
| People on the 3rd floor (seated) | **58** | 15 |
| People on the **2nd floor** (no seat on this plan) | **40** | 86 |
| `department_options` rows | **27**, of which **12 are retired** (`active = false`) | 14 |
| `zone_options` rows | 8, all 8 in use | 8 |
| `published_employees` drift | **none** — exact match to live | not recorded |
| Custom seats (`is_custom`) | 8 of 68 | not recorded |
| Floors the firm occupies | **2** — 3rd (this plan) and 2nd | recorded as 1 |
| Floors the schema models | **1** — `seats` has no `floor` column | 1 |

The 3rd floor is **85% occupied**. The ten empty desks are scattered across five of the eight zones
(North Pod 4, Center Desks 3, then one each in Northeast Pod, East Pod and Southeast Office); West
Pod, Center West and South Offices are full.

### 3.1 The three consequences, re-decided

1. **Inverted, exactly as predicted.** "The map is mostly empty" is dead. 58 of 68 desks are
   occupied, so the map *is* a dense field of people and a design may treat it as one. What the old
   entry got wrong is where the cost lands: it expected marker legibility to become a problem at the
   `lg` floor. It becomes a problem at **1920** — §3.2.
2. **Not weakened — dissolved. The premise was wrong.** The old entry read 43 unseated people as a
   design problem: *the commonest outcome of "find Sarah" is that Sarah has no seat.* The owner's
   ruling removes the problem rather than shrinking it. **Nobody is unseated. The 40 people without a
   desk on this plan work on the 2nd floor**, and the firm's rule is that the two sets are the same
   set. So the state D1 has to design is not an absence at all — it is a **location**. "Sarah has no
   assigned seat" is a dead end; "Sarah works on the 2nd floor" is an answer, and it is the *right*
   answer for 40 of 98 people. This is a better outcome than any wording the previous framing could
   have reached, and it is the single most valuable thing the re-measure turned up.
3. **Stands unchanged, across two assignment passes now.** `reserved` and `unavailable` still have
   zero rows in both layers. The live status vocabulary is two states, not four (D1). Both passes
   moved rows between `available` and `assigned` only, as the original entry said they would.

### 3.2 Marker density — the measurement this section was waiting for

The old section named this as the one thing that could not be designed until these numbers existed.
Method: the live published coordinates run through the repo's own `lib/mapLayoutTransform.ts`
calibration, then scaled to each viewport at the plan's 1911×867 aspect — **visual** space, not saved
space. Nearest-neighbour distance between markers:

| Viewport | Min pitch | Median | Largest marker keeping a ≥4px gap | Markers under a 44px pitch |
|---|---|---|---|---|
| 1920 (plan capped at 1911) | **56.1px** | 66.2px | **52.1px** | 0 of 68 |
| 1584 (max) | 46.5px | 54.9px | 42.5px | 0 of 68 |
| 1312 (xlg) | 38.5px | 45.5px | 34.5px | 32 of 68 |
| **1056 (lg)** | **31.0px** | 36.6px | **27.0px** | 50 of 68 |
| 672 (md) | 19.7px | 23.3px | 15.7px | 60 of 68 |
| 320 (sm) | 9.4px | 11.1px | 5.4px | 68 of 68 |

**Two rows of this table describe viewports the app does not produce, and §2.4 supersedes them.**
Driven 2026-09-01: the 1920 row assumes the plan reaches its 1911px cap and it does not — the app
fits it to 1734, so the real min pitch there is **50.9px**, not 56.1 (every other rung from 640 up
matches this table to the decimal, so the method is sound and only the 1920 assumption was wrong).
The 320 row is worse than wrong: below 640 the app stops shrinking and pans a 1040px canvas, so the
measured pitch at 320 is **30.5px with 51 of 68 under 44px and none under 24px** — nothing like
9.4px and 68 of 68. **Keep this table for the pod ordering and the median column**, which are
scale-invariant; take the absolute pitches from §2.4.

**A 44px touch target is reachable only at 1920 and `max`.** It survives at `max` by 2.5px and is
impossible from `xlg` down to 640. The tightest pair on the floor is NE02/NE03; Northeast Pod, East
Pod and West Pod set the floor in that order, at every width. So marker size is not a free variable
below the primary target — it is dictated by the pods.

**The name layer is the casualty, and it fails at the primary target.** Taking the shipped resting
geometry from `lib/seatCrowding.ts` (`TEXT_TIER_NAME_OBSTACLE_PX`, 124×40) over the 58 assigned seats:

| Viewport | Name-pill collisions (124×40, 58 markers) | Code-pill collisions (46×24, 68 markers) |
|---|---|---|
| 1920 | **27 pairs — 43 of 58 markers (74%)** | 0 |
| 1584 (max) | 32 pairs — 47 markers | 0 |
| 1312 (xlg) | 41 pairs — 51 markers | 7 pairs — 14 markers |
| 1056 (lg) | 93 pairs — 54 markers (93%) | 14 pairs — 28 markers |

At 1920 the most names that can be drawn simultaneously without any overlap is **39 of 58** (44 with
a shorter 92×34 pill), so a show-everything layer is short by nineteen however it is tuned.

The same geometry on the **old 15-seat data** produced **zero** collisions at 1920, `max` and `xlg`.
The name tier was collision-free on the snapshot and is not on the real floor.

**The existing nudge cannot rescue it — at the shipped pill height.** `PILL_NUDGE_PX` is 14, so ±14px
vertical, 28px of separation at best, against a **40px** pill. Pod-mates share a row, so the overlap
is almost purely horizontal: C01/C02 `dx=100 dy=1`, CW01/CW02 `dx=74 dy=0`, E02/E03 `dx=59 dy=0`.
All 27 collisions at 1920 are beyond its reach.

### 3.2.1 The correction: the blocker is the pill, not the name

The numbers above are true of the **shipped geometry** and were wrongly generalised, in an earlier
version of this section, into a claim about names as such. Two owner observations (2026-09-01) forced
a re-measure and reversed the conclusion. The 124×40 footprint is not what a name needs — it is two
styling decisions stacked:

1. **The pill is a flat 124px wide and the text is nowhere near that.** `SeatMarker.tsx` renders
   `First L.` (owner call 2026-07-24), never the full name, and caps the text at `max-w-[96px]`, so
   nothing ever truncates. Measured in the repo's own vendored IBM Plex Sans at the shipped 12px, the
   58 live labels run **19.4–69.9px of text, mean 45.8** — a fit-width pill would be **45–96px, mean
   72**. The shipped pill wastes **52px on the average marker**; on first-name-only labels, **61px**.
2. **The pill stacks two lines** (`SeatMarker.tsx:662-673`): the seat code above, the name below.
   That is the entire reason it is 40px tall. **The seat code is not what the viewer came for** —
   "where does X sit" is answered by the name; the code serves the admin assigning desks, and belongs
   in the inspector and on hover.

**Height is the hinge, and the threshold is exact.** Two labels of height `H` clear each other under
the nudge once `|dy| + 28 ≥ H`. Pod-mates sit at `dy ≈ 0`, so **`H` must be ≤ 28px**. At 29px the pod
rows come straight back. That single number decides the whole question:

| Pill height | Unresolvable pairs — 1920 / `max` / `xlg` / `lg` |
|---|---|
| **≤ 28px** (single line) | **0 / 0 / 0 / 0** |
| 29px | 3 / 6 / 14 / 26 |
| 40px (shipped, two-line) | 4 / 7 / 15 / 27 |

Re-measured with a single-line, fit-width pill carrying the first name:

| Viewport | Colliding pairs | Markers | Unresolvable | Clean of 58 |
|---|---|---|---|---|
| 1920 | 4 | 8 | **0** | **50** |
| 1584 (max) | 7 | 14 | **0** | 44 |
| 1312 (xlg) | 15 | 26 | **0** | 32 |
| 1056 (lg) | 27 | 43 | **0** | 15 |

**Confirmed against the running app, 2026-09-01.** Names toggled on at 1920 × 889, measuring rendered
rectangles rather than arithmetic: **36 overlapping pairs across 52 of the 68 markers**, and **30 of
those 36 overlap by more than 16px** — genuine overlap, not adjacency (`C01 Tsov P.` over
`C02 Aris M.` by 34 × 39px, most of a pill). With names **off**, zero pairs overlap by more than 4px.
So the problem is real, it is caused by the name layer, and it is **worse than this section's
arithmetic predicted** (27 pairs / 43 markers) because the app renders at 1734 rather than the 1911
cap the arithmetic assumed. The pill-height histogram also confirms the footprint used throughout:
50 name pills at **40px**, 10 code pills at 32px, 8 office plates at 56px.

**Reading: a persistent name-per-marker layer IS available, and the solver that ships can place it.**
The residual collisions are not a defect — they are exactly the work `seatCrowding` exists to do, and
at ≤28px it can do all of it. What was never available is the *shipped* two-line 124px pill on a
filled floor. Deviation 6 and D1 are ruled on that basis.

*Method caveat: the collision counts are centred-rectangle overlaps of resting footprints, and they
model the nudge's maximum reach rather than the solver's actual placement search — so they bound the
problem rather than describe the pixels the app paints. The 28px threshold is the arithmetic of that
bound and should be confirmed against the running app before it is treated as a build constant. Text
widths are measured, not estimated: Playwright + the vendored `ibm-plex-sans-latin-wght-normal.woff2`
at 12px/500.*

**The label layer, driven down the whole ladder (2026-09-01).** The same pass that produced §2.4's
table also read every marker's *painted* footprint — the union of the pill's descendant rectangles,
not the `button` box, which is a bare 32 × 32 anchor the pill overflows at every width. Counting
pairs that overlap by more than 4px on both axes:

| Viewport | Names off | Names on | Painted name pill |
|---|---|---|---|
| 1920 | **0 pairs** | 35 pairs / 51 markers | 125 × 41 |
| 1584 (max) | **0 pairs** | 38 pairs / 54 markers | 125 × 41 |
| 1312 (xlg) | 8 pairs / 14 markers | 36 pairs / 51 markers | 87 × 35–47 |
| 1056 (lg) | **27 pairs / 34 markers** | 56 pairs / 59 markers | 87 × 35–47 |
| 1024 | 32 pairs / 40 markers | 63 pairs / 62 markers | 87 × 35–47 |
| 672 (md) | **114 pairs / 67 of 68 markers** | 181 pairs / 67 markers | 87 × 47–48 |
| 639 and below | 31 pairs / 40 markers | *toggle absent* | — |

**Two things this changes.** First, it **confirms the §3.2.1 ruling at the widths the ruling is
about**: at 1920 and `max` the code-pill layer collides with nothing at all, and every collision is
introduced by the name tier — which is precisely the claim the two-line 124px pill was convicted on.
Second, and new: **below `max` the label layer collides without any names at all.** Eight pairs at
`xlg`, 27 at `lg`, 114 at `md`. The seat-code pills alone are already overlapping by the rung this
document calls "the floor for reading the plan", because the type tier *grows* the label as the pitch
*shrinks*. So a crowding solver is not a name-tier feature to be added later — it is load-bearing for
the shipped surface at every width below 1584, names or no names.

**And at `lg`, with names on, 59 of 68 markers are in an overlapping pair.** §2.4 calls 1056 the floor
for reading the plan; measured, the *plan* is readable there and the *label layer* is not. Those are
different claims and the document had been treating them as one.

**Below 640 the occupant-names toggle does not exist.** It lives in the status band, the band is
gated on the same 640px media query as fit-to-width, and both vanish together — so the feature D1
rests on is unreachable on a phone, silently. That is a gap to close in the build, not a deviation to
record: nothing chose it.

### 3.3 Two facts the old snapshot did not record

4. **The department filter is bimodal, and that is a design problem, not a data problem.**
   `department_options` holds 27 rows, but 12 of them are already retired (`active = false`) — the
   near-duplicates (`CM`, `Exec`, `IT & Admin`, `Records`), the umbrella groupings, and one **zone**
   name that ended up in the department list (`West Pod`). The viewer filters on `active` when it
   reads the table (`app/page.tsx:58`) and renders the result as a `<select>`, not a chip row, so the
   dead options never reach a user. **The option list is clean.** What the live options *do* over the map
   was recorded here as a second defect, and the 2nd-floor ruling **retires half of it**: choosing
   Litigation returns zero desks not because the filter is broken but because Litigation is
   downstairs, and the same goes for Medical Records, Front Office and WIL. Four of the 15 active
   departments are 2nd-floor teams; the map is right to show nothing, and the fault was only ever the
   **silence** — the control must say *"Litigation works on the 2nd floor"*, not return an unchanged
   map. What does survive is the imbalance at the other end: Case Management holds **38 of the 58
   occupied desks (66%)**, so the commonest selection highlights two-thirds of the floor. A control
   whose outcomes are "a whole other floor" or "most of this one" discriminates poorly either way —
   §8, Q5.
5. **The directory is complete and uniform.** Every active employee has a department, a position, an
   extension and an email; **none** has an avatar. Names run to 22 characters, mean 13.5; the longest
   department name in use is 17. Seat labels are at most 4 characters. One seat carries a note.

Also, and sharper than this section previously recorded: the floor control **already reads
"Floor 3 · Pre-Litigation"** in the running app. It is not a placeholder fronting an absent dimension
— it *asserts a floor number*, correctly, while the schema has no `floor` column to back it and no
way to represent the 2nd floor where 40 of the firm's 98 people work. The control is right and the
data underneath it is missing, which is the reverse of what this document assumed (§8, Q3).

**Update 2026-09-01 (multi-floor PR-1/PR-2).** The column exists: `seats.floor` (text, CHECK-bound to
`'2' | '3'`, default `'3'`), carried through the publish, restore and reset RPCs, and a code registry
(`lib/floors.ts`) names the floors. The inference above did **not** disappear with it — it now has
exactly one home (`rosterFloorForUnseated`), dated, and it retires by itself the first time a
2nd-floor seat is *published* (liveness, not a flag: a floor is live when it is mapped **and** a seat in
the layer being read carries it). Until then every active person without a published seat is listed
on the Floor 2 roster.

**The people-to-seats ratio still makes the small screen tractable.** A directory of 99 names is a
perfectly good list at 320px. A floor plan is not. That argument never depended on how many people
were seated, and it survives the re-measure intact.

---

## 4. The Hill

*Who / What / Wow*, one per project, per `senior-workflow.md`:

> **Anyone at the firm** can find where a colleague sits **on either floor**, and **an admin** can
> rearrange both floors and publish them **together**, **without ever wondering which version — or
> which floor — they are looking at.**

*(Amended 2026-09-01 with the multi-floor ruling, Q3 = b. The original read "…rearrange the floor and
publish it…"; the last clause is the part that was always load-bearing and it now has a second axis.)*

Every decision below is tested against that last clause — the draft/published split is this product's
defining complexity, and `ui-shell.md` puts it in the header by name. It survives to 320px.

---

## 5. Decision log

### D0 — Shell configuration

```
Screen: Shell (spans /, /admin, /admin/*, /reception; absent on /login)
Problem: "I need to move between the map, the directory and the admin tools without
         losing my place, and I need to always know whether I'm looking at the live
         map or my unpublished edits."
Primary task: orient — location, identity, and mode — then move.

Options considered:
  A. Header + persistent left panel (256px expanded / 48px icon rail) at all widths.
     What ships today: a 40px bar plus a 48px fixed rail with overlay expansion.
  B. Header only at lg and up; header links collapse behind a hamburger into an
     overlay panel below lg. ui-shell.md: "Header only — a small number of main
     sections, no secondary navigation," plus its own narrow-width instruction that
     header links "collapse into the left panel at narrow widths."
  C. Header + right panel for system content, no left navigation at any width.

Choice: B. The skill's trigger for a persistent left panel is "more than five
  secondary items or users switch between them frequently." This product has FOUR
  sections (Seat map, Management, Settings, Reception); an admin sees four, a viewer
  sees one. Four sections do not earn a permanent rail, and at the 1920 primary
  target that rail would cost 48px of map width for navigation that fits in the
  header. Below lg the same four links have nowhere to sit inline, so they collapse
  into a hamburger-triggered overlay panel — which is the skill's own narrow-width
  behaviour, not an invention. It also removes today's second chrome: the viewer
  renders its own 36px header while shell routes render a 40px bar — two
  implementations, neither at Carbon's 48px.
Trade-off: the navigation changes form at lg, so the shell is two things rather than
  one, and there is no home for a fifth section at wide widths without a sub-menu.
  Deliberate: the alternative is carrying a rail at 1920 that exists only to serve
  320.
Would change if: a fifth or sixth top-level section is committed to, or a section
  grows secondary navigation of its own — either reopens the persistent-panel option.
```

**Header height 48px, full width, fixed, at every breakpoint.** Non-negotiable in `ui-shell.md`, and
it is also what makes the 44px touch-target floor reachable without the header growing on phones.

**Second decision inside D0 — the grid across the full ladder.** Options: cap the live area at 1584
everywhere and centre it (168px dead margin each side at 1920); let everything run fluid to 1920; or
split by surface type.

**Choice: split by surface type, and record it as a purposeful deviation.** The map stage is a
*canvas* — every pixel is data, and capping it at 1584 would shrink the floor plan by 17% at the
primary target for no reason — so the map runs **fluid at every breakpoint**, up to the raster's own
1911px cap. Text-dense surfaces (reception detail, settings, management, the login form column) hold a
**1584px live area, centred, above `max`**, and follow the standard column counts below it (16 / 8 / 4).
Reading measure is a typographic constraint that does not improve with width. Trade-off: two width
regimes in one product, the inconsistency `ui-shell.md` warns about — accepted because the surfaces
are visually distinct enough (canvas vs. document) that no user crosses between them expecting the
same frame.

**Header anatomy** (fixed by `ui-shell.md`, not open to preference):

| Slot | `lg` and up | Below `lg` |
|---|---|---|
| Left | **Hamburger (48×48, toggles the filter left panel — D0-c)**, then header name: organization name 14/400 + "Seat Planner" 14/600 (text, D0-d) → links to `/` | Hamburger (the same panel also carries the section links, above the filters), then header name |
| Header links | Seat map · Reception · Management · Settings, inline (viewers see the first two) | Collapsed into the left panel, **above** the filters |
| **Mode indicator** | **"Draft — N changes" / "Published · <date>"** — status only, two signals in the mark; pressing it opens the History panel (D0-a) | One graceful fallback, never dropped (D0-e) |
| Utilities (flush right, no gaps, 48×48) | **Help · History · Account** (D0-a, D0-b) — Theme lives in the Account panel | Same three |
| Switcher | **None** — standalone product, not a platform | None |

**The mode indicator is a requirement, not a flourish.** `ui-shell.md` is explicit: "If a product has
a draft/published split … the header is where that belongs, persistently, on every screen." This app's
central invariant is that two-layer split, and it is the Hill's last clause. It therefore **survives to
320px** rather than disappearing: full sentence at `lg`+, and one compact fallback (status mark plus
count) below — the three-step degradation originally written here was withdrawn on 2026-09-02 (D0-e).
Dropping it on small screens would be dropping the one thing the product promises never to leave ambiguous.

Two further shell rules taken as given: **no switcher, ever** (standalone), and **state goes in the
URL** — view, filters, selection and mode — because `ui-shell.md` says persistence "is not part of
the component and must be added during implementation." The URL rule matters more now: it is what lets
a person move between the narrow list view and the wide map view without losing their place.

---

### D0 — amendments (2026-09-02, PHASE1IA.md rulings 17–24)

#### D0-a · Right-panel family: Help, History, Account
**Screen:** shell, every route.
**Problem:** admins need the publish date, recent publish events and a way to switch between Published
and Draft without leaving the map; everyone needs help and account actions; none of this is navigation.
**Primary task:** orient (which mode am I in, what changed) and switch mode.
**Options considered:** (1) mode indicator itself toggles the mode — fastest, but one header element
displays and changes state, and a mis-tap changes the whole map; (2) "Published" / "Draft" as two header
links — pure IBM navigation, but re-opens the one-section ruling (answer 2); (3) indicator is status only
and opens a right panel whose first row is the switch.
**Choice:** (3). Indicator in the centre slot, status only, two signals in the mark (square = Published,
hollow diamond = Draft) plus text. A **History** utility icon sits in IBM's Notifications slot (3rd from
right); pressing it or the indicator opens the same panel: mode switch first, publish events newest-first
below. Viewers get the published date only (Draft is Hidden, `publish_events` is admin-only). **Help** and
**Account** are right panels too. One open at a time, anchored to their icon, dark like the header, no
selected state on items. Panel width 320px provisional (Carbon HeaderPanel 256, ibm-products
NotificationsPanel 360).
**Trade-off:** one extra click per mode switch.
**Would change if:** admins switch mode many times per session and the click shows up in complaints.
**Note:** the mode switch is a *control*, not a panel item, so ui-shell's "right panel items have no
selected state" does not apply to it. Approved against mockups (PHASE1IA ruling 23).

#### D0-b · Utilities are Help · History · Account; Theme lives in the Account panel
**Problem:** the shipped one-press Theme utility acts directly; ui-shell utilities open panels.
**Options:** keep the toggle and note it; move Theme into Account.
**Choice:** Account panel: email + role, Theme (Light / Dark / System), My seat, Sign out. Utilities
become Help · History · Account — IBM's exact standalone three.
**Trade-off:** one extra click on a set-once setting.
**Would change if:** never, realistically. (Ruling 20.)

#### D0-c · Hamburger toggles the filter left panel
**Problem:** department / zone / status filters must not sit inside one popover (patterns.md "must
never"); people filter occasionally; the map wants its full width.
**Options considered:** always-on 256px left rail (costs 256px of map on every view); horizontal strip
merged into the map control row (always visible, costs a 40px chips row when filters are applied); the
strip's collapsed state; hidden left panel toggled by the header hamburger.
**Choice:** hidden left panel, 256px, header hamburger toggles it ("Option A2"). Slide-in: pushes the
canvas, no focus trap; Esc or the icon closes; open/closed remembered per user. While closed, a
"Filters N ×" button in the map control row shows the applied count and clears without reopening. Per
category Clear, global Clear all at the top of the panel.
**Trade-off:** every filter change is one click further away than the strip; and in other Carbon products
the hamburger opens navigation — here it opens filters. Not a deviation (a header-only shell has no nav
panel to conflict with) but product-specific, so it is recorded here. Below `lg` the section links fold
into this same panel above the filters, exactly as ui-shell describes; the Account-menu fallback for links
retires.
**Would change if:** filtering becomes a many-times-a-day action; then the strip (mocked) is the answer.
(Ruling 21.)

#### D0-d · Header name anatomy
Organization name (`body-compact-01`, 14/400) + "Seat Planner" (`heading-compact-01`, 14/600), text,
links to `/`. No graphic wordmark. (PHASE1IA.md F2.)

#### D0-e · Width ruling reworded
"320+ adaptive, 1920 primary" becomes "works at any width; designed and tested at 1920 with one deliberate
narrow fallback (links fold into the left panel, single-column pages, map read-only)". The floor is kept;
the per-breakpoint design mandate is withdrawn. Reopens on first laptop use. (PHASE1IA.md F1, ruling 24.)

### D0 — Phase 2 amendments (2026-09-02, shell PR)

#### D0-f · Right-panel width is 320px
**Screen:** shell — Help, History, Account panels.
**Problem:** the width was provisional (PHASE1IA B1); Carbon's HeaderPanel is 256, ibm-products' NotificationsPanel 360.
**Options considered:** (1) 256 — matches the filter left panel and Carbon's own header panel; (2) 320 — the width the approved mockups (ruling 23) were drawn at; (3) 360 — sized for notification bodies.
**Choice:** 320. Drawn and checked in the wireframe: the History event (what changed / date / who on three lines) fits either width, so content does not decide it — what does is the Help panel's two-column shortcut list (a 96px key column plus a definition; 288px of content holds "Move between seats on the plan" on one line, 224px does not), the two-segment mode switch keeping ≥ 128px per segment, and the fact that ruling 23 approved the panels as mocked at 320. 360 buys nothing — no panel here carries body text. 320 sits on the 8px grid (40 × 8). Applies to all three panels — one width, per ui-shell "consistent width".
**Trade-off:** 64px more of the map covered while a panel is open. Panels float and close on Esc, so the cost is transient.
**Would change if:** publish events gain a body paragraph (then 360), or the History panel is retired to a page.
**Phase 3 confirmation (2026-09-03, PR 2):** settled at 320 and built as `--sp-panel-right-w`. The 72px three-line History event (what changed 14/18 · date 12/16 · who 12/16, with the long `12 seats changed · 5 people updated · 1 department renamed` summary wrapping to two lines only inside 288) needs the 288 content column, and Help / History / Account share the one width `ui-shell.md` requires. Not a deviation — the skill text says "consistent width", no number.

#### D0-g · History panel depth: 10 events, then Show more to 25
**Problem:** `publish_events` is unbounded; ui-shell forbids unbounded content in a side panel; patterns prefers "Show more" over scrolling, gradients or fades.
**Choice:** the panel lists the 10 newest events (the shipped `getPublishHistoryAction` default) and offers one ghost **Show more** that fetches to the action's 25 cap; after that the panel says "Showing the 25 most recent publishes." No paging, no infinite scroll — positions in a publish log are not addressable.
**Trade-off:** older history is unreachable from the UI. Accepted: it was already capped at 25 on the retired Management tab.
**Would change if:** anyone asks for a publish older than the 25th — then the log becomes a Management tab with pagination.

#### D0-h · Hamburger only where the left panel has content; its slot is always reserved
**Screen:** shell, every route.
**Problem:** the hamburger toggles the *filter* panel (D0-c), and filters belong to the map. Reception, Management and Settings have no left-panel content at `lg`+; ui-shell puts a hamburger "only when there's a collapsible left panel".
**Options considered:** (A) hamburger only where the panel has content — `/` and `/admin` at every width, every route below `lg` (the panel then carries the section links) — with the 48px slot **reserved and empty** elsewhere so the header name never moves; (B) hamburger everywhere, the panel on non-map routes holding only the section links — a duplicate of the header links at `lg`+; (C) hamburger on map routes only, header name flush left elsewhere.
**Choice:** A (owner, 2026-09-02). It is the literal ui-shell rule, and reserving the slot keeps "icons don't move" — the header name starts at x=48 on every route.
**Trade-off:** a 48px empty square at the left of the header on three routes. Invisible in practice (the header is one dark band), and cheaper than a control that opens an empty panel.
**Would change if:** Reception or Management grow filters of their own — then the panel has content there and the hamburger appears, with no layout shift.

---

### D1 — Map (`/`, viewer)

```
Screen: Map — the viewer's seat finder
Problem: "Where does Sarah sit?" and, less often, "who is sitting here?"
Primary task: locate one named person on the floor plan.

Options considered:
  A. Map-first at every width: the floor plan is the page, search floats over it,
     and the plan simply scales down.
  B. Map-first at lg and up; directory-first below lg, with the plan reachable per
     person.
  C. Search-first at every width: a search page that reveals the map on demand.

Choice: B — one layout switch at the lg hinge.
  At lg and up the plan is the page, fluid to 1920, with search as a single floating
  Find affordance. The measured numbers decide it: at 1920 the ENTIRE plan is visible
  under a 48px header, so the spatial answer needs no pan, zoom or scroll. That is
  the whole value of the surface. Note it is NOT at 100%: the measured viewport is
  889px tall, so height binds and the plan renders **1734** wide rather than reaching
  its 1911px cap (measured in the running app, §2.3 — an earlier arithmetic estimate
  here said 1854). Wholly visible, well under full size.
  Below lg that is simply untrue — §2.4, driven: 304px tall at md with 68 markers
  on it, and 41 of those markers closer together than a conformant touch target.
  (The "145px at sm" this line used to cite was wrong: below 640 the app already
  stops shrinking and pans a 1040px canvas instead. See §2.4 — the correction
  strengthens B at md and weakens it at sm, where the app has arguably already
  chosen A and made it work.) A is therefore rejected on measurement, not taste: it ships an
  unreadable map and calls it responsive. C is rejected at wide widths by
  status-and-dataviz.md — "never hide something important behind an interaction" —
  but that objection has no force at 320, where the map is not readable to begin
  with. So the surface inverts at the hinge: the 99-person directory becomes the
  page, and choosing a person opens their seat in the plan, zoomed to that seat with
  its neighbours legible.
Trade-off: two different primary layouts for one route, which is more to build and
  more to learn than one. And browsing "who is in Litigation?" is weaker than a list
  would make it at wide widths — it is a filter that highlights markers rather than a
  readable roster. Accepted on both counts: the alternative to the first is a map
  nobody can read, and the roster question is what Reception is for.
Would change if: the plan gains a second floor or grows past ~120 seats (the wide
  layout stops fitting and the hinge has to move up), or usage shows browse-by-
  department outweighing find-by-name.
```

**Triggered 2026-09-01** — the plan gained a second floor (§8, Q3 = b). **D1′** below amends this
entry; nothing in it is withdrawn, because the second floor arrives as a second *canvas*, not as more
seats on this one.

**The resting label is the person's name. The seat code is the disclosure tier** (ruled 2026-09-01,
reversing an earlier ruling in this document that had it the other way round). §3.2.1 measures why:
with a **single-line, fit-width** pill the name layer places cleanly on 50 of 58 markers at 1920 and
**every** remaining collision is inside the existing nudge's reach, at every width down to `lg`. The
seat code is what the *admin* needs while assigning desks; the viewer asking "where does X sit" is
answered by the name, so the code moves to hover, selection and the inspector — where the admin
already is.

**The binding constraint is `≤ 28px` of pill height, and it is not a preference.** It is
`PILL_NUDGE_PX × 2` measured against a pod row at `dy = 0`. Line-height, padding and border are
budgeted inside that number; at 29px the pod-row collisions return and no amount of width tuning
recovers them. **Record it beside `PILL_NUDGE_PX` in `lib/seatCrowding.ts`**, because it is the kind
of constant that gets broken by a padding change three refactors later.

Three riders. **The searched or selected person's name quiets its neighbours** rather than drawing
over them — `taste.md`: "hierarchy problems are solved by making secondary things quieter, not the
primary thing louder", and occluding at a 56px pitch is exactly the move it rejects. **No animation
on the reveal and no layout shift** — the label band is reserved in the marker's own layout, so
disclosure changes contrast, not geometry. And **search must publish its count, zero included**, now
that it is a primary way to reach a name.

**Pan and zoom change job at the hinge.** At 1920 the whole plan is visible, so zoom is an *inspection*
convenience. Below `lg` — and at high browser zoom — it is the only way to read the plan at all, so it
becomes load-bearing equipment and needs a real keyboard path, not just pointer gestures.

**States, designed before styling** (`senior-workflow.md` step 5). The measured data makes one of
these primary rather than exceptional:

| State | Design |
|---|---|
| **Person works on the 2nd floor** | Not an absence — a **location**. Owner ruling, 2026-09-01: everyone without a desk on this plan is on the 2nd floor, which is **40 of 98 people** (§3.1). So the state names the person and says where they work — *"Sarah works on the 2nd floor"* — with their department and extension, and never *"no assigned seat"*, which is a dead end for a question that has a real answer. Identical wording in both layouts, and identical whether the person was reached by search, by the department filter, or from the roster. **Depends on an inference, not on data** — see the risk note below. |
| Nothing published | Educational empty state over the plan, naming the next step. |
| No search results | Distinct from the above; keeps the query visible and reports **zero** explicitly — `SKILL.md`: "Always publish the number of results, zero included." |
| Loading | Skeleton over the plan area; the raster is preloaded from `/login` already. |
| Error | Inline notification in the map region, with retry. |

**The 2nd-floor state rests on an inference, and that is worth writing down.** `seats` has no
`floor` column, so nothing in the schema distinguishes *"works on the 2nd floor"* from *"3rd-floor
person whose desk is not set up yet"*. The copy above is true only while the owner's rule holds — that
the two sets are the same set. The day a 3rd-floor hire arrives before their desk does, the map will
tell the front desk they are downstairs, confidently and wrongly. That is an acceptable trade today
(it is cheap, and it is a better answer than the dead end it replaces) and an unacceptable one the
moment the firm hires ahead of its furniture. **Whoever adds a `floor` column inherits this note**:
the copy was relying on absence to encode location. Until then, the risk is bounded by how quickly
Management assigns a new arrival — which is the same person doing both jobs.

**Resolved 2026-09-01 —** the `floor` column exists (PR-1) and this note was inherited as written:
the copy still relies on an inference until Floor 2 is *live*, so the inference was given one dated
home and a self-retiring trigger (§3.3 update). The *"3rd-floor hire before their desk"* failure is
bounded the same way it was, and disappears with the first 2nd-floor publish.

### D1′ — Map, two floors (amends D1; ruled 2026-09-01, built in multi-floor PR-2)

```
Screen: Map — viewer, two floors
Problem: "Where does Sarah sit?" — and Sarah may be downstairs.
Primary task: locate one named person, on whichever floor they are.

Options considered:
  A. One canvas with floor tabs; the other floor is invisible to search and filters.
  B. One canvas per floor; search, deep links and the department filter span the
     building and SWITCH the floor for you; an unmapped floor renders a roster in
     place of a plan.
  C. Stacked plans, both floors on one page.

Choice: B. The task is "find the person", not "browse a floor"; the floor is a
  consequence of the answer, so the answer is allowed to change the canvas. C is
  rejected on the §2.3 measurement — 1920 × 889 fits ONE plan under the header; two
  do not. A is rejected because it makes the 40 downstairs people unfindable from
  the surface people actually use.
Trade-off: the canvas can change under the user when a find resolves elsewhere.
  Mitigated: the selector and the status band both name the floor, the switch is a
  status-role live message ("Showing Floor 2 · Litigation"), and a manual switch
  keeps the query and the structured filters.
Would change if: the firm takes a third floor with a plan — the selector becomes a
  menu of three and the "single not-live floor" roster rule stops being decidable.
```

**Landing precedence** (owner ruling: land on your own floor, remember the last one): `?seat=` (the
floor of that seat) → `?floor=` → the remembered floor (`localStorage`
`seat-planner:viewer-floor` — the viewer's **second** persisted preference, superseding the
2026-08-17 "one preference" note) → the signed-in person's own floor (matched by email against the
published snapshot already in hand; one auth probe, no new table) → Floor 3. The URL mirrors the floor
with a shallow `replaceState`, `?floor=` only off the default so the bare URL stays canonical.

**Mapped floor:** the plan, exactly as D1 — the canvas and every render-layer derivation see only
that floor's seats. **Unmapped floor → roster** (`components/seat-map/FloorRoster.tsx`): a
focusable region headed *"Floor 2 · Litigation — 40 people"* with one helper line saying why it is a
list, people grouped by department (eyebrow + count, "No department" last), A→Z within, one 40px line
per person from `md` up (name · position · extension · email — the **first viewer surface to show
`published_employees.email`**, a deliberate widening: it is directory data the front desk already
reads). Rows are **static list items** — every fact the inspector would show is on the row, so
nothing opens and nothing is `disabled` (deviation 9). The zero-result state names the query and the
floor and offers *Clear search*; first-run reads *"No one is listed on Floor 2 · Litigation yet"* and
names the admin who publishes.

**Find spans the building.** Search rows and the palette's people rows carry a floor; a hit on the
other floor switches, then selects (seat) or marks + focuses the roster row (person). Palette contract
#9 is **amended**: an unseated person is listed, honest — the trailing cell reads *"Floor 2"* — and
now **openable**; the row is never `disabled`. Seated rows on the other floor carry a *"Floor 2"* tag
beside the code.

**Q5, closed:** the department filter keeps all 15 departments. On a plan floor a department with no
seats here but people on the other floor reads *"0 of 68 seats on Floor 3 · 20 people in Litigation
are on Floor 2"* with a **Show Floor 2** action; on the roster floor the same popover counts people
(*"N of M people on Floor 2 match"*), department and position filter the rows, and zone and status —
seat facts — are **hidden** there with a one-line note (Hidden tier, never disabled). A filter that hides
everyone says so and offers *Clear filters*; the first-run copy is reserved for a floor with no one on it.

**Status band:** the title carries the floor (*"Floor 3 · 68 seats"*); on the roster floor it is
title-only (*"Floor 2 · Litigation · 40 people"*) with the legend list, names switch and zoom
**absent** — Hidden tier, there is no map to control — never disabled. **Floor selector:** options
from the registry; the SOON badge is gone. **Reception (D3′):** the readout reads *"Seat L02 · Floor 2
· Litigation Pod"*; an unseated person on the interim floor reads *"Floor 2 · Litigation — reaches
voicemail if away"* and the list cell shows *"Floor 2"* in place of a code. **`/my-seat`:** the
sheet draws one floor (neighbours never cross floors) and carries a *Floor* fact row first; an
unseated member on the interim floor gets *"You work on Floor 2 · Litigation"* in place of the
no-seat notice.

**Admin (D2′)** — built in PR-3, recorded under D2′ below: the canvas filters draft seats by floor,
the same roster renders from the live working set, Add seat is absent on an unmapped floor, Move/Swap
targets may be on the other floor (the canvas auto-switches), the publish review groups rows under
floor eyebrows, and the whole building publishes in one RPC call. **Slice B** (the 2nd-floor raster,
calibration, zone rectangles and the seeded, protected originals with new label prefixes) is blocked
on the drawing, which is produced first.

**Seat status vocabulary.** Four enum states exist; **two have data**. `status-and-dataviz.md` is
unambiguous where a spatial map forces one shape: "If a spatial map genuinely forces a constant shape
(every seat is a square), compensate with a distinct symbol or texture per state and say so
explicitly." So: markers keep one constant footprint (they are positions on a plan and cannot change
shape without lying about geometry), and each state gets a **distinct interior symbol**, not a colour
swap. Two live states is well inside the five-indicator budget; `reserved` / `unavailable` get symbols
specified but not designed into the primary read until data exists.

**Deliberate deviation, recorded:** the archetype table in `senior-workflow.md` has no "spatial
canvas" entry. This screen is a hybrid — *search results* semantics over a fixed-coordinate canvas —
and below `lg` it resolves into the plain archetype the table does have.

---

### D1 — amendments (2026-09-02)

#### D1-a · Find me and Copy link
Find me: viewer affordance on the map that lands on the viewer's floor and selects their seat (email
match already exists). Copy link: on a selected seat → `?seat=<label>`; on a person → `?q=<name>`.
Closes backlog DIR-1. (Answers 7, 9.)

#### D1-b · Focused search with a scope control
Search stays on the map surface, not in the header. Scope control "This floor / Whole building" with a
count per scope ("7 on this floor · 11 in building"); a unique cross-floor match auto-switches floor,
which is what `?q=` landing relies on. No global header search. (Ruling 17; E2.4 resolved, deviation 13
not taken.)

### D1 — Phase 2 amendments (2026-09-02, map PR)

#### D1-c · One right-edge slot on the map surface; shell panels float above it
**Screen:** map, both modes (`/`, `/admin`).
**Problem:** the seat inspector, the mode card (Move / Swap / Add seat), the Ask Planner drawer and the shell's Help / History / Account panels all want the right edge.
**Options considered:** (A) one in-surface slot, slide-in, pushes the canvas, owned by exactly one of inspector / mode card / Ask Planner, last opened wins; shell panels float over it at 320; (B) inspector and drawer side by side (400 + 408 = 808px, canvas 1112 < `lg`, D2's pitch floor breaks); (C) Ask Planner as a bottom drawer (height binds at 1920 × 889 — §2.3 — so a bottom drawer shrinks the plan directly).
**Choice:** A. The displaced occupant collapses to its re-entry point: a selected seat stays selected (reselect or press Enter on its marker reopens the inspector); Ask Planner keeps its control-row button with the highlight-count badge; a running mode is never displaced — it owns the slot until it ends (INV-4, as shipped). Shell panels are transient (Esc, one open) and never push. **Every slot owner is 400px** (the drawer drops from its shipped 408), so the canvas never reflows when one replaces another, and the map selection stays highlighted while the drawer or a mode card holds the slot. The control row spans the full width above both canvas and slot, so it never reflows when the slot opens.
**Trade-off:** an admin cannot read an Ask Planner answer and edit a seat at the same time; the highlights stay on the canvas, which is what the answer is for.
**Would change if:** admins report round-tripping between the drawer and the inspector many times per task.

#### D1-d · Focused search — field, palette, scope, `?q=` landing
Field in the control row (320px, never labelled, magnifier + placeholder, Ctrl/⌘ K). Results open in the existing 560px palette anchored to the field's left edge — a disclosure, results in place. A trailing scope segment **"This floor ▾ / Whole building"** sits inside the field; the results header always carries both counts ("7 on this floor · 11 in building"), zero included. Typing never changes the floor; opening a result on the other floor does (status-role announcement, D1′). `?q=` landing: field pre-filled and results open; a unique match auto-selects (seat → inspector; unseated person → roster row) and auto-switches floor; several matches stay a list; zero shows the zero state with the query kept. (Ruling 17; closes E2.4 for good.)

#### D1-e · Copy link
Copy icon with a "Copied" confirmation (patterns: Copy) on the inspector header → `?seat=<label>`; on the person block inside the inspector and on roster rows → `?q=<name>`. Roster rows stay non-opening (deviation 9 holds — an icon button on a static row is not a disclosure). Closes backlog DIR-1 (D1-a).

#### D1-f · Find me
Ghost button in the control row, every role. Seated → own floor, own seat selected, inspector open. Unseated → roster floor, own row highlighted. Not in the published directory → inline notification in the map region: "Your account isn't in the published directory. Ask an admin." Own seat comes from the email match already in `app/page.tsx`.

#### D1-g · Status band kept; names toggle moves to the control row
The 40px band (legend · counts · zoom/fit) already ships and Q2 dissolved its geometric objection. It stays as the map's footer; the names toggle moves up to the control row (PHASE1IA B4). Height budget at 1920 × 889: 48 header + 48 control row + 40 band → plan 753px tall, 1660 wide, wholly visible.

### D1 — Phase 4 amendments (2026-09-03, owner rulings on the PR 0 triage flags)

#### D1-h · Decorative reinforcement removed; facts carried by pills and counts
The private-office room tint and the zone-filter frame with its pill fills retire (Phase 4 PR 3). Filter and
search hits render as the pill highlight (`--sp-highlight` surface, interactive edge), non-matches quiet, count
and Clear in the control row and status band — the Phase 2 treatment already covers every job the washes did.
`MapWashLayer`, `lib/officeRoomWash`, `lib/zoneWash`, `--sp-wash-zone` and `office-room-wash.test.mjs` retire
together. Not a deviation: nothing in Carbon asks for a wash.

#### D1-i · Unused module removed
`lib/seatClusters.ts` is imported by nothing; it and `seat-clusters.test.mjs` are deleted in Phase 4 PR 3. No
design content.

---

### D2 — Admin (`/admin`)

```
Screen: Admin — the draft seat-map editor
Problem: "Someone moved desks. I need to change the map, check it looks right, and
         push it live for everyone."
Primary task: assign or move one person to one seat.

Options considered:
  A. Overlay inspector floating over the plan at all widths (what ships today).
  B. Slide-in 480px side panel that pushes the map, at lg and up only — editing does
     not exist below the hinge.
  C. Modal per seat edit.

Choice: B. composition.md: "Side panel — medium complexity where the user needs the
  page behind it," and the slide-in/slide-over split is explicit — slide-in "pushes
  page content and does not trap focus" because it is part of the page. Editing a
  seat is exactly that: you assign someone while looking at who sits around them, so
  occluding the neighbours defeats the check. The 1920 primary target is what makes
  the push affordable: 1920 − 480 = 1440px of map, still wider than lg, and the plan
  re-fits rather than hiding. C is ruled out by the same file: never more than four
  fields, and never a modal that might need a confirmation on top of it.
  Because editing is confined to lg and up (see below), the panel has ONE behaviour
  at every width it exists at — always slide-in, never focus-trapping.
Trade-off: the map reflows when the panel opens, so markers shift under the cursor
  mid-task. Deliberate: the alternative — an overlay that hides the neighbours you
  are checking — is worse for the primary task.
Would change if: the reflow measurably disrupts placement accuracy in use, in which
  case the panel becomes an overlay and loses the push.
```

**The push has a measured cost the ruling should carry.** "Still wider than `lg`" is a width test
standing in for a pitch test, and `lg` is not a bar that pitch passes — at 1056 the minimum pitch is
31.0px. Shrinking the map region from its 1911px cap to 1440px scales pitch by the same ratio: the
tightest pair (NE02/NE03) goes from 56.1px to **42.3px**, and the largest marker keeping a 4px gap
from 52.1px to **38.3px** — a 26% smaller drag target, appearing exactly while the admin is doing
pixel-accurate placement. It stays well clear of the 24px SC 2.5.8 floor, but it does **not**
stay clear of the 44px one: at a 1440px map the governing axis gap falls to 42.3px and **two pairs of
44px hit regions overlap**, where at the unpushed 1911px none do. So opening the panel crosses a
non-negotiable, narrowly, on the surface doing the most precise work.

**Narrowing the panel closes it completely.** The floor holds at every pane width up to **420px** and
breaks at 430px; a 400px panel leaves a 1520px map, a 44.7px governing gap and zero overlaps. The
measured content does not demand 480px either — a 22-character longest name, a 17-character
department, a 4-character seat label, and notes used on 1 of 68 seats. **So the panel should be 400px,
not 480px, and the reason is conformance rather than taste.** The alternative, if 480px turns out to
be needed, is to hold each marker's hit region at its unpushed size while the panel is open.

**Admin editing is `lg` and up. Below the hinge, `/admin` is read-only** (owner ruling, 2026-08-31:
seat assignment is done up front, on a desktop, before the redesign work begins). Narrow widths render
the draft map in the same read-only drill-down pattern D1 gives the viewer below `lg`, with the header
Draft indicator intact and a plain statement that editing needs a wider window.

This is the simplifying decision of the whole document, and it earns its place three times over:

- **It removes a capability that could corrupt production data.** Drag-to-place against a 290–304px
  plan (§2.4) produces wrong coordinates in a live table — now measured in the running app rather than
  computed: at `md` the minimum axis gap is **19.7px with 41 of 68** markers within 24px of a
  neighbour, and at 640 it is 18.7px with 48 of 68. A drag at that scale cannot resolve which seat it
  is targeting. Two corrections to the numbers this bullet used to carry: the "145px-tall plan at 320"
  never existed (below 640 the app pans a full-size canvas, §2.4), and **at 320 the pitch is actually
  30.5px with none inside 24px** — so the case against editing below `lg` rests on `md`, not on `sm`,
  which is the reverse of how it read. It still holds: `md` is where the geometry is worst. (Seat
  geometry, invariant to assignment — 68 markers before the re-measure and 68 after.)
- **It removes the focus-semantics switch.** The panel is slide-in at every width it exists at, so
  there is no width at which focus trapping appears — a recorded deviation that no longer needs
  recording.
- **It matches who actually does the work.** Every admin is at a 1920×1080 desktop; the narrow-width
  editor would have been built for nobody.

Read-only is the correct state here rather than disabled, per `SKILL.md`'s table: the content still
needs to be read, and disabled components "are not read by screen readers and do not pass contrast."

**Publish is the product's most consequential action and gets ruled separately.** Publishing replaces
what every viewer sees, and per `SKILL.md`'s destructive table it is at least **moderate** — "can't be
undone easily, or affects several things" — requiring the consequences spelled out. The review is not
a small confirmation: it diffs seats *and* employee-detail changes and can run long.

**Choice: the publish review is a wide tearsheet, not a modal.** `SKILL.md` forbids the alternative in
one line — "never put large or complex data in a dialog — that's a page" — and `composition.md` gives
the tearsheet to "complex or interactive, or two or more distinct steps," with no top-right close, so
leaving is a decision made through Cancel. Publishing is an editing action, so it inherits the
`lg`-and-up confinement above and needs no narrow-width variant. Trade-off: heavier than a dialog for
a two-seat change. Accepted, because the failure mode being designed against is an admin publishing a
diff they did not read.

**Modes and unsaved work.** The header's Draft indicator (D0) carries the count of unpublished
changes on every screen and every width, so an admin who wanders to Management and back cannot lose
track of pending edits. Per `ui-shell.md`, if state will be lost, say so before it is.

**States:** empty draft; loading skeleton; per-action inline notification in the region being worked
in (not a toast — `SKILL.md` makes inline "the default" for task-generated feedback); an explicit
submitting state on publish; and a publish failure surfaced as a notification with the review intact.

### D2′ — Admin, two floors (amends D2; ruled 2026-09-01, built in multi-floor PR-3)

```
Screen: Admin — the draft seat-map editor, two floors
Problem: "Someone moved desks — possibly downstairs. I need to change the map,
         check it looks right, and push BOTH floors live together."
Primary task: assign or move one person to one seat, on whichever floor.

Options considered:
  A. Mirror the viewer exactly: one canvas per floor, a floor is a plan only
     when it is LIVE (mapped and a draft seat carries it), else a roster.
  B. One canvas per floor; a MAPPED floor is always the plan (live or not), an
     unmapped floor is the roster; search, deep links, Move/Swap targets and
     Ask Planner highlights span the building and switch the canvas; publish
     stays one call for the whole building, reviewed under floor eyebrows.
  C. Both floors' seats on one canvas, distinguished by marker style.

Choice: B. The editor is where a floor BECOMES live — the first seat on a
  mapped floor is placed here — so it must draw the plan before any seat
  exists on it; liveness is the viewer's rule (a reader never gets an empty
  plan) and stays there. C is rejected on the same measurement as D1′ C: one
  plan fits under the header at 1920 × 889, and two floors' markers on one
  raster would put Floor 2 desks at Floor 3 coordinates.
Trade-off: the canvas changes under the admin when a find, a highlight or a
  Move/Swap target resolves on the other floor. Mitigated exactly as D1′: the
  selector and the band title name the floor, the switch is a status-role live
  message ("Showing Floor 2 · Litigation"), and the selection, the query and a
  running Move/Swap mode SURVIVE the switch — the source seat stays selected
  while the target is reached downstairs.
Would change if: the firm takes a third floor with a plan — as D1′.
```

**Canvas:** the plan renders only the current floor's **draft** seats — every render-layer derivation
(markers, label nudges, washes, roving order, legend counts, the first-run "no seats" state) sees one
floor; `localSeats` stays building-wide for search, history, the publish review and the concurrency
fence. The band title carries the floor (*"Floor 3 · 68 seats"*); the raster comes from the registry.
**Unmapped floor → roster**, the same `FloorRoster` the viewer mounts, fed from the **live working
set** (`employees` + draft seats via `peopleOnFloor`) — never the published snapshot — with the
search query filtering rows in place and the helper line naming the interim rule (*"Until a draft
seat exists there, everyone without a draft seat is listed here."*). The viewport is no tab stop
there; the roster region is. **Add seat is absent** on an unmapped floor — Hidden tier, never
disabled — and the server holds the same line (`createSeatAction` refuses a floor with no plan). A
new seat carries the canvas floor; zone detection and calibration run against that floor only.

**Find spans the building.** Result rows on the other floor carry a *"Floor 2"* tag; opening one
switches the canvas, then selects and centres. An unseated person is now **openable** (contract #9
amended for the admin too): the row leads to the roster floor they work on, marks their row and hands
it focus — inert only once the interim rule has retired. *Fit matches* pans this canvas only.
**Move/Swap targets may be on the other floor:** the mode and the source selection survive a manual
switch with the selector, so the target is the marker clicked on the other floor's plan (the mode card
owns the panel slot while a mode runs — INV-4 — so result rows are not the in-mode path; a result row
opened *outside* a mode still switches then selects). The confirm dialogs tag each seat's floor when
the pair crosses floors (*"L02 · Floor 2"*); the draft trail draws only when both ends are on screen.
**Ask Planner** learns floors: every seat and person the tools return names one, `search_seats` /
`list_people` take a floor, the summary counts per floor from the registry, the instructions state
the interim rule, and a highlight on the other floor is tagged in the drawer — selecting it switches
the canvas. **Deep links:** `?seat=` lands on that seat's floor, else `?floor=`; the URL mirrors
`?floor=` off the default, as the viewer does. No remembered floor for the admin — editing starts
from the plan everyone publishes.

**Publish is one call for the whole building.** `publish_seat_map()` already copies every draft row
regardless of floor (PR-1); the review now **groups its rows under floor eyebrows** in registry order
(*"Floor 3 · Pre-Litigation · 4 changes"*), so the admin reads which plan each change lands on before
confirming. A floor with no changes has no group.

**Selection survives a floor switch** (pinned in the real-browser tier since the placeholder era, and
now load-bearing for cross-floor Move/Swap): the inspector stays open on a seat that is not on the
canvas; its band clearance follows the band, not the floor it left.

### D2 — Phase 2 amendments (2026-09-02, map PR; owner rulings Q1–Q2 the same day)

#### D2-a · Seat inspector side panel is 400px — D2's own conclusion, now ruled
D2's measured paragraph is the evidence: at a 480 push the tightest marker gap on the 1440px canvas falls to 42.3px and two 44px hit regions overlap; the floor holds to a 420 panel; the measured content (22-character longest name, 17-character department, 4-character label, notes on 1 of 68 seats) does not need 480. **Ruled 400** (owner, 2026-09-02); the alternative — 480 with hit regions held at unpushed size — is **not** taken. The inspector's overflow state must carry the ≤ 22-character name constraint so Phase 3 sizes the type for it. Slide-in, pushes; below the control row (top 96), full remaining height. Recorded as **deviation 15** (§6).

#### D2-b · Draft-mode control row order (owner ruling Q2)
After the shared controls (floor selector · search · "Filters N ×" · result count · Find me) and a divider: **Undo · Redo** as ghost icon buttons (tooltips carry the shortcuts; Redo disabled when its stack is empty) · **Add seat** as a ghost button *with its label* (creation, low frequency — not icon-only) · **Ask Planner** (tertiary) · **Publish N changes** (the row's one primary) · **⋯ overflow** · **Names** toggle. The overflow holds **Discard draft changes only**, last item, danger styling, divider above, disabled when nothing to discard (parity with what ships). Reset zoom is **not** in the overflow — it stays with the zoom/fit control on the canvas (a viewport action does not belong in a menu of document actions). Owner-approved mockups: "Seat Planner Shell Mockups" canvas, page "Phase 2 Q1–Q2". Recorded as PHASE1IA.md B4 amendment.

---

### D3 — Reception (`/reception`)

```
Screen: Reception — front-desk call routing
Problem: "There's a call for Sarah. What's her extension, and is she at her desk?"
Primary task: find one person and read their extension out loud, fast.

Options considered:
  A. List-detail split at lg and up; single-column list with drill-down below lg.
  B. Table of all 99 people with an inline extension column.
  C. Search-only: one field, one answer, no persistent list.

Choice: A. senior-workflow.md gives list-detail to "triage; users move between items
  quickly," which is precisely a switchboard. 99 people is list-cardinality, not
  table-cardinality: the receptionist compares nothing across rows, they retrieve one
  value. B would put 99 rows and six columns on screen to answer a one-value
  question, and it is the layout that survives narrowing worst. C loses the caller's
  place when a name is misheard and has to be re-tried.
  Below lg the two panes stack into list → detail with an explicit back path, because
  a 372px detail pane beside a list does not fit at md and cannot exist at sm.
Trade-off: the detail pane is idle whenever nobody is selected — real screen area
  spent on an empty state at wide widths. And below lg the readout replaces the list
  rather than sitting beside it, so the receptionist loses the queue while reading a
  number aloud. Accepted: the pane is the readout the whole screen exists to produce,
  and at 320 there is no arrangement that keeps both.
Would change if: the directory outgrows roughly 300 people, at which point faceted
  filtering matters more than a persistent detail pane.
```

**Density is resolved by zone, not by screen** (`senior-workflow.md`): the results list is **dense** —
it is scanned — while the detail pane is **calm**, because it is read aloud under time pressure. That
split holds at every width and is the reason not to apply one spacing rhythm across the surface.

**Rules taken directly:** the result count is always published including zero; search is *active*
(small data set, filters in place as you type, no results page) per `SKILL.md`'s search table; the
search field is **not labelled**; recents are a secondary view, never the primary organisation
(`ui-shell.md` on "most recent": "loses logical grouping; better as a secondary view").

**States:** first-run before any search (the list shows the full directory rather than an empty pane);
zero results with the query preserved; a person **on the 2nd floor** (40 of 98 — the detail pane must
read correctly with the seat line absent, not blank); and a person with no extension.

**D3′ (2026-09-01, multi-floor PR-2):** the "on the 2nd floor" state is now a *location* in the
readout — *"Floor 2 · Litigation — reaches voicemail if away"* — and the list's seat cell reads the
floor in place of a code; a seated person reads *"Seat L02 · Floor 2 · Litigation Pod"*. Data stays
published-only.

### D3 — Phase 2 amendments (2026-09-02, Reception PR)

#### D3-a · Reception sits on the 1584 live area; list 1072 · readout 480; no primary action
**Problem:** the shipped page is a bespoke 1060px frame with a 372px sidebar; D0 puts every text-dense
surface on the 1584 document regime.
**Options:** keep 1060 (one less reflow to build, one more frame to learn); 1584 with the width spent on
the readout (list 1072 dense, readout 480 calm, sticky); 1584 with the width spent on the list.
**Choice:** 1584, width to the readout — it is the zone read aloud under time pressure (D3's density-by-zone).
The page header is title + subtitle and **no primary action**: nothing is created on Reception, and the
archetype allows zero. **Trade-off:** longer rows; mitigated by a fixed right-aligned 96px extension column
with tabular figures and a 48px pitch. **Would change if:** Reception gains a task (a call log), or the
directory passes ~300 people (D3).

#### D3-b · Reception keeps its own search; clear × and Ctrl/⌘ K added for parity with the map
Unlabelled, magnifier + placeholder, autofocus on entry, active search as shipped (ranking, highlight-preview,
Enter locks, Esc clears, arrows clamp, rows never steal focus). Additions: a clear × when the field is
non-empty (patterns: Clear = close icon at the right of the field — today only Esc clears, which a
receptionist on the phone does not discover) and Ctrl/⌘ K to focus, the same key the map uses. Count always
shown: "68 people" / "7 matches" / "0 matches". Not a header search (ruling 17).

#### D3-c · `?q=` on Reception
Landing pre-fills the field and filters; a unique match locks the readout; locking writes `?q=<name>` with
`replaceState`, clearing removes it. A lookup becomes linkable and survives a reload — today the URL never
changes. Recents stay in-memory (ruled 2026-08-05, not re-asked). No other URL state.

#### D3-d · Readout order and the no-extension state
Name block → extension in display type (`heading-06` 42/50, tabular; weight set in Phase 3 for arm's-length
reading) → seat line with the D3′ copy → "If no answer — same department" (≤ 3, as shipped) → recents.
**No extension** is a stated state — "No extension on file" with the fallback list as the next step — never
a bare dash (patterns: an empty state names the next action). A **Show on map** ghost link (→ `/?q=<name>`, the
D1-d landing) follows the extension block — owner-approved 2026-09-03; one link, no new data, answers "where do
I send the visitor?" without leaving the desk.

#### D3-e · Own error boundary in Reception's voice
`app/(shell)/reception/error.tsx` (Phase 4): "Reception couldn't load" / "The directory is unchanged — this
is a display problem. Try again, or use the seat map's search meanwhile." Actions **Try again** · Open the
seat map. Today the segment falls through to the root boundary and says "The seat map could not load" —
wrong surface, wrong voice (PHASE1IA B2). The loading skeleton is rebuilt to the 1584 layout (today's is 720
wide against 1060 of content).

---

### D4 — Login (`/login`)

```
Screen: Login
Problem: "Let me in."
Primary task: sign in with email and password.

Options considered:
  A. Split screen at lg and up — brand panel beside the form column — stacking to a
     compact branded header above the form below lg.
  B. Centred single card on a plain ground at every width.
  C. Full-bleed floor-plan background with the form floating over it.

Choice: A — and it is the ONE expressive moment in the product.
  ui-shell.md draws the hard line here: "Scope: products only … the shell is the
  chrome of a tool a user is signed into." So the 48px header from D0 does not appear
  on this screen at any width, and login is the only surface not bound to the
  productive frame. composition.md allows "one full-bleed, container-free moment per
  flow at most — that's an expressive moment, and it should be deliberate." This is
  that moment, spent once. Below lg the brand panel collapses to a compact header
  (mark, wordmark, title) and the decorative graphic and status furniture drop, which
  keeps the form column the whole screen where the screen is small. B works and is
  duller; C fails because the map behind auth is the product's private data and using
  it as decoration blurs what is and isn't behind the login.
Trade-off: the split makes login the only screen not on the product's grid regime,
  a consistency cost paid knowingly for the one screen every user sees before they
  are a user. The expressive half is also the half that disappears on a phone, so the
  brand moment is exactly absent for the smallest screens.
Would change if: sign-in frequency rises to daily-plus, at which point the expressive
  panel is friction on a high-frequency path and B wins on frequency × visibility.
```

**The form column is 368px and does not grow with the viewport.** Single column, per
`senior-workflow.md`'s form default — one reading path.

**Security-shaped constraints carried forward unchanged** — these are existing product invariants, not
style, and the redesign does not get to move them: no account-existence oracle (one identical error
for unknown email and wrong password; neutral response from magic-link and reset); the magic link sits
**below** the primary behind an "or" divider, never between a field and its button; inputs are
name-less and the primary ships disabled pre-hydration.

**States:** already-signed-in (continue / sign out, rather than a form that silently replaces the
session); invalid credentials; magic-link sent; reset requested; and a submitting state on the primary.

**Confirmed 2026-09-03 (Phase 4 PR 1, owner ruling):** D4 rules the login *layout* unchanged; the login inherits
the token layer, so the primary renders Blue 60 with the rest of the system. `LoginForm.tsx` swept mechanically
(retired names and the six SVG `#fff` attributes → tokens); `login-form.test.mjs` untouched.

---

### D5 / D6 — new entries (2026-09-02)

#### D5 · Management
`/admin/management?tab=employees|departments|zones`. In-page tabs, no third tier (ui-shell; answer 5).
Page header: title + one primary action on the 1584px centred live area. The `publishHistory` tab is
removed — history lives in the History panel (D0-a).

##### D5 — Phase 2 amendments (2026-09-03, Management PR; owner-approved with two edits to D5-b)

**D5-a · The page header owns the one primary, and it follows the tab.** 1584 live area (D0). Title, subtitle,
a real tablist (Employees · Departments · Zones; `?tab=` unchanged, default paramless), sticky on scroll.
The primary is the current tab's create — Add employee / Add department / Add zone — never in the toolbar.
The five summary tiles are **dropped** (owner, 2026-09-03): they linked nowhere; the employee counts fold into
the Employees toolbar count ("68 employees · 56 assigned · 12 unassigned", replaced by "7 of 68 match" while
filtering); draft-seat and zone counts already live on the map band and in the History panel. **Would change
if** a tab grows a second create action.

**D5-b · Employees is an index page; create/edit is a 480px slide-over side panel.** Compact sortable table
(32px rows — scanned), kebab per row, name links to the map seat. The form moves out of the modal into a side
panel because **the admin must keep referencing the table behind it** — the neighbours, the department
spelling, who is already assigned — which is the side-panel criterion (five inputs sits exactly between the
skill's "fewer than five → dialog" and "more than five → side panel", so field count decides nothing here).
The panel is **slide-over, focus-trapped**: the form is self-contained and the table is context, not something
operated mid-edit, so it behaves as a dialog (composition: slide-over overlays and traps focus). Width is
Carbon's 480 — deviation 15's 400 was a marker-pitch argument for the map canvas and does not apply to a
document page; recorded so the two are not "harmonised" later. Deactivate is moderate impact: a confirm dialog
on top of the side panel with the consequences spelled out (a side panel may open a confirmation; a modal may
not); the published-map refusal becomes an inline error in the panel with a link to the seat. No reactivate,
bulk actions or delete are added.

**D5-c · Departments and Zones are structured lists with visible actions.** Row: name · count · ghost Rename
(inline) · overflow ⋯ with Delete (danger). The hover-revealed trash goes — hidden-until-hover actions are
keyboard-undiscoverable and a taste tell. Create = the header primary opening a one-field modal. Delete keeps
the shipped confirm copy (moderate impact, no typed confirmation). Names only; zone geometry stays on the map.

**D5-d · Route boundaries.** Not-admin uses the same 403 card as `/admin`, gaining the "Back to seat map"
action the shipped body-only variant lacks; the route error keeps its own admin voice; loading is skeleton
rows under real column headers.

#### D6 · Settings
`/admin/settings`. Settings archetype: single-column forms grouped by section. Contents: CSV import,
JSON snapshot restore. **Reset draft is retired** (ruling 22) — too destructive to keep; undo history and
snapshot restore cover the need. Snapshot restore is moderate impact: confirm with consequences spelled
out, no typed confirmation. **Q7 ruled 2026-09-02 — the map's "Discard draft changes" stays; only Settings'
"Reset draft" is retired.** `resetDraftToPublishedAction` and the `reset_draft_*` RPC family stay for the map;
Phase 4 removes only the Settings entry in `components/admin-settings/DataUtilitiesPanel.tsx`.

##### D6 — Phase 2 amendments (2026-09-03, Settings PR; owner-approved as written, D6-e added by ruling)

**D6-a · Settings archetype on the 1584 live area; content in the left 8 columns (776px); no page-level
primary.** The two sections are unlike tasks, so each carries its own one primary (senior-workflow: section
primaries live in their sections). The standing guidance banner becomes a proper **callout** — loads with the
page, never dismissible, no status (patterns: guidance before a task). **Would change if** a third recovery
tool arrives (then a settings left-nav) or restores become frequent.

**D6-b · CSV section: primary Import CSV; review in a narrow tearsheet.** Labelled trigger stating the type and
limit up front ("Import CSV · .csv up to 5 MB"), columns and an example row on a file line under the actions.
The review leaves the modal: the blocking-error list scrolls, and a scrolling list is complex data
(SKILL.md: never in a dialog). Apply is disabled while blocked **with the reason inline above it**, never bare.
Unhappy paths written in — wrong type, too large (5 MB guard, none ships today), empty, missing columns,
MLS02 with the refreshed-directory note. All-or-nothing stays (as shipped).

**D6-c · Snapshots section: primary Export draft snapshot; Restore is tertiary and reviewed.** The backup is
the frequent act; restore is rare. Restore = moderate impact (D6): a narrow tearsheet with counts, the file's
name and export date, and a **consequences list** — every draft assignment replaced; custom seats not in the
file deleted; employee details updated, never deleted; the published map untouched until publish; Undo
history cleared — then Cancel · Restore draft snapshot. No typed confirmation. MLS02 keeps the review open
with the refreshed-draft note.

**D6-d · Reset draft gone from Settings** (ruling 22; Q7 keeps the map's Discard). The snapshots section loses
its danger styling — nothing destructive remains on the page. Not-admin uses the shared 403 card with the
action; the route error keeps the admin voice; loading is section skeletons.

**D6-e · "Export the current draft first" inside the restore review** (owner ruling 2026-09-03). A **ghost
button** (an action, not a link) in the review body: downloads the current draft snapshot, does **not** close
the tearsheet or reset the review, and shows its own done-state in place — "Exported 14:02" — so the admin
can see it happened before pressing Restore. Reuses the section's export; nothing new is written.

**Frame invariants (owner, 2026-09-03):** tearsheets exit via Cancel only — no close ×; file inputs get
labelled triggers with the accepted type and the 5 MB limit stated up front, not only in the error.

---

## 6. Deviations from Carbon, recorded

`senior-workflow.md` requires purposeful deviations be written down rather than absorbed:

| # | Deviation | Why |
|---|---|---|
| 1 | Two width regimes — map fluid at all widths, documents capped at 1584 above `max` | The published grid ends at 1584; a canvas loses data when capped, a text column does not gain from width (D0) |
| 2 | Spatial-canvas archetype not in the archetype table | The map is search-results semantics over fixed coordinates; below `lg` it resolves to a plain list archetype (D1) |
| 3 | Constant marker shape with per-state symbols | Explicitly sanctioned by `status-and-dataviz.md` for spatial maps, but must be stated (D1) |
| 4 | Admin editing is `lg`-and-up; `/admin` is read-only below the hinge | Coordinate accuracy against a 290–478px plan whose markers sit 19–31px apart is not achievable, and assignment is done up front on a desktop (D2). Read-only, not disabled, per `SKILL.md`. (The "145px plan" this line originally cited was the arithmetic row §2.4 has since retired — the real floor is worse than 145px in pitch and better in height) |
| 5 | Login off the product grid | The one sanctioned expressive moment (D4) |
| 6 | ~~Names disclosed on hover rather than drawn on every marker~~ **WITHDRAWN 2026-09-01 — this is no longer a deviation.** | It was recorded when the fit condition looked failed. Re-measured against a single-line fit-width pill, it passes: `status-and-dataviz.md`'s "put labels directly on the chart wherever they can replace a legend" is the stated default and the design now *follows* it (§3.2.1). The **seat code** moves to disclosure instead, which is not a deviation either — the code is admin information and `SKILL.md`'s "details on demand" is its proper home |
| 7 | 44px touch targets not met at `xlg` and below — **and not met anywhere, as shipped** | `SKILL.md` states the floor unqualified, and it is a hit-area rule the marker's drawn size cannot satisfy on its behalf. Below `xlg` the seats sit closer together than a conformant target, so no marker size reaches it (§2.4). The *geometry* has room at 1920 and `max`; driving the app found the shipped hit area is **32 × 32 at every one of nine widths**, so the deviation is currently universal and closing it at the two top rungs is a build task, not a design change. The 24px SC 2.5.8 floor is separately breached only in the 640–1023 band, and recovers below 640 (§2.4) |
| 8 | Name pills are fit-width, so the resting footprint varies with the label | `SeatMarker.tsx` deliberately fixes the code pill's width "so label length never changes the resting footprint", and the name tier now breaks that symmetry on purpose: a flat width costs 52px of dead space per marker and is what made the name layer uncollidable-with (§3.2.1). Uniform-width alternatives were measured — 96px leaves 28 markers colliding at 1920, 72px leaves 12, fit-width leaves 8 — so the consistency is bought back nowhere near cheaply enough to keep. The **height** stays uniform and capped at 28px, which is the dimension the nudge actually reasons about |
| 9 | Roster rows are non-interactive list items — no per-row disclosure or side panel (D1′; the admin editor mounts the same roster, D2′) | Every fact the inspector would show is already on the row, so a 40-row selection model would select nothing; a disabled row would misuse `disabled` where content must be read (`SKILL.md`'s disabled/read-only rule), and a read-only row would promise an operation that does not exist. Static rows are the honest shape, owner-confirmed 2026-09-01 |
| 10 | Interim floor membership is inferred from seat absence (owner rule 2026-09-01) | The schema can now express the floor (`seats.floor`), but the 2nd-floor seats do not exist until slice B seeds and publishes them. The inference lives in ONE dated function (`lib/floors.ts` `rosterFloorForUnseated`) and retires by itself on the first 2nd-floor publish — liveness, not a flag, so nothing has to be remembered and flipped |
| 11 | *(reserved — not taken)* | The option where the mode indicator itself toggles Published ⇄ Draft (PHASE1IA.md E2.1). Not chosen; number held so cross-references stay stable |
| 12 | `/my-seat` renders without the shell | `ui-shell.md`: the shell is present on every signed-in surface. Kept chrome-free because it is a share card glanced at on a phone; a wordmark / back-link to `/` stands in for the header. **Would change if** the sheet gains any action beyond reading (PHASE1IA.md answers 11, 15; ruling 18) |
| 13 | *(reserved — not taken)* | Per-floor search without a widen-to-building control (PHASE1IA.md E2.4). Not chosen — Focused search with a scope control ships instead (D1-b); the number re-enters only if that control slips |
| 14 | Ask Planner opens from the map surface, not a header product icon | `ui-shell.md`: product-specific utilities sit in the header and open right panels. Kept in-surface because it exists on one route in one mode (admin, draft); a header icon would appear and disappear as admins navigate, breaking the "icons don't move" rule it was meant to satisfy. Phase 2 resolves right-edge stacking with the seat inspector and the shell panels; Phase 3 applies Carbon-for-AI labelling (D2; ruling 19) |
| 15 | Seat inspector side panel is **400px**, not Carbon's 480 side-panel default | At 480 the pushed canvas's tightest marker gap falls to 42.3px and two 44px hit regions overlap; the floor holds to a 420 panel (D2, measured; D2-a). **Would change if** the marker pitch changes (a new floor plan) or the inspector gains content that cannot be read at 400. Ruled 2026-09-02 |

---

## 7. Not verified — deliberately deferred to the build

Stated plainly so nothing here reads as more settled than it is:

- **No contrast checking has been run.** `scripts/check_contrast.py --preset all` is a build-phase
  gate and no colour values are chosen in this document. No ratio is asserted anywhere above.
- **No components built, no CSS written, no tokens defined.** Per your instruction to stop here.
- ~~The height arithmetic (§2.3) is arithmetic, not measurement.~~ **Now measured** (2026-09-01,
  Playwright driving the real Chrome maximized at 1920×1080): viewport 1920×889, browser chrome 143px.
  The estimate it replaced was wrong by 17–51px and produced a conflict that does not exist (Q2, now
  dissolved). §2.4 is no longer arithmetic at all — every cell in it is now read off the running app. **The app itself has now been driven** (2026-09-01, Playwright at 1920×889 against the
  seeded viewer account): the marker-pitch pipeline predicted 50.9px and measured 50.9px, the 40px
  name-pill footprint is confirmed, and the collision problem reproduced larger than predicted
  (§3.2.1). **The full breakpoint ladder has now been driven too** (2026-09-01, nine widths from 1920
  to 320 at the measured 889px height): §2.4 and §3.2.1 carry the results. The arithmetic held to the
  decimal at every rung down to 640 and was wrong at 320 about a *behaviour* — the app pans a 1040px
  canvas below 640 rather than shrinking the plan — which moved the shipped hinge from `lg` to 640 and
  reversed the `md`-versus-`sm` verdict. **Still unverified: both themes, the keyboard path, the
  400%-zoom reflow, and every admin surface at every width.** Three gaps of our own making surfaced in
  the drive and are build tasks, not open questions: the 32 × 32 hit area against the 44px floor
  (universal, §2.4), the occupant-names toggle disappearing below 640 (§3.2.1), and the **top bar
  breaking below `md`** — measured by geometry rather than read off a screenshot: the `Ctrl K` keycap
  overprints the Filter label by 37 × 26px at 672, 640, 480 and 320, and the right-hand utilities run
  past the viewport edge at 640 (the avatar by 20px) and at 320 (the header's content is 142px wider
  than the screen, so Admin, the theme toggle and the avatar are all clipped). None of that is a
  design decision this document made; it is the current bar failing to reflow, and the shell spec (D0)
  has to answer for it. **Top-bar gap CLOSED by PR #492 (2026-09-01):** tabs go mark-only (44px) below
  `lg` and fold into the account menu below `sm`, the theme label goes `sr-only` below `md`, and the
  keycap waits for `lg` — re-measured at all nine widths plus 639/767/1023, header content equals the
  viewport at every rung and nothing is off-edge. **Hit-area gap CLOSED by PR #493 (2026-09-01):**
  `markerHitFloorMet` (lib/seatCrowding) gates a pitch-derived 44px hit region on every marker — on at
  1920 / `max` / down to a ~1500px rendered frame (68 of 68 regions at 44px, zero overlapping, every
  21px-off-centre tap landing on its own marker), off from `xlg` down where the regions would overlap
  pod-mates (§6 row 7 stands as the recorded deviation). Same runtime derivation and 2px deadband as
  the text tier. **Names-toggle gap CLOSED by PR #494 (2026-09-01):** below 640 the viewer mounts an
  icon-only names flipper (same accessible name, inline `aria-pressed`, 44px reach) in the floating
  cluster above the zoom stack; the band and its switch are untouched, and exactly one names control is
  in the tree at any width. **All three §7 build gaps are now closed (#492, #493, #494).**
- **Every breakpoint must be verified, not just the primary one.** `senior-workflow.md` pre-release
  pass 5: "Responsive — each breakpoint, not just the one you designed at." That now means five
  widths plus a 400%-zoom reflow check, per surface.
- **Both themes** and the keyboard path (skip link, landmarks, arrow-key grid on the map, Escape) are
  design obligations recorded here and verified at build.
- **§3 has been re-measured** (2026-08-31, after the assignment pass) and is no longer provisional.
  The marker-density numbers in §3.2 are computed from the live coordinates through the repo's own
  calibration transform, but they are still *geometry*, not pixels: they bound the collision problem
  rather than describe what `SeatMarker` currently paints, because they model the nudge's maximum
  reach and not its placement search. Confirm against the running app before the marker ruling is
  locked.

---

## 8. Open questions for you

1. ~~**The visual target.**~~ **RESOLVED 2026-08-31 — the skill-derived direction is the target.**
   `shell-reference.html` does not re-enter the process; the `docs/redesign` branch stays off-limits
   permanently rather than for the duration of this document. Recorded in §1. (Numbering below is
   left unchanged so existing cross-references still resolve.)
2. ~~**The bottom strip.**~~ **DISSOLVED 2026-09-01 — there was never a conflict.** The question
   assumed the plan must render at its 1911px cap, so a 40px band appeared to push it 5px off screen.
   Measured (§2.3), the viewport is 889px, the plan is aspect-locked, and height binds long before
   width: with a band it simply renders 1766 wide instead of 1854 and stays **wholly visible**. The
   band costs **4.8% of plan width**, and the 44px touch floor survives it with zero overlapping hit
   regions — even with a bookmarks bar as well. Whether to *have* a status strip is still a design
   question, but it is no longer a geometric trade and does not belong in this list.
3. ~~**The floor selector — the question inverted on 2026-09-01.**~~ **RESOLVED 2026-09-01 — (b),
   genuinely multi-floor.** Schema in PR-1 (`seats.floor` + the three RPCs, #495), viewer, reception,
   my-seat and this document in PR-2 (D1′, #497), the admin editor + Ask Planner in PR-3 (D2′), and
   the 2nd-floor raster — produced first — gates slice B. *Original entry:* This document twice called the
   control "chrome for a dimension the data does not have" and was heading for *remove it*. That was
   wrong about the building. **The firm occupies two floors and 40 of its 98 people are on the one
   this plan does not draw.** The dimension is real; it is the *schema* that cannot express it
   (`seats` has no `floor` column), and the app currently infers the 2nd floor from the absence of a
   seat. So the choice is no longer keep-or-remove, it is: **(a)** stay a 3rd-floor product that says
   plainly where everyone else works — cheap, honest today, and carrying the inference risk recorded
   in D1; or **(b)** become genuinely multi-floor — a `floor` column, a 2nd-floor plan raster, floor
   threaded through the publish RPC and the viewer's joins — which is a migration and a real feature,
   not a control. Which?
4. ~~**`reserved` and `unavailable`.**~~ **RESOLVED 2026-09-01 — ship the two states that exist.**
   `reserved` and `unavailable` keep their marker glyphs from the PR-C vocabulary and get no new
   design until data exists. *Original entry:* Still zero rows in **both layers** after the assignment pass —
   the confirmation §3.1's third consequence predicted. Filling the map moved 41 rows from
   `available` to `assigned` and produced no other state, so the two-state vocabulary now rests on
   settled data rather than on an empty map. Design the full four-state vocabulary now, or ship the
   two states that exist and add the others when they are used?
5. ~~**The department filter.**~~ **RESOLVED 2026-09-01 — keep every department; the filter becomes
   floor-aware** (D1′): a department with no seats on the floor on screen says where its people are
   and offers the switch; on the roster floor the same control counts people. *Original entry:*
   §3.3 measures it as bimodal: 4 of the 15 live departments return zero
   seats (Litigation 20 people, Medical Records 7, Front Office 3, WIL 1), while Case Management
   alone returns 38 of the 56 occupied seats. The dead options are already retired, so this is not a
   clean-up job. Do you want the filter to keep offering departments that cannot appear on the map
   — answering honestly with "Litigation: 20 people, none seated" — or to offer only the 11
   departments that have someone on the floor?
6. ~~**Names on markers.**~~ **RESOLVED 2026-09-01 — the marker carries the name.** The original
   entry here recorded the opposite, on a measurement of the shipped 124×40 two-line pill. Two owner
   observations overturned it: the pill renders `First L.` in a fixed width more than twice the text
   it holds, and it stacks a seat code the viewer never needed. Single-line and fit-width, the name
   layer places on 50 of 58 markers at 1920 with **zero** collisions the existing nudge cannot
   resolve (§3.2.1). Ruled in D1; the `≤ 28px` height ceiling comes with it.

*Resolved 2026-08-31 — admin editing below `lg`: you assign employees to seats up front, on a desktop,
so no narrow-width editing is designed. Recorded in D2 and deviation 4.*

*Resolved 2026-08-31 — Q1, the visual target: the skill-derived direction stands and
`shell-reference.html` is not re-supplied. This closes the one gap §1 flagged as a hole in the
reasoning; the remaining open questions are all narrow and all sit on measured data.*

---

**Added 2026-09-02 (PHASE1IA.md second pass):**

| # | Question | Ruling |
|---|---|---|
| Q7 | Ruling 22 retires "Reset draft" on Settings. The map's "Discard draft changes" (`SeatMap.tsx` overflow menu, `/admin`) is the same `resetDraftToPublishedAction` behind a confirm dialog. Does it go too? | **Ruled 2026-09-02 — no.** The map's "Discard draft changes" stays (scoped to the admin's editing session, sits next to Publish, already confirms); only Settings' "Reset draft" is retired. Action and `reset_draft_*` RPCs stay; Phase 4 removes the Settings entry only |

## 9. Recommended next step

The re-measure is done and §3 is current, so Q3 and Q4 are decidable on settled data rather than
deferred, and Q1, Q2 and Q6 are now answered — the skill-derived direction is the target (Q1), the
bottom strip was never a geometric conflict (Q2), and the marker carries the name (Q6). **Q3, Q4 and
Q5 were answered on 2026-09-01** (§8): the multi-floor arc is building as four PRs — schema (PR-1,
#495), viewer/reception/my-seat (PR-2, D1′, #497), admin editor + Ask Planner (PR-3, D2′ — built),
and slice B (the 2nd-floor raster, calibration and seed, blocked on the drawing, which is produced
first). The shell sequence below is unchanged, in **two** slices rather than one:

1. **The shell specification (D0), alone and first** — header, mode indicator, the `lg` navigation
   collapse, the two width regimes. Its priority is unchanged: it is the dependency for all four
   screens, and the `lg` hinge it establishes is what every other decision here is measured against.
   Getting it wrong is expensive in a way that getting one screen wrong is not.
2. **The marker and label layer (D1), immediately after.** Measurement has already written most of
   this brief, and it changed direction once (§3.2.1), so build it from the numbers rather than from
   the prose: the marker carries the **person's name**, single-line and fit-width, in a pill **≤ 28px
   tall** — the ceiling is `PILL_NUDGE_PX × 2` against a `dy = 0` pod row, and at 29px the collisions
   return. The **seat code** moves to hover, selection and the inspector. Marker hit regions are 44px
   at 1920 and `max`, pointer-scale below (deviation 7). The searched name **quiets its neighbours**
   rather than drawing over them. Expect 4 residual collisions at 1920 and let the existing solver
   place them — that is what it is for.

Nothing else starts until those two land — the multi-floor arc is the one owner-sequenced exception,
placed ahead of the shell because its schema half is invisible when merged and its viewer half retires
the D1 inference risk.
