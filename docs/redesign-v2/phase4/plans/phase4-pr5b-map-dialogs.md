# Phase 4 · PR 5b — the map's seven confirm dialogs onto the asset modal (`feat/phase4-map-dialogs`, v1.77.0)

## Context

PHASE2UX §3 (L720) landed "Modal (Move / Swap / Delete confirms) → asset `.cds-modal` — never nested; Cancel left,
primary right" in PR 3; 3b rebuilt the publish review and the inspector but left the seven confirm dialogs on their
Tailwind markup (`rounded-2xl`, `backdrop-blur-2xl`, custom shadows, a `fixed inset-0 z-[90]` overlay with no
handler, per-dialog `useDialogFocus`). PR 5 found them (O-8) and the owner ruled Q-5: their own slice on the PR 4
`CarbonModal` host, v1.77.0, before PR 6 (PHASE4BUILD §1.43, slice-log row 5b). Outcome: one design-system modal on
`/admin` — the asset `.cds-modal` (480, layer-02, 50/50 footer, z 8500, overlay cancels mousedown, `useDialogFocus`
trap/restore, Esc-not-while-busy) — the map's copy, verbs, pending / error contracts and every guardrail test kept.

Owner rulings taken in plan mode (2026-09-07), to be recorded as R-1…R-3 in PHASE4BUILD §1:
- **R-1** all seven on the asset modal via `CarbonModal` (Q-5 as ruled); §1.38's "destructive = narrow tearsheet"
  stays scoped to `/admin/management` — recorded as a dated scope clarification, not a reversal.
- **R-2** the inspector's unsaved-edits guard keeps a **plain** primary (`Save changes`; `Discard` secondary-weight,
  the §1.24 dirty-close rule); **Discard draft changes** gets the **danger** primary (erases saved draft work +
  undo history — §1M.3's danger item). Vacate / Delete seat: danger. Swap / Move / move-conflict: plain primary.
- **R-3** no × on the modal (Cancel · Esc exit, as every design-system container); the three `aria-label`s
  (`Cancel custom seat deletion`, `Cancel swap confirmation`, `Cancel moving employee`) retire.

Record settled without asking: `role="alertdialog"` for the confirms (PHASE3DS §2 L655 "`.cds-modal` + `--danger`
primary, `role=alertdialog`"), `role="dialog"` for the inspector guard (a choice, not an alert — the Management ask is
`alertdialog`; keep `dialog` for the three-button guard: `useDialogFocus` + labelledby unchanged) → **finding, not a
choice**: record which role each carries; floors tagged with the asset `.cds-tag` (D2′); copy verbatim as shipped
(PHASE2UX §1M.6 "shipped copy"); the 50/50 footer is the binding form ("Cancel left, primary right" = the same).

## Inventory → target (all copy, verbs and ids verbatim as shipped)

| # | Today | titleId (kept) | role | Footer (50/50 bleed; secondary first) | Body |
|---|---|---|---|---|---|
| 1 | `VacateConfirmDialog` (`SeatMapDialogs.tsx:47`) | `vacate-seat-confirm-title` | alertdialog | `Cancel` (secondary) · **danger** `Vacate seat` / `Vacating…` / `Retry vacate` | description p (`This clears {name} from this draft seat. {PUBLISH_IMPACT_NOTE}`) · error notification |
| 2 | `DeleteSeatConfirmDialog` (:116) | `delete-seat-confirm-title` | alertdialog | `Cancel` · **danger** `Delete seat` / `Deleting…` / `Retry delete` | description · the static "This removes custom draft seats only…" line as body text (not an error-styled block) · error |
| 3 | `DiscardDraftDialog` (:192) | `discard-draft-title` | alertdialog | `Keep draft changes` · **danger** `Discard everything` / `Discarding…` / `Retry discard` | description (change count) · error — gains the ref + focus the other six have (today a bare `<p role="alert">`) |
| 4 | `InspectorGuardDialog` (:253) | `inspector-unsaved-title` | dialog | `Keep editing` (secondary) · `Discard` (secondary) · **plain primary** `Save changes` — three buttons (amendment F) | description (`Save or discard changes to {seat} before {action}`) |
| 5 | `SwapConfirmDialog` (:302) | `swap-confirm-title` | alertdialog | `Cancel` · plain `Confirm swap` / `Swapping…` / `Retry swap` | gains `aria-describedby` (the "draft seats only" line — today unlabelled) · Source / Target as a two-item list (asset `.cds-modal-body ul`) with `.cds-tag` floor tags · the swap summary line · error |
| 6 | `MoveEmployeeConfirmDialog` (:394) | `move-employee-map-confirm-title` | alertdialog | `Cancel` · plain `Move them` / `Swap them` (+ pending / retry arms) | description (both arms) · swap-arm summary line · error |
| 7 | inspector move-conflict (`SeatInspector.tsx:1412`) | `move-employee-confirm-title` | alertdialog | `Cancel` · plain `Move them` / `Moving…` / `Retry move` | description · `PUBLISH_IMPACT_NOTE` as body text · error (keep the rAF focus from `runSeatAssignment`) |

Error placement contract (dialog-error-placement, all seven): `<div ref={…ErrorRef} tabIndex={-1} role="alert" className="cds-notification cds-notification--error">` inside `.cds-modal-body`, `<strong>{Verb} did not complete.</strong> {actionError}`, focused when `actionError && !pending`, `Retry <verb>` on the primary, Cancel disabled while pending. The `.sp-*` zone override for notifications inside a modal: none needed — `.cds-notification` is 640 max-width inside a 480 modal (auto-fits); keep `margin` default.

## Files

**Modify**
- `components/ui/CarbonModal.tsx` — add `describedBy?: string` (→ `aria-describedby` on the section; the body renders the description `<p id>` itself); keep `footer` as children; add `footerColumns?: 2 | 3` (default 2) → `className="cds-modal-footer sp-modal-footer--3"` for the guard. Nothing else (no ×, no danger variant — the danger lives on the primary button).
- `components/seat-map/SeatMapDialogs.tsx` — six dialogs rebuilt on `<CarbonModal>`: overlay / section / `useDialogFocus` / Esc handler removed (the host owns them); buttons become `cds-btn cds-btn--secondary` · `cds-btn cds-btn--primary|--danger` with `aria-busy={pending}` + `disabled` (the `Button` component and `adminDangerButtonClassName` leave this file); `SeatFloorTag` → `span.cds-tag`; `buildSwapSummary` kept; `PUBLISH_IMPACT_NOTE` kept verbatim. Label expressions kept **character-for-character** (`pending ? "Vacating…" : actionError ? "Retry vacate" : "Vacate seat"` etc. — `pending-state-source` regexes).
- `components/seat-map/SeatInspector.tsx` — the inline move-conflict dialog → `<CarbonModal titleId="move-employee-confirm-title" role="alertdialog" busy={pending} onEscape=…>`; `moveConflictDialogFocusRef` leaves (the host focuses); the `moveConflictErrorRef` + rAF focus stay; the × leaves; heading keeps `Move {formatDisplayName(…)} to {formatSeatCode(selectedSeat.label)}?` (accessibility-source :546 pin).
- `components/seat-map/SeatMap.tsx` — `handleEscape`: the four dialogs without a pending guard (vacate, delete, swap, move) gain `if (!pending)` like discard / publish (CarbonModal already ignores Esc while busy; the window listener must agree — today it would close a Vacate mid-flight). Nothing else.
- `app/styles/sp-components.css` + `docs/redesign-v2/phase3/components/sp-components.css` (lockstep) — **amendment F**, block 13-adjacent: `.cds-modal-footer.sp-modal-footer--3 .cds-btn { flex: 1 1 25% } .cds-modal-footer.sp-modal-footer--3 .cds-btn--primary { flex: 1 1 50% }` — Carbon's documented three-button modal (25 / 25 / 50). One sheet change, **no token change** (contrast line "no token change"; the danger primary's white-on-red-60 pairs are gated since 3b).
- Tests (re-point, never loosen — TEST-TRIAGE rows): `accessibility-source` (the aria-modal↔`DialogFocusRef` pairing loop: `SeatMapDialogs.tsx` and `SeatInspector.tsx` no longer host `aria-modal` — the host does; the loop's file list → the current containers, `CarbonModal` already in it; the `z-[90][\s\S]*sm:z-[70]` look-pin on SeatInspector retires; `Cancel custom seat deletion` pin → the dialog's `Cancel`), `touch-target-source` (the two `after:-inset-1.5` × pins leave with the ×), `tailwind-arbitrary-alpha-source` (the "focus-visible:outline-none after role=dialog" scan: SeatMapDialogs no longer contains `role="dialog"` — the scan passes vacuously; add `CarbonModal.tsx` to its file list so the guard still bites), `dialog-error-placement` (census: titleIds unchanged → registry unchanged; the ct cases unchanged — they assert roles / names / focus, not classes; **add** `aria-describedby` presence for the seven), `dialog-initial-focus` (first control = `Cancel` — CarbonModal's secondary-first footer keeps it), `seat-creation-ui-source` (the two Delete copy pins stay verbatim), `bulk-destructive-action-safety-source` (`aria-labelledby="discard-draft-title"` → the host renders it: pin becomes `titleId="discard-draft-title"`), `seat-map-escape-source` (+ the four new pending guards), e2e-auth `draft-dialogs.spec.ts` (`Cancel moving employee` → the dialog's `Cancel`; the `.include('section[aria-labelledby="move-employee-confirm-title"]')` axe scope → `[aria-labelledby=…]` still true on the host section — unchanged), browser `seat-map.spec.ts` (`#inspector-unsaved-title` attached — unchanged), `pending-state-source` (label regexes unchanged; the participle registry rows unchanged).
- Docs: PHASE4BUILD §1.47 (PR 5b — the rulings R-1…R-3, amendment F, the Esc-guard fix, the role finding), §2 (no open row — add a "PR 3 landing discharged" line under P3-17's neighbour or a new row **P2-3b / O-8** "map confirm dialogs → asset modal — done (PR 5b)"), §3 PR 5b row, §4 line (no token change), slice-log row 5b; PHASE3DS §1.17 amendment paragraph (the map's confirms built on the asset modal; amendment F) + §2 L639 built; PHASE2UX §3 L720 built line, §1M.6 "confirm dialogs stay modal" built; DECISIONS D2 line ("the confirm dialogs are the asset modal, PR 5b") + §1.38 scope note; TEST-TRIAGE "PR 5b outcomes".

**Create**
- `docs/redesign-v2/phase4/plans/phase4-pr5b-map-dialogs.md` (this plan, Task 0) · `screenshots/pr5b/README.md` ·
  `audit/pr5b-dialogs.mjs` (the rig: drives each of the seven on the local Docker stack, both themes, captures +
  computed values: `.cds-modal` bg layer-02, 480 wide, footer 64 with 50/50 (25/25/50 on the guard), the primary's
  bg = `--sp-button-primary` / `--sp-button-danger`, the error notification inside the open dialog with focus in it,
  Esc ignored while busy — via the browser-tier action stubs or a slow-RPC double on the stack).

**Delete** nothing; `components/ui/Button.tsx` keeps its other consumers.

## Reuse
- `components/ui/CarbonModal.tsx` (host, overlay mousedown cancel, `useDialogFocus`, Esc-not-while-busy) — the two PR 4 consumers `OptionCreateModal.tsx` / `AdminManagementPanel.tsx:695` are the markup model.
- `lib/copy.ts` `PUBLISH_IMPACT_NOTE`; `lib/formatName.ts` `formatSeatCode` / `formatDisplayName`; `SeatMapDialogs.tsx` `buildSwapSummary`, `seatPersonLabel`; `components/seat-map/CanvasStatus.tsx` `NotificationGlyph` for the error notification's glyph.
- The asset `.cds-modal*` (carbon-components.css :443–452), `.cds-btn--danger` (:146), `.cds-tag`, `.cds-notification--error`.

## Task order (each = its own test cycle + commit on `feat/phase4-map-dialogs`)
0. Branch; save this plan as `docs/redesign-v2/phase4/plans/phase4-pr5b-map-dialogs.md`; commit.
1. `CarbonModal` `describedBy` + `footerColumns`; amendment F (both copies) + PHASE3DS paragraph; token test green (byte-identical).
2. `SeatMapDialogs.tsx` — the six dialogs (write / re-point the ct in `dialog-error-placement` + `dialog-initial-focus` first: `aria-describedby`, alertdialog roles, footer buttons by role/name — they should fail on the old markup only where the new contract is asserted); `SeatMap.tsx` Esc guards + `seat-map-escape-source`.
3. `SeatInspector.tsx` move-conflict on the host; `accessibility-source` / `touch-target-source` / `tailwind-arbitrary-alpha-source` / `bulk-destructive-action-safety-source` re-points.
4. e2e-auth `draft-dialogs.spec.ts` + browser tier re-points; `npm run test:browser` (Playwright CT) if the local Chromium serves it (PR 5 installed it) — else CI.
5. Rig + captures on the Docker stack (`db:start` + `db:seed`, unsandboxed build/start, port freed by PID; reset + reseed before e2e-auth); runtime audit `/admin` both themes (0 undefined); contrast rerun (no token change); README with provenance.
6. Docs (item above) + §1.47; PR body: scope, R-1…R-3, the findings, the gate block, preview link + walk-only warning.
7. Stop: gate output + preview link; the reviewer's smoke, then the PR opens; on "merge" → squash, tag **v1.77.0** ("Phase 4 PR 5b — map confirm dialogs on the asset modal"), branch pruned, PHASE4BUILD "merged (v1.77.0)"; PR 6 becomes v2.0.0 after it.

## Verification
- `npm test` · `npm run test:ct` (dialog-error-placement, dialog-initial-focus, seat-inspector, seat-map-components) · `npm run gate` · `npm run build` (unsandboxed) · `npm run test:e2e` · `npm run test:browser` · `npm run test:e2e:auth` (draft-dialogs: all seven dialogs opened + axe, Delete X99 for real, cancel paths) — 0 fail; the two known environment-only failures excluded only where documented.
- Rig on the stack: every dialog both themes; computed: modal bg `rgb(255,255,255)` light / `rgb(57,57,57)` dark, width 480, footer buttons 50/50 (guard 25/25/50), primary `rgb(184,92,46)` plain / red-60 danger with white label, focus lands on Cancel, overlay mousedown keeps focus in the dialog, Esc closes only when not busy, error notification inside with focus.
- Greps: `grep -rn "rounded-2xl\|backdrop-blur\|z-\[90\]" components/seat-map/SeatMapDialogs.tsx components/seat-map/SeatInspector.tsx` → nothing; `grep -rn "aria-label=\"Cancel .* confirmation\|Cancel custom seat deletion\|Cancel moving employee" components tests` → nothing; `0f62fe` → only `carbon-tokens.css`.
- Brand: the danger primary is Carbon red-60 (status, not brand — gated pairs since 3b); the plain primary terracotta; no blue.
