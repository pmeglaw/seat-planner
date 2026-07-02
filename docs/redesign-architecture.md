# Seat Planner — Consolidated Redesign Architecture (System Model)

Status: reconciled v1 (2026-07-01). Derived from the production UX audit
(`docs/ux-audit-production-2026-07-01.md`, findings A1–F2), drafted as five model layers by
independent passes, then reconciled after an adversarial cross-layer review found 13 contradictions
and 12 gaps (§6). This document is the single buildable spec; the Figma page "3b · System Model"
visualizes it.

**How the layers relate:** the *root-cause model* (§1) explains why the audit findings exist and
states the invariants; the *surface model* (§2) defines the space the UI may occupy; the *state
machine* (§3) defines what happens in that space over time; the *action taxonomy* (§4) defines
where every verb lives; the *data model* (§5) defines what every fact is and which surface owns it.
A change to any screen must be checkable against all five without product context.

---

## 1 · Root causes — 21 findings collapse to 5 failure classes

Every audit finding is claimed by exactly one primary root cause. A root cause is a *generator*:
fix a finding without its root cause and the class reappears on the next screen built.

### RC1 — Fact sprawl (no fact has one owner)
Facts (counts, statuses, assignments, deltas) are re-rendered wherever convenient, computed in
parallel, and drift into contradiction. Zero-quantity facts get full-detail chrome.
- **Claims:** A2 (stats ×4 places), C1 (inspector ×5), D1 (9-block empty publish), E1 (dept
  contradictions), E4 (double-labeled cards), F1 (duplicate person+seat results).
- **Invariant:** ONE FACT, ONE PLACEMENT, ONE QUERY — per screen state each fact renders once;
  every count derives from the same query as the list it summarizes; zero-quantity groups collapse
  to one line.
- **Verify:** fact-inventory review pass (≥2 placements = defect); test that summary counts equal
  their backing query's row count; snapshot test that the zero-delta publish dialog is one line.

### RC2 — Prose as duct tape (the UI narrates its failures in developer voice)
Structural failures are patched with static explanatory text, written in internal vocabulary, with
no copy gate (grammar, pluralization, truncation).
- **Claims:** A1 (explainer panels everywhere), B5 (grammar/truncation), E5 (implementation-leak
  copy), F2 (dev-speak states).
- **Invariant:** NO LOAD-BEARING PARAGRAPHS — no persistent instructional prose on working
  surfaces; disabled controls explain themselves only via their own tooltip; if copy is needed to
  say *where* a feature lives, the placement is the defect.
- **Verify:** "delete every sentence from the mock — if it stops making sense, file an IA defect";
  string lint (>12-word static copy on non-dialog surfaces, banned-term glossary, plural templates).

### RC3 — Inverted action hierarchy (placement by convenience, not frequency × consequence)
Daily workflow buried in a drawer; developer recovery and per-row red Delete in the open.
- **Claims:** B1 (Add/Move/Swap in drawer + duplicates), B2 (dev recovery exposed), E3 (red
  Delete per row).
- **Invariant:** PLACEMENT FOLLOWS FREQUENCY × CONSEQUENCE — daily actions ≤1 click from their
  object; rare/destructive only in gated Settings or overflow menus behind consequence-stating
  confirms; one entry point per action per screen; the most prominent control in a region is never
  destructive.
- **Verify:** per-screen action audit table (action, frequency class, consequence class, click
  depth, entry-point count); fail conditions are mechanical.

### RC4 — The map pays the rent (canvas treated as the flex region)
The declared source of spatial truth is what shrinks, shifts, or loses state when transient UI
appears, while permanent chrome hoards unused space.
- **Claims:** B3 (results push map + stale inspector), B4 (auto-select hijack), B6 (rail dead
  space).
- **Invariant:** CANVAS DIMENSIONS ARE CONSTANT ACROSS ALL TRANSIENT STATES; typing a query never
  *creates* a selection or opens the inspector/detail — it may clear an existing selection and
  populate the results list; only an explicit commit (Enter/click) selects or opens detail.
  *(Reworded in reconciliation — the original "typing never mutates selection" contradicted the
  evict-on-search rule, §6-C9.)*
- **Verify:** layout regression — canvas bounding box pixel-identical before/during/after opening
  results, filters, inspector, Ask Planner at each breakpoint; interaction test that only
  Enter/click opens detail.

### RC5 — Three apps in a trench coat (no shared system, loudest option wins)
Ad-hoc styling per surface: three identities, ALL-CAPS+orange as hierarchy, sub-AA focus ring,
indistinct status swatches, bespoke card grid where a 5,000-row list is required.
- **Claims:** A3 (caps/orange), A4 (three identities), A5 (focus ring), B7 (legend indistinct),
  E2 (card grid at scale).
- **Invariant:** EVERY SCREEN COMPOSES FROM THE ONE SHELL AND TOKEN SET — no local color/type/label
  decisions in feature code; hierarchy by weight/size/space, never caps or accent; status encodings
  differ by ≥2 channels (hue + shape/icon); one global focus-ring token ≥2px, ≥3:1; unbounded
  collections use the system virtualized table.
- **Verify:** "could this screenshot be from a different product than the last one reviewed?";
  style lint bans raw hex and `text-transform: uppercase` outside tokens; axe/contrast CI.

**Coverage rule:** a future finding that fits none of these five classes forces a sixth — that is
the signal this model needs revision. (Ask Planner *answer quality* is declared out of
architectural scope.)

---

## 2 · Surface model — one shell, seven regions

The shell defines exactly seven regions; no product may introduce another. Admin, management, and
viewer render the SAME shell component tree; only the canvas occupant and permission-gated chrome
items differ (a DOM diff across routes shows zero structural divergence beyond gating). There is
**no status footer** — ambient status prose is banned three ways (RC1, RC2, data model §5); its
former jobs go to the mode card, toasts, the legend, the chip, and an invisible aria-live region.

**Z-stack:** CANVAS (0) = docked PANEL SLOT (0) < CHROME (sticky 30) < OVERLAY (40) < SHEET (50)
< MODAL (60) < TOAST (70).

| Region | Allowed occupants | Eviction / rules |
|---|---|---|
| **CHROME** (dark bar, 56px, single row, never wraps/hides) | Identity · draft-status chip (admin roles; sole draft/publish display; opens publish review) · centered search (⌘K) · text commands Show names / Filters / Undo / Redo · right cluster Management / Ask Planner / avatar · **aria-live announcer (invisible)** | Never preempted; below 1140px commands collapse into one overflow menu; below 900px search collapses to an icon opening an overlay input |
| **CONTENT CANVAS** | Exactly one: draft map (admin) \| published map (viewer) \| tables (management) \| Settings pages (routed, gated) | Occupant changes only by route navigation. Measured width/height identical before/during/after any overlay/sheet/modal/toast activity — **no event may reflow the canvas** (docked slot is permanently reserved layout). Floating surfaces auto-pan the map so the selected seat is never occluded. Map interactive wherever visible. The **map key/legend** renders in the IDLE dock at docked tiers, and as a collapsible element of the canvas tool cluster at overlay/sheet tiers and on the viewer at all tiers (expanded by default on viewer) |
| **PANEL SLOT** (right; ONE per screen; one occupant; never stacks) | Map routes: EMPTY \| **MAP KEY** (IDLE, docked tiers) \| SEARCH RESULTS \| DETAIL (inspector / read-only card) \| **MODE CARD** (move/swap/place). Management routes: EMPTY \| DETAIL (row edit) — **SEARCH RESULTS is a map-route occupant only**; management search filters the table in place | Last-intent-wins: search submit replaces any occupant with RESULTS; selection replaces with DETAIL; Esc/close per the Esc ladder (§3). Single-match search highlights + "Enter to open" — never auto-opens DETAIL (B4). Docked tiers: slot permanently reserved on map routes (MAP KEY when idle), collapses only on non-map routes. Occupant + scroll state survive breakpoint transitions |
| **OVERLAY** (40) | Filters drawer, Ask Planner drawer, overlay-mode panel slot (900–1139), sub-900 search input, menus, tooltips | One drawer at a time (opening one closes the other). Drawers never *evict* the slot occupant — but at overlay tiers an open drawer renders above the slot and the slot is visually hidden until the drawer closes (state preserved/restored); at most one right-anchored surface is ever visible. Esc/click-outside closes; no scrim; never reflows lower layers |
| **SHEET** (600–899; 50) | Slot occupants and drawers present as bottom sheets, max 50vh, drag handle | One sheet at a time; a drawer sheet temporarily replaces the occupant sheet, which re-presents on dismissal (PRIMARY unchanged). **No focus trap; partial scrim over the sheet's own area only; the map above stays visible and interactive** (required for pick-target modes). Selected seat auto-pans into the visible upper half |
| **MODAL** (60) | Publish review (from the draft chip only), T2/T3 confirmations, **CSV import preview + confirm** | 40% scrim, focus trap, blocks lower layers. Freezes and restores slot+drawer state. Esc/scrim-click closes non-destructive modals only. Full-screen below 900px |
| **TOAST** (70) | Transient confirmations and errors only; max 3 | Success auto-dismiss 5s, errors persist, hover/focus pauses; bottom-center within canvas bounds, never over slot/drawer/sheet; persistent status/hints banned |

**Breakpoints (four tiers — canonical):** ≥1440 dock 360px · 1140–1439 dock 320px (chrome commands
collapse to overflow) · 900–1139 slot overlays at min(360px, 40vw), canvas 100% width · 600–899
sheets, search icon. At every tier: 56px single-row chrome, one slot occupant, one drawer, canvas
never reflowed by transient UI.

**Elevation:** flat = chrome bg, canvas, empty slot · raised = docked slot, sticky table headers,
the canvas tool cluster (floating, pinned inside the map viewport, consumes no canvas geometry) ·
overlay = drawers, overlay slot, menus, tooltips · **sheet** = bottom sheets (large shadow, no
focus trap, z 50) · modal = dialogs + full-screen publish <900 (scrim + trap, z 60) · toasts z 70.
A surface's elevation is determined by its region, never per feature.

**Loading/error ownership:** every region renders its own loading placeholder and blocking errors
inline within its fixed geometry (canvas skeleton at canvas size, slot skeleton at slot width,
modal inline error above its CTA); loading never changes region dimensions; toasts carry only
transient failures of committed actions, with Undo/Retry.

---

## 3 · Interaction state model

One machine over a 3-tuple — PRIMARY × DRAWER × MODAL — exactly one value each at all times.

- **PRIMARY** ∈ { IDLE, SEAT_SELECTED(seat), SEARCHING(query), RESULT_FOCUSED(query, result),
  MOVE_MODE(src), SWAP_MODE(first), **PLACE_MODE** }
- **DRAWER** ∈ { none, filters, ask-planner } — overlays only; never changes PRIMARY beneath.
- **MODAL** ∈ { none, publish-review, **confirm(action)** } — Settings is a *route* (canvas
  occupant), not a modal; T3 typed confirms open as `confirm` from the Settings page.
- The panel slot is owned exclusively by PRIMARY: idle map key, inspector, results, or mode card —
  never two at once. A query string is retained *context*, not a state: SEAT_SELECTED can carry a
  non-empty query (bar keeps text, canvas keeps dim), which determines where Esc returns.

**Per-state slot/canvas contract (footer deleted — feedback via toasts + aria-live):**

| State | Panel slot | Canvas |
|---|---|---|
| IDLE | Map key (docked tiers) / closed | Full map, no dim, no rings |
| SEAT_SELECTED(s) | Inspector: one header fact, one status chip, fields once, Move/Swap/Vacate neutral; Delete in overflow; "Unpublished change" tag (display-only) | Selection ring on s; ambient dim persists if query non-empty |
| SEARCHING(q) | Results list (count header with keyboard hints; zero matches = one line) | Matches highlighted, others dimmed, zoom-to-fit; **map loses zero height** |
| RESULT_FOCUSED(q,r) | Results with row r focused | Seat(r) pans/pulses — highlight, NOT selection |
| MOVE/SWAP/PLACE_MODE | Mode card ("Moving W08 — click a destination · Esc cancels", Cancel button) | Source pinned; valid targets afforded; crosshair |

**Esc priority ladder (strict; one rung per press; reaches IDLE in ≤4 presses, no dead presses):**
1. MODAL≠none → close modal, restore snapshot
2. DRAWER≠none → close drawer
3. PRIMARY ∈ {MOVE, SWAP, **PLACE**}_MODE → cancel mode → SEAT_SELECTED(source)/IDLE; draft unchanged
4. SEAT_SELECTED, query non-empty → SEARCHING(query) (inspector hands the slot back to results)
5. SEAT_SELECTED, query empty → IDLE
6. RESULT_FOCUSED → SEARCHING (clear focus/pulse only)
7. SEARCHING → IDLE (clear query, dim, zoom; blur input)
8. IDLE → blur focused control to canvas

**Key transitions (full table in the model layer):** typing evicts inspector/selection in the same
frame (INV-1); click-seat evicts results but retains query + dim; click-seat during a mode =
pick-target; canvas interactions close an open drawer in the same gesture; ⌘K focuses search and
closes drawers; open-publish cancels pending modes, snapshots {PRIMARY, query, viewport}, restores
bit-for-bit on close (after successful publish the chip resets to zero-delta).
**Added in reconciliation:** `vacate` — SEAT_SELECTED(s) → SEAT_SELECTED(s), toast+Undo, chip
increments · `delete-seat` — → IDLE, toast+Undo (undo restores AND re-selects) · `undo/redo` —
PRIMARY preserved if the affected seat still exists, else IDLE; never enters a mode ·
`toggle-show-names` / `filter-change` — PRIMARY unchanged; filter-change while SEARCHING recomputes
matches in place · `start-add` → PLACE_MODE from IDLE/SEAT_SELECTED/SEARCHING (context retained);
place → SEAT_SELECTED(newSeat) + toast · `navigate-settings` — route change like
navigate-management.

**Hard invariants (testable):**
- **INV-1** evict-on-search: entering SEARCHING evicts inspector/selection the same frame; results
  and inspector never visible simultaneously (resolves B3).
- **INV-2** no implicit inspector: DETAIL opens only via click-seat, Enter-on-result, or
  pick-target completion. A single-match search **remains in SEARCHING**, match highlighted with
  "Enter to open" — RESULT_FOCUSED is entered only by explicit ↑↓/hover (resolves B4).
- **INV-3** one overlay: at most one drawer; DRAWER≠none ⇒ MODAL=none; conflicts close in the same
  transition.
- **INV-4** no ambient status: no surface renders app-level status text; state-scoped microcopy
  renders only inside the slot occupant it describes; transient feedback is a toast; transitions
  are announced via one aria-live=polite region in CHROME.
- **INV-5** Esc totality: from any reachable state, Esc alone reaches IDLE/none/none in ≤4 presses.
- **INV-6** canvas stability: no machine transition changes canvas pixel dimensions at a fixed
  viewport (docked slot is reserved layout; everything below 1140 overlays).
- **INV-7** mode determinism: the only draft-mutating exit from a mode is a valid pick-target;
  search/drawer/publish/navigation cancel the mode first. Extended to PLACE_MODE.
- **INV-8** draft-layer integrity: only add-seat, pick-target, vacate, delete-seat, seat-field
  edits, and publish mutate DRAFT-LAYER state. Management entity edits (people/departments/zones)
  mutate live relational data immediately — visible to the viewer without publish — and are
  therefore consequence-gated (T2/T3), never publish-gated.

**Keyboard & focus contract (added in reconciliation):** Tab order: chrome commands → canvas tool
cluster → canvas (roving focus over seat markers; arrow keys move between nearest seats; Enter =
click-seat; in modes arrow+Enter = pick-target) → panel slot. Every transition names its focus
destination: entering SEARCHING keeps focus in the input (↓ moves to results); opening DETAIL moves
focus to the inspector heading; closing any occupant returns focus to its invoker. The aria-live
region announces PRIMARY transitions.

**Publish sub-state:** PUBLISHING — CTA disabled + inline spinner; failure renders inline error in
the modal (snapshot NOT discarded); a rejected optimistic draft edit rolls back with an error toast
naming the seat.

**Management:** sibling route, same shell; PRIMARY ∈ { TABLE_BROWSING(tab), ROW_EDITING(tab, row) };
search filters rows in place; row Edit opens in the slot with the same breakpoint behavior; dirty
edits confirm-discard before eviction; Esc ladder mirrors the map's.

**Viewer:** runs the same machine with MOVE/SWAP/PLACE unreachable, drawers per gating,
MODAL=none always, DETAIL = the merged read-only card; INV-1, INV-2, INV-5, INV-6 and Esc rungs
4–8 apply verbatim.

---

## 4 · Action taxonomy — 7 classes, one home per action

**Global rules:** every action has exactly one home; cross-links only as (a) keyboard shortcuts,
(b) ⌘K palette commands, or (c) ownership-law navigation references (reference-only, never
re-rendering the value). Disabled controls stay visible, dimmed, with a reason tooltip — prose
explainer panels are banned (the standalone **Seat rules dialog is retired**; rule communication
exists only as disabled-control tooltips). Esc semantics defer to the state machine's ladder.

**Destructive tiers:** T1 draft-scoped reversible = execute immediately + toast with Undo, no
confirm · T2 live/relational mutation = confirm naming exact scope and consequences (counts from
the same relational source the tables read) · T3 bulk/irreversible = gated Settings only + typed
confirmation of scope.

| Class | Home | Members | Policy |
|---|---|---|---|
| 1 Global command | Chrome: search (⌘K) + text commands | search, filter, show names, undo, redo | Non-destructive; Undo/Redo dim w/ tooltip |
| 2 Canvas tool | Floating cluster pinned in the map viewport | zoom/fit, overview/detail, **add seat** (place mode), select-seat (click) | Add seat = T1 |
| 3 Context action | Inspector (slot) | move, swap, vacate, delete seat (overflow), edit notes | All T1 — no confirm dialogs; publish review is the gate |
| 4 Workflow entry | Chrome: draft chip + right cluster | review/publish, ask planner, open management | Publish = T2; the review dialog IS the confirm; no nested confirm |
| 5 Management CRUD | Management tables | employees/departments/zones CRUD, publish history, CSV import/export | Entity delete = T2 with derived dependent counts; CSV import = T2+ mandatory preview diff (in MODAL layer) |
| 6 Gated utility | Avatar menu → Settings (route) | restore from backup, destructive bulk ops | T3 typed confirm; user-language labels; ≥3 deliberate steps; not in ⌘K default ranking |
| 7 Session | Avatar menu | sign out (+ the Settings doorway) | One click; menu shows signed-in email |

Zone *boundary* editing is **out of scope for this phase** — zones are name-only (the data model's
boundary mention is deferred until an interaction layer exists for it).

---

## 5 · Data & content-ownership model

**Entities (single source of truth each):**
- `people` (rename of `employees`): identity facts; `department_id` **FK** → `departments`
  (replaces free-text `employees.department`, 001_initial_schema.sql:32; backfill creates rows for
  legacy strings incl. orphans "Social Media"/"HR", then drops the text column).
- `departments`: unique name; **no stored counts**. Replaces both free text and `department_options`.
- `zones`: unique name; replaces `zone_options` + free-text `seats.zone`. Name owned by Management;
  boundaries out of scope this phase. Zone is a property of a SEAT, never of a person.
- `seats` (per layer draft|published): spatial facts only — position, key/label, `zone_id`,
  availability (loses the stored 'assigned' status), notes. x/y editable only via the map.
  `seats.employee_id` + its check constraint are **replaced by** `assignments`.
- `assignments` (per layer): the ONLY who-sits-where source; unique (layer, seat) and (layer,
  person); published-layer rows written only inside the publish RPC transaction.
- `draft_changes`: **DERIVED, never stored** — one canonical view diffing draft vs published;
  feeds the chip count, publish groups, and per-seat modified markers. Undo/redo is a client-side
  command stack, not this.
- `publications` (extends `publish_events`): append-only; gains `change_summary jsonb` frozen in
  the publish transaction. Sole publish-history source.

**Derivation rules:** no table stores a count; every count is a live aggregate through one shared
selector per fact. Seat status is a pure function (assignment exists → assigned, else
availability). Person department resolves only via the FK — seats have no department fact, so the
F1 contradiction cannot render. Draft-sync = (count(draft_changes)==0) read by chip, publish empty
state, and disabled CTA alike. **Asymmetry (INV-8):** seats/assignments are draft-layered and
publish-gated; people/departments/zones are live relational data, effective immediately.

**Content-ownership law:** every fact has exactly ONE owning surface per screen; other surfaces may
reference it only via navigation affordances that do not re-render the value — with one carve-out:
a navigation reference may include the value when the owning surface is not concurrently visible
(e.g., publish review's "Last published {time} by {who}" line linking to Publish history). Map
marker encodings are spatial truth, not textual duplicates; the legend is the single decoder ring
and owns per-status counts. Scoped subset counts ("12 of 60 seats match") are different facts from
global totals and are never styled as stat tiles.

**Ownership table (per fact → owner):** seat counts → map key/legend (map routes) + Management
overview row · draft-sync → chrome chip only · textual seat status → the one inspector/result-card
chip · visual seat status → markers (legend decodes) · assignment → inspector header line / merged
result card / employees-table Seat column (navigation link) · zone → single inspector row
("Detected zone" survives only as a pre-filled suggestion in the zone editor) · person department →
person-bearing surfaces only, always via FK · dept employee count → Departments table rows
(same selector feeds delete confirms) · person-seat answer → ONE merged card (Person ⋈ Assignment ⋈
Seat ⋈ Zone ⋈ Department) · publish deltas → publish review only (zero → one line) · per-seat
pending change → marker dot + display-only inspector tag · publish history → Management table
(no duplicate highlight card) · viewer directory → **all** active departments; any scoping stated
as a subset ("4 of 8 departments have assigned seats — show all") · ambient status line → **no
owner; removed from the product**.

---

## 6 · Reconciliation ledger (what the adversarial pass caught)

Contradictions resolved: **C1/C2** panel slot unified (5 occupants incl. MAP KEY + MODE CARD;
permanently reserved dock on map routes; no canvas reflow) · **C3** breakpoints unified on the
four-tier matrix (dock ≥1140) · **C4/C5** the status footer — itself an RC1/RC2 regression —
deleted; strings redistributed to mode card / toasts / legend / chip / aria-live · **C6** Settings
is a route; MODAL gains `confirm(action)` · **C7** publish review keeps ONE entry point (chip);
inspector tag display-only · **C8** management search filters in place; RESULTS is map-route-only ·
**C9** sheets are non-modal (no focus trap — pick-target must stay clickable) · **C10** RC4
invariant reworded (typing may clear selection/populate results; never creates selection/detail) ·
**C11** single-match stays in SEARCHING (no auto pan/pulse) · **C12** INV-8 reworded for the
draft/live asymmetry · **C13** ownership-law carve-out for navigation references.

Gaps filled: keyboard & focus contract · loading/error ownership + PUBLISHING sub-state ·
PLACE_MODE · missing events (vacate/delete/undo/show-names/filter-change) · legend home below
docked tiers + viewer · viewer machine binding · overlay/sheet collision rules · CSV preview
surface · zone boundaries deferred · viewer directory completeness · Seat rules dialog explicitly
retired · Ask Planner answer quality out of scope.

## 7 · Compliance checklist (run on any future screen)

1. Fact inventory: any fact rendered ≥2 places? (RC1)
2. Delete every sentence: does the screen still make sense? (RC2)
3. Action audit: every action ≤1 home, daily ≤1 click, destructive gated? (RC3)
4. Canvas bounding box identical across all transient states? (RC4/INV-6)
5. Could this screenshot be from a different product? (RC5)
6. Esc alone reaches IDLE in ≤4 visible presses? (INV-5)
7. Anything open detail without an explicit commit? (INV-2)
8. Every disabled control tooltipped? Every count derived from its list's query?
9. Region check: does anything render outside the seven regions or at the wrong elevation?
10. Keyboard path: can you select, move, and publish a seat without a pointer?
