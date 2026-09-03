# Seat Planner redesign — Phase 2: UX and wireframes

**Status: complete and retired 2026-09-03 (tag `v1.73.1`) — five slices, 2026-09-02 → 2026-09-03 (shell #500,
map #501, Reception #502, Management #503, Settings #504). Carbon conformance record in §4; Phase 3 hand-off
in §3; Phase 4 obligations in §5; the close-out note for Phase 3 is at the end of the slice log.**
Companion to `PHASE1IA.md` (the fixed IA) and
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
6. **Show on map** — ghost link → `/?q=<name>` (the D1-d landing: field pre-filled, unique match selected, floor
   switched). Owner-approved 2026-09-03. One link, no new data; gives the front desk the seat's location when a
   visitor asks. Absent while nothing is locked.
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

## 1G. Management (`/admin/management?tab=employees|departments|zones`)

D5 governs the archetype (in-page tabs, no third tier; page header + one primary on the 1584 live area) — not
reopened. Decisions made in this slice: D5-a…d (owner-approved 2026-09-03 with two edits to D5-b and the
summary tiles dropped). Wireframe: `management.html`.

### 1G.1 Decision log

```
Screen: Management — people, departments, zones
Problem: "A new hire started / someone left / a department was renamed. Fix the directory so the
         map and Reception say the right thing after the next publish."
Primary task: add or edit one employee record (departments and zones are occasional housekeeping).

Options considered:
  A. What ships: four tab-buttons on a 1240 frame, five non-link summary tiles, a modal for the
     five-field employee form, hover-revealed delete on lists, CTA in the toolbar.
  B. Index-page archetype on the 1584 frame: page header owns the one primary (it follows the
     tab), a real tablist, employees as a compact sortable table with a slide-over side panel for
     create/edit, departments/zones as structured lists with visible actions, tiles folded into
     the toolbar count.
  C. Three routes (/management/employees …) with their own headers. Re-opens ruling 5 (tabs).

Choice: B. The table is the page; the admin edits one record while checking it against the rows
  around it, so the form sits beside the table, not over it. One primary per section, and the
  section is the tab. Tiles go: they link nowhere, and the two numbers an admin needs while
  editing people (assigned / unassigned) belong beside the table they describe.
Trade-off: the primary changes label when the tab changes — a control that "moves" — accepted
  because it never changes position, only its verb, and each tab has exactly one create.
Would change if: a tab grows a second create action, or the directory outgrows what a
  virtualised single table scans well (~1,000 rows).
```

### 1G.2 Geometry at 1920 × 889

| Region | Size | Notes |
|---|---|---|
| Live area | 1584 centred | D0 document regime; page scrolls |
| Page header | title `heading-04` "Management" + subtitle `body-01` "People, departments and zones."; **primary at the right**: Add employee / Add department / Add zone (follows the tab); tabs row 48px below, sticky on scroll | one primary per section (D5-a) |
| Toolbar | 48px: search (320) · count `body-compact-01` | Employees only; lists have no toolbar (create is the header primary) |
| Table | full width; rows **32px** (short — scanned); header row 40 | Employees |
| Side panel | **480**, slide-over, scrim, focus trapped | D5-b |
| Lists | rows 48px, full width | Departments, Zones |

### 1G.3 Employees (D5-b)

- **Toolbar count** (`aria-live="polite"`): at rest "68 employees · 56 assigned · 12 unassigned"; while filtering "7 of 68 match" / "0 of 68 match". This replaces the summary tiles; draft-seat and zone counts already live on the map band and in the History panel.
- **Table**: columns Name · Department · Position · Extension · Seat · Status; sortable headers (`aria-sort`); numbers right-aligned tabular; Status = two-signal mark + label (Assigned ■ / Unassigned □); Seat = mono label, name links to `/admin?seat=<label>` when assigned; row kebab ⋯ → Edit. Rows are not tab stops; the name link and the kebab are (two stops per row, as shipped); row click also opens Edit. Virtualised as shipped.
- **Create / edit = 480px side panel, slide-over.** The admin keeps referencing the table behind it (the neighbours, the department spelling, who is already assigned), which is the side-panel criterion; the form itself is self-contained and the table is context, not something operated mid-edit — so the panel **overlays and traps focus** (composition: slide-over is a dialog). Scrim over the page; Esc closes (asks first when dirty); focus returns to the opener. Title "Add employee" / "Edit employee"; helper "Changes reach the map and Reception at the next publish." Fields, single column: **Name (required)** — the one required field is marked, the form is mostly optional; Position; Phone extension; Email; Department (combobox over the managed list, free text allowed). Edit shows a read-only fact row "Draft seat · NE04 · Open on the map". Validation on blur; server errors as an inline notification at the top of the panel plus field messages, values intact. Commit bar bleeds to the bottom: **Cancel** · **Save employee** / **Add employee** (the panel's one primary). Edit also carries **Deactivate…** as a danger ghost above the commit bar.
- **Deactivate** = moderate impact: confirm dialog **on top of the side panel** (a side panel may open a confirmation; a modal never nests) — "Deactivate Sarah Reyes?" · impact line with the seat ("Clears her draft seat NE04 and keeps the record inactive." / "Removes her from the active directory.") · "The published map everyone sees won't change until you publish again." · Cancel · **Deactivate employee** (danger). Refused because the person is still on the published map → inline error in the panel: "Sarah Reyes is still on the published map at NE04. Vacate the seat in the draft and publish before deactivating." + link "Open NE04 on the map". No reactivate, no bulk actions, no delete (as shipped — not added).

### 1G.4 Departments and Zones (D5-c)

Structured list, 48px rows: name · count ("38 employees" / "12 draft seats") · ghost **Rename** (inline: input +
Save / Cancel, Enter / Esc) · overflow ⋯ holding **Delete** (danger). Unmanaged names (used by people but not in
the list) carry a tag "Not in list" and a tertiary **Add to list**. Create = header primary → one-field modal
("Add department" · Name · Cancel / Add department, 50/50 bleed). Delete = moderate impact, confirm with the
shipped copy: "Delete department “Intake”?" · "Clears this department from **5 active employees**. Employee
records remain active and physical seat zones are unchanged." · "Viewers keep seeing current people details
until you publish." · Cancel / **Delete department**. Zones: same shape, "Clears this physical zone from **12
draft seats**. Seat markers and employees remain in place." Subtitles as shipped ("Employee departments are
separate from physical seating zones." / "Zones are physical map areas used for filtering and custom-seat
label prefixes."). Names only — no zone geometry here.

### 1G.5 Route states (D5-d)

| State | Design |
|---|---|
| Not admin | the shared 403 card ("Admin access required" + **Back to seat map**) — the shipped body-only variant gains the action |
| Route error | own admin voice as shipped: "This admin page could not load" / "…any edit you had open and unsaved is gone." + Try again · Back to the published map |
| Loading | page header real, tabs real, six skeleton rows under real column headers |
| Empty directory | column headers stay; body: "No employees yet" / "Start with Add employee, or bring the whole directory in at once with a CSV import in Settings." + tertiary link to Settings. The primary stays in its permanent header position |
| Zero search | "No employees match this search" / "Try a different name, department, position, or seat label." + ghost Clear search; count "0 of 68 match" |
| No departments / zones | "No departments yet" / "Add a department to keep employee records easier to scan." (zones: "Add a zone to organize map filters and custom-seat labels.") — the primary is the next step |
| Success | inline status banner under the toolbar: "Sarah Reyes saved." / "Intake deleted." (task-generated → inline, not toast) |
| Overflow | long names truncate with `title`; 300+ rows virtualised; the side panel body scrolls, header and commit bar fixed |
| Narrow (1024) | single column; header primary stays; table scrolls horizontally inside its container with a visible edge; side panel 480 over 544 of content |

### 1G.6 Keyboard

Skip link → page header → primary → tablist (← → between tabs, Tab into the panel) → toolbar search → table
(name link, kebab per row; sortable headers are buttons) → lists (Rename, ⋯). Side panel: focus to the first
field, trapped, Esc closes (confirms when dirty), focus back to the row's kebab or the header primary. Confirm
dialog: focus to Cancel, trapped, Esc = Cancel. Landmarks: `main`, `navigation` "Management sections"
(the tablist's region), `search` (toolbar), `dialog` for panel and confirms.

---

## 1S. Settings (`/admin/settings`)

D6 governs: Settings archetype, single column grouped by section; CSV import and JSON snapshot restore;
restore = moderate impact, confirm with consequences, no typed confirmation; **no Reset draft** (ruling 22,
Q7). Decisions made in this slice: D6-a…e (owner-approved 2026-09-03). Wireframe: `settings.html`.

### 1S.1 Decision log

```
Screen: Settings — import, export and recovery
Problem: "Bring the whole directory in from a spreadsheet" / "Back the draft up before I try
         something" / "Put the draft back the way it was from a file."
Primary task: per section — CSV: import; Snapshots: export (the frequent act; restore is rare).

Options considered:
  A. What ships: 760px column, tile-buttons, review modals with count cards, hidden unlabeled
     file inputs, a reset tile.
  B. Settings archetype on the 1584 frame (content in the left 8 columns), a callout, each
     section with its own one primary and labelled file triggers stating type and size limit,
     reviews as narrow tearsheets (the error list and the consequences list scroll), reset gone.
  C. Fold import/export into Management's toolbar. Rejected: irreversible operations own a page
     (PHASE1IA B1).

Choice: B. Two unlike sections do not share a primary, so the page header has none and each
  section carries one. Reviews leave the modal because a scrolling list is complex data.
Trade-off: three container types on one small page (callout, section, tearsheet). Accepted —
  each is the sanctioned one for its job, and the page is visited rarely.
Would change if: a third recovery tool arrives (then a settings left-nav), or restores become
  frequent (then restore earns the section primary).
```

### 1S.2 Geometry at 1920 × 889

| Region | Size | Notes |
|---|---|---|
| Live area | 1584 centred; content column **776** (8 of 16), left-aligned | Settings archetype: single column |
| Page header | title `heading-04` "Settings" · subtitle "Import, export and recovery. Everything here changes the draft only." | **no primary** (D6-a) |
| Callout | full content width, loads with the page, never dismissible, no status icon | "The published map is never touched until you publish. Restores replace the entire draft — review before confirming." |
| Sections | `heading-03` + helper `body-01` + one action row (40px buttons, 8px gaps) + a `label-01` file line | 48px between sections |
| Narrow tearsheet | 720 centred, top 112, anchored bottom; header · scrolling body · 64px footer | Cancel · primary, 50/50 bleed; **no ×** |

### 1S.3 CSV assignments (D6-b)

Helper: "Imports update draft assignments; seat positions don't move." Actions: **Import CSV** (primary,
labelled trigger "Import CSV · .csv up to 5 MB") · Export CSV (tertiary, downloads `seat-assignments.csv`,
draft only) · Download template (ghost, headers only). File line under the row, `label-01`: "Columns:
seat_label, employee_name, employee_email, position, department, zone, status, notes — e.g.
A-12, Jane Doe, , Associate, Litigation, North Wing, assigned, Window seat". The type and the 5 MB limit
are stated **before** choosing a file, not only in the error.

**Review — narrow tearsheet** "Review CSV import" / "CSV import has blocking errors". Body: five count cards
(Rows · Assignments · Cleared · Reserved · Unavailable); consequence line "Applies to the draft only. Marker
positions and the published map do not change until you publish."; when blocked, an inline error
"Fix these rows in the CSV, then import the file again. No draft data has changed." above the scrolling
list "Row 14 · Invalid status 'away'". Footer: **Cancel** · **Apply import** ("Applying…"; disabled while
blocked with the inline reason above — never a bare disabled button). Exit is Cancel only.

Unhappy paths (senior-workflow step 6), all inline in the section before any tearsheet opens: wrong type
("Choose a .csv file"), **too large** ("This file is 7.2 MB — the limit is 5 MB"), empty ("The CSV is
empty"), missing columns ("Missing required columns: zone, status"). MLS02 on apply: "The employee directory
changed in another session… This page has been refreshed with the latest directory — review and import again."
Success: inline status under the section, "CSV import applied — 41 rows updated in the draft." Partial
validity stays unsupported: all-or-nothing, as shipped.

### 1S.4 Draft snapshots (D6-c, D6-e)

Helper: "Draft seats and employees only. Not a database backup — it does not include the published map,
publish history or accounts." Actions: **Export draft snapshot** (primary, downloads `seat-map-export.json`)
· Restore draft snapshot… (tertiary, labelled trigger ".json up to 5 MB — a file exported from this page").
No danger styling on the section (D6-d): nothing destructive remains.

**Review — narrow tearsheet** "Review draft snapshot restore". Body: two count cards (Draft seats ·
Employees) with the file name and export date; **consequences list**, each a line: every draft seat
assignment is replaced · custom seats not in the file are deleted · employee details are updated — never
deleted · the published map is untouched until you publish · Undo history is cleared. Then **Export the
current draft first** — a **ghost button** (D6-e): downloads the current draft snapshot without closing the
tearsheet or resetting the review, and shows its done-state in place, "Exported 14:02", so the admin can see
it happened before pressing Restore. Footer: **Cancel** · **Restore draft snapshot** ("Restoring…").
Exit is Cancel only. MLS02: inline error at the top of the body with the server text and "This page has
been refreshed with the latest draft — review it and try the restore again if it is still what you want.";
the review stays. Invalid shape ("The snapshot must include seats and employees arrays"), unreadable,
empty ("Cannot restore an empty snapshot"), too large — inline in the section, before any tearsheet.
Success: inline status "Draft restored from seat-map-export.json — the draft now matches the snapshot."

### 1S.5 Route states (D6-d)

| State | Design |
|---|---|
| Not admin | shared 403 card + Back to seat map |
| Route error | admin voice as shipped ("This admin page could not load…") |
| Loading | header real; two section skeletons (heading real, action row skeleton) |
| Busy | the pressed primary shows its progress label; the sr-only live region says "Working…" |
| Overflow | error list scrolls inside the tearsheet, header and footer fixed; long file names truncate mid-line (`title`) |
| Narrow (1024) | content column full width; tearsheet 720 → full width minus 32 |

### 1S.6 Keyboard

Skip link → page header → callout (not focusable) → section 1 actions → section 2 actions. Tearsheet: focus
to the first control (Cancel when nothing else accepts input), trapped, Esc = Cancel (not while busy),
focus returns to the trigger. The file pickers are native, opened by the labelled buttons; the hidden input
carries the same accessible name. Landmarks: `main`; each section a `region` labelled by its heading.

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
| Management · employees table | headers stay; "No employees yet" + Add employee / CSV in Settings | six skeleton rows | inline error + Retry (route error in its own voice) | zero search → "No employees match this search" + Clear search, count "0 of 68 match" | virtualised; names truncate with `title` |
| Management · employee panel | — | — | save error inline + field messages, values intact; deactivate refused (published) → inline error + map link | — | body scrolls, header/commit bar fixed |
| Management · departments / zones | "No departments yet" / "No zones yet" + the header primary | skeleton rows | inline error + Retry | rename conflict → inline "A department with that name already exists" | long names truncate; list scrolls |
| Management · route | — | header + tabs real, table skeleton | "This admin page could not load" (as shipped) | not admin → 403 card + Back to seat map | — |
| Settings · CSV | empty file → "The CSV is empty" inline | tearsheet parse indicator past 300ms | wrong type / too large / missing columns inline; blocked review with row list; MLS02 refreshed note | — (all-or-nothing by design) | error list scrolls in the tearsheet |
| Settings · snapshot | empty snapshot → "Cannot restore an empty snapshot" | — | invalid shape / unreadable / too large inline; MLS02 in the review, review intact | export-first done-state "Exported 14:02" | consequences list fixed, body scrolls |
| Settings · route | — | section skeletons | "This admin page could not load" | not admin → 403 card + Back to seat map | — |

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
| Ghost button on the dark panels | History (Show more, Retry), Account (Sign out), left-panel errors never | **hand-built** dark variant, zone-scoped (`.sp-panel .cds-btn--ghost`) | Added in Phase 3 PR 2: `.cds-btn--ghost` text is blue 60 = 3.0:1 on gray 100 in the light theme; the variant uses `--sp-panel-dark-link` (blue 40) |
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
| Page header with tabs + one primary | Management | exists `.cds-page-header`; tabs **hand-built** (index has none) | Primary follows the tab; sticky tabs |
| Data table, sortable, kebab per row | Management | exists `.cds-table`, `.cds-sort`, overflow menu | Short (32px) rows; status via `.cds-status` |
| Toolbar with search + live count | Management | exists `.cds-toolbar` | Count replaces the tiles |
| Side panel 480, slide-over (focus-trapped) | Management | partial `.cds-side-panel` (slide-in) | **hand-built** the slide-over variant + scrim |
| Combobox (department) | Management | **hand-built** | Managed list + free text |
| Confirm modal over a side panel | Management | exists `.cds-modal` | Danger primary; never a modal over a modal |
| One-field create modal | Management | exists `.cds-modal`, `.cds-text-input` | 50/50 bleed buttons |
| Structured list with inline rename | Management | none needed | Rows 48px; ghost + overflow |
| Tag "Not in list" | Management | exists `.cds-tag` | — |
| Callout (non-dismissible, no status) | Settings | partial `.cds-notification` | **hand-built** the callout variant (no icon, no close) |
| Section with one primary + file line | Settings | exists `.cds-btn` set | Labelled file trigger = button + hidden input with the same name |
| Narrow tearsheet | Settings | **hand-built** (the map's wide tearsheet, narrow variant) | 720 centred; Cancel · primary 50/50; no × |
| Count cards | Settings tearsheets | none needed | Tiles, `heading-03` numeral |
| Consequences list | Settings restore | none needed | Plain list, one line each |
| Ghost button with in-place done-state | Settings restore (D6-e) | exists `.cds-btn--ghost` | Done-state text replaces the label; not disabled |
| Inline status / error under a section | Settings | exists `.cds-notification` | Task-generated → inline |

Nothing in the shell uses Blue 60: the shell has no primary action. Phase 3 assigns `$border-interactive`
to the current-link bar and `$focus` to the ring.

---

## 4. Carbon conformance of Phase 2 — what is true to IBM, what differs

Method as PHASE1IA §E: each Phase 2 decision checked against the skill text read this phase (`SKILL.md`,
`senior-workflow.md`, `ui-shell.md`, `patterns.md`, `composition.md`). **TRUE** = direct application;
**DIFFERS** = ledgered as a deviation; **NOT COVERED** = product judgment, recorded with its reopen line.

| Decision | Verdict | Skill text |
|---|---|---|
| D0-f one 320 width for all right panels | TRUE | ui-shell right panel: "consistent width… only one may be open" |
| D0-g History depth 10 + Show more | TRUE | patterns Overflow: "prefer a Show more button over scrolling, gradients or fades"; ui-shell: never unbounded content in a side panel |
| D0-h hamburger only where the panel has content; slot reserved | TRUE | ui-shell: hamburger "only when there's a collapsible left panel"; "icons don't move" |
| D1-c one right slot, slide-in pushes; shell panels float | TRUE | composition: slide-in "pushes page content and does not trap focus"; ui-shell right panel "floats over page content" |
| D1-d Focused search, both scope counts incl. zero, scope offers the wider set | TRUE | patterns Search: Focused; "Always display the number of results, including zero — and per scope" |
| D1-e Copy link with a "Copied" confirmation | TRUE | patterns Common actions: Copy |
| D1-f Find me not-in-directory → inline notification | TRUE | patterns Notifications: task-generated → inline |
| Publish disabled at N = 0 with the reason beside it | TRUE | patterns Disabled: "pair it with an inline warning explaining how to enable it" |
| Publish review as a wide tearsheet with the rail used for the summary | NOT COVERED | composition gives the wide rail to a progress indicator; a single-step review has none, so the rail carries the readiness summary. Reopens if the review gains steps |
| D2-a inspector 400, not 480 | **DIFFERS — deviation 15** | composition side panel 480 |
| D2-b one primary in the row; Undo/Redo/Add seat ghost; ⋯ holds Discard only | TRUE | SKILL "One primary action per section… everything else tertiary or ghost"; senior-workflow progressive disclosure |
| D3-a no page-level primary on Reception | NOT COVERED | composition: the page header carries "the page's one primary action" — it assumes one exists; Reception creates nothing. Reopens if Reception gains a task |
| D3-a density by zone (list dense, readout calm) | TRUE | senior-workflow: "Resolve by zone, not by screen" |
| D3-b unlabelled search with clear ×; count incl. zero | TRUE | patterns Search: "Never label a search field"; Common actions: Clear = close icon right of the field |
| D3-c `?q=` written on lock | TRUE | ui-shell: "encode view, filters, selection and mode in the URL" |
| D3-d "No extension on file" + fallback | TRUE | patterns Empty states: "Never lead into a dead end" |
| D3-e own error boundary copy | TRUE | patterns Empty states — error management: "why there's no data and what to do" |
| D5-a page header owns the one primary; tabs for peer facets | TRUE | composition Page anatomy; senior-workflow "tabs for peer facets of one object" |
| D5-b side panel because the table is referenced; slide-over, focus-trapped | TRUE | SKILL form table: side panel when "the user must keep referencing what's behind it"; composition: slide-over "overlays and traps focus (it's a dialog)" |
| D5-b confirm dialog on top of a side panel | TRUE | composition: "a modal never nests" — side panels and tearsheets "may open a confirmation" |
| D5-c one-field create modal; visible row actions | TRUE | patterns Dialogs / composition Modal: "One or two fields"; taste: hover-only actions are a tell |
| D6-a callout for standing guidance | TRUE | patterns Callout: "Loads with the page. Not triggered, not dismissible" |
| D6-b/c reviews as narrow tearsheets | TRUE | SKILL: "never put large or complex data in a dialog"; composition narrow tearsheet: "medium complexity with scrolling or sections; no distinct steps" |
| D6-c restore = confirm with consequences, no typed confirmation | TRUE | SKILL destructive table: moderate |
| D6-e export-first ghost action with in-place done-state | NOT COVERED | product safety affordance; keeps the review open (no nested container). Reopens if restores gain an automatic pre-export |
| No new §6 deviation beyond 15 | — | 11 and 13 stay reserved |

Every empty state names a next step; every search reports a count including zero; no screen interrupts
without a user action; one primary per section throughout; contrast, motion tokens and both themes are
Phase 3 gates (nothing here asserts a ratio).

## 5. Phase 4 obligations surfaced by Phase 2 (build items, not open questions)

- Undo / Redo keyboard shortcuts (none ship) — tooltips in D2-b promise them.
- History panel "last edit N min ago" — derive from max draft `updated_at` (trigger-maintained).
- Roving tabindex + arrow keys across markers; Esc cancel ladder (D1, §1M.11).
- `?q=` on `/`, `/admin`, `/reception`; `?dept=/?zone=/?status=`, `?names=` (B3).
- Reception `error.tsx` in its own voice; loading skeleton on the real layout (D3-e).
- 5 MB client guard on CSV and snapshot files; labelled file triggers (D6-b, frame invariant).
- Management: real tablist; not-admin 403 card gains its action; tiles removed (D5-a/d).
- Settings: Reset draft entry removed (ruling 22; Q7 keeps the map's Discard).
- Ask Planner drawer 408 → 400 (D1-c slot width).

---

## Slice log

| Slice | PR | Status |
|---|---|---|
| 1 Shell | #500 (`docs/phase2-shell`) | wireframes: `shell-header.html`, `shell-left-panel.html`, `shell-right-panels.html`, `shell-narrow.html` |
| 2 Map | #501 (`docs/phase2-map`) | wireframes: `map-published.html`, `map-draft.html`, `map-publish-review.html`, `map-fallbacks.html` |
| 3 Reception | #502 (`docs/phase2-reception`) | wireframe: `reception.html` |
| 4 Management | #503 (`docs/phase2-management`) | wireframe: `management.html` |
| 5 Settings | #504 (`docs/phase2-settings`) | wireframe: `settings.html` |

**What I'd tell Phase 3 (written at close-out, 2026-09-03).** Things Phase 2 learned that the sections above
only imply. (1) Height binds, not width: at the measured 1920×889 the plan's 2.204:1 aspect leaves 753px of
canvas, and every width ruling (320 shell panels, the one 400 right slot, deviation 15) was settled by what it
did to marker pitch, not by column count — re-measure pitch before moving any right-edge width, and size the
inspector's name type for a ≤22-character name inside 400 minus padding. (2) Nothing geometric survived
unrendered: D0-f's first justification was wrong until the Help panel was actually drawn, the History event
needed a third line (72px) once real date · email text went in, and every annotation overlap was found in a
screenshot, never by reading the HTML — render Phase 3 specimens through the same headless-Chrome rig
(localhost static server + Playwright `chromium.launch({ channel: "chrome" })`; the browser extension refuses
`file://` and times out on 1920px pages) before making any conformance claim. (3) The four frame invariants the
owner checked at merge — a disabled control's reason stated beside it, never only in a tooltip; counts show
zero, never blank; tearsheets exit via Cancel only, no close ×; file triggers state the accepted type and the
5 MB limit up front — are component defaults, not per-screen notes: encode them once in the Phase 3 layer so
Phase 4 cannot forget them screen by screen. (4) Two places the Carbon tables do not settle: exactly five fields
sits between "fewer than five → dialog" and "more than five → side panel" (D5-b was justified by the admin
needing to keep referencing the table behind the panel — reuse that argument, never the field count), and a
surface can legitimately have no page primary (Reception, D3 — don't manufacture one). (5) §3's
exists-vs-hand-built column was classified from the `carbon-components.css` class index by name only, because
reading the file body was forbidden in Phase 2; verify each "exists" against the real class before building on
it, and expect the hand-built rows (the export-first ghost with its in-place done-state and the publish-review
summary rail among them) to need their own specimens. (6) Ask Planner shares the 400 slot with the inspector
and must carry Carbon-for-AI labelling — a token and label decision Phase 2 deliberately left to you; the
drawer's 408 → 400 width change is already a Phase 4 item in §5.
