# Phase 5 · PR 2 — Reception's narrow frame · HAND-OFF

**For a fresh Claude Code session. Task 0 commits this file, then you plan in plan mode. Nothing is built
until the owner says "go".**

Reviewer: Cowork (design governance). Owner: Patrick. Written 2026-09-08.

---

## 0. Set-up, before you read anything else

```
main = b85cc41   (docs commit over squash 524c087, tag v2.1.0, prod READY)
branch to cut = feat/phase5-reception-narrow      →  v2.2.0
```

1. `git fetch --prune && git status` — the remote holds `main` alone. If a local
   `feat/phase5-publish-history` still exists, delete it locally and **never push it**.
2. **Verify the skill fingerprint** with the PHASE3DS §0 recipe before you take any design rule as read:

   ```
   cd <plugin cache>/design-system/1.3.0/skills/ibm-design-language && \
   find . -type f | LC_ALL=C sort | while read f; do \
     printf '%s  %s\n' "$(sed 's/\r$//' "$f" | sha256sum | cut -d' ' -f1)" "$f"; done | \
     sha256sum | cut -c1-16
   ```

   Expect **`f997ee525800e755`** (14 files, 9 references, 193,908 bytes LF-normalised). The reviewer
   re-verified this on 2026-09-08. A different value means the skill moved and PHASE3DS §4's verdicts need
   re-reading before you rely on them.
3. **Read order.** `CLAUDE.md` → `.claude/skills/brand-system/` (the brand token values, contrast tooling
   and the per-PR verification checklist now live there, not in the root) → `docs/redesign-v2/DECISIONS.md`
   §2 and D3 → `docs/redesign-v2/PHASE2UX.md` §1R (all of it) → `docs/redesign-v2/phase3/PHASE3DS.md` §1.22
   and §1.29 → `docs/redesign-v2/phase4/PHASE4BUILD.md` §1.46 → `docs/redesign-v2/phase5/PHASE5.md`.

---

## 1. The problem, as the owner put it

`/reception` exists for one job: the front desk takes a call, looks up the person, and reads their
extension aloud to transfer. The receptionist **does not run this page full-screen**. She keeps it in a
narrow window — she drags it, so the width varies, but it is routinely around a third of a 1920 monitor.
At that width the extension readout falls below the result list and she cannot see the number she is
about to say.

## 2. What actually regressed — verified, do not re-derive

The reviewer checked this against the shipped code and v1.74.6. Two of the three obvious hypotheses are
wrong; take these as findings:

| Claim | Verdict |
|---|---|
| "The redesign moved the detail below the list" | **No.** Pre-redesign `ReceptionScreen.tsx` used `lg:grid-cols-[minmax(0,1fr)_372px]` — Tailwind `lg` = 1024px — and put its detail card below the list too. Old and new stack identically below 1024. |
| "The breakpoint is wrong" | **No.** Amendment E's `@media (max-width: 1055px)` is a faithful implementation of PHASE2UX §1R.6 "Narrow (1024)". |
| "The number in the row got quieter" | **Yes — this is the regression.** v1.74.6 set the row extension at `font-mono text-[20px] font-semibold`. Shipped sets it at `--sp-type-code-02` = `400 14px/20px`. The list used to answer the question by itself, so a detail card below the fold cost nothing. It no longer does, so the same stacking is now fatal. |

**Root cause, stated once:** §1R.6's narrow frame is a *navigation* pattern — list, then detail, one at a
time — but it was built as one long scroll, so the two zones compete for the same vertical run. Locking
scrolls down to the answer and leaves the search field above the fold; the next lookup means scrolling
back up. That loop is the entire job.

**This is a conformance fix, not a new requirement.** DECISIONS §2 already binds it: "the app adapts at
every viewport, 320px and up, while 1920×1080 remains the width the design is optimized for", amended by
D0-e to "design and test at 1920 with **one deliberate narrow fallback**". Reception has that fallback;
it just does not serve the task at the width it is actually used. **No DECISIONS §6 deviation is needed
(next free stays 19), and the 1920 primary target is not reopened.**

## 3. The owner's ruling — 2026-09-08

Ruled from four mocked options rendered in the shipped sheets:

- **R1 — Option B, the compact band.** At narrow, the readout splits by job. **Name, extension and seat
  line** become a band pinned directly under the search. **"Show on map", the same-department fallback
  and Recent lookups** move below the list. The `heading-06` 42px numeral survives; the list stays dense;
  **nothing at 1920 changes.**
- **R2 — the width varies.** She drags the window, so do not tune to 640. The band must hold **from 480px
  up to the 1055 fold**, verified at 480, 640, 800 and 1024.
- Options A (whole readout above the list) and C (loud row extension at every width) were **not** taken.
  Do not implement either. In particular **do not change `--sp-type-code-02` or the row's extension
  type** — Carbon's productive type set is fixed across breakpoints ("sizes never change with breakpoint,
  the container does"), so a narrow-only row-type bump is not available to us, and the owner declined the
  all-widths version.

Two items ride to your plan for the owner to confirm at plan review — the reviewer's recommendation, not
settled record:

- **R3 (recommended):** the split above. Band = name · extension · seat line. Below the list, in order:
  Show on map, "If no answer — same department", Recent lookups. Records as a PHASE2UX §1R.4 item-order
  amendment scoped to the narrow frame.
- **R4 (recommended):** record as amendments to **PHASE2UX §1R.6 "Narrow (1024)"** and to sp-components.css
  **amendment E**, plus a new sheet **amendment I**. No deviation, no target change.

## 4. What to build

### 4.1 Scope

Everything is **inside the existing `@media (max-width: 1055px)` block** and the component that feeds it.
At ≥1056px the rendered DOM and computed styles must be **unchanged** — prove it, see §5.

### 4.2 The band

- Pinned under the search: `position: sticky` at `top: var(--sp-shell-header-h)`, so it survives the list
  scrolling under it. Surface `--sp-readout-bg`, `--sp-space-05` padding, `inset 0 -1px 0
  var(--sp-border-subtle-00)` as its bottom rule.
- Contents: eyebrow "Extension" (`label-01`, `--sp-readout-eyebrow`) over the numeral (`heading-06`,
  `--sp-readout-numeral`, `tabular-nums`); alongside it the name (`heading-03`), the role line
  (`body-compact-01`, `--sp-text-secondary`) and the existing `.sp-recep-seatline`.
- **Reflow (R2):** side-by-side while it fits; the name block wraps under the numeral below roughly 560.
  Use flex with wrapping and `min-width: 0` on the name block — no second media query if you can avoid
  one, and no fixed width that can beat the computed frame (that is exactly the F-9 failure carried past
  v2.0.0: `.sp-palette`'s fixed 560 leaves 182px off-screen at 390).
- The empty and "no extension on file" states keep their §1R.6 and §1R.4 item 4 copy — the band must hold
  "Waiting for a call" and "No extension on file" as gracefully as it holds a number.
- The `Back to the list` ghost (`.sp-recep-back`) is **retired at narrow**: with the answer pinned above
  the list there is nothing to go back from. That is a PHASE2UX §1R.6 amendment; say so in the plan.

### 4.3 The mechanism — decide this in your plan and justify it

The band and the tail are two places in the page, and the source has one readout section. Two candidate
mechanisms; the reviewer has no fixed preference, but **both hard constraints below are non-negotiable**:

- **CSS-only:** split the readout's children into a primary and a secondary group, then at narrow use
  `display: contents` on the two wrappers with grid `order` to interleave them with the search, header and
  rows. No JS, no hydration risk. **Known risk:** `display: contents` on the `<section aria-label="Caller
  detail">` has historically dropped the element from the accessibility tree; if you take this path you
  must move the label to an element that keeps its box and prove the landmark still exists in the axe run.
- **JS media query:** render two fragments from a `matchMedia` hook. Clean semantics. **Known risk:** SSR
  gives no viewport, so the first paint must not flip layout after hydration, and PR 6 deliberately retired
  the `panel:` tier and `SEAT_CENTER_PANEL_BREAKPOINT_PX` — do not reintroduce a JS breakpoint constant
  casually. If you go this way, say why the retirement does not apply.

**Constraint 1:** exactly **one** `aria-live` region on the page, and the extension appears in the DOM
**once**. No duplicated-and-hidden copy — the front desk uses a screen reader-adjacent workflow only in the
sense that double announcement is a real defect; more simply, two copies drift.
**Constraint 2:** the keyboard path of §1R.7 survives — field first, then clear ×, then the list roving
cursor, then the readout actions, then recents. The band sits between search and list visually; DOM order
must match visual order (WCAG C27).

### 4.4 The sheet

- **Amendment I** (next free letter — A–H are taken), written into **both lockstep copies**:
  `app/styles/sp-components.css` and `docs/redesign-v2/phase3/components/sp-components.css`, byte-identical.
- Comment it the way G and H are commented: the rule, the record line it implements, the measurement it
  came from, and the reason.
- **No token file is to move.** If you believe you need a new token, stop and raise it — that is a reviewer
  question, not a build decision.
- Vendored `carbon-tokens.css` / `carbon-components.css` and `app/styles/brand/` stay untouched.

## 5. Verification obligations

Standing per-PR checklist in `.claude/skills/brand-system/`, plus for this slice specifically:

- **The ≥1056 proof.** A capture or assertion pair showing the 1920 frame's readout column, its 480 width,
  the 32 gutter and the 1008 list (PHASE2UX §1R.2 amendment, asserted today by the `page-frames` spec) are
  all unchanged. This is the claim the owner is relying on most.
- **The narrow proof, at four widths — 480, 640, 800, 1024 — in both themes.** Every geometric claim a
  **hit-test**, not a visibility check: the precedent is PR 4's amendment D, where a tooltip passed a
  visibility assertion while clipped. Assert that the numeral's box is inside the viewport with the list
  scrolled to its end, and that the search field is still reachable without scrolling up.
- Full gate: `npm test`, `test:ct`, `gate`, `build`, `test:e2e`, `test:browser`, **`test:e2e:auth` on the
  local Docker stack** (colima + Chrome — the Docker-stack evidence is not waivable before a PR opens),
  runtime audit 0 undefined `var()`, `sp-components.css` byte-identical to the docs copy.
- **Contrast:** re-run only if a token moves. It should not. If it does, that is a raise, not a build.
- Capture + measure rig under `docs/redesign-v2/phase5/audit/`, screenshots under
  `screenshots/phase5-pr2/`, in the shape PR 1 established.

## 6. Deliverable for this session

**Task 0:** commit this file to `docs/redesign-v2/phase5/plans/`.
**Then: a plan, in plan mode, for review — do not build.** It must name the mechanism from §4.3 with its
justification, the exact amendment I text, the §1R.4/§1R.6 amendments, the four-width verification matrix,
and anything in §3–§5 you think is wrong. The reviewer would rather hear an objection now than review a
branch built on a bad instruction.

## 7. Standing rules for this repo

- The Vercel preview reads and writes **production** when the PR carries no migration. This PR should carry
  none, so its preview is walkable — but Reception is read-only anyway.
- Do not touch `supabase/config.toml`'s `[db.seed]`.
- The owner walks the preview himself, or asks you to walk it read-only. Never Publish or Discard there.
