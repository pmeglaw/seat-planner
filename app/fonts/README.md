# Vendored fonts

IBM Plex Sans (400/500/600/700) and IBM Plex Mono (400/500/600), latin subset,
woff2. Loaded by `app/layout.tsx` through `next/font/local` and exposed as the
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
worth removing rather than living with. Nothing about the served output changed:
same self-hosted files, same `display: swap`, same preload.

## Provenance

Copied from `@fontsource/ibm-plex-sans` and `@fontsource/ibm-plex-mono`, both
**v5.3.0**, out of each package's `files/` directory. The packages were
installed only to source the files and then uninstalled — they are deliberately
not dependencies.

To refresh:

```bash
npm i -D @fontsource/ibm-plex-sans @fontsource/ibm-plex-mono
cp node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-{400,500,600,700}-normal.woff2 app/fonts/
cp node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-{400,500,600}-normal.woff2 app/fonts/
cp node_modules/@fontsource/ibm-plex-sans/LICENSE app/fonts/LICENSE
npm un @fontsource/ibm-plex-sans @fontsource/ibm-plex-mono
```

Then update the version above, and **look at the app** — a missing or
mis-mapped weight falls back silently instead of erroring. Reception's
extension readout (46px/600 mono) is the most exposed use.

## Licence

IBM Plex is licensed under the SIL Open Font License 1.1. Full text in
`LICENSE`, alongside the files it covers.
