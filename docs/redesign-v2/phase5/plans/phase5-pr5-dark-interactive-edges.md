# Phase 5 · PR 5 — dark interactive edges carry the hue (`--cds-border-interactive` → #E8A07A in dark) — Implementation Plan

**Spec:** `docs/redesign-v2/phase5/plans/phase5-pr5-dark-interactive-edges-HANDOFF.md` (committed as Task 0, `8c9c716`).
**Owner ruling O5 (2026-09-10): "Flip it."** One-line flip in the two dark blocks, not per-consumer overrides.
**Target:** v2.5.0. Nothing below is built until the owner says "go".

## Set-up, verified

- `main` = `695912c` "phase 5 — PR 4 merged (v2.4.0)"; `v2.4.0` points at PR 4's squash `365dc7f`; tree clean.
- Skill fingerprint `f997ee525800e755` (14 files) — matches PHASE3DS §0.
- Static gate on main: `product-pairs.json` 212 pairs · not-gated 17 · **212/212 pass**.
- **Branch:** this session is bound to `claude/caveman-mode-ilivrg` (Task 0 is already there). The hand-off names
  `feat/phase5-dark-interactive-edges`. I stay on the bound branch; owner renames at PR time if wanted. Flagged, not a blocker.
- **Container limits:** no Docker, no real Chrome here (Playwright Chromium only). So the rig, e2e-auth, runtime audit
  and the brand checklist in a real browser run on the owner's machine (or a Docker-capable session). Everything else
  (unit · ct · browser · e2e smoke · static contrast · lockstep diffs · typecheck · lint) runs here.

## Context

PR 4's reviewer ruling B measured every dark consumer of `--cds-border-interactive` (#B85C2E in all three brand
blocks) on its real host: nav current bar / menu `[aria-current]` / palette row bar **2.53** on #393939, hovered
`.sp-ai-label` border start **2.77** on #333333 — under the 3:1 graphic floor. Re-measured today with the skill's
checker (`check_contrast.py --kind graphic`): #E8A07A gives 5.36 / 5.86 / 7.02 (#262626) / 8.39 (#161616) / 3.62
(#525252). Light is unaffected (3.7–4.6) and stays terracotta.

Consumers of the role (all through `sp-tokens.css` aliases; the vendored Carbon sheet does not reference it;
`--cds-focus`, `--cds-interactive`, `--cds-button-*` are separate roles, untouched):
`--sp-border-interactive` (`.sp-menu button[aria-current]`, `.sp-palette-row[aria-selected|current]`,
`.sp-menu-button[aria-expanded]`, `.tsx` hover borders in `SeatMap.tsx:2610-2611` / `ViewerFindPalette.tsx:427`),
`--sp-nav-current-bar`, `--sp-ai-border-start` (`.sp-ai-label`, `.sp-textarea--ai`), `--sp-tab-bar`, `--sp-recep-row-bar`.

## The change (hand-off §3, no additions)

### 1. Brand file `app/styles/brand/megeredchian-law-tokens.css`
- System-dark block and forced-dark (`g100`) block: `--cds-border-interactive: #B85C2E` → `#E8A07A`, with an O5 comment
  carrying the checker's pairs (5.36 on #393939 · 5.86 on #333333 · 7.02 on #262626 · 8.39 on #161616 · 3.62 on #525252;
  terracotta measured 2.53 / 2.77 / 3.32 / 3.97 / 1.71).
- Retire `--sp-recep-row-bar: #E8A07A;` in both dark blocks (inherits the same value via `sp-tokens.css:519`); fold the O4
  bar sentence into O5's comment. `--sp-recep-row-locked` unchanged.
- Header comment: O5 bullet after O4 (the flip, the failing rows, light unchanged); O2 bullet's "so it is never a dark
  edge" → "so the *role* itself carries the dark edge colour since O5"; O4 bullet's "The dark ROW BAR moves to #E8A07A
  with it (R5)" → "(R5; now inherited from the role — O5)".
- Light block untouched. `--cds-interactive` untouched in all blocks.
- `.json` sibling: `carbonMapping.g100` gains `"--cds-border-interactive": "#E8A07A"`, loses `--sp-recep-row-bar`;
  `terracottaDarkLink.usage` gains "interactive borders and bars on dark (O5)".

### 2. Tests
- `tests/phase4-token-layer-source.test.mjs` (brand test, ~line 385): the three-block loop drops the
  `--cds-border-interactive` line; light asserts `#B85C2E`, the two dark blocks assert `#E8A07A` (O5). The dark
  `--sp-recep-row-bar: #E8A07A` pin becomes `assert.doesNotMatch(dark, /--sp-recep-row-bar/i, "inherits the role — O5
  retired the O4 override")`. The `sp-tokens.css` neutral-default pins stay. Add one dark pin that `--cds-focus` and
  `--cds-button-primary` are still `#B85C2E` (already asserted in the loop — keep; that loop is the proof the flip
  touched only the border role).
- `docs/redesign-v2/phase3/contrast/generate-pairs.mjs`:
  - the two ruling-B `notGated` rows (lines 146–147) become `gated` at `BRAND.darkLink` (5.36 on `P.g80`, 5.86 on
    `P.hoverG90`), renamed "O5";
  - dark tab bar pair (line 136) retargets `BRAND.terracotta` → `BRAND.darkLink` (3.97 → 8.39; it now paints #E8A07A);
  - dark "AI border start blue-50 on field #262626" (line ~108) retargets to `BRAND.darkLink` (7.02) — the same
    stale-blue shape ruling A fixed for the row bar; it also covers the `.sp-menu-button[aria-expanded]` 1px rule;
  - keep a `notGated` row "terracotta on #393939 — the value O5 replaces (fails 3:1)" as PR 4 did for R5.
  - Regenerate; expected **215 gated / 16 not-gated** (recomputed from what lands — the printed counts are the record).
- `phase5/audit/pr4-reception-locked-row.mjs`: `EXPECT.dark.bar` stays `rgb(232, 160, 122)`; re-run once at 1920 × both
  themes (owner's machine) to prove the Reception bar is unchanged after the override is retired.

### 3. Rig `docs/redesign-v2/phase5/audit/pr5-dark-edges.mjs` (new, small; same harness as the PR 4 rig)
Admin fixture `e2e-admin@example.test` (`tests/e2e-auth/auth-helpers.ts`), local Docker stack, real Chrome, 1920,
read-only. For dark then light, computed `box-shadow` / `background` of:
1. `.sp-left-nav a[aria-current="page"]` — at 1024 (below the 1056 hinge) with the hamburger panel open on `/admin/management`
2. `.sp-menu button[aria-current="true"]` — `/admin`, floor menu open
3. `.sp-palette-row[aria-selected="true"]` — `/admin`, Ctrl/⌘ K, one character typed
4. `.sp-tab[aria-selected="true"]` — `/admin/management`
5. `.sp-ai-label` hovered — `/admin`, a seat selected (inspector open), hover the contact row
Dark: each contains `rgb(232, 160, 122)`; light: each contains `rgb(184, 92, 46)`. Plus two dark guards: primary button
background `rgb(184, 92, 46)` and a focus ring `rgb(184, 92, 46)` (flip touched only the border role). One 3x crop each,
dark, to `screenshots/phase5-pr5/` + README. Exit 1 on any failure.

### 4. Record
- `CLAUDE.md` LOCKED section: primary-colour paragraph and rule 2 gain "in dark, interactive *borders and bars* are
  #E8A07A (O5, 2026-09-10); focus ring and primary fills stay #B85C2E".
- `.claude/skills/brand-system/SKILL.md`: same sentence in "Primary UI colour" and rules 1/3; "Where it lives" drops
  `dark --sp-recep-row-bar`; checklist adds "dark interactive bar / edge `rgb(232, 160, 122)`".
- `DECISIONS.md`: the brand pivot has no D-entry — its record is §6 **no. 16**, which already carries dated inline
  amendments (O2, O3). So: an inline "**ruled 2026-09-10 (O5), built in Phase 5 PR 5:** …" sentence in row 16, plus the
  italic one-liner under the §6 header in the PR 3 / PR 4 shape; D3-g's "Open beside it … no entry here until ruled"
  gets "→ ruled O5, PR 5". **Next free stays 19.**
- `PHASE5.md`: index row PR 5; PR 4 "Carried" ruling-B bullet gains "→ fixed in PR 5 (v2.5.0, O5)"; a `## PR 5`
  section in the PR 4 shape: what the slice is, engineering calls, before/after table, pair counts, Carried,
  verification paragraph.
- The plan itself lands as `phase5/plans/phase5-pr5-dark-interactive-edges.md` (PR 4 pattern).
- `phase4/` untouched.

### Carried (measured today; listed, not fixed — hand-off §3.1 / §5)
- `--cds-interactive` (#B85C2E all blocks) dark consumers: pinned zone chip border `ViewerFindPalette.tsx:426`
  (`--sp-interactive` on `--sp-layer-hover` #333333) **2.77**; `SeatMap.tsx:2611` clear-button hover border (on a
  terracotta-alpha fill); login dot pulse halo (`globals.css:149`, decorative). Out of scope per §5.
- `--sp-ai-border-end` (tier-C, #B85C2E, theme-invariant): the gradient's end stop on the hovered label #333333 is
  **2.77**, at rest #262626 3.32. The record already treats the gradient end as not-gated ("the label carries meaning";
  PR 4 pair "AI border end … gradient's low stop"). Owner question for a later slice, not this one.
- `phase4/audit/pr5-smoke.mjs` still asserts a terracotta locked bar (closed record, not run).

## Verification (hand-off §4)
Here: `npm test` · `npm run test:ct` · `npm run test:browser` · `npm run build && npm run test:e2e` · regenerate pairs +
checker (counts printed) · `npm run typecheck` · `npm run lint` · `git diff main -- app/styles/sp-components.css
app/styles/sp-tokens.css app/styles/carbon-*.css` empty · `git diff --stat main -- docs/redesign-v2/phase4` empty ·
`git grep 0f62fe` hits only `carbon-tokens.css`.
Owner's machine (Docker + real Chrome): `npm run test:e2e:auth`, `runtime-audit.mjs` (0 undefined `var()`), the PR 5 rig,
the PR 4 rig re-run at 1920, brand checklist in dark. Then PR → CI → read-only preview walk in dark (nav, floor menu,
palette, tabs, Reception locked row) → owner "merge" → v2.5.0.
