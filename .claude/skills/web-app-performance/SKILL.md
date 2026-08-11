---
name: web-app-performance
description: Measure and diagnose seat-planner's web performance — page load, TTFB, LCP/CLS, client bundle weight, hydration cost, render and interaction jank. Use whenever someone says the app (or a route like /, /admin, /reception) feels slow, laggy, heavy, or janky; asks why a page takes so long to load or respond; asks how big the JavaScript bundle is or what's in it; wants Core Web Vitals, Lighthouse-style numbers, or a before/after comparison for a change; or asks whether an edit made things faster or slower. Also use before optimizing anything for speed, so the change is aimed at a measured bottleneck instead of a guessed one.
---

# Measuring and diagnosing performance

Performance work goes wrong in a specific way: someone forms a theory, optimizes
for it, and ships a change that costs review time and regression risk while the
real bottleneck sits untouched. The purpose of this skill is to make the
measurement cheap enough that you never have to guess.

So the rule that matters most here is the boring one: **get a number before you
change anything, and get the same number after.** Everything below exists to
make that fast.

## Pick the tier that matches the question

Three different things get called "slow", and they need different instruments.
Choose by what the person actually described:

| What they said | What's being measured | Go to |
| --- | --- | --- |
| "the page takes ages to load", "it's slow on my laptop" | TTFB, LCP, hydration | [Tier 2](#tier-2-runtime--what-the-user-waited-for) |
| "the bundle is huge", "why are we shipping so much JS" | Client weight per route | [Tier 1](#tier-1-weight--what-the-build-ships) |
| "it's janky when I pan/zoom/type", "the map stutters" | Render and interaction cost | [Tier 3](#tier-3-interaction--what-happens-after-load) |
| "did my change make it faster?" | Whichever of the above the change touched | measure both sides |

If the description is vague — just "it feels slow" — run Tier 1 and Tier 2.
Together they take a few minutes and they tell you which half of the problem you
have: a big TTFB is server work, a big LCP-minus-TTFB is client work.

Before interpreting any result, read `references/hot-spots.md`. It maps each
number to the code that produces it in *this* app, carries the current baselines,
and lists which audit findings are still open — so you don't spend an afternoon
rediscovering something already known and written down.

All three scripts run on Node with the project's own `@playwright/test`
dependency — nothing extra to install. If Chromium isn't where Playwright expects
it (common in containers), point at the prebuilt one rather than downloading a
second copy: `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-*/chrome-linux/chrome`.

## Tier 1: weight — what the build ships

Backend-free. Works anywhere, needs no database and no credentials.

```bash
NEXT_PUBLIC_SUPABASE_URL=https://dummy.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy-anon-key \
npm run build

node .claude/skills/web-app-performance/scripts/measure-bundle.mjs
```

The dummy env vars are the same ones `playwright.config.ts` uses — the build only
needs the variables to exist, not to be real. Never point a measurement build at
the production Supabase project just to make it build.

You need the script because **Next 16's Turbopack build prints a route table with
no First Load JS column**. The number everyone reaches for is simply not in the
build output any more; the script reads it out of `.next/server/app/**` instead
and reports gzip alongside raw, since gzip is what crosses the wire.

Read the output like this: the *shared baseline* is what every route pays before
its own code, and *first load* is that baseline plus the route's own chunks. The
routes share chunks with each other too, so the columns deliberately don't sum to
the disk total. To find out what a chunk actually is, grep it for a distinctive
symbol: `rg -l "computeCodePillNudges" .next/static/chunks`.

For a before/after, `--json` on both sides and diff:

```bash
node .../measure-bundle.mjs --json > /tmp/before.json
# make the change, rebuild
node .../measure-bundle.mjs --json > /tmp/after.json
```

## Tier 2: runtime — what the user waited for

This is the tier that produces the numbers people actually mean. It needs the app
running and, for every real route, a session.

```bash
npm run dev &                       # or: npm run start, after a build
node .claude/skills/web-app-performance/scripts/measure-runtime.mjs --route / --runs 5
```

It signs in once as the seeded e2e user and reuses that session across runs,
giving each run a **fresh browser context** — so every sample is a cold cache
with warm auth. Re-authenticating per run would fold Supabase Auth latency into
every number and measure the wrong thing.

Useful variants:

```bash
--route /admin --route /            # several routes in one pass
--runs 7                            # more samples when the spread is wide
--cpu 4                             # throttle to roughly a mid-range laptop
--no-login                          # only for /login and the /concepts/* prototypes
--json                              # machine-readable, for before/after diffs
```

Reported metrics come from the browser's own definitions (PerformanceObserver,
navigation timing), not from timers wrapped around Playwright calls, so they mean
the same thing they do in DevTools or Lighthouse. The script reports the **median
of N runs with the spread**, because a single load is noise.

Two notes that decide whether a result is trustworthy:

- **Measure a production build when the number is going to be quoted.** `next dev`
  compiles on demand and ships unminified code; its numbers are fine for
  relative before/after on the same server, and misleading as absolutes.
- **The script refuses to measure a redirect** — any redirect, not just the
  `/login` bounce you get without a session. Reporting one page's numbers under
  another page's name is a wrong answer that looks like a right one. A
  trailing-slash normalisation (`/admin/` → `/admin`) is the one benign case and
  is allowed through.

Credentials come from `.env.local` (`SEAT_PLANNER_E2E_EMAIL` / `_PASSWORD`),
same as the `run-seat-planner` driver. The seeded user is viewer-role, so
`/admin` renders "Admin access required" rather than the editor — measuring the
real admin map needs the deliberate, owner-approved role flip documented in the
`run-seat-planner` skill. **While elevated, stay read-only**: local dev writes to
the production database, and a publish is a production deploy.

## Tier 3: interaction — what happens after load

Load metrics say nothing about whether panning the map stutters, so this tier
drives a scripted gesture and watches the main thread across it:

```bash
node .claude/skills/web-app-performance/scripts/measure-interaction.mjs \
  --route /admin --interaction hover --cpu 4
```

Interactions are `hover` (pointer across markers — memoization pressure), `pan`
(the scroll-through-ref path), `zoom` (re-runs the crowding pipeline), and `type`
(`--selector`, `--text`; filter/search re-render cost).

Read the result by shape, not by any single number. In particular **the median is
close to useless on its own** — it sits at 16.7 ms even in badly janky runs,
because most frames are still fine and the stalls hide in the tail:

- A **~16.7 ms median with near-zero missed frames is 60 fps** — smooth, and not
  something to "fix". Report it and stop.
- A **high p95 or worst frame over a healthy median** is periodic expensive work.
  That is the shape that matches this app's known failure mode: the O(n²)
  de-collision pipeline recomputing because a memo dependency stopped being
  identity-stable.
- **Missed frames against stutters** tells you the shape of the stall: many
  missed frames over few stutters is one long freeze; roughly equal numbers means
  lots of small hiccups, i.e. steady per-frame cost rather than one spike.
- A **raised median** is steady per-frame cost affecting every frame — too much
  work in the render path generally.

Missed frames are severity-weighted: an interval spanning N vsync slots presented
one frame and missed N−1. That matters because counting stalls instead of frames
scores a 500 ms freeze the same as one brief hiccup.

`--cpu 4` is worth using by default here. On an unthrottled machine almost
everything looks smooth; a mid-range laptop is roughly where users actually are.

When the p95 shape shows up, start from the *Render and interaction cost* section
of `references/hot-spots.md`. That identity-stability invariant is invisible in a
diff — nothing errors when it breaks, the map just gets slow — so it is the first
thing to check when interaction cost regresses.

Two limits worth knowing. The map gestures need markers on screen, so they need a
session **with data** — on `/admin` a viewer-role account renders the
access-denied view, and the script says it found no markers rather than reporting
zeros. And frame timing tells you *that* a frame was expensive, not *which
component* made it so; when you need that, the **React DevTools Profiler** answers
the question this tier can't — how many components re-rendered for one
interaction. A pointer move that re-renders every marker instead of one is a
memoization failure that never shows up as a bad Web Vital.

## Reporting what you found

Give the numbers, then the diagnosis, then the recommendation — and keep them
separate, because they carry different confidence. The shape to aim for (the
load numbers below are invented to illustrate it; the bundle figures are real):

> `/admin` cold load, production build, median of 5: TTFB 210 ms, LCP 340 ms,
> hydration long tasks 190 ms, first-load JS 313 KB gzip.
> The LCP-minus-TTFB gap and the long-task total both point at client work, not
> the server. `/admin` ships 147 KB of its own JS and there is no `next/dynamic`
> in the tree, so the admin-only dialogs are in the initial chunk.
> Code-splitting `AskPlannerDrawer` and the review dialogs is the largest
> available win; I have not measured how much it recovers.

Two habits worth keeping:

- **Say which build and how many runs.** A number without those is not
  reproducible, and a dev-server number quoted as an absolute is misleading.
- **Don't report a fix you haven't re-measured.** "Should be faster" is a
  hypothesis. Re-run the same tier and quote both sides.

If a measurement shows the thing is already fine, say so plainly and stop. The
audit found load performance genuinely good at every dataset size tested, and
cost growing sub-linearly with seat count — so "this is fast enough, here's the
number" is a frequent and correct outcome here, and it saves more time than a
speculative optimization would.

## What not to chase

- **Seat count.** Cost grows sub-linearly with dataset size; the 2,000-seat
  failure the audit found was correctness (silent truncation, since fixed), not
  latency.
- **The `force-dynamic` pages.** Nothing is cached at the framework level on
  purpose — the map must never serve a stale seating plan. Improve concurrency of
  the queries, not their cacheability.
- **The map raster.** 176 KB webp, already `priority`, already blur-placeheld,
  already preloaded during login. Measure before touching it.
- **The 1.8 MB `office-floor-plan.png`.** It is the canonical master and no code
  path loads it. It costs deploy size, not user time.
