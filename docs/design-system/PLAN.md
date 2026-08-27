# PLAN.md — the staged plan for the rest of the design-system adoption

**Written 2026-08-26**, app at **v1.64.0** (live `/api/build-id` = `d7ac640`, verified same day). Companion to `AUDIT.md` / `PASS1-TOKENS.md` / `AUDIT-2.md` / `READ-PATH-ASSESSMENT.md` / `PALETTE-ASSESSMENT.md` and `SEAT-PLANNER-HANDOFF.md`. AUDIT-2 ranks findings but sequences nothing — **this document is the sequence.** Reviewed and ruled **2026-08-26** (PR #472 review): structure accepted; Stage-2 rulings **R1–R4 recorded below**, R5 principle ruled with the value deferred. PR-2 gets its own brief after this merges.

Position-statement verification (per the brief): checked against the repo and the live deployment — **accurate as written, no corrections**. Pass 1 complete and prod-verified #434–#447 (handoff §2), seven guards (handoff §4), F1–F8 closed 2026-08-25 (`READ-PATH-ASSESSMENT.md` ranked table); AUDIT-2 §0 items 1 and 3 closed by #471 v1.64.0, item 6 partial (single-flight closed, pending + SR busy open), items 2/4/5/7/8/9/10 open with no guard (AUDIT-2 §0/§9); readiness 5 of 6 boxes, the open one a product decision (handoff §10).

---

## The status board

Update the `classDef` assignments **in the same commit as every PR that lands** — a stale board is worse than none. One deliberate deviation from the brief's starting diagram: **PR-2 is `todo`, not `wip`** — it is queued next (handoff §5) but has no branch and no PR, and this board records fact, not intent.

```mermaid
flowchart TD
  classDef done stroke-width:3px,stroke:#24a148
  classDef wip stroke-width:3px,stroke-dasharray:6 3,stroke:#f1c21b
  classDef todo stroke-width:1px,stroke:#8d8d8d

  S1[Stage 1 · Research & discovery<br/>AUDIT · PASS1 · AUDIT-2 · READ-PATH · PALETTE]:::done
  S2[Stage 2 · Design rulings]:::wip
  S3[Stage 3 · Development]:::wip
  S4[Stage 4 · QA gate + post-arc re-count]:::todo
  S5[Stage 5 · First users]:::todo
  S6[Stage 6 · Maintenance]:::todo

  S1 --> S2 --> S3 --> S4 --> S5 --> S6

  subgraph P1[Pass 1 — complete v1.61.0]
    A[#434–#440 tokens · twins · zone · markers]:::done --> B[#443/#445 publish guard]:::done --> C[#444/#446/#447 type floor]:::done
  end

  subgraph P2[Pass 2 — in progress]
    PR1[PR-1 #471 errors · empty states]:::done
    PR2[PR-2 #474 touch targets]:::done
    PR3[PR-3 #475 update-password dark]:::done
    PR4[PR-4 #476 error behind modal]:::done
    PR5[PR-5 pending + SR busy · queued next]:::todo
    R1{Ruling: destructive tiers}:::done --> PR6[PR-6 type-the-name · toast]:::todo
    R2{Ruling: sense of place}:::done --> PR7[PR-7 draft · env · identity]:::todo
    R3{Ruling: motion scale}:::done --> PR8a[PR-8a motion tokens · mechanical]:::todo --> PR8b[PR-8b timing default · site migration]:::todo --> PR8c[PR-8c motion sites · reduced-motion]:::todo
    R4{Ruling: dark hover}:::done --> PR9a[PR-9a dark hover sweep]:::todo
    R5{Ruling: greige hairlines}:::wip --> PR11[PR-11 long tail]:::todo
    PR9b[PR-9b JSX inks · glints]:::todo
    PR10[PR-10 guard-only]:::todo
    PR1 --> PR2 --> PR3 --> PR4 --> PR5
  end

  P1 --> P2
  S2 -. rulings feed .-> R1 & R2 & R3 & R4 & R5
  PR6 & PR7 & PR8b --> GATE{{Vocabulary-changing PRs<br/>land before first users}}:::todo --> S5
```

| PR | Stage | Findings | Status | Tag |
|---|---|---|---|---|
| Pass 1 (#434–#447) | 1–3 | tokens · twins · zone · markers · type floor · focus · publish guard | **done** | v1.61.0 |
| PR-1 (#471) | 3 | AUDIT-2 §0 items 1, 3, part of 6 | **done** | v1.64.0 |
| R1 ruling — destructive tiers | 2 | F-INT-1/2 | **ruled 2026-08-26** | — |
| R2 ruling — sense of place | 2 | F-SH-1/2/3 | **ruled 2026-08-26** | — |
| R3 ruling — motion scale | 2 | F-MO-4/5 | **ruled 2026-08-26** | — |
| R4 ruling — dark hover direction | 2 | F-DK-3 | **ruled 2026-08-26** | — |
| R5 ruling — greige hairlines | 2 | handoff §9 parked | in progress — principle ruled, value deferred to the PR-11 brief's measurement report | — |
| PR-2 touch targets (#474) | 3 | F-SP-4 (+ 28px family of F-SP-3) | **done** — 54 of 58 specs expanded to 44 or ledgered under the no-overlap rule | v1.65.0 |
| PR-3 update-password dark (#475) | 3 | F-DK-1 | **done** — last pre-token auth surface joins the login vocabulary; `#D8D0C5` instance deleted (R5 value still open) | v1.66.0 |
| PR-4 error-behind-modal (#476) | 3 | F-INT-4 / F-FRM-1 | **done** — 2 of 14 fixed (employee form + swap thrown path); 5 closes-before-resolve dialogs ledgered to PR-5; registry guard classifies all 14 | v1.67.0 |
| PR-5 pending + SR busy | 3 | §8.1 remainder of §0 item 6 | not started — **queued next** (the guard's closes-before-resolve ledger lists its five dialogs) | — |
| PR-6 destructive tiers + toast | 3 | F-INT-1/2 | not started · R1 ruled — unblocked | — |
| PR-7 sense of place | 3 | F-SH-1/2/3 | not started · R2 ruled — unblocked | — |
| PR-8a motion tokens (mechanical) | 3 | F-MO-5 values | not started · R3 ruled — unblocked | — |
| PR-8b timing default + site migration (design) | 3 | F-MO-4/5 | not started · after PR-8a | — |
| PR-8c motion sites | 3 | F-MO-1/2/3 | not started · after PR-8b | — |
| PR-9a dark hover sweep | 3 | F-DK-3 | not started · R4 ruled — unblocked | — |
| PR-9b JSX inks/glints | 3 | F-DK-4 | not started | — |
| PR-10 guard-only | 3 | §0 item 10, handoff §4, axe `target-size` assessment | not started | — |
| PR-11 long tail | 3 | F-SH-4/5/6 · F-KB-1/2/3 · F-FRM-2…8 · F-SP-1/2 · §9 doc errors · greige hairlines | not started | — |

---

## Stage 1 — Research & discovery

- **Entry:** Pass-1 arc complete (v1.61.0).
- **Deliverables (all shipped):** `AUDIT.md` (Pass 1), `PASS1-TOKENS.md`, `AUDIT-2.md` (#470, corrected same day against the fixed Carbon scale), `READ-PATH-ASSESSMENT.md` (#450), `PALETTE-ASSESSMENT.md` (#457), `DOCS-DIFF.md` (skill-refresh baseline).
- **Exit:** every shipped surface audited across motion, spacing, patterns, shell, keyboard, dark parity, and absences; findings ranked (AUDIT-2 §0) and guard-mapped (§9).
- **Guard added:** none — reports, not code.
- **Status: done** — last artifact 2026-08-26 (#470).

One discovery item remains open, already scoped: the handoff §4 **circumstantial-allowlist weakness** (allowlist reasons that are claims about today's component tree go stale silently — the `--sp-surface-disabled` incident). The fix is categorization + mechanical verification and is homed in **PR-10**. Nothing new to research; this stage does not reopen.

## Stage 2 — UI/UX design (rulings)

- **Entry:** this plan ruled.
- **Deliverables:** five rulings. They live **here** — the handoff §3/§8 ledger entry ships with each implementing PR, not with this document.
- **Exit:** each item below carries an owner/reviewer decision; its Stage-3 PR is then unblocked.
- **Guard added:** none at this stage — each ruling's guard ships with its PR.
- **Status:** **R1–R4 ruled 2026-08-26** (PR #472 review); **R5 principle ruled, value deferred** to the measurement report in the PR-11 brief.

These needed ruling **before code** because they change visual vocabulary (free now, expensive after first users) or product behavior. Each section: the measured basis, then the ruling.

**R1 — Destructive tiers + toast timer (F-INT-1/2).** Basis: 0 of the 4 High-tier destructive actions require typing the resource name (AUDIT-2 §3) — publish, discard draft ("This cannot be undone"), snapshot restore, reset-to-published; CSV import is borderline. The app's only toast auto-dismisses at 6 s while carrying Undo (`SeatMap.tsx:657-661`, `:3121-3133`) and is the **only** success confirmation for publish and discard, while CSV/restore/reset/deactivate get persistent banners.

**RULED 2026-08-26: type-the-name on all four** — publish, discard draft, snapshot restore, reset-to-published. Tier is set by consequence, not by the quality of the preview; a persistent toast confirms publish, it does not recover the prior published state. The typed string is the short base name (e.g. the floor/base name), never a path. **CSV import is Moderate** — confirm with the consequences spelled out, and the confirm must state the row count it overwrites. Toast: **persist-until-dismissed, Undo stays on it.**

**R2 — Sense of place: draft marker, environment indicator, identity (F-SH-1/2/3).** Basis: mode identity is persistent on 2 of 5 signed-in surfaces (clean `/admin` shows nothing; the "Draft · N changes" text is `hidden … lg:inline`, `SeatMap.tsx:2855`); an environment indicator exists on 0 of 7 surfaces in an app where local dev writes the production database; identity is behind a click on 6 of 7 (`AccountMenu.tsx:158-160`).

**RULED 2026-08-26: all three land in the top bar, one placement decision, product-left / global-right (the F-SH-6 rule).**
- **Left cluster:** product name · **mode tag** — "Draft" on `/admin`, management, settings, always visible, not gated on `hasChanges`. Viewer surfaces carry **no** tag: absence is the published default, not a status.
- **Right cluster:** **environment tag** (only when the deployment cannot attest `VERCEL_ENV === "production"` — same attestation as `lib/publishGuard.ts`) · identity text · monogram. The env tag is warning-family with icon + text ("Local dev — writes production"); it is global, so it sits right.
- **Identity:** email as persistent text at ≥lg, monogram-only below. Role stays in the menu.
- Tags are **24px** inside the 40px bar. No new colour beyond the warning family already in the vocabulary.

**R3 — Motion scale (F-MO-4/5).** Basis: current scale `--sp-duration-fast/standard/deliberate` = 150/200/280 ms (`app/globals.css:139-141`) — only 150 is on Carbon's table; ~96 % of ~120 eased sites run an off-Carbon curve because `tailwind.config.ts` defines no `transitionTimingFunction`, so bare `transition-*` resolves to Tailwind's `cubic-bezier(0.4,0,0.2,1)`; Button/IconButton hover feedback runs 200 ms against Carbon's fast-01 **70 ms** budget.

**RULED 2026-08-26: Carbon's six stops accepted, with a split that protects the no-op proof** — adding a Tailwind default `transitionTimingFunction` moves ~100 computed curves at once, which is a value change, not a token addition:
- **PR-8a (mechanical):** add six new tokens named for Carbon roles (`--sp-motion-fast-01` … `--sp-motion-slow-02`) with Carbon values (70/110/150/240/400/700), **unused**; old `--sp-duration-*` untouched. `resolved-map` proves nothing moved. Guard: test pins the six values.
- **PR-8b (design):** Tailwind timing default → productive-standard `cubic-bezier(.2,0,.38,.9)` with named entrance/exit variants; migrate sites to the new tokens; delete the three old tokens last. Live pass both themes. Guard: pins the Tailwind default; no `--sp-duration-*` references remain.
- **PR-8c (design):** reduced-motion on transitions, kill `sp-chip-pop`, one-axis entrances. Guard: no keyframe past 100 %; no transition without `motion-reduce:`.
- The Stage-5 vocabulary gate sits on **PR-8b** — that is where the feel changes.

**R4 — Dark hover direction (F-DK-3).** Basis: in dark, 20 of 33 surface-hover sites reuse the light idiom `hover:bg-[var(--sp-background)]`, sinking controls below their resting surface (`#1f1f1f` → `#161616`); the dark-correct token already exists and 9 sites use it (`--sp-layer-hover: #262626`, one step *up*).

**RULED 2026-08-26: hover lightens in dark.** All surface hover goes through `--sp-layer-hover` (or a sibling role token), never `--sp-background`. PR-9 splits: **9a** hover-direction sweep (class swap, value moves, live pass); **9b** hardcoded JSX inks/glints (F-DK-4). Two concerns, two PRs.

**R5 — The four greige hairlines (handoff §9, parked → un-parked here).** Basis: four near-identical greige border values survive from the pre-token era (the last `border-[#D8D0C5]` literal lives in `UpdatePasswordForm.tsx`, F-DK-1's surface).

**PRINCIPLE RULED 2026-08-26, value deferred: collapse to one border role token.** Before the value is picked, the four hexes get listed with file:line and each measured against `layer-01` **and** the hover surface, in both themes — if a hairline ever separates interactive rows it needs 3:1 on hover; if purely decorative, no floor. That measurement report goes in the **PR-11 brief**, not here. Fix lands in PR-11 (PR-3 removes the update-password instance in passing).

## Stage 3 — App development (the PR arc)

- **Entry per PR:** its ruling (where one is listed) is recorded; the preceding unblocked PR is merged or independent.
- **Deliverables:** PR-2 … PR-11 below.
- **Exit:** all AUDIT-2 §0 items closed or explicitly re-parked; every territory in the §9 guard map has a pin.
- **Status: in progress** — PR-1 shipped (#471, v1.64.0); PR-2 shipped (#474, v1.65.0); PR-3 shipped (#475, v1.66.0); PR-4 shipped (#476, v1.67.0); PR-5 queued next.

The reviewer's proposed order, validated against the repo — **it stands, no reorder**. R1–R4 were ruled with the plan review itself (2026-08-26), so PR-6/7/8a are already unblocked and can interleave with PR-2…PR-5 rather than queue behind them.

| PR | Scope | Findings | Guard shipped with it |
|---|---|---|---|
| PR-1 | **done #471 v1.64.0** — prod-safe error paths, single-flight, first-run states | §0 items 1, 3, part of 6 | `action-error-contract-source`, `client-action-error`, ct/source guards on all five empty states |
| PR-2 | **done #474 v1.65.0** — 44px hit expansion off the map canvas, no-overlap rule, adjacency-capped ledger | F-SP-4 (absorbs the 28px family of F-SP-3) | `touch-target-source` — arithmetic scan (reach = size + insets ≥ 44), reach-floored ledger, expansion pins (axe `target-size` enablement stays in PR-10) |
| PR-3 | `/auth/update-password` dark theme | F-DK-1 | dark-completeness reverse-direction check |
| PR-4 | Error-behind-modal | F-INT-4 / F-FRM-1 | ct test: server error visible inside the open dialog |
| PR-5 | Pending indication + SR busy on all 17 mutating flows | §8.1 remainder of §0 item 6 | source test: every mutating flow has a live region + pending UI |
| PR-6 | Destructive tiers + toast timer | F-INT-1/2 (after R1) | source test: High-tier confirm requires typed name; no `role="alert"` on a timer with an action |
| PR-7 | Sense of place — draft marker, env indicator, identity | F-SH-1/2/3 (after R2) | source test: marker present on every admin surface; env indicator when not `VERCEL_ENV=production` |
| PR-8a | Motion tokens — **mechanical**: six Carbon-role tokens (`--sp-motion-fast-01`…`-slow-02`), added unused; old `--sp-duration-*` untouched | F-MO-5 values (R3 ruled) | test pins the six values; `resolved-map` proves nothing moved |
| PR-8b | **Design**: Tailwind timing default → productive-standard + entrance/exit variants; migrate sites to the new tokens; delete old tokens last | F-MO-4/5 (R3 ruled) | pins the Tailwind default; no `--sp-duration-*` references remain |
| PR-8c | Motion sites — reduced-motion on transitions, kill `sp-chip-pop` bounce, one-axis entrances | F-MO-1/2/3 | regex: no keyframe travels past 100%; no transition without `motion-reduce:` |
| PR-9a | Dark hover-direction sweep — surface hover through `--sp-layer-hover`, never `--sp-background` | F-DK-3 (R4 ruled) | scan: no `hover:bg-[var(--sp-background)]`; live pass both themes |
| PR-9b | Hardcoded JSX inks/glints | F-DK-4 | scan: no `text-white`/`#fff` literals in JSX over theme-flipped fills |
| PR-10 | Guard-only: 8px grid + control ladder scan; circumstantial-allowlist categories; assess + enable axe `target-size` (WCAG 2.2) | §0 item 10, handoff §4 | the guards *are* the PR |
| PR-11 | Long tail: F-SH-4/5/6, F-KB-1/2/3, F-FRM-2…8, F-SP-1/2 drift, §9 parked doc errors, greige hairlines (R5 value from the brief's measurement report) | — | per item |

**Rules that hold across every PR:**

- One PR = one concern.
- Mechanical changes (renames, no-value-moves) and design changes (value moves) go in **separate PRs** — the rename PR's only cheap check is that no computed value moved (handoff §8).
- Every fix ships its guard **in the same PR**.
- Anything that changes *which elements get which classes* needs a **live visual pass in both themes** regardless of suite colour — `resolved-map`/`dangling-refs` read CSS and cannot see the DOM (handoff §8).

## Stage 4 — Testing & QA

- **Entry:** runs per-PR from PR-2 onward; the post-arc re-count runs once PR-11 merges.
- **Deliverables:** the per-PR gate below; one post-arc re-count appended to `AUDIT-2.md` (or a companion note).
- **Exit:** every AUDIT-2 inventory proportion re-measured and at its target.
- **Guard added:** the gate itself is process; the re-count verifies the guards shipped in Stage 3.
- **Status: not started** (gate applies from the next PR).

**Per-PR gate — all five, every PR:**

1. `npm test` green, **including the PR's new guard**.
2. The seven Pass-1 guards untouched (`dangling-refs`, `resolved-map`, `zone-completeness`, paired-marker scan, `marker-contrast`, `desktop-seat-marker-system-source`, `type-floor-source` — handoff §4).
3. Axe tiers pass — as configured today (WCAG 2.0/2.1 tags; `target-size` joins the tiers via PR-10 after its fallout assessment).
4. Live visual pass, light **and** dark (build/typecheck/tests are not visual verification).
5. `/api/build-id` matches the merged SHA after deploy.

**Post-arc QA — re-run the AUDIT-2 inventories and record the new proportions against the original frame.** "20 of 33 hover sites" becomes "0 of 33" or it isn't done:

| Inventory (AUDIT-2 frame) | Was | Target |
|---|---|---|
| Transition sites without `motion-reduce:` | ~100 of ~106 | 0 (or a ruled exemption list) |
| Eased sites off-curve | ~96 % of ~120 | 0 |
| Interactive specs <44px without hit-expansion | ~17 of ~21 (measured 54 of 58 in the PR-2 sweep) | 0 — **reached #474** (44, or ledgered adjacency-capped reach) |
| Dark surface-hover sites sinking | 20 of 33 | 0 |
| Mutating flows without pending UI / SR busy | 4 / 12 of 17 | 0 / 0 |
| High-tier actions without their ruled confirmation strength | 4 of 4 | 0 |
| Spacing buckets (172 occurrences, 51 % exempt) | 34 % near-miss / 8 % off-system | re-measured, recorded |

## Stage 5 — Deployment & launch

- **Entry:** handoff §10's last box — **a decision about who goes first and what to learn from them.** A product decision, not design work; nothing in this plan produces it.
- **Deliverables:** none new — deployment is **continuous**: merge to `main` auto-applies migrations and deploys via Vercel (there is no release process to invent). "Launch" means **first users**.
- **Exit:** first users in the app.
- **Guard added:** none.
- **Status: not started.**

**Vocabulary-changing PRs that should land before first users** (visual vocabulary is free now, expensive after): **PR-6** (confirmation strength), **PR-7** (header vocabulary), **PR-8b** (motion feel — the gate sits on 8b, not 8a, because the mechanical token addition changes nothing the user sees). Everything else — including PR-8c's site sweep, PR-9a/9b, PR-10, PR-11 — can follow with users present.

## Stage 6 — Maintenance & support

- **Entry:** continuous from now; formally the steady state after Stage 5.
- **Deliverables / practices:**
  - **Skill refresh cadence** — handoff §11 method: diff `feature-flags.yml` between `@carbon/react` tags, read release bodies for intervening minors only; `DOCS-DIFF.md` is the baseline. Footer dates on the docs sites are build stamps, never evidence (two confirmed false alarms).
  - **v12 stance** — keep the semantic token layer clean (`--sp-*` role names over Carbon tokens over raw values): the `@carbon/upgrade` codemod operates on that layer; a clean layer *is* the migration preparation.
  - **§9 parked list, with an owner each:** circumstantial-allowlist verification → **PR-10** (leaves the parked list); greige hairlines → **R5 + PR-11** (leaves the parked list); arbitrary spacing values (172-occurrence frame, corrected from "442") → stays parked, maintenance-only, re-counted in Stage 4's post-arc QA; `--admin-diff-vacated-text` / `--admin-paper` / §3.7 reception-row doc errors → **PR-11**.
  - **Handoff update reflex** — update `SEAT-PLANNER-HANDOFF.md` on every tag, same reflex as `/api/build-id` verification; this plan's status board updates in the same commit as every PR that lands.
- **Exit:** none — this stage is the steady state.
- **Status: practices already in force; formal stage begins after Stage 5.**
