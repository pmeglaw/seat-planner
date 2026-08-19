# Dark Mode "Graphite studio" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** App-wide dark theme (direction 4a) riding the shipped `html[data-theme="dark"]` mechanism, OS-seeded, localStorage-persisted, toggleable from every top bar.

**Architecture:** Pure token override — two CSS blocks in `app/globals.css` keyed off `:root[data-theme="dark"]` redefine the `--sp-color-*` and `--admin-*` custom properties; components change only where the toggle mounts and where the floor-plan raster gains a filter class. The pre-paint boot script in `app/layout.tsx` grows a `prefers-color-scheme` fallback.

**Tech Stack:** Next.js App Router, Tailwind arbitrary-value classes over CSS custom properties, plain Node test runner (`tests/*.test.mjs`).

**Spec:** `docs/superpowers/specs/2026-08-19-dark-mode-design.md`

## Global Constraints

- **DO NOT PUSH.** Owner reviews the branch locally before any push (owner instruction 2026-08-19). Commit locally on branch `feat/dark-mode-graphite` only.
- Never hardcode `"sp-theme"` / `"dark"` / `"light"` as a full quoted string in `app/layout.tsx` or any ThemeToggle — `tests/theme.test.mjs` forbids it; interpolate from `lib/theme.ts`.
- Body text ≥ 4.5:1, graphics ≥ 3:1 on their real backgrounds; carry measured ratios in CSS comments beside the dark blocks (repo convention).
- Brand orange `#FF5715` hue never changes (standing owner ruling).
- Two map surfaces (`SeatMap.tsx` admin, `ViewerSeatFinder.tsx` viewer) must stay in parity for every map-facing change.
- No new `NEXT_PUBLIC_` env vars, no migrations, no asset changes (`MAP_IMAGE_SRC` `?v=` stays untouched).
- Local `npm run dev` writes to PRODUCTION Supabase — visual QA is read-only driving; never publish.

---

### Task 1: Boot script seeds from `prefers-color-scheme`

**Files:**
- Modify: `lib/theme.ts`
- Modify: `app/layout.tsx:44-45`
- Test: `tests/theme.test.mjs`

**Interfaces:**
- Produces: `THEME_MEDIA_QUERY = "(prefers-color-scheme: dark)"` exported from `lib/theme.ts`; boot behavior "stored value wins; empty storage falls back to OS".

- [ ] **Step 1: Write the failing test** — append to `tests/theme.test.mjs`:

```js
test("boot script seeds from the OS only when storage is empty", async () => {
  const layoutSource = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const theme = await importTsModule("lib/theme.ts");

  // The media query is part of the cross-runtime contract: the boot script
  // interpolates it from lib/theme.ts like the storage key and values.
  assert.equal(theme.THEME_MEDIA_QUERY, "(prefers-color-scheme: dark)");
  assert.match(layoutSource, /\$\{THEME_MEDIA_QUERY\}/);
  assert.doesNotMatch(layoutSource, /prefers-color-scheme/);

  // Replay the boot script in a stubbed DOM: stored choice wins over the OS;
  // only empty storage consults matchMedia.
  const bootMatch = layoutSource.match(/THEME_BOOT_SCRIPT =\s*`([^`]+)`/);
  assert.ok(bootMatch, "THEME_BOOT_SCRIPT template not found");
  const script = bootMatch[1]
    .replaceAll("${THEME_STORAGE_KEY}", theme.THEME_STORAGE_KEY)
    .replaceAll("${THEME_DARK}", theme.THEME_DARK)
    .replaceAll("${THEME_MEDIA_QUERY}", theme.THEME_MEDIA_QUERY);

  function run({ stored, osDark }) {
    const documentElement = { dataset: {} };
    const fn = new Function("localStorage", "matchMedia", "document", script);
    fn(
      { getItem: () => stored },
      query => ({ matches: query === theme.THEME_MEDIA_QUERY && osDark }),
      { documentElement }
    );
    return documentElement.dataset.theme;
  }

  assert.equal(run({ stored: theme.THEME_DARK, osDark: false }), theme.THEME_DARK);
  assert.equal(run({ stored: theme.THEME_LIGHT, osDark: true }), undefined);
  assert.equal(run({ stored: null, osDark: true }), theme.THEME_DARK);
  assert.equal(run({ stored: null, osDark: false }), undefined);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/theme.test.mjs`
Expected: FAIL — `THEME_MEDIA_QUERY` is undefined.

- [ ] **Step 3: Implement** — in `lib/theme.ts` add below `THEME_LIGHT`:

```ts
// The OS fallback consulted ONLY when localStorage holds no choice — a stored
// "light" is an explicit pick and beats a dark OS. Interpolated into the boot
// script like the key/values above, for the same drift reason.
export const THEME_MEDIA_QUERY = "(prefers-color-scheme: dark)";
```

In `app/layout.tsx`, extend the import and replace `THEME_BOOT_SCRIPT`:

```ts
import { THEME_DARK, THEME_MEDIA_QUERY, THEME_STORAGE_KEY } from "@/lib/theme";
```

```ts
const THEME_BOOT_SCRIPT =
  `try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='${THEME_DARK}'||(!t&&matchMedia('${THEME_MEDIA_QUERY}').matches))document.documentElement.dataset.theme='${THEME_DARK}'}catch(e){}`;
```

Update the comment above it: the stored choice replays first; empty storage seeds from the OS (owner decision 2026-08-19); `'light'` stored by the toggle is an explicit choice.

- [ ] **Step 4: Run tests**

Run: `node --test tests/theme.test.mjs`
Expected: PASS (all tests — the existing no-raw-literal scan must still pass).

- [ ] **Step 5: Commit**

```bash
git checkout -b feat/dark-mode-graphite
git add lib/theme.ts app/layout.tsx tests/theme.test.mjs
git commit -m "feat(theme): seed initial theme from prefers-color-scheme"
```

---

### Task 2: Core dark block — `:root[data-theme="dark"]`

**Files:**
- Modify: `app/globals.css` (insert a new block immediately after the light `:root { ... }` closes, before the Chrome-motion keyframes)
- Test: `tests/theme.test.mjs`

**Interfaces:**
- Produces: every `--sp-color-*` neutral/status token carries a dark value under `:root[data-theme="dark"]`; Task 3 nests its admin block inside the same convention.

- [ ] **Step 1: Write the failing test** — append to `tests/theme.test.mjs`:

```js
test("globals.css keys the dark theme off the shared data-theme attribute", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  // Mechanism only — values are free to evolve (repo test philosophy).
  assert.match(css, /:root\[data-theme="dark"\]\s*\{[^}]*color-scheme:\s*dark/);
  assert.match(css, /:root\[data-theme="dark"\]\s+\.admin-theme/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/theme.test.mjs`
Expected: FAIL — no dark block yet. (It stays red until Task 3 adds the admin selector; that is fine — commit Task 2 with the first assertion green by splitting: run only after Step 3 and expect the FIRST regex to pass, the second to fail. If you prefer green commits, add the second assertion in Task 3 instead.)

- [ ] **Step 3: Implement** — add to `app/globals.css` after the `:root` block (spec tables; measured ratios in comments):

```css
/* Dark theme — "Graphite studio" (direction 4a, owner-selected 2026-08-19,
   spec docs/superpowers/specs/2026-08-19-dark-mode-design.md). Keyed off the
   app-wide html[data-theme] switch that Reception/login already ride — set
   pre-paint by app/layout.tsx's boot script, flipped by ThemeToggle.
   Contrast, measured on #161616 unless noted: text #f4f4f4 = 16.45:1,
   #c6c6c6 = 9.9:1, #9a9a9a = 6.4:1; status text #42be65 = 7.3:1,
   #3ddbd9 ≈ 10:1, #ff8389 = 7.9:1 — all ≥ 4.5:1; raw hues #08bdba / #fa4d56
   ≥ 3:1 graphics floor. */
:root[data-theme="dark"] {
  color-scheme: dark;

  --sp-color-canvas: #161616;
  --sp-color-surface: #1f1f1f;
  --sp-color-surface-raised: #262626;
  --sp-color-border-subtle: rgba(255, 255, 255, 0.10);
  --sp-color-border-strong: rgba(255, 255, 255, 0.18);
  --sp-color-canvas-rgb: 22 22 22;
  --sp-color-surface-rgb: 31 31 31;
  --sp-color-surface-raised-rgb: 38 38 38;
  --sp-color-border-subtle-rgb: 255 255 255;
  --sp-color-border-strong-rgb: 255 255 255;

  --sp-color-text-primary: #f4f4f4;
  --sp-color-text-secondary: #c6c6c6;
  --sp-color-text-muted: #9a9a9a;
  --sp-color-text-disabled: #6f6f6f;
  --sp-color-text-primary-rgb: 244 244 244;
  --sp-color-text-secondary-rgb: 198 198 198;
  --sp-color-text-muted-rgb: 154 154 154;
  --sp-color-text-disabled-rgb: 111 111 111;

  --sp-color-graphite-soft: #262626;
  --sp-color-stone: #333333;
  --sp-color-stone-muted: #6f6f6f;
  --sp-color-state-disabled: #333333;
  --sp-color-graphite-soft-rgb: 38 38 38;
  --sp-color-stone-rgb: 51 51 51;
  --sp-color-stone-muted-rgb: 111 111 111;
  --sp-color-state-disabled-rgb: 51 51 51;

  /* Status families: bright text + alpha softs (spec table). on-soft = the
     bright text — the softs are washes of the same hue on near-black. */
  --sp-color-state-published: #42be65;
  --sp-color-state-published-surface: rgba(66, 190, 101, 0.14);
  --sp-color-state-published-border: rgba(66, 190, 101, 0.40);
  --sp-color-state-published-on-soft: #42be65;
  --sp-color-state-published-rgb: 66 190 101;
  --sp-color-state-success: #42be65;
  --sp-color-state-success-surface: rgba(66, 190, 101, 0.14);
  --sp-color-state-success-border: rgba(66, 190, 101, 0.40);
  --sp-color-state-success-on-soft: #42be65;
  --sp-color-state-success-rgb: 66 190 101;

  --sp-color-state-draft: #08bdba;
  --sp-color-state-draft-surface: rgba(8, 189, 186, 0.14);
  --sp-color-state-draft-border: rgba(8, 189, 186, 0.40);
  --sp-color-state-draft-on-soft: #3ddbd9;
  --sp-color-state-draft-rgb: 8 189 186;
  --sp-color-state-warning: #08bdba;
  --sp-color-state-warning-surface: rgba(8, 189, 186, 0.14);
  --sp-color-state-warning-border: rgba(8, 189, 186, 0.40);
  --sp-color-state-warning-on-soft: #3ddbd9;
  --sp-color-state-warning-rgb: 8 189 186;

  --sp-color-state-danger: #fa4d56;
  --sp-color-state-danger-surface: rgba(250, 77, 86, 0.14);
  --sp-color-state-danger-border: rgba(250, 77, 86, 0.40);
  --sp-color-state-danger-on-soft: #ff8389;
  --sp-color-state-danger-hover: #ff8389;
  --sp-color-state-danger-pressed: #fa4d56;
  --sp-color-state-danger-rgb: 250 77 86;

  --sp-color-state-info: #c6c6c6;
  --sp-color-state-info-surface: rgba(255, 255, 255, 0.08);
  --sp-color-state-info-border: rgba(255, 255, 255, 0.14);
  --sp-color-state-info-on-soft: #c6c6c6;
  --sp-color-state-info-rgb: 198 198 198;

  /* Search stays brand-orange on dark: text #FF8A5C = 6.1:1 on #161616. */
  --sp-color-state-search: #FF8A5C;
  --sp-color-state-search-surface: rgba(255, 87, 21, 0.14);
  --sp-color-state-search-border: #FF5715;
  --sp-color-state-search-rgb: 255 138 92;
  --sp-color-state-selected-surface: rgba(255, 87, 21, 0.14);
  --sp-color-state-selected-border: rgba(255, 87, 21, 0.45);

  /* Shadows: borders carry separation on dark; overlays deepen. */
  --sp-shadow-raised: 0 2px 6px rgba(0, 0, 0, 0.45);
  --sp-shadow-floating: 0 6px 16px rgba(0, 0, 0, 0.5);
  --sp-shadow-sheet: 0 -8px 24px rgba(0, 0, 0, 0.55);
  --sp-shadow-modal: 0 12px 40px rgba(0, 0, 0, 0.6);
  /* --sp-focus-ring-offset-color already aliases surface-raised — follows. */
}
```

- [ ] **Step 4: Run tests + eyeball**

Run: `node --test tests/theme.test.mjs` (first regex passes; admin regex still red if added here — see Step 2 note) and `npm test` for the guardrail tiers.
Then `npm run dev`, open `/login`, toggle OS dark or run `document.documentElement.dataset.theme='dark'` in devtools: login + viewer neutrals invert without broken text.

- [ ] **Step 5: Commit**

```bash
git add app/globals.css tests/theme.test.mjs
git commit -m "feat(theme): core dark token block (Graphite studio)"
```

---

### Task 3: Admin/shell dark block

**Files:**
- Modify: `app/globals.css` (new block directly after Task 2's)
- Test: `tests/theme.test.mjs` (the `.admin-theme` regex from Task 2 goes green)

**Interfaces:**
- Consumes: Task 2's dark `--sp-color-*` values (the `--admin-bg/surface/border/text-*` aliases follow automatically).
- Produces: dark `--admin-*` values for every admin/shell surface; Task 6 tunes `--admin-marker-live-*` inside this same block.

- [ ] **Step 1: Implement** — add:

```css
/* Admin + shell surfaces join the chrome on dark. The --admin-bg/surface/
   border/text aliases of --sp-color-* follow Task 2's block automatically —
   only the tokens with their own light literals are re-pointed here.
   Contrast on #161616 unless noted: #FF8A5C = 6.1:1, ink on #FF5715 = 5.71:1
   (unchanged), #42be65 = 7.3:1, #3ddbd9 ≈ 10:1, #ff8389 = 7.9:1. */
:root[data-theme="dark"] .admin-theme,
:root[data-theme="dark"] .shell-theme {
  /* Chrome: top bar one step deeper than the workspace. */
  --admin-chrome-bg: #0a0a0a;
  --admin-text-inverse: #161616;

  /* Brand orange: hue unchanged, pairings swapped for a dark ground. */
  --admin-primary-soft: rgba(255, 87, 21, 0.16);
  --admin-primary-border: rgba(255, 87, 21, 0.45);
  --admin-primary-on-soft: #FF8A5C;
  --admin-paper: rgba(255, 87, 21, 0.12);

  /* Raw status dots/bars. */
  --admin-status-ok: #42be65;
  --admin-status-warn: #08bdba;
  --admin-status-bad: #fa4d56;
  --admin-status-neutral: #8d8d8d;
  --admin-status-ok-rgb: 66 190 101;
  --admin-status-warn-rgb: 8 189 186;
  --admin-status-bad-rgb: 250 77 86;

  /* Status families → dark partners (bright text + alpha soft). */
  --admin-success: #42be65;
  --admin-success-rgb: 66 190 101;
  --admin-success-soft: rgba(66, 190, 101, 0.14);
  --admin-warning: #08bdba;
  --admin-warning-text: #3ddbd9;
  --admin-warning-text-rgb: 61 219 217;
  --admin-warning-soft: rgba(8, 189, 186, 0.14);
  --admin-error: #fa4d56;
  --admin-danger: #fa4d56;
  --admin-danger-soft: rgba(250, 77, 86, 0.14);
  --admin-danger-soft-hover: rgba(250, 77, 86, 0.22);
  --admin-info: #c6c6c6;
  --admin-info-rgb: 198 198 198;
  --admin-info-soft: rgba(255, 255, 255, 0.08);
  --admin-analytics: #c6c6c6;

  --admin-state-clean-bg: rgba(66, 190, 101, 0.14);
  --admin-state-clean-border: rgba(66, 190, 101, 0.40);
  --admin-state-clean-text: #42be65;
  --admin-state-dirty-border: rgba(8, 189, 186, 0.40);
  --admin-state-dirty-text: #3ddbd9;
  --admin-state-saving-border: rgba(255, 255, 255, 0.14);
  --admin-state-error-bg: rgba(250, 77, 86, 0.14);
  --admin-state-error-border: rgba(250, 77, 86, 0.40);
  --admin-state-error-text: #ff8389;
  --admin-state-danger-border: rgba(250, 77, 86, 0.40);
  --admin-state-danger-text: #ff8389;

  --admin-publish-viewer-impact-border: rgba(255, 255, 255, 0.14);

  --admin-diff-assigned-bg: rgba(66, 190, 101, 0.14);
  --admin-diff-assigned-border: rgba(66, 190, 101, 0.40);
  --admin-diff-assigned-text: #42be65;
  --admin-diff-vacated-bg: rgba(250, 77, 86, 0.14);
  --admin-diff-vacated-border: rgba(250, 77, 86, 0.40);
  --admin-diff-vacated-text: #ff8389;
  --admin-diff-reassigned-bg: rgba(8, 189, 186, 0.14);
  --admin-diff-reassigned-border: rgba(8, 189, 186, 0.40);
  --admin-diff-reassigned-text: #3ddbd9;

  /* Marker LEGEND chips (the live pills are Task 6). */
  --admin-marker-assigned-surface: #262626;
  --admin-marker-assigned-border: #42be65;
  --admin-marker-assigned-text: #f4f4f4;
  --admin-marker-assigned-accent: rgba(66, 190, 101, 0.85);
  --admin-marker-available-surface: #1f1f1f;
  --admin-marker-available-border: #4a4a4a;
  --admin-marker-available-text: #c6c6c6;
  --admin-marker-available-accent: rgba(154, 154, 154, 0.5);
  --admin-marker-reserved-surface: rgba(8, 189, 186, 0.16);
  --admin-marker-reserved-border: #08bdba;
  --admin-marker-reserved-text: #3ddbd9;
  --admin-marker-reserved-accent: rgba(8, 189, 186, 0.85);
  --admin-marker-unavailable-surface: #161616;
  --admin-marker-unavailable-border: #333333;
  --admin-marker-unavailable-text: #7a7a7a;
  --admin-marker-unavailable-accent: rgba(122, 122, 122, 0.6);
  --admin-marker-draft-surface: rgba(8, 189, 186, 0.10);
  --admin-marker-draft-border: #08bdba;
  --admin-marker-draft-text: #3ddbd9;
  --admin-marker-search-halo: rgba(255, 87, 21, 0.32);

  /* Elevation: deepened, overlays only (borders separate everywhere else). */
  --admin-elevation-2-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
  --admin-elevation-3-shadow: 0 6px 16px rgba(0, 0, 0, 0.5);
  --admin-elevation-4-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);
  --admin-elevation-5-shadow: 0 8px 24px rgba(0, 0, 0, 0.55);
}
```

Anything not listed inherits either its light value deliberately (dark-chrome
tokens like `--admin-chrome-*` already ARE the dark palette) or a Task 2 alias.

- [ ] **Step 2: Run tests**

Run: `node --test tests/theme.test.mjs` → the `.admin-theme` regex passes. `npm test` stays green.

- [ ] **Step 3: Eyeball**

`npm run dev` → sign in, force dark in devtools, walk `/admin` (read-only: select a seat, open publish review, CANCEL it), `/admin/management`, `/admin/settings`, `/reception`. No unreadable text, no light islands.

- [ ] **Step 4: Commit**

```bash
git add app/globals.css tests/theme.test.mjs
git commit -m "feat(theme): admin/shell dark token block"
```

---

### Task 4: Floor-plan raster invert filter

**Files:**
- Modify: `app/globals.css` (after the dark blocks)
- Modify: `components/seat-map/SeatMap.tsx:3238-3247` (the map `<Image>`)
- Modify: `components/seat-map/ViewerSeatFinder.tsx:1360-1372` (the map `<Image>`)

**Interfaces:**
- Produces: class `map-raster` on both floor-plan `<Image>` elements; the dark filter keys on it.

- [ ] **Step 1: Implement** — globals.css:

```css
/* Floor-plan raster on dark: CSS-only lightbox treatment (owner decision
   2026-08-19 — no dark asset, so no ?v= bump). Applies to the <img> only;
   washes and markers sit above it unfiltered. */
:root[data-theme="dark"] .map-raster {
  filter: invert(0.93) hue-rotate(180deg) saturate(0.45) contrast(0.95);
}
```

Both `<Image>` components: `className="block h-auto w-full select-none"` → `className="map-raster block h-auto w-full select-none"` (same edit in BOTH files — two-surface parity).

- [ ] **Step 2: Verify**

`npm run dev`, force dark: floor plan reads as a dark mat on `/` and `/admin`; markers/washes unfiltered; light theme unchanged. `npm test` green (`desktop-seat-marker-system-source` must not trip — no coordinate/calibration change).

- [ ] **Step 3: Commit**

```bash
git add app/globals.css components/seat-map/SeatMap.tsx components/seat-map/ViewerSeatFinder.tsx
git commit -m "feat(theme): dark-mode floor-plan invert filter"
```

---

### Task 5: Promote ThemeToggle into the shared chrome

**Files:**
- Create: `components/ui/ThemeToggle.tsx`
- Modify: `components/reception/ThemeToggle.tsx` (becomes a thin re-export or is deleted; reception mounts the shared one — see Step 1)
- Modify: `components/reception/ReceptionScreen.tsx:15,116`
- Modify: `components/ui/AppTopBar.tsx:149` (right cluster, before `AccountMenu`)
- Modify: `components/seat-map/ViewerSeatFinder.tsx:1300` (viewer bar, before `AccountMenu`)
- Test: `tests/theme.test.mjs` (path + import assertions)

**Interfaces:**
- Consumes: `THEME_DARK`, `THEME_LIGHT`, `THEME_STORAGE_KEY` from `lib/theme.ts`.
- Produces: `export function ThemeToggle({ className }: { className?: string })` in `components/ui/ThemeToggle.tsx` — behavior identical to the reception original (flip `html[data-theme]`, persist, `aria-pressed`, sun/moon + label).

- [ ] **Step 1: Move the component** — `git mv components/reception/ThemeToggle.tsx components/ui/ThemeToggle.tsx`. Change only the styling seam: replace the `--r-*`-bound className with a `className` prop merged over a chrome-token base:

```tsx
export function ThemeToggle({ className }: { className?: string }) {
  // ...state + toggle() exactly as before...
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={dark}
      className={
        className ??
        "flex h-7 items-center gap-1.5 rounded-[10px] border border-white/15 bg-transparent px-2.5 text-[11.5px] font-medium text-[var(--admin-chrome-text-soft)] transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-focus)]"
      }
    >
      {/* sun/moon SVGs + label exactly as the original */}
    </button>
  );
}
```

Reception passes its old `--r-*` string via `className` so its look is pixel-unchanged:

```tsx
import { ThemeToggle } from "@/components/ui/ThemeToggle";
// at the old call site:
<ThemeToggle className="flex h-7 items-center gap-1.5 border border-[var(--r-card-border)] bg-[var(--r-card)] px-2.5 text-[11.5px] font-medium text-[var(--r-secondary)] transition-colors hover:bg-[var(--r-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--r-accent)]" />
```

- [ ] **Step 2: Update the contract test** — in `tests/theme.test.mjs` point the toggle read at the new path:

```js
const toggleSource = await readFile(new URL("../components/ui/ThemeToggle.tsx", import.meta.url), "utf8");
```

Run: `node --test tests/theme.test.mjs` → PASS.

- [ ] **Step 3: Mount in both bars** — `AppTopBar.tsx` right cluster, immediately before `<AccountMenu …/>`: `<ThemeToggle />`. `ViewerSeatFinder.tsx` viewer bar, immediately before its `<AccountMenu …/>`: `<ThemeToggle />`. (Both bars are `#161616`/`#0a0a0a` chrome in both themes, so the default chrome styling works unchanged.)

- [ ] **Step 4: Verify**

`npm test` green (watch `app-shell` / `accessibility-source` / `auth-session-source`). `npm run dev`: toggle flips the whole app from the viewer bar and each shell bar; choice survives reload (boot replay); reception's toggle looks as before.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(theme): shared ThemeToggle in viewer + shell top bars"
```

---

### Task 6: Dark marker-live tuning vs mockup

**Files:**
- Modify: `app/globals.css` (inside Task 3's dark admin/shell block)

**Interfaces:**
- Consumes: Task 2's dark state tokens (the `--admin-marker-live-*` color-mix derivations already re-hue from them).

- [ ] **Step 1: Probe the derived pills** — `npm run dev`, force dark, drive `/` with the run-seat-planner driver; screenshot pills and probe computed colors:

```
eval getComputedStyle(document.querySelector('[class*="marker-live-reserved"]')).borderColor
```

Compare against the spec's dark marker table (available `#1f1f1f`/`#4a4a4a`/`#c6c6c6`, assigned `#262626`/`#42be65`/`#f4f4f4`, reserved `rgba(8,189,186,.16)`/`#08bdba`/`#3ddbd9`, unavailable `#161616`/`#333333`/`#7a7a7a`, selected `#FF5715` fill + ink, search orange family).

- [ ] **Step 2: Override only the misses** — add to the dark admin/shell block just the `--admin-marker-live-*` names whose derived value visibly misses the table, e.g. (expected candidates — verify before adding each):

```css
  --admin-marker-live-ink: #f4f4f4;
  --admin-marker-live-unavailable-surface: #161616;
  --admin-marker-live-unavailable-text: #7a7a7a;
  --admin-marker-live-neutral-surface: #262626;
  --admin-marker-live-neutral-text: #c6c6c6;
  --admin-marker-live-selected-surface: #FF5715;
```

Do NOT restructure the light derivations; dark overrides sit only in the dark block.

- [ ] **Step 3: Verify + judge**

Screenshot viewer + admin maps in dark; compare to `Seat Map Mockup.dc.html` direction 4a. `npm test` green.

- [ ] **Step 4: Commit**

```bash
git add app/globals.css
git commit -m "feat(theme): tune dark marker pills to the 4a mockup"
```

---

### Task 7: Full verification pass (NO PUSH)

**Files:** none new.

- [ ] **Step 1: Full local tiers**

Run: `npm test` → 0 fail. `npx tsc --noEmit` → clean. `npm run test:ct` if component tests exist for touched components.

- [ ] **Step 2: Visual QA both themes**

`npm run dev`; drive `/login`, `/`, `/admin` (read-only), `/admin/management`, `/admin/settings`, `/reception` in light AND dark; toggle round-trip on each bar; reload persistence; no boot flash (throttle CPU in devtools and reload). Fresh-profile check: OS-dark browser with empty localStorage lands dark.

- [ ] **Step 3: Contrast spot-audit**

Probe computed text/bg pairs on dark for: status band, inspector pills, publish diff tags, danger buttons, muted text. All body text ≥ 4.5:1.

- [ ] **Step 4: Stop — hand to owner**

Leave the branch LOCAL (`feat/dark-mode-graphite`, all commits unpushed). Report what was verified and how to review (`npm run dev`, toggle in any top bar). Do not push, do not open a PR.

---

## Self-review notes

- Spec coverage: mechanism→T1, core tokens→T2, admin/status/legend/elevation→T3, raster→T4, toggle→T5, markers→T6, testing/acceptance→T7. Profile persistence, concepts, dark asset: out of scope per spec.
- Reception keeps its in-page toggle (restyled shared component) AND gains the bar toggle via AppTopBar — if the owner prefers one, dropping the in-page instance is a two-line change flagged for local review.
- `--sp-color-state-selected` (copper text role) intentionally not overridden in T2 — selected markers get their dark treatment via T6; revisit if publish-review selected chips look dim in T7.
