# PR #531 owner amendments — verification, 2026-09-10

Prepared on `codex/pr531-owner-amendments` from PR head
`591dac006778e85cd4686d0afc4a288050ecc8d0`, Node 24.19.0.
This section records the initial local verification, before integration. No merge
or deployment was performed by the amendment task.
The PR body was updated to record approvals, blockers and the tested department behavior.

| Item | Approval | Implementation | Verification |
| --- | --- | --- | --- |
| BR-2 | Approved 2026-09-10 | White explicit/system-dark focus; terracotta light; auth bottom rules consume focus; dark tertiary hover/active use neutral hosts so white focus/text remain legible | Four built auth-theme tests; real map-control fixture probes focus hovered tertiary and current floor-menu rows, preserving 2px/-2px geometry. Auth controls retain their existing geometry. Final authenticated preview pending. |
| DS-1 | Approved 2026-09-10 | Semantic constant-dark chrome; themed form/password/loading; runtime and Phase 3 sheet copies identical | Login/password routes visually inspected at 1920×1080; login/my-seat loading fixtures measured in four states; chrome height 44px on my-seat. |
| UX-3 | Approved 2026-09-10 | Existing consequence-based confirmations retained, no typing; Discard danger; Restore optional export, counts/file/consequences | Existing component and SeatMap browser tests pass. Discard ruling explicitly added to DECISIONS. |
| UX-4 | Approved 2026-09-10 | D6-c/D6-d retained: tertiary entry, plain-primary restore confirmation | Existing DataUtilitiesPanel behavior tests pass, including restore without exporting and optional export without leaving review. |
| BR-5 | Approved 2026-09-10 | Central info roles: light #B85C2E/#FBE8DC; dark #E8A07A/#262626. JSON mirrored; all five obsolete info blue allowances removed | Real inspector mismatch, publish pending and Ask Planner no-highlights markup painted in Chromium with built CSS, four states each. Icons/text preserved; no vendored Carbon edit; warning/error and Draft purple unchanged. Final authenticated preview pending. |

The dark tertiary host adjustment is needed by BR-2: Carbon's near-white hover
would hide the new white ring and the existing white label. The entry remains
outlined tertiary; focus geometry and primary fills are unchanged.

## Checks

- `npm run gate`: passed (lint, typecheck, full Node suite via coverage).
- `npm run coverage:check` after adding JSON parity: **1,512 passed, 0 failed, 0 skipped**.
  Statements/lines 98.55%, branches 92.84%, functions 98.57%.
- `npm run lint`: 0 errors, existing 84 warnings.
- `npm run typecheck`: passed.
- `npm run build`: passed, rebuilt after the tertiary host correction.
- `npm run test:e2e`: **40 passed**, including four new auth theme cases.
- `npm run test:browser`: **26 passed**.
- `node --test tests/brand-resolved-tokens.test.mjs tests/phase4-token-layer-source.test.mjs`:
  **18 passed** after final token changes; no guard weakened.
- `node docs/redesign-v2/phase3/contrast/generate-pairs.mjs`, then
  `python -X utf8 C:/Users/JP/.agents/skills/ibm-design-language/scripts/check_contrast.py --pairs docs/redesign-v2/phase3/contrast/product-pairs.json`:
  **242/242 pass**. Reads actual brand declarations; covers white/layer/hover/selected,
  login chrome, notifications, primary and dark tertiary focus hosts. Dark white
  focus on #333333/#393939 is 12.63:1/11.55:1. Informational bar/icon contrast is
  3.84:1 light, 7.02:1 dark. Existing token-layer guards remain intact.
- `node docs/audits/2026-09-10/pr531-browser-audit.mjs`: **24 fixture/theme states**.
  Uses the existing component harness with synthetic data and no server mutations;
  served-build CSS and font classes are retained. Four actual login/password
  route pairs are also captured. This is component-state evidence, not authenticated
  admin integration evidence.

Local evidence: `output/playwright/pr531/` contains PNGs and `computed.json`.
The audit script is checked into this change so the evidence can be regenerated.
Finite entrance animations are finished before screenshots.

## Remaining merge gates

1. Integration update: PR #531 was externally merged at 2026-09-10 18:00:44 UTC
   as `698ddbc7c2f2a421d7f76e50c4befda63f3e9d28`; its remote branch was deleted.
   These amendments were not included. A follow-up PR is required for integration.
   Final-SHA results belong in that PR; the initial evidence below is not CI evidence.
2. Complete authenticated preview roster search hits, department chips versus
   Find/canvas results and admin overview at **1920×1080**, plus amended UI states.
   The preview redirects to Vercel login, and the Vercel connector reported it
   could not create temporary access. The configured app test account successfully
   signs in but is viewer-only (`/admin` shows “Admin access required”). Docker's
   Linux engine is unavailable. No production role or data was changed.
   With a local stack available: `npm run db:start`, `npm run db:seed`, then
   `npm run test:e2e:auth`; preview checks still require an authenticated admin session.
3. Obtain a **fresh Codex review on the final commit**. The inspected review was
   for `7f4f0b6`, not `591dac0`; request review on the amendment commit in the follow-up PR.
4. **SEC-1 remains open as a separate security/release concern.** The latest
   `20260901120100_publish_seat_map_floor.sql` still selects notes into published
   rows (lines 232/246). PR #425 only changed application column projections;
   its file list contains no migration. The branch still has authenticated table
   access and published-row RLS, not a column boundary. This was verified from
   repository history, not by reading live private note contents. A separate fix
   must remediate existing published notes as well as prevent future publishing
   of private notes. This UI pack does not resolve it.

## Department handoff correction

`?dept=No%20department` matches open seats, occupants with no department and the
reserved literal spelling “No department” (case/whitespace folded). A legacy
seat.department does not substitute for the occupant's department. The
`tests/seat-filters.test.mjs` reserved-key and chip-equality tests pass. The PR
body's opposing “no longer matches empty seats” sentence has been replaced.
