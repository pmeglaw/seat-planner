# Phase 4 · PR 2 captures — the shell (2026-09-04)

**What these show.** The Phase 3 shell mounted once on every signed-in route, `/` included: the 48px Gray 100
header (skip link · hamburger or reserved slot · text-only name · role-fitted section links with the terracotta
current bar · status-only mode indicator · Help / History / Account with tier-C tooltips), the 256px left filter
panel with its FOUR groups (Department · Zone · Status · Position — owner ruling 2026-09-04) pushing the map, the
three 320px dark right panels, the provisional tenant row under the header (PHASE 4 BRIDGE, PR 3 removes it), and the
1024 narrow frame (links folded into the left panel, compact indicator). Every dark-panel component is also shown in
the LIGHT theme (PHASE3DS §7 item 5 / P3-6 gate): the panels are Gray 100 in both themes by design (tier C).

**Source.** Branch `feat/phase4-shell` (PR 2), `npm run build && npm run start -p 3000` against the **local Docker
Supabase stack** (`npm run db:start` + `db:seed`; `.env.local` pointed at `http://127.0.0.1:54321` for the run,
backed up outside the repo and restored after). Signed in as the seeded local admin `e2e-admin@example.test`.
**No production data and no production write**: every name, seat and count on these pages is `supabase/seed.sql`
sample data (the one publish event is the e2e-auth tier's own publish on the local stack).

**Method.** Playwright `chromium.launch({ channel: "chrome" })`, viewport 1920×1080 (1024×768 for the narrow frame),
device scale 1, after `document.fonts.ready` + 500–800 ms; theme set by writing `sp-theme` to localStorage and
reloading, so the boot script derives `data-theme` / `data-carbon-theme` exactly as a user's browser would. Three
rigs: `audit/runtime-audit.mjs` (route captures + the undefined-`var()` audit — **0 undefined on 6 routes × 2 themes;
console errors = the Vercel Speed Insights script 404ing under a local `next start`, 2 lines × 6 routes × 2 themes,
no app error**), `audit/shell-states.mjs` (the state captures and the measurements below), `audit/marker-contrast.mjs`
(`markers/`, same table as PR 1: 28 measurements, 2 under 4.5:1 — the ledgered `filtered-out` dim, PR 3 — 0 outside the ledger).

| File | What | Theme | Width |
|---|---|---|---|
| `home-{light,dark}-1920.png`, `home-light-1024.png` | `/` under the shell: Published indicator, viewer search in the tenant row, hamburger | both | 1920 · 1024 |
| `admin-{light,dark}-1920.png`, `admin-light-1024.png` | `/admin`: Draft indicator (live count from SeatMap), bar tenants in the tenant row | both | 1920 · 1024 |
| `admin-management-*`, `admin-settings-*`, `reception-*` | sub-pages: reserved hamburger slot, count fetched once (`getDraftStatusAction`) | both | 1920 · 1024 |
| `login-*` | `/login` (unchanged; already-signed-in state) | both | 1920 · 1024 |
| `admin-header-rest-*-1920.png`, `home-header-*-1920.png`, `management-header-*-1920.png` | header strips: draft / published / reserved slot | both | 1920 |
| `admin-utility-hover-tooltip-*`, `admin-utility-pressed-*`, `home-hamburger-focus-*` | utility hover + tier-C tooltip · pressed · hamburger focus ring | both | crops |
| `admin-history-open-*-1920.png`, `admin-history-panel-*`, `admin-indicator-open-*` | History open from the utility (outlined) and from the indicator (outlined, four shadows) | both | 1920 |
| `admin-account-open-*`, `admin-help-open-*`, `home-account-*`, `home-history-viewer-*` | Account (Theme radio, My seat / unseated row, Sign out) · Help · viewer History (fact line, no switch) | both | crops |
| `home-left-open-applied-*-1920.png`, `home-left-panel-*` | left panel open on `/` with two filters applied, four groups, counts incl. zero, pushed map | both | 1920 |
| `admin-history-open-light-1024.png`, `home-left-open-light-1024.png` | narrow frame: compact "Draft · 0", hamburger everywhere, links above the filters | light | 1024 |
| `markers/marker-<state>-<theme>.png` | marker-state crops from `marker-contrast.mjs` (unchanged states; the pill is PR 3's) | both | crops |
| `measurements.json` | computed colours the table below is built from | | |

## Utilities · current bar · panel link — measured (owner audit add, 2026-09-04)

Computed from `shell-states.mjs` (`measurements.json`) and checked with the skill's contrast formula
(`scripts/check_contrast.py` method); the header is Gray 100 in both themes so light = dark.

| Element | State | Colours (fg on bg) | Ratio | Needs |
|---|---|---|---|---|
| Utility icon | rest | `#f4f4f4` on `#161616` | 16.45 | 3:1 |
| Utility icon | hover | `#f4f4f4` on `#333333` (gray-90-hover) | 11.49 | 3:1 |
| Utility icon | pressed | `#f4f4f4` on `#393939` (gray 80) | 10.50 | 3:1 |
| Utility / indicator | open | `#f4f4f4` on `#161616`, outline `#393939` ×3 inset + `0 1px 0 #161616` (four shadows) | 16.45 (icon) | 3:1 |
| Current-section bar | rest | `#B85C2E` on `#161616` | 3.97 | 3:1 |
| Current-section bar | hovered current link | `#B85C2E` on `#161616` — no hover fill on the current link since the 2026-09-04 ruling (was `#333333` → 2.77 before it) | 3.97 | 3:1 |
| Panel link (`--sp-panel-dark-link`) | rest | `#E8A07A` on `#161616` | 8.39 | 4.5:1 |
| Panel link | hover | `#E8A07A` on `#333333` | 5.86 | 4.5:1 |
| Panel link | pressed | `#E8A07A` on `#393939` | 5.36 | 4.5:1 |

**Finding 1 — ruled (owner, 2026-09-04): the current link takes no hover fill.** The bar measured 2.77:1 on the
asset's gray-90-hover while the *current* link was hovered; it is not a destination, so it keeps the shell background
on hover and the bar stays 3.97:1 in every state (`sp-components.css` §3 override; PHASE3DS §2 / §3 instance 5;
`generate-pairs.mjs` rest + hover pairs, 193/193).

## Finding 2 — ruled (owner, 2026-09-04): the indicator centres in the header's free run

The page-midpoint rule (PHASE2UX §1.2 "centred on 960", measured at 1920) met the admin's four links below ~1580px and
at 1280 sat over Settings and intercepted the click. Ruling: `.sp-header-center` centres the indicator between the last
section link and the first utility — one fluid rule, both roles, every width; the nav fold stays at the asset's 1055.
`tests/e2e-auth/header-geometry.spec.ts` pins "never intersects a link or a utility" at 1920 / 1580 / 1366 / 1280 /
1056 for both link sets and logs the measured centres (PHASE4BUILD §1.15). The header captures above were regenerated
after the ruling.
