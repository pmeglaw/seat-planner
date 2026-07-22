# Critique — Seat Planner UX Review CL (v0.2) as a Claude Code hand-off

**Reviewer:** Claude (Cowork) · **For:** Patrick · **Date:** 2026-07-21
**Subject:** `Seat-Planner-UX-Review-CL_1.md` (v0.2)
**Companion:** `docs/CLAUDE-CODE-HANDOFF-ux-review.md` (the corrected, executable hand-off)

## Bottom line

Strong plan, wrong on one load-bearing premise. The method (two co-equal tracks, 10-category rubric, gates, hard-constraint awareness) is genuinely good. But as written it would send a fresh Claude Code session to review the **wrong target** against **no design baseline** — when your repo actually contains a **locked design spec, a committed prototype, and a current (2026-07-15) critique + fix backlog** that are *not* stale. Fix four things and it's an excellent hand-off. I've written the corrected version as the companion file.

Everything below is ground-truthed against the repo at `main` (`v1.10.0`, last commit 2026-07-21).

## What's strong — keep as-is

- **Two co-equal surfaces** (Admin ~11 / User 100+) with the **publish hinge** named as the highest-stakes probe. That's the right spine — the User surface only ever shows *published* state, so admin publish-comprehension failures become wrong info for 100+ people.
- **Rubric + protocol:** 10 categories A–F per track, two GPAs side-by-side, severity scale, click-level think-aloud. Defensible, not taste-driven.
- **Hard constraints are real and correctly named** — SVG-locked raster, normalized calibration transform, source-tests + coverage floors. All verified.
- **Gate 1 (before prototype) and Gate 2 (before code).** Correct shape for a redesign.
- Routes, access model, and the deliverables index are accurate.

## What's wrong or risky — fix before hand-off

### 1. "All prior work is stale / no baseline" is false — the biggest risk (§0, §3a, §7)

The rebuild is real, but the repo holds current, non-stale design artifacts the plan tells the executor to ignore:

- **`docs/DESIGN_DIRECTION.md`** (2026-07-10) — a design **"locked with the owner via an interactive prototype,"** self-described as superseding all earlier directions. It is the spec the build implements (Carbon visual language, IBM Plex, `--sp-*` tokens, SeatMarker protected, presentation-layer only).
- **`docs/ui/seat-planner-shell.html`** — the committed prototype it names as visual source of truth.
- **`output/ui-ux-critique-2026-07-15/report.md`** (2026-07-15, 232 lines) — a critique from **six days before your review**, clearly post-rebuild, with `_kept.txt` / `_refuted.txt` beside it.
- **`docs/superpowers/plans/2026-07-15-critique-top8.md`** — last touched **2026-07-20** (the day before your doc): a live 8-item fix backlog carrying the exact constraints. The plan lists it as "stale — 2026-07-15." It's the current backlog.
- **`app/globals.css`** already ships **120 `--sp-` tokens with measured contrast ratios.** There is a live design system to review against — not a blank slate.

**Risk if unfixed:** the executor grades cold, "discovers" issues already in the top-8 plan, and may propose a redesign that contradicts a direction you already locked — wasting the run and risking regressions to the token system. **Reframe** from "ignore everything, fresh eyes, no baseline" to "fresh eyes on *behavior*, but reconcile every finding against the locked design system + the 07-15 critique/backlog; challenge them only with evidence, and flag conflicts rather than silently overriding."

### 2. The plan never pins WHAT is being reviewed

Prod (`main`, `v1.10.0`, last commit today) is one thing. The "Shell/Carbon" direction in `DESIGN_DIRECTION.md` was last handed off on an **unpushed `redesign/carbon-shell` branch that no longer exists locally** (only `main` remains), and `main` currently ships a **warm-copper** `--sp-*` palette — not the dark Carbon shell the spec describes. So it's genuinely unclear whether the Shell direction shipped, was superseded, or is pending. The executor must **reconcile this on day one**, not assume. The hand-off makes "state shipped-vs-locked in one paragraph" an explicit Step 0.

### 3. The "executor memory" lists aren't memory — they're files (§3a, §7)

The plan leans on three lists (rejected-directions / refuted-findings / intentional-by-design) held in "the executor's memory." A fresh Claude Code session has no such memory. They exist as **files**: `output/ui-ux-critique-2026-07-15/_kept.txt` and `_refuted.txt` (plus `prod-verify/`). Point the executor at the files.

### 4. A real Admin job is missing — cluster-by-position into zones

Your own answer: supervisors want employees grouped by **position** (all Case Managers in one zone, Assistant Case Managers in another). The schema supports it (`employees.position`, `seats.zone`). This is a core Admin workflow the review must probe — *can an admin see position, group seats by it, and bulk-assign a zone?* — and a likely redesign target. It wasn't in the plan's §4 job list. It's baked into the hand-off.

## Minor corrections — folded into the hand-off

- **§3a line counts/dates are understated ~30%** (god-pass 485→617, ux-audit 119→152; the superpowers plan 342/07-15 → 440/07-20). Cosmetic, but the table wasn't ground-truthed.
- **Version:** "v1.4.x → v1.10.0" is the git-tag/doc scheme; `package.json` says `0.1.0`. Don't cite the package version.
- **Access model:** the plan assumes prod + you logging in. The repo also boots locally (`run-seat-planner` skill), which is cheaper for iterative capture and lets the executor exercise a full draft→publish cycle **without touching prod**. Give it both, with prod as the "as users see it" pass.
- **Scope:** two full tracks × 7 phases is large (you flagged it). Since you chose autonomous-through-Gate-1, the hand-off front-loads the cheap, high-value output (walkthrough + scorecards + the 07-15 reconciliation) so you get signal before the expensive wireframe/prototype phases.

## System-design & synthesis notes

- The **draft→published two-layer model** and its guardrails (`draftConcurrency`, the `published_employees` snapshot, `*-transaction-safety`, RPC atomicity) are the correct "don't break this" spine. The hand-off lists them as invariants so any redesign is judged against them.
- **Synthesis gap:** the plan gathers evidence but never says how two GPAs + a 07-15 critique + a top-8 plan collapse into *one* ranked backlog. The hand-off adds a reconciliation step (dedupe against `_kept`/`_refuted`, merge with the top-8) so Gate 1 receives a single prioritized list, not three overlapping ones.

## Verdict

Approve the *shape*; correct the *premise*. With items 1–4 fixed and the minor corrections folded in, this is a clean, executable hand-off — which is what the companion file is.
