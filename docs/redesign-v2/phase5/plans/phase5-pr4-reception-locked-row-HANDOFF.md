# Phase 5 · PR 4 — Reception's locked row gets its own surface (+ the band→tail gap) · HAND-OFF

**For a fresh Claude Code session. Task 0 commits this file, then you plan in plan mode. Nothing is built
until the owner says "go".**

Reviewer: Cowork (design governance). Owner: Patrick. Written 2026-09-09.

---

## 0. Set-up, before you read anything else

```
main = d9d52ee   (docs commit over squash bedecbb, tag v2.3.0, prod READY)
branch to cut = feat/phase5-reception-locked-row      →  v2.4.0
```

1. `git fetch --prune && git status` — the remote holds `main` alone and the working tree is clean (the
   2026-09-09 skills-installer leftovers were discarded by owner ruling; if anything untracked has reappeared,
   stop and report it before cutting the branch).
2. **Verify the skill fingerprint** with the PHASE3DS §0 recipe: expect **`f997ee525800e755`** (14 files).
3. **Read order.** `CLAUDE.md` → `.claude/skills/brand-system/` (the brand layer's O2/O3 conventions, contrast
   tooling, per-PR checklist) → `docs/redesign-v2/DECISIONS.md` D3 through D3-f → `docs/redesign-v2/PHASE2UX.md`
   §1R → `docs/redesign-v2/phase3/PHASE3DS.md` §1.22 → `docs/redesign-v2/phase5/PHASE5.md` (PR 2 and PR 3
   sections, especially PR 2's "Carried, not fixed") → `docs/redesign-v2/phase5/plans/phase5-pr2-reception-narrow.md`
   (amendment I's mechanism) → this file's §3.
4. Task 0 commits this file as `docs/redesign-v2/phase5/plans/phase5-pr4-reception-locked-row-HANDOFF.md`.

---

## 1. The problem

PHASE5's PR 2 section carried two 1920 critique findings. The first was recorded as "the count header and the
locked row sit on the same surface" — `.sp-recep-header` on `--sp-layer-selected` and
`.sp-recep-row[aria-selected="true"]` on `--sp-recep-row-locked`, both aliases of `--cds-layer-selected-01`, so
when the locked person is row 1 the two fuse into one slab with only the 3px bar between them.

**The reviewer's mockup (artifact "Reception Locked Row", real sheets at 1072, both themes) showed the finding
is wider than recorded.** The hover / keyboard-cursor row (`--sp-recep-row-highlight` = `layer-hover-01`) is one
ladder rung from the locked row in both themes:

| surface | light | dark |
|---|---|---|
| header · `layer-selected-01` | #e0e0e0 | #393939 |
| locked row · `--sp-recep-row-locked` | #e0e0e0 | #393939 |
| hover / cursor row · `layer-hover-01` | #e8e8e8 | #333333 |

So the receptionist's most important state — *this is the person whose extension I am reading aloud* — is
indistinguishable from the header and nearly indistinguishable from "my mouse is here". Fixing only the header
seam (a flat header, or a 1px rule) leaves locked ≈ hover in place. Options A (leave), B (flat header) and
D (1px seam) were declined on that basis.

## 2. Owner rulings (2026-09-09)

| | Ruling | Status |
|---|---|---|
| **R1** | **Option C** — the locked row moves to the **hit surface**: light = the O2 terracotta tint `#FBE8DC` (what `--cds-highlight` / `--sp-pill-search-fill` already are in light), dark = `#525252` (`--cds-layer-selected-02` on g100 — a neutral step above the header's #393939, the same "light tints, dark steps neutral" shape O2 gave the map's hit pill). Header, bar (`--sp-recep-row-bar`), row height, type — unchanged. | **ruled by the owner** |
| **R2** | Hovering the already-locked row does nothing (as today — the selected rule out-orders the hover rule, `.sp-recep-row[aria-selected="true"]` at :1099 after `:is(:hover…)` at :1097, equal specificity). No `layer-selected-hover` step. | reviewer default — surface it in the plan for a one-word override |
| **R3** | The slice verifies **480 / 640 / 800 / 1024 / 1920**, both themes, like PR 2 — below 1055 the same header and rows sit under the pinned band (amendment I), so the locked row's new surface must be read against the band there too. | reviewer default — surface it |
| **R4** | **Bundled:** the second PR 2 leftover — the band→tail gap at wide equals the intra-band gap (16 = 16). Raise the readout column's gap between its two groups to **`--sp-space-06` (24)** at wide; the gaps *inside* the band and inside the tail stay 16. Below 1055 the readout is `display: contents` (amendment I), so nothing changes there. | reviewer default — surface it |

## 3. The change

### 3.1 The locked row — a themed token, not a sheet rule

Keep the token name `--sp-recep-row-locked` and the sheet rule at :1099 exactly as they are. Change only what
the token resolves to, **the way O2 is expressed** in `app/styles/brand/megeredchian-law-tokens.css`: leave
`sp-tokens.css`'s Carbon-neutral default (`var(--cds-layer-selected-01)`) in place, and add a brand override
in all three theme blocks (light `:root, :root[data-carbon-theme="white"]`; dark under the
`prefers-color-scheme` guard; dark under `[data-carbon-theme="g100"]`), with an **O4** comment in the file's
existing voice:

```
/* O4 — Reception locked row (owner ruling 2026-09-09, Phase 5 PR 4): the person the receptionist locked is
   the search's hit, so the row takes the hit surface — light: the O2 tint; dark: layer-selected-02, one
   neutral step above the header's layer-selected-01. Separates locked from the count header AND from the
   hover / cursor row (layer-hover-01), which were one ladder rung apart in both themes. <pairs> */
--sp-recep-row-locked: #FBE8DC;      /* light */
--sp-recep-row-locked: #525252;      /* dark, both blocks */
```

The `<pairs>` in that comment are measured, never typed: text-primary on the fill, `--sp-text-helper-on-row`
(the meta line and seat code on a locked row) on the fill, the bar `--sp-recep-row-bar` on the fill, and the
row's bottom rule — light and dark. Expected order of magnitude: light 15.2 / ≈4.6 / 3.84 (the brand file
already records edge-on-tint 3.84); dark ≈7.0 / ≈4.5 / ≈3.5. Anything under 4.5 for text or 3 for the bar
stops the slice and comes back to the owner. Hex lives in the brand file only — `phase4-token-layer-source`
must stay green with `HEX_LEDGER` at two rows.

If `--sp-text-helper-on-row` on `#FBE8DC` measures under 4.5, the fix is **not** a darker tint: report it, and
the plan proposes the helper stepping to `--sp-text-primary` on the locked row only (one selector, no token).

### 3.2 The band→tail gap — sheet amendment K, both lockstep copies

`.sp-recep-readout` (:1103) is the wide readout column: `display: flex; flex-direction: column; gap:
var(--sp-space-05)`, holding `.sp-recep-band` and `.sp-recep-tail`, each themselves `gap: var(--sp-space-05)`
(:1110). Amendment K raises the **column's** gap to `var(--sp-space-06)` and leaves :1110 alone, with a dated
comment: tight inside a group, loose between groups (the rubric's spacing rule; PHASE5 PR 2 "Carried").
Byte-identical in `app/styles/sp-components.css` and `docs/redesign-v2/phase3/components/sp-components.css`.
Confirm with a hit-test at 1920 that the band's bottom edge to the tail's first element measures 24 and that
nothing inside either group moved (before/after pixel diff of the band's own box = 0).

Check what else lives directly inside `.sp-recep-readout` besides band and tail (the recents `<aside>` sat
outside the live region per PR 2 — if it is a third direct child, the 24 applies between it and the tail too,
and the plan says so).

### 3.3 Nothing else

Header rule, row grid, `--sp-recep-row-highlight`, the 3px bar, the narrow fold, the a11y-tree region names,
`scroll-margin-top`, the two aria-live regions — all untouched. No `.tsx` change is expected at all; if the plan
finds one is needed, it says why before "go".

## 4. Record

- **Brand file:** the O4 block above. `.claude/skills/brand-system/` gains one line naming O4 and the token.
- **DECISIONS.md:** a dated **D3-g** after D3-f — the locked row's surface is the hit surface, with the ladder
  table from §1 as the reason; and one line under §6's header: not a Carbon deviation (it is a token alias
  into a surface the brand layer already defines — O2's precedent), **next free stays 19**.
- **PHASE3DS §1.22** (Reception): a dated amendment paragraph naming R1–R4, the ladder, and amendment K.
- **PHASE2UX §1R.3** (or wherever the locked row's "selected surface + bar" sentence lives — find it, do not
  guess): one-line amendment.
- **PHASE5.md:** the PR 2 "Carried, not fixed" entries for both findings gain "→ fixed in PR 4 (v2.4.0)";
  a `## PR 4` section in the PR 1–3 shape, with the measured pairs table and the verification paragraph.
- `phase4/` is closed record — untouched (PR 3's ruling A).

## 5. Tests and rigs — re-point, never loosen

| Where | What |
|---|---|
| `tests/phase4-token-layer-source.test.mjs` | must pass unchanged: hex only in the brand file, `HEX_LEDGER` two rows, lockstep byte-identical |
| `tests/reception-screen.test.mjs` (ct) | add: the locked row carries `aria-selected="true"` and the cursor row `data-highlight` on *different* rows when row 1 is locked and the cursor moves — the behaviour C's colours now distinguish |
| a new source pin (in whichever source test already reads the brand file) | the brand file declares `--sp-recep-row-locked` in all three theme blocks; `sp-tokens.css` still declares the neutral default |
| `docs/redesign-v2/phase3/contrast/generate-pairs.mjs` | add the six locked-row pairs (three per theme); regenerate `product-pairs.json`; the checker's summary line goes into PHASE5 |
| `docs/redesign-v2/phase5/audit/pr4-reception-locked-row.mjs` (new; start from `pr2-reception-narrow.mjs`) | at 480 / 640 / 800 / 1024 / 1920 × both themes, real Chrome, Docker stack: (1) lock row 1 → its computed `background-color` ≠ the header's and ≠ a hovered row's, both differences ≥ 1 ladder step (assert the three resolved values are pairwise distinct); (2) hover the locked row → background unchanged (R2); (3) arrow the cursor to row 2 while row 1 stays locked → two visibly different rows; (4) at 1920 the band→tail gap measures 24 and the band's own box is pixel-identical to a main build (amendment K); (5) below 1055 the locked row under the pinned band still reads (capture); 3x crops of header + locked row 1 + cursor row 2 in both themes |
| `phase5/audit/marker-contrast.mjs` | not involved (map only) — do not run it for this slice |

## 6. Verification you owe before the smoke hand-off

Brand-system checklist; unit · ct · browser · e2e · e2e-auth (Docker) · runtime audit 0 undefined `var()` ·
static contrast with the six new pairs · lockstep byte-identical · `git diff main -- app/styles/sp-tokens.css
app/styles/carbon-*.css` empty (the only token-layer change is in the brand file) · `git diff --stat main --
docs/redesign-v2/phase4` empty. Captures the reviewer will read: the five widths × two themes with row 1 locked
and the cursor on row 2; the 1920 readout column before/after amendment K. Then the reviewer writes the smoke and
the read-only preview walk (Reception is read-only, so the owner may walk it himself).

## 7. Out of scope — do not touch

The header's tint or height; the row grid, type or the extension's `code-02`; amendment I's fold, order or the
band's contents; the hit surface tokens O2 defines for the map (`--sp-pill-search-*`, `--cds-highlight`); any
`.tsx`; anything on `/` or `/admin`. If the plan wants more than §3, it comes back to the owner first.

---

*Reviewer rulings on the plan (Cowork, 2026-09-10) — A (generate-pairs :119/:130 measured blue, retarget + tab bar
pairs), B (every dark `--cds-border-interactive` consumer measured and carried), C (baseline from a second
worktree, never stash), D (five light pair lines, counts recomputed at run time) — and the owner's R5 (dark bar
#E8A07A) are recorded in the plan of record, `phase5-pr4-reception-locked-row.md`.*
