import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { importTsModule } from "./helpers/tsModuleLoader.mjs";

const theme = await importTsModule("lib/theme.ts");
const {
  THEME_STORAGE_KEY,
  THEME_DARK,
  THEME_LIGHT,
  CARBON_THEME_ATTR,
  CARBON_THEME_LIGHT,
  CARBON_THEME_DARK,
  carbonThemeFor,
  applyThemeAttributes,
  THEME_BOOT_SCRIPT
} = theme;

// The theme switch spans two runtimes that can never see each other's code at
// runtime: app/layout.tsx's inline boot script (pre-paint replay) and the
// in-page control (ThemeToggle today, the Account panel's radio from
// redesign-v2 PR 2). Both must build from lib/theme.ts — a raw literal in
// either file is the drift bug this module exists to prevent (renamed key =
// theme reverts on every reload with no error anywhere).
//
// Three states (owner ruling 2026-09-03): stored light / stored dark / nothing
// stored = system. The boot script never seeds the OS preference into an
// explicit attribute — the design system's prefers-color-scheme guard renders
// system-dark on its own, and a seeded attribute would show "Dark" selected
// for a system user and stop following the OS mid-session.

test("theme contract: stored key and values", () => {
  assert.equal(THEME_STORAGE_KEY, "sp-theme");
  assert.equal(THEME_DARK, "dark");
  assert.equal(THEME_LIGHT, "light");
  assert.notEqual(THEME_DARK, THEME_LIGHT);
  assert.equal(CARBON_THEME_ATTR, "data-carbon-theme");
});

test("the Carbon attribute is derived from data-theme by one function", () => {
  assert.equal(carbonThemeFor(THEME_DARK), CARBON_THEME_DARK);
  assert.equal(carbonThemeFor(THEME_LIGHT), CARBON_THEME_LIGHT);
  assert.equal(carbonThemeFor(null), null);
  assert.equal(carbonThemeFor(undefined), null);
  assert.equal(carbonThemeFor("system"), null);
  assert.equal(CARBON_THEME_LIGHT, "white");
  assert.equal(CARBON_THEME_DARK, "g100");
});

function fakeRoot() {
  const attrs = new Map();
  return {
    attrs,
    setAttribute: (k, v) => attrs.set(k, v),
    removeAttribute: k => attrs.delete(k),
    getAttribute: k => attrs.get(k) ?? null
  };
}

test("applyThemeAttributes sets both attributes together and clears both for system", () => {
  const root = fakeRoot();
  applyThemeAttributes(root, THEME_DARK);
  assert.equal(root.getAttribute("data-theme"), THEME_DARK);
  assert.equal(root.getAttribute(CARBON_THEME_ATTR), CARBON_THEME_DARK);
  applyThemeAttributes(root, THEME_LIGHT);
  assert.equal(root.getAttribute("data-theme"), THEME_LIGHT);
  assert.equal(root.getAttribute(CARBON_THEME_ATTR), CARBON_THEME_LIGHT);
  applyThemeAttributes(root, null);
  assert.equal(root.getAttribute("data-theme"), null);
  assert.equal(root.getAttribute(CARBON_THEME_ATTR), null);
});

test("the layout and the toggle build from lib/theme, never raw literals", async () => {
  const layoutSource = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  assert.match(layoutSource, /import \{ THEME_BOOT_SCRIPT \} from "@\/lib\/theme"/);
  assert.match(layoutSource, /__html: THEME_BOOT_SCRIPT/);
  assert.doesNotMatch(layoutSource, /(['"`])(?:sp-theme|dark|light|g100|white)\1/);
  assert.doesNotMatch(layoutSource, /prefers-color-scheme|matchMedia/);

  // The in-page control is the Account panel's Theme radio (redesign-v2 PR 2).
  const toggleSource = await readFile(new URL("../components/ui/ShellPanels.tsx", import.meta.url), "utf8");
  assert.match(toggleSource, /from "@\/lib\/theme"/);
  assert.match(toggleSource, /\bapplyTheme\(/);
  // The toggle may READ the attribute for its label; it never writes it or
  // storage directly (applyTheme owns both).
  assert.doesNotMatch(toggleSource, /localStorage|dataset\.theme\s*=(?!=)|setAttribute|removeAttribute/);
  assert.doesNotMatch(toggleSource, /(['"`])(?:sp-theme|dark|light|g100|white)\1/);
});

// Run the boot script against a fake document + storage and compare its
// result with the derivation function: the string and the function are two
// expressions of one rule.
function runBoot(stored) {
  const root = fakeRoot();
  const localStorage = { getItem: key => (key === THEME_STORAGE_KEY ? stored : null) };
  const document = { documentElement: root };
  new Function("localStorage", "document", THEME_BOOT_SCRIPT)(localStorage, document);
  return { theme: root.getAttribute("data-theme"), carbon: root.getAttribute(CARBON_THEME_ATTR) };
}

test("boot script replays the stored choice and derives the Carbon attribute; nothing stored = system", () => {
  assert.doesNotMatch(THEME_BOOT_SCRIPT, /matchMedia|prefers-color-scheme/, "the boot must not seed the OS preference");
  for (const stored of [THEME_DARK, THEME_LIGHT, null, "", "garbage"]) {
    const expectedTheme = stored === THEME_DARK || stored === THEME_LIGHT ? stored : null;
    const result = runBoot(stored);
    assert.equal(result.theme, expectedTheme, `stored=${JSON.stringify(stored)}`);
    assert.equal(result.carbon, carbonThemeFor(expectedTheme), `stored=${JSON.stringify(stored)}`);
  }
});

test("the design system renders all three theme states", async () => {
  const carbon = (await readFile(new URL("../app/styles/carbon-tokens.css", import.meta.url), "utf8")).replace(/\/\*[\s\S]*?\*\//g, "");
  // Light on the bare root; dark under the OS guard (only when no light
  // attribute is forced); dark again under the forced attribute.
  assert.match(carbon, /:root\s*\{[^}]*--cds-background\s*:/);
  assert.match(carbon, /@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-carbon-theme="white"\]\)/);
  assert.match(carbon, /:root\[data-carbon-theme="g100"\]\s*\{/);
  // App rules keyed on the theme take the same shape (styles/phase4-bridge.css
  // carries the raster lightbox until PR 3).
  const bridge = (await readFile(new URL("../app/styles/phase4-bridge.css", import.meta.url), "utf8")).replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(bridge, /@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-theme="light"\]\) \.map-raster/);
  assert.match(bridge, /:root\[data-theme="dark"\] \.map-raster\s*\{/);
});

test("dark-mode seams: raster parity and toggle mounts", async () => {
  const seatMap = await readFile(new URL("../components/seat-map/SeatMap.tsx", import.meta.url), "utf8");
  const viewerFinder = await readFile(new URL("../components/seat-map/ViewerSeatFinder.tsx", import.meta.url), "utf8");
  const appShell = await readFile(new URL("../components/ui/AppShell.tsx", import.meta.url), "utf8");
  const reception = await readFile(new URL("../components/reception/ReceptionScreen.tsx", import.meta.url), "utf8");

  // The floor-plan raster class must stay on BOTH map surfaces (two-surface
  // parity trap) — the dark invert filter keys on it.
  assert.match(seatMap, /"map-raster /);
  assert.match(viewerFinder, /"map-raster /);

  // One canonical control: the Account panel's Theme radio, mounted once by
  // the shell (ShellPanels). The viewer's own ThemeToggle retires with its
  // header in the route-group move.
  assert.match(appShell, /<ShellPanels/);
  assert.match(viewerFinder, /<ThemeToggle/);
  assert.doesNotMatch(reception, /ThemeToggle/);
});
