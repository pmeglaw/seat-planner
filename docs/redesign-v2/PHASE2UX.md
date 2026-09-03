# Seat Planner redesign — Phase 2: UX and wireframes

**Status: in progress. Slice 1 (shell) — 2026-09-02.** Companion to `PHASE1IA.md` (the fixed IA) and
`DECISIONS.md` (the decision log; Phase 2 appends D0-f…, D1-c…, D3/D5/D6 amendments, §6 deviations).
Wireframes live in `wireframes/*.html` — low-fi, static, grayscale, framed at 1920×1080 with one
narrow frame at 1024. **No application code, tokens, components or `@carbon/*` dependency.** Phase 3
owns colour and the component layer; Phase 4 owns code.

## 0. Method and inputs

Sequence per `senior-workflow.md`: job → data → one primary → archetype → all states → unhappy paths →
disclosure → grid. States are written before the happy path in every section below. Inputs read:
`PHASE1IA.md` (B, C, D, E, F), `DECISIONS.md` (D0–D6, §2.1, §6, §8), the `ibm-design-language` skill
(`SKILL.md`, `senior-workflow.md`, `ui-shell.md`, `patterns.md`, `composition.md`, the class index of
`assets/carbon-components.css`). Not read: `tokens.md`, `design-engineering.md`, the `docs/redesign`
branch, `AUDIT*.md`, `PLAN.md`, the shell-reference mockup.

Slices, one PR each, in order: **1 shell** (this) → 2 map (both modes) → 3 Reception → 4 Management →
5 Settings. `/my-seat` and `/login` are unchanged (deviation 12, D4) and get no wireframe.

Copy in the wireframes is placeholder where it names people, dates or counts; copy that carries a
ruling (mode strings, empty-state next steps, the viewer's History line) is the spec.

---

## 1. Shell

### 1.1 Decision log

```
Screen: Shell — header, filter left panel, three right panels (spans /, /admin, /admin/*, /reception)
Problem: "Take me between the map, the directory and the admin tools without losing my
         place, tell me at every moment whether I am looking at the live map or the draft,
         and keep filters and account business out of the way until I want them."
Primary task: orient (where am I, which mode), then move.

Options considered:
  A. What D0 rules, drawn literally: 48px header, hamburger = filters, links inline at lg+,
     centred status-only mode indicator, Help · History · Account opening 320px dark panels.
  B. Same, with the mode switch moved out of the History panel into a header control.
     Faster, but re-opens PHASE1IA E2.1 (ruled: indicator is status only).
  C. Same, with the filter panel always open on the map. Re-opens ruling 21 (A2 chosen).

Choice: A. Every element is a direct application of D0 and its amendments; the only open
  parameters were panel width, history depth and hamburger presence on non-map routes, ruled
  here as D0-f, D0-g and D0-h. B and C are not options — they are re-litigations.
Trade-off: switching mode costs two presses (indicator or History icon, then the switch).
  Accepted in D0-a. Three routes carry an empty 48px slot at the left (D0-h).
Would change if: D0-a's reopen condition fires (mode switches show up in complaints), or a
  fifth section arrives (D0).
```

### 1.2 Anatomy and geometry at 1920 (designed frame)

Header **48px**, full width, fixed, Gray 100, 1px Gray 80 bottom rule. Every target spans the full 48px.
Left to right, with the x-budget measured for the longest strings:

| # | Slot | x (px) | Content | Notes |
|---|---|---|---|---|
| 1 | Hamburger / reserved slot | 0–48 | 48×48 icon button on `/` and `/admin` (every width) and on every route below `lg`; **reserved and empty** on Reception, Management, Settings at `lg`+ | D0-h. Toggles the left panel; `aria-expanded`; `aria-controls` the panel |
| 2 | Header name | 48–~296 | "Megeredchian Law" `body-compact-01` 14/400 + "Seat Planner" `heading-compact-01` 14/600, one link to `/`, padding 0 16 | D0-d. Not a graphic. Never truncates at 1920 or 1024 |
| 3 | Section links | ~296–~688 | Seat map · Reception · Management · Settings, `body-compact-01`, padding 0 16, current route marked with a 3px bottom bar (`$border-interactive` in Phase 3) | Viewers see the first two; Management and Settings are **Hidden** (absent), not disabled. Below `lg` the links move into the left panel (§1.3) |
| 4 | Mode indicator | centred on 960, ~854–1066 at its longest | Status-only button. **Published:** filled square 12px + "Published · 2 Sep 2026". **Draft:** hollow diamond 12px (2px stroke) + "Draft — 4 changes". Press opens the History panel: `aria-expanded` + `aria-controls`, non-modal | D0-a. Two signals in the mark (shape + fill), text third. Date format = the app's existing publish-date formatter. Never collides: links end ≈ 688, utilities start at 1776 |
| 5 | Utilities | 1776–1920 | Help · History · Account, 48×48 each, flush right, no gaps, icon-only with `aria-label` and a tooltip on hover + focus | D0-b. History sits in IBM's Notifications slot. No Search, no Theme, no Switcher |

Type inside the header is the two fixed styles above only. Focus ring 2px inset, white on the dark header.

**Section link vs mode indicator.** The indicator is *status*; the "Seat map" link is *location*.
An admin on `/admin` sees "Seat map" current **and** "Draft — N changes"; on `/` sees "Seat map" current and
"Published · date". The link never changes mode; only the History panel's switch does.

**Which mode a route shows.** The indicator reports the layer the current route reads: `/` and `/reception`
→ Published; `/admin`, `/admin/management`, `/admin/settings` → Draft (the count of unpublished changes travels
with the admin to Management and back — D2). The History switch from a sub-page goes to `/` or `/admin`.

### 1.3 Left panel — filters (and, below `lg`, the section links)

| Property | Ruling |
|---|---|
| Geometry | 256px wide, below the header, full remaining height, white (`layer-01` in Phase 3), 1px right rule. **Slide-in: pushes the canvas** — the map region becomes 1664px at 1920 and re-fits. No overlay, **no focus trap** (it is part of the page) |
| Open / close | Hamburger toggles; **Esc** closes when focus is inside the panel or on the hamburger; open/closed **remembered per user** (localStorage — a display preference, not URL state; the *applied filters* are URL state per B3). Motion 110ms on the productive exit curve (ui-shell). Reduced motion: no slide, instant |
| Header row | "Filters" `heading-compact-01` + ghost **Clear all** (right), 48px row, pinned while the body scrolls. Clear all is Hidden while nothing is applied — a Clear that clears nothing reads as broken |
| Groups | **Department**, **Zone**, **Status** — each a checkbox group (`fieldset`/`legend`), group title `heading-compact-01`, ghost **Clear** per group (Hidden while the group is empty), items 32px, a count per option in helper style ("Case Management · 38"). Start all-unselected (users typically want one, per patterns). **Instant** updates — one selection at a time is the expected gesture and the set is small |
| Roster floor (Floor 2 today) | Zone and Status are **Hidden** with one note under Department: "Zone and status are seat facts — Floor 2 has no seats yet." Department counts count *people* (D1′ Q5) |
| Below `lg` | Section links sit **above** the filters as 32px nav items (Seat map · Reception · Management · Settings — role-filtered, current marked), then a 1px divider, then the filter groups. The header links are absent at that width. On non-map routes the panel holds the links only |
| Collapsed-container rule | While closed, the map control row shows **"Filters N ×"** (count of applied filters; × clears without reopening). That button is designed in the map slice; it is drawn here as context only |
| Landmarks | `navigation` labelled "Sections" for the links; `complementary` labelled "Filters" for the rest. Keyboard: Tab through; checkboxes are native |

**States** (before the happy path):

| State | Design |
|---|---|
| Empty — no options yet | The groups are replaced by one empty state: title "Filters appear once departments and zones exist"; body for admins "Add them in Management" with a tertiary link to `/admin/management?tab=departments`; for viewers "Ask an admin." |
| Loading | Three skeleton rows per group, group titles real |
| Error | Inline notification (error) in the panel body: "Filter options couldn't load" + ghost **Retry**. The map stays usable |
| Partial | Some groups loaded, one failed → that group shows the inline error, the others work |
| Overflow | 15 departments + zones exceed the height: the body scrolls **inside** the panel; the "Filters / Clear all" row is pinned. Long option names truncate end-line with `title` |
| Applied | Checked boxes; Clear all visible; the control row's "Filters N ×" mirrors N |
| Zero-match | Belongs to the map (the panel never blocks a selection): the map reports "0 of 68 seats match" and offers Clear filters — designed in the map slice |

### 1.4 Right panels — Help, History, Account

Shared rules: **320px** (D0-f), below the header, full height, flush right, Gray 100 like the header, 1px Gray 80
left rule, **floats over content** (never pushes), **one open at a time** (opening another swaps), the triggering
icon is **outlined** (1px Gray 80 on three sides, bottom open into the panel), dismiss by pressing the icon
again, **Esc**, or clicking outside; focus moves into the panel on open (its heading) and **returns to the
trigger** on close; no focus trap (non-modal — the page behind stays operable). Items have **no selected
state** (a navigation rule; the mode switch is a control and is exempt — E6.1). Motion moderate-02 (240ms),
one axis. Landmark `complementary`, each labelled by its heading. Panel heading `heading-03` 20/28, 16px
padding, content column 288px.

#### Help (static, no route, no data)

Sections, in order: **Keyboard shortcuts** (a two-column definition list — Ctrl/⌘ K Find a person or seat ·
Esc Close a panel / clear the selection · ↑ ↓ Move through results · Enter Open the result · Home / End First /
last result · ← ↑ → ↓ Move between seats on the plan *[Phase 4 obligation — roving tabindex]*); **Draft and
Published** (three sentences: what everyone sees, what admins edit, what Publish does); **Who to ask** (one line
naming the admins by role, not by name — "Your office administrators publish the map; ask them for changes").
Viewers and admins see the same panel. States: none beyond narrow (body scrolls).

#### History (admin)

| Row | Content |
|---|---|
| 1 — mode switch | Two-segment control **Published ⇄ Draft**, 40px, full content width. The selected segment shows the current mode (a control may). Pressing the other segment navigates `/` ⇄ `/admin` **preserving `?floor=` and `?seat=`** (the seat exists on both layers) and closes the panel. On `/admin` with in-flight edits the map's navigation veto applies (as-is contract) |
| 2 — status line | `label-01` helper: Draft → "4 unpublished changes · last edit 2 min ago"; Published → "Showing what everyone sees" |
| 3 — heading | "Publish history" `heading-compact-01` |
| 4… — events | Newest first, one item per publish, 72px min: three lines — what changed `body-compact-01` (`change_summary` through the existing formatter, e.g. "3 seats changed · 2 people updated"), date `label-01`, who `label-01` (`published_by`). Date and who are separate lines: together they run ~305px at 12px and would wrap unevenly at any panel width. Items are static rows, not links — nothing opens |
| last | Ghost **Show more** after 10; caption "Showing the 25 most recent publishes" at the cap (D0-g) |

**States:**

| State | Design |
|---|---|
| Empty — never published | Switch present; status "Nothing published yet"; events replaced by an empty state: title "Publish the draft to start the history", body "Your first publish appears here" — no button (Publish lives on the map; one primary per surface) |
| Loading | Switch real; three skeleton event rows |
| Error | Inline notification (error) in place of the list: "Publish history couldn't load" + ghost **Retry**; the switch keeps working |
| Partial | Events loaded but a `published_by` profile did not resolve → "who" reads "an admin" (the existing actor fallback) |
| Overflow | > 10 events → Show more; > 25 → cap caption. Long summaries wrap to two lines, never truncate (they are the content) |

#### History (viewer)

No switch, no events, no Show more. Content: "Published · 2 Sep 2026, 14:12" as the one fact line, then
`label-01` "Publish history is available to admins." Never published: "Nothing has been published yet" +
"Ask an admin." Draft is **Hidden** for viewers — nothing hints it exists.

#### Account

| Row | Content |
|---|---|
| Identity | Email `body-compact-01`; role as a tag ("Admin" / "Viewer" — the one rounded element) |
| Theme | Radio group (`fieldset`): Light · Dark · System — instant, affects the app, persisted (localStorage `sp-theme` as-is) |
| My seat | Link row → `/my-seat` (the chrome-free sheet, deviation 12). Unseated: the row is **read-only text** "No seat published for you yet" — content that must be read, so not a disabled control |
| Sign out | Ghost button, last, after a 1px divider |

States: unseated (above); signing out → the button shows a submitting state and the panel stays until the
redirect; failure → inline error in the panel.

### 1.5 Mode indicator states

| State | Indicator | History panel |
|---|---|---|
| Published | ■ "Published · 2 Sep 2026" | as above |
| Draft, N ≥ 1 | ◇ "Draft — 4 changes" | status "4 unpublished changes · last edit 2 min ago" |
| Draft, N = 0 | ◇ "Draft — no changes" | status "Draft matches the published map" |
| Never published | □ (hollow square) "Not yet published" | empty state (§1.4) |
| Loading | 160×16 skeleton in the slot; not yet pressable | skeleton rows |
| Error | ⊗ (error glyph) "Publish state unavailable" — still opens the panel | error + Retry |
| Overflow | "Draft — 120 changes" fits (≤ 22 characters) | — |

### 1.6 The narrow fallback (one frame, 1024)

Below `lg`: header links absent; hamburger present on every route (D0-h); the left panel carries the links
above the filters; **compact indicator** = mark + "Published" / mark + "Draft · 4" (D0-e: mark plus count,
never dropped); utilities unchanged; right panels still 320 (of 1024). Pages go single-column and map
editing is read-only — those are the other slices' concern; the shell itself has no further breakpoint.

### 1.7 Keyboard path (shell)

1. Skip link ("Skip to main content") is the first focusable element.
2. Header: hamburger → header name → links → mode indicator → Help → History → Account. All 48px targets.
3. Left panel open: focus stays on the hamburger; Tab enters the panel in DOM order (links, then filters).
   Esc anywhere inside closes and returns focus to the hamburger.
4. Right panel open: focus moves to the panel heading; Tab through; Esc closes and returns to the icon.
5. Landmarks: `banner` (header), `navigation` "Sections", `complementary` × 4 (Filters, Help, History,
   Account — unique labels), `main`.

---

## 1M. Map — Published mode (`/`) and Draft mode (`/admin`)

One surface, two modes. D1 / D1′ / D2 / D2′ govern markers, names-on-marker, floors and the roster — not
reopened here. Decisions made in this slice: D1-c…g, D2-a/b, deviation 15, PHASE1IA B4 amendment.
Wireframes: `map-published.html`, `map-draft.html`, `map-publish-review.html`, `map-fallbacks.html`.

### 1M.1 Decision log

```
Screen: Map — Published mode (viewer and admin) / Draft mode (admin)
Problem: Published — "Where does Sarah sit?" Draft — "Someone moved desks. Change the map,
         check it, push it live for everyone."
Primary task: Published — locate one named person on whichever floor.
              Draft — assign or move one person to one seat.

Options considered:
  A. One canvas, one control row, one right-edge slot; mode changes only what the row
     carries after the divider and whether the inspector edits. (D0 "one section, two modes".)
  B. Two surfaces with their own chrome (what ships: viewer header 36px vs shell 40px).
     Re-opens ruling 2.
  C. Draft mode as an overlay on the published map (diff view). A different product.

Choice: A. Everything a viewer learns on / is true on /admin — same row, same search, same
  inspector shape — so an admin switching mode re-learns nothing (ui-shell: transitional
  volatility). The mode is carried by the header indicator (D0) and by the one primary.
Trade-off: the published row is 40% empty at 1920. Accepted: calm where the user decides;
  the empty run is where draft controls appear, so nothing moves between modes.
Would change if: D0's reopen conditions, or a fifth per-mode control that will not fit
  the 1920 row (it fits with 270px to spare today).
```

### 1M.2 Geometry at 1920 × 889 (the measured viewport)

| Region | y | Notes |
|---|---|---|
| Header | 0–48 | shell (§1) |
| Control row | 48–96 | full width, **above** canvas and slot — never reflows when the slot opens |
| Canvas | 96–849 | plan 753 tall → 1660 wide, aspect-locked 2.204:1, wholly visible; **pushed** to 1520 when the slot is open (plan 690 tall) |
| Right slot | 96–889, x 1520–1920 | 400px (D2-a), one owner (D1-c) |
| Status band | 849–889 | legend · counts · zoom/fit (D1-g) |

The plan is centred in the canvas; the band spans the canvas, not the slot.

### 1M.3 Control row (48px, controls 40px, 8px gaps)

Shared, both modes, left to right — x-budget in px at 1920:

| Control | Width | Kind | Behaviour |
|---|---|---|---|
| Floor selector "Floor 3 · Pre-Litigation ▾" | 224 | dropdown, place marker | Options from the registry; the current floor named in full; switching keeps query, filters, selection (D1′/D2′) |
| Search | 320 | Focused search field, unlabelled, Ctrl/⌘ K | Trailing scope segment "This floor ▾ / Whole building"; results in the 560px palette (D1-d) |
| Filters N × | 112 | chip-button | Applied-filter count; × clears all without opening the panel; Hidden when N = 0 (nothing to clear) |
| Result count | 176 | text, `body-compact-01` | "22 of 68 seats match" while search or filters are active; "68 seats" otherwise; roster floor counts people |
| Find me | 96 | ghost | D1-f |

Draft mode continues after a **divider** (D2-b): Undo 40 · Redo 40 · Add seat 112 · Ask Planner 136 ·
**Publish 4 changes** 176 (primary, 40px) · ⋯ 40 · Names 152. Published mode: Names 152 directly after
Find me. Totals: published ≈ 1096, draft ≈ 1650 with gaps — fits 1920 with 270 to spare.

- **Publish** is present and **disabled** when N = 0, with the reason **stated beside the control**: `label-01` "No changes to publish" in the row (referenced by `aria-describedby`), never only a tooltip — patterns: a disabled control that blocks a primary action pairs with an inline explanation. The indicator also reads "Draft — no changes". Parity with Discard, and the row does not jump when the first edit lands.
- **Undo / Redo** tooltips: "Undo <last change> · Ctrl Z", "Redo · Ctrl Shift Z" — shortcuts are a Phase 4 obligation (none ship today). Both disabled while a mutation is in flight or the inspector is dirty (as shipped); Redo disabled when its stack is empty.
- **Add seat** toggles the mode (label flips to "Exit add seat"); **Hidden** on a roster floor (D2′).
- **Ask Planner** (tertiary) carries the highlight-count badge while highlights exist (re-entry point, D1-c). **Hidden** for viewers, absent in Published mode.
- **⋯** holds *Discard draft changes* only (danger, divider above, disabled when nothing to discard). Reset zoom lives on the canvas zoom control.
- **Names** toggle: switch with label "Names", `aria-pressed`; Hidden on a roster floor.

### 1M.4 Search (D1-d)

Palette states: browse (empty query — zones, then people seated-first, as shipped); results (header
"Results · 7 on this floor · 11 in building"; rows = title · kind · subtitle · seat code or "Floor 2" tag;
footer "↑↓ to move · Enter opens · Esc closes"); zero ("No results for “xyz” on this floor · 0 in building"
+ **Clear search**, and when the other scope has hits, the line reads "0 on this floor · **3 in building** →
Widen"). Scope "Whole building" lists cross-floor rows with their floor tag; opening one switches the floor
then selects. `?q=` landing per D1-d. Loading indicator only past ~300ms.

### 1M.5 Seat inspector (400px, D2-a)

| Row | Published mode (read-only) | Draft mode (edit) |
|---|---|---|
| Header | eyebrow "Seat NE04 · North-east pod"; title = name or "Open seat"; status mark + label; **Copy link** icon (`?seat=`); close × | same; while dirty the × asks "Discard unsaved seat edits?" |
| Person block | name · role · department; contact rows Email (mailto), Extension (+ Copy extension); **Copy link** icon (`?q=`) | Employee name combobox (creates a person inline: pill "Create new employee on save" + note), Job title, Phone extension, Department select, Status select (Hidden while assigned — Open / Reserved / Unavailable), Seat note |
| Actions | — | group "Move · Swap · Vacate" (Vacate only when assigned); **Delete seat** (danger, only for an available custom seat; the block reason shows as helper text otherwise) |
| Commit bar | — | bottom, bleeds to the edge: **Cancel** (ghost, left) · **Save draft changes** / **Assign employee** (primary, right); "Saving…" state; server errors return as an inline notification + field messages |

Empty (open) seat: header + status + "No employee assigned"; Draft adds the form. Overflow: the name line
is sized for **≤ 22 characters** on one line (Phase 3 sizes the type); longer names wrap to two, never
truncate. Judgment recorded: composition says create containers omit the ×; this panel is a record view
that also edits, so it keeps the × (patterns: Close = icon, upper right) and adds Cancel only while dirty.

### 1M.6 Mode card (Move / Swap / Add seat)

Owns the slot while a mode runs (INV-4). Card: eyebrow "Move employee mode", message ("Moving Sarah Reyes
from NE04. Select the destination seat."), ghost **Exit move employee**; Esc exits ("Move canceled — no
changes made." inline). Confirm dialogs stay modal (fewer than five inputs, a decision) with the shipped
copy ("Move Sarah Reyes to L02?" / "Swap them"), floors tagged when the pair crosses floors (D2′).

### 1M.7 Ask Planner drawer (deviation 14) in the slot

**400px — the same slot at the same width** as the inspector and the mode card, so the canvas never reflows when one replaces another; the selected seat stays highlighted on the map while the drawer is open. Header "Ask Planner" + AI label (Phase 3: Carbon-for-AI), subline "Read-only answers
from saved draft map data.", dirty banner when the inspector had unsaved edits, suggested prompts,
textarea (800 chars, Ctrl/⌘ Enter), **Ask** (the drawer's one primary — the row's Publish is a different
section). Empty / loading / error / answer states as shipped; highlights on the canvas with the count
badge on the row button; "Clear highlights". Never for viewers.

### 1M.8 Publish review — wide tearsheet (D2)

Anchored bottom, header visible above, overlay dims the page, **no ×**. Title "Review draft before
publishing"; readiness line ("Ready · 4 changes" / "No changes — the draft matches the published map");
counts chips; table *Seat · Published now · After publish · Change*, rows grouped under **floor eyebrows**
("Floor 3 · Pre-Litigation · 3 changes"); "People details" list; footer facts ("Draft 68 seats · Published
68 seats · Total changes 4" and the one-line consequence "Publishing replaces what everyone sees and clears
Undo/Redo."). Buttons: **Cancel** · **Publish 4 changes** (primary, right). States: no changes (button
disabled "No changes to publish"); submitting ("Publishing…", inline banner "Viewers keep the current map
until this finishes"); failure (inline error "Publish did not complete — <error>", **Retry publish**,
review intact); **PUBLISH_BLOCKED** (tearsheet closes; canvas inline error with the server's text — this is a
feature, not a failure).

### 1M.9 Floor 2 roster (the real state, both modes)

Canvas replaced by the roster region: heading "Floor 2 · Litigation — 40 people", helper line (viewer:
"The 2nd-floor plan is not mapped yet."; admin: "… Until a draft seat exists there, everyone without a draft
seat is listed here."), groups by department with counts, 40px static rows name · position · ext · email
+ **Copy link** icon (D1-e). Control row: Names and Add seat Hidden; result count counts people; band
title-only. Left panel: Zone/Status Hidden (§1.3).

### 1M.10 Fallbacks

Viewer on `/admin`: shell present, indicator "Published · date" (a viewer never sees Draft), canvas replaced
by the 403 card — "Admin access required" / "You are signed in, but your profile does not have admin
permissions. Ask an admin to upgrade your role if you need to edit the seat map." / **Back to seat map**.
Below `lg` (`/admin`): read-only — the draft plan, the shared controls only, no slot; one line in the
band "Editing needs a wider window." (read-only, not disabled — D2).

### 1M.11 Keyboard

Control row Tab order = visual order; the canvas is one tab stop with **roving tabindex + arrow keys**
across markers (Phase 4 obligation), Enter opens the inspector, Esc = cancel ladder (mode → dialog →
inspector → selection → search). Palette: ↑↓ Enter Esc, Home/End. Landmarks: `main` = canvas + band,
`complementary` = inspector / drawer, `search` = the field.

---

## 1R. Reception (`/reception`)

D3 / D3′ govern the archetype (list–detail), density by zone and the floor-aware readout copy — not reopened.
Decisions made in this slice: D3-a…e. Wireframe: `reception.html`.

### 1R.1 Decision log

```
Screen: Reception — front-desk call routing
Problem: "There's a call for Sarah. What's her extension, and is she at her desk?"
Primary task: find one person and read their extension out loud, fast.

Options considered:
  A. Keep the shipped 1060px frame and 372px sidebar; add the shell, error boundary and ?q=.
  B. The D0 document regime: 1584 live area, list pane 1072 (dense) + readout 480 (calm),
     readout sticky; shell, error boundary, ?q=, clear ×, Ctrl/⌘ K.
  C. Readout-first: one big search, the list only as type-ahead. Rejected in D3 (option C).

Choice: B. D0 puts every text-dense surface on the same 1584 frame; a bespoke 1060 is the
  inconsistency ui-shell warns about, and the extra width goes where D3 wants it — a calmer
  readout that is read aloud under time pressure. Every control keeps its shipped behaviour
  (highlight-preview, Enter locks, Esc clears, arrows clamp); the additions are the ones the
  map already taught: clear ×, Ctrl/⌘ K, ?q=.
Trade-off: rows get longer at 1072 — the eye travels further from name to extension.
  Mitigated: extension right-aligned in a fixed 96px column with tabular figures, hairline
  rows, 48px pitch.
Would change if: the directory outgrows ~300 people (D3's line) — faceted filters replace
  the persistent readout.
```

### 1R.2 Geometry at 1920 × 889

| Region | Size | Notes |
|---|---|---|
| Live area | 1584 centred (x 168–1752) | D0 document regime; page scrolls normally |
| Page header | 32px top pad · title `heading-04` 28/36 "Reception" · subtitle `body-01` "Front-desk directory — type what the caller gives you, read the extension, transfer." · 24px below | **No primary action** (D3-a) |
| Search | 48px (`lg` input), spans the list column | Unlabelled; magnifier; placeholder "Name, department, seat, or extension…"; clear × when non-empty; Ctrl/⌘ K focuses; autofocus on entry |
| List column | 1072 | header row 32px: count (`aria-live`) left · "Ext" right; rows 48px |
| Readout column | 480, sticky under the header | calm zone; 32px padding |
| Gap | 32 | grid gutter |

### 1R.3 List (dense zone)

Row: 32px initials avatar · name `body-compact-01` 600 + `label-01` "position · department" ("—" when both
missing) · seat chip (mono, bordered: `L02`) or floor tag ("Floor 2") or "—" · extension right-aligned,
tabular, 96px column, "—" when missing. Highlighted row (typing) = layer-hover + 3px inset bar; locked row =
layer-selected + bar. Count copy: "68 people" at rest; "7 matches" / "1 match" / **"0 matches"** while
typing. Keyboard as shipped: ↑ ↓ clamp, Enter locks (only while typing), Esc clears; mousedown on a row
never steals focus from the field. Ranking as shipped (name starts-with → name contains → other fields).
Overflow: names and departments truncate end-line with `title`; the list is the page's scroll.

### 1R.4 Readout (calm zone) — D3-d

1. Avatar 48 · name `heading-03` 20/28 · "position · department" `body-compact-01`.
2. Extension block (tinted, `aria-live="polite"`): eyebrow "Extension" `label-01`; number in
   `heading-06` 42/50, tabular figures — weight set in Phase 3 for arm's-length reading (the fixed scale's
   light weight at display size is the system default; legibility at 2 m is the constraint to check);
   while typing, "↵ to lock" hint at the right of the eyebrow.
3. Seat line with pin icon, `body-compact-01`: seated → "Seat L02 · Floor 2 · Litigation Pod"; unseated on a
   floor → "Floor 2 · Litigation — reaches voicemail if away"; no floor → "No assigned seat — reaches
   voicemail if away" (D3′ copy, unchanged).
4. **No extension** → the number slot reads "No extension on file" in `body-01` (not a dash), the seat
   line stays, and the fallback list below becomes the next step.
5. "If no answer — same department": up to 3 colleagues with extensions, each a 40px row-button (name ·
   extension), pressing one locks that colleague (as shipped).
6. *(pending owner)* "Show on map" ghost link → `/?q=<name>` — drawn only if approved.
7. **Recent lookups** (D3: secondary view): heading `heading-compact-01`, up to 4 rows (26px avatar · name
   · extension), current selection excluded, in-memory only (ruled 2026-08-05). Hidden while empty.

### 1R.5 `?q=` and URL (D3-c)

Landing on `/reception?q=<text>`: field pre-filled, list filtered, count shown; a unique match locks the
readout; several matches leave the highlight on the first row; zero shows the zero state with the query
kept. Locking writes `?q=<name>` with `replaceState`; clearing removes it. Nothing else in the URL.

### 1R.6 Error boundary (D3-e) and other states

| State | Design |
|---|---|
| First run | Full directory alphabetically; readout empty state "Waiting for a call" / "Start typing what the caller gives you — a name, department, seat, or extension." |
| Zero matches | List body: "No one matches “xyz”" + ghost **Clear search**; count reads "0 matches"; readout keeps the last locked person (the call may still be live) |
| Empty directory | List body: "The directory is empty" / "It fills in when an admin publishes the seat map."; readout empty state; search present (nothing to find, but nothing to hide either — it is the page) |
| Loading | Skeleton matching the 1584 layout: header text real, search real, six skeleton rows, readout skeleton |
| Error (own `error.tsx`) | Card on the live area in Reception's voice: "Reception couldn't load" / "The directory is unchanged — this is a display problem. Try again, or use the seat map's search meanwhile." Actions: **Try again** (tertiary) · Open the seat map (ghost). Reference digest in `label-01` |
| Partial | Snapshot loaded, seats failed → seat cells read "—", seat line "Seat unknown right now", one inline notification above the list |
| Overflow | 300+ rows scroll; long names truncate with `title`; the readout name wraps to two lines |
| Narrow (1024) | Single column: header, search, list; locking scrolls to the readout below with a **Back to the list** ghost link at its top (D3's explicit back path); readout not sticky |

### 1R.7 Keyboard

Field first (autofocus); Tab → clear × (when shown) → list (roving: ↑ ↓ within, Enter locks) → readout
actions → recents. Ctrl/⌘ K refocuses the field from anywhere on the page. Landmarks: `search` (field),
`main` (list + readout), `complementary` "Recent lookups". Skip link lands on the field.

---

## 2. States matrix

| Screen / element | Empty | Loading | Error | Partial | Overflow |
|---|---|---|---|---|---|
| Shell · mode indicator | "Not yet published" (hollow square) | skeleton bar | "Publish state unavailable", still opens the panel | — | "Draft — 120 changes" fits; narrow → mark + count |
| Shell · left panel | no options → empty state naming Management / "Ask an admin" | skeleton rows per group | inline error + Retry, map usable | one group failed | body scrolls, header row pinned; names truncate with `title` |
| Shell · History (admin) | never published → empty state, switch kept | skeleton rows | inline error + Retry, switch works | unresolved actor → "an admin" | Show more → 25-cap caption |
| Shell · History (viewer) | "Nothing has been published yet · Ask an admin" | skeleton line | inline error | — | — |
| Shell · Account | unseated → read-only "No seat published for you yet" | — | sign-out failure → inline error | — | long email wraps, never truncates |
| Shell · Help | — | — | — | — | body scrolls |
| Map · canvas (Published) | nothing published → educational empty state over the plan naming the admin's next step; viewer copy "Nothing has been published yet — ask an admin" | skeleton plan + row controls real | inline error in the map region + Retry; "The seating map itself is unchanged" | raster loaded, snapshot failed → markers without names + inline note | 120 seats → same plan, the label nudge handles it (D1) |
| Map · canvas (Draft) | "No seats in the draft yet" + "Use Add seat, or import assignments from Settings" | skeleton | inline error + Retry | stale draft (MLS02) → self-clearing banner "The draft changed in another session… refreshed with the latest draft" | — |
| Map · search | zero: "No results for “x” · 0 on this floor · 0 in building" + Clear search | indicator past 300ms | "Search couldn't run" inline in the palette | other scope has hits → "0 on this floor · 3 in building → Widen" | > 200 rows virtualised (as shipped) |
| Map · filters (zero-match) | "0 of 68 seats match" + Clear filters in the band; dept with people elsewhere → "20 people in Litigation are on Floor 2 · Show Floor 2" | — | — | — | — |
| Map · inspector | open seat: "No employee assigned" | skeleton rows | save error → inline notification + field messages, form intact | Vacate raced by another session → "NE04 can no longer be vacated — the draft changed" | name > 22 chars wraps, never truncates |
| Map · Ask Planner | "Ask about seats, assignments, zones, or departments…" | "Checking saved draft map data" | the six named errors + fallback, Retry | broad answer → "No seats highlighted for this broad answer…" | long answer scrolls inside the drawer |
| Map · publish review | "No changes — the draft matches the published map", button disabled | — | "Publish did not complete — <error>" + Retry, review intact | PUBLISH_BLOCKED → closes, canvas inline error with server text | 68-row table scrolls inside the tearsheet, header and buttons fixed |
| Map · Floor 2 roster | "No one is listed on Floor 2 · Litigation yet" + "People appear here after an admin publishes" | skeleton rows | inline error | filters hide everyone → "No one on Floor 2 matches the active filters" + Clear filters | 40+ rows scroll; groups keep their eyebrows |
| Map · Find me | not in directory → inline "Your account isn't in the published directory. Ask an admin." | — | — | unseated → roster row highlight | — |
| Reception · list | empty directory → "The directory is empty · It fills in when an admin publishes the seat map" | six skeleton rows on the real layout | own boundary: "Reception couldn't load" + Try again · Open the seat map | seats failed → seat cells "—", inline notification | 300+ rows scroll; names truncate with `title` |
| Reception · search | zero → "No one matches “xyz”" + Clear search; count "0 matches" | — | — | — | long query stays visible; field scrolls |
| Reception · readout | first run → "Waiting for a call" | skeleton block | — | no extension → "No extension on file" + same-department fallback; seats failed → "Seat unknown right now" | name wraps to two lines |
| Reception · recents | Hidden while empty | — | — | — | max 4 shown |
| Management | *slice 4* | | | | |
| Settings | *slice 5* | | | | |

---

## 3. Hand-off to Phase 3 — components the wireframes assume

"Exists" = a class in the skill's `assets/carbon-components.css` index covers it; "hand-built" = Phase 3 must
add it to the component layer (and say so in its decision log).

| Component | Used by | In the css index? | Notes for Phase 3 |
|---|---|---|---|
| Skip link | shell | exists `.cds-skip-link` | — |
| Header, name, nav, utils | shell | exists `.cds-header / -name / -nav / -utils` | The reserved 48px slot (D0-h) is a spacing rule, not a component |
| Hamburger icon button | shell | exists `.cds-btn--icon` on the header | `aria-expanded` state styling |
| Mode indicator | shell | **hand-built** | Status button with a two-signal mark (filled square / hollow diamond / hollow square / error glyph) + text; the only header element with a skeleton state |
| Utility icon button, outlined when open | shell | partial (`.cds-btn--icon`) | **hand-built** the "outlined, bottom flowing into the panel" state |
| Left filter panel (slide-in, pushes) | shell | partial (`.cds-side-panel` is the right-hand 480 slide-in) | **hand-built** — 256px, left, no focus trap, pinned header row, scrolling body |
| Checkbox group with per-group Clear + counts | left panel | exists `.cds-checkbox`, `.cds-btn--ghost` | Group = `fieldset`; count = helper style |
| Right panel (dark, 320, floats) | Help / History / Account | **hand-built** | Carbon HeaderPanel equivalent; the one-open rule is behaviour |
| Two-segment mode switch | History | **hand-built** | Carbon ContentSwitcher equivalent, 40px, on the dark surface |
| Event list (static rows) | History | none needed | Plain list; not `.cds-table` |
| Show more (ghost) | History | exists `.cds-btn--ghost` | — |
| Skeleton rows | panels | exists `.cds-skeleton-row` | Needs a dark-surface variant |
| Empty state | left panel, History | exists `.cds-empty` | Dark-surface variant for the panels |
| Inline notification (error) + ghost Retry | panels | exists `.cds-notification--error` | Dark-surface variant |
| Tag (role) | Account | exists `.cds-tag` | The one rounded element |
| Radio group (Theme) | Account | **hand-built** (the index has `.cds-checkbox`, no radio) | Native radios, Carbon styling |
| Read-only row text | Account (unseated) | none needed | Static text, not a disabled control |
| Tooltip on icon buttons | utilities, Undo/Redo | **hand-built** | Hover + focus, `label-01` |
| Control row (toolbar) | map | none (`.cds-toolbar` is the table toolbar) | **hand-built** — 48px row, 40px controls, divider, one primary |
| Floor selector dropdown | map | exists `.cds-select` (as a menu button: hand-built) | Place marker; options from the registry |
| Search field with scope segment | map | partial `.cds-text-input` | **hand-built** the trailing scope segment; palette is hand-built (exists today) |
| Filter chip-button "Filters N ×" | map | exists `.cds-tag--filter` | Behaviour: × clears |
| Ghost / tertiary / primary buttons | map row | exists `.cds-btn --ghost --tertiary --primary --icon` | — |
| Toggle (Names) | map row | **hand-built** (index has no toggle) | Carbon toggle, labelled |
| Overflow menu ⋯ | map row | exists (index lists overflow menu) | Danger item styling |
| Seat inspector side panel, 400 | map | partial `.cds-side-panel` (480) | **hand-built** width + push + commit bar |
| Combobox (employee name) | inspector | **hand-built** | Creates inline; option rows with meta |
| Select, text input, text area | inspector | exists `.cds-select`, `.cds-text-input`; text area **hand-built** | — |
| Danger button (Delete seat) | inspector | exists `.cds-btn--danger` | — |
| Modal (Move / Swap / Delete confirms) | map | exists `.cds-modal` | Never nested; Cancel left, primary right |
| Wide tearsheet (publish review) | map | **hand-built** | Anchored bottom, overlay, no × |
| Data table (publish review) | tearsheet | exists `.cds-table` | Floor eyebrow rows are group headers |
| Status marks (seat legend) | band | exists `.cds-status` | Constant marker footprint, per-state symbol (deviation 3) |
| Mode card | slot | **hand-built** | Eyebrow + message + ghost exit |
| Ask Planner drawer | slot | **hand-built** | Carbon-for-AI label in Phase 3 |
| Search palette (560) | map | **hand-built** (exists in code) | Rows, kind badge, floor tag |
| Roster region + static rows | map | none needed | Plain list with group eyebrows; copy-link icon button per row |
| 403 card | `/admin` viewer | exists `.cds-empty` (as FullPageError 403) | One tertiary action |
| Page header (title + subtitle, no action) | Reception | exists `.cds-page-header` | Zero primaries is allowed |
| Search input `lg` with clear × | Reception | exists `.cds-text-input` | Clear icon = **hand-built** state |
| Listbox rows (combobox pattern) | Reception | none needed | Plain list; `.cds-status`-free |
| Readout tile with display numeral | Reception | **hand-built** | Tinted block, `heading-06` tabular |
| Row-buttons (same-department fallback) | Reception | exists `.cds-btn--ghost` | 40px, full width |
| Error boundary card | Reception | exists `.cds-empty` (error kind) | Own copy |

Nothing in the shell uses Blue 60: the shell has no primary action. Phase 3 assigns `$border-interactive`
to the current-link bar and `$focus` to the ring.

---

## Slice log

| Slice | PR | Status |
|---|---|---|
| 1 Shell | `docs/phase2-shell` | wireframes: `shell-header.html`, `shell-left-panel.html`, `shell-right-panels.html`, `shell-narrow.html` |
| 2 Map | `docs/phase2-map` | wireframes: `map-published.html`, `map-draft.html`, `map-publish-review.html`, `map-fallbacks.html` |
| 3 Reception | `docs/phase2-reception` | wireframe: `reception.html` |
| 4 Management | — | — |
| 5 Settings | — | — |
