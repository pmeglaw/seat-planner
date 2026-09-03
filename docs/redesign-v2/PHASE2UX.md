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

## 2. States matrix

| Screen / element | Empty | Loading | Error | Partial | Overflow |
|---|---|---|---|---|---|
| Shell · mode indicator | "Not yet published" (hollow square) | skeleton bar | "Publish state unavailable", still opens the panel | — | "Draft — 120 changes" fits; narrow → mark + count |
| Shell · left panel | no options → empty state naming Management / "Ask an admin" | skeleton rows per group | inline error + Retry, map usable | one group failed | body scrolls, header row pinned; names truncate with `title` |
| Shell · History (admin) | never published → empty state, switch kept | skeleton rows | inline error + Retry, switch works | unresolved actor → "an admin" | Show more → 25-cap caption |
| Shell · History (viewer) | "Nothing has been published yet · Ask an admin" | skeleton line | inline error | — | — |
| Shell · Account | unseated → read-only "No seat published for you yet" | — | sign-out failure → inline error | — | long email wraps, never truncates |
| Shell · Help | — | — | — | — | body scrolls |
| Map (both modes) | *slice 2* | | | | |
| Reception | *slice 3* | | | | |
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
| Tooltip on icon buttons | utilities | **hand-built** | Hover + focus, `label-01` |

Nothing in the shell uses Blue 60: the shell has no primary action. Phase 3 assigns `$border-interactive`
to the current-link bar and `$focus` to the ring.

---

## Slice log

| Slice | PR | Status |
|---|---|---|
| 1 Shell | `docs/phase2-shell` | wireframes: `shell-header.html`, `shell-left-panel.html`, `shell-right-panels.html`, `shell-narrow.html` |
| 2 Map | — | not started (waits for slice 1 to merge) |
| 3 Reception | — | — |
| 4 Management | — | — |
| 5 Settings | — | — |
