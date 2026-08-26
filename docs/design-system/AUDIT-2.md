# AUDIT-2.md — Pass 2: Motion, Spacing, Patterns, Shell, Keyboard, Dark Parity, Absences (Report)

Pass 2 of the design-system adoption. **Report only — no code changed, no fixes proposed.**
Companion to `AUDIT.md` / `PASS1-TOKENS.md`. Audited 2026-08-26 against IBM Design Language /
Carbon doctrine (skill v1.1.0), app at v1.63.0.

Scope: shipped surfaces — `app/**` (excluding `app/concepts/`), `components/**`, `lib/**`,
`app/globals.css`, `tailwind.config.ts`. Everything in the handoff §2 ledger (tokens, twins,
zones, marker vocabulary, type floor, focus tokens, publish guard) was **not** re-audited.
Standing exemptions honored, not re-flagged: map-canvas geometry + type (one ruling, NOTES.md),
the SeatSheet title-block conceit, the Ask Planner card label (candidate B), contract #4's
no-idle-chip publish cluster, contract #9's disabled palette rows (P2, ruled), zoom
non-persistence (fit is the resting state), the recorded owner deviation on dialog initial
focus (first *visible control*, not first input).

Severity frames are stated per finding — proportion of the measured inventory, not raw counts
(the PR-C lesson: pairwise, not per-state). Each section ends with guard coverage; **"no
guard" means a regression there passes `npm test` today.**

---

## 0. The ten findings that matter most (cross-section ranking)

1. **~5 production catch-paths display digest gibberish instead of their written recovery copy** — thrown expected errors in `createSeatAction`/`deleteSeatAction` violate the file's own returned-not-thrown rule (§8.3, F-ERR-1).
2. **`/auth/update-password` is broken in dark theme** — hardcoded white card, theme-flipped light-gray token text on it (§7, F-DK-1). The only shipped surface that is neither designed dark nor coherently light.
3. **The launch-day states don't exist or are wrong.** Never-published viewer map: no empty state. Empty management directory: blames a search that isn't active. Empty reception: renders `No one matches ""` (§8.2). These are the exact states first users will see.
4. **0 of 4 High-tier destructive actions require typing the resource name**, and the app's only toast — which is also publish's only success confirmation — auto-dismisses in 6 s while carrying an Undo action (§3, F-INT-1/2).
5. **Employee-save server errors render behind the open modal** — the dialog appears to do nothing (§3 F-INT-4 / §4 F-FRM-1; found independently by two audit lines).
6. **4 of 17 mutating flows have zero pending indication after their confirm step; 12 of 17 never announce busy to screen readers** (§8.1).
7. **Sense of place is largely absent** — no persistent draft-mode marker on a clean `/admin`, no environment indicator anywhere (in an app where local dev writes production), account identity always behind a click (§5, F-SH-1/2/3).
8. **~96 % of eased motion sites run an off-Carbon curve**, the shared Button primitive answers at 200 ms where Carbon budgets 70 ms, and one keyframe bounces (§1).
9. **Dark hover direction is inverted at 20 of 33 surface-hover sites** (controls sink below their resting surface), and white inks/glints are hardcoded in JSX over fills that dark brightens (§7, F-DK-3/4).
10. **Entire territories are guard-free**: motion durations/curves/reduced-motion on transitions, the 8px grid and control ladder, touch targets, dark-theme completeness, and all loading/pending behavior. Findings there will recur without a pin (§9).

---

## 1. Motion

Inventory: ~137 motion sites — ~106 Tailwind transition sites, 12 custom-keyframe application
sites, 18 `animate-pulse`/`animate-spin`, 1 JS tween (`lib/animateValue.ts`, 2 call sites).

**F-MO-1 — Reduced motion on transitions: ~94 % of transition sites carry no `motion-reduce:` variant.**
Keyframes and the JS tween are all guarded (a genuinely strong invariant); CSS *transitions*
are not — only 6 of ~106. Of the unguarded remainder, ~17 move geometry:
- `components/ui/AppRail.tsx:255` — `transition-[width] duration-150 ease-out` — the full-height
  rail expand/collapse, the largest unguarded structural movement in the app (its sibling
  drawer keyframes are guarded; 1 of the 2 large-surface movers lacks the guard). Also
  off-curve and off-role (Carbon nav expand = fast-02 110 ms).
- ~14 press-scale sites with no guard: `DeptChipRow.tsx:33`, `SeatMap.tsx:2413/2414/2966
  (active:scale-90)/3088/3104/3126/3423`, `SeatInspector.tsx:384/1077/1102/1110/1189/1210`,
  `ResultsPanel.tsx:102`, `ViewerSeatFinder.tsx:1294`. `SeatMarker.tsx:544` does the identical
  press-scale *with* `motion-reduce:transition-none` — the convention exists; these skipped it.
- `AdminManagementPanel.tsx:873` — unguarded sort-chevron `transition-transform` + `rotate-180` (smallest in class).

**F-MO-2 — One overshooting keyframe: 1 of 8 custom keyframes bounces.**
`app/globals.css:940-944` `sp-chip-pop`: `0% scale(0.85) → 55% scale(1.05) → 100% scale(1)` —
explicit travel past the final value, applied to the AI-highlights chip at `SeatMap.tsx:2863`.
Carbon: nothing bounces or overshoots.

**F-MO-3 — Two-property entrances: ~40 % of entrance animations move scale and translate together.**
`app/globals.css:925-933` `sp-panel-in` / `sp-toast-drop` animate `translateY(±8px)` +
`scale(0.985)` simultaneously (one-axis-at-a-time rule). Carried by 5 of 12 keyframe
application sites: `ViewerFindPalette.tsx:274`, `SeatMap.tsx:3418`, `SeatMap.tsx:2407`,
`AskPlannerDrawer.tsx:263`, plus the dialog fade family. (All motion-safe gated.)

**F-MO-4 — Easing: ~96 % of eased sites (all but 5 of ~120) run an off-Carbon curve.**
`tailwind.config.ts` overrides `transitionDuration` but defines **no `transitionTimingFunction`**,
so every bare `transition`/`transition-colors` resolves to Tailwind's
`cubic-bezier(0.4,0,0.2,1)` (~100 sites). Six keyframe applications + 2 transitions use
`ease-out`; three bespoke beziers exist (`AskPlannerDrawer.tsx:263` Material-style
`cubic-bezier(0.2,0,0,1)`; `SeatSheet.tsx:224/:233`); `lib/animateValue.ts:19` hardcodes
easeOutCubic. On-curve for the record: the sanctioned text-tier stagger
(`SeatMarker.tsx:79/417/418`, productive-standard), `DraftTrailOverlay.tsx:146` (the single
fully Carbon-compliant entrance in the app), and `login-rise-in`'s curve (entrance curve, but
500 ms — off-table). `DraftTrailOverlay.tsx:169`'s 1.2 s `linear` marching-ants dash is linear
on a non-spinner (nearest analogue to the spinner exemption; noting, not pressing).

**F-MO-5 — The duration token scale itself is off-table at 2 of its 3 stops.**
`app/globals.css:139-141`: `--sp-duration-fast: 150ms; -standard: 200ms; -deliberate: 280ms`.
Carbon's table is 70/110/150/240/400/700; only 150 lands. Consequence flows to the shared
primitives: `components/ui/design-system.tsx:83/146` put Button and IconButton hover feedback
at `duration-sp-standard` (200 ms) where Carbon budgets fast-01 **70 ms** — effectively 100 %
of hover-feedback sites in the app run 150–200 ms against a 70–110 ms budget, ~2–3× the role.
Off-table one-offs: AskPlannerDrawer backdrop 180 ms (Carbon background dimming = slow-02
700 ms — mismatched in the *other* direction), panel 220 ms, `SeatMap.tsx:3175` filter dim
200 ms, `animateValue` default 250 ms, login rise 500 ms, `active:duration-75`, and the
SeatSheet blueprint choreography (1.3 s draw + 0.9 s settle, delay ladder to 1.1 s — properly
reduced-motion guarded at `SeatSheet.tsx:245-256`, but the furthest off-table durations shipped).

**Guard coverage — motion:** `accessibility-source.test.mjs:1088-1105` pins `motion-safe:` on
`animate-spin|pulse` in 6 named files only — the custom `animate-[sp-*]` sites match no test
regex; `seat-map-components:371-373` pins `map-trail-dash` gating; `animate-value` /
`use-inspector-nudge` tests pin the JS tween's reduced-motion skip. **No test pins any
duration value, any easing curve, the `--sp-duration-*` values, transition-site reduced-motion,
or the one-axis/no-overshoot rules.**

---

## 2. Spacing and the 8px grid

The parked "442 arbitrary values" needed a denominator correction before ruling: 185 of the
raw hits were prose in comments, never live code. Live: 512 hits, of which 274 are not spacing
(font sizes — ruled by the type-floor arc — blurs, hairlines, shadow offsets, radii) and 56
are layout widths ≥200px (container widths, mostly 8-multiples or viewport-derived).

**Spacing frame: 172 occurrences, ~55 distinct values** — buckets recomputed 2026-08-26
against the corrected Carbon scale (2/4/8/12/16/24/32/40/48/64/80/96/160; skill v1.2.0,
verified against `@carbon/layout` 11.57.0):

| bucket | occurrences | share |
|---|---|---|
| map-canvas exempt (SeatMarker / MapWashLayer / SeatSheet) | 88 | 51 % |
| near-miss (±2px of a Carbon step) | 59 | 34 % |
| genuinely off-system | 13 | 8 % |
| exact on-system (2/4 micro included — they are spacing-01/02) | 12 | 7 % |

Of the non-exempt 84: ~70 % near-miss, ~15 % off-system, ~14 % on-system. The distinct
off-system values are just 36, 44, 52, 68, 72, 76, 84 — and 44 is sanctioned (F-SP-4), while
72/76/84 are derived chrome-height sums. The population is drift beside the grid, not scatter.

**F-SP-1 — Genuine standard-utility drift is four values: 6px (75 uses), 10px (51), 14px (14), 20px (12).**
The originally reported "12px/40px contradiction" was a false positive and is withdrawn: the
skill's permitted-multiples list was incomplete. 12px is Carbon **spacing-04** and 40px is
**spacing-08** — both on Carbon and on the repo's own scale (`--sp-space-3: 12px`,
`globals.css:118`; `--sp-chrome-height`). The skill was corrected to the full Carbon token
scale in v1.2.0 (2026-08-26). What actually remains: of 1,241 standard-utility spacing
occurrences, 152 (~12 %) use the four drift values above, which sit on neither Carbon's scale
nor the repo's. Nothing here needs a ruling; the scale question is settled.

**F-SP-2 — Top drift clusters among arbitrary values** (near-miss + off-system, exemptions
removed): 15px ×13 (login SVG glyph
boxes, `LoginForm.tsx:428`), **26px ×10 — an app-wide avatar/monogram convention** beside 24
(`ViewerSeatFinder.tsx:1370`, `ReceptionScreen.tsx:307`, `AccountMenu.tsx:133`), 9px ×8
(`AdminManagementPanel.tsx:803` `py-[9px]`), 18px ×6, 22px ×5 (login), 7px ×4 (decorative
dots), 68px ×3 (`SeatInspector.tsx:1342-1353` action buttons, between 64 and 80), 52px ×2
(`ReceptionScreen.tsx:116`, `SeatMap.tsx:3460`). The calc-offset family (84/76/44/36px in
`SeatMap.tsx:2326-2344`, `ViewerSeatFinder.tsx:1044`) inherits chrome-height sums rather than
introducing free values.

**F-SP-3 — Control heights: ~15 of ~32 explicit control-height specs (≈47 %) are off the 24/32/40/48/64/80 ladder, in three families plus one-offs.**
Recomputed 2026-08-26: the 44px family (`design-system.tsx:56/129` Button/IconButton
`min-h-11`, `AdminManagementPanel.tsx:822` toolbar — 3 specs) is **correct, not drift** —
the v1.2.0 ruling has the WCAG touch minimum beat the ladder, so 44px controls are sanctioned
and no longer counted. 40px was always on the ladder. What is genuinely off-ladder:
- **28px family** (6 specs — viewer/admin chrome): `ViewerSeatFinder.tsx:1121/1185`,
  `SeatMap.tsx:2567` `chromeIconBtn h-7 w-7`, `MapZoomControl.tsx:35`, `ThemeToggle.tsx:42`,
  `AdminManagementPanel.tsx:963`. **These are the same sites F-SP-4 flags as under the touch
  minimum — one fix, counted and ruled there** (the touch minimum is the binding constraint);
  cross-referenced here only so no pass counts or fixes them twice.
- **36px family** (4 specs): `design-system.tsx:55` small buttons, `Button.tsx:27`,
  `SeatMap.tsx:2959` search `h-9`, viewer shortcut buttons.
- **One-offs**: 68px inspector actions (`SeatInspector.tsx:1342-1353`, ×3 sites), 52px
  reception search bar (`ReceptionScreen.tsx:116`) — with the 28px family homed in F-SP-4,
  the ladder-convergence remainder proper is ~9 specs (~28 %).
Padding-math heights on primary controls (no explicit height, doctrine: heights never from
padding math): management tab bar `AdminManagementPanel.tsx:803` (`px-4 py-[9px]`), reception
result rows `ReceptionScreen.tsx:302`; the Button primitives themselves are `min-h` + padding.

**F-SP-4 — Touch targets: of ~21 interactive specs under 44px visual, ~17 have no hit-expansion; the repo's own expansion pattern exists and reaches 44 at 3 of its 4 uses.**
Per the v1.2.0 ruling, 44px is the binding constraint and a 44px control or hit area is
correct — every row below has 44 as its target, and fixing a row here also closes its
F-SP-3 off-ladder listing (the 28px family lives in both frames; it is counted once, here).
Worst: **20×20** search-clear buttons on the phone-facing viewer (`ViewerSeatFinder.tsx:1294`,
`SeatMap.tsx:3088`). Then the 28×28 set (management seat-link `AdminManagementPanel.tsx:963`,
zoom `MapZoomControl.tsx:35`, `SeatMap.tsx:2966`, ThemeToggle, viewer filter/search heights),
the 32×32 set (management delete/pagination, vertical zoom), and 40-on-one-axis (rail cells
`AppRail.tsx:77` 40×48; `chromeIconBtn` + `after:-inset-1.5` = 40×40 — expansion present,
4px short). Done right: `AccountMenu.tsx:133` (26px monogram + `after:-inset-[9px]` = 44×44),
`DataUtilitiesPanel.tsx:396/450/534` (32px + inset-1.5 = 44×44).

**Guard coverage — spacing:** none. No test pins the grid, the ladder, or the touch minimum;
several source tests explicitly disclaim spacing as free-to-evolve (`app-top-bar:13`,
`reception-source:8`). The axe tiers run WCAG 2.0/2.1 A/AA tags only (`tests/e2e/axe-helpers.ts:13`)
— `target-size` is WCAG 2.2 and never executes, so the 20×20 buttons pass every tier.

---

## 3. Patterns I — interruptions, dialogs, destructive actions

Inventory: **14 dialogs** (all `role="dialog"` + `aria-modal`, zero `window.confirm`, zero
nested), ~20 notification sites (2 on timers), **10 destructive actions** of which 4 are
honestly High-tier (publish — replaces the live map, prior published state unrecoverable
in-app; snapshot restore and reset/discard — replace the whole draft, "cannot be undone,
Undo/Redo history is cleared"; CSV import — bulk-overwrite, borderline High).

What holds (the baseline): **14 of 14 dialogs are user-initiated; 0 system-initiated. 0
nested modals** — the one candidate path is explicitly defused (`AdminManagementPanel.tsx:550-552`
closes the employee form before opening the confirm: "One dialog at a time"). 0 of 14 use
"Submit"/"OK"; 14 of 14 order cancel-left/primary-right; labels name the action. Failure
feedback exists on every destructive flow. Focus mechanics are shared (`useDialogFocus`),
owner-documented, and test-enforced.

**F-INT-1 — 0 of 4 High-tier destructive actions require typing the resource name.**
Publish (`SeatMapDialogs.tsx:327-341`), discard draft (`:401` — its own copy says "This
cannot be undone"), snapshot restore (`DataUtilitiesPanel.tsx:556`), reset-to-published
(`:412`) all confirm with one click after review. No type-the-name interaction exists
anywhere in the codebase. Carbon's High tier ("expensive to recreate, cascades, large
volume") is precisely these four. `bulk-destructive-action-safety-source` pins
review-before-mutate — confirmation *strength* has no guard.

**F-INT-2 — The app's only toast auto-dismisses at 6 s while carrying an action: 1 of 1 action-bearing toasts breaks persist-until-dismissed.**
`SeatMap.tsx:657-661` (`setTimeout(…, 6000)`) with the Undo button rendered inside
(`:3121-3133`). The comment at `:651-656` records the tradeoff deliberately ("don't go stale
during a busy editing session"). It is also the **only success confirmation for publish and
discard** (`usePublishReview.ts:132/:162`) — the two highest-consequence operations get the
most ephemeral confirmation in the app, while CSV import, restore, reset, deactivate and
dept/zone deletes all get *persistent* success banners. The disparity runs the wrong way.
WCAG 2.2.4 concern for the actionable variant. (Undo stays reachable in the toolbar — no
capability lost, vehicle wrong.)

**F-INT-3 — A `role="alert"` auto-dismisses at 15 s: 2 of ~20 notification sites use timers, both in SeatMap.**
`SeatMap.tsx:666-670` — the stale-draft fence warning (explains the page silently refreshed
under the admin) self-dismisses. Critical context on a timer.

**F-INT-4 — Employee-dialog server errors render behind the open modal: 1 of 14 dialogs fails "keep open with inline message on error."**
`AdminManagementPanel.tsx:521-524` → page-level banner at `:773-781`, under the dialog's
fixed z-65 blurred scrim (`:1249`). `aria-live="assertive"` announces it; a sighted admin
sees a dialog that did nothing. Contrast the correct in-dialog pattern:
`SeatMapDialogs.tsx:232-236` (publish error inline + "Retry publish"). Zero field-level
messages / `aria-invalid` in this 5-input form. (Cross-confirmed by the forms audit, §4.)

**F-INT-5 — Two text buttons labelled "Close": 2 of 14 dialogs.**
`DataUtilitiesPanel.tsx:489` (CSV blocking-errors state swaps Cancel → "Close") and
`AskPlannerDrawer.tsx:279-281` (header text button, where every other dialog uses the
CloseIcon control). Doctrine: close is the upper-right icon, never a text button.

**F-INT-6 — AskPlannerDrawer is `aria-modal` for an optional task: 1 of 14 modal surfaces hosts a non-decision, non-focused-task flow.**
`AskPlannerDrawer.tsx:246/258-259` — click-away backdrop, blocks map interaction while an
answer streams. Carbon: non-modal for optional/supporting tasks.

Noted, not counted as violations: the publish dialog's per-seat `role="table"` diff
(`SeatMapDialogs.tsx:256-286`, `max-h-56` scroll, unbounded rows) is read-only
review-before-destructive — sanctioned shape, but the heaviest dialog in the app at
production diff sizes. House style uses padded button rows, not Carbon's full-bleed bottom
edge (14 of 14, consistent). Management deletes skip the row-animate-out but keep both other
halves of the after-pattern (return to list + success notification).

**Guard coverage:** review-before-mutate, dialog focus mechanics, Esc-before-map-modes,
toast placement, publish-review content — all pinned. Findings 1–6 (timers, labels,
confirmation strength, error placement, modality) — **no guard**.

---

## 4. Patterns II — forms, search, filtering, disabled/read-only

Inventory: 11 form surfaces, 5 search surfaces, 1 structured filter UI (admin filter UI
removed by owner ruling 2026-08-20), 156 `disabled`/`pointer-events` occurrences in 17 files.

What holds: duplicate-submit guards on 11 of 11 forms. Search-count discipline is **clean on
all 5 surfaces** — live counts including zero, `aria-live`, magnifier + placeholder + sr-only
labels, no visible labels (`ViewerFindPalette.tsx:281-283`, `ResultsPanel.tsx:84/93`,
`AdminManagementPanel.tsx:975-977`, `ReceptionScreen.tsx:102-104/153`). Keyboard contracts
(Esc layering, ArrowDown hop, Enter honesty gate) are test-pinned. Disabled-done-right is the
norm: reasoned titles on undo/redo, `aria-describedby` on inspector Save, "Fix CSV first",
"Starting up…", delete-is-hidden-not-disabled by ruling.

**F-FRM-1 — Employee-save failure surfaces outside its own dialog** — same defect as F-INT-4,
independently found; 1 of 3 dialog-hosted mutation forms. No guard (`admin-management-panel`
pins the failed-*deactivation* path, whose dialog closes first; not the failed-*save* path).

**F-FRM-2 — UpdatePasswordForm has no field-level validation: 1 of 2 auth forms.**
`UpdatePasswordForm.tsx:20-30` validates at submit only; single banner rendered **below the
submit button** (`:87-100`); no `aria-invalid`/`aria-describedby`; the password-minimum rule
is invisible until failed — contrast LoginForm's always-visible helper
(`LoginForm.tsx:562-563`) and full inline apparatus. Guard: alert announcement only.

**F-FRM-3 — Four inputs have no label of any kind: 4 of ~20 shipped text inputs.**
Department create `AdminManagementPanel.tsx:990` (placeholder-only), zone create `:1049`
(placeholder-only), rename inputs `:1008`/`:1062` (**no label and no placeholder** — a screen
reader announces "edit text"). No guard.

**F-FRM-4 — Minority-marking is absent product-wide: 1 of 11 forms marks anything, and it does so in a placeholder.**
`AdminManagementPanel.tsx:1300` `placeholder="Optional"` on employee email — optionality
conveyed by text that vanishes on input. The form's only required field (Name) is unmarked.
Doctrine: mark the minority, in labels, decided once product-wide. No guard.

**F-FRM-5 — The employee dialog puts the primary on the LEFT: 1 of ~12 button rows breaks the product's own primary-right convention.**
`AdminManagementPanel.tsx:1318-1322` — `Save employee → Cancel → Deactivate`; every other
dialog is cancel-left/primary-right, and the destructive Deactivate trails in the same row.
No guard.

**F-FRM-6 — Unseated people render as disabled buttons on 3 of 3 result-list surfaces — content that still needs reading, in the disabled state.**
Palette browse + query rows are contract #9, owner-ruled, P2-logged and test-pinned as
intended — recorded here as doctrine tension, not re-litigated. The **unruled** third
instance: `ResultsPanel.tsx:131-137` — `disabled` at `opacity-55` with
`title="No assigned seat to open"`, a title a keyboard user can never reach. Under doctrine
these rows are the read-only case (readable at 4.5:1, keyboard-reachable), not disabled. The
ResultsPanel variant has no pin either way.

**F-FRM-7 — The product's only structured filter UI is 4 categories inside a dropdown: 1 of 1.**
`ViewerSeatFinder.tsx:1150-1174` mounts FilterPanel (Department / Position / Zone / Status,
`FilterPanel.tsx:158-228`) in a popover under the Filter trigger. Doctrine: multiple filter
categories never live in a menu or dropdown. Every mitigation doctrine asks of a collapsed
container is present — applied-count on the trigger (`:1129/1141-1142`), chips clearable
without reopening (`:1408`), per-category clears, gated global Clear all
(`FilterPanel.tsx:81-88`), live `aria-live` match count (`:233-237`), instant apply (right
call for one small dataset). The container choice itself is the finding; the mitigations are
pinned (`filter-feedback-source`), the container is not.

**F-FRM-8 — Zero-result states without an actionable next step: 2 of 5 search surfaces.**
Reception (`ReceptionScreen.tsx:156-159` — text only, no clear control; field has no ×) and
management (`AdminManagementPanel.tsx:847-851` — suggestion text, no button, no clear
affordance on the field). Both DO publish the zero count. Compare the palette
("Clear search" button) and ResultsPanel (Clear search / filters / all). Reception tests pin
the message, not an action.

Minor (no guards): login password placeholder restates its label (`LoginForm.tsx:512`);
inspector notes label is sr-only with an essential-feeling placeholder
(`SeatInspector.tsx:1409`); Ask Planner disables its textarea while pending so the user's own
question drops to disabled contrast (`AskPlannerDrawer.tsx:333-334` — read-only is the
doctrine-correct state). Inventory oddity: `DeptChipRow.tsx` has zero call sites — orphaned
by the 2026-08-20 admin-filter removal.

---

## 5. UI shell

Anatomy: two shells exist. Shell routes (`/admin` ×3, `/reception`) get AppTopBar + AppRail
mounted once (`app/(shell)/layout.tsx:25`); the viewer has its own 36px header
(`ViewerSeatFinder.tsx:1101`); **`/my-seat` and `/login` have no shell at all** (`/my-seat`:
a lone back link, no account affordance). Product→global ordering broadly holds on the bar;
hamburger correctly pairs with the collapsible rail.

**F-SH-1 — Draft-vs-published mode is signalled only when the draft is dirty, and only on the map: persistent mode marker on 2 of 5 signed-in surfaces.**
The entire publish cluster is `{publishSummary.hasChanges && …}` (`SeatMap.tsx:2851-2857`,
contract #4 — the no-idle-chip form is an owner ruling; the finding is that mode *identity*
is absent, not that the chip contract is wrong), and the "Draft · N changes" text is
`hidden … lg:inline` (`:2855`). A clean `/admin` shows no "you are editing the draft" marker
anywhere (the h1 is sr-only). Management — where every people edit is invisible to viewers
until publish — says nothing about pending/unpublished state. Settings has the best marker
(one persistent sentence, `settings/page.tsx:90`). Carbon: a draft/published split belongs in
the header, persistently, on every screen. No guard.

**F-SH-2 — Non-production environment indicator: absent on 0 of 7 surfaces — in an app where local dev writes the production database.**
Nothing distinguishes a local `npm run dev` (live Supabase) from the real deployment. The
publish guard exists precisely because this confusion is dangerous; the shell communicates
none of it. No guard.

**F-SH-3 — Account identity is one click away, never persistent: behind the monogram on 6 of 7 surfaces, wholly absent on `/my-seat`.**
Email + role render only inside the opened menu (`AccountMenu.tsx:158-160`) or a hover
`title`. That an identity + sign-out affordance *exists* per surface is guarded
(`auth-session-source:46`); its persistence is not.

**F-SH-4 — URL state: 3 of ~10 restorable UI states survive a reload/share** (zoom excluded
by ruling). Survive: viewer `?seat=`, admin `?seat=`, management `?tab=`. Lost: viewer
search/filters/floor, admin search/showNames/floor, Ask Planner open (`?ask-planner=open` is
honored then stripped, `SeatMap.tsx:601-615` — deliberate entry-only), management
search/sort/selection, reception query/selection (recents in-memory by ruling). No surface
warns state will be lost. The two mirrors have deep-link tests; the gaps have none.

**F-SH-5 — The header name is not a link and is invisible to AT: 0 of 7 surfaces have a linked, exposed header name.**
`AppTopBar.tsx:105` — `aria-hidden` div "Megeredchian Law"; same on the viewer
(`ViewerSeatFinder.tsx:1107`). Carbon: header name links to domain home. No guard.

**F-SH-6 — Utility roster and ordering deltas.** Help is absent on all 7 surfaces (Carbon's
standalone minimum is account + help). The viewer's right group puts product links
(Reception, Viewer/Admin tabs) in the global utility zone (`ViewerSeatFinder.tsx:1307-1371`)
— 1 of 7 surfaces breaks product-left/global-right. Look-level dimension deltas (bar 40px vs
48, rail 208px vs 256, nav items 40px vs 32/48) — recorded; free-to-evolve territory.

**F-SH-7 — No breadcrumbs anywhere: 0 of 2 drill-down pages carry a path above the title.**
Rail `aria-current` + real h1s exist; these are one-level sections under a rail, so the
absence is arguably pattern-appropriate — stated plainly, ranked last.

---

## 6. Keyboard and landmarks (beyond the map's roving tabindex)

What holds: exactly one `<main>` per surface (the `/admin` page div is deliberate —
SeatMap renders the real `<main>`); search landmarks labeled; nav labels unique where two
navs coexist (`AppRail.tsx:245` vs `AdminManagementPanel.tsx:796`); heading hierarchy clean
on all 7 surfaces (one h1 each, no skipped levels); Escape layering consistent and
topmost-first across all ~14 layers, with dialogs-before-map-modes test-pinned
(`accessibility-source:181`) and mid-mutation Esc deliberately held.

**F-KB-1 — Skip link present and first-focusable on 5 of 7 surfaces; absent on `/login` and `/my-seat`.**
Shell ×4 (`AppTopBar.tsx:74-79`, targets verified) and viewer (`ViewerSeatFinder.tsx:1092-1097`)
are guarded (`app-shell:88`, `app-top-bar:72`). The two shell-less surfaces have none — and
`/my-seat` is the phone-first staff page. No guard for the absent two.

**F-KB-2 — Content outside every landmark on 2 of 7 surfaces.**
`SeatMap.tsx:2895` — the sr-only h1 renders in the root div, above `<main>` (`:2975`); the
viewer codifies the opposite rule for itself in a comment (`ViewerSeatFinder.tsx:1380-1382`,
"content outside every landmark trips axe's region rule"). Same class: the `/my-seat` back
link (`SeatSheet.tsx:480`) sits outside `<main>` with no other landmark. No guard.

**F-KB-3 — Deactivate-chain focus restore likely targets a detached node.**
`AdminManagementPanel.tsx:545-553` closes the employee dialog and opens the confirm in one
commit; the confirm's `useDialogFocus` captures `document.activeElement` — the Deactivate
button inside the unmounting dialog. On close, restore no-ops and focus drops to `<body>`.
Uncertain (needs a live check); nothing in tests/ pins this chain. 16 of 17 overlay surfaces
otherwise restore focus correctly (§8.5).

---

## 7. Dark theme parity (structure, not tokens)

Baseline — genuinely designed in dark, recorded, partly test-pinned: the raster lightbox
(`globals.css:560-573`, parity pinned in `theme.test.mjs`), the blur-up riding the same
class, the `#101010` map mat, the Carbon-family background ramp (no pure black, text tops at
`#f4f4f4` — no page-level halation), alpha status washes, designed reception/login blocks,
and elevation-by-border as a *recorded* choice (spec + `globals.css:550`; all ~25 elevated
surfaces verified to pair layer + border).

**F-DK-1 — `/auth/update-password` is broken in dark: light-gray token text on a hardcoded white card.**
`UpdatePasswordForm.tsx:51` `bg-white p-6 shadow-soft` — while the text inside reads theme
tokens that flip to `#f4f4f4`/`#c6c6c6`/`#9a9a9a`. The success/error notices use dark *alpha*
status surfaces — near-invisible washes over white under bright dark-status text. Also the
only surviving `border-[#D8D0C5]` hairline and the only `shadow-soft` consumer. 1 of 1
password-reset surfaces has no coherent dark story: the one surface that is neither designed
dark nor left light — it is half-flipped.

**F-DK-2 — `/my-seat` has no dark treatment, and the dark-mode spec does not record it as light-only.**
`SeatSheet.tsx:16-40` hardcodes the full paper palette (`#E4E1D8`/`#F7F5F0`/ink literals),
zero theme awareness. Defensible as an architect's-sheet conceit — but the spec's scope says
"all surfaces" and its out-of-scope list (spec:154-158) names concepts, the profile column,
the raster re-master, brand orange — not `/my-seat`. A dark-theme user tapping "My seat" gets
a full-screen light page: the flashlight effect at page granularity. 1 of 5 signed-in routes
never got a dark ruling. Unrecorded gap.

**F-DK-3 — Hover direction inverted at 20 of 33 surface-hover sites in dark.**
The dark-correct token exists (`--sp-layer-hover: #262626`, one step *up* from `#1f1f1f`) and
9 sites use it — but 20 use the light idiom `hover:bg-[var(--sp-background)]`
(`FloorSelector.tsx:111`, `Button.tsx:17` secondary, ~10 close/kebab buttons across
SeatMap/SeatInspector/AdminManagementPanel, error/404 buttons): in light, white→`#F7F6F2`
darkens correctly; in dark, `#1f1f1f`→`#161616` — the control sinks below its resting surface
toward the canvas. 4 more sites lighten only by coincidence (`layer-accent`). The hover
vocabulary was inverted-by-token-reuse, not redesigned per theme.

**F-DK-4 — White ink and white glints hardcoded in JSX over fills that dark restyles.**
The dark block states the ink-flip principle for marker glyphs (`globals.css:499` "dark badge
fills brighten … dark ink") — but the danger button recipes hardcode `text-white`
(`Button.tsx:11`, `design-system.tsx:34/41/118`): in dark, `danger-strong` becomes `#fa4d56`
and hover `#ff8389` under unchanged white text — 4 of ~10 white-ink recipes sit on fills that
brighten (the other 6 sit on theme-constant CTA orange, fine by design). Same class:
SeatMarker's literal light-skeuomorphic highlights — `inset_0_1px_0_rgba(255,255,255,0.78–0.82)`
top-glints (`SeatMarker.tsx:340/371/380/418` — the `:418` one is every pill's hover),
`ring-white/90` presence dot (`:578`), `border-white/85` badges (`:585/594/599`) — designed
as paper emboss on white pills; in dark the fills are dark washes and an ~80 %-white 1px line
becomes the brightest element on the marker. No token reaches any of these.

**F-DK-5 — Dialog scrims are one recipe for both themes: 0 of 12 scrims have a dark-designed value.**
All 12 overlays derive 45 % of `--sp-overlay-base` (`#0a0a0a`, no dark override) or
`--sp-chrome-scrim` (goes *darker* in dark) — a near-black wash over a `#161616` canvas is a
far weaker dimming step than the same wash over the light page. Borders + 2px blur do the
separating; the scrim itself was never designed per theme (the spec's elevation section
covers overlay shadows, is silent on scrims).

Minor: `app/global-error.tsx:36` hardcodes the white-card crash screen by literal rather than
by the recorded error-screen ruling (plausibly can't read tokens — noting only);
`markerStateClassRecipes` (`design-system.tsx:211-227`, raw light hex) ships with no
non-concept consumer — prototype residue.

**F-DK-6 — No dark-completeness guard exists.** `zone-completeness.mjs` uses the dark block
as *input* to audit the chrome zone; nothing runs the reverse check (every light-block token
has a dark partner or a recorded reason). The dark block's own "fixwave" comments
(`globals.css:372-537`) document ~8 rounds of hand-found gaps — the class of bug that
produced F-DK-1 and F-DK-4. Residual un-overridden names today are confined to the dormant
admin-marker arm (nothing user-visible), but nothing prevents the next one.

---

## 8. Absences — what does not exist

### 8.1 Loading / pending

Route-level: **8 of 8 segments have a `loading.tsx`** with `role="status"` + sr-only text.
One nit: `/my-seat` and `/login` inherit the root skeleton announcing "Loading the seat
map…" (`app/loading.tsx:17`) — wrong announcement for both.

Action-level — 17 mutating flows: **4 have zero visible pending indication after their
confirm step, and 12 of 17 never tell a screen reader the app is busy** (Carbon: "screen
readers must be told when the app is loading, busy, stuck, or failed").
- No pending state at all: **move to open seat** (`SeatMap.tsx:1944` closes the dialog
  *before* the transition), **create seat** (`:2019` — click canvas, then silence),
  **delete seat** (`:2137`), **vacate** (`:1364`). For the round-trip the UI is
  indistinguishable from "the click did nothing"; a second click is possible on the canvas paths.
- In-flight live regions exist on only 3 flows: inspector save (`SeatInspector.tsx:1092`),
  publish (`SeatMapDialogs.tsx:239`), Ask Planner (`AskPlannerDrawer.tsx:356`). Everything
  else (management ×8, settings ×3, swap, discard, undo/redo) announces only the outcome.
- Partial-only (disabled buttons, unchanged label): swap, employee save, deactivate,
  dept/zone ×4, CSV apply, JSON restore.

### 8.2 Empty states

20 emptyable surfaces: **3 have no empty state at all, 2 render a factually wrong one on
first run, 1 names no next step** — and all five defects are first-run/zero-data states, the
exact condition every surface will be in on launch day before the first publish:
- **ABSENT — viewer map, never published**: no branch on zero seats in `ViewerSeatFinder.tsx`;
  the floor plan renders with no markers and a zeroed band. Nothing says "nothing has been
  published yet."
- **ABSENT — admin map, zero draft seats**: same, `SeatMap.tsx`.
- **ABSENT — palette browse mode, zero people**: eyebrow over an empty list, "0 people"
  (`ViewerFindPalette.tsx:419-499`).
- **WRONG — management first-run**: with zero employees and no query, the only empty branch
  says "No employees match this search" and never points at Add employee
  (`AdminManagementPanel.tsx:847-851`).
- **WRONG — reception first-run**: renders `No one matches ""` with the empty query
  interpolated (`ReceptionScreen.tsx:156-159`).
- **No next step — reception zero-match** (real query): message only (`:157`).
The other 14 are present and mostly good — `/my-seat`'s two are exemplary (name the admin
action), publish-review/history/departments/zones all name next steps, palette query-empty is
test-pinned.

### 8.3 Error states

14 enumerated failure paths: strong baseline (error boundaries ×3 with focus management and
draft-fate copy, test-pinned; MLS02 alert + auto-reload; PUBLISH_BLOCKED routed to a plain
banner; session expiry with a sign-in path; Ask Planner maps every failure class to
what-to-do; auth callback → friendly notice). Two findings:
- **F-ERR-1 — ~5 catch-paths are unactionable in production.** `createSeatAction`
  (`app/actions.ts:338/371/377`) and `deleteSeatAction` (`:803-830`) **throw** expected
  failures despite the file's own returned-not-thrown rule at `:380-384` (thrown Server
  Action errors reach prod as an opaque digest string). Every generic catch prefers
  `error.message` over its written fallback (`SeatMap.tsx:2041/2157`,
  `AdminManagementPanel.tsx:477`, `DataUtilitiesPanel.tsx:138`, `useDraftHistory.ts:177`,
  `usePublishReview.ts:135/165`) — so in prod the user reads Next's digest sentence and the
  friendly copy ("Could not create seat.") is dead code.
- **F-ERR-2 — Silent no-op on confirmed vacate.** `SeatMap.tsx:1365`: if the seat became
  ineligible between opening and confirming, the handler returns after clearing every banner
  — the admin confirmed a destructive action and gets nothing.
Deploy-skew silence is by design (`lib/deploySkew.ts` header) — noted, not a finding.

### 8.4 Success confirmation

**0 absences** — every destructive/major action confirms (publish/discard via the 6 s toast —
vehicle critiqued in F-INT-2; CSV/restore/reset/deactivate/dept/zone via persistent banners;
seat mutations via notices with inline Undo). Deactivate returns to the list per Carbon.

### 8.5 Focus management

**16 of 17 overlay surfaces handled** — shared `useDialogFocus` (initial focus, trap,
restore) is test-enforced per `aria-modal` file; explicit restores exist for the drawer
(`SeatMap.tsx:551-560`), FilterPanel Esc→trigger, palette handoffs (pinned in
`focus-handoff-source`), AccountMenu route-commit recovery, inspector↔marker. The 1: the
deactivate chain (F-KB-3).

---

## 9. Guard map — what covers this territory, and what will recur

| Territory | Guarded today | Not guarded (findings will recur) |
|---|---|---|
| Motion | `motion-safe` on spin/pulse in 6 named files; `map-trail-dash`; JS tween reduced-motion | Durations, curves, `--sp-duration-*` values, transition-site reduced-motion, one-axis/no-overshoot (F-MO-1…5) |
| Spacing | Viewport-height calc pattern; marker pill geometry (exempt zone) | The 8px grid, control ladder, padding-math heights, 44px touch targets — axe tiers run WCAG 2.0/2.1 tags only, `target-size` never executes (F-SP-1…4) |
| Interrupts | Review-before-mutate; dialog focus mechanics + initial focus; Esc-before-modes; toast placement; publish-review content | Timer/action combination, `role="alert"` timers, type-the-name tiers, "Close" labels, drawer modality, error-behind-modal (F-INT-1…6) |
| Forms/search/filter | All 33 login-form invariants; palette contract #9 + keyboard parity + counts; filter live-count; reception messages; review flows | Field-level validation (update-password), label-less dept/zone inputs, minority marking, button order, ResultsPanel disabled rows, empty-state actions (F-FRM-1…8) |
| Shell | Single bar+rail; skip-link-first + slot order; veto contract; rail Esc/scrim; identity+sign-out exists; portal teardown | Mode/env/account persistence, URL-state gaps, header-name link, help utility, viewer utility ordering (F-SH-1…6) |
| Keyboard/landmarks | Esc dialogs-before-modes; roving tabindex; palette focus handoffs; dialog aria-modal pairing; nav label uniqueness (partial) | Skip links on `/login` + `/my-seat`, content-outside-landmarks ×2, heading hierarchy as a whole, deactivate-chain restore (F-KB-1…3) |
| Dark parity | Theme mechanism + raster parity + toggle mounts (`theme.test.mjs`); chrome zone completeness (one direction) | Dark-completeness (reverse direction), hover direction, JSX-hardcoded inks/glints, scrims, per-route dark rulings (F-DK-1…6) |
| Loading/empty/error | Error boundaries; session expiry; stale-draft plumbing; palette/viewer/reception empty *messages*; dialog focus | **Everything else in §8**: `loading.tsx` existence, any pending indication, SR busy announcements, first-run empty states, digest-leak throw sites (F-ERR-1), vacate no-op (F-ERR-2) |

The pattern across all seven sections: the territories previous passes ruled (tokens, markers,
type, focus) are dense with guards and held; the territories this pass opened have almost
none. Per the standing observation in handoff §4 — a finding with no guard behind it will
recur.

---

*Method note: seven parallel read-only sweeps (motion, spacing, interrupts,
forms/search/filter/disabled, shell + keyboard, dark parity, absences), each with the
relevant doctrine embedded; load-bearing claims (overshoot keyframe, duration tokens, both
timers, the white card, the digest rule, hover token direction) re-verified against source
before writing. Two findings were reached independently by two sweeps (error-behind-modal;
the 6 s toast) — reported once each with cross-references. Spacing extraction scripts and the
classified JSON live in the session scratchpad, not the repo.*
