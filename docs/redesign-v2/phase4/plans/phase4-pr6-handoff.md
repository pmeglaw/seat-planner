# Phase 4 · PR 6 — branch state and resume note (`feat/phase4-closeout` → v2.0.0)

**What this file is** (retitled 2026-09-08 on the reviewer's correction): the branch's current state and the recipe a
resuming session runs — not the reviewer's hand-off. The plan of record is `phase4-pr6-closeout.md`; its §9 recorded
the state at the pause after Task 10, and this file supersedes that §9. The reviewer's own smoke hand-off (the six
steps no rig reaches) is recorded separately with its evidence, in `../screenshots/pr6-smoke/README.md`; §5 below
stays what it always was — the run recipe.

Rows 1–9 are built and evidenced; nothing in the plan's §1–§3 is half-done. What remains is the PR, CI, a read-only
preview walk, then merge → tag → prune.

Phase 4 makes no design decisions. Every row below cites a dated owner ruling from PHASE4BUILD §1.48; if the reviewer
disagrees with one, it goes back to the owner as a ruling, never changed in code here.

---

## 1. The branch

| | |
|---|---|
| Branch | `feat/phase4-closeout`, pushed, tracking `origin` |
| Head | `517dfc2` (Task 11 docs), the reviewer's post-bump commit (§4, `audit/pr6-smoke.mjs`, `../screenshots/pr6-smoke/`), then the **F-8 fix** — sheet amendment G |
| Base | `main` @ `072bffa` (v1.77.1, the Dependabot minor-and-patch group) |
| Commits over `main` | 14 row/docs commits + 1 merge |
| Merges as | squash → tag **v2.0.0**, message "Phase 4 — redesign complete" |
| `package.json` `version` | stays `0.1.0`; tags are git-only, as for every tag before |

**`origin/main` was merged in on 2026-09-08** after the branch paused. It brought only the dependency bump
(`package.json`, `package-lock.json`): `@supabase/supabase-js` 2.115.0, `next` + `eslint-config-next` 16.3.4,
`@types/react-dom` 19.2.7, `postcss` 8.5.28. No source, SQL, token, sheet or capture changed, and the merge was
conflict-free. The six tiers that do not need Docker were re-run on the merged head and are unchanged — §3.

---

## 2. What landed, by row

The plan's §2 table carried a recommendation per row; the owner ruled all nine on 2026-09-08 (PHASE4BUILD §1.48).

| Row | Ruling | Commit | What landed |
|---|---|---|---|
| 8 | retire | `7448d5d` | `components/ui/Button.tsx` deleted — no importer anywhere (F-4); `design-system.tsx`'s `Button` is the live one. `pending-state-source` re-pointed to it, `touch-target-source` row removed with the file |
| 6 | rename | `f786d4f` | `components/seat-map/mapIcons.tsx` → `components/ui/icons.tsx`; 13 importers re-pointed, module body unchanged, one test comment re-worded |
| 4 | retire | `738e362` | The Tailwind `panel` screen, `SEAT_CENTER_PANEL_BREAKPOINT_PX`, `SEAT_CENTER_SHEET_ANCHOR`, the dead `panelTier` state and the below-900 selection pan — all written for the bottom sheet the slot replaced in 3b. `centerSeatInMap` centres at 0.5 at every width. §1.29's "the shell still uses it" was stale (F-3) |
| 9 | move to `globals.css` | `0a162fc` | The dark raster lightbox rules leave `phase4-bridge.css`; all `.map-raster*` rules now sit together in `globals.css`, three-state shape kept, zero pixel change. The bridge is the font bridge only (F-1 closed) |
| 7 | build | `65b4f4f` + `c06452c` | `CarbonModal` owns the busy ⇄ idle focus seam: busy true anchors focus on the section when it has been dropped, busy false refocuses the first enabled control. Closes the R-5 move-conflict finding and the smoke's mid-flight `<body>` finding for all three consumer families |
| 2 | build | `c9be518` | Migration `20260908120000_deactivate_employee_sqlstate.sql` gives the published-map refusal SQLSTATE `MLS03`; `lib/actionRefusals.ts` recognises it; `deleteEmployeeAction` returns `REFUSED` for that code only and throws anything else. **F-2 was a real defect**: the action returned every RPC error as a refusal, so a transport failure rendered in the panel's danger zone as if the database had refused |
| 3 | build (owner override) | `a834ea2` | `useAppShellPanels` exposes the shell's right panels to a surface; `SeatMap` feeds the drawer's `onOpenHelp`; the Ask Planner popover's "How Ask Planner works" link opens Help. Closes PHASE3DS §1.18's promise |
| 1 | **B** — record, no code | `726dc65` | The narrow tearsheet stays content-height; recorded as **DECISIONS §6 no. 18** (anchoring a 3–8-line destructive confirm leaves ~650px of empty body above the danger primary at 1080). Next free deviation number is **19** |
| 5 | keep as landed | `726dc65` | `.sp-callout` is what the record already says it is; PHASE3DS §1.26 gains its "Built PR 4" line. No code |
| — | docs | `726dc65`, `ba71d8e`, `f77c475` | PHASE4BUILD §1.48 / §2 / §3 / §4 / §5 / slice log; PHASE1IA §D delivered; PHASE2UX and PHASE3DS closed; DECISIONS reconciled (§6 no. 18, §7 and §8 closed, every D-entry's "Built" line); TEST-TRIAGE closed; `CLAUDE.md` "Design system" rewritten; `app/concepts/CLAUDE.md` and a new `docs/design-system/README.md` mark both superseded, **not deleted**; `screenshots/pr6/` |

**One thing landed in this PR that is not a row:** the **F-8 fix** (sheet amendment G), on the owner's 2026-09-08
ruling after the reviewer's smoke — `.sp-band[data-slot-open]` takes the open slot's push in both sheet copies,
`MapStatusBand` gains `slotOpen`, `SeatMap` feeds it from `slotOwner`. It is conformance to PHASE2UX §1M.2, so it is
**not** recorded as a deviation; no token changed. Its evidence is `audit/pr6-smoke.mjs` step `05b`, the e2e-auth
`page-frames` map block and the real-browser tier's `data-slot-open` pins. See §9.

**One production migration is in this PR.** Merging to `main` applies `20260908120000_deactivate_employee_sqlstate.sql`
through the Supabase GitHub integration. It is a `create or replace` of `deactivate_employee(uuid)` with the body
diffed verbatim against `20260702100000` — the only change is `using errcode = 'MLS03'` on the published-map raise,
with revoke/grant restated. Read that diff before approving.

---

## 3. Verification on the fixed head (2026-09-08)

Everything below was re-run after the **F-8 fix** (sheet amendment G) landed, on the merged head with the bumped
lockfile installed:

| Tier | Result | Plan's figure |
|---|---|---|
| `npm test` (unit + `test:db`) | **1457 pass · 0 fail** | 1457 |
| `npm run test:ct` | **326 pass · 0 fail** | 326 |
| `npm run gate` | **exit 0** — lint 0 errors (warnings only), typecheck clean, coverage **98.34 / 92.40 / 98.30** | 98.34 / 92.40 / 98.30 |
| `npm run build` | clean | clean |
| `npm run test:browser` | **26 pass** (+ the two `data-slot-open` pins added with amendment G) | 26 |
| `npm run test:e2e` | **36 pass · 0 fail** | 36 in CI |

The two `waitForColorSettle` self-tests in `tests/e2e/axe-helpers.spec.ts` that failed on the sandboxed box in the
earlier runs passed here — this run used real Chrome via `PW_CHROMIUM_PATH`, which is the condition the PR 5 note
already recorded. No product test has failed on any run.

## 4. Docker-stack verification — re-run after the bump, then again on the F-8 fix (2026-09-08)

These first ran on `ba71d8e`, before `origin/main` came in, and this section used to argue they carried across the
merge because only `package.json` / `package-lock.json` moved. **That reasoning was wrong** (reviewer correction
2026-09-08): the group moved `@supabase/supabase-js` 2.112.3 → **2.115.0** and `next` 16.3.3 → **16.3.4**, and row 2's
refusal rides on the supabase-js error object exposing the guard's SQLSTATE as `.code` (`lib/actionRefusals.ts`) — the
only end-to-end proof of that shape is `pr4-smoke.mjs` step 11. So every Docker rig was re-run on the merged head,
after `npm install` with the bumped lockfile, resetting and reseeding between each:

| Rig / tier | Post-bump re-run | Pre-merge figure |
|---|---|---|
| `audit/runtime-audit.mjs` | **0 undefined `var()`** — 6 routes × 2 themes + 1280 + the system state + the viewer pass | same |
| `audit/pr5b-dialogs.mjs` | **29 / 29** both themes (`06b` PASS — R-5 closed, row 7) | same |
| `audit/pr4-smoke.mjs` | **47 / 47** whole, light + dark — **step 11 carries the guard's reason verbatim** ("…still on the published map at CW01…"), so the `.code` shape survives 2.115.0 | same |
| `npm run test:e2e:auth` | **55 / 55** on a reset + reseeded stack (2.3 min) — 53 plus the two `page-frames` map-band tests amendment G brought | 53 / 53 |
| `audit/pr6-smoke.mjs` | **17 / 17**, both themes — the six reviewer steps, with `05b` now asserting the F-8 fix and `05c` pinning F-9's carried state | — |
| Contrast | not re-run: no row in this PR changes a token, a dependency bump touches no stylesheet, and amendment G is a padding rule — **202 / 202** stands | 202 / 202 |

**All five were run twice**: once on the merged head (the post-bump check above) and once on the head that carries
the F-8 fix. The figures are the fixed-head run; only `test:e2e:auth` and `pr6-smoke` changed between them, both by
the guards added with amendment G.

Both arms of that refusal — the guard's reason returned, and a transport failure NOT rendering as one (F-2) — are
smoked directly against the new client by `audit/pr6-smoke.mjs`, with the four other steps no rig reaches. Results,
the one finding it surfaced, and provenance: `../screenshots/pr6-smoke/README.md`.

Captures and provenance for the rigs above: `../screenshots/pr6/README.md`.

## 5. What the reviewer runs

Nothing below writes to production. Everything runs against the local Docker stack.

1. **Read the record first**, in this order: PHASE4BUILD §1.48 (the nine rulings as built), the plan's §2 table (what
   each row was parked for), then this file's §2. A row whose ruling looks wrong goes back to the owner.
2. **Read the migration diff** — `supabase/migrations/20260908120000_deactivate_employee_sqlstate.sql` against
   `20260702100000`. It is the one thing in this PR that touches production on merge.
3. `npm install` (the branch carries the bumped lockfile), then the §3 block: `npm test`, `npm run test:ct`,
   `npm run gate`, `npm run build`, `npm run test:browser`, `npm run test:e2e`. Point `PW_CHROMIUM_PATH` at a
   prebuilt Chromium for the last two.
4. **Bring the stack up and reset it before every rig**: `npm run db:start`, then `npx supabase db reset` +
   `npm run db:seed`. The stack currently carries the e2e-auth tier's leftovers — that tier leaves a published layer
   the seed refuses, so a reset between runs is not optional. The reset is also what applies the new migration; an
   `MLS03` in `pg_proc` confirms it landed.
5. Build and serve with the local URL and anon key passed inline to `next build` / `next start -p 3200`. **Never edit
   `.env.local`** — it points at production.
6. Re-run the §4 rigs in this order, resetting and reseeding between each: `runtime-audit.mjs`, `pr5b-dialogs.mjs`,
   `pr4-smoke.mjs` (**whole** — step 14 starts on the tab step 13 opened), then `npm run test:e2e:auth`.
7. Contrast: `node docs/redesign-v2/phase3/contrast/generate-pairs.mjs` then the checker. Expect 202 / 202 and "no
   token change" — no row in this PR changes a token.
8. The brand checklist from the `brand-system` skill: primary `rgb(184, 92, 46)`, hover `rgb(143, 69, 33)`, the
   terracotta focus ring and current-section bar, links `#8F4521` light / `#E8A07A` dark, and
   `grep -rn "0f62fe" app components lib` returning only the vendored `carbon-tokens.css`.
9. End-of-plan greps, all expected to be zero or gone: `mapIcons`; the retired Tailwind screen,
   `grep -c panel tailwind.config.ts` = 0, **and** the utility itself,
   `grep -rnE '\bpanel:[a-z][a-z0-9-]*' app components --include=*.tsx` = 0 — a loose `panel:` grep is NOT the check
   (it matches row 3's `(panel: ShellPanelId)` type annotations, 6 hits; reviewer correction 2026-09-08);
   `SEAT_CENTER_PANEL_BREAKPOINT_PX`; `components/ui/Button.tsx`. The bridge's only `--cds-*` are the two font names.

---

## 6. The preview walk — read-only

After CI is green, walk the Vercel preview. **Open and dismiss only.** Never Publish, Discard, Restore, Import or
Delete on a preview: the preview deployment reads and writes the production database. Mask people data in every
capture. Prove the walk wrote nothing the way PR 5b did — the draft indicator and Undo state identical before and
after, and the POST log showing only status reads and refused submits.

## 7. Merge, tag, prune

In order, and only after the owner has walked the preview:

1. Squash-merge the PR to `main`.
2. Confirm the Supabase integration applied the migration and the Vercel production deployment reaches READY.
3. Annotated tag **v2.0.0** on the merge commit, message "Phase 4 — redesign complete".
4. Prune the three stale remote branches named in PHASE4BUILD §1.48: `chore/design-sync-2026-08-28` (PR #479 closed
   unmerged), `docs/redesign` (no PR, the off-limits `shell-reference.html`), `fix/pass1-scrim-tokens` (PR #478 closed
   unmerged, two class edits onto a retired group-2 token name).
5. Delete `feat/phase4-closeout` after the squash.

## 8. Gotchas a resuming session needs

- `gh` fails under the Claude sandbox with an x509 TLS error — run it unsandboxed.
- `git push` works sandboxed, but writing the upstream to `.git/config` does not.
- A sandboxed shell cannot `kill -0` a process started unsandboxed. Wait on a log line, never on the PID.
- Free the `:3200` port by listener PID, not by name.
- `pr4-smoke.mjs` runs whole or not at all — step 14 depends on the tab step 13 opened.

## 9. Carried past Phase 4, and the owner's chores

Not Phase 4 obligations, recorded so they are not lost:

- **The 400% zoom reflow** (DECISIONS §7) was never driven in Phase 4. Carried, not closed.
- **`.design-sync/` on `main`** (F-7) holds previews and shims of components the redesign retired. Outside this PR's
  scope; worth a decision after v2.0.0.
- ~~**F-8 — the right slot covers the status band's right end.**~~ **FIXED IN PR 6** (owner ruling 2026-09-08): a
  conformance defect against PHASE2UX §1M.2 ("the band spans the canvas, not the slot"), not a deviation. Built as
  **sheet amendment G** — `.sp-band[data-slot-open] { padding-right: calc(var(--sp-slot-w) + var(--sp-space-03)) }`,
  byte-identical in both sheet copies, `MapStatusBand` taking `slotOpen` from `SeatMap`'s `slotOwner`. It mattered
  because D2-b keeps **Reset zoom** only on that control, so an open inspector took it away exactly while editing.
  PHASE3DS §1.21 amendment G (cross-referenced from §1.17), PHASE4BUILD §1.48. No token change.
- **F-9 — the below-900 palette sheet never spans.** `.sp-palette { width: var(--sp-palette-w) }` (560, the Phase 3
  sheet) beats the `left: 12` + `right-3` stretch `computeFrame` sets up below 900, so the palette is 560 wide at
  every width under the tier and at 390 runs 182px off-screen, clipping the row's trailing cell. The 900 rule itself
  is intact (row 4 retired only `ViewerSeatFinder`'s constant, as ruled). **Owner ruling 2026-09-08: carried, not
  fixed** — phone-width only, off the 1920 hardware target. Recorded in DECISIONS §7 beside the 400 % zoom reflow.
  No code.
