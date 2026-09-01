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

**One measured exception, recorded in §3.2: the *label* layer has no hinge.** Marker pitch falls
continuously from 56.1px at 1920 to 9.4px at 320, and the name layer fails at the **primary target**
rather than at any breakpoint. That is a density budget carried at every width, not a second layout
switch — `lg` remains the one layout hinge.

**320 is an obligation, not a nicety.** WCAG 1.4.10 Reflow is met at 320px-equivalent, which a user at
400% browser zoom on their own 1920 monitor produces exactly. No horizontal scrolling, no loss of
function, at any width down to 320.

### 2.2 Above the grid: the 1920 primary target

A 1920 viewport is **336px past `max`**. That gap is ruled in D0 rather than drifted into.
(`tokens.md` does mention 1920×1080, but only as a *video artboard* with a 7.5px mini unit — that is
not the UI grid and is not applied here.)

### 2.3 The height budget at the primary target

Usable height is not 1080. Chrome maximized on Windows 11 spends roughly 92–126px on its own chrome,
leaving **≈950–990px**. Everything budgets against **950** so the tightest real configuration works.

The floor plan is 1911×867 at its display cap (aspect 2.204:1):

| Configuration | Map width | Map height | Fits in 950? |
|---|---|---|---|
| 48px header only | 1911 (capped) | 867 | 902 available — yes, 35px spare |
| 48px header + 40px bottom band | 1911 | 867 | 862 available — **no, 5px short** |
| 48px header + 48px left rail | 1872 | 849 | 902 available — yes, 53px spare |

**Reading:** at the primary target the entire floor plan fits on screen at 100% with a header and
nothing else — a persistent bottom strip breaks that by single-digit pixels. This finding is
**specific to 1920** and does not generalize down the ladder; §2.4 is where it stops holding.

### 2.4 Where the plan stops fitting — and why `lg` is the hinge

Plan height at each width, at the 2.204:1 aspect:

| Viewport width | Plan height | Min marker pitch | Markers <44px apart | Markers <24px apart | Largest marker w/ 4px gap | Verdict |
|---|---|---|---|---|---|---|
| 1920 | 867px (capped at 1911) | 56.1px | 0 of 68 | 0 of 68 | 52.1px | Yes — fits entirely, and the only rung with room for a 44px target plus its gap |
| 1584 (max) | 719px | 46.5px | 0 of 68 | 0 of 68 | 42.5px | Yes — the lowest rung at which no two markers sit closer than 44px |
| 1312 (xlg) | 595px | 38.5px | 32 of 68 | 0 of 68 | 34.5px | Plan readable; 44px hit regions start to overlap here — 22 pairs (deviation 7) |
| **1056 (lg)** | **479px** | **31.0px** | **50 of 68** | **0 of 68** | **27.0px** | **The floor for reading the plan — clears the 24px SC 2.5.8 target floor; 44px hit regions overlap here (deviation 7)** |
| 672 (md) | 305px | 19.7px | 60 of 68 | **38 of 68** | 15.7px | No — conformance fails, not merely legibility |
| 320 (sm) | **145px** | 9.4px | 68 of 68 | **61 of 68** | 5.4px | No — unusable |

The three right-hand columns are measured, not judged — same method as §3.2: the live coordinates run
through the repo's own calibration transform.

At 320 the plan is a 145px-tall strip. Sixty-eight seat markers in 145px is not a small map, it is a
different product. **So the map cannot merely shrink; below `lg` the primary way to find a person
changes** (D1). That is the single largest consequence of adapting to every viewport.

**And the hinge is geometric, not judged.** The first version of this table rated the bottom two rows
"unreadable" and "unusable" from the raster alone. Counting markers whose nearest neighbour sits
closer than **24px** — WCAG 2.5.8's minimum target size, and the same threshold its spacing exception
tests — gives **0 of 68 at `lg` and above, 38 of 68 at `md`, 61 of 68 at `sm`**. A tappable marker
layer is conformant at `lg` and up and geometrically impossible at `md` and below **at any marker
size**, because the seats themselves sit closer together than a conformant target. That is why the
surface inverts at the hinge instead of shrinking through it.

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
| 1920 | 56.1px | **none** |
| 1584 (max) | 46.5px | **none** |
| 1312 (xlg) | 38.5px | 22 pairs across 32 markers |
| 1056 (lg) | 31.0px | 44 pairs across 50 markers |

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

**Re-measured 2026-08-31**, after the owner's assignment pass and the publish that followed it
(`publish_events` row 42, 21:35 UTC). The morning snapshot this replaces is kept in the right-hand
column so the movement is visible. **These are the numbers to build against.**

| Fact | Now | Snapshot it replaces |
|---|---|---|
| Published seats / draft seats | 68 / 68 — **identical**, nothing unpublished | 68 / 68 |
| Seats assigned | **56** | 15 |
| Seats available | **12** | 53 |
| Seats reserved / unavailable | **0 / 0** | 0 / 0 |
| Active employees | **99** (101 rows, 2 inactive) | 101 |
| People seated / unseated | **56 / 43** | 15 / 86 |
| `department_options` rows | **27**, of which **12 match nobody** | 14 |
| `zone_options` rows | 8, all 8 in use | 8 |
| `published_employees` drift | **none** — 99 rows, exact match to live | not recorded |
| Custom seats (`is_custom`) | 8 of 68 | not recorded |
| Floors | **1** — `seats` has no `floor` column | 1 |

The floor is **82% occupied**. The twelve empty seats are scattered across six of the eight zones
(North Pod 5, Center Desks 3, then one each in Northeast Pod, East Pod, Center West and Southeast
Office); West Pod and South Offices are full.

### 3.1 The three consequences, re-decided

1. **Inverted, exactly as predicted.** "The map is mostly empty" is dead. 56 of 68 seats are
   occupied, so the map *is* a dense field of people and a design may treat it as one. What the old
   entry got wrong is where the cost lands: it expected marker legibility to become a problem at the
   `lg` floor. It becomes a problem at **1920** — §3.2.
2. **Weakened, not inverted — and it moved less than predicted.** 43 of 99 people have no seat: 43%,
   not the "roughly a third" the old entry forecast. But the shape of the fact changed more than the
   size did. The unseated are **not scattered, they are whole departments**: Litigation (20 people),
   Medical Records (7), Front Office (3) and WIL (1) have **zero** seated members, which is 31 of the
   43. So "person has no seat" is not an individual edge case being smoothed over — for a third of
   the firm it is the normal, permanent answer, and it is predictable from their department. D1 must
   still design the state properly; it should stop describing it as the *optimized* path and start
   describing it as a **team-shaped** one.
3. **Stands unchanged.** `reserved` and `unavailable` still have zero rows. The live status
   vocabulary is two states, not four (D1). Filling seats moved rows between `available` and
   `assigned` only, as the old entry said it would.

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

**A 44px touch target is reachable only at 1920.** It survives at `max` by 2.5px and is impossible at
`xlg` and below. The tightest pair on the floor is NE02/NE03 at 56.1px; Northeast Pod, East Pod and
West Pod set the floor in that order. So marker size is not a free variable below the primary
target — it is dictated by the pods.

**The name layer is the casualty, and it fails at the primary target.** Taking the shipped resting
geometry from `lib/seatCrowding.ts` (`TEXT_TIER_NAME_OBSTACLE_PX`, 124×40) over the 56 assigned seats:

| Viewport | Name-pill collisions (124×40, 56 markers) | Code-pill collisions (46×24, 68 markers) |
|---|---|---|
| 1920 | **24 pairs — 39 of 56 markers (70%)** | 0 |
| 1584 (max) | 29 pairs — 44 markers | 0 |
| 1312 (xlg) | 38 pairs — 49 markers | 7 pairs — 14 markers |
| 1056 (lg) | 87 pairs — 52 markers (93%) | 14 pairs — 28 markers |

The same geometry on the **old 15-seat data** produced **zero** collisions at 1920, `max` and `xlg`.
The name tier was collision-free on the snapshot and is not on the real floor.

**The existing nudge cannot rescue it.** `PILL_NUDGE_PX` is 14 — ±14px vertical, so 28px of
separation at best, against a 40px pill. Pod-mates share a row, so the overlap is almost purely
horizontal: C01/C02 `dx=100 dy=1`, CW01/CW02 `dx=74 dy=0`, E02/E03 `dx=59 dy=0`. **All 24 collisions
at 1920 are geometrically beyond its reach** (97% at `max` and `xlg`, 57% at `lg`). The code pill is
the mirror image: nothing collides at 1920 or `max`, and every collision at `xlg` and `lg` is inside
the nudge's reach.

**Reading: a persistent name-per-marker layer is not available at any width on a filled floor.** The
marker carries its code; the name is disclosed on hover, focus or selection, or read from a list
beside the plan. That is a ruling the data forces rather than a preference, and it belongs in D1.

*Method caveat: the collision counts are centred-rectangle overlaps of the resting footprints. They
model the nudge's maximum reach, not the solver's actual placement search, so they bound the problem
rather than describe the pixels the app currently paints.*

### 3.3 Two facts the old snapshot did not record

4. **The department filter is bimodal, and that is a design problem, not a data problem.**
   `department_options` holds 27 rows, but 12 of them are already retired (`active = false`) — the
   near-duplicates (`CM`, `Exec`, `IT & Admin`, `Records`), the umbrella groupings, and one **zone**
   name that ended up in the department list (`West Pod`). The viewer filters on `active` when it
   reads the table (`app/page.tsx:58`) and renders the result as a `<select>`, not a chip row, so the
   dead options never reach a user. **The option list is clean.** What is not clean is what the live
   options *do* over the map: of the 15 active departments, only **11 have anyone seated**. Choosing
   Litigation — the second-largest department in the firm at 20 people — returns **zero seats** on a
   map that is 82% full; Medical Records (7), Front Office (3) and WIL (1) do the same. At the other
   end, Case Management holds **38 of the 56 occupied seats (68%)**, so the commonest selection
   highlights two-thirds of the floor. A control whose outcomes are "nothing" or "most of the map"
   discriminates poorly in both directions — §8, Q5.
5. **The directory is complete and uniform.** Every active employee has a department, a position, an
   extension and an email; **none** has an avatar. Names run to 22 characters, mean 13.5; the longest
   department name in use is 17. Seat labels are at most 4 characters. One seat carries a note.

Also unchanged: the floor selector fronts a single real floor (a `FloorPlaceholder` component
exists). It is chrome for a dimension the data does not have.

**The people-to-seats ratio still makes the small screen tractable.** A directory of 99 names is a
perfectly good list at 320px. A floor plan is not. That argument never depended on how many people
were seated, and it survives the re-measure intact.

---

## 4. The Hill

*Who / What / Wow*, one per project, per `senior-workflow.md`:

> **Anyone at the firm** can find where a colleague sits, and **an admin** can rearrange the floor and
> publish it, **without ever wondering which version of the map they are looking at.**

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
| Left | Firm wordmark → links to `/` | Hamburger (48×48), then wordmark |
| Header links | Seat map · Management · Settings · Reception, inline | Collapsed into the overlay panel, **above** any panel items |
| **Mode indicator** | **"Draft — 3 unpublished changes" / "Published · <date>"** | Compressed, never dropped — see below |
| Utilities (flush right, no gaps, 48×48) | Theme · Help · Account | Account only; Theme and Help move into the panel |
| Switcher | **None** — standalone product, not a platform | None |

**The mode indicator is a requirement, not a flourish.** `ui-shell.md` is explicit: "If a product has
a draft/published split … the header is where that belongs, persistently, on every screen." This app's
central invariant is that two-layer split, and it is the Hill's last clause. It therefore **survives to
320px** by degrading in three steps rather than disappearing: full sentence at `lg`+, `Draft · 3` at
`md`, and a status mark plus count at `sm`. Dropping it on small screens would be dropping the one
thing the product promises never to leave ambiguous.

Two further shell rules taken as given: **no switcher, ever** (standalone), and **state goes in the
URL** — view, filters, selection and mode — because `ui-shell.md` says persistence "is not part of
the component and must be added during implementation." The URL rule matters more now: it is what lets
a person move between the narrow list view and the wide map view without losing their place.

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
  Find affordance. The measured numbers decide it: at 1920 the ENTIRE plan fits on
  screen at 100% under a 48px header (§2.3), so the spatial answer needs no pan, zoom
  or scroll. That is the whole value of the surface.
  Below lg that is simply untrue — §2.4: 305px tall at md, 145px at sm, with 68
  markers on it. A is therefore rejected on measurement, not taste: it ships an
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

**The resting label is the seat code; names are a disclosure tier.** §3.2 measures why: the shipped
124×40 name pill collides in 24 pairs across 39 of the 56 assigned markers at the 1920 primary
target, and all 24 are beyond the ±14px reach of `seatCrowding`'s nudge because pod-mates share a
row. The widest name pill that collides with nothing at 1920 is **59.5px** — against a 22-character
longest name that is not a tuning gap, it is 2.1×. The 46×24 code pill, by contrast, collides zero
times at 1920 and `max`, and every collision at `xlg` (7 pairs) and `lg` (14 pairs) sits inside the
nudge's reach. The longest seat label is 4 characters, so the code pill is correctly sized for what it
actually carries. Two riders make this a trade rather than a loss: **the searched or selected person's
name always draws, and draws above its neighbours**, so the one name the task asked for never loses a
z-fight; and a show-all-names overview stays available but **reports its own incompleteness** — at
1920 it can place 39 of 56 names cleanly, 44 with a shorter 92×34 pill, and the rest need zoom.

**Pan and zoom change job at the hinge.** At 1920 the whole plan is visible, so zoom is an *inspection*
convenience. Below `lg` — and at high browser zoom — it is the only way to read the plan at all, so it
becomes load-bearing equipment and needs a real keyboard path, not just pointer gestures.

**States, designed before styling** (`senior-workflow.md` step 5). The measured data makes one of
these primary rather than exceptional:

| State | Design |
|---|---|
| **Person has no seat** | Re-measured (§3.1): **43 of 99** employees are unseated — no longer the majority path, still 43% of lookups. And it is **team-shaped**, not scattered: Litigation, Medical Records, Front Office and WIL have zero seated members, which is 31 of the 43. So the state names the person, says plainly that they have no assigned seat, offers department and extension instead of a dead end, and — where their whole department is unseated — says that rather than implying an individual omission. Identical wording in both layouts. |
| Nothing published | Educational empty state over the plan, naming the next step. |
| No search results | Distinct from the above; keeps the query visible and reports **zero** explicitly — `SKILL.md`: "Always publish the number of results, zero included." |
| Loading | Skeleton over the plan area; the raster is preloaded from `/login` already. |
| Error | Inline notification in the map region, with retry. |

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

- **It removes a capability that could corrupt production data.** Drag-to-place against a 145px-tall
  plan (§2.4) produces wrong coordinates in a live table — now quantified: median marker separation
  at 320 is 11.1px with **61 of 68** markers within 24px of a neighbour, and at `md` 23.3px median
  with 38 within 24px. A drag at that scale cannot resolve which seat it is targeting. (Seat geometry,
  invariant to assignment — 68 markers before the re-measure and 68 after.)
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
zero results with the query preserved; a person with **no seat** (43 of 99 — the detail pane must
read correctly with the seat line absent, not blank); and a person with no extension.

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

---

## 6. Deviations from Carbon, recorded

`senior-workflow.md` requires purposeful deviations be written down rather than absorbed:

| # | Deviation | Why |
|---|---|---|
| 1 | Two width regimes — map fluid at all widths, documents capped at 1584 above `max` | The published grid ends at 1584; a canvas loses data when capped, a text column does not gain from width (D0) |
| 2 | Spatial-canvas archetype not in the archetype table | The map is search-results semantics over fixed coordinates; below `lg` it resolves to a plain list archetype (D1) |
| 3 | Constant marker shape with per-state symbols | Explicitly sanctioned by `status-and-dataviz.md` for spatial maps, but must be stated (D1) |
| 4 | Admin editing is `lg`-and-up; `/admin` is read-only below the hinge | Coordinate accuracy against a 145px plan is not achievable, and assignment is done up front on a desktop (D2). Read-only, not disabled, per `SKILL.md` |
| 5 | Login off the product grid | The one sanctioned expressive moment (D4) |
| 6 | Names disclosed on hover/focus/selection rather than drawn on every marker | `status-and-dataviz.md` says never hide something important behind an interaction — but the same bullet mandates "details on demand", and `SKILL.md` resolves discoverability-vs-simplicity as progressive disclosure. Direct labelling is still the stated default, conditioned on fit, and geometry fails that condition: the widest collision-free name pill at 1920 is 59.5px against a 124px shipped pill and a 22-character longest name (§3.2). Recorded as a deviation rather than a neutral choice (D1) |
| 7 | 44px touch targets not met at `xlg` and below | `SKILL.md` states the floor unqualified, and it is a hit-area rule the marker's drawn size cannot satisfy on its behalf. Below `xlg` the seats themselves sit closer together than a conformant target, so no marker size reaches it (§2.4). Met outright at 1920 and `max` |

---

## 7. Not verified — deliberately deferred to the build

Stated plainly so nothing here reads as more settled than it is:

- **No contrast checking has been run.** `scripts/check_contrast.py --preset all` is a build-phase
  gate and no colour values are chosen in this document. No ratio is asserted anywhere above.
- **No components built, no CSS written, no tokens defined.** Per your instruction to stop here.
- **The height arithmetic (§2.3) is arithmetic, not measurement.** It should be confirmed against
  your actual Chrome window before the bottom-strip question (Q2) is locked. §2.4's plan heights are
  arithmetic too, but its three right-hand columns are now measured from the live coordinates, so the
  `lg` hinge no longer rests on judgement.
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
2. **The bottom strip.** §2.3 shows a 40px persistent bottom band and a full-height floor plan cannot
   coexist at 1920×1080 — it misses by about 5px. Which wins: the plan fitting entirely on screen at
   the primary target, or a persistent status strip?
3. **The floor selector.** Unmoved by the assignment pass: still one floor, still no `floor` column
   on `seats`, while the seat numbers around it moved hard (assigned 15 → 56, available 53 → 12).
   This one was never waiting on data — the control fronts a dimension the schema does not have, and
   only a migration adds it. Keep it as a promise of future floors, or remove it until the data
   exists?
4. **`reserved` and `unavailable`.** Still zero rows in **both layers** after the assignment pass —
   the confirmation §3.1's third consequence predicted. Filling the map moved 41 rows from
   `available` to `assigned` and produced no other state, so the two-state vocabulary now rests on
   settled data rather than on an empty map. Design the full four-state vocabulary now, or ship the
   two states that exist and add the others when they are used?
5. **The department filter.** §3.3 measures it as bimodal: 4 of the 15 live departments return zero
   seats (Litigation 20 people, Medical Records 7, Front Office 3, WIL 1), while Case Management
   alone returns 38 of the 56 occupied seats. The dead options are already retired, so this is not a
   clean-up job. Do you want the filter to keep offering departments that cannot appear on the map
   — answering honestly with "Litigation: 20 people, none seated" — or to offer only the 11
   departments that have someone on the floor?
6. **Names on markers.** §3.2 measures that a persistent name-per-marker layer collides on 70% of
   markers at the 1920 primary target on the filled floor, and that the existing ±14px nudge cannot
   resolve any of it. The marker therefore carries its code, with the name disclosed on hover, focus
   or selection. Confirm that trade — it is the one place where filling the floor took a capability
   away rather than adding one.

*Resolved 2026-08-31 — admin editing below `lg`: you assign employees to seats up front, on a desktop,
so no narrow-width editing is designed. Recorded in D2 and deviation 4.*

*Resolved 2026-08-31 — Q1, the visual target: the skill-derived direction stands and
`shell-reference.html` is not re-supplied. This closes the one gap §1 flagged as a hole in the
reasoning; the remaining open questions are all narrow and all sit on measured data.*

---

## 9. Recommended next step

The re-measure is done and §3 is current, so Q3 and Q4 are decidable on settled data rather than
deferred (Q2 was never data-blocked, and Q1 is now answered — the skill-derived direction is the
target). Answer Q2–Q6, then build in **two** slices rather than one:

1. **The shell specification (D0), alone and first** — header, mode indicator, the `lg` navigation
   collapse, the two width regimes. Its priority is unchanged: it is the dependency for all four
   screens, and the `lg` hinge it establishes is what every other decision here is measured against.
   Getting it wrong is expensive in a way that getting one screen wrong is not.
2. **The marker and label layer (D1), immediately after.** The re-measure turned this from a
   hypothetical about the `lg` floor into a measured failure at the **primary** target: 24 name-pill
   collisions across 39 of 56 assigned markers at 1920, none of them rescuable by the shipped ±14px
   nudge. Most of the brief is already fixed by measurement — seat code at rest, names on
   hover/focus/selection, marker diameter ≤52px at 1920 and ≤27px at `lg`, the searched name always
   drawn on top.

Nothing else starts until those two land.
