# Phase 5 · PR 3 — the names-off marker becomes ● in the footprint (v2.3.0)

**Plan of record.** Hand-off: `phase5-pr3-names-off-marker-HANDOFF.md` (committed `05778a2`, Task 0).
Branch `feat/phase5-names-off-marker` (cut from `c086f0a`) → v2.3.0. Owner rulings **R1** (Option B) and
reviewer defaults **R2–R4** (2026-09-09, in the hand-off; R2–R4 confirmed by the owner the same day);
owner rulings on this plan's findings **P-1** (the pill ● and the band legend's ● share
`--sp-seat-mark-fill-color` — one attribute on MapStatusBand), **P-2** (amendment J is the minimal form: the
base `.sp-pill` rules already alias the footprint's roles, the old group is removed whole, the quiet ● steps by
one combined rule, F-1's cause corrected), **P-3** (§1.4 cross-amended, the sheet header and the specimen's
names-off cells corrected); reviewer rulings **A** (`phase4/` is closed record — the marker rig is COPIED to
`phase5/audit/` and the contrast table lives in PHASE5.md, PHASE4BUILD untouched; the hand-off's §5/§6 ask
for a closed-record edit is declined), **B** (the ◇-painted claim is a PNG paint sample, not `elementFromPoint`
— `.cds-touch-target::after` wins every hit), **C** (the sheet's §12 header :529 corrected too), **D** (§1.16
PR 3b item (1) struck like item (6)). All dated 2026-09-09, all folded in below. Reviewer verifies the branch
before the smoke. Nothing merges until the owner says so.

---

**Goal:** With Names off, an assigned seat on `/admin` and `/` renders the empty-seat footprint with the legend's own ● inside, so the legend is what the marker is; selected, hover, focus, quiet and the ◇ badge all paint correctly.

**Architecture:** One render change in `SeatMarker.tsx` (names-off children = `<SeatMark kind="assigned-dot" />` + badge), one sheet amendment (J) that *shrinks* the names-off group to three rules because the base `.sp-pill` rules already alias the footprint's Carbon roles, one attribute on the band legend so its ● shares the marker's colour, one retired token, and the design record amended in place. Tests are re-pointed, never loosened.

**Tech Stack:** Next.js App Router · React · plain CSS token layer (`--sp-*` → `--cds-*`) · Node test runner (`node --test`) · jsdom ct harness · Playwright rigs against the local Docker Supabase stack.

**Spec:** the hand-off (committed in Task 0 as `docs/redesign-v2/phase5/plans/phase5-pr3-names-off-marker-HANDOFF.md`) read through PHASE3DS §1.4 / §1.16 / §1.21, PHASE4BUILD §1.36 + §3, PHASE5.md, and the owner's four rulings of 2026-09-09 (below).

## Global Constraints

- Branch `feat/phase5-names-off-marker` cut from `main = c086f0a`; tag on merge **v2.3.0**. Never push to `main` directly; open a PR, hand the owner the Vercel preview URL.
- **Zero new tokens, zero token value changes.** `--sp-pill-names-off` is retired (deleted) from both `sp-tokens.css` copies.
- `app/styles/sp-components.css` and `docs/redesign-v2/phase3/components/sp-components.css` stay **byte-identical** (`tests/phase4-token-layer-source.test.mjs:210`).
- The source pin `/\.sp-pill--names-off \{ width: var\(--sp-seat-footprint\);/` (`tests/desktop-seat-marker-system-source.test.mjs:70`) must keep matching: `width: var(--sp-seat-footprint);` is the first declaration on that one line.
- `tests/seat-map-components.test.mjs:164` `button.textContent === ""` with names off must hold (an `<svg>` has no text). `accessibility-source:1312` pins the `accessibleSeatName` line — unchanged.
- The class name `sp-pill--names-off` and the `namesOff` gate in `SeatMarker.tsx` are unchanged (deep-link tests, `viewer-seat-finder`'s `markerMode`, `marker-contrast.mjs`, `desktop-seat-marker-system-source` all key on them).
- `HEX_LEDGER` stays two rows; `SWEPT = {1, 2, 3, 4}` untouched; no hex outside the vendored assets; no `--cds-*` outside `sp-tokens.css` / the assets / the bridge.
- Brand-system per-PR checklist (primary `rgb(184, 92, 46)`, hover `rgb(143, 69, 33)`, focus #B85C2E, current bar #B85C2E, links #8F4521 / #E8A07A, no `#0f62fe` outside `carbon-tokens.css`) — re-verified on the preview even though no colour token moves.
- Out of scope (hand-off §7): Names ON rendering; the 28px footprint size; `SeatMark` paths; band legend *logic*; `lib/seatCrowding`; the toggle, its storage key, `?names=on`; any token value.
- DECISIONS §6: **no new deviation, next free stays 19.** This is a conformance fix to §1.16's own legend rule.
- Commit trailer on every commit (from the session's attribution block):
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01Wo6focYpYpmo5fd6xXZmyQ
  ```

---

## Context

**Owner's report:** "Why is it just a black box when the names are off?" With Names off every assigned seat is a solid 28×28 block in `--sp-icon-primary`. PHASE3DS §1.16 ruled that block in Phase 3; the reviewer's artifact ("Names-Off Marker", both themes) showed three shipping defects: **F-1** selected state invisible with Names off; **F-2** the ◇ badge clipped to a corner nick by `overflow: hidden`; **F-3** the legend shows ● while the plan paints ■ (`SeatMark.tsx` header even says "● never appears on the plan"). Root cause: §1.16 minted a second visual language (a filled block) instead of reusing the status-mark language every other seat speaks (28px footprint + 16px symbol).

**Owner rulings (hand-off, 2026-09-09):** **R1** = Option B — assigned + names off renders the empty-seat footprint with `SeatMark kind="assigned-dot"` inside. **R2** hover lifts to layer-hover-02 like an open seat. **R3** one marker, both surfaces. **R4** own slice → v2.3.0 with the rig's contrast + hit-test pass. **R2–R4 confirmed by the owner in this session.**

**Owner rulings (this session, 2026-09-09, on the plan's findings):**
- **P-1 ● colour:** pill ● = `--sp-seat-mark-fill-color`, **and** the band legend's ● takes `className="sp-seat-mark--assigned"` (one attribute in `MapStatusBand.tsx:65`, the Management table's own precedent at `EmployeesTable.tsx:315`) so legend and marker share one colour.
- **P-2 sheet form:** the minimal form. The old names-off group is **removed whole** — `box-shadow: none`, `color: transparent`, `overflow: hidden`, the `:hover` restatement, the quiet fill/hover pair, and the `.sp-pill--names-off .sp-pill-badge` override at :556 (the base `.sp-pill-badge` fill is already `--sp-pill-fill` = layer-02, now the correct surface). The quiet ● **must** step to `--sp-pill-quiet-text`: `.sp-pill--quiet` and `.sp-pill--names-off` are both (0,1,0) and names-off is declared later, so its `color` would win — **this plan uses one combined rule `.sp-pill--names-off.sp-pill--quiet { color: var(--sp-pill-quiet-text); }`** (order-independent, and a pin the source test can hold). The rig must measure ● on the quiet fill. F-1's cause is restated in PHASE3DS §1.16 amendment (3) and PHASE5 as "selected edge = border-inverse = the block's fill in both themes", crediting the build for the correction.
- **P-3 record scope:** both extra items — PHASE3DS §1.4 gets a dated cross-amendment (R1 supersedes #507's "● never appears on the plan" clause), the sheet's §2 header comment at :100 is corrected in both copies, and specimen `02-map.html`'s six names-off cells take the inline ● svg with its legend swatch dropping the retired token.

### Pre-flight findings (verified this session, read-only)

| # | Finding | Consequence |
|---|---|---|
| V-1 | Skill fingerprint **`f997ee525800e755`**, 14 files — matches. | PHASE3DS §4 verdicts stand. |
| V-2 | Local has only `main` at `c086f0a`; no stale `feat/phase5-reception-narrow`. Working tree is **dirty before this slice**: `M CLAUDE.md`, `M skills-lock.json`, untracked `.agents/skills/*` (a skills install, not this slice's work). | Every commit uses explicit `git add <path>`; never `git add -A`. Never stash the owner's files. Raise at hand-off what to do with them (end-of-session hygiene rule wants status EMPTY). |
| V-3 | **Hand-off §2 F-1's cascade claim is wrong.** `.sp-pill[data-state="selected"]` is (0,2,0) and outranks `.sp-pill--names-off` (0,1,0) regardless of order. Selected was invisible because `--sp-pill-selected-edge` = `border-inverse` = gray-100 on the gray-100 block (light) and gray-10 on gray-10 (dark). The footprint fill removes the collision; no restated selected rule is needed (a normal quiet pill already loses to selected the same way, and `dimmedSeatIdSet` does not exclude the selected seat, so quiet+selected coexisting is the ordinary case). | Correction written into amendment J's comment, §1.16 (3) and PHASE5 (P-2). |
| V-4 | **Hand-off §4.2 "no new selector is needed for the ●" is wrong.** `.sp-seat-mark { color: var(--sp-seat-mark-stroke-color) }` (:107) sets the svg's own colour, so the pill's `color` never reaches the circle through `currentColor`. | `.sp-pill--names-off .sp-seat-mark { color: inherit; }` is required. |
| V-5 | `--sp-pill-fill` = layer-02, `--sp-pill-edge` = icon-secondary, `--sp-pill-fill-hover` = layer-hover-02 (`sp-tokens.css:396–398`) — the **same** Carbon roles as `--sp-seat-footprint-fill` / `-border` / `--sp-layer-hover-02`. | The base `.sp-pill` rules already draw the footprint; amendment J restates nothing (P-2). |
| V-6 | The band legend's ● renders with no `sp-seat-mark--assigned` class → icon-secondary (gray-70 / gray-30), not §1.4's "fill = icon-primary". `.sp-seat-mark--assigned { color: var(--sp-seat-mark-fill-color) }` exists at sheet :860 (table section, global class). | P-1: one attribute in `MapStatusBand.tsx`. §1.4's "`.sp-seat-mark--assigned` removed, nothing consumes it" is stale (table + band consume it) — said in the §1.4 cross-amendment. |
| V-7 | The ◇-inversion clause the hand-off calls "amendment (2)" is **item (6)** of §1.16's "Phase 4 PR 3b amendments" paragraph. | Strike item (6)'s two clauses, not (2). |
| V-8 | Specimen `docs/redesign-v2/phase3/specimens/02-map.html` names-off cells (:254, :255, :263, :492 ×2) hold **text** ("Sarah R.", "·") hidden today only by `color: transparent; overflow: hidden`; the legend swatch at :259 consumes `--sp-pill-names-off`. | P-3: six cells → the inline ● svg; swatch → the ● svg with `sp-seat-mark--assigned`; caption at :265 "names-off (solid)" → "names-off (footprint + ●)". |
| V-9 | The jsdom ct harness loads **no CSS**; `tests/browser` ships no CSS either. `getComputedStyle(button).overflow` cannot observe the sheet. | The "badge not clipped" assertion is a **source pin** (no `overflow: hidden` in the names-off rule) plus the real-Chrome rig's badge paint hit-test. |
| V-10 | `marker-contrast.mjs:79–84` measures the names-off **fill vs the mat** (min 3). With the footprint that pair is layer-02 vs layer-01 ≈ 1.1:1 — it would fail for a reason that is no longer a mark. | The branch measures the footprint **edge** (box-shadow colour) on the mat instead; the generic mark branch (:74–78) now yields ● on fill because the svg exists. |
| V-11 | PHASE5.md says `phase4/` is "read, never edited", while the hand-off §5/§6 asked for edits to `phase4/audit/marker-contrast.mjs` and a dated block in PHASE4BUILD §3. **Reviewer ruling A (2026-09-09): the hand-off was wrong; `phase4/` is untouched.** | The rig is **copied** to `phase5/audit/marker-contrast.mjs` and re-pointed there; the Phase 4 file stays byte-identical to `main`; the four-pair table goes into PHASE5's PR 3 section, PHASE4BUILD untouched. PHASE5 records that the hand-off asked for a closed-record edit and the build declined it (PR 1's `pr4-smoke.mjs:109` precedent). `phase3/contrast/generate-pairs.mjs` + `product-pairs.json` are the living gate and stay in scope. |
| V-13 | **Reviewer ruling B:** `.cds-touch-target::after` (`carbon-tokens.css:555`) is `position: absolute`, 44×44, painted after the badge `<svg>` in tree order, so `elementFromPoint` over the badge returns the **button**, never the svg. | Task 6 claim 8 is a **paint assertion** from the 3x capture (purple pixels in the 8×8 badge rect, including pixels outside the 28×28 box), plus the geometry check. Claim 9's `elementFromPoint` returning the button is exactly right and stays. |
| V-14 | **Reviewer rulings C, D:** the sheet's §12 header at :529 also says "names off (filled footprint)"; §1.16's PR 3b item (1) (".sp-pill--names-off.sp-pill--quiet fills the footprint with --sp-pill-quiet-edge — still filled") describes the block's quiet state. | :529 corrected in both copies (Task 2); item (1) struck like item (6) with "— superseded by amendment (3)" (Task 7). |
| V-12 | The four "new" contrast pairs coincide with already-gated values: ● on layer-02 = the "rest (assigned)" text pair (18.1 / 10.5); ● on quiet fill = the quiet-text pair (7.1 / 8.86); ◇ on layer-02 = the badge-on-fill pair (5.00 / 4.91); edge on the mat = gray-70 on gray-10 / gray-30 on gray-90 (7.1 / 8.86). The names-off rows at `generate-pairs.mjs:77–79, :107–108` describe a construction that no longer ships. | Replace those five lines with the four pairs × two themes, named for what ships; re-run generator + checker; paste the summary line. Expect all ≥ 3:1 by a wide margin. |

---

## File map

| File | Change |
|---|---|
| `docs/redesign-v2/phase5/plans/phase5-pr3-names-off-marker-HANDOFF.md` | **Create** — the hand-off verbatim (Task 0). |
| `docs/redesign-v2/phase5/plans/phase5-pr3-names-off-marker.md` | **Create** — plan of record = this plan's content, in the PR 2 plan's shape (Task 0). |
| `components/seat-map/SeatMarker.tsx` | names-off children → `<SeatMark kind="assigned-dot" />` + badge; two header comments corrected (Task 1). |
| `tests/seat-map-components.test.mjs` | :156–:169 wording + ● assertion; :241 wording + "no text" assertion (Task 1). |
| `app/styles/sp-components.css` + `docs/redesign-v2/phase3/components/sp-components.css` | amendment J replaces :556–:564; §2 header comment :100 corrected; byte-identical (Task 2). |
| `app/styles/sp-tokens.css` + `docs/redesign-v2/phase3/tokens/sp-tokens.css` | delete `--sp-pill-names-off` (:415 in both) (Task 2). |
| `tests/desktop-seat-marker-system-source.test.mjs` | pins for the three amendment-J rules, negative pins for the retired declarations and token (Task 2). |
| `components/seat-map/MapStatusBand.tsx` :65 | `className="sp-seat-mark--assigned"` on the names-off ● (Task 3). |
| `tests/map-status-band.test.mjs` :41 | assert the class (Task 3). |
| `components/seat-map/SeatMark.tsx` header | "● never appears on the plan" corrected (Task 3). |
| `tests/seat-mark.test.mjs` :33 | wording only (Task 3). |
| `docs/redesign-v2/phase3/specimens/02-map.html` | six names-off cells, the swatch, the caption (Task 4). |
| `docs/redesign-v2/phase3/contrast/generate-pairs.mjs` | :77–79, :107–108 → the four pairs × two themes (Task 5). |
| `docs/redesign-v2/phase5/audit/marker-contrast.mjs` | **Create** — a copy of `phase4/audit/marker-contrast.mjs` (the Phase 4 file stays byte-identical to `main`, ruling A); :79–84 edge-on-mat; the viewer names-off step also records `names-off-quiet` and `names-off-draft` (Task 5). |
| `docs/redesign-v2/phase5/audit/pr3-names-off-marker.mjs` | **Create** — capture + hit-test rig (Task 6). |
| `docs/redesign-v2/phase5/screenshots/phase5-pr3/` | captures + `results.json` + README (Task 6). |
| `docs/redesign-v2/phase3/PHASE3DS.md` §1.4, §1.16 | cross-amendment; amendment (3); item (6) struck (Task 7). |
| `docs/redesign-v2/phase4/` (all) | **Untouched** (ruling A) — the four-pair table lives in PHASE5's PR 3 section. |
| `docs/redesign-v2/phase5/PHASE5.md` | table row + PR 3 section (Task 7). |
| `docs/redesign-v2/DECISIONS.md` | one line under the §6 header (Task 7). |

---

### Task 0: Branch, hand-off, plan of record

**Files:**
- Create: `docs/redesign-v2/phase5/plans/phase5-pr3-names-off-marker-HANDOFF.md`
- Create: `docs/redesign-v2/phase5/plans/phase5-pr3-names-off-marker.md`

- [ ] **Step 1: Fetch and cut the branch**

```bash
git fetch --prune
git status --short            # expect only the pre-existing CLAUDE.md / skills-lock.json / .agents/skills/* entries (V-2)
git branch --show-current     # main
git rev-parse --short HEAD    # c086f0a
git switch -c feat/phase5-names-off-marker
```

- [ ] **Step 2: Write the hand-off file verbatim** — the full text of the `/superpowers:writing-plans` arguments (the document beginning `# Phase 5 · PR 3 — the names-off marker becomes ● in the footprint · HAND-OFF`), unedited, as `docs/redesign-v2/phase5/plans/phase5-pr3-names-off-marker-HANDOFF.md`.

- [ ] **Step 3: Commit the hand-off alone**

```bash
git add docs/redesign-v2/phase5/plans/phase5-pr3-names-off-marker-HANDOFF.md
git commit -m "docs(redesign-v2): phase 5 — PR 3 hand-off (the names-off marker becomes ● in the footprint)

Reviewer hand-off for Phase 5 PR 3. Records owner ruling R1 (Option B: the
assigned pill takes the empty-seat footprint and carries the legend's ●),
reviewer defaults R2–R4, the three verified defects F-1/F-2/F-3, and that
A and C were not taken. Task 0 of the hand-off. No build.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Wo6focYpYpmo5fd6xXZmyQ"
```

- [ ] **Step 4: Write the plan of record** as `docs/redesign-v2/phase5/plans/phase5-pr3-names-off-marker.md`: this plan's content, headed in the PR 2 plan's shape (`# Phase 5 · PR 3 — the names-off marker becomes ● in the footprint (v2.3.0)`, a "Plan of record" paragraph naming the hand-off commit SHA from Step 3, the branch, the owner rulings R1–R4 and P-1…P-3, and the reviewer rulings **A** (`phase4/` untouched — rig copied to `phase5/audit/`, table in PHASE5), **B** (claim 8 is a paint assertion), **C** (:529 header), **D** (§1.16 item (1) struck), all dated 2026-09-09 and all folded in), then §0 set-up as verified (V-1, V-2), then the Context, the findings table, and the tasks.

- [ ] **Step 5: Commit the plan of record**

```bash
git add docs/redesign-v2/phase5/plans/phase5-pr3-names-off-marker.md
git commit -m "docs(redesign-v2): phase 5 — PR 3 plan of record (the names-off marker becomes ● in the footprint)

Owner rulings on the plan's findings, 2026-09-09: P-1 the pill ● and the band
legend's ● share --sp-seat-mark-fill-color (one attribute on MapStatusBand);
P-2 amendment J is the minimal form — the base .sp-pill rules already alias
the footprint's roles, the old group is removed whole, the quiet ● steps via
one combined rule; P-3 §1.4 cross-amended and the specimen's names-off cells
take the ●. F-1's cause corrected: border-inverse was the block's fill in both
themes, not a cascade loss. No §6 deviation; next free stays 19.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Wo6focYpYpmo5fd6xXZmyQ"
```

---

### Task 1: SeatMarker renders ● with names off

**Files:**
- Modify: `components/seat-map/SeatMarker.tsx` (header comment :12–:33, comment :139–:140, render :222–:228)
- Test: `tests/seat-map-components.test.mjs` :156–:169, :240–:241

**Interfaces:**
- Consumes: `SeatMark` (`components/seat-map/SeatMark.tsx`) kinds `"assigned-dot"` (renders `<svg class="sp-seat-mark"><circle data-fill …/></svg>`) and `"draft-badge"` — unchanged.
- Produces: with `showNames === false` and an occupant and no mode running, `button.sp-pill.sp-pill--names-off` contains `svg.sp-seat-mark circle[data-fill]`, optionally `svg.sp-pill-badge`, and **no text node**. Task 2's sheet, Task 5's rig and Task 6's rig rely on exactly that DOM.

- [ ] **Step 1: Re-point the two ct tests (they fail first)**

In `tests/seat-map-components.test.mjs` replace lines 156–169 with:

```js
// F4 (read-path assessment 2026-08-25): with names off the pill renders no
// text — Phase 5 PR 3: it is the empty-seat footprint carrying the legend's ●
// — so the full name alone is announced; concatenating short + full name
// would be pure stutter ("Alice Alice Smith") on every occupied seat, at
// rest, on every arrow-key step.
test("with names hidden, the pill is the footprint carrying ● and the label carries the full name once", async () => {
  await renderElement(React.createElement(SeatMarker, markerProps(makeSeat(), { showNames: false })));
  const button = pill();
  assert.ok(button.classList.contains("sp-pill--names-off"));
  assert.equal(button.textContent, "", "no visible text with names off");
  assert.ok(button.querySelector("svg.sp-seat-mark circle[data-fill]"), "the legend's ● is inlined in the footprint (PR 3)");
  assert.equal(button.querySelector("svg.sp-seat-mark").getAttribute("aria-hidden"), "true");
  const label = button.getAttribute("aria-label");
  assert.match(label, /Alice Smith/, "full name still announced");
  assert.ok(!/Alice Alice Smith/.test(label), "no doubled first name");
  assert.equal(label.match(/Alice/g).length, 1, "occupant named exactly once");
});
```

and replace line 241 with:

```js
  assert.ok(pill().querySelector("svg.sp-pill-badge"), "names off keeps the ◇ on the footprint");
  assert.ok(pill().querySelector("svg.sp-seat-mark circle[data-fill]"), "…beside the ●");
  assert.equal(pill().textContent, "", "no text to hide — the sheet declares no overflow: hidden (pinned in desktop-seat-marker-system-source)");
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/seat-map-components.test.mjs`
Expected: FAIL — "the legend's ● is inlined in the footprint (PR 3)" (no `svg.sp-seat-mark` in the names-off pill yet).

- [ ] **Step 3: Implement the render change**

In `components/seat-map/SeatMarker.tsx` replace lines 222–228:

```tsx
        {asPill ? (
          <>
            {namesOff ? <SeatMark kind="assigned-dot" /> : hasEmployee ? visibleLabel : <span translate="no">{visibleLabel}</span>}
            {draftChanged ? <SeatMark kind="draft-badge" /> : null}
          </>
        ) : (
          <SeatMark kind={seatMarkKindFor(seat.status)} />
        )}
```

`visibleLabel` (:143) and `accessibleSeatName` (:149) stay exactly as they are. Update the two comments:

- header :22–:33: `--names-off (the filled 28 footprint)` → `--names-off (the empty-seat footprint carrying the legend's ● — Phase 5 PR 3, PHASE3DS §1.16 amendment 3)`;
- :139–:140: `// Names off = the filled 28 footprint; in a move/swap …` → `// Names off = the footprint carrying ● (PR 3); in a move/swap every seat shows its`.

- [ ] **Step 4: Run to verify they pass, plus the pins that read this file**

Run: `node --test tests/seat-map-components.test.mjs tests/desktop-seat-marker-system-source.test.mjs tests/accessibility-source.test.mjs tests/seat-marker-memo.test.mjs tests/viewer-seat-finder.test.mjs`
Expected: all PASS (`:77`/`:78` pins still match; `markerMode` still reads class + empty text).

- [ ] **Step 5: Commit**

```bash
git add components/seat-map/SeatMarker.tsx tests/seat-map-components.test.mjs
git commit -m "feat(seat-map): names off renders the legend's ● in the footprint (Phase 5 PR 3, R1)

The names-off pill's children become <SeatMark kind=\"assigned-dot\"> plus
the ◇ badge; visibleLabel stays \"\" so textContent is still empty and the
accessible name is unchanged. The sheet follows in amendment J.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Wo6focYpYpmo5fd6xXZmyQ"
```

---

### Task 2: Sheet amendment J (both copies) and the retired token

**Files:**
- Modify: `app/styles/sp-components.css` :100 (comment), :556–:564 (the group)
- Modify: `docs/redesign-v2/phase3/components/sp-components.css` — identical bytes
- Modify: `app/styles/sp-tokens.css` :415 and `docs/redesign-v2/phase3/tokens/sp-tokens.css` :415 — delete the line
- Test: `tests/desktop-seat-marker-system-source.test.mjs` :65–:73

**Interfaces:**
- Consumes: Task 1's DOM (`svg.sp-seat-mark` inside `button.sp-pill--names-off`).
- Produces: the three rules below; base `.sp-pill` rules supply rest / hover / focus / selected; `.sp-pill--quiet` supplies the quiet fill + edge.

- [ ] **Step 1: Extend the source test (fails first)**

In `tests/desktop-seat-marker-system-source.test.mjs` replace the `for (const rule of [ … ])` block at :65–:73 with:

```js
  for (const rule of [
    /\.sp-pill\[aria-selected="true"\], \.sp-pill\[data-state="selected"\] \{ box-shadow: inset 0 0 0 var\(--sp-space-01\) var\(--sp-pill-selected-edge\); \}/,
    /\.sp-pill--origin \{ box-shadow: none; outline: var\(--sp-space-01\) dashed/,
    /\.sp-pill--target \{ background: var\(--sp-pill-target-fill\); box-shadow: inset 0 0 0 var\(--sp-space-01\) var\(--sp-pill-target-edge\); \}/,
    /\.sp-pill--invalid \{ background: var\(--sp-pill-invalid-fill\); box-shadow: none; outline: var\(--sp-space-01\) dashed var\(--sp-pill-invalid-edge\);[^}]*cursor: not-allowed; \}/,
    // Phase 5 PR 3 amendment J: names off = the empty-seat footprint carrying ●.
    // The modifier fixes the width, drops the pads and colours the ●; fill,
    // edge, hover, focus and selected are the base .sp-pill rules above.
    /\.sp-pill--names-off \{ width: var\(--sp-seat-footprint\); padding: 0; justify-content: center; color: var\(--sp-seat-mark-fill-color\); \}/,
    /\.sp-pill--names-off \.sp-seat-mark \{ color: inherit; \}/,
    /\.sp-pill--names-off\.sp-pill--quiet \{ color: var\(--sp-pill-quiet-text\); \}/
  ]) {
    assert.match(componentsCss, rule);
  }
  // The filled-block language is retired whole (F-1 / F-2 / F-3): no
  // box-shadow: none, no transparent text, no overflow: hidden (the ◇ badge
  // sits at −4/−4 and must paint), no badge inversion, no hover restatement,
  // and the token that carried the block is gone from the layer.
  // Pins run against the sheet with its comments stripped — amendment J's own
  // comment names the retired token and the retired rules while explaining them.
  const sheetRules = componentsCss.replace(/\/\*[\s\S]*?\*\//g, "");
  const namesOffRule = sheetRules.match(/\.sp-pill--names-off \{[^}]*\}/)[0];
  assert.doesNotMatch(namesOffRule, /overflow|box-shadow|transparent|background/);
  assert.doesNotMatch(sheetRules, /\.sp-pill--names-off \.sp-pill-badge/);
  assert.doesNotMatch(sheetRules, /\.sp-pill--names-off:is\(:hover/);
  assert.doesNotMatch(sheetRules, /--sp-pill-names-off/);
  assert.doesNotMatch((await readSource("../app/styles/sp-tokens.css")).replace(/\/\*[\s\S]*?\*\//g, ""), /--sp-pill-names-off/);
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/desktop-seat-marker-system-source.test.mjs`
Expected: FAIL on the first amendment-J regex.

- [ ] **Step 3: Write amendment J in `app/styles/sp-components.css`**

Replace lines 556–564 (from `.sp-pill--names-off .sp-pill-badge {` through `.sp-pill--names-off.sp-pill--quiet:is(:hover, …) { … }`) with:

```css
/* Phase 5 PR 3 amendment J (PHASE3DS §1.16 amendment 3, §1.4 cross-amended; owner ruling R1 = B, 2026-09-09):
   names off = the assigned pill takes the EMPTY-SEAT FOOTPRINT and carries the legend's ● — one status-mark
   language on the plan (○ open · ● assigned · lock · hatch), and the legend is what the marker is. The base
   .sp-pill rules already ARE the footprint (--sp-pill-fill / -edge / -fill-hover alias layer-02 / icon-secondary /
   layer-hover-02, the footprint's own roles), so the modifier only fixes the width, drops the pads and colours
   the ●; hover, focus, selected and quiet come from the pill rules above — nothing restated, nothing to
   out-cascade. The ● inherits the pill's colour (`.sp-seat-mark` sets its own, so currentColor alone never
   reached it) and steps to the quiet text colour with the quiet pill: both modifiers are (0,1,0) and names-off
   is declared later, so the step is one combined rule. Supersedes PR 3b's filled --sp-pill-names-off block:
   F-1 selected was invisible because border-inverse IS the block's fill in both themes (not a cascade loss —
   .sp-pill[data-state="selected"] outranks the modifier); F-2 the block's overflow: hidden clipped the ◇ at
   −4/−4; F-3 the legend showed ● and the plan ■. No overflow: hidden — there is no text to hide. The badge
   override that inverted the ◇ on the block is gone: the base .sp-pill-badge fill is --sp-pill-fill = layer-02,
   which is now the surface it sits on. --sp-pill-names-off is retired from sp-tokens.css (both copies). */
.sp-pill--names-off { width: var(--sp-seat-footprint); padding: 0; justify-content: center; color: var(--sp-seat-mark-fill-color); }
.sp-pill--names-off .sp-seat-mark { color: inherit; }
.sp-pill--names-off.sp-pill--quiet { color: var(--sp-pill-quiet-text); }
```

Also line 100: `assigned    a miniature name pill (the real mark — ● never appears on the map)` → `assigned    a miniature name pill while names are on; ● on the plan AND in the legend while names are off (amendment J)`. And the §12 header at line 529 (ruling C): `· names off (filled footprint). 44px hit region: .cds-touch-target.` → `· names off (footprint carrying ●, amendment J). 44px hit region: .cds-touch-target.`

- [ ] **Step 4: Mirror byte-for-byte and retire the token in both copies**

```bash
cp app/styles/sp-components.css docs/redesign-v2/phase3/components/sp-components.css
cmp app/styles/sp-components.css docs/redesign-v2/phase3/components/sp-components.css && echo IDENTICAL
grep -n "sp-pill-names-off" app/styles/sp-tokens.css docs/redesign-v2/phase3/tokens/sp-tokens.css   # both :415
sed -i '/--sp-pill-names-off:/d' app/styles/sp-tokens.css docs/redesign-v2/phase3/tokens/sp-tokens.css
grep -rn "sp-pill-names-off" app components lib tests docs/redesign-v2/phase3/tokens docs/redesign-v2/phase3/components   # expect nothing
```

(Windows: confirm `sed -i` kept LF endings — `git diff --stat` shows one deleted line per file, not a whole-file rewrite.)

- [ ] **Step 5: Run the pins**

Run: `node --test tests/desktop-seat-marker-system-source.test.mjs tests/phase4-token-layer-source.test.mjs tests/accessibility-source.test.mjs tests/touch-target-source.test.mjs`
Expected: all PASS (byte-identical, no `--cds-*` leak, HEX_LEDGER two rows, SWEPT untouched).

- [ ] **Step 6: Commit**

```bash
git add app/styles/sp-components.css docs/redesign-v2/phase3/components/sp-components.css app/styles/sp-tokens.css docs/redesign-v2/phase3/tokens/sp-tokens.css tests/desktop-seat-marker-system-source.test.mjs
git commit -m "feat(styles): sheet amendment J — names off is the footprint carrying ● (Phase 5 PR 3)

Three rules replace the filled-block group: width + no pads + the ● colour;
the ● inherits; the quiet ● steps to the quiet text colour. Fill, edge,
hover, focus and selected come from the base .sp-pill rules, which already
alias the footprint's roles. --sp-pill-names-off retired from both token
copies. Both sheet copies byte-identical.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Wo6focYpYpmo5fd6xXZmyQ"
```

---

### Task 3: The legend's ● shares the marker's colour; the two headers stop lying

**Files:**
- Modify: `components/seat-map/MapStatusBand.tsx` :65
- Modify: `components/seat-map/SeatMark.tsx` :8–:10 (header)
- Test: `tests/map-status-band.test.mjs` :41 ; `tests/seat-mark.test.mjs` :33 (wording)

- [ ] **Step 1: Extend the band test (fails first)**

In `tests/map-status-band.test.mjs` replace the last assertion of the "legend follows the Names toggle" test (:41) with:

```js
  const dot = assigned.querySelector("svg.sp-seat-mark circle[data-fill]");
  assert.ok(dot, "names off swaps the mini pill for ●");
  // Phase 5 PR 3 (owner ruling P-1): the legend's ● and the plan's ● share
  // --sp-seat-mark-fill-color — the class the Management table already uses.
  assert.ok(dot.closest("svg").classList.contains("sp-seat-mark--assigned"), "the legend's ● carries the fill-colour class");
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/map-status-band.test.mjs`
Expected: FAIL — "the legend's ● carries the fill-colour class".

- [ ] **Step 3: Implement**

`components/seat-map/MapStatusBand.tsx` :65:

```tsx
                <SeatMark kind={entry.mark === "assigned" && !namesVisible ? "assigned-dot" : entry.mark} className={entry.mark === "assigned" && !namesVisible ? "sp-seat-mark--assigned" : undefined} />
```

`components/seat-map/SeatMark.tsx` header lines 8–10 become:

```
//   assigned      a 28×16 miniature of the name pill while names are ON;
//                 `assigned-dot` is the ● the legend AND the plan show while
//                 names are off (the names-off marker, Phase 5 PR 3; the legend
//                 follows the toggle, P3-13)
```

`tests/seat-mark.test.mjs` :33 title → `"assigned = the mini-pill span; assigned-dot = the filled ● the legend AND the plan show with names off"`.

- [ ] **Step 4: Run to verify**

Run: `node --test tests/map-status-band.test.mjs tests/seat-mark.test.mjs tests/management-detail-source.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/seat-map/MapStatusBand.tsx components/seat-map/SeatMark.tsx tests/map-status-band.test.mjs tests/seat-mark.test.mjs
git commit -m "fix(seat-map): the band legend's ● takes the fill colour the plan's ● uses (Phase 5 PR 3, P-1)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Wo6focYpYpmo5fd6xXZmyQ"
```

---

### Task 4: Specimen `02-map.html` speaks the new language

**Files:**
- Modify: `docs/redesign-v2/phase3/specimens/02-map.html` :254, :255, :259, :263, :265, :492

The ● markup, used in every cell (the open cell's own pattern, :256):

```html
<svg class="sp-seat-mark" viewBox="0 0 16 16" aria-hidden="true"><circle data-fill cx="8" cy="8" r="5"/></svg>
```

- [ ] **Step 1: Edit the six cells + swatch + caption**

- :254 → `<span><span class="lbl">names off · assigned</span><button class="sp-pill sp-pill--names-off cds-touch-target" aria-label="Sarah Reyes"><svg class="sp-seat-mark" viewBox="0 0 16 16" aria-hidden="true"><circle data-fill cx="8" cy="8" r="5"/></svg></button></span>`
- :255 → same button with the ● svg followed by the existing `<svg class="sp-pill-badge" …><use href="#i-diamond"/></svg>` (drop the inline `style="color:var(--sp-pill-badge)"` — the base `.sp-pill-badge` rule colours it now that nothing inverts it).
- :259 swatch → `<span class="sp-seat-legend"><svg class="sp-seat-mark sp-seat-mark--assigned" viewBox="0 0 16 16" aria-hidden="true"><circle data-fill cx="8" cy="8" r="5"/></svg>Assigned 56 (names off)</span>`.
- :263 grayscale strip: the trailing `<button class="sp-pill sp-pill--names-off">Sarah R.</button>` → the ● svg as its only child.
- :265 caption: `· names-off (solid)` → `· names-off (footprint + ●)`.
- :492 both `…sp-pill--names-off sp-marker" … aria-label="Seat">·</button>` → the ● svg as the only child.

- [ ] **Step 2: Verify no text remains inside a names-off button and no retired token**

```bash
grep -n 'sp-pill--names-off[^>]*>[^<]' docs/redesign-v2/phase3/specimens/02-map.html     # expect nothing
grep -n 'sp-pill-names-off' docs/redesign-v2/phase3/specimens/02-map.html                # expect nothing
grep -c 'sp-pill--names-off' docs/redesign-v2/phase3/specimens/02-map.html               # 6, unchanged
```

Open `docs/redesign-v2/phase3/specimens/02-map.html` in Chrome (file URL; the `run-seat-planner` skill's screenshot path) and eyeball the "names off" row: ● in a footprint, the ◇ fully painted at the top-right, the grayscale strip's last cell a footprint with ●.

- [ ] **Step 3: Commit**

```bash
git add docs/redesign-v2/phase3/specimens/02-map.html
git commit -m "docs(redesign-v2): specimen 02-map's names-off cells carry ● (amendment J)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Wo6focYpYpmo5fd6xXZmyQ"
```

---

### Task 5: Contrast — the static pairs and the marker rig

**Files:**
- Modify: `docs/redesign-v2/phase3/contrast/generate-pairs.mjs` :77–:79, :107–:108
- Create: `docs/redesign-v2/phase5/audit/marker-contrast.mjs` — `cp docs/redesign-v2/phase4/audit/marker-contrast.mjs docs/redesign-v2/phase5/audit/marker-contrast.mjs`, then edit the COPY at :79–:84 and the viewer names-off step (:283–:290); add one header line under the usage line: `// Phase 5 PR 3 copy of phase4/audit/marker-contrast.mjs (Phase 4 is closed record, untouched): the names-off branch measures the footprint carrying ●.` The Phase 4 file is not edited (`git diff main -- docs/redesign-v2/phase4` must be empty at the end).

- [ ] **Step 1: Replace the five static names-off lines**

Light (:77–:79) →

```js
// Phase 5 PR 3 (amendment J): names off = the footprint carrying ●. The block's pairs (fill on the mat, the inverted ◇) are gone with it.
add(gated, "light · names-off ● gray-100 on the footprint layer-02 white", P.g100, P.white, "graphic");
add(gated, "light · names-off quiet ● gray-70 on the quiet fill layer-01", P.g70, P.g10, "graphic");
add(gated, "light · names-off ◇ purple-60 on the footprint layer-02 white", P.p60, P.white, "graphic");
add(gated, "light · names-off footprint edge gray-70 on the mat layer-01", P.g70, P.g10, "graphic");
```

Dark (:107–:108) →

```js
add(gated, "dark · names-off ● gray-10 on the footprint layer-02 #393939", P.g10, P.g80, "graphic");
add(gated, "dark · names-off quiet ● gray-30 on the quiet fill layer-01 #262626", P.g30, P.g90, "graphic");
add(gated, "dark · names-off ◇ purple-40 on the footprint layer-02 #393939", P.p40, P.g80, "graphic");
add(gated, "dark · names-off footprint edge gray-30 on the mat layer-01 #262626", P.g30, P.g90, "graphic");
```

- [ ] **Step 2: Generate and check; paste the summary line into the Task 7 record**

```bash
node docs/redesign-v2/phase3/contrast/generate-pairs.mjs
python "C:/Users/JP/.claude/plugins/cache/megeredchian/design-system/1.3.0/skills/ibm-design-language/scripts/check_contrast.py" --pairs docs/redesign-v2/phase3/contrast/product-pairs.json
```

Expected: `product-pairs.json: 206 pairs` (202 − 4 + 8) and `206/206 pass`; the eight rows read ≈ 17.4–18.1 / 10.5 (●), 7.1 / 8.9 (quiet ●, edge), 5.0 / 4.9 (◇). Commit the regenerated JSON files with the script.

- [ ] **Step 3: Re-point the COPY's names-off branch (`phase5/audit/marker-contrast.mjs` :79–:84)**

```js
  if (namesOff) {
    // Phase 5 PR 3: the footprint's EDGE on the canvas mat is the on-the-mat mark (the fill is layer-02 on
    // layer-01 — a surface step, not a pair); the ● on the fill comes through the generic mark branch above.
    const parent = button.closest(".sp-canvas, [data-map-stage], main") || document.body;
    const mat = over(parse(getComputedStyle(parent).backgroundColor) || backdrop, backdrop);
    const edge = parse(cs.boxShadow);
    if (edge) pairs.push({ kind: "graphic", what: "names-off footprint edge on the mat", fg: hex(over(edge, mat)), bg: hex(mat), ratio: round(ratio(over(edge, mat), mat)), min: 3 });
  }
```

(`parse` already extracts the first `rgb(…)` from any string; `cs.boxShadow` reads `rgb(82, 82, 82) 0px 0px 0px 1px inset`.)

- [ ] **Step 4: Drive two more names-off states on the viewer pass (:283–:290)**

Replace the names-off block with:

```js
  // Names off (Phase 5 PR 3): the footprint carrying ● — rest, quiet (● on the quiet fill) and changed-in-draft
  // (the ◇ on layer-02, no longer clipped). The viewer shows a draft-changed pill only if the admin pass has left
  // one, so names-off-draft is measured on /admin below.
  const namesToggle = page.getByRole("button", { name: "Show occupant names" });
  if (await namesToggle.count() && (await namesToggle.getAttribute("aria-pressed")) === "true") {
    await namesToggle.click();
    await page.waitForTimeout(400);
    const off = page.locator("button[data-seat-id].sp-pill--names-off").first();
    if (await off.count()) await record("names-off", theme, off);
    if (await zoneChip.count()) {
      await zoneChip.click(); await page.waitForTimeout(500);
      const offQuiet = page.locator("button[data-seat-id].sp-pill--names-off.sp-pill--quiet").first();
      if (await offQuiet.count()) await record("names-off-quiet", theme, offQuiet);
      else console.log(`skip ${theme} names-off-quiet (no quiet names-off pill after the zone chip)`);
      await zoneChip.click(); await page.waitForTimeout(300);
    }
    await namesToggle.click();
    await page.waitForTimeout(300);
  }
```

and in the admin pass, immediately after the existing `changed-in-draft` record (the step that follows the swap confirm — find `record("changed-in-draft"`), add:

```js
  // Phase 5 PR 3: the same ◇ with names off — on the footprint, fully painted (F-2).
  if (await adminNames.count() && (await adminNames.getAttribute("aria-pressed")) === "true") {
    await adminNames.click(); await page.waitForTimeout(400);
    const offDraft = page.locator("button[data-seat-id].sp-pill--names-off[data-draft-changed]").first();
    if (await offDraft.count()) await record("names-off-draft", theme, offDraft);
    else console.log(`skip ${theme} names-off-draft (no draft-changed names-off pill)`);
    await adminNames.click(); await page.waitForTimeout(300);
  }
```

(`zoneChip` is already in scope from the filtered-out step above; keep the declaration order.)

- [ ] **Step 5: Run the rig against the local Docker stack**

```bash
npm run db:start && npm run db:seed          # .env.local pointed at the local stack (README recipe)
npm run build && npm run start               # port 3000, NODE_ENV=production is fine — no publish happens here
node docs/redesign-v2/phase5/audit/marker-contrast.mjs http://localhost:3000 docs/redesign-v2/phase5/screenshots/phase5-pr3/contrast e2e-admin@example.test <seed password from tests/e2e-auth/auth-helpers.ts>
```

Expected: exit 0; the summary line `N measurements, 0 under their floor, 0 outside the ledger. Ledger: empty.` with N ≥ 59 + 3 per theme; `names-off` now reports two pairs (status mark ≈ 17–18 / 10.5; edge on the mat ≈ 7.1 / 8.9), `names-off-quiet` ≈ 7.1 / 8.9, `names-off-draft` ◇ ≈ 5.0 / 4.9. Save its stdout as `docs/redesign-v2/phase5/screenshots/phase5-pr3/contrast/summary.txt`.

- [ ] **Step 6: Commit**

```bash
git add docs/redesign-v2/phase3/contrast/generate-pairs.mjs docs/redesign-v2/phase3/contrast/product-pairs.json docs/redesign-v2/phase3/contrast/surface-pairs-not-gated.json docs/redesign-v2/phase5/audit/marker-contrast.mjs docs/redesign-v2/phase5/screenshots/phase5-pr3/contrast
git diff --stat main -- docs/redesign-v2/phase4      # must print nothing (ruling A)
git commit -m "test(contrast): the names-off footprint's four pairs, static and in the marker rig (Phase 5 PR 3)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Wo6focYpYpmo5fd6xXZmyQ"
```

---

### Task 6: The capture + hit-test rig (R4)

**Files:**
- Create: `docs/redesign-v2/phase5/audit/pr3-names-off-marker.mjs` (driver skeleton copied from `phase5/audit/pr2-reception-narrow.mjs`: `record`, `results`, the theme loop via `html[data-carbon-theme]`, `results.json` writer; admin sign-in copied from `phase4/audit/marker-contrast.mjs`)
- Create: `docs/redesign-v2/phase5/screenshots/phase5-pr3/` (captures, `results.json`, `README.md` in the `phase5-pr2/README.md` shape: source, date, method, one line per file)

Every geometric claim is a hit test (`document.elementFromPoint`), not a visibility check. Run at **1920×1080, real Chromium, both themes**, against the local Docker stack, `next start`. Claims, each recorded PASS/FAIL:

| # | Claim | How |
|---|---|---|
| 1 | Names off on `/admin`: every `button.sp-pill--names-off` measures **28×28** and contains `svg.sp-seat-mark circle[data-fill]` with no text | `getBoundingClientRect` + `textContent === ""` |
| 2 | Computed `background-color` of a rest names-off pill equals that of a rest `button.sp-seat-footprint` (layer-02); its `box-shadow` colour equals the footprint's | compare strings |
| 3 | Hover: `background-color` becomes the same value a hovered open footprint takes (`--sp-layer-hover-02`) (R2) | `locator.hover()` then read both |
| 4 | Focus: `outline` is 2px, inset, terracotta `rgb(184, 92, 46)` — no `outline: none` | `focus()` via keyboard Tab to the marker, read `outline-*` |
| 5 | **Selected is visible (F-1):** click a names-off pill → `data-state="selected"` and `box-shadow` is a **2px** inset whose colour differs from the fill (`border-inverse`), inspector open | read `box-shadow`, parse width and colour |
| 6 | **Keyboard selection visible with Names off:** arrow to a seat, Enter → same as 5 | keyboard only |
| 7 | Quiet: apply a Zone filter → `.sp-pill--names-off.sp-pill--quiet` fill = layer-01, ● `color` = the quiet-text value (`getComputedStyle(svg).color`), and the ● of a rest pill ≠ that value | read both |
| 8 | **◇ fully painted (F-2):** produce a draft-changed seat (swap + confirm, the rig's existing recipe), names off → (a) geometry: `svg.sp-pill-badge` rect is 8×8 at (−4,−4) relative to the button; (b) **paint** (ruling B — `elementFromPoint` cannot see the badge because `.cds-touch-target::after` is a 44×44 absolute box painted after it): from the 3x capture of that marker, decode the PNG (`pngjs`, already a Playwright dependency — check `node_modules/pngjs`; else `sharp`), sample the badge's 8×8 css rect (24×24 device px), and require **≥ 12 pixels** within ΔRGB ≤ 40 of the resolved `--sp-pill-badge` (`getComputedStyle(badge).color` — purple 60 light / purple 40 dark), **of which ≥ 3 lie outside the button's 28×28 box** (the corner beyond the box paints — the F-2 proof) | PNG sample |
| 9 | **44px hit target:** `elementFromPoint` at (centre ± 21px) in all four diagonal directions returns the button or a descendant | four hits |
| 10 | Legend beside it: with names off the band's assigned entry shows `svg.sp-seat-mark.sp-seat-mark--assigned circle[data-fill]` and its computed `color` equals a rest names-off pill's ● colour | compare |
| 11 | Same on `/`: claims 1, 2, 3, 5, 9, 10 repeated on the viewer (R3) | second pass |
| 12 | **Names ON unchanged:** toggle names on → a chosen pill's rect, `background-color`, `box-shadow`, `color` equal a stored baseline read from `main`'s build in a prior run of the same rig (`--baseline <results.json>`); if no baseline file is given, record the values and mark the claim SKIPPED with the reason | byte compare of the value strings |

Captures (PNG, both themes): `01-plan-names-off-1920.png` (whole Floor 3 plan, `/admin`); `02-marker-{rest,hover,focus,selected,quiet,draft}-3x.png` (a `clip` of the marker at `deviceScaleFactor: 3`, ±24px around the button); `03-legend-3x.png` (the band's legend); `04-marker-names-on-3x.png` (the same seat, Names on); `05-viewer-names-off-1920.png` (`/`). README lists each with source, date, method, and the results summary line.

- [ ] **Step 1: Write the rig** (structure above; start from the PR 2 rig; sign-in from the marker rig; ~200 lines)
- [ ] **Step 2: Run it against `main` first** (stash nothing — check out `main` in a second worktree `../seat-planner-side` per the worktree memory rule, build, run with `--out …/baseline`), so claim 12 has its baseline
- [ ] **Step 3: Run it on the branch:** `node docs/redesign-v2/phase5/audit/pr3-names-off-marker.mjs http://localhost:3000 docs/redesign-v2/phase5/screenshots/phase5-pr3 e2e-admin@example.test <password> --baseline <baseline results.json>`
   Expected: every claim PASS both themes; open the 3x crops and confirm by eye: ● centred, ◇ complete, selected edge visible, quiet lighter.
- [ ] **Step 4: Write the README, commit**

```bash
git add docs/redesign-v2/phase5/audit/pr3-names-off-marker.mjs docs/redesign-v2/phase5/screenshots/phase5-pr3
git commit -m "test(redesign-v2): Phase 5 PR 3 capture + hit-test rig — the names-off footprint (R4)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Wo6focYpYpmo5fd6xXZmyQ"
```

---

### Task 7: The record

**Files:**
- Modify: `docs/redesign-v2/phase3/PHASE3DS.md` §1.4 (after the PR 3b amendment paragraph, ~:127), §1.16 (:335–:336 item (1), :346 item (6); append after :347)
- `docs/redesign-v2/phase4/PHASE4BUILD.md`: **not edited** (ruling A)
- Modify: `docs/redesign-v2/phase5/PHASE5.md` (table row; a `## PR 3 — the names-off marker becomes ● in the footprint` section)
- Modify: `docs/redesign-v2/DECISIONS.md` :1484 (one line under the §6 intro)

- [ ] **Step 1: PHASE3DS §1.4 cross-amendment** — append after the "Phase 4 PR 3b amendment" paragraph:

```
**Phase 5 PR 3 cross-amendment (2026-09-09; owner ruling R1, §1.16 amendment 3).** The clause "● never appears on
the plan" (owner ruling #507) is superseded: with names off the assigned marker IS the footprint carrying ● —
`SeatMark kind="assigned-dot"` in `--sp-seat-mark-fill-color` — so ○ and ● sit beside each other on the plan and
differ by fill, as the legend already had them. `.sp-seat-mark--assigned` is consumed again (the Management table
since PR 4; the band legend's ● since PR 3, owner ruling P-1 — legend and marker share one colour). Names on is
untouched: the miniature stays the legend's assigned mark.
```

- [ ] **Step 2: PHASE3DS §1.16** — in the PR 3b amendments paragraph, strike (with `~~…~~`) item (1)'s clause "`.sp-pill--names-off.sp-pill--quiet` fills the footprint with `--sp-pill-quiet-edge` — still filled (= assigned), lighter than a match, no opacity" and append ` — superseded by amendment (3)` (ruling D); then in item (6), strike the same way the two clauses "so on the filled footprint the badge inverts (stroke = the pill fill, fill = the square; the shape carries, the legend's count and the inspector text keep the colour), and the names-off + quiet fill is the quiet TEXT colour (gray 70 / gray 30 — 5.7 / 10 on the mat; the quiet edge was 1.7)" and append ` — superseded by amendment (3)`. Then append a new paragraph after the PR 3b amendments:

```
**Phase 5 PR 3 amendment (3) (2026-09-09; owner ruling R1 = Option B; reviewer defaults R2–R4 confirmed).** The
sentence "names off = the assigned pill collapses to the filled 28 footprint (`--sp-icon-primary`)" is superseded:
**names off = the assigned pill takes the empty-seat footprint (§1.4: layer-02 fill, 1px icon-secondary edge,
layer-hover-02 on hover) and carries the legend's ● (`--sp-seat-mark-fill-color`)**, so "the legend follows the
toggle" is finally true of the marker too — one status-mark language on the plan. Three defects the block shipped:
F-1 the selected state was invisible with names off — border-inverse IS the block's fill in both themes (the
hand-off read it as a cascade loss; the build corrected it: `.sp-pill[data-state="selected"]` outranks the
modifier); F-2 the block's `overflow: hidden` clipped the ◇ at −4/−4 (the "inverted ◇" of item (6) never rendered
a diamond); F-3 the band showed ● and the plan ■. Sheet amendment J is three rules — width, no pads, the ● colour;
the ● inherits; the quiet ● steps to `--sp-pill-quiet-text` by one combined rule (both modifiers are (0,1,0)) —
because `--sp-pill-fill / -edge / -fill-hover` already alias the footprint's roles; the filled block's rules, its
badge inversion and `--sp-pill-names-off` are retired. R2: hover lifts like an open seat, no flat special case.
R3: one marker on `/admin` and `/`. R4: its own slice, v2.3.0, rig-measured (● on layer-02 and on the quiet fill,
◇ on layer-02, the edge on the mat — PHASE5 PR 3). Options A (leave) and C (a lighter block) declined. Not a
Carbon deviation — DECISIONS §6 next free stays 19. Specimen `02-map.html`'s names-off cells carry the ● markup.
```

- [ ] **Step 3: The contrast table — in PHASE5's PR 3 section (ruling A), under a `### Contrast — the footprint's four pairs` heading:**

```
Phase 5 PR 3 (2026-09-09, **no token change** — sheet amendment J; `--sp-pill-names-off` retired; the five names-off
block pairs in `generate-pairs.mjs` replaced by the footprint's four × two themes; measured live by
`phase5/audit/marker-contrast.mjs`, a copy of the Phase 4 rig — PHASE4BUILD §3 is closed record and unchanged):

| Pair | Light | Dark |
|---|---|---|
| ● on the footprint (layer-02) | <paste> | <paste> |
| ● on the quiet fill (layer-01) | <paste> | <paste> |
| ◇ on the footprint (layer-02) | <paste> | <paste> |
| footprint edge on the mat (layer-01) | <paste> | <paste> |

```
product-pairs.json: 206 pairs · surface-pairs-not-gated.json: 14 pairs
206/206 pass
```
```

(`<paste>` = the checker's measured ratios from Task 5 Step 2 and the rig's from Step 5 — never typed from memory.)

- [ ] **Step 4: PHASE5.md** — table row `| PR 3 | The names-off marker becomes ● in the footprint | v2.3.0 | **in review** — branch \`feat/phase5-names-off-marker\`, PR #<n> |`, and a `## PR 3` section in the PR 1 / PR 2 shape: *Plan of record* (hand-off + plan SHAs, R1–R4, P-1…P-3), *Skill fingerprint* `f997ee525800e755`, **What the slice is** (the owner's question, the root cause, R1), **Engineering calls the code forced** (V-3 the F-1 correction credited to the build; V-4 `.sp-seat-mark` sets its own colour so `inherit` is required; V-5 the base pill already is the footprint; the combined quiet rule; the badge override dropped because the base badge fill is already the surface; V-10 the rig measures the edge on the mat), **Sheet amendment J** (three rules, the retired token, both copies), **Contrast — the footprint's four pairs** (Step 3's table), **A closed-record edit the hand-off asked for and the build declined** (hand-off §5/§6 asked for edits to `phase4/audit/marker-contrast.mjs` and PHASE4BUILD §3; `phase4/` is closed record — PR 1 carried `pr4-smoke.mjs:109` stale rather than edit it — so the rig was copied to `phase5/audit/` and the table lives here; reviewer ruling A, 2026-09-09, confirmed the decline), **Carried, not fixed** (the pre-existing dirty tree entries on main — V-2; `e2e:auth` needs `npx supabase db reset --no-seed` between runs, PR 2's note still true), **Verification on the final head** (the numbers from Task 8, pasted).

- [ ] **Step 5: DECISIONS.md** — under `## 6. Deviations from Carbon, recorded`, after the `senior-workflow.md requires…` line, add: `*Phase 5 PR 3 (v2.3.0, 2026-09-09) is a PHASE3DS §1.16 conformance amendment (the legend follows the toggle — now the marker does too); no new deviation, next free stays 19.*`

- [ ] **Step 6: Commit**

```bash
git add docs/redesign-v2/phase3/PHASE3DS.md docs/redesign-v2/phase5/PHASE5.md docs/redesign-v2/DECISIONS.md
git commit -m "docs(redesign-v2): phase 5 — PR 3 record (§1.16 amendment 3, §1.4 cross-amendment, amendment J, §3 pairs)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Wo6focYpYpmo5fd6xXZmyQ"
```

---

### Task 8: Full verification, PR, hand-off to the smoke

- [ ] **Step 1: The tiers, in order, each pasted into PHASE5's PR 3 verification paragraph**

```bash
npm test                      # expect 1488+/…, incl. test:db
npm run test:ct               # 336+/…
npm run gate                  # lint 0 errors, typecheck clean, coverage ≥ 90/80/95 on lib/**
npm run build
npm run test:e2e              # 36/36
npm run test:browser          # 26/26
npx supabase db reset --no-seed && npm run test:e2e:auth    # 63/63 on the local Docker stack
node docs/redesign-v2/phase4/audit/runtime-audit.mjs http://localhost:3000 docs/redesign-v2/phase5/screenshots/phase5-pr3/runtime e2e-admin@example.test <password> e2e-viewer@example.test   # 0 undefined var() on every route × theme — proves nothing still references --sp-pill-names-off
cmp app/styles/sp-components.css docs/redesign-v2/phase3/components/sp-components.css && echo IDENTICAL
grep -rn "0f62fe" app components lib | grep -v carbon-tokens.css      # nothing
git diff main -- app/styles/sp-tokens.css app/styles/brand app/styles/carbon-tokens.css app/styles/carbon-components.css   # ONLY the one deleted line in sp-tokens.css
git diff --stat main -- docs/redesign-v2/phase4                                  # nothing — phase4/ is closed record (ruling A)
```

If any run fails, fix inside this slice and re-run that tier; report the failure as it happened.

- [ ] **Step 2: Brand-system checklist on the preview** (after Step 3's PR opens and Vercel builds): primary `rgb(184, 92, 46)`, hover `rgb(143, 69, 33)`, focus ring #B85C2E 2px inset, current-section bar #B85C2E, links #8F4521 / #E8A07A — read via the `run-seat-planner` skill in real Chrome; record in PHASE5's verification paragraph.

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin feat/phase5-names-off-marker
gh pr create --title "feat(redesign-v2): phase 5 — the names-off marker becomes ● in the footprint (PR 3, v2.3.0)" --body-file - <<'EOF'
Phase 5 PR 3. Owner ruling R1 = Option B (2026-09-09): with Names off an assigned seat renders the empty-seat footprint carrying the legend's ●, on `/admin` and `/`. Fixes F-1 (selected invisible), F-2 (◇ clipped), F-3 (legend ● vs plan ■).

- `SeatMarker`: names-off children = `<SeatMark kind="assigned-dot" />` + the ◇; text stays empty; accessible name unchanged.
- Sheet amendment J (both copies byte-identical): three rules replace the filled-block group; `--sp-pill-names-off` retired; no token value moved.
- Band legend's ● shares the marker's fill colour (P-1). Specimen `02-map.html` updated (P-3).
- Record: PHASE3DS §1.16 amendment (3) + §1.4 cross-amendment; PHASE5 PR 3 (with the four contrast pairs); DECISIONS §6 note — next free stays 19. `phase4/` untouched.
- Rigs: marker-contrast (4 new pairs × 2 themes), `phase5/audit/pr3-names-off-marker.mjs` hit-tests (28×28, hover, focus, selected visible, quiet step, ◇ painted, 44px target, legend = marker, viewer parity, names-on unchanged).

Preview URL: <Vercel comment>. Reviewer smoke next; nothing merges until the owner says so.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01Wo6focYpYpmo5fd6xXZmyQ
EOF
```

- [ ] **Step 4: Update PHASE5's table row with the PR number, commit, push; hand the owner the preview URL and the capture folder.** Merge (squash), the `docs(redesign-v2): phase 5 — PR 3 merged (v2.3.0)` commit on `main`, the annotated tag `v2.3.0`, the prod READY check, and pruning the branch happen **only after the owner's go** — they are the owner's call, and `main` deploys to production.

---

## Verification (end-to-end)

1. Unit + source + db: `npm test` green; the five re-pointed tests pass; no test loosened (every removed assertion is replaced by a stricter one).
2. ct: `npm run test:ct` green — ● present with names off, text empty, legend ● carries the fill class.
3. Real CSS, real Chrome (local Docker stack): the marker rig's 12 claims × 2 themes × 2 surfaces PASS; the contrast rig exits 0 with the three names-off states measured ≥ 3:1; the runtime audit reports 0 undefined `var()`.
4. Eyes: the 3x crops — ● centred in a 28px footprint with a 1px edge; hover lifts; focus ring terracotta; selected 2px inverse edge visible; quiet lighter with a lighter ●; ◇ complete at the top-right; the band legend's ● matches; Names on pixel-identical to `main`.
5. Preview: brand checklist; toggle Names on `/admin` and `/` in both themes and watch the block become the footprint.

## Hand-off notes for the owner

- The working tree on `main` carries `CLAUDE.md` / `skills-lock.json` edits and untracked `.agents/skills/*` that predate this slice; they are not in this PR and **the build does not touch them** (reviewer: the owner rules on them separately). End-of-session hygiene's "status EMPTY" is therefore deferred to that ruling.
- One recommended next step after the smoke: merge, tag v2.3.0, and then rule the two carried PR 2 critique findings (the band→tail gap and the count-header/locked-row surface) as PR 4.
