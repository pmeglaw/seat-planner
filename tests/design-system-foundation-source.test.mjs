import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readSource(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("design system foundation exposes approved semantic token names", async () => {
  const globalsSource = await readSource("../app/globals.css");
  const tailwindSource = await readSource("../tailwind.config.ts");

  for (const token of [
    "--sp-color-brand-accent",
    "--sp-color-action-primary",
    "--sp-color-action-primary-hover",
    "--sp-color-text-primary",
    "--sp-color-text-secondary",
    "--sp-color-text-muted",
    "--sp-color-canvas",
    "--sp-color-workspace",
    "--sp-color-surface",
    "--sp-color-surface-raised",
    "--sp-color-border-subtle",
    "--sp-color-border-strong",
    "--sp-color-state-selected",
    "--sp-color-state-published",
    "--sp-color-state-draft",
    "--sp-color-state-success",
    "--sp-color-state-warning",
    "--sp-color-state-danger",
    "--sp-color-state-info",
    "--sp-color-state-search",
    "--sp-color-state-disabled",
    "--sp-space-1",
    "--sp-space-2",
    "--sp-space-3",
    "--sp-space-4",
    "--sp-space-5",
    "--sp-space-6",
    "--sp-space-7",
    "--sp-radius-sm",
    "--sp-radius-md",
    "--sp-radius-lg",
    "--sp-radius-xl",
    "--sp-radius-full",
    "--sp-shadow-raised",
    "--sp-shadow-floating",
    "--sp-shadow-sheet",
    "--sp-shadow-modal",
    "--sp-duration-fast",
    "--sp-duration-standard",
    "--sp-duration-deliberate",
    "--sp-focus-ring-color",
    "--sp-focus-ring-width",
    "--sp-focus-ring-offset",
    "--sp-focus-ring-offset-color"
  ]) {
    assert.match(globalsSource, new RegExp(token));
  }

  assert.match(globalsSource, /--sp-focus-ring-offset-color: var\(--sp-color-surface-raised\)/);
  assert.match(globalsSource, /--sp-color-brand-accent: #F97316/);
  assert.match(globalsSource, /--sp-color-action-primary: #B2430F/);
  assert.match(tailwindSource, /brand:\s*\{\s*DEFAULT: "#f97316",\s*dark: "#c2410c"/);
  assert.match(tailwindSource, /sp:\s*\{/);
  assert.match(tailwindSource, /"action-primary": "rgb\(var\(--sp-color-action-primary-rgb\) \/ <alpha-value>\)"/);
  assert.match(tailwindSource, /"sp-raised": "var\(--sp-shadow-raised\)"/);
});

test("design system primitives lock button icon badge and focus contracts", async () => {
  const primitiveSource = await readSource("../components/ui/design-system.tsx");

  for (const variant of ["primary", "secondary", "quiet", "destructive"]) {
    assert.match(primitiveSource, new RegExp(variant));
  }
  assert.match(primitiveSource, /loading\?: boolean/);
  assert.match(primitiveSource, /disabled \|\| loading/);
  assert.match(primitiveSource, /aria-busy=\{loading \? "true" : undefined\}/);
  assert.match(primitiveSource, /const buttonDisabledVariants: Record<ButtonVariant, string>/);
  assert.match(primitiveSource, /buttonDisabledVariants\[variant\]/);
  assert.match(primitiveSource, /quiet: "disabled:border-transparent disabled:bg-transparent disabled:text-\[var\(--sp-color-stone-muted\)\]"/);
  assert.match(primitiveSource, /destructive:\s*"disabled:border-\[var\(--sp-color-state-danger-border\)\] disabled:bg-\[var\(--sp-color-state-danger-border\)\] disabled:text-\[#7E2F24\]"/);
  assert.match(primitiveSource, /leftIcon\?: ReactNode/);
  assert.match(primitiveSource, /rightIcon\?: ReactNode/);
  assert.doesNotMatch(primitiveSource, /#F97316[^;\n]*text-white|text-white[^;\n]*#F97316/);

  assert.match(primitiveSource, /label: string/);
  assert.match(primitiveSource, /aria-label=\{label\}/);
  assert.match(primitiveSource, /icon: ReactNode/);

  for (const tone of [
    "neutral",
    "published",
    "draft",
    "success",
    "warning",
    "danger",
    "info",
    "readonly",
    "blocked",
    "pending"
  ]) {
    assert.match(primitiveSource, new RegExp(tone));
  }
  assert.match(primitiveSource, /children: ReactNode/);
  assert.match(primitiveSource, /icon\?: ReactNode/);

  assert.match(primitiveSource, /export const focusRingClass/);
  assert.match(primitiveSource, /--sp-focus-ring-color/);
  assert.match(primitiveSource, /--sp-focus-ring-offset-color/);
  assert.match(primitiveSource, /focus-visible:ring-4/);
  assert.match(primitiveSource, /focus-visible:ring-\[color:var\(--sp-focus-ring-color\)\]/);
  assert.match(primitiveSource, /focus-visible:ring-offset-2/);
  assert.match(primitiveSource, /focus-visible:ring-offset-\[color:var\(--sp-focus-ring-offset-color\)\]/);
  assert.doesNotMatch(primitiveSource, /ring-\[var\(--sp-focus-ring-width\)\]/);
  assert.doesNotMatch(primitiveSource, /ring-\[var\(--sp-focus-ring-color\)\]/);
  assert.doesNotMatch(primitiveSource, /ring-offset-white/);
});

test("design system foundation defines marker semantic vocabulary without production adoption", async () => {
  const primitiveSource = await readSource("../components/ui/design-system.tsx");
  const boardSource = await readSource("../app/concepts/component-state-board/ComponentStateBoard.tsx");
  const viewerSource = await readSource("../app/page.tsx");
  const adminSource = await readSource("../app/admin/page.tsx");
  const managementSource = await readSource("../app/admin/management/page.tsx");
  const seatMarkerSource = await readSource("../components/seat-map/SeatMarker.tsx");

  for (const markerState of [
    "available",
    "assigned",
    "selected",
    "searchResult",
    "keyboardFocus",
    "draftModified",
    "moveOrigin",
    "validDestination",
    "invalidDestination",
    "swapSource",
    "swapTarget",
    "protectedOriginal",
    "customSeat",
    "reserved",
    "unavailable",
    "plannerHighlight"
  ]) {
    assert.match(primitiveSource, new RegExp(markerState));
  }

  assert.match(boardSource, /markerStateClassRecipes/);
  assert.doesNotMatch(seatMarkerSource, /markerStateClassRecipes|components\/ui\/design-system/);
  for (const productionRouteSource of [viewerSource, adminSource, managementSource]) {
    assert.doesNotMatch(productionRouteSource, /components\/ui\/design-system|markerStateClassRecipes|StatusBadge|IconButton/);
  }
});

test("design system foundation keeps concept board isolated from mutations", async () => {
  const pageSource = await readSource("../app/concepts/component-state-board/page.tsx");
  const boardSource = await readSource("../app/concepts/component-state-board/ComponentStateBoard.tsx");
  const primitiveSource = await readSource("../components/ui/design-system.tsx");

  assert.match(pageSource, /SEAT_PLANNER_ENABLE_PROTOTYPES/);
  assert.match(pageSource, /notFound\(\)/);
  assert.match(boardSource, /components\/ui\/design-system/);

  for (const source of [pageSource, boardSource, primitiveSource]) {
    assert.doesNotMatch(source, /from ["']@\/app\/actions|from ["']@\/lib\/supabase|from ["']@\/lib\/permissions|publishSeatMapAction|createServerSupabaseClient|requireAdmin|createClient/);
    assert.doesNotMatch(source, /insert\(|update\(|delete\(|upsert\(|rpc\(/);
  }
});
