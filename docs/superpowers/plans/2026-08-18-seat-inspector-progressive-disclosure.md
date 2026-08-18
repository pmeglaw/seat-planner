# SeatInspector Progressive Disclosure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the floating SeatInspector to prefer progressive disclosure over density — Variant C meta row, single primary CTA, and independent collapsible sections replacing the Overview/Notes/Activity tabs and the top icon action row.

**Architecture:** Two surgical commits to `components/seat-map/SeatInspector.tsx` on branch `feat/seat-inspector-meta-v1` (already on origin, identical to `main` tip as of 2026-08-18). Commit 1 is the low-risk meta/facts cleanup; Commit 2 replaces the `activeTab` tab machinery with an `openSections` disclosure model. The `editingAssignment` form, commit bar, and all server/mutation logic are untouched. Tests are updated in the same commit as the behavior they pin.

**Tech Stack:** Next.js App Router (React 19, TypeScript strict), Tailwind 3 with `--admin-*` CSS tokens, Node test runner (jsdom component tier via `tests/helpers/renderComponent.mjs`), Playwright (browser tier + e2e-auth tier).

**Spec:** `docs/superpowers/specs/2026-08-18-seat-inspector-progressive-disclosure-spec.md` — read it first; every design decision below is locked there.

## Global Constraints

- Branch: `feat/seat-inspector-meta-v1` (exists on origin, clean from `main`). The corrupted `feat/seat-inspector-progressive-disclosure` branch is already deleted from origin — if `git branch -a | grep seat-inspector` ever shows it again, delete it, never check it out.
- Exactly two feature commits, in order; push Commit 1 and verify CI (via draft PR) before starting Commit 2.
- **Surgical edits only.** Never rewrite `SeatInspector.tsx` wholesale — that is what corrupted the previous branch. Every component change is an Edit with a unique anchor.
- **Do not change:** `runSeatAssignment`, `updateSeatAction`, forceMove/`STALE_DRAFT` handling, `lib/seatSwap.ts`, form fields/combobox/validation, commit-bar behavior (`showCommitBar`), `onMove`/`onSwap`/`onVacate`/`onDeleteSeat` prop contracts, `AskPlannerSeatRow` (AI-token confinement), panel width `panel:w-[332px]`, mobile `max-h-[60vh]`, any `--admin-*` token values.
- CTA labels stay exactly "Edit assignment" / "Assign employee".
- Repo rule: local dev writes to the PRODUCTION database. Draft-layer edits during visual QA are safe; **never run publish** while QA-ing.
- Repo rule: `*-source.test.mjs` tests are a11y/safety guardrails. Where this redesign legitimately supersedes a pinned pattern (APG tabs → disclosure sections; 2026-07-16 "actions never collapsible" ruling → owner-locked 2026-08-18 collapsed Seat-actions section), update the test to pin the NEW pattern's semantics and record the supersession in the test comment — never just delete coverage.
- Commit messages end with: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- Known local-env noise (from project memory): a handful of test files can fail on node_modules drift unrelated to your change — healthy baseline is ~600+ pass. If an unrelated file fails, confirm it also fails on the base commit (`git stash && npm test -- <file>`-style check) before investigating. Use `npm install`, never `npm ci` (EPERMs on Windows).

---

### Task 1: Commit 1 — Variant C meta row + redundant-facts removal

**Files:**
- Modify: `components/seat-map/SeatInspector.tsx` (4 edits: lines ~456-460, ~900-910, ~1193-1213, ~1380-1381 at branch tip `7dad7f0`)
- Modify: `tests/accessibility-source.test.mjs` (~lines 473-476, 503)

**Interfaces:**
- Consumes: existing locals `headerStatusDotClass`, `currentStatusLabel`, `currentZone`, `selectedSeat`, `canEdit`, `hasCurrentAssignment` (all already defined above the render body — no signature changes).
- Produces: the header meta row markup Task 2 leaves untouched; removal of `seatTypeLabel`; the Seat-actions group div now has `className={hasCurrentAssignment ? "mt-4" : ""}` (Task 2 relocates this block into a section body).

- [ ] **Step 1: Sync and check out the branch**

```bash
git fetch origin --prune
git checkout feat/seat-inspector-meta-v1
git status --short   # must be empty
git log --oneline -1 # expect 7dad7f0 (same as origin/main)
```

- [ ] **Step 2: Replace the three-pill meta row with Variant C**

In `components/seat-map/SeatInspector.tsx`, find the meta row block inside the sticky header (directly after the close-button row, ~line 900). Replace this exact block:

```tsx
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-[var(--admin-chrome-heading)] ring-1 ring-white/15">
            <span aria-hidden="true" className={["h-2 w-2 rounded-full", headerStatusDotClass].join(" ")} />
            {currentStatusLabel}
          </span>
          <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 font-mono text-[11px] font-medium text-[var(--admin-chrome-heading)] ring-1 ring-white/15">{selectedSeat.label}</span>
          <span className="min-w-0 truncate rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-[var(--admin-chrome-heading)] ring-1 ring-white/15">{currentZone}</span>
          {!canEdit && (
            <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-[var(--admin-chrome-muted)] ring-1 ring-white/15">Published seat</span>
          )}
        </div>
```

with:

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

- [ ] **Step 3: Delete the `seatTypeLabel` const**

Remove this block (~line 456; `isProtectedOriginalSeatLabel` itself STAYS — the delete gate still uses it at two other call sites):

```tsx
  const seatTypeLabel = isProtectedOriginalSeatLabel(selectedSeat.label)
    ? "Protected original"
    : selectedSeat.is_custom
      ? "Custom draft"
      : "Original";
```

- [ ] **Step 4: Delete the admin SEAT facts section and make the Seat-actions margin conditional**

In the Overview tabpanel (~line 1193), delete this entire block (the retirement comment plus the section):

```tsx
                    {/* Code and Status rows retired 2026-07-23: the header chips
                        carry both at a glance, and the Status CONTROL for open
                        seats lives in the Seat-actions zone below (it is an
                        action, not a fact). */}
                    <section aria-labelledby="seat-details-heading" className={hasCurrentAssignment ? "mt-3" : ""}>
                      <h3 id="seat-details-heading" className={eyebrowHeadingClass}>SEAT</h3>
                      <dl>
                        <FactRow label="Zone" value={currentZone} mono={false} />
                        <FactRow label="Seat type" value={seatTypeLabel} mono={false} />
                      </dl>
                    </section>
```

Then on the Seat-actions group div a few lines below, change:

```tsx
                    <div role="group" aria-labelledby="seat-actions-heading" className="mt-4">
```

to:

```tsx
                    <div role="group" aria-labelledby="seat-actions-heading" className={hasCurrentAssignment ? "mt-4" : ""}>
```

- [ ] **Step 5: Drop the viewer Code + Zone FactRows (Status tag stays)**

In the viewer (read-only) branch's SEAT section (~line 1380), delete these two lines, keeping the surrounding `<dl>` and the Status row:

```tsx
                <FactRow label="Code" value={selectedSeat.label} />
                <FactRow label="Zone" value={currentZone} mono={false} />
```

- [ ] **Step 6: Run the guardrail test to see the expected failure**

```bash
node --test tests/accessibility-source.test.mjs
```

Expected: FAIL — exactly one assertion, the `/Protected original/` match (the string's only occurrence was `seatTypeLabel`). Any OTHER failure means an edit went wrong — stop and fix the component before touching the test.

- [ ] **Step 7: Update `tests/accessibility-source.test.mjs` for the removed Seat-type fact**

Delete this line (~503):

```js
  assert.match(inspectorSource, /Protected original/);
```

And replace the comment above the delete-gate assertion (~lines 473-476):

```js
  // Delete renders only where it can ever succeed (custom draft seats); the
  // Seat type fact explains protected originals instead of a dead button.
  // Drift-proof delete gate: custom AND not a protected-original label, so
  // is_custom data drift on original seats can't resurrect a dead button.
```

with:

```js
  // Delete renders only where it can ever succeed (custom draft seats). The
  // Seat type fact retired 2026-08-18 (progressive-disclosure spec: status /
  // code / zone live only in the header meta row); the visible delete help
  // line below still explains protected originals.
  // Drift-proof delete gate: custom AND not a protected-original label, so
  // is_custom data drift on original seats can't resurrect a dead button.
```

- [ ] **Step 8: Run the affected test files — expect PASS**

```bash
node --test tests/accessibility-source.test.mjs tests/seat-inspector.test.mjs
```

Expected: PASS. (`seat-inspector.test.mjs` never pinned the pills or the Zone/Seat-type FactRows; its "South Offices" and "Assigned" text assertions are satisfied by the new meta row.)

- [ ] **Step 9: Full local verification**

```bash
npm test
npm run typecheck
npm run lint
```

Expected: pass (modulo the known node_modules-drift files — verify any failure also exists on the base commit before blaming this change).

- [ ] **Step 10: Commit**

```bash
git add components/seat-map/SeatInspector.tsx tests/accessibility-source.test.mjs
git commit -m "feat(SeatInspector): Variant C meta row, drop redundant seat facts

Status pill + plain mono code · zone replace the three-pill header row.
Zone / Seat type FactRows leave the admin overview and Code / Zone leave
the viewer facts — status, code, zone now live only in the meta row.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 11: Push and open the draft PR (CI runs on pull_request, not on branch push)**

```bash
git push origin feat/seat-inspector-meta-v1
gh pr create --draft \
  --title "feat(SeatInspector): progressive disclosure — Variant C meta + collapsible sections" \
  --body "## Summary
- Compact meta row (status pill + code · zone)
- Remove redundant Zone / Seat type body facts
- Replace Overview/Notes/Activity tabs and top action row with independent progressive sections
- Assignment editing path and server logic unchanged

Commit 1 of 2 (meta cleanup). Commit 2 (progressive sections) lands after CI is green here.

Spec: docs/superpowers/specs/2026-08-18-seat-inspector-progressive-disclosure-spec.md

## Test plan
- [ ] Assigned seat: meta, CTA, Contact open by default, other sections collapsed
- [ ] Open seat: no Contact, Assign employee CTA, Status in Seat actions
- [ ] Edit assignment → form + commit bar; Cancel restores sections
- [ ] Move / Swap / Vacate / Delete still work
- [ ] Viewer: meta + contact only, no actions

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
gh pr checks --watch
```

Expected: all checks green before Task 2 begins. If a check fails, fix it on this commit — do not start Commit 2 on a red base.

---

### Task 2: Commit 2 — independent progressive sections

**Files:**
- Modify: `components/seat-map/SeatInspector.tsx` (state + handlers + the non-editing body region)
- Modify: `tests/seat-inspector.test.mjs`
- Modify: `tests/accessibility-source.test.mjs`
- Modify: `tests/e2e-auth/accessibility.spec.ts` (~lines 244-262 and ~289-297)
- Modify: `tests/browser/seat-map.spec.ts` (`dirtyInspectorNotes`, ~lines 146-163)
- Modify: `.design-sync/previews/SeatInspector.tsx` (one habitat label — the preview renders the real component, nothing else changes)

**Interfaces:**
- Consumes (already in the file): `ChevronDownIcon()`, `ChevronRightIcon()`, `MoveGlyph()`, `SwapGlyph()`, `VacateGlyph()`, `ContactFacts`, `buildContactRows`, `STATUS_LABELS`, `Button`, locals `hasCurrentAssignment`, `hasAssignedPerson`, `effectiveStatus`, `fieldClassName`, `fieldErrorMap`, `fieldErrorId`, `fieldDescribedBy`, `handleStatusChange`, `handleTextChange`, `handleDeleteSeat`, `deleteHelpText`, `selectedSeatCanDelete`, refs `statusRef`, `notesRef`.
- Produces (tests depend on these exact names):
  - `type InspectorSectionKey = "contact" | "actions" | "notes" | "activity"`
  - module const `DEFAULT_OPEN_SECTIONS: Record<InspectorSectionKey, boolean>`
  - state `openSections` / `setOpenSections`; helper `toggleSection(key: InspectorSectionKey): void`
  - component `DisclosureSectionHeader({ id, bodyId, title, open, onToggle }: { id?: string; bodyId: string; title: string; open: boolean; onToggle: () => void })` rendering `<h3><button aria-expanded aria-controls>…</button></h3>`
  - body ids `seat-inspector-contact`, `seat-inspector-actions`, `seat-inspector-notes`, `seat-inspector-activity`; header ids `seat-contact-heading`, `seat-actions-heading` (the two ids existing tests already reference).
  - Collapsed bodies are **unmounted** (matches the retired tabs' unmounted-inactive-panel behavior; `aria-controls` pointing at a not-currently-rendered id follows the exact precedent the tab row set, which the e2e-auth axe scans already accept).

- [ ] **Step 1: Rewrite the jsdom component tests to the new contract (failing first)**

In `tests/seat-inspector.test.mjs`:

1a. Add a helper next to `clickLabel` (~line 83):

```js
const sectionHeader = bodyId => document.querySelector(`button[aria-controls="${bodyId}"]`);
const openSeatActions = () => act(async () => fireEvent.click(sectionHeader("seat-inspector-actions")));
```

1b. In `admin mode exposes the edit affordances` (~line 103): the delete control now lives inside the collapsed Seat-actions section. Replace the test body with:

```js
  await renderInspector(makeSeat(), { canEdit: true, onDeleteSeat() {} });
  assert.ok(byLabelPrefix("Assign an employee"), "assign control present");
  assert.equal(byLabelPrefix("Delete custom seat"), null, "delete hidden while Seat actions collapsed");
  await openSeatActions();
  assert.ok(byLabelPrefix("Delete custom seat"), "delete control present");
  // Move/Swap/Vacate are hide-not-disable inside the Seat actions section:
  // with no onMove/onSwap/onVacate handlers wired (as here), no verbs render.
  assert.equal(byLabelPrefix("Swap seat"), null, "no swap handler wired");
  assert.equal(byLabelPrefix("Vacate"), null, "no vacate handler wired");
  assert.equal(byLabelPrefix("Move seat"), null, "no move handler wired");
  assert.equal(byLabelPrefix("Reset"), null, "reset-position never existed here");
```

1c. In `admin mode shows the icon action row for an occupied seat, gated on handlers` (~line 116), rename it to `admin mode shows the seat verbs inside Seat actions, gated on handlers` and insert `await openSeatActions();` immediately after the `renderInspector(...)` call. The assertions and the `clickLabel("Move Alice Example to another seat")` flow stay identical.

1d. In `an open seat's action row offers Swap only (Move and Vacate hide, not disable)` (~line 126), insert `await openSeatActions();` after `renderInspector(...)`.

1e. In `busy disables the icon action row even while this inspector's own pending is false` (~line 138), insert `await openSeatActions();` after `renderInspector(...)`.

1f. Replace the whole `admin tabs switch panels and reset to Overview when the seat changes` test (~lines 146-163) with:

```js
test("admin sections toggle independently and reset when the seat changes", async () => {
  const first = assignedSeat();
  const { rerender } = await renderInspector(first, { canEdit: true });
  const headers = () => Array.from(document.querySelectorAll("h3 > button[aria-expanded]")).map(el => el.textContent);
  assert.deepEqual(headers(), ["Contact", "Seat actions", "Notes", "Activity"]);
  // Defaults: Contact open when assigned; the rest collapsed (bodies unmounted).
  assert.equal(sectionHeader("seat-inspector-contact").getAttribute("aria-expanded"), "true");
  assert.equal(sectionHeader("seat-inspector-notes").getAttribute("aria-expanded"), "false");
  assert.equal(document.querySelector('textarea[name="seatNote"]'), null);
  await act(async () => fireEvent.click(sectionHeader("seat-inspector-notes")));
  assert.equal(sectionHeader("seat-inspector-notes").getAttribute("aria-expanded"), "true");
  assert.ok(document.querySelector('textarea[name="seatNote"]'));
  // Independent multi-open, not an accordion: Contact stayed open.
  assert.equal(sectionHeader("seat-inspector-contact").getAttribute("aria-expanded"), "true");
  // New seat → section state resets to defaults (open seat: no Contact, Notes closed).
  const second = makeSeat({ id: "seat-2", label: "S02" });
  await act(async () => rerender(React.createElement(SeatInspector, {
    seat: second, seats: [second], employees: [], departmentOptions: [],
    canEdit: true, collapsed: false, onClose() {}
  })));
  assert.equal(sectionHeader("seat-inspector-contact"), null, "open seat renders no Contact section");
  assert.equal(sectionHeader("seat-inspector-notes").getAttribute("aria-expanded"), "false");
});
```

1g. In `viewer mode renders no tabs, no action row, no footer CTA` (~line 165), rename it to `viewer mode renders no sections, no action row, no footer CTA` and replace the tablist assertion:

```js
  assert.equal(document.querySelector('[role="tablist"]'), null);
```

with:

```js
  assert.equal(document.querySelector("h3 > button[aria-expanded]"), null, "no disclosure headers in viewer");
```

1h. In `a custom draft seat can be deleted; a protected original seat cannot` (~line 199), insert `await openSeatActions();` after EACH of the two `renderInspector(...)` calls (before each delete assertion).

1i. Update the file's header comment (~lines 5-9): replace "the tabs" with "the disclosure sections".

- [ ] **Step 2: Run the component tests to verify they fail against the current tabs UI**

```bash
node --test tests/seat-inspector.test.mjs
```

Expected: FAIL — `sectionHeader(...)` finds nothing (no `aria-controls="seat-inspector-actions"` exists yet), the sections test finds no `h3 > button[aria-expanded]`.

- [ ] **Step 3: Component edit — section state, defaults, and header component**

In `components/seat-map/SeatInspector.tsx`:

3a. Below the `emptyForm` const (~line 110), add:

```tsx
// Progressive-disclosure sections (2026-08-18 spec): independent multi-open,
// never an accordion. Contact defaults open (it only renders when someone is
// assigned); Actions / Notes / Activity default collapsed. Module-level so the
// reset path has a stable identity to restore.
type InspectorSectionKey = "contact" | "actions" | "notes" | "activity";
const DEFAULT_OPEN_SECTIONS: Record<InspectorSectionKey, boolean> = {
  contact: true,
  actions: false,
  notes: false,
  activity: false
};
```

3b. Below the `FactRow` component (~line 202), add:

```tsx
// Disclosure header for the progressive sections: the heading wraps the
// toggle button (APG disclosure pattern) so section titles stay in the
// document outline while the whole row is one keyboard target. Collapsed
// bodies unmount (same contract the retired tabs had for inactive panels).
function DisclosureSectionHeader({ id, bodyId, title, open, onToggle }: { id?: string; bodyId: string; title: string; open: boolean; onToggle: () => void }) {
  return (
    <h3 id={id}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={onToggle}
        className="flex w-full items-center justify-between py-2.5 text-left text-[13px] font-semibold text-[var(--admin-chrome-heading)] transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-primary)]"
      >
        {title}
        {open ? <ChevronDownIcon /> : <ChevronRightIcon />}
      </button>
    </h3>
  );
}
```

3c. Replace the `activeTab` state and its comment (~lines 290-294):

```tsx
  // v12 slice 4: Overview/Notes/Activity APG tabs. Resets to "overview"
  // whenever the seat changes or the draft form resets — see
  // resetInspectorDraftForm, which every reset path (seat change, resetSignal,
  // Cancel-discard) funnels through.
  const [activeTab, setActiveTab] = useState<"overview" | "notes" | "activity">("overview");
```

with:

```tsx
  // Progressive sections (2026-08-18): open/closed per section. Resets to
  // DEFAULT_OPEN_SECTIONS whenever the seat changes or the draft form resets —
  // see resetInspectorDraftForm, which every reset path (seat change,
  // resetSignal, Cancel-discard) funnels through.
  const [openSections, setOpenSections] = useState<Record<InspectorSectionKey, boolean>>(DEFAULT_OPEN_SECTIONS);
```

3d. In `resetInspectorDraftForm` (~line 380), replace `setActiveTab("overview");` with `setOpenSections(DEFAULT_OPEN_SECTIONS);`.

3e. In `focusInspectorField` (~lines 538-544), replace the comment and the tab switch:

```tsx
    // The notes field lives in the Notes tabpanel, which is only mounted
    // while that tab is active — switch first, then focus on the next frame
    // so the target has mounted. rAF is harmless for the always-mounted
    // editor fields too (no <details> reveal remains to replace).
    if (field === "notes") setActiveTab("notes");
```

with:

```tsx
    // The notes field lives in the Notes section body, which is only mounted
    // while the section is open — open it first, then focus on the next frame
    // so the target has mounted. rAF is harmless for the always-mounted
    // editor fields too.
    if (field === "notes") setOpenSections(current => ({ ...current, notes: true }));
```

3f. Replace `handleTabKeyDown` (the whole function plus its comment, ~lines 841-856) with:

```tsx
  function toggleSection(key: InspectorSectionKey) {
    setOpenSections(current => ({ ...current, [key]: !current[key] }));
  }
```

- [ ] **Step 4: Component edit — delete the icon action row and the tablist**

4a. Delete the entire icon action row block (~lines 915-936), from `{canEdit && !editingAssignment && (onMove || onSwap || onVacate) && (` through its closing `)}`. The `MoveGlyph`/`SwapGlyph`/`VacateGlyph` components stay — Step 5 reuses them. Also delete the now-stale prop comment at ~lines 34-36 (`// Icon action row verbs (v12 slice 4): hide-not-disable — the row and each … vacate dialog.`) and replace it with:

```tsx
  // Seat-verb handlers (hide-not-disable): each verb renders inside the Seat
  // actions section only when canEdit AND the matching handler is supplied.
  // SeatMap keeps owning move/swap modes and the always-confirm vacate dialog.
```

4b. Delete the entire tablist block (~lines 938-952), from `{!editingAssignment && (` with `role="tablist"` through its closing `)}`.

- [ ] **Step 5: Component edit — replace the tabpanels with the four sections**

Replace the whole non-editing branch of the scroll area — everything from (currently ~line 1172):

```tsx
            ) : (
              <div key={`seat-inspector-sections-${selectedSeat.id}`}>
```

down to and including the closing of the activity tabpanel and its wrapper (~line 1296-1297, the `</div>` pair right before the `)}` that closes the `editingAssignment ? … : …` ternary) — with:

```tsx
            ) : (
              <div key={`seat-inspector-sections-${selectedSeat.id}`} className="px-4 pb-2 pt-1">
                {/* Contact, not "Occupant": the sticky header already carries
                    the identity (name, position · department) — this section
                    holds only the reach-them facts. Renders only when someone
                    is assigned. */}
                {hasCurrentAssignment && (
                  <div className="border-b border-white/5">
                    <DisclosureSectionHeader id="seat-contact-heading" bodyId="seat-inspector-contact" title="Contact" open={openSections.contact} onToggle={() => toggleSection("contact")} />
                    {openSections.contact && (
                      <div id="seat-inspector-contact" className="pb-3">
                        <ContactFacts
                          canEdit
                          rows={buildContactRows({
                            email: (matchedEmployee ?? selectedSeat.employee)?.email,
                            extension: form.phoneExtension
                          })}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Seat actions — the reseat verbs (Move / Swap / Vacate,
                    hide-not-disable on their handlers), the Status control for
                    OPEN seats (occupied seats derive "assigned" from the
                    occupant; the meta pill carries the tag), and Delete.
                    Collapsible per the 2026-08-18 owner spec (supersedes the
                    2026-07-16 "actions never collapse" ruling for these verbs;
                    the primary CTA and commit bar stay pinned outside). */}
                <div className="border-b border-white/5">
                  <DisclosureSectionHeader id="seat-actions-heading" bodyId="seat-inspector-actions" title="Seat actions" open={openSections.actions} onToggle={() => toggleSection("actions")} />
                  {openSections.actions && (
                    <div id="seat-inspector-actions" role="group" aria-labelledby="seat-actions-heading" className="pb-3">
                      {(onMove || onSwap || onVacate) && (
                        <div role="group" aria-label={`Actions for seat ${selectedSeat.label}`} className="flex gap-px">
                          {hasCurrentAssignment && onMove && (
                            <button type="button" onClick={onMove} disabled={pending || busy}
                              aria-label={selectedSeat.employee?.full_name ? `Move ${selectedSeat.employee.full_name} to another seat` : `Move ${selectedSeat.label}`}
                              className="flex flex-1 flex-col items-center gap-1 bg-[var(--admin-chrome-raised)] py-2 text-[11px] font-semibold text-[var(--admin-chrome-action-text)] transition hover:bg-[var(--admin-chrome-raised-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-primary)] disabled:opacity-40">
                              <MoveGlyph />Move
                            </button>
                          )}
                          {onSwap && (
                            <button type="button" onClick={onSwap} disabled={pending || busy} aria-label={`Swap ${selectedSeat.label}`} className="flex flex-1 flex-col items-center gap-1 bg-[var(--admin-chrome-raised)] py-2 text-[11px] font-semibold text-[var(--admin-chrome-action-text)] transition hover:bg-[var(--admin-chrome-raised-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-primary)] disabled:opacity-40">
                              <SwapGlyph />Swap
                            </button>
                          )}
                          {hasCurrentAssignment && onVacate && (
                            <button type="button" onClick={onVacate} disabled={pending || busy} aria-label={`Vacate ${selectedSeat.label}`}
                              className="flex flex-1 flex-col items-center gap-1 bg-[var(--admin-chrome-danger-raised)] py-2 text-[11px] font-semibold text-[var(--admin-chrome-danger-text)] transition hover:bg-[rgb(var(--admin-status-bad-rgb)/0.25)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--admin-primary)] disabled:opacity-40">
                              <VacateGlyph />Vacate
                            </button>
                          )}
                        </div>
                      )}
                      {!hasAssignedPerson && (
                        <label className="mt-2 block">
                          <span className="text-[12px] font-medium tracking-normal text-[var(--admin-chrome-muted)]">Status</span>
                          <select
                            ref={statusRef}
                            value={effectiveStatus}
                            onChange={handleStatusChange}
                            aria-invalid={Boolean(fieldErrorMap.status)}
                            aria-describedby={fieldDescribedBy("status")}
                            className={fieldClassName}
                          >
                            <option value="available">{STATUS_LABELS.available}</option>
                            <option value="reserved">{STATUS_LABELS.reserved}</option>
                            <option value="unavailable">{STATUS_LABELS.unavailable}</option>
                          </select>
                          {fieldErrorMap.status && <p id={fieldErrorId("status")} className="mt-1 text-xs font-semibold text-[var(--admin-chrome-danger-text)]">{fieldErrorMap.status}</p>}
                        </label>
                      )}
                      {/* Figma delete treatment: full-width low-emphasis button +
                          visible helper line. Rendered only for deletable-class
                          seats: custom AND not a protected-original label — the
                          label guard makes the gate immune to is_custom data
                          drift on original seats. */}
                      {selectedSeat.is_custom && !isProtectedOriginalSeatLabel(selectedSeat.label) && (
                        <>
                          <Button
                            type="button"
                            onClick={handleDeleteSeat}
                            disabled={pending || !selectedSeatCanDelete}
                            aria-label={`Delete custom seat ${selectedSeat.label}`}
                            aria-describedby="seat-inspector-delete-help"
                            title={deleteHelpText}
                            className="mt-2 min-w-0 w-full whitespace-normal leading-tight !border-transparent !bg-[var(--admin-chrome-raised)] !text-[var(--admin-chrome-danger-text)] !shadow-none hover:!border-transparent hover:!bg-[rgb(var(--admin-status-bad-rgb)/0.20)] disabled:!border-transparent disabled:!bg-[var(--admin-chrome-elevated)] disabled:!text-[var(--admin-chrome-disabled)] disabled:hover:!bg-[var(--admin-chrome-elevated)]"
                          >
                            Delete seat
                          </Button>
                          <p id="seat-inspector-delete-help" className="mt-1.5 text-[12px] leading-4 text-[var(--admin-chrome-muted)]">{deleteHelpText}</p>
                        </>
                      )}
                    </div>
                  )}
                </div>

                <div className="border-b border-white/5">
                  <DisclosureSectionHeader bodyId="seat-inspector-notes" title="Notes" open={openSections.notes} onToggle={() => toggleSection("notes")} />
                  {openSections.notes && (
                    <div id="seat-inspector-notes" className="pb-3">
                      <label className="block">
                        <span className="sr-only">Seat note</span>
                        <textarea
                          ref={notesRef}
                          name="seatNote"
                          value={form.notes}
                          onChange={event => handleTextChange("notes", event)}
                          placeholder="Add a seat note…"
                          aria-invalid={Boolean(fieldErrorMap.notes)}
                          aria-describedby={fieldDescribedBy("notes")}
                          className={`${fieldClassName} min-h-20`}
                        />
                        {fieldErrorMap.notes && <p id={fieldErrorId("notes")} className="mt-1 text-xs font-semibold text-[var(--admin-chrome-danger-text)]">{fieldErrorMap.notes}</p>}
                      </label>
                    </div>
                  )}
                </div>

                <div>
                  <DisclosureSectionHeader bodyId="seat-inspector-activity" title="Activity" open={openSections.activity} onToggle={() => toggleSection("activity")} />
                  {openSections.activity && (
                    <div id="seat-inspector-activity" className="pb-3">
                      {activityEntries.length > 0 ? (
                        <ul>
                          {activityEntries.map((entry, index) => (
                            <li key={`${entry}-${index}`} className="border-b border-white/5 py-1.5 text-[12px] leading-4 text-[var(--admin-chrome-muted)] last:border-b-0">
                              <span className="font-medium text-[var(--admin-chrome-text-soft)]">{entry}</span>
                              <span className="ml-1.5">· this session</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-[12px] leading-4 text-[var(--admin-chrome-muted)]">No draft edits to this seat in this session. Saved changes appear here until publish.</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
```

Note what this deliberately KEEPS: the `key={`seat-inspector-sections-${selectedSeat.id}`}` remount guard, both `mt-4`-era conditionals become unnecessary (spacing now comes from the uniform header padding), the old Overview `role="group" aria-labelledby="seat-actions-heading"` semantics (now on the section body), and every button's exact aria-label, class list, and `disabled={pending || busy}` rule. The `eyebrowHeadingClass` CONTACT/SEAT eyebrows remain only in the viewer branch and that is expected — do not remove the const.

- [ ] **Step 6: Run the component tests — expect PASS**

```bash
node --test tests/seat-inspector.test.mjs
```

Expected: PASS, all tests including the rewritten section test.

- [ ] **Step 7: Update the source-guardrail test to pin the disclosure semantics**

In `tests/accessibility-source.test.mjs`, inside `inspector sections, validation, and actions retain accessible confidence cues`:

7a. Replace (~lines 439-444):

```js
  // v12 slice 4: the inspector is tabbed (APG tabs pattern) and close-only —
  // the collapse rail/pill is retired, so no "VIEW DETAILS" affordance may return.
  assert.match(inspectorSource, /role="tablist"/);
  assert.match(inspectorSource, /role="tab"[\s\S]{0,200}aria-selected/);
  assert.match(inspectorSource, /role="tabpanel"/);
  assert.match(inspectorSource, /ArrowRight|ArrowLeft/);
```

with:

```js
  // Progressive disclosure (2026-08-18): independent multi-open sections whose
  // headers are real buttons carrying aria-expanded/aria-controls (heading-
  // wrapped, APG disclosure pattern). The inspector stays close-only — the
  // collapse rail/pill is retired, so no "VIEW DETAILS" affordance may return.
  assert.match(inspectorSource, /<h3 id=\{id\}>[\s\S]{0,200}aria-expanded=\{open\}[\s\S]{0,80}aria-controls=\{bodyId\}/);
  assert.match(inspectorSource, /setOpenSections\(DEFAULT_OPEN_SECTIONS\)/);
  assert.doesNotMatch(inspectorSource, /role="tablist"|role="tabpanel"/);
```

7b. Extend the comment above the never-collapsible assertions (~lines 460-465). After the sentence ending `the 2026-07-10 ban on a PERMANENT sticky footer stands).`, append:

```js
  // 2026-08-18 progressive-disclosure spec (owner-locked) supersedes the
  // "seat ops never collapse" half of that ruling: Move/Swap/Vacate/Status/
  // Delete now live in the collapsible Seat actions section. What still may
  // never collapse: the pinned primary CTA and the commit bar (asserted below).
```

7c. Replace the collapsible-sections comment (~lines 470-471):

```js
  // Collapsible sections hold only readable content and reset per seat —
  // uncontrolled <details> open state must not leak from one seat to the next.
```

with:

```js
  // Section open state resets per seat — the keyed remount plus the
  // resetInspectorDraftForm default restore stop one seat's open sections
  // from leaking into the next.
```

7d. Replace the Contact anchor assertion (~line 484):

```js
  assert.match(inspectorSource, /\{hasCurrentAssignment && \([\s\S]{0,200}CONTACT/);
```

with:

```js
  assert.match(inspectorSource, /\{hasCurrentAssignment && \([\s\S]{0,300}title="Contact"/);
  assert.match(inspectorSource, /\{hasCurrentAssignment && \([\s\S]{0,200}CONTACT/);
```

(The first pins the admin Contact section's assigned-only gate; the second now anchors on the viewer branch, which keeps its CONTACT eyebrow.)

7e. Replace the Notes tabpanel anchor (~lines 490-492):

```js
  // v12 slice 4: Notes moved from an InspectorSection title prop into its own
  // APG tabpanel — the tabpanel id/aria-labelledby pair is the new anchor.
  assert.match(inspectorSource, /id="seat-inspector-tabpanel-notes" role="tabpanel" aria-labelledby="seat-inspector-tab-notes"/);
```

with:

```js
  // Notes lives in its own disclosure section — the header/body id pair is
  // the anchor (the body id is what the browser tier's dirty-notes helper and
  // the e2e-auth guard spec reach for).
  assert.match(inspectorSource, /bodyId="seat-inspector-notes" title="Notes"/);
  assert.match(inspectorSource, /<div id="seat-inspector-notes"/);
```

- [ ] **Step 8: Run the source tests — expect PASS**

```bash
node --test tests/accessibility-source.test.mjs tests/seat-creation-ui-source.test.mjs tests/focus-handoff-source.test.mjs
```

Expected: PASS. If `seat-creation-ui-source` or `focus-handoff-source` fails, a real guardrail was crossed — fix the component, not the test (neither file references tabs today).

- [ ] **Step 9: Update the Playwright browser-tier helper**

In `tests/browser/seat-map.spec.ts`, in `dirtyInspectorNotes` (~lines 148-163), replace:

```ts
  // v12 slice 4: the notes textarea lives in the Notes tab, and selection
  // lands on Overview — activate the tab before reaching for the field.
  const notesTab = page.locator('[role="tab"]', { hasText: "Notes" });
  await expect(notesTab).toBeAttached();
  await notesTab.dispatchEvent("click");
```

with:

```ts
  // Progressive sections: the notes textarea lives in the Notes section,
  // collapsed by default — expand it before reaching for the field.
  const notesHeader = page.locator('button[aria-controls="seat-inspector-notes"]');
  await expect(notesHeader).toBeAttached();
  await notesHeader.dispatchEvent("click");
```

- [ ] **Step 10: Update the e2e-auth accessibility spec**

In `tests/e2e-auth/accessibility.spec.ts`:

10a. Test `with the seat inspector open, on both tabs` (~line 244): rename to `with the seat inspector open, then with Notes expanded`, and replace (~lines 257-261):

```ts
    // The Notes tabpanel (and its textarea) is unmounted while inactive — the
    // Overview scan never sees it.
    await inspector.getByRole("tab", { name: "Notes" }).click();
    await expect(inspector.locator("textarea")).toBeVisible();
    await expectNoAxeViolations(page);
```

with:

```ts
    // Collapsed section bodies (and the Notes textarea) are unmounted — the
    // default scan never sees them; expand Notes for the second scan.
    await inspector.getByRole("button", { name: "Notes" }).click();
    await expect(inspector.locator("textarea")).toBeVisible();
    await expectNoAxeViolations(page);
```

10b. In the unsaved-edits guard test's retry loop (~lines 293-297), replace:

```ts
      if (!(await commitBar.isVisible())) {
        await inspector.getByRole("tab", { name: "Notes" }).click();
        await inspector.locator("textarea").fill("a11y probe — never saved");
        await expect(commitBar).toBeVisible({ timeout: 2_000 });
      }
```

with:

```ts
      if (!(await commitBar.isVisible())) {
        // Notes is a toggle now (a discard resets it closed): only click the
        // header when the textarea is not already mounted.
        if (!(await inspector.locator("textarea").isVisible())) {
          await inspector.getByRole("button", { name: "Notes" }).click();
        }
        await inspector.locator("textarea").fill("a11y probe — never saved");
        await expect(commitBar).toBeVisible({ timeout: 2_000 });
      }
```

- [ ] **Step 11: Update the design-sync preview label**

In `.design-sync/previews/SeatInspector.tsx` (~line 118), replace:

```tsx
  <Habitat label="admin draft seat — actions, tabs, contact + seat facts">
```

with:

```tsx
  <Habitat label="admin draft seat — meta row + progressive sections">
```

(The preview renders the real component with fixture props — no other change is needed.)

- [ ] **Step 12: Full local verification**

```bash
npm test
npm run test:ct
npm run typecheck
npm run lint
```

Expected: pass (same known-drift caveat as Task 1). Then, ONLY if a local Chromium is configured (`PW_CHROMIUM_PATH`), also run the browser tier; otherwise CI covers it:

```bash
npm run test:browser
```

If you need to debug the browser or e2e-auth tiers, invoke the repo's `test-tiers` skill first — harness boundaries there are non-obvious (the e2e-auth tier needs Docker + the local Supabase stack).

- [ ] **Step 13: Commit and push**

```bash
git add components/seat-map/SeatInspector.tsx tests/seat-inspector.test.mjs tests/accessibility-source.test.mjs tests/e2e-auth/accessibility.spec.ts tests/browser/seat-map.spec.ts .design-sync/previews/SeatInspector.tsx
git commit -m "feat(SeatInspector): replace tabs with independent progressive sections

Contact / Seat actions / Notes / Activity are now multi-open disclosure
sections (Contact open by default when assigned, the rest collapsed);
the top icon action row and the Overview/Notes/Activity tablist are
retired, with Move/Swap/Vacate keeping their exact handlers, labels and
disabled rules inside Seat actions. Assignment editing path, commit bar,
and all server logic unchanged.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push origin feat/seat-inspector-meta-v1
gh pr checks --watch
```

Expected: all PR checks green.

---

### Task 3: Visual QA and PR ready-for-review

**Files:**
- No source changes expected. Fix-forward on `feat/seat-inspector-meta-v1` if QA finds a defect.

**Interfaces:**
- Consumes: the running app (`run-seat-planner` skill), the open draft PR from Task 1.
- Produces: a ready-for-review PR whose test-plan checkboxes are verified, and screenshots for the owner.

- [ ] **Step 1: Boot and drive the real app**

Invoke the repo's `run-seat-planner` skill (build/typecheck/tests passing is NOT visual verification in this repo). Verify on `/admin` (draft edits are safe; **do not publish** — local dev points at production):

1. Assigned seat: meta row reads status pill + `CODE · Zone` plain text; Contact open, Seat actions / Notes / Activity collapsed; "Edit assignment" CTA.
2. Open seat: no Contact section; "Assign employee" CTA; Status select inside Seat actions after expanding.
3. Expand Seat actions on an occupied seat: Move / Swap / Vacate render and work; on a custom open seat: Delete renders with its helper line.
4. Toggle two sections open at once — both stay open (independent, not accordion).
5. Click "Edit assignment": form + commit bar appear, sections/chrome hidden; Cancel restores the section view with default open states.
6. Notes: expand, type → commit bar appears; Save → "Saved to draft"; select another seat and return → sections back to defaults.
7. Keyboard: Tab reaches each section header; Enter/Space toggles; focus ring visible; `aria-expanded` flips (inspect via devtools).
8. Viewer (`/`): meta row + CONTACT/SEAT facts only (no Code/Zone rows — meta carries them); zero edit affordances.
9. Narrow window to mobile width: bottom sheet at `max-h-[60vh]` scrolls; no horizontal overflow at 332px panel width.

- [ ] **Step 2: Capture screenshots for the owner**

Use the `chrome-pixel-capture` skill for pixel-accurate PNGs of: assigned-seat resting state, sections expanded, editing state, viewer state. Caption each with source + date + method (screenshot-provenance rule).

- [ ] **Step 3: Mark the PR ready and tick the verified test-plan boxes**

```bash
gh pr ready
gh pr edit --body "$(gh pr view --json body -q .body | sed 's/- \[ \]/- [x]/g')"
```

(Only tick boxes actually verified in Step 1; if any item failed, fix it first — fresh commit, push, re-verify.)

- [ ] **Step 4: Hand off**

Do NOT merge (`gh pr merge` is blocked in this environment — the owner merges). Report: PR URL, CI status, screenshot paths, and the one-line summary of what changed per commit.
