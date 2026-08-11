# Prototype fonts

Inter and Manrope, latin subset, **variable** woff2 (one file each covers the
weight range). Used only by `ComponentStateBoard.tsx`, exposed as
`--font-component-board-ui` / `--font-component-board-display`.

They live here rather than in `app/fonts/` because they are not app chrome:
nothing outside this prototype renders in them, and `/concepts/*` returns 404 in
production unless `SEAT_PLANNER_ENABLE_PROTOTYPES=true`.

## Why they are vendored

A prototype page is still compiled on every build. While this board imported
from `next/font/google`, the build kept downloading font binaries from
`fonts.gstatic.com` — so pinning `app/layout.tsx` alone would have left the
build failing on a CDN hiccup anyway, just via a different import.

## Provenance

Copied from `@fontsource-variable/inter` and `@fontsource-variable/manrope`,
both **v5.3.0**, from each package's `files/` directory
(`inter-latin-wght-normal.woff2`, `manrope-latin-wght-normal.woff2`). The
packages were installed only to source the files, then uninstalled — they are
deliberately not dependencies. Licences: SIL Open Font License 1.1, full text in
`LICENSE-inter` and `LICENSE-manrope`.
