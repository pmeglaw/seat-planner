# Shell — build conventions

Shell is the design system of a private law-office seat-planning app. Warm print-inspired palette (ivory/paper/copper), IBM Plex Sans + Mono, and a **flat shape language: square corners on all chrome and controls**. Rounded shapes appear only where components render them deliberately (seat pills, avatars). Don't add border-radius to layout glue.

## Setup

No provider is required — every component is self-contained. Two scoping rules:

- **Admin and map surfaces**: any composition using admin components (`AdminManagementPanel`, `DataUtilitiesPanel`, the confirm dialogs, `AskPlannerDrawer`, `SeatInspector`) or seat-map pieces (`SeatMarker`, `MapWashLayer`, `MapZoomControl`, `MapStatusBand`, `DraftTrailOverlay`) must sit inside `<div className="admin-theme">…</div>` or `<div className="shell-theme">…</div>` — the two classes define the same `--admin-*` set, including the `--admin-marker-live-*` palette every seat pill paints from. Neither is on `:root`, so an unwrapped marker renders as an unpainted outline with invisible text.
- **Auth surfaces**: `LoginForm` / `UpdatePasswordForm` must sit inside `<div className="login-theme">…</div>` — the `--login-*` tokens (including the primary button's fill) exist only in that scope, so an unwrapped form renders a white-on-white button. Reception surfaces use `.reception-theme` the same way.
- **Page ground**: give pages an explicit background — `var(--sp-color-brand-ivory)` for viewer surfaces, `var(--admin-bg)` inside `.admin-theme`.

**Dark mode** is app-wide and attribute-driven: set `data-theme="dark"` on the root element and `:root[data-theme="dark"]` re-points the whole `--sp-color-*` ramp (canvas `#161616`, surface `#1f1f1f`, surface-raised `#262626`, text `#f4f4f4`). Admin and viewer chrome get their own refinements under `:root[data-theme="dark"] .admin-theme, :root[data-theme="dark"] .shell-theme`, and `.reception-theme` / `.login-theme` have theirs. Practical rule: wrap app surfaces in `.shell-theme` (or `.admin-theme`) so both themes resolve — an unwrapped surface keeps the light chrome values in dark mode. Never hardcode a hex where a token exists; the token is what flips.

Interactions that would hit the server (form submits, publish/save buttons) are stubbed in this environment — build the UI state you want to show; don't wire real submission flows.

## Styling idiom — tokens via inline style, not new utility classes

The shipped stylesheet is **precompiled and purged**: only the utility classes the app itself uses exist in it. A Tailwind-looking class you invent (e.g. `bg-sp-brand-paper`, `p-7`) will silently do nothing. For your own layout glue, use inline styles referencing the semantic tokens:

```jsx
<section style={{ background: "var(--sp-color-surface)", color: "var(--sp-color-text-primary)", padding: 24, border: "1px solid var(--sp-color-border-subtle)" }}>
```

Core token families (defined at `:root` in the shipped CSS — read `_ds_bundle.css` for the full set):

- Brand: `--sp-color-brand-ivory`, `--sp-color-brand-paper`, `--sp-color-brand-copper`, `--sp-color-brand-accent`, `--sp-color-brand-clay`
- Ground and surface: `--sp-color-canvas`, `--sp-color-surface`, `--sp-color-surface-raised`, `--sp-color-workspace`, `--sp-color-workspace-deep`
- Borders: `--sp-color-border-subtle`, `--sp-color-border-strong` (there is no bare `--sp-color-border`)
- Action: `--sp-color-action-primary`, `--sp-color-action-primary-hover`, `--sp-color-action-primary-pressed` (each also has an `-rgb` channel triple for `rgb(var(--…-rgb)/0.45)` alpha)
- Text: `--sp-color-text-primary`, `--sp-color-text-secondary`, `--sp-color-text-muted`, `--sp-color-text-disabled`
- State families — one per status, each with `-surface`, `-border`, `-on-soft` and `-rgb` variants: `--sp-color-state-{published,draft,success,warning,danger,info,selected,search,disabled}-*`. Use the trio together (surface fill + border ring + on-soft text) rather than mixing a state color with neutral text.
- Radii: `--sp-radius-sm|md|lg|xl|full|sheet` — but chrome and controls are square by default; reach for a radius only where the component itself does.
- Admin (inside `.admin-theme` only): `--admin-bg`, `--admin-chrome-bg`, `--admin-chrome-text`, `--admin-chrome-border`, `--admin-rail-bg`, `--admin-text-primary`, `--admin-text-secondary`, `--admin-border`, `--admin-border-strong`
- Fonts: `--font-sans` (IBM Plex Sans), `--font-mono` (IBM Plex Mono — used for seat codes, phone extensions, data readouts)

Utility exports on the library: `cx(...classes)` merges class strings; `focusRingClass` is the standard focus-visible ring — spread it onto any custom interactive element you must build.

## Where the truth lives

- `styles.css` → imports `_ds_bundle.css` (all component CSS + every token) and `fonts/fonts.css`. Read `_ds_bundle.css` before inventing any color or spacing.
- Per component: `components/<group>/<Name>/<Name>.d.ts` is the exact props contract; `<Name>.prompt.md` shows composition patterns.

## Idiomatic example

```jsx
<div className="admin-theme" style={{ background: "var(--admin-bg)", padding: 24 }}>
  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
    <StatusBadge tone="draft">Draft — 3 unpublished changes</StatusBadge>
    <Button variant="secondary" size="small">Review changes</Button>
    <Button variant="primary" size="small">Publish seat map</Button>
  </div>
</div>
```

`Button` variants: `primary | secondary | quiet | destructive`; sizes `small | medium`; `loading`, `leftIcon`, `rightIcon` props. `StatusBadge` tones: `neutral | published | draft | success | warning | danger | info | readonly | blocked | pending`. Seat status (`available | assigned | reserved | unavailable`) is not a badge tone — it rides on the `seat` row you pass `SeatMarker`, which renders its own pill.
