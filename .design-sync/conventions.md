# Shell — build conventions

Shell is the design system of a private law-office seat-planning app. Warm print-inspired palette (ivory ground, copper accent), IBM Plex Sans + Mono, and a **flat shape language: square corners on all chrome and controls** — `--sp-radius-sm|md|lg|xl|sheet` are all literally `0px`; only `--sp-radius-full` rounds (seat pills, avatars). Don't add border-radius to layout glue.

## Setup

No provider is required — every component is self-contained. What matters is **which wrapper class the composition sits in**, because Shell has ONE set of role token names and each zone re-declares their *values*:

- **Map, admin and viewer surfaces**: wrap in `<div className="shell-theme">` (viewer) or `<div className="admin-theme">` (admin) — the two are token-identical. Required for `SeatMap`, `SeatMarker`, `SeatInspector`, `MapWashLayer`, `MapZoomControl`, `MapStatusBand`, `DraftTrailOverlay`, the confirm dialogs, `AskPlannerDrawer` and the admin panels: the whole `--sp-marker-*` pill palette, `--sp-map-mat`, `--sp-text-inverse`, `--sp-text-on-brand` and the elevation ladder live only in that block. Unwrapped, a marker paints as an unfilled hairline with invisible text.
- **Auth surfaces**: `LoginForm` / `UpdatePasswordForm` go inside `<div className="login-theme">` — it re-points the neutrals to a cool white/gray ramp and supplies the CTA ladder (`--sp-button-primary: #B85207`) and `--sp-link`. `ReceptionScreen` uses `.reception-theme` (which adds `--sp-accent`).
- **Dark chrome regions** (top bar, rail, filter menus): put `sp-zone-chrome` on the region root — same role names, dark values (`--sp-background: #161616`, `--sp-layer-01: #1f1f1f`, `--sp-text-primary: #F7F6F2`, `--sp-field`, translucent borders). A light card nested inside a chrome region takes `sp-zone-base` to switch back.
- **Page ground**: give pages an explicit `background: var(--sp-background)`.

**Dark mode** is app-wide and attribute-driven: set `data-theme="dark"` on the root element and `:root[data-theme="dark"]` re-points the same role names (`--sp-background: #161616`, `--sp-layer-01: #1f1f1f`, `--sp-layer-02: #262626`, `--sp-text-primary: #f4f4f4`), with further refinements under `.admin-theme`/`.shell-theme`, `.login-theme`, `.reception-theme` and `.sp-zone-chrome`. Never hardcode a hex where a token exists — the token is what flips.

Interactions that would hit the server (form submits, publish/save buttons) are stubbed in this environment — build the UI state you want to show; don't wire real submission flows.

## Styling idiom — role tokens via inline style, not new utility classes

The shipped stylesheet is **precompiled and purged**: only the utility classes the app itself uses exist in it. A Tailwind-looking class you invent (`bg-sp-layer-01`, `p-7`) silently does nothing. For your own layout glue, use inline styles referencing the role tokens:

```jsx
<section style={{ background: "var(--sp-layer-01)", color: "var(--sp-text-primary)", padding: "var(--sp-space-5)", border: "1px solid var(--sp-border-subtle)" }}>
```

The role vocabulary (77 tokens at `:root`; read `_ds_bundle.css` for values):

- Ground and surface: `--sp-background`, `--sp-layer-01`, `--sp-layer-02`, `--sp-layer-accent`, `--sp-surface-disabled` (zones add `--sp-background-hover`, `--sp-layer-hover`, `--sp-field`)
- Text: `--sp-text-primary`, `--sp-text-secondary`, `--sp-text-helper`, `--sp-text-disabled`
- Borders and neutrals: `--sp-border-subtle`, `--sp-border-strong`, `--sp-neutral-strong`, `--sp-neutral-muted`
- Brand and actions: `--sp-brand` (#FF5715, indicator-only — underlines, selection, search highlight), `--sp-brand-subtle`, `--sp-brand-deep`, and the CTA ladder `--sp-button-primary` / `-hover` / `-active`
- Status families: `--sp-status-{neutral,published,draft,success,danger,pending,search}-{surface,border,text}`, most also `-strong` (`search` is surface/border/text only). Use the trio together — surface fill + border ring + matching text — rather than pairing a status color with neutral text.
- Seat markers (inside `.shell-theme`/`.admin-theme`) — two axes, fill = availability, glyph = reason: `--sp-marker-{positive,neutral,reserved,unavailable,draft,search}-{surface,border,text}`; `-ring` exists on `positive`, `neutral`, `draft`, `search` (plus `--sp-marker-pill-ring`, `--sp-marker-planner-ring`); glyph inks are `--sp-marker-ink`, `--sp-marker-glyph-ink`, `--sp-marker-valid-glyph`, `--sp-marker-invalid-glyph`, `--sp-marker-reserved-glyph`.
- Space: `--sp-space-1…7` (4, 8, 12, 16, 24, 32, 48px)
- Focus: `--sp-focus`, `--sp-focus-width`, `--sp-focus-offset`, `--sp-focus-offset-color`
- Elevation and motion: `--sp-shadow-raised|floating|modal|sheet`, `--sp-elevation-2…5`, `--sp-duration-fast|standard|deliberate`
- Fonts: `--font-sans` (IBM Plex Sans), `--font-mono` (IBM Plex Mono — seat codes, phone extensions, data readouts)

Utility exports on the library: `cx(...classes)` merges class strings; `focusRingClass` is the standard focus-visible ring — spread it onto any custom interactive element you must build.

## Where the truth lives

- `styles.css` → imports `_ds_bundle.css` (all component CSS + every token) and `fonts/fonts.css`. Read `_ds_bundle.css` before inventing any color or spacing.
- Per component: `components/<group>/<Name>/<Name>.d.ts` is the exact props contract; `<Name>.prompt.md` shows composition patterns.

## Idiomatic example

```jsx
<div className="admin-theme" style={{ background: "var(--sp-background)", padding: "var(--sp-space-5)" }}>
  <div style={{ display: "flex", gap: "var(--sp-space-3)", alignItems: "center" }}>
    <StatusBadge tone="draft">Draft — 3 unpublished changes</StatusBadge>
    <Button variant="secondary" size="small">Review changes</Button>
    <Button variant="primary" size="small">Publish seat map</Button>
  </div>
</div>
```

`Button` variants: `primary | secondary | quiet | destructive`; sizes `small | medium`; `loading`, `leftIcon`, `rightIcon` props. `StatusBadge` tones: `neutral | published | draft | success | warning | danger | info | readonly | blocked | pending`. Seat status (`available | assigned | reserved | unavailable`) is not a badge tone — it rides on the `seat` row you pass `SeatMarker`, which renders its own pill.
