# UI/UX Review God Pass - Seat Planner Internal App

Date: 2026-05-13

Scope: Next.js, React, TypeScript, Tailwind, Supabase Auth/Postgres, Vercel. Review based on local code inspection plus prior local browser attempts. Full authenticated browser review was blocked in the extracted workspace because `.env.local` is not present.

## A. Executive Summary

### Overall UX Grade

**C+**

The app is functional and has a defensible security/product architecture: admin draft map, viewer published map, Supabase-backed auth, data management, CSV workflows, and undo/redo. The main weakness is presentation and workflow clarity. The map should feel like the primary workspace. Instead, the UI currently feels like several useful controls arranged around a map. Casual admins can complete tasks, but they must read too much, infer too much, and rely on browser confirmations for high-risk actions.

### Top 5 Biggest UX Problems

1. **The map is not dominant enough.** The filter panel, inspector, toolbar, and drawer compete with the floor plan instead of supporting it.
2. **High-risk actions use browser `confirm` dialogs.** Publish, delete, CSV import, and deactivation need purpose-built confirmations with data summaries.
3. **Undo/redo is technically correct but under-explained.** Users can see buttons, but not the scope, last action, or what will happen after publish clearly enough.
4. **Inspector hierarchy is flat.** Assignment, status, notes, and employee metadata are treated with similar weight even though assignment is the primary task.
5. **Accessibility is incomplete.** Focus rings, dialog semantics, Escape behavior, live regions, disabled-state explanations, touch targets, and keyboard flows need tightening.

### Top 5 Highest-Impact Improvements

1. **Move to a map-first admin shell.** Keep filters compact by default, place core actions in a single top toolbar, and keep the inspector contextual.
2. **Replace browser confirms with structured confirmation panels.** Publish and CSV import should show grouped summaries and explicit consequences.
3. **Refactor the inspector into clear sections.** Seat identity, assignment, seat state, notes, and metadata should be visually distinct.
4. **Improve feedback states.** Add inline success notices, live-region errors, loading labels, and clear no-results states.
5. **Add keyboard support.** Escape closes panels, focus returns to the triggering control, and common shortcuts are documented unobtrusively.

### What Should Not Be Changed

- Keep the fixed floor plan image and normalized marker coordinate system.
- Keep draft and published layers separated.
- Keep Supabase Auth and `profiles.role` as the access boundary.
- Keep server actions as the admin mutation boundary.
- Keep CSV validation before import.
- Keep undo/redo scoped to draft history only.
- Keep department and zone management separate from daily map assignment.

## B. Screen-by-Screen Review

### Login/Auth Screen

- **What works:** Password-first flow with magic-link fallback is appropriate. Friendly auth messages reduce support friction.
- **Confusing:** The destination after login is not visible. Users do not know whether they are entering admin or viewer mode.
- **Visually heavy:** The centered white card is acceptable, but the page lacks brand context and production identity.
- **Risky:** Password reset and magic link actions can be clicked without strong rate-limit context.
- **Improve:** Add destination copy from `next`, clearer helper text, and `aria-live` message semantics.
- **Priority:** P2
- **Effort:** S
- **Risk:** Low

### Viewer Published Map

- **What works:** Reuses the same map component. Viewers get the published layer only.
- **Confusing:** Viewer mode still inherits admin-oriented density such as filters and inspector behavior.
- **Visually heavy:** The shell uses strong dark chrome around a static map.
- **Risky:** Viewer users may assume filters or selected states modify data.
- **Improve:** Add a simpler viewer header, read-only legend, and clearer published timestamp once available.
- **Priority:** P2
- **Effort:** M
- **Risk:** Low

### Main Admin Map

- **What works:** Draft context is visible, filters are useful, and management is separated.
- **Confusing:** Undo/redo, advanced, management, filters, map, and inspector have equal visual gravity.
- **Visually heavy:** Multiple rounded panels and glass effects compress the map.
- **Risky:** Move mode and add mode rely on text status rather than strong mode banners.
- **Improve:** Consolidate the toolbar, reduce default panel weight, and make mode state persistent and visually obvious.
- **Priority:** P1
- **Effort:** M
- **Risk:** Medium

### Seat Inspector

- **What works:** It keeps assignment close to the selected seat and prevents invalid assigned status.
- **Confusing:** Employee metadata and seat status feel like one form. It is not clear which fields affect the employee record versus the seat.
- **Visually heavy:** Floating panel competes with the map and has dense labels.
- **Risky:** Closing with unsaved changes depends on browser confirm.
- **Improve:** Split into Seat, Assignment, and Notes sections. Show selected seat summary at top.
- **Priority:** P1
- **Effort:** M
- **Risk:** Medium

### Advanced Drawer

- **What works:** v1.1.1 grouping is a clear improvement. Destructive actions are separated.
- **Confusing:** CSV, JSON backup, publish, and map tools still share one drawer.
- **Visually heavy:** Sections are readable but all sections have similar visual weight.
- **Risky:** Import and publish rely on browser confirmation text.
- **Improve:** Keep the drawer for less common tools only. Promote frequent tools to toolbar or inspector.
- **Priority:** P2
- **Effort:** S
- **Risk:** Low

### Undo/Redo Controls

- **What works:** Buttons are visible in the toolbar and disabled when unavailable.
- **Confusing:** Users need clearer scope: draft only, clears after publish.
- **Visually heavy:** Current copy is small and may be missed.
- **Risky:** A user may expect undo to affect published changes after publish.
- **Improve:** Add compact microcopy, better disabled labels, and optional shortcut hints.
- **Priority:** P1
- **Effort:** S
- **Risk:** Low

### Assignment Workflow

- **What works:** Search or enter employee name is direct. Existing employees are matched by name.
- **Confusing:** Matching behavior is implicit. Employee fields update employee records, not only seat records.
- **Visually heavy:** Position, department, notes, and status appear at similar importance.
- **Risky:** New employee creation from assignment can create directory records without a separate review step.
- **Improve:** Add "Matched existing employee" and "New employee will be created" states.
- **Priority:** P1
- **Effort:** M
- **Risk:** Medium

### Filter/Search Panel

- **What works:** Search spans useful fields. Stats and employee results help navigation.
- **Confusing:** No clear "clear filters" control. Empty results do not say which filter caused the issue.
- **Visually heavy:** Stats, legend, and results stack vertically and consume map width.
- **Risky:** Disabled employee result buttons are not explained.
- **Improve:** Add clear filters, better empty state, and move stats into a compact toolbar summary.
- **Priority:** P1
- **Effort:** S
- **Risk:** Low

### Draft Review/Publish Flow

- **What works:** Publish summary includes seat counts.
- **Confusing:** Browser confirm is hard to scan and not branded.
- **Visually heavy:** Not applicable because native dialog.
- **Risky:** Publish clears undo/redo, but the confirmation does not emphasize that.
- **Improve:** Build an in-app publish review modal with grouped counts and explicit consequence copy.
- **Priority:** P1
- **Effort:** M
- **Risk:** Medium

### Admin Management Area

- **What works:** Separates employee, department, and zone maintenance.
- **Confusing:** Row actions are small and all have similar visual weight.
- **Visually heavy:** Cards inside a dark shell look more like a dashboard than a maintenance tool.
- **Risky:** Deactivate/delete actions rely on browser confirms and do not show enough downstream impact.
- **Improve:** Add impact summaries, empty states, and clearer row action hierarchy.
- **Priority:** P2
- **Effort:** M
- **Risk:** Medium

### Employee Create/Edit/Delete

- **What works:** Search and edit panel are direct.
- **Confusing:** "Deactivate" is safer than "delete", but the UI needs to explain it before click.
- **Visually heavy:** Employee cards use repeated large avatar circles, reducing scan density.
- **Risky:** Deactivation can clear draft assignment; published assignment blocks delete server-side.
- **Improve:** Show assigned seat and deactivation impact in the panel before the destructive button.
- **Priority:** P1
- **Effort:** S
- **Risk:** Low

### Department/Zone Management

- **What works:** Counts give useful context.
- **Confusing:** Departments are people metadata; zones are physical map metadata. The UI says this, but the controls are visually identical.
- **Visually heavy:** Lists are basic and serviceable.
- **Risky:** Delete clears references across employees/seats.
- **Improve:** Add distinct helper copy, impact badges, and stronger destructive labels.
- **Priority:** P2
- **Effort:** S
- **Risk:** Low

### CSV Import

- **What works:** Template, export, preview, and validation exist.
- **Confusing:** Preview uses native confirm and does not group changes by risk.
- **Visually heavy:** Drawer copy is dense.
- **Risky:** CSV import can change many assignments at once.
- **Improve:** Add import review panel with counts, sample rows, validation summary, and explicit "draft only" copy.
- **Priority:** P1
- **Effort:** M
- **Risk:** Medium

### CSV Template Download

- **What works:** Template is available.
- **Confusing:** Users may not know whether the template contains current seats or just headers.
- **Visually heavy:** Button label is clear but context is minimal.
- **Risky:** Low.
- **Improve:** Rename to "Download blank CSV template" and add a one-line hint.
- **Priority:** P2
- **Effort:** S
- **Risk:** Low

### Import Preview/Validation

- **What works:** Validation catches unsafe rows before server import.
- **Confusing:** Errors are row-based but not formatted for scanning in a panel.
- **Visually heavy:** Native alert/confirm text does not scale.
- **Risky:** Admins can miss impact when importing many rows.
- **Improve:** Group errors into "blocking errors" and "review changes".
- **Priority:** P1
- **Effort:** M
- **Risk:** Medium

### Empty/Loading/Error/Success States

- **What works:** Some empty and error states exist.
- **Confusing:** Success feedback is inconsistent across map actions.
- **Visually heavy:** Error boxes are visible but not always scoped to the control that failed.
- **Risky:** Silent success after save/move/import reduces confidence.
- **Improve:** Add small live-region notices near the map toolbar and management forms.
- **Priority:** P1
- **Effort:** S
- **Risk:** Low

### Mobile/Tablet Behavior

- **What works:** Layout collapses into a single column and map scrolls.
- **Confusing:** Inspector and drawers can cover too much of the map.
- **Visually heavy:** Fixed panels over a scrollable map are difficult on tablet.
- **Risky:** Dragging markers on touch screens may conflict with scrolling.
- **Improve:** Add tablet-specific inspector bottom sheet and disable drag until explicit move mode is active.
- **Priority:** P2
- **Effort:** M
- **Risk:** Medium

## C. Interaction Review

- **Click behavior:** Seat selection is direct. Empty-map click clears selection, which is good but should be explained when inspector has unsaved changes.
- **Hover behavior:** Markers enlarge on hover. Good for desktop, not available on touch. Ensure selected state does not rely on hover.
- **Marker selection:** Selected marker contrast is acceptable but can be stronger. Add focus-visible rings for keyboard users.
- **Drag/move behavior:** Move mode prevents accidental movement. Add a stronger mode banner and Escape cancel.
- **Accidental movement prevention:** Current explicit move mode is correct. Keep it.
- **Undo/redo discoverability:** Present but understated. Improve labels, disabled explanations, and scope copy.
- **Confirmation dialogs:** Native confirms are the weakest part of the workflow. Replace with app modals over time.
- **Keyboard navigation:** Needs Escape support, focus return, and documented shortcuts.
- **Escape/cancel behavior:** Inconsistent. Advanced drawer, inspector, add mode, and move mode should all respond predictably.
- **Focus management:** Drawers and inspector do not trap focus. At minimum, focus should return to the opener on close.
- **Toasts/inline feedback:** Map actions need success notices. Management has messages; map has mostly errors.
- **Disabled states:** Buttons disable but often do not explain why. Add helper text near grouped controls.
- **Loading states:** Pending labels are inconsistent. Long-running CSV/import/publish need action-specific pending copy.

## D. Visual Design Review

- **Layout density:** Too many panels compete with the map. Default to compact filters and contextual inspector.
- **Spacing:** Mostly consistent, but nested rounded panels create visual noise.
- **Typography:** Functional. Needs clearer hierarchy between workspace title, mode, selected seat, and helper copy.
- **Color use:** Orange is effective for selection and brand. Use it less as decoration and more as state/action signal.
- **Brand orange usage:** Reserve for primary actions, selected seats, and focus states.
- **Dark shell/light map balance:** Dark shell gives contrast but can feel heavy. Map should own more viewport.
- **Panel hierarchy:** Inspector and filter panel should be secondary to map.
- **Button hierarchy:** Primary/destructive actions are recognizable. Secondary actions are sometimes too similar.
- **Form field clarity:** Labels exist. Need helper text for fields with cross-record effects.
- **Icon clarity:** Mostly text buttons. Add icons only for common toolbar actions when a library is available.
- **Selected/unselected contrast:** Marker selection can be stronger with outline and shadow.
- **Marker label readability:** Names can crowd small areas. Add mode for compact labels and selected-only name expansion.
- **Table readability:** Management cards are usable but less efficient than rows for larger employee lists.
- **Modal/drawer polish:** Drawer grouping works. Confirmation modals are missing.

## E. Accessibility Review

- **Color contrast:** Most text likely passes. Small gray text on translucent panels is the main risk.
- **Focus rings:** Form fields have rings. Seat markers and small icon buttons need more explicit focus-visible styling.
- **Keyboard-only use:** Basic form use works. Map markers need predictable tab order and visible focus.
- **Screen reader labels:** Markers have labels. Drawer overlay and inspector need stronger dialog semantics.
- **Button labels:** Text labels are mostly clear. "Advanced" is vague; "Map tools" or "Advanced tools" is clearer.
- **Form labels:** Present and associated via wrapped labels. Good baseline.
- **Dialog semantics:** Drawer is visually modal but not announced as a dialog.
- **Touch target sizes:** Most buttons meet 44px. Small collapse/close buttons are borderline.
- **Error text clarity:** Friendly enough, but row-based CSV errors need grouping and next-step copy.
- **Motion/reduced motion:** Transitions are modest. Add `motion-reduce:transition-none` on marker scale effects if polish continues.
- **Responsive zoom/scroll:** Map overflow is necessary. Avoid fixed overlays that cover controls on tablet.

## F. Data Quality UX Review

- **CSV import instructions:** Functional but too terse. State that rows target draft seats by label.
- **CSV template clarity:** Template is blank. Label it as blank and link current export separately.
- **Import preview readability:** Needs structured preview instead of native confirm.
- **Validation wording:** Good base. Add "Fix this by..." guidance for common errors.
- **Duplicate handling:** The unique label migration is correct. UI should warn that labels must be unique.
- **Missing required fields:** Messages are clear but should be shown in a panel with row grouping.
- **Department/zone management clarity:** Needs stronger separation of people departments versus physical zones.
- **Employee edit/delete safety:** Deactivation is safer than delete. UI should show assignment impact before action.
- **Seat assignment safety:** Duplicate employee assignment is protected. UI should explain rejection and suggest vacating first.

## Recommendation Matrix

| Area | Problem | Recommended solution | Why this improves UX | Priority | Effort | Risk | Files likely involved |
|---|---|---|---|---|---|---|---|
| Main admin map | Map competes with panels | Collapse filters by default on narrower desktops and make map header a single command bar | More map-first, less scanning cost | P1 | M | Medium | `SeatMap.tsx`, `FilterPanel.tsx` |
| Toolbar | Actions are spread out | Group Search, Undo/Redo, Advanced tools, Publish in one toolbar | Recognition over recall | P1 | M | Medium | `SeatMap.tsx` |
| Publish | Native confirm is weak | In-app publish review modal with counts and clear consequences | Reduces destructive ambiguity | P1 | M | Medium | `SeatMap.tsx`, new modal |
| Draft review | Counts are ungrouped | Group seats by assigned, reserved, unavailable, unassigned, custom | Improves publish confidence | P1 | M | Low | `SeatMap.tsx` |
| Inspector | Flat hierarchy | Split into Seat, Assignment, Notes sections | Faster comprehension | P1 | M | Medium | `SeatInspector.tsx` |
| Advanced drawer | Too many mixed actions | Keep map tools, CSV/backups, destructive actions; move publish to toolbar/modal | Reduces clutter | P2 | S | Low | `AdvancedDrawer.tsx`, `SeatMap.tsx` |
| Undo/redo | Scope unclear | Add microcopy and action-specific labels | Prevents wrong expectation about publish | P1 | S | Low | `SeatMap.tsx` |
| Employee assignment | Match/create behavior implicit | Show matched/new employee state under name field | Prevents accidental duplicate employees | P1 | M | Medium | `SeatInspector.tsx` |
| Employee management | Deactivation impact hidden | Show "Draft seat cleared" and published-blocking info before button | Safer admin maintenance | P1 | S | Low | `AdminManagementPanel.tsx` |
| Department management | Delete impact needs clarity | Add count badge and stronger confirmation copy | Reduces accidental data cleanup | P2 | S | Low | `AdminManagementPanel.tsx` |
| Zone management | Zones vs departments blur | Use physical-map copy and seat count labels consistently | Reduces concept confusion | P2 | S | Low | `AdminManagementPanel.tsx` |
| CSV import | Preview is native confirm | Add review panel with row counts, sample changes, and blocking errors | Safer bulk update | P1 | M | Medium | `AdvancedDrawer.tsx` |
| CSV template | Blank/current distinction unclear | Rename to "Download blank CSV template" | Prevents wrong file expectation | P2 | S | Low | `AdvancedDrawer.tsx` |
| Empty states | Filter no-results is minimal | Add clear filter/search action and cause-specific copy | Faster recovery | P2 | S | Low | `FilterPanel.tsx` |
| Error states | Global map error only | Add scoped live-region notices and success states | Better feedback and accessibility | P1 | S | Low | `SeatMap.tsx`, `Button.tsx` |
| Keyboard shortcuts | No visible support | Add Escape cancel/close and optional `?` help later | Improves expert workflow | P2 | S | Low | `SeatMap.tsx`, panels |
| Mobile/tablet | Fixed inspector covers map | Use bottom sheet inspector on small screens | Better touch workflow | P2 | M | Medium | `SeatInspector.tsx` |
| Accessibility | Marker focus weak | Add focus-visible ring and stronger `aria-label` | Keyboard users can operate map | P1 | S | Low | `SeatMarker.tsx` |
| Visual hierarchy | Too much rounded/glass styling | Reduce nested cards and reserve elevation for active panels | Cleaner enterprise feel | P2 | M | Medium | Multiple components |
| Marker readability | Labels crowd map | Add compact mode and selected-only expansion option | Better spatial readability | P2 | M | Medium | `SeatMarker.tsx`, `SeatMap.tsx` |
| Destructive actions | Browser confirms | Use typed confirmation or app modal for delete/deactivate | Error prevention | P1 | M | Medium | `AdvancedDrawer.tsx`, management |
| Casual admin help | No quick orientation | Add a small "How draft maps work" help panel or link | Reduces onboarding load | P3 | S | Low | `SeatMap.tsx`, docs |
| State contrast | Disabled buttons lack reasons | Add helper text near disabled groups | Reduces uncertainty | P2 | S | Low | `SeatMap.tsx`, panels |

## Illustrated Examples

### 1. Main Admin Map Layout

**Current issue:** The map shares attention with multiple panels and detached actions.

Before:

```text
[ Header: Office Seat Planner ][ Management ][ Advanced ]
[ Filters wide ][ Toolbar copy only ][ Map squeezed ][ Inspector overlay ]
```

After:

```text
+-------------------------------------------------------------------+
| Seat Planner  Search employees/seats...  Undo Redo  Publish Draft |
+------------+------------------------------------------------------+
| Filters    |                                                      |
| compact    |                  MAP-FIRST CANVAS                    |
| stats      |                                                      |
+------------+------------------------------------------------------+
| Selected seat summary appears only when a marker is selected       |
+-------------------------------------------------------------------+
```

**Behavior notes:** Filters collapse easily. Primary command bar stays visible. Inspector is contextual and should not cover core map controls.

**Example copy:** "Draft map - changes are private until published."

**Implementation notes:** Refactor `SeatMap.tsx` toolbar first. Avoid changing marker coordinates.

### 2. Seat Inspector

**Current issue:** Assignment, employee metadata, notes, and status appear as one flat form.

Before:

```text
Seat Assignment
Employee Name
Position
Department
Notes
Status
[Update Assignment]
```

After:

```text
+----------------------------------+
| W11                              |
| Assigned - West Pod - Custom: no |
+----------------------------------+
| Assignment                       |
| Employee name                    |
| Matched existing employee        |
+----------------------------------+
| Seat state                       |
| Status                           |
+----------------------------------+
| Notes                            |
| Internal note                    |
+----------------------------------+
| [Save changes]                   |
+----------------------------------+
```

**Behavior notes:** Show when the name matches an existing employee. If no match, state that saving creates a new employee.

**Example copy:** "This updates the employee directory and the selected draft seat."

**Implementation notes:** Mostly markup and helper text in `SeatInspector.tsx`.

### 3. Advanced Drawer

**Current issue:** Useful grouping exists, but all sections have similar weight.

Before:

```text
Advanced
View utilities
Draft map tools
CSV and backups
Management
Publishing
Destructive actions
```

After:

```text
+------------------------------+
| Advanced tools               |
| Less common draft actions    |
+------------------------------+
| Map display                  |
| [Show names toggle]          |
+------------------------------+
| Custom seats                 |
| [Add] [Move selected]        |
+------------------------------+
| Import/export                |
| [Blank template] [Export]    |
| [Import CSV] [Backup JSON]   |
+------------------------------+
| Danger zone                  |
| [Delete selected custom seat]|
+------------------------------+
```

**Behavior notes:** Publish should move out to the main toolbar.

**Example copy:** "CSV imports update draft assignments only. Marker positions are not changed."

**Implementation notes:** No schema changes. Keep server actions as-is.

### 4. Undo/Redo Controls

**Current issue:** Buttons exist but scope and next action are too subtle.

Before:

```text
[Undo] [Redo]
Undo next: Assign W01
```

After:

```text
+--------------------------------------+
| Draft history                         |
| [Undo Assign W01] [Redo disabled]     |
| Applies to draft only. Cleared after publish. |
+--------------------------------------+
```

**Behavior notes:** Disable when no history exists. Disable while inspector has unsaved edits.

**Example copy:** "Draft only. Publish clears history."

**Implementation notes:** Low-risk copy and button-label changes in `SeatMap.tsx`.

### 5. Draft Review/Publish Confirmation

**Current issue:** Browser confirm is hard to scan and does not feel enterprise-ready.

Before:

```text
Publish draft map to the viewer-facing seat map?
Total seats: 60
Assigned seats: 42
...
```

After:

```text
+-----------------------------------------+
| Publish draft map?                      |
| Viewers will see this version.          |
+-------------------+---------------------+
| Assigned          | 42                  |
| Available         | 12                  |
| Reserved          | 4                   |
| Unavailable       | 2                   |
+-----------------------------------------+
| This clears Undo/Redo history.          |
| [Cancel] [Publish draft map]            |
+-----------------------------------------+
```

**Behavior notes:** Make consequence copy explicit. Primary button should be specific.

**Implementation notes:** Medium effort. Replace `window.confirm` in `SeatMap.tsx`.

### 6. CSV Import Preview

**Current issue:** Native confirm cannot handle complex bulk change review.

Before:

```text
Rows: 30
Assignments: 28
Rows clearing assignments: 2
```

After:

```text
+---------------------------------------------+
| Review CSV import                           |
| Draft assignments only. Markers will not move. |
+----------------------+----------------------+
| Assignments          | 28                   |
| Clear assignments    | 2                    |
| Reserved             | 0                    |
| Unavailable          | 0                    |
+---------------------------------------------+
| Blocking errors: none                       |
| [Cancel] [Import 30 rows]                   |
+---------------------------------------------+
```

**Behavior notes:** Show validation before import. For errors, show row, field, issue, and fix.

**Implementation notes:** Add modal state in `AdvancedDrawer.tsx`; keep existing parser.

### 7. Employee Edit/Delete Experience

**Current issue:** Deactivation impact is only shown inside browser confirm.

Before:

```text
Edit employee
Name
Position
Department
[Save employee] [Deactivate]
```

After:

```text
+---------------------------------+
| Edit employee                   |
| Current draft seat: W08         |
| Published map: checked on save  |
+---------------------------------+
| Name                            |
| Position                        |
| Department                      |
+---------------------------------+
| Danger zone                     |
| Deactivate clears draft seat W08|
| [Deactivate employee]           |
+---------------------------------+
```

**Behavior notes:** Put impact before the destructive button, not only after click.

**Implementation notes:** Low-risk copy in `AdminManagementPanel.tsx`.

### 8. Department/Zone Management Screen

**Current issue:** Department and zone management look identical despite different meaning.

Before:

```text
Departments
[New department] [Add]
Name - 6 employees [Rename] [Delete]

Zones
[New zone] [Add]
Name - 10 draft seats [Rename] [Delete]
```

After:

```text
+--------------------+----------------------+
| Departments        | Zones                |
| People metadata    | Physical map areas   |
| Affects employees  | Affects draft seats  |
+--------------------+----------------------+
```

**Behavior notes:** Use explicit impact copy near delete controls.

**Implementation notes:** Small copy and helper badge changes in `AdminManagementPanel.tsx`.

## Low-Risk Implementation Set

Recommended for immediate implementation:

1. Add Escape key handling for drawer/inspector/add/move modes.
2. Add live-region success feedback for map actions.
3. Strengthen Undo/Redo labels and scope copy.
4. Add focus-visible styling to markers and small panel buttons.
5. Improve publish confirmation copy.
6. Improve CSV template/import labels and helper text.
7. Add filter empty-state recovery copy.
8. Add employee deactivation impact text before the destructive button.

Not implemented in this pass unless explicitly requested:

- Full map-first shell refactor.
- Custom publish modal.
- Custom CSV import preview modal.
- Tablet bottom-sheet inspector.
- New design preview route.
- Any database schema changes.
