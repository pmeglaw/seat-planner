# Phase 5 · PR 5 — dark interactive edges carry the hue (`--cds-border-interactive` → #E8A07A in dark) · HAND-OFF

**For a fresh Claude Code session, started AFTER PR 4 (#528) has merged and its docs commit is on `main`.
Task 0 commits this file, then you plan in plan mode. Nothing is built until the owner says "go".**

Reviewer: Cowork (design governance). Owner: Patrick. Written 2026-09-10.

---

## 0. Set-up, before you read anything else

```
main = <the docs commit "phase 5 — PR 4 merged (v2.4.0)">   — verify tag v2.4.0 exists and prod is READY
branch to cut = feat/phase5-dark-interactive-edges      →  v2.5.0
```

1. `git fetch --prune && git status` — clean tree, remote holds `main` alone, `git tag --points-at` shows v2.4.0
   on PR 4's squash. If v2.4.0 does not exist, **stop**: this slice removes a line PR 4 added and must not race it.
2. **Verify the skill fingerprint** with the PHASE3DS §0 recipe: expect **`f997ee525800e755`** (14 files).
3. **Read order.** `CLAUDE.md` (the LOCKED brand section) → `.claude/skills/brand-system/` → the brand file
   `app/styles/brand/megeredchian-law-tokens.css` in full (O2, O3, O4 comments — this slice becomes O5) →
   `docs/redesign-v2/phase5/PHASE5.md` PR 4 section, especially "Carried, not fixed" (ruling B's measured table
   is the input to this slice) → `docs/redesign-v2/DECISIONS.md` §6 → this file's §3.
4. Task 0 commits this file as `docs/redesign-v2/phase5/plans/phase5-pr5-dark-interactive-edges-HANDOFF.md`.

---

## 1. The problem — measured, do not re-derive

PR 4's reviewer ruling B measured every consumer of `--cds-border-interactive` on its real dark host with the
skill's checker (table in PHASE5 PR 4 "Carried"). The brand file sets that role to terracotta #B85C2E in **all
three** theme blocks, and terracotta cannot reach the 3:1 graphic floor on the dark greys the panels are made of:

| consumer | dark host | today #B85C2E | at #E8A07A |
|---|---|---|---|
| `--sp-nav-current-bar` (`.sp-left-nav a[aria-current]`) | layer-selected-01 #393939 | **2.53** | 5.36 |
| `.sp-menu button[aria-current]` bar | layer-selected #393939 | **2.53** | 5.36 |
| `.sp-palette-row[aria-selected] / [aria-current]` bar | layer-selected #393939 | **2.53** | 5.36 |
| `--sp-ai-border-start` on the hovered `.sp-ai-label` | layer-hover-01 #333333 | **2.77** | 5.86 |
| `--sp-ai-border-start` at rest / `.sp-textarea--ai` | layer-01 / field-01 #262626 | 3.32 | 7.02 |
| `.sp-menu-button[aria-expanded]` 1px rule | field-01 #262626 | 3.32 | — |
| `--sp-tab-bar` | `--sp-tabs-bg` = background #161616 | 3.97 | 8.39 |
| `--sp-recep-row-bar` (PR 4 already overrides it to #E8A07A in dark) | #525252 / #333333 / #393939 | fixed in PR 4 | 3.62 / 5.86 / 5.36 |

Light is not affected — terracotta reads 3.7–4.6:1 on the light surfaces and stays.

## 2. Owner ruling (2026-09-10)

**"Flip it."** The reviewer's enumeration (every consumer of the role listed — the vendored Carbon sheet does not
reference it; `--cds-focus` is a separate token and is untouched; primary buttons do not use it) and the
before/after render were put to the owner; he chose the **one-line flip over per-consumer overrides**:
`--cds-border-interactive: #E8A07A` in the **two dark blocks only**. Recorded as brand ruling **O5**. Light keeps
#B85C2E. The reviewer's stated reasoning, for the record: it matches O2's existing dark rule ("the edge carries the
hue"), it gives dark one coherent statement — apricot for interactive edges and links, terracotta for filled
primaries — and per-consumer overrides would say the same thing seven times and leave the eighth consumer to fail.

## 3. The change

### 3.1 The brand file — two blocks, one value, one retirement

In `app/styles/brand/megeredchian-law-tokens.css`:

- **System-dark block** (`@media (prefers-color-scheme: dark)` … `:root:not([data-carbon-theme="white"])…`) and
  **forced-dark block** (`:root[data-carbon-theme="g100"]`): change `--cds-border-interactive: #B85C2E;` to
  `--cds-border-interactive: #E8A07A;` with an **O5** comment in the file's voice carrying the measured pairs.
- **Light block:** untouched.
- **Retire PR 4's dark `--sp-recep-row-bar: #E8A07A;` lines** in both dark blocks (they now inherit the same value
  through `sp-tokens.css`'s `var(--cds-border-interactive)`) and fold their comment into O5's. `--sp-recep-row-locked`
  stays exactly as O4 left it.
- **Header comment:** add the O5 bullet after O4, stating the flip, the measured table's failing rows, and that
  light is unchanged. Update the O2 bullet's parenthetical if it says terracotta "is never a dark edge" in a way
  that now reads as inconsistent — the sentence should say the *role* now carries the dark edge colour.
- `.json` sibling: mirror `--cds-border-interactive` in `carbonMapping.g100` and drop the `--sp-recep-row-bar` entry
  there.

Check `--cds-interactive` (also #B85C2E in all blocks): it is a **different role** (interactive *fill*, e.g. Carbon's
switch/checkbox on). Do **not** flip it in this slice; if the plan finds a dark consumer of it under 3:1, list it
under Carried with its measurement.

### 3.2 Tests

- `tests/phase4-token-layer-source.test.mjs` brand-layer test: the loop over all three blocks asserts
  `--cds-border-interactive: #B85C2E` — split it: light block asserts #B85C2E, the two dark blocks assert #E8A07A
  (O5). PR 4's dark pin `--sp-recep-row-bar: #E8A07A` becomes `assert.doesNotMatch(dark, /--sp-recep-row-bar/)`
  ("inherits the role — O5 retired the O4 override"); the `sp-tokens.css` neutral-default pin stays.
- `docs/redesign-v2/phase3/contrast/generate-pairs.mjs`: the two `notGated` rows PR 4 added for ruling B ("carried
  — dark --cds-border-interactive consumers, owner ruling pending") become **gated** pairs at #E8A07A: nav/menu/
  palette bar on #393939 (5.36) and AI border start on #333333 (5.86); add the tab bar dark pair at #E8A07A if the
  PR 4 pair measured terracotta (3.97 → 8.39). Regenerate; the checker's printed counts are the record.
- The PR 4 rig `phase5/audit/pr4-reception-locked-row.mjs` `EXPECT.dark.bar` stays `rgb(232, 160, 122)` — re-run it
  once (both themes, 1920 only is enough) to prove the Reception bar is unchanged after the override is retired.

### 3.3 Rig — `phase5/audit/pr5-dark-edges.mjs` (small)

Dark theme only, 1920, real Chrome, local Docker stack, admin fixture (the palette and floor menu live on `/admin`):
computed `box-shadow` / `border` colour of (1) the left-nav current item on `/admin/management` below the lg
breakpoint or wherever the nav renders its 3px bar, (2) the floor menu's `[aria-current]` item with the menu open,
(3) a palette row `[aria-selected]` with the palette open (⌘K / Ctrl K), (4) the selected page tab on
`/admin/management`, (5) the hovered `.sp-ai-label` — each contains `rgb(232, 160, 122)`; plus the same five in
**light** contain `rgb(184, 92, 46)` (light unchanged). One 3x crop each, dark. Read-only: open menus and palettes,
select nothing that writes.

### 3.4 Record

- **Brand file** O5 (above). **CLAUDE.md** LOCKED brand section rule 2 and the primary-colour paragraph: add "in
  dark, interactive *borders and bars* are #E8A07A (O5, 2026-09-10); focus ring and primary fills stay #B85C2E".
  **`.claude/skills/brand-system/SKILL.md`**: same sentence in rule 1/2, and the "Where it lives" list loses
  `dark --sp-recep-row-bar`.
- **DECISIONS.md:** a dated entry under the brand pivot's D-entry (find where deviation 16 / the brand pivot is
  recorded and add a sub-entry, e.g. the next free letter), not a new §6 number — **next free stays 19**: the
  role's dark value moves within the brand's own scale.
- **PHASE5.md:** PR 4's "Carried" bullet for ruling B gains "→ fixed in PR 5 (v2.5.0, O5)"; a `## PR 5` section in
  the PR 3/4 shape with the before/after ratios table and the verification paragraph; index row.
- `phase4/` untouched.

## 4. Verification you owe before the smoke hand-off

Brand-system checklist (its "focus ring #B85C2E" and "primary rgb(184, 92, 46)" lines must still pass in dark —
that is the proof the flip touched only the border role); unit · ct · browser · e2e · e2e-auth (Docker) · runtime
audit 0 undefined `var()` · static contrast with the regenerated pairs · lockstep byte-identical (no sheet change
expected at all — `git diff main -- app/styles/sp-components.css` empty) · `git diff main -- app/styles/sp-tokens.css
app/styles/carbon-*.css` empty · `git diff --stat main -- docs/redesign-v2/phase4` empty. Then PR → CI → a short
read-only preview walk in dark (nav, floor menu, palette, tabs, Reception locked row) → owner's "merge" → v2.5.0.

## 5. Out of scope — do not touch

`--cds-focus`, `--cds-interactive`, `--cds-button-*`, any light-theme value, `--sp-shell-current-bar` (tier-C,
ledgered blue-50 — its own history), any `.tsx`, the component sheet, any `--sp-*` alias in `sp-tokens.css`. If the
plan wants more than §3, it comes back to the owner first.
