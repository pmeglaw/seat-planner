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
  boundary. Consequence: **this document contains no evaluation of your visual target.** Every visual
  ruling below is derived from the skill alone. If the reference encodes a direction you want, it has
  to re-enter the process (§8, Q1) — I have not seen it and cannot say whether these decisions agree
  with it.

`/admin/management`, `/admin/settings` and `/my-seat` get no entry of their own; they inherit the
shell decision (D0).

**Sources actually read:** the skill's `SKILL.md`, `references/ui-shell.md`, `references/senior-workflow.md`,
`references/composition.md`, `references/status-and-dataviz.md`, `references/tokens.md`; the shipped
source for all four surfaces and the shell components; and three read-only production queries.

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

| Viewport width | Plan height at full width | Legible as a floor plan? |
|---|---|---|
| 1920 | 867px (capped at 1911) | Yes — fits entirely |
| 1584 (max) | 719px | Yes |
| 1312 (xlg) | 595px | Yes |
| **1056 (lg)** | **479px** | **Yes — the floor** |
| 672 (md) | 305px | No — 68 markers unreadable |
| 320 (sm) | **145px** | No — unusable |

At 320 the plan is a 145px-tall strip. Sixty-eight seat markers in 145px is not a small map, it is a
different product. **So the map cannot merely shrink; below `lg` the primary way to find a person
changes** (D1). That is the single largest consequence of adapting to every viewport.

---

## 3. Measured data (production, read-only, 2026-08-31)

| Fact | Value |
|---|---|
| Published seats / draft seats | 68 / 68 |
| Seats assigned | **15** |
| Seats available | **53** |
| Seats reserved / unavailable | **0 / 0** |
| Active employees | **101** |
| Departments / zones | 14 / 8 |
| Floors | **1** — `seats` has no `floor` column |

Three consequences the skill's "data first" step forces into the design:

1. **The map is mostly empty.** 15 of 68 seats are occupied. A design that treats the map as a dense
   grid of people is designing for data that does not exist.
2. **Most people are not on the map.** 101 employees, 15 seated. The commonest outcome of "find
   Sarah" is *Sarah has no seat* — so that is a primary state, not an edge case (D1).
3. **Two of four seat states are unused.** `reserved` and `unavailable` have zero rows. The live
   status vocabulary is two states, not four (D1).

Also: the floor selector fronts a single real floor (a `FloorPlaceholder` component exists). It is
chrome for a dimension the data does not have.

**The people-to-seats ratio is what makes the small screen tractable.** A directory of 101 names is a
perfectly good list at 320px. A floor plan is not. The narrow-width answer is already in the data.

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
  with. So the surface inverts at the hinge: the 101-person directory becomes the
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

**Pan and zoom change job at the hinge.** At 1920 the whole plan is visible, so zoom is an *inspection*
convenience. Below `lg` — and at high browser zoom — it is the only way to read the plan at all, so it
becomes load-bearing equipment and needs a real keyboard path, not just pointer gestures.

**States, designed before styling** (`senior-workflow.md` step 5). The measured data makes one of
these primary rather than exceptional:

| State | Design |
|---|---|
| **Person has no seat** | **Primary path, not an edge case** — 86 of 101 employees are unseated. Names the person, states plainly that they have no assigned seat, and offers department and extension instead of a dead end. Identical wording in both layouts. |
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

**Admin editing is `lg` and up. Below the hinge, `/admin` is read-only** (owner ruling, 2026-08-31:
seat assignment is done up front, on a desktop, before the redesign work begins). Narrow widths render
the draft map in the same read-only drill-down pattern D1 gives the viewer below `lg`, with the header
Draft indicator intact and a plain statement that editing needs a wider window.

This is the simplifying decision of the whole document, and it earns its place three times over:

- **It removes a capability that could corrupt production data.** Drag-to-place against a 145px-tall
  plan (§2.4) produces wrong coordinates in a live table.
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
  B. Table of all 101 people with an inline extension column.
  C. Search-only: one field, one answer, no persistent list.

Choice: A. senior-workflow.md gives list-detail to "triage; users move between items
  quickly," which is precisely a switchboard. 101 people is list-cardinality, not
  table-cardinality: the receptionist compares nothing across rows, they retrieve one
  value. B would put 101 rows and six columns on screen to answer a one-value
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
zero results with the query preserved; a person with **no seat** (86 of 101 — the detail pane must
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

---

## 7. Not verified — deliberately deferred to the build

Stated plainly so nothing here reads as more settled than it is:

- **No contrast checking has been run.** `scripts/check_contrast.py --preset all` is a build-phase
  gate and no colour values are chosen in this document. No ratio is asserted anywhere above.
- **No components built, no CSS written, no tokens defined.** Per your instruction to stop here.
- **The height arithmetic (§2.3) and the plan-height table (§2.4) are arithmetic, not measurements.**
  Both should be confirmed against your actual Chrome window before the bottom-strip question and the
  `lg` hinge are locked.
- **Every breakpoint must be verified, not just the primary one.** `senior-workflow.md` pre-release
  pass 5: "Responsive — each breakpoint, not just the one you designed at." That now means five
  widths plus a 400%-zoom reflow check, per surface.
- **Both themes** and the keyboard path (skip link, landmarks, arrow-key grid on the map, Escape) are
  design obligations recorded here and verified at build.

---

## 8. Open questions for you

1. **The visual target.** `shell-reference.html` was excluded because it only exists on the
   off-limits branch, so nothing above is checked against it. Do you want to re-supply it outside
   that branch, or is the skill-derived direction the target now?
2. **The bottom strip.** §2.3 shows a 40px persistent bottom band and a full-height floor plan cannot
   coexist at 1920×1080 — it misses by about 5px. Which wins: the plan fitting entirely on screen at
   the primary target, or a persistent status strip?
3. **The floor selector.** There is one floor and no `floor` column. Keep the control as a promise of
   future floors, or remove it until the data exists?
4. **`reserved` and `unavailable`.** Zero rows for both. Design the full four-state vocabulary now, or
   ship the two states that exist and add the others when they are used?

*Resolved 2026-08-31 — admin editing below `lg`: you assign employees to seats up front, on a desktop,
so no narrow-width editing is designed. Recorded in D2 and deviation 4.*

---

## 9. Recommended next step

Answer Q1–Q4, then I write the shell specification (D0) alone and build it as one reviewable slice —
header, mode indicator, the `lg` navigation collapse, and the two width regimes — before any screen
work. The shell is the dependency for all four screens, and the `lg` hinge it establishes is what
every other decision here is measured against; getting it wrong is expensive in a way that getting one
screen wrong is not.
