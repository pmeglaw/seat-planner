# Viewer v13 Runoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `app/concepts/viewer-v13/` — one gated prototype page rendering the real viewer hero (full 60-seat fixture map, seat markers, zone/availability chips, name-find field) with a **theme toggle** between the two finalist archetypes: Ethereal Glass (brand-orange re-cut) and Editorial Luxury.

**Architecture:** Same proven pattern as the design-sampler: one client component, theme objects carry ALL styling differences, one renderer. Seat positions flow through the production pipeline (`seatsToVisualSeats` + `pointToStyle`) over the real webp so markers land on real chairs. Toggle is client state; both themes render the identical component tree.

**Tech Stack:** Next.js App Router client component below a server-gated page.tsx, Tailwind arbitrary values, `next/font/local` (fonts already vendored in `app/concepts/fonts/`), `node --test` gate test (auto-discovers the new page).

**Spec:** `docs/superpowers/specs/2026-08-12-highend-visual-redesign-concepts-design.md` — Phase 1 as amended by the 2026-08-12 sampler ruling (changelog §8): runoff between two finalists on one page; winner becomes the language for Phases 2–3.

## Global Constraints

- Prototype gate verbatim (copy the design-sampler `page.tsx` shape exactly): `process.env.NODE_ENV !== "production" || process.env.SEAT_PLANNER_ENABLE_PROTOTYPES === "true"`, else `notFound()`; `robots: { index: false, follow: false }`. `tests/concept-gate-source.test.mjs` auto-discovers the page — after Task 1 it must report 7 tests (1 count + 6 pages), all passing.
- Fixture data only: the copied `fixtureSeats.ts` is the sole data source. Zero `lib/supabase/*` imports, zero server actions. Allowed lib imports: `@/lib/mapLayoutTransform` (`MAP_IMAGE_SRC`, `MAP_IMAGE_BLUR_DATA_URL`, `MAP_IMAGE_WIDTH`, `MAP_IMAGE_HEIGHT`, `seatsToVisualSeats`) and `@/lib/seatMath` (`pointToStyle`).
- The map `<Image>` MUST carry `unoptimized` (pinned lesson: `images.localPatterns` allowlists a stale `?v=` and rejects `MAP_IMAGE_SRC` through the optimizer; every production map consumer passes `unoptimized`).
- Animate ONLY `transform`/`opacity` (final-review ruling on the sampler: no `filter` in transitions). Every reveal guarded by `prefers-reduced-motion` (reuse the sampler's `useReveal`/`Reveal` verbatim, minus nothing — it is already filter-free after commit 3b7c343). No `backdrop-blur` on anything that scrolls.
- Grid/span classes go on the OUTERMOST element that is a grid child (pinned lesson: sampler fix round 2 — spans on inner shells silently collapse).
- Fonts: reuse `../fonts/*.woff2` via `next/font/local` with explicit weight ranges (Geist `"100 900"`, Fraunces `"100 900"`). Plus Jakarta Sans is NOT used here (Soft Structuralism is eliminated); do not load it.
- Brand orange is exactly `#FF5715` (owner-ruled v12 accent). The glass theme's glow/accents use it; no purple/emerald remains in the glass theme. Editorial Luxury keeps its sampled cream/espresso palette (no orange re-cut was requested for it).
- No changes to shipped surfaces, tokens, `tailwind.config.ts`, `next.config.js`, `app/actions.ts`, `proxy.ts`. `package.json` untouched.
- A11y floor: chips are `<button aria-pressed>`; seat markers are focusable `<button>`s with visible `focus-visible` rings and `aria-label` naming seat + occupant; the find field has a real `<label>`; the toggle is a `role="tablist"`-free simple pair of `aria-pressed` buttons (no fake tab semantics).
- Env notes: full `npm test` baseline 1091+ pass / 0 fail (gate test grows by 1); `npm install` never `npm ci`; hydration-mismatch warning mentioning `caret-color` is documented extension noise — ignore.
- Verification bar per task: `npm run typecheck`, `npx eslint <changed files>`, `node --test tests/concept-gate-source.test.mjs`; full `npm test` in the final task. Controller performs all live-browser checks (single-owner capture pipeline) — implementers do NOT run the dev server.

---

### Task 1: Scaffold — fixture copy, gated route, component shell

**Files:**
- Create: `app/concepts/viewer-v13/fixtureSeats.ts` (verbatim copy of `app/concepts/map-redesign/fixtureSeats.ts`)
- Create: `app/concepts/viewer-v13/ViewerV13.tsx` (shell)
- Create: `app/concepts/viewer-v13/page.tsx`

**Interfaces:**
- Produces: route `/concepts/viewer-v13`; named export `ViewerV13`; local fixture module exporting `FIXTURE_SEATS`, `FIXTURE_ZONES`, `FixtureSeat`, `FixtureSeatStatus` (same names as the source file).

- [ ] **Step 1: Copy the fixture verbatim**

```bash
cp app/concepts/map-redesign/fixtureSeats.ts app/concepts/viewer-v13/fixtureSeats.ts
```

Copy, do not import across concept directories — pages stay independently deletable.

- [ ] **Step 2: Shell component**

```tsx
// app/concepts/viewer-v13/ViewerV13.tsx
"use client";

export function ViewerV13() {
  return <main>viewer v13 runoff — content lands in the next tasks</main>;
}
```

- [ ] **Step 3: Gated page — copy the design-sampler page.tsx pattern exactly**

```tsx
// app/concepts/viewer-v13/page.tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ViewerV13 } from "./ViewerV13";

export const metadata: Metadata = {
  title: "Seat Planner · Viewer v13 runoff (Glass vs Editorial)",
  description:
    "Prototype-only viewer hero rendered in the two finalist archetypes with a live theme toggle. Static fixture content — no data, no auth.",
  // Belt-and-suspenders alongside the prototypesEnabled() 404 gate: even when
  // the flag exposes this route, it must never be indexed.
  robots: { index: false, follow: false }
};

function prototypesEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.SEAT_PLANNER_ENABLE_PROTOTYPES === "true";
}

export default function ViewerV13Page() {
  if (!prototypesEnabled()) {
    notFound();
  }

  return <ViewerV13 />;
}
```

- [ ] **Step 4: Verify the gate test discovered it**

Run: `node --test tests/concept-gate-source.test.mjs`
Expected: PASS, 7 tests (1 count + 6 pages including `viewer-v13/page.tsx`).

- [ ] **Step 5: Commit**

```bash
git add app/concepts/viewer-v13/
git commit -m "feat(concepts): scaffold gated viewer-v13 runoff route"
```

---

### Task 2: Theme system, toggle, map stage with real seat markers

**Files:**
- Modify: `app/concepts/viewer-v13/ViewerV13.tsx` (replace shell)

**Interfaces:**
- Consumes: fixture module (Task 1); `app/concepts/fonts/{geist,fraunces}-latin-wght-normal.woff2`; `@/lib/mapLayoutTransform`, `@/lib/seatMath`.
- Produces: `RunoffTheme` type + `GLASS` / `EDITORIAL` theme objects + `useReveal`/`Reveal` (sampler-identical) that Task 3 extends with chip/find styling fields it references (`chipClass`, `chipActiveClass`, `fieldClass`, `fieldLabelClass` are declared NOW, used in Task 3).

- [ ] **Step 1: Implement the core**

Structure (all in `ViewerV13.tsx`; complete class strings for both themes are binding):

```tsx
"use client";

// Prototype-only runoff: viewer hero in the two finalist archetypes.
// Fixture = the real 60-seat published snapshot; positions flow through the
// PRODUCTION transform pipeline (seatsToVisualSeats + pointToStyle) so markers
// land on the same chairs as the live viewer.
import localFont from "next/font/local";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  MAP_IMAGE_BLUR_DATA_URL,
  MAP_IMAGE_HEIGHT,
  MAP_IMAGE_SRC,
  MAP_IMAGE_WIDTH,
  seatsToVisualSeats
} from "@/lib/mapLayoutTransform";
import { pointToStyle } from "@/lib/seatMath";
import { FIXTURE_SEATS, FIXTURE_ZONES, type FixtureSeat } from "./fixtureSeats";

const geist = localFont({
  src: "../fonts/geist-latin-wght-normal.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--font-v13-grotesk",
  display: "swap"
});

const fraunces = localFont({
  src: "../fonts/fraunces-latin-wght-normal.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--font-v13-serif",
  display: "swap"
});

const EASE = "cubic-bezier(0.32,0.72,0,1)";

type RunoffTheme = {
  id: "glass" | "editorial";
  name: string;
  displayFontVar: string;
  bodyFontVar: string;
  pageClass: string;
  backdrop: ReactNode;
  eyebrowClass: string;
  headingClass: string;
  bodyClass: string;
  // map card (double-bezel)
  shellClass: string;
  coreClass: string;
  // markers
  markerAssignedClass: string;
  markerAvailableClass: string;
  markerDimmedClass: string; // filtered-out state, both statuses
  // chips + find field (used by Task 3)
  chipClass: string;
  chipActiveClass: string;
  fieldLabelClass: string;
  fieldClass: string;
  toggleClass: string;
  toggleActiveClass: string;
};

const GLASS: RunoffTheme = {
  id: "glass",
  name: "Ethereal Glass",
  displayFontVar: "var(--font-v13-grotesk)",
  bodyFontVar: "var(--font-v13-grotesk)",
  pageClass: "bg-[#050505] text-white",
  backdrop: (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className="absolute -top-40 left-1/4 h-[34rem] w-[34rem] rounded-full bg-[radial-gradient(circle_at_center,rgba(255,87,21,0.22),transparent_65%)]" />
      <div className="absolute bottom-0 right-0 h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(circle_at_center,rgba(255,87,21,0.10),transparent_65%)]" />
    </div>
  ),
  eyebrowClass:
    "inline-flex items-center rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-white/70",
  headingClass: "text-4xl font-semibold tracking-tight text-white md:text-6xl",
  bodyClass: "text-base font-light leading-relaxed text-white/60",
  shellClass: "rounded-[2rem] bg-white/5 p-1.5 ring-1 ring-white/10",
  coreClass: "relative overflow-hidden rounded-[calc(2rem-0.375rem)] bg-[#0b0b0d] shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)]",
  markerAssignedClass:
    "rounded-full border border-[#FF5715]/60 bg-black/80 px-2 py-0.5 text-[10px] font-medium text-white outline-none focus-visible:ring-2 focus-visible:ring-[#FF5715]",
  markerAvailableClass:
    "rounded-full border border-white/25 bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white/70 outline-none focus-visible:ring-2 focus-visible:ring-white/70",
  markerDimmedClass: "opacity-25",
  chipClass:
    "rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/70 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#FF5715]",
  chipActiveClass:
    "rounded-full border border-[#FF5715]/70 bg-[#FF5715]/15 px-3 py-1.5 text-xs font-medium text-[#ffb694] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#FF5715]",
  fieldLabelClass: "text-[11px] font-medium uppercase tracking-[0.18em] text-white/50",
  fieldClass:
    "w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/30 outline-none focus-visible:ring-2 focus-visible:ring-[#FF5715]",
  toggleClass:
    "rounded-full px-4 py-1.5 text-xs font-medium text-white/60 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#FF5715]",
  toggleActiveClass:
    "rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-black outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#FF5715]"
};

const EDITORIAL: RunoffTheme = {
  id: "editorial",
  name: "Editorial Luxury",
  displayFontVar: "var(--font-v13-serif)",
  bodyFontVar: "var(--font-v13-grotesk)",
  pageClass: "bg-[#FDFBF7] text-[#2b2018]",
  backdrop: (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 opacity-[0.04]"
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.6'/%3E%3C/svg%3E\")"
      }}
    />
  ),
  eyebrowClass:
    "inline-flex items-center rounded-full border border-[#2b2018]/15 bg-[#2b2018]/[0.04] px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-[#8a6f57]",
  headingClass: "text-4xl font-medium tracking-tight text-[#241a12] md:text-6xl",
  bodyClass: "text-base leading-relaxed text-[#5c4d3f]",
  shellClass: "rounded-[2rem] bg-[#2b2018]/[0.05] p-1.5 ring-1 ring-[#2b2018]/10",
  coreClass:
    "relative overflow-hidden rounded-[calc(2rem-0.375rem)] bg-[#FFFEFB] shadow-[inset_0_1px_1px_rgba(255,255,255,0.9),0_20px_50px_-30px_rgba(43,32,24,0.35)]",
  markerAssignedClass:
    "rounded-full border border-[#2b2018]/30 bg-[#241a12] px-2 py-0.5 text-[10px] font-medium text-[#FDFBF7] outline-none focus-visible:ring-2 focus-visible:ring-[#241a12]",
  markerAvailableClass:
    "rounded-full border border-[#2b2018]/20 bg-[#FFFEFB]/90 px-2 py-0.5 text-[10px] font-medium text-[#6d5943] outline-none focus-visible:ring-2 focus-visible:ring-[#241a12]",
  markerDimmedClass: "opacity-25",
  chipClass:
    "rounded-full border border-[#2b2018]/15 bg-[#2b2018]/[0.04] px-3 py-1.5 text-xs font-medium text-[#6d5943] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#241a12]",
  chipActiveClass:
    "rounded-full border border-[#241a12] bg-[#241a12] px-3 py-1.5 text-xs font-medium text-[#FDFBF7] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#241a12]",
  fieldLabelClass: "text-[11px] font-medium uppercase tracking-[0.18em] text-[#8a6f57]",
  fieldClass:
    "w-full rounded-2xl border border-[#2b2018]/15 bg-white px-4 py-3 text-[#241a12] placeholder:text-[#b3a08d] outline-none focus-visible:ring-2 focus-visible:ring-[#241a12]/50",
  toggleClass:
    "rounded-full px-4 py-1.5 text-xs font-medium text-[#8a6f57] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#241a12]",
  toggleActiveClass:
    "rounded-full bg-[#241a12] px-4 py-1.5 text-xs font-semibold text-[#FDFBF7] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#241a12]"
};
```

Component skeleton (binding structure; Task 3 fills the chip/find/filter logic where marked):

```tsx
export function ViewerV13() {
  const [themeId, setThemeId] = useState<"glass" | "editorial">("glass");
  const theme = themeId === "glass" ? GLASS : EDITORIAL;
  const visualSeats = useMemo(() => seatsToVisualSeats(FIXTURE_SEATS), []);
  // Task 3 adds: zone/status filter state + find query + filtering memo.

  return (
    <div
      className={`${geist.variable} ${fraunces.variable} relative min-h-[100dvh] ${theme.pageClass}`}
      style={{ fontFamily: theme.bodyFontVar }}
    >
      {theme.backdrop}
      <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-12 md:px-10 md:py-16">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className={theme.eyebrowClass}>Viewer v13 — runoff prototype</p>
            <h1 className={`mt-4 ${theme.headingClass}`} style={{ fontFamily: theme.displayFontVar }}>
              Find anyone&apos;s seat in seconds.
            </h1>
          </div>
          <div className="flex items-center gap-1 rounded-full border border-current/10 p-1" role="group" aria-label="Archetype">
            {([GLASS, EDITORIAL] as const).map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={themeId === t.id}
                onClick={() => setThemeId(t.id)}
                className={themeId === t.id ? theme.toggleActiveClass : theme.toggleClass}
                style={{ transition: `transform 500ms ${EASE}` }}
              >
                {t.name}
              </button>
            ))}
          </div>
        </header>

        {/* Task 3 inserts: chips row + find field here */}

        <div className={theme.shellClass}>
          <div className={theme.coreClass}>
            <div className="relative w-full" style={{ aspectRatio: `${MAP_IMAGE_WIDTH} / ${MAP_IMAGE_HEIGHT}` }}>
              <Image
                src={MAP_IMAGE_SRC}
                alt="Office floor plan"
                fill
                unoptimized
                sizes="(max-width: 768px) 100vw, 1280px"
                placeholder="blur"
                blurDataURL={MAP_IMAGE_BLUR_DATA_URL}
                className="object-contain"
                draggable={false}
              />
              {visualSeats.map((seat) => (
                <button
                  key={seat.seat_key}
                  type="button"
                  aria-label={seat.full_name ? `${seat.label} — ${seat.full_name}` : `${seat.label} — open seat`}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 ${seat.full_name ? theme.markerAssignedClass : theme.markerAvailableClass}`}
                  style={{ ...pointToStyle(seat), transition: `transform 400ms ${EASE}` }}
                >
                  {seat.full_name ? shortName(seat.full_name) : seat.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function shortName(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0][0]}. ${parts[parts.length - 1]}` : fullName;
}
```

Check `pointToStyle`'s exact signature/return in `lib/seatMath.ts` before wiring (`{ left, top }` percentage style is expected; adapt the spread if the API differs — mirror how `MapRedesignPreview.tsx` positions markers).

- [ ] **Step 2: Gates**

Run: `npm run typecheck && npx eslint app/concepts/viewer-v13/ViewerV13.tsx && node --test tests/concept-gate-source.test.mjs`
Expected: clean / 0 errors / 7 pass.

- [ ] **Step 3: Commit**

```bash
git add app/concepts/viewer-v13/ViewerV13.tsx
git commit -m "feat(concepts): viewer-v13 theme system, toggle, real-coordinate map stage"
```

---

### Task 3: Chips, find field, filtering, hover physics, entry choreography

**Files:**
- Modify: `app/concepts/viewer-v13/ViewerV13.tsx`

**Interfaces:**
- Consumes: `RunoffTheme` fields declared in Task 2 (`chipClass`, `chipActiveClass`, `fieldLabelClass`, `fieldClass`), `FIXTURE_ZONES`, the `visualSeats` memo.
- Produces: the finished interactive page.

- [ ] **Step 1: Filtering state + logic**

Binding behavior (implement inside `ViewerV13`, plain `useState`/`useMemo` — no context, no reducer):

- `zoneFilter: string | null` (null = all). Chips: one per `FIXTURE_ZONES` entry plus a leading "All zones" chip. Click toggles; active chip uses `chipActiveClass`, `aria-pressed={true}`.
- `openOnly: boolean` — one "Open seats" chip using the same classes.
- `query: string` — labeled find field ("Find a person or seat"), matches case-insensitive against `full_name` and `label`.
- A seat is **matched** when it passes ALL active filters (zone, openOnly means `full_name === null`, query). Non-matched markers get `theme.markerDimmedClass` appended (opacity only — they stay rendered and focusable-skipped via `tabIndex={-1}`); matched markers keep full opacity.
- A live status line under the field: `<p aria-live="polite">{matchedCount} of 60 seats</p>` styled with `theme.bodyClass` (text sized down with `text-sm`).

- [ ] **Step 2: Motion**

- Reuse the sampler's `useReveal` + `Reveal` verbatim (transform/opacity only, reduced-motion → static) for header, chips row, and map card entry (staggered 0/100/200ms).
- Marker hover physics: `hover:scale-110` via Tailwind on the marker buttons (transform transition already declared in Task 2). Chip press: `active:scale-[0.98]`.
- Theme toggle must NOT animate colors of the whole page (no 500ms page-wide transition — instant re-theme is correct; only the toggle buttons themselves transition).

- [ ] **Step 3: Gates**

Run: `npm run typecheck && npx eslint app/concepts/viewer-v13/ViewerV13.tsx && node --test tests/concept-gate-source.test.mjs && npm test`
Expected: clean / 0 errors / 7 pass / full suite green (baseline 1091 + 1 new gate-test entry).

- [ ] **Step 4: Commit**

```bash
git add app/concepts/viewer-v13/ViewerV13.tsx
git commit -m "feat(concepts): viewer-v13 filters, find, motion — runoff complete"
```

---

### Task 4: Controller QA, docs, build proof, PR

**Files:**
- Modify: `CLAUDE.md` (concepts enumeration: add `viewer-v13`)
- Verify only: build gate + full suite

- [ ] **Step 1 (CONTROLLER, not implementer): live browser QA**

Drive `/concepts/viewer-v13` via run-seat-planner driver: both themes screenshotted full-page; toggle flips instantly; chips filter (dimmed markers at 25% opacity); find field narrows; markers land on chairs (compare against `/concepts/map-redesign` if in doubt); keyboard Tab reaches toggle → chips → field → matched markers with visible rings; reduced-motion sanity (optional: CDP emulation). Fix loop through the implementer for anything visual.

- [ ] **Step 2: CLAUDE.md enumeration**

`component-state-board`, `map-redesign`, `login-v12`, and `design-sampler` → append `viewer-v13` to the same sentence. Nothing else.

- [ ] **Step 3: Build + suite**

Run: `npm run build` (flag unset — route table must show `/concepts/viewer-v13` gated identically to siblings) then `npm test && npm run typecheck && npm run lint`.

- [ ] **Step 4: Commit, push, PR**

```bash
git add CLAUDE.md
git commit -m "docs: add viewer-v13 to the concepts list"
git push -u origin HEAD
gh pr create --title "feat(concepts): viewer-v13 runoff — Glass (brand orange) vs Editorial on the real map" --body "$(cat <<'EOF'
## Summary
- Phase 1 (as amended by the sampler ruling) of docs/superpowers/specs/2026-08-12-highend-visual-redesign-concepts-design.md
- New gated prototype /concepts/viewer-v13: the real viewer hero (60-seat published fixture through the production coordinate pipeline) rendered in BOTH finalist archetypes with a live toggle — Ethereal Glass re-cut on brand orange #FF5715, and Editorial Luxury
- Zone/open-seat chips + name/seat find with live dimming; entry choreography; reduced-motion safe

## Review ask
Drive it (npm run dev → /concepts/viewer-v13), flip the toggle, filter, and pick the runoff winner — that ruling sets the language for the admin and login prototypes (Phases 2–3).

## Prod impact
None. Page 404s in production; no shipped surface, token, or flow touched.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Branch note: this work depends on the fonts + gate test from PR #381's branch. If #381 is merged when execution starts, branch `claude/viewer-v13-runoff` off fresh `main`; if not, branch off `claude/highend-visual-concepts` and open the PR with that base, retargeting to `main` after #381 lands.

---

## Self-Review

1. **Spec coverage:** amended Phase 1 (runoff, toggle, orange glass re-cut) → Tasks 2–3; spec §2 constraints → Global Constraints (gate, fixture-only, raster via MAP_IMAGE_SRC, reduced-motion, a11y); §5 testing → gate test auto-discovery + full suite; §6 process → Task 4 PR. Editorial orange re-cut explicitly NOT requested — pinned in Global Constraints.
2. **Placeholders:** none — Task 3's behavior is specified to the state-variable level; Task 2 carries complete theme objects and skeleton.
3. **Type consistency:** `RunoffTheme` fields declared in Task 2 match every Task 3 usage (`chipClass`, `chipActiveClass`, `fieldLabelClass`, `fieldClass`); `useReveal`/`Reveal`/`EASE` names match the sampler source being copied; fixture exports match the copied file's real exports (verified against `fixtureSeats.ts` header).
4. **Pinned lessons carried:** `unoptimized` on the map Image; spans-on-wrapper rule; transform/opacity-only; controller-owned browser QA.
