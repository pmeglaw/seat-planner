# Phase 4 · PR 6 — close-out (`feat/phase4-closeout`, v2.0.0)

Plan v1, written 2026-09-08 (the hand-off date) from a fresh session on `main` @ `764fb39` (over the PR 5b squash
`0e1ba92`, tag `v1.77.0`); the `ibm-design-language` skill fingerprint reproduced as **`f997ee525800e755`** (14 files,
9 references) with the PHASE3DS §0 recipe; `app/styles/sp-components.css` byte-identical to
`docs/redesign-v2/phase3/components/sp-components.css` (`cmp`). **Task 0 is this plan. Nothing is built until the
reviewer clears it and the owner rules on §2 rows 1–9.**

## 0. What PR 6 is

The close-out the slice log (row 6) has promised since PR 0: **v2.0.0 — the redesign complete**. A docs half that the
record already settles (§1) and a code half made of the items every earlier PR parked "for PR 6" (§2). Phase 4 makes
no design decisions: each §2 row cites the record's anchor and carries a recommendation; where the record does not
answer, the row is a **finding** and the owner rules. Hard constraints restated in §5; the verification block is §4;
task order §6; the version note §7.

Inputs read, in the hand-off's order: `CLAUDE.md`; `.claude/skills/brand-system/SKILL.md`; PHASE4BUILD §1.37–§1.47,
§2, §3, §4, §5 stub, slice log; `TEST-TRIAGE.md`; DECISIONS §6 (1–17), the D0–D6 "built" lines, §7, §8; PHASE3DS §5
(twenty), §6, §7 (+ §1.18, §1.26, §1.28 as anchors); PHASE1IA §D; PHASE2UX §5 + slice log (+ §1S.2); the skill's
`SKILL.md` and `references/senior-workflow.md` (+ `composition.md`'s tearsheet row as the row-1 anchor). Off-limits
inputs not opened.

## 1. Docs close-out (settled — no rulings needed) — one line per file

- [ ] `docs/redesign-v2/phase4/PHASE4BUILD.md` — status line → **complete** (PR 6 #N merged, v2.0.0, date); new
  **§1.48 PR 6** entry (the rulings on §2 rows as ruled, what the code forced one line each, the findings below
  recorded); **§2**: every row P3-1…20 and P2-1…9 already reads "done" with its landing file — re-read each against
  the merged tree and correct any stale landing path (none found at plan time); **§3** row 6 (re-points per §2,
  retirements, counts); **§4** PR 6 line ("no token change" unless a row-1 ruling changes one — it does not; row 1A is
  a sheet change, row 9 a file move); **§5 "What Phase 4 learned"** written, ordered tokens → components → surfaces
  like PHASE3DS §7 (draft in §8 below); slice-log row 6 filled; the trailing "Next: PR 6" line closed.
- [ ] `docs/redesign-v2/PHASE1IA.md` §D — a **"Delivered — Phase 4 (v2.0.0, date)"** line under the Phase 3 one:
  the six surfaces on the system, the record's location, no design decision taken in code.
- [ ] `docs/redesign-v2/PHASE2UX.md` — slice log closed with a dated line: the nine §5 obligations discharged
  (PHASE4BUILD §2 P2-1…9 is the record); §1S.2's narrow-tearsheet row amended only if row 1 rules **B** (it already
  reads "anchored bottom", which is A).
- [ ] `docs/redesign-v2/phase3/PHASE3DS.md` — §5: each of the twenty items gains "✔ built PR n — <landing file>"
  (from PHASE4BUILD §2); §6 → "None (Phase 4 close-out, date)"; §1.26 gains its built line (row 5); §1.18 gains the
  dated note for row 3 as ruled; §1.28 gains **amendment G** if row 1 rules A, or the dated "landed content-height,
  DECISIONS §6 no. 18" note if B.
- [ ] `docs/redesign-v2/DECISIONS.md` — header status line ("nothing built" → built through Phase 4 v2.0.0); a dated
  **"Built"** line on every D-entry that lacks one — at plan time: D0 (body), D0-g, D0-h, D1 (body), D1-a, D1-b,
  D1-c, D1-d, D1-g, D2 (body), D2-b, D3 (body), D3-a, D3-b, D3-c, D3-d, D5 (body), D5-a, D5-b, D5-c, D5-d, D6
  (body), D6-a, D6-b, D6-c, D6-e (D0-f, D1-e, D1-f, D1-h, D1-i, D2-a, D3-e, D4, D6-d already carry one); §6: "next
  free number **18**" stated (19 if row 1 rules B, which takes 18); §7 "Not verified" closed line by line — both themes
  (the runtime audit, every PR since PR 2), the keyboard path (e2e-auth `accessibility`, `reception-keyboard`,
  `nav-shell`; the browser tier), the admin surfaces at 1920 / 1280 / 1024 (`viewport-matrix`, `page-frames`, the
  frames in every capture set) — and **the 400 % zoom reflow carried as still unverified, dated** (no Phase 4 rig
  drove it); §8: a dated close line (Q1–Q6 resolved 2026-08-31 / 09-01, Q7 ruled 2026-09-02; nothing open).
- [ ] `docs/redesign-v2/phase4/TEST-TRIAGE.md` — status line; **"PR 6 outcomes"** (the re-points in §2, never a
  loosening); a **"Close-out (PR 6)"** section: §5 row 6 **amended** — it says the close-out verifies "`HEX_LEDGER`
  empty", superseded by owner ruling Q-3 (2026-09-06): two permanent rows (`app/layout.tsx` 1, `SeatSheet.tsx` 12),
  `SWEPT = {1, 2, 3, 4}`; every row whose final PR differs from the plan column, listed (`close-icon-source` 4 → 5;
  `text-tier` and `use-inspector-nudge` retired in 3b, not in the §2 table; `office-room-wash` / `seat-clusters`
  retired 3a on D1-h / D1-i; `marker-contrast` PR 1; `settings-tiles-source` PR 4 as planned); the
  `dialog-error-placement` census final — **14 ids**: `csv-import-review-title`, `delete-seat-confirm-title`,
  `discard-draft-title`, `inspector-unsaved-title`, `json-restore-review-title`, `management-confirm-title`,
  `management-discard-title`, `management-employee-title`, `management-option-create-title`,
  `move-employee-confirm-title`, `move-employee-map-confirm-title`, `publish-review-title`, `swap-confirm-title`,
  `vacate-seat-confirm-title`.
- [ ] `CLAUDE.md` "Design system" paragraph rewritten for the finished state: the load order **with the brand layer**
  (`globals.css` → `carbon-tokens.css` → `sp-tokens.css` → `brand/megeredchian-law-tokens.css` →
  `carbon-components.css` → `sp-components.css` → `phase4-bridge.css`); `phase4-bridge.css` = the permanent font
  bridge (row 9 decides whether that sentence can be written as "only"); `globals.css` = Tailwind base + resets (+ the
  raster app rules if row 9 rules c); the token test's final shape (`SWEPT` complete, `HEX_LEDGER` two permanent rows,
  shrink-only, the two `--cds-font-*` names the one `--cds-*` exception); `sp-components.css` lockstep with the docs
  copy; the record's paths incl. `phase4/plans/`. The "Brand System (LOCKED)" block and the `brand-system` skill
  untouched.
- [ ] `app/styles/phase4-bridge.css` — header rewritten as the permanent font bridge; the "2. Retired-name aliases"
  paragraph (empty since PR 4) and the item-3 paragraph removed as row 9 rules. **Finding F-1 (row 9): item 3 — the
  dark raster lightbox filter (`.map-raster`, `.map-raster-dim`, both three-state forms) — survives in the file;
  "PR 3 rebuilds the raster and removes these" never happened.** No rename of the file (the token test names it).
- [ ] `app/concepts/CLAUDE.md` — a dated **"Superseded"** line at the top (the shipped surfaces are the Phase 4 system;
  these prototypes are kept, gated, not deleted); no page file changes (`music-visualizer-source` keeps `app/concepts/`
  untouched). `docs/design-system/README.md` — **new**, one paragraph: superseded by `docs/redesign-v2/` (the
  AUDIT / PLAN / PALETTE / PASS1 documents are Phase 0 history; `READ-PATH-ASSESSMENT.md` stays cited by `CLAUDE.md`'s
  hardware-target line). Nothing deleted.
- [ ] Remote branches pruned after merge (`git push origin --delete`), each confirmed superseded at plan time:
  - `chore/design-sync-2026-08-28` — 1 commit (`39069ee`), PR **#479 closed unmerged**, 46 behind `main`; 32 files, all
    under `.design-sync/` (previews of `AppRail`, `AccountMenu`, `AiHighlightChip`, `CloseIcon`, the Tailwind
    `DeleteSeatConfirmDialog` / `DiscardDraftDialog`, …) — every previewed component retired in Phase 4 PR 2–5b.
    (`main` still carries the older `.design-sync/` tree — not in this hand-off's scope; noted as F-7.)
  - `docs/redesign` — 2 commits (`8c3be4c`), no PR, 48 behind; adds `docs/design-system/redesign-mockup-handoff.md` +
    `shell-reference.html` — permanently off-limits since DECISIONS §8 Q1 (resolved 2026-08-31); superseded.
  - `fix/pass1-scrim-tokens` — 1 commit (`bcc4f3d`), PR **#478 closed unmerged**, 46 behind; two class edits pointing
    the old drawer scrim and publish-dialog scrim at `--sp-chrome-scrim` (a group-2 name retired in PR 2); both
    surfaces rebuilt in 3b (the slot side panel, the wide tearsheet); superseded.
  - `dependabot/npm_and_yarn/minor-and-patch-1a7ef5ba07` — dependabot's; left.
- [ ] `docs/redesign-v2/phase4/screenshots/pr6/README.md` + captures (§4).

## 2. Parked items — the table (owner rules; recommendation + cost per row; test re-points named)

| # | Item | Parked | Record anchor | Recommendation · cost · tests | Owner ruling |
|---|---|---|---|---|---|
| 1 | Narrow tearsheet is content-height — `.sp-tearsheet--narrow { bottom: auto; … }` (sheet line 986) floats mid-screen: top 160 / bottom 490 at 1080 (PR 4 smoke step 12) | PR 4 review, §1.39 | PHASE2UX §1S.2 "720 centred, top 112, **anchored bottom**"; `composition.md` "Tearsheet — a focused task **anchored to the bottom of the viewport**"; PHASE3DS §1.28 landed it content-height. The wide sheet's base rule IS anchored (`.sp-tearsheet { bottom: 0 }`, line 697); the narrow override alone sets `bottom: auto` | **Two options, not picked.** **(A) sheet amendment G**: `.sp-tearsheet--narrow` drops `bottom: auto` for `bottom: 0` (the `max-height` becomes redundant and leaves) — one rule, both copies byte-identical, no token change; the body region grows to the viewport bottom, content stays top-aligned, the footer sits at the bottom like the wide sheet; PHASE3DS §1.28 amendment paragraph; captures of all four narrow sheets (Deactivate · Delete department/zone · CSV review · Restore review) both themes + the 1024 frame (amendment C still applies). Tests: `pr4-smoke` step 12 asserts `y === 160` only (holds); no unit / e2e pin names the bottom edge (grepped) — nothing re-pointed. **(B)** leave as landed; record as **DECISIONS §6 no. 18** (deviation: content-height narrow tearsheet) with the PHASE3DS §1.28 note; no code. The reviewer mocks both for the owner at plan review | |
| 2 | `deactivate_employee` has no distinct SQLSTATE; the refusal is recognised by its text | PR 4, §1.39 | CLAUDE.md "Mutations go through RPCs" (TS action + SQL in lockstep); the MLS02 precedent (`lib/draftConcurrency.ts` `STALE_DRAFT_SQLSTATE`, `reset_draft_floor.sql` `using errcode = 'MLS02'`). **Finding F-2:** `deleteEmployeeAction` (`app/actions.ts` :719) returns `REFUSED` for **any** RPC error, not by text — a transport failure would render in the panel's danger zone as a refusal | **Recommend build** (small, contained, both tiers execute it) — the owner rules because it is a **production migration** (merge applies it through the Supabase integration). Scope: new `supabase/migrations/2026MMDDHHMMSS_deactivate_employee_sqlstate.sql` — `create or replace` of `public.deactivate_employee(uuid)`, body verbatim, the published-map raise gains `using errcode = 'MLS03'` (message unchanged — `management-actions-transaction-safety` :65 pins it; grants survive a replace); `lib/actionRefusals.ts` (new, tiny): `PUBLISHED_EMPLOYEE_SQLSTATE = "MLS03"` + `isPublishedEmployeeRefusal(error)`, unit-tested; `app/actions.ts` `deleteEmployeeAction`: that code → `REFUSED` with the message, any other error → the `throw new Error(error.message)` arm every sibling management action uses. Tests: `rpc-execution` "blocks an employee still on the published map" gains `code: "MLS03"` (the harness's `expectThrow` takes `code`); `action-error-contract-source` :59 re-pointed to the guarded return (meaning kept: never thrown); `management-actions-transaction-safety` unchanged (verify); `seed-migration-replay` + the PGlite harness pick the migration up. Alternative: defer past v2.0.0 as its own patch | |
| 3 | Help-panel opener for the Ask Planner explainability popover | PR 3b, §1.35 | PHASE3DS §1.18: the popover's link → the Help panel; `AskPlannerDrawer` carries `onOpenHelp?` (:42, :275) — **no feeder** (F-5). Not a registration through `useAppShellNavigation` (that channel is surface → shell); the shell must expose a panel opener to a surface — the `useAppShellLeftPanel` precedent (`AppShell.tsx` :70–80) | Cost: **two product files + one test** — `components/ui/AppShell.tsx` (~15 lines: a panels context `{ open(panel) }` beside the left-panel context, hook `useAppShellPanels()`; `togglePanel` already exists at :296) and `components/seat-map/SeatMap.tsx` (2 lines: `onOpenHelp={() => panels?.open("help")}` on the drawer at :3206); ct pin in `app-shell.test.mjs` (the hook opens Help; focus lands per the panel's own rule). By the hand-off's threshold (≤ one file + test → build) this is **defer** — recorded as a dated note in PHASE3DS §1.18 and PHASE4BUILD §1.48; the owner may override (it is ~20 lines and closes a §1.18 promise) | |
| 4 | 900px `panel:` Tailwind screen + `SEAT_CENTER_PANEL_BREAKPOINT_PX` | PR 3b, §1.29 / §1.35 | §1.29 says "the shell still uses it" — **stale (F-3)**: grepped, the shell has no `panel:` consumer; the only `panel:` class is `ViewerSeatFinder.tsx` :1484's phone-gated zoom float (`panel:bottom-3`, which its own comment calls vestigial). `SEAT_CENTER_PANEL_BREAKPOINT_PX` (`SeatMap.tsx` :201) feeds a **dead** `panelTier` state (:369–374, set, never read), the 0.28 sheet anchor (:1801) and the below-900 pan effect (:1843) — all written for the bottom sheet the slot replaced. `ViewerFindPalette.tsx`'s **own** `VIEWER_PANEL_BREAKPOINT_PX = 900` (:49) is a live rule (owner answer 3) pinned by `accessibility-source` :1070–1071 — **stays** | **Recommend retire**: the `panel` screen (`tailwind.config.ts` :43–46), `panel:bottom-3` (ViewerSeatFinder), `SEAT_CENTER_PANEL_BREAKPOINT_PX`, `SEAT_CENTER_SHEET_ANCHOR`, the `panelTier` state and the below-900 pan effect — `centerSeatInMap` centres at 0.5 at every width (below 900 the slot overlays from the right at `min(400, 100%)`, so a vertical anchor buys nothing). No token / sheet change. Tests: `accessibility-source` :1198 regex loses ` panel:bottom-3` and keeps the safe-area-inset half (the guardrail); `map-viewport.test.mjs` :59–60 comment re-worded (the lib anchor parameter stays, test unchanged); verify at build that no browser / e2e spec asserts the below-900 pan (`seat-map.spec.ts` :372 sets 820×900 — read it). §1.29's sentence corrected in §1.48 | |
| 5 | `.sp-callout` fate | PR 4, §1.37 | DECISIONS D6-a (the standing banner becomes a proper callout — loads with the page, never dismissible, no status); PHASE3DS §1.26 (hand-built on the notification's geometry, edge measured 3.02 / 3.01 not gated); PHASE2UX §1S.2 row. Consumers: `DataUtilitiesPanel.tsx`, `settings/loading.tsx`; pins: `settings-affordance-source` :48/:51 (present, no `<button>` inside), e2e-auth `page-frames` :121 | **Keep as landed, record closed** — the record already says what it is; nothing contradicts it. PHASE3DS §1.26 gains "Built PR 4 (`DataUtilitiesPanel.tsx`, the Settings skeleton)". No code | |
| 6 | `components/seat-map/mapIcons.tsx` → `components/ui/icons.tsx` | PR 5, §1.42 (O-14) | It is the shared glyph module for every surface: 13 importers across `seat-map/`, `admin-management/`, `reception/`, `ui/`, `app/(shell)/reception/loading.tsx` | **Recommend the rename** (`git mv`; the module body unchanged — no glyph change): the 13 imports re-pointed; `management-detail-source` :29 (a comment naming `mapIcons`) re-worded — the only test that names it (the hand-off says two; grep finds one, re-check at build); PHASE4BUILD / plan / TEST-TRIAGE mentions are history and stay. Verify `grep -rn mapIcons app components lib tests` = 0 | |
| 7 | `CarbonModal` busy → idle refocus (+ anchor focus on the section when `busy` flips true) | PR 5b, §1.47 R-5 | SKILL.md keyboard floor; the `dialog-initial-focus` contract (first enabled control on open, container fallback when nothing is enabled); the R-5 finding (`pr5b-dialogs` `06b`: the move-conflict dialog mounts busy, settles with focus on the invisibly-focused section); the smoke's mid-flight `<body>` finding (Chrome drops focus from a primary that disables under the pointer) | **Recommend build.** One effect in `CarbonModal.tsx` on `[busy]` with a section ref: busy **true** → if `document.activeElement` is not inside the section (body, or dropped), `section.focus()` — the trap keeps its anchor; busy **false** → in a `requestAnimationFrame`, **only if** `document.activeElement` is the section itself, `<body>`, or outside the section, focus the first visible enabled control (`focusFirstControl(node)` exported from `useDialogFocus.ts`, sharing `FOCUSABLE_SELECTOR` so open-focus and refocus have one definition). **Why it cannot steal the error alert's focus:** every consumer focuses its alert either in an effect on the settle (`SeatMapDialogs` `useSettledErrorFocus` :80 — a parent of the host, so React runs the host's effect first and the parent's alert focus last) or in a rAF queued when the error is set (`SeatInspector` :783, `AdminManagementPanel` :267) — in either order the host's guard sees focus inside the section and does nothing, or the alert's own focus lands after it; the `dialog-error-placement` ct (focus in the alert after settle) proves it. Tests: `dialog-initial-focus` gains the two transitions (pending → idle lands on Cancel; idle with focus dropped → pending lands on the container); `dialog-error-placement` unchanged and re-run; `accessibility-source`'s host pairing unchanged. Rigs: `pr5b-dialogs.mjs` `06b` → PASS (29/29 expected); `pr5b-smoke.mjs` (the mid-flight record); `pr4-smoke.mjs` steps 8 (dirty close) and 14 (create modal) — the three consumer families | |
| 8 | `Button.tsx` `adminDangerButtonClassName` unused since 5b | PR 5b, §1.47 | — . **Finding F-4:** `components/ui/Button.tsx` has **no importer at all** (grepped `app components lib`); `components/ui/design-system.tsx` exports a different `Button` with the same loading contract (`isDisabled = disabled \|\| loading`, `aria-busy`, spinner) that `LoginForm`, `SeatMap`, the palette and the viewer consume | **Recommend retire the whole file** (nothing else is left in it that anything uses). The two tests that name it are re-pointed, meaning kept: `pending-state-source` :45/:242 ("Button loading prop disables, marks aria-busy, renders the spinner") → `design-system.tsx`'s `Button` (same three assertions against its source); `touch-target-source` :78 PINS row removed with the file (the sweep runs over files that exist; a stale row would read a missing file — verify the loop). `focusRingClass` keeps its other consumers | |
| 9 | **F-1** — the dark raster lightbox filter still lives in `phase4-bridge.css` (item 3; four rules, three-state shape), with the light dim in `globals.css` :113 | PR 1, §1.2 ("PR 3 rebuilds the raster and removes these" — PR 3 did not) | Owner ruling Q1 (PR 3b, 2026-09-05, quoted in the token test :375): "`app/globals.css` is Tailwind base + resets **(and the font bridge / raster filter app rules)** — never a product component". `theme.test.mjs` :119–122 reads the bridge for the raster's three-state shape; `ask-planner-ai-source` :70–75 reads globals + bridge for two `saturate` rules | **Recommend (c): move the four rules into `globals.css`** beside the light dim (all `.map-raster*` rules in one file, the three-state shape kept, cascade order verified — no later sheet or utility sets `filter` on `.map-raster`; zero pixel change, checked by the dark map capture) → the bridge becomes the font bridge only, as the hand-off's CLAUDE.md line expects. Tests: `theme.test.mjs` reads `globals.css` for the shape (meaning kept); `ask-planner-ai-source` reads `globals.css` alone. Alternatives: **(a)** keep them in the bridge and reword its header + CLAUDE.md ("font bridge + the raster lightbox"); **(b)** sheet amendment moving them into `sp-components.css` — a product rule on a product class, not a Phase 3 component; not recommended | |

Other observations from the read (recorded, no ruling needed): **F-6** TEST-TRIAGE §5 row 6's "`HEX_LEDGER` empty" is
superseded by Q-3 (handled in §1); **F-7** `.design-sync/` exists on `main` (previews and shims of components the
redesign retired) — outside this hand-off's scope, noted for the owner; **F-8** the 400 % zoom reflow (DECISIONS §7)
was never driven in Phase 4 — carried, not closed. Nothing else in PHASE4BUILD §1 is parked beyond rows 1–8 (grepped
"PR 6", "close-out item", "not built, recorded"; §1.14, §1.20, §1.35, §1.42, §1.47 read).

## 3. Files (by row, as recommended; rows 1B / 3-defer / 2-defer change nothing in code)

**Modify** — `components/ui/CarbonModal.tsx`, `components/ui/useDialogFocus.ts` (row 7) · `app/actions.ts` (row 2) ·
`components/seat-map/SeatMap.tsx`, `components/seat-map/ViewerSeatFinder.tsx`, `tailwind.config.ts` (row 4) ·
the 13 importers of the glyph module (row 6) · `app/globals.css`, `app/styles/phase4-bridge.css` (row 9 + §1) ·
`app/styles/sp-components.css` + `docs/redesign-v2/phase3/components/sp-components.css` lockstep (row 1A only) ·
`CLAUDE.md`, `app/concepts/CLAUDE.md`, the six record files (§1).
**Create** — `supabase/migrations/…_deactivate_employee_sqlstate.sql`, `lib/actionRefusals.ts`,
`tests/action-refusals.test.mjs` (row 2) · `docs/design-system/README.md` · `screenshots/pr6/README.md` + captures ·
this plan.
**Rename** — `components/seat-map/mapIcons.tsx` → `components/ui/icons.tsx` (row 6).
**Delete** — `components/ui/Button.tsx` (row 8, with its two test rows re-pointed in the same commit).
**Tests touched** (re-pointed, never loosened): `dialog-initial-focus` (+2), `dialog-error-placement` (re-run),
`rpc-execution` (+`code`), `action-error-contract-source`, `action-refusals` (new), `accessibility-source` (:1198),
`map-viewport` (comment), `management-detail-source` (:29), `pending-state-source` (:45/:242), `touch-target-source`
(:78), `theme` (:119–122), `ask-planner-ai-source` (:70–75), `phase4-token-layer-source` (unchanged — verify the
bridge assertions still hold on the rewritten header).

## 4. Verification (every code row that lands; the block runs once on the final head)

- `npm test` (unit, incl. `test:db` on PGlite) · `npm run test:ct` (never concurrently with unit) · `npm run gate`
  (lint 0 errors · typecheck · coverage floors 90 / 95 / 80) · `npm run build` · `npm run test:e2e` (on the build) ·
  `npm run test:browser`.
- **e2e-auth on the local Docker stack** (`db:start` + `db:seed`, the README recipe with the URL + anon key inline —
  never `.env.local`; reset + reseed between rigs) — 53 / 53 or the new count explained.
- Runtime audit (`audit/runtime-audit.mjs`): **0 undefined `var()`**, 6 routes × 2 themes + 1280 + the system state +
  the viewer pass.
- Contrast rerun (`generate-pairs.mjs` + `check_contrast.py`): **202 / 202**, "no token change" (no row changes a
  token).
- `sp-components.css` byte-identical to the docs copy at every push (row 1A: both copies change together and the
  token test's identity assertion proves it).
- Rigs: `pr5b-dialogs.mjs` (row 7 — `06b` PASS, 29 / 29), `pr4-smoke.mjs` steps 8 + 14 (row 7) and 12 (row 1A),
  `pr5b-smoke.mjs` mid-flight record (row 7); the dark map capture (row 9 — the raster inverted as before).
- Captures under `screenshots/pr6/` with a provenance README: the four narrow sheets × 2 themes + 1024 (row 1A); the
  move-conflict dialog idle after a busy mount, both themes (row 7); the dark `/` and `/admin` map (row 9); the
  runtime-audit set.
- Greps at the end: `mapIcons` = 0; `panel:` in `components app` = 0; `SEAT_CENTER_PANEL_BREAKPOINT_PX` = 0;
  `components/ui/Button.tsx` gone; `--cds-` in the bridge = the two font names; brand checklist from the
  `brand-system` skill (primary `rgb(184, 92, 46)`, hover `rgb(143, 69, 33)`, focus ring, current bar, links, no
  `0f62fe` outside `carbon-tokens.css`).
- Then: the reviewer's rig / smoke hand-off, the PR, CI (verify · e2e · e2e-auth · CodeQL), the **read-only** preview
  walk (open-and-dismiss only — never Publish / Discard / Restore / Import / Delete on a preview), "merge" → squash,
  tag **v2.0.0 "Phase 4 — redesign complete"**, prune (§1), prod READY.

## 5. Hard constraints (restated)

The two vendored Carbon files are never edited; brand colour only from `app/styles/brand/`; no hex and no `--cds-*`
outside the token files; `HEX_LEDGER` stays exactly its two permanent rows; the token test is shrink-only. Guardrail
tests are re-pointed only, in the same PR, meaning kept (TEST-TRIAGE §0). Local dev writes to production: every
screenshot, role, rig and smoke runs on the local Docker stack. Nothing destructive on a Vercel preview.

## 6. Task order (on "go"; one task = one test cycle + one commit on `feat/phase4-closeout`)

0. This plan — committed, pushed, **stop** for the reviewer's clearance and the owner's rulings on rows 1–9.
1. Row 8 — retire `Button.tsx` (+ the two test re-points).
2. Row 6 — the glyph module rename (+ 13 imports, the comment).
3. Row 4 — retire the 900 tier in `SeatMap` / `ViewerSeatFinder` / Tailwind (+ `accessibility-source`).
4. Row 9 — the raster rules to `globals.css`; the bridge header (+ `theme`, `ask-planner-ai-source`).
5. Row 7 — `CarbonModal` busy → idle refocus (+ `dialog-initial-focus`; rigs).
6. Row 2 — the migration + `lib/actionRefusals.ts` + the action (+ `rpc-execution`, `action-error-contract-source`).
7. Row 3 — as ruled (build: the panels context + the drawer feed + the ct pin; defer: the dated notes).
8. Row 1 — as ruled (A: amendment G both copies + captures; B: DECISIONS §6 no. 18 + the §1.28 note).
9. Row 5 — the PHASE3DS §1.26 built line (docs only).
10. §1 docs, last (they cite the final state of 1–9); `screenshots/pr6/`.
11. The verification block (§4), the reviewer's rig / smoke hand-off, PR, CI, preview walk, merge, tag, prune.

## 7. Version note

**v2.0.0 = the redesign complete, not a launch.** The app has no audience yet; the major bump marks that every
surface now sits on the Phase 3 system with the record closed (PHASE1IA → PHASE2UX → PHASE3DS → PHASE4BUILD), not a
product release. Tags are git-only (`package.json` `version` stays `0.1.0`, as for every tag before). The tag message:
"Phase 4 — redesign complete".

## 8. Draft of PHASE4BUILD §5 "What Phase 4 learned" (for the docs task; ordered tokens → components → surfaces)

**Tokens.** The phased token test (ledger shrink-only, `SWEPT` by group) let every PR land green while the old names
were still consumed — and its two permanent ledger rows are the honest end state, not an empty ledger. The brand layer
proved the semantic layer's purpose: one file overriding Carbon's interactive roles restyled every surface without a
component naming a colour. Contrast is a generated suite, not a checklist — every hue change (O2, O3, the tertiary)
was caught by the pair run before a capture. **Components.** Zone rules must repeat the asset's element names or lose
by specificity (the radio rings); the outlined-open trigger is four shadows; the sheet is the deliverable and every
product change is an amendment in **both** copies, byte-identical, or the token test fails the build; hosts
(`CarbonModal`, the tearsheets, the side panel) own focus, Esc and the inert overlay so consumers cannot forget them —
and a host-level finding (busy → idle focus) is fixed once for every consumer. **Surfaces.** The tiers are not visual
verification: every PR's decisive findings came from the Docker-stack rigs and the owner's smokes (the indicator seam,
the returned refusal, the clipped tooltip, the `null` history state, the four dialogs closing mid-flight), each a
hit-test on the real Chrome, both themes. Check the runtime at Task 0, not Task 10; measure inside `main`, never a class
a `loading.tsx` shares; capture byte-compare baselines alone on a same-day seed; free the port by listener PID. And the
record works: every "what did not fit" line became a dated ruling or a PR 6 row — nothing was decided in code.
