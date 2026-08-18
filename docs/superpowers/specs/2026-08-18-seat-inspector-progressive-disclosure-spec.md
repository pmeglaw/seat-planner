# Handoff: SeatInspector progressive disclosure redesign

> Owner-approved handoff spec, received 2026-08-18. The implementation plan at
> `docs/superpowers/plans/2026-08-18-seat-inspector-progressive-disclosure.md` argues from this document.

**Repo:** `pmeglaw/seat-planner`
**Primary file:** `components/seat-map/SeatInspector.tsx`
**Branch to use:** `feat/seat-inspector-meta-v1` (clean, from `main`)
**Do not use:** `feat/seat-inspector-progressive-disclosure` — it was corrupted by a bad full-file write and should be deleted if it still exists. (Verified 2026-08-18: already deleted from origin.)

---

## Goal

Redesign the floating SeatInspector to prefer **progressive disclosure over density**.

- Clean hierarchy: status / code / zone only in a compact meta row
- Single primary CTA: "Edit assignment" / "Assign employee"
- Replace tabs + top icon action row with independent collapsible sections
- **Do not change** assignment business logic, swap validation, or server actions

---

## Locked design decisions

| Decision | Value |
|----------|--------|
| Meta row | **Variant C**: status pill (`px-2.5 py-1 gap-1.5`) + mono code · zone (plain text, not pills) |
| Redundancy | Status, code, zone appear **only** in meta — never as FactRows |
| Seat type | **Removed** (clutter) |
| Primary CTA | Keep **"Edit assignment"** / **"Assign employee"** |
| Sections | Independent multi-open (not accordion) |
| Defaults | Contact open when assigned; Actions / Notes / Activity collapsed |
| Contact | Hidden when no employee (contextual) |
| Editing path | Existing `editingAssignment` form + commit bar **unchanged** |
| Assignment logic | **Do not touch** `runSeatAssignment`, `updateSeatAction`, conflict / forceMove, stale draft |

---

## Architecture (keep)

- `editingAssignment` → expands full form, hides progressive chrome, shows commit bar
- Move / Swap / Vacate still call parent handlers from SeatMap
- Delete only for custom + open seats (`canDeleteSeat` / `isProtectedOriginalSeatLabel`)
- Viewer branch: read-only, no CTA / actions / AI
- Tokens: `--admin-chrome-bg`, raised `#262626`, CTA `#D23F0A`, IBM Plex, square chrome

---

## Implementation plan (two commits)

### Commit 1 — Meta cleanup (low risk)

1. **Variant C meta row** — replace the three separate pills (status / label / zone) with:
   - Status pill (unchanged classes)
   - Trailing plain text: `font-mono` code + ` · ` + muted zone
2. **Remove** admin Overview SEAT FactRows: Zone, Seat type
3. **Remove** unused `seatTypeLabel` const
4. **Viewer:** drop Code + Zone FactRows (meta already has them); Status tag can stay
5. Adjust Seat actions top margin: `className={hasCurrentAssignment ? "mt-4" : ""}`
6. Leave tabs, top action row, assignment form alone

### Commit 2 — Progressive sections (medium risk)

1. Replace `activeTab` with:

```ts
const [openSections, setOpenSections] = useState({
  contact: true,
  actions: false,
  notes: false,
  activity: false
});
```

2. Reset `openSections` in `resetInspectorDraftForm` (same place `setActiveTab("overview")` lives)
3. On notes field error focus: `setOpenSections(s => ({ ...s, notes: true }))`
4. **Delete** `handleTabKeyDown`
5. **Delete** top Move/Swap/Vacate icon action row
6. **Delete** Overview / Notes / Activity tablist
7. **Replace** tabpanels with independent collapsible sections:
   - **Contact** — only if `hasCurrentAssignment`; body = existing `ContactFacts`
   - **Seat actions** — Move / Swap / Vacate (same handlers/disabled rules) + open-seat Status select + Delete
   - **Notes** — existing textarea
   - **Activity** — existing activity list / empty state
8. Section headers: `<button>` + `aria-expanded` + `aria-controls` + ChevronDown / ChevronRight
9. When `editingAssignment === true`: keep current behavior (form + commit bar; progressive chrome hidden)
10. CTA, AI row, viewer path: no logic change beyond layout

---

## Exact Commit 1 search/replace targets

### Meta row — find three-pill block, replace with:

```tsx
{/* Variant C meta: status pill owns state; code + zone are plain trailing facts. */}
<div className="flex min-w-0 items-center gap-2">
  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-[var(--admin-chrome-heading)] ring-1 ring-white/15">
    <span aria-hidden="true" className={["h-2 w-2 rounded-full", headerStatusDotClass].join(" ")} />
    {currentStatusLabel}
  </span>
  <span className="min-w-0 truncate text-[11px] font-medium text-[var(--admin-chrome-heading)]">
    <span className="font-mono">{selectedSeat.label}</span>
    <span className="text-[var(--admin-chrome-muted)]"> · </span>
    <span className="text-[var(--admin-chrome-muted)]">{currentZone}</span>
  </span>
  {!canEdit && (
    <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-[var(--admin-chrome-muted)] ring-1 ring-white/15">Published seat</span>
  )}
</div>
```

### Remove admin SEAT FactRow section

Delete the `<section aria-labelledby="seat-details-heading">` block that contains:

- `FactRow label="Zone"`
- `FactRow label="Seat type"`

### Remove

```tsx
const seatTypeLabel = isProtectedOriginalSeatLabel(selectedSeat.label)
  ? "Protected original"
  : selectedSeat.is_custom
    ? "Custom draft"
    : "Original";
```

(`isProtectedOriginalSeatLabel` stays — still used by Delete.)

### Viewer

Remove `FactRow label="Code"` and `FactRow label="Zone"` from the published SEAT block; keep Status tag if desired.

---

## Commit 2 section header pattern

```tsx
<button
  type="button"
  aria-expanded={openSections.notes}
  aria-controls="seat-inspector-notes"
  onClick={() => setOpenSections(s => ({ ...s, notes: !s.notes }))}
  className="flex w-full items-center justify-between py-2.5 text-left text-[13px] font-semibold text-[var(--admin-chrome-heading)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-primary)]"
>
  Notes
  {openSections.notes ? <ChevronDownIcon /> : <ChevronRightIcon />}
</button>
```

Move / Swap / Vacate: same buttons and `disabled={pending || busy}` as today, just living inside the Seat actions section body.

---

## Do not change

- `runSeatAssignment` / `updateSeatAction` / forceMove / STALE_DRAFT
- `lib/seatSwap.ts` validation
- Form fields, combobox, validation
- Commit bar behavior (`showCommitBar`)
- `onMove` / `onSwap` / `onVacate` / `onDeleteSeat` contracts
- AI row (`AskPlannerSeatRow`) token confinement
- Panel width 332px, mobile `max-h-[60vh]`, tokens

---

## Acceptance criteria

- [ ] Status, code, zone appear only in compact meta row
- [ ] No Seat type / Zone / Code FactRows in admin body
- [ ] CTA labels still "Edit assignment" / "Assign employee"
- [ ] Contact section absent on open seats
- [ ] Move / Swap / Vacate / Delete gating unchanged
- [ ] Edit → form + commit bar; Cancel/Save restore progressive view
- [ ] Viewer has no edit affordances
- [ ] Section headers keyboard-accessible with `aria-expanded`
- [ ] No horizontal overflow at 332px; mobile sheet still works

---

## Tests / follow-ups

- Update any tests that assert tab roles (`role="tablist"`) or the old three-pill chip row
- Update `.design-sync/previews/SeatInspector.tsx` if present
- Prefer **surgical edits**, not full-file rewrite of the 1.3k-line component

---

## Suggested PR title / body

**Title:** `feat(SeatInspector): progressive disclosure — Variant C meta + collapsible sections`

**Body:**

```markdown
## Summary
- Compact meta row (status pill + code · zone)
- Remove redundant Zone / Seat type body facts
- Replace Overview/Notes/Activity tabs and top action row with independent progressive sections
- Assignment editing path and server logic unchanged

## Test plan
- [ ] Assigned seat: meta, CTA, Contact open by default, other sections collapsed
- [ ] Open seat: no Contact, Assign employee CTA, Status in Seat actions
- [ ] Edit assignment → form + commit bar; Cancel restores sections
- [ ] Move / Swap / Vacate / Delete still work
- [ ] Viewer: meta + contact only, no actions
```

---

## Out of scope (follow-on)

- Peek summaries on collapsed headers
- Sticky CTA while body scrolls
- Accordion (single-open only)
- Inline micro-edits for Notes
- Mobile sheet snap points

---

**Start with Commit 1 only**, verify CI, then Commit 2. Do not rewrite the entire file in one shot.
