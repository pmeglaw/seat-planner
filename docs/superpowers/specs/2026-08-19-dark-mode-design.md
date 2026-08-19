# Dark Mode — "Graphite studio" (direction 4a) — design spec

Owner-selected direction 4a from the 2026-08-19 mockup session (`Seat Map
Mockup.dc.html`, the visual acceptance target). Assumes the teal status family
(v1.51.0, PR #421) — it is shipped.

## Decisions (owner, 2026-08-19)

- Floor-plan raster: **CSS invert filter** (option 1), no dark asset.
- Persistence: **localStorage only** — no profile column, no migration.
- Seeding: **`prefers-color-scheme` seeds the default** when no stored choice.
- Scope: **all surfaces** (viewer, admin, reception), toggle in shared top-bar
  chrome.

## Mechanism — reuse the existing global switch

The app already has an app-wide theme switch (Reception handoff): the value
`html[data-theme="dark"]`, the `sp-theme` localStorage key, the pre-paint boot
script in `app/layout.tsx`, and the string contract in `lib/theme.ts`
(`tests/theme.test.mjs` pins that layout and toggle interpolate the literals
from `lib/theme.ts`, never hardcode them). Reception's `--r-*` and login's
tokens already react to it.

Dark mode joins that attribute. **No `.dark-theme` class** — the earlier draft
spec predates discovering the shipped mechanism.

### Seeding change (boot script)

`THEME_BOOT_SCRIPT` gains a fallback: if `localStorage['sp-theme']` holds no
value, `matchMedia('(prefers-color-scheme: dark)')` decides. A stored
`'light'` is an explicit choice and beats a dark OS (the toggle already writes
`'light'`). Seed at boot only; no live OS-change listener. Also set
`color-scheme: dark` on the dark root so native form controls follow.

## Token overrides (app/globals.css)

Two blocks; components change zero because everything reads tokens.

### `:root[data-theme="dark"]` — core inversions

```css
color-scheme: dark;

--sp-color-canvas: #161616;          /* was #f4f4f4-family */
--sp-color-surface: #1f1f1f;
--sp-color-surface-raised: #262626;
--sp-color-border-subtle: rgba(255, 255, 255, 0.10);
--sp-color-border-strong: rgba(255, 255, 255, 0.18);
--sp-color-text-primary: #f4f4f4;    /* 16.45:1 on #161616 */
--sp-color-text-secondary: #c6c6c6;  /* 9.9:1 */
--sp-color-text-muted: #9a9a9a;      /* 6.4:1 */
--sp-color-text-disabled: #6f6f6f;
--sp-color-graphite-soft: #262626;
--sp-color-stone: #333333;
--sp-color-stone-muted: #6f6f6f;
--sp-color-state-disabled: #333333;
--sp-focus-ring-offset-color: #161616;   /* ring color itself unchanged */
```

Status families → bright text + alpha soft (map onto every
`--sp-color-state-{published,draft,success,warning,danger,info}[-surface/-border/-on-soft/-rgb]`):

| Family | text / on-soft | soft bg | border |
| --- | --- | --- | --- |
| success / published | `#42be65` (7.3:1) | `rgba(66,190,101,.14)` | `rgba(66,190,101,.40)` |
| warning / draft / reserved | `#3ddbd9` (~10:1); raw hue `#08bdba` | `rgba(8,189,186,.14)` | `rgba(8,189,186,.40)` |
| danger | `#ff8389` (7.9:1); controls `#fa4d56` | `rgba(250,77,86,.14)` | `rgba(250,77,86,.40)` |
| info (neutral) | `#c6c6c6` | `rgba(255,255,255,.08)` | `rgba(255,255,255,.14)` |

### `:root[data-theme="dark"] .admin-theme, :root[data-theme="dark"] .shell-theme`

- Chrome joins the workspace: `--admin-chrome-bg: #0a0a0a` (top bar one step
  deeper), keep `--admin-chrome-elevated: #1f1f1f`, raised `#262626`, hover
  `#333333`. `--admin-text-inverse: #161616`. The `--admin-bg/surface/border/
  text` aliases of `--sp-color-*` follow automatically.
- Brand orange, unchanged hues / swapped pairings:
  `--admin-primary: #FF5715` (ink text on it 5.71:1),
  `--admin-primary-soft: rgba(255,87,21,.16)`,
  `--admin-primary-border: rgba(255,87,21,.45)`,
  `--admin-primary-on-soft: #FF8A5C` (6.1:1 on #161616),
  `--admin-paper: rgba(255,87,21,.12)`. CTA ladder
  (`--sp-color-action-primary` etc.) unchanged — white-label fills stay.
- Status dots: `--admin-status-ok: #42be65`, `--admin-status-warn: #08bdba`,
  `--admin-status-bad: #fa4d56`, `--admin-status-neutral: #8d8d8d` (+ rgb
  partners). `--admin-{success,warning,danger,error,info}[-soft/-text]` and
  every `--admin-state-*` / `--admin-publish-*` / `--admin-diff-*` triplet map
  onto the table above. `--admin-chrome-warn-text` already fits (#08bdba).
- Marker legend tokens (`--admin-marker-*`) mirror the dark marker targets
  below.
- Elevation: borders carry separation; shadows deepen for overlays only —
  `--admin-elevation-3-shadow: 0 6px 16px rgba(0,0,0,0.5)`, modal
  `0 12px 40px rgba(0,0,0,0.6)`, `--sp-shadow-*` equivalents.

## Seat markers on dark

**No `markerStateClassRecipesDark`.** `markerStateClassRecipes` feeds only the
concept board prototype; the live pills render via `--admin-marker-live-*`,
which derive from the state tokens via color-mix — dark markers fall out of
the overrides above. Add explicit `--admin-marker-live-*` overrides in the
dark block only where the derivation misses the mockup, judged in the real
browser against these targets:

| State | bg | border | text |
| --- | --- | --- | --- |
| available | `#1f1f1f` | `#4a4a4a` | `#c6c6c6` |
| assigned | `#262626` | `#42be65` | `#f4f4f4` |
| reserved | `rgba(8,189,186,.16)` | `#08bdba` | `#3ddbd9` |
| draft-modified | `rgba(8,189,186,.10)` + dashed | `#08bdba` | `#3ddbd9` |
| unavailable | `#161616` | `#333333` | `#7a7a7a` |
| selected | `#FF5715` | `#FF5715` | `#161616` + ring `rgba(255,87,21,.35)` |
| search | `rgba(255,87,21,.14)` | `#FF5715` | `#FF8A5C` + halo `rgba(255,87,21,.32)` |

## Floor-plan raster

`[data-theme="dark"]` CSS rule on the map `<img>` in **both** surfaces
(`SeatMap` and `ViewerSeatFinder` — two-surface parity trap):

```css
filter: invert(0.93) hue-rotate(180deg) saturate(0.45) contrast(0.95);
```

No asset change, so no `?v=` bump and no blur regen. The raster constraint
(no SVG) is untouched.

## Toggle — promote, don't build

Generalize `components/reception/ThemeToggle.tsx` into `components/ui/`
(current styling is `--r-*`-bound; the promoted one styles from chrome
tokens), mount it in the shared top-bar chrome for the shell surfaces and in
the viewer top bar; Reception consumes the shared component. Behavior
unchanged: flips `html[data-theme]`, persists `sp-theme`, `aria-pressed`,
sun/moon glyphs. `lib/theme.ts` contract unchanged.

## Testing

- Extend `tests/theme.test.mjs`: boot script seeds from
  `prefers-color-scheme` only when storage is empty; literals still
  interpolated from `lib/theme.ts`.
- `accessibility-source` and the other guardrail tiers must stay green; the
  dark blocks carry measured contrast comments like the light ones (body text
  ≥ 4.5:1, graphics ≥ 3:1).
- Visual acceptance: mockup 4a vs the live app (`run-seat-planner`, both
  themes, viewer + admin + reception), including toggle round-trip and
  no-flash boot.

## Phasing (implementation plan will slice)

1. Boot seeding + core `:root` dark block (neutrals, status, focus offset).
2. Admin/shell dark block (chrome, states, publish/diff, legend, elevation).
3. Raster filter + marker-live tuning vs mockup.
4. Toggle promotion + mounts.
5. Tests + visual QA pass.

## Out of scope

- `app/concepts/*` (prototype-only surfaces keep their own palettes).
- Profile-column persistence (deliberately deferred; localStorage only).
- Dark re-master of the floor-plan asset (invert filter chosen instead).
- Any brand-orange hue change (#FF5715 stands — standing owner ruling).
