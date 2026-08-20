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

## 2026-08-19 re-sync (40 components)

- Added to the surface: `MapStatusBand`, `NamesVisibilityToggle`, `SeatSheet`
  and `SeatSheetNotice` (both exports of SeatSheet.tsx). 36 → 40 components.
  `ViewerStatusBand` existed only between #407 and #408 and was folded into
  the shared band before it ever synced — don't go looking for it.
- `MapStatusLegend` is **gone** (owner call 2026-08-19, same day it was
  spotted in the DS pane): app-dead since #407/#408, it survived only to feed
  its own DS card, and a card for a retired component is worse than no card —
  the design agent reads the pane as the menu of what to build with. Component,
  ct test, preview, docs stub and the uploaded card all deleted; its
  `MapLegendEntry` type moved into `MapStatusBand.tsx`. 40 → 39 components.
- The driver's verification partition follows the RENDERED card, not the
  component source: SeatMap/ViewerSeatFinder/AppTopBar all changed in app code
  yet landed in `unchanged`. Re-verify materially reworked surfaces on purpose
  with `package-capture.mjs --components … --spot-check-components …` — that
  audit is what caught the clipped status band below.
- `[GRID_OVERFLOW]` warns (new since the last converter version) on
  AccountMenu / CloseIcon / ThemeToggle (wide) and AppRail / AppShell (escape,
  fixed positioning). Remedies applied in cfg.overrides: column for the first
  three, `single` + primaryStory for the rail and shell.
- **Column-mode cells cap their height (~560px).** A full-surface preview
  clipped there — SeatMap lost the whole status band off the bottom edge.
  Full-viewport surfaces need `cardMode: single` + an explicit `viewport`.
- **Full-surface previews need an explicit stage.** SeatMap/ViewerSeatFinder
  size off `lg:h-screen`, so the band (their last row) landed exactly on the
  card's edge. Both previews now wrap the surface in a fixed-height div plus
  `[data-ds-stage="…"] > div { height:100% !important; min-height:0 !important }`.
- **Mount animations freeze at frame 0 in capture.** SeatSheet draws itself in
  (opacity 0 + stroke-dashoffset keyframes) and both its cards came back as an
  empty drawing frame. The previews inject the component's OWN
  `prefers-reduced-motion: reduce` rules with `!important`. Any future
  animated-entrance component needs the same treatment.
- A `cardMode` change needs a FULL `package-build.mjs`: `preview-rebuild.mjs`
  + capture prints `[CONFIG_STALE]` and captures the stale card anyway.
- `conventions.md` drift found and fixed: the Action family was written
  `--sp-color-action-hover/-pressed`, which do not exist (real names are
  `--sp-color-action-primary-hover` / `-pressed`), and the StatusBadge tone
  list was missing the seat-status tones. Re-run that validation every sync.
- Grades live in the gitignored `.cache/` — a fresh clone has none, and
  carry-forward comes from the uploaded `_ds_sync.json`. Both this run's
  clones started cold; that is expected, not a bug.

## 2026-08-20 re-sync (38 components, full re-verify)

- Scope call: the driver reported `39 verified-by-upload / 0 changed` even though
  teal (#421), app-wide dark mode (#422–#424), the inspector restyle (#426/#427
  follow-up) and the admin filter removal (f218f64) had all landed since the
  08-19 upload — the same partition trap recorded above. Owner chose a FULL
  re-verify: `package-capture.mjs --force`, 38 components / 87 cells, graded by
  five parallel subagents. Every cell ended `good`.
- `DeptChipRow` card DROPPED (owner call, MapStatusLegend precedent): f218f64
  removed its last caller, so it left ds-entry.ts, componentSrcMap, docs-stubs
  and the uploaded project. The component + its ct tests STAY in the repo — this
  is a card removal, not a code removal. 39 → 38 components.
- `[GRID_OVERFLOW]` on AppTopBar (new this run) fixed with
  `cfg.overrides.AppTopBar = {"cardMode": "column"}`.
- **Three previews were silently broken by a missing theme-scope wrapper.** The
  token families are class-scoped, never on `:root`: `--login-*` lives only under
  `.login-theme`, `--admin-*` (including the `--admin-marker-live-*` pill palette)
  only under `.admin-theme, .shell-theme`. LoginForm rendered an invisible
  primary (`bg-[var(--login-accent)] text-white` on an undefined fill);
  SeatMarker rendered every pill as an unpainted hairline with white-on-white
  text. Before writing any preview: grep the component for `var(--x-…)` and wrap
  in the class that scopes that prefix. `--sp-*` is the ONLY global family.
- `.admin-theme` and `.shell-theme` are token-identical (globals.css always names
  them as a pair), so swapping a preview between them is a provenance fix with
  zero pixel change — that is what FilterPanel got, since ViewerSeatFinder is its
  only caller now.
- **Viewport-anchored fixed surfaces need a stage that cancels the story-root
  padding, not just its height.** AskPlannerDrawer is `fixed` at
  `top-[calc(var(--admin-chrome-h)+12px)]`; the harness root is transformed AND
  24px-padded, so the drawer sat 24px low and the taller variant ran off the
  frame. Stage is now `{position:"relative", height:620, margin:-24,
  transform:"translateZ(0)"}` — the -24 was measured (pre-fix top border y=76,
  minus `--admin-chrome-h` 40 + 12), so re-derive it the same way if the harness
  padding ever changes. Centred modals never hit this; their existing
  `{position:"relative", height:512, transform:"translateZ(0)"}` stage is correct
  and must not be "tidied away".
- Capture is `fullPage:false` at the declared viewport (default 900x700) and
  crops tall content mid-element with no warning. Fix it fixture-side (Admin
  Management's roster went 10 people → 6, seats freed so the summary tiles stay
  arithmetically honest) rather than reaching for a viewport override.
- Prop-less click-to-open surfaces CAN be shown open: preview pages mount with
  `createRoot`, so a `useEffect` that clicks `button[aria-haspopup="menu"]`
  discloses the real menu through the real code path (AccountMenu now does this,
  as FloorSelector already did). Menu habitats need width as well as height —
  size for `triggerOffset + menuMinWidth` (FloorSelector's chrome cell 320 → 400).
- Confirmed NOT stale, do not "fix": AiHighlightChip and the AppRail `AI` glyph
  are blue on purpose (`--admin-ai-*`, a deliberate exception to the warm
  palette); FilterPanel is a dark menu on purpose (viewer top bar shares
  `--admin-chrome-*`); MapStatusBand's `FiltersActive` cell still shows
  "Fit matches"/"Clear" because SeatMap still feeds the band's summary/actions
  slots on active search; SeatMarker's `variant="viewer"` IS the shipped palette
  (the `admin` arm is dormant); PublishReviewDialog filling its 512px stage is
  the dialog's own `max-h`, not a crop; the tall blank band under `cardMode:
  "column"` rows is the review-sheet compositor, not a preview defect.
- SeatSheet's `.mss-*` settle CSS had NOT drifted this run. The whole check is
  `grep -o "mss-[a-z-]*" components/seat-map/SeatSheet.tsx` diffed against the
  preview's `SETTLED_CSS` block.
- conventions.md drift fixed: `--sp-color-border` does not exist (real names are
  `--sp-color-border-subtle` / `-strong`); the StatusBadge tone list wrongly
  claimed seat statuses as tones (real union adds `blocked`/`pending`, and
  available/assigned/reserved/unavailable ride the `seat` row into SeatMarker).
  Added: the dark-mode contract and the `.login-theme` / marker-token scopes.

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

- (none as of 2026-08-20 — the last full validate printed zero warn lines.)
- RETIRED 2026-08-20: `[RENDER_THIN]` on AskPlannerDrawer. It was benign (a
  top-anchored fixed drawer whose root measured 0px flow height), and the
  620px stage added to its preview this run gave the wrapper real height, so
  the warn stopped firing. If it returns, the stage was removed.

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
- The `[data-ds-stage]` height pin in the SeatMap/ViewerSeatFinder previews is
  tied to those surfaces keeping a viewport-relative root (`lg:h-screen`). If
  the height model changes, the pin silently over- or under-constrains.
- SeatSheet's settle CSS targets the component's own `.mss-*` class names.
  Rename those in the component and the card goes blank again with no warning
  (the render check passes — the DOM is there, it is just invisible).
- `cfg.writes` for the upload must include `images/**`: the manual asset copy
  puts the brand mark and floor plan in the bundle, and a plan without that
  glob rejects them (the map cards then ship with a missing floor plan).
- The image copy CANNOT be interleaved into a `resync.mjs` driver run — the
  driver's build stage wipes `ds-bundle/` and validate/capture follow it
  immediately. Order that works: driver run → `cp` the images → upload. If you
  need true screenshots mid-loop, run `package-build.mjs`, copy images, then
  `package-validate.mjs` / `package-capture.mjs` as separate commands.
- `previews/ViewerSeatFinder.tsx`'s header comment still claims the floor-plan
  raster is absent from the bundle. Stale since the image copy — comment only.
- SeatSheet ships a single story, so its cells can never be graded on the
  "variant axis varies" clause. A second story (seat with no neighbours / no
  extension) is the natural addition if that ever matters.
