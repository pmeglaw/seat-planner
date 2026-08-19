import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";

const { THEME_STORAGE_KEY, THEME_DARK, THEME_LIGHT } = await importTsModule("lib/theme.ts");

// The theme switch spans two runtimes that can never see each other's code at
// runtime: app/layout.tsx's inline boot script (pre-paint replay) and
// ThemeToggle (in-page flip). Both must build from lib/theme.ts — a raw
// literal in either file is the drift bug this module exists to prevent
// (renamed key = theme reverts on every reload with no error anywhere).

test("theme contract: stored key and values", () => {
  assert.equal(THEME_STORAGE_KEY, "sp-theme");
  assert.equal(THEME_DARK, "dark");
  assert.equal(THEME_LIGHT, "light");
  assert.notEqual(THEME_DARK, THEME_LIGHT);
});

test("the boot script and the toggle both build from lib/theme, never raw literals", async () => {
  const layoutSource = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const toggleSource = await readFile(new URL("../components/ui/ThemeToggle.tsx", import.meta.url), "utf8");

  // Boot script interpolates the shared constants at build time.
  assert.match(layoutSource, /from "@\/lib\/theme"/);
  assert.match(layoutSource, /\$\{THEME_STORAGE_KEY\}/);
  assert.match(layoutSource, /\$\{THEME_DARK\}/);
  // No raw copies of ANY shared value — a quoted "dark" that drifts past a
  // lib/theme.ts change is exactly the bug this file exists to prevent.
  // (Scans raw source, comments included: keep prose free of quoted values.)
  assert.doesNotMatch(layoutSource, /(['"`])(?:sp-theme|dark|light)\1/);

  // The toggle imports and uses the same constants; no private copies.
  assert.match(toggleSource, /from "@\/lib\/theme"/);
  assert.match(toggleSource, /\bTHEME_STORAGE_KEY\b/);
  assert.match(toggleSource, /\bTHEME_DARK\b/);
  assert.match(toggleSource, /\bTHEME_LIGHT\b/);
  assert.doesNotMatch(toggleSource, /(['"`])(?:sp-theme|dark|light)\1/);
});

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

test("globals.css keys the dark theme off the shared data-theme attribute", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  // Mechanism only — values are free to evolve (repo test philosophy).
  assert.match(css, /:root\[data-theme="dark"\]\s*\{[^}]*color-scheme:\s*dark/);
  assert.match(css, /:root\[data-theme="dark"\]\s+\.admin-theme/);
});

test("dark-mode seams: raster parity and toggle mounts", async () => {
  const seatMap = await readFile(new URL("../components/seat-map/SeatMap.tsx", import.meta.url), "utf8");
  const viewerFinder = await readFile(new URL("../components/seat-map/ViewerSeatFinder.tsx", import.meta.url), "utf8");
  const topBar = await readFile(new URL("../components/ui/AppTopBar.tsx", import.meta.url), "utf8");
  const reception = await readFile(new URL("../components/reception/ReceptionScreen.tsx", import.meta.url), "utf8");

  // The floor-plan raster class must stay on BOTH map surfaces (two-surface
  // parity trap) — the dark invert filter keys on it. SeatMap builds its
  // className from a joined array (`"map-raster ...`) while ViewerSeatFinder
  // uses a plain string attribute (`className="map-raster ...`) — anchor on
  // the quote-prefixed class token so both forms match.
  assert.match(seatMap, /"map-raster /);
  assert.match(viewerFinder, /"map-raster /);

  // One canonical toggle per bar: the shared chrome mounts it; reception must
  // NOT mount a second one (same accessible name, mount-time state desync).
  assert.match(topBar, /<ThemeToggle/);
  assert.match(viewerFinder, /<ThemeToggle/);
  assert.doesNotMatch(reception, /ThemeToggle/);
});
