# Where time goes in this app

Read this when a measurement points somewhere and you need to know what lives
there. Everything below was re-verified against the tree on 2026-08-11; the
baseline numbers came from the scripts in this skill.

## Contents

- [Baselines](#baselines) — what the numbers looked like when they were last taken
- [Server time (TTFB)](#server-time-ttfb)
- [Client weight](#client-weight)
- [Render and interaction cost](#render-and-interaction-cost)
- [The map raster](#the-map-raster)
- [Open findings from the 2026-07-28 audit](#open-findings-from-the-2026-07-28-audit)

## Baselines

**Client JS**, `measure-bundle.mjs`, production build, 2026-08-11. Gzip, because
that is what crosses the wire:

| Route | First load | Route's own |
| --- | --- | --- |
| `/admin` | 313 KB | 147 KB |
| `/login` | 248 KB | 83 KB |
| `/` (viewer) | 227 KB | 61 KB |
| `/admin/management` | 209 KB | 43 KB |
| `/admin/settings` | 204 KB | 39 KB |
| `/reception` | 196 KB | 30 KB |

Shared baseline every route pays first: **166 KB gzip** (537 KB raw). All of
`.next/static`: 404 KB gzip / 1,394 KB raw across 31 files.

**Runtime**, from the 2026-07-28 audit (production build, local Supabase,
1440×900). Still the best scale data that exists, and the reason the
`seatMarkers` column exists in `measure-runtime.mjs`:

| Dataset | Route | TTFB | LCP | CLS | DOM nodes | Markers |
| --- | --- | --- | --- | --- | --- | --- |
| 90 seats | `/` | 155 ms | 220 ms | 0.023 | 1,115 | 90 |
| 500 seats | `/` | 206 ms | 388 ms | 0.025 | 2,856 | 500 |
| 2,000 seats | `/` | 233 ms | 320 ms | 0.025 | 4,852 | 1,000 ← truncated, since fixed |
| 2,000 seats | `/admin` | 290 ms | 376 ms | 0.035 | 5,322 | 1,002 ← truncated, since fixed |

Cost grew sub-linearly with dataset size (851 → 1,494 ms navigation for a 22×
dataset), so **seat count has never been the load-time problem here** — worth
remembering before optimising for scale that isn't hurting.

## Server time (TTFB)

Every real page is `export const dynamic = "force-dynamic"` with
`revalidate = 0` (`app/page.tsx`, the three `app/(shell)/admin/*`,
`app/(shell)/reception`). Nothing is cached at the framework level, so **TTFB is
auth plus Supabase round-trips, every single load**. That is the deliberate
design — the map must not serve a stale seating plan — so the target is not
"make it cached", it is "make the round-trips concurrent and few".

The pattern already in place, and the one to preserve: each page fires its
queries in a single `Promise.all` because everything downstream needs only
`user.id`. Serial `await`s stack round-trips into the render. If you add a query,
add it to the existing `Promise.all` rather than awaiting it after.

`lib/serverAuth.ts` (`getSessionContext`) is React-`cache()`d so the `(shell)`
layout and the page guard share **one** auth probe and **one** role lookup per
render. A second `getUser()` on a server surface is a real regression, not a
style nit — reuse the context.

`fetchAllRows` (`lib/fetchAllRows.ts`) pages at 500 rows/request. At 90 seats
that is one request; the loop only costs extra round-trips past 500 rows. Don't
"optimise" the paging away — it exists because PostgREST truncates silently at
the row cap and renders a partial floor plan that looks complete.

Client Router Cache is set to `staleTimes.dynamic = 120` in `next.config.js`, so
a rail click to a route visited in the last 2 minutes re-renders from the cached
RSC payload and skips this cost entirely. That means **a warm navigation and a
cold document load are completely different measurements** — `measure-runtime.mjs`
always measures the cold one.

## Client weight

Both entry pages are thin servers handing everything to one large client
component: `app/page.tsx` → `ViewerSeatFinder` (1,587 lines, `"use client"`),
`app/(shell)/admin/page.tsx` → `SeatMap` (3,966 lines, `"use client"`). That is
why `/admin` is the heaviest route by a wide margin.

There is **no `next/dynamic` anywhere in the tree**. Every admin-only subtree —
`AskPlannerDrawer`, the publish-review and destructive-action dialogs — is in the
initial chunk for anyone who loads `/admin`. This is audit finding PERF-03 and
the single largest available win on client weight.

Note the direction of the win: it is smaller for the viewer than it looks,
because viewers load `/` (227 KB), not `/admin` (313 KB). Check who actually
pays before spending effort here.

## Render and interaction cost

`SeatMarker` is memoized with a **hand-written comparator**
(`components/seat-map/SeatMarker.tsx`, `memo(SeatMarkerComponent, seatMarkerPropsEqual)`).
This was audit finding PERF-02 and it is fixed. Two things keep it working, and
both are load-bearing:

1. `tests/seat-marker-memo.test.mjs` fails if the component reads a `seat.*`
   field the comparator doesn't compare — otherwise React would skip a genuine
   update and the marker would render stale data silently.
2. Callers must pass **identity-stable** handlers. `SeatMap` and
   `ViewerSeatFinder` both build one stable handle for this reason; an inline
   arrow in the render loop hands ~2,000 markers a new prop every render and
   disables the memo completely.

The crowding/de-collision pipeline in `SeatMap` (`seatDensityClearance` →
`namedSeatIdSet` → `computeNameLabelNudges` → `computeCodePillNudges`, backed by
`lib/seatCrowding.ts`) is **O(n²) over seats** and memoized. Its cache holds only
because every dependency is identity-stable on the hot path — with *Show names*
off (the default), `namedSeatIdSet` short-circuits to a module-level constant
empty Set rather than building a new one. If you make any dep rebuild per render,
the O(n²) passes rerun on every pointer move and the map crawls at scale. This is
the most fragile performance invariant in the codebase and it is invisible in a
diff: nothing errors, it just gets slow.

Order matters too: name-label nudges are computed **before** code-pill nudges,
which treat named seats as obstacles. Swapping them makes the two graphs converge
pills onto the same row.

Panning deliberately avoids React entirely — it mutates `scrollLeft`/`scrollTop`
through a ref. Don't convert it to state. Geometry drag was retired 2026-07-30,
so the audit's drag-frame scenario no longer exists; the hot interactions now are
pan, zoom, hover, search typing, and filter chips.

## The map raster

`public/images/office-floor-plan.webp` is 176 KB and is the LCP element on both
map surfaces. It is already `priority` with a `blurDataURL` placeholder, and
`app/login/page.tsx` `preload()`s it at low priority during login so it is warm
before the map ever mounts. This is in good shape — measure before touching it.

`public/images/office-floor-plan.png` (1.8 MB) is the canonical master, not
referenced by any code path. It costs deploy size, not user time. Not a
performance finding.

If you do re-render the asset, `MAP_IMAGE_SRC`'s `?v=…` cache-buster and
`MAP_IMAGE_BLUR_DATA_URL` in `lib/mapLayoutTransform.ts` must both be regenerated
— skip the version bump and browsers keep serving the old image, which presents
as "the deploy didn't land".

## Open findings from the 2026-07-28 audit

Verified against the tree on 2026-08-11:

| ID | Finding | State |
| --- | --- | --- |
| PERF-01 | Map silently truncated at 1,000 seats | **Fixed** — `lib/fetchAllRows.ts` pages and asserts the count |
| PERF-02 | Markers re-render on every pointer move | **Fixed** — `memo` + comparator, guarded by `tests/seat-marker-memo.test.mjs` |
| PERF-03 | ~1.4 MB client JS, largely one component | **Open** — no `next/dynamic` in the tree |
| PERF-04 | `department_options` / `zone_options` RLS call `app_private.is_admin()` per row | **Open** — `supabase/migrations/009_v105_management_csv_cleanup.sql` still uses the bare form; every other table uses `(select app_private.is_admin())`, which Postgres caches as an InitPlan and runs once per query |

PERF-04 is negligible today (7 departments, 8 zones) and only matters if those
tables grow. Its real cost is that it is an inconsistency inviting copy-paste.

The full audit is `docs/audits/2026-07-28/REVIEW.md` — section C is Performance
& Scalability. Grades there describe the state at commit `f32721b` and are
deliberately not restated as fixes land.
