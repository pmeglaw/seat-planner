# Vendored fonts

- **IBM Plex Sans** — one *variable* woff2 carrying the `wght` axis (100–700),
  latin subset, upright.
- **IBM Plex Mono** — three *static* cuts (400/500/600), latin subset. IBM Plex
  Mono has no variable release, so this is the only available form.

Loaded by `app/layout.tsx` through `next/font/local`, exposed as the
`--font-sans` / `--font-mono` CSS variables.

## Why these are in the repo

`next/font/google` also self-hosts — but it downloads the binaries from
`fonts.gstatic.com` during the build. That made every CI run and every Vercel
deploy depend on a live third-party fetch, and it failed for real:

```
Error: Module not found: Can't resolve '@vercel/turbopack-next/internal/font/google/font'
  src: url(@vercel/turbopack-next/internal/font/google/font?{"url":"https://fonts.g...
```

It cleared on re-run, so the failure is transient — which is exactly why it is
worth removing rather than living with.

## Why sans is variable and mono is not

This mirrors what Google was serving, deliberately. Production's four sans
`@font-face` rules all pointed at the **same 40,240-byte file** — a variable
font — while its mono weights were three distinct static files. Matching that
form keeps the rendering path identical to the build this replaced, which
matters because the first attempt at this change used four static sans cuts and
we could not prove, from screenshots alone, that nothing had shifted.

Two consequences worth knowing:

- **The `wght` axis stops at 700**, exactly as Google's did. `font-extrabold`
  (800) — which seat markers use — resolves to 700 in both builds. If a real 800
  is ever wanted, the axis cannot supply it; that needs a design decision, not a
  font swap.
- **The axis range must stay declared** in `layout.tsx` (`weight: "100 700"`).
  Drop it and `next/font/local` emits an `@font-face` with no `font-weight`
  descriptor, which CSS treats as 400 — the axis then goes unused and weights
  are synthesised.

## Provenance

| File | Source package | Version |
| --- | --- | --- |
| `ibm-plex-sans-latin-wght-normal.woff2` | `@fontsource-variable/ibm-plex-sans` | 5.3.0 (font v23) |
| `ibm-plex-mono-latin-{400,500,600}-normal.woff2` | `@fontsource/ibm-plex-mono` | 5.3.0 |

The packages were installed only to source the files and then uninstalled — they
are deliberately not dependencies.

To refresh:

```bash
npm i -D @fontsource-variable/ibm-plex-sans @fontsource/ibm-plex-mono
cp node_modules/@fontsource-variable/ibm-plex-sans/files/ibm-plex-sans-latin-wght-normal.woff2 app/fonts/
cp node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-{400,500,600}-normal.woff2 app/fonts/
cp node_modules/@fontsource-variable/ibm-plex-sans/LICENSE app/fonts/LICENSE
npm un @fontsource-variable/ibm-plex-sans @fontsource/ibm-plex-mono
```

Then update the versions above, and **look at the app** — a missing or
mis-mapped weight falls back silently instead of erroring. Reception's extension
readout (46px/600 mono) is the most exposed use.

## Licence

IBM Plex is licensed under the SIL Open Font License 1.1. Full text in
`LICENSE`, alongside the files it covers.
