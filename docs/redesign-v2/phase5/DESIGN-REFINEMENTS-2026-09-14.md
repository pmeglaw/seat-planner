# Page review implementation — 2026-09-14

The owner authorized addressing the September 14 design review. The dated
PHASE5 amendment records the resulting layout and copy decisions. Changes are
on `codex/design-audit-refinements`. After local smoke verification, the owner
authorized committing and pushing this branch. PR creation, merge and deployment
remain outside that authorization.

| Finding | Implementation | Acceptance |
| --- | --- | --- |
| R1 Reception collisions | Contained person typography; narrow location sub-row and anchored extension | Names, location and extensions do not intersect from 320px through the 1055/1056 boundary |
| R2 Management search | Definite 48px search wrapper inside wrapping toolbar | Full-height field and focus ring in both themes, including empty searches |
| R3 Hidden employee heading | Bridge panel/scrim offset to responsive shell height | Heading starts below the 96px phone header; footer stays available |
| R4 Departments/Zones overflow | Bounded desktop list; responsive normal/edit rows | No document overflow at 320/390/480px; all row actions remain reachable |
| R5 Navigation compression | Narrow overlay and scrim; accurate trigger name | Content width unchanged; Escape/dismissal returns focus; desktop push retained |
| Map search | Wider desktop field; shorter prompt; contextual keyboard hint | Readable prompt, stable scope, existing palette bounds and Escape behavior |
| Palette density | Zone disclosure and removal of duplicate visual metadata | People initially visible on phones; zone targets and measured shared scroll retained |
| Management navigation | Selected-tab scroll within its own host | Active tab visible on direct entry and viewport changes, without page scrolling |
| Auth refinement | Shared 44px reveal control, email-error gap, recovery link | Visibility toggles preserve values and do not submit; existing auth behavior retained |
| Copy / settings | Contact, protection-specific helper, simpler zone copy, CSV reference grouping | Accurate copy, deliberate narrow action stack, unchanged primary hierarchy |
| My seat | No change | Preserve approved standalone paper treatment |

The original review and before screenshots are retained locally in
`output/playwright/design-audit-2026-09-14/`. They are review evidence, not
production verification. Automated layout coverage lives in
`tests/e2e-auth/design-audit.spec.ts`; before/after artifacts stay outside the
shipped app.

## Verification

- `npm run gate`: passed; 1,544 tests, 0 failures. Coverage: 98.57% lines,
  98.58% functions, 92.92% branches. ESLint reports 84 warnings and no errors.
- `npm run test:e2e:auth -- design-audit.spec.ts approved-refinements.spec.ts nav-shell.spec.ts reception-keyboard.spec.ts`:
  passed, 12/12. Its configured web server builds with local Supabase settings;
  the final production build succeeded. Tests cover both page themes, narrow
  row geometry, panel offsets, navigation width/focus, direct-tab visibility,
  palette disclosure, fixed compact density, theme overrides and Reception
  keyboard/caller retention.
- Final `npm run typecheck` and focused ESLint on the shared password control,
  password form, LeftPanel and new browser spec passed (one existing LeftPanel
  effect warning, no errors). The final auth/touch subset passed 40/40 after
  retaining the reveal control's established 2px inset focus treatment.
- The final Reception prompt was shortened once more to "Name or extension…".
  Focused ESLint and typecheck passed; fresh light/dark captures and measured
  text width confirm it fits at 320/480/1056/1920px without clipping.
- `python -X utf8 .agents/skills/ibm-design-language/scripts/check_contrast.py --pairs docs/redesign-v2/phase3/contrast/product-pairs.json`:
  242/242 pass. Existing pairs include white, layered, hover, selected, dark
  and constant-dark shell surfaces. No brand values changed.
- Runtime/Phase 3 component CSS copies byte-match, SHA-256
  `8c7837730181044251869a87a3d4857a29a99331a1f66ed74352ac3ca1d86634`.
- `git diff --check`: passed. The IBM skill fingerprint remains the verified
  September 11 baseline `5b1549d9819de4cd`; vendored files were not changed.

One overlapping build/gate run ended five test files without assertion detail;
rerunning the gate in isolation passed all 1,544 tests. No test requirement was
relaxed. Assertions were updated for approved copy, disclosure controls and
actual 44px targets while retaining count, selection, protection and auth checks.

## Visual evidence and limits

### Local smoke before commit

At the owner's request, the final working tree was checked again locally:

- `npm run test:e2e`: 40/40 passed (6.6s), including login, auth redirects,
  viewport checks, axe checks and explicit/system theme focus assertions.
- The first run exposed four stale password-field locators in
  `tests/e2e/brand-amendments.spec.ts`: the input now has an inner text wrapper.
  The test now inspects the enclosing field shell. The required focus color
  and 2px border assertions are unchanged; all four theme cases pass.
- The authenticated command listed above passed again, 12/12 (54.5s), after
  its fresh production build. The database target was verified as loopback
  before the harness reseeded local fixtures.
- `npm run typecheck` and `npx eslint tests/e2e/brand-amendments.spec.ts`
  passed. Application code did not change during this smoke pass.
- Logs: `output/precommit-smoke-2026-09-14.log` and
  `output/precommit-auth-smoke-2026-09-14.log`.

### PR #546 browser-tier follow-up

The first CI run exposed four failures in `npm run test:browser`, a separate
tier from the previously passing smoke suite. Two palette cases measured hidden
zone buttons; another looked for scope counts in the former empty-state body.
The tests now open the disclosure before measuring and assert the exact counts
in the live header, retaining the existing geometry and navigation checks.

The remaining failure was a real resize regression: the narrow table hint moved
the grid origin and shifted the visible employee. Scroll recalibration now uses
the previous visible offset plus any intervening scroll movement. The unchanged
visible-person assertion passes in both resize directions; an added check also
keeps the heading visible after scrolling to the top immediately before resize.
Desktop and phone harness captures were visually inspected.

Local follow-up: all 38 real-browser component tests passed, as did typecheck,
focused ESLint (one existing unused-fixture warning) and 27 Management component
tests. The affected authenticated suite passed 7/7 with a fresh local build.
Logs are `output/pr546-browser-fixed.log`, `output/pr546-management-tests.log`
and `output/pr546-auth-fixed.log`. Final-head GitHub checks are tracked on the PR.

### PR review follow-up — busy-dialog Escape priority

Review of `7b9214c` reproduced a focus regression: with Filters open, Escape
inside a busy modal reached the shell listener and moved focus outside the
still-open dialog. The shell now leaves Escape originating within a dialog,
alertdialog or native dialog to that dialog's handler.

New tests with the real CarbonModal fail before the fix and pass afterward for
both ARIA dialog roles. They retain focus and the open Filters state while busy,
verify dismissal after the pending action ends, and verify normal panel Escape
behavior afterward. All 41 shell/dialog tests and 38 real-browser component tests
pass, as do typecheck and focused ESLint (one existing shell effect warning).
The affected authenticated shell/design checks passed 5/5 with a fresh build
against local Supabase. The original review probe also confirms focus remains
inside the busy dialog and Filters remains open after Escape.
Logs: `output/pr546-escape-tests.log`, `output/pr546-escape-browser.log` and
`output/pr546-escape-auth.log`. The fix changes keyboard event priority only.

### Original visual review evidence

Fresh Chrome evidence is in `output/playwright/design-refinements-2026-09-14/`,
including a `report.html` before/after comparison. Before screenshots remain
in the original review folder. Screenshots taken before the navigation entrance
settled were rejected and replaced with captures that wait for the open state.

Inspected desktop light/dark at 1920×1080, narrow form/list/search states at
320/390/480px, and Reception at 320/390/480/768/1055/1056/1920px. The automated
browser tier uses local seeded admin/viewer accounts and does not establish
production behavior. My seat was intentionally unchanged. Populated history,
assigned My seat, physical devices, browser zoom and screen-reader journeys
remain outside this change's evidence. Existing contrast pairs are not a claim
of complete rendered accessibility coverage.

At smoke-test completion, all changes were uncommitted. The owner subsequently
authorized commit and push of the reviewed changes. Local test fixtures were
reseeded by the authenticated test harness, confined to local Supabase; no
production-data mutation was performed. Git history records the commit and
remote branch state.
