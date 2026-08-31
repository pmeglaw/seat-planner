# Shell redesign v2 — decision document

**Branch:** `redesign-v2` (from `main` @ 8f925db) · **Date:** 2026-08-31 · **Status:** for owner review, nothing built

Method: decisions derived from the `ibm-design-language` skill (design-system v1.3.0) plus the shipped
code and measured production data. Every ruling below traces to a named rule in that skill or to a
measured number in §2/§3 — not to precedent.

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

## 2. The frame — a fixed 1920×1080 viewport

Every user is at a desktop with two 27" 1920×1080 monitors, **browser on one monitor**. So the design
target is one fixed 1920×1080 viewport. No spanning layout, no ultra-wide, no effort spent below
desktop.

**Usable height is not 1080.** Chrome maximized on Windows 11 spends roughly 92–126px on its own
chrome (tab strip, toolbar, optional bookmarks bar, window border). Working viewport is **≈950–990px**.
Everything below budgets against **950** so the tightest real configuration still works.

**Width against the Carbon grid.** The 2x Grid's largest breakpoint is `max` at **1584px** — 16 columns,
24px margin, 32px gutter. A 1920 viewport is **336px past the end of the published grid**. That gap has
to be ruled on, not drifted into; it is D0's second decision. (`tokens.md` does mention 1920×1080, but
only as a *video artboard* with a 7.5px mini unit — that is not the UI grid and is not applied here.)

**The height budget is genuinely tight, and it decides a component.** The floor plan is 1911×867 at its
display cap (aspect 2.204:1). At full width it is **867px tall**:

| Configuration | Map width | Map height | Fits in 950? |
|---|---|---|---|
| 48px header only | 1911 (capped) | 867 | 902 available — yes, 35px spare |
| 48px header + 40px bottom band | 1911 | 867 | 862 available — **no, 5px short** |
| 48px header + 48px left rail | 1872 | 849 | 902 available — yes, 53px spare |

**Reading:** at the hardware target the entire floor plan fits on screen at 100% with a header and
nothing else. Adding a persistent bottom strip breaks that by single-digit pixels. This is the single
most consequential number in the document and it constrains D1 and D2.

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

---

## 4. The Hill

*Who / What / Wow*, one per project, per `senior-workflow.md`:

> **Anyone at the firm** can find where a colleague sits, and **an admin** can rearrange the floor and
> publish it, **without ever wondering which version of the map they are looking at.**

Every decision below is tested against that last clause — the draft/published split is this product's
defining complexity, and `ui-shell.md` puts it in the header by name.

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
  A. Header + left panel (256px expanded / 48px icon rail). What ships today: a 40px
     bar plus a 48px fixed rail with overlay expansion.
  B. Header only, with header links for the sections. ui-shell.md: "Header only — a
     small number of main sections, no secondary navigation."
  C. Header + right panel for system content, no left navigation.

Choice: B — header only, 48px, full width, fixed, on every surface including the
  viewer map. The skill's own trigger for a left panel is "more than five secondary
  items or users switch between them frequently." This product has FOUR sections
  (Seat map, Management, Settings, Reception); an admin sees four, a viewer sees one.
  Four sections do not earn a left panel, and at the 1920×1080 target the rail costs
  48px of map width for navigation that fits in the header. It also removes the
  second chrome: the viewer currently renders its own 36px header while shell routes
  render a 40px bar — two implementations, neither at Carbon's 48px.
Trade-off: no room for sub-menus that stay open, and no obvious home for a fifth
  section. Adding one means either a header sub-menu or reopening this decision.
  Deliberate: the fifth section does not exist and should not be designed for.
Would change if: a fifth or sixth top-level section is committed to, or a section
  grows secondary navigation of its own.
```

**Second decision inside D0 — the 1920 grid.** Options: cap the live area at 1584 and centre it
(168px dead margin each side); let the grid run fluid to 1920; or split by surface type.

**Choice: split by surface type, and record it as a purposeful deviation.** The map stage is a
*canvas* — every pixel is data, and capping it at 1584 would shrink the floor plan by 17% for no
reason — so the map runs **fluid to the full 1920**, with the raster's own 1911px cap as the natural
stop. Text-dense surfaces (reception detail, settings, management, login form column) hold a
**1584px live area, centred**, on 16 columns with 24px margin and 32px gutter, because reading
measure is a typographic constraint that does not improve with width. Trade-off: two width regimes in
one product, which is exactly the inconsistency `ui-shell.md` warns costs re-orientation — accepted
because the surfaces are visually distinct enough (canvas vs. document) that no user crosses between
them expecting the same frame.

**Header anatomy** (fixed by `ui-shell.md`, not open to preference):

| Slot | Content | Note |
|---|---|---|
| Left | Firm wordmark → links to `/` | No hamburger — there is no collapsible panel |
| Header links | Seat map · Management · Settings · Reception | Role-filtered; a viewer sees Reception only |
| **Mode indicator** | **Draft / Published** | See below — persistent, every screen |
| Utilities (flush right, no gaps, 48×48) | Theme · Help · Account | Product-specific first, then Help 4th-from-right, Account 2nd-from-right |
| Switcher | **None** | Standalone product, not a platform — the system half stays nearly empty |

**The mode indicator is a requirement, not a flourish.** `ui-shell.md` is explicit: "If a product has
a draft/published split … the header is where that belongs, persistently, on every screen." This app's
central invariant is that two-layer split. The header carries it on all four surfaces — on the viewer
it reads *Published · <date>*, on admin *Draft — N unpublished changes*. This is the Hill's last
clause made structural.

Two further shell rules taken as given: **no switcher, ever** (standalone), and **state goes in the
URL** — view, filters, selection and mode — because `ui-shell.md` says persistence "is not part of
the component and must be added during implementation."

---

### D1 — Map (`/`, viewer)

```
Screen: Map — the viewer's seat finder
Problem: "Where does Sarah sit?" and, less often, "who is sitting here?"
Primary task: locate one named person on the floor plan.

Options considered:
  A. Map-first: the floor plan is the page; search floats over it.
  B. Split: a persistent people list beside the plan, list-detail style.
  C. Search-first: a search page that reveals the map once a person is chosen.

Choice: A — map-first, floor plan full-bleed and fluid to 1920, search as a single
  floating Find affordance anchored top-left. The measured numbers decide it: at
  1920×1080 the ENTIRE plan fits on screen at 100% under a 48px header (§2), so the
  spatial answer is available without pan, zoom or scroll. That is the whole value of
  the surface and no other layout preserves it. B spends 300–400px of that width on a
  list of 101 names that is only ever used to pick one. C hides the map behind an
  interaction, which status-and-dataviz.md rules out directly: "never hide something
  important behind an interaction."
Trade-off: browsing "who is in Litigation?" is weaker than a list would make it —
  it becomes a filter that highlights markers rather than a readable roster. Accepted:
  the firm has 14 departments over 68 seats; the roster question is what Reception is
  for.
Would change if: usage shows browse-by-department outweighing find-by-name, or the
  floor plan grows past what fits at 1920 (a second floor, or seats past ~120).
```

**States, designed before styling** (`senior-workflow.md` step 5). The measured data makes one of
these primary rather than exceptional:

| State | Design |
|---|---|
| **Person has no seat** | **Primary path, not an edge case** — 86 of 101 employees are unseated. The result names the person, states plainly that they have no assigned seat, and offers their department and extension instead of a dead end. |
| Nothing published | Educational empty state over the plan, naming the next step. |
| No search results | Distinct from the above; keeps the query visible and reports **zero** explicitly — `SKILL.md`: "Always publish the number of results, zero included." |
| Loading | Skeleton over the plan area; the raster is preloaded from `/login` already. |
| Error | Inline notification in the map region, with retry. |

**Seat status vocabulary.** Four enum states exist; **two have data**. `status-and-dataviz.md` is
unambiguous where a spatial map forces one shape: "If a spatial map genuinely forces a constant shape
(every seat is a square), compensate with a distinct symbol or texture per state and say so
explicitly." So: seat markers keep one constant footprint (they are positions on a plan and cannot
change shape without lying about geometry), and each state gets a **distinct interior symbol**, not a
colour swap. Two live states — assigned and available — is well inside the five-indicator budget, and
`reserved` / `unavailable` get symbols specified but not designed into the primary read until data
exists.

**Deliberate deviation, recorded:** the archetype table in `senior-workflow.md` has no "spatial
canvas" entry. This screen is a hybrid — *search results* semantics over a fixed-coordinate canvas.
Recorded here because the skill requires deviations be written down rather than absorbed.

---

### D2 — Admin (`/admin`)

```
Screen: Admin — the draft seat-map editor
Problem: "Someone moved desks. I need to change the map, check it looks right, and
         push it live for everyone."
Primary task: assign or move one person to one seat.

Options considered:
  A. Overlay inspector floating over the plan (what ships today).
  B. Slide-in side panel that pushes the map and does not trap focus.
  C. Modal per seat edit.

Choice: B — a 480px slide-in side panel, pushing the map rather than covering it.
  composition.md: "Side panel — medium complexity where the user needs the page
  behind it," and the slide-in/slide-over split is explicit: slide-in "pushes page
  content and does not trap focus" because it is part of the page. Editing a seat is
  exactly that task — you assign someone while looking at who sits around them, so
  occluding the neighbours defeats the check. The 1920 frame is what makes this
  affordable: 1920 − 480 = 1440px of map, still wider than the 1056 `lg` breakpoint,
  and the plan re-fits rather than being hidden. C is ruled out by the same file:
  never more than four fields, and never a modal that might need a confirmation on
  top of it.
Trade-off: the map reflows when the panel opens, so marker positions shift under the
  cursor mid-task. Mitigation is a decision for the build, not this document — but
  the alternative (an overlay that hides the neighbours you are checking) is worse
  for the primary task.
Would change if: the reflow measurably disrupts placement accuracy in use, in which
  case the panel becomes an overlay and loses the push.
```

**Publish is the product's most consequential action and gets ruled separately.** Publishing replaces
what every viewer sees, and per `SKILL.md`'s destructive table it is at least **moderate** — "can't be
undone easily, or affects several things" — requiring the consequences spelled out. The review is not
a small confirmation: it diffs seats *and* employee-detail changes and can run long.

**Choice: the publish review is a wide tearsheet, not a modal.** `SKILL.md` forbids the alternative in
one line — "never put large or complex data in a dialog — that's a page" — and `composition.md` gives
the tearsheet to "complex or interactive, or two or more distinct steps," with no top-right close, so
leaving is a decision made through Cancel. Trade-off: heavier than a dialog for a two-seat change.
Accepted, because the failure mode being designed against is an admin publishing a diff they did not
read.

**Modes and unsaved work.** The header's Draft indicator (D0) carries the count of unpublished
changes on every screen, so an admin who wanders to Management and back cannot lose track of pending
edits. Per `ui-shell.md`, if state will be lost, say so before it is.

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
  A. List-detail split — results list beside a detail pane.
  B. Table of all 101 people with inline extension column.
  C. Search-only: one field, one answer, no persistent list.

Choice: A — list-detail. senior-workflow.md gives this archetype to "triage; users
  move between items quickly," which is precisely a switchboard. 101 people is
  list-cardinality, not table-cardinality: the receptionist compares nothing across
  rows, they retrieve one value. B would put 101 rows and six columns on screen to
  answer a one-value question. C loses the caller's place when a name is misheard
  and has to be re-tried.
Trade-off: the detail pane is idle whenever nobody is selected — real screen area
  spent on an empty state. Accepted: it is the readout the whole screen exists to
  produce, and a pane that appears and disappears would move the number the
  receptionist is reading aloud.
Would change if: the directory outgrows roughly 300 people, at which point faceted
  filtering matters more than a persistent detail pane.
```

**Density is resolved by zone, not by screen** (`senior-workflow.md`): the results list is **dense** —
it is scanned — while the detail pane is **calm**, because it is read aloud under time pressure. That
split is the reason not to apply one spacing rhythm across the surface.

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
  A. Split screen — brand panel beside the form column.
  B. Centred single card on a plain ground.
  C. Full-bleed floor-plan background with the form floating over it.

Choice: A — split screen, and it is the ONE expressive moment in the product.
  ui-shell.md draws the hard line here: "Scope: products only … the shell is the
  chrome of a tool a user is signed into." So the 48px header from D0 does not appear
  on this screen, and login is therefore the only surface not bound to the productive
  frame. composition.md allows "one full-bleed, container-free moment per flow at
  most — that's an expressive moment, and it should be deliberate." This is that
  moment, spent deliberately, once. B works and is duller; C fails because the map
  behind auth is the product's private data and using it as decoration blurs what is
  and isn't behind the login.
Trade-off: the split makes login the only screen not on the product's grid regime,
  which is a consistency cost paid knowingly for the one screen every user sees
  before they are a user.
Would change if: sign-in frequency rises to daily-plus, at which point the expressive
  panel is friction on a high-frequency path and B wins on frequency × visibility.
```

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
| 1 | Two width regimes — map fluid to 1920, documents capped at 1584 | The grid ends at 1584; a canvas loses data when capped, a text column does not gain from width (D0) |
| 2 | Spatial-canvas archetype not in the archetype table | The map is search-results semantics over fixed coordinates (D1) |
| 3 | Constant marker shape with per-state symbols | Explicitly sanctioned by `status-and-dataviz.md` for spatial maps, but must be stated (D1) |
| 4 | Login off the product grid | The one sanctioned expressive moment (D4) |

---

## 7. Not verified — deliberately deferred to the build

Stated plainly so nothing here reads as more settled than it is:

- **No contrast checking has been run.** `scripts/check_contrast.py --preset all` is a build-phase
  gate and no colour values are chosen in this document. No ratio is asserted anywhere above.
- **No components built, no CSS written, no tokens defined.** Per your instruction to stop here.
- **The tight height budget (§2) is arithmetic, not a measurement.** It should be confirmed against
  your actual Chrome window before the bottom-strip question is settled.
- **Both themes** and the keyboard path (skip link, landmarks, arrow-key grid on the map, Escape)
  are design obligations recorded here and verified at build.

---

## 8. Open questions for you

1. **The visual target.** `shell-reference.html` was excluded because it only exists on the
   off-limits branch, so nothing above is checked against it. Do you want to re-supply it outside
   that branch, or is the skill-derived direction the target now?
2. **The bottom strip.** §2 shows a 40px persistent bottom band and a full-height floor plan cannot
   coexist at 1920×1080 — it misses by about 5px. Which wins: the plan fitting entirely on screen, or
   a persistent status strip?
3. **The floor selector.** There is one floor and no `floor` column. Keep the control as a promise of
   future floors, or remove it until the data exists?
4. **`reserved` and `unavailable`.** Zero rows for both. Design the full four-state vocabulary now, or
   ship the two states that exist and add the others when they are used?

---

## 9. Recommended next step

Answer Q1–Q4, then I write the shell specification (D0) alone and build it as one reviewable slice —
header, mode indicator, navigation, and the two width regimes — before any screen work. The shell is
the dependency for all four screens; getting it wrong is expensive in a way that getting one screen
wrong is not.
