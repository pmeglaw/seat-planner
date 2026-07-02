# Seat Planner — Production UX Audit (2026-07-01)

Scope: live production app at seats.megeredchianlaw.com, driven interactively (admin map, inspector,
search, filters, map tools, Ask Planner, publish review, Management tabs, viewer). Evidence captured
as live screenshots during the session. Severity: 🔴 high · 🟠 medium · 🟡 low.

Product principles honored throughout: map = spatial truth; viewer search-led; admin workflow-led;
publish review-led; management list-led; draft/published separate; zero-training UI.

---

## A. Cross-cutting findings

### A1. 🔴 The UI explains itself in prose — everywhere
- **What**: Explainer paragraphs compensate for unclear structure: Map tools contains a green note
  telling you publish is *not* there ("Use the draft status button in the main command bar…");
  the publish dialog has a "Count note" explaining how to read its own overlapping metrics;
  inspector has an "Actions / Rules" section explaining in prose why buttons below it are disabled;
  Ask Planner explains its read-only nature twice.
- **Why it matters**: When the interface needs paragraphs to explain where features are or why
  buttons are disabled, the IA and affordances have failed the "zero training" principle. Text is
  read once, then becomes permanent noise.
- **Fix**: Progressive disclosure + tooltips on disabled controls + correct action placement.
  Complexity: M. Benefit: large (every screen gets calmer).

### A2. 🔴 Redundant status displays (same fact 3–5 places)
- Seat counts (60/6/54) appear in: dark rail tiles, filter-panel stats grid, search-result
  summary, Management stat cards. The status line "Ready to search, select, or adjust the draft
  map" renders **twice simultaneously** (top bar right + canvas header).
  Inspector states "Assigned to PATRICK" 5 ways (title, subtitle, badge, STATUS field,
  ASSIGNMENT field) plus ZONE twice ("Zone: West Pod" and "Detected zone: West Pod").
  Viewer result rows: "Open seat · Center West" + "AVAILABLE" badge (same fact).
- **Fix**: one source-of-truth placement per fact. Complexity: S–M.

### A3. 🟠 ALL-CAPS + orange section labels as the primary hierarchy device
- COMMAND SEARCH, PLANNING CANVAS, DRAFT PUBLICATION STATUS, SEAT STATUS, ADMIN TOOLS, SEAT
  SUMMARY, ASSIGNMENT WORKFLOW… plus employee NAMES rendered all-caps. Shouty, hurts scanning,
  reads as unfinished. Names in caps also looks like a data bug.
- **Fix**: sentence-case labels, weight/size/space for hierarchy. Complexity: S.

### A4. 🟠 Three product identities in one product
- Admin map: light content + dark left rail. Management: dark navy page + floating white cards.
  Viewer: all-white "Office Seat **Finder**". Different backgrounds, titles, and component styles.
- **Fix**: one design system, shared shell; viewer may be lighter-weight but same DNA. Complexity: M.

### A5. 🟠 Weak keyboard focus indicator (WCAG 2.4.7 risk)
- Tabbing through the toolbar produces a faint tan outline barely distinguishable from the
  resting border (verified live). Contrast of focus ring ≈1.6:1 (measured on codebase).
- **Fix**: high-contrast 2px ring (already fixed on design branch). Complexity: S.

---

## B. Admin map screen

### B1. 🔴 Core spatial actions buried in a drawer
- Add Seat / Move Seat / Swap Seats — the *primary admin workflow* — live inside the "Map tools"
  drawer behind a generic button, while the top bar spends space on Management/Ask Planner
  (which are ALSO duplicated inside the same drawer, along with Undo/Redo).
- **Why**: workflow-led admin should surface workflow actions; duplication creates two mental
  maps for one feature set.
- **Fix**: canvas-adjacent action bar (or seat-context actions) for add/move/swap; drawer keeps
  only genuinely advanced/rare utilities. Complexity: M. Benefit: highest of the audit.

### B2. 🔴 "Advanced recovery — Developer backup restore" exposed in end-user UI
- Developer/recovery utilities and "Destructive actions" sit two clicks from daily tools.
- **Fix**: move behind an admin-settings area with confirmation gates; label in user language.
  Complexity: S–M. Enterprise readiness issue.

### B3. 🟠 Search result list pushes the map down
- Multi-match search inserts a results block *above* the canvas: ~3 rows visible of 20, big
  scrollbar, map (the source of truth) loses ~200px. Stale inspector from a previous
  auto-selection stays open over the results (state mismatch W08 vs "west" query).
- **Fix**: results in a side panel (viewer already does this) or compact overlay; searching
  clears/updates selection state. Complexity: M.

### B4. 🟠 Search auto-select re-opens the inspector
- Single-match search auto-selects and re-opens the inspector you just closed; floating result
  chip text truncates ("Auto-selected W08 for…").
- **Fix**: highlight + "press Enter to open" instead of forced selection. Complexity: S.

### B5. 🟡 Message grammar/polish
- "1 draft seat match current search and filters" (should be *matches*). Truncated card copy in
  Map tools ("Place a new custo…", "Select source, targ…").

### B6. 🟡 Left-rail dead space
- Dark rail has a large empty void between publication status and the legend at the bottom.

### B7. 🟠 Legend swatches indistinct
- SEAT STATUS legend colors (white/ivory/yellow pills on dark) are hard to tell apart; on the map,
  assigned vs open pills look nearly identical until hover/zoom ("Show names" off).
- **Fix**: distinct hue/shape coding + count per status in legend. Complexity: S–M.

## C. Inspector

### C1. 🔴 One seat, ~4 facts, a wall of chrome (largely addressed on design branch)
- Production inspector: title ×2 assignment, 3 badges, draft-impact panel, 4-field summary
  (2 fields duplicating badges), Ask Planner row, workflow section, detected-zone row (duplicate),
  notes, actions/rules explainer, then 5 footer buttons (2 disabled, Vacate styled as danger).
- **Fix**: single header fact line, one status chip, fields once, actions = Move/Swap/Vacate
  neutral buttons, rules via disabled-button tooltips. Complexity: M (done on branch).

## D. Publish review dialog

### D1. 🟠 Zero-change state renders ~9 explanation blocks
- Two green banners, 4 impact cards (all "0 changes"), "Count note" disclaimer, 3 delta cards,
  totals row, third green banner, empty "Added/Removed seats" sections, disabled CTA.
- **Fix**: empty state = one line ("Draft matches published map") + disabled publish; full
  detail only when changes exist; keep impact-summary model (it's the right model). Complexity: S–M.

## E. Management

### E1. 🔴 Department data integrity contradictions (functional bug surfaced by UI)
- Departments tab: "Accounting — 0 employees" while Employees tab shows Alex Shabaz under
  "Accounting"; employees reference departments not in the managed list ("Social Media", "HR");
  viewer shows person PATRICK as "IT" but his seat card says "No department".
- **Fix**: single relational source for departments; counts from the same source. Complexity: M (data/code).

### E2. 🟠 Card-grid roster won't scale
- 2-col employee cards, no sort/columns/pagination; fails at 500–5,000 employees (brief's target).
- **Fix**: table with sort/filter/virtualization + density toggle. Complexity: M.

### E3. 🟠 Red Delete on every Departments/Zones row
- A page of danger buttons; destructive action is the most prominent affordance.
- **Fix**: overflow menu or hover-reveal; confirm with consequences. Complexity: S.

### E4. 🟡 Stat cards double-labeled
- "60 DRAFT SEATS / EDITABLE MAP" — two caps labels per card read as two different metrics.

### E5. 🟡 Copy leaks implementation
- "…without touching marker tools", "when the profile can be resolved", tab named
  "Publish History" is fine but its highlight card duplicates row 1 of its own table.

## F. Viewer

### F1. 🟠 Duplicate entity results
- Searching "patrick" returns PATRICK (person) and W08 (seat) as two cards for one answer —
  with contradictory departments (E1).
- **Fix**: merged person+seat result card. Complexity: S–M.

### F2. 🟡 Dev-speak states
- "Results: Ready", "1 MAPPED", "Nothing selected / No published seat is selected" (duplicate
  phrasing). Directory shows unexplained subset (4 of 8 departments).

## G. Not yet audited (gaps to close later)
- True responsive behavior (window resize blocked in session); loading states; error states;
  keyboard operation of the map itself (arrow keys, Esc); Ask Planner answer quality; CSV flows;
  Seat rules dialog internals.

## H. What already works (preserve)
- Map as focal point; hover reveals occupant name; search dims non-matches and zooms to fit;
  draft→review→publish model with impact summary; read-only Ask Planner separation; undo/redo
  present; viewer's side-panel results layout (right pattern, reuse it in admin).
