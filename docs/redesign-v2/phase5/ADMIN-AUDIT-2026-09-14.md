# Admin audit implementation — 2026-09-14

The owner authorized fixing the admin audit findings and checking the canvas
toolbar against IBM spacing guidance. The dated PHASE5 amendment records the
decisions; this file records implementation and verification.

The narrow inspector now renders draft-specific read-only details. Its React
form state survives resizing, including dirty notes and an open assignment
editor. Saving and other map mutation entry points obey the same existing
width policy as the toolbar; the dirty-navigation guard explains why saving
is unavailable while narrow. Viewer notes remain excluded.

Left-panel navigation/filter targets grow to 48px for narrow or coarse-pointer
layouts. Publish history gains a focusable horizontal scroll host and a narrow
hint. The map toolbar uses 16px outer/group spacing, 8px internal spacing and
semantic groups, with Publish paired with its explanation. Both component CSS
copies are updated together; brand and vendored Carbon assets are unchanged.

## Verification

- Focused Node component tests: 54/54 passed.
- `npm run test:browser`: 42/42 passed, including all 29 SeatMap cases. New cases verify
  fresh read-only entry at 320/390/1023px, private draft context, and retained
  unsaved notes across narrow/wide resizing with no server-action calls.
- `npm run gate`: passed lint, typecheck, coverage thresholds and 1,548 tests.
  Lint reported 84 existing warnings and no errors. Two source assertions were
  updated to require the stronger responsive editing conditions.
- `npm run test:e2e:auth -- admin-responsive-toolbar.spec.ts design-audit.spec.ts nav-shell.spec.ts`:
  local production build succeeded and 7/7 authenticated Chromium checks passed.
  Toolbar geometry was checked at 320, 390, 1023, 1024, 1056, 1280 and 1920px
  in light and dark themes. Shell navigation remained client-side.
- Final screenshots were visually inspected for desktop grouping, the 1024px
  wrapped action row, phone wrapping, read-only details and 48px filter rows.
  The second toolbar row aligns to the 16px inset; phone count, Find me and
  Names share one row with 8px gaps rather than forcing another row.
- `python -X utf8 .agents/skills/ibm-design-language/scripts/check_contrast.py --pairs docs/redesign-v2/phase3/contrast/product-pairs.json`:
  242/242 pairs passed. The two component CSS copies are byte-identical.
- Publish history's populated scroll region and hint passed component fixture
  tests. The authenticated local seed had an empty history, so a populated
  history was not visually verified after implementation.

Verdicts for the visually reviewed implementation slices: **Approve** for
canvas toolbar spacing, narrow read-only editing behavior and responsive
navigation/filter targets. The history scroll cue passes the component
contract; no post-change visual verdict is claimed for populated history.

No physical-device, screen-reader or browser-zoom checks were performed.

## Follow-up code review — 2026-09-14

**Revise: responsive mode transitions (P2).** Starting Add seat or Swap at
1920px and resizing to 390px hides the mode controls but leaves the mode's
canvas behavior or marker presentation active. `SeatMap` gates the mode card
and mutation handlers with `editTier`, but the pan handlers still consult raw
`addSeatMode`, the canvas still gets `cursor-crosshair`, and marker props still
receive raw Add/Swap/Move state. The Add mode can therefore block drag-to-pan
without a visible Exit button; Swap still announces and draws its source.

Two isolated Chromium review probes confirmed the retained crosshair and
`Swap source` marker after the narrow toolbar removed Draft actions. Their
source and failure log are preserved at `output/admin-review-probe.spec.ts.txt`
and `output/admin-review-probe.log`; the temporary probe was removed from the
test suite after review. The earlier passing suite did not cover active-mode
resizing and does not resolve this finding.

Acceptance: either suspend all mode-dependent canvas behavior and presentation
below 1024px, or cancel modes with clear feedback. Preserve dirty inspector
edits. Verify Add/Move/Swap transitions in both directions, normal narrow
panning and seat selection, and no unintended mutations.

Toolbar spacing and responsive filter targets retain **Approve**. The
responsive editing slice is **Revise** until this transition gap is fixed.
The populated-history visual coverage limit above remains. Review only: no
application code was changed, committed or published during this review.

## Authorized review fix — 2026-09-14

The owner authorized resolving the P2 mode-transition finding. The mode's
retained intent is now separate from the effective state read by the canvas.
Below 1024px that effective state is inactive, so markers, cursors, gestures,
Escape handling, confirmation dialogs and trails suspend together. Widening
restores the mode and its visible Exit action. The inspector's collapsed state
is preserved while a mode is suspended; normal seat selection still ends the
mode, and dirty inspector form state retains its existing navigation guard.

Five regression cases cover Add/Move/Swap suspension and resumption, narrow
pan-handler acceptance and read-only selection, restoration of Exit controls,
and Move/Swap confirmation and trail visibility across the breakpoint. They
assert no server-action calls during these view transitions. The authenticated
light/dark cases also exercise all three modes with the shipped styles.

Final verification after the Exit-action correction:

- `npm run test:browser`: 47/47 passed, including the five new mode cases and
  the existing dirty-inspector resize case.
- `npm run gate`: passed lint, typecheck, coverage thresholds and 1,548 tests
  (84 existing lint warnings, zero errors).
- `npm run test:e2e:auth -- admin-responsive-toolbar.spec.ts design-audit.spec.ts nav-shell.spec.ts`:
  successful local production build and 7/7 checks passed.
- Final light/dark screenshots were inspected for suspended narrow modes and
  restored desktop mode panels with visible Exit actions. The audit evidence
  directory contains 30 screenshots, including 12 mode-transition frames.
- `git diff --check` passed. Component CSS is unchanged by this follow-up;
  byte equality and the earlier 242/242 contrast result remain applicable.

**Final verdict: Approve for responsive editing and mode transitions.** The
P2 finding is resolved; toolbar spacing and filter-target approvals stand.
The populated-history, physical-device, screen-reader and zoom coverage
limitations recorded above remain outside this fix's verified coverage.
No commits, pushes, PRs or deployments were performed.

The review probe is stored as `.ts.txt` because TypeScript includes `.ts`
artifacts even under ignored `output/`; this keeps the evidence without
introducing a build input or weakening the TypeScript configuration.

Audit screenshots from the preceding read-only production review remain in
`output/playwright/admin-design-audit-2026-09-14/`. They establish the original
findings, not verification of this implementation. New test artifacts use the
local database and remain outside shipped source. The final screenshots are
preserved in `output/playwright/admin-responsive-toolbar-2026-09-14/`.

The implementation and review above were local-only. The owner subsequently
authorized committing the reviewed changes, pushing `fix/admin-responsive-toolbar`,
opening a PR and checking populated Publish history on its preview. Merge and
production deployment are not included in that authorization. Production data
is unchanged.
