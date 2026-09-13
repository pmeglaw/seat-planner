# Approved refinement implementation — 2026-09-12

Branch: `feat/approved-palette-management-density`. Implementation and refinement review are complete. The owner subsequently authorized a final review, commit, push and PR; see the integration review below. A separate private review preview is deployed as recorded below. Merge and office production release remain outside this authorization.

## Final review approval — 2026-09-12

**Approve. All review conditions are closed** for the shared Viewer/Admin palette, Reception copy, Management copy and separately approved Normal/Compact density. P2 remains closed.

The [private preview review record](C:/Users/JP/.codex/visualizations/2026/09/12/01a09715-aee8-7990-96ef-8bb5ea738adc/refinement-review/private-preview-review.md) distinguishes the reviewer's hosted browser checks from the owner's passing confirmation of physical-device keyboard behavior, actual 200%/400% browser zoom and screen-reader announcements/focus return. Codex did not perform or observe those three direct checks. Device, browser and screen-reader versions were not supplied; that evidence limitation remains recorded without leaving the accepted review conditions open.

This approval closed refinement review only; the subsequent commit/push/PR authorization is recorded below. Merge and further deployment require separate authorization. The existing private preview remains deployed; the office production application/database are unchanged. The hosted guide and older public mockup handoff were not redeployed with this final status.

## Integration review — 2026-09-12

The owner requested one more review, followed by commit, push and PR creation. The full refinement diff was reviewed across the shared palette, Admin Escape/focus handling, virtualized lists, Management density/cookie layout, Reception/Management copy, paired styles, governed amendments and regression tests. **No new actionable defects were found.** Draft/published data access, mutation actions, migrations and dependencies are unchanged.

Before staging, all 209 application/assets/configuration files matched the approved preview's SHA-256 manifest. Runtime and Phase 3 component/token stylesheets were also byte-identical. The unchanged implementation reuses the recorded 1,528-test gate, 38/38 Chromium suite, build, authenticated checks and 242/242 contrast evidence below; these suites were not rerun solely for this review. Owner-performed physical-device, browser-zoom and screen-reader checks remain explicitly attributed to the owner.

Remote state was refreshed: the task branch matched `origin/main` at base `83c0c2b`, and no existing PR was found for the branch. The handoff was updated for integration, and whitespace/reference checks passed. Staging excludes unrelated `.codex/` work, credentials, share tokens and preview deployment files. The resulting commit, PR link and CI status are reported in the integration response/PR; earlier uncommitted and authentication-blocked statements below describe their historical stages.

## Delivered behavior

The [owner amendment](../DECISIONS.md#owner-amendment--approved-refinement-plan--2026-09-12) is implemented in three independent areas:

- Viewer/Admin share a bounded palette with growing 48px-minimum zone choices, 14px names, 12px counts, selected checkmarks and pressed states. Three/two/one columns reflow across the width boundary. One scroll surface contains zones and 48px virtualized people rows. A constrained visual viewport supplies an in-palette search and close control, including keyboard navigation and selection-range transfer.
- Admin palette Escape and zone activation return focus to search without reopening or clearing inspector edits. Result selection still uses the unsaved-edit guard. Reception and Management use the approved copy, including the Management loading header.
- Management defaults to Normal. Compact uses 32px desktop rows with the same text size. The shared preference persists in a path-scoped device cookie across all four tabs and reloads. Narrow/coarse-pointer layouts retain the preferred value but use Normal and explain Compact availability. Table virtualization preserves the visible row and fractional scroll position below the sticky tabs. The phone table and tabs scroll within their own surfaces.

## P2 reviewer correction — 2026-09-12

**Reviewer disposition: P2 closed; reviewed fix approved.** The reviewer reported rerunning the original reproduction, confirming selection `[8,15]` and focus return when **Close search** disappears, and reviewing all four regressions and the 38/38 Chromium log. This records the reviewer's confirmation; it is not a new implementation test run. The subsequent final approval above closes the remaining manual review conditions.

Fixed the constrained-palette exit in `components/seat-map/ViewerFindPalette.tsx`. Before the resize render removes the temporary search row, the component captures the latest selection start, end and direction when focus is anywhere in that row, including **Close search**. After removal, it focuses the original search and restores that selection. It does not change the query, dismiss/remount the palette, or invoke an inspector mutation.

Four Chromium regressions were added: two shared-palette cases for temporary-input and Close-search focus, plus both transitions in the real Admin SeatMap composition with an unsaved inspector note. They verify updated selection rather than the entry selection, forward/backward direction, query retention, the same mounted palette, and subsequent typing into the restored range. Admin cases also verify retained notes, unchanged Undo/Redo labels and disabled states, no seat-update/restore actions, and normal Escape dismissal after focus returns. History starts empty in these two fixtures; they do not independently establish preservation of a populated undo stack.

Actual correction verification:

- `npm run gate`: passed; 1,528 tests, zero failures, typecheck and coverage passed. ESLint: 84 warnings, zero errors.
- `npm run test:browser`: 38/38 passed in real Chromium. After the final test-only TypeScript argument correction, `npm run test:browser -- --grep "expanded palette restores"` passed 2/2 again; application behavior was unchanged.
- The reviewer script, `node C:/Users/JP/.codex/visualizations/2026/09/12/01a09715-aee8-7990-96ef-8bb5ea738adc/refinement-review/check-focus-transfer.mjs`, now reports return range `[8,15]` instead of `[22,22]`, and original-input focus after Close search instead of `BODY`. The script is jsdom evidence; the asserting regressions above run in Chromium.
- Inspected `node_modules/.cache/ctb/focus-return-input.png` and `focus-return-close.png`; both show the selected text in the original search. These are component fixtures, not authenticated application screenshots. The Admin composition uses real components with mocked server boundaries and a supplied anchor rectangle; all four regressions simulate `visualViewport` changes.
- `git diff --check`: passed. Build, authenticated e2e and contrast checks were not rerun for this focused correction; their earlier implementation evidence is recorded separately below. No styles, authentication or server mutation code changed in this correction.

Logs: `C:\Users\JP\.codex\visualizations\2026\09\12\01a094a4-4aa0-7070-8545-71d3418a8337\p2-focus-gate.log`, `p2-focus-browser.log` and `p2-focus-reproduction.log` in the same directory.

At the P2 correction stage, real iOS/Android keyboard operation, actual browser 200%/400% zoom and manual screen-reader pressed-state/focus-return announcements remained unverified. These conditions were subsequently closed by owner confirmation, as recorded above; Chromium simulation and screenshots do not establish those direct checks.

The available automation surfaces were checked after P2 approval: only the Codex in-app browser was connected, with viewport resizing but no advertised actual browser-zoom control. No native-app, physical-device or screen-reader control was available. The following manual criteria are retained for traceability; the final review record accepts the owner's passing confirmation:

| Manual check (closed by owner confirmation) | Recorded acceptance criteria |
| --- | --- |
| Real iOS/Android keyboard | Record device, OS and browser. Open search, edit the query and selection, then dismiss the keyboard with the temporary input and with Close search focused. Confirm focus/selection return, retained query and Admin edits, and reachability of every zone and the last result. |
| Actual 200%/400% browser zoom | Record browser/version and actual zoom setting. Inspect Viewer/Admin and Management in light/dark themes; verify reflow, readable text, reachable controls/results, visible focus and no clipped or overlapping controls. Verify Management Normal fallback where the zoomed viewport requires it. Restore the original zoom afterward. |
| Manual screen reader | Record screen reader/browser versions. Verify zone pressed-state announcements, focus return from both temporary controls, palette Escape dismissal without reopening, and retained Admin edits. |

No additional application tests were run for this approval/status-only handoff update. Existing passing results remain the evidence for the unchanged implementation.

At the end of the P2 correction, the implementation remained uncommitted on `feat/approved-palette-management-density` and no deployment had been performed. Unrelated work, including `.codex/`, was preserved. The branch had no upstream and zero commits ahead of the local `origin/main` reference; remote PR/check state was not refreshed. The subsequent private-preview authorization and deployment are recorded below. The public mockup site was not republished.

## Private reviewer preview — deployed 2026-09-12

The owner authorized private preview deployment, isolated sample data and review accounts. After Supabase branching proved unavailable on the current plan, the owner approved a separate project at the quoted **$0/month**. No plan upgrade or paid branch was created.

- Vercel project: `seat-planner-refinement-review` (`prj_zzlXGnNZ3876ehfuBrnnAtpFWFty`), separate from the office production project.
- Working preview: `https://seat-planner-refinement-review-3uxkpygy8.vercel.app`.
- Deployment: `dpl_3KJAktfuwctAHD8qeaAtD3QAKsmi`; **READY**, Preview environment (API target `null`), Next.js / Node 24. A separate initial bootstrap deployment was automatically classified as production by Vercel in this new review project; it has no office credentials and is not the review URL.
- Private reviewer guide: `/reviewer-guide.html`. A shareable access link was verified in the browser and expires **19 September 2026 at 22:28 UTC (3:28 PM Pacific)**. Its access token and test passwords are delivered separately and are excluded from this repository and deployment source.
- Supabase project: `Seat Planner Refinement Review` (`wcupkgvihsmuzlevxioq`) in pmeglaw's Org. All 60 repository migrations were applied; the initial prototype people names were replaced with generic review names. Fixtures contain 220 sample people, 60 seats per layer, 40 assigned seats per layer and 11 active zones including long labels. Floor 2 is unseeded.
- Two fresh review accounts have distinct random passwords and verified Admin/Viewer roles. No local seed password or production account was reused. Hosted signup rejected test addresses and hit an email rate limit; accounts were provisioned only in the confirmed-empty review database, then tested through the normal Auth API and app login. Email-link/reset delivery is not configured for these sample accounts.
- The review project contains only its own public Supabase URL/key and preview flags. It inherits no production environment variables. Publishing remains blocked by the existing preview guard; Ask Planner has no API key. Vercel protection remains enabled. Requests without the share access redirect to Vercel authentication.

Deployment verification:

- A separate snapshot under the task visualization directory contains 209 hash-verified application/assets/config files, matching the reviewed working tree byte for byte. Environment files, credentials and unrelated `.codex/` content were excluded. A generated reviewer guide and deployment ignore file were added only to the separate preview package.
- `npm ci --no-audit --no-fund` and `npm run build` passed in that snapshot. Vercel's hosted build reached READY. Dry-run upload inspection confirmed Next.js and excluded `.env.local`, `.next`, `.vercel` and `node_modules`.
- Browser verification reached the private guide, signed in as Viewer, loaded the published map/refined palette and Reception, then signed in as Admin and loaded the Admin map/inspector and Management. Compact switching, cross-tab preference and 390px Normal fallback were verified; the viewport was restored afterward. These checks use the in-app browser, not a physical phone or screen reader.
- Authenticated API checks: Admin reads 220 live people, 220 published people and 60 draft seats. Viewer reads 220 published people and zero live people, draft seats or private-note records. All public tables have RLS enabled; no unexpected person names or private notes in the published seat column were found.
- Supabase security advisors report only the project's disabled leaked-password-protection warning; the two test passwords are independently generated random values. No missing-RLS finding was reported.
- A legacy cleanup migration was initially rejected by automatic approval review. Read-only checks proved its three tables and two functions absent in the new review database; the unchanged migration then passed. No approval restriction was bypassed. A sample-data transaction initially failed the published-note null constraint, rolled back, and succeeded after correcting the fixture to use null; the constraint was preserved.

The manual real-device keyboard, actual 200%/400% zoom and screen-reader conditions were subsequently closed by owner confirmation in the final review record above. The private guide retains its original checklist; the old public mockup handoff remains historical/outdated. The application working tree remains uncommitted, with unrelated work preserved. No commit, push, PR or merge was performed, and the office production application/database were not changed.

## Earlier implementation verification results

- `npm run gate`: 1,528 tests passed, lint/typecheck/coverage passed. ESLint reports 84 warnings and zero errors.
- `npm run test:browser`: 34 passed. The final palette and density refinements were also checked with focused reruns.
- Local authenticated tests: `approved-refinements.spec.ts`, `page-frames.spec.ts` and `accessibility.spec.ts`: 43 passed. The affected Reception keyboard suite also passed after its approved-copy assertion was updated.
- The authenticated harness runs `npm run build` with the local Supabase configuration before starting the app. Targeted final build/density verification was run after the final scroll adjustment.
- Contrast generation and `check_contrast.py`: 242/242 governed pairs passed. Runtime and Phase 3 component/token sheets have matching SHA-256 hashes; vendored assets and brand colors are unchanged.
- Browser checks cover 320/390/640/880/899/900/1920px palette widths, long and unbroken zone labels, large counts, final-result reachability, keyboard-height simulation, clean/dirty inspector focus, guarded result selection, 220-row virtualization, density persistence and narrow fallback. Authenticated screenshots were inspected at desktop and phone widths with explicit/system light and dark themes.
- Existing source assertions were updated for approved wording, the shared scroll host and the visible search focus target. The retired sub-12px palette exception was removed from the type-floor ledger.

## Review limits

The keyboard-height test substitutes a `visualViewport`; it does not establish real iOS/Android keyboard behavior. Physical-device, actual browser zoom and spoken screen-reader verification are owner-reported passes, not Codex-observed tests. The reviewer accepted that confirmation and closed all review conditions. Generated mockup images are not interaction evidence.

The unrelated `.codex/` directory was preserved. All implementation files are uncommitted. GitHub PR discovery was unavailable because the CLI returned HTTP 401; no remote PR/check status is claimed.

Screenshots and full command logs remain in the local test caches and the task visualization directory. They contain only local test fixtures, not a production QA session.
