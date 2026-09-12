# Floor selector and inspector refinement — 2026-09-11

final result: passed

No remaining P0/P1/P2 visual findings in the approved refinement scope.
Implementation branch: `codex/refine-floor-selector-inspector`.
This report records the implementation QA; commit and PR publication were
subsequently authorized by the owner. Post-PR smoke results belong in the PR.

## Reference and comparison evidence

- Baseline: `output/playwright/admin-mockup/current-admin-light.png`, 1920×1080.
- Inspector visual truth: `output/playwright/admin-mockup/proposed-admin-light.png`.
- Final selector visual truth: `output/playwright/admin-mockup/proposed-admin-full-floor.png`.
  Both generated references are 1672×941. They establish intent, not exact
  pixels, colours or font metrics, per the owner's instruction.
- Implementation: `output/playwright/inspector-refinement/admin-light-1920.png`,
  Chrome, 1920×1080 CSS pixels, device scale factor 1. Same assigned-seat state:
  N03 / Maria Lopez, inspector open, Names on, no draft changes, light theme.
- Full comparison: `output/playwright/inspector-refinement/comparison.png`.
  Reference is normalized to 1920×1080 before comparison. Top row shows full
  views side by side; bottom row shows the inspector regions.
- Detailed comparison: `output/playwright/inspector-refinement/inspector-comparison.png`.
  Reference on the left, implementation on the right. Crops start below the
  toolbar at y=96. The generated reference implies approximately 419px after
  scaling; the implementation preserves the approved 400px product slot.
- Fixture differences: five fictional seats instead of the reference's sixty,
  and existing shipped icons instead of image-generation approximations.
  These are intentional; the floor image, calibration and coordinates in
  product source are unchanged. No new image assets are needed.

## Fidelity review

| Surface | Result |
| --- | --- |
| Fonts and typography | Existing local IBM Plex Sans/Mono files retained. Floor label stays 14/18, name heading 20/28, section headings 14/18 semibold. Contact labels use 14/18. Generated text smoothing and weight are not copied. Long names wrap. |
| Spacing and layout | Selector remains 224px; the complete label fits without wrapping or ellipsis. Inspector uses 24px content insets, 32px section gaps, 12px heading gaps, consistent contact columns and quiet footer alignment. Below 640px the inset is 16px. |
| Colours and tokens | Existing semantic tokens only; forced and system themes agree. Terracotta, apricot dark edges, white dark focus and Draft purple retained. No Carbon migration or asset edits. |
| Images and icons | Existing floor-plan raster and icon components retained. No geometry, calibration, marker-position or image-source changes in this task. |
| Copy and content | Full floor label retained. Viewer role/department precede a sentence-case Contact section. Admin content and controls preserve their established wording and behavior. |

## Browser coverage

The demo bundles the actual `ViewerSeatFinder`, `SeatMap`, `SeatInspector`,
`AppShell` and production CSS with local Plex fonts. Only framework/backend
boundaries are doubled. Viewer receives published fictional rows; admin gets
draft rows and a matching published baseline. Nothing connects to a hosted DB.

- Viewer/admin × light/dark: 1920×1080 and widths 320, 390, 640, 768, 1055,
  1056 and 1280, at 1080px height. No document overflow or clipped inspector.
- Assigned, open, reserved, unavailable and custom-seat inspectors; closed
  inspector; long name/title/email; empty activity and optional notes.
- Admin assignment editor, dirty note, pending save, simulated save error,
  simulated success and resulting activity. Commit controls remain outside
  the scrolling body. These demonstrate client behavior, not database writes.
- Viewer has no input/select/textarea, notes or editing actions.
- Floor menu ArrowDown/ArrowUp and Escape with trigger-focus restoration;
  2px visible focus; inspector Escape returns focus to its seat marker.
- Scoped axe WCAG A/AA scans of the assigned inspector pass in all four
  role/theme combinations, including rendered colour contrast.
- Explicit/system light and dark resolved inspector styles match.
- No browser page errors across the matrix; in-app browser console check
  also returned no errors. Final demo is open, with temporary viewport
  override reset. Chrome captures supplement the in-app preview because its
  screenshot surface clipped the requested desktop-width capture.

Screenshots are under `output/playwright/inspector-refinement/`, named by
role/theme/width or state, including `*-editing`, `*-pending`, `*-error`,
`*-success`, `*-long-320`, `*-N04`, `*-N05`, `*-N06` and `*-S99`.

## Comparison history

1. Initial comparison found compressed section rhythm relative to the approved
   inspector [P2]. Restored the identity spacing and used 32px group separation.
2. At 320px, the existing 400px host clipped the inspector's left side, and a
   selected marker could paint over it [P1]. Constrained the inspector host to
   available width and placed it at the existing selected-marker layer, later
   in DOM order. Other slot owners are unchanged.
3. Contact row review caught the role-spacing selector also matching a contact
   definition. Scoped it to the identity div so rows remain evenly aligned.
4. Final full-view and detailed comparisons above, plus settled narrow and
   long-content captures, passed. Early test failures from incorrect accessible
   names, a malformed demo response and a capture during resize were fixture
   issues and were corrected; they were not treated as product defects.

## Verification commands and results

Run from `E:\code\seat-planner`:

| Command | Result |
| --- | --- |
| `npm run typecheck` | Passed; TypeScript source unchanged since this check. |
| `npx eslint components/seat-map/SeatInspector.tsx` | 0 errors, 5 pre-existing warnings: unused ReactNode, unused handleResetEdits and three state-in-effect warnings. |
| `node --test tests/seat-inspector.test.mjs tests/seat-map-components.test.mjs tests/viewer-seat-finder.test.mjs tests/right-slot.test.mjs tests/brand-resolved-tokens.test.mjs tests/phase4-token-layer-source.test.mjs` | 105/105 passed. |
| `npm run test:browser` | 28/28 passed. |
| `npx playwright test -c output/playwright/inspector-refinement/playwright.config.ts` | 6/6 passed. Final settled-capture repeat of the four layout cases: 4/4 passed. |
| `python -X utf8 .agents/skills/ibm-design-language/scripts/check_contrast.py --pairs docs/redesign-v2/phase3/contrast/product-pairs.json` | **242/242 pass**; governed product pairs include light/dark fields, layers, hover/selected hosts, marks, focus and text. No token changes required regenerating pairs. |
| `git diff --check` | Passed. |

The two component sheets have identical SHA-256
`890e09afec2b687715ec46e038b7ca9de0218562ef0d3f05cbe0f2d6b482d8b1`.
The working-copy IBM skill fingerprint was `ac195b250474b603`, matching its
pre-existing, uncommitted PHASE3DS refresh record. That unrelated refresh is
excluded from this PR; the historical original fingerprint was not substituted.
React review found no new hooks, effects, fetching, dependencies, state or
authorization paths. Existing callback and progressive-disclosure behavior
remains covered by the component/browser suites.

## Limits and preserved work

This is authorized fictional demo QA, not an authenticated Supabase integration
or production verification. Build/full gate were not required for this scoped
component/CSS change. Real navigation, publishing and DB persistence were not
tested in this demo and were not changed.

One pre-existing design/source mismatch remains outside this refinement:
PHASE2UX §1M.10 describes no admin inspector below `lg`, while current SeatMap
can open its admin inspector at those widths; only the toolbar editing controls
hide. This task preserves the existing behavior and makes that inspector fit.
The next decision for that separate mismatch is whether to restore the documented
narrow restriction or formally amend it; this report does not approve either.

Pre-existing skill-documentation edits, auth form API edits, SeatMap and
ViewerSeatFinder Image API edits, ShellPanels API edits, the inspector's
SubmitEvent edit, PHASE3DS refresh and untracked `.codex/` are preserved.
Those unrelated edits remain outside this PR. No merge, deployment, hosted
data access or migration occurred during this QA.
