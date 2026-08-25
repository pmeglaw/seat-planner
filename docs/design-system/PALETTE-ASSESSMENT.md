# Find-palette assessment — `ViewerFindPalette` as the first-class find path

**Date:** 2026-08-25 · **Method:** live drive of `npm run dev` against production data (Playwright driver, viewer surface `/`, viewports 1376×900 / 800×900 / 375×800, light + dark), plus source read of `ViewerFindPalette.tsx`, the `ViewerSeatFinder` wiring, and `lib/viewerFindPalette.ts` / `lib/viewerSeatSearch.ts`.

**Why now:** the 2026-08-25 browse ruling (READ-PATH-ASSESSMENT.md) made hover a browse affordance and named the palette the **find path** — the surface that answers "where does X sit". This assessment holds it to that bar. The read-path arc's F-numbers are all closed; findings here are numbered **P1–P6**.

**The scale fact everything below prices against:** the live directory is **101 people · 15 seated** (palette footer, measured live). The palette's own code comment still says "production's 16 people are placeholder" — the real directory has landed since, and it changes the weight of two contracts ruled at placeholder scale.

---

## What measured strong (recorded so it is not re-litigated)

- **Esc peels exactly one layer per press**, in contract #7's order: palette → query → selection → pinned zone. Verified live including the field-local double-Esc (close palette, then clear query). The `preventDefault` against `type="search"`'s native clear is load-bearing and documented in place.
- **The legend's keyboard promises are real where it matters:** ArrowDown from the field lands on the first **enabled** row (disabled unseated rows skipped, both modes); Enter from the field opens the top result in query mode; browse roving uses absolute indices so windowing cannot warp mid-list ArrowUp into the field.
- **Focus handoff on open-row is right** (#454, verified live): a person/seat row hands focus to `#seat-inspector-panel` — the sanctioned read surface — on both new and repeat selection; department/zone rows return it to the field behind the reopen-suppress flag.
- **Result counts are published, zero included:** "5 results · 2 mapped" live in an `aria-live=polite` header; the zero state names the query, says what was searched, and offers a Clear action. This is the IDL search contract done properly.
- **Windowing earns its keep at real scale:** 19 of 101 browse rows mounted at 1376×900. Query mode deliberately renders every row (documented tradeoff for DOM-walk roving); worst live query ("a") is 36 rows — acceptable at this directory size, re-check if the directory triples.
- **Zone-chip preview is not pointer-only** — focus previews the wash exactly as hover does (8 wash nodes lit for an 8-seat zone, measured).
- **Geometry contracts hold on fresh opens:** desktop palette 560px aligned to the field, clears the status legend (bottom inset 60px measured 57–60px live); sheet mode below 900px spans inset-x-3; phone fresh-open sits fully inside the viewport.
- **Both themes hold:** helper text measured `#6E655A` on white (5.7:1) and `#9A9A9A` on `#1F1F1F` (≈5.8:1). The two in-code contrast deviations from the mock (eyebrow token, chip-count opacity .90) check out as written.
- **No console errors** in any driven state.

## P1 — Keyboard-pinning a zone chip drops focus to `<body>`. **(high — the one unguarded focus path)**

`pinZoneFromPalette` (`ViewerSeatFinder.tsx:785`) closes the palette with no focus handoff. Every other close path guards the drop — Escape hands back to the field, `openResult` hands to the inspector or the field — but Tab/arrow to a chip, press Enter, and the chip unmounts under focus: `document.activeElement` measured `BODY` live. The chips' own eyebrow advertises "Enter to filter", so this is an invited keyboard path, not an edge case. Fix shape already exists in the same file: focus the field behind `suppressPaletteReopenRef`, exactly as the department/zone rows do.

**FIXED 2026-08-25** — `pinZoneFromPalette` now hands focus to the field behind the suppress flag; verified live (focus lands on the field, palette stays closed) and pinned in `tests/focus-handoff-source.test.mjs` alongside the other two handoffs.

## P2 — At real scale, 85% of the browse feed is disabled rows. **(medium — contract #9 re-weigh, owner ruling)**

Contract #9 ("unseated people stay listed and honest, never openable") was ruled when the directory was 16 placeholder people. Live it is 101 people / 15 seated: the A→Z feed interleaves the 15 openable rows among **86 disabled rows** at `opacity-60` (~sub-AA by design; axe skips disabled elements, so no tier will ever flag it). The browse feed's signal density is 15% — a user browsing for *who sits here* scrolls a directory that is mostly grey. IDL's own disabled/read-only table says disabled is only safe when the content doesn't need reading; a directory row's presence arguably *is* content. Options at ruling time: seated-first grouping (honest and cheap), a seated-only default with a "show everyone" reveal, or accept as-is (the honest-census reading). This is a re-weigh on new facts, not a re-litigation.

## P3 — The find path carries the widest sub-12px spread in the app. **(medium — type-floor ruling, same logic that closed F6)**

`ViewerFindPalette.tsx` holds 12 ledger instances (`type-floor-source`), all Group 3 "not yet ruled", and they are words on chrome, not map canvas: the **9px** result-kind badge (the smallest text on any shipped surface, on every query row), **10px** mono seat-code pills / chip counts / "No seat", **11px** row subtitles, result meta, zone chips, header count, and footer legend. F6 just ruled that words on the sanctioned *read* surface obey the 12px floor; the palette is now the sanctioned *find* surface, and the same weight-raise applies. A ruling should also say which of these are mark-adjacent (the mono seat-code pill and chip count have a real mark argument) versus reading text (subtitle, meta, footer).

## P4 — Resize races the bar re-wrap; the frame goes stale. **(low-medium — FIXED)**

**FIXED 2026-08-25** — the measure effect now re-reads in a rAF after each `resize` (landing after the bar's tier re-render moves the anchor) and holds a `ResizeObserver` on the anchor for box changes with no window resize. Verified live both directions across the 900px breakpoint (1280→375: sheet snaps to insets inside the viewport; 375→1280: frame realigns to the anchor); pinned in `tests/viewer-find-palette-source.test.mjs`.

The palette measures its frame on `resize` only, on the stated theory that the field never moves vertically. Crossing the 900px breakpoint falsifies it: the top bar re-wraps *after* the resize handler reads the anchor, so at 375×800-after-resize the palette measured 40px past the viewport bottom **and** underlapping the top bar (screenshot on file). Fresh opens are correct, so exposure is live resize/rotation with the palette open. Fix shape: a `ResizeObserver` on the anchor (or a rAF re-measure after resize) instead of the single synchronous read.

## P5 — The copy promises inputs the modality doesn't have. **(low — FIXED)**

**FIXED 2026-08-25**, three parts, all copy-side (the Enter behavior was left as-is and the legend scoped to it, the cheaper of the two options offered):

- **Per modality** (the F5 logic verbatim): on `(pointer: coarse)` the keyboard copy hides — the zones eyebrow swaps its "hover to preview, Enter to filter" tail for "tap to filter", and the footer's key legend hides. In query mode that empties the footer, so the whole strip hides with it rather than leaving a bare border; in browse mode the strip stays for the "N people · M seated" summary.
- **Per mode**: the browse legend drops "Enter opens" ("↑↓ to move · Esc closes"), because the field's Enter handler is gated on an active query; only the query-mode legend claims Enter.
- **The 375px two-line wrap**: keys span `whitespace-nowrap`, summary `min-w-0 truncate` — the strip stays one line at any width (and on real phones the coarse-pointer hide removes half of it anyway).

Pinned in `tests/viewer-find-palette-source.test.mjs` (modality + mode scoping) and `tests/viewer-find-palette-component.test.mjs` (browse legend must not say "Enter opens"; query legend must).

## P6 — Recorded facts for the next session. **(no action)**

- Chip **click-pin closes the palette by design** (`pinZoneFromPalette`) — the pin is a terminal act, unlike hover-preview. Recorded so P1's fix doesn't get "fixed" by keeping the palette open instead.
- The palette **reserves no stage width** — the map never reflows for it (contract #2, verified: it floats `fixed z-[70]`).
- `aria-controls` is gated on open (unmounted id = axe critical) and the combobox role is deliberately not claimed — both documented in place and correct; don't "upgrade" the field to combobox.
- Browse rows and search rows share one formatting point (`lib/viewerSeatSearch`), pinned byte-identical by `tests/viewer-directory.test.mjs`.

---

## Ranked

| # | Finding | Severity | Wants |
|---|---|---|---|
| P1 | Keyboard chip-pin drops focus to `<body>` | high | **fixed** — handoff added, pinned in `focus-handoff-source` |
| P2 | Browse feed 85% disabled rows at 101-person scale | medium | ruling (contract #9 re-weigh: grouping / seated-first / accept) |
| P3 | 9–11px words across the find surface (12 ledger sites) | medium | ruling (extend the F6 floor logic; separate marks from words) |
| P4 | Stale frame on resize across the 900px breakpoint | low-medium | **fixed** — rAF re-read + `ResizeObserver` on the anchor, pinned in `viewer-find-palette-source` |
| P5 | Keyboard copy on touch; "Enter opens" false in browse mode | low | **fixed** — modality + mode scoping, pinned in both palette test files |
| P6 | Design facts recorded (pin-closes, no-reflow, no-combobox) | — | recorded |

Nothing blocks first users. P1 (the only defect) is fixed; P2 and P3 are the two rulings, and P2 is the one to settle first — its answer (how much of the feed is people vs. census) shapes what P3's floor work has to fit.
