# Vendored fonts — concept prototypes only

Variable woff2 files (latin subset, upright) for the pages under
`app/concepts/`. Shipped surfaces use `app/fonts/` (IBM Plex); nothing
outside `app/concepts/` may reference these files.

Loaded per-prototype through `next/font/local` — each concept page declares
its own `localFont(...)` so pages stay independently deletable. The `weight`
range MUST be declared on every `localFont` call (axes below); without it
next/font emits no `font-weight` descriptor and every weight renders as
synthetic bold over the 400 instance.

## Provenance

| File | Source package | Version | wght axis |
| --- | --- | --- | --- |
| `geist-latin-wght-normal.woff2` | `@fontsource-variable/geist` | 5.3.0 | 100–900 |
| `fraunces-latin-wght-normal.woff2` | `@fontsource-variable/fraunces` | 5.3.0 | 100–900 |
| `plus-jakarta-sans-latin-wght-normal.woff2` | `@fontsource-variable/plus-jakarta-sans` | 5.3.0 | 200–800 |

The packages were installed only to source the files and then uninstalled —
they are deliberately not dependencies.

To refresh (pin the versions from the table; bump = change command AND table):

```bash
npm i -D @fontsource-variable/geist@5.3.0 @fontsource-variable/fraunces@5.3.0 @fontsource-variable/plus-jakarta-sans@5.3.0
cp node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2 app/concepts/fonts/
cp node_modules/@fontsource-variable/fraunces/files/fraunces-latin-wght-normal.woff2 app/concepts/fonts/
cp node_modules/@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2 app/concepts/fonts/
cp node_modules/@fontsource-variable/geist/LICENSE app/concepts/fonts/LICENSE-geist
cp node_modules/@fontsource-variable/fraunces/LICENSE app/concepts/fonts/LICENSE-fraunces
cp node_modules/@fontsource-variable/plus-jakarta-sans/LICENSE app/concepts/fonts/LICENSE-plus-jakarta-sans
npm un @fontsource-variable/geist @fontsource-variable/fraunces @fontsource-variable/plus-jakarta-sans
```

## Licence

All three families are SIL OFL 1.1 with distinct copyright notices, so each
keeps its own license file (a shared LICENSE would silently drop notices):
`LICENSE-geist`, `LICENSE-fraunces`, `LICENSE-plus-jakarta-sans`.
