# Taste — judgment on top of the rules

The rest of this skill guarantees a *correct* Carbon screen. This file is for making it *good*. Read it when critiquing a screen, when building from a blank page, or when two rules conflict and no table settles it.

## Contents

- The working definition
- Mental models, in priority order
- The rubric — evaluate in this order
- Amateur tells and their fixes
- Craft heuristics where Carbon leaves room
- Critique protocol
- Taste inside Carbon specifically

## The working definition

Taste is trained judgment: seeing the gap between good and great, and making the many small, defensible decisions that make a screen feel intentional. It is not preference. The test (Hobday): if someone points at any part of the design, you can say why it looks that way. If you can't, that part isn't designed yet.

Two frames that keep the bar honest:

- **The taste gap** (Ira Glass): your judgment runs ahead of your output; the gap closes only by volume of work held to that judgment. So ship, then critique, then ship again — don't polish a first draft to death.
- **Subtraction** (Rams, Graham): "as little design as possible." The strongest move is usually to remove or quiet something, not add.

## Mental models, in priority order

1. **Subtraction first.** Hierarchy problems are solved by making secondary things quieter, not the primary thing louder.
2. **Hierarchy before anything.** The eye must know where to go first, second, third.
3. **Intentionality.** Every value sits on a scale; every exception has a written reason.
4. **Coherence.** Decisions relate to each other — one spacing scale, one type scale, one accent.
5. **Everything communicates.** Spacing, weight, and copy all carry meaning whether you meant them to or not.
6. **The details are the design.** States, focus, empty screens, easing — the last 10% is what reads as quality.
7. **Grayscale first.** Build hierarchy from size, weight, and spacing; add color last, as refinement.

## The rubric — evaluate in this order

Stop at the first level that fails and fix it before looking further down. A color note on a screen with broken hierarchy is wasted.

| Order | Question | What to check |
|---|---|---|
| 1. Hierarchy | Does the eye land on the right thing first? | Squint test; one focal point per screen; secondary things quieted rather than primary amplified |
| 2. Spacing & layout | Is everything aligned and grouped by meaning? | Single spacing scale; proximity groups; outer padding ≥ inner; everything aligned to something |
| 3. Typography | As few sizes and weights as the content allows? | Fixed type set; contrast by weight not size; line length 45–75 characters; leading tighter as size grows; tabular figures on data |
| 4. Color | Restrained, semantic, accessible? | Grays dominate; Blue 60 the only action color; status colors carry meaning only; contrast checked on the hovered surface |
| 5. Depth & surfaces | Is elevation consistent and quiet? | Layers, not shadows; one depth technique per screen; borders contrast both surfaces they separate |
| 6. Detail polish | Do all states and edges exist? | Hover/focus/active on everything; empty, loading, error, overflow designed; no layout shift; motion from the token table |

## Amateur tells and their fixes

Carbon already forecloses some classic tells (rounded corners, arbitrary fonts, random accent hues). These are the ones that still show up in Carbon work.

| Tell | Fix |
|---|---|
| Many type sizes doing the work of hierarchy | Two or three sizes; hierarchy from weight, color, and space |
| Centered body text | Flush left; centering only for a short headline |
| Everything evenly spaced, nothing grouped | Vary spacing to show relationship — tight inside groups, loose between |
| Borders on every container | Separate with layer tokens or space first; a border is the last resort |
| Two or three "primary" blues competing | One Blue 60 action per section; the rest ghost or tertiary |
| Grey text on a colored surface | Same hue, lighter or darker — never grey |
| Icons as heavy as the text beside them | Lower the icon's contrast one step; it reads heavier than type at the same value |
| Low density in a tool people operate all day | Compact rows in the scanning zone; whitespace kept for the control zone |
| Expressive type in a productive tool | Fixed set; save fluid type for a deliberate moment |
| Every tile hovers, every row animates | Nothing that happens a hundred times a day gets an animation |
| Empty state that's just an illustration | Name the next action; keep the CTA where it will live once data exists |
| Charts with legends, gridlines, and 3D | Label series directly; strip non-data ink; one chart per decision |
| Status by color alone | Color plus shape or symbol, always |
| Missing hover, focus, or active states | Every interactive element has all three; focus is 2px inset |
| Content jumping as it loads | Skeletons; reserved dimensions |
| Icon-only buttons with no name | `aria-label` and a tooltip |
| Gradients or glows as decoration | Reserve for Carbon for AI, where they are the signal |
| Mid-value border that's muddy against both sides | Lighter than both on dark, darker than both on light |

## Craft heuristics where Carbon leaves room

The tokens fix the values. These decide how you use them.

**Typography.** Prefer weight contrast over size contrast. Line length 45–75 characters; never center anything longer than two lines. Leading is inverse to size — display type tight, body loose. Raise tracking slightly on 12px labels; lower it on display sizes. `font-variant-numeric: tabular-nums` on anything numeric that changes or aligns in columns. Within Plex: Sans for the interface, Serif for an editorial moment, Mono for code and data — two of the three on one screen at most.

**Color.** Design the screen in grays, then add Blue 60 where the user acts, then status colors where meaning requires. Never pick a hex; pick a token. Never put grey text on a colored surface. Check contrast against the *hovered* surface (`layer-hover-01`), not white.

**Spacing.** Spacing runs between points of high contrast — the eye finds edges by contrast, so a gap next to a strong edge reads larger. Outer padding is at least the inner padding. Group by proximity before you group by border. Density is a decision per zone: the table is dense; the toolbar, filters, and detail panel breathe.

**Depth.** Carbon builds depth from layer tokens, not shadows. Pick one technique per screen. Don't nest cards in cards.

**Icons.** 16px icons with 14px type, 20px with 16px. Optically center an icon beside text; don't baseline-align it. Label icon-only controls.

**Motion.** Use the token table; nothing else. Then ask whether the element needs to move at all — frequent, low-novelty actions don't. A press can scale to 0.97 for 70ms; nothing scales from 0.

**Copy.** Buttons are verbs naming the result ("Assign seat", not "Submit"). Errors say what happened and what to do. Empty states teach and invite. Sentence case throughout.

**Data.** Maximize data ink; erase everything else. Small multiples beat one busy chart. Label directly instead of a legend when there's room. A chart that doesn't map to a decision gets cut.

## Critique protocol

When asked to review a screen — or before calling your own work finished:

1. **Squint.** Does the hierarchy survive blur? Does the right thing dominate?
2. **Five seconds.** What is this screen for, and what's the primary action? If either is unclear, that's finding number one.
3. **Run the rubric top-down.** Report findings in rubric order, each as *principle → observation → fix*. A finding with no principle behind it is a preference — label it as one or drop it.
4. **Name what's working.** Not as courtesy; so the fix doesn't destroy it.
5. **Pick the one change** that would matter most if only one were made.

Output shape for a critique:

```
## Findings (rubric order)
1. [Hierarchy] The Create button competes with three ghost buttons at equal weight → make the three tertiary; one primary per section.
2. [Spacing] …

## What's working
…

## If you change one thing
…
```

## Taste inside Carbon specifically

The system is a floor, not a ceiling. Components guarantee consistency, accessibility, and speed; craft is what you add:

- **Density chosen per zone**, not per screen.
- **Composition on the grid** — deliberate column spans, alignment across regions, one full-bleed moment if any.
- **Restraint with the palette.** Carbon gives you a large swatch library; a crafted product uses Blue 60, the grays, the layer tokens, and the status set. Swatch overuse is the loudest "default Carbon" tell.
- **Expressive moments are deliberate** — full-width, container-free, fluid type, at most once per flow. A productive tool that switches registers randomly reads as unfinished.
- **States and edges** are where Carbon apps actually fail: empty screens without a next step, tables with no loading state, dialogs with no error path. Design them first.
- **Extend only with the token system.** When a real product need isn't served, build it from tokens so it still reads as one product, and record the deviation.
