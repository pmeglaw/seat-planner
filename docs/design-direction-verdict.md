# Design direction verdict — Charcoal vs Warm ivory (2026-07-01)

Side-by-side: Figma page "SxS · Charcoal vs Warm" (file bUamzKfLaTaCyanIXhLURQ) — the same
variable-bound hi-fi admin screen rendered in both palettes via a second variable mode ("Warm",
values from `app/concepts/component-state-board/componentStateBoardData.ts`). Judged by four
independent adversarial lenses.

## Scoreboard (A = Charcoal, B = Warm ivory)

| Lens | A | B | Winner | Crux |
|---|---|---|---|---|
| Brand & identity | 8 | 6 | Charcoal | One orange in a cool field = deliberate brand act; B smears the brand hue across accents/warnings/danger and is assembled from stock Tailwind orange+stone |
| Accessibility & contrast | 6 | 8 | **Warm** | A's muted text 4.14:1 on canvas (AA FAIL); 3 of 4 A status hues <3:1; amber/orange deutan trap. B's chips clear 6.4–10.2:1; teal survives all CVD. B's one fail: copper halo 2.90:1 on stone |
| Map legibility | 9 | 5 | Charcoal | **Decisive lens** (map = focal point): floor render is warm beige; cool shell makes the map the warmest object on screen. B's draft/reserved/hover fills measure 1.02–1.10:1 against the floor — they camouflage into the carpet. 17 close states collapse in the field; 10 far-apart states survive |
| Enterprise longevity | 8 | 6 | Charcoal | B is the signature 2025–26 warm-Apple aesthetic (dates fast) and is hardcoded-hex prototype; A is shipped + tokenized (40 vars, code syntax), 3 hue families vs 5 to police |

**Total: Charcoal 31 — Warm 25. Lenses 3–1.**

## Decision: Charcoal shell, warm organs

Keep the charcoal system as the shell. Transplant B's genuinely superior parts:

1. **The 17-state seat-marker taxonomy** + per-state aria strings (move-origin, valid/invalid
   destination, swap source/target, protected, custom, keyboard-focused…) — re-tokened in charcoal
   values with bigger luminance steps. All four judges called this B's best thinking.
2. **Teal search treatment** (`#DCEDEA` fill / `#2F6668` border) replacing the mint search tint —
   maximal hue distance from both the beige floor and the orange accent; separates "found" from
   "assigned"; CVD-bulletproof.
3. **Brand paper `#F6E7D8`** as hover/selected tints on panel-side rows and empty states — the
   firm's warmth at touchpoints without warming the shell. (Partly present already as
   `--sp-color-state-selected-surface`.)
4. **Copper `#D46A24`** as a mid-tier accent token for hairlines/halos where `#F26E22` is sub-3:1
   on light surfaces.
5. **Border-contrast discipline ~2:1** — A's subtle border is 1.05:1 on canvas (near-invisible;
   squint fatigue). Retune border tokens.
6. **Semantic status ramp** eucalyptus `#3F6F59` / ochre `#9A6418` / brick `#963D2F` / slate-teal
   `#3E6F72` — already partially in `globals.css` as `--sp-color-state-*`; bless formally.

## Fix in Charcoal regardless of direction (judge-found defects)

- Muted text `#6B7177` → darken to ~`#5E646A` (4.14:1 on canvas fails AA today).
- Deepen reserved amber `#D9A514` (2.19:1 non-text fail as a lone channel).
- Keep draft-change hue distinct from the selection ring (both are `#F26E22` today — two meanings,
  one channel).
- Enforce the ≥2-channel status rule in review/lint (the model's RC5 verification).
- Add a 1px dark hairline outside the `#F26E22` selection ring where it crosses pale floor (2.26:1
  against beige alone).

## Notes

- The warm prototype's all-caps tracked labels violate the sentence-case mandate (RC5) — diagnostic
  that it wasn't built against the system model.
- The "Warm" Figma variable mode is retained in the file for future comparison; the SxS page shows
  both renders. A verdict board for the SxS page is pending (Figma tool outage at write time).
