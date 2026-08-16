# design-sync notes — seat-planner (Shell DS)

- Repo is a Next.js app, not a packaged DS: no dist, converter runs in synth-entry
  mode over `components/`. All components are `"use client"`; none import Supabase
  directly — data arrives via props, so static previews are possible.
- Next runtime imports (`next/link` incl. `useLinkStatus`, `next/image`,
  `next/navigation`) are shimmed via `tsconfig.sync.json` `paths` →
  `.design-sync/shims/*`. If a component starts importing another `next/*`
  module, add a shim + paths entry.
- **Two `Button` exports exist**: `components/ui/design-system.tsx` (Shell
  canonical: primary/secondary/quiet/destructive) and `components/ui/Button.tsx`
  (admin-surface: primary/secondary/danger, `--admin-*` tokens).
  `componentSrcMap.Button` pins the canonical one; the admin Button stays
  internal to the admin panels.
- CSS: Tailwind v3 compiled at sync time by `buildCmd` from `app/globals.css`
  (holds ~390 token custom properties: `--sp-*` Shell tokens, `--admin-*`,
  Reception `--r-*`). Output is gitignored (`.design-sync/.cache/`).
- Fonts: IBM Plex Sans (variable wght 100-700) + Mono (400/500/600) vendored in
  `app/fonts/*.woff2`; `.design-sync/fonts.css` mirrors the `next/font/local`
  setup in `app/layout.tsx` and defines `--font-sans`/`--font-mono`.
- Dark theme switch is `html[data-theme="dark"]` — today only Reception's
  `--r-*` tokens react to it (see app/layout.tsx THEME_BOOT_SCRIPT comment).
- Preview scope (2026-08-15 first sync): author all 36 components (SeatMapDialogs
  file exports 7 individual dialogs — synced individually, no `SeatMapDialogs`
  component exists).
- Bundle entry is `.design-sync/ds-entry.ts` (cfg.entry) — an explicit surface,
  NOT the synth scan: the synth star-export dropped `Button` silently (ES
  conflicting-star-export rule, design-system.tsx vs ui/Button.tsx). Add new
  components to ds-entry.ts AND cfg.componentSrcMap AND a docs-stub.
- Props extraction needs `package.json` `publishConfig.types` →
  `.design-sync/ds-entry.ts` (inert for a private app). Without it ts-morph has
  no project root and every `<Name>Props` emits as a `[key: string]: unknown`
  stub. Don't remove that field.
- `@/app/actions` (server actions) is shimmed (`shims/app-actions.ts`, throw on
  call) — keep its export list in step with app/actions.ts or the bundle build
  fails with "No matching export". Same for any new `next/*` import: add shim +
  tsconfig.sync.json paths entry (exact keys BEFORE the `@/*` wildcard).
- Default guidelinesGlob leaked internal docs (RISKS.md, coderabbit context) —
  cfg.guidelinesGlob is [] on purpose; no shippable design guidelines exist yet.
- buildCmd appends `.design-sync/tokens.css` (--font-sans/--font-mono) to the
  compiled Tailwind CSS — extraFonts parsing keeps only @font-face, dropping
  :root blocks, so the vars must ride the cssEntry.
- Compiled Tailwind is PURGED: sp-prefixed config utilities (bg-sp-*) are absent
  because app code styles via arbitrary `var(--sp-*)` classes. Conventions
  header tells the design agent: inline styles + tokens for glue.
- Playwright: cached chromium-1234 matches repo's pinned playwright 1.62.1.
- cardMode overrides: 7 dialogs + AskPlannerDrawer single (fixed inset-0
  overlays); AppShell/SeatMap/ReceptionScreen/Admin panels column.

## Preview-authoring playbook (from wave 1)

- **Post-build asset copy (MANUAL, every package-build run):**
  `mkdir -p ds-bundle/images && cp public/images/*.png public/images/*.webp ds-bundle/images/`
  — package-build rm -rfs the bundle and never copies public/; without this,
  AppTopBar/AppShell brand mark and the SeatMap/ViewerSeatFinder floor raster
  404 in capture (and in the uploaded project).
- Fixed-position components: wrap the cell in
  `style={{position:"relative", transform:"translateZ(0)", overflow:"hidden", height:<px>}}`
  — transform makes it the containing block; a fixed-only export otherwise
  collapses to 0px. AppRail standalone additionally zeroes `--admin-chrome-h`.
- `.admin-theme` wrapper is required for ALL admin-token consumers — including
  every seat-map dialog and the drawer: shared `Button` secondary/danger read
  `--admin-*`. Viewer surfaces wrap `.shell-theme`; Reception `.reception-theme`.
- Tailwind never scans `.design-sync/previews/` — wrapper styling inline-only;
  any className prop must be copied VERBATIM from an app call site.
- Internal-state disclosure: FloorSelector menu opened via an AutoOpen wrapper
  that clicks `button[aria-haspopup='menu']` in useEffect (capture settles
  after effects).
- Not statically renderable (by design, recorded): AccountMenu open menu,
  ThemeToggle dark state, AppShell active-route sweep (usePathname pinned "/"),
  AdminManagementPanel `initialTab="publishHistory"` (mount-time action call),
  AskPlannerDrawer answered conversation (queuedRequest auto-invokes action).
- SeatMap preview data: ONE assigned seat per officeRoomWash room rect, else
  nameplates stack on the room center.
- AppRail/AppShell previews pass a stub `skewDetector` so no /api/build-id
  probes fire during capture.

- Fixed-overlay dialog previews need an explicit stage on their wrapper —
  `{position:"relative", height:512, transform:"translateZ(0)"}` — the harness
  single-mode wrapper is a transformed 0-height containing block, which
  collapses `fixed inset-0` and cuts the card's top half out of the shot.

## Known render warns

- `[RENDER_THIN]` on AskPlannerDrawer — benign: top-anchored fixed drawer
  renders complete; root just measures 0px flow height (fixed-only child).

## App bugs surfaced by previews (all fixed)

- Dialog scrims never compiled app-wide (Tailwind v3.4 drops slash-opacity on
  arbitrary var colors) — fixed in #401 with `bg-[rgb(var(--…-rgb)/0.45)]`
  slash syntax (NOT `rgba(…, a)`: comma syntax over space-separated channel
  tokens parses as invalid and is equally invisible);
  tests/tailwind-arbitrary-alpha-source.test.mjs bans both broken forms.
- Missing `focus-visible:outline-none` on auto-focused dialog containers
  (DiscardDraftDialog, AskPlannerDrawer) — fixed in #401; and #402 made
  useDialogFocus land initial focus on the first enabled control (visible
  ring on the safe action), container fallback when all controls disabled.

## Re-sync risks

- `shims/app-actions.ts` export list mirrors app/actions.ts by hand — drifts
  when actions are added (build error is loud, fix is mechanical).
- `.design-sync/ds-entry.ts` + componentSrcMap + docs-stubs enumerate the
  component surface by hand — a new component in components/ ships only after
  all three are updated.
- `publishConfig.types` in package.json must survive dependency-tool edits.
- SeatMap's floor-plan webp lives in public/ and is NOT bundled — its preview
  (and any design using SeatMap) has no map image.
- Tailwind compile happens at sync time from app/globals.css — utilities used
  only by NEW app code appear in the bundle only after re-running buildCmd.
