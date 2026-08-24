#!/usr/bin/env node
// PR-C marker-vocabulary contrast + pairwise-distinguishability check.
//
// Two things, both measured from the REAL globals.css (tokens resolved
// through the shell cascade, color-mix included) so a token edit can't
// silently break the vocabulary:
//
// 1. WCAG floors on every mark, measured against the surface it lands on
//    WHEN HOVERED (group-hover applies brightness(1.05) and light fills
//    lighten — the hovered surface is the worst case, per the PASS1 §8 /
//    IBM status-indicator rule). 3:1 for graphical marks (dot, hatch
//    strokes, hover edge), 4.5:1 for text and badge glyph ink.
//
// 2. The PAIRWISE frame (NOTES.md "PR-C severity frame"): every pair of the
//    nine marker states must differ on a non-hue axis — fill texture
//    (solid/hollow/hatched/inverted/tinted+ring), glyph (none/dot/check/
//    cross/D), or geometry (size promotion). 27 of 36 pairs are
//    indistinguishable by fill luminance alone, so the axis table below is
//    the contract; the script fails if any pair collapses to hue.
//
// Usage: node scripts/marker-contrast.mjs   (prints the matrix, exits 1 on
// any violation). Imported by tests/marker-contrast.test.mjs.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// --- token resolution over globals.css --------------------------------------

const cssPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "app", "globals.css");
const css = readFileSync(cssPath, "utf8");

function parseBlocks(source) {
  const noComments = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const blocks = [];
  const stack = [];
  let cursor = 0;
  for (let i = 0; i < noComments.length; i++) {
    const ch = noComments[i];
    if (ch === "{") {
      stack.push(noComments.slice(cursor, i).trim().split(/;|\n{2,}/).pop().trim());
      cursor = i + 1;
    } else if (ch === "}") {
      const selector = stack.pop();
      const body = noComments.slice(cursor, i);
      if (selector) {
        const vars = {};
        for (const m of body.matchAll(/(--[a-zA-Z0-9_-]+)\s*:\s*([^;}]+)/g)) vars[m[1]] = m[2].trim();
        if (Object.keys(vars).length) blocks.push({ selector, vars });
      }
      cursor = i + 1;
    }
  }
  return blocks;
}

const blocks = parseBlocks(css);

function collect(...predicates) {
  // Later predicates win (cascade order).
  const vars = {};
  for (const predicate of predicates) {
    for (const block of blocks) {
      const selectors = block.selector.split(",").map(s => s.trim());
      if (selectors.some(predicate)) Object.assign(vars, block.vars);
    }
  }
  return vars;
}

const isRoot = s => s === ":root";
const isDarkRoot = s => s === ':root[data-theme="dark"]';
const isShell = s => s === ".admin-theme" || s === ".shell-theme";
const isDarkShell = s => s === ':root[data-theme="dark"] .admin-theme' || s === ':root[data-theme="dark"] .shell-theme';

const CONTEXTS = {
  light: collect(isRoot, isShell),
  dark: collect(isRoot, isDarkRoot, isShell, isDarkShell)
};

// --- color math --------------------------------------------------------------

function parseColor(raw) {
  const value = raw.trim();
  const hex = value.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split("").map(c => c + c).join("");
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1 };
  }
  const rgb = value.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
  if (rgb) return { r: +rgb[1], g: +rgb[2], b: +rgb[3], a: rgb[4] === undefined ? 1 : +rgb[4] };
  if (value === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  if (value === "white" || value === "#fff") return { r: 255, g: 255, b: 255, a: 1 };
  return null;
}

function resolveToken(name, vars, depth = 0) {
  if (depth > 16) throw new Error(`var chain too deep at ${name}`);
  const raw = vars[name];
  if (raw === undefined) throw new Error(`token ${name} not declared in context`);
  return resolveValue(raw, vars, depth);
}

function resolveValue(raw, vars, depth = 0) {
  let value = raw.trim();
  const varMatch = value.match(/^var\(\s*(--[a-zA-Z0-9_-]+)\s*\)$/);
  if (varMatch) return resolveToken(varMatch[1], vars, depth + 1);
  const mix = value.match(/^color-mix\(in srgb,\s*(.+?)\s+([\d.]+)%\s*,\s*transparent\s*\)$/);
  if (mix) {
    const base = resolveValue(mix[1], vars, depth + 1);
    return { ...base, a: base.a * (+mix[2] / 100) };
  }
  const color = parseColor(value);
  if (!color) throw new Error(`unparseable color: ${raw}`);
  return color;
}

function over(fg, bg) {
  const a = fg.a + bg.a * (1 - fg.a);
  const mix = ch => (fg[ch] * fg.a + bg[ch] * bg.a * (1 - fg.a)) / (a || 1);
  return { r: mix("r"), g: mix("g"), b: mix("b"), a };
}

// CSS filter: brightness(k) multiplies sRGB channels, clamped.
function brightness(color, k = 1.05) {
  return { r: Math.min(255, color.r * k), g: Math.min(255, color.g * k), b: Math.min(255, color.b * k), a: color.a };
}

function luminance({ r, g, b }) {
  const ch = c => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// --- assumptions -------------------------------------------------------------
// The pills sit on the floor-plan raster. Its field tone is assumed here (the
// asset is a raster; these are the documented approximations the frosted
// hollow alpha was tuned against — a mid-gray furniture line under the frost
// is the worst case and is checked explicitly below).
const GROUND = {
  light: parseColor("#F2EDE4"), // cream field of office-floor-plan.webp
  dark: parseColor("#202020") // same asset under the dark lightbox filter
};
const WORST_RASTER_LINE = { light: parseColor("#8d8d8d"), dark: parseColor("#6f6f6f") };

// --- the vocabulary contract (pairwise frame) --------------------------------
// fillAxis and glyph are the two semantic axes; geometry marks the states
// whose size/inversion promotion is an additional non-hue separator. Two
// states are legally distinguishable iff they differ in fillAxis, glyph, or
// geometry. (selected/search/draft are modifiers riding on base states — they
// enter the matrix with their dominant rendering.)
export const VOCABULARY = {
  available: { fillAxis: "hollow", glyph: "none", geometry: "resting" },
  reserved: { fillAxis: "hollow", glyph: "dot", geometry: "resting" },
  assigned: { fillAxis: "solid", glyph: "dot", geometry: "resting" },
  unavailable: { fillAxis: "hatched", glyph: "none", geometry: "resting" },
  "draft-changed": { fillAxis: "status-tint", glyph: "D", geometry: "resting" },
  selected: { fillAxis: "inverted", glyph: "underlying", geometry: "promoted" },
  search: { fillAxis: "search-tint", glyph: "underlying", geometry: "promoted" },
  "target-valid": { fillAxis: "underlying", glyph: "check", geometry: "resting" },
  "target-invalid": { fillAxis: "underlying", glyph: "cross", geometry: "resting" }
};

export function measure() {
  const failures = [];
  const checks = [];
  const pairwise = [];

  // Pairwise contract: every pair differs on a non-hue axis. "underlying"
  // fill inherits the seat's base state, so it never counts as a separator
  // against a base state (worst case: same base fill).
  const states = Object.keys(VOCABULARY);
  for (let i = 0; i < states.length; i++) {
    for (let j = i + 1; j < states.length; j++) {
      const a = VOCABULARY[states[i]];
      const b = VOCABULARY[states[j]];
      const fillDiffers = a.fillAxis !== b.fillAxis && a.fillAxis !== "underlying" && b.fillAxis !== "underlying";
      const glyphDiffers = a.glyph !== b.glyph && a.glyph !== "underlying" && b.glyph !== "underlying";
      const geometryDiffers = a.geometry !== b.geometry;
      const channels = [fillDiffers && "fill", glyphDiffers && "glyph", geometryDiffers && "geometry"].filter(Boolean);
      pairwise.push({ pair: `${states[i]} vs ${states[j]}`, channels });
      if (channels.length === 0) failures.push(`pairwise: ${states[i]} vs ${states[j]} differ by hue alone`);
    }
  }

  for (const [theme, vars] of Object.entries(CONTEXTS)) {
    const ground = GROUND[theme];
    const fill = (token, base = ground) => over(resolveToken(token, vars), base);
    const hovered = token => brightness(fill(token));

    const hollowHovered = brightness(fill("--sp-marker-available-surface"));
    const hollowOverLine = brightness(over(resolveToken("--sp-marker-available-surface", vars), WORST_RASTER_LINE[theme]));
    const solidHovered = brightness(fill("--sp-marker-assigned-surface"));
    const reservedHovered = brightness(fill("--sp-marker-reserved-surface"));
    const unavailableHovered = hovered("--sp-marker-unavailable-surface");
    const draftHovered = brightness(fill("--sp-marker-draft-surface"));
    const validBadge = resolveToken("--sp-marker-valid-glyph", vars);
    const invalidBadge = resolveToken("--sp-marker-invalid-glyph", vars);
    const draftBadge = resolveToken("--sp-marker-draft-badge", vars);
    const glyphInk = resolveToken("--sp-marker-glyph-ink", vars);
    const hoverEdge = resolveToken("--sp-marker-active-edge", vars);

    const floorChecks = [
      // graphical marks: 3:1 vs the hovered surface they land on
      ["assigned dot vs hovered solid fill", resolveToken("--sp-marker-assigned-glyph", vars), solidHovered, 3],
      ["reserved dot vs hovered hollow fill", resolveToken("--sp-marker-reserved-glyph", vars), hollowHovered, 3],
      ["hatch strokes vs hovered unavailable fill", resolveToken("--sp-marker-unavailable-hatch-stroke", vars), unavailableHovered, 3],
      ["hover edge vs hovered hollow fill", hoverEdge, hollowHovered, 3],
      ["hover edge vs hovered solid fill", hoverEdge, solidHovered, 3],
      ["hover edge vs hovered unavailable fill", hoverEdge, unavailableHovered, 3],
      // badge glyph ink: 4.5:1 on its badge fill (tiny symbols — text floor)
      ["✓ ink vs valid badge", glyphInk, over(validBadge, solidHovered), 4.5],
      ["✕ ink vs invalid badge", glyphInk, over(invalidBadge, solidHovered), 4.5],
      ["D ink vs draft badge", glyphInk, over(draftBadge, draftHovered), 4.5],
      // badge fills as marks: 3:1 vs the hovered pill they sit on
      ["valid badge vs hovered solid fill", validBadge, solidHovered, 3],
      ["invalid badge vs hovered solid fill", invalidBadge, solidHovered, 3],
      // text on hovered fills
      ["ink text vs hovered hollow fill", resolveToken("--sp-marker-ink", vars), hollowHovered, 4.5],
      ["ink text vs hollow over worst raster line", resolveToken("--sp-marker-ink", vars), hollowOverLine, 4.5],
      ["assigned text vs hovered solid fill", resolveToken("--sp-marker-assigned-text", vars), solidHovered, 4.5],
      ["reserved text vs hovered hollow fill", resolveToken("--sp-marker-reserved-text", vars), reservedHovered, 4.5],
      // unavailable text: dark theme pins the design spec's muted 4.22:1
      // triplet (pre-PR-C, deliberate de-emphasis) — floor 3, not 4.5.
      ["unavailable text vs hovered unavailable fill", resolveToken("--sp-marker-unavailable-text", vars), unavailableHovered, theme === "dark" ? 3 : 4.5]
    ];

    for (const [label, fg, bg, floor] of floorChecks) {
      const flatFg = fg.a < 1 ? over(fg, bg) : fg;
      const ratio = contrast(flatFg, bg);
      checks.push({ theme, label, ratio: +ratio.toFixed(2), floor });
      if (ratio < floor) failures.push(`${theme}: ${label} = ${ratio.toFixed(2)}:1 (floor ${floor}:1)`);
    }
  }

  return { pairwise, checks, failures };
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const { pairwise, checks, failures } = measure();
  console.log("== pairwise distinguishability (non-hue channels per pair) ==");
  for (const { pair, channels } of pairwise) console.log(`  ${pair.padEnd(36)} ${channels.join(", ") || "HUE ONLY"}`);
  console.log("\n== contrast floors (mark vs HOVERED surface) ==");
  for (const { theme, label, ratio, floor } of checks) console.log(`  [${theme}] ${label.padEnd(44)} ${ratio}:1 (floor ${floor})`);
  if (failures.length) {
    console.error("\nFAILURES:");
    for (const failure of failures) console.error(`  ${failure}`);
    process.exit(1);
  }
  console.log("\nAll floors met; no hue-only pair.");
}
