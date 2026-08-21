import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// PR-A guardrail (2026-08-21): the raw brand orange #FF5715 measures under the
// 3:1 non-text floor on layered light surfaces (2.88:1 on #F4F4F4, 2.59:1 on
// #E8E8E8) and only 3.17:1 behind white text — so it may not carry a focus
// ring, and no surface may pair it with white text. The tokens moved to
// #D23F0A (light, ≥3.63:1 on every light surface) / #FF8A5C (dark, ≥5.44:1 on
// every dark surface). These checks pin the *guardrail*, not the exact hue:
// any future focus color is fine as long as it is not the raw brand orange
// and the dark override still exists.

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const globalsCss = readFileSync(join(repoRoot, "app", "globals.css"), "utf8");

const FOCUS_TOKENS = ["--sp-focus", "--admin-focus", "--admin-marker-focus-ring"];
const RAW_BRAND = [/#ff5715/i, /255[,\s]+87[,\s]+21/];

test("no focus token carries the raw brand orange (fails 3:1 on layered surfaces)", () => {
  for (const token of FOCUS_TOKENS) {
    const declarations = globalsCss
      .split("\n")
      .filter(line => line.trim().startsWith(`${token}:`));
    assert.ok(declarations.length > 0, `${token} must be declared in globals.css`);
    for (const line of declarations) {
      for (const pattern of RAW_BRAND) {
        assert.ok(
          !pattern.test(line),
          `${token} must not be the raw brand orange (#FF5715 / 255 87 21) — it fails the 3:1 focus floor on #F4F4F4 and hovered rows. Found: ${line.trim()}`
        );
      }
    }
  }
});

test("focus tokens keep a dark override (the light ring drops below 3:1 on hovered dark layers)", () => {
  // The dark blocks re-declare these tokens; losing the override in a refactor
  // would silently ship the light ring onto dark grounds. Presence check only —
  // the value is free to evolve as long as the override exists.
  for (const token of ["--sp-focus", "--admin-focus"]) {
    const declarations = globalsCss
      .split("\n")
      .filter(line => line.trim().startsWith(`${token}:`));
    assert.ok(
      declarations.length >= 2,
      `${token} must be declared at least twice (base + dark override); found ${declarations.length}`
    );
  }
});

test("focus follows the surface: dark-chrome regions re-anchor both focus tokens", () => {
  // Some regions paint the dark chrome in BOTH app themes (top bar, rail,
  // viewer chrome strip, SeatMap fallback header, Ask Planner drawer). The
  // light focus value fails 3:1 on the chrome's hovered fills (#333333), so a
  // [data-chrome="dark"] marker scopes the dark focus value to those subtrees
  // regardless of theme. This pins the marker block and the region roots —
  // dropping either silently ships a sub-3:1 ring onto dark chrome in light
  // theme.
  const markerBlock = globalsCss.match(/\[data-chrome="dark"\]\s*\{[^}]*\}/);
  assert.ok(markerBlock, 'globals.css must scope focus tokens under [data-chrome="dark"]');
  for (const token of ["--sp-focus", "--admin-focus"]) {
    assert.ok(
      markerBlock[0].includes(`${token}:`),
      `the [data-chrome="dark"] block must re-declare ${token}`
    );
  }

  const markedRoots = [
    ["components", "ui", "AppTopBar.tsx"],
    ["components", "ui", "AppRail.tsx"],
    ["components", "seat-map", "SeatMap.tsx"],
    ["components", "seat-map", "ViewerSeatFinder.tsx"],
    ["components", "seat-map", "AskPlannerDrawer.tsx"]
  ];
  for (const parts of markedRoots) {
    const source = readFileSync(join(repoRoot, ...parts), "utf8");
    assert.ok(
      source.includes('data-chrome="dark"'),
      `${parts.join("/")} paints dark chrome in both themes and must mark its root with data-chrome="dark"`
    );
  }
});

function collectTsxFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      // Prototype-only concept surfaces are flag-gated and out of scope.
      if (entry === "concepts" || entry === "node_modules") continue;
      collectTsxFiles(path, out);
    } else if (entry.endsWith(".tsx")) {
      out.push(path);
    }
  }
  return out;
}

test("no shipped surface pairs white text with a raw brand-orange fill (3.17:1)", () => {
  // White text is legal only on the deepened CTA ladder (#D23F0A and darker);
  // raw #FF5715 fills must pair with ink (--admin-primary-ink, 5.71:1).
  // Line-scoped scan, matching how className strings are authored in this repo.
  const brandFill = /bg-\[(var\(--admin-primary\)|#ff5715|var\(--sp-brand\))\]|bg-sp-brand-accent/i;
  const offenders = [];
  const files = [
    ...collectTsxFiles(join(repoRoot, "app")),
    ...collectTsxFiles(join(repoRoot, "components"))
  ];
  for (const file of files) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, index) => {
      if (brandFill.test(line) && /\btext-white\b/.test(line)) {
        offenders.push(`${file}:${index + 1}`);
      }
    });
  }
  assert.deepEqual(
    offenders,
    [],
    `White text on a raw #FF5715 fill fails AA (3.17:1) — use bg-[var(--admin-primary-cta)] with white, or keep the raw brand fill and pair it with text-[var(--admin-primary-ink)]. Offending lines:\n${offenders.join("\n")}`
  );
});
