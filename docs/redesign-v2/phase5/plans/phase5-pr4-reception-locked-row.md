# Phase 5 · PR 4 — Reception's locked row gets its own surface (+ the band→tail gap) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Reception's locked row onto the hit surface (light #FBE8DC / dark #525252, dark bar #E8A07A) via the brand file, and raise the wide readout column's between-group gap to 24 (sheet amendment K), with the record, tests, contrast pairs, and a real-browser rig to prove it.

**Architecture:** Two CSS changes, no `.tsx`. (1) A brand-file override of the already-declared `--sp-recep-row-locked` in all three theme blocks, plus `--sp-recep-row-bar` in the two dark blocks (O4) — `sp-tokens.css` keeps its neutral default, the sheet rule at `sp-components.css:1099` is untouched. (2) `.sp-recep-readout { gap }` goes `--sp-space-05` → `--sp-space-06` in both lockstep copies of the sheet. Everything else is record (DECISIONS D3-g, PHASE2UX §1R.3, PHASE3DS §1.29, PHASE5 PR 4, brand-system skill), tests (source pin, ct pin), contrast pairs, and an audit rig.

**Tech Stack:** Next.js app CSS layers (`app/styles/`), node test runner (`node --test`), jsdom ct tier, Playwright + real Chrome + CDP for the rig, the skill's `check_contrast.py`.

**Spec:** `docs/redesign-v2/phase5/plans/phase5-pr4-reception-locked-row-HANDOFF.md` (the owner's hand-off pasted in chat 2026-09-09 — Task 0 commits it verbatim) plus the rulings below.

## Context

PHASE5.md's PR 2 section carried two 1920 critique findings: (a) the count header and the locked row share `--cds-layer-selected-01`, so a locked row 1 fuses with the header; (b) the readout column's band→tail gap equals the intra-band gap (16 = 16). The reviewer's mockup widened (a): the hover/cursor row (`layer-hover-01`) is one ladder rung from the locked row in both themes, so "the person whose extension I'm reading aloud" is indistinguishable from the header and nearly from "my mouse is here".

| surface | light | dark |
|---|---|---|
| header · `layer-selected-01` | #e0e0e0 | #393939 |
| locked row · `--sp-recep-row-locked` (today) | #e0e0e0 | #393939 |
| hover / cursor row · `layer-hover-01` | #e8e8e8 | #333333 |

**Owner rulings (2026-09-09):**

| | Ruling |
|---|---|
| **R1** | Option C — locked row takes the hit surface: light #FBE8DC (the O2 tint), dark #525252 (`layer-selected-02` on g100). Header, row height, type unchanged. |
| **R2** | Hovering the locked row does nothing (selected rule out-orders hover at equal specificity — already true). Accepted. |
| **R3** | Verify 480 / 640 / 800 / 1024 / 1920 × both themes. Accepted. |
| **R4** | Band→tail gap at wide = `--sp-space-06` (24); gaps inside band and tail stay 16. The recents `<aside>` IS a third direct child of `.sp-recep-readout` (`ReceptionScreen.tsx:466`), so the 24 also lands between tail and recents. Accepted. |
| **R5** (new, owner 2026-09-09 in planning) | The dark bar `--sp-recep-row-bar` (= `--cds-border-interactive` = #B85C2E in dark) measures **1.71:1** on #525252 — under the 3:1 graphic floor the hand-off names as a stop (it already fails today: 2.53 on #393939, 2.77 on the cursor row #333333). Owner chose: override `--sp-recep-row-bar: #E8A07A` in the two dark blocks only — O2's dark-edge precedent ("the edge carries the hue"). 3.62 on #525252, 5.86 on #333333, 5.36 on #393939. Light bar stays #B85C2E (3.84 on the tint). |

**Pre-measured with the skill's `check_contrast.py`** (to be re-run in Task 2 — the brand-file comment carries the checker's numbers, never typed):

| pair | light | dark |
|---|---|---|
| text-primary on the locked fill | #161616 / #FBE8DC **15.23** | #f4f4f4 / #525252 **7.10** |
| `--sp-text-helper-on-row` (= `--cds-text-secondary`) on the locked fill | #525252 / #FBE8DC **6.58** | #c6c6c6 / #525252 **4.57** |
| bar on the locked fill | #B85C2E / #FBE8DC **3.84** | #E8A07A / #525252 **3.62** |
| bar on the cursor row (R5 side effect, dark only) | — | #E8A07A / #333333 **5.86** |

Note the hand-off estimated the light helper at ≈4.6 — it is 6.58, because `--sp-text-helper-on-row` aliases `text-secondary` = gray 70, not gray 60. No helper fallback is needed.

**Reviewer rulings on this plan (Cowork, 2026-09-10) — folded in, approved for "go" with them:**

| | Ruling | Where it lands |
|---|---|---|
| **A** | `generate-pairs.mjs:119` and `:130` measure the wrong colour (Carbon blue `P.b60` / `P.b50` for "row bar / tab bar") — the static gate never measured the terracotta bar on any row surface, which is why 2.53 / 2.77 were never caught. Retarget both in Task 2: light Reception row bar terracotta on `P.hoverWhite`; dark Reception row bar `BRAND.darkLink` on `P.hoverG90` (R5's 5.86); the tab bar as its own pair per theme on its real host — `--sp-tab-bar` paints on `.sp-tab` inside `.sp-tabs-host { background: var(--sp-tabs-bg) }` = `--cds-background` (white / #161616; `sp-tokens.css:468`, `sp-components.css:835-842`). Dark tab bar measures 3.97 — gated, passes. | Task 2 |
| **B** | Every dark 3px bar / edge resolving through `--cds-border-interactive` #B85C2E is measured on its host and listed under Carried with numbers (table below). Not fixed in PR 4; brand-layer question for the owner; no DECISIONS entry until ruled. | Task 6 (PHASE5 Carried), Task 2 (not-gated rows) |
| **C** | Baseline from a second worktree (`git worktree add ../seat-planner-main main`), never by switching `main` in place, never `git stash`. Dirty tree at that point = stop and report. | Task 5 Step 2 |
| **D** | Task 2's light block carries five well-formed `add(...)` lines (text, meta, bar-on-tint, + A's row-bar-on-hover and tab-bar); Task 6's pair totals are recomputed from what actually lands. | Task 2, Task 6 |

**Dark `--cds-border-interactive` consumers, measured (checker, 2026-09-10) — ruling B's table:**

| consumer | host surface | today #B85C2E | if #E8A07A |
|---|---|---|---|
| `--sp-nav-current-bar` (`.sp-left-nav a[aria-current]`, `sp-components.css:376`) | `--sp-nav-current-bg` = layer-selected-01 #393939 | **2.53 FAIL** | 5.36 |
| `.sp-menu button[aria-current]` bar (`:455`) | `--sp-layer-selected` #393939 | **2.53 FAIL** | 5.36 |
| `.sp-palette-row[aria-selected] / [aria-current]` bar (`:508, :511`) | `--sp-layer-selected` #393939 | **2.53 FAIL** | 5.36 |
| `--sp-ai-border-start` on `.sp-ai-label:hover` (`:673`) | `--sp-layer-hover` = layer-hover-01 #333333 | **2.77 FAIL** | 5.86 |
| `--sp-ai-border-start` on `.sp-ai-label` rest (`:671`) / `.sp-textarea--ai` (`:682`) | layer-01 / field-01 #262626 | 3.32 pass | 7.02 |
| `.sp-menu-button[aria-expanded]` 1px rule (`:447`) | `--sp-field` = field-01 #262626 | 3.32 pass | — |
| `--sp-tab-bar` (`.sp-tab[aria-selected]`, `:842`) | `--sp-tabs-bg` = background #161616 | 3.97 pass | 8.39 |
| `--sp-shell-current-bar` (tier-C, already ledgered) | shell g100 #161616 | 3.97 pass | — |
| `--sp-recep-row-bar` on the locked / cursor / header rows | #525252 / #333333 / #393939 | 1.71 / 2.77 / 2.53 | **fixed in this PR (R5)** |

Owner's two paths, for the record and not decided here: `--cds-border-interactive` goes #E8A07A in the two dark blocks (one line, every consumer follows — the O2 dark-edge shape), or each failing consumer is themed like O4.

**Hand-off correction:** the hand-off cites PHASE3DS **§1.22** for Reception. §1.22 is the page frame (`.sp-page`); Reception is **§1.29** (the sheet's block-27 header cites §1.29 too). This plan amends §1.29.

**Pre-flight verified in planning (2026-09-09):** `main` = `d9d52ee`, working tree clean, remote holds `main` alone, no local branches besides `main`; skill fingerprint `f997ee525800e755`, 14 files. Task 0 re-verifies.

## Global Constraints

- Branch `feat/phase5-reception-locked-row` off `d9d52ee`; release `v2.4.0`; PR title `feat(redesign-v2): phase 5 — Reception's locked row gets its own surface (PR 4, v2.4.0)`.
- Hex only in `app/styles/brand/megeredchian-law-tokens.css` (and the two vendored assets); `HEX_LEDGER` stays two rows; `tests/phase4-token-layer-source.test.mjs` passes unchanged.
- `sp-components.css` and `sp-tokens.css` byte-identical to their `docs/redesign-v2/phase3/` copies. `git diff main -- app/styles/sp-tokens.css app/styles/carbon-*.css` must be empty at the end.
- `docs/redesign-v2/phase4/` is closed record — never edited (`git diff --stat main -- docs/redesign-v2/phase4` empty).
- No `.tsx` change. No change to the header tint/height, row grid, type, `--sp-recep-row-highlight`, the 3px width, amendment I's fold, O2's map tokens, `/` or `/admin`.
- DECISIONS §6 next free stays 19 (D3-g is not a Carbon deviation).
- Amendment letter for the sheet: **K** (verified free). Brand ruling id: **O4**.
- Rigs run against the LOCAL Docker stack only (`npm run db:start` + `db:seed`, `.env.local` pointed at it — README recipe). Never against production.
- Commit attribution trailer on every commit:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01CCF7zjFjHpJY5Pq47sP2Em
  ```
- Windows: run `check_contrast.py` with `PYTHONUTF8=1`. Checker path: `C:/Users/JP/.claude/plugins/cache/megeredchian/design-system/1.3.0/skills/ibm-design-language/scripts/check_contrast.py`.
- Nothing merges without the owner: the plan ends at "PR open, CI green, preview URL handed over".

## File map

| File | Change |
|---|---|
| `docs/redesign-v2/phase5/plans/phase5-pr4-reception-locked-row-HANDOFF.md` | create — the hand-off verbatim (Task 0) |
| `docs/redesign-v2/phase5/plans/phase5-pr4-reception-locked-row.md` | create — this plan (Task 0) |
| `app/styles/brand/megeredchian-law-tokens.css` | O4 block in 3 theme blocks + header bullet |
| `app/styles/brand/megeredchian-law-tokens.json` | O4 entries (doc-only sibling) |
| `tests/phase4-token-layer-source.test.mjs` | O4 pin inside the existing brand-layer test |
| `docs/redesign-v2/phase3/contrast/generate-pairs.mjs` + `product-pairs.json` + `surface-pairs-not-gated.json` | retarget 2 stale locked-row pairs, add 5, 1 not-gated; regenerate |
| `tests/reception-screen.test.mjs` | ct pin: lock on row 1, cursor on row 2 |
| `app/styles/sp-components.css` + `docs/redesign-v2/phase3/components/sp-components.css` | amendment K (gap 24) — byte-identical |
| `docs/redesign-v2/phase5/audit/pr4-reception-locked-row.mjs` | new rig |
| `docs/redesign-v2/phase5/screenshots/phase5-pr4/` | captures + `results.json` + `results-main.json` + `README.md` |
| `docs/redesign-v2/DECISIONS.md` | D3-g after line 1258; §6 header line after 1487 |
| `docs/redesign-v2/PHASE2UX.md` | inline amendment in §1R.3 lines 405–406 |
| `docs/redesign-v2/phase3/PHASE3DS.md` | amendment K paragraph at the end of §1.29 (after the amendment I paragraph, before the `---` at ~684) |
| `docs/redesign-v2/phase5/PHASE5.md` | index row (line 16), "→ fixed in PR 4" on the two PR 2 carried bullets (236, 241), new `## PR 4` section at EOF |
| `.claude/skills/brand-system/SKILL.md` | O4 sentence in rule 1 (line 24); tokens in "Where it lives" (line 20) |

---

### Task 0: Branch, hand-off file, plan file

**Files:**
- Create: `docs/redesign-v2/phase5/plans/phase5-pr4-reception-locked-row-HANDOFF.md`
- Create: `docs/redesign-v2/phase5/plans/phase5-pr4-reception-locked-row.md`

- [ ] **Step 1: Verify the tree and the skill fingerprint**

```bash
git fetch --prune && git status --short --branch && git log --oneline -1
# expect: ## main...origin/main, empty status, d9d52ee
cd "C:/Users/JP/.claude/plugins/cache/megeredchian/design-system/1.3.0/skills/ibm-design-language" && find . -type f | LC_ALL=C sort | while read f; do printf '%s  %s\n' "$(sed 's/\r$//' "$f" | sha256sum | cut -d' ' -f1)" "$f"; done | sha256sum | cut -c1-16
# expect: f997ee525800e755
```
If status is not empty or the fingerprint differs: stop and report.

- [ ] **Step 2: Cut the branch**

```bash
git switch -c feat/phase5-reception-locked-row
```

- [ ] **Step 3: Write the hand-off file** — the owner's message verbatim (title through §7), as `docs/redesign-v2/phase5/plans/phase5-pr4-reception-locked-row-HANDOFF.md`. Do not edit its wording (its §1.22 reference is corrected in this plan, not there).

- [ ] **Step 4: Write the plan file** — this document, as `docs/redesign-v2/phase5/plans/phase5-pr4-reception-locked-row.md`.

- [ ] **Step 5: Commit**

```bash
git add docs/redesign-v2/phase5/plans/phase5-pr4-reception-locked-row-HANDOFF.md docs/redesign-v2/phase5/plans/phase5-pr4-reception-locked-row.md
git commit -m "docs(redesign-v2): phase 5 PR 4 — hand-off + plan of record (Reception locked row)"
```

---

### Task 1: O4 in the brand file — source pin first

**Files:**
- Modify: `tests/phase4-token-layer-source.test.mjs:385-430` (inside `test("brand layer: terracotta is the primary in all three theme states, blue is not")`)
- Modify: `app/styles/brand/megeredchian-law-tokens.css` (header 19–32; light block ends line 81; system-dark block ends 106; forced-dark block ends 130)
- Modify: `app/styles/brand/megeredchian-law-tokens.json` (`carbonMapping.g10` after the `--sp-pill-search-edge` line ~57; `carbonMapping.g100` after ~66)

**Interfaces:**
- Produces: `--sp-recep-row-locked` resolving to `rgb(251, 232, 220)` light / `rgb(82, 82, 82)` dark; `--sp-recep-row-bar` resolving to `rgb(232, 160, 122)` dark (light unchanged `rgb(184, 92, 46)`). Task 5's rig asserts exactly these serialisations.

- [ ] **Step 1: Add the failing pin.** In the brand-layer test, after the line `assert.match(light, /--sp-pill-badge:\s*#8A3FFC/i);` add:

```js
  // O4 (Phase 5 PR 4, owner ruling 2026-09-09): the Reception locked row is the search's hit, so it takes the
  // hit surface — light the O2 tint, dark layer-selected-02; the dark bar carries the hue as O2's dark edge does.
  assert.match(light, /--sp-recep-row-locked:\s*#FBE8DC/i, "light locked row is the O2 tint (O4)");
  assert.doesNotMatch(light, /--sp-recep-row-bar/i, "light bar stays --cds-border-interactive (terracotta) — no override");
```

and inside the `for (const re of blocks.slice(1))` loop, after `assert.match(dark, /--sp-pill-badge:\s*#BE95FF/i);` add:

```js
    assert.match(dark, /--sp-recep-row-locked:\s*#525252/i, "dark locked row is layer-selected-02, one neutral step above the header (O4)");
    assert.match(dark, /--sp-recep-row-bar:\s*#E8A07A/i, "dark row bar is the dark link colour — terracotta is 1.71:1 on #525252 (O4 / R5)");
```

Also add, after the existing `assert.equal(countMatches(...#EB7C35...)` style checks near line 429 (find the block that asserts `sp-tokens.css` is untouched, or add a new assertion at the end of the test):

```js
  // The neutral default stays in sp-tokens.css — the brand file overrides, it does not replace.
  assert.match(read("app/styles/sp-tokens.css"), /--sp-recep-row-locked:\s*var\(--cds-layer-selected-01\)/);
  assert.match(read("app/styles/sp-tokens.css"), /--sp-recep-row-bar:\s*var\(--cds-border-interactive\)/);
```

- [ ] **Step 2: Run, expect FAIL**

```bash
node --test tests/phase4-token-layer-source.test.mjs
```
Expected: the brand-layer test fails on `--sp-recep-row-locked` light.

- [ ] **Step 3: Add O4 to the brand file.** Header: after the O3 bullet (line 29, ending `DECISIONS §6 no. 17.`) and before `Both are expressed by overriding…` (line 30), insert:

```
   Phase 5 PR 4 addition (owner ruling 2026-09-09, built the same day):
   · O4 — Reception's LOCKED ROW is the search's hit, so it takes the hit
     surface: light the O2 tint #FBE8DC; dark layer-selected-02 #525252, one
     neutral step above the header's layer-selected-01 (O2's "light tints,
     dark steps neutral" shape). Separates locked from the count header AND
     from the hover / cursor row (layer-hover-01), which sat one ladder rung
     apart in both themes. The dark ROW BAR moves to #E8A07A with it (R5):
     terracotta is 1.71:1 on #525252 — under the 3:1 graphic floor (it was
     already 2.53 on #393939) — the same reason O2 never uses it as a dark
     edge. DECISIONS D3-g; not a §6 deviation.
```

Light block — after `--sp-pill-badge: #8A3FFC;` (line 80), before `}`:

```css
  /* O4 — Reception locked row (light): the O2 tint. text-primary on #FBE8DC 15.23:1; helper-on-row gray-70
     6.58:1 (AA text); the bar --cds-border-interactive #B85C2E on it 3.84:1 (graphic ≥ 3). The bar itself
     is not overridden here — light keeps terracotta. */
  --sp-recep-row-locked: #FBE8DC;
```

System-dark block — after `--sp-pill-badge: #BE95FF;` (line 105), before `  }`:

```css
    /* O4 — Reception locked row (dark): layer-selected-02, one neutral step above the header's #393939 —
       separation by value, as O2's dark fill. text-primary on #525252 7.10:1; helper-on-row gray-30 4.57:1
       (AA text). The bar takes the dark link colour (R5): #E8A07A on #525252 3.62:1, on the cursor row
       #333333 5.86:1, on the header #393939 5.36:1 — terracotta measured 1.71 / 2.77 / 2.53 there. */
    --sp-recep-row-locked: #525252;
    --sp-recep-row-bar: #E8A07A;
```

Forced-dark block — after `--sp-pill-badge: #BE95FF;` (line 129), before `}`:

```css
  /* O4 — as the system-dark block above */
  --sp-recep-row-locked: #525252;
  --sp-recep-row-bar: #E8A07A;
```

The ratios in these comments are the ones the checker printed in planning; Task 2 re-runs the checker and, if any digit differs, the comment is corrected to the checker's output.

- [ ] **Step 4: Mirror in the `.json` sibling.** Under `carbonMapping.g10`, after the `"--sp-pill-search-edge": "#B85C2E",` line, add `"--sp-recep-row-locked": "#FBE8DC",` (mind trailing commas). Under `carbonMapping.g100`, after `"--sp-pill-search-edge": "#E8A07A",` add `"--sp-recep-row-locked": "#525252",` and `"--sp-recep-row-bar": "#E8A07A",`. Validate: `node -e "JSON.parse(require('fs').readFileSync('app/styles/brand/megeredchian-law-tokens.json','utf8'))"`.

- [ ] **Step 5: Run, expect PASS**

```bash
node --test tests/phase4-token-layer-source.test.mjs
```
Expected: all tests in the file pass (hex rule, ledger two rows, lockstep, brand layer).

- [ ] **Step 6: Commit**

```bash
git add app/styles/brand/megeredchian-law-tokens.css app/styles/brand/megeredchian-law-tokens.json tests/phase4-token-layer-source.test.mjs
git commit -m "feat(brand): O4 — Reception locked row takes the hit surface; dark bar carries the hue (Phase 5 PR 4)"
```

---

### Task 2: Contrast pairs — retarget and regenerate

**Files:**
- Modify: `docs/redesign-v2/phase3/contrast/generate-pairs.mjs` — lines 119 and 130 (the mis-measured "row bar / tab bar" pairs, ruling A), 124 and 135 (the two `Reception locked row meta` pairs)
- Regenerate: `docs/redesign-v2/phase3/contrast/product-pairs.json`, `surface-pairs-not-gated.json`

- [ ] **Step 1: Edit the pair declarations.** Four replacements, in file order.

Line 119 — replace
```js
add(gated, "light · row bar / tab bar blue-60 on layer-hover-01 (Reception highlighted row)", P.b60, P.hoverWhite, "graphic");
```
with (ruling A — the bar is `--cds-border-interactive` = terracotta since the brand layer; the tab bar gets its own pair on its real host)
```js
// Ruling A (Phase 5 PR 4, 2026-09-10): these two measured Carbon blue for a bar the brand layer had made terracotta.
add(gated, "light · Reception row bar terracotta on layer-hover-01 #e8e8e8 (cursor row; was measured as blue-60)", BRAND.terracotta, P.hoverWhite, "graphic");
add(gated, "light · tab bar terracotta on the tabs host (background white; --sp-tabs-bg)", BRAND.terracotta, P.white, "graphic");
```

Line 124 — replace
```js
add(gated, "light · Reception locked row meta gray-70 on layer-selected", P.g70, P.g20, "text");
```
with
```js
// O4 (Phase 5 PR 4, owner ruling 2026-09-09): the locked row moved from layer-selected to the hit surface.
add(gated, "light · Reception locked row text gray-100 on the hit tint #fbe8dc (O4)", P.g100, BRAND.tint, "text");
add(gated, "light · Reception locked row meta gray-70 on the hit tint #fbe8dc (O4; was layer-selected)", P.g70, BRAND.tint, "text");
add(gated, "light · Reception row bar terracotta on the locked hit tint #fbe8dc (O4)", BRAND.terracotta, BRAND.tint, "graphic");
```

Line 130 — replace
```js
add(gated, "dark · row bar / tab bar blue-50 on layer-hover-01 #333333", P.b50, P.hoverG90, "graphic");
```
with
```js
add(gated, "dark · Reception row bar #E8A07A on the cursor row layer-hover-01 #333333 (O4 / R5; was measured as blue-50)", BRAND.darkLink, P.hoverG90, "graphic");
add(gated, "dark · tab bar terracotta on the tabs host (background #161616; --sp-tabs-bg)", BRAND.terracotta, P.g100, "graphic");
```

Line 135 — replace
```js
add(gated, "dark · Reception locked row meta gray-30 on layer-selected #393939", P.g30, P.g80, "text");
```
with
```js
add(gated, "dark · Reception locked row text gray-10 on layer-selected-02 #525252 (O4)", P.g10, P.g70, "text");
add(gated, "dark · Reception locked row meta gray-30 on layer-selected-02 #525252 (O4; was layer-selected #393939)", P.g30, P.g70, "text");
add(gated, "dark · Reception row bar #E8A07A on the locked layer-selected-02 #525252 (O4 / R5)", BRAND.darkLink, P.g70, "graphic");
add(notGated, "dark · Reception row bar terracotta on layer-selected-02 #525252 — the value R5 replaces (fails 3:1)", BRAND.terracotta, P.g70, "graphic");
// Ruling B: the other dark --cds-border-interactive consumers, measured and carried — not gated, not fixed here.
add(notGated, "dark · nav current / menu [aria-current] / palette-row bar terracotta on layer-selected #393939 — carried — dark --cds-border-interactive consumers, owner ruling pending", BRAND.terracotta, P.g80, "graphic");
add(notGated, "dark · AI border start terracotta on the hovered label layer-hover-01 #333333 — carried — dark --cds-border-interactive consumers, owner ruling pending", BRAND.terracotta, P.hoverG90, "graphic");
```

Light lines that land (ruling D's five): row bar on hover, tab bar on white, locked text, locked meta, bar on tint. Expected totals: gated 206 − 2 + 3 + 3 + 2 = **212**; not-gated 14 + 3 = **17**. These are expectations — Step 2 records what the script prints, and Task 6 uses the printed numbers.

- [ ] **Step 2: Regenerate and check**

```bash
node docs/redesign-v2/phase3/contrast/generate-pairs.mjs
PYTHONUTF8=1 python "C:/Users/JP/.claude/plugins/cache/megeredchian/design-system/1.3.0/skills/ibm-design-language/scripts/check_contrast.py" --pairs docs/redesign-v2/phase3/contrast/product-pairs.json | tail -12
```
Expected: `product-pairs.json: 212 pairs · surface-pairs-not-gated.json: 17 pairs` and `212/212 pass` — if the printed counts differ, the printed counts are the record. Grep the new lines and compare every ratio to the brand-file comments from Task 1 (15.23 / 6.58 / 3.84 / 7.10 / 4.57 / 3.62 / 5.86) and to ruling A's expectations (light row bar on hover 3.72, light tab bar 4.56, dark tab bar 3.97). If any brand-file comment differs from the checker, fix the comment. If any gated text pair is under 4.5 or any gated graphic pair under 3.0: **stop, report to the owner** (the hand-off's gate) — the gate is not loosened and not made to fail.

- [ ] **Step 3: Save the summary for PHASE5**

```bash
mkdir -p docs/redesign-v2/phase5/screenshots/phase5-pr4/contrast
PYTHONUTF8=1 python "<checker>" --pairs docs/redesign-v2/phase3/contrast/product-pairs.json | grep -E "Reception (locked|row bar)|^[0-9]+/[0-9]+ pass" > docs/redesign-v2/phase5/screenshots/phase5-pr4/contrast/summary.txt
```

- [ ] **Step 4: Commit**

```bash
git add docs/redesign-v2/phase3/contrast/ docs/redesign-v2/phase5/screenshots/phase5-pr4/contrast/summary.txt
git commit -m "docs(contrast): O4 locked-row pairs + ruling A bar retarget — <N> gated, all pass (Phase 5 PR 4)"
```

---

### Task 3: ct pin — lock on row 1, cursor on row 2

**Files:**
- Modify: `tests/reception-screen.test.mjs` — add after the test `"the cursor clamps at both ends instead of wrapping"` (the cursor section, ~line 182)

Helpers already in the file: `renderReception`, `type`, `press`, `lockByTyping`, `lockedRows`, `highlighted`. Fixture: `PEOPLE` — Alice Adams (p1, Litigation) and Bob Baker (Litigation) are rows 1 and 2 for the query "Litigation".

- [ ] **Step 1: Write the test**

```js
test("Phase 5 PR 4: the lock stays on row 1 while the cursor moves to row 2 — two rows, two attributes, the states O4's surfaces tell apart", async () => {
  await renderReception();
  lockByTyping("Alice");
  assert.equal(lockedRows().length, 1);
  assert.match(lockedRows()[0].textContent, /Alice Adams/);
  assert.equal(highlighted().length, 0, "no cursor at rest after the lock");

  type("Litigation");
  assert.equal(highlighted().length, 1);
  assert.ok(highlighted()[0] === lockedRows()[0], "the cursor starts on row 1 — the locked row carries both attributes");

  press("ArrowDown");
  assert.equal(lockedRows().length, 1, "the lock survives the cursor moving");
  assert.match(lockedRows()[0].textContent, /Alice Adams/);
  assert.equal(highlighted().length, 1);
  assert.match(highlighted()[0].textContent, /Bob Baker/);
  assert.ok(highlighted()[0] !== lockedRows()[0], "cursor and lock are different rows");
  assert.equal(highlighted()[0].getAttribute("aria-selected"), "false");
});
```
(Element identity via `assert.ok(a === b)` — `assert.equal` on DOM nodes hangs.)

- [ ] **Step 2: Run**

```bash
node --test tests/reception-screen.test.mjs
```
Expected: PASS — this is a pin of shipped behaviour (the Esc-ladder keeps the lock through a typed query), not a defect fix. If it fails, the behaviour differs from the record: stop and report.

- [ ] **Step 3: Commit**

```bash
git add tests/reception-screen.test.mjs
git commit -m "test(reception): pin lock on row 1 + cursor on row 2 as distinct rows (Phase 5 PR 4)"
```

---

### Task 4: Sheet amendment K — the readout column's gap

**Files:**
- Modify: `app/styles/sp-components.css:1102-1103` and `docs/redesign-v2/phase3/components/sp-components.css:1102-1103` (identical edits)

- [ ] **Step 1: Confirm the lockstep test passes before touching the sheet**

```bash
node --test tests/phase4-token-layer-source.test.mjs
```

- [ ] **Step 2: Edit both copies identically.** Replace line 1102 `/* readout column — sticky, 32 padding */` and line 1103 with:

```css
/* readout column — sticky, 32 padding */
/* Phase 5 PR 4 amendment K (PHASE3DS §1.29 amendment; owner ruling R4, 2026-09-09; PHASE5 PR 2 "Carried"): the
   column's gap between its groups — band, tail, recents — is 24 (--sp-space-06); the 16 INSIDE the band and inside
   the tail (the rule below) stands. Tight inside a group, loose between (the rubric's spacing rule). Amendment I's
   "carry its own 16 rhythm" clause is superseded for the gap between groups only; nothing inside either group moves,
   and below the 1055 fold the column is display: contents, so nothing changes there. Both copies, byte-identical.
   The locked row's surface is NOT a sheet change: it is the brand file's O4 override of --sp-recep-row-locked
   (and the dark --sp-recep-row-bar) — the rule at [aria-selected="true"] and the token names are unchanged. */
.sp-recep-readout { position: sticky; top: calc(var(--sp-shell-header-h) + var(--sp-space-05)); padding: var(--sp-space-07); background: var(--sp-background); box-shadow: inset 1px 0 0 var(--sp-border-subtle-00); display: flex; flex-direction: column; gap: var(--sp-space-06); min-height: 400px; }
```
Only the `gap:` value changes on the rule line; `top:` keeps `--sp-space-05`. Line 1110 (`.sp-recep-band, .sp-recep-tail { … gap: var(--sp-space-05); }`) is untouched.

- [ ] **Step 3: Verify byte-identity and the token layer**

```powershell
(Get-FileHash app/styles/sp-components.css).Hash -eq (Get-FileHash docs/redesign-v2/phase3/components/sp-components.css).Hash
```
Expected `True`. Then `node --test tests/phase4-token-layer-source.test.mjs` — PASS.

- [ ] **Step 4: Commit**

```bash
git add app/styles/sp-components.css docs/redesign-v2/phase3/components/sp-components.css
git commit -m "feat(reception): sheet amendment K — 24 between the readout's groups at wide (Phase 5 PR 4)"
```

---

### Task 5: The audit rig, baseline on main, captures

**Files:**
- Create: `docs/redesign-v2/phase5/audit/pr4-reception-locked-row.mjs`
- Create: `docs/redesign-v2/phase5/screenshots/phase5-pr4/` (`results.json`, `results-main.json`, PNGs, `README.md`)

Precedents: `phase5/audit/pr2-reception-narrow.mjs` (sign-in, `setTheme`, lock helper, widths), `phase5/audit/pr3-names-off-marker.mjs` (real Chrome + CDP `crop3x`, `--baseline`). Seeded viewer: `e2e-viewer@example.test`; its password is in `tests/e2e-auth/auth-helpers.ts`.

- [ ] **Step 1: Write the rig**

```js
// Phase 5 PR 4 capture + hit-test rig — Reception's locked row gets its own surface (+ the band→tail gap).
//
// Proves owner ruling R1 (option C: the locked row takes the hit surface — light the O2 tint #FBE8DC, dark
// layer-selected-02 #525252), R2 (hovering the locked row changes nothing), R3 (480 / 640 / 800 / 1024 /
// 1920 × both themes), R4 (sheet amendment K: 24 between the readout column's groups at wide, the band's own
// box unmoved against a build of main) and R5 (the dark bar is #E8A07A — O2's dark-edge shape).
//
// EVERY colour claim is a COMPUTED-STYLE comparison on the live rows; every geometric claim is a rect
// measurement. The 3x crops are for the reviewer's eyes, not for pass / fail.
//
// Usage: node docs/redesign-v2/phase5/audit/pr4-reception-locked-row.mjs <baseUrl> <outDir> <email> <password> [--baseline <results.json from a run on main>]
// Run against the LOCAL Docker stack only (npm run db:start + db:seed; seeded viewer e2e-viewer@example.test,
// tests/e2e-auth/auth-helpers.ts). Reception is read-only, but local dev writes to PRODUCTION — the habit is
// the point. On main (the baseline run) the colour claims FAIL by design; keep its results.json for --baseline.
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
const require = createRequire(new URL("../../../../package.json", import.meta.url));
const { chromium } = require("playwright");

const argv = process.argv.slice(2);
const baselineIdx = argv.indexOf("--baseline");
const baselinePath = baselineIdx >= 0 ? argv.splice(baselineIdx, 2)[1] : null;
const [base = "http://localhost:3300", outDir = "out", email = "e2e-viewer@example.test", password] = argv;
if (!password) { console.error("viewer email + password required (local seed)"); process.exit(2); }
mkdirSync(outDir, { recursive: true });
const baseline = baselinePath && existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, "utf8")) : null;

const WIDTHS = [480, 640, 800, 1024, 1920];
const THEMES = ["light", "dark"];
// The ruled values as Chrome serialises them (O4 / R5 in the brand file).
const EXPECT = {
  light: { locked: "rgb(251, 232, 220)", header: "rgb(224, 224, 224)", hover: "rgb(232, 232, 232)", bar: "rgb(184, 92, 46)" },
  dark: { locked: "rgb(82, 82, 82)", header: "rgb(57, 57, 57)", hover: "rgb(51, 51, 51)", bar: "rgb(232, 160, 122)" },
};
const results = [];
const measurements = [];
let failures = 0;
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}
const near = (a, b, tol = 0.75) => Math.abs(a - b) <= tol;

const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await context.newPage();
context.setDefaultTimeout(10000);
const cdp = await context.newCDPSession(page);

async function signIn() {
  await page.goto(`${base}/login`, { waitUntil: "networkidle" });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: /^Log in$/ }).click();
  await page.waitForURL(/\/(admin|reception|$)/, { timeout: 30_000 });
}
async function setTheme(theme) {
  await page.evaluate(t => {
    localStorage.setItem("sp-theme", t);
    document.documentElement.setAttribute("data-theme", t);
    document.documentElement.setAttribute("data-carbon-theme", t === "dark" ? "g100" : "white");
  }, theme);
  await page.waitForTimeout(150);
}
async function openReception(width, theme) {
  await page.setViewportSize({ width, height: width >= 1920 ? 1080 : 900 });
  await page.goto(`${base}/reception`, { waitUntil: "networkidle" });
  await setTheme(theme);
  await page.evaluate(() => document.fonts.ready);
  await page.locator("li[role=option]").first().waitFor();
}
const rows = () => page.locator("li[role=option]");
const row = i => rows().nth(i);
const header = () => page.locator(".sp-recep-header");
const search = () => page.locator("#reception-main");
const bg = loc => loc.evaluate(el => getComputedStyle(el).backgroundColor);
const shadow = loc => loc.evaluate(el => getComputedStyle(el).boxShadow);
const rectOf = loc => loc.evaluate(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; });
async function lockRow(i) {
  const name = (await row(i).locator(".sp-recep-name").textContent()).trim();
  await search().fill(name);
  await page.waitForTimeout(120);
  await page.keyboard.press("Enter");
  await page.waitForSelector('li[role=option][aria-selected="true"]');
  await page.waitForTimeout(150);
  return name;
}
// Put the keyboard cursor on a row that is NOT the locked one, with the locked row still listed.
async function cursorOffTheLock() {
  for (const q of ["a", "e", "i", "o", "n", "r"]) {
    await search().fill(q);
    await page.waitForTimeout(120);
    if ((await rows().count()) < 2 || (await page.locator('li[role=option][aria-selected="true"]').count()) !== 1) continue;
    for (let i = 0; i < 6; i += 1) {
      const hl = page.locator("li[role=option][data-highlight]");
      if ((await hl.count()) === 1 && (await hl.getAttribute("aria-selected")) !== "true") return hl;
      await page.keyboard.press("ArrowDown");
      await page.waitForTimeout(80);
    }
  }
  return null;
}
// 3x crop of a css-px clip through CDP's own clip scale (Playwright's screenshot() renders at the context's DSF).
async function crop3x(clip, file) {
  const shot = await cdp.send("Page.captureScreenshot", { format: "png", clip: { ...clip, scale: 3 }, captureBeyondViewport: false });
  writeFileSync(path.join(outDir, file), Buffer.from(shot.data, "base64"));
}
async function cropRows(fromLoc, toLoc, file) {
  const a = await rectOf(fromLoc), b = await rectOf(toLoc);
  const y = Math.min(a.y, b.y), bottom = Math.max(a.bottom, b.bottom);
  await crop3x({ x: a.x, y, width: a.width, height: bottom - y }, file);
}

await signIn();
for (const theme of THEMES) {
  for (const width of WIDTHS) {
    const tag = `${width}-${theme}`;
    const E = EXPECT[theme];
    await openReception(width, theme);
    // Lock row 2 then row 1: "Recent lookups" exists (the column's third child) and row 1 holds the lock.
    await lockRow(1);
    await lockRow(0);

    // 1 — R1: three surfaces, pairwise distinct, at the ruled values.
    const lockedBg = await bg(row(0));
    const headerBg = await bg(header());
    await row(1).hover();
    await page.waitForTimeout(100);
    const hoverBg = await bg(row(1));
    record(`${tag} 1 locked row is the hit surface`, lockedBg === E.locked, `${lockedBg} (want ${E.locked})`);
    record(`${tag} 1 header · locked · hovered are three surfaces`, new Set([lockedBg, headerBg, hoverBg]).size === 3, `header ${headerBg} · locked ${lockedBg} · hover ${hoverBg}`);
    record(`${tag} 1 header and hover surfaces unchanged`, headerBg === E.header && hoverBg === E.hover, `${headerBg} / ${hoverBg}`);
    await cropRows(header(), row(1), `01-header-locked-hover-3x-${tag}.png`);
    await page.screenshot({ path: path.join(outDir, `01-locked-row1-${tag}.png`) });

    // 2 — R2: hovering the locked row leaves it alone.
    await row(0).hover();
    await page.waitForTimeout(100);
    record(`${tag} 2 hovering the locked row changes nothing`, (await bg(row(0))) === lockedBg, await bg(row(0)));
    await page.mouse.move(0, 0);

    // 3 — R5: the 3px bar.
    const sh = await shadow(row(0));
    record(`${tag} 3 the locked row's 3px bar is ${E.bar}`, sh.includes(E.bar) && /3px/.test(sh), sh);

    // 4 — lock on row 1, cursor elsewhere: two visibly different rows.
    const hl = await cursorOffTheLock();
    if (hl) {
      const hlBg = await bg(hl);
      const locked = page.locator('li[role=option][aria-selected="true"]');
      record(`${tag} 4 cursor row is the hover surface, the lock keeps the hit surface`, hlBg === E.hover && (await bg(locked)) === E.locked, `cursor ${hlBg} · locked ${await bg(locked)}`);
      record(`${tag} 4 the cursor row's bar is ${E.bar}`, (await shadow(hl)).includes(E.bar), await shadow(hl));
      await cropRows(locked, hl, `02-locked-and-cursor-3x-${tag}.png`);
    } else {
      record(`${tag} 4 cursor row found off the lock`, false, "no query put the cursor on a second row while the lock stayed listed");
    }
    await page.keyboard.press("Escape"); // clears the query, keeps the lock
    await page.waitForTimeout(120);

    // 5 — R4 (1920 only): 24 between the column's groups; the band's own box equals main's.
    if (width === 1920) {
      const band = await rectOf(page.locator(".sp-recep-band"));
      const tile = await rectOf(page.locator(".sp-recep-band .sp-readout"));
      const tailLoc = page.locator(".sp-recep-tail"), recentLoc = page.locator(".sp-recep-recent");
      let tail = null, recent = null;
      if (await tailLoc.count()) { tail = await rectOf(tailLoc); record(`${tag} 5 band→tail gap is 24`, near(tail.y - band.bottom, 24), `${(tail.y - band.bottom).toFixed(2)}`); }
      else record(`${tag} 5 band→tail gap is 24`, false, "no tail rendered — the locked person needs a seat (Show on map) or same-department fallbacks");
      if (tail && (await recentLoc.count())) { recent = await rectOf(recentLoc); record(`${tag} 5 tail→recents gap is 24`, near(recent.y - tail.bottom, 24), `${(recent.y - tail.bottom).toFixed(2)}`); }
      measurements.push({ tag, band, tile, tail, recent });
      if (baseline) {
        const b = baseline.measurements.find(m => m.tag === tag);
        const same = (p, q) => p && q && ["x", "y", "width", "height"].every(k => near(p[k], q[k], 0.5));
        record(`${tag} 5 the band's box and the tile's box are pixel-identical to main`, same(band, b?.band) && same(tile, b?.tile), JSON.stringify({ band, main: b?.band }));
      }
      await page.screenshot({ path: path.join(outDir, `03-readout-1920-${theme}.png`) });
    }

    // 6 — below the fold the locked row under the pinned band still reads (hit test + capture).
    if (width < 1056) {
      await row(0).scrollIntoViewIfNeeded();
      await page.waitForTimeout(150);
      const r = await rectOf(row(0));
      const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest("li[role=option]")?.getAttribute("aria-selected") ?? null, [r.x + 8, r.y + r.height / 2]);
      record(`${tag} 6 the locked row is hittable under the pinned band`, hit === "true", `elementFromPoint → aria-selected=${hit}`);
      await page.screenshot({ path: path.join(outDir, `04-locked-under-band-${tag}.png`) });
    }
  }
}

writeFileSync(path.join(outDir, "results.json"), JSON.stringify({ generated: new Date().toISOString(), base, passed: results.filter(r => r.ok).length, total: results.length, results, measurements }, null, 2));
console.log(`${results.filter(r => r.ok).length}/${results.length} pass`);
await browser.close();
process.exit(failures ? 1 : 0);
```

- [ ] **Step 2: Baseline on main — from a second worktree (ruling C).** Start the Docker stack and point `.env.local` at it (CLAUDE.md / README recipe). Then:

```bash
git status --short            # must be EMPTY — if not, STOP and report; never git stash
git worktree add ../seat-planner-main main
cp .env.local ../seat-planner-main/.env.local          # untracked; points at the local stack
cd ../seat-planner-main && npm install && npm run build && npx next start -p 3301
# second shell, from E:\code\seat-planner (the branch checkout):
node docs/redesign-v2/phase5/audit/pr4-reception-locked-row.mjs http://localhost:3301 "C:/Users/JP/AppData/Local/Temp/claude/E--code-seat-planner/<session>/scratchpad/pr4-main" e2e-viewer@example.test <password>
# expect the colour claims to FAIL (main has no O4) and the gap claim to read 16 — the point is the measurements.
cp "<scratchpad>/pr4-main/results.json" docs/redesign-v2/phase5/screenshots/phase5-pr4/results-main.json
# stop the :3301 server, then:
git worktree remove ../seat-planner-main
git worktree prune && git branch --show-current   # expect feat/phase5-reception-locked-row
```
The branch checkout is never switched; the baseline captures stay in scratch — only `results-main.json` is committed.

- [ ] **Step 3: Run on the branch with the baseline**

```bash
npm run build && npx next start -p 3300
node docs/redesign-v2/phase5/audit/pr4-reception-locked-row.mjs http://localhost:3300 docs/redesign-v2/phase5/screenshots/phase5-pr4 e2e-viewer@example.test <password> --baseline docs/redesign-v2/phase5/screenshots/phase5-pr4/results-main.json
```
Expected: every claim PASS, exit 0. If any FAIL: it is a finding — fix only if it is in §3's scope, otherwise record it under "Carried" and report before the smoke.

- [ ] **Step 4: Open the crops** (`01-header-locked-hover-3x-1920-light.png`, `-dark`, `02-locked-and-cursor-3x-640-dark.png`, `04-locked-under-band-480-light.png`) with the Read tool and confirm by eye: header, locked row, hovered/cursor row read as three surfaces; the dark bar is the lighter apricot, not terracotta. Then write `docs/redesign-v2/phase5/screenshots/phase5-pr4/README.md` in the `phase5-pr2/README.md` shape: what each file is, source (rig name, commit SHA, date, local Docker stack, real Chrome), the run line, and the pass count.

- [ ] **Step 5: Commit**

```bash
git add docs/redesign-v2/phase5/audit/pr4-reception-locked-row.mjs docs/redesign-v2/phase5/screenshots/phase5-pr4/
git commit -m "docs(redesign-v2): phase 5 PR 4 rig + captures — five widths × two themes, baseline vs main"
```

---

### Task 6: The record

**Files:**
- Modify: `docs/redesign-v2/DECISIONS.md` (insert D3-g after line 1258, before the `---` at 1260; add one italic line after line 1487)
- Modify: `docs/redesign-v2/PHASE2UX.md:405-406`
- Modify: `docs/redesign-v2/phase3/PHASE3DS.md` §1.29 (append after the amendment I paragraph, ~line 682)
- Modify: `docs/redesign-v2/phase5/PHASE5.md` (index row at line 16; bullets at 236 and 241; `## PR 4` at EOF)
- Modify: `.claude/skills/brand-system/SKILL.md:20,24`

- [ ] **Step 1: DECISIONS D3-g.** Insert before the `---` that closes the D3 block:

```markdown
#### D3-g · The locked row is the search's hit, so it takes the hit surface — and in dark the bar carries the hue

*Ruled 2026-09-09 (Phase 5 PR 4, owner ruling R1 = option C, R5; reviewer defaults R2–R4 accepted). Built in the
same slice: brand-file O4, sheet amendment K. **Not** a §6 deviation — next free stays 19: the token aliases into a
surface the brand layer already defines (O2's precedent), as D3-f was not one.*

**Problem.** PHASE5 PR 2 carried "the count header and the locked row sit on the same surface". The reviewer's
mockup showed it wider: the hover / keyboard-cursor row is one ladder rung from the locked row in both themes —
header `layer-selected-01` #e0e0e0 / #393939, locked row the same, hover `layer-hover-01` #e8e8e8 / #333333. The
receptionist's most important state — *this is the person whose extension I am reading aloud* — was
indistinguishable from the header and nearly from "my mouse is here". A flat header or a 1px seam (options B, D)
would have left locked ≈ hover; leaving it (A) was declined.

**Choice (owner, 2026-09-09).** Option C. `--sp-recep-row-locked` keeps its name and its neutral default in
`sp-tokens.css`; the brand file overrides it the way O2 is expressed — light the O2 tint #FBE8DC (what
`--cds-highlight` already is), dark `layer-selected-02` #525252, one neutral step above the header ("light tints,
dark steps neutral"). Measured (the skill's checker): light text 15.23, helper 6.58, bar 3.84; dark text 7.10,
helper 4.57. **R5:** the dark bar (`--cds-border-interactive` #B85C2E) measured 1.71:1 on #525252 — under the
3:1 graphic floor, and already 2.53 on the header and 2.77 on the cursor row — so the dark blocks also override
`--sp-recep-row-bar: #E8A07A` (3.62 / 5.86 / 5.36), O2's "the edge carries the hue on dark" shape. Light keeps
terracotta. Hovering the locked row still does nothing (R2). Bundled: the readout column's gap between its
groups is 24 at wide (R4, sheet amendment K) — the PR 2 carry-over "band→tail gap equals the intra-band gap".

**What this supersedes.** PHASE2UX §1R.3 / PHASE3DS §1.29 "locked (↵) = selected surface + bar" → "locked =
hit surface + bar"; amendment I's "the column's own 16 rhythm" for the gap *between* groups only.

**Trade-off.** In dark the fill separates by value alone (#525252 vs #393939, 1.48:1) — the same choice O2 made
for the dark hit pill; the bar does the hue work. The light tint now means "hit" on the map and "locked" on
Reception — one meaning ("the thing the search found") on two surfaces.

**Would change if:** a desk reading finds the light tint reads as "search result" rather than "locked", or a
fourth row state appears that needs the tint.
```

Then after line 1487 (`no new deviation, next free stays 19.*`) add:

```markdown

*Phase 5 PR 4 (v2.4.0, 2026-09-09) is D3-g: a token alias into a surface the brand layer already defines (O2's
precedent) plus a spacing amendment; no new deviation, next free stays 19.*
```

- [ ] **Step 2: PHASE2UX §1R.3.** In the sentence at lines 405–406, after `locked row = layer-selected + bar.` insert:

```markdown
*Phase 5 PR 4 amendment (2026-09-09, owner ruling R1 = option C; DECISIONS **D3-g**; brand-file O4): the locked row is the hit surface — light the O2 tint, dark layer-selected-02 — and in dark the bar is the dark link colour (R5); "layer-selected + bar" is superseded.*
```

- [ ] **Step 3: PHASE3DS §1.29.** After the amendment I paragraph (ends `contrast was not re-run.`), before the `---`, add:

```markdown
**Phase 5 PR 4 amendment K (the locked row's own surface, and 24 between the readout's groups, 2026-09-09; owner
rulings R1 = C, R4, R5; DECISIONS D3-g; brand-file O4).** "Locked (↵) = selected surface + bar" above is superseded:
the locked row, the header and the hover / cursor row sat on one ladder rung (layer-selected-01 / layer-selected-01 /
layer-hover-01 — #e0e0e0 / #e0e0e0 / #e8e8e8 light, #393939 / #393939 / #333333 dark), so the row the receptionist is
reading from fused with the count header at row 1 and barely parted from the mouse. The row now takes the HIT surface
the way O2 expresses it — `--sp-recep-row-locked` keeps its name and its neutral default here; the brand file
overrides it to the O2 tint #FBE8DC (light) and layer-selected-02 #525252 (dark). Measured with the skill's checker:
light text 15.23, `text-helper-on-row` 6.58, bar 3.84; dark text 7.10, helper 4.57. The dark BAR moves with it (R5):
terracotta is 1.71:1 on #525252 (and was 2.53 on the header, 2.77 on the cursor row), so the dark blocks override
`--sp-recep-row-bar` to #E8A07A — 3.62 / 5.86 / 5.36 — the same reason O2 never uses terracotta as a dark edge; light
keeps it. Hovering the locked row changes nothing (the selected rule out-orders the hover rule at equal specificity —
R2). Sheet amendment K is the PR 2 carry-over: the readout column's gap between its three children — band, tail,
recents — is `--sp-space-06` (24) above the fold; the 16 inside the band and inside the tail stands; below 1055 the
column is `display: contents`, so nothing changes there. Both copies, byte-identical. Verified at 480 / 640 / 800 /
1024 / 1920 × both themes (R3) by `phase5/audit/pr4-reception-locked-row.mjs` against a build of main. Contrast
re-run: <N>/<N> gated pairs pass (the count the script printed in Task 2; ruling A retargeted the two "row bar / tab bar"
pairs that had measured Carbon blue since the brand layer).
```

- [ ] **Step 4: PHASE5.md.** (a) Index row after the PR 3 row:

```markdown
| PR 4 | Reception's locked row gets its own surface (O4), and 24 between the readout's groups (amendment K) | v2.4.0 | **in review** — `feat/phase5-reception-locked-row`, PR #<n> |
```
(b) Append to the PR 2 bullet at 236–240: ` → **fixed in PR 4 (v2.4.0, sheet amendment K).**` and to the bullet at 241–246: ` → **fixed in PR 4 (v2.4.0, owner ruling R1 = option C, brand-file O4, DECISIONS D3-g).**`
(c) Append a `## PR 4 — Reception's locked row gets its own surface` section in the PR 3 shape:

```markdown
---

## PR 4 — Reception's locked row gets its own surface (+ the band→tail gap)

**Plan of record:** `phase5/plans/phase5-pr4-reception-locked-row.md` (hand-off: `…-HANDOFF.md`).
**Rulings landed in DECISIONS:** D3-g (R1 = option C, R5 the dark bar; reviewer defaults R2–R4 accepted); §6 header
carries one line, next free stays 19.
**Skill fingerprint:** `f997ee525800e755`, verified before reading anything.

### What the slice is
<3–6 sentences: the ladder table from D3-g, option C, R5, amendment K; no .tsx change.>

### Engineering calls the code forced, one line each
- The value lives in the brand file, not `sp-tokens.css`: the semantic layer is hex-free and byte-locked to Phase 3; the brand file is the one place a product hex may live (O2's precedent).
- Two dark blocks, one value each: the system-dark `@media` block and the forced `g100` block are both required (the source test walks both).
- The dark bar override is a consequence, not a scope creep: R1's fill made a pre-existing 3:1 failure worse (2.53 → 1.71); the hand-off's own gate stopped the slice until the owner ruled R5.
- The hand-off's "PHASE3DS §1.22" is the page frame; Reception is §1.29 — amended there.
- The recents `<aside>` is the readout column's third direct child, so amendment K's 24 also lands tail→recents (R4 accepted with that).

### Contrast — the locked row's pairs
| pair | light | dark |
|---|---|---|
| text-primary on the locked fill | 15.23 | 7.10 |
| `--sp-text-helper-on-row` on the locked fill | 6.58 | 4.57 |
| bar on the locked fill | 3.84 (#B85C2E) | 3.62 (#E8A07A) |
| bar on the cursor row (light terracotta; dark #E8A07A, R5) | 3.72 | 5.86 |
| bar on the header (R5, dark only) | — | 5.36 |
| tab bar on its host (ruling A — measured for the first time as terracotta) | 4.56 | 3.97 |
| *retired:* terracotta bar on #525252 | — | 1.71 (not gated) |

Ruling A: `generate-pairs.mjs:119` / `:130` had measured Carbon blue 60 / 50 for "row bar / tab bar" — the static gate had never measured the terracotta bar on any row surface, which is why the dark 2.53 / 2.77 were never caught. Both retargeted; the tab bar is its own pair per theme.

```
<paste the two summary lines the script and the checker printed in Task 2 — the printed counts, not a number written in advance>
```

### Sheet amendment K (2026-09-09)
<one paragraph: `.sp-recep-readout` gap 05 → 06; line 1110 untouched; both copies; measured 24.00 band→tail and tail→recents at 1920 both themes; band + tile boxes identical to main's (rig claim 5).>

### Carried, not fixed
- **`npm run test:e2e:auth` still needs `npx supabase db reset --no-seed` between runs** — PR 2's note, unchanged.
- **Every dark 3px bar or edge resolving through `--cds-border-interactive` #B85C2E is under 3:1 on its layer today** (reviewer ruling B, 2026-09-10; measured with the skill's checker). R5 fixed the Reception row bar only. One row each — consumer · surface · ratio today · if #E8A07A:
  - `--sp-nav-current-bar` (`.sp-left-nav a[aria-current]`) · `--sp-nav-current-bg` = layer-selected-01 #393939 · **2.53** · 5.36
  - `.sp-menu button[aria-current]` bar · `--sp-layer-selected` #393939 · **2.53** · 5.36
  - `.sp-palette-row[aria-selected] / [aria-current]` bar · `--sp-layer-selected` #393939 · **2.53** · 5.36
  - `--sp-ai-border-start` on the hovered `.sp-ai-label` · layer-hover-01 #333333 · **2.77** · 5.86
  - `--sp-ai-border-start` at rest / `.sp-textarea--ai` · layer-01 / field-01 #262626 · 3.32 (passes) · 7.02
  - `.sp-menu-button[aria-expanded]` 1px rule · field-01 #262626 · 3.32 (passes)
  - `--sp-tab-bar` · `--sp-tabs-bg` = background #161616 · 3.97 (passes; now gated by ruling A) · 8.39
  - `--sp-shell-current-bar` (tier-C) · shell g100 · 3.97 (passes, ledgered)
  **Not fixed in PR 4** — a brand-layer question for the owner: either `--cds-border-interactive` goes #E8A07A in the two dark blocks (one line; every consumer follows — O2's dark-edge shape), or each failing consumer is themed like O4. The two failing surfaces are in `surface-pairs-not-gated.json` labelled "carried — dark --cds-border-interactive consumers, owner ruling pending". No DECISIONS entry until ruled.
- **`phase4/audit/pr5-smoke.mjs` asserts the locked bar is terracotta** — true in light, no longer in dark. phase4/ is closed record (PR 3 ruling A); not run for this slice.
<+ anything the rig surfaced>

### Verification, on the final head
<the run-line paragraph: unit N/N · ct · browser · e2e · e2e-auth (Docker) · runtime audit 0 undefined var() across 6 routes × 2 themes · static contrast <N>/<N> (printed) · lockstep byte-identical · `git diff main -- app/styles/sp-tokens.css app/styles/carbon-*.css` empty · `git diff --stat main -- docs/redesign-v2/phase4` empty>

**The capture + hit-test rig** `phase5/audit/pr4-reception-locked-row.mjs`: <N/N> claims at 480 / 640 / 800 / 1024 / 1920 × light / dark on `<sha>`, baseline `results-main.json` from a `next build` of main; captures in `screenshots/phase5-pr4/`.

**Brand checklist on the Vercel preview:** <the seven checklist lines with measured values>
```

- [ ] **Step 5: brand-system SKILL.md.** Line 24 (rule 1), append after `No blue is in use.`:

```
Reception's locked row takes the same hit surface (owner ruling O4, 2026-09-09, Phase 5 PR 4, DECISIONS D3-g): `--sp-recep-row-locked` light #FBE8DC / dark #525252 (layer-selected-02), and the dark `--sp-recep-row-bar` is #E8A07A because terracotta is 1.71:1 on #525252 — the same reason O2 never uses it as a dark edge.
```
Line 20 ("Where it lives"), after `--sp-ai-border-end\`)` add: `, and the O2 / O3 / O4 direct \`--sp-*\` overrides (\`--sp-pill-search-*\`, \`--sp-status-draft-mark\`, \`--sp-pill-badge\`, \`--sp-recep-row-locked\`, dark \`--sp-recep-row-bar\`)`.

- [ ] **Step 6: Commit**

```bash
git add docs/redesign-v2/DECISIONS.md docs/redesign-v2/PHASE2UX.md docs/redesign-v2/phase3/PHASE3DS.md docs/redesign-v2/phase5/PHASE5.md .claude/skills/brand-system/SKILL.md
git commit -m "docs(redesign-v2): phase 5 PR 4 — D3-g, PHASE2UX §1R.3, PHASE3DS §1.29 amendment K, PHASE5 PR 4, brand skill O4"
```

---

### Task 7: Full verification, PR, preview hand-off

- [ ] **Step 1: Static gates**

```bash
npm run typecheck && npm run lint && npm test
git diff main -- app/styles/sp-tokens.css app/styles/carbon-tokens.css app/styles/carbon-components.css   # expect empty
git diff --stat main -- docs/redesign-v2/phase4                                                             # expect empty
git grep -n "0f62fe" app components lib   # only app/styles/carbon-tokens.css
```

- [ ] **Step 2: Framework tiers** (needs `npm run build` first for e2e; Docker stack for e2e-auth)

```bash
npm run build && npm run test:ct && npm run test:browser && npm run test:e2e
npx supabase db reset --no-seed && npm run db:seed && npm run test:e2e:auth
```

- [ ] **Step 3: Runtime audit** (branch build on :3300, local stack)

```bash
node docs/redesign-v2/phase4/audit/runtime-audit.mjs http://localhost:3300 "C:/Users/JP/AppData/Local/Temp/claude/E--code-seat-planner/<session>/scratchpad/runtime-audit" e2e-admin@example.test <adminPassword> e2e-viewer@example.test
```
Expected: `undefined=0` on every route × theme line. (Output dir is scratch — the audit's screenshots are not committed for this slice.)

- [ ] **Step 4: Brand checklist in the real app** (`run-seat-planner` skill, `/reception`, both themes, row 1 locked): primary button `rgb(184, 92, 46)`, hover `rgb(143, 69, 33)`, focus ring #B85C2E 2px inset, header current-section bar #B85C2E, links light #8F4521 / dark #E8A07A, locked row `rgb(251, 232, 220)` / `rgb(82, 82, 82)`, locked bar light `rgb(184, 92, 46)` / dark `rgb(232, 160, 122)`. Record the values in PHASE5's PR 4 "Brand checklist" line (amend the Task 6 commit's section with a follow-up docs commit).

- [ ] **Step 5: Fill PHASE5's verification paragraph** with the actual counts from Steps 1–4 and the rig's `N/N` (a small docs commit: `docs(redesign-v2): phase 5 PR 4 — verification on <sha>`).

- [ ] **Step 6: Push and open the PR**

```bash
git push -u origin feat/phase5-reception-locked-row
gh pr create --title "feat(redesign-v2): phase 5 — Reception's locked row gets its own surface (PR 4, v2.4.0)" --body-file <body written to scratchpad>
```
PR body: what/why (the ladder table), rulings R1–R5 with R5's measurement, the two sheet-lockstep files, the contrast summary lines, the rig's pass line, the captures path, "no .tsx change", the Carried list, and the attribution footer:
```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01CCF7zjFjHpJY5Pq47sP2Em
```

- [ ] **Step 7: Hand off.** Wait for CI (verify + e2e + e2e-auth) green; fetch the Vercel preview URL (`get_git_deployment_context` / `list_deployments`); report to the owner: PR number, preview URL, "Reception is read-only — walk `/reception` in both themes with row 1 locked", the rig pass count, and that the reviewer writes the smoke next. **Do not merge.** Post-merge steps (owner's "go" again): annotated tag `v2.4.0` on the squash SHA, PHASE5 index row → "merged", docs commit `docs(redesign-v2): phase 5 — PR 4 merged (v2.4.0)`, prune the branch, memory update.

---

## Verification (end-to-end)

1. `npm test` green, `tests/phase4-token-layer-source.test.mjs` unchanged in its rules (two-row ledger, lockstep, hex-only-in-brand) and now pinning O4.
2. `<N>/<N> pass` from `check_contrast.py` (expected 212, recorded as printed); the brand-file comments carry the checker's numbers; the two "row bar / tab bar" pairs now measure terracotta, not blue (ruling A).
3. Rig: every claim PASS at 5 widths × 2 themes against a main baseline — three pairwise-distinct surfaces, no hover change on the lock, the bar's ruled colour per theme, the cursor row visibly different, 24 between the column's groups at 1920 with the band's own box unmoved, the locked row hittable under the pinned band below 1055.
4. Runtime audit 0 undefined `var()`; e2e-auth's `reception-keyboard.spec.ts` green (no `.tsx` changed).
5. Eyes: the 3x crops and the preview walk — header, locked, hovered read as three surfaces in both themes; the dark bar is apricot, not terracotta.

## Self-review notes

- Spec coverage: §3.1 (Task 1, 2), §3.2 (Task 4, rig claim 5), §3.3 (no .tsx — verified by file map), §4 record (Task 6, all five docs + skill), §5 tests/rigs (Tasks 1–5; `marker-contrast.mjs` not run), §6 verification (Task 7), §7 out-of-scope respected; R5 added beyond §3 by owner ruling in planning.
- The hand-off's helper fallback (§3.1 last paragraph) is moot: measured 6.58 light / 4.57 dark, both ≥ 4.5.
- Type consistency: token names `--sp-recep-row-locked`, `--sp-recep-row-bar`; rgb serialisations in the rig's `EXPECT` match the hex in Task 1; pair counts are expectations (212 / 17) in Task 2 and are replaced by the printed counts in Task 6 and PHASE3DS (ruling D).
- Reviewer rulings A–D (2026-09-10) folded: A → Task 2 lines 119/130 + tab-bar pairs; B → Context table + Task 6 Carried + two not-gated rows; C → Task 5 Step 2 worktree, no stash; D → five light lines confirmed, counts recomputed at run time.
- After approval (outside plan mode): save a feedback memory — "baseline builds come from a second worktree (`../seat-planner-main`), never by switching `main` in place, never `git stash`; a dirty tree at that point is a stop-and-report."
