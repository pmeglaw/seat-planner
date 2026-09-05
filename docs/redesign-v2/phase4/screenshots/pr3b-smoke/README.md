# Phase 4 · PR 3b pre-merge smoke captures (2026-09-05)

**What these are.** The owner-ordered thirteen-step pre-merge smoke of PR 3b (#518, markers + the right slot) —
the verification record behind the merge, kept the same way as `pr3a-smoke/`. Every step drives the real built app
in real Chrome and records a pass/fail with the measured facts in `results.json` (`step`, `ok`, `file`, `note`).
Result at the branch head: **18/18 PASS** across the thirteen steps × the two themes where a step is theme-bearing,
after one fix pushed to the branch (PHASE4BUILD §1.36: a seated person's pending detail edit counted in the header
but badged no seat). On the same build: `npm run test:e2e:auth` **32/32**; the marker rig
(`../../audit/marker-contrast.mjs`) **58 measurements, 0 under floor, ledger empty** (both `planner-highlight`
passes SKIPPED this run — the model answered the zone question broadly and highlighted nothing; a model outcome,
not a marker; the PR's own record has the light pass measured at 7.81).

**Source.** Branch `feat/phase4-map-markers` (PR 3b), `npm run build && npm run start` against the **local Docker
Supabase stack** (`npm run db:start`; `supabase db reset` + `npm run db:seed` before the run and between the rigs —
the seed carries NE07 reserved and NE08 unavailable; `.env.local` pointed at `http://127.0.0.1:54321` for the run,
backed up outside the repo and restored byte-identical after; the stack stopped with `supabase stop --no-backup`).
Signed in as the seeded local admin `e2e-admin@example.test` and the seeded viewer `e2e-viewer@example.test`. **No
production data and no production write** — every name, seat and count is `supabase/seed.sql` sample data; the
step-9 publish is a publish of the local container's draft.

**Method.** Playwright `chromium.launch({ channel: "chrome" })`, viewport 1920×1080 (1024×768 and 1000×768 for
step 13), device scale 1, `document.fonts.ready` + 500–800 ms; theme set by writing `sp-theme` to localStorage and
reloading so the boot script derives `data-theme` / `data-carbon-theme` as a user's browser would; Names forced ON
after every load (the toggle is remembered per user). The rig (`smoke-pr3b.mjs`, session scratchpad — not committed;
the reusable rigs live under `../../audit/`) collects console errors, page errors and HTTP ≥ 400 per step (the only
noise is the Vercel Speed Insights script 404ing under a local `next start`, filtered as known) and scans every
rendered element's computed colours for IBM blue on steps 6 and 12. Contrast in step 6 is computed live from the
hit pill's computed `color` / `background-color`.

| Step | Pass | Files | What it verified (measured) |
|---|---|---|---|
| 1 `/admin` loads | ✓ both themes | `01-admin-loads-*.png`, `01-pill-hover-tooltip-*.png`, `01-pill-focus-ring-*.png` | 4 name pills, every one 28px, no seat code in the pill text; hover shows the tier-C tooltip with the code; Tab lands on the pill with `outline solid 2px rgb(184, 92, 46)` inset and the same tooltip; open seat = hollow ring (`circle:stroke`), NE07 = lock (`path:stroke+rect:fill`), NE08 = hatch; 0 console errors |
| 2 Click a pill | ✓ both | `02-inspector-slot-*.png` | `data-state="selected"`, `aria-pressed`, `box-shadow 0 0 0 2px inset` in the inverse colour (#161616 light / #f4f4f4 dark); inspector eyebrow "Seat CW01 · Center West", name, status mark, Copy link, ×; slot 400 at x 1520, the canvas column 1920 → 1520 (pushed), the band 1920 (untouched); Esc closes and focus returns to the CW01 pill |
| 3 Draft edit | ✓ light + dark | `03-draft-badge-{light,dark}.png` | department Intake → Accounting, Save draft changes → pill ◇ stroke `rgb(138, 63, 252)` light / `rgb(190, 149, 255)` dark, inspector "Changed in draft", legend "Changed in draft 1", header "Draft — 1 change" with the ◇ `rgb(190, 149, 255)`, the primary `rgb(184, 92, 46)` in the same frame — **after the §1.36 fix**; before it the header counted 1 and nothing was badged |
| 4 Move | ✓ | `04-move-valid-target-hover.png`, `04-move-invalid-NE07*.png`, `04-move-invalid-NE08.png`, `04-move-confirm.png`, `04-move-applied.png`, `04-undo.png`, `04-redo.png` | mode card owns the slot; valid target `.sp-pill--target` (2px success edge); NE07 / NE08 `.sp-pill--invalid` (dashed 2px `rgb(218, 30, 40)`, `cursor: not-allowed`, `aria-disabled`), click refused, notice "NE07 is reserved — choose another seat." / "NE08 is unavailable — …" in the canvas status region; the tooltip shows the code (the reason is the notice + the accessible name — see PHASE4BUILD §1.36 for the ruling wanted); move Maria N03 → C01 → "Draft — 3 changes"; Ctrl Z → 1; Ctrl Shift Z **reapplied** → 3 (the 3a Redo defect stays fixed) |
| 5 Names off | ✓ both | `05-names-off-*.png`, `05-names-off-badge-*.png` | 4/4 pills → 28px footprints with no text; the changed seat keeps its ◇, inverted on the filled footprint: white on #161616 = **18.10:1** light, #393939 on #f4f4f4 = **10.50:1** dark; legend Assigned pill → ● ; names on restores 4 text pills |
| 6 Filter + search hit | ✓ both | `06-filter-search-hit-*.png`, `06-hit-pill-*.png` | Zone "Center Desks" + "Maria": 1 hit, 3 quiet, every pill opacity 1; hit pill **light** text `rgb(22, 22, 22)` on `rgb(251, 232, 220)` = **15.23:1**, edge `rgb(184, 92, 46)`; **dark** `rgb(244, 244, 244)` on `rgb(57, 57, 57)` = **10.50:1**, edge `rgb(232, 160, 122)`; quiet pill 7.10 / 8.86; no IBM blue on the page |
| 7 Add seat | ✓ | `07-add-seat-mode-card.png`, `07-add-seat-card-row-wrapped.png` | the card ("Add seat mode", 400) starts at the row's bottom (96); with the left panel + a filter the row wraps to 96 and the card starts at 144 — 0 overlaps with the second line; exit clean |
| 8 Ask Planner | ✓ | `08-ask-planner-popover.png`, `08-ask-planner-highlight.png`, `08-ask-planner-pill-click-drawer-keeps-slot.png`, `08-ask-planner-closed-inspector-takes-slot.png` | drawer in the 400 slot; the AI label's gradient border + its explainability popover; a real question ("Which seat does Alex Shabazian sit in?") highlights 1 seat; Clear highlights → 0; a pill click while the drawer is open selects the seat and the drawer keeps the slot (INV-4 order; nothing stacks — 1 visible slot); × on the drawer hands the slot to that seat's inspector |
| 9 Publish review | ✓ | `09-publish-tearsheet.png`, `09-published-toast.png`, `09-published.png`, `09-published-history-panel.png`, `09-viewer-sees-publish.png` | wide tearsheet, no ×, readiness rail, tags "1 assigned · 1 vacated · 1 person updated", table grouped "Floor 3 · Pre-Litigation · 2 changes", facts line, footer Cancel · Publish right-aligned; Cancel closes; Publish → toast "Draft map published. Undo/Redo history was cleared.", admin header "Draft — no changes" + Publish disabled "No changes to publish" (the draft route's indicator by rule), History "Draft matches the published map", viewer `/` header "Published · Sep 4, 2026" with the filled square, C01 shows Maria Lopez |
| 10 Discard | ✓ | `10-discard-confirm.png`, `10-discarded.png` | a seat edit (move C01 → C02, 2 badged) → ⋯ → Discard draft changes → "Discard all draft changes?" → Discard everything → "Draft — no changes", 0 badged. (A people edit made in the inspector survives Discard by the dialog's own rule — §1.36.) |
| 11 Roster + stale draft | ✓ | `11-admin-floor2-roster.png`, `11-stale-draft-notice.png`, `11-stale-draft-cleared.png` | `/admin?floor=2` = the 14-row roster "Floor 2 · Litigation — 8 people"; tab 2 moves Maria C01 → C02, tab 1 (stale, C02 still "Valid destination") moves Alex onto C02 → the MLS02 notice in the canvas region ("Seat C02 changed in another session after it was loaded. … This page has been refreshed with the latest draft."), no dialog left open, self-cleared within 15 s |
| 12 Viewer | ✓ both | `12-viewer-inspector-*.png` | read-only pills with tooltip codes; inspector 400 with Copy link · × · Copy extension · Copy link to this person only — no Move / Swap / Vacate / Delete / Edit, no form fields; Copy link → "Copied" (clipboard `/?seat=C01`); "Draft" appears 0 times; no editor controls in the row; no blue; 0 console errors |
| 13 Narrow 1024 | ✓ | `13-1024-admin.png`, `13-1024-inspector.png`, `13-1000-read-only-note.png` | 1024: row wraps to 96, no horizontal scroll, editing stays (1024 is `lg`), inspector keeps 400 with the canvas at 624; 1000: "Editing needs a wider window.", row 48, no horizontal scroll |

`results.json` is the record of the final full invocation (all thirteen steps on a fresh seed, after the fix).
