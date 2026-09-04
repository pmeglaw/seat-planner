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
| Current-section bar | **hovered current link** | `#B85C2E` on `#333333` | **2.77** | 3:1 |
| Panel link (`--sp-panel-dark-link`) | rest | `#E8A07A` on `#161616` | 8.39 | 4.5:1 |
| Panel link | hover | `#E8A07A` on `#333333` | 5.86 | 4.5:1 |
| Panel link | pressed | `#E8A07A` on `#393939` | 5.36 | 4.5:1 |

**One finding, raised to the owner (not changed in PR 2):** the terracotta current bar clears 3:1 on the resting
header but not while the *current* link is hovered (the asset's `.cds-header-nav a:hover` lightens the surface to
gray-90-hover and the bar stays #B85C2E → 2.77:1). This is a brand-layer / hover-surface pair (CLAUDE.md brand
checklist measured the bar on #161616 only); the fix is a token ruling — a lighter bar on hover, or no hover fill on
the current link — not a shell change.

## Second finding, raised to the owner — the header at laptop widths

The mode indicator is centred on x = width / 2 by design (PHASE2UX §1.2 "centred on 960; never collides: links end
≈ 688, utilities start at 1776" — measured at 1920). Below ~1580px on an admin (four links) the indicator meets the
Settings link; at Playwright's 1280 default it sits over it and intercepts the click (caught by `nav-shell.spec.ts`
2026-09-04, now pinned to the 1920 ruling frame). The header-nav fold happens at 1055 (the asset's breakpoint), so
1056–1580 is undesigned. Options in the PR body; owner ruling wanted before PR 3 lands more in the row.
