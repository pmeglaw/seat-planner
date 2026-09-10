# Design engineering — shipping the last 10%

Read this when implementing in code, tuning an interaction, or reviewing a front end for polish. It sits on top of the token layer: Carbon's motion tokens take precedence inside Carbon components; the rules here govern everything you build yourself and explain why the tokens are shaped the way they are.

## Contents

- How senior design engineers work
- Motion rules
- Interface guidelines
- Front-end mistakes that undo good design
- Tokens and component APIs
- Dark mode
- Review method

## How senior design engineers work

- **Prototype in code, not mockups.** Interaction quality — latency, easing, hover, focus — can only be judged in a browser. Treat early code as throwaway.
- **Robustness is the bar, not the demo.** QA under extreme input: rapid clicks, fast typing, resize mid-animation. Nothing shifts unintentionally after a click; nothing glitches when triggered twice.
- **Make the right thing the easy thing.** Tokens and scales so the default value is the correct one; component APIs that can't be misused; no magic numbers.
- **Tune by feel, then freeze.** Adjust a duration or curve in the browser until it's right, then put it in a token so it never drifts.

## Motion rules

Carbon's durations and easings are in `SKILL.md` and `tokens.md`. These rules decide *whether* and *how* to use them.

**Decide if it moves at all.** Motion earns its place by preserving spatial context, indicating state, giving feedback, or preventing a jarring change. "It looks nice" on something seen a hundred times a day is a reason *not* to animate. Keyboard-initiated and high-frequency actions get no animation — a command palette that opens instantly feels better than one that fades.

**Duration.** Interface motion stays under 300ms; under 200ms feels immediate. Carbon's `fast-01` through `moderate-02` cover almost everything; `slow-01` is for large expansions and important alerts; `slow-02` only for dimming a background. A group stagger is 30–80ms between items, and the whole sequence never blocks interaction or exceeds about a second — past that it's a loading screen.

**Easing.** Ease-out for anything entering or leaving (fast start, gentle settle). Ease-in-out only for an element moving from one on-screen position to another. Never ease-in on interface motion — it delays the moment the user is watching. Never linear except progress. Carbon's productive curves are ease-out family; use them rather than the browser's built-ins, which are too weak to read.

**Origin and scale.** Popovers, tooltips, and menus scale from their trigger, not from center. Never animate from `scale(0)`; start from 0.9–0.97 with opacity. Modals are the exception and stay centered. A press is `scale(0.97)` for about 70ms.

**Interruptibility.** Anything that can be triggered rapidly — toggles, toasts, drags, hover states — must retarget from its current position rather than restart. CSS transitions do this; keyframe animations don't. Use springs for drag and momentum where the element should feel alive; Carbon UI otherwise doesn't bounce or overshoot.

**Properties.** Animate `transform` and `opacity` only. Layout properties cause paint and jank.

**Accessibility.** Always ship `@media (prefers-reduced-motion: reduce)` — keep opacity and color changes, drop transform-based movement. Guard hover effects with `@media (hover: hover)` so touch devices don't get stuck states.

## Interface guidelines

Details that separate a crafted front end from a correct one:

- Wrap inputs in a `<form>` so Enter submits.
- Focus rings via `outline` in Carbon (2px inset, `$focus`) — never `outline: none` without an equal replacement.
- Sequential lists of focusable items respond to ↑/↓; selected items delete on ⌘/Ctrl-Backspace.
- Menus open on `mousedown`, not `click` — it's a frame faster and feels it.
- Icon-only controls carry `aria-label`; hover tooltips never contain interactive content.
- Disabled controls don't get tooltips (they're unreachable); put the reason beside them.
- `user-select: none` on interactive chrome so drags don't highlight text.
- Skeletons match the shape of the content they replace; reserve dimensions for anything async so nothing jumps.
- Optimistic updates for low-risk actions with rollback and a notification on failure.
- Curly quotes, real ellipsis characters, no widows in headings.

## Front-end mistakes that undo good design

| Mistake | Fix |
|---|---|
| Inconsistent padding — the one weird pixel | Spacing only from the mini-unit multiples; lint for arbitrary values |
| Focus ring removed | Carbon's 2px inset outline on every interactive element |
| One line-height for all sizes | Leading from the type tokens; tighter as size grows |
| Layout shift on load | Reserved dimensions, skeletons, explicit image sizes |
| Blurry edges | Position on whole pixels; avoid transforms that land on half-pixels |
| Font flash | Subset Plex to used glyphs; preload critical weights; sensible `font-display` |
| Proportional figures in data | `font-variant-numeric: tabular-nums` |
| Geometric centering that looks off | Nudge icons and glyphs optically; trust the eye over `justify-content` |
| Random easing and duration | Tokens only; ease-out default |
| Shadows in dark mode | Invisible — elevate with lighter layer tokens instead |
| Hex values in component CSS | Semantic layer → Carbon token, never a raw value |
| Hover effects on touch | `@media (hover: hover)` |

## Tokens and component APIs

Product code references a semantic layer; the semantic layer references Carbon tokens; nothing references a hex. `assets/carbon-tokens.css` is the drop-in. Beyond color: spacing, type, motion, and layer tokens all go through the same discipline, so a theme switch or the v12 token rename touches one file.

Component props should make the correct usage the obvious one — a `size` prop from the height ladder, a `kind` prop that maps to Carbon's button kinds, no free-form style overrides. If a component needs an escape hatch, the design probably needs a second look before the code does.

## Dark mode

Carbon ships Gray 90 and Gray 100 themes through the same tokens, so dark mode is free *if* everything is tokenized. What still needs judgment:

- Build light and dark in the same session; never invert a finished light theme.
- Depth comes from layers stepping lighter, never from shadows.
- Text is the theme's `text-primary`, not pure white.
- Status and accent colors are the theme's tokens — they're already adjusted so they don't bloom on dark surfaces.
- Check contrast on the *hovered* layer in both themes; the traps differ.
- Render and read both themes before calling anything done.

## Review method

Treat each as a finding, not a note:

1. Any motion outside the token table, or any animation on a high-frequency action.
2. Any interaction that restarts instead of retargeting when triggered twice.
3. Missing reduced-motion or hover guards.
4. Any interactive element without hover, focus, and active states.
5. Any layout shift during load or state change.
6. Any raw value in component CSS.
7. Keyboard path incomplete, or focus order that doesn't match visual order.

Then unplug the mouse and use the screen once.
