# Phase 5 · PR 3 — the names-off marker becomes ● in the footprint · HAND-OFF

**For a fresh Claude Code session. Task 0 commits this file, then you plan in plan mode. Nothing is built
until the owner says "go".**

Reviewer: Cowork (design governance). Owner: Patrick. Written 2026-09-09.

---

## 0. Set-up, before you read anything else

```
main = c086f0a   (docs commit over squash 740fd57, tag v2.2.0, prod READY)
branch to cut = feat/phase5-names-off-marker      →  v2.3.0
```

1. `git fetch --prune && git status` — the remote holds `main` alone. If a local
   `feat/phase5-reception-narrow` still exists, delete it locally and **never push it**.
2. **Verify the skill fingerprint** with the PHASE3DS §0 recipe before you take any design rule as read:

   ```
   cd <plugin cache>/design-system/1.3.0/skills/ibm-design-language && \
   find . -type f | LC_ALL=C sort | while read f; do \
     printf '%s  %s\n' "$(sed 's/\r$//' "$f" | sha256sum | cut -d' ' -f1)" "$f"; done | \
     sha256sum | cut -c1-16
   ```

   Expect **`f997ee525800e755`** (14 files, 9 references, 193,908 bytes LF-normalised). A different value
   means the skill moved and PHASE3DS §4's verdicts need re-reading before you rely on them.
3. **Read order.** `CLAUDE.md` → `.claude/skills/brand-system/` (token values, contrast tooling, the
   per-PR verification checklist) → `docs/redesign-v2/phase3/PHASE3DS.md` §1.4 (seat marks), §1.16 (seat
   pill, including its PR 3b amendments) and §1.21 (band legend) → `docs/redesign-v2/phase4/PHASE4BUILD.md`
   §1.36 and the §3 contrast table → `docs/redesign-v2/phase5/PHASE5.md` → this file's §3.
4. Task 0 commits this file as `docs/redesign-v2/phase5/plans/phase5-pr3-names-off-marker-HANDOFF.md`.

---

## 1. The problem, as the owner put it

"Why is it just a black box when the names are off?" With Names off, every assigned seat on `/admin` and
`/` is a solid 28×28 block in `--sp-icon-primary` (gray-100 light / gray-10 dark). Names ON is correct and
is not touched by this slice — the reviewer verified it live in the owner's session in both themes.

## 2. What is actually wrong — verified, do not re-derive

The block is PHASE3DS §1.16 as ruled: *"names off = the assigned pill collapses to the filled 28 footprint
(`--sp-icon-primary`) while empty seats keep their symbols, and the legend follows the toggle (● when off)."*
Drawing every state of that block beside the legend (artifact "Names-Off Marker", real sheets, both themes)
exposed three defects that ship today:

| # | Finding | Evidence |
|---|---|---|
| F-1 | **The selected state is invisible with Names off.** `.sp-pill[data-state="selected"]` (sheet :544) draws a 2px `--sp-pill-selected-edge` inset, but `.sp-pill--names-off` (:558) is declared later at equal specificity with `box-shadow: none` and wins; in light theme `border-inverse` is gray-100 on a gray-100 fill anyway. Click an assigned seat with Names off — the inspector opens, the marker does not change. | sheet cascade; the strip's "selected" cell equals "rest" |
| F-2 | **The ◇ changed-in-draft badge is clipped to a corner nick.** `.sp-pill--names-off` sets `overflow: hidden` (to swallow name text that, with `visibleLabel = ""`, is never rendered) and that clips the 8px badge at −4/−4. §1.16 amendment (2) "the ◇ inverts on the filled footprint" never rendered a diamond. | `docs/redesign-v2/phase4/screenshots/pr3b-smoke/05-names-off-badge-light.png` shows the nick |
| F-3 | **Legend and marker disagree in shape.** The band shows ● Assigned while the plan paints ■ — the one place the legend's symbol is not the marker's symbol. `SeatMark.tsx`'s header even says "● never appears on the plan". | `MapStatusBand.tsx:65`, `SeatMark.tsx` header |

**Root cause, stated once:** §1.16 minted a *second* visual language for "assigned, names off" (a filled
block) instead of reusing the status-mark language every other seat already speaks (a 28px footprint with a
16px symbol inside). Everything the footprint already solved — hover, focus, selected, quiet, the badge —
had to be re-solved for the block, and three of those re-solutions are wrong.

## 3. Owner rulings (2026-09-09)

| | Ruling | Status |
|---|---|---|
| **R1** | **Option B** — assigned + names off renders the empty-seat footprint (`--sp-seat-footprint-fill` = layer-02, 1px `--sp-seat-footprint-border` edge) with the legend's own ● (`SeatMark kind="assigned-dot"`, `--sp-seat-mark-fill-color`) inside. Options A (leave) and C (lighter block) declined. | **ruled by the owner** |
| **R2** | Hover on the assigned footprint lifts to `--sp-layer-hover-02`, exactly as an open seat does — no flat-on-hover special case. | reviewer default — surface it in your plan for a one-word override |
| **R3** | One marker, both surfaces: `/admin` and `/` (`SeatMarker` is shared; the viewer's Names default is also off). | reviewer default — surface it |
| **R4** | Its own slice, Phase 5 PR 3 → **v2.3.0**. It touches the component sheet and needs the rig's contrast and hit-test pass. | reviewer default — surface it |

Record consequence, so you do not invent one: this is a **conformance fix to §1.16's own legend rule**
("the legend follows the toggle"), not a Carbon deviation. DECISIONS §6's next free number **stays 19**.
The record changes are a dated §1.16 amendment (3) in PHASE3DS, sheet **amendment J** in both lockstep
copies, and the `SeatMark.tsx` header sentence "● never appears on the plan" corrected.

## 4. The change — small on purpose

### 4.1 `components/seat-map/SeatMarker.tsx`

Keep the class name `sp-pill--names-off` and the `namesOff` gate exactly as they are — the deep-link tests,
`viewer-seat-finder`'s `markerMode`, `marker-contrast.mjs` and the `desktop-seat-marker-system-source` pins
all key on them, and "names off" is still a *state of the assigned marker*, not a different marker.
The only render change: when `namesOff`, the pill's children become

```tsx
<SeatMark kind="assigned-dot" />
{draftChanged ? <SeatMark kind="draft-badge" /> : null}
```

`visibleLabel` stays `""` there (the `textContent === ""` pins hold — an `<svg>` has no text). The
`accessibleSeatName` line is pinned by `accessibility-source:1312` and is unchanged.

### 4.2 Sheet amendment J — `app/styles/sp-components.css` **and** `docs/redesign-v2/phase3/components/sp-components.css`, byte-identical

Replace the names-off group (:556–:564) with a footprint-shaped one. Target rules, to be written in the
sheet's own voice with a dated amendment comment (the reviewer will diff both copies):

```css
/* Phase 5 PR 3 amendment J (PHASE3DS §1.16 amendment 3; owner ruling R1 = B, 2026-09-09): names off =
   the assigned pill takes the EMPTY-SEAT FOOTPRINT and carries the legend's ● — one status-mark language
   on the plan (○ open · ● assigned · lock · hatch), and the legend is finally what the marker is.
   Supersedes the filled --sp-pill-names-off block: F-1 selected was out-cascaded to nothing, F-2 overflow
   clipped the ◇, F-3 legend ● vs plan ■. No overflow: hidden — there is no text to hide. */
.sp-pill--names-off { width: var(--sp-seat-footprint); padding: 0; justify-content: center;
  background: var(--sp-seat-footprint-fill); box-shadow: inset 0 0 0 1px var(--sp-seat-footprint-border); color: var(--sp-seat-mark-fill-color); }
.sp-pill--names-off:is(:hover, [data-state="hover"]) { background: var(--sp-layer-hover-02); }          /* R2 */
.sp-pill--names-off[aria-selected="true"], .sp-pill--names-off[data-state="selected"] { box-shadow: inset 0 0 0 var(--sp-space-01) var(--sp-pill-selected-edge); }   /* F-1: restated AFTER the modifier so the cascade cannot drop it again */
.sp-pill--names-off.sp-pill--quiet { background: var(--sp-pill-quiet-fill); box-shadow: inset 0 0 0 1px var(--sp-pill-quiet-edge); color: var(--sp-pill-quiet-text); }
.sp-pill--names-off.sp-pill--quiet:is(:hover, [data-state="hover"]) { background: var(--sp-pill-quiet-fill); }
```

and **delete** `.sp-pill--names-off .sp-pill-badge { fill: …names-off; color: …pill-fill }` (:556) — the
badge now sits on layer-02 like every other pill and the base `.sp-pill-badge` rule is correct as is.
The `.sp-pill--names-off .sp-seat-mark` colour comes through `currentColor` (`[data-fill] { fill: currentColor }`
at :110), so no new selector is needed for the ●. Search-hit (`--search`), origin, target and invalid never
combine with names-off (`namesOff` is false while a mode runs; a hit seat shows its name) — do not write
rules for them.

**Token check:** zero new tokens, zero token value changes. `--sp-pill-names-off` (sp-tokens :415) becomes
unused — **retire it** and record the retirement in the amendment comment; `phase4-token-layer-source`'s
SWEPT set is a retired-*group* list and does not need an entry for one token, but confirm no other consumer.

### 4.3 Record

- `PHASE3DS.md` §1.16: append **amendment (3)** dated 2026-09-09 — the sentence quoted in §2 above is
  superseded; names off = footprint + ●; F-1/F-2/F-3 named; owner ruling R1 = B; R2–R4 as ruled.
  Also strike the now-false clause in amendment (2) about the ◇ inverting on the filled footprint.
- `SeatMark.tsx` header: "● never appears on the plan" → "● is the names-off assigned marker on the plan and
  the legend's symbol while names are off (Phase 5 PR 3)".
- `PHASE5.md`: a **PR 3** section in the PR 1/PR 2 shape (What the slice is · Engineering calls · Sheet
  amendment J · Carried, not fixed · Verification on the final head).
- `DECISIONS.md`: no new D-entry, no §6 number. One line under the §6 header note: "PR 3 (v2.3.0) is a
  §1.16 conformance amendment, next free stays 19."

## 5. Tests — re-point, never loosen

| Test | What changes |
|---|---|
| `tests/desktop-seat-marker-system-source.test.mjs` :70 | the `.sp-pill--names-off { width: var(--sp-seat-footprint);` pin still matches; **add** a pin for the restated selected rule (`.sp-pill--names-off[data-state="selected"]`) and a negative pin that `.sp-pill--names-off` no longer declares `overflow: hidden` |
| `tests/seat-map-components.test.mjs` :156–:164, :241 | keep `textContent === ""`; add `button.querySelector("svg.sp-seat-mark circle[data-fill]")` present with names off; :241's "◇ on the filled footprint" wording → "◇ on the footprint" and additionally assert the badge is **not clipped**: `getComputedStyle(button).overflow !== "hidden"` (jsdom reads declared styles through the bundled sheet only if the harness loads it — if it does not, pin the sheet text instead in the source test) |
| `tests/viewer-seat-finder.test.mjs` :172, :479, :575 | `markerMode` keys on the class + empty text — unchanged, must still pass |
| `tests/seat-mark.test.mjs` :33 | wording only ("the ● the legend AND the plan show with names off") |
| `tests/map-status-band.test.mjs` :41 | unchanged |
| `docs/redesign-v2/phase4/audit/marker-contrast.mjs` :79 | the `namesOff` branch measured "footprint on the mat" (fill vs canvas). It now needs the **mark-on-fill pair** — ● (`svg.sp-seat-mark` color) on the footprint fill, min 3:1 — which the generic `mark` branch at :74 already produces once the svg exists. Keep the on-the-mat pair too (the footprint edge on the mat, min 3:1, as for open seats). Re-run and paste the four new pairs (● on layer-02, ● on quiet fill, ◇ on layer-02, edge on mat) × both themes into PHASE4BUILD §3's table as a dated PR 3 block |

## 6. Verification you owe before the smoke hand-off

Per `.claude/skills/brand-system/` checklist, plus: unit · ct · browser · e2e · e2e-auth (Docker stack) ·
runtime audit 0 undefined `var()` · contrast rig with the four new pairs · lockstep byte-identical · no
token value change · `HEX_LEDGER` two rows · `SWEPT` untouched. Captures the reviewer will read (real
Chrome 1920, both themes): the whole Floor 3 plan with Names off; a 3x crop of one assigned marker in
rest / hover / focus / selected / quiet / ◇; the band legend beside it; and the same crop with Names on
to prove nothing moved. Then the reviewer writes the smoke (hit-tests on the 44px touch target, keyboard
selection visible with Names off, badge fully painted).

## 7. Out of scope — do not touch

Names ON rendering; the 28px footprint size; `SeatMark` paths; the band legend logic; `lib/seatCrowding`
nudges; the toggle, its storage key or `?names=on`; any token value. If the plan wants more than §4, it
comes back to the owner first.
