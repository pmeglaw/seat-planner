# Claude Code Hand-off — Seat Planner UX/UI Review & Redesign

**From:** Patrick (owner / approver) · **For:** the repo-aware Claude Code session in `seat-planner`
**Source plan:** `Seat-Planner-UX-Review-CL_1.md` (v0.2) — this hand-off corrects and operationalizes it; where they disagree, **this file wins**.
**Run mode:** Autonomous through **GATE 1** (Phases 1–5), then stop for Patrick's sign-off.
**Date:** 2026-07-21

---

## 0. How to use this file

Read this file top to bottom, then the **Read-first** list (§3), then begin Phase 1. Work autonomously through Phase 5, saving each deliverable as you finish it, and **stop at GATE 1** with one consolidated package. Ask only if you hit a genuine blocker or a constraint collision (§5). Do **not** write app code or open a PR in this run.

## 1. Mission

Run a rigorous, evidence-based UX/UI review of the live Seat Planner across two **co-equal** surfaces — **User** (public read-only map, 100+ people) and **Admin** (~11 admins) — grade both, **reconcile with the design work already in the repo**, benchmark against outside best practice, and design a revision that fixes what's found **without crossing the app's hard constraints**. Deliver wireframes + a traceability/alignment pass, then stop at Gate 1.

**The Carbon Shell direction is LOCKED and owner-approved (confirmed 2026-07-21) — perfect it; do NOT propose or drift toward a different direction.** This is presentation-layer *refinement*, not a re-evaluation of the design. Fresh eyes on *behavior* and *execution quality*; reconcile findings with the locked spec and the current (2026-07-15) critique/backlog (§3). The owner has named four priority refinement targets — **see §4A**, backed by `docs/carbon-shell-refinement-brief.md`.

## 2. What you are reviewing — pin this first (Step 0)

- **Primary target:** `main` as deployed to prod at **`seats.megeredchianlaw.com`** (currently `v1.10.0`). This is what the 100+ viewers and ~11 admins actually use.
- **Map current state against the locked spec:** the Carbon Shell in `docs/DESIGN_DIRECTION.md` (+ prototype `docs/ui/seat-planner-shell.html`) is the target. `main` today ships a partial/hybrid of it (a warm-copper `--sp-*` palette layered over the dark shell). Open the walkthrough with a one-paragraph map of where the shipped UI already *is* the Carbon Shell and where it drifts — then perfect it **toward** the spec. This is refinement toward a chosen direction, not an open question about which direction to take.

## 3. Read first — do not skip

1. `CLAUDE.md` + `AGENTS.md` — architecture, invariants, conventions, commands.
2. `docs/DESIGN_DIRECTION.md` — the **locked** design spec (tokens, Carbon visual language, SeatMarker protection, presentation-layer-only rule).
2a. **`docs/carbon-shell-refinement-brief.md` — the owner-directed refinement targets (colors, top chrome, search, filter) with measured evidence and a target palette. This is the priority work for this engagement.**
3. `docs/ui/seat-planner-shell.html` — committed prototype = visual source of truth for the locked direction.
4. `output/ui-ux-critique-2026-07-15/report.md` — the **current** critique (six days before this review). Read `_kept.txt` and `_refuted.txt` beside it — the live "verified / refuted findings" lists — plus `prod-verify/`. **These are the lists the source plan called "executor memory"; they are files, not memory.**
5. `docs/superpowers/plans/2026-07-15-critique-top8.md` — the current 8-item fix backlog with the exact global constraints (last touched 2026-07-20).
6. **Archival only — pre-rebuild, do NOT grade against:** `docs/ui-ux-review-god-pass.md`, `qa-report.md`, `design-critique.md`, `design-critique-admin-2026-06-29.md`, `design-direction-verdict.md`, `ux-audit-production-2026-07-01.md`.

**How to use prior work:** fresh-eyes on behavior, but reconcile every finding against #4 and #5. If `_refuted.txt` already refuted it, say so and drop it. If the top-8 plan already covers it, merge — don't re-file. Never let an old note suppress a fresh, evidence-backed finding. Challenge the locked design direction only with evidence.

## 4. The two surfaces + confirmed top-jobs (§4 of the plan — RESOLVED, bake these in)

**ADMIN — `/admin`, `/admin/management`, `/admin/settings` (~11 admins):**

1. **Assign / reassign seats** in the draft layer.
2. **Publish** — push draft → live to 100+ viewers.
3. **Manage roster, departments, zones** (`/admin/management`).
4. **Settings / data utilities** (`/admin/settings`).
5. **Cluster employees by POSITION into zones** — supervisors want like-positions grouped (e.g., all *Case Managers* in one zone, *Assistant Case Managers* in another). **Probe this explicitly:** can an admin see `position`, group/assign seats by it, and do it in bulk? The schema supports it (`employees.position`, `seats.zone`) but the *workflow* may not — that gap is a first-class finding and a likely redesign target.

**USER — `/` public read-only map (100+, mostly first-time / occasional / non-expert):**

1. **Find my own seat.**
2. **Look up where a specific person sits.**
3. **Read who's where** — scan the layout by area / department.
4. **Confirm the map is current / accurate.**

**The hinge:** the User surface shows only *published* state, so admin publish-comprehension failures surface as wrong information to 100+ people. **Draft/publish comprehension is the #1 cross-track probe** — maps to rubric categories 6 (Trust) and 7 (Feedback).

## 4A. Priority refinement targets (owner-directed — do these first)

The Carbon Shell is locked; the owner named four things to **perfect within it**. Full evidence + target palette in **`docs/carbon-shell-refinement-brief.md`**. Summary:

1. **Colors — tame the sprawl (top priority).** `app/globals.css` carries **59 distinct hexes** across **three overlapping namespaces** (`--ml-*`, `--sp-color-*`, `--admin-*`), with 6 greens / 7 teals / 6 ambers. Consolidate to one Carbon-disciplined palette (**~24 hexes, no teal**): IBM-gray neutrals + one orange brand accent (**`#FF5715`**) + **three** semantic status hues — each a bright fill + dark text partner + soft surface (success `#24A148`/`#1D6E41`, warning `#F1C21B`/`#8A6116`, danger `#DA1E28`/`#A2191F`); **info folds into neutral gray and both teals are deleted** (search/filter highlight = the orange accent). Collapse to 2-tier primitives→semantic with `--admin-*` referencing primitives and `--ml-*` retired. Preserve the measured AA contrasts.
2. **Top chrome — declutter.** The 40px map header (`components/seat-map/SeatMap.tsx`) packs search + undo/redo + names toggle + "More tools" + surface toggle + Publish + status, each icon **and** label. Primary row = search + active tools + Publish (the hero); push secondaries into the existing "More tools" overflow; stop doubling icon+label on secondary buttons. (`AdminShellBar.tsx`, the sub-page bar, is already lean — leave it.)
3. **Search bar — widen + heighten.** Today `h-[26px]`, capped `max-w-[340px]`, and on the viewer sharing one box with the filter (`SeatMap.tsx:2457`, `ViewerSeatFinder.tsx:777`). Give it its own field, ≥ 32px (Carbon `sm`), wider cap (~420–560px) on `lg`; search is a *paramount* user job.
4. **Filter — refine + carry the position job.** Separate it from the search field; show active filters as legible removable Carbon tags; add a **`position` facet** to support supervisors' *cluster-employees-by-position-into-zones* job (schema supports it via `employees.position` / `seats.zone`; the workflow may not).

Phases 1–2 evaluate these four explicitly per surface; Phase 4 designs them within the Carbon look using the consolidated palette; Phase 5 confirms no guardrail / AA / constraint line is crossed.

## 5. Hard constraints — a redesign must satisfy these, not fight them (verified against the repo)

- **The raster floor-plan image cannot become SVG.** Overlays on top are allowed. `MAP_IMAGE_WIDTH/HEIGHT = 3822×1734` in `lib/mapLayoutTransform.ts`; if the shipped pixels ever change, bump the `?v=` cache-buster **and** the blur data URL.
- **Seat coordinates stay normalized `[0,1]`** against the calibration transform (`lib/seatMath.ts`, `lib/mapLayoutTransform.ts`). Do not re-normalize; do not touch calibration constants.
- **Draft/published two-layer model is sacred.** Viewers read `published` only; admins edit `draft`; `publish_seat_map()` is the only path to live. Never point a viewer surface at draft; never write `published_employees` outside the publish RPC.
- **Guardrail source-tests + coverage floors** (lines 90 / funcs 95 / branches 80): `accessibility-source`, `bulk-destructive-action-safety-source`, `seat-creation-ui-source`, `desktop-seat-marker-system-source`, `published-employee-snapshot`, `*-transaction-safety`. Design the revision to keep these green. Tokens/colors/spacing/layout may evolve; **accessibility and contrast (≥ 4.5:1 body text) may not regress.**
- Multi-row mutations go through Postgres RPCs; migrations are new timestamped files under `supabase/migrations/`, never applied to prod manually.

## 6. Method (apply per surface)

- **Live walkthrough** capturing screenshots + recordings at every step. Think-aloud template per step: *step # & screen · goal · expectation (where I'd click + why) · action (where I clicked) · "right place?" confidence 1–5 · friction/confusion · readability · outcome vs. expectation · heuristic + severity.*
- **Heuristic lenses:** Nielsen's 10, first-click / findability, cognitive load, WCAG basics.
- **Diagrams:** Mermaid for user flows, IA/site map, and the draft→publish→viewer state machine.
- **Grade all 10 rubric categories A–F per track** (both tracks paramount; no category dropped). Two GPAs side by side. Every low grade pairs with a fix direction and a severity: 🔴 critical / 🟠 high / 🟡 medium / ⚪ low.

## 7. Access & tooling

- **Prod pass ("as users see it"):** open Chrome; **Patrick logs in himself** in his own tab (the extension can't read the Supabase auth cookie); continue in that authenticated tab. Prod = `seats.megeredchianlaw.com`.
- **Local pass (iterative capture + safe draft/publish):** boot via the **`run-seat-planner`** skill (`localhost:3000`; `/` = viewer, `/admin` = editor, `/admin/management` = data, `/admin/settings` = utilities). Use this to run a full **draft → edit → publish** cycle **without touching prod data**.
- **Evidence:** `chrome-pixel-capture` skill for pixel-accurate shots. **Test mechanics:** `test-tiers` skill.

## 8. Run plan — autonomous through Gate 1

Save every deliverable under **`docs/ux-review-2026-07/`** as you go.

| Phase | Do | Deliverable |
|---|---|---|
| **1 — Live QA (both tracks)** | Walk each surface as its real user; Admin includes a full draft→edit→publish cycle **and** the position→zone clustering attempt. Open with the Step-0 shipped-vs-locked paragraph. | `01-walkthrough.md` — two annotated logs + reconstructed Mermaid workflows |
| **2 — Scorecards** | Score 10 categories A–F per track with evidence; two GPAs; rank issues by severity; top themes. | `02-scorecards.md` |
| **3 — DD research (cited)** | Benchmark public wayfinding / "find your seat" / floor-map patterns **and** admin CMS draft-publish patterns; list "what we might have missed." | `03-dd-findings.md` |
| **3b — Reconciliation (do before Phase 4)** | Merge Phase 2 issues with `output/ui-ux-critique-2026-07-15` (`report.md`, `_kept`, `_refuted`) and the top-8 plan into **one ranked backlog**; tag each item *new / confirms-existing / already-refuted*. | `03b-reconciled-backlog.md` |
| **4 — Revision plan** | **Lead with the §4A targets (colors, top chrome, search, filter) using the consolidated palette from `docs/carbon-shell-refinement-brief.md`.** Annotated low-fi **wireframes** (HTML/SVG so they render) per key screen/flow both tracks — within §5 constraints and consistent with the locked Carbon tokens; Mermaid redesigned flows + IA + draft→publish→viewer state machine. **Include the position→zone clustering flow.** | `04-revision-pack.md` (+ wireframe files) |
| **5 — Alignment + constraint check** | Traceability matrix: every Phase 1/2 issue → the change that resolves it. Confirm no source-test / a11y / data-integrity / SVG / calibration line is crossed. Flag anything unaddressed. | `05-alignment-report.md` |

**🚧 GATE 1 — STOP.** Present one package: walkthrough + two scorecards + DD findings + reconciled backlog + revision pack + alignment report. **Wait for Patrick's confirmation** before any interactive prototype (Phase 6) or code (Phase 7).

## 9. Definition of done for this run

- Both surfaces walked end-to-end with embedded evidence; Admin includes a full draft→edit→publish cycle and the position→zone clustering attempt.
- Two scorecards with GPAs; issues reconciled against the 07-15 critique + top-8 plan into a single ranked backlog (no re-filing of refuted items).
- Wireframes render, respect the raster / calibration / token constraints, and every proposed change traces to a found issue.
- Alignment report shows **zero** guardrail crossings — or flags each one explicitly.
- Everything saved under `docs/ux-review-2026-07/`. Nothing mutated in prod. No PR opened.

## 10. Do NOT

- Do **not** write app code, run migrations, or open a PR in this run (that's Phase 7, after Gate 2).
- Do **not** mutate prod data; run draft/publish testing locally.
- Do **not** propose replacing the raster map with SVG, or altering calibration constants / normalized coordinates.
- Do **not** point any viewer surface at draft data, or write `published_employees` outside the publish RPC.
- Do **not** re-open or replace the Carbon Shell direction — it's locked; perfect it within `DESIGN_DIRECTION.md`.
- Do **not** introduce new colors, hues, or a third background neutral; consolidate toward the palette in `docs/carbon-shell-refinement-brief.md` and preserve measured AA.
- Do **not** treat `_refuted.txt` items as fresh findings, and do not let old notes bury an evidence-backed new one.

---

*Kickoff: point Claude Code at this file — e.g. "Read `docs/CLAUDE-CODE-HANDOFF-ux-review.md` and begin Phase 1." It will run through Gate 1 and stop for your review.*
