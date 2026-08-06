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
  const toggleSource = await readFile(new URL("../components/reception/ThemeToggle.tsx", import.meta.url), "utf8");

  // Boot script interpolates the shared constants at build time.
  assert.match(layoutSource, /from "@\/lib\/theme"/);
  assert.match(layoutSource, /\$\{THEME_STORAGE_KEY\}/);
  assert.match(layoutSource, /\$\{THEME_DARK\}/);
  assert.doesNotMatch(layoutSource, /['"]sp-theme['"]/);

  // The toggle imports the same constants; no private copies.
  assert.match(toggleSource, /from "@\/lib\/theme"/);
  assert.doesNotMatch(toggleSource, /['"]sp-theme['"]/);
});
