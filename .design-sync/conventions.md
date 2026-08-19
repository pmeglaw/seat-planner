# Shell — build conventions

Shell is the design system of a private law-office seat-planning app. Warm print-inspired palette (ivory/paper/copper), IBM Plex Sans + Mono, and a **flat shape language: square corners on all chrome and controls**. Rounded shapes appear only where components render them deliberately (seat pills, avatars). Don't add border-radius to layout glue.

## Setup

No provider is required — every component is self-contained. Two scoping rules:

- **Admin surfaces**: any composition using admin components (`AdminManagementPanel`, `DataUtilitiesPanel`, the confirm dialogs, `AskPlannerDrawer`, `SeatInspector`) must sit inside `<div className="admin-theme">…</div>` — that class defines the `--admin-*` palette those components read. Without it they render unthemed.
- **Page ground**: give pages an explicit background — `var(--sp-color-brand-ivory)` for viewer surfaces, `var(--admin-bg)` inside `.admin-theme`.

Interactions that would hit the server (form submits, publish/save buttons) are stubbed in this environment — build the UI state you want to show; don't wire real submission flows.

## Styling idiom — tokens via inline style, not new utility classes

The shipped stylesheet is **precompiled and purged**: only the utility classes the app itself uses exist in it. A Tailwind-looking class you invent (e.g. `bg-sp-brand-paper`, `p-7`) will silently do nothing. For your own layout glue, use inline styles referencing the semantic tokens:

```jsx
<section style={{ background: "var(--sp-color-brand-paper)", color: "var(--sp-color-text-primary)", padding: 24, border: "1px solid var(--sp-color-border, #E7E1D8)" }}>
```

Core token families (defined at `:root` in the shipped CSS — read `_ds_bundle.css` for the full set):

- Brand: `--sp-color-brand-ivory`, `--sp-color-brand-paper`, `--sp-color-brand-copper`, `--sp-color-brand-accent`, `--sp-color-brand-clay`
- Action: `--sp-color-action-primary`, `--sp-color-action-primary-hover`, `--sp-color-action-primary-pressed` (each also has an `-rgb` channel triple for `rgb(var(--…-rgb)/0.45)` alpha)
- Text: `--sp-color-text-primary`, `--sp-color-text-secondary`, `--sp-color-text-muted`, `--sp-color-text-disabled`
- Admin (inside `.admin-theme` only): `--admin-bg`, `--admin-chrome-bg`, `--admin-chrome-text`, `--admin-chrome-border`, `--admin-rail-bg`
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

`Button` variants: `primary | secondary | quiet | destructive`; sizes `small | medium`; `loading`, `leftIcon`, `rightIcon` props. `StatusBadge` tones: `neutral | published | draft | success | warning | danger | info | readonly`, plus the seat-status set the map surfaces use — `available | assigned | reserved | unavailable | selected | blocked | pending`.
