# Phase 5 · PR 2 — Reception's narrow frame (v2.2.0)

**Plan of record.** Hand-off: `phase5-pr2-reception-narrow-HANDOFF.md` (committed `3da2397`, Task 0).
Branch `feat/phase5-reception-narrow` → v2.2.0. Owner rulings R1–R2 (2026-09-08, in the hand-off);
reviewer rulings on this plan's findings O-1…O-4 and the record addition, all **granted** 2026-09-08 and
folded in below. Reviewer verifies the branch before the smoke.

---

## 0. Set-up, verified before reading anything

```
main = b85cc41   (docs commit over squash 524c087, tag v2.1.0, prod READY)
branch = feat/phase5-reception-narrow   (cut from b85cc41; 3da2397 = the hand-off, one file, 180 lines)
```

`git fetch --prune` clean; the remote holds `main` alone; no stale `feat/phase5-publish-history`.
**Skill fingerprint `f997ee525800e755`** — 14 files, PHASE3DS §0 recipe, matches the hand-off's expected
value, so PHASE3DS §4's verdicts stand and are not re-derived.

Read in the hand-off's order: `CLAUDE.md` → `.claude/skills/brand-system/` → `DECISIONS.md` §2 + D3 →
`PHASE2UX.md` §1R (all) → `PHASE3DS.md` §1.22 + §1.29 → `PHASE4BUILD.md` §1.46 → `phase5/PHASE5.md`.

---

## 1. The slice in one paragraph

`/reception` exists so the front desk can take a call, find the person and read the extension aloud, and
the receptionist runs it in a **dragged narrow window** — routinely about a third of a 1920 monitor. Below
the 1055 fold, sheet amendment E stacks the whole readout under the list. That cost nothing while the row
extension was `20px` semibold, because the list answered the question by itself; the redesign set it to
`--sp-type-code-02` (`400 14/20`), so the list no longer answers and the one number she reads aloud sits
below the fold. Locking scrolls down to it and leaves the search above; the next lookup means scrolling
back up, and that loop is the entire job. Owner ruling **R1**: at narrow the readout splits **by job** —
name, extension and seat line become a band pinned under the search; Show on map, the same-department
fallbacks and Recent lookups follow the list. **R2**: the width varies, so the band holds from **480 to
the fold**, verified at 480 / 640 / 800 / 1024. Nothing at 1920 changes. This is a conformance fix under
DECISIONS §2 as amended by D0-e — **no §6 deviation, next free stays 19**, and the 1920 primary target is
not reopened.

---

## 2. The mechanism question (hand-off §4.3), answered up front

**CSS-only: `display: contents` + `order`, inside the existing `@media (max-width: 1055px)` block.
Approved as planned.** The `matchMedia` alternative is rejected on two counts: the server has no viewport,
so every narrow load would flip layout after hydration — on the surface whose whole value is speed, at the
width she always uses — and it would reintroduce a JS breakpoint constant weeks after PR 6 deliberately
retired `SEAT_CENTER_PANEL_BREAKPOINT_PX`.

### 2.1 Why no DOM reorder is available (finding O-1, **granted**)

The hand-off's Constraint 2 required *"DOM order must match visual order (WCAG C27)"* while §4.1 required
the ≥1056 frame unchanged. **Those cannot both hold**, because the band needs two different DOM positions:

| Route | What breaks |
|---|---|
| Band before the list in source | At wide the readout column becomes **two grid items**: the band lands in the search row and stretches it, dropping the list header by the band's height, and the column skin (one left rule, 32 padding, one `min-height`, one sticky box) has to be re-plumbed on two boxes. The ≥1056 proof fails. |
| Readout first in `.sp-recep`, re-placed with `order` at wide | The readout's **focusable** children precede the search field in DOM. §1R.7's keyboard path breaks at wide. Worse. |
| Two trees from `matchMedia` | Hydration flip at narrow, plus the retired-constant objection above. |

**Reviewer ruling (granted, 2026-09-08): Constraint 2 relaxes from C27 to WCAG 2.4.3 Focus Order.** C27
is a *sufficient technique*, not a success criterion; the normative floors are **1.3.2 Meaningful Sequence**
and **2.4.3 Focus Order**.

- **2.4.3 holds** because the band carries **zero focusable elements** at narrow — §4.2 retires
  `Back to the list` there, which removes the only one. DOM order stays list → readout, so Tab remains
  field → clear × → list roving cursor → tail controls → recents at **both** frames.
- **1.3.2 holds** because the DOM sequence search → results → detail → tail is itself a coherent reading
  order: it is the list-then-detail sequence D3 chose, and it is today's shipped narrow order.
- The band's content is `aria-live`, so a screen-reader user is **announced** the number on lock and never
  navigates to it.

Conditions attached to the grant, carried into §6:
**(a)** assert **zero focusable elements inside the band** at all four widths;
**(b)** an explicit **Tab-order assertion** — field → clear × → list roving cursor → tail controls →
recents — at 480 / 640 / 800 / 1024 **and 1920**;
**(c)** **axe clean**, including that the labelled `Caller detail` section still exposes its landmark under
`display: contents` (§4.3's standing condition).

### 2.2 The two known risks in §4.3, handled

- **The landmark.** `display: contents` on `<section aria-label="Caller detail">` historically dropped it
  from the accessibility tree; Chromium and Gecko fixed that (an element with a role and an accessible name
  stays exposed), and Chrome is the owner's target. It is **proved, not assumed**: the rig queries
  `getByRole("region", { name: "Caller detail" })` at 480 — a real a11y-tree lookup, not a class match —
  and axe runs at all four widths. Contained fallback if a browser drops it: move the label to the band
  (which keeps a box at both frames) and re-anchor `page-frames`' wide 480 assertion to `.sp-recep-readout`
  by class.
- **`.boundingBox()` is null on a `display: contents` element.** `page-frames.spec.ts:211` measures the
  region's box. The **wide branch is unaffected** — the section keeps its box ≥1056 — and the narrow branch
  is rewritten anyway.

### 2.3 Two seam findings, both solved by inheritance (accepted)

1. **The 1024–1055 seam.** Tailwind `lg` is 1024; the sheet fold is 1055. In that 32px band the layout is
   already narrow while the shell has already switched scroll containers: `AppShell.tsx:392` goes
   `lg:h-[100svh] lg:overflow-hidden` and the page's `role="region"` wrapper (`reception/page.tsx:92`)
   becomes the scroller, so a sticky `top` must be **0**, not 48. `ReceptionScreen.tsx` already carries
   `lg:[--sp-shell-header-h:0px]` on the readout, and **the band is a DOM descendant of it** — custom
   properties inherit through the DOM regardless of `display: contents` — so the band reads `0` in the seam
   and `48` below 1024 with **no new class and no new constant**.
2. **The ↑ ↓ cursor parking under the pinned band.** `scrollIntoView({ block: "nearest" })` treats a row
   hidden behind a sticky band as visible, so moving the cursor up would park it out of sight. Fixed with
   `scroll-margin-top` on `.sp-recep-row` inside the fold, set once to the band's **measured maximum
   height** (the stacked variant at 480). The arithmetic is exact in both scroll models: below 1024 the
   document scrolls and `html { scroll-padding-top: var(--sp-shell-header-h) }` (`globals.css:72`) supplies
   the 48, so the offset is `48 + band`; in the seam the pane scrolls and has no scroll-padding, so it is
   `band` alone. **One constant, named once in the sheet.** Per the ruling, the rig **hit-tests the parking
   at all four widths** rather than asserting the constant back to itself.

---

## 3. The rulings folded in

| Finding | Ruling | Consequence for the build |
|---|---|---|
| **O-1** C27 vs "wide unchanged" | **Granted** — Constraint 2 becomes 2.4.3 focus order | CSS-only mechanism; conditions (a)(b)(c) in §6 |
| **O-2** R3's map-first tail | **Granted; R3 withdrawn by the reviewer** | Keep the shipped order — fallbacks → Show on map → recents. **No §1R.4 item-order amendment.** Never reorder focusable controls at either frame |
| **O-3** live region narrows to the band | **Granted, with conditions** | §4.1's guarantee is restated (below); pinned by a component test |
| **O-4** "search reachable without scrolling up" | **Granted** | Assert the *loop*, not the pixels; do **not** pin the search; add the band-in-viewport paint assertion |
| **Record addition** | **Accepted** — becomes **D3-f** | Record change = §1R.6 rewritten + amendment I + **D3-f**. Still no §6 deviation, next free stays 19 |

### 3.1 §4.1's guarantee, restated (O-3 condition (a))

> **At ≥1056px the rendered LAYOUT and computed styles are unchanged, with one named, dated exception:
> the live-region scope (2026-09-08, reviewer ruling on finding O-3).**

Today `aria-live="polite"` wraps name + `.sp-readout` + seat line **+ the fallback list + Show on map**, so
every lock announces the colleague roster and a link; the recents `<aside>` already sits outside it for
exactly this reason (O-9). Splitting by job makes the band the live region, so the fallbacks and Show on map
leave it and a lock announces **name · Extension N · seat line** and stops. This is continuous with O-9's
intent, not a departure from it — but it is a wide behaviour change, so it is named here and **pinned by a
component test** (condition (b)) so a later refactor cannot silently widen or narrow it again.

### 3.2 D3-f (the record addition)

`DECISIONS.md` D3 chose option A — *"single-column list with drill-down below lg"* — specified *"an explicit
back path"*, and **accepted** the trade-off *"below lg the readout replaces the list rather than sitting
beside it, so the receptionist loses the queue while reading a number aloud"* (DECISIONS.md:1108-1132). The
band supersedes all three. **D3-f (2026-09-08)** states: the band replaces the drill-down at narrow; the
queue is no longer lost while a number is read aloud; the explicit back path is **retired at narrow** because
the list is never left. D3-f subsumes the back-button note in hand-off §4.2 and the hand-off's R4.

---

## 4. The narrow frame as designed

### 4.1 The component split

`components/reception/ReceptionScreen.tsx` — the single `aria-live` wrapper becomes three siblings inside
the **unchanged** `<section className="sp-recep-readout" aria-label="Caller detail">`:

```
section.sp-recep-readout                     (same element, same label, sticky at wide)
├── div.sp-recep-band[aria-live="polite"]    name · role · tile · seat line   (and the waiting copy)
│   ├── div.sp-recep-who      { h2, p.sp-recep-role }     (today's unnamed div, now classed)
│   ├── div.sp-readout        { eyebrow, numeral | "No extension on file", hint }
│   └── div.sp-recep-seatline
├── div.sp-recep-tail         { .sp-recep-fallback, Show on map }      ← shipped order, O-2
└── aside.sp-recep-recent     (unchanged, already outside the live region)
```

- **`.sp-recep-back` and `backToList()` are deleted** (D3-f). This is also what makes 2.4.3 hold at narrow:
  it removes the band's only focusable element.
- The band renders in **every** state — a locked person, `No extension on file`, and `Waiting for a call`.
- Nothing else moves: same handlers, same `?q=` writer, same ranking, same two Esc rungs, same
  `keepInputFocus` mousedown discipline.

### 4.2 Sheet amendment I

Written into **both** lockstep copies, byte-identical: `app/styles/sp-components.css` and
`docs/redesign-v2/phase3/components/sp-components.css`. Commented in G/H's voice — the rule, the record
line it implements, the measurement it came from, the reason.

Base rules reproduce today's computed values at wide (flex column, `gap: var(--sp-space-05)`), replacing the
Tailwind utilities that styled the old live div, so the section's children stay 16 apart exactly as now:

```css
.sp-recep-band, .sp-recep-tail { display: flex; flex-direction: column; gap: var(--sp-space-05); }
```

Inside the fold: `display: contents` on the list column and the readout section; the band ordered between
the search and the count header; the list bits after it; the tail and recents last. The band is
`flex-wrap` with `min-width: 0` on the name block — **no second media query and no fixed width that can beat
the computed frame** (the F-9 failure carried past v2.0.0: `.sp-palette`'s fixed 560 left 182px off-screen
at 390). The band's tint is `--sp-readout-bg`, which the tile already uses, so the tile's own padding is
zeroed at narrow and the band reads as **one surface — the tile grown to hold the name and the seat line** —
rather than a 16 + 24 nested box.

**Two constants are measured on the live band, not guessed** — the discipline amendment H's column widths
came from ("judged from pixels, not paper"): the name block's `flex-basis` (so the wrap lands near 560) and
`scroll-margin-top` (the band's stacked maximum height at 480). Each is named once in the sheet with its
measurement in the comment.

**No token file moves.** `sp-tokens.css`, `carbon-tokens.css`, `carbon-components.css` and
`app/styles/brand/` are untouched; no new colour, so **contrast is not re-run**. If the measured basis turns
out to want a token, that is a raise, not a build decision (§4.4).

### 4.3 Loading skeleton

`app/(shell)/reception/loading.tsx` states its own job — *"the skeleton sits on the REAL layout … so the
frame does not jump when the directory lands"*. After the split it would jump by the band's height at narrow,
so one band-shaped skeleton block carrying `.sp-recep-band` goes between the search and the count header and
the fold's rules place it.

---

## 5. File map

| File | Change |
|---|---|
| `components/reception/ReceptionScreen.tsx` | the band / tail split; `.sp-recep-back` + `backToList()` deleted; `aria-live` moves to the band |
| `app/(shell)/reception/loading.tsx` | one band-shaped skeleton block |
| `app/styles/sp-components.css` | **amendment I** |
| `docs/redesign-v2/phase3/components/sp-components.css` | amendment I, **byte-identical** |
| `docs/redesign-v2/PHASE2UX.md` | §1R.6 "Narrow (1024)" row rewritten |
| `docs/redesign-v2/DECISIONS.md` | **D3-f** (2026-09-08) |
| `docs/redesign-v2/phase3/PHASE3DS.md` | §1.29 amendment I paragraph, following amendment E's |
| `docs/redesign-v2/phase5/PHASE5.md` | PR 2 slice row + section, in PR 1's shape |
| `tests/reception-source.test.mjs` · `tests/reception-screen.test.mjs` · `tests/e2e-auth/page-frames.spec.ts` | dispositions in §6 |
| `docs/redesign-v2/phase5/audit/pr2-reception-narrow.mjs` + `screenshots/phase5-pr2/` | the capture + measure rig |

**Not touched:** any token file, `app/styles/brand/`, the vendored `carbon-tokens.css` /
`carbon-components.css`, `supabase/config.toml`. **No migration**, so the Vercel preview is walkable — and
Reception is read-only regardless. Never Publish or Discard there.

---

## 6. Test dispositions — re-pointed, never loosened

| Test | Disposition |
|---|---|
| `reception-source` | **extended** — band/tail contracts; **exactly one** `aria-live` and the extension **once** in the source (Constraint 1); `Back to the list` gone |
| `reception-screen` (ct) | jsdom applies no media query, so it sees the wide DOM and the existing cases stand. *"Back to the list sits first in the readout"* is **deleted with the button** (D3-f). **New: the live region's contents are pinned** — name, tile and seat line inside; fallbacks, Show on map and recents outside (O-3 condition (b)) |
| `page-frames` (e2e-auth) | **wide branch untouched** — 480 / 32 / 1008, no header action, skip link on the field. Narrow branch rewritten: one column, the region still resolves **by role**, the band's box above the list's, no back button |
| `phase4-token-layer-source` | unchanged and must stay green — it is the byte-identical gate on the two sheet copies |

**The rig** `docs/redesign-v2/phase5/audit/pr2-reception-narrow.mjs`, PR 1's shape, captures +
`results.json` + README under `screenshots/phase5-pr2/`. Every geometric claim a **hit-test**, not a
visibility check — amendment D's precedent, where a tooltip passed a visibility assertion while clipped.

**The ≥1056 proof** (the claim the owner leans on most): `page-frames`' wide branch green at 1280 and 1920;
a computed-style dump of the section and its children at 1920 diffed against `main`; and a byte-compare of
`/reception` at 1920 light + dark against a `main` baseline captured **standalone on the same-day seed**
(PR 5 §1.46's lesson — a baseline taken while another pass resets the database records the login page).

**The narrow proof — 480 / 640 / 800 / 1024 × light + dark:**

| # | Claim | How | Source |
|---|---|---|---|
| 1 | The numeral is inside the viewport **with the list scrolled to its end** | `elementFromPoint` at the numeral's centre resolves to it or a descendant | R1 |
| 2 | The band is above the list at rest and **pinned** while scrolling | band `y` < first row `y`; band `y` constant across a scroll to the end | R1 |
| 3 | The band holds every state | "Waiting for a call", a locked person, "No extension on file", partial | §4.2 |
| 4 | Reflow | side-by-side at and above the measured wrap width, name block under the numeral below it; no horizontal scroll, nothing off-edge, at all four | R2 |
| 5 | **Zero focusable elements inside the band** | tabbable-node count within the band is 0 | O-1 (a) |
| 6 | **Tab order** field → clear × → list roving cursor → tail controls → recents | walked with real Tab presses, **at the four widths and at 1920** | O-1 (b) |
| 7 | **axe clean**, landmark exposed under `display: contents` | axe at each width + `getByRole("region", { name: "Caller detail" })` | O-1 (c) |
| 8 | The loop, not the pixels: after `lock()` focus is in the field and typing filters the list **with no user scroll** | assert `document.activeElement` is `#reception-main`, type, assert the count changes | O-4 |
| 9 | **The band is fully inside the viewport while the field has focus** | full-box hit test, all four corners | O-4 |
| 10 | The arrow cursor never parks under the band | ↑ from mid-list, then hit-test the cursor row's top against the band's bottom — **measured, not derived from the constant** | mechanism ruling |
| 11 | One live region, one extension | exactly one `[aria-live]` node; the extension string appears once in the DOM | Constraint 1 |
| 12 | Tail order and reach | fallbacks → Show on map → recents below the list | O-2 |

---

## 7. Verification block, run on the final head before the PR

`npm test` (incl. `test:db`) · `npm run test:ct` · `npm run gate` (lint / typecheck / coverage floors) ·
`npm run build` · `npm run test:e2e` · `npm run test:browser` · **`npm run test:e2e:auth` on the local
Docker stack** (not waivable before the PR opens) · runtime audit **0 undefined `var()`** · `sp-components.css`
**byte-identical** to the docs copy · **contrast not re-run — no token moves** · the `brand-system` per-PR
checklist · the rig above, with `results.json` and captures committed.

---

## 8. Task order after "go"

1. This plan of record, committed. *(done)*
2. The component split + the back button's deletion; the loading skeleton.
3. Amendment I into both sheet copies with the two constants left as measured placeholders.
4. Stand the app up, **measure** the wrap basis and the band's stacked maximum, fill both constants.
5. Test dispositions: `reception-source`, `reception-screen`, `page-frames`.
6. The rig + captures at four widths × two themes, plus the 1920 proof.
7. The record: §1R.6 rewritten, D3-f, PHASE3DS §1.29, PHASE5.md.
8. Full verification block, then the PR. Reviewer verifies the branch before the smoke.
